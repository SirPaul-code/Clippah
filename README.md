# Clippah 0.5

**Clip where you watch. Finish in a lightweight local editor.**

Clippah is a Chromium extension + local Studio for clipping browser video, assembling several clips on a normal timeline, reframing to social formats, editing audio/video properties, adding text/captions and exporting locally.

## Install

1. Download this repository as ZIP and extract it.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the Clippah folder that contains `manifest.json`.
6. Pin the Clippah extension.
7. Refresh an already-open video tab once.

No npm/build step is required for the browser extension itself.

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
