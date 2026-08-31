GRAPHITE FLEET — DROP-IN WEBSITE BUILD

For web deployment

1. Download sources.

2. npm run build

3. Upload index.html, favicon.svg, and the assets directory together to the public
directory where you want the game to live.

The build uses relative asset paths, so it works at a domain root or in a
subdirectory such as /graphite-fleet/. No database, server-side runtime, or
rewrite rule is required.

Serve these files over HTTP or HTTPS. Opening index.html directly from a local
filesystem is not the supported deployment method.
