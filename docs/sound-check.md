# Sound check (Settings -> "Test sounds")

A **Test sounds** button sits directly under *Sound volume* in Settings (`.sr-settings-body`). One tap runs everything by itself (about 4-8 seconds), then shows a short result list,
asks one question and offers **Copy report**, the same way the speech check works for read aloud. The report is what to ask a reader to send when sounds are silent on their device.

## What the panel shows (soundCheck.js 1.0.1)
Directly under the button, top to bottom: the progress / result line (small gap above it), a tiny plain **See details / See less** toggle (chevron only, no border or colour; the per-stage rows are collapsed until asked and keep their open/closed state while the test runs), and, once finished, "Did you hear any sounds just now?", one row of **Yes / No / Copy report**, then "If something went wrong, tap Copy report and send it to us." The chosen Yes/No stays marked and can be changed. The detail rows use 11.5px text with 14px between them.

## What runs (no further taps)
1. **Device**: browser, installed-app mode, whether sounds are switched on (Settings -> Page-turn sound), the volume, whether the page can set volume at all (iPhones ignore it), the autoplay policy, audio context, iOS audio session.
2. **Sound files**: *every* app sound registered in `js/audio.js` (select, curl, five page turns, close, library open) plus the slideshow effect and its fallback are **played silently**. That proves the file is there, decodes and plays, and the app's own preload state is read too. No sound is made.
3. **Slideshow music**: the list (`assets/slideshowMusic/manifest.json`) is read and each track is started silently for a moment (the download is cut as soon as it plays).
4. **Audible** (the only part that makes noise, about 4 seconds): one page turn through the app's own sound code, three quick turns (they must overlap), then the slideshow effect **started with no tap**, which is how a slideshow that advances by itself plays it.
5. **One question**: "Did you hear the sounds just now?" Yes / No.

Videos have no sounds of their own (they play the video's soundtrack), so there is nothing to test for them here.

## Reading a report
- *Files: BAD* = the file is missing or will not decode on that device (name and reason given). *App preload FAILED* = the app's own copy of that sound did not load.
- *Page turn: REFUSED ... NotAllowedError* = the browser blocked it. *Quick turns: 2 of 3* = overlapping plays are being cut off.
- *Slideshow effect, started with no tap: REFUSED ... NotAllowedError* while the page turn worked = this phone (typically iPhone) blocks sounds that no tap started: a slideshow that moves on by itself will be silent. Patch candidate: start the slideshow sound from the Play tap.
- Everything OK but *Heard: NO* = the device is not producing sound: volume, ring / silent switch, Bluetooth output, another app holding the audio. The report prints a hint.
- *sounds muted: true* or *volume: 0%* = the reader has switched sounds off in Settings.

## Cost
Zero Worker requests, nothing stored, nothing sent. The only request beyond the sound files is the small music list the slideshow reads anyway. Static files are free on Cloudflare.

## Files
- `js/soundCheck.js` (new): the check, its result panel and the report.
- `js/audio.js` (1.2.0): two additions, `AudioController.info()` (each sound's file and load state, so a new sound is picked up automatically) and `AudioController.playChecked(name)`
  (like `play()` but reports the browser's refusal). `play()` itself is unchanged and still swallows refusals.
- `js/settingsPanel.js`: the button and result box (hidden if `soundCheck.js` did not load). `css/style.css`: one spacing rule, the sticky Settings header (the close button stays at the top while the menu scrolls) and a scroll margin so a finished check is not hidden behind it. `index.html`: loads `soundCheck.js`; version numbers bumped.
- The slideshow constants at the top of `soundCheck.js` must match `js/slideshowViewer.js`; `node soundCheck.test.mjs` checks that, the wiring, and runs the real `audio.js` and `soundCheck.js` against a fake browser
  (healthy device, muted, volume 0, missing file, blocked playback, iPhone "not heard", no music list, no clipboard).

## Fullscreen button label
The Settings "Enter fullscreen / Exit fullscreen" label is now read from `document.fullscreenElement` (the same test the toggle uses) and refreshed on every `fullscreenchange`. Before, it re-read `UI.isFullscreen()` right after the click, before js/ui.js's `fullscreenchange` listener had updated it, so the words lagged one change behind.

## Noticed while building it (nothing changed)
- `.sc-box` (a bordered card style) is defined in soundCheck.js but the result box is never given that class, so the results sit directly on the Settings background. Left as is.
- `libraryOpen` (`open.mp3`) is registered with `playOpen()` but nothing in the app calls it.
- The slideshow plays its effect at full volume with its own Mute; every other app sound uses the app's 35% volume and the Settings sound switch.
