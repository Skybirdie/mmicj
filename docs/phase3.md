# SkyReader Phase 3 — Navigation → Sky180FlipEngine

## Changes

- Navigation no longer calls `Animation.pageTurn()`.
- Navigation uses the 1-based SkyReader page model.
- `Home` goes to page 1; `End` goes to the final PDF page.
- Navigation busy checks use `Sky180FlipEngine.busy()`.
- Document-level touch navigation is no longer registered; StPageFlip owns touch/swipe page turning.
- `Reader.goTo()` returns the renderer promise.
- `Renderer.goTo()` prepares the requested PDF page and then asks `Sky180FlipEngine` to move there.
- `Reader` receives page changes from Renderer and forwards page-change notifications to `AudioController`.
- Sky180FlipEngine starts page-turn audio when StPageFlip enters the real `flipping` state, including mouse/touch flips.
- The old `Animation` module remains in the project for other animation responsibilities, but it is no longer part of the page-turn navigation path.

## Navigation flow

Next/previous:

`Toolbar / keyboard / wheel → SRNavigation → Reader → Renderer → Sky180FlipEngine → StPageFlip`

Direct swipe:

`User swipe → StPageFlip → Sky180FlipEngine → Renderer → Reader`

Programmatic go-to:

`Search / TOC / bookmark → SRNavigation → Reader → Renderer → Sky180FlipEngine → StPageFlip`

## Important

Do not remove `animation.js` yet. Other UI code still references `Animation`, and Phase 3 only removes it from the page-turn path.
