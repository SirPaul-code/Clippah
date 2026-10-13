# Clippah 0.6.1

**Clip where you watch. Finish in a lightweight local editor.**

Clippah is a Chromium extension + local Studio for clipping browser video, assembling several clips on a normal timeline, reframing to social formats, editing audio/video properties, adding text/captions and exporting locally.

## Install

1. Download the GitHub Actions artifact **Clippah-v0.6.1** (not the `-full` artifact). Extract the downloaded ZIP into a permanent writable folder such as `Documents\\Clippah`. Its files include `manifest.json` directly: no additional ZIP extraction or source repository is needed.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the Clippah folder that contains `manifest.json`.
6. Pin the Clippah extension.
7. Refresh an already-open video tab once.

No npm/build step is required for the browser extension itself.

## Update blocked by Chrome / Windows security policy

If Settings → In-app updates shows **"Aborted due to security policy"**,
Chrome refused to write or finalize a file in the unpacked extension folder.
This is not an ordinary permission retry and is not proof of a malware infection.

- In Clippah 0.6.1+, Settings identifies the **specific file and write phase**.
  Previous source files are checked against their original bytes after rollback.
- Check **Windows Security → Virus & threat protection → Protection history**
  to see whether Microsoft Defender has detected or quarantined a file.
- **Never disable Defender, Chrome Safe Browsing, or a company policy** as an update workaround.
- If updates remain blocked, use the **Clippah-v0.6.1** extension-only artifact
  from [GitHub Actions](https://github.com/SirPaul-code/Clippah/actions/workflows/validate-package.yml?query=branch%3Amain).
  Extract into the **existing** Load unpacked folder and reload from `chrome://extensions`.
  Don't uninstall the extension: local captures can be deleted with its storage.
- An external update helper or Chrome Web Store distribution would be needed
  to avoid writing extension source through this restricted File System Access
  code path; an AV policy can still block untrusted files.

## Updating without downloading ZIPs again

1. Keep the existing Clippah extension installed. **Do not click Remove** (local clips and projects may be lost).
2. Open **Clippah Settings -> In-app updates**.
3. Click **Choose extension folder** once and select the **same exact directory** you used under Chrome `Load unpacked` (the one containing `manifest.json`). Grant read/write access.
4. On a later release click **Check for updates -> Install update**. The updater retrieves exact files from a pinned GitHub commit, validates their Git blob checksums, overwrites only runtime files and reloads the installed extension automatically.
5. If Chrome asks for write permission again after a browser restart, allow it in the app. Updates are user-initiated; Chrome does not support silently updating an unpacked extension without a user-granted folder handle.

The in-app updater downloads files individually (not a potentially flagged full source ZIP), does not download executables or scripts and rolls back files if the update fails. Close Studio before installing updates. Only the extension's source files are modified; extension storage and captured clips stay in Chrome. If the folder was moved, choose its new location again.


## Filmstrip timeline and keyframing

- Timeline is resizable with its own zoom slider and Fit; ruler supports click-and-drag scrubbing.
- Press Space to pause. Move the camera, scroll to zoom under the cursor and adjust it freely.
- When you press Space again, your pending change is committed as **one** keyframe and playback resumes. Press K if you want to commit manually instead. Settings let you remap the shortcut.
- Use the **M1 Camera** track to select, drag in time, and inspect each keyframe visually. The inspector also offers exact time and zoom controls.
- Recorded source clips remain locally stored in Chrome. Preview/editing thumbnails are small WebP strings attached to camera keyframes in the local project.

## Recording overlay ON/OFF

Clippah no longer overlays every video automatically. Click the Clippah toolbar icon for the current tab: **ON** shows Record/Studio on that tab; click again for **OFF**, which hides it. The rest of your tabs remain unaffected.

## Licensing

Free mode exports with an embedded Clippah watermark. Pro mode is prepared with server-verified keys, but cannot be activated until a private HTTPS license server and its database have been deployed and configured. See `license-server/README.md`. This is not tamper-proof DRM because browser extension JavaScript is user-editable.

## Important YouTube step — one click per tab

YouTube currently uses Chrome's `tabCapture` compatibility provider. Chrome requires an explicit extension invocation before a tab may be captured.

For each newly opened YouTube tab:

1. Click the purple **Clippah C** toolbar icon once, **or** press `Ctrl+Shift+K` (`Cmd+Shift+K` on macOS).
2. The Clippah extension icon displays **ON**.
3. Done. Use **Start clip / Finish clip** as many times as you want in that tab. You do **not** click the toolbar icon for every clip.

The in-player Clippah dock now shows this tutorial when capture is not enabled and the toolbar badge shows **1** until the one-time action is completed.

## Browser clip workflow

- Start clip: button or `[`
- Finish clip: button or `]`
- Cancel: `Esc`
- Studio: opens the local editor

Captured video stays in browser-local storage.

If Studio is already open when a new recording finishes, its Library refreshes automatically.

## Studio 0.4 — lightweight NLE

### Library

- local clip library
- folders
- multi-select organization
- drag clips directly from Library onto **V1**
- fallback Add clip picker
- picker modal closes correctly with **X**, backdrop click or `Esc`

### Timeline

Studio now uses a real segment timeline instead of a simple list of clip IDs.

Tracks:

- **V1** — video segments
- **A1** — audio waveform
- **T** — text layers
- **CC** — captions

You can:

- drag a Library clip onto V1
- drag timeline segments to reorder
- use the **Cut** tool and click a segment to split it
- split at the playhead
- delete with the **Delete/Backspace** key
- use the segment **×**
- right-click a segment for Split / Duplicate / Delete
- concatenate many clips into one sequence

### Clip properties

Per timeline segment:

- playback speed: 0.25×–3×
- volume
- video fade in/out
- audio fade in/out

A1 shows a generated waveform from the locally stored clip audio.

### Motion / social reframing

- 16:9 / 9:16 / 1:1
- Crop / Blur / Mirror / Fit
- drag the canvas to reframe
- mouse wheel zoom
- automatic keyframes
- manual keyframes
- clear all motion

Motion lives on each timeline segment.

### Text

- text overlays on the T track
- drag text directly on the preview
- start/end timing
- fade in/out
- font size/color
- common system font list
- **Load PC fonts** uses Chrome Local Font Access (`queryLocalFonts()`) when the browser permits it

### Captions

Free/local baseline:

- capture captions already shown by supported players/YouTube while recording
- import SRT/VTT
- burn captions into preview/export
- export SRT

Fully automatic local Whisper/WebGPU transcription remains a separate next step so Clippah does not require a paid transcription API.

### Export

The current renderer:

- plays the full Studio timeline
- applies speed
- renders fades
- applies motion/reframe
- renders text and captions
- renders audio fades/volume
- exports locally as WebM

MP4 is still planned.

## Agent / MCP

Clippah includes a localhost MCP bridge.

A vision-capable agent can now operate the same editing model as a human:

- inspect exact rendered frames
- sample frames at exact times
- read timeline/segment geometry
- insert/reorder/select/split/delete segments
- set speed, volume and video/audio fades
- set aspect/fill
- move viewport by output pixels
- set exact viewport/zoom
- add motion keyframes
- add/update/delete text
- get/replace captions
- export the sequence

### Windows setup without npm knowledge

Double-click:

```text
mcp\setup.cmd
```

Then paste the generated token into **Clippah Settings → Agent Bridge**.

The MCP command for an agent is:

```text
mcp\clippah-mcp.cmd
```

That launcher bootstraps missing npm dependencies itself.

See [mcp/README.md](mcp/README.md).

## Local-first data model

- captured clip blobs: IndexedDB
- Library folders: IndexedDB
- Studio project/edit state: extension local storage
- media processing/export: browser
- MCP bridge: `127.0.0.1` only, pairing-token protected

## Known limitations

- YouTube needs the one explicit toolbar/shortcut invocation per tab because Chrome requires user invocation for `tabCapture`.
- current export is WebM
- installed-font enumeration depends on Local Font Access support/permission
- automatic local Whisper transcription is not in 0.4 yet
- direct/background source acquisition is still planned
- DRM/protected playback is intentionally unsupported

## Version

**0.5.0**


## Studio 0.5 additions

- explicit **Static / Animate** viewport editing mode, so normal zoom/reframe does not accidentally create motion
- direct draggable fade handles on the beginning/end of V1 and A1 segments
- Explorer-style hierarchical Library with nested folders, drag-to-folder and right-click actions
- generic overlay objects: **text, emoji and image/sticker**
- independent transform keyframes for every overlay object
- overlay scale / rotation / opacity / z-order
- MCP parity for viewport mode, overlay objects and Library folders
