# Clippah v0.1 MVP

Browser-first video clipping prototype for Chromium 116+.

## What works now

- Detects the largest visible HTML5 `<video>` on the page.
- Injects a compact Clippah control bar directly over the player.
- `[` marks **IN**, `]` marks **OUT** using the player's native `video.currentTime`.
- Marker-only mode works without capture and persists per page URL.
- Click the **Clippah toolbar icon** once to arm local tab capture.
- While armed, IN starts local capture and OUT stops it.
- Captured video is cropped to the visible player rectangle and stored locally in IndexedDB.
- **Clippah Studio** supports:
  - 16:9 / 9:16 / 1:1
  - Crop / blurred background / fit
  - drag-to-reframe
  - zoom
  - viewport keyframes
  - smooth interpolation between keyframes
  - local WebM export
- No backend and no upload.

## Why timestamps stay in sync

Clippah keeps a reference to the real HTML5 `video` element. IN and OUT read `video.currentTime` directly.

That means native seeking, pause/play and playback-rate changes all operate on the exact same media clock. The Clippah overlay is only UI; it does not run a separate timer.

## Run locally

1. Clone/download this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the repository folder.
5. Open YouTube or another page with a normal HTML5 video.
6. Pin Clippah.
7. Click the Clippah toolbar icon once to arm capture.
8. Use the injected **[ IN** and **OUT ]** buttons, or keyboard `[` / `]`.
9. Click **STUDIO** to edit captured clips.

Shortcut: `Ctrl+Shift+K` / `Cmd+Shift+K` invokes the extension action.

## MVP capture model

Timestamp marking and video acquisition are intentionally separate.

- **Timeline:** uses the source player's `video.currentTime`.
- **Current acquisition fallback:** Chrome `tabCapture`, started only after an explicit user invocation as required by Chrome.
- **Planned acquisition layer:** direct/background media acquisition for sources where it is technically and policy-safe.

The current capture is live between IN and OUT. Direct/background acquisition can later allow arbitrary seeking and marking while the media downloads independently.

## Current format

Capture and export are WebM using VP9/VP8 + Opus when supported by the browser.

MP4/H.264 export and local captions are follow-up work.

## Current limitations

- First MVP targets top-frame HTML5 video players; embedded cross-origin iframe players need a dedicated integration.
- Capture records what the browser tab renders; it is not equivalent to downloading the original source asset.
- Moving/resizing the player during an active capture can invalidate the crop rectangle for that recording.
- DRM/protected media is intentionally unsupported.
