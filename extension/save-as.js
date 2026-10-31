// Saving with a "Save as" dialog. pdf.js downloads a saved PDF straight into
// the Downloads folder; with Firefox's downloads API the dialog lets you put
// it anywhere, including over the original file. That needs the optional
// "downloads" permission, which Firefox asks for the first time you save.
//
// A classic script loaded before viewer.mjs, like viewer-setup.js. Outside the
// extension (a local test server) there is no downloads API, so pdf.js keeps
// downloading as usual.
"use strict";

{
  const DOWNLOADS = { permissions: ["downloads"] };
  // The answer to the permission request made for the save in progress.
  let permission = null;

  const api = () => globalThis.browser?.downloads && globalThis.browser;

  // Frees a blob URL once Firefox has finished writing the file from it.
  function revokeWhenDone(id, blobUrl) {
    const { onChanged } = api().downloads;
    const listener = delta => {
      if (delta.id === id && ["complete", "interrupted"].includes(delta.state?.current)) {
        onChanged.removeListener(listener);
        URL.revokeObjectURL(blobUrl);
      }
    };
    onChanged.addListener(listener);
  }

  /** @returns {Promise<boolean>} false if pdf.js should download as usual. */
  async function saveAs(blobUrl, filename) {
    const browser = api();
    const pending = permission;
    permission = null;
    // Saves pdf.js starts by itself (when opening another file with unsaved
    // changes) have no request of their own, so check the permission instead.
    if (!browser || !(await (pending ?? browser.permissions.contains(DOWNLOADS)))) {
      return false;
    }
    try {
      const id = await browser.downloads.download({ url: blobUrl, filename, saveAs: true });
      revokeWhenDone(id, blobUrl);
      return true;
    } catch (error) {
      if (/cancel/i.test(error?.message)) {
        // Cancelling the dialog means "don't save".
        URL.revokeObjectURL(blobUrl);
        return true;
      }
      console.error("Save as:", error);
      return false;
    }
  }

  document.addEventListener("webviewerloaded", () => {
    const app = window.PDFViewerApplication;
    app.initializedPromise.then(() => {
      // The download button, its menu entry and Ctrl+S send "download" while
      // still handling the click or key press: the only time Firefox lets an
      // extension ask for a permission. If it's already granted, the request
      // just resolves to true without asking.
      app.eventBus.on("download", () => {
        permission = api()?.permissions.request(DOWNLOADS) ?? null;
      });

      // Every pdf.js download ends here, with the PDF in a blob URL.
      const { downloadManager } = app;
      const triggerDownload = downloadManager._triggerDownload.bind(downloadManager);
      downloadManager._triggerDownload = (blobUrl, originalUrl, filename, isAttachment = false) => {
        if (!blobUrl) {
          triggerDownload(blobUrl, originalUrl, filename, isAttachment);
          return;
        }
        saveAs(blobUrl, filename).then(saved => {
          if (!saved) {
            triggerDownload(blobUrl, originalUrl, filename, isAttachment);
          }
        });
      };
    });
  });
}
