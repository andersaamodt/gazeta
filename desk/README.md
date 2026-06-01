# Desk

Desk is the private interior for `andersaamodt.com`, mounted at `desk.andersaamodt.com`.

Project placement note: Desk is intentionally separate in this `desk/` folder. Separate is preferred unless integration is plainly cleaner; it currently lives in `nostr-blog` only because the current site already owns Nostr sessions, CGI routing, and private `.sitedata` storage.

## Storage

- The office folder is the Desk world root.
- By default the office lives at `.sitedata/<site>/desk/office`.
- Each room is a literal folder under the office.
- Each task is one plain text file inside the room's `.tasks/` directory.
- Task title is the first line. Optional body text follows.
- Task metadata prefers xattrs: `user.upvotes`, `user.last_vote_at`, `user.soonness`, and timestamps.
- If xattrs are unavailable, sidecars use the same fields in `.tasks/.meta/<task>.json`.
- Completed tasks move to `.tasks/done/`.
- Generated caches live under `.sitedata/<site>/desk/.state/cache/` and are disposable.

## Access

Desk API access requires a valid Nostr-backed session and the site owner's pubkey.

Owner pubkeys can be set with `desk_owner_pubkeys` in `site.conf`. If unset, Desk uses the Nostr author allowlist. If neither is set, it allows the existing admin bootstrap identity so a private site can configure itself.

## Maintenance

Run maintenance from the repo root:

```sh
desk/desk-maintenance audit
desk/desk-maintenance rebuild-indexes
desk/desk-maintenance list-orphans
desk/desk-maintenance migrate-metadata sidecar
desk/desk-maintenance migrate-metadata xattr
```
