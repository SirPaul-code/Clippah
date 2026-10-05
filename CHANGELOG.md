# Changelog

## 0.2.0 — 2026-10-06

### Capture
- Replaced hidden-canvas compatibility recording with raw tab MediaRecorder.
- Moved player crop from background recording into Studio.
- Added direct media-element capture where both video and audio tracks are exposed.
- Added best-effort cursor suppression for compatibility capture.
- Kept one compatibility capture session alive across multiple clips in the same tab.
- Added wall-clock recorded duration metadata and WebM duration fallback handling.

### In-player UX
- Replaced ARM / MARK ONLY terminology with state-driven creator UX.
- New compact floating dock.
- Start clip / Finish clip primary action.
- Recording elapsed time.
- Keyboard start/finish/cancel.
- One-time per-tab capture explanation.

### Studio
- New library + canvas + compact timeline + inspector layout.
- 16:9 / 9:16 / 1:1.
- Crop / Blur / Mirror / Fit.
- Drag reframe and wheel zoom.
- Auto keyframes.
- Automatic neutral baseline when first motion edit happens later than time 0.
- Keyframe diamonds on timeline.
- Persistent per-clip edit state.

### Agent foundation
- Added Settings page for loopback agent bridge.
- Added optional local MCP server with pairing token.
- Added status/play/pause/seek/clip/marker/list/open-Studio tools.

### Compatibility
- Development minimum raised to Chromium 148 for structured-clone extension messaging.
