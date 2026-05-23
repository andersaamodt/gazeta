# Overworld Godot Web Export

Built from local checkout:

- `/Users/andersaamodt/git/overworld`
- branch: `codex/overworld-godot-web`
- commit: `c9bae5b Load packed Godot textures`

Build command:

```sh
/opt/homebrew/bin/godot --headless --path godot --export-release Web /tmp/overworld-godot-web-textures/index.html
```

Gzip siblings were produced with `gzip -9 -kf` for the web server.
