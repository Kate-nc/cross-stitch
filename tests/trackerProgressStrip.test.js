/** @jest-environment jsdom */
// The Tracker progress strip (F-011): the presentation subtree extracted from TrackerApp into tracker-progress-strip.js.
// EXPECTED holds the markup the inline JSX in tracker-app.js produced before the extraction (rendered from that JSX at
// the base commit, icons collapsed to <svg/>), so these cases pin the DOM, text and accessible names.
const fs = require("fs");
const path = require("path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server.node");
const { createRoot } = require("react-dom/client");
const { act } = require("react-dom/test-utils");
const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

global.IS_REACT_ACT_ENVIRONMENT = true;
global.React = React;
window.React = React;
eval(read("icons.js"));
window.ProgressUnits = require("../progress-units.js");
require("../tracker-layer-chip.js");
const Strip = require("../tracker-progress-strip.js");
const PU = window.ProgressUnits;

const LiveElapsed = ({ store }) => String(store.value);
const units = (done, total, extra) => PU.progressUnits(Object.assign({ full: { done, total }, half: { done: 0, total: 0 }, knot: { done: 0, total: 0 } }, extra || {}));
const label = m => (m === "batchAware" ? "Batch" : m === "manual" ? "Manual" : "Classic");
const COUNTS = { full: 5, half: 2, backstitch: 3, french_knot: 1 };

const CASES = {
  fresh: { progress: units(0, 100), prev: 0, today: 0, bs: { done: 0, total: 0 }, lv: {}, open: false, timer: false, paused: false, mode: "classic" },
  midToday: { progress: units(37, 100), prev: 30.5, today: 6.5, bs: { done: 2, total: 9 }, lv: {}, open: true, timer: false, paused: false, mode: "batchAware" },
  pausedTimer: { progress: units(40, 60, { half: { done: 1, total: 4 } }), prev: 20, today: 0, bs: { done: 0, total: 0 }, lv: {}, open: true, timer: true, paused: true, mode: "manual" },
  hidden: { progress: units(12, 40), prev: 30, today: 0, bs: { done: 1, total: 4 }, lv: { backstitch: false, half: false }, open: false, timer: false, paused: false, mode: "classic" },
  complete: { progress: units(100, 100), prev: 0, today: 0, bs: { done: 9, total: 9 }, lv: {}, open: true, timer: false, paused: false, mode: "classic" },
  empty: { progress: units(0, 0), prev: 0, today: 0, bs: { done: 0, total: 0 }, lv: {}, open: false, timer: false, paused: false, mode: "classic" },
};

const EXPECTED = {
  fresh: "<div class=\"info-strip\"><div class=\"info-strip-bar\"></div><div class=\"info-strip-row\"><button type=\"button\" class=\"info-strip-pct info-strip-open\" aria-label=\"Open session controls\">0.0%</button><span class=\"info-strip-counts\">0 done · 100 to go</span></div></div>",
  midToday: "<div class=\"info-strip\"><div class=\"info-strip-bar\"><div class=\"info-strip-fill\" style=\"width:30.5%\"></div><div class=\"info-strip-fill info-strip-today\" style=\"width:6.5%\"></div></div><div class=\"info-strip-row\"><button type=\"button\" class=\"info-strip-pct info-strip-open\" aria-label=\"Open session controls\">37.0%</button><span class=\"info-strip-counts\">37 done · 63 to go</span><span class=\"info-strip-breakdown\" title=\"Half stitches count as half a stitch, quarters a quarter; backstitch is counted on its own, in lines\">2/9 backstitch lines</span><button type=\"button\" class=\"info-strip-timer\" title=\"Open Session controls\" aria-live=\"off\" aria-label=\"Session. Open session controls\"><span class=\"info-strip-timer-icon\" aria-hidden=\"true\"><svg/></span> <span aria-hidden=\"true\">3725 · Batch</span></button></div></div>",
  pausedTimer: "<div class=\"info-strip\"><div class=\"info-strip-bar\"><div class=\"info-strip-fill\" style=\"width:20%\"></div></div><div class=\"info-strip-row\"><button type=\"button\" class=\"info-strip-pct info-strip-open\" aria-label=\"Open session controls\">65.3%</button><span class=\"info-strip-counts\">40.5 done · 21.5 to go</span><span class=\"info-strip-breakdown\" title=\"Half stitches count as half a stitch, quarters a quarter; backstitch is counted on its own, in lines\">1 half</span><button type=\"button\" class=\"info-strip-timer\" title=\"Open Session controls\" aria-live=\"off\" aria-label=\"Timer, paused. Open session controls\"><span class=\"info-strip-timer-icon\" aria-hidden=\"true\"><svg/></span> <span aria-hidden=\"true\">3725 · Timer</span></button></div></div>",
  hidden: "<div class=\"info-strip\"><div class=\"info-strip-bar\"><div class=\"info-strip-fill\" style=\"width:30%\"></div></div><div class=\"info-strip-row\"><button type=\"button\" class=\"info-strip-pct info-strip-open\" aria-label=\"Open session controls\">30.0%</button><span class=\"info-strip-counts\">12 done · 28 to go</span><button type=\"button\" class=\"tracker-layers-chip\" title=\"Show the hidden layers (Shift+A shows or hides them all)\" aria-label=\"Half stitches and backstitch hidden. Show hidden layers\"><span class=\"tracker-layers-chip__icon\" aria-hidden=\"true\"><svg/></span><span class=\"tracker-layers-chip__text\" aria-hidden=\"true\">Half stitches and backstitch hidden</span><span class=\"tracker-layers-chip__sep\" aria-hidden=\"true\">·</span><span class=\"tracker-layers-chip__show\" aria-hidden=\"true\">Show</span></button></div></div>",
  complete: "<div class=\"info-strip\"><div class=\"info-strip-bar\"><div class=\"info-strip-fill info-strip-fill--done\" style=\"width:100%\"></div></div><div class=\"info-strip-row\"><button type=\"button\" class=\"info-strip-pct info-strip-open\" aria-label=\"Open session controls\">Complete! <svg/></button><button type=\"button\" class=\"info-strip-timer\" title=\"Open Session controls\" aria-live=\"off\" aria-label=\"Session. Open session controls\"><span class=\"info-strip-timer-icon\" aria-hidden=\"true\"><svg/></span> <span aria-hidden=\"true\">3725 · Classic</span></button></div></div>",
  empty: "<div class=\"info-strip\"><div class=\"info-strip-bar\"></div><div class=\"info-strip-row\"><button type=\"button\" class=\"info-strip-pct info-strip-open\" aria-label=\"Open session controls\">0.0%</button></div></div>",
};

function propsFor(c, over) {
  return Object.assign({
    progress: c.progress, prevBarPct: c.prev, todayBarPct: c.today, bsCounts: c.bs, layerVis: c.lv, layerCounts: COUNTS,
    onShowHiddenLayers: () => {},
    session: { open: c.open, isTimer: c.timer, paused: c.paused, timingLabel: label(c.mode), elapsedStore: { value: 3725 } },
    LiveElapsed, onOpenSession: () => {},
  }, over || {});
}

describe("TrackerProgressStrip markup", () => {
  Object.keys(CASES).forEach(name => {
    test(name + " renders the same DOM as the inline JSX did", () => {
      const html = renderToStaticMarkup(React.createElement(Strip, propsFor(CASES[name]))).replace(/<svg[\s\S]*?<\/svg>/g, "<svg/>");
      expect(html).toBe(EXPECTED[name]);
    });
  });
  test("the hidden-layers chip sits in the row only when a layer with stitches is hidden", () => {
    const hidden = renderToStaticMarkup(React.createElement(Strip, propsFor(CASES.hidden)));
    expect(hidden).toContain("tracker-layers-chip");
    expect(hidden).toContain("Half stitches and backstitch hidden. Show hidden layers");
    expect(renderToStaticMarkup(React.createElement(Strip, propsFor(CASES.fresh)))).not.toContain("tracker-layers-chip");
  });
  test("a missing chip script leaves the rest of the strip intact", () => {
    const saved = window.TrackerHiddenLayersChip;
    delete window.TrackerHiddenLayersChip;
    try {
      const html = renderToStaticMarkup(React.createElement(Strip, propsFor(CASES.hidden)));
      expect(html).toContain("info-strip-pct");
      expect(html).not.toContain("tracker-layers-chip");
    } finally { window.TrackerHiddenLayersChip = saved; }
  });
});

describe("TrackerProgressStrip behaviour", () => {
  let host, root;
  beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
  afterEach(() => { act(() => root.unmount()); host.remove(); });
  const render = el => act(() => { root.render(el); });

  test("the percentage and the timer both open the session controls, and the click still bubbles", () => {
    const open = jest.fn();
    const parentClick = jest.fn();
    render(React.createElement("div", { onClick: parentClick }, React.createElement(Strip, propsFor(CASES.midToday, { onOpenSession: open }))));
    act(() => { host.querySelector(".info-strip-pct").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    act(() => { host.querySelector(".info-strip-timer").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(open).toHaveBeenCalledTimes(2);
    expect(parentClick).toHaveBeenCalledTimes(2);
  });
  test("the chip Show button calls onShowHiddenLayers", () => {
    const show = jest.fn();
    render(React.createElement(Strip, propsFor(CASES.hidden, { onShowHiddenLayers: show })));
    act(() => { host.querySelector(".tracker-layers-chip").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(show).toHaveBeenCalledTimes(1);
  });
  test("re-rendering with new numbers updates in place: no remount, focus and the clock survive", () => {
    let mounts = 0, unmounts = 0;
    const Clock = ({ store }) => { React.useEffect(() => { mounts++; return () => { unmounts++; }; }, []); return String(store.value); };
    const store = { value: 10 };
    const a = propsFor(CASES.midToday, { LiveElapsed: Clock });
    a.session.elapsedStore = store;
    render(React.createElement(Strip, a));
    const strip = host.querySelector(".info-strip");
    const pct = host.querySelector(".info-strip-pct");
    pct.focus();
    expect(document.activeElement).toBe(pct);
    const b = propsFor(CASES.midToday, { LiveElapsed: Clock, progress: units(50, 100), todayBarPct: 9 });
    b.session.elapsedStore = store;
    render(React.createElement(Strip, b));
    expect(host.querySelector(".info-strip")).toBe(strip);
    expect(host.querySelector(".info-strip-pct")).toBe(pct);
    expect(document.activeElement).toBe(pct);
    expect(pct.textContent).toBe("50.0%");
    expect([mounts, unmounts]).toEqual([1, 0]);
  });
  test("pausing swaps the icon and the accessible name without remounting the timer button", () => {
    render(React.createElement(Strip, propsFor(CASES.midToday)));
    const btn = host.querySelector(".info-strip-timer");
    expect(btn.getAttribute("aria-label")).toBe("Session. Open session controls");
    render(React.createElement(Strip, propsFor(CASES.midToday, { session: { open: true, isTimer: false, paused: true, timingLabel: "Batch", elapsedStore: { value: 3725 } } })));
    expect(host.querySelector(".info-strip-timer")).toBe(btn);
    expect(btn.getAttribute("aria-label")).toBe("Session, paused. Open session controls");
  });
});

describe("TrackerProgressStrip loading", () => {
  const compiledAt = html => html.indexOf("loadScript(\"compiled/tracker-app.compiled.js\"") >= 0 ? html.indexOf("loadScript(\"compiled/tracker-app.compiled.js\"") : html.indexOf("loadScript('compiled/tracker-app.compiled.js'");
  ["stitch.html", "index.html", "create.html"].forEach(f => {
    test(f + " loads the strip before the compiled tracker can render it", () => {
      const html = read(f);
      const at = html.indexOf("<script src=\"tracker-progress-strip.js\"></script>");
      expect(at).toBeGreaterThan(-1);
      expect(compiledAt(html)).toBeGreaterThan(at);
    });
  });
  test("the service worker precaches it", () => {
    expect(read("sw.js")).toContain("'./tracker-progress-strip.js'");
  });
  test("TrackerApp renders the strip from the global and no longer builds it inline", () => {
    const src = read("tracker-app.js");
    expect(src).toContain("React.createElement(window.TrackerProgressStrip,");
    expect(src).not.toContain("info-strip-bar");
  });
});
