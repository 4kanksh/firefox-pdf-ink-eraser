# PDF Annotator: Draw, Highlight & Erase

A Firefox extension that adds a real eraser to the PDF viewer. Drag over a pencil drawing or a highlight and only the
part under the eraser disappears, like the eraser in Paint. The built-in viewer can only delete a whole drawing at once.

It works on:

- pencil drawings
- freehand highlights
- text highlights

It erases marks you draw in the viewer and marks already saved in the PDF.

## Using it

1. Click the extension's toolbar button. A PDF viewer opens in a new tab.
2. Click **Open a PDF**, or drop a PDF file anywhere on the page.
3. Click the **Eraser** button next to the pencil, and drag over a mark.
4. Save with the **Download** button or **Ctrl+S**. A Save as dialog lets you replace the original file.

One drag is one undo step: **Ctrl+Z** brings back everything that drag erased, even across pages.

| Key | Action |
|---|---|
| **E** | Turn the eraser on or off |
| **[** / **]** | Make the eraser smaller / bigger |

With a pen, flip it to its eraser end (or hold its eraser button) to erase. When you lift it, you're back in the tool
you were using before.

For reading in the dark, the **Invert colours** button (the half-filled circle) turns pages black with white text. Pale
colours such as highlights are lightened a little so they stay visible. Only the display changes: saved and printed
PDFs keep their real colours. The viewer remembers the setting.

## Permissions and privacy

- No permissions are needed to install it.
- The first time you save, Firefox asks for permission to **download files**. That's what shows the Save as dialog.
  If you say no, saving still works, but files go straight to your Downloads folder.
- Everything happens in your browser. The extension collects no data and makes no network requests.

## How it works

The extension bundles [pdf.js](https://github.com/mozilla/pdf.js), the PDF viewer Firefox itself uses. It ships
**unmodified** (see `vendor/`), and the eraser is added on top:

- `src/eraser.js` adds the Eraser button and the shortcuts, and handles the pointer. Each pointer move sweeps a
  "capsule" (a circle moved along a line) over the page.
- `src/eraser-geometry.js` cuts lines and highlight boxes with that capsule. It's plain math, with no browser code,
  so it has unit tests.
- Each mark the eraser touches is replaced by new marks built from its remaining pieces, through pdf.js's own
  annotation editor objects. Saving then works exactly as it does in pdf.js.
- `extension/` holds the extension itself: the manifest, the toolbar button, the start screen, Save as and
  inverted colours.

## Building from source

You need [Node.js](https://nodejs.org/) 20 or newer.

```bash
npm install
npm run build
```

`npm run build` creates the extension in `dist/extension/`: it copies pdf.js and our files there, and adds a few
`<script>` and `<link>` tags to `viewer.html`.

| Command | What it does |
|---|---|
| `npm start` | Build, then open Firefox with the extension loaded. It reloads when the files change. |
| `npm test` | Run the geometry unit tests |
| `npm run lint` | Build, then check the extension with Mozilla's add-on linter |
| `npm run package` | Build, then zip the extension into `web-ext-artifacts/` |
| `npm run sign` | Build, then have Mozilla sign it as an unlisted add-on (see below) |

### Signing

Firefox only installs extensions permanently once Mozilla has signed them. `npm run sign` uploads the extension
to addons.mozilla.org (AMO) and saves the signed `.xpi` in `web-ext-artifacts/`. It needs your AMO API key in two
environment variables: `WEB_EXT_API_KEY` (the "JWT issuer") and `WEB_EXT_API_SECRET` (the "JWT secret"). Never
commit them.

### Browser tests

`test-browser/harness.js` drives the real viewer with scripted mouse, pen and keyboard events. It checks that each
erased gap is exactly as wide as the eraser, at every rotation and zoom, across pages, and with the shortcuts. The
file header explains how to run it.

### Updating pdf.js

1. Download the new `pdfjs-<version>-dist.zip` from the
   [pdf.js releases](https://github.com/mozilla/pdf.js/releases).
2. Unpack it into `vendor/pdfjs-<version>/` and update `PDFJS_VERSION` in `scripts/build.mjs`.
3. Run all the tests. The eraser uses some pdf.js internals, which can change between versions.

## Known limitations

- It doesn't replace Firefox's own PDF viewer: open PDFs from the extension's tab.
- If you open another PDF while you have unsaved changes, pdf.js offers to save them first. Cancel the dialog to
  discard them.
- In pdf.js 6.4, a freehand highlight drawn while the page is rotated ends up in the wrong place after saving and
  reopening. This is a pdf.js bug. Pieces the eraser leaves behind aren't affected.

## License

[Apache License 2.0](LICENSE), the same as pdf.js.
