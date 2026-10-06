# Install Clippah 0.2

No Git and no npm are required to test the browser extension.

## Install from ZIP

1. On GitHub click Code -> Download ZIP.
2. Extract it, for example to C:\Clippah.
3. Open chrome://extensions.
4. Enable Developer mode.
5. Click Load unpacked.
6. Select the folder containing manifest.json.
7. Pin Clippah.

If Clippah was already installed:
1. replace/update the files,
2. open chrome://extensions,
3. click Reload on Clippah,
4. refresh the video tab.

## Site access

Clippah needs access to the video page so it can detect the HTML5 player and place the clipping dock. For development testing set site access to On all sites or at least allow the sites you test.

## YouTube: one-time capture access per tab

Clippah can detect timestamps immediately, but reliable YouTube audio/video capture uses Chrome tabCapture.

Chrome requires the extension to be explicitly invoked before that capture may begin. Do this once for a YouTube tab:
- Ctrl+Shift+K on Windows/Linux
- Cmd+Shift+K on macOS
- or click the Clippah toolbar icon once.

The icon badge shows ON while compatibility capture is active.

You do not click it again for every clip. Use the floating Start/Finish controls after that.

## Make a test clip

1. Open a normal youtube.com/watch page.
2. Refresh after installing/reloading Clippah.
3. Confirm the small Clippah dock appears around the player.
4. Press Ctrl+Shift+K once.
5. Play the source video.
6. Click Start clip.
7. Record 10-30 seconds.
8. Click Finish clip.
9. Open Studio.
10. Switch to 9:16.
11. Seek later and drag the video toward a speaker. With Auto keyframe enabled, Clippah creates the motion point automatically.
12. Play from before that point to see interpolation.
13. Export.

## Important when upgrading from 0.1

A clip already captured by the old hidden-canvas recorder cannot be repaired by upgrading the code. Create a NEW clip with 0.2 to verify the frozen-frame fix.

## MCP setup

The extension works without MCP. Agent setup is documented in mcp/README.md.


## One click per YouTube tab

For YouTube/Twitch compatibility capture, Chrome itself requires a user gesture before an extension can call `tabCapture`.

After opening a new YouTube tab:

1. Look at the Clippah floating dock. It says **Enable capture**.
2. The Clippah toolbar icon shows a purple **1** badge.
3. Click the Clippah toolbar icon **once** (or press `Ctrl+Shift+K`).
4. The toolbar badge changes to **ON**.
5. Leave it ON and make as many clips as you want with **Start clip / Finish clip**.

You do **not** need to click the extension for each clip. The one click is only the browser permission boundary for that tab.

## Studio v0.4 quick start

- Drag clips from Library onto **V1**.
- Drag V1 segments to reorder.
- Choose **Cut**, then click a segment to split it.
- Press **Delete/Backspace** or right-click a segment to remove it from the project.
- A1 displays the local audio waveform.
- Select a segment to change speed, video/audio fades and volume.
- Use Motion for 9:16 reframing/keyframes.
- Use Text to add timed text and load browser-accessible PC fonts.
- Use Captions for source captions or SRT/VTT.
