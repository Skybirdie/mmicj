# SkyReader Phase 3.5

## Reader launch lifecycle stabilization

Phase 3.5 makes the first launch deterministic by waiting for the asynchronous StPageFlip `init` event before `Renderer.open()` completes. A failed renderer open is now propagated to navigation instead of being treated as a successful open.

The library shelf also restores a saved page only when the selected book is the saved magazine. A different book always opens at page 1.

## End-of-book behavior

`Next` closes the reader only when the final spread is already visible and the user requests another `Next`. It never wraps to page 1 and it does not hide the final spread before the user is finished viewing it.
