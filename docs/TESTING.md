# Clippah v0.3 test checklist

Use this after reloading the extension from `chrome://extensions`.

## Capture

- Open a normal YouTube watch page and refresh it after the extension reload.
- Enable compatibility capture once for the tab with the Clippah toolbar action / shortcut.
- Record a 10–20 second clip.
- Confirm the clip has moving video and audio.
- Keep Studio open, record another clip, and confirm the Library updates without a manual page refresh.

## Library and folders

- Click **Organize**.
- Select multiple clips.
- Move them to an existing folder.
- Create a new folder and move clips into it.
- Switch the Library folder filter and confirm the expected clips are shown.

## Sequence

- Add clips with the large **+** buttons before, between, and after sequence items.
- Reorder/edit the active sequence by selecting sequence cards.
- Export the sequence and confirm the output contains the clips in sequence order.

## Motion

- Switch to 9:16.
- Drag the viewport at one point in time.
- Seek later and drag again.
- Confirm auto-keyframe creates motion points and interpolation is visible.
- Use **Clear all motion** and confirm the clip returns to neutral framing.

## Captions

- Use source captions when the recorded page exposes them.
- Import an SRT or VTT file.
- Enable **Burn captions**.
- Confirm captions appear in preview/export.
- Export SRT and verify timestamps/text.

## Agent / MCP

- Run `mcp/setup.cmd` once on Windows.
- Paste the copied pairing token into **Clippah Settings → Agent Bridge** and enable the bridge.
- Run `mcp/start.cmd`.
- Verify an MCP client can call Studio status, retrieve a frame, move the viewport by pixels, set zoom, and add a keyframe.
