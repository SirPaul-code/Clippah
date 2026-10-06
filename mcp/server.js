import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOST = '127.0.0.1';
const PORT = Number(process.env.CLIPPAH_BRIDGE_PORT || 47281);
const TOKEN = loadToken();

if (process.argv.includes('--print-token')) {
  process.stdout.write(TOKEN + '\n');
  process.exit(0);
}

let extension = null;
let seq = 0;
const pending = new Map();

function loadToken() {
  if (process.env.CLIPPAH_TOKEN) return process.env.CLIPPAH_TOKEN.trim();
  const dir = join(homedir(), '.clippah');
  const path = join(dir, 'mcp-token');
  try {
    const value = readFileSync(path, 'utf8').trim();
    if (value) return value;
  } catch (_) {}
  mkdirSync(dir, { recursive: true });
  const value = randomBytes(24).toString('hex');
  writeFileSync(path, value + '\n', { mode: 0o600 });
  return value;
}

const wss = new WebSocketServer({ host: HOST, port: PORT, path: '/extension' });

wss.on('connection', (socket, request) => {
  const url = new URL(request.url || '/extension', 'http://' + HOST + ':' + PORT);
  if (url.searchParams.get('token') !== TOKEN) {
    socket.close(1008, 'Invalid pairing token');
    return;
  }
  if (extension && extension !== socket) {
    try { extension.close(1012, 'Replaced by newer Clippah extension connection'); } catch (_) {}
  }
  extension = socket;
  console.error('[clippah-mcp] Extension connected.');

  socket.on('message', raw => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch (_) { return; }
    if (message.type !== 'response' || !message.id) return;
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    clearTimeout(item.timer);
    if (message.error) item.reject(new Error(message.error));
    else item.resolve(message.result);
  });

  socket.on('close', () => {
    if (extension === socket) extension = null;
    console.error('[clippah-mcp] Extension disconnected.');
  });
});

wss.on('listening', () => {
  console.error('[clippah-mcp] Local bridge: ws://' + HOST + ':' + PORT + '/extension');
  console.error('[clippah-mcp] Pairing token stored at ~/.clippah/mcp-token');
});
wss.on('error', error => console.error('[clippah-mcp] Bridge error: ' + error.message));

setInterval(() => {
  if (extension?.readyState === WebSocket.OPEN) {
    try { extension.send(JSON.stringify({ type: 'ping', at: Date.now() })); } catch (_) {}
  }
}, 20000).unref();

function callExtension(method, params = {}, timeoutMs = 20000) {
  if (!extension || extension.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error('Clippah extension is not connected. Run the one-click MCP setup, then pair the token once in Clippah Settings -> Agent Bridge.'));
  }
  const id = 'mcp-' + Date.now() + '-' + (++seq);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Clippah timed out while handling ' + method + '.'));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    extension.send(JSON.stringify({ type: 'request', id, method, params }));
  });
}

function textResult(value) {
  const ok = value?.ok !== false;
  return { content: [{ type: 'text', text: JSON.stringify(value ?? null, null, 2) }], ...(ok ? {} : { isError: true }) };
}

function imageResult(value) {
  if (value?.ok === false) return textResult(value);
  const { dataUrl, ...meta } = value || {};
  if (!dataUrl?.includes(',')) return textResult(value);
  const [head, data] = dataUrl.split(',', 2);
  const mimeType = /data:([^;]+)/.exec(head)?.[1] || value.mimeType || 'image/png';
  return { content: [
    { type: 'text', text: JSON.stringify(meta, null, 2) },
    { type: 'image', data, mimeType }
  ] };
}

function imagesResult(value) {
  if (value?.ok === false) return textResult(value);
  const frames = Array.isArray(value?.frames) ? value.frames : [];
  const content = [{ type: 'text', text: JSON.stringify({ ok: true, frameCount: frames.length }, null, 2) }];
  for (const frame of frames) {
    const { dataUrl, ...meta } = frame;
    content.push({ type: 'text', text: JSON.stringify(meta, null, 2) });
    if (dataUrl?.includes(',')) {
      const [head, data] = dataUrl.split(',', 2);
      content.push({ type: 'image', data, mimeType: /data:([^;]+)/.exec(head)?.[1] || 'image/png' });
    }
  }
  return { content };
}

async function invoke(method, params = {}, timeoutMs = 20000) {
  try { return textResult(await callExtension(method, params, timeoutMs)); }
  catch (error) { return { content: [{ type: 'text', text: error?.message || String(error) }], isError: true }; }
}
async function invokeImage(method, params = {}) {
  try { return imageResult(await callExtension(method, params, 30000)); }
  catch (error) { return { content: [{ type: 'text', text: error?.message || String(error) }], isError: true }; }
}
async function invokeImages(method, params = {}) {
  try { return imagesResult(await callExtension(method, params, 45000)); }
  catch (error) { return { content: [{ type: 'text', text: error?.message || String(error) }], isError: true }; }
}

function createServer() {
  const server = new McpServer({ name: 'clippah', version: '0.3.0' });

  server.registerTool('clippah_status', {
    title: 'Clippah browser status',
    description: 'Inspect the active browser video, playhead, duration, recording state and markers.',
    annotations: { readOnlyHint: true }
  }, async () => invoke('status'));

  server.registerTool('clippah_play', { title: 'Play video', description: 'Play the video currently detected by Clippah.' }, async () => invoke('play'));
  server.registerTool('clippah_pause', { title: 'Pause video', description: 'Pause the video currently detected by Clippah.' }, async () => invoke('pause'));
  server.registerTool('clippah_seek', {
    title: 'Seek browser video',
    description: 'Move the detected browser video playhead to an absolute time in seconds.',
    inputSchema: { seconds: z.number().nonnegative() }
  }, async ({ seconds }) => invoke('seek', { seconds }));

  server.registerTool('clippah_start_clip', { title: 'Start clip', description: 'Start a Clippah clip at the browser playhead.' }, async () => invoke('start_clip'));
  server.registerTool('clippah_finish_clip', { title: 'Finish clip', description: 'Finish the browser clip and save it locally to Studio.' }, async () => invoke('finish_clip'));
  server.registerTool('clippah_cancel_clip', { title: 'Cancel clip', description: 'Cancel the current browser clip without saving.' }, async () => invoke('cancel_clip'));
  server.registerTool('clippah_get_markers', { title: 'Get markers', description: 'Read clip ranges saved for the active browser video.', annotations: { readOnlyHint: true } }, async () => invoke('get_markers'));
  server.registerTool('clippah_list_clips', { title: 'List local clips', description: 'List locally stored clip metadata and IDs for composition.', annotations: { readOnlyHint: true } }, async () => invoke('list_clips'));
  server.registerTool('clippah_open_studio', { title: 'Open Studio', description: 'Open Clippah Studio in a browser tab.' }, async () => invoke('open_studio'));

  server.registerTool('clippah_studio_status', {
    title: 'Studio scene state',
    description: 'Read the current Studio sequence, active clip, output aspect, playhead, viewport, keyframes and captions.',
    annotations: { readOnlyHint: true }
  }, async () => invoke('studio_status'));

  server.registerTool('clippah_get_frame', {
    title: 'Get exact rendered frame',
    description: 'Return the exact Clippah output frame as an image plus viewport/source geometry. A vision-capable agent can inspect people or objects and then reposition the viewport precisely.',
    inputSchema: { time: z.number().nonnegative().optional().describe('Global sequence time in seconds. Omit for current playhead.') },
    annotations: { readOnlyHint: true }
  }, async ({ time }) => invokeImage('studio_get_frame', { time }));

  server.registerTool('clippah_get_frames', {
    title: 'Get sampled rendered frames',
    description: 'Return up to six exact rendered frames at requested global sequence times. Useful for scene understanding and planning viewport motion.',
    inputSchema: { times: z.array(z.number().nonnegative()).min(1).max(6) },
    annotations: { readOnlyHint: true }
  }, async ({ times }) => invokeImages('studio_get_frames', { times }));

  server.registerTool('clippah_studio_seek', {
    title: 'Seek Studio sequence',
    description: 'Move the Studio playhead to a global sequence time.',
    inputSchema: { time: z.number().nonnegative() }
  }, async ({ time }) => invoke('studio_seek', { time }));

  server.registerTool('clippah_set_aspect', {
    title: 'Set output aspect ratio',
    description: 'Set Studio output to 16:9, 9:16 or 1:1.',
    inputSchema: { aspect: z.enum(['16:9','9:16','1:1']) }
  }, async ({ aspect }) => invoke('studio_set_aspect', { aspect }));

  server.registerTool('clippah_set_viewport', {
    title: 'Set viewport and keyframe',
    description: 'Set normalized viewport center (0..1), optional zoom and create/update a keyframe at the requested Studio time.',
    inputSchema: {
      x: z.number().min(0).max(1), y: z.number().min(0).max(1), zoom: z.number().min(1).max(3).optional(), time: z.number().nonnegative().optional()
    }
  }, async args => invoke('studio_set_viewport', args));

  server.registerTool('clippah_move_viewport', {
    title: 'Move viewport by pixels',
    description: 'Move the visible crop window by output pixels and create/update a keyframe. Positive dx moves the crop window right across the source; positive dy moves it down.',
    inputSchema: {
      dx: z.number(), dy: z.number(), zoom: z.number().min(1).max(3).optional(), time: z.number().nonnegative().optional()
    }
  }, async args => invoke('studio_move_viewport', args));

  server.registerTool('clippah_add_keyframe', {
    title: 'Add viewport keyframe',
    description: 'Store the current viewport at the current or requested Studio time.',
    inputSchema: { time: z.number().nonnegative().optional() }
  }, async ({ time }) => invoke('studio_add_keyframe', { time }));

  server.registerTool('clippah_clear_motion', {
    title: 'Clear viewport motion',
    description: 'Remove all viewport keyframes from the active Studio clip and reset the frame.'
  }, async () => invoke('studio_clear_motion'));

  server.registerTool('clippah_append_clip', {
    title: 'Append clip to Studio sequence',
    description: 'Append a local clip ID from clippah_list_clips to the current Studio sequence.',
    inputSchema: { clipId: z.string().min(1) }
  }, async ({ clipId }) => invoke('studio_append_clip', { clipId }));

  return server;
}

void serveStdio(createServer);
console.error('[clippah-mcp] MCP stdio server ready.');
