# Sample Site Data

This directory contains optional sample content you can copy into a site's canonical data store.

It is intentionally outside `site/pages/` so template code stays reusable and free of hardcoded site content.

## Copy sample posts into a site

```sh
site_name=myblog
sites_root=${WIZARDRY_SITES_DIR:-$HOME/sites}
site_data_root="$sites_root/.sitedata/$site_name"
mkdir -p "$site_data_root/blog/content/posts"
cp -R sample-site-data/blog/content/posts/. "$site_data_root/blog/content/posts/"
```

After copying, rebuild the site.
