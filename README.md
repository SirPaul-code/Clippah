# Clippah 0.3

Browser-first video clipping and social reframing for Chromium.

Clippah is built around one idea: **clip while you are already watching**. Mark a moment in the browser, send it straight to Studio, reframe it to 9:16 / 1:1 / 16:9, animate the viewport with simple keyframes, join clips into a sequence, add captions and export locally.

## Install the extension

No build step is required for the checked-in extension files.

1. Download the repository ZIP from GitHub and extract it.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Pick the extracted Clippah folder containing `manifest.json`.
6. Pin Clippah.
7. Refresh an already-open YouTube/video tab once.

### YouTube capture permission

Chrome requires one explicit extension action before `tabCapture` may start on a tab.

For a YouTube tab, press **Ctrl+Shift+K** once (Cmd+Shift+K on macOS) or click the Clippah toolbar icon once. The tab then stays capture-ready for subsequent clips until capture access ends.

## Current workflow

1. Open a video.
2. `Start clip` / `[`.
3. `Finish clip` / `]`.
4. Studio refreshes its Library automatically.
5. Reframe by dragging the canvas and using the mouse wheel to zoom.
6. Auto keyframe creates motion points when you move/zoom at a new playhead time.
7. Use **+** before/after/between sequence clips to concatenate them.
8. Export the whole sequence locally.

## Studio 0.3

- larger, compact creator UI
- built-in help hints/tooltips
- clip folders
- multi-select + Move to folder / New folder
- dynamic Library refresh while Studio stays open
- sequence builder with large `+` insert controls
- sequence playback and sequence export
- 16:9 / 9:16 / 1:1
- Crop / Blur / Mirror / Fit
- drag-to-reframe
- zoom
- automatic or manual keyframes
- Clear all motion
- captured-source captions + SRT/VTT import
- caption burn-in and SRT export

## Captions: free path

Clippah 0.3 can collect captions already being shown by the source video/player while you record. This is language-agnostic Unicode text, so it works with whatever source caption language is selected. Studio can also import SRT/VTT and burn captions into the export.

A fully local Whisper transcription path is planned separately. Whisper itself is MIT-licensed and browser ASR through WebGPU/Transformers.js is technically viable, but it is intentionally not hidden behind a cloud bill in this build.

## Agent / MCP

The optional local MCP server allows a multimodal agent to:

- request the exact rendered Studio frame as an image,
- request several frames at exact sequence times,
- read source/output geometry,
- seek,
- set aspect ratio,
- move the viewport by pixels,
- set exact normalized viewport coordinates,
- change zoom,
- add/remove motion through keyframes,
- append clips to the sequence,
- control browser clipping.

### Windows one-click MCP setup

Open the `mcp` folder and double-click:

```text
setup.cmd
```

It installs Node.js LTS with winget if needed, installs MCP dependencies, generates a pairing token and copies it to the clipboard.

Then open **Clippah Settings -> Agent Bridge**, enable it and paste the token once.

MCP-capable agents should use:

```text
mcp\start.cmd
```

as the MCP command. The user does not need to know `npm start`.

See `mcp/README.md` for the complete tool list.

## Local-first storage

- clip video: IndexedDB
- folders: IndexedDB
- marker/edit/sequence state: Chrome extension local storage
- exports: generated in the browser
- MCP bridge: localhost only (`127.0.0.1`) with a random pairing token

No Clippah cloud backend is required for the current build.

## Known limitations

- YouTube still needs one explicit capture enable action per tab because Chrome requires a user invocation for `tabCapture`.
- current exports are WebM
- source-caption capture requires captions to actually be visible/available during the recorded section; otherwise import SRT/VTT
- direct/background source acquisition is still a separate future provider; YouTube uses browser capture compatibility mode
- DRM/protected playback is intentionally unsupported

## Version

Current extension: **0.3.0**
