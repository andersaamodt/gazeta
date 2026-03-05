---
title: About
---

## About This Blog

Welcome to my personal blog. This is a place where I share my thoughts, ideas, and experiences.

## About the Author

Hi, I'm [Your Name]. This blog is where I write about [your topics of interest].

You can find me on:
- [Your social links]
- [Your website]
- [Your email]

## About the Platform

This blog is built with [wizardry web](https://github.com/andersaamodt/wizardry), a unique web platform that:

- Uses POSIX shell scripts for all server-side logic
- Treats the filesystem as the database
- Converts Markdown to HTML with Pandoc
- Provides interactivity through CGI scripts

### Technical Details

- **Posts**: Stored as `.md` files with YAML front-matter
- **Identity**: Each post identified by content hash (SHA-256)
- **Versioning**: Edits create new versions linked to prior versions
- **Tags**: Flat tag system compatible with Nostr
- **Visibility**: Controlled via UNIX file permissions

### Optional Nostr Bridge

This blog can optionally enable a local-first Nostr bridge:
- Published posts are signed as kind `30023` events with slug-only `d` identity.
- Event JSON files are canonical and stored in `site/nostr/events/`.
- Render projections and indexes are rebuilt from local events.
- Comments are mirrored locally and never fetched live during page render.

## Content License

Unless otherwise noted, all content on this blog is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Contact

Feel free to reach out at [your email].
