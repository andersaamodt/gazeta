# gazeta

gazeta is a single-author Nostr blog and self-hosted publishing console for wizardry web, with optional Nostr bridge features for post authorship, version selection, and local-first mirrored comments.

## Features

- **Full admin panel**: Compose, edit, delete, schedule, drip-queue, and publish
- **Plugin toggles**: Enable or disable Nostr support, Nostr login, Nostr bridge, Nostr-backed pages/posts, Zaps, BTCPay, and Video Calling from Admin → Plugins
- **Smart Markdown editing**: Selection-aware toolbar + live preview
- **Autosave drafts**: Debounced autosave with draft persistence
- **Local drip queue**: Publish one queued post per interval while an admin browser tab remains open (optional jitter)
- **Scheduled release**: Per-draft exact release datetime
- **Media workflow**: Drag/drop image upload + markdown embed insertion
- **Content-addressed posts**: SHA-256 hash per published post
- **Public discovery**: Index, tags, search, RSS, Atom, sitemap
- **Archive index**: Month-grouped archive view with per-month counts
- **Post context UX**: Canonical post header metadata, tags, and automatic older/newer links
- **Nostr-first auth**: Nostr challenge login with optional delegated device sessions and optional SSH link
- **Video chat widget**: Self-contained Shadow-DOM WebRTC widget with Janus videoroom support, data-attribute auto-mount, manual init API, and iframe embed route

## Post Model

Posts are stored as `.md` files in the canonical content directory under `.sitedata/<site>/content/posts/` with YAML front-matter:

```markdown
---
title: "My First Post"
published_at: "2024-01-15T10:30:00Z"
content_hash: "a1b2c3d4e5f6..."
tags: ["tech", "tutorial"]
author: "Your Name"
summary: "A brief introduction to my blog"
visibility: "public"
license: "CC BY 4.0"
---

# My First Post

Your post content here...
```

## Metadata Fields

### Required
- **title**: Post title
- **published_at**: ISO 8601 timestamp
- **content_hash**: Immutable post identifier (SHA-256 of content)
- **tags**: Array of tags (Nostr-compatible)
- **author**: Author name (extensible to multi-author)

### Optional
- **previous_hash**: Links to prior version (for edits)
- **summary**: Brief description for index/feeds
- **visibility**: Mapped to UNIX permissions (default: public)
- **license**: Content license (e.g., CC BY 4.0)

## Lifecycle States

Posts have system-understood states:
- **draft**: Local only, not published
- **published**: Canonical public state
- **replaced**: Superseded by newer version
- **deleted**: Tombstoned (marked for deletion)

States are inferred from metadata and filesystem visibility.

## Blog Structure

```
blog/
├── site/
│   ├── includes/
│   │   ├── head.html             # Shared document head shell
│   │   ├── nav.md                # Shared site navigation shell
│   │   └── footer.md             # Shared footer shell
│   ├── lodestone/
│   │   ├── pages/                # Canonical application page shells
│   │   └── templates/            # Canonical managed Nostr page shells
│   ├── pages/                    # Generated managed page mounts + posts symlink
│   └── static/
│       └── style.css             # Shared blog styling and page bundles
│
├── .sitedata/<site>/content/
│   ├── posts/                    # Canonical post markdown
│   ├── pages/                    # Canonical public page markdown shells
│   ├── drafts/                   # Canonical draft markdown
│   └── page-states/              # Canonical managed page draft state JSON
├── .sitedata/<site>/origin/      # Cross-post platform settings + emitted state
├── .sitedata/<site>/files/       # Uploaded files and public-file aliases
├── .sitedata/<site>/nostr/events/ # Canonical mirrored/signed event JSON files
├── .sitedata/<site>/nostr/derived/# Disposable indexes generated from events
└── .sitedata/<site>/nostr/state/  # Authors, relays, blocklist, hidden posts, key
```

## Navigation

- **Homepage**: Chronological reverse-ordered post listing with pagination (10 posts per page)
- **Archive page**: All posts grouped by month
- **Tag index**: Global tag list with post counts
- **Tag pages**: Posts filtered by tag
- **Search**: Full-text search across titles, tags, summaries, and content
- **Post navigation**: Previous/next links within posts
- **Revision history**: Shows version lineage for edited posts

## Search

Full-text search via CGI:
- Search across post titles, tags, summaries, and content
- Case-insensitive matching
- Excludes draft posts from results
- Accessible via `/cgi/blog-search?q=query`

## Pagination

Blog index automatically paginates:
- 10 posts per page
- Previous/Next navigation
- Page counter (e.g., "Page 2 of 5")
- URL parameter: `?page=N`

## Draft Visibility

Posts with `visibility: "draft"` are hidden from:
- Blog homepage (index)
- Tag listings
- Search results

Drafts are only visible when accessed directly by URL, allowing you to work on posts locally before publishing.

To publish a draft:
```yaml
visibility: "public"  # Change from "draft"
```

## Site Architecture

### Ownership Model

- Canonical authored content lives under `.sitedata/<site>/content/`, not in the template tree.
- Public page source lives under `.sitedata/<site>/content/pages/`.
- `site/pages/*.md` mounts and `site/pages/posts` are generated projections from that canonical content directory; the repo checkout is template code, not app state.
- When the source checkout itself lives under `~/git`, generated page mounts and related bootstrap/catalog artifacts are written under `${XDG_STATE_HOME:-$HOME/.local/state}/gazeta/generated/<site>/` instead of back into the repo checkout.
- Lodestone page sources in `site/lodestone/` are site-specific template overrides; their rendered Markdown outputs belong in the generated page root, not in the source checkout. When a site does not override a Lodestone template, Gazeta falls back to the bundled default under the repo `site/lodestone/` tree.
- Gazeta-owned Lodestone content components are rendered by `cgi/gazeta-lodestone-components`; Lodestone itself stays responsible only for the generic universal rendering kernel.
- The same Gazeta-owned Lodestone component boundary should also own reusable read-only Nostr page content in prerender projections, so bootstrap payload HTML and generated page HTML stay on one render path.
- Shared page-head and hydration helpers such as page-title reconciliation, canonical title/sync shell state assembly, canonical read-only description fallback shell state assembly, canonical editable title/description field-state assembly, canonical managed page-head/nav-title render-state composition, managed page-head rendering for both editable and read-only states, reuse of Lodestone-owned title/description/nav-title hosts, read-only render-or-fallback content mounting, prerender-owned static shell preservation, visitor- and payload-aware prerender eligibility policy, viewer/auth-event signature helpers, canonical managed-page route/slug normalization, readiness signaling, load-fallback placeholders, and session-auth refresh observation live in `site/static/page-head.js`; page-specific scripts should only own state and behavior that differs by page type.
- Shared readiness signaling should also derive managed-page identity there across bootstrap, refresh, and fallback paths: page scripts may say when a page is visually ready, but they should not need page-local slug plumbing just to notify the canonical hydration-ready path.
- Shared managed-route helpers should also own one-shot repair choreography and cleanup of route refresh/repair sentinels through one canonical utility, so page scripts only decide when a repair reload is needed and any page-specific preflight hints, not how the URL is mutated or normalized afterward.
- Shared managed navbar-title action wiring should also stay there: page scripts may provide page-specific fallback titles/attrs and current state, but render-time page options and beginning/saving navbar-title edits should flow through shared page-head helpers instead of page-local option assembly.
- The same shared navbar-title layer should also own generic navbar-title reset lifecycle from payload/current state, so page scripts clear edit/input/busy shell state through one runtime helper instead of hand-resetting those fields per page.
- Read-only managed pages should also let that shared navbar-title path consume `payload.nav_title` directly instead of rebuilding the same shell text in page-local `configuredText` glue.
- Root-shell fallback text lookup should also stay there: page scripts may choose fallback attribute names and final default text, but `site/static/page-head.js` should own reading canonical title text from Lodestone-published root attributes instead of each page reimplementing `getAttribute(...)` chains.
- Shared Secure Chat shell rendering lives in `site/static/simplex-web-default-chat.js`; `site/static/contact-page.js` should only own Contact-specific state, transport integration, and DOM orchestration around that shared render shape.
- Lodestone fragment projection details such as `content_html` / `content_attrs` and `description_html` / `description_attrs` are also shared-runtime concerns: page scripts should read structured fragment data from `site/static/page-head.js`, not parse Lodestone fragment keys themselves.
- Shared first-paint bootstrap policy also lives in `site/static/page-head.js`: page scripts may define how a payload becomes local state/UI, but cache-vs-prerender startup flow, managed-page payload commit/caching, and the simple managed-page prerender-adoption decision should stay shared unless a page has materially different bootstrap behavior.
- The same shared bootstrap layer should also own the simple paint-ready shorthand for common managed pages, so page scripts can pass top-level `state`, `rootNode`, `loadingClass`, and `markPageReady` options instead of rebuilding nested notify envelopes.
- Shared managed-page refresh/caching policy should also stay at that layer: page scripts may choose canonical knobs such as `persistMode` or `persist: false`, and for common loads they may supply high-level view options such as fallback text, page-ready intent, or loading-class hooks, but should not need ad hoc low-level cache deny-write lambdas, hand-built refresh UI fallback/paint-ready envelopes, repeated load-fallback/finally boilerplate, or page-local redraw-vs-preserve reconciliation when the runtime can decide whether an adopted prerender still matches.
- For blog pages specifically, the managed-page payload contract also carries `bootstrap_posts` from the shared public-posts catalog helper, so prerender, runtime refresh, and client adoption all speak the same post-card shape instead of splitting page-state and post-list first paint across separate contracts; the browser runtime should not need an independent first-paint fetch of the public-posts catalog.
- For blog pages, the shared `prerender` projection also carries the canonical filter-panel fragments (`filter_tags_html`, `filter_years_html`, and `filter_types_html`), and `site/static/page-head.js` owns both mounting those fragments and recomputing the same chip shape from the current post catalog when needed, so Lodestone/source rendering and hydration reuse one filter-chip render contract instead of leaving a second page-local renderer behind.
- When Lodestone/Gazeta already prerenders a stable read-only shell, the page script should preserve that shell and bind behavior onto it; static shell markup and CSS should not be re-owned in page-local JavaScript.

### Managed Page Payload Contract

- Common envelope fields from `cgi/blog-get-nostr-page`: `success`, `slug`, `page_type`, `nav_title`, `kind`, `is_admin`, `viewer_authenticated`, `viewer_can_submit`, `view_mode`, `canonical_exists`, `draft_exists`, `draft_differs`, `sync_status`, `state`, `canonical_state`, `canonical_event`, `zap_config`, `validation`, `prerender`, and `prerender_signature`.
- `validation` is a shared object with `errors`, `warnings`, and `can_publish`.
- `prerender` is the shared Lodestone/Gazeta projection envelope; page scripts should consume it through shared helpers instead of parsing fragment keys ad hoc.
- For blog pages, `prerender` may additionally include `filter_tags_html`, `filter_years_html`, and `filter_types_html`, which are the canonical Lodestone/Gazeta filter-panel fragments derived from `bootstrap_posts`.
- Page-specific payload data lives inside `state` and `canonical_state`.
- Blog pages may additionally carry `bootstrap_posts`, which is the shared post-card list used for prerender parity and client adoption.

### Build And Deploy Model

- Deployments should publish application code and rebuild output without replacing `.sitedata/<site>/content/`.
- That keeps writing separate from the app tree and makes external sync/archive tooling safe to attach to the content directory.
- For repo-root local tooling runs under `~/git`, Gazeta also moves the canonical `.sitedata/<site>` default to `${XDG_STATE_HOME:-$HOME/.local/state}/gazeta/sites-data/<site>` so local app state and generated mounts do not accumulate inside the synced git tree.
- Wizardry builds should consume Gazeta projections through explicit `pages-dir`, `static-dir`, and `build-dir` paths, or the equivalent `WIZARDRY_PAGES_DIR`, `WIZARDRY_STATIC_DIR`, and `WIZARDRY_BUILD_DIR` environment variables.
- Site-specific deployment config such as `site.conf` is host-local and not committed in this repo.
- When `site.conf` sets `local-template=/absolute/path/to/gazeta`, template-owned build inputs such as `cgi/`, `site/static/`, `site/includes/`, and Lodestone page/template sources should come from that Gazeta checkout; the live site root should only remain the destination for generated page/static outputs plus host-local config.
- When a live site root points at this repo with `local-template=/absolute/path/to/gazeta`, deployment builds should stage a temporary site root that combines the live `site.conf`, the live sibling `.sitedata/<site>/`, and the repo-owned Gazeta code, while writing the build output to the deployment-owned build directory.
- Deployment staging should express Gazeta-specific build behavior through temporary `site.conf` overrides such as `blog_legacy_asset_mode=manifest`, `blog_public_file_alias_mode=manifest`, `blog_legacy_assets_dir=/absolute/path/to/.sitedata/<site>/files/legacy-assets`, and `nostr_page_prerender_enabled=false`.
- In that deployment mode, Gazeta emits public-file and legacy-asset manifests and links those files into the final deployment build afterward instead of copying heavyweight asset trees through the build pipeline.
- Legacy published assets belong under `.sitedata/<site>/files/legacy-assets/`; generated bootstrap/catalog files belong under the generated/static roots, not in the repo checkout.

## Sample Site Data

- Example post content ships in `sample-site-data/`, not under `site/pages/`.
- Copy sample posts into a site's canonical data directory when needed:

```sh
site_name=myblog
sites_root=${WIZARDRY_SITES_DIR:-$HOME/sites}
site_data_root="$sites_root/.sitedata/$site_name"
mkdir -p "$site_data_root/content/posts"
cp -R sample-site-data/content/posts/. "$site_data_root/content/posts/"
```

## Interaction Model

- Blog rendering is deterministic from local files only.
- When the Nostr bridge is enabled, canonical post state is local Nostr event JSON under `.sitedata/<site>/nostr/events/`.
- Comments are read from locally mirrored events only.
- “Refresh comments” runs an explicit mirror action; render paths never perform live relay fetches.

## Theurgy Runtime

Gazeta is migrating high-value read and admin mutation paths to the Theurgy web runtime while keeping CGI front doors compatible with Wizardry hosting.

- `gazeta-read` handles migrated public read endpoints.
- `gazeta-admin-read` handles authenticated admin read endpoints.
- `gazeta-admin` now owns the admin mutation/runtime boundary.
- `cgi/blog-list-public-posts` execs `gazeta-read list-public-posts`.
- `cgi/blog-list-navbar-pages` execs `gazeta-read list-navbar-pages`.
- `cgi/blog-manage-post` and `cgi/blog-upload-media` run directly in `gazeta-admin`.
- `cgi/blog-save-post`, `cgi/blog-publish-nostr-page`, `cgi/blog-video-chat-control`, `cgi/blog-secure-chat-admin`, and `cgi/blog-payments` now enter through `gazeta-admin`.
- `blog-publish-nostr-page` and `blog-payments` use dedicated runtime-to-site adapters (`cgi/blog-publish-nostr-page-bridge.sh`, `cgi/blog-payments-bridge.sh`) for their site-specific domain logic.
- The separate `*-legacy` scripts remain only as adapter fallback when the corresponding runtime binary is unavailable.
- `cgi/blog-maintenance rebuild-indexes` refreshes derived public-post catalog artifacts for Deployments and build flows.
- Build runtime binaries with:

```sh
cgi/install-theurgy-runtime
```

The CGI adapters run `GAZETA_READ_RUNTIME`, `GAZETA_ADMIN_READ_RUNTIME`, or `GAZETA_ADMIN_RUNTIME` when set, then the corresponding `~/.local/state/gazeta/cargo-target/release/*` binary, then the debug binary. They only use `cargo run` when `GAZETA_THEURGY_ALLOW_CARGO=1` is set for local replay tests.

Repo-local cargo output is forbidden. Use `cgi/install-theurgy-runtime` or `cgi/gazeta-cargo ...`; by default they build under `~/.local/state/gazeta/cargo-target` unless `GAZETA_STATE_DIR` or `CARGO_TARGET_DIR` overrides that location.

## Nostr Bridge (Phase 2)

- Posts publish as kind `30023` events with slug-only `d` identity.
- Post markdown is stored directly in event `.content`.
- Latest rendered version is selected by newest `created_at` per (`pubkey`, `kind`, `d`) with event-id tie-break.
- Mirroring uses `nak`; signing/verification require `nostril`.
- Relay and author allowlist are file-backed:
  - `.sitedata/<site>/nostr/state/relays.txt`
  - `.sitedata/<site>/nostr/state/authors.txt`
- Local moderation and hide controls are file-backed:
  - `.sitedata/<site>/nostr/state/blocklist.txt`
  - `.sitedata/<site>/nostr/state/hidden_posts.txt`
- Bridge enablement is explicit in `site.conf` via `nostr_bridge_enabled=true|false`.

## Quick Start

```sh
# Create a blog site
web-wizardry create myblog blog

# Ensure required server tooling is present
web-wizardry install-jq
web-wizardry install-nostril
web-wizardry install-syncthing   # optional, for content mirroring/backups

# Edit content
sites_root=${WIZARDRY_SITES_DIR:-$HOME/sites}
site_data_root=${WIZARDRY_SITES_DATA_DIR:-$sites_root/.sitedata}/myblog
vim "$site_data_root/content/posts/first-post.md"

# Build
web-wizardry build myblog

# Serve
web-wizardry serve myblog
```

Visit http://localhost:8080

To enable Nostr bridge for a site, turn on “Enable Nostr Bridge” in `/pages/admin.html#settings`, then configure:

- `.sitedata/<site>/nostr/state/secret.key` (hex private key for signing)
- `.sitedata/<site>/nostr/state/authors.txt`
- `.sitedata/<site>/nostr/state/relays.txt`

`simplex-web` stays in its own repo; `gazeta` vendors the browser chat shell files with `./sync-simplex-web-vendor.sh`.
Secure Chat durable state lives under `.sitedata/<site>/secure-chat/` as plain JSON/text files plus runtime logs and sockets.
Secure Chat host overrides can be set in `site.conf` with `secure_chat_node_binary=/absolute/path/to/node` and `secure_chat_simplex_binary=/absolute/path/to/simplex-chat` when the site user PATH does not expose those binaries.

## Authentication

### Key Features

- **Nostr Identity**: Accounts are anchored to one Nostr pubkey (`P_user`)
- **Nostr-Only Web Login**: Authentication is verified from signed Nostr events
- **No Password/Email Recovery**: Loss of `P_user` means loss of account access by design
- **NIP-07 Desktop Login**: Uses browser signer extension when available
- **NIP-46 Phone Signer**: QR + `nostrconnect://` deep link pairing fallback
- **Manual Signed Event Fallback**: Paste signed auth event JSON, optionally with delegation JSON
- **Delegated Device Sessions**: Optional local session key delegation (1-90 days, default 30)
- **Per-Action Approval Option**: Sensitive admin actions can require direct signer approval instead of delegated session auth
- **Revocation Flow**: “Log out everywhere” requires fresh owner signature and revokes active delegations
- **Optional SSH Link**: Attach SSH public key to your account for terminal/MUD workflows
- **UNIX Group Permissions**: Admin access via `blog-admin` group
- **Admin Panel**: Compose, publish, and manage posts

### Auth Dependency Notes

- Nostr login/revocation verification requires `nostril` on the server.
- Install via:
  - `web-wizardry install-nostril`
- Uninstall via:
  - `web-wizardry uninstall-nostril`
- `Build all & restart server` for blog sites attempts `install-nostril` automatically.
- **Markdown Editor**: Live preview for easy writing
- **Draft Management**: Save work-in-progress, publish when ready
- **Configurable Registration**: Enable/disable new user registration

### Quick Start for Admins

1. **Sign in with Nostr** using the Login button in site navigation.

2. **Grant Admin Access**:
   ```sh
   sudo groupadd blog-admin  # Create group if needed
   sudo usermod -aG blog-admin <username>
   ```

3. **Access Admin Panel**: Visit `/admin.html` to compose and publish

### For Single-Author Blogs

After creating your account and giving yourself admin access:

1. Login to admin panel
2. Go to Settings
3. Uncheck "Enable User Registration"
4. Save Settings

This prevents new users from registering while keeping your access.

### Admin Capabilities

- **Compose & Edit**: Smart markdown toolbar + live preview
- **Autosave**: Draft autosaving while typing
- **Queue Scheduling**: Exact publish datetime or drip queue mode
- **Publish Control**: Publish now, scheduled, or drip
- **Draft CRUD**: Create/load/delete drafts from GUI
- **Media Uploads**: Drag/drop images to upload + insert markdown embeds
- **Draft-local assets**: Relative markdown paths in draft preview resolve inside the current draft folder
- **Global Queue Settings**: Drip interval + optional random jitter
- **Feed Settings**: Full-text feeds toggle + feed item count
- **Manage Settings**: Site title, registration toggle, themes

### Authentication Flow

```
Request server challenge (single-use, short-lived, domain-bound)
    ↓
Sign with NIP-07, NIP-46, or manual signer
    ↓
Server verifies signed event and binds backend session to P_user
    ↓
Optional: delegate local session key for N days (default 30)
    ↓
Access admin panel (if in blog-admin group)
```

### Demo Pages

- Login modal in site navigation - Authentication and account creation
- `/admin.html` - Admin panel (requires admin permissions)

### CGI Scripts

**Authentication:**
- `nostr-auth-login-begin` - Create Nostr login challenge
- `nostr-auth-login-finish` - Verify signed Nostr event and create session
- `nostr-auth-revoke-all-begin` - Start signed revocation challenge
- `nostr-auth-revoke-all-finish` - Verify owner revocation signature and revoke delegations
- `ssh-auth-check-session` - Validate session and permissions
- `ssh-auth-logout` - Destroy current session

**Optional Account Tooling (not primary web login):**
- `nostr-auth-passkey-begin` - Start passkey binding for logged-in account
- `nostr-auth-link-ssh` - Link SSH public key to logged-in Nostr account
- `ssh-auth-bind-webauthn` - Store WebAuthn credential delegate
- `ssh-auth-login-begin` - Start passkey login challenge
- `ssh-auth-login-finish` - Verify signed assertion and create session
- `ssh-auth-list-delegates` - List all WebAuthn delegates
- `ssh-auth-revoke-delegate` - Revoke a WebAuthn delegate

**Blog Management (Admin Only):**
- `blog-get-config` - Get site configuration
- `blog-update-config` - Update site settings
- `blog-list-drafts` - List draft posts
- `blog-get-draft` - Load draft content for editing
- `blog-save-post` - Save/autosave/queue/publish posts
- `blog-delete-draft` - Delete draft
- `blog-list-queue` - List scheduled + drip queue
- `blog-run-scheduler` - Trigger scheduler tick
- `blog-nostr-mirror` - Mirror Nostr posts/comments from configured relays
- `blog-video-chat-token` - Issue short-lived capability token/bootstrap payload for video chat widget
- `blog-upload-media` - Upload images for markdown embedding
- `blog-draft-asset` - Serve draft-local files for relative-path preview rendering
- `blog-archive` - Render month-grouped archive listing

## Plugin System

- Admin has a dedicated `Plugins` section for feature switches.
- Plugin toggles are file-backed in `site.conf` as `plugin_<name>=true|false`.
- `nostr_support` is a master switch for:
  - `nostr_login`
  - `nostr_bridge`
  - `nostr_posts`
  - `zaps`
- Disabling a plugin hides its related admin panel and blocks related CGI actions.
- Plugin enablement does not install system packages; it only controls availability in UI/CGI behavior.

## Video Chat Widget

### What it provides

- Single-file widget bundle: `/static/video-chat-widget.js`
- Shadow DOM UI isolation (no host CSS collisions)
- Global initializer: `initVideoChatWidget(target, options)`
- Auto-mount for any `[data-video-chat]` node
- Deferred mount support for dynamically injected content (MutationObserver scan)
- Janus `videoroom` integration over WSS, including SDP/ICE flow
- In-widget controls: one-click site-owner call, optional public room list, custom room join/create, mic, camera, leave, copy invite link
- Lifecycle hooks: `onJoin`, `onLeave`, `onError`
- Metrics callback hook: `onMetric` or `metricsCallback`
- Feature flag support via plugin state and per-widget `featureEnabled` option

### Admin settings

- Enable the plugin from Admin -> Plugins.
- Configure participant limit, invite TTL, Janus WSS, signaling WSS, and optional public rooms from Admin -> Video Calling.
- Add the widget to local-only Nostr-backed page content with `{{video-chat}}`. Secure Chat can also be placed explicitly with `{{secure-chat}}`.

### Contact page loading

- Contact page loads the widget script lazily when the `video_chat` plugin is enabled.
- Media initialization is always gated behind explicit user action in-widget.

### Integration pattern: Data-attribute mount (CMS)

```html
<div
  data-video-chat
  data-video-chat-token-endpoint="/cgi/blog-video-chat-token"
  data-video-chat-call-room-id="call-me"
  data-video-chat-call-label="Call me"
  data-video-chat-public-rooms="true"
  data-video-chat-room-list="Lobby,Office hours"
  data-video-chat-janus-endpoint="wss://janus.example.com/janus"
  data-video-chat-signaling-endpoint="wss://signal.example.com/ws"
  data-video-chat-participant-limit="6"
  data-video-chat-max-participants="6"
  data-video-chat-room-policy="open">
</div>
<script src="/static/video-chat-widget.js" defer></script>
```

### Integration pattern: Manual init

```html
<div id="video-chat-host"></div>
<script src="/static/video-chat-widget.js" defer></script>
<script>
  window.addEventListener('DOMContentLoaded', function () {
    initVideoChatWidget('#video-chat-host', {
      tokenEndpoint: '/cgi/blog-video-chat-token',
      janusEndpoint: 'wss://janus.example.com/janus',
      signalingEndpoint: 'wss://signal.example.com/ws',
      participantLimit: 6,
      maxParticipants: 6,
      roomPolicy: 'open',
      onMetric: function (metric) {
        console.log('video metric', metric);
      }
    });
  });
</script>
```

### Integration pattern: iframe embed

- Zero-JS host integration route:
  - `/embed/video-chat`
- Example:

```html
<iframe
  src="/embed/video-chat?room=demo-room&participant_limit=6"
  title="Video chat"
  width="100%"
  height="520"
  loading="lazy"
  allow="camera; microphone; fullscreen">
</iframe>
```

### CSP notes

Set CSP to allow:

- `connect-src`:
  - your origin (`'self'`)
  - capability token endpoint origin (if external)
  - Janus WSS endpoint
  - signaling WSS endpoint
- `media-src`:
  - `'self'`
  - `blob:`
- `blog-post-context` - Return post metadata + older/newer navigation context

**Public Nostr Read/Refresh Endpoints:**
- `blog-comments` - Return local mirrored comments for a post
- `blog-refresh-comments` - Explicitly mirror latest comments for a post
- `blog-submit-comment` - Store a signed Nostr comment event locally for a post

### Data Storage

```
~/sites/myblog/
├── site.conf                  # Site configuration
├── site/
│   └── pages/
│       └── posts/
│           ├── slug.md        # Generated/derived render projection
│           └── slug-2.md
└── .sitedata/
    └── myblog/
        ├── content/
        │   ├── posts/
        │   ├── pages/
        │   ├── drafts/
        │   └── page-states/
        ├── files/
        ├── origin/
        ├── ssh-auth/
        └── nostr/
            ├── events/        # Canonical event store
            ├── derived/       # Rebuildable indexes
            └── state/
                ├── authors.txt
                ├── relays.txt
                ├── blocklist.txt
                ├── hidden_posts.txt
                └── secret.key # Local signing key (not committed)
```

### Security Model

- **Root Identity**: Nostr pubkey (canonical account anchor)
- **Login Proof**: Signed Nostr auth events with challenge + domain + time checks
- **Delegation**: Optional `P_user -> P_sess` auth delegation with expiry and revocation support
- **Revocation List**: Delegation IDs/session pubkeys tracked server-side for global logout
- **Optional Link**: SSH public key for terminal/MUD interoperability
- **Permissions**: UNIX group membership (`blog-admin`)
- **Session Validation**: Every admin action checks permissions
- **Phishing-Resistant**: Challenge-bound Nostr event signing

See `.github/MUD_BLOG_INTEGRATION.md` for complete documentation.

## Design Principles

1. **Filesystem as database**: Posts are files, versions are immutable
2. **Content-addressable**: Identity based on content hash
3. **Append-only**: Edits create new versions, old versions preserved
4. **UNIX permissions**: Visibility through filesystem semantics
5. **Nostr-aligned**: Optional decentralized social layer with local canonical event storage
6. **Simple & transparent**: No hidden state, all data in files

## License

gazeta is part of the Wizardry project and is licensed under the Open Wizardry License 3.1. See `LICENSE`.
