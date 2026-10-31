/**
 * Geometry for the partial eraser.
 *
 * This module has no DOM or pdf.js dependencies, so it can be unit-tested in
 * Node and reused unchanged in an upstream pdf.js patch.
 *
 * An eraser drag is a sequence of "capsules": the area swept by a circle of
 * radius `r` moving in a straight line from A (ax, ay) to B (bx, by).
 * All coordinates are in the same space (PDF page units in practice).
 */

const EPSILON = 1e-9;

/**
 * Interval of t where the point P + t*D lies inside the circle (C, r).
 * @returns {[number, number] | null}
 */
function lineCircle(px, py, dx, dy, cx, cy, r) {
  const fx = px - cx;
  const fy = py - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  if (a < EPSILON) {
    return c <= 0 ? [-Infinity, Infinity] : null;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) {
    return null;
  }
  const s = Math.sqrt(disc);
  return [(-b - s) / (2 * a), (-b + s) / (2 * a)];
}

/**
 * Narrow [t0, t1] to where `start + t * delta` lies in [lo, hi]
 * (one step of Liang-Barsky clipping).
 * @returns {[number, number] | null}
 */
function clipSlab(t0, t1, start, delta, lo, hi) {
  if (Math.abs(delta) < EPSILON) {
    return start >= lo && start <= hi ? [t0, t1] : null;
  }
  let a = (lo - start) / delta;
  let b = (hi - start) / delta;
  if (a > b) {
    [a, b] = [b, a];
  }
  t0 = Math.max(t0, a);
  t1 = Math.min(t1, b);
  return t0 <= t1 ? [t0, t1] : null;
}

/**
 * Interval of t where P + t*D lies inside the capsule.
 *
 * The capsule is the union of two end circles and the rectangle between them.
 * That union is convex, so a line crosses it in one interval: the hull of the
 * three partial intervals.
 * @returns {[number, number] | null}
 */
function lineCapsule(px, py, dx, dy, { ax, ay, bx, by, r }) {
  const hits = [lineCircle(px, py, dx, dy, ax, ay, r)];
  const length = Math.hypot(bx - ax, by - ay);
  if (length > EPSILON) {
    hits.push(lineCircle(px, py, dx, dy, bx, by, r));
    // Rectangle body, in a frame where u runs along AB and v across it.
    const ux = (bx - ax) / length;
    const uy = (by - ay) / length;
    const relX = px - ax;
    const relY = py - ay;
    let body = clipSlab(-Infinity, Infinity, relX * ux + relY * uy, dx * ux + dy * uy, 0, length);
    if (body) {
      body = clipSlab(body[0], body[1], -relX * uy + relY * ux, -dx * uy + dy * ux, -r, r);
    }
    hits.push(body);
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const hit of hits) {
    if (hit) {
      lo = Math.min(lo, hit[0]);
      hi = Math.max(hi, hit[1]);
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

export function pointInCapsule(x, y, { ax, ay, bx, by, r }) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq < EPSILON ? 0 : Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / lengthSq));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= r;
}

/** [minX, minY, maxX, maxY] of a capsule. */
export function capsuleBBox({ ax, ay, bx, by, r }) {
  return [Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.max(ax, bx) + r, Math.max(ay, by) + r];
}

/** [minX, minY, maxX, maxY] of a flat [x0, y0, x1, y1, ...] array. */
export function pointsBBox(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  return [minX, minY, maxX, maxY];
}

export function bboxesOverlap(a, b, margin = 0) {
  return a[0] - margin <= b[2] && b[0] - margin <= a[2] && a[1] - margin <= b[3] && b[1] - margin <= a[3];
}

function polylineLength(points) {
  let length = 0;
  for (let i = 2; i < points.length; i += 2) {
    length += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
  }
  return length;
}

/**
 * Remove the part of a polyline covered by the capsule.
 *
 * @param {ArrayLike<number>} points Flat [x0, y0, x1, y1, ...] array.
 * @param {object} capsule {ax, ay, bx, by, r}.
 * @param {number} [minLength] Leftover pieces shorter than this are dropped.
 * @returns {number[][] | null} The remaining pieces (possibly empty, when the
 *   whole polyline was erased), or null when the capsule doesn't touch it.
 */
export function cutPolyline(points, capsule, minLength = 0) {
  const count = points.length >> 1;
  if (count === 0) {
    return null;
  }
  if (count === 1) {
    return pointInCapsule(points[0], points[1], capsule) ? [] : null;
  }

  const pieces = [];
  let current = [points[0], points[1]];
  let changed = false;
  const closePiece = () => {
    if (current.length >= 4 && polylineLength(current) >= minLength) {
      pieces.push(current);
    }
    current = [];
  };

  for (let i = 0; i < count - 1; i++) {
    const px = points[2 * i];
    const py = points[2 * i + 1];
    const qx = points[2 * i + 2];
    const qy = points[2 * i + 3];
    const dx = qx - px;
    const dy = qy - py;
    if (current.length === 0) {
      current.push(px, py);
    }

    const hit = lineCapsule(px, py, dx, dy, capsule);
    const t0 = hit ? Math.max(0, hit[0]) : 1;
    const t1 = hit ? Math.min(1, hit[1]) : 0;
    if (t1 - t0 <= EPSILON) {
      // No overlap, or the segment only grazes the eraser at a single point.
      current.push(qx, qy);
      continue;
    }

    changed = true;
    if (t0 > 0) {
      current.push(px + t0 * dx, py + t0 * dy);
    }
    closePiece();
    if (t1 < 1) {
      current.push(px + t1 * dx, py + t1 * dy, qx, qy);
    }
  }
  closePiece();

  return changed ? pieces : null;
}

/** Interval of x covered by the capsule along the horizontal line at y. */
function capsuleRowInterval(y, capsule) {
  return lineCapsule(0, y, 1, 0, capsule);
}

/**
 * Interval of x covered by the capsule anywhere in the horizontal band
 * y in [yMin, yMax].
 *
 * The capsule-band intersection is convex, so its x-extremes lie either on the
 * band's two edges or at the capsule's own left/right extremes (when those
 * fall inside the band).
 * @returns {[number, number] | null}
 */
export function capsuleBandInterval(yMin, yMax, capsule) {
  const { ax, ay, bx, by, r } = capsule;
  const candidates = [capsuleRowInterval(yMin, capsule), capsuleRowInterval(yMax, capsule)];
  const middle = (yMin + yMax) / 2;
  const segMinY = Math.min(ay, by);
  const segMaxY = Math.max(ay, by);
  // Where along the segment the capsule's leftmost/rightmost points are.
  const extremeY = (useA, useB) => {
    if (useA && useB) {
      return Math.min(segMaxY, Math.max(segMinY, middle));
    }
    return useA ? ay : by;
  };
  const leftY = extremeY(ax <= bx, bx <= ax);
  if (leftY >= yMin && leftY <= yMax) {
    const x = Math.min(ax, bx) - r;
    candidates.push([x, x]);
  }
  const rightY = extremeY(ax >= bx, bx >= ax);
  if (rightY >= yMin && rightY <= yMax) {
    const x = Math.max(ax, bx) + r;
    candidates.push([x, x]);
  }

  let lo = Infinity;
  let hi = -Infinity;
  for (const candidate of candidates) {
    if (candidate) {
      lo = Math.min(lo, candidate[0]);
      hi = Math.max(hi, candidate[1]);
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

/**
 * Trim axis-aligned boxes (text highlight rectangles) where the capsule
 * crosses them. The full height of the box is removed over the covered x
 * range, so a box can shrink, split in two, or disappear.
 *
 * @param {Array<{x1: number, y1: number, x2: number, y2: number}>} boxes
 *   With x1 < x2 and y1 < y2.
 * @param {object} capsule {ax, ay, bx, by, r}.
 * @param {number} [minWidth] Leftover boxes narrower than this are dropped.
 * @returns {Array<object> | null} The remaining boxes, or null when the
 *   capsule doesn't touch any of them.
 */
export function cutBoxes(boxes, capsule, minWidth = 0) {
  const result = [];
  let changed = false;
  for (const box of boxes) {
    const covered = capsuleBandInterval(box.y1, box.y2, capsule);
    if (!covered || covered[1] <= box.x1 || covered[0] >= box.x2) {
      result.push(box);
      continue;
    }
    changed = true;
    if (covered[0] - box.x1 >= minWidth && covered[0] > box.x1) {
      result.push({ ...box, x2: covered[0] });
    }
    if (box.x2 - covered[1] >= minWidth && covered[1] < box.x2) {
      result.push({ ...box, x1: covered[1] });
    }
  }
  return changed ? result : null;
}
