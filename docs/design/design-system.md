# Scheduly workspace design

2026-09-08. Calendar concept is the visual reference. A work surface, not a dashboard of decorative metrics.

- Canvas #faf9f6; surface #ffffff; text #202725; muted #66716b; line #e5e7e2; sidebar #202725; accent #214f40.
- Serif display headings (Georgia), system sans-serif UI. Heading 36/40, section 23/30, body 14/21, labels 12/18. Controls have explicit typography.
- Sidebar 208px, attention rail 248px, fluid calendar. 8px spacing scale; controls 40px tall; 8px control radius.
- Components: workspace rail, filter toolbar, calendar cell, destination badge, post summary, approval row, composer field, preview, empty state.
- Month, week and list share client/account/status/search scope. Monday-start dates calculated from real calendar, Africa/Johannesburg explicit.
- Composer: client → destination accounts → shared copy and per-account variants → media → proposed time → draft or request review. No direct draft-to-scheduled shortcut.
- Approval binds to revision. Editing invalidates approval and cancels queued deliveries atomically. Optimistic concurrency prevents stale reviewers overwriting changes.
- Intentional corrections to image: no fictional account health percentages, motivational quote or invented employee. Use actual connection readiness and explicit sample workspace notice. Correct September day positions. Sample scheduled items are rehearsal records and cannot publish.
- Analytics displays unavailable values until imported verified provider measurements exist. Operational counts are labelled separately from social performance.

## Fidelity check, 2026-09-08

- Hierarchy: retained the charcoal navigation, serif page headings and green primary actions.
- Calendar: retained compact white content cards, soft grid borders and clear status labels; corrected calendar dates and used a Monday start.
- Composer: retained client-first account selection, shared/per-account copy and adjacent media preview; originals are uploaded, not embedded as a UI mock-up.
- Truthful states: replaced fabricated health metrics and identities with labelled local rehearsal data and unavailable social measurements.
- Responsive behaviour: compact navigation and a readable list at 390px; the contextual calendar rail is hidden below 1450px to preserve card readability. Default desktop screenshots match the intended visual direction, with intentional content and width differences. Expanded captures were affected by browser compositor tiling and are not treated as complete fidelity evidence.
