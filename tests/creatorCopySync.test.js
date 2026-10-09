// tests/creatorCopySync.test.js — the Creator's tours, coach marks and
// toasts only name controls that exist (audit COMMON-06).
//
// Copy that sends someone to "the Setup button" when there is no Setup button
// strands them. This test reads every Creator tour (on a phone and on a
// desktop), the Creator coach marks and the Creator toasts, picks out the
// tab, button and menu names they mention, and checks each one against the
// labels the Creator actually renders, by source parsing (like
// helpDrawerShortcutsSync.test.js). A name the table below doesn't know
// fails too, so new copy has to say which control it means.

const fs = require("fs");
const path = require("path");

const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

// Name used in copy → the file that renders it and the label as it appears
// there (a string literal, so `"Edit"` or `"Generate Pattern"`).
const CONTROLS = {
  "Generate":        [["creator/ActionBar.js", "Generate Pattern"], ["creator/CompactBar.js", "Generate"]],
  "Compare options": [["creator/CompareStrip.js", "Compare options"]],
  "Convert":         [["creator/ActionBar.js", "Convert"], ["creator/CompactBar.js", "Convert"]],
  "Canvas":          [["creator/ActionBar.js", "Canvas"], ["creator/CompactBar.js", "Canvas"]],
  "Edit":            [["creator/ActionBar.js", "Edit"], ["creator/CompactBar.js", "Edit"]],
  "Materials":       [["creator/ActionBar.js", "Materials"], ["creator/CompactBar.js", "Materials"]],
  "Print PDF":       [["creator/ActionBar.js", "Print PDF"], ["creator/CompactBar.js", "Print PDF"]],
  "Open in Tracker": [["creator/ActionBar.js", "Open in Tracker"], ["creator/CompactBar.js", "Open in Tracker"]],
  "More":            [["creator/CompactBar.js", "More actions"]],
  "Settings":        [["creator/Sidebar.js", "Settings"]],
  "Palette":         [["creator/Sidebar.js", "Palette"]],
  "Paint":           [["creator/ToolStrip.js", "Paint"]],
  "Tools":           [["creator/Sidebar.js", "Tools"]],
  "View":            [["creator/Sidebar.js", "View"]],
  "Image":           [["creator/Sidebar.js", "Image"]],
  "Dimensions":      [["creator/Sidebar.js", "Dimensions"]],
  "Undo":            [["creator/ToolStrip.js", "Undo"]]
};

// Keys, not controls.
const KEYS = new Set(["Esc", "Escape", "Delete", "Enter", "Shift", "Tab"]);

// Whole quoted strings in a file.
function literals(src) {
  // Comments first: an apostrophe in one would pair up the wrong quotes.
  src = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s;,{}()])\/\/.*$/gm, "$1");
  const out = new Set();
  const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(src))) out.add(m[1] !== undefined ? m[1] : m[2]);
  return out;
}

// ── The copy ────────────────────────────────────────────────────────────
function tourCopy() {
  const win = {};
  const React = { createElement: () => ({}), useState: (v) => [v, () => {}] };
  const doc = { getElementById: () => ({}), createElement: () => ({}), head: { appendChild: () => {} } };
  new Function("window", "React", "document", "localStorage", read("onboarding-wizard.js"))(win, React, doc, {});
  const tours = win.WelcomeWizard.CREATOR_TOURS;
  const devices = [
    { coarse: true, compact: true, Tap: "Tap", tap: "tap", settings: "the Settings sheet", actions: "the More menu at the top" },
    { coarse: false, compact: false, Tap: "Click", tap: "click", settings: "the panel on the right", actions: "the bar at the top" }
  ];
  const out = [];
  Object.keys(tours).forEach(k => devices.forEach(d => tours[k](d).forEach(s => {
    out.push({ where: "tour " + k, text: s.title + ". " + s.body + (s.tip ? " " + s.tip : "") });
  })));
  return out;
}

function coachCopy() {
  const src = read("creator-main.js");
  const out = [];
  let i = 0;
  while ((i = src.indexOf("React.createElement(window.Coachmark, {", i)) !== -1) {
    const end = src.indexOf("})}", i);
    const block = src.slice(i, end);
    literals(block).forEach(t => { if (/\s/.test(t)) out.push({ where: "coach mark", text: t }); });
    i = end;
  }
  return out;
}

function toastCopy() {
  const files = ["creator-main.js"].concat(
    fs.readdirSync(path.join(__dirname, "..", "creator"))
      .filter(f => f.endsWith(".js") && !/bundle/.test(f))
      .map(f => "creator/" + f));
  const out = [];
  files.forEach(f => {
    const src = read(f);
    const re = /(?:addToast|showToast)\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
    let m;
    while ((m = re.exec(src))) out.push({ where: "toast in " + f, text: m[1].slice(1, -1) });
  });
  return out;
}

// ── Names mentioned in a piece of copy ──────────────────────────────────
function namesIn(text) {
  const names = new Set();
  const NAME = "([A-Z][A-Za-z]*(?: (?:in )?[A-Z][A-Za-z]*)*)";
  [
    new RegExp("\\b" + NAME + " (?:tab|button|menu|sheet)\\b", "g"),
    new RegExp("\\b(?:[Tt]ap|[Cc]lick|[Pp]ress|[Oo]pen|[Uu]se) (?:the )?" + NAME, "g")
  ].forEach(re => {
    let m;
    while ((m = re.exec(text))) names.add(m[1]);
  });
  // Names the table knows, wherever they appear ("Print PDF and Open in
  // Tracker are in …").
  Object.keys(CONTROLS).forEach(n => {
    if (n.indexOf(" ") !== -1 && text.indexOf(n) !== -1) names.add(n);
  });
  return [...names].map(n => n.replace(/^The /, "")).filter(n => !KEYS.has(n));
}

describe("Creator copy names real controls", () => {
  const copy = tourCopy().concat(coachCopy(), toastCopy());

  test("the copy was found", () => {
    expect(copy.filter(c => c.where.indexOf("tour") === 0).length).toBeGreaterThanOrEqual(8);
    expect(copy.filter(c => c.where === "coach mark").length).toBeGreaterThanOrEqual(2);
    expect(copy.filter(c => c.where.indexOf("toast") === 0).length).toBeGreaterThanOrEqual(20);
  });

  test("every control in the table is rendered under that label", () => {
    const cache = {};
    Object.keys(CONTROLS).forEach(name => {
      CONTROLS[name].forEach(([file, label]) => {
        cache[file] = cache[file] || literals(read(file));
        if (!cache[file].has(label)) throw new Error(name + ": no \"" + label + "\" label in " + file);
      });
    });
  });

  test("every tab, button and menu the copy names is a known control", () => {
    const unknown = [];
    copy.forEach(c => namesIn(c.text).forEach(n => {
      if (!CONTROLS[n]) unknown.push(c.where + ": \"" + n + "\" in \"" + c.text.slice(0, 120) + "\"");
    }));
    expect(unknown).toEqual([]);
  });

  test("the scratch tour does not send people to Convert or a picture", () => {
    tourCopy().filter(c => c.where === "tour scratch").forEach(c => {
      expect(namesIn(c.text)).not.toContain("Convert");
      expect(namesIn(c.text)).not.toContain("Generate");
      // A tracing picture is part of drawing; anything else isn't.
      expect(c.text.replace(/tracing picture/g, "")).not.toMatch(/\b(picture|photo|image)\b/i);
    });
  });
});
