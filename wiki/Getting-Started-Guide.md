# Getting Started Guide

Welcome to StitchX! This guide walks you through opening the app for the first time and understanding how everything fits together.

## Opening the App

### First Launch

1. **Go to the Home Screen** — Open `home.html` in your browser, or navigate to your deployment URL.
2. **No sign-in required** — StitchX stores everything locally in your browser's IndexedDB. No account, no login.

> **Tip:** Bookmark the page or use your browser's "Add to home screen" option (iOS/Android) for quick access.

### Desktop vs. Mobile

The app automatically adapts to your screen size:

- **Desktop/Tablet:** Full-featured interface with all menus and options visible
- **Mobile Phone:** Touch-friendly layout with collapsible menus and optimised buttons

## Understanding the Home Screen

The Home Screen is your dashboard and project hub. It has four main tabs:

### 1. Projects Tab

Shows all your stitching projects.

**Active Project Card**
- Displays your current project (if any)
- Shows progress percentage (% complete)
- Shows when you last worked on it ("Last edited 2 days ago")
- Quick action buttons: **Track** (go to Stitch Tracker) and **Edit** (go to Pattern Creator)

**Full Project List**
- All your saved projects in a table or card view
- Sort by name, date created, or progress
- **Track** — Open a project in the Stitch Tracker to mark stitches
- **Edit** — Open a project in the Pattern Creator to change the pattern
- **Delete** — Remove a project (you'll be asked to confirm)
- **Bulk Delete** — Select multiple projects and delete at once (checkbox on left)

### 2. Create New Tab

Start a brand-new project.

**From an Image**
1. Click **Create from image**
2. Upload a JPG or PNG file
3. Follow the Pattern Creator workflow (see **Pattern Creator Tutorial** below)

**Blank Canvas**
1. Click **Blank canvas**
2. Enter pattern dimensions (width × height)
3. Choose a starting colour
4. Start editing in the Pattern Creator

### 3. Stash Tab

Quick overview of your thread inventory.

- **Owned Threads** — How many unique DMC and Anchor threads you own
- **To-Buy List** — Threads you've marked as to-buy
- **Stash Value** — Total cost of owned threads (if you've set prices)
- **Link to Manager** — Click to open the Stash Manager for full inventory control

> **What is the Stash?** Your collection of physical thread skeins that you track in the app. The Stash Manager lets you mark what you own, which affects pattern recommendations in the Creator.

### 4. Stats Tab

View your stitching activity and insights.

- **Total Projects** — How many projects you've created
- **Total Stitches** — Combined stitch count across all projects
- **Stitching Time** — How much time you've spent tracking progress in the Stitch Tracker
- **Session Breakdown** — Charts showing your activity over time
- **Thread Usage** — Which threads you use most

## Creating Your First Project

### Quick Path: Image to Pattern (5 minutes)

1. Go to **Home Screen** → **Create New** tab
2. Click **Create from image**
3. **Upload** a JPG or PNG (landscapes, portraits, simple graphics work best)
4. **Choose colour count** (start with 10–15 colours for beginners)
5. **Click Generate** and wait 10–30 seconds
6. **Preview** the result in the low-resolution preview pane
7. If you like it, click **Finalise pattern**
8. Your project is automatically saved

### Refining Your Pattern

Once generated, you're in the Pattern Creator where you can:

- **Paint individual stitches** — Click to change colours
- **Fill regions** — Use the flood-fill tool (bucket icon)
- **Add backstitches** — Draw outlines and details
- **Place half-stitches** — Add quarter, half, or three-quarter stitches
- **Swap colours** — Replace one thread with another across the entire pattern
- **Export** — Download as PDF, PNG, JSON, or share via URL

See **Pattern Creator Tutorial** for step-by-step details.

## Where to Find Help

### In the App

**Help Drawer** — Press `?` (or look for the help icon) to open the Help drawer:
- In-app documentation for the current tool
- Keyboard shortcuts
- Frequently asked questions
- Tips and tricks

**Preferences** — Press Ctrl+, (Ctrl+Comma) to open Preferences:
- Change theme (light/dark)
- Adjust canvas zoom and interaction settings
- View keyboard shortcut reference
- Export or restore your data

**Hover Tooltips** — Hover over any icon or button for a short description of what it does

### Keyboard Shortcuts (All Tools)

| Action | Shortcut |
|--------|----------|
| Undo | Ctrl+Z (Cmd+Z on Mac) |
| Redo | Ctrl+Y (Cmd+Shift+Z on Mac) |
| Open Help | ? |
| Open Preferences | Ctrl+, (Ctrl+Comma) |
| Search / Command Palette | Ctrl+K |

### Online Resources

- **GitHub Issues** — Report bugs or suggest features: [github.com/Kate-nc/cross-stitch/issues](https://github.com/Kate-nc/cross-stitch/issues)
- **Wiki Home** — Full documentation and advanced topics
- **Community Discussions** — Ask questions and share patterns

## Understanding Data Storage

### Where Does My Data Go?

Your data is stored **locally on your device** using IndexedDB (the browser's built-in database). Nothing is uploaded to a server.

This means:
- Your data is private — only you can access it
- The app works fully offline after the initial load
- No login or account is required
- Saves are instant with no network delays

### What If I Close the Browser?

Your projects are saved automatically. When you reopen the app, all your projects will still be there.

**Exception:** If you use **incognito/private browsing mode**, your data is deleted when you close the window. Use regular browsing for permanent storage.

### Backing Up Your Data

Your data only exists on your device by default. To protect against data loss:

1. Open **Preferences** (`Ctrl+,`)
2. Click the **Sync, backup & data** category in the left sidebar
3. Click **Download backup** — this saves a single compressed file containing all your projects, stash, and settings
4. Store the file somewhere safe (external drive, cloud storage, email to yourself, etc.)

**To restore:** Open Preferences → **Sync, backup & data** → **Restore from a backup file**, then select your backup file.

See **[Backup & Restore](Backup-Restore.md)** for full details.

## Using Across Multiple Devices

StitchX supports two sync methods:

### Method 1: Automatic Folder Sync (Recommended)

Works with cloud storage folders (Dropbox, Google Drive, OneDrive, iCloud).

1. **Connect on Device A:**
   - Go to Preferences → **Sync, backup & data** → **Sync folder**
   - Click **Choose folder** and select a cloud storage folder (e.g., ~/Dropbox/cross-stitch-sync)
   - Give permission when the browser asks
   - Label the device (e.g., "Laptop")

2. **Connect on Device B:**
   - Go to Preferences → **Sync folder** → **Choose folder**
   - Select the **same cloud folder** from Device A
   - Label this device (e.g., "iPad")

3. **Automatic Sync:**
   - When you make changes on Device A, they're automatically exported to the shared folder every 30 seconds
   - Device B automatically detects and imports changes from the shared folder
   - Projects appear on both devices with progress merged (you can stitch on one device, track on another)

> **Note:** Requires the File System Access API (Chrome/Edge 86+). Firefox and Safari don't support folder watching yet.

### Method 2: Manual File Transfer

For older browsers or offline transfers:

1. **Export from Device A:** Go to Preferences → **Backup & data** → **Download sync file** → Saves a `.csync` file
2. **Transfer:** Send the file via email, cloud drive, USB, or any method you prefer
3. **Import on Device B:** Go to Preferences → **Backup & data** → **Import sync file** → Select the file

Your projects will now appear on Device B. See **Cross-Device Sync** for advanced workflows and conflict resolution.

## Common First Questions

### Q: Can I import a pattern I found online?

**A:** Yes. The Stitch Tracker (and the home-screen importer) can load:
- `.oxs` files (KG-Chart / Pattern Keeper format)
- `.json` StitchX project files
- Image files (`.png`, `.jpg`) — converted to a cross-stitch pattern
- PDF pattern files (experimental)

Use the import button in the Stitch Tracker toolbar.

### Q: Can I export my pattern to print?

**A:** Yes. The Pattern Creator has several export options:
- **PDF Chart** — Multi-page Pattern Keeper–compatible chart, ready to print
- **PNG Image** — Full-resolution raster image
- **ZIP Bundle** — All formats (PDF, PNG, OXS, JSON) in one archive

See **[Export Formats Explained](Export-Formats.md)** for details.

### Q: Does this work on my phone?

**A:** Yes. StitchX is responsive and works on iPhones, Android phones, and tablets. The layout adjusts for smaller screens and all core features are accessible on mobile.

### Q: Can I undo my mistakes?

**A:** Yes — full undo/redo history in both the Creator and Tracker:
- **Undo** — Ctrl+Z (Cmd+Z on Mac)
- **Redo** — Ctrl+Y (Cmd+Shift+Z on Mac)

### Q: What if I delete a project by accident?

**A:** There is no recycle bin. If you deleted a project and do not have a backup, it cannot be recovered. This is why regular backups are important — use **Preferences** → **Sync, backup & data** → **Download backup** to export a full snapshot before doing bulk deletions.

## Next Steps

Now that you understand the basics, choose your next guide:

- **[Pattern Creator Tutorial](Pattern-Creator-Tutorial.md)** — Learn to generate and edit patterns from images
- **[Stitch Tracker Guide](Stitch-Tracker-Guide.md)** — Start tracking your stitching progress
- **[Stash Manager Guide](Stash-Manager-Guide.md)** — Set up your thread inventory

---

**Last Updated:** May 2026  
**Questions?** Press `?` in the app for in-app help, or visit [GitHub Issues](https://github.com/Kate-nc/cross-stitch/issues).

