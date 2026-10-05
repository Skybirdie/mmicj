# Page-stack ("thick book") - desktop spreads and single-page (mobile) mode

Off by default. Turn it on with Settings -> "Page edges (book thickness)"
(per browser), or open the app once with ?pagestack=1 (?pagestack=0 turns it off).

Files changed: index.html, css/reader.css, js/settingsPanel.js, js/sky180flipengine.js (1.6.5)
New: js/bookStack.js, bookStack.test.mjs (run: node bookStack.test.mjs)

How it works: a pointer-events:none overlay sits behind StPageFlip's wrapper inside the
engine's private host, with a left and right stack of page edges. Thickness follows the
current spread (left grows, right shrinks), eases during a turn, and is 0 on the
cover's left and the last page's right. Hidden in single-page (mobile) and two-page-document
modes. The engine calls it from 5 guarded one-line hooks (ready, read, flipping, resize, close).

Known limits: the stack is drawn in the margin around the book, so when the window is so
narrow that the book fills the full width there is no room and it shrinks to nothing.
The settings row also appears in the shared Video/Slideshow settings panel.
Not yet tested in your live app (pdf.js, embedded videos, Share mode, Apple devices).

Rollback: remove the bookStack.js <script> tag, or leave the setting off.

Update 1.1 (cover/last-page timing): a side with no real page never shows a stack.
- Turning onto the cover (or onto the last page of an even-length book): the stack on the empty side clears in ~0.12s.
- Turning away from the cover (or last page): that side stays at zero for the whole turn and eases in once the turn has settled.
- Direct page jumps (Go button) update the stack instantly.

Update 1.2 (single-page / mobile mode)
- Single-page mode now shows a thin stack on each side (pages read on the left, pages ahead on the right).
- The page fills the phone's width, so the stack is drawn in #viewerArea's own padding gutter
  (8px on phones <=480px, 14px <=700px, 24px <=1000px). No layout change; if a gutter is 0 (some Share-mode
  layouts) that side simply shows nothing.
- Hidden while the reader is zoomed, panned or rotated (also now true on desktop, where the stack would
  otherwise be mispositioned while zoomed). It returns automatically when the transform is back to normal.
- Engine: direct page jumps now read the real current spread (also fixes single-page jumps).
- Two-page-only PDFs (twoPageDocument) still never show a stack.

Update 1.3 (individual pages in the stack)
- Each stack is now built from separate "leaves" (about one per 2.6px on desktop, 1.7px in single-page mode,
  up to 10), each with a hairline edge, slightly different paper tone, and a stepped top/bottom end so the
  stack reads as separate pages. Leaves are percent-positioned, so they scale smoothly during a turn, and are
  rebuilt only when the leaf count changes.
- Stacks are a little thicker overall so there is room for the leaves: desktop MAX_TOTAL_PX 14->18,
  PX_PER_PAGE .14->.2; single-page SINGLE_MAX_TOTAL_PX 10->14 (still capped by the phone's padding gutter).
- Tune in js/bookStack.js: LEAF_PX, LEAF_PX_SINGLE, LEAF_INSET_STEP (how stepped), MAX_TOTAL_PX.
  Colours: --sky-stack-paper / --sky-stack-line in css/reader.css.

Update 1.4 (perspective)
- Each leaf further from the page is shorter, top and bottom, so the stack's outline slopes down from the top
  of the current page and up from its bottom. The step is proportional to the leaf width
  (LEAF_INSET_RATIO = 0.75 in js/bookStack.js; larger = steeper, 0 = off), with a tiny fixed irregularity.
- Replaces the earlier LEAF_INSET_STEP constant. Colours/thickness unchanged.

Update 1.5 (cover looked flat)
- Cause found: on shorter magazines the cover's stack was only 1 leaf, and one leaf has no step to show a slope.
- Each leaf now also tapers across its own width, so the outline is a continuous slope even with 1-2 leaves,
  and a stack of 3.2px or more always shows at least 2 leaves.
- The stack re-measures whenever the host, book block or viewer is resized (ResizeObserver), using fresh bounds
  from the engine, and the engine re-syncs 300ms and 1200ms after the book opens, so it never keeps a
  pre-layout measurement on the cover.
