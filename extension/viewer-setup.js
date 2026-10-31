// Adapts the pdf.js viewer for the extension page. This is a classic script
// loaded before viewer.mjs, so it can change the viewer options before the
// viewer starts.
"use strict";

document.title = "PDF Ink Eraser";

document.addEventListener("webviewerloaded", () => {
  const app = window.PDFViewerApplication;
  // Start empty instead of opening the pdf.js sample document.
  window.PDFViewerApplicationOptions.set("defaultUrl", "");
  app.initializedPromise.then(() => showStartHint(app));
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
  text.textContent = "or drop a PDF file anywhere on this page.";

  const hint = document.createElement("div");
  hint.id = "startHint";
  hint.append(button, text);
  app.appConfig.mainContainer.append(hint);
  app.eventBus.on("documentloaded", () => hint.remove(), { once: true });
}
