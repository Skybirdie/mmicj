# SkyReader180 — Phase 4

## Render queue / prefetch architecture

Base: the supplied `SkyReader180-3.9.zip`.

This phase introduces the first intelligent PDF render queue while leaving
navigation and `Sky180FlipEngine` behavior unchanged.

### Renderer responsibilities

Renderer remains the PDF expert and owns:

- PDF.js document/page access
- page surfaces and canvases
- PDF page rendering
- the six-page render/prefetch window
- PDF page-object cache management

### Six-page priority window

For a normal two-page spread, the queue prioritizes:

1. Current spread — highest priority
2. Next spread — most likely next request
3. Previous spread — likely PageUp/wheel-back request

This produces a six-page working window around the current spread.

At the cover or near the end of a document, the queue fills remaining slots
from the nearest available direction.

### Immediate first/resume spread

The opening page is still rendered immediately. When opening a saved position,
Renderer immediately renders the complete requested spread before asking the
presentation engine to move there. Background prefetching begins afterward.

### Cancellation

Each queue has a generation number. A new spread request invalidates stale
queued work so the renderer does not continue prioritizing pages from an old
location.

### Unchanged

- `SRNavigation` is unchanged.
- `Reader` navigation is unchanged.
- `Sky180FlipEngine` is unchanged.
- StPageFlip remains isolated inside `Sky180FlipEngine`.
- Mouse-wheel behavior is unchanged.
- Final-spread -> Library behavior is unchanged.
- Cold-start lifecycle is unchanged.
- The cover-to-first-spread visual gap remains deferred.

## Phase 4.0 scope

This is the queue/prefetch architecture only. It does not yet redesign the
canvas/page-surface model or introduce aggressive memory eviction.
