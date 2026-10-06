# Clippah roadmap

## v0.4 — lightweight browser NLE — implemented

- fixed Add clip modal hidden-state bug
- Library → V1 drag & drop
- timeline segment data model
- segment reorder
- Cut tool
- split at playhead
- Delete / Backspace
- right-click segment menu
- duplicate/delete segment
- V1 video track
- A1 audio waveform
- T text track
- CC captions track
- per-segment speed
- per-segment video fade in/out
- per-segment volume
- per-segment audio fade in/out
- text overlays and timing
- Local Font Access integration
- motion keyframes per segment
- dynamic Library refresh after new recording
- clearer one-time YouTube capture onboarding
- expanded MCP timeline/text/audio/caption/export tools

## Next — acquisition engine

Separate marking/editing from media acquisition.

Providers:

1. clean media-element capture where available
2. direct/background acquisition where technically and policy-safe
3. tabCapture compatibility fallback

Goals:

- mark non-linearly while watching/seeking
- acquire source independently where possible
- avoid browser UI/cursor in clean-source mode
- preserve original quality where permitted
- no DRM circumvention

## Next — local automatic captions

- optional downloadable Whisper-family model
- WebGPU/WASM local inference
- multilingual transcription
- model cache manager
- word/timing editing
- caption style presets
- optional translation provider later

No paid transcription dependency should be required for the core local mode.

## Next — intelligent reframing / POI

- click person/object as POI
- local face/person/object tracking where feasible
- agent-assisted scene sampling
- automatic subject switching
- manual drag always overrides via keyframe
- split-screen / two-speaker modes

## Next — output/productization

- MP4/H.264 where browser/codecs permit
- export quality presets
- project naming/history
- undo/redo
- keyboard editor map
- autosave/recovery
- performance profiling for long projects

## Commercial layer

Target initial Pro price: roughly **€5/month**.

Potential Free:

- core clipping
- constrained export
- small attribution

Potential Pro:

- no attribution
- higher-quality/output options
- full motion
- local transcription
- agent/POI tools
- saved presets/projects
