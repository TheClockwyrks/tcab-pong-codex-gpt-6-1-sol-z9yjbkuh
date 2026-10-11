import type { Game, UpdateApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import { render } from "./render";
import {
  simulate,
  initialState,
  obstaclePose,
  startMatch,
  toTitle,
  drawSign,
  parkedBall,
} from "./simulation";

export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";

export type Mode = "solo" | "versus";

export type Side = "left" | "right";

export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}

export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}

export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
  readonly theta: number;
}

export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";

  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;

  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;

  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];
  readonly obstacleClock: number;
  readonly obstacleClockRunning: boolean;

  readonly simTime: number;
  readonly muted: boolean;
}

export const BACKGROUND = "#0b131b";
export type StateView = DeepReadonly<CaromState>;
export interface MenuRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export const menuItems = (s: StateView): readonly string[] =>
  s.screen === "title"
    ? C.TITLE_ITEMS
    : s.screen === "paused"
      ? C.PAUSE_ITEMS
      : s.screen === "matchover"
        ? C.MATCHOVER_ITEMS
        : s.screen === "howto"
          ? ["BACK TO MENU"]
          : [];
export function menuItemRect(s: StateView, index: number): MenuRect | null {
  if (index < 0 || index >= menuItems(s).length || !Number.isInteger(index))
    return null;
  return {
    x: 455,
    y:
      (s.screen === "howto" ? 572 : s.screen === "title" ? 354 : 370) +
      index * 64,
    w: 370,
    h: 52,
  };
}
function ballPose(s: StateView, patch: Partial<BallState>): CaromState {
  if (!s.ball) throw new Error("Carom: ball is absent");
  return { ...s, ball: { ...s.ball, ...patch } };
}
function paddlePose(
  s: StateView,
  side: Side,
  patch: Partial<PaddleState>,
): CaromState {
  return {
    ...s,
    paddles: { ...s.paddles, [side]: { ...s.paddles[side], ...patch } },
  };
}
function createDebug() {
  return {
    version: C.CAROM_DEBUG_VERSION,
    clearWorld: (s: StateView): CaromState => ({
      ...s,
      ball: null,
      obstacles: [],
    }),
    spawnBall: (s: StateView): CaromState => ({
      ...s,
      ball: parkedBall(),
    }),
    spawnObstacle: (s: StateView, index: number): CaromState => ({
      ...s,
      obstacles: [
        ...s.obstacles.filter((o) => o.index !== index),
        obstaclePose(index, s.obstacleClock),
      ].sort((a, b) => a.index - b.index),
    }),
    reset: (s: StateView): CaromState => initialState(s.muted),
    reconcile: (s: StateView): CaromState => ({
      ...s,
      obstacles: s.obstacles.map((o) => obstaclePose(o.index, s.obstacleClock)),
    }),
    setScreen: (s: StateView, screen: Screen): CaromState => ({ ...s, screen }),
    setMode: (s: StateView, mode: Mode): CaromState => ({ ...s, mode }),
    setMenuIndex: (s: StateView, menuIndex: number): CaromState => ({
      ...s,
      menuIndex,
    }),
    setTitleIndex: (s: StateView, titleIndex: number): CaromState => ({
      ...s,
      titleIndex,
    }),
    setResumeScreen: (
      s: StateView,
      resumeScreen: "countdown" | "playing",
    ): CaromState => ({ ...s, resumeScreen }),
    setScore: (s: StateView, p1: number, p2: number): CaromState => ({
      ...s,
      score: { p1, p2 },
    }),
    setWinner: (s: StateView, winner: Side | null): CaromState => ({
      ...s,
      winner,
    }),
    setReceiver: (s: StateView, receiver: Side): CaromState => ({
      ...s,
      receiver,
    }),
    setPaddleCy: (s: StateView, side: Side, cy: number): CaromState =>
      paddlePose(s, side, { cy }),
    setPaddleVy: (s: StateView, side: Side, drivenVy: number): CaromState =>
      paddlePose(s, side, { drivenVy }),
    setPaddleDriven: (s: StateView, side: Side, driven: boolean): CaromState =>
      paddlePose(s, side, { driven }),
    setBallPosition: (s: StateView, x: number, y: number): CaromState =>
      ballPose(s, { x, y }),
    setBallVelocity: (s: StateView, vx: number, vy: number): CaromState =>
      ballPose(s, { vx, vy }),
    setBallSpin: (s: StateView, spin: number): CaromState =>
      ballPose(s, { spin }),
    setBallHeld: (s: StateView, held: boolean): CaromState =>
      ballPose(s, { held }),
    setBallHoldTimer: (s: StateView, holdTimer: number): CaromState =>
      ballPose(s, { holdTimer }),
    setBallServeSign: (s: StateView, serveSign: 1 | -1): CaromState =>
      ballPose(s, { serveSign }),
    drawBallServeSign: (s: StateView): CaromState =>
      ballPose(s, { serveSign: drawSign() }),
    setAiTracking: (s: StateView, tracking: boolean): CaromState => ({
      ...s,
      ai: { ...s.ai, tracking },
    }),
    setAiMovement: (s: StateView, movement: boolean): CaromState => ({
      ...s,
      ai: { ...s.ai, movement },
    }),
    setMuted: (s: StateView, muted: boolean): CaromState => ({ ...s, muted }),
    setObstacleClock: (s: StateView, obstacleClock: number): CaromState => ({
      ...s,
      obstacleClock,
      obstacles: s.obstacles.map((o) => obstaclePose(o.index, obstacleClock)),
    }),
    setObstacleClockRunning: (
      s: StateView,
      obstacleClockRunning: boolean,
    ): CaromState => ({ ...s, obstacleClockRunning }),
    snapshot: (s: StateView) => ({
      version: C.CAROM_DEBUG_VERSION,
      screen: s.screen,
      mode: s.mode,
      menuIndex: s.menuIndex,
      titleIndex: s.titleIndex,
      resumeScreen: s.resumeScreen,
      score: { ...s.score },
      winner: s.winner,
      muted: s.muted,
      paddles: { left: { ...s.paddles.left }, right: { ...s.paddles.right } },
      ai: { ...s.ai },
      receiver: s.receiver,
      ball: s.ball
        ? {
            ...s.ball,
            trail: s.ball.trail.map((p) => ({ ...p })),
            speed: Math.hypot(s.ball.vx, s.ball.vy),
          }
        : null,
      obstacles: s.obstacles.map((o) => ({ ...o })),
      obstacleClock: s.obstacleClock,
      obstacleClockRunning: s.obstacleClockRunning,
      simTime: s.simTime,
    }),
    menuItemRect,
  };
}
export type CaromDebugApi = ReturnType<typeof createDebug>;

function confirm(s: StateView): CaromState {
  if (s.screen === "title") {
    const next = { ...s, titleIndex: s.menuIndex };
    return s.menuIndex === 2
      ? { ...next, screen: "howto", menuIndex: 0 }
      : startMatch(next, s.menuIndex === 0 ? "solo" : "versus");
  }
  if (s.screen === "howto") return toTitle(s);
  if (s.screen === "paused")
    return s.menuIndex === 0
      ? { ...s, screen: s.resumeScreen }
      : s.menuIndex === 1
        ? startMatch(s)
        : toTitle(s);
  if (s.screen === "matchover")
    return s.menuIndex === 0 ? startMatch(s) : toTitle(s);
  return { ...s };
}
// A cache derived from the menu's incoming pointer samples. It is carried with
// the frame value so a press and release can span any number of frames.
type MenuInputState = CaromState & {
  readonly menuPresses?: Readonly<Record<number, number>>;
};
function readInput(
  s: DeepReadonly<MenuInputState>,
  api: UpdateApi,
): CaromState {
  const edges = Object.fromEntries(
    C.ACTIONS.map((a) => [a, api.input.pressed(a)]),
  );
  api.audio.setMuted(s.muted);
  if (edges.mute) api.audio.setMuted(!api.audio.muted());
  let next: MenuInputState = { ...s, muted: api.audio.muted() };
  const active = s.screen === "playing" || s.screen === "countdown";
  if (active) {
    if (edges.pause)
      next = {
        ...next,
        screen: "paused",
        resumeScreen: s.screen as "playing" | "countdown",
        menuIndex: 0,
      };
    return next;
  }
  if (s.screen === "paused" && (edges.pause || edges.back))
    return { ...next, screen: s.resumeScreen };
  if ((s.screen === "howto" || s.screen === "matchover") && edges.back)
    return toTitle(next);
  const items = menuItems(s);
  const up = edges["p1-up"] || edges["p2-up"],
    down = edges["p1-down"] || edges["p2-down"];
  let confirmed = false;
  if (items.length) {
    if (up || down)
      next = {
        ...next,
        menuIndex: (s.menuIndex + (up ? -1 : 1) + items.length) % items.length,
      };
    else if (edges.confirm) {
      next = confirm(next);
      confirmed = true;
    }
    const presses = { ...s.menuPresses };
    const hit = (x: number, y: number) =>
      items.findIndex((_, i) => {
        const r = menuItemRect(s, i);
        return (
          r !== null && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
        );
      });
    for (const sample of api.input.pointerSamples()) {
      const index = hit(sample.x, sample.y);
      if (index >= 0 && !confirmed) next = { ...next, menuIndex: index };
      if (sample.type === "down" && sample.button === "primary")
        presses[sample.id] = index;
      if (sample.type === "up") {
        if (index >= 0 && presses[sample.id] === index && !confirmed) {
          next = confirm({ ...next, menuIndex: index });
          confirmed = true;
        }
        delete presses[sample.id];
      }
    }
    next = { ...next, menuPresses: confirmed ? {} : presses };
  }
  return next;
}
export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api) {
    for (const a of C.ACTIONS)
      api.input.register(a, { keys: [...C.BINDINGS[a]] });
    api.audio.define(C.CUES.paddleHit, {
      wave: "triangle",
      freq: 620,
      freqTo: 310,
      gain: 0.18,
      durationMs: 75,
    });
    api.audio.define(C.CUES.wallBounce, {
      freq: 260,
      freqTo: 180,
      gain: 0.12,
      durationMs: 55,
    });
    api.audio.define(C.CUES.obstacleBounce, {
      wave: "sine",
      freq: 900,
      freqTo: 500,
      gain: 0.14,
      durationMs: 95,
    });
    api.audio.define(C.CUES.score, {
      wave: "triangle",
      freq: 380,
      freqTo: 760,
      gain: 0.2,
      durationMs: 240,
    });
    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("mode", (s) => s.mode);
    api.diagnostics.register("p1 score", (s) => s.score.p1);
    api.diagnostics.register("p2 score", (s) => s.score.p2);
    api.diagnostics.register("ball position", (s) =>
      s.ball ? `${s.ball.x.toFixed(1)}, ${s.ball.y.toFixed(1)}` : "none",
    );
    api.diagnostics.register("ball velocity", (s) =>
      s.ball ? `${s.ball.vx.toFixed(1)}, ${s.ball.vy.toFixed(1)}` : "none",
    );
    api.diagnostics.register("ball speed", (s) =>
      s.ball ? Math.hypot(s.ball.vx, s.ball.vy) : "none",
    );
    api.diagnostics.register("ball spin", (s) => s.ball?.spin ?? "none");
    for (const side of ["left", "right"] as const) {
      api.diagnostics.register(`${side} cy`, (s) => s.paddles[side].cy);
      api.diagnostics.register(`${side} vy`, (s) => s.paddles[side].vy);
    }
    return [initialState(), createDebug()];
  },
  update(s, api, dt) {
    const next = readInput(s, api);
    const held = (a: string) => api.input.value(a) > 0;
    const up = held("p1-up") || (next.mode === "solo" && held("p2-up"));
    const down = held("p1-down") || (next.mode === "solo" && held("p2-down"));
    const result = simulate(next, dt, [
      Number(down) - Number(up),
      Number(held("p2-down")) - Number(held("p2-up")),
    ]);
    for (const cue of result.events) api.audio.play(cue);
    return result.state;
  },
  render,
};
