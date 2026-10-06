# Clippah MCP / Agent bridge

Clippah exposes a local MCP server so a vision-capable agent can inspect exact rendered frames and edit the same viewport/keyframes a human edits in Studio.

## Windows: one-click setup

You do **not** need to know npm.

1. Open the `mcp` folder.
2. Double-click **`setup.cmd`**.
3. The setup installs Node.js LTS with `winget` if needed, installs the MCP dependencies, creates a private pairing token and copies the token to the clipboard.
4. In Chrome open **Clippah -> Settings -> Agent Bridge**.
5. Enable Agent Bridge, paste the token, Save.

For an MCP client/agent, use **`mcp/start.cmd`** as the MCP command. The launcher installs missing dependencies automatically and then starts the stdio MCP server.

## macOS / Linux

```bash
cd mcp
./setup.sh
```

Then use `node /absolute/path/to/Clippah/mcp/server.js` as the MCP command.

## What the agent can do

Browser tools:

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

Studio / visual editing tools:

- `clippah_studio_status` — current sequence, active clip, viewport, keyframes, captions.
- `clippah_get_frame` — returns the exact rendered output frame as an MCP image plus source/output geometry.
- `clippah_get_frames` — up to six exact frames at requested sequence times.
- `clippah_studio_seek` — move the Studio playhead.
- `clippah_set_aspect` — 16:9 / 9:16 / 1:1.
- `clippah_set_viewport` — set normalized viewport center/zoom and keyframe it.
- `clippah_move_viewport` — move the crop window by output pixels and keyframe it.
- `clippah_add_keyframe`
- `clippah_clear_motion`
- `clippah_append_clip`

This means an agent can request a frame, visually locate a face/person/object, move the viewport 20 px / 100 px / etc., request the resulting frame again, and iteratively create motion keyframes.

## Security model

- Browser bridge binds only to `127.0.0.1`.
- A random persistent token is required.
- The token is stored in `~/.clippah/mcp-token`.
- Video is not uploaded to a Clippah cloud service.
- `clippah_get_frame(s)` returns rendered frames only when an agent explicitly asks for them.
