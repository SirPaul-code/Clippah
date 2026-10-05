# Clippah

Clip the moment where you are already watching it. Reframe it in seconds.

Current development version: **0.2.0**

## What changed in 0.2

The first MVP proved the workflow, but its compatibility recorder repainted a captured tab into a hidden canvas. Chromium can throttle hidden rendering, which caused the "audio plays but video is frozen on the first frame" failure.

0.2 removes that architecture:
- browser fallback capture records the raw tab MediaStream
- player cropping happens later in Studio
- the Clippah dock is positioned outside the player where possible
- cursor hiding is requested from Chromium when supported
- no more ARMED / MARK ONLY jargon
- Start clip / Finish clip is the normal workflow
- one-time capture permission stays active for that tab
- Studio is redesigned around a canvas, compact timeline and one inspector
- drag/zoom can create keyframes automatically
- optional MCP bridge foundation is included

Old clips captured by 0.1 stay old. Make a NEW clip after updating to test the new capture path.

## Install without Git

1. Open this repository on GitHub.
2. Code -> Download ZIP.
3. Extract the ZIP.
4. Open chrome://extensions.
5. Enable Developer mode.
6. Click Load unpacked.
7. Select the extracted folder that directly contains manifest.json.
8. Pin Clippah.
9. Open/refresh a YouTube watch page.

Full guide: docs/INSTALL.md

## First YouTube test

Chrome requires an explicit extension invocation before an extension may use tabCapture. Because YouTube is routed through the reliable tab-audio compatibility path, there is one unavoidable setup gesture per tab:
- press Ctrl+Shift+K (Cmd+Shift+K on macOS), or
- click the Clippah toolbar icon once.

After that, do not touch the toolbar for each clip.

Use the floating dock:
- Start clip
- let the moment play
- Finish clip
- Studio

Keyboard:
- [ Start clip
- ] Finish clip
- Esc Cancel

## Studio

Studio supports:
- 16:9 / 9:16 / 1:1
- Crop / Blur / Mirror / Fit
- direct drag-to-reframe
- wheel zoom
- Auto keyframe
- smooth interpolation
- keyframe diamonds on the timeline
- local WebM export
- local source download

The first motion edit away from time 0 automatically seeds the neutral starting frame, so a single later drag already creates visible motion from the starting composition.

## Capture architecture

video page -> direct media capture when clean video+audio are exposed
           -> raw tabCapture compatibility stream on YouTube/Twitch
           -> local IndexedDB -> Studio -> crop/aspect/motion -> export

DRM/protected media is intentionally unsupported.

## Optional MCP / agent bridge

The experimental local MCP bridge lives in mcp/.

Current tools can inspect status, play/pause/seek, start/finish/cancel a clip, read markers, list local clip metadata, and open Studio.

The WebSocket bridge binds to 127.0.0.1 and requires a random pairing token. Video bytes are not exposed through MCP.

## Product and UX plans

- docs/PRODUCT-PLAN.md
- docs/UX-DESIGN.md
- docs/ARCHITECTURE.md
- docs/TROUBLESHOOTING.md

## Current limitations

- Chromium 148+ for the 0.2 development build.
- YouTube reliable audio capture still needs Chrome's one-time user invocation per tab.
- Cursor suppression on tab compatibility capture is best-effort.
- Player geometry is captured at clip start; resizing/theater/fullscreen during a clip can shift crop.
- WebM export today; MP4 is on the roadmap.
- captions, POI tracking and billing are not implemented yet.
- v0.2 still needs real-browser QA across multiple sites.
