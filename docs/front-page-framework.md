# SkyMedia Front Page Framework

The Front Page is a separate top-level visual portal rather than a variation of the Reader, Video Viewer, or Slideshow Viewer layouts.

## Current artwork

- `assets/front-background.gif` — lowest visual layer.
- `assets/front-frame.png` — transparent decorative overlay above the seven doors.
- The frame has `pointer-events:none`, so it cannot prevent a door beneath it from receiving a click.

## Seven doors

The Front Page currently defines seven category slots using temporary names:

- Category 1
- Category 2
- Category 3
- Category 4
- Category 5
- Category 6
- Category 7

Replace these in `js/frontPage.js` with the seven production categories when they are supplied. The `FrontPage.setCategories()` API also accepts exactly seven category names at runtime.

## Selection rules

For each configured category, the Front Page finds the newest currently visible item across the Reader, Video Viewer, and Slideshow Viewer collections. Visibility is governed by the shared `YYYYMMDDHHmm` contract date.

The newest item across all seven category winners becomes the centerpiece. The other six category winners are shuffled and assigned to the six peripheral positions on each Front Page render. Thus every configured category is represented exactly once whenever each category has at least one visible item.

## Navigation

A door opens the item in its originating section. Reader items use the Reader library, video items use Video Viewer, and slideshow items use Slideshow Viewer.

The existing section switchers now include a temporary `Home` button so the Front Page can be reached again after entering a section. This can be replaced with the final navigation design later.

## Scheduling

The Front Page uses the same visibility rule as the three media sections:

`date <= current local YYYYMMDDHHmm`

`dateAdd` remains the historical entry/upload timestamp and is not used as the publication date. This separation is intentional and will support the later public portal and scheduling system.

## Responsive strategy

The supplied frame artwork has an aspect ratio of approximately 1.768:1. The interactive Front Page stage preserves that ratio and is centered inside the viewport. The background GIF fills the complete viewport independently. The current door geometry is an initial alignment framework; the exact production geometry can be refined once the seven category thumbnails and final navigation elements are known.
