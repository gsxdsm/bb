---
name: mobile-edge-sidebar
description: Explain or manage the Mobile Edge Sidebar plugin.
---

# Mobile Edge Sidebar

Swipe right at least 48 pixels from the leftmost 24 pixels of the main content
within one second to open bb's mobile sidebar. It uses the existing sidebar
button and drawer without changing browser history.

The edge strip reserves eligible touches at touch start to suppress browser
back navigation. Begin vertical scrolling outside that strip. Inputs, links,
buttons, text selections and dialogs retain their normal gestures. Swipes
outside the strip retain bb's built-in behavior.

This uses bb DOM attributes and may need updating when bb's sidebar changes.
iOS Safari owns some system gestures; verify on the user's device before
claiming native back navigation is always suppressed.

Inspect with `bb plugin list` and `bb plugin logs mobile-edge-sidebar`.
Disable with `bb plugin disable mobile-edge-sidebar`; enable with
`bb plugin enable mobile-edge-sidebar`. No settings or backend commands.
