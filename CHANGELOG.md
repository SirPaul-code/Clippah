# Changelog

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
