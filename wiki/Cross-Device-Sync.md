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
- **Conflicts:** different chart structures still require review. Completion edits with removal history merge automatically using the policy below; older files may show progress disagreements for review.

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

### Stitch marks and unpicking

Full stitches, each half-stitch direction, each quarter-stitch position, knots and backstitch lines merge independently. Unpicking on one device is preserved while another device adds work elsewhere. Importing the same file repeatedly does not duplicate marks or parking markers. Parking identity includes position, colour and corner, so several markers in one cell survive.

Each completion mark now carries removal history. An edit that has seen an earlier edit supersedes it. If devices mark and unpick the **same** mark without seeing each other's edits, **unpicked wins**, regardless of device order or clock settings. To mark it again, sync the devices first, then mark it. This policy applies to completion marks. New parking edits carry causal history, including clearing a list; incompatible concurrent list edits need review. Legacy parking lists remain additive.

Older files still open. A missing field or an empty legacy list has no removal history and never counts as an intentional unpick. Existing positive marks are retained unless there is a recorded removal. Update every device: older app versions do not honour this history, and unpicks performed before migration cannot be reconstructed. To recover an unpick made in an old app, import/sync the older work first, then unpick it in the updated app. Older files cannot re-mark a versioned removal; sync and re-mark in the updated app instead.

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


### Compare history

Compare snapshots travel with each project. Sync merges snapshots by ID and keeps snapshot-deletion records, so a stale device cannot restore deleted history during a tracking merge. Delete all automatic snapshots preserves manual and Before pattern change recovery snapshots. The automatic daily Compare snapshot preference is a global device preference; it is off by default and must be enabled in Preferences > Stitch Tracker.

### Thread consumption history

Include the stash to transfer consumption events, estimation assumptions and migration baselines with its inventory. Repeated imports deduplicate events. Inventory and the merged ledger commit together; imported marks alone do not mean fresh stitching on the receiving device. Update every device before using this format. Conflicting immutable histories, incompatible baselines or combined offline usage beyond recorded stock stop the stash import and require inventory reconciliation. Full backup/restore also preserves this history.

### Protocol, attachments and completion

New exports use `.csync` version 2. Update every device: older apps reject this version rather than silently discarding its semantics. Supported version-1 sync files still import; they cannot prove attachment completeness or supply missing removal history. Project JSON remains version 11; database versions do not change.

Progress photos, thumbnails and tracing pictures travel in a manifest with SHA-256 content identities. Original source pictures are explicitly included or excluded by the existing option. Missing required bytes leave the import pending. Failed integrity checks or interrupted writes report failure; retry the complete file. Nothing is fetched from a new service.

Concurrent notes, session edits, parking changes and incompatible stash baselines need explicit review. Inventory review chooses a gross stock baseline and retains the union of immutable consumption events; it never adds debits twice. A deletion does not expire merely because an offline file has a newer timestamp. Use the explicit Restore action to recover a deleted project. Deletion records are bounded without automatic eviction; reaching the limit stops the operation and requires a deliberate sync reset.

The cloud popover reports import and export states separately. Completed export means the file was handed to the existing transport, without confirming another device received it. Completed import means the required local writes and attachment checks finished. An interrupted import may have applied some projects; replay is safe.

[Merge rules, compatibility and storage boundaries](../docs/sync-protocol.md).
