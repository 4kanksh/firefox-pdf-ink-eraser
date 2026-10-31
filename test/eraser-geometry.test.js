import { test } from "node:test";
import assert from "node:assert/strict";
import { capsuleBandInterval, cutBoxes, cutPolyline, pointInCapsule } from "../src/eraser-geometry.js";

const circle = (x, y, r) => ({ ax: x, ay: y, bx: x, by: y, r });

function assertClose(actual, expected, message) {
  assert.equal(actual.length, expected.length, `${message}: length ${actual.length} != ${expected.length}`);
  for (let i = 0; i < expected.length; i++) {
    assert.ok(Math.abs(actual[i] - expected[i]) < 1e-6, `${message}: [${i}] ${actual[i]} != ${expected[i]}`);
  }
}

function assertPieces(actual, expected) {
  assert.ok(actual, "expected the polyline to be cut");
  assert.equal(actual.length, expected.length, `got ${actual.length} pieces: ${JSON.stringify(actual)}`);
  expected.forEach((piece, i) => assertClose(actual[i], piece, `piece ${i}`));
}

test("erasing the middle of a line splits it in two", () => {
  const pieces = cutPolyline([0, 0, 100, 0], circle(50, 0, 10));
  assertPieces(pieces, [
    [0, 0, 40, 0],
    [60, 0, 100, 0],
  ]);
});

test("missing the line returns null", () => {
  assert.equal(cutPolyline([0, 0, 100, 0], circle(50, 20, 10)), null);
});

test("touching the line at a single point changes nothing", () => {
  assert.equal(cutPolyline([0, 0, 100, 0], circle(50, 10, 10)), null);
});

test("erasing the start shortens the line", () => {
  assertPieces(cutPolyline([0, 0, 100, 0], circle(0, 0, 10)), [[10, 0, 100, 0]]);
});

test("erasing the end shortens the line", () => {
  assertPieces(cutPolyline([0, 0, 100, 0], circle(100, 0, 10)), [[0, 0, 90, 0]]);
});

test("covering the whole line erases it", () => {
  assert.deepEqual(cutPolyline([0, 0, 10, 0, 10, 10], circle(5, 5, 50)), []);
});

test("cut points lie exactly on the eraser circle", () => {
  const [first, second] = cutPolyline([0, 0, 30, 40, 100, 40], circle(30, 40, 10));
  const end = first.slice(-2);
  const start = second.slice(0, 2);
  assert.ok(Math.abs(Math.hypot(end[0] - 30, end[1] - 40) - 10) < 1e-6);
  assert.ok(Math.abs(Math.hypot(start[0] - 30, start[1] - 40) - 10) < 1e-6);
  // Untouched points are kept as they were.
  assertClose(first.slice(0, 2), [0, 0], "first start");
  assertClose(second.slice(-2), [100, 40], "second end");
});

test("erasing a corner of an L-shaped stroke", () => {
  const pieces = cutPolyline([0, 0, 50, 0, 50, 50], circle(50, 0, 10));
  assertPieces(pieces, [
    [0, 0, 40, 0],
    [50, 10, 50, 50],
  ]);
});

test("dragging the eraser across a line cuts a gap as wide as the eraser", () => {
  const drag = { ax: 50, ay: -20, bx: 50, by: 20, r: 5 };
  assertPieces(cutPolyline([0, 0, 100, 0], drag), [
    [0, 0, 45, 0],
    [55, 0, 100, 0],
  ]);
});

test("dragging along a line erases the swept length", () => {
  const drag = { ax: 30, ay: 0, bx: 70, by: 0, r: 5 };
  assertPieces(cutPolyline([0, 0, 100, 0], drag), [
    [0, 0, 25, 0],
    [75, 0, 100, 0],
  ]);
});

test("a diagonal drag through a multi-point stroke cuts it twice", () => {
  // A zig-zag crossed by one diagonal sweep.
  const zigzag = [0, 0, 20, 20, 40, 0, 60, 20, 80, 0];
  const drag = { ax: 0, ay: 10, bx: 80, by: 10, r: 1 };
  const pieces = cutPolyline(zigzag, drag);
  assert.equal(pieces.length, 5);
});

test("tiny leftover pieces are dropped", () => {
  const pieces = cutPolyline([0, 0, 100, 0], circle(10.5, 0, 10), 1);
  assertPieces(pieces, [[20.5, 0, 100, 0]]);
});

test("a single-point stroke (a dot) is erased only when inside", () => {
  assert.deepEqual(cutPolyline([5, 5], circle(6, 6, 2)), []);
  assert.equal(cutPolyline([5, 5], circle(20, 20, 2)), null);
});

test("pointInCapsule", () => {
  const capsule = { ax: 0, ay: 0, bx: 10, by: 0, r: 2 };
  assert.ok(pointInCapsule(5, 1.9, capsule));
  assert.ok(pointInCapsule(-1.9, 0, capsule));
  assert.ok(!pointInCapsule(5, 2.1, capsule));
  assert.ok(!pointInCapsule(12.1, 0, capsule));
});

test("capsuleBandInterval for a circle inside the band", () => {
  assertClose(capsuleBandInterval(0, 10, circle(50, 5, 10)), [40, 60], "interval");
});

test("capsuleBandInterval for a circle overlapping the band edge", () => {
  const half = Math.sqrt(100 - 25);
  assertClose(capsuleBandInterval(0, 10, circle(50, 15, 10)), [50 - half, 50 + half], "interval");
});

test("capsuleBandInterval for a vertical drag through the band", () => {
  const drag = { ax: 50, ay: -30, bx: 50, by: 40, r: 3 };
  assertClose(capsuleBandInterval(0, 10, drag), [47, 53], "interval");
});

test("capsuleBandInterval for a diagonal drag", () => {
  // Line y = x, radius 1, band y in [0, 10]. The band edges give the extremes.
  const drag = { ax: -20, ay: -20, bx: 30, by: 30, r: 1 };
  const [lo, hi] = capsuleBandInterval(0, 10, drag);
  assert.ok(Math.abs(lo - -Math.SQRT2) < 1e-6, `lo ${lo}`);
  assert.ok(Math.abs(hi - (10 + Math.SQRT2)) < 1e-6, `hi ${hi}`);
});

test("capsuleBandInterval returns null when the eraser is outside the band", () => {
  assert.equal(capsuleBandInterval(0, 10, circle(50, 25, 10)), null);
});

test("erasing the middle of a highlight box splits it", () => {
  const box = { x1: 0, y1: 0, x2: 100, y2: 10 };
  assert.deepEqual(cutBoxes([box], circle(50, 5, 10)), [
    { x1: 0, y1: 0, x2: 40, y2: 10 },
    { x1: 60, y1: 0, x2: 100, y2: 10 },
  ]);
});

test("erasing the end of a highlight box trims it", () => {
  const box = { x1: 0, y1: 0, x2: 100, y2: 10 };
  assert.deepEqual(cutBoxes([box], circle(100, 5, 10)), [{ x1: 0, y1: 0, x2: 90, y2: 10 }]);
});

test("erasing a whole highlight box removes it and keeps the others", () => {
  const boxes = [
    { x1: 0, y1: 0, x2: 10, y2: 10 },
    { x1: 0, y1: 20, x2: 100, y2: 30 },
  ];
  assert.deepEqual(cutBoxes(boxes, circle(5, 5, 8)), [boxes[1]]);
});

test("missing all highlight boxes returns null", () => {
  assert.equal(cutBoxes([{ x1: 0, y1: 0, x2: 100, y2: 10 }], circle(50, 40, 10)), null);
});
