# Read aloud ("Listen")

A button in the Reader toolbar (headphones resting on a book) reads the open book aloud with the device's own voices.

## Showing the button (testing phase)
The button is **visible by default** (`const SHOW_BUTTON_BY_DEFAULT=true;` at the top of `js/readAloud.js`) on browsers that can speak.
A reader can switch it off with *Show Listen (read aloud) button* in Settings (gear); the choice is kept in this browser, and a reader who
has ticked or unticked the box keeps their own choice. To hide it for everybody again (e.g. while testing something new), change that one word to `false`.

## Arrows
An arrow between two points is a step from one to the next and is never described ("rightward arrow"). `Settings → General`, `Menu --> Settings`,
`A => B`, and a spaced `>` between two words (`Settings > General > Software Update`) are said as a short pause plus a word: "Settings, then General, then Software Update".
Arrows pointing any other way (`←`, `↔`) are only a pause. A `>` between numbers (`5 > 3`) is left alone. Word's autocorrect turns a typed `-->` into `→`; both work.
To change the word, or to use a pause only, edit `api.arrowSays` in `js/readAloudRules.js` ("then", or "" for a pause only).

## Speech check (the speech test document)
One document in the library is the **speech test document** (`read-aloud-speech-test-....pdf`, library id `book-mwb6vj0c-dl8l`). Only while it is open,
tapping Listen also shows a small **Speech check** panel with a *Copy report* button. Every other document keeps the short notices.
The panel reports each stage on its own, so a reader can tell the admin exactly where it fails:
1. **Page text**: did the browser's PDF engine return text (how many items and characters), or did it throw (the exact error)? This stage runs before any speech.
2. **Voices**: how many the device lists, and which one is used.
3. **Speech**: did the first words start (and after how long), or which error code came back.
The report (and the panel) also gives the browser, the pdf.js version and build (standard or legacy), and the browser features this device lacks
(`Promise.withResolvers`, `Array.fromAsync`, `ReadableStream` async iteration ...): a missing one is a lead, not proof. Where the clipboard is not available the report is shown in a box to select and copy by hand.
- **Which document gets it:** `api.diagnosticBooks` at the top of the "SPEECH CHECK" section in `js/readAloud.js`: the library ids, plus a file-name stem
  (`read-aloud-speech-test`), so a re-upload (new hash in the name) or a changed id still works. No need to rename the id in `published.json`;
  to add another document, add its id to that list.
- Page text that could not be read is no longer remembered as an empty page: it is asked for again the next time.
- In every document, "the engine failed on this page" now says **"Couldn't read this page's text."**; "No readable text here." is kept for pages that really have no text.
Test: `node readAloud.test.mjs` (the "speech check" section).

## Share Mode
A book opened through Share Mode (`js/shareViewer.js`) has the Listen button too: it is the first button in the Share Mode toolbar, left of Mute,
with the same behaviour and the same Settings choice (a reader who switched Listen off sees no button there either). Videos and slideshows
have no Listen button. Two things make this work and should be kept:
- `bindBookControls()` in `shareViewer.js` moves the **same** `#listenButton` element into the toolbar. Do not `replaceButton()` it: a copy would lose read aloud's click handler.
- Share Mode swaps the Mute button for a copy, so read aloud watches clicks on `#muteButton` through the document, not on the button itself.
`css/share.css` (last section) keeps a hidden Listen button hidden and gives it the "listening" colour and the loading pulse inside Share Mode.
Test: `node share-listen.test.mjs` (wiring checks; the button itself needs a quick look on a phone, see the checklist in the reply that came with this change).

## Cost
Zero. Nothing is sent anywhere and no extra request is made: the text of a page comes from the PDF the Reader already has open
(pdf.js `getTextContent`), and the voice is the browser's built-in `speechSynthesis`. Only the page(s) on screen are asked for,
never the whole book, so a large PDF is not pulled down in advance. Taps on the button are counted as the `reader_listen`
feature in the usage figures, like every other toolbar button.

## What the reader sees
- Tap the headphones: reading starts from the page(s) on screen (one page on a phone, two on a desktop spread).
- It turns the page by itself (silently) and carries on to the end of the book.
- Tap again to pause; tap again to resume from the start of the sentence it stopped in.
- Turn the page or jump by hand: it stops at once and carries on from the new page.
- Closing the book, opening another, leaving the Reader section, or pressing Mute stops it.
- Settings (gear) has "Listen speed" and "Listen voice" (a voice marked "online" needs a connection). Changing either plays a short sample.
- The toolbar hides itself after 10 s of no touch or mouse movement, as it always did; tap or move to bring the button back.

## How the text is tidied (js/readAloud.js)
Lines are joined into paragraphs; words split across lines are repaired; bullets, private-use bullet glyphs, dot leaders,
web addresses, page numbers and headers/footers that repeat from page to page are dropped (a repeated header is read once);
each slide title / bullet ends with a pause. The text is cut into sentences of at most 220 characters, which also avoids a
Chrome bug that silences long speech.

## How things are said (js/readAloudRules.js)
This is the file to edit when something is read the wrong way. It only changes what the voice is given, never what is shown.
Each rule has a short, commented list at the top of the file.

- **Words**: `MMICJ` is always spelled out letter by letter (written "em em eye see jay" for the voice), wherever those letters appear and in any case
  (MMicj, mmicj, MMICJ, mmicj.com, MMICJs, even with a space between the letters). `mmicj.com` -> "em em eye see jay dot com" (the dot is said as a word, apart from the name: a voice that meets "jay.com" spells the word out as j-a-y), `Liburd` -> "Lie bird", `Naphatali` -> "Naff tah lee" (written "Naff", a real word, because some iPhone voices spell out an unfamiliar
  three-letter token like "Naf" as letters).
  Add a name as `["Written", "how it sounds"]`; add `{anywhere:true}` as a third item to replace it inside other words too.
- **Abbreviations**: `e.g.` -> "for example", `i.e.` -> "that is", `etc.` -> "et cetera", `Dr.` -> "Doctor", `p.` -> "page" and so on.
  Dotted capitals not listed (`U.S.A.`, `N.B.`) are spelled out as letters ("U S A").
- **Colons, semicolons, dashes** are never spoken, in any form (`: ; - -- en/em/figure dashes`, full-width colon). They become a short pause (a comma).
  A title that ends in a colon ends with a full stop. In `10:30` and `John 3:16` the colon is dropped ("10 30", "John 3 16");
  `5-10`, `1914-1918` and `3:16-18` are read "5 to 10", "1914 to 1918", "3 16 to 18"; a hyphen inside a word (`well-known`, `COVID-19`) is silent ("well known").
  A minus sign in front of a digit (`-5`) is left to the voice.
- **Lists**: "apples, pears and oranges" -> "apples, pears, and oranges". Sentences that open with an introductory word or phrase
  ("However, he and she ...") are not treated as lists.
- **Numbers at the start of a sentence** (1 to 3 digits, `3:16`, `(1)`) are spoken on their own, followed by a real silent gap
  (`gaps.number`, 800 ms, longer than the paragraph gap): "16" ... "For God so loved ...". Not touched: numbered books
  (1 Peter, 2 Kings), dates (5 November), times and eras (10 a.m., 70 AD) and numbers of 4+ digits (2024 was ...).
- **Superscripts** (footnote and verse numbers, as special characters or as small raised text in the PDF) are followed by a full stop.
  `m²` / `m³` are read "squared" / "cubed". `1st`, `2nd` written with raised letters stay ordinary.
- **Ornamental symbols** (stars, diamonds, dingbats, emoji, `*`, dagger, `|` ...) are never described. At the start of a line they
  act as a bullet (a new item); anywhere else as a full stop. A line made only of ornaments is a separator. Mathematical signs
  (`+ - = < > % x`), currency and the degree sign are left to the voice. (handled in `readAloud.js`)
- **Pauses**: a real silent gap (`gaps.paragraph`, 450 ms, a little shorter at higher speeds) follows every paragraph, title, bullet
  and line that stands alone. Lines that wrap inside one paragraph are not separated. Lines with a visible gap between them
  (more than 1.4 x the page's usual line spacing) count as separate paragraphs.

The file is optional: if it is missing, the text is still spoken as tidied, and superscripts still get a full stop.

**Always enforced.** Whatever happens (rules file missing, a rule throwing an error), the very last text handed to the voice goes through
`enforce()` (in `readAloudRules.js`, with a smaller built-in copy in `readAloud.js`): MMICJ is spelled out and no colon, semicolon or dash is left in it.

## If the device's speech engine rejects the voice
If the engine reports a voice / language / synthesis error, Listen starts that piece again with a more cautious setup, up to three times
(1: the device's default voice; 2: a voice picked to match the phone's language; 3: the same at normal speed, one piece at a time) and carries on in order.
If speech still fails, the notice is kept short: "Speech is not working. Check device settings." The error code and the number of voices
the device reports are written to the browser console (`[ReadAloud] speech failed: ...`) for debugging.
Other notices: "Speech was blocked. Tap Listen again." (browser blocked speech), "Audio is busy. Close other apps and tap Listen."
(another app is using sound), "No readable text here." (three spreads in a row with no text on them), "Couldn't read this page's text." (the browser's PDF engine failed on the page, which is not the same as there being no text), "Finished reading."

## Limits
- A page with no text layer (a scan, a picture) is skipped; three empty spreads in a row stop with a note.
  Scanned books need OCR first, on the admin side, so readers' devices are not burdened.
- Voice quality and languages are whatever the device has. iPhones stop speaking when the screen locks; the button then shows "paused".
- Not in shared-book links: the share view builds its own four-button toolbar (Mute, Share, Fullscreen, Close).
- Reading order follows the order the PDF stores its text. PDFs exported from Word and PowerPoint are normally right; unusual layouts may not be.

## Files
- `js/readAloud.js` (new): text tidying, speech loop, button, state.
- `js/readAloudRules.js` (new): how things are said (see above). `readAloudRules.test.mjs`: `node readAloudRules.test.mjs` (also covers the loop, the number gap, the safety net and the button setting).
- `js/renderer.js`: `Renderer.pageText(n)` (page text from the open PDF).
- `js/reader.js`: `emit()` now also dispatches `skyreader:<event>` DOM events (the single-slot `Reader.on` callbacks are unchanged).
- `js/settingsPanel.js` ("Show Listen button" checkbox), `css/style.css`, `css/reader.css`, `index.html`, `js/analytics.js`: button, settings rows, styling, usage count.
- `readAloud.test.mjs`: `node readAloud.test.mjs`. `share-listen.test.mjs`: `node share-listen.test.mjs` (Share Mode wiring).
