# Front Page forms: Join and Testify!

A small button (two people and a plus sign, light-teal gradient) sits immediately left of the share button.
Tapping it opens a little menu above it with **Join** and **Testify**. Each opens a form window
(a centred window on wide screens, a bottom sheet on phones).

## Files in this update
| File | Change |
|---|---|
| `js/frontForms.js` | NEW. The menu, both forms, the confirmation windows, the security check and the uploads |
| `css/front-forms.css` | NEW. Button position and look, menu, windows (light and dark) |
| `index.html` | 3 small additions: the stylesheet link, the `#frontFormsButton` markup inside `#frontPage`, the script tag (and `birthdayParty.js?v=bp6`) |
| `js/birthdayParty.js` | The birthday row now stops at the left edge of whichever button is further left (the new button or the share button) |

Nothing else changed. The front page, share panel, service worker and Worker are untouched.

## Settings (top of `js/frontForms.js`)
* `INTAKE_URL` = `https://mmicj-intake.meditation-mornings-icj.workers.dev`
* `TURNSTILE_SITE_KEY` = your public site key. Leave it `""` only for local testing (the Worker then must not have `TURNSTILE_SECRET`).

## How it behaves
* **Nothing is sent until the final button.** Typing, choosing files and opening or closing the window stay in the browser.
  Join sends on **Join**. Testify sends on **Send, then Yes, send it** (the second step is the confirmation).
* **Nothing is loaded with the front page** except the small button, one stylesheet and this script.
  The security check (Cloudflare Turnstile) loads only when a form is first opened.
* **Join:** name (required), birthday as month and day (optional), email and phone (optional), consent box.
  Confirmation: "Welcome to the MMicj garden! Let's grow together."
* **Testify!:** Title and Name or nickname (required), Description, Media upload (photo, video or PDF, type detected from the file),
  Audio upload (switched off, with a note, when the media is a video), "Share anonymously" (only the admins ever see the name).
  Text alone, a file alone, or both are fine. There is no date or release field: the time is stamped by the Worker and every
  testimony is a draft until an admin decides.
* **The security check heals itself.** If its token expires or the widget goes missing, tapping Send (or Join) rebuilds it and carries on automatically. No page refresh needed.
* **On desktops** the windows open toward the right side of the screen. On phones they are a bottom sheet.
* **Files** go straight from the phone to R2 with a progress bar. The window cannot be closed while sending.
  If a send fails, **Try again** resumes without losing what was typed or chosen.
* **After sending** the form is emptied, and the confirmation window shows (Testify: "Your testimony has been sent." and Revelation 12:11 (KJV)).
* Limits (the Worker enforces them again): photo 15 MB, video 200 MB, PDF 25 MB, audio 25 MB, description 5,000 characters.

## Before it works live
1. Deploy the app as usual (these are plain static files).
2. In Turnstile, the widget's hostnames must include every address the app is served from (`mmicj.com`, `mmicj.meditation-mornings-icj.workers.dev`).
3. The intake Worker's `ALLOWED_ORIGINS` (default already lists both) and the private bucket's CORS rule must include the same addresses.
4. Try it: send a test Join and a test text Testify from the app. In the Cloudflare dashboard, open R2, then `mmicj-portal-private`, then `inbox/`.
   You should see `members/<id>/entry.json`, `testimonies/<id>/entry.json` and `latest.json`. Delete the test entries there afterwards.
   (The portal's Inbox screen is the next step.)
5. Try one photo or audio testimony too: it checks the R2 upload settings (CORS and the access key) end to end.

## If something looks wrong
* **"Not allowed from here":** the page's address is missing from `ALLOWED_ORIGINS`.
* **"We could not confirm you are a person":** the Turnstile hostnames or secret do not match the site key.
* **Text sends but a photo / audio does not:** the private bucket's CORS rule or the R2 access key / account id settings on `mmicj-intake`.
* **The birthday row sits under the new button:** make sure `birthdayParty.js?v=bp6` is the deployed file.
