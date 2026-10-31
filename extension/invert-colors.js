// One-click inverted colours: a light page with dark text becomes a dark page
// with light text, for reading at night. Only the display changes (a CSS
// filter, see viewer-setup.css): saving and printing keep the real colours.
//
// A classic script loaded before viewer.mjs, like viewer-setup.js, so the
// saved choice applies before the first page is drawn.
"use strict";

{
  const STORAGE_KEY = "invertColors";
  const CLASS = "invertPageColors";

  const load = () => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  };

  let inverted = load();
  document.documentElement.classList.toggle(CLASS, inverted);

  // Inverting turns pale colours, like highlights, almost black: nearly as
  // dark as the page. A gamma curve lifts those dark tones while black stays
  // black and white stays white. CSS has no gamma function, so it's an SVG
  // filter, used from viewer-setup.css as url(#invertColorsLift).
  function addLiftFilter() {
    const svgElement = (tag, attributes) => {
      const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, value);
      }
      return element;
    };
    const transfer = svgElement("feComponentTransfer", {});
    for (const channel of ["feFuncR", "feFuncG", "feFuncB"]) {
      transfer.append(svgElement(channel, { type: "gamma", exponent: "0.5" }));
    }
    // sRGB: apply the curve to the colour values as shown, not to linear light.
    const filter = svgElement("filter", { id: "invertColorsLift", "color-interpolation-filters": "sRGB" });
    filter.append(transfer);
    const svg = svgElement("svg", { "aria-hidden": "true", style: "position: absolute; width: 0; height: 0" });
    svg.append(filter);
    document.body.append(svg);
  }

  document.addEventListener("webviewerloaded", () => {
    addLiftFilter();
    const button = document.createElement("button");
    button.id = "invertColorsButton";
    button.className = "toolbarButton";
    button.type = "button";
    button.title = "Invert colours";
    const label = document.createElement("span");
    label.textContent = "Invert colours";
    button.append(label);

    const update = () => {
      document.documentElement.classList.toggle(CLASS, inverted);
      button.classList.toggle("toggled", inverted);
      button.setAttribute("aria-pressed", String(inverted));
    };
    button.addEventListener("click", () => {
      inverted = !inverted;
      update();
      try {
        localStorage.setItem(STORAGE_KEY, String(inverted));
      } catch {}
    });
    update();

    // On the right of the toolbar, before the editing tools.
    const separator = document.createElement("div");
    separator.className = "verticalToolbarSeparator";
    document.getElementById("editorModeButtons")?.before(button, separator);
  });
}
