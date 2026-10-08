# Cross-Device Sync Guide

Keep your projects in step across devices — design on a laptop, stitch on a tablet. Sync needs no account: it travels through a folder your cloud drive already syncs, or through files you move yourself.

## Overview

| Method | How it works | Where it works |
|--------|--------------|----------------|
| **Folder sync** | The app writes and reads `.csync` files in a cloud-synced folder automatically | Desktop Chrome and Edge (and other Chromium browsers with folder access) |
| **Sync by file** | You export a `.csync` file and import it on the other device | Every browser, including iPhone and iPad |

## Method 1: Folder Sync

### Set up

1. **Pick a cloud folder** that your cloud app keeps in sync, for example `Dropbox/cross-stitch-sync`, `OneDrive/cross-stitch-sync` or a Google Drive or iCloud Drive folder. It must be synced by the cloud app, not copied by hand.
2. On the first device, open **File > Preferences > Sync, backup & data**.
3. Under **Sync folder**, press **Choose folder…**, select the folder and allow access when the browser asks.
4. Optionally give the device a name in **This device's name** (for example "Laptop") so you can tell devices apart in sync summaries.
5. Make sure **Auto-sync stitch progress** is on (it turns on when you choose a folder, unless you turned it off before).
6. Repeat on the other device, choosing the **same** folder.

### Pairing codes

**Pair another device > Show pairing code…** on one device and **Join existing sync > Enter pairing code…** on the other gives both devices matching names and settings. The code carries no patterns, stash or passwords.

### How it works

- **Sending:** a couple of seconds after you save, the app writes this device's `.csync` file to the folder — at most once every 30 seconds. Each device has one file, named after the device, which it overwrites each time; files don't pile up.
- **Receiving:** while the app is open and its tab is visible, it checks the folder every 10 seconds (and straight away when you come back to the tab). New projects and progress from other devices are brought in automatically.
- **Conflicts:** if the same pattern was changed differently on both devices, the cloud icon shows a red dot and a review screen lets you choose **Keep mine** or **Use synced** for each project.

The **cloud icon** in the top bar shows the status at a glance; click it for details and actions such as **Review sync**.

### What gets synced

Set in **Preferences > Sync, backup & data > What to sync**:

| Item | Default |
|------|---------|
| **Patterns and tracking progress** | Always — stitches, part stitches, sessions, parking markers, work areas |
| **Thread stash** | On — owned skeins and shopping list |
| **Custom palettes** | On — saved colour groups from the Creator |
| **Source photos** | Off — the original images are by far the largest part of a sync file |
| **Preferences** | Not synced — theme, units and so on stay on each device |

Which project is open, zoom and view settings also stay on each device.

### Encryption

**Encrypt sync files** wraps every sync file in AES-GCM-256 with a passphrase you choose, so your cloud provider can't read your patterns or stash. Every device needs the passphrase; forgetting it means the encrypted files can't be read. Backups are not affected.

### Disconnecting

**Preferences > Sync, backup & data > Sync folder** has a disconnect option. Your projects stay on the device; syncing just stops.

---

## Method 2: Sync by File

Works in any browser, and is the way to sync on iPhone and iPad, whose browsers cannot watch a folder.

### Export

- **Desktop:** **File > Export Sync (.csync)** downloads a `.csync` file.
- **iPhone / iPad:** **Share sync file** in the cloud icon's menu opens the share sheet — save it straight into OneDrive, Dropbox or Files.

### Move the file

Save it to your cloud drive, email it to yourself, AirDrop it or copy it on a USB stick.

### Import

- **Desktop:** **File > Import Sync (.csync)…** and choose the file.
- **iPhone / iPad:** **Import file** in the cloud icon's menu.

Projects and progress are merged in the same way as folder sync, with a review screen for conflicts. If the file is encrypted you'll be asked for the passphrase.

### iPad with a desktop computer

The smoothest set-up: put the sync folder inside OneDrive (or another cloud drive) on the computer and use folder sync there. On the iPad, use **Share sync file** to save into that same folder, and **Import file** to pick up the computer's file. **Preferences > Sync, backup & data** shows these steps on an iPad.

---

## Troubleshooting

### "No sync folder connected"

Open **Preferences > Sync, backup & data**, press **Choose folder…** and allow access.

### Changes aren't arriving on the other device

1. The app only checks the folder while its tab is visible — bring it to the front.
2. Check that auto-sync is on (the cloud popover says if it's off).
3. Browsers can drop folder access after a restart. If the popover asks you to reconnect, do so.
4. Both devices must use the same folder in the same cloud drive.
5. Check that your cloud app has finished syncing the file.
6. A red dot on the cloud means a review is waiting — click the icon and choose **Review sync**.

Still stuck? Use **File > Export Sync (.csync)** and **Import Sync** to move the changes by hand.

### "Permission denied" when choosing a folder

Make sure the folder exists and isn't a system or read-only folder. On a Mac, folders such as Desktop can have extra restrictions — try a folder inside your cloud drive.

---

## Best Practices

- **Finish on one device before switching.** Edits to the same pattern on two devices at once are what cause conflicts; progress marked on both is merged without asking.
- **Name your devices** so sync summaries and conflicts are easy to read.
- **Keep backups too.** Sync copies mistakes as faithfully as everything else. Use **File > Export Backup** now and then, and store the file away from the sync folder.

---

## FAQ

### Does sync work on my phone?

Yes, by file: export and import `.csync` files (Method 2). Android Chrome may also support folder sync where the browser offers folder access.

### What if the sync folder is deleted or inaccessible?

Your projects are safe on each device. Reconnect to the folder once it's back, or choose a new one on every device.

### How big is a sync file?

Usually tens to hundreds of kilobytes. Turning on **Source photos** makes it much larger.

### Can I move the sync folder?

Choose the new folder on every device. The old folder's files can be deleted.

---

**Last Updated:** October 2026
**See also:** [Getting Started Guide](Getting-Started-Guide.md), [Stitch Tracker Guide](Stitch-Tracker-Guide.md)
