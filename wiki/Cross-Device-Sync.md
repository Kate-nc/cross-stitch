# Cross-Device Sync Guide

Sync your projects across multiple devices (phone, tablet, laptop) so you can stitch on one device and track progress on another.

## Overview

stitchx supports two sync methods:

| Method | Pros | Cons | Browser Support |
|--------|------|------|-----------------|
| **Folder Sync** | Automatic, real-time, no manual steps | Requires cloud folder, File System Access API | Chrome/Edge 86+ |
| **Manual File Transfer** | Works on any browser, offline | Manual export/import, slower | All browsers |

## Method 1: Automatic Folder Sync (Recommended)

### What It Does

When connected to a cloud folder, changes on one device automatically sync to other devices connected to the same folder.

**Example workflow:**
1. Create a pattern on your **Laptop** (exported to cloud folder)
2. Pick up your **iPad** — sees the new pattern automatically
3. Start stitching and tracking progress on **iPad**
4. Back to **Laptop** — your stitching progress is merged
5. Continue editing the pattern on **Laptop** — changes sync back to **iPad**

### Setup

#### Step 1: Choose a Cloud Folder

Pick any cloud storage folder on your device:

- **Dropbox:** `~/Dropbox/cross-stitch-sync/` (or any subfolder)
- **Google Drive:** `~/Google Drive/cross-stitch-sync/`
- **OneDrive:** `~/OneDrive/cross-stitch-sync/`
- **iCloud Drive:** `~/Library/Mobile Documents/com~apple~CloudDocs/cross-stitch-sync/` (Mac only)

> **Important:** Use a folder that's automatically synced by your cloud provider, not a folder you manually sync with USB or email.

#### Step 2: Connect Device A

1. Go to **Preferences** (Ctrl+,)
2. Click **Sync, backup & data** tab
3. In the **Sync folder** section, click **Choose folder**
4. Navigate to your cloud folder and click **Select folder**
5. The browser asks for permission — click **Allow**
6. You'll see "Connected: [folder name]"
7. In **This device's name**, enter a label (e.g., "Laptop", "iPad") — optional but helpful

> **What the app does:** The app now has permission to read and write files in this folder. It will create `.csync` files here.

#### Step 3: Connect Device B

1. Repeat Steps 1–7 on your second device
2. Select the **same cloud folder** from Step 1
3. Enter a different device name (e.g., if Device A was "Laptop", use "iPad")

**That's it!** You're now synced.

### How It Works

**Automatic Export (Device A)**
- When you save a project, the app waits 30 seconds (to batch multiple edits)
- After 30 seconds of inactivity, it exports a `.csync` file to the cloud folder
- The cloud provider syncs this file to the cloud

**Automatic Import (Device B)**
- Background folder watching is not yet available; Device B does not poll automatically
- To pick up changes from the connected folder, open the **Home Screen**, scroll to the **Sync** section, and click **Check for updates**
- The app scans the cloud folder for `.csync` files from other devices and shows a preview before merging

**If You Edit Both Devices Simultaneously**
- Edits are merged when you next import (see **Conflict Resolution** below)
- Stitching progress is combined (stitches marked on either device stay marked)
- Project names and metadata use the most recently updated version

### Controlling What Syncs

In **Preferences** → **Sync folder** section, you can toggle:

| Option | What It Does |
|--------|--------------|
| **Thread stash** | Sync your thread inventory and shopping list |
| **Custom palettes** | Sync any custom colour palettes you've created |
| **Preferences** | Sync designer name, contact info, currency, units |

Disable any of these if you want device-specific settings.

### Disconnecting

To stop syncing on a device:

1. Go to **Preferences** → **Sync folder**
2. Click **Disconnect**
3. Confirm the dialog
4. The app stops watching the folder

> **Your local projects are safe.** Disconnecting doesn't delete anything — it just stops syncing.

---

## Method 2: Manual File Transfer

For browsers without File System Access API (Firefox, Safari) or if you prefer manual control.

### Export a Sync File

1. On the **Home Screen**, scroll to the **Sync** section
2. Click **Download .csync**
3. The browser downloads a `.csync` file (compressed, typically ~100–500 KB)
4. The filename includes today’s date and your device name: `cross-stitch-sync-2026-05-06-Laptop.csync`

### Transfer the File

Use any method you prefer:
- **Email** — Send the file to yourself or another device
- **Cloud drive** — Upload to Dropbox, Google Drive, etc., then download on other device
- **USB stick** — Copy the file to a USB drive, plug into another device
- **Shared folder** — Copy to a network folder
- **Airdrop/Bluetooth** — On Apple devices

### Import on Another Device

1. On the **Home Screen**, scroll to the **Sync** section
2. Click **Import .csync**
3. Select the `.csync` file
4. The app reads the file and shows a preview:
   - Projects to import
   - Stitching progress to merge
   - Thread stash updates
5. Click **Import** to proceed

> **Merging:** If you already have a project with the same chart locally, stitching progress is combined (union of marked stitches). See **Conflict Resolution** below.

---

## What Gets Synced

### Always Synced (Both Methods)

| Item | Details |
|------|---------|
| **Projects** | Pattern grid, colours, all editing history |
| **Progress** | Which stitches are marked done, half-stitches |
| **Sessions** | Stitching timer history and time spent |
| **Parking markers** | Your marked locations in each project |
| **Metadata** | Project name, creation date, last edited |

### Optionally Synced (Toggle in Preferences)

| Item | Default |
|------|---------|
| **Thread stash** | On — thread ownership (owned/to-buy count) syncs |
| **Custom palettes** | On — your custom colour palettes sync |
| **Preferences** | Off — designer name, contact, units, currency |

### Never Synced (Device-Specific)

| Item | Why |
|------|-----|
| **Active project pointer** | Each device has its own "currently open" project |
| **UI settings** | Zoom level, canvas background, view mode (symbol/colour/highlight) |
| **Session timer state** | Only completed sessions sync (not mid-stitch timer state) |

---

## Conflict Resolution

Conflicts happen when both devices edit the same project differently and sync.

### Automatic Resolution (No Action Needed)

**Stitching progress:** Combined (union)
- Device A marked stitches 1–50 as done
- Device B marked stitches 51–100 as done
- After sync: stitches 1–100 are all marked done
- Result: ✓ Both sets of work are preserved

**Sessions/timer history:** Combined
- Device A: 3 sessions, 10 hours total
- Device B: 2 sessions, 7 hours total
- After sync: all 5 sessions appear, 17 hours total
- Result: ✓ All stitching time is counted

**Parking markers:** Combined
- Device A: marker at stitch 500
- Device B: marker at stitch 1200
- After sync: both markers appear
- Result: ✓ No conflicts (you can see both devices' positions)

### Manual Conflict Resolution (When Chart Changes Differ)

If both devices edited the **pattern itself** differently (not just tracking), a conflict card appears.

**Example:**
- Device A: Changed colour #310 to #415 in the pattern
- Device B: Changed the same area to a different colour

**Resolution options:**

1. **Keep local** — Discard the remote change, keep your device's version
2. **Keep remote** — Accept the remote change, overwrite your device's version
3. **Keep both** — Save the remote version as a separate project named "Project Name (synced)"

Choose which approach makes sense for your workflow.

---

## Troubleshooting

### "No sync folder connected"

**Problem:** You see this message when trying to sync.

**Solution:**
1. Go to **Preferences** → **Sync folder**
2. Click **Choose folder** and select your cloud drive folder
3. Grant permission when asked

### Changes aren't syncing to the other device

**Problem:** You made changes on Device A, but Device B doesn't see them.

**Checklist:**
1. ✓ Both devices are connected to the **same cloud folder** (check folder path in Preferences on both)
2. ✓ The cloud app on Device A has synced the file (check your cloud drive's app for "syncing..." status)
3. Device B has checked for updates (**Home Screen** → Sync section → **Check for updates**)
4. ✓ You haven't disabled syncing in Preferences

If still not working:
- Try disconnecting and reconnecting to the folder
- Manually export and import a sync file as a workaround

### Browser says "Permission denied" when connecting to folder

**Problem:** The browser won't let the app access the folder.

**Solution:**
1. Make sure the folder you're selecting actually exists on your device
2. On Windows: Don't select a read-only folder or a system folder
3. On Mac: Avoid folders with special permissions (Desktop sometimes has issues)
4. Try selecting the cloud drive's root folder instead of a subfolder

### Multiple `.csync` files accumulating in my cloud folder

**Problem:** Your cloud folder has tons of `.csync` files from automatic syncs.

**This is normal!** Each device writes a new file every 30 seconds after a change. Old files can be deleted safely:

1. Go to your cloud folder via Finder/Explorer
2. Look for files named `cross-stitch-sync-*.csync`
3. Delete any older than a week (keep recent ones for safety)
4. The app works fine with or without the old files

---

## Sync Scenarios

### Scenario 1: Design on Laptop, Stitch on iPad

1. **Laptop:** Create a pattern and edit it. Changes export to the cloud folder automatically.
2. **iPad:** Open the app. On the Home Screen, press **Check for updates** — the pattern appears. Switch to Stitch Tracker and start marking stitches.
3. **Laptop:** Close laptop. Go back to stitching on iPad.
4. **Laptop (later):** Reopen app. Press **Check for updates**. Your stitching progress appears. Edit the pattern more if needed.

### Scenario 2: Stitch on Two Devices

1. **Laptop:** Start a project. Track 100 stitches. Sync exports to cloud folder.
2. **iPad:** On the Home Screen, press **Check for updates**. The synced project appears. Track 50 more stitches.
3. **Laptop:** Press **Check for updates**. See 150 stitches marked (100 + 50). Continue stitching, mark 30 more.
4. **iPad:** Press **Check for updates** again. See 180 stitches marked (100 + 50 + 30).

### Scenario 3: Backup Strategy

1. **Desktop:** Main device where you create and edit patterns.
2. **Tablet:** Secondary device for stitching.
3. **Cloud folder:** Shared sync folder where both devices keep up-to-date.
4. **Monthly backup:** Export all data (Preferences → **Download backup**) and save to external drive.

This gives you:
- Real-time sync between devices (cloud folder)
- Monthly offline backup (external drive)

---

## Best Practices

### Avoid Simultaneous Edits

If possible, don't edit the same project on two devices at the exact same time. Sync works best when you:

1. Finish editing/stitching on Device A
2. Wait for sync to complete (a few seconds)
3. Switch to Device B
4. Repeat

### Name Your Devices

In Preferences → **Sync folder** → **This device's name**, give each device a clear label. This helps when viewing sync status or resolving conflicts.

### Check Sync Status

In Preferences → **Sync folder** → **Status**, you'll see:
- Last exported: "2 minutes ago"
- Last imported: "5 minutes ago"
- Connected folder: Full path

If both show recent times, you're synced!

### Regular Backups

Even with cloud sync, keep monthly backups:

1. Go to Preferences → **Backup & data**
2. Click **Download backup** (full database export)
3. Save to external drive or cloud storage
4. Store somewhere safe (separate from your active sync folder)

---

## FAQ

### Q: Does sync work on my phone?

**A:** Yes! Phones support manual file transfer (export → email/transfer → import). Automatic folder sync works on Android with appropriate apps and Chrome; iOS has limitations with File System Access API. For best results on phone, use manual file transfer or keep the phone as a secondary "import-only" device.

### Q: Can I sync to Google Drive?

**A:** Yes! Google Drive supports File System Access API on Windows and Mac. Select your Google Drive folder (~/Google Drive) in Preferences.

### Q: What if the sync folder is deleted or inaccessible?

**A:** Your local projects are safe — they stay on your device. Simply reconnect to a different folder (or the same one after you restore it). All local data is preserved.

### Q: How much storage does a `.csync` file use?

**A:** Typically 50–500 KB depending on pattern complexity. A month of syncing might use 500 KB–2 MB. Most cloud drives provide 5–100 GB free, so this is negligible.

### Q: Can I use sync with version control (Git)?

**A:** Yes, but put your sync folder *outside* your Git repo. Don't commit `.csync` files to version control — they're meant for your device-to-device transfers, not source control.

### Q: What if I want to move my sync folder to a different location?

**A:** Simply disconnect on all devices and reconnect to the new location. Old `.csync` files in the old folder become unused (safe to delete).

---

**Last Updated:** May 2026  
**See Also:** [Getting Started Guide](Getting-Started-Guide.md), [Backup & Restore](Backup-Restore.md), [Data Storage & Privacy](Data-Storage-Privacy.md)

