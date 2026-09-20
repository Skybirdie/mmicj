# SkyReader180 — Phase 4.0

## Base

Phase 3.9.1 restored baseline.

## Change

Mouse-wheel page turning is now scoped to the reader viewport (`#viewerArea`).
The document-level listener remains in place, but wheel events originating
outside the viewer are ignored.

## Expected behavior

Library:
- Mouse-wheel scrolling remains normal library scrolling.
- It must not request a page turn.

Reader:
- Mouse-wheel scrolling over `#viewerArea` continues to request Next/Previous
  through `SRNavigation`.
- Existing final-spread behavior remains unchanged.

## Deliberately unchanged

- Renderer
- PDF rendering strategy
- Sky180FlipEngine
- StPageFlip
- Cold-start lifecycle
- Continue Reading
- Resume
- Book switching
- PageUp/PageDown
- Control-bar navigation
- Progressive rendering
- No render queue/prefetch system is introduced in this phase.
