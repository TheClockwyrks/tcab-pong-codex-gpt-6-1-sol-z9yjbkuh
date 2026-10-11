import { afterEach, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import { BACKGROUND, game } from "./game";
import * as C from "./constants";

const engines: ReturnType<
  typeof createEngine<
    import("./game").CaromState,
    import("./game").CaromDebugApi
  >
>[] = [];
afterEach(() => engines.splice(0).forEach((e) => e.destroy()));
async function setup(ms = 8) {
  const target = new EventTarget();
  const canvas = createCanvas(C.FIELD_W, C.FIELD_H);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.FIELD_W,
    height: C.FIELD_H,
    background: BACKGROUND,
    game,
    clock: new ConstantClock(ms),
    surface: {
      cssWidth: () => C.FIELD_W,
      cssHeight: () => C.FIELD_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  engines.push(engine);
  await engine.initialize();
  const key = (type: string, code: string) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, "code", { value: code });
    target.dispatchEvent(event);
  };
  const tap = async (code: string) => {
    key("keydown", code);
    await engine.advance(1);
    key("keyup", code);
    await engine.advance(1);
  };
  const pointer = (
    type: string,
    x: number,
    y: number,
    id = 1,
    device = "mouse",
  ) => {
    const event = new Event(type, { cancelable: true });
    for (const [k, v] of Object.entries({
      clientX: x,
      clientY: y,
      pointerId: id,
      pointerType: device,
      isPrimary: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
    }))
      Object.defineProperty(event, k, { value: v });
    target.dispatchEvent(event);
  };
  const poseFlight = () =>
    engine.apply((s) => ({
      ...engine.debug.clearWorld(s),
      screen: "playing",
      ball: {
        x: 640,
        y: 360,
        vx: 500,
        vy: 0,
        spin: 0,
        held: false,
        holdTimer: 0,
        serveSign: 1,
        trail: [],
      },
      mode: "versus",
    }));
  return { engine, tap, key, pointer, poseFlight };
}

describe("engine-driven Carom", () => {
  it("initializes the full state and reports pure, current diagnostics", async () => {
    const { engine } = await setup();
    const s = engine.debug.snapshot(engine.state);
    expect(s.screen).toBe("title");
    expect(s.ball?.held).toBe(true);
    expect(s.obstacles).toHaveLength(2);
    expect(s.version).toBe(C.CAROM_DEBUG_VERSION);
    const before = engine.state;
    engine.diagnostics();
    expect(engine.state).toBe(before);
    engine.apply((s) => engine.debug.setScore(s, 4, 7));
    expect(engine.diagnostics().find((d) => d.name === "p1 score")?.value).toBe(
      4,
    );
  });
  it("serves toward the receiver without moving on the serve frame", async () => {
    const { engine } = await setup(10);
    engine.apply((s) => engine.debug.setScreen(s, "countdown"));
    engine.apply((s) => engine.debug.setBallServeSign(s, -1));
    await engine.advance(101);
    expect(engine.state.screen).toBe("playing");
    expect(engine.state.ball?.vx).toBeLessThan(0);
    expect(engine.state.ball?.vy).toBeLessThan(0);
    expect(
      Math.hypot(engine.state.ball!.vx, engine.state.ball!.vy),
    ).toBeCloseTo(C.SERVE_SPEED);
  });
  it("moves both Solo key groups on the left and clamps actual driven velocity", async () => {
    const { engine, key } = await setup(10);
    engine.apply((s) => engine.debug.setScreen(s, "countdown"));
    key("keydown", "ArrowDown");
    await engine.advance(10);
    expect(engine.state.paddles.left.cy).toBeCloseTo(
      C.FIELD_CY + C.PADDLE_SPEED * 0.1,
    );
    expect(engine.state.paddles.right.cy).toBe(C.FIELD_CY);
    engine.apply((s) => engine.debug.setPaddleDriven(s, "left", true));
    engine.apply((s) => engine.debug.setPaddleVy(s, "left", 1000));
    engine.apply((s) => engine.debug.setPaddleCy(s, "left", C.PADDLE_MAX_CY));
    await engine.advance(1);
    expect(engine.state.paddles.left.vy).toBe(0);
    expect(engine.state.paddles.left.drivenVy).toBe(1000);
  });
  it("uses independent Versus inputs and honors opposite movement cancellation", async () => {
    const { engine, key, poseFlight } = await setup(10);
    poseFlight();
    key("keydown", "KeyW");
    key("keydown", "KeyS");
    key("keydown", "ArrowDown");
    await engine.advance(1);
    expect(engine.state.paddles.left.cy).toBe(C.FIELD_CY);
    expect(engine.state.paddles.right.cy).toBeCloseTo(
      C.FIELD_CY + C.PADDLE_SPEED * 0.01,
    );
  });
  it("applies paddle angle, speed and integrated motion spin once per frame", async () => {
    const { engine, poseFlight } = await setup(10);
    poseFlight();
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    engine.apply((s) => engine.debug.setPaddleDriven(s, "left", true));
    engine.apply((s) => engine.debug.setPaddleVy(s, "left", 200));
    engine.apply((s) =>
      engine.debug.setBallPosition(s, C.P1_X1 + C.BALL_R + 1, C.FIELD_CY + 2),
    );
    engine.apply((s) => engine.debug.setBallVelocity(s, -500, 0));
    await engine.advance(1);
    expect(engine.state.ball?.vx).toBeGreaterThan(0);
    expect(engine.debug.snapshot(engine.state).ball?.speed).toBeCloseTo(520);
    expect(engine.state.ball?.spin).toBeGreaterThan(160);
    expect(cues).toEqual([C.CUES.paddleHit]);
  });
  it("preserves speed and spin on wall and end-cap bounces", async () => {
    const { engine, poseFlight } = await setup(2);
    poseFlight();
    engine.apply((s) => engine.debug.setBallPosition(s, 300, C.BALL_R + 0.1));
    engine.apply((s) => engine.debug.setBallVelocity(s, 0, -500));
    engine.apply((s) => engine.debug.setBallSpin(s, 100));
    await engine.advance(1);
    expect(engine.state.ball?.vy).toBeGreaterThan(0);
    expect(engine.debug.snapshot(engine.state).ball?.speed).toBeCloseTo(500);
    expect(engine.state.ball?.spin).toBeCloseTo(
      100 * Math.pow(0.5, 0.002 / C.SPIN_HALFLIFE),
    );
    engine.apply((s) => engine.debug.setBallSpin(s, 0));
    engine.apply((s) =>
      engine.debug.setBallPosition(
        s,
        (C.P1_X0 + C.P1_X1) / 2,
        C.FIELD_CY - C.PADDLE_HALF - C.BALL_R - 0.1,
      ),
    );
    engine.apply((s) => engine.debug.setBallVelocity(s, 0, 500));
    await engine.advance(1);
    expect(engine.state.ball?.vy).toBe(-500);
  });
  it("reflects off a rotated obstacle and keeps the clock frozen", async () => {
    const { engine, poseFlight } = await setup(2);
    poseFlight();
    engine.apply((s) => engine.debug.setObstacleClock(s, 0.75));
    engine.apply((s) => engine.debug.spawnObstacle(s, 0));
    engine.apply((s) => engine.debug.setObstacleClockRunning(s, false));
    const o = engine.state.obstacles[0],
      nx = Math.cos(o.theta),
      ny = Math.sin(o.theta);
    engine.apply((s) =>
      engine.debug.setBallPosition(
        s,
        o.cx + nx * (C.OBSTACLE_HW + C.BALL_R + 0.1),
        o.cy + ny * (C.OBSTACLE_HW + C.BALL_R + 0.1),
      ),
    );
    engine.apply((s) => engine.debug.setBallVelocity(s, -500 * nx, -500 * ny));
    await engine.advance(1);
    expect(
      engine.state.ball!.vx * nx + engine.state.ball!.vy * ny,
    ).toBeGreaterThan(0);
    expect(engine.debug.snapshot(engine.state).ball?.speed).toBeCloseTo(500);
    expect(engine.state.obstacleClock).toBe(0.75);
  });
  it("scores only past the whole ball, parks toward the loser, and wins by two", async () => {
    const { engine, poseFlight } = await setup();
    poseFlight();
    engine.apply((s) => engine.debug.setScore(s, 10, 10));
    engine.apply((s) =>
      engine.debug.setBallPosition(s, C.FIELD_W + C.BALL_R + 1, 300),
    );
    await engine.advance(1);
    expect(engine.state.score).toEqual({ p1: 11, p2: 10 });
    expect(engine.state.screen).toBe("countdown");
    expect(engine.state.receiver).toBe("right");
    expect(engine.state.ball?.trail).toEqual([]);
    engine.apply((s) => engine.debug.setScreen(s, "playing"));
    engine.apply((s) => engine.debug.setBallHeld(s, false));
    engine.apply((s) =>
      engine.debug.setBallPosition(s, C.FIELD_W + C.BALL_R + 1, 300),
    );
    await engine.advance(1);
    expect(engine.state.screen).toBe("matchover");
    expect(engine.state.winner).toBe("left");
  });
  it("gates AI movement and tracking independently", async () => {
    const { engine, poseFlight } = await setup(10);
    poseFlight();
    engine.apply((s) => engine.debug.setMode(s, "solo"));
    engine.apply((s) => engine.debug.setBallPosition(s, 800, 100));
    await engine.advance(1);
    expect(engine.state.paddles.right.vy).toBe(-C.AI_SPEED);
    engine.apply((s) => engine.debug.setAiMovement(s, false));
    await engine.advance(1);
    expect(engine.state.paddles.right.vy).toBe(0);
    engine.apply((s) => engine.debug.setAiTracking(s, false));
    engine.apply((s) => engine.debug.setAiMovement(s, true));
    engine.apply((s) => engine.debug.setPaddleCy(s, "right", 200));
    await engine.advance(1);
    expect(engine.state.paddles.right.vy).toBe(C.AI_SPEED);
  });
  it("freezes the field on Escape and resumes exactly once", async () => {
    const { engine, tap, poseFlight } = await setup();
    poseFlight();
    await tap("Escape");
    expect(engine.state.screen).toBe("paused");
    const { ball, paddles, obstacleClock, simTime } = engine.state;
    await engine.advance(30);
    expect(engine.state.ball).toEqual(ball);
    expect(engine.state.paddles).toEqual(paddles);
    expect(engine.state.obstacleClock).toBe(obstacleClock);
    expect(engine.state.simTime).toBeGreaterThan(simTime);
    await tap("Escape");
    expect(engine.state.screen).toBe("playing");
  });
  it("wraps menus, remembers title selection and returns from how-to", async () => {
    const { engine, tap } = await setup();
    await tap("KeyW");
    expect(engine.state.menuIndex).toBe(2);
    await tap("Enter");
    expect(engine.state.screen).toBe("howto");
    await tap("Escape");
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(2);
    expect(engine.state.titleIndex).toBe(2);
    await tap("KeyW");
    await tap("Enter");
    expect(engine.state.mode).toBe("versus");
  });
  it("gives movement edges priority over confirm and up priority over down", async () => {
    const { engine, key } = await setup();
    key("keydown", "KeyW");
    key("keydown", "KeyS");
    key("keydown", "Enter");
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(2);
  });
  it("requires pointer press and release in the same menu region", async () => {
    const { engine, pointer } = await setup();
    const r = engine.debug.menuItemRect(engine.state, 1)!;
    pointer("pointerdown", r.x + 20, r.y + 20);
    await engine.advance(1);
    pointer("pointerup", 0, 0);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    pointer("pointerdown", r.x + 20, r.y + 20, 2, "touch");
    await engine.advance(1);
    pointer("pointerup", r.x + 20, r.y + 20, 2, "touch");
    await engine.advance(1);
    expect(engine.state.mode).toBe("versus");
    expect(engine.state.screen).toBe("countdown");
  });
  it("poses absent entities loudly, reconciles without advancing and resets every field", async () => {
    const { engine } = await setup();
    engine.apply((s) => engine.debug.clearWorld(s));
    expect(() => engine.apply((s) => engine.debug.setBallSpin(s, 1))).toThrow(
      "absent",
    );
    expect(() => engine.apply((s) => engine.debug.spawnObstacle(s, 4))).toThrow(
      "index",
    );
    engine.apply((s) => engine.debug.spawnBall(s));
    engine.apply((s) => engine.debug.spawnObstacle(s, 1));
    engine.apply((s) => engine.debug.setObstacleClock(s, 1));
    const before = engine.debug.snapshot(engine.state);
    engine.apply((s) => engine.debug.reconcile(s));
    expect(engine.debug.snapshot(engine.state)).toEqual(before);
    engine.apply((s) => engine.debug.setMuted(s, true));
    engine.apply((s) => engine.debug.reset(s));
    expect(engine.state.muted).toBe(true);
    expect(engine.state.simTime).toBe(0);
    expect(engine.state.obstacles).toHaveLength(2);
  });
  it("toggles runtime sound on every screen and emits muted collision events", async () => {
    const { engine, tap, poseFlight } = await setup();
    await tap("KeyM");
    expect(engine.state.muted).toBe(true);
    poseFlight();
    const gains: number[] = [];
    engine.events.on("cue:played", (e) => gains.push(e.gain));
    engine.apply((s) => engine.debug.setBallPosition(s, 300, 0));
    engine.apply((s) => engine.debug.setBallVelocity(s, 0, -500));
    await engine.advance(1);
    expect(gains).toEqual([0]);
  });
  it("bounds the trail by elapsed time and gives equivalent small-step flight", async () => {
    const results = [];
    for (const ms of [2, 8, 16]) {
      const { engine, poseFlight } = await setup(ms);
      poseFlight();
      engine.apply((s) => engine.debug.setBallSpin(s, 350));
      await engine.advance(800 / ms);
      expect(
        engine.state.ball!.trail.every(
          (p) => p.t >= engine.state.simTime - C.TRAIL_TIME,
        ),
      ).toBe(true);
      results.push(engine.debug.snapshot(engine.state).ball!);
    }
    for (const b of results) {
      expect(b.speed).toBeCloseTo(500);
      expect(b.vx).toBeCloseTo(results[0].vx, -1);
      expect(b.vy).toBeCloseTo(results[0].vy, -1);
    }
  });
  it("restarts and quits from pause, and plays again from the final menu", async () => {
    const { engine, tap } = await setup();
    await tap("Enter");
    await tap("Escape");
    await tap("ArrowDown");
    await tap("Enter");
    expect(engine.state.screen).toBe("countdown");
    expect(engine.state.score).toEqual({ p1: 0, p2: 0 });
    await tap("Escape");
    await tap("ArrowUp");
    await tap("Enter");
    expect(engine.state.screen).toBe("title");
    engine.apply((s) => engine.debug.setScreen(s, "matchover"));
    engine.apply((s) => engine.debug.setWinner(s, "right"));
    engine.apply((s) => engine.debug.setMenuIndex(s, 0));
    await tap("Enter");
    expect(engine.state.screen).toBe("countdown");
    engine.apply((s) => engine.debug.setScreen(s, "matchover"));
    engine.apply((s) => engine.debug.setMenuIndex(s, 1));
    await tap("Enter");
    expect(engine.state.screen).toBe("title");
  });
  it("reads every debug pose without clamping or changing neighboring fields", async () => {
    const { engine } = await setup();
    const d = engine.debug;
    engine.apply((s) => d.setTitleIndex(s, 2));
    engine.apply((s) => d.setResumeScreen(s, "countdown"));
    engine.apply((s) => d.setReceiver(s, "right"));
    engine.apply((s) => d.setBallHoldTimer(s, 0));
    engine.apply((s) => d.drawBallServeSign(s));
    engine.apply((s) => d.setBallServeSign(s, -1));
    expect(d.snapshot(engine.state)).toMatchObject({
      titleIndex: 2,
      resumeScreen: "countdown",
      receiver: "right",
      ball: { holdTimer: 0, serveSign: -1 },
    });
    expect(d.menuItemRect(engine.state, -1)).toBeNull();
    expect(d.menuItemRect(engine.state, 99)).toBeNull();
    engine.apply((s) => d.setScreen(s, "countdown"));
    await engine.advance(1);
    expect(engine.state.ball?.held).toBe(false);
    expect(engine.state.ball?.x).toBe(C.FIELD_CX);
    expect(engine.state.ball?.vx).toBeGreaterThan(0);
    engine.apply((s) => d.setScreen(s, "title"));
    engine.apply((s) => d.clearWorld(s));
    await engine.advance(1);
    expect(d.snapshot(engine.state).ball).toBeNull();
    expect(
      engine.diagnostics().find((x) => x.name === "ball speed")?.value,
    ).toBe("none");
  });
  it("does not move absent balls and separates left-goal scoring from paddle contact", async () => {
    const { engine, poseFlight } = await setup();
    poseFlight();
    engine.apply((s) => engine.debug.clearWorld(s));
    await engine.advance(4);
    expect(engine.state.score).toEqual({ p1: 0, p2: 0 });
    engine.apply((s) => engine.debug.spawnBall(s));
    engine.apply((s) => engine.debug.setBallHeld(s, false));
    engine.apply((s) => engine.debug.setBallPosition(s, -C.BALL_R - 1, 100));
    await engine.advance(1);
    expect(engine.state.score).toEqual({ p1: 0, p2: 1 });
    expect(engine.state.receiver).toBe("left");
  });
});
