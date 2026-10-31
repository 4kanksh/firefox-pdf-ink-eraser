// Browser test harness for the eraser. Not part of the extension.
//
// Copy it next to the built viewer and load it from the page's console:
//   cp test-browser/harness.js dist/extension/viewer/web/
//   const H = await import("./harness.js");
//   await H.runView(90, 2); // rotation in degrees, zoom (1 = 100%)
//
// It draws a pencil line, a freehand highlight and a text highlight on page 1
// of the pdf.js sample document, erases through each with scripted pointer
// events, and checks the gaps against the expected eraser width.

const app = window.PDFViewerApplication;

export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(fn, ms = 8000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = fn();
    if (value) {
      return value;
    }
    await wait(50);
  }
  throw new Error(`timeout: ${fn}`);
}

const uiManager = () => app.pdfViewer._layerProperties.annotationEditorUIManager;
const pageView = () => app.pdfViewer.getPageView(0);

export function screenOf(x, y) {
  const [vx, vy] = pageView().viewport.convertToViewportPoint(x, y);
  const box = pageView().div.querySelector(".canvasWrapper").getBoundingClientRect();
  return [box.left + vx, box.top + vy];
}

// The position of a screen point inside an element, in the element's own
// (untransformed) coordinates, which is what a real event's offsetX/Y gives.
// pdf.js rotates its layers with a CSS transform when the view is rotated.
function localPoint(element, x, y) {
  const box = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  if (style.transform === "none") {
    return [x - box.left, y - box.top];
  }
  const [ox, oy] = style.transformOrigin.split(" ").map(parseFloat);
  const matrix = new DOMMatrix().translate(ox, oy).multiply(new DOMMatrix(style.transform)).translate(-ox, -oy);
  const w = element.offsetWidth;
  const h = element.offsetHeight;
  const corners = [[0, 0], [w, 0], [0, h], [w, h]].map(([cx, cy]) => matrix.transformPoint(new DOMPoint(cx, cy)));
  // Where the element's untransformed top-left corner is on screen.
  const left = box.left - Math.min(...corners.map(p => p.x));
  const top = box.top - Math.min(...corners.map(p => p.y));
  const local = matrix.inverse().transformPoint(new DOMPoint(x - left, y - top));
  return [local.x, local.y];
}

// Sends a pointer event to whatever is under the point, as a real mouse would.
function fire(type, [x, y]) {
  const target = document.elementFromPoint(x, y);
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    pointerId: 7,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
  });
  // Chromium computes offsetX/Y wrongly for scripted events on scaled displays,
  // and the pdf.js pencil reads them.
  const [offsetX, offsetY] = localPoint(target, x, y);
  Object.defineProperty(event, "offsetX", { value: offsetX });
  Object.defineProperty(event, "offsetY", { value: offsetY });
  target.dispatchEvent(event);
}

async function rendered() {
  app.pdfViewer.update();
  app.pdfViewer.renderingQueue.renderHighestPriority();
  await until(
    () =>
      pageView().renderingState === 3 &&
      pageView().div.querySelector(".textLayer span") &&
      pageView().div.querySelector(".annotationEditorLayer")
  );
  await wait(150);
}

// Scrolls so the given PDF points are in the middle of the viewer.
export async function show(points) {
  const container = app.appConfig.mainContainer;
  const view = container.getBoundingClientRect();
  const s = points.map(p => screenOf(...p));
  const xs = s.map(p => p[0]);
  const ys = s.map(p => p[1]);
  container.scrollLeft += (Math.min(...xs) + Math.max(...xs)) / 2 - (view.left + view.width / 2);
  container.scrollTop += (Math.min(...ys) + Math.max(...ys)) / 2 - (view.top + view.height / 2);
  await wait(100);
  await rendered();
}

// Drags from one PDF point to another in `steps` pointer moves.
export async function drag(a, b, steps = 25) {
  fire("pointerdown", screenOf(...a));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    fire("pointermove", screenOf(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t));
    await wait(4);
  }
  fire("pointerup", screenOf(...b));
  await wait(250);
}

const eraserOn = () => document.documentElement.classList.contains("inkEraserActive");

export async function tool(name) {
  if (name === "eraser") {
    if (!eraserOn()) {
      document.getElementById("editorInkEraserButton").click();
    }
  } else if (name === "ink") {
    if (eraserOn()) {
      document.getElementById("editorInkButton").click();
    } else if (app.pdfViewer.annotationEditorMode !== 15) {
      app.eventBus.dispatch("switchannotationeditormode", { source: window, mode: 15 });
    }
  } else if (name === "highlight") {
    app.eventBus.dispatch("switchannotationeditormode", { source: window, mode: 9 });
  }
  await wait(300);
  for (const id of ["editorInkEraserParamsToolbar", "editorInkParamsToolbar", "editorHighlightParamsToolbar"]) {
    document.getElementById(id)?.classList.add("hidden");
  }
}

let sample = null;

export async function open(rotation, zoom) {
  sample ??= new Uint8Array(await fetch("compressed.tracemonkey-pldi-09.pdf").then(r => r.arrayBuffer()));
  // End any drawing session first: pdf.js keeps it across documents, and a
  // session left pointing at the closed document breaks all later drawing.
  if (app.pdfDocument) {
    if (eraserOn()) {
      document.getElementById("editorInkEraserButton").click();
    }
    app.eventBus.dispatch("switchannotationeditormode", { source: window, mode: 0 });
    await wait(200);
  }
  await app.open({ data: sample.slice() });
  await until(() => app.pdfDocument && pageView());
  app.pdfViewer.currentScale = zoom;
  app.pdfViewer.pagesRotation = rotation;
  await wait(300);
  await rendered();
}

// The marks on page 1: kind, geometry in PDF units, and the centre of the box
// they are drawn in on screen.
export function marks() {
  return [...uiManager().getEditors(0)]
    .filter(editor => !editor.deleted && !editor.isEmpty())
    .map(editor => {
      const r = editor.div.getBoundingClientRect();
      const drawn = { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      if (editor.editorType === "ink") {
        const lines = editor.serializeDraw(false).points.map(p => Array.from(p));
        return { kind: "ink", drawn, lines, thickness: editor._drawingOptions["stroke-width"] };
      }
      const outlines = editor._drawOutlines;
      if (outlines.isFree) {
        const lines = outlines.serialize(editor.getPDFRect(), editor._drawRotation).points.map(p => Array.from(p));
        return { kind: "free", drawn, lines, thickness: editor._drawingOptions.thickness };
      }
      const q = outlines.serializeQuadPoints(editor.pageTranslation, editor.pageDimensions);
      const boxes = [];
      for (let i = 0; i < q.length; i += 8) {
        boxes.push([q[i], q[i + 5], q[i + 2], q[i + 1]]);
      }
      return { kind: "text", drawn, boxes };
    });
}

const round = v => Math.round(v * 10) / 10;

// The gap around x = cx between segments [x1, x2] along a horizontal line.
function gapAt(segments, cx) {
  let lo = -Infinity;
  let hi = Infinity;
  for (const [a, b] of segments) {
    if (Math.max(a, b) <= cx) {
      lo = Math.max(lo, Math.max(a, b));
    }
    if (Math.min(a, b) >= cx) {
      hi = Math.min(hi, Math.min(a, b));
    }
  }
  return [round(lo), round(hi)];
}

// Where (in screen px) a mark is drawn relative to where its PDF bbox is.
function drawShift(mark, [x1, y1, x2, y2]) {
  const corners = [[x1, y1], [x2, y2], [x1, y2], [x2, y1]].map(p => screenOf(...p));
  const xs = corners.map(p => p[0]);
  const ys = corners.map(p => p[1]);
  return [mark.drawn.cx - (Math.min(...xs) + Math.max(...xs)) / 2, mark.drawn.cy - (Math.min(...ys) + Math.max(...ys)) / 2];
}

// How much further off a mark is drawn than the mark pdf.js drew before
// erasing. pdf.js itself draws pencil lines slightly off their data, so the
// eraser must only keep that offset, not add to it.
function drawOffset(mark, bbox, before = [0, 0]) {
  const [dx, dy] = drawShift(mark, bbox);
  return round(Math.hypot(dx - before[0], dy - before[1]));
}

function linesBBox(lines) {
  const xs = lines.flatMap(l => l.filter((_, i) => i % 2 === 0));
  const ys = lines.flatMap(l => l.filter((_, i) => i % 2 === 1));
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function report(gap, expected, count, offsets) {
  const ok =
    Math.abs(gap[0] - expected[0]) <= 0.3 &&
    Math.abs(gap[1] - expected[1]) <= 0.3 &&
    offsets.every(o => o <= 2);
  return `${ok ? "PASS" : "FAIL"} gap ${gap} (expected ${expected}), ${count} pieces, drawn ${offsets}px off`;
}

export async function runView(rotation, zoom) {
  await open(rotation, zoom);
  const radius = +document.getElementById("editorInkEraserSize").value / pageView().viewport.scale;
  const result = { view: `${rotation}° ${zoom * 100}%` };

  // Pencil line in the empty top margin, erased at x = 175.
  await show([[100, 775], [250, 775]]);
  await tool("ink");
  await drag([100, 775], [250, 775]);
  await tool("eraser");
  const inkBefore = marks().find(m => m.kind === "ink");
  const inkShift = drawShift(inkBefore, linesBBox(inkBefore.lines));
  await drag([175, 790], [175, 760], 15);
  {
    const mark = marks().find(m => m.kind === "ink");
    const h = radius + mark.thickness / 2;
    const gap = gapAt(mark.lines.map(l => [l[0], l.at(-2)]), 175);
    result.pencil = report(gap, [round(175 - h), round(175 + h)], mark.lines.length, [drawOffset(mark, linesBBox(mark.lines), inkShift)]);
  }

  // Freehand highlight in the margin, erased at x = 415.
  await show([[330, 750], [500, 750]]);
  await tool("highlight");
  await drag([330, 750], [500, 750]);
  await tool("eraser");
  const freeBefore = marks().find(m => m.kind === "free");
  const freeShift = drawShift(freeBefore, linesBBox(freeBefore.lines));
  await drag([415, 775], [415, 725], 15);
  {
    const free = marks().filter(m => m.kind === "free");
    const h = radius + free[0].thickness / 2;
    const gap = gapAt(free.map(m => [m.lines[0][0], m.lines[0].at(-2)]), 415);
    result.freeHighlight = report(gap, [round(415 - h), round(415 + h)], free.length, free.map(m => drawOffset(m, linesBBox(m.lines), freeShift)));
  }

  // Text highlight on the first line of the abstract, erased through its middle.
  await tool("highlight");
  const span = [...pageView().div.querySelectorAll(".textLayer span")].find(s => s.textContent.startsWith("Dynamic languages"));
  span.scrollIntoView({ block: "center", inline: "center" });
  await rendered();
  const range = document.createRange();
  range.selectNodeContents(span);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  uiManager().highlightSelection("test");
  await wait(400);
  selection.removeAllRanges();
  const created = marks().find(m => m.kind === "text");
  if (!created) {
    result.textHighlight = "FAIL could not create it";
    return result;
  }
  const [x1, y1, x2, y2] = created.boxes[0];
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  await show([[x1, y1], [x2, y2]]);
  await tool("eraser");
  await drag([cx, cy + 15], [cx, cy - 15], 15);
  {
    const mark = marks().find(m => m.kind === "text");
    const gap = gapAt(mark.boxes.map(b => [b[0], b[2]]), cx);
    const bbox = [
      Math.min(...mark.boxes.map(b => b[0])),
      Math.min(...mark.boxes.map(b => b[1])),
      Math.max(...mark.boxes.map(b => b[2])),
      Math.max(...mark.boxes.map(b => b[3])),
    ];
    result.textHighlight = report(gap, [round(cx - radius), round(cx + radius)], mark.boxes.length, [drawOffset(mark, bbox)]);
  }
  return result;
}
