# Theurgy Migration Checklist

## Completed

- Keep CGI front doors as compatibility wrappers.
- Add `gazeta-read` as the compiled read runtime.
- Split `gazeta-read` into action modules so public reads, maintenance-backed reads, and future admin domains do not share one large implementation file.
- Add a shared `cgi/gazeta-read-runtime-adapter` so migrated CGI front doors stay tiny and use one runtime selection path.
- Move `blog-list-public-posts` to `gazeta-read list-public-posts`.
- Move `blog-index` to `gazeta-read blog-index`.
- Move `blog-list-navbar-pages` to `gazeta-read list-navbar-pages`.
- Move `blog-btc-usd-rate` to `gazeta-read btc-usd-rate`.
- Add `cgi/blog-maintenance` for Deployments-safe cache/index rebuilds.
- Add replay fixtures for migrated read endpoints.
- Move `blog-archive` and `blog-tags` to catalog-backed `gazeta-read` HTML actions.
- Add `rebuild-search-index` and move `blog-search` to the file-backed `gazeta-read blog-search` action.
- Add separate `gazeta-nostr-read` runtime and move `blog-comments` to the Nostr read adapter.
- Move `blog-post-context` to the Nostr read adapter using the public post catalog plus derived Nostr indexes.
- Add `rebuild-product-index`, separate `gazeta-commerce-read`, and move `blog-get-product` to the commerce read adapter.

## Remaining Read Work

- Move additional public cache-backed reads before admin reads:
  - footer page list, if exposed as a CGI route later
- Add replay fixtures before each endpoint switch.

## Runtime Boundaries

- `gazeta-read` is only for low-risk public reads and maintenance-backed read caches.
- Keep each `gazeta-read` action in its own Rust module; do not grow a single cross-domain action file.
- Future admin reads should use a separate `gazeta-admin-read` binary or an explicitly separate admin module with its own adapter allowlist.
- Payments, purchases, BTCPay, Lightning, zaps, Nostr publishing, secure chat, video chat controls, and merch mutations must not be added to `gazeta-read`.
- Nostr-derived public reads belong in `gazeta-nostr-read`; Nostr publishing, mirroring, rebuilds, and crossposting still need separate mutation surfaces.
- Commerce-derived public reads belong in `gazeta-commerce-read`; order creation, payments, purchases, BTCPay, Ramp, Printful writes, and merch mutations stay out.
- High-risk domains should get separate binaries/adapters once their replay fixtures and file-state assertions exist:
  - `gazeta-payments`
  - `gazeta-nostr`
  - `gazeta-secure-chat`
  - `gazeta-admin-mutate`

## Deferred Mutation Domains

These stay on the shell runtime until replay fixtures and rollback-safe state checks exist:

- admin post/page mutations
- payments, BTCPay, Lightning, zaps, and purchases
- Nostr publishing, mirroring, rebuild, and crossposting
- secure chat and video chat controls
- merch synchronization and product-page mutation

## Safety Rules

- Gazeta must not contain Desk routes or Desk runtime remnants.
- Read endpoints may use Theurgy once they can serve existing static/cache artifacts.
- Mutation endpoints need captured env/body fixtures plus file-state before/after assertions.
- Deployments should call source-controlled maintenance commands; it must not patch live server files.
- Managed server builds run `cgi/install-theurgy-runtime` when present so Linux Theurgy binaries are part of the normal release.
- The deploy hook must run the runtime installer from the checked-out release, after accepting the prebuilt HTML payload and before flipping the live symlink.
- Runtime installer failures should fail the deploy hook rather than leaving read CGIs pointed at a missing binary.
