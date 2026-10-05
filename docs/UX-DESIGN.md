# Clippah UX direction

The product should feel like a focused creator utility, not a mini Premiere clone.

## Interaction principles

1. **The player is the workspace.** Starting/finishing a clip happens where the user is already watching.
2. **One primary action per state.** The floating dock shows Start clip or Finish clip, never a wall of controls.
3. **No editor jargon in the capture UI.** We do not show ARMED, capture internals, codecs or buffers.
4. **Precision appears only when needed.** Studio adds a timeline and inspector after a clip exists.
5. **Direct manipulation beats parameter forms.** Drag the frame to reframe. Wheel to zoom.
6. **Motion is implicit.** With Auto keyframe enabled, moving the frame at a different playhead position creates/updates a motion point automatically.
7. **One inspector.** Frame, Fill, Zoom and Motion live in one right-side panel instead of scattered toolbars.
8. **Local-first is visible but quiet.** The UI communicates that processing is local without repeating technical warnings.

## Reference patterns

### Descript
Descript describes its editor around a simplified timeline, direct canvas interactions, and a single sidepanel for properties/effects/animation. Clippah follows that information architecture while keeping a much smaller feature surface.

### CapCut
CapCut uses the familiar keyframe pattern: move the playhead, change position/scale, and create motion between points. Clippah simplifies this further by making keyframe creation automatic after a drag/zoom when Auto keyframe is on.

### Apple interaction guidance
Strong interaction design should feel intuitive and effortless. Clippah applies that by hiding capture implementation details and keeping the in-player UI state-driven.

## Capture dock states

### Ready
- current player time
- Start clip
- Studio
- shortcuts

### Recording
- red live indicator
- elapsed recording time
- Finish clip
- capture implementation shown only as subtle secondary text

### One-time compatibility setup
Some sites, especially YouTube, need Chrome's tabCapture permission path for reliable audio. Chrome requires a user invocation for that API. The UI calls this one-time capture access for this tab, not arming.

The user can press Ctrl+Shift+K / Cmd+Shift+K or click the Clippah toolbar icon once. After that, Start/Finish happens entirely in the floating dock for the life of the tab.

## Studio layout

```text
+---------------------------------------------------------------+
| Clippah | clip title                         Settings | Export |
+----------+------------------------------------+-----------------+
| Clips    |                                    | Frame           |
|          |            CANVAS                  | aspect          |
|          |                                    | fill            |
|          +------------------------------------+ motion          |
|          | play | timeline + keyframes        | auto keyframe   |
+----------+------------------------------------+-----------------+
```
