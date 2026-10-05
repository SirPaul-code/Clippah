# Clippah MCP server

The optional local MCP server lets an agent control the browser workflow through a loopback-only WebSocket bridge to the Clippah extension.

## Requirements

- Node.js 20+
- Clippah extension v0.2+

## Install

```bash
cd mcp
npm install
npm start
```

The first run creates a persistent random token in `~/.clippah/mcp-token` and prints it to stderr.

Open **Clippah Settings -> Agent Bridge**, paste that token, enable the bridge, and save.

The bridge listens only on `127.0.0.1:47281` by default.

## MCP client config

Use the MCP server as a stdio process:

```json
{
  "mcpServers": {
    "clippah": {
      "command": "node",
      "args": ["C:/path/to/Clippah/mcp/server.js"]
    }
  }
}
```

## Tools

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

The first bridge deliberately exposes a narrow control surface. Future versions can add transcription, clip selection, reframe/keyframe editing, POI tracking and export jobs without changing the browser UI architecture.
