# Graphite Fleet

Graphite Fleet is an independent, noncommercial browser adaptation of a traditional pencil-and-paper space-combat game passed between classrooms and friends, professors and students. Thank you, Professor Armstrong.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Vite will print the local development URL.

## Build for a website

```bash
npm run build
```

Upload the contents of `dist/` to your web server. Asset paths are relative, so the game can live at a domain root or in a subdirectory such as `/graphite-fleet/`.

## Repository notes

- The game is client-side and does not require a database or backend service.
- The source release intentionally excludes the original hosted-Sites deployment identity and generated files.
- MIT License
