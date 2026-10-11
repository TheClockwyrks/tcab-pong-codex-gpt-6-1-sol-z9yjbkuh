# Carom

A top-down paddle duel about angles, bank shots, and spin. Play against the house AI or a friend on the same keyboard. Moving your paddle as you strike curves your return; two swaying, rotating obstacles make every rally a new puzzle. First to 11 wins, with a two-point lead.

Everything runs locally in the browser. Graphics are drawn on canvas and the Simple 2D engine synthesizes sound, handles input, fits the court to the screen, and drives the frame loop. No backend, runtime downloads, or credentials are needed.

## Run

Install with `npm ci`, then use `npm run dev` and open the URL Vite prints.

`npm run build` produces the complete static site in `dist/`. Serve that directory at the root of any static web server, or use `npm run preview` locally.

## Controls

| Action | Keys |
| --- | --- |
| Solo paddle | W / S or Up / Down |
| Versus left paddle | W / S |
| Versus right paddle | Up / Down |
| Select menu item | W / S or Up / Down; mouse or touch |
| Confirm | Enter or Space; click or tap |
| Pause / resume | P or Escape |
| Back | Escape |
| Mute / unmute | M |
| Engine diagnostics | Backtick |

Touch devices show the engine's two vertical sliders and menu buttons. The entire court stays visible in either orientation; landscape gives more room to play.

## Development

`npm run typecheck`, `npm run lint`, `npm run format`, and `npm test` run the repository checks. Tests create a real engine over a Node canvas and advance counted frames with controlled clocks. Coverage and the test report are written into `coverage/`.

`src/game.ts` contains the state contract, input transitions, diagnostics, and debug API. `src/simulation.ts` advances the match without drawing; `src/render.ts` draws the court and menus. The engine's debug surface is available through `engine.debug` to callers that construct an engine; no browser globals are installed by the game.

The player description, screenshots, and a replay recorded from the game are in `showcase/`.
