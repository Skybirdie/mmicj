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

Update 1.6 (first/last page "cover boards")  [built on your edited bookStack.js: DEFAULT_ENABLED=true,
MIN_TOTAL_PX=6, PX_PER_PAGE=0.15, LEAF_PX=2.0 are kept]
- The outermost page of each stack (page 1 on the left, the last page on the right) is drawn as a separate
  cover board: darker, crisp (hard 1px dark line next to the leaves, 1px highlight on the outer edge, tight
  hard shadow, no blur/filter), a bit thicker than a leaf, and it sticks out past the top and bottom of the
  page (it does not taper like the leaves).
- When only the cover sits behind a side (spread 1, or the last-but-one spread), that side shows just the board.
- Covers follow the same rules as the stacks: hidden beside an empty synthetic page, held until a turn
  settles, cleared fast when turning onto an empty side, hidden while zoomed/rotated.
- Tune in js/bookStack.js: COVER_PX, COVER_PX_SINGLE, COVER_OVERHANG_PX. Colours: --sky-stack-cover,
  --sky-stack-cover-hi, --sky-stack-cover-lo in css/reader.css (separate values for dark theme).
- New: BookStack.sideCounts() (pure; unit-tested).

Update 1.7 (cover board geometry)
- The cover board now has exactly the stack's height (no vertical overhang). COVER_OVERHANG_PX is removed.
  (The old overhang was clamped to the space above/below the book, which is 0 when the book touches the top or
  bottom of the viewer, so changing it did nothing there.)
- The board juts out sideways instead: COVER_PX 2.4 -> 3.8 (desktop), COVER_PX_SINGLE 1.6 -> 2.4. A leaf is
  LEAF_PX (2.0) wide, so the board is ~1.8px (desktop) thicker than a page. Raise/lower COVER_PX to taste.

Update 1.8 (cover board continues the slope)
- The cover board is no longer full page height (it looked like a tall post). It now behaves as one more page of
  the stack: it starts at the height of the furthest leaf's outer edge and tapers at the same angle across its own
  width, so the perspective slope continues smoothly. It is still darker, crisp (hard 1px lines, hard shadow) and
  thicker than a leaf (COVER_PX / COVER_PX_SINGLE), so it juts out sideways a little more.
- When only the cover sits behind a side (no leaves), it sits straight against the page edge.
- New: BookStack.outerInset() (pure; unit-tested). The board is now a wrapper plus an inner board element so the
  hard shadow follows the sloped outline.

Update 1.9 (flat, white cover page)
- The cover page no longer tapers: it starts at the height of the furthest leaf's outer edge and runs straight out
  from it, with a flat top and bottom (it is still thicker than a leaf, COVER_PX / COVER_PX_SINGLE).
- It is now a bright, slightly warm white page (it catches the light), with hairlines on both long edges and a
  hard shadow. Colours in css/reader.css: --sky-stack-cover (face), --sky-stack-cover-lo (hairline against the
  leaves), --sky-stack-cover-hi (hairline on the outer edge, now a faint warm grey), separate dark-theme values.

Update 2.0 (softer colours, coarser stack)  [CSS based on the reader.css you uploaded]
- Cover page: soft warm off-white (#fffaf0; dark theme #efe9da), brighter than the leaves but not stark, with
  softer hairlines on both long edges (--sky-stack-cover-lo / -hi).
- Inner shadow beside the page halved (.34 -> .17) for the whole stack.
- Stack outline is now coarser and less regular: each leaf's taper varies (STEP_VAR), consecutive leaves meet with
  a tiny notch (NOTCH), top and bottom differ very slightly (BOTTOM_VAR), and the left and right stacks use the
  pattern at different offsets. The average slope is unchanged (LEAF_INSET_RATIO).
- Tune in js/bookStack.js: LEAF_IRREGULARITY (0 = smooth, 1 = as designed, 2 = exaggerated).
- The cover still starts at the furthest leaf's outer edge and runs flat from there.
- API: outerInset(n,leafPx,side) now returns {top,bottom}; new leafGeometry(n,leafPx,side) (pure; unit-tested).

Update 2.1 (cover asymmetry)
- Front cover (left stack) sticks out slightly less at its bottom; last page (right stack) slightly less at its top.
  Tune in js/bookStack.js: COVER_LEFT_BOTTOM_TRIM_PX and COVER_RIGHT_TOP_TRIM_PX (1.2px each; 0 = symmetric).
- New pure helper BookStack.coverInsets(n,leafPx,side) (unit-tested).

Update 2.2 (trim diagnostics)
- Verified: in this build changing COVER_LEFT_BOTTOM_TRIM_PX / COVER_RIGHT_TOP_TRIM_PX moves the cover edges 1:1
  (trim 0 -> 6 shortened the left cover's bottom and lowered the right cover's top by exactly 6px).
- Default trims raised 1.2 -> 3px (1.2px was lost in the natural leaf irregularity).
- If an edit to a constant shows no change, the browser is probably serving a cached copy of js/bookStack.js:
  bump the ?v= on its <script> tag in index.html after every edit (or hard-refresh / disable cache in DevTools).
  Check which build is running with BookStack.info() in the console (version should match the file).
- Live tuning without editing files: BookStack.tune({coverLeftBottomTrim:6, coverRightTopTrim:6, coverPx:4.5})
  (lasts until reload; copy the values you like into the constants).

Update 2.3 (horizontal cover slant)
- The cover page now also slants sideways (this is a change in how far it juts out, not in its height):
  the front cover (left stack) juts out less at its BOTTOM edge than at its top edge; the last page (right stack)
  juts out less at its TOP edge than at its bottom edge. The edge against the leaves stays put; only the outer edge
  slants, so the cover board is a slim trapezoid. The vertical trims from 2.1 are unchanged.
- Tune in js/bookStack.js: COVER_SLANT_RATIO (0.35 = the narrow end is 35% thinner than the wide end; 0 = straight;
  capped at 0.6). Live: BookStack.tune({coverSlantRatio:.5}).
- New pure helpers BookStack.coverSlantPx(coverPx) and BookStack.coverShape(coverPx,side) (unit-tested).
- Bump ?v= on the bookStack.js tag (now 2.3).

Update 2.4 (cover gradient)  [CSS only: css/reader.css]
- The cover page and last page now have a diagonal gradient instead of one flat colour. Front cover (left stack):
  lighter at the top, darker at the bottom (135deg, i.e. the 45deg diagonal pointing down). Last page (right stack):
  darker at the top, lighter at the bottom (45deg). Hairlines and the hard shadow are unchanged.
- Tune in css/reader.css: --sky-stack-cover-light / --sky-stack-cover-dark (separate values for the dark theme).
  Same value for both = flat colour again. --sky-stack-cover is kept as the fallback face colour.
- No JS change, so bookStack.js stays at 2.3; hard-refresh (or bump the ?v= on the reader.css link in index.html) to see it.
