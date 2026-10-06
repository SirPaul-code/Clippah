# Clippah MCP / Agent bridge — v0.4

Clippah exposes the same editing model used by Studio through a local MCP server. A multimodal agent can inspect exact rendered frames, understand source/output geometry, build the timeline, cut clips, change speed/audio/fades, add text/captions and control motion keyframes.

## Windows — no npm knowledge required

### One-time pairing

1. Open the downloaded `Clippah\mcp` folder.
2. Double-click **`setup.cmd`**.
3. It installs Node.js LTS with `winget` if required, installs the local MCP dependencies, creates a private pairing token and copies it to the clipboard.
4. In Chrome open **Clippah → Settings → Agent Bridge**.
5. Enable the bridge, paste the token and click **Save & reconnect**.

### MCP command for an agent

Point the MCP client at:

```text
Clippah\mcp\clippah-mcp.cmd
```

The launcher checks/install missing npm dependencies itself before starting the stdio MCP server. The user never needs to type `npm start`.

macOS/Linux equivalent:

```text
Clippah/mcp/clippah-mcp.sh
```

## Browser tools

- `clippah_status`
- `clippah_play`
- `clippah_pause`
- `clippah_seek`
- `clippah_start_clip`
- `clippah_finish_clip`
- `clippah_cancel_clip`
- `clippah_get_markers`
- `clippah_list_clips`
- `clippah_open_studio`

## Studio / NLE tools

### Vision and scene understanding

- `clippah_studio_status` — whole sequence, segment IDs, timings, fades, speed, motion/text/caption state.
- `clippah_get_frame` — exact rendered frame + output/source/viewport geometry.
- `clippah_get_frames` — sample up to six rendered frames at exact global sequence times.

This lets a vision-capable agent inspect a frame, locate a face/object, move the crop by pixels, inspect again and create motion keyframes iteratively.

### Timeline

- `clippah_insert_clip`
- `clippah_append_clip`
- `clippah_move_segment`
- `clippah_select_segment`
- `clippah_split_segment`
- `clippah_delete_segment`
- `clippah_studio_seek`

### Clip/audio properties

- `clippah_set_segment`
  - speed
  - volume
  - video fade in/out
  - audio fade in/out
- `clippah_set_aspect`
- `clippah_set_fill`

### Motion / crop

- `clippah_set_viewport`
- `clippah_move_viewport`
- `clippah_add_keyframe`
- `clippah_clear_motion`

### Text

- `clippah_add_text`
- `clippah_update_text`
- `clippah_delete_text`

### Captions

- `clippah_get_captions`
- `clippah_set_captions`

### Export

- `clippah_export_sequence`

## Example agent loop for reframing

1. `clippah_get_frame({time: 3.0})`
2. Vision model sees the speaker is 160 px right of desired center.
3. `clippah_move_viewport({dx: 160, dy: 0, time: 3.0})`
4. `clippah_get_frame({time: 3.0})` again.
5. Repeat if needed.
6. Sample a later frame and add the next keyframe.

## Security

- Bridge binds only to `127.0.0.1`.
- Random persistent token is required.
- Token is stored in `~/.clippah/mcp-token`.
- Video is not uploaded to a Clippah cloud service.
- Frame pixels leave the extension only when an explicitly connected MCP agent requests them.


## v0.5 editing parity

Additional MCP tools:

- \`clippah_set_motion_mode\` — static vs animated viewport edits
- \`clippah_add_overlay\` — text / emoji / image overlay
- \`clippah_update_overlay\`
- \`clippah_delete_overlay\`
- \`clippah_set_overlay\`
- \`clippah_move_overlay\` — move by output pixels
- \`clippah_set_overlay_motion_mode\`
- \`clippah_add_overlay_keyframe\`
- \`clippah_clear_overlay_motion\`
- \`clippah_library\`
- \`clippah_create_folder\`
- \`clippah_move_clips\`
- \`clippah_move_folder\`
- \`clippah_delete_folder\`

An agent can therefore inspect frames, move the camera viewport, animate any overlay object, adjust segment speed/volume/fades, and organize the local media tree.
