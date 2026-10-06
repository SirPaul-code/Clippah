# Clippah product plan

## P0 — capture reliability — DONE / ongoing hardening

- audio + moving video capture
- persistent compatibility capture per browser tab
- no hidden-canvas recording loop
- local storage
- automatic Studio Library refresh

## P1 — creator UX — 0.3 DONE

- larger readable UI
- tooltips and inline hints
- direct canvas reframe
- auto keyframes
- explicit Clear all motion
- sequence strip
- + before / after / between clips
- clip folders and multi-select organization
- sequence playback/export

## P2 — captions — 0.3 baseline DONE

- collect visible/source captions while clipping
- language-agnostic caption data
- SRT/VTT import
- caption burn-in
- SRT export

Next caption step:

- optional fully local Whisper ASR via WebGPU/WASM
- model download/cache UI
- word-level editing/styling presets
- translation as a separate optional local/cloud provider

## P3 — agent/MCP editing — 0.3 foundation DONE

- exact rendered frame retrieval
- multi-frame sampling
- scene/source/output geometry
- pixel viewport movement
- exact normalized viewport controls
- zoom
- keyframes
- aspect ratio
- clip append
- browser clip control
- Windows one-click MCP setup

Next:

- agent folder/project management
- caption editing/transcription tools
- export jobs
- POI/person tracking suggestions
- scene-change sampling helper

## P4 — acquisition engine — NEXT

Separate timeline/markers from media acquisition.

Providers:

1. clean direct media capture where available
2. direct/background media acquisition where technically/policy-safe
3. tabCapture compatibility fallback

Goals:

- user may seek and mark non-linearly
- media acquisition runs independently where possible
- no cursor/UI in clean-source provider
- no DRM circumvention

## P5 — intelligent reframing

- click/select a POI/person
- lightweight local tracking
- agent-assisted frame analysis
- auto-switch subject
- manual drag always overrides with a keyframe

## P6 — productization

Target initial Pro price: around **€5/month**.

Free:

- basic clips
- limited export
- small attribution

Pro:

- no watermark
- higher quality
- full motion/keyframes
- captions/transcription
- agent tools / tracking
- saved presets
