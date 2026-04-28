/* apply-prefs.js — Applies global preferences to the <html> element so they
   take effect across every page. Listens for "cs:prefsChanged" and re-applies.
   Loaded after user-prefs.js on every page. */

(function () {
  "use strict";

  function get(key, fallback) {
    if (window.UserPrefs && typeof window.UserPrefs.get === "function") {
      var v = window.UserPrefs.get(key);
      return (v === undefined || v === null) ? fallback : v;
    }
    return fallback;
  }

  function applyAccessibility() {
    var root = document.documentElement;
    if (!root) return;
    var fs = String(get("a11yFontScale", "m")).toLowerCase();
    if (!/^(s|m|l|xl)$/.test(fs)) fs = "m";
    root.classList.remove("pref-font-s", "pref-font-m", "pref-font-l", "pref-font-xl");
    root.classList.add("pref-font-" + fs);

    root.classList.toggle("pref-high-contrast", !!get("a11yHighContrast", false));
    root.classList.toggle("pref-reduced-motion", !!get("a11yReducedMotion", false));

    var dark = String(get("a11yDarkMode", "system"));
    root.classList.remove("pref-dark", "pref-light");
    var resolved = dark;
    if (dark === "system") {
      try {
        resolved = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches)
          ? "dark" : "light";
      } catch (_) { resolved = "light"; }
    }
    if (resolved === "dark") {
      root.classList.add("pref-dark");
      root.setAttribute("data-theme", "dark");
    } else {
      root.classList.add("pref-light");
      root.removeAttribute("data-theme");
    }
  }

  // React to OS-level theme changes when in "system" mode.
  try {
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var onChange = function () {
        if (String(get("a11yDarkMode", "system")) === "system") applyAccessibility();
      };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  } catch (_) {}

  function applyAccent() {
    var col = get("appAccentColour", "#B85C38");
    if (typeof col === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(col)) {
      try { document.documentElement.style.setProperty("--accent", col); } catch (_) {}
    }
  }

  function apply() {
    applyAccessibility();
    applyAccent();
  }

  // Apply as soon as the script runs (before React mounts).
  apply();

  // Re-apply when any preference changes.
  try {
    window.addEventListener("cs:prefsChanged", apply);
  } catch (_) {}

  // ─── Tiny helper API exposed for other modules ─────────────────────────
  window.AppPrefs = window.AppPrefs || {};

  // Currency formatting that respects the user's preference.
  var CURRENCY_SYMBOLS = { GBP: "£", USD: "$", EUR: "€", CAD: "$", AUD: "$" };
  window.AppPrefs.formatCurrency = function (amount) {
    var cur = String(get("currency", "GBP")).toUpperCase();
    var sym = CURRENCY_SYMBOLS[cur] || "£";
    var n = (typeof amount === "number" && isFinite(amount)) ? amount : 0;
    return sym + n.toFixed(2);
  };

  // Length formatting (inches stored internally, displayed in user's unit).
  window.AppPrefs.formatLength = function (inches, opts) {
    var unit = String(get("threadLengthUnit", "in")).toLowerCase();
    opts = opts || {};
    var n = (typeof inches === "number" && isFinite(inches)) ? inches : 0;
    if (unit === "cm") {
      var cm = n * 2.54;
      return cm.toFixed(opts.decimals != null ? opts.decimals : 0) + " cm";
    }
    return n.toFixed(opts.decimals != null ? opts.decimals : 0) + " in";
  };

  // Convenience getter that falls through to the DEFAULTS map.
  window.AppPrefs.get = function (key, fallback) { return get(key, fallback); };
})();
