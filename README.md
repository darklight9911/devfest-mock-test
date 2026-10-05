# Smart Escape — Interactive Evacuation Route Simulator

AI DevFest 2026 · Vibe Coding (Solo) · Mock Test

|                     |                                                  |
| ------------------- | ------------------------------------------------ |
| **Name**            | `<YOUR FULL NAME>`                               |
| **Registration no** | `<YOUR REGISTRATION NUMBER>`                     |
| **Live site**       | `<PUBLIC HTTPS LINK, e.g. https://….vercel.app>` |
| **Repository**      | `<PUBLIC GITHUB REPOSITORY URL>`                 |

Smart Escape is a frontend-only web app. Import a `building.json`, pick where you are, and it
highlights the lowest-cost route to an open exit. Block rooms, junctions or corridors, or close
exits, and the route is recalculated instantly (or the app reports that no route exists).

> Educational simulation only — not a certified real-world evacuation planning tool.

## How to run

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # start the dev server at http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the production build locally
npm test           # unit tests (routing, validation, store, translations)
npm run check      # type-check + tests
```

No environment variables, API keys or backend are needed. Routing runs fully in the browser.

## Features

### Main tasks

- **Import and validate** `building.json` (file picker or drag and drop, read locally). Every rule in
  the spec is checked and _all_ problems are listed in the active language: JSON syntax, required
  fields, node/edge limits (2–60 / 1–150), unique case-sensitive ids, node types, numeric
  coordinates, positive integer costs, unknown endpoints, self-loops, repeated pairs, and
  `initial_state` ids that do not exist or are of the wrong kind. Disconnected graphs and empty
  state arrays are accepted. A rejected file never replaces the building already loaded.
- **Map** drawn at the supplied coordinates with labels, a distinct shape per node type (room
  square, junction circle, exit hexagon) and the cost shown on every corridor.
- **Start selection** from the map or a dropdown (rooms and junctions only; blocked ones refused).
- **Route** highlighted on the map, with the node sequence, chosen exit, total cost and a cost
  breakdown (`2 + 3 + 2 = 7`).
- **Hazards**: block/unblock rooms, junctions and corridors, close/reopen exits, from the map
  ("Toggle hazard" mode) or from accessible lists. Each state has its own colour _and_ marker
  (red ✕ badge, dashed red corridor, grey dashed hexagon with a bar, dotted corridor when an end
  is blocked).
- **Instant recalculation** after every change; **Reset** restores the file's own `initial_state`.
- **Failure states**: "No route available" and "Starting location blocked".
- **Bangla and English** for all labels, buttons, statuses, errors and instructions (dataset labels
  stay as supplied). The choice is remembered in the browser.
- **Subtle animations**: node pop on selection/toggle, route draw-in, soft fades. Nothing flashes,
  and `prefers-reduced-motion` turns them off.

### Routing rules (exact)

- Cost is the sum of corridor costs; coordinates and hop count are never used.
- Blocked nodes (and their corridors), blocked corridors and closed exits are excluded — a closed
  exit cannot even be passed through.
- Lowest cost wins; ties go to the lexicographically smallest exit id, then to the
  lexicographically smallest node-id sequence (plain string comparison, not locale-dependent).
  Dijkstra labels are ordered by `(cost, node-id sequence)`, which keeps the tie-break correct
  at every step. See `src/core/routing.ts`.

### Bonus

- **3D game view** (toggle "2D map / 3D game", built with Three.js and loaded only when opened):
  - procedural assets — rooms with walls, doorways and furniture; junction lamp posts; exits with
    door frames and EXIT signs; fire on blocked locations; striped barriers on blocked corridors;
    red shutters on closed exits; flowing blue arrows on the lowest-cost route; a beacon over the
    chosen exit; an evacuee in a hi-vis vest;
  - the same click actions as the 2D map (set start / toggle hazards), drag to orbit, zoom, pan;
  - **Run evacuation** walks the evacuee along the computed route;
  - **Escape drill** mini-game: walk the evacuee yourself, one corridor at a time, under the same
    hazard rules, then get 1–3 stars against the lowest possible cost (the answer stays hidden
    until you finish or stop the drill; undo is allowed);
  - the 3D view only _draws_ the result of the routing code, so the 2D and 3D views always agree.
    If WebGL is unavailable, the 2D map keeps every feature.
- High-contrast mode, light/dark theme following the system, keyboard-operable map and controls,
  skip link, screen-reader labels and live regions.
- Responsive layout from phones to wide desktops (map scrolls sideways inside its frame when a
  narrow screen cannot show it at a readable size).

## Project structure

```
src/
  core/        pure logic, no DOM: validate.ts, graph.ts, routing.ts, drill.ts (3D mini-game)
  state/       store.ts - single observable store (hazards, start, language, mode)
  i18n/        en.ts, bn.ts (typed against each other), t() helper
  ui/          dom helpers, toast, shared click actions, components/ (map, panels, legend,
               header, 3D view HUD) and three/ (3D scene, procedural assets, evacuee)
  styles/      tokens, base, layout, components, map (design tokens + themes)
  utils/       safe localStorage wrapper
tests/         routing, validation, store and i18n tests (+ shared helpers)
public/        favicon and samples/building.json
```

## Tests

`npm test` runs 78 tests, including the five official sample checks, equal-cost ties (exit ties,
path ties, ties in the middle of a path, case sensitivity), closed exits as intermediate nodes,
disconnected graphs, `initial_state` reset, the escape-drill rules and scoring, and a check that
Bangla has every English key.

## Deployment (Vercel)

Static site only: framework preset **Vite**, build command `npm run build`, output directory
`dist`. There are no serverless functions or API routes.

## Known issues

- The 3D view is mouse/touch based; keyboard users get the full feature set through the 2D map and
  the hazard lists. The 3D view needs WebGL (a message explains when it is unavailable).

- On very narrow phones the map may need a small sideways scroll to reach the right-hand column.
- Very dense graphs (60 nodes with near-identical coordinates) can have overlapping labels;
  routing is unaffected.

## AI tools used

`<LIST YOUR AI TOOLS>`

## Most useful prompt

`<PASTE YOUR MOST USEFUL PROMPT>`

## License

MIT — see [LICENSE](LICENSE).
