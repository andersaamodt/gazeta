# Parsimony Follow-up Checklist

- [x] Unify admin and admin-read auth/session/request parsing into one shared security authority.
- [x] Centralize site path and environment resolution across all runtimes.
- [x] Replace dual adapter/Rust action allowlists with one canonical action registry.
- [ ] Collapse the admin runtime legacy re-dispatch (`ExecLegacy`) by choosing a single migration direction.
- [x] Merge the five near-identical runtime adapter scripts into one parameterized adapter.
- [x] Consolidate duplicated runtime response/error primitives into shared modules.
- [x] Replace repeated query and percent-decoding helpers with one canonical utility.
- [x] Introduce a typed shared `PublicPost` projection used by index/archive/tags/search/context surfaces.
