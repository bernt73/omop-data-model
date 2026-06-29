"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("node-html-parser");

const DOCS = path.join(__dirname, "..", "docs");
const PAGES = ["index.html", "conceptual.html", "logical.html", "physical.html"];

const docCache = {};
function doc(file) {
  if (!docCache[file]) {
    docCache[file] = parse(fs.readFileSync(path.join(DOCS, file), "utf8"));
  }
  return docCache[file];
}

// Every internal href/src reference, normalized, excluding external + anchors.
function localRefs(root) {
  const refs = [];
  root.querySelectorAll("[href],[src]").forEach((el) => {
    const v = el.getAttribute("href") || el.getAttribute("src");
    if (!v) return;
    if (/^(https?:|mailto:|#)/.test(v)) return;
    refs.push(v);
  });
  return refs;
}

// ---- structural contract, every page -----------------------------------

for (const file of PAGES) {
  test(`${file}: has lang, charset, viewport, title, exactly one <h1>`, () => {
    const root = doc(file);
    assert.equal(root.querySelector("html").getAttribute("lang"), "en");
    assert.ok(root.querySelector('meta[charset]'), "missing charset");
    assert.ok(root.querySelector('meta[name="viewport"]'), "missing viewport");
    assert.ok(root.querySelector("title").text.trim().length > 0, "empty title");
    assert.equal(root.querySelectorAll("h1").length, 1, "should have exactly one h1");
  });

  test(`${file}: links the shared stylesheet`, () => {
    assert.ok(doc(file).querySelector('link[href="assets/style.css"]'), "style.css not linked");
  });

  test(`${file}: every internal href/src resolves to a real file`, () => {
    for (const ref of localRefs(doc(file))) {
      assert.ok(fs.existsSync(path.join(DOCS, ref)), `broken reference: ${ref} in ${file}`);
    }
  });

  test(`${file}: is self-contained (no ../diagrams references)`, () => {
    for (const ref of localRefs(doc(file))) {
      assert.ok(!ref.includes("../"), `non-self-contained reference: ${ref} in ${file}`);
    }
  });

  test(`${file}: every image has non-empty alt text`, () => {
    doc(file).querySelectorAll("img").forEach((img) => {
      assert.ok((img.getAttribute("alt") || "").trim().length > 0,
        `image missing alt: ${img.getAttribute("src")} in ${file}`);
    });
  });
}

// ---- diagram pages -------------------------------------------------------

const DIAGRAM_PAGES = {
  "conceptual.html": "diagrams/1-conceptual-er.png",
  "logical.html": "diagrams/2-logical-model.png",
  "physical.html": "diagrams/3-physical-model.png",
};

for (const [file, expectedImg] of Object.entries(DIAGRAM_PAGES)) {
  test(`${file}: viewer shows the correct diagram`, () => {
    const img = doc(file).querySelector(".viewer img");
    assert.ok(img, "no image inside .viewer");
    assert.equal(img.getAttribute("src"), expectedImg);
  });

  test(`${file}: viewer has all four controls (in/out/reset/fullscreen)`, () => {
    const actions = doc(file)
      .querySelectorAll(".viewer .controls [data-action]")
      .map((b) => b.getAttribute("data-action"))
      .sort();
    assert.deepEqual(actions, ["fullscreen", "in", "out", "reset"]);
  });

  test(`${file}: loads the viewer script`, () => {
    assert.ok(doc(file).querySelector('script[src="assets/viewer.js"]'), "viewer.js not loaded");
  });
}

// ---- inter-page navigation ----------------------------------------------

function navHrefs(file) {
  return doc(file).querySelectorAll(".page-nav a").map((a) => a.getAttribute("href"));
}

test("conceptual page links forward to logical", () => {
  assert.ok(navHrefs("conceptual.html").includes("logical.html"));
});

test("logical page links back to conceptual and forward to physical", () => {
  const nav = navHrefs("logical.html");
  assert.ok(nav.includes("conceptual.html"), "missing prev");
  assert.ok(nav.includes("physical.html"), "missing next");
});

test("physical page links back to logical", () => {
  assert.ok(navHrefs("physical.html").includes("logical.html"));
});

// ---- landing page --------------------------------------------------------

test("index has three level cards linking to the three diagram pages", () => {
  const hrefs = doc("index.html").querySelectorAll("a.card").map((a) => a.getAttribute("href")).sort();
  assert.deepEqual(hrefs, ["conceptual.html", "logical.html", "physical.html"]);
});
