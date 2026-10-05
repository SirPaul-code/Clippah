# Troubleshooting

## The Clippah overlay does not appear

Check:

1. Is the extension enabled?
2. Did you refresh the video tab after installing/reloading the extension?
3. Is a visible HTML5 `<video>` actually present?
4. Is the player larger than roughly 240×120 px?
5. Is the player inside a cross-origin iframe?

The first MVP targets top-frame HTML5 video. Some embedded players need a dedicated integration.

## IN/OUT markers work, but nothing appears in Studio

You are probably in **MARK ONLY** mode.

Click the Clippah toolbar icon once.

The overlay should say:

```text
ARMED
```

Then IN begins local capture and OUT ends it.

## Clicking the toolbar icon gives an error

Try:

1. Make sure the video tab is the active tab.
2. Refresh the page.
3. Reload the extension at `chrome://extensions`.
4. Check that your browser is Chromium 116+.
5. Do not test on browser-internal pages such as `chrome://...`.

## Captured clip is black

Possible causes:

- DRM/protected playback.
- browser/GPU protected surface,
- unsupported embedded player,
- the selected player rectangle did not match the rendered media surface.

DRM/protected media is intentionally unsupported.

## Capture area is offset

The MVP maps the player rectangle at the moment IN is pressed.

If the player moves/resizes while recording — for example:

- theater mode toggled,
- fullscreen entered,
- browser window resized,
- side panel opened,

the original crop mapping can become wrong.

For now, choose the player size first, then press IN.

## I cannot hear the source tab after arming Clippah

The offscreen capture reconnects captured tab audio through an `AudioContext`.

If audio disappears:

1. check whether the tab itself is muted,
2. toggle Clippah off/on,
3. refresh the tab,
4. reload the extension.

## Studio opens but no clip is listed

Marker-only segments and captured clips are different.

Studio currently lists actual locally captured video only.

To create one:

1. arm Clippah,
2. press IN,
3. let video play,
4. press OUT.

## WebM does not open in another editor

Current exports are WebM.

Use a WebM-capable player/editor such as Chrome or VLC for testing.

MP4/H.264 export is a roadmap item.

## Keyboard [ or ] does not work

Clippah intentionally ignores shortcuts when focus is inside:

- text input,
- textarea,
- contenteditable elements.

Click outside the text field and retry.

Also verify the website itself is not intercepting the keys before the extension.

## YouTube changed videos but old markers appear/disappear

YouTube is a single-page application.

Clippah tracks the current URL and reloads marker state when the URL changes. If the page gets into a strange SPA state, refresh once.

## Reset local data

### Marker metadata

Open DevTools for the page and clear extension local storage from the extension's storage inspector.

### Captured clips

Open the Clippah Studio page's DevTools:

Application → IndexedDB → `clippah` → delete database.

A UI button for deleting all local capture data is planned.
