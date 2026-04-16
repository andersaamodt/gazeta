# Nostr Blog

A single-author Nostr-focused blog for wizardry web with optional bridge support for post authorship, version selection, and local-first mirrored comments.

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
- **Post context UX**: Read-time card, tags, and automatic older/newer links
- **Nostr-first auth**: Nostr challenge login with optional delegated device sessions and optional SSH link
- **Video chat widget**: Self-contained Shadow-DOM WebRTC widget with Janus videoroom support, data-attribute auto-mount, manual init API, and iframe embed route

## Post Model

Posts are stored as `.md` files in the canonical content directory under `.sitedata/<site>/blog/content/posts/` with YAML front-matter:

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
│   ├── pages/
│   │   ├── admin.md              # Application/admin page (template-owned)
│   │   ├── login-security.md     # Application/help page (template-owned)
│   │   ├── blog.md -> .../blog/content/pages/blog.md
│   │   ├── list.md -> .../blog/content/pages/list.md
│   │   ├── reading-list.md -> .../blog/content/pages/reading-list.md
│   │   └── posts -> .../blog/content/posts
│   └── static/
│       └── style.css             # Shared blog styling and page bundles
│
├── .sitedata/<site>/blog/content/
│   ├── posts/                    # Canonical post markdown
│   ├── pages/                    # Canonical public page markdown shells
│   └── drafts/                   # Canonical draft markdown
├── .sitedata/<site>/blog/lists/  # Draft JSON state for managed Nostr/list pages
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

## Static Pages

- Public page source lives under `.sitedata/<site>/blog/content/pages/`
- `site/pages/*.md` mounts are generated from that canonical content directory during build

## Sample Site Data

- Example post content ships in `sample-site-data/`, not under `site/pages/`.
- Copy sample posts into a site's canonical data directory when needed:

```sh
site_name=myblog
sites_root=${WIZARDRY_SITES_DIR:-$HOME/sites}
site_data_root="$sites_root/.sitedata/$site_name"
mkdir -p "$site_data_root/blog/content/posts"
cp -R sample-site-data/blog/content/posts/. "$site_data_root/blog/content/posts/"
```

## Interaction Model

- Blog rendering is deterministic from local files only.
- When the Nostr bridge is enabled, canonical post state is local Nostr event JSON under `.sitedata/<site>/nostr/events/`.
- Comments are read from locally mirrored events only.
- “Refresh comments” runs an explicit mirror action; render paths never perform live relay fetches.

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
vim ~/sites/.sitedata/myblog/blog/content/posts/first-post.md

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

## Canonical Content Storage

- Canonical authored content lives under `.sitedata/<site>/blog/content/`, not in the template tree.
- `site/pages/posts` and managed public page files in `site/pages/*.md` are mounts generated from that content directory.
- Deployments should publish application code and rebuild output without replacing `.sitedata/<site>/blog/content/`.
- That keeps writing separate from the app tree and makes external sync/archive tooling safe to attach to the content directory.
- Site-specific deployment config such as `site.conf` is host-local and not committed in this repo.

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
- In-widget controls: mic, camera, leave, copy invite link
- Lifecycle hooks: `onJoin`, `onLeave`, `onError`
- Metrics callback hook: `onMetric` or `metricsCallback`
- Feature flag support via plugin state and per-widget `featureEnabled` option

### Contact page loading

- Contact page loads the widget script lazily when the `video_chat` plugin is enabled.
- Media initialization is always gated behind explicit user action in-widget.

### Integration pattern: Data-attribute mount (CMS)

```html
<div
  data-video-chat
  data-video-chat-token-endpoint="/cgi/blog-video-chat-token"
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
        ├── ssh-auth/
        ├── blog/
        │   └── drafts/
        └── nostr/
            ├── events/        # Canonical event store
            ├── derived/       # Rebuildable indexes
            └── state/
                ├── authors.txt
                ├── relays.txt
                ├── blocklist.txt
                ├── hidden_posts.txt
                └── secret.key # Local signing key (not committed)
        └── uploads/
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

Part of the wizardry project.



