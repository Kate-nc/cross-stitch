// help-content.js — Centralised Help Centre content + tabbed renderer.
//
// Exposes window.HelpCentre — a tabbed React component used by SharedModals.Help
// across all three pages (Creator, Tracker, Manager). Topics are grouped by
// task area so users can find answers without scrolling through one long page.
//
// Each topic is a plain-data object so it stays easy to edit without touching
// JSX. Future contributions: add new topics by appending to HELP_TOPICS.

(function () {
  if (typeof window === "undefined" || typeof React === "undefined") return;
  var h = React.createElement;

  // ─── Topic data ──────────────────────────────────────────────────────────
  // Each topic: { id, label, icon, sections: [{ heading, body, bullets }] }.
  var HELP_TOPICS = [
    {
      id: "creator",
      label: "Pattern Creator",
      icon: "🎨",
      sections: [
        {
          heading: "Generating a pattern from an image",
          body: "Convert any image into a cross-stitch pattern. Adjust dimensions, palette size, and apply filters to get the perfect design.",
          bullets: [
            ["Palette Control", "Limit the maximum number of colours to keep the project manageable."],
            ["Minimum stitches per colour", "Drops colours that are only used a few times — useful for tidying up speckled areas."],
            ["Remove background colour", "Pick a colour from your image to treat as empty fabric. Click ‘Pick’ then click on the image."]
          ]
        },
        {
          heading: "Editing the generated pattern",
          body: "Once generated, you can manually edit the pattern:",
          bullets: [
            ["Paint & Fill", "Select a colour from the palette below the canvas, then use the Paint or Fill tools to modify individual stitches or areas."],
            ["Backstitch", "Draw lines between grid corners. Use the 'Erase Line' tool to remove them."],
            ["Half-stitches", "Toggle the half-stitch overlay to mark partial coverage."]
          ]
        },
        {
          heading: "Tools & shortcuts (Creator)",
          bullets: [
            ["Hand (H)", "Pan the canvas without painting."],
            ["Magic Wand (W)", "Select a colour region by clicking; refine with the side panel."],
            ["Lasso (L)", "Draw a freeform selection."],
            ["Undo / Redo (Ctrl+Z / Ctrl+Y)", "Step through your edit history."]
          ]
        }
      ]
    },
    {
      id: "tracker",
      label: "Stitch Tracker",
      icon: "✓",
      sections: [
        {
          heading: "Tracking progress",
          body: "Load a saved project to track your stitching progress interactively.",
          bullets: [
            ["Track Mode", "Click or drag across the pattern to mark stitches as complete. Use the timer to estimate your completion date."],
            ["Navigate Mode", "Place a guide crosshair on the canvas. If you select a colour, you can click to place parking markers."],
            ["Colours Drawer", "Open the drawer at the bottom to see your progress per colour. Click a colour to highlight only those stitches on the canvas."]
          ]
        },
        {
          heading: "Sessions & timer",
          bullets: [
            ["Start/Stop", "The timer auto-pauses after 5 minutes of inactivity."],
            ["Sessions", "Each timer run is logged with start/end times and stitch deltas, used by the Stats page."]
          ]
        }
      ]
    },
    {
      id: "manager",
      label: "Stash Manager",
      icon: "🧵",
      sections: [
        {
          heading: "Thread stash",
          body: "Track which DMC and Anchor threads you own, what's running low, and where each one came from.",
          bullets: [
            ["Bulk Add", "Paste a list of thread IDs to mark them owned in one go."],
            ["Brand toggle", "Switch between DMC and Anchor (or both) — composite keys keep duplicates apart."]
          ]
        },
        {
          heading: "Pattern Library",
          body: "Auto-synced from any project you save in the Creator/Tracker, plus any pattern you add manually here.",
          bullets: [
            ["Shopping list", "Tick patterns to compute the threads you'd need to buy."],
            ["Coverage", "Each card shows how many of its required threads you already own."],
            ["Stash Manager only", "Patterns added here without a linked project are flagged so you don't expect Tracker progress."]
          ]
        }
      ]
    },
    {
      id: "saving",
      label: "Saving & Backup",
      icon: "💾",
      sections: [
        {
          heading: "Project files",
          bullets: [
            ["Save Project (.json)", "The recommended way to save. Keeps your generated pattern, edits, and tracking progress in one file. Loadable in either Creator or Tracker."],
            ["Export PDF", "Generates a printable multi-page chart with a thread legend."],
            ["Open in Stitch Tracker (Link)", "Creates a sharable URL that opens the pattern directly in the Tracker without needing a file (only works for smaller patterns)."]
          ]
        },
        {
          heading: "Full-app backup",
          body: "Use File → Download all data to export every project, your stash, and your settings as a .csbackup file. Restore with File → Restore from backup. Backups are encrypted with the local app key only — share intentionally.",
          bullets: [
            ["Folder sync (optional)", "Choose a folder once and the app writes incremental updates there so you can sync via Dropbox/iCloud/OneDrive."],
            ["Auto-export", "Toggle in the File menu to write to your sync folder after each save."]
          ]
        }
      ]
    },
    {
      id: "shortcuts",
      label: "Keyboard",
      icon: "⌨",
      sections: [
        {
          heading: "Global",
          bullets: [
            ["Esc", "Close the topmost modal/menu/popover (without leaving any underlying modals)."],
            ["?", "Open this Help Centre from any page (when focus is not in a text field)."]
          ]
        },
        {
          heading: "Creator canvas",
          bullets: [
            ["P", "Paint tool"],
            ["F", "Fill tool"],
            ["L", "Lasso"],
            ["W", "Magic Wand"],
            ["H", "Hand (pan)"],
            ["Ctrl/Cmd + Z", "Undo"],
            ["Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y", "Redo"]
          ]
        },
        {
          heading: "Tracker canvas",
          bullets: [
            ["Click / drag", "Mark or unmark stitches."],
            ["T", "Switch to Track mode."],
            ["N", "Switch to Navigate mode (place crosshair / parking markers)."],
            ["V", "Cycle stitch view (symbol → colour → highlight)."],
            ["D", "Toggle the Colours drawer."],
            ["P", "Pause / resume the live session timer."],
            ["Space (hold)", "Hold to temporarily pan the canvas."],
            ["+/-", "Zoom in/out."],
            ["0", "Fit pattern to view."]
          ]
        }
      ]
    },
    {
      id: "glossary",
      label: "Glossary",
      icon: "📖",
      sections: [
        {
          heading: "Core concepts",
          bullets: [
            ["Project", "An end-to-end stitching effort: a pattern + progress + history. What you open and stitch."],
            ["Pattern", "The chart/design itself. Lives inside a Project, or as a stand-alone entry in the Stash Manager library."],
            ["Stash", "Your physical thread collection (DMC + Anchor). Tracked in the Stash Manager."],
            ["Skein", "One physical bundle of thread (315 inches by default)."],
            ["Active project", "The single project currently open in the Tracker (autosaves apply to this slot)."]
          ]
        },
        {
          heading: "Save vs. Download vs. Export",
          bullets: [
            ["Save", "Write to the app's internal storage (no file appears). Used for autosave and pattern edits."],
            ["Download", "Write a file to your device (e.g. backup, JSON project)."],
            ["Export", "Generate a share-ready artefact (PDF chart, OXS)."],
            ["Open / Import", "Read from a file or URL into the app."],
            ["Sync (folder)", "Optional incremental writes to a chosen folder for cross-device sync."]
          ]
        },
        {
          heading: "Surface names",
          bullets: [
            ["Pattern Creator", "The page where you generate and edit a pattern from an image."],
            ["Stitch Tracker", "The page where you mark stitches done and log time."],
            ["Stash Manager", "The page where you track threads and the pattern library."]
          ]
        },
        {
          heading: "Naming conventions",
          body: "British spellings throughout (colour, organiser, favourite). Brand names always capitalised: DMC, Anchor.",
          bullets: [
            ["Use \"Stash\"", "Not \"Inventory\"."], // terminology-lint-allow
            ["Use \"Project\" vs. \"Pattern\"", "Project = the whole thing you stitch. Pattern = the chart only."],
            ["Use \"Download\" for files", "And \"Save\" for in-app autosave."]
          ]
        }
      ]
    }
  ];

  // ─── Renderer ────────────────────────────────────────────────────────────
  function HelpCentre(props) {
    var defaultTab = props.defaultTab || "creator";
    var _tab = React.useState(defaultTab);
    var tab = _tab[0], setTab = _tab[1];
    var _query = React.useState("");
    var query = _query[0], setQuery = _query[1];

    var topics = HELP_TOPICS;
    var current = topics.find(function (t) { return t.id === tab; }) || topics[0];

    // Determine which page we're on for the "Show welcome tour again" button.
    // Falls back to defaultTab so each app gets its own welcome regardless of
    // which tab the user is reading.
    var welcomePage = props.welcomePage || defaultTab;
    var canShowWelcome = !!(window.WelcomeWizard && window.WelcomeWizard.STEPS && window.WelcomeWizard.STEPS[welcomePage]);
    function handleReplayWelcome() {
      if (!canShowWelcome) return;
      try { window.WelcomeWizard.reset(welcomePage); } catch (_) {}
      // Fire a CustomEvent so the page-level app can re-mount its WelcomeWizard.
      try { window.dispatchEvent(new CustomEvent("cs:showWelcome", { detail: { page: welcomePage } })); } catch (_) {}
      if (typeof props.onClose === "function") props.onClose();
    }

    // Search filter — when the user types, ignore tabs and surface a flat
    // list of matching sections across all topics.
    var q = (query || "").trim().toLowerCase();
    var searchHits = null;
    if (q.length >= 2) {
      searchHits = [];
      topics.forEach(function (t) {
        t.sections.forEach(function (s) {
          var matches = false;
          if (s.heading && s.heading.toLowerCase().indexOf(q) !== -1) matches = true;
          if (s.body && s.body.toLowerCase().indexOf(q) !== -1) matches = true;
          if (s.bullets) {
            s.bullets.forEach(function (b) {
              if ((b[0] + " " + b[1]).toLowerCase().indexOf(q) !== -1) matches = true;
            });
          }
          if (matches) searchHits.push({ topic: t, section: s });
        });
      });
    }

    function renderSection(s) {
      return h("div", { key: s.heading, style: { marginBottom: 18 } },
        s.heading && h("h4", { style: { margin: "0 0 6px 0", color: "#1e293b", fontSize: 15 } }, s.heading),
        s.body && h("p", { style: { margin: "0 0 8px 0", color: "#475569", fontSize: 13, lineHeight: 1.55 } }, s.body),
        s.bullets && s.bullets.length > 0 && h("ul", { style: { margin: 0, paddingLeft: 20, color: "#475569", fontSize: 13, lineHeight: 1.55 } },
          s.bullets.map(function (b, i) {
            return h("li", { key: i }, h("strong", null, b[0] + ":"), " " + b[1]);
          })
        )
      );
    }

    return h("div", { className: "modal-overlay", onClick: props.onClose },
      h("div", {
        className: "modal-content",
        onClick: function (e) { e.stopPropagation(); },
        style: { maxWidth: 720, maxHeight: "85vh", display: "flex", flexDirection: "column", padding: 0 }
      },
        // Header
        h("div", { style: { padding: "16px 20px 12px", borderBottom: "1px solid #e2e8f0", flexShrink: 0 } },
          h("button", { className: "modal-close", onClick: props.onClose, "aria-label": "Close" }, "\u00d7"),
          h("h3", { style: { margin: "0 0 8px 0", fontSize: 20, color: "#1e293b" } }, "Help Centre"),
          h("input", {
            type: "search",
            value: query,
            onChange: function (e) { setQuery(e.target.value); },
            placeholder: "Search help (e.g. backup, parking, half-stitch)\u2026",
            style: { width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 6, boxSizing: "border-box" }
          })
        ),

        // Body — split: tab sidebar (left) + content (right). Falls back to a
        // single search-results column when the user is searching.
        searchHits
          ? h("div", { style: { padding: "12px 20px", overflowY: "auto", flex: 1 } },
              searchHits.length === 0
                ? h("p", { style: { color: "#94a3b8", fontSize: 13 } }, "No matches. Try a shorter query.")
                : searchHits.map(function (hit, i) {
                    return h("div", { key: i },
                      h("div", { style: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#94a3b8", marginBottom: 4 } }, hit.topic.label),
                      renderSection(hit.section)
                    );
                  })
            )
          : h("div", { style: { display: "flex", flex: 1, minHeight: 0 } },
              // Sidebar
              h("div", {
                style: {
                  width: 160, flexShrink: 0, borderRight: "1px solid #e2e8f0",
                  background: "#fafafa", padding: "8px 0", overflowY: "auto"
                }
              },
                topics.map(function (t) {
                  var on = t.id === current.id;
                  return h("button", {
                    key: t.id,
                    onClick: function () { setTab(t.id); },
                    style: {
                      display: "block", width: "100%", padding: "8px 14px",
                      textAlign: "left", border: "none",
                      background: on ? "#e0f2fe" : "transparent",
                      color: on ? "#0369a1" : "#475569",
                      fontWeight: on ? 700 : 500, fontSize: 13,
                      cursor: "pointer", fontFamily: "inherit",
                      borderLeft: on ? "3px solid #0284c7" : "3px solid transparent"
                    }
                  }, h("span", { "aria-hidden": "true", style: { marginRight: 6 } }, t.icon), t.label);
                })
              ),
              // Content
              h("div", { style: { flex: 1, padding: "16px 20px", overflowY: "auto" } },
                current.sections.map(renderSection)
              )
            ),

        // Footer with "Show welcome tour again" — only when a wizard exists
        // for the current page (Creator/Manager/Tracker).
        canShowWelcome && h("div", {
          style: {
            padding: "10px 20px", borderTop: "1px solid #e2e8f0",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "#fafafa", flexShrink: 0
          }
        },
          h("span", { style: { fontSize: 12, color: "#64748b" } }, "Need a refresher?"),
          h("div", { style: { display: "flex", gap: 8 } },
            window.OnboardingTour && h("button", {
              onClick: function () {
                try { window.OnboardingTour.reset(); } catch (_) {}
                if (typeof props.onClose === "function") props.onClose();
                // Reload so the welcome modal can re-mount on a clean slate.
                setTimeout(function () { window.location.reload(); }, 100);
              },
              style: {
                padding: "6px 12px", fontSize: 12, borderRadius: 6,
                border: "1px solid #cbd5e1", background: "#fff", color: "#475569",
                cursor: "pointer", fontWeight: 600, fontFamily: "inherit"
              }
            }, "Reset onboarding tour"),
            h("button", {
              onClick: handleReplayWelcome,
              style: {
                padding: "6px 12px", fontSize: 12, borderRadius: 6,
                border: "1px solid #99f6e4", background: "#fff", color: "#0d9488",
                cursor: "pointer", fontWeight: 600, fontFamily: "inherit"
              }
            }, "Show welcome tour again")
          )
        )
      )
    );
  }

  window.HELP_TOPICS = HELP_TOPICS;
  window.HelpCentre = HelpCentre;
})();
