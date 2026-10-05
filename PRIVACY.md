# Clippah privacy — MVP

Last updated: 2026-10-06

This document describes the current **Clippah 0.1.0 development MVP**.

## Current behavior

Clippah currently performs video processing locally in the browser.

The MVP does not include:

- a Clippah backend,
- user accounts,
- analytics,
- advertising,
- cloud transcription,
- remote video uploads,
- payment processing.

## Data stored locally

Clippah may store locally:

- page URL,
- page title,
- IN/OUT timestamps,
- clip duration,
- local capture metadata,
- locally captured video blobs,
- locally created edit state.

Marker metadata uses Chrome extension local storage.

Captured video uses browser IndexedDB.

## Video and audio

When the user explicitly arms capture, Clippah uses the browser's tab-capture functionality to capture the active tab for local clip creation.

The current MVP does not upload that captured media to a Clippah server.

## Deleting local data

Individual captured clips can be deleted from Clippah Studio.

Development/test data can also be removed by uninstalling the extension or clearing its extension storage / IndexedDB.

## Future versions

If Clippah later adds accounts, billing, analytics, cloud processing or other network services, this document must be updated before those features are released.
