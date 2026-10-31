# AMO listing

Text to paste into the addons.mozilla.org listing form, field by field. Screenshots are in `screenshots/` (1280×800,
taken in Firefox with a made-up sample document).

## Name

PDF Annotator: Draw, Highlight & Erase

## Summary

(At most 250 characters.)

Draw and highlight on PDFs, then erase exactly where you drag, like the eraser in Paint, instead of deleting a whole
drawing. Works on pencil drawings and highlights, with one-click inverted colours for reading at night.

## Description

Ever drawn on a PDF and wanted to rub out just one part of a line? Firefox's PDF viewer can only delete a whole drawing
at once. This add-on gives you a real eraser: drag over a pencil drawing or a highlight, and only the part under the
eraser disappears.

What you can do:
- Draw with the pencil and highlight text or freehand, with the familiar Firefox PDF tools.
- Erase precisely: pencil drawings, freehand highlights and text highlights are cut exactly where you drag.
- Erase marks that are already saved in the PDF, not just new ones.
- Undo a whole eraser stroke with Ctrl+Z, even one that crossed several pages.
- Invert colours with one click: black pages with white text for reading at night. Highlights stay visible.
- Save with a "Save as" dialog, so you can replace the original file.

Shortcuts:
- E: turn the eraser on or off
- [ and ]: make the eraser smaller or bigger
- A pen's eraser end (or eraser button) erases too. Lift it and you're back to drawing.

How to use it: click the add-on's toolbar button to open the viewer, then open a PDF or drop one onto the page.

Private by design: everything happens in your browser. The add-on collects no data and doesn't connect to the
internet. It asks for one optional permission, "Download files", the first time you save. That is what shows the Save as
dialog; without it, files go to your Downloads folder.

Built on pdf.js, the PDF viewer inside Firefox, included unmodified.

## Categories

Other. AMO's Firefox categories have no documents or productivity category; if the form offers a closer fit, use it.

## Tags

Pick from AMO's list whatever matches: for example "pdf", "productivity", "annotations", "dark mode".

## Support email / website

Your choice. A public GitHub repository would work well as the support website, and also helps reviewers.

## License

Apache License 2.0

## Privacy policy

Not needed: the add-on collects no data. The manifest declares `data_collection_permissions: none`.

## Release notes (1.0.0)

First public release.
- A precise eraser for pencil drawings, freehand highlights and text highlights.
- Shortcuts: E for the eraser, [ and ] for its size, and support for a pen's eraser end.
- One-click inverted colours.
- Save with a Save as dialog.

## Screenshot captions

1. `1-erase.png`: One stroke of the eraser cut through a circle, an underline and a highlight. The text underneath is
   untouched.
2. `2-size.png`: Change the eraser size with the slider, or with the [ and ] keys.
3. `3-inverted.png`: One click inverts the colours for reading at night. Your marks and highlights stay visible.

## Notes to reviewer

This add-on bundles the official pdf.js 6.4.299 release
(https://github.com/mozilla/pdf.js/releases/download/v6.4.299/pdfjs-6.4.299-dist.zip), unmodified, in `viewer/`.
Only two kinds of files were left out: the source maps (`*.map`) and the sample PDF. SHA-256 of the main files, for
comparison with the release:

    3ab3d2fee1200547309d5f5e4116066a1ccb6277451b9533aebe618530eb62ca  viewer/build/pdf.mjs
    07ceb740d746e5d9012fcf9f27d5c7dea09f7d2f5e74f5c8109e5787551a2333  viewer/build/pdf.worker.mjs
    279b3cc4d0b78ecba09a53b3dbfcc16a86644927ac4479bef3d33b6a3cee92f2  viewer/build/pdf.sandbox.mjs
    3e229a3c44633df56690108b873ff572f642f9d301b70820f01ef535ebeac781  viewer/web/viewer.mjs
    81437fc949d6418dc20d4382dd25a852e4fab33120a83d332f97542259e1175d  viewer/web/viewer.css

The only change to a pdf.js file: five tags added to `viewer/web/viewer.html`, which load our own files:

- `viewer/web/extension/`: start screen, Save as (`browser.downloads`) and inverted colours
- `viewer/web/ink-eraser/`: the eraser

`background.js` only opens the viewer in a new tab. None of our code is minified or generated, so there is no separate
source code to submit. The optional `downloads` permission is requested only when the user saves, to show a Save as
dialog. There is no remote code and no network access.

To build the package from source: `npm install`, then `npm run package` (Node 20 or newer).
