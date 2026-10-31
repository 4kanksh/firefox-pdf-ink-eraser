/**
 * Partial eraser for the pdf.js viewer: erases exactly where you drag, like a
 * paint-program eraser, across pencil (ink) drawings and highlights.
 *
 * Loaded as a module after viewer.mjs. It drives the viewer through
 * PDFViewerApplication and the pdf.js editor objects, without patching pdf.js.
 *
 * Each pointer move sweeps a capsule (see eraser-geometry.js). Every pencil or
 * highlight editor the capsule touches is removed and replaced by new editors
 * built from its remaining pieces. One drag is one undo step.
 */
import { bboxesOverlap, capsuleBBox, cutBoxes, cutPolyline } from "./eraser-geometry.js";

const { AnnotationEditorType } = globalThis.pdfjsLib;
const app = window.PDFViewerApplication;

const RADIUS_MIN = 2;
const RADIUS_MAX = 60;
const RADIUS_DEFAULT = 10;
const RADIUS_STORAGE_KEY = "inkEraser.radius";
// Leftover pieces shorter or narrower than this (in PDF units) are dropped.
const MIN_PIECE_SIZE = 0.5;

let uiManager = null;
let active = false;
// In CSS pixels, so the eraser has the same on-screen size at any zoom level.
let radius = loadRadius();
// The drag in progress: { pageIndex, pointerId, last, removed, added, queue }.
let drag = null;
let ui = null;

function loadRadius() {
  try {
    const stored = Number(localStorage.getItem(RADIUS_STORAGE_KEY));
    if (stored >= RADIUS_MIN && stored <= RADIUS_MAX) {
      return stored;
    }
  } catch {}
  return RADIUS_DEFAULT;
}

function saveRadius() {
  try {
    localStorage.setItem(RADIUS_STORAGE_KEY, String(radius));
  } catch {}
}

function el(tag, attributes = {}, children = []) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  element.append(...children);
  return element;
}

function createUI() {
  const button = el(
    "button",
    {
      id: "editorInkEraserButton",
      class: "toolbarButton",
      type: "button",
      disabled: "",
      title: "Eraser",
      "aria-pressed": "false",
      "aria-expanded": "false",
      "aria-haspopup": "true",
      "aria-controls": "editorInkEraserParamsToolbar",
      tabindex: "0",
    },
    [el("span", {}, ["Eraser"])]
  );
  const slider = el("input", {
    type: "range",
    id: "editorInkEraserSize",
    class: "editorParamsSlider",
    min: String(RADIUS_MIN),
    max: String(RADIUS_MAX),
    step: "1",
    value: String(radius),
    tabindex: "0",
  });
  const params = el("div", { id: "editorInkEraserParamsToolbar", class: "editorParamsToolbar hidden doorHangerRight" }, [
    el("div", { class: "editorParamsToolbarContainer" }, [
      el("div", { class: "editorParamsSetter" }, [
        el("label", { for: "editorInkEraserSize", class: "editorParamsLabel" }, ["Size"]),
        slider,
      ]),
    ]),
  ]);
  const wrapper = el("div", { id: "editorInkEraser", class: "toolbarButtonWithContainer" }, [button, params]);
  const ink = document.getElementById("editorInk");
  if (ink) {
    ink.after(wrapper);
  } else {
    document.getElementById("editorModeButtons")?.append(wrapper);
  }

  const cursor = el("div", { id: "inkEraserCursor", hidden: "" });
  document.body.append(cursor);

  return { button, params, slider, cursor };
}

function setActive(on) {
  if (on === active || (on && !uiManager)) {
    return;
  }
  active = on;
  document.documentElement.classList.toggle("inkEraserActive", on);
  ui.button.classList.toggle("toggled", on);
  ui.button.setAttribute("aria-pressed", String(on));
  ui.button.setAttribute("aria-expanded", String(on));
  ui.params.classList.toggle("hidden", !on);
  if (!on) {
    ui.cursor.hidden = true;
    return;
  }
  // Finish any drawing in progress, so it becomes an ordinary, erasable mark.
  uiManager.unselectAll();
  if (uiManager.getMode() !== AnnotationEditorType.INK) {
    // In any editing mode pdf.js turns marks saved in the PDF into editable
    // objects. Pencil mode also turns off text selection while erasing.
    app.eventBus.dispatch("switchannotationeditormode", { source: window, mode: AnnotationEditorType.INK });
  }
}

function pageViewport(pageIndex) {
  return app.pdfViewer.getPageView(pageIndex)?.viewport ?? null;
}

/** Convert a pointer position to PDF coordinates on the given page. */
function toPdfPoint(pageIndex, event) {
  const pageView = app.pdfViewer.getPageView(pageIndex);
  const box = (pageView.div.querySelector(".canvasWrapper") ?? pageView.div).getBoundingClientRect();
  return pageView.viewport.convertToPdfPoint(event.clientX - box.left, event.clientY - box.top);
}

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function isErasable(editor) {
  return (editor.editorType === "ink" || editor.editorType === "highlight") && !editor.deleted && !editor.isEmpty();
}

/**
 * Cut one editor with the eraser sweep.
 * @returns {Array<object> | null} Serialized data for the replacement editors
 *   (empty when the editor is erased entirely), or null if it isn't touched.
 */
function cutEditor(editor, sweep) {
  const rect = editor.getPDFRect();
  if (!bboxesOverlap(rect, capsuleBBox(sweep))) {
    return null;
  }
  const base = {
    annotationType: editor.mode,
    pageIndex: editor.pageIndex,
    rect,
    rotation: editor.rotation,
    color: hexToRgb(editor.color),
    opacity: editor.opacity,
  };

  if (editor.editorType === "ink") {
    const thickness = editor._drawingOptions["stroke-width"];
    // Cutting the centre line r + thickness/2 around the eraser leaves a
    // visible gap as wide as the eraser once the round line caps are drawn.
    const capsule = { ...sweep, r: sweep.r + thickness / 2 };
    let changed = false;
    const kept = [];
    for (const stroke of editor.serializeDraw(false).points) {
      const pieces = cutPolyline(stroke, capsule, MIN_PIECE_SIZE);
      if (pieces) {
        changed = true;
        kept.push(...pieces);
      } else {
        kept.push(Array.from(stroke));
      }
    }
    if (!changed) {
      return null;
    }
    // A pencil annotation can hold several strokes, so the pieces stay together.
    return kept.length ? [{ ...base, thickness, paths: { points: kept.map(p => new Float32Array(p)) } }] : [];
  }

  const outlines = editor._drawOutlines;
  if (outlines.isFree) {
    const thickness = editor._drawingOptions.thickness;
    const capsule = { ...sweep, r: sweep.r + thickness / 2 };
    const [stroke] = outlines.serialize(rect, editor._drawRotation).points;
    const pieces = cutPolyline(stroke, capsule, MIN_PIECE_SIZE);
    // A freehand highlight holds a single line, so each piece is its own highlight.
    return pieces?.map(piece => ({ ...base, thickness, outlines: { points: [piece] } })) ?? null;
  }

  // Text highlight: quadPoints are [xLeft, yTop, xRight, yTop, xLeft, yBottom, xRight, yBottom] per box.
  const quadPoints = outlines.serializeQuadPoints(editor.pageTranslation, editor.pageDimensions);
  const boxes = [];
  for (let i = 0; i < quadPoints.length; i += 8) {
    boxes.push({ x1: quadPoints[i], y1: quadPoints[i + 5], x2: quadPoints[i + 2], y2: quadPoints[i + 1] });
  }
  const kept = cutBoxes(boxes, sweep, MIN_PIECE_SIZE);
  if (!kept) {
    return null;
  }
  if (!kept.length) {
    return [];
  }
  const newQuadPoints = new Float32Array(kept.length * 8);
  kept.forEach(({ x1, y1, x2, y2 }, i) => {
    newQuadPoints.set([x1, y2, x2, y2, x1, y1, x2, y1], i * 8);
  });
  return [{ ...base, quadPoints: newQuadPoints }];
}

/**
 * Add an editor to its page without the side effects of drawing it by hand:
 * pdf.js would record an undo step for it and focus (select) it. The eraser
 * records a single undo step per drag instead.
 */
function addQuietly(editor) {
  const layer = uiManager.getLayer(editor.pageIndex);
  if (!layer) {
    // The page isn't rendered; pdf.js keeps such editors in storage only.
    uiManager.addEditor(editor);
    uiManager.addToAnnotationStorage(editor);
    return;
  }
  layer.addUndoableEditor = () => {};
  editor._focusEventsAllowed = false;
  try {
    layer.addOrRebuild(editor);
    if (editor.div?.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  } finally {
    delete layer.addUndoableEditor;
    editor._focusEventsAllowed = true;
  }
}

async function eraseSweep(state, [ax, ay], [bx, by]) {
  const layer = uiManager.getLayer(state.pageIndex);
  const viewport = pageViewport(state.pageIndex);
  if (!layer || !viewport) {
    return;
  }
  const sweep = { ax, ay, bx, by, r: radius / viewport.scale };
  for (const editor of [...uiManager.getEditors(state.pageIndex)]) {
    if (!isErasable(editor)) {
      continue;
    }
    const replacements = cutEditor(editor, sweep);
    if (!replacements) {
      continue;
    }
    const newEditors = await Promise.all(replacements.map(data => layer.deserialize(data)));
    editor.remove();
    // Pieces made earlier in this same drag are temporary: drop them for good.
    if (!state.added.delete(editor)) {
      state.removed.add(editor);
    }
    for (const newEditor of newEditors) {
      if (newEditor) {
        addQuietly(newEditor);
        state.added.add(newEditor);
      }
    }
  }
}

function recordUndo({ removed, added }) {
  if (!removed.size && !added.size) {
    return;
  }
  const removedEditors = [...removed];
  const addedEditors = [...added];
  uiManager.addCommands({
    cmd: () => {
      removedEditors.forEach(editor => editor.remove());
      addedEditors.forEach(addQuietly);
    },
    undo: () => {
      addedEditors.forEach(editor => editor.remove());
      removedEditors.forEach(addQuietly);
    },
    mustExec: false,
  });
}

function updateCursor(event) {
  const overPage = active && (drag || event.target.closest?.("#viewerContainer .page"));
  ui.cursor.hidden = !overPage;
  if (overPage) {
    ui.cursor.style.width = ui.cursor.style.height = `${2 * radius}px`;
    ui.cursor.style.left = `${event.clientX}px`;
    ui.cursor.style.top = `${event.clientY}px`;
  }
}

function onPointerDown(event) {
  if (!active || event.button !== 0) {
    return;
  }
  const pageDiv = event.target.closest?.(".page");
  if (!pageDiv) {
    return;
  }
  // Keep the event from reaching the pencil tool and the text layer.
  event.preventDefault();
  event.stopPropagation();
  ui.params.classList.add("hidden");
  ui.button.setAttribute("aria-expanded", "false");

  const pageIndex = Number(pageDiv.dataset.pageNumber) - 1;
  const point = toPdfPoint(pageIndex, event);
  drag = {
    pageIndex,
    pointerId: event.pointerId,
    last: point,
    removed: new Set(),
    added: new Set(),
    queue: Promise.resolve(),
  };
  enqueueSweep(drag, point, point);
}

function enqueueSweep(state, from, to) {
  state.queue = state.queue.then(() => eraseSweep(state, from, to)).catch(error => console.error("Eraser:", error));
}

function onPointerMove(event) {
  if (!active) {
    return;
  }
  updateCursor(event);
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  // Coalesced events are the intermediate positions the browser merged into
  // this one; using them keeps fast drags from skipping over thin strokes.
  const coalesced = event.getCoalescedEvents?.();
  for (const moved of coalesced?.length ? coalesced : [event]) {
    const point = toPdfPoint(drag.pageIndex, moved);
    enqueueSweep(drag, drag.last, point);
    drag.last = point;
  }
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const finished = drag;
  drag = null;
  finished.queue.then(() => recordUndo(finished));
}

function init() {
  ui = createUI();

  ui.button.addEventListener("click", () => setActive(!active));
  ui.slider.addEventListener("input", () => {
    radius = Number(ui.slider.value);
    saveRadius();
  });

  // Clicking the pencil while erasing should go back to drawing, not turn the
  // pencil off (it's already the underlying mode).
  document.getElementById("editorInk")?.addEventListener(
    "click",
    event => {
      if (active) {
        event.stopPropagation();
        setActive(false);
      }
    },
    true
  );

  const container = app.appConfig.mainContainer;
  container.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerUp, true);
  container.addEventListener("pointerleave", () => {
    if (!drag) {
      ui.cursor.hidden = true;
    }
  });

  app.eventBus.on("annotationeditoruimanager", ({ uiManager: manager }) => {
    setActive(false);
    uiManager = manager;
    ui.button.disabled = false;
  });
  app.eventBus.on("annotationeditormodechanged", ({ mode }) => {
    if (mode !== AnnotationEditorType.INK) {
      setActive(false);
    }
    ui.button.disabled = mode === AnnotationEditorType.DISABLE;
  });
}

app.initializedPromise.then(init);
