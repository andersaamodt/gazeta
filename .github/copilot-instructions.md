# Gazeta AI Project Instructions

- Before every commit, increment the visible site version in `site/includes/footer.md`.
- Version format is `v<major>.<minor>.<commit>`, starting at `v0.7.0`.
- The patch/commit digit may grow without a fixed maximum.
- Keep generated page hydration bootstraps publishable; pages that reference `/static/nostr-page-bootstrap/*.js` must publish matching static bootstrap files.
