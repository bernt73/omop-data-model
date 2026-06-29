/* Minimal dependency-free pan & zoom for a single large image.
   - drag to pan
   - mouse wheel / trackpad to zoom toward cursor
   - two-finger pinch to zoom on touch devices
   - buttons: zoom in, zoom out, reset (fit), fullscreen

   The geometry math lives in three pure functions (computeFit, zoomAt,
   clampPan) so it can be unit-tested without a DOM. The DOM bootstrap at the
   bottom is skipped under Node, and the pure functions are exported for tests.
*/
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;            // Node / tests
  }
  if (typeof document !== "undefined") {
    api._bootstrap();                // browser
  }
})(this, function () {
  "use strict";

  // ---- pure geometry ----------------------------------------------------

  // Fit the whole image inside the viewport and center it.
  function computeFit(vw, vh, natW, natH) {
    var scale = Math.min(vw / natW, vh / natH);
    return {
      scale: scale,
      minScale: scale,
      tx: (vw - natW * scale) / 2,
      ty: (vh - natH * scale) / 2
    };
  }

  // Zoom by `factor` about viewport point (cx, cy), keeping the image point
  // under the cursor fixed. Clamps scale to [minScale, maxScale]. Pure: does
  // not clamp panning (compose with clampPan for that).
  function zoomAt(state, cx, cy, factor) {
    var next = Math.max(state.minScale, Math.min(state.maxScale, state.scale * factor));
    var k = next / state.scale;
    return {
      scale: next,
      tx: cx - (cx - state.tx) * k,
      ty: cy - (cy - state.ty) * k
    };
  }

  // Keep the image from drifting out of view. Centers an axis when the image
  // is smaller than the viewport on that axis; otherwise clamps to the edges.
  function clampPan(tx, ty, scale, vw, vh, natW, natH) {
    var dw = natW * scale, dh = natH * scale;
    if (dw <= vw) tx = (vw - dw) / 2;
    else tx = Math.min(0, Math.max(vw - dw, tx));
    if (dh <= vh) ty = (vh - dh) / 2;
    else ty = Math.min(0, Math.max(vh - dh, ty));
    return { tx: tx, ty: ty };
  }

  // ---- DOM wiring -------------------------------------------------------

  function initViewer(viewer) {
    var img = viewer.querySelector("img");
    var hint = viewer.querySelector(".hint");
    if (!img) return;

    var maxScale = 12;
    var state = { scale: 1, tx: 0, ty: 0, minScale: 1, maxScale: maxScale };
    var natW = 0, natH = 0;

    function apply() {
      img.style.transform =
        "translate(" + state.tx + "px," + state.ty + "px) scale(" + state.scale + ")";
    }

    function fit() {
      var f = computeFit(viewer.clientWidth, viewer.clientHeight, natW, natH);
      state.scale = f.scale; state.minScale = f.minScale;
      state.tx = f.tx; state.ty = f.ty;
      apply();
    }

    function zoom(cx, cy, factor) {
      var z = zoomAt(state, cx, cy, factor);
      var p = clampPan(z.tx, z.ty, z.scale, viewer.clientWidth, viewer.clientHeight, natW, natH);
      state.scale = z.scale; state.tx = p.tx; state.ty = p.ty;
      apply();
    }

    function pan(dx, dy) {
      var p = clampPan(state.tx + dx, state.ty + dy, state.scale,
        viewer.clientWidth, viewer.clientHeight, natW, natH);
      state.tx = p.tx; state.ty = p.ty;
      apply();
    }

    function rect() { return viewer.getBoundingClientRect(); }

    viewer.addEventListener("wheel", function (e) {
      e.preventDefault();
      var r = rect();
      zoom(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
      dismissHint();
    }, { passive: false });

    var dragging = false, lastX = 0, lastY = 0, pointers = {};
    var pinchDist = 0, pinchMid = null;

    viewer.addEventListener("pointerdown", function (e) {
      viewer.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (ids.length === 1) {
        dragging = true; lastX = e.clientX; lastY = e.clientY;
        viewer.classList.add("grabbing");
      } else if (ids.length === 2) {
        dragging = false;
        var p = pointers[ids[0]], q = pointers[ids[1]];
        pinchDist = Math.hypot(p.x - q.x, p.y - q.y);
        var r = rect();
        pinchMid = { x: (p.x + q.x) / 2 - r.left, y: (p.y + q.y) / 2 - r.top };
      }
      dismissHint();
    });

    viewer.addEventListener("pointermove", function (e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var p = pointers[ids[0]], q = pointers[ids[1]];
        var dist = Math.hypot(p.x - q.x, p.y - q.y);
        if (pinchDist > 0 && pinchMid) zoom(pinchMid.x, pinchMid.y, dist / pinchDist);
        pinchDist = dist;
        return;
      }
      if (dragging) {
        pan(e.clientX - lastX, e.clientY - lastY);
        lastX = e.clientX; lastY = e.clientY;
      }
    });

    function endPointer(e) {
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) { pinchDist = 0; pinchMid = null; }
      if (Object.keys(pointers).length === 0) {
        dragging = false; viewer.classList.remove("grabbing");
      }
    }
    viewer.addEventListener("pointerup", endPointer);
    viewer.addEventListener("pointercancel", endPointer);

    viewer.addEventListener("dblclick", function (e) {
      var r = rect();
      zoom(e.clientX - r.left, e.clientY - r.top, 1.8);
    });

    function center() { return { x: viewer.clientWidth / 2, y: viewer.clientHeight / 2 }; }
    viewer.querySelectorAll("[data-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var a = btn.getAttribute("data-action"), c = center();
        if (a === "in") zoom(c.x, c.y, 1.4);
        else if (a === "out") zoom(c.x, c.y, 1 / 1.4);
        else if (a === "reset") fit();
        else if (a === "fullscreen") toggleFullscreen();
      });
    });

    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        (viewer.requestFullscreen || viewer.webkitRequestFullscreen).call(viewer);
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      }
    }
    document.addEventListener("fullscreenchange", function () {
      viewer.classList.toggle("is-fullscreen", document.fullscreenElement === viewer);
      setTimeout(fit, 60);
    });

    function dismissHint() { if (hint) hint.style.opacity = "0"; }

    function ready() {
      natW = img.naturalWidth; natH = img.naturalHeight;
      fit();
      if (hint) setTimeout(dismissHint, 4500);
    }
    if (img.complete && img.naturalWidth) ready();
    else img.addEventListener("load", ready);

    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt); rt = setTimeout(fit, 120);
    });
  }

  function _bootstrap() {
    document.querySelectorAll(".viewer").forEach(initViewer);
  }

  return { computeFit: computeFit, zoomAt: zoomAt, clampPan: clampPan, _bootstrap: _bootstrap };
});
