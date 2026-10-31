// Clicking the toolbar button opens the viewer in a new tab.
browser.action.onClicked.addListener(() => {
  browser.tabs.create({ url: browser.runtime.getURL("viewer/web/viewer.html") });
});
