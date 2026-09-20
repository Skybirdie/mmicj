# SkyReader Phase 3.1

- Current page is the first/left page of the visible spread.
- Cover is page 1; spreads are 2–3, 4–5, 6–7, etc.
- StPageFlip remains private to `sky180flipengine.js`.
- Resume is captured before opening so page 1 cannot overwrite the saved position.
- Continue Reading stores/displays the spread-start page.
- Click the page indicator to enter a specific PDF page. Entering 7 opens the 6–7 spread.
- SRNavigation owns keyboard/wheel page navigation. StPageFlip owns physical page swipes.
- UI no longer uses the old Animation.pageTurn() path for page navigation.
