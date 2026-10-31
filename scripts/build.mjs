// Builds dist/extension: the Firefox extension, containing the unmodified
// pdf.js viewer plus our files, with a few tags added to viewer.html to load
// them.
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PDFJS_VERSION = "6.4.299";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendor = join(root, "vendor", `pdfjs-${PDFJS_VERSION}`);
const out = join(root, "dist", "extension");
const web = join(out, "viewer", "web");

rmSync(join(root, "dist"), { recursive: true, force: true });

// The extension's own files. The manifest takes its version from package.json.
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "extension", "manifest.json"), "utf8"));
manifest.version = version;
cpSync(join(root, "extension", "icons"), join(out, "icons"), { recursive: true });
cpSync(join(root, "extension", "background.js"), join(out, "background.js"));
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

// The viewer, with the eraser and the extension setup next to it.
cpSync(vendor, join(out, "viewer"), { recursive: true });
for (const file of ["eraser.js", "eraser-geometry.js", "eraser.css", "eraser.svg"]) {
  cpSync(join(root, "src", file), join(web, "ink-eraser", file));
}
for (const file of ["viewer-setup.js", "viewer-setup.css"]) {
  cpSync(join(root, "extension", file), join(web, "extension", file));
}

const viewerHtml = join(web, "viewer.html");
let html = readFileSync(viewerHtml, "utf8");
const inject = (anchor, tag, before = false) => {
  if (!html.includes(anchor)) {
    throw new Error(`viewer.html: can't find ${anchor}`);
  }
  html = html.replace(anchor, before ? `${tag}\n    ${anchor}` : `${anchor}\n    ${tag}`);
};
const viewerCss = '<link rel="stylesheet" href="viewer.css" />';
const viewerJs = '<script src="viewer.mjs" type="module"></script>';
inject(viewerCss, '<link rel="stylesheet" href="ink-eraser/eraser.css" />');
inject(viewerCss, '<link rel="stylesheet" href="extension/viewer-setup.css" />');
// The setup script must run before viewer.mjs, so it goes in front of it.
inject(viewerJs, '<script src="extension/viewer-setup.js"></script>', true);
inject(viewerJs, '<script src="ink-eraser/eraser.js" type="module"></script>');
writeFileSync(viewerHtml, html);

console.log(`Built ${out}`);
