# Clippah roadmap

## v0.1 — functional MVP

Status: **implemented**

- player detection
- overlay
- native media timestamps
- multiple markers
- local tab capture
- cropped clip recording
- IndexedDB
- Studio
- 16:9 / 9:16 / 1:1
- blur / fit / crop
- drag reframe
- manual viewport keyframes
- interpolated viewport movement
- WebM export

## v0.2 — acquisition and timeline

Priority: **next**

- acquisition abstraction instead of capture-only assumptions
- direct/background media access where technically and policy-safe
- retain tabCapture as universal fallback
- better handling of seeked/non-linear marker workflows
- clip jobs generated from saved IN/OUT ranges
- dynamic player-rectangle updates while capturing
- more reliable SPA/player replacement handling
- iframe integrations where feasible

## v0.3 — creator workflow

- MP4 output where browser codecs allow it
- export presets for Shorts / Reels / TikTok
- caption track UI
- local transcription model
- caption styling
- exact frame stepping
- keyboard-first workflow
- project/session view

## v0.4 — intelligent reframing

- click person/object to define POI
- automatic subject/person tracking
- viewport follows POI
- switch target at timestamp
- manual override creates keyframe
- smoothing controls
- split-screen / two-speaker layouts

## v0.5 — paid product

Target early pricing: approximately **€5/month**.

Possible model:

### Free

- basic clipping
- limited exports
- small Clippah attribution/watermark
- basic aspect conversion

### Pro

- no watermark
- higher-quality exports
- full keyframes
- POI tracking
- local captions/transcription
- saved presets

Entitlement should use account/license state or privacy-friendly install IDs, not invasive hardware fingerprinting.

## Distribution/release work

Before Chrome Web Store submission:

- custom icons
- screenshots
- store listing copy
- final privacy policy URL
- permission minimization review
- host-permission justification
- Chrome Web Store policy review
- automated release ZIP
- version tagging
