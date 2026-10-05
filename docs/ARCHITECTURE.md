# Clippah architecture

## Components

```text
video page
  |
  | content.js
  | - detects <video>
  | - overlay UI
  | - reads video.currentTime
  | - stores markers
  v
background.js
  |
  | - user-invoked tab capture permission boundary
  | - creates offscreen document
  | - routes start/stop messages
  v
offscreen.html + offscreen.js
  |
  | - receives tab MediaStream
  | - keeps capture alive outside page UI
  | - crops to player rectangle
  | - MediaRecorder
  | - IndexedDB
  v
editor.html + editor.js
  |
  | - reads clips from IndexedDB
  | - aspect conversion
  | - blur / fit / crop
  | - drag reframe
  | - keyframes
  | - local export
```

## Timeline model

The timestamp source of truth is the actual HTML media element:

```js
video.currentTime
```

Clippah never tries to estimate playback position using wall-clock time.

Each marker stores values such as:

```js
{
  start: 81.362,
  end: 112.905,
  duration: 31.543,
  url: "...",
  title: "...",
  createdAt: 1791234567890
}
```

This keeps markers correct when the user:

- pauses,
- seeks,
- changes playback speed,
- jumps backwards,
- uses the native player's timeline.

## Capture permission model

Chrome tab capture must originate from an explicit extension invocation.

For the MVP:

```text
toolbar click
    |
background.js
    |
chrome.tabCapture.getMediaStreamId()
    |
offscreen document
    |
navigator.mediaDevices.getUserMedia(...)
```

Chrome 116+ allows the stream ID obtained by the service worker to be consumed by an offscreen extension document.

## Why an offscreen document exists

Manifest V3 service workers do not have normal DOM/media APIs.

The offscreen document provides access to:

- `navigator.mediaDevices`
- `MediaRecorder`
- `canvas`
- `requestAnimationFrame`
- `AudioContext`
- IndexedDB

while the browser extension UI is not open.

## Crop model

At IN, `content.js` sends:

- player bounding rectangle,
- viewport dimensions,
- source video dimensions,
- current timestamp.

The offscreen capture receives the tab stream and maps the visible player rectangle into the capture stream dimensions.

Current limitation: the crop rectangle is calculated when the recording starts. If the player moves or changes size during that clip, the current MVP does not dynamically remap it.

## Local storage

Two independent storage paths exist.

### Markers

`chrome.storage.local`

Used for lightweight IN/OUT metadata.

### Captured video

IndexedDB database:

```text
database: clippah
store: clips
```

Each captured clip contains:

- Blob
- MIME type
- byte size
- capture metadata
- source page metadata
- segment timestamps

## Studio reframe model

The editor renders through a canvas.

A transform is:

```js
{
  x: 0.5,
  y: 0.5,
  zoom: 1.4
}
```

where `x` and `y` are normalized viewport focus coordinates.

A keyframe adds time:

```js
{
  time: 8.25,
  x: 0.31,
  y: 0.48,
  zoom: 1.4
}
```

Between keyframes Clippah performs smoothstep interpolation.

The user therefore does not need a traditional NLE animation graph.

## Acquisition roadmap

The architecture intentionally separates:

```text
TIMELINE / MARKERS
        |
        +-------------------+
                            |
MEDIA ACQUISITION           |
        |                   |
  +-----+------+            |
  |            |            |
tabCapture   direct-safe    |
fallback     source layer   |
  |            |            |
  +-----+------+            |
        |                   |
        v                   |
      STUDIO <--------------+
```

The future direct/background source layer should only operate where technically and policy-safe. It should not depend on DRM circumvention.
