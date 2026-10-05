# Clippah architecture

## Capture providers

Clippah treats timeline selection, acquisition and editing as separate systems.

### Timeline
The page content script reads the actual media clock: video.currentTime. No wall-clock approximation is used for IN/OUT timestamps.

### Direct media provider
On compatible pages, HTMLMediaElement.captureStream() can expose clean video + audio tracks. Clippah records those tracks locally and sends MediaRecorder chunks to extension storage.

### Browser compatibility provider
For hosts where direct audio is unreliable, currently YouTube/Twitch, Clippah uses Chrome tabCapture.

The action/shortcut enables one tab-capture MediaStream for the tab. Individual clips start/stop MediaRecorder on that existing stream.

Unlike 0.1, the compatibility stream is NOT repainted through an offscreen canvas. It is recorded directly, eliminating hidden-render-loop throttling as a source of frozen frames.

## Storage

Extension-origin IndexedDB database clippah, schema v2:
- clips: finished blobs + metadata
- chunks: temporary structured-clone direct-capture chunks
- sessions: temporary direct-capture session metadata

Marker ranges and edit projects use chrome.storage.local.

## Studio crop

At clip start the content script stores player bounding rect and viewport dimensions. Studio maps that normalized rectangle onto the recorded tab frame and uses it as the source region.

## Motion

Viewport transform is time + normalized x/y + zoom. Studio smoothstep-interpolates neighboring points.

With Auto keyframe enabled, pointer-up or zoom upserts a keyframe at the current playhead. If it is the first edit and the playhead is not at the beginning, Studio also seeds a neutral point at time 0.

## MCP bridge

MCP host <-> stdio <-> local Node MCP server <-> token-authenticated loopback WebSocket <-> Clippah service worker <-> active content script.

The bridge exposes commands, not video bytes. The extension remains execution authority.
