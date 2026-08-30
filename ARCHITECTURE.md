# Architecture

Graphite Fleet is a static React application. The browser owns the complete match state; there is no server API, database, account system, or telemetry dependency.

## Entry points

- `index.html` supplies metadata and the React mount point.
- `src/main.tsx` mounts the application.
- `src/GraphiteFleet.tsx` contains the simulation, deterministic CPU planner, canvas renderer, replay system, and accessible command interface.
- `src/globals.css` contains the responsive dark-board presentation.

## Code map

`GraphiteFleet.tsx` is arranged in execution order:

1. Domain types
2. Simulation and presentation constants
3. Shared drawing primitives
4. Game creation and turn rules
5. Physics, targeting, and collisions
6. Trajectory previews
7. Deterministic CPU planning
8. Flight-computer telemetry
9. React state, canvas rendering, input handling, and interface markup

The trajectory preview, CPU planner, and turn resolver use the same Verlet integration and collision helpers. Replays consume recorded authoritative events rather than re-running combat with new random outcomes.

## Build output

`npm run build` performs a strict TypeScript check and creates a portable static site in `dist/`. Vite is configured with a relative base path, allowing the build to be hosted at the domain root or in a subdirectory.
