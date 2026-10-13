# Changelog

## 0.6.0 — 2026-10-13

- Larger video timeline with horizontal zoom, Fit button, easier time-zero access and a draggable ruler/scrubbing.
- Dedicated M1 Camera animation track, visual keyframe thumbnails, zoom curve and individually draggable keyframes.
- Exact numeric keyframe time and zoom edit, previous/next navigation and removal of the selected keyframe.
- Camera changes are staged as a draft, not keyframed on each drag/scroll. Space commits the draft before playing; configurable K manually commits. Zoom is anchored near the mouse pointer.
- Floating recording panel no longer appears automatically on video pages. It appears only after the user enables Clippah capture with the extension icon for that tab; fully stops when switched OFF.
- Free previews and WebM exports include the canvas-rendered Clippah watermark; server-verified Pro removes it. Local JS can always be modified by end users, so this is an honest license gate rather than tamper-proof DRM.
- Postgres-based license API scaffolding (activation, 2-seat limit, verify, revoke, manual issuance) prepared, but not deployed. Pro activation remains unconfigured until HTTPS backend and payment processing are set up.
- Runtime-only update package includes all new files, compatible with the in-app updater introduced in 0.5.3.

## 0.5.3 — 2026-10-13

- One-time manual installation followed by user-initiated in-app updates.
- Folder link using Chrome File System Access API and IndexedDB-persisted directory handle.
- Fetch updates from immutable GitHub commit SHA, SHA-1 Git blob integrity check, then staged file writes and rollback on error.
- Restore previous content if write or verification fails; reload the same extension ID without uninstalling or losing stored clips.
- Extension-only package is canonical; excludes MCP scripts and other repository scaffolding.


## 0.5.2 — 2026-10-13

- Manual K camera keyframes: preview zoom and position first, then commit explicitly.
- Video time synchronization on pause, awaited seeking, and protection from stale playback requests.
- Remappable Studio keyboard shortcuts in Settings.
- Check for updates from GitHub main; safe manual upgrade instructions for unpacked extensions.
- Continued export progress, save picker, cancel and error handling improvements from 0.5.1.


## 0.5.0 — 2026-10-06

- explicit Static / Animate viewport editing
- fixed viewport edits so normal zoom/reframe can be static instead of accidental keyframes
- draggable video fade handles directly on V1
- draggable audio fade handles directly on A1
- nested Explorer-style Library folders
- drag clips into folders and folders into folders
- right-click Library actions and Move To workflow
- text / emoji / image overlay objects
- per-overlay transform keyframes
- overlay scale / rotation / opacity / z-order
- expanded MCP tools for overlays, viewport mode and Library folders

## 0.4.0 — 2026-10-06

### Studio
- Replaced the simple sequence strip with a multi-track editing timeline.
- Fixed the Add clip modal hidden-state/X issue.
- Added Library → V1 drag and drop and segment reordering.
- Added Cut tool, split-at-playhead, Delete/Backspace and right-click Split/Duplicate/Delete.
- Added A1 waveform rendering.
- Added per-segment speed, volume, video fades and audio fades.
- Added timed text layers, text drag positioning and Local Font Access integration.
- Added T and CC tracks.
- Kept per-segment social reframe/motion keyframes.
- Added sequence export with speed, fades, motion, text, captions and audio.
- Studio Library now refreshes when both direct and tab-captured clips finish.

### Capture UX
- Added explicit one-click YouTube/tabCapture onboarding.
- Toolbar badge shows 1 when capture permission is needed and ON when ready.
- The one toolbar click is required once per tab, not per clip.

### MCP
- Added timeline insert/reorder/select/split/delete tools.
- Added speed/volume/fade editing.
- Added fill controls.
- Added text and captions tools.
- Added sequence export.
- Added zero-command MCP launchers for Windows and Unix.

## 0.3.0 — 2026-10-06

### Studio

- Larger, more readable creator UI.
- Context hints/tooltips across the editing controls.
- Sequence builder with + controls before, after and between clips.
- Sequence playback and local sequence export.
- Automatic Library refresh when a new clip finishes recording.
- Clip folders, multi-select organization and Move to folder / New folder.
- Clear all motion remains explicit and visible.

### Captions

- Captures visible/source subtitles during clipping when available.
- Stores caption cues on the clip.
- SRT/VTT import.
- Caption burn-in preview/export.
- SRT export.

### MCP / agent

- Exact rendered frame retrieval as MCP image content.
- Up to six sampled frames per call.
- Studio status/geometry.
- Pixel viewport movement.
- Exact normalized viewport/zoom controls.
- Agent keyframe controls.
- Aspect ratio controls.
- Append clip to sequence.
- One-click Windows MCP setup scripts.

## 0.2.0

- Fixed frozen-frame capture architecture by recording the tab MediaStream directly.
- New minimal player dock and Studio UI.
- Auto keyframe behavior.
- Mirror background.
- Initial MCP bridge.

## 0.1.0

- Initial working capture/editor prototype.
