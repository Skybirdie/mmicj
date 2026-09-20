# SkyReader Phase 3.3

## Fixes

- Navigation next/previous now mean next/previous magazine spread.
- PageUp/PageDown and arrow keys route through SRNavigation.
- Sky180FlipEngine synchronizes its current page from StPageFlip getCurrentPageIndex() when the flip settles.
- The page container no longer contains the obsolete single-page canvas/loading elements.
- Resume behavior is preserved from Phase 3.2.

## Spread model

With `showCover: true` and landscape mode, SkyReader uses:

- page 1 as the cover
- pages 2-3 as the first spread
- pages 4-5 as the second spread
- pages 6-7 as the third spread

Sky180FlipEngine remains the only module that references StPageFlip.
