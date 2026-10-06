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
  const server = new McpServer({ name: 'clippah', version: '0.5.0' });

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
    title: 'Append clip to Studio timeline',
    description: 'Append a local clip ID from clippah_list_clips to the end of the V1 timeline.',
    inputSchema: { clipId: z.string().min(1) }
  }, async ({ clipId }) => invoke('studio_insert_clip', { clipId }));

  server.registerTool('clippah_insert_clip', {
    title: 'Insert clip into timeline',
    description: 'Insert a local clip at a zero-based timeline index.',
    inputSchema: { clipId: z.string().min(1), index: z.number().int().nonnegative().optional() }
  }, async args => invoke('studio_insert_clip', args));

  server.registerTool('clippah_move_segment', {
    title: 'Move timeline segment',
    description: 'Reorder one V1 timeline segment by moving it to a zero-based index.',
    inputSchema: { segmentId: z.string().min(1), index: z.number().int().nonnegative() }
  }, async args => invoke('studio_move_segment', args));

  server.registerTool('clippah_select_segment', {
    title: 'Select timeline segment',
    description: 'Select a V1 timeline segment. Optionally seek to its start.',
    inputSchema: { segmentId: z.string().min(1), seek: z.boolean().optional() }
  }, async args => invoke('studio_select_segment', args));

  server.registerTool('clippah_split_segment', {
    title: 'Split timeline segment',
    description: 'Split a V1 segment either at a global sequence time or an exact source time. Omit segmentId to use the selected segment.',
    inputSchema: {
      segmentId: z.string().optional(),
      time: z.number().nonnegative().optional(),
      sourceTime: z.number().nonnegative().optional()
    }
  }, async args => invoke('studio_split', args));

  server.registerTool('clippah_delete_segment', {
    title: 'Delete timeline segment',
    description: 'Remove a segment from the current Studio timeline without deleting the source clip from the Library.',
    inputSchema: { segmentId: z.string().optional() }
  }, async args => invoke('studio_delete_segment', args));

  server.registerTool('clippah_set_segment', {
    title: 'Set clip speed, volume and fades',
    description: 'Edit one timeline segment: playback speed, volume, video fade-in/out and audio fade-in/out, all in seconds where applicable.',
    inputSchema: {
      segmentId: z.string().optional(),
      speed: z.number().min(0.25).max(3).optional(),
      volume: z.number().min(0).max(2).optional(),
      videoFadeIn: z.number().nonnegative().optional(),
      videoFadeOut: z.number().nonnegative().optional(),
      audioFadeIn: z.number().nonnegative().optional(),
      audioFadeOut: z.number().nonnegative().optional()
    }
  }, async args => invoke('studio_set_segment', args));

  server.registerTool('clippah_set_fill', {
    title: 'Set frame fill mode',
    description: 'Set output fill mode to crop, blur, mirror or fit.',
    inputSchema: { fill: z.enum(['crop','blur','mirror','fit']) }
  }, async ({ fill }) => invoke('studio_set_fill', { fill }));

  server.registerTool('clippah_add_text', {
    title: 'Add text overlay',
    description: 'Add a text overlay to the active segment at the current or requested global time.',
    inputSchema: { text: z.string().optional(), time: z.number().nonnegative().optional() }
  }, async args => invoke('studio_add_text', args));

  server.registerTool('clippah_update_text', {
    title: 'Update text overlay',
    description: 'Update any editable text-layer fields such as text, font, size, color, x/y position, start/end time or fade values.',
    inputSchema: {
      segmentId: z.string().optional(),
      textId: z.string().min(1),
      patch: z.record(z.string(), z.any())
    }
  }, async args => invoke('studio_update_text', args));

  server.registerTool('clippah_delete_text', {
    title: 'Delete text overlay',
    description: 'Delete one text layer from a timeline segment.',
    inputSchema: { segmentId: z.string().optional(), textId: z.string().min(1) }
  }, async args => invoke('studio_delete_text', args));

  server.registerTool('clippah_get_captions', {
    title: 'Read captions',
    description: 'Read caption cues from the selected or specified segment.',
    inputSchema: { segmentId: z.string().optional() },
    annotations: { readOnlyHint: true }
  }, async args => invoke('studio_get_captions', args));

  server.registerTool('clippah_set_captions', {
    title: 'Replace captions',
    description: 'Replace caption cues on a segment. Cue times are seconds relative to that segment source range.',
    inputSchema: {
      segmentId: z.string().optional(),
      cues: z.array(z.object({
        id: z.string().optional(),
        start: z.number().nonnegative(),
        end: z.number().nonnegative(),
        text: z.string()
      }))
    }
  }, async args => invoke('studio_set_captions', args));

  server.registerTool('clippah_set_motion_mode', {
    title: 'Set viewport edit mode',
    description: 'Choose static viewport editing or animate mode. Static changes the whole clip; animate records viewport keyframes at the playhead.',
    inputSchema: { mode: z.enum(['static','animate']) }
  }, async ({ mode }) => invoke('studio_set_motion_mode', { mode }));

  server.registerTool('clippah_add_overlay', {
    title: 'Add overlay object',
    description: 'Add a text, emoji or image/sticker overlay to the active segment.',
    inputSchema: {
      kind: z.enum(['text','emoji','image']),
      text: z.string().optional(),
      dataUrl: z.string().optional(),
      time: z.number().nonnegative().optional(),
      patch: z.record(z.string(), z.any()).optional()
    }
  }, async args => invoke('studio_add_overlay', args));

  server.registerTool('clippah_update_overlay', {
    title: 'Update overlay object',
    description: 'Update overlay content, timing, font, z-order, image source or base transform.',
    inputSchema: {
      segmentId: z.string().optional(),
      overlayId: z.string().min(1),
      patch: z.record(z.string(), z.any())
    }
  }, async args => invoke('studio_update_overlay', args));

  server.registerTool('clippah_delete_overlay', {
    title: 'Delete overlay object',
    description: 'Delete one text, emoji or image overlay.',
    inputSchema: { segmentId: z.string().optional(), overlayId: z.string().min(1) }
  }, async args => invoke('studio_delete_overlay', args));

  server.registerTool('clippah_set_overlay', {
    title: 'Set overlay transform',
    description: 'Set an overlay position, scale, rotation and opacity. The selected overlay motion mode decides whether this is static or keyframed.',
    inputSchema: {
      segmentId: z.string().optional(),
      overlayId: z.string().optional(),
      time: z.number().nonnegative().optional(),
      x: z.number().min(0).max(1).optional(),
      y: z.number().min(0).max(1).optional(),
      scale: z.number().min(0.1).max(8).optional(),
      rotation: z.number().optional(),
      opacity: z.number().min(0).max(1).optional()
    }
  }, async args => invoke('studio_set_overlay', args));

  server.registerTool('clippah_move_overlay', {
    title: 'Move overlay by output pixels',
    description: 'Move an overlay by dx/dy pixels in the current output canvas. Useful after inspecting a rendered frame.',
    inputSchema: {
      segmentId: z.string().optional(),
      overlayId: z.string().optional(),
      time: z.number().nonnegative().optional(),
      dx: z.number(),
      dy: z.number()
    }
  }, async args => invoke('studio_move_overlay', args));

  server.registerTool('clippah_set_overlay_motion_mode', {
    title: 'Set overlay motion mode',
    description: 'Choose whether an overlay is edited statically or animated with transform keyframes.',
    inputSchema: { overlayId: z.string().optional(), mode: z.enum(['static','animate']) }
  }, async args => invoke('studio_set_overlay_motion_mode', args));

  server.registerTool('clippah_add_overlay_keyframe', {
    title: 'Add overlay keyframe',
    description: 'Store the selected overlay transform at the current or requested playhead time.',
    inputSchema: { time: z.number().nonnegative().optional() }
  }, async args => invoke('studio_add_overlay_keyframe', args));

  server.registerTool('clippah_clear_overlay_motion', {
    title: 'Clear overlay motion',
    description: 'Remove all transform keyframes from the selected overlay while keeping its current transform static.'
  }, async () => invoke('studio_clear_overlay_motion'));

  server.registerTool('clippah_library', {
    title: 'Read Clippah Library',
    description: 'Read the local folder tree and clip metadata.',
    annotations: { readOnlyHint: true }
  }, async () => invoke('studio_list_library'));

  server.registerTool('clippah_create_folder', {
    title: 'Create Library folder',
    description: 'Create a root folder or nested subfolder in Clippah Library.',
    inputSchema: { name: z.string().min(1), parentId: z.string().optional() }
  }, async args => invoke('studio_create_folder', args));

  server.registerTool('clippah_move_clips', {
    title: 'Move clips to folder',
    description: 'Move one or more local clip IDs into a folder. Omit folderId to move them to Library root.',
    inputSchema: { clipIds: z.array(z.string().min(1)).min(1), folderId: z.string().optional() }
  }, async args => invoke('studio_move_clips', args));

  server.registerTool('clippah_move_folder', {
    title: 'Move Library folder',
    description: 'Re-parent one Library folder under another folder or move it to root.',
    inputSchema: { folderId: z.string().min(1), parentId: z.string().optional() }
  }, async args => invoke('studio_move_folder', args));

  server.registerTool('clippah_delete_folder', {
    title: 'Delete Library folder',
    description: 'Delete a folder while moving its direct clips/subfolders one level up.',
    inputSchema: { folderId: z.string().min(1) }
  }, async args => invoke('studio_delete_folder', args));

  server.registerTool('clippah_export_sequence', {
    title: 'Export Studio sequence',
    description: 'Start local rendering/export of the current Studio sequence.'
  }, async () => invoke('studio_export', {}, 30000));

  return server;
}

void serveStdio(createServer);
console.error('[clippah-mcp] MCP stdio server ready.');
