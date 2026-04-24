// tests/c7ImportWizardState.test.js — useImportWizard hook state machine.
//
// Verifies step transitions, draft persistence to localStorage, reset clears
// draft, and commit returns the correct settings shape compatible with the
// existing parseImagePattern() call site in tracker-app.js.

const fs = require("fs");
const path = require("path");

function makeStorage() {
  const store = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
    _raw: store
  };
}

function loadHook() {
  const stateCells = [];
  let cellIdx = 0;
  const React = {
    useState: function (init) {
      const i = cellIdx++;
      if (stateCells.length <= i) stateCells.push(typeof init === "function" ? init() : init);
      return [stateCells[i], function (v) {
        stateCells[i] = typeof v === "function" ? v(stateCells[i]) : v;
      }];
    },
    useMemo: function (f) { return f(); },
    useRef: function (v) { const i = cellIdx++; if (stateCells.length <= i) stateCells.push({ current: v }); return stateCells[i]; },
    useCallback: function (f) { return f; },
    useEffect: function () {}
  };
  const storage = makeStorage();
  const win = { React: React };
  global.window = win;
  global.React = React;
  global.localStorage = storage;
  global.Date = Date;
  const src = fs.readFileSync(path.join(__dirname, "..", "creator", "useImportWizard.js"), "utf8");
  new Function("window", src)(win);
  return {
    win: win, storage: storage,
    reset: function () { cellIdx = 0; stateCells.length = 0; }
  };
}

describe("useImportWizard hook", () => {
  test("starts on step 1 with sensible defaults", () => {
    const { win, reset } = loadHook(); reset();
    const wiz = win.useImportWizard({ image: { width: 320, height: 240 }, baseName: "rose" });
    expect(wiz.step).toBe(1);
    expect(wiz.STEPS).toBe(5);
    expect(wiz.size.fabricCt).toBe(14);
    expect(wiz.palette.mode).toBe("dmc");
    expect(wiz.palette.maxColours).toBe(30);
    expect(wiz.name).toBe("rose");
  });

  test("auto-fits longest side to 80 stitches preserving aspect", () => {
    const { win, reset } = loadHook(); reset();
    const wiz = win.useImportWizard({ image: { width: 400, height: 200 } });
    // Longest side -> 80, other side scaled.
    expect(wiz.size.w).toBe(80);
    expect(wiz.size.h).toBe(40);
  });

  test("next/back/goto clamp to [1, STEPS] and persist via draft", () => {
    const { win, storage, reset } = loadHook(); reset();
    const w1 = win.useImportWizard({ image: { width: 100, height: 100 } });
    expect(w1.step).toBe(1);
    w1.next();
    // Draft reflects the new step even though closure-captured w1.step does not.
    expect(JSON.parse(storage.getItem("cs_import_wizard_draft")).step).toBe(2);

    // Fresh mount picks up the persisted step.
    reset();
    const w2 = win.useImportWizard({ image: { width: 100, height: 100 } });
    expect(w2.step).toBe(2);
    w2.back();
    expect(JSON.parse(storage.getItem("cs_import_wizard_draft")).step).toBe(1);

    // back from step 1 stays at 1 (lower clamp).
    reset();
    const w3 = win.useImportWizard({ image: { width: 100, height: 100 } });
    w3.back();
    expect(JSON.parse(storage.getItem("cs_import_wizard_draft")).step).toBe(1);

    // goto(99) clamps to STEPS.
    w3.goto(99);
    expect(JSON.parse(storage.getItem("cs_import_wizard_draft")).step).toBe(5);

    // goto(-5) clamps to 1.
    reset();
    const w4 = win.useImportWizard({ image: { width: 100, height: 100 } });
    w4.goto(-5);
    expect(JSON.parse(storage.getItem("cs_import_wizard_draft")).step).toBe(1);
  });

  test("persists draft to localStorage on action; resumes on next mount", () => {
    const { win, storage, reset } = loadHook(); reset();
    const wiz = win.useImportWizard({ image: { width: 200, height: 200 }, baseName: "x" });
    wiz.setName("Hello world");
    wiz.next();
    const raw = storage.getItem("cs_import_wizard_draft");
    expect(raw).not.toBeNull();
    const obj = JSON.parse(raw);
    expect(obj.name).toBe("Hello world");
    expect(obj.step).toBe(2);

    // Fresh mount should pick up the draft (same image + baseName).
    reset();
    const resumed = win.useImportWizard({ image: { width: 200, height: 200 }, baseName: "x" });
    expect(resumed.step).toBe(2);
    expect(resumed.name).toBe("Hello world");
  });

  test("reset() clears draft and returns to defaults", () => {
    const { win, storage, reset } = loadHook(); reset();
    const wiz = win.useImportWizard({ image: { width: 200, height: 200 }, baseName: "p" });
    wiz.next(); wiz.next();
    wiz.setName("Edited");
    wiz.reset();
    expect(storage.getItem("cs_import_wizard_draft")).toBeNull();
    reset();
    const fresh = win.useImportWizard({ image: { width: 200, height: 200 }, baseName: "p" });
    expect(fresh.step).toBe(1);
    expect(fresh.name).toBe("p");
  });

  test("commit() clears draft and returns shape compatible with parseImagePattern", () => {
    const { win, storage, reset } = loadHook(); reset();
    const wiz = win.useImportWizard({ image: { width: 100, height: 100 }, baseName: "Pattern" });
    wiz.setSize({ w: 64, h: 48, lock: true, fabricCt: 16 });
    wiz.setPalette({ mode: "dmc", maxColours: 25, allowBlends: true });
    wiz.setSettings({ dither: true, contrast: 0, saliency: false, skipBg: true, bgThreshold: 20 });
    wiz.setName("My Project");
    const out = wiz.commit();
    expect(out).toMatchObject({
      name: "My Project",
      maxWidth: 64, maxHeight: 48,
      maxColours: 25,
      skipWhiteBg: true,
      bgThreshold: 20,
      fabricCt: 16
    });
    expect(out.crop).toBeDefined();
    expect(out.palette).toBeDefined();
    expect(out.settings).toBeDefined();
    expect(storage.getItem("cs_import_wizard_draft")).toBeNull();
  });

  test("name is trimmed and capped at 60 chars on commit", () => {
    const { win, reset } = loadHook(); reset();
    const wiz = win.useImportWizard({ image: { width: 64, height: 64 } });
    wiz.setName("   " + "x".repeat(80) + "   ");
    const out = wiz.commit();
    expect(out.name.length).toBe(60);
    expect(out.name[0]).toBe("x");
  });

  test("expired draft (>7 days) is ignored", () => {
    const { win, storage, reset } = loadHook(); reset();
    const old = { v: 1, ts: Date.now() - (8 * 24 * 60 * 60 * 1000), step: 4, name: "stale" };
    storage.setItem("cs_import_wizard_draft", JSON.stringify(old));
    const wiz = win.useImportWizard({ image: { width: 100, height: 100 }, baseName: "fresh" });
    expect(wiz.step).toBe(1);
    expect(wiz.name).toBe("fresh");
    expect(storage.getItem("cs_import_wizard_draft")).toBeNull();
  });

  test("draft for a different image is discarded (bug-hunt D2)", () => {
    // First mount: image A 320x240, advance to step 3 with custom name.
    const { win, storage, reset } = loadHook(); reset();
    const wA = win.useImportWizard({ image: { width: 320, height: 240 }, baseName: "rose" });
    wA.setName("Rose v1");
    wA.next(); wA.next();
    const draft = JSON.parse(storage.getItem("cs_import_wizard_draft"));
    expect(draft.imageW).toBe(320);
    expect(draft.imageH).toBe(240);
    expect(draft.baseName).toBe("rose");
    expect(draft.step).toBe(3);

    // Second mount: image B (different dimensions). Draft must be ignored
    // and the wizard must auto-fit to image B's defaults, not image A's.
    reset();
    const wB = win.useImportWizard({ image: { width: 800, height: 400 }, baseName: "tulip" });
    expect(wB.step).toBe(1);
    expect(wB.name).toBe("tulip");
    expect(wB.size.w).toBe(80);   // 800 -> 80
    expect(wB.size.h).toBe(40);   // 400 -> 40
    expect(storage.getItem("cs_import_wizard_draft")).toBeNull();
  });

  test("draft for the same image (after reload) is honoured", () => {
    // First mount: write a draft.
    const { win, storage, reset } = loadHook(); reset();
    const w1 = win.useImportWizard({ image: { width: 300, height: 200 }, baseName: "cat" });
    w1.setName("Cat session");
    w1.next();

    // Same image+name on second mount -> draft restored.
    reset();
    const w2 = win.useImportWizard({ image: { width: 300, height: 200 }, baseName: "cat" });
    expect(w2.step).toBe(2);
    expect(w2.name).toBe("Cat session");
    expect(storage.getItem("cs_import_wizard_draft")).not.toBeNull();
  });
});
