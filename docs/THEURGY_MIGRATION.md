# Theurgy Migration Checklist

## Completed

- Keep CGI front doors as compatibility wrappers.
- Add `gazeta-read` as the compiled read runtime.
- Split `gazeta-read` into action modules so public reads, maintenance-backed reads, and future admin domains do not share one large implementation file.
- Move `blog-list-public-posts` to `gazeta-read list-public-posts`.
- Move `blog-list-navbar-pages` to `gazeta-read list-navbar-pages`.
- Move `blog-btc-usd-rate` to `gazeta-read btc-usd-rate`.
- Add `cgi/blog-maintenance` for Deployments-safe cache/index rebuilds.
- Add replay fixtures for migrated read endpoints.

## Remaining Read Work

- Move additional public cache-backed reads before admin reads:
  - footer page list, if exposed as a CGI route later
  - public archive/tag indexes once they have stable artifact files
  - public search after a Tantivy/file-index contract exists
- Add replay fixtures before each endpoint switch.

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
