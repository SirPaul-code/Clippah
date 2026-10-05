# Clippah product plan

Reliability and workflow speed come before AI features.

## P0 — capture reliability and truthful UX
Status: **v0.2 implemented / needs browser QA**
- Record the raw tab MediaStream instead of repainting it through a hidden canvas.
- Crop the player later in Studio from capture metadata.
- Request cursor-free constraints where Chromium exposes them.
- Persist exact wall-clock clip duration.
- Handle WebM duration edge cases in Studio.
- Replace technical ARMED/MARK ONLY jargon with Ready / Enable capture.
- Toolbar action becomes a one-time compatibility permission per tab, not a per-clip record button.

Definition of done: a 30-second YouTube clip contains moving video + audio, opens in Studio, seeks, reframes and exports.

## P1 — creator-grade capture/editor UX
Status: **v0.2 implemented / needs browser QA**
- Minimal floating dock outside the player where possible.
- Start clip / Finish clip as the primary stateful action.
- Current time and recording elapsed time.
- [ start, ] finish, Escape cancel.
- Studio = library + canvas + one inspector + compact timeline.
- 16:9 / 9:16 / 1:1.
- Crop / Blur / Mirror / Fit.
- Direct drag reframe and wheel zoom.
- Auto keyframe on drag/zoom, keyframe markers on timeline, smooth interpolation.

## P2 — acquisition engine
Status: **next**
Goal: decouple clip selection from realtime recording.
- AcquisitionProvider interface.
- Direct media-element capture where it reliably exposes video + audio.
- Direct/background source acquisition only where technically and policy-safe.
- Tab capture remains compatibility fallback.
- Clip jobs built from saved IN/OUT ranges.
- Background source progress and cancellation.
- Exact source-resolution metadata.

## P3 — export engine
- MP4 where browser codecs / safe muxing permit.
- 1080x1920 Shorts/Reels preset.
- deterministic render job model.
- export queue and progress.
- project JSON persistence.

## P4 — captions
- Local Whisper-family transcription.
- timestamps and caption styling.
- local-first/no default cloud cost.

## P5 — POI and reframing
- click person/object to define POI.
- local person/face tracking where practical.
- follow POI with smoothing.
- switch target later in the timeline.
- manual drag overrides tracking by creating a keyframe.

## P6 — paid product
Target initial price: roughly **EUR 5/month**.
Free: basic flow, limited exports, small attribution.
Pro: no attribution, higher quality, full motion/keyframes, captions, POI tracking, presets.
Use account/license state or privacy-friendly install IDs, not MAC addresses.

## P7 — agent surface / MCP
Status: **bridge foundation implemented in v0.2**
Current tools: status, play, pause, seek, start/finish/cancel clip, get markers, list local clip metadata, open Studio.
Next: select clip, set aspect/fill, add/rewrite keyframes, transcription, POI, export jobs.
