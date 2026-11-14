// Adapts the pdf.js viewer for the extension page. This is a classic script
// loaded before viewer.mjs, so it can change the viewer options before the
// viewer starts.
"use strict";

document.title = "PDF Ink Eraser";

document.addEventListener("webviewerloaded", () => {
  const app = window.PDFViewerApplication;
  // Start empty instead of opening the pdf.js sample document.
  window.PDFViewerApplicationOptions.set("defaultUrl", "");
  app.initializedPromise.then(() => {
    showStartHint(app);
    app.eventBus.on("documentloaded", hideMessage);
  });
});

// Until a PDF is opened, explain how to open one.
function showStartHint(app) {
  if (app.pdfDocument) {
    return;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Open a PDF";
  button.addEventListener("click", () => {
    app.eventBus.dispatch("openfile", { source: window });
  });
  const text = document.createElement("p");
  text.textContent = "or drop a PDF, Word or PowerPoint file anywhere on this page.";

  const hint = document.createElement("div");
  hint.id = "startHint";
  hint.append(button, text);
  app.appConfig.mainContainer.append(hint);
  app.eventBus.on("documentloaded", () => hint.remove(), { once: true });
}

// A message over the viewer, with an optional button, while converting a
// Word or PowerPoint file (office-files.js). A new message replaces the last
// one, and opening a document removes it. It goes next to the scrolling
// viewer, not in it, so it covers the pages wherever they are scrolled to.
let viewerMessage = null;

function showMessage(app, message, button) {
  hideMessage();
  viewerMessage = document.createElement("div");
  viewerMessage.id = "viewerMessage";
  const text = document.createElement("p");
  text.textContent = message;
  viewerMessage.append(text);
  if (button) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = button.label;
    element.addEventListener("click", button.onClick, { once: true });
    viewerMessage.append(element);
  }
  app.appConfig.mainContainer.after(viewerMessage);
}

function hideMessage() {
  viewerMessage?.remove();
  viewerMessage = null;
}

// A message about something that failed. Its button opens another file, or
// on top of an open document, just closes the message.
function showError(app, message) {
  showMessage(app, message, app.pdfDocument
    ? { label: "OK", onClick: hideMessage }
    : { label: "Open a PDF", onClick: () => app.eventBus.dispatch("openfile", { source: window }) });
}

// Firefox only asks for a permission while handling a click, so the request
// waits for a click on an Allow button.
async function askPermission(app, permissions, message) {
  if (await browser.permissions.contains(permissions)) {
    return;
  }
  const granted = await new Promise(resolve => {
    showMessage(app, message, { label: "Allow", onClick: () => resolve(browser.permissions.request(permissions)) });
  });
  if (!granted) {
    throw new Error("The permission was not given.");
  }
}
