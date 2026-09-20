# Video Viewer Layout Cleanup

The video viewer now uses one coherent layout model.

- The video library remains transparent.
- Library scrollbars use semi-transparent tracks/thumbs.
- The narrow library is a left pull-out drawer.
- Grid/List/X are aligned in the drawer header; X is narrow-only.
- The narrow drawer toggle is narrow-only and disappears while the drawer is open.
- Selecting a video closes the narrow drawer.
- The landing is centered and fixed at 60% of the viewer height on desktop and mobile.
- The landing is hidden while the translucent drawer is open to avoid visual clutter.
- VideoLibrary no longer writes into SkyReader's `#viewerShelfView`; VideoViewer owns the video landing.
- `video.html` is now a clean redirect to the integrated application in `index.html`.
