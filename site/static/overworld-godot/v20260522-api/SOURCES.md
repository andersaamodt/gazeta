This directory contains the Godot Web export for the Overworld embed.

Source project: `/Users/andersaamodt/git/overworld/godot`

Generated with:

```sh
/opt/homebrew/bin/godot --headless --path godot --export-release Web /tmp/overworld-godot-web/index.html
```

The web build is configured with `variant/thread_support=false` so it can run as
an ordinary same-origin iframe without cross-origin isolation headers.
