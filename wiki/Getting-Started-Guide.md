# Getting Started Guide

Welcome to stitchx! This guide walks you through opening the app for the first time and how everything fits together.

## Opening the App

1. **Open Home** — go to `home.html` (or your deployment's address).
2. **No sign-in** — stitchx keeps everything in your browser's own storage on this device. No account, no login.

> **Tip:** Install the app for quicker access — the install icon in the address bar on Chrome or Edge, or Share > Add to Home Screen on iPhone and iPad. On iPhone and iPad, installing also stops Safari clearing your patterns after a week without a visit.

The layout adapts to your screen: full sidebars on a desktop, and touch-sized controls with bottom sheets on phones and tablets.

## The Home Page

Home is your project hub. It has four tabs.

### Projects

- **Active project** — the project you worked on most recently, with its progress and when you last edited it.
- **All projects** — every other project, each with **Track** (open in the Stitch Tracker), **Edit** (open in the Pattern Creator) and **Export** actions.

To delete projects, use the **Pattern Library** in the Stash Manager.

### Create new

- **New from pattern file** — start from an image (JPG, PNG and so on), or open a saved `.json` project, an `.oxs` file or a PDF chart.
- **New from scratch** — start with a blank grid and draw your own design.

### Stash

A summary of your threads: how many you own, patterns you could start with what you have ("Ready to start"), and your shopping list. **Open Stash Manager** takes you to the full inventory.

### Stats

Lifetime stitches, recent activity and your oldest work in progress. The full **Stats** page is in the top bar.

## Creating Your First Pattern

1. Go to **Home > Create new** and choose **New from pattern file**.
2. Pick an image. Simple graphics and photos with clear subjects work best.
3. The Pattern Creator opens with the image. Use the sidebar's **Image**, **Dimensions** and **Palette** tabs to set the size in stitches, the fabric count and the number of colours (10–20 is a good start). The preview updates as you go.
4. Generate the pattern.
5. The **Tools** and **View** tabs unlock so you can edit stitches by hand.

Your project saves itself as you work — there is no Save button to remember.

### Refining your pattern

- **Paint and fill** — pick a colour in the **Palette** tab, then use Paint (`P`) or Fill (`F`).
- **Part stitches and backstitch** — quarter, half and three-quarter stitches, and backstitch lines, from the tool strip.
- **Replace a colour** — right-click a stitch and choose Replace this colour, or press `R`.
- **Clean up** — Confetti Cleanup, Cleanup mode and Denoise mode remove stray stitches.
- **Export** — **Materials & Output > Export** produces a PDF chart, PNG, `.oxs` file or a `.zip` bundle.

See the **[Pattern Creator Tutorial](Pattern-Creator-Tutorial.md)** for details.

## Where to Find Help

### In the app

- **Help** — press `?` or use the **Help** button in the top bar. Help topics for every tool, a searchable shortcuts list, and Getting Started guides that replay each page's walkthrough.
- **Command palette** — `Ctrl+K` (`Cmd+K` on Mac) to search for any action.
- **Preferences** — **File > Preferences**: theme, defaults for each tool, PDF export, accessibility, sync and backup.
- **Tooltips** — hover over any button for a short description.

### Keyboard shortcuts (all tools)

| Action | Shortcut |
|--------|----------|
| Undo | Ctrl+Z (Cmd+Z on Mac) |
| Redo | Ctrl+Y or Ctrl+Shift+Z |
| Help and shortcuts | ? |
| Command palette | Ctrl+K |
| Download project as .json | Ctrl+S |

### Online

- **GitHub Issues** — report bugs or suggest features: [github.com/Kate-nc/cross-stitch/issues](https://github.com/Kate-nc/cross-stitch/issues)

## Your Data

### Where does it go?

Your data is stored **only on your device**, in the browser's built-in database. Nothing is uploaded. The app works offline after the first visit.

### What if I close the browser?

Your projects are still there when you come back. **Exceptions:** private / incognito windows delete everything when closed, and clearing your browser's site data deletes it too. The top of the **File** menu shows whether the browser has marked your storage **Protected** or **Temporary**.

### Backing up

1. **File > Export Backup** (or **File > Preferences > Sync, backup & data > Download backup**) saves one file with all your projects, your stash and your settings.
2. Keep it somewhere safe — an external drive or your cloud storage.

**To restore:** **File > Restore from Backup…**, or **Preferences > Sync, backup & data > Choose file…**. Restoring replaces what is on this device.

## Using Several Devices

### Automatic folder sync (desktop Chrome and Edge)

Uses a folder that your cloud drive already syncs (Dropbox, Google Drive, OneDrive, iCloud Drive…).

1. On each device, open **File > Preferences > Sync, backup & data**, press **Choose folder…** and pick the **same** cloud folder. Allow access when the browser asks.
2. Turn on **auto-sync**.
3. A couple of seconds after you save, the app writes a `.csync` file to the folder (at most every 30 seconds). While the app is open and visible on another device, it checks the folder every 10 seconds and brings the changes in.

The cloud icon in the top bar shows the sync status. If both devices changed the same project, a review screen lets you choose what to keep.

### Sync by file (any browser, including iPhone and iPad)

1. On the first device: **File > Export Sync (.csync)** (on iPhone and iPad, **Share sync file** in the cloud menu).
2. Move the file to the other device — save it to your cloud drive, email it, or use a USB stick.
3. On the other device: **File > Import Sync (.csync)…** (or **Import file** in the cloud menu) and choose the file.

See **[Cross-Device Sync](Cross-Device-Sync.md)** for encryption, pairing codes and conflict handling.

## Common Questions

### Can I import a pattern I found online?

Yes. **Home > Create new > New from pattern file** (or **File > Open…**) reads:
- `.oxs` files (KG-Chart / Pattern Keeper / Open X-Stitch)
- `.json` stitchx project files
- images — converted into a pattern
- PDF charts — including charts printed over several pages, scanned charts and booklets with several designs. A review screen lets you check pages and threads before saving.

### Can I print my pattern?

Yes. **Materials & Output > Export** in the Pattern Creator makes a multi-page PDF chart (Pattern Keeper-compatible by default), a PNG, an `.oxs` file or a `.zip` bundle of everything. See [EXPORT_QUICKSTART.md](../EXPORT_QUICKSTART.md).

### Does it work on my phone?

Yes — phones, tablets and desktops. The Stitch Tracker is designed for touch: one finger marks stitches, two fingers pan and zoom.

### Can I undo mistakes?

Yes — full undo / redo in both the Creator and the Tracker, including parking markers in the Tracker.

### What if I delete a project by accident?

Press **Undo** on the message that appears straight after deleting. After it disappears, there is no recycle bin — the project can only come back from a backup. Download a backup before deleting several projects at once.

## Next Steps

- **[Pattern Creator Tutorial](Pattern-Creator-Tutorial.md)** — make and edit patterns
- **[Stitch Tracker Guide](Stitch-Tracker-Guide.md)** — track your stitching
- **[Cross-Device Sync](Cross-Device-Sync.md)** — use more than one device

---

**Last Updated:** October 2026
**Questions?** Press `?` in the app, or visit [GitHub Issues](https://github.com/Kate-nc/cross-stitch/issues).
