// Builds dist/viewer: the unmodified pdf.js viewer plus the eraser files, with
// two tags added to viewer.html to load them.
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PDFJS_VERSION = "6.4.299";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendor = join(root, "vendor", `pdfjs-${PDFJS_VERSION}`);
const out = join(root, "dist", "viewer");

rmSync(out, { recursive: true, force: true });
cpSync(vendor, out, { recursive: true });
for (const file of ["eraser.js", "eraser-geometry.js", "eraser.css", "eraser.svg"]) {
  cpSync(join(root, "src", file), join(out, "web", "ink-eraser", file));
}

const viewerHtml = join(out, "web", "viewer.html");
let html = readFileSync(viewerHtml, "utf8");
const inject = (anchor, tag) => {
  if (!html.includes(anchor)) {
    throw new Error(`viewer.html: can't find ${anchor}`);
  }
  html = html.replace(anchor, `${anchor}\n    ${tag}`);
};
inject('<link rel="stylesheet" href="viewer.css" />', '<link rel="stylesheet" href="ink-eraser/eraser.css" />');
inject('<script src="viewer.mjs" type="module"></script>', '<script src="ink-eraser/eraser.js" type="module"></script>');
writeFileSync(viewerHtml, html);

console.log(`Built ${out}`);
