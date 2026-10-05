# Troubleshooting

## The dock does not appear
- Reload Clippah at chrome://extensions.
- Refresh the video tab.
- Confirm site access is allowed.
- Test on a normal page with a visible HTML5 video.
- Cross-origin iframe-only players still need dedicated integration.

## Start clip says capture access is needed
On YouTube/Twitch, press Ctrl+Shift+K once or click the toolbar icon once for that tab. This is the Chrome tab-capture security boundary, not a per-clip record button.

## An old clip still has a frozen image
0.1 recordings were already encoded with bad frames. Updating cannot rewrite those bytes. Create a new 0.2 clip.

## A new clip has audio but frozen video
0.2 no longer uses the old hidden canvas path. Inspect the Clippah service worker and report Chrome version, page URL, clip duration, ON badge state and console errors.

## The Clippah dock appears in the source
0.2 tries to place the dock outside the player and crops the player later in Studio. If the browser window is too tight, make it wider before recording.

## The mouse cursor is visible
Clippah requests cursor-free track constraints where Chromium exposes them, but tab-capture implementations may ignore that request. Direct media/source capture is the long-term clean path.

## 9:16 crop is offset
Browser fallback crop uses player geometry from clip start. Avoid changing theater mode, fullscreen, browser zoom or window size during that clip.

## Auto keyframe seems to create only one point
0.2 automatically creates a neutral keyframe at time 0 when the first motion edit happens later in the clip. Seek later, drag/zoom, then play from before the point.

## Studio duration shows 0 / Infinity
0.2 attempts WebM duration repair and also keeps wall-clock recorded duration metadata.
