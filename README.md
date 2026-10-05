# Clippah

**Clip video where you are already watching it.**

Clippah is a Chromium extension prototype for marking moments directly on an HTML5 video player, locally capturing them, and reframing them for social formats without first opening a separate editor.

Current version: **0.1.0 MVP**

## Install in Chrome / Edge / Brave

### Fastest way

1. Clone or download this repository.
2. Open:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the **Clippah repository folder** — the folder that contains `manifest.json`.
6. Pin **Clippah** to the browser toolbar.
7. Open a YouTube video or another page with a normal HTML5 `<video>`.
8. Click the **Clippah toolbar icon once** to arm local capture.
9. Use **[ IN** and **OUT ]** over the player, or press `[` and `]`.
10. Click **STUDIO** to edit captured clips.

Full install/update instructions: [docs/INSTALL.md](docs/INSTALL.md)

## What works now

- Detects the largest visible HTML5 `<video>`.
- Injects a Clippah control bar over the player.
- Reads timestamps directly from the player's real `video.currentTime`.
- `[` = IN, `]` = OUT.
- Persists marker-only segments per page URL.
- Local tab capture after explicit toolbar activation.
- Crops capture to the visible video player rectangle.
- Stores captured clips locally in IndexedDB.
- Clippah Studio:
  - 16:9
  - 9:16
  - 1:1
  - Crop
  - Blur background
  - Fit
  - Drag-to-reframe
  - Zoom
  - Viewport keyframes
  - Smooth keyframe interpolation
  - Local WebM export
- No backend.
- No upload.

## Why timestamps stay synchronized

Clippah does **not** run a separate timer.

When you press IN or OUT it reads:

```js
video.currentTime
```

from the actual video element being played.

So if you pause, seek, skip forward, scrub backward, or change playback speed in the native player, Clippah follows the exact same media clock.

```text
native player timeline
        |
        v
video.currentTime
        |
   +----+----+
   |         |
  IN        OUT
```

## Current capture flow

```text
Open video
    |
Click Clippah toolbar icon
    |
ARMED
    |
press [ / click IN
    |
local tab capture starts
    |
press ] / click OUT
    |
clip saved locally
    |
STUDIO
    |
reframe / keyframes / export
```

Timestamp marking and media acquisition are intentionally separate systems.

The current acquisition fallback is Chrome `tabCapture`. A later acquisition layer can use direct/background media access on sources where that is technically and policy-safe.

## Quick test

1. Load the extension unpacked.
2. Open a YouTube video.
3. Refresh the YouTube tab once after installing the extension.
4. Confirm the Clippah overlay appears.
5. Click the toolbar icon. Status should become **ARMED**.
6. Play the video.
7. Press `[`.
8. Wait 5–10 seconds.
9. Press `]`.
10. Open **STUDIO**.
11. Select **9:16**, drag the frame, add two keyframes, then export.

If something does not work, see [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Build a ZIP

No npm install or build step is required.

### Windows PowerShell

```powershell
./scripts/package.ps1
```

### macOS / Linux

```bash
./scripts/package.sh
```

The ZIP is written to `dist/`.

GitHub Actions also validates the extension and uploads a ZIP artifact on every push.

## Repository layout

```text
Clippah/
├─ manifest.json
├─ background.js
├─ content.js
├─ offscreen.html
├─ offscreen.js
├─ editor.html
├─ editor.css
├─ editor.js
├─ docs/
│  ├─ INSTALL.md
│  ├─ ARCHITECTURE.md
│  └─ TROUBLESHOOTING.md
├─ scripts/
│  ├─ package.ps1
│  └─ package.sh
├─ .github/workflows/
│  └─ validate-package.yml
├─ PRIVACY.md
├─ ROADMAP.md
└─ CHANGELOG.md
```

## Important current limitations

- Chrome/Chromium 116+.
- First MVP targets top-frame HTML5 video players.
- Cross-origin iframe players need dedicated integration.
- Current capture is **live between IN and OUT**.
- Capture records what the browser renders; it is not the same as downloading the original source asset.
- Moving/resizing the player during an active clip can invalidate the crop rectangle for that recording.
- DRM/protected media is intentionally unsupported.
- Export is currently WebM.
- MP4, captions, POI/person tracking, direct/background acquisition and billing are roadmap items.

See [ROADMAP.md](ROADMAP.md).

## Privacy

The current MVP is local-first. Captured video is stored in browser-local IndexedDB and is not uploaded anywhere by Clippah.

See [PRIVACY.md](PRIVACY.md).
