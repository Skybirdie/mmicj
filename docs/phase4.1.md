# SkyReader180 — Phase 4.1

## Purpose

Correct the Phase 4 rendering behavior where the presentation could move to
a new spread before the second page of that spread had finished rendering.

## Phase 4 base

Based on verified Phase 4. Navigation and Sky180FlipEngine behavior remain
unchanged at the presentation layer.

## Change

Renderer now prepares the complete destination spread before calling
Sky180FlipEngine.next(), previous(), or goTo(). This means both canvases of a
two-page spread are ready before StPageFlip begins the transition.

The background render queue remains in place for pages outside the immediate
destination spread.

Priority model:

1. Current visible spread
2. Destination/next spread — synchronously prepared before movement
3. Previous spread
4. Nearby background pages

## Goal

Avoid blank right-hand pages, delayed content appearance, and jitter caused by
a canvas becoming visible while its PDF render is still in progress.

## Unchanged

- Cold-start lifecycle
- Final-spread behavior
- Mouse-wheel navigation
- Control-bar navigation
- PageUp/PageDown
- Continue Reading
- Resume
- Book switching
- Sky180FlipEngine/StPageFlip integration
- Cover-to-first-spread visual gap (still deferred)
