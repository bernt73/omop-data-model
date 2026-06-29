"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { computeFit, zoomAt, clampPan } = require("../docs/assets/viewer.js");

test("computeFit fits to the limiting dimension and centers the image", () => {
  // viewport 1000x800, image 2000x1000 -> width is limiting (0.5 < 0.8)
  const r = computeFit(1000, 800, 2000, 1000);
  assert.equal(r.scale, 0.5);
  assert.equal(r.minScale, 0.5);
  assert.equal(r.tx, 0);                 // (1000 - 2000*0.5)/2
  assert.equal(r.ty, 150);               // (800  - 1000*0.5)/2
});

test("computeFit uses height when height is the limiting dimension", () => {
  const r = computeFit(1000, 400, 2000, 1000); // 0.5 vs 0.4 -> 0.4
  assert.equal(r.scale, 0.4);
  assert.equal(r.tx, 100);               // (1000 - 2000*0.4)/2
  assert.equal(r.ty, 0);
});

test("zoomAt keeps the point under the cursor fixed in image space", () => {
  const state = { scale: 1, tx: 0, ty: 0, minScale: 0.5, maxScale: 12 };
  const imgPtBefore = (state.scale, { x: (100 - state.tx) / state.scale, y: (100 - state.ty) / state.scale });
  const r = zoomAt(state, 100, 100, 2);
  assert.equal(r.scale, 2);
  const imgPtAfter = { x: (100 - r.tx) / r.scale, y: (100 - r.ty) / r.scale };
  assert.equal(imgPtAfter.x, imgPtBefore.x);
  assert.equal(imgPtAfter.y, imgPtBefore.y);
});

test("zoomAt clamps scale to maxScale", () => {
  const state = { scale: 10, tx: 0, ty: 0, minScale: 0.5, maxScale: 12 };
  const r = zoomAt(state, 50, 50, 4); // 40 -> clamp 12
  assert.equal(r.scale, 12);
});

test("zoomAt clamps scale to minScale (never below fit)", () => {
  const state = { scale: 1, tx: 0, ty: 0, minScale: 0.5, maxScale: 12 };
  const r = zoomAt(state, 50, 50, 0.1); // 0.1 -> clamp 0.5
  assert.equal(r.scale, 0.5);
});

test("clampPan centers the image on an axis when it is smaller than the viewport", () => {
  // scale 0.5 -> displayed 1000x500 in a 1000x800 viewport
  const r = clampPan(999, -42, 0.5, 1000, 800, 2000, 1000);
  assert.equal(r.tx, 0);    // exactly fills width -> centered at 0
  assert.equal(r.ty, 150);  // (800-500)/2
});

test("clampPan keeps a larger-than-viewport image from drifting past its edges", () => {
  // scale 1 -> displayed 2000x1000, viewport 1000x800
  assert.equal(clampPan(500, 0, 1, 1000, 800, 2000, 1000).tx, 0);       // can't pan right of 0
  assert.equal(clampPan(-5000, 0, 1, 1000, 800, 2000, 1000).tx, -1000); // can't pan past left edge (vw-dw)
  assert.equal(clampPan(0, 999, 1, 1000, 800, 2000, 1000).ty, 0);
  assert.equal(clampPan(0, -9999, 1, 1000, 800, 2000, 1000).ty, -200);  // vh-dh = 800-1000
});
