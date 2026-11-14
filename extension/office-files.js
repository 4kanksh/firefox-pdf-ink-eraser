// Opens Word and PowerPoint files, and their OpenDocument equivalents, by
// converting them to PDF first. The Open dialog and dropping a file both end
// in PDFViewerApplication.open(), so the conversion starts there, and the PDF
// it gives is opened like any other.
//
// LibreOffice's browser version can't run in an extension page, so a helper
// program on this computer converts the files (native-helper/converter.mjs),
// through Firefox's native messaging. That needs the optional
// "nativeMessaging" permission, and the helper installed with
// `npm run helper:install`.
//
// A classic script loaded before viewer.mjs, like viewer-setup.js.
"use strict";

{
  const HELPER = "pdf_ink_eraser_office";
  const NATIVE_MESSAGING = { permissions: ["nativeMessaging"] };
  const EXTENSIONS = [".docx", ".doc", ".odt", ".rtf", ".pptx", ".ppt", ".odp"];
  const isOffice = name => EXTENSIONS.some(extension => name.toLowerCase().endsWith(extension));

  // The helper, started for the first conversion and kept while the viewer
  // is open. It sends each PDF back in pieces, as Firefox takes at most 1 MB
  // per message from a program.
  let port = null;
  let nextId = 1;
  const pending = new Map();

  function connect() {
    if (port) {
      return port;
    }
    port = browser.runtime.connectNative(HELPER);
    port.onMessage.addListener(({ id, part, last, error }) => {
      const request = pending.get(id);
      if (!request) {
        return;
      }
      if (error) {
        pending.delete(id);
        request.reject(new Error(`The converter said: ${error}`));
        return;
      }
      request.parts.push(Uint8Array.fromBase64(part));
      if (last) {
        pending.delete(id);
        request.resolve(new Blob(request.parts));
      }
    });
    port.onDisconnect.addListener(({ error }) => {
      const reason = /No such native application/i.test(error?.message)
        ? new Error("Its converter program isn't installed. In the extension's folder, run: npm run helper:install")
        : new Error(`The converter program stopped${error ? `: ${error.message}` : "."}`);
      for (const request of pending.values()) {
        request.reject(reason);
      }
      pending.clear();
      port = null;
    });
    return port;
  }

  function convert(name, bytes) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { parts: [], resolve, reject });
      connect().postMessage({ id, name, data: bytes.toBase64() });
    });
  }

  document.addEventListener("webviewerloaded", () => {
    const app = window.PDFViewerApplication;
    app.initializedPromise.then(() => {
      // List Word and PowerPoint files in the Open dialog too. pdf.js adds the
      // dialog's file input right after it initializes, without waiting for
      // anything, so it's there by the next task.
      setTimeout(() => {
        document.getElementById("fileInput").accept = ["application/pdf", ".pdf", ...EXTENSIONS].join(",");
      });

      // pdf.js only takes dropped PDFs. Hand dropped Word and PowerPoint files
      // to the same place as the Open dialog. Files' names are only known on
      // the drop, so accept dragging any file, and ignore the ones nobody
      // opens (instead of Firefox leaving the viewer to show them).
      const { mainContainer } = app.appConfig;
      mainContainer.addEventListener("dragover", event => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
        }
      });
      mainContainer.addEventListener("drop", event => {
        const file = event.dataTransfer.files?.[0];
        if (!file) {
          return;
        }
        event.preventDefault();
        if (isOffice(file.name)) {
          app.eventBus.dispatch("fileinputchange", { source: window, fileInput: event.dataTransfer });
        }
      });

      // The Open dialog gives open() the file as a blob URL, with its name.
      const open = app.open.bind(app);
      let latest = 0;
      app.open = async args => {
        const request = ++latest;
        const name = args.url && args.originalUrl ? decodeURIComponent(args.originalUrl) : "";
        if (!isOffice(name)) {
          return open(args);
        }
        try {
          await askPermission(app, NATIVE_MESSAGING,
            `PDF Ink Eraser opens ${name} by converting it to PDF with its converter program on this computer. ` +
            "It needs your permission to start that program.");
          showMessage(app, `Converting ${name} to PDF…`);
          const bytes = new Uint8Array(await (await fetch(args.url)).arrayBuffer());
          const pdf = new Uint8Array(await (await convert(name, bytes)).arrayBuffer());
          // Another file was opened meanwhile.
          if (request !== latest) {
            return undefined;
          }
          hideMessage();
          return open({ data: pdf, filename: name.replace(/\.\w+$/, ".pdf") });
        } catch (error) {
          if (request === latest) {
            showError(app, `Couldn't open ${name}. ${error.message}`);
          }
          return undefined;
        }
      };
    });
  });
}
