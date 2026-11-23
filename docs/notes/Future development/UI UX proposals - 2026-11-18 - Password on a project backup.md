# UI/UX proposal — password on a project backup (2026-11-18)

Item S6 of [[Memory, speed, security and AI tokens - proposal - 2026-11-16]]. **Not built: it adds a field and a
prompt to the screen, so it waits for approval** (`AGENTS.md`, "Do not change UI or UX").

## Why

A project backup (`.gfde-backup`) is a zip with the project and its checkpoints in plain text. Backups are what
gets copied to a cloud folder, a USB stick or an e-mail, so they are the file most likely to be read by someone
else. Project files on this computer are not part of this proposal.

## What the user would see

1. **Checkpoints panel → Back up project**: one new optional field under the button, *Password (optional)*, with a
   *Show* tick box. Empty = a backup exactly as today.
2. With a password, the saved file is still `.gfde-backup`. Nothing else on the panel changes.
3. **Restore from backup**: when the chosen file has a password, one prompt: *This backup has a password*, a
   password field, *Restore* and *Cancel*. A wrong password says *The password is not right* and asks again.
4. No way to recover a forgotten password: the prompt says so in one line when a password is typed
   (*Keep this password: a backup cannot be opened without it*).

Black-and-white, the existing field and button styles, no new colours or icons.

## How it would work (no new dependency)

- `buildBackup(project, checkpoints, appVersion, now, password?)` in `src/model/projectBackup.ts`: the finished zip
  is encrypted with the browser's own WebCrypto — AES-256-GCM, the key from the password with PBKDF2-SHA-256 and a
  random salt. The file starts with a short plain header (format name, version, salt, counter) so the app can tell
  an encrypted backup from a plain one.
- `readBackup(bytes, password?)`: a plain backup opens as today; an encrypted one without a password returns
  "needs a password"; a wrong password is told apart from a damaged file by the GCM check.
- Backup format version 1 → 2 only for encrypted files; plain backups stay version 1, so an older app still opens
  them. An older app shown an encrypted backup says it is not a backup it can read.
- Headless: `gfde` has no backup command today, so nothing changes there.

## Tests it would come with

Round trip with and without a password; wrong password; a damaged encrypted file; a plain backup still opens; an
encrypted backup is not readable as a zip; the header never contains the password or the key.

## Decision needed

- Approve the two screen changes above (the optional field, the prompt), or say what to change.
- Minimum password length: none proposed (the user's choice), with the one-line warning above.
