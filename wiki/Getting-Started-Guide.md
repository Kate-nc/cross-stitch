# Getting Started Guide

Welcome to StitchX! This guide will walk you through opening the app for the first time and understanding how it works.

## Opening the App

### First Launch

1. **Go to the Home Screen** — Open `home.html` in your web browser (or navigate to your deployment URL)
2. **Grant Storage Permission** — The browser may ask to allow storage. Click **Allow** to enable data saving
3. **First-Time Tour** — You'll see a welcome screen with an overview of the three main tools

> **Tip:** Bookmark this page or add it to your home screen (iOS/Android) for quick access next time.

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

**This means:**
- ✓ Your data is private — only you can access it
- ✓ Works fully offline (after initial load)
- ✓ Faster than cloud-based apps (no network delays)
- ✓ No login or account required

### What If I Close the Browser?

Your projects are saved automatically. When you reopen the app, all your projects will still be there.

**Exception:** If you use **incognito/private browsing mode**, your data is deleted when you close the window. Use regular browsing for permanent storage.

### Backing Up Your Data

Your data only exists on this device. To protect against data loss:

1. Go to **Home Screen** → **Projects** tab
2. Look for the **Backup** option (gear icon or menu)
3. Click **Export all data** → Downloads a `.csbackup` file to your computer
4. Save this file in a safe location (cloud drive, external hard drive, etc.)

> **Restore later:** Go to Preferences, find **Restore from backup**, and select your `.csbackup` file.

See **Backup & Restore** for detailed instructions.

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

**A:** Yes! The Stitch Tracker can import:
- `.oxs` files (KG-Chart / Pattern Keeper format)
- `.json` project files from StitchX
- Image files (`.png`, `.jpg`) — converted to patterns
- PDF files — pattern extraction (experimental)

Go to **Stitch Tracker** → Import tab to get started.

### Q: Can I export my pattern to print?

**A:** Yes! The Pattern Creator has multiple export options:
- **PDF Chart** — Multi-page Pattern Keeper–compatible chart, ready to print
- **PNG Image** — Full-resolution screenshot or A4 layout
- **ZIP Bundle** — All formats (PDF, PNG, OXS, JSON) in one archive

See **Export Formats Explained** for details.

### Q: Does this work on my phone?

**A:** Yes! StitchX is fully responsive and works on:
- iPhones and Android phones
- Tablets (iPad, Android tablets)
- Desktops and laptops

The interface adjusts for smaller screens, and all features work on mobile.

### Q: Can I undo my mistakes?

**A:** Yes! Full undo/redo history in both the Creator and Tracker:
- **Undo** — Ctrl+Z (Cmd+Z on Mac)
- **Redo** — Ctrl+Y (Cmd+Shift+Z on Mac)
- Works across stitches, edits, colour changes, and more

### Q: What if I delete a project by accident?

**A:** If you deleted it very recently, you might recover it:
1. Go to Home Screen → Projects tab
2. Look for a "Recently deleted" or "Trash" section (if available)
3. If not there, you'll need to restore from a backup (see above)

> **Prevent future accidents:** Always keep a regular backup of important projects.

## Next Steps

Now that you understand the basics, choose your next guide:

- **[Pattern Creator Tutorial](Pattern-Creator-Tutorial.md)** — Learn to generate and edit patterns from images
- **[Stitch Tracker Guide](Stitch-Tracker-Guide.md)** — Start tracking your stitching progress
- **[Stash Manager Guide](Stash-Manager-Guide.md)** — Set up your thread inventory

---

**Last Updated:** May 2026  
**Questions?** Press `?` in the app for in-app help, or visit [GitHub Issues](https://github.com/Kate-nc/cross-stitch/issues).

