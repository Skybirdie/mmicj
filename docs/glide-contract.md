
> **C3.1 migration note:** The authoritative content shape is now `id`, `type`, `title`, `subtitle`, `thumbnail`, `media`, `audio`, `author`, `category`, `date`. Books use `media` as a PDF URL; videos use `media` as a video URL; slideshows use `media` as an image URL array or a single PDF/image URL. `source`, `slides`, `book`, `video`, `slideshow`, `pageCount`, `slideCount`, `videoLength`, and `dateAdd` are not required in the Glide contract. The runtime adapter may expose compatibility projections for existing engines.

# SkyMedia Unified Content Contract C3.0

SkyMedia now uses one manifest for Reader, Video Viewer, and Slide Show Viewer.

## Canonical Glide payload

Glide should supply the same structure used by `content.json`:

```json
{
  "version": "1.0",
  "content": [
    {
      "id": "book-001",
      "type": "book",
      "title": "Example Book",
      "subtitle": "Sample",
      "thumbnail": "assets/thumbnails/book.jpg",
      "category": "Booklet",
      "dateAdd": "202609020901",
      "date": "202609020901",
      "author": "unknown",
      "book": {
        "url": "pdf/example.pdf",
        "pageCount": 11
      }
    },
    {
      "id": "video-001",
      "type": "video",
      "title": "Example Video",
      "thumbnail": "assets/thumbnails/video.jpg",
      "category": "Videos",
      "dateAdd": "202609020902",
      "date": "202609020902",
      "author": "Author",
      "video": {
        "url": "https://example.com/video.mp4",
        "length": "12:34"
      }
    },
    {
      "id": "slideshow-001",
      "type": "slideshow",
      "title": "Example Slideshow",
      "thumbnail": "assets/thumbnails/slideshow.jpg",
      "category": "Slideshows",
      "dateAdd": "202609020903",
      "date": "202609020903",
      "author": "unknown",
      "slideshow": {
        "source": "images",
        "slides": [
          "slides/01.jpg",
          "slides/02.jpg",
          "slides/03.jpg"
        ]
      },
      "audio": {
        "url": "audio/example.mp3",
        "type": "background",
        "autoplay": true,
        "loop": true
      }
    },
    {
      "id": "slideshow-002",
      "type": "slideshow",
      "title": "PDF Slideshow",
      "thumbnail": "assets/thumbnails/slideshow-pdf.jpg",
      "category": "Slideshows",
      "dateAdd": "202609020904",
      "date": "202609020904",
      "author": "unknown",
      "slideshow": {
        "source": "pdf",
        "url": "slides/example.pdf"
      }
    }
  ]
}
```

## Counts are advisory metadata

`pageCount` and `slideCount` are **not authoritative**.

SkyMedia keeps the supplied value as:

- `declaredPageCount`
- `declaredSlideCount`

and corrects the live value when reliable evidence is available.

### Books

When a PDF is opened, PDF.js reports the actual number of pages.

```text
declared pageCount → retained for diagnostics
actual PDF pages   → book.pageCount
```

### Image slideshows

The number of valid entries in `slides[]` is authoritative immediately.

```text
slideCount = slides.length
```

Therefore a record claiming `slideCount: 2` while containing four images is automatically corrected to `4`.

### PDF slideshows

The PDF is opened lazily when the user selects it. PDF.js reports the actual page count and SkyMedia changes the live `slideCount` to that value.

This permits a single multi-page PDF to function as a complete slideshow.

## Source mismatch recovery

The contract is deliberately tolerant.

Examples:

- `source: "pdf"` + `.jpg` URL → treated as an image slideshow.
- `source: "images"` + `.pdf` URL → treated as a PDF slideshow.
- image slideshow with `url` but no `slides[]` → the URL becomes a one-slide sequence.
- Markdown-wrapped Glide URLs such as `[url](url)` are unwrapped.
- string counts are converted to numbers where possible.
- missing `date` falls back to `dateAdd`.
- missing `dateAdd` receives the current timestamp.

Invalid content without a usable source is omitted and reported in the browser console rather than crashing the complete application.

## Glide transport

The adapter supports:

- `window.SkyReaderGlideContract`
- `window.SkyReaderContract`
- `window.GLIDE_BOOK_CONTRACT`
- `window.SkyMediaContract`
- `?contract=...`
- `?books=...`
- `?contractz=...`

`contractz` continues to use the existing `sr2.` compressed transport.

## Viewer boundary

The application follows:

```text
Glide / content.json
        ↓
   GlideContract
        ↓
   ContentContract
        ↓
     Manifest
        ↓
 ┌──────┼─────────┐
 ↓      ↓         ↓
Reader Video   Slideshow
```

The viewers do not need to know whether their content came from Glide or the local test manifest.
