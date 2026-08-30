# Drop-in deployment

1. Run `npm install` once.
2. Run `npm run build` after making changes.
3. Copy everything inside `dist/` to the desired public directory on your web server.

For example, copying the files to `public_html/graphite-fleet/` makes the game available at `https://example.com/graphite-fleet/`.

The generated package uses relative asset paths and needs no rewrite rule. Serve it over HTTP or HTTPS; opening `index.html` directly from the filesystem is not the supported deployment method.
