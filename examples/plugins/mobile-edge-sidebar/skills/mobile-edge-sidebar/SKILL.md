---
name: mobile-edge-sidebar
description: Explain or manage the Mobile Edge Sidebar plugin.
---

# Mobile Edge Sidebar

Swipe right at least 48 pixels from the leftmost 64 pixels within one second
to open bb's sidebar. In the native app this includes the header, footer,
safe-area margins and wide layouts. It uses bb's existing sidebar button
without changing browser history.

In the native app, taps and vertical scrolling remain available in the edge
area. A horizontal swipe takes priority over controls such as buttons and
links, and suppresses the resulting click. Inputs, editable text, selections,
sliders and open dialogs keep their gestures. The plugin temporarily marks edge targets with bb's swipe-exclusion attribute
so bb's own handler does not compete, while controls still receive pointer
events. The marker is restored after the gesture or plugin disposal.

In browser tabs this applies below 768 pixels wide. The edge strip reserves
eligible touches at touch start to suppress browser back navigation; begin
vertical scrolling outside that strip. Browser buttons and links keep their
normal behavior. Swipes outside the strip retain bb's built-in behavior.

iOS Safari owns some system gestures; verify on the user's device before
claiming native back navigation is always suppressed. This uses bb DOM
attributes and may need updating when bb's sidebar changes.

Inspect with `bb plugin list` and `bb plugin logs mobile-edge-sidebar`.
Disable with `bb plugin disable mobile-edge-sidebar`; enable with
`bb plugin enable mobile-edge-sidebar`. No settings or backend commands.
