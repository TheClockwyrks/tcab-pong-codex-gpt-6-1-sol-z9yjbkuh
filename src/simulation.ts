import * as C from "./constants";
import type {
  BallState,
  CaromState,
  ObstacleState,
  PaddleState,
  Side,
} from "./game";
import type { DeepReadonly } from "ts-essentials";

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));
export const drawSign = (): 1 | -1 => (Math.random() < 0.5 ? -1 : 1);
export function parkedBall(): BallState {
  return {
    x: C.FIELD_CX,
    y: C.FIELD_CY,
    vx: 0,
    vy: 0,
    spin: 0,
    held: true,
    holdTimer: C.HOLD_TIME,
    serveSign: drawSign(),
    trail: [],
  };
}
export function obstaclePose(index: number, t: number): ObstacleState {
  const base = C.OBSTACLE_CENTERS[index];
  if (!base) throw new Error("Unknown obstacle index");
  return {
    index,
    cx: base.x,
    cy:
      base.y +
      (index === 0 ? 1 : -1) *
        C.OBSTACLE_SWAY_AMP *
        Math.sin((2 * Math.PI * t) / C.OBSTACLE_SWAY_PERIOD),
    theta: C.OBSTACLE_SPIN_RATE * t,
  };
}
export function initialState(muted = false): CaromState {
  const paddle: PaddleState = {
    cy: C.FIELD_CY,
    vy: 0,
    driven: false,
    drivenVy: 0,
  };
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: { ...paddle }, right: { ...paddle } },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkedBall(),
    obstacles: C.OBSTACLE_CENTERS.map((_, i) => obstaclePose(i, 0)),
    obstacleClock: 0,
    obstacleClockRunning: true,
    simTime: 0,
    muted,
  };
}
export function startMatch(
  s: DeepReadonly<CaromState>,
  mode = s.mode,
): CaromState {
  return {
    ...s,
    mode,
    screen: "countdown",
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkedBall(),
    paddles: {
      left: { ...s.paddles.left, cy: C.FIELD_CY, vy: 0 },
      right: { ...s.paddles.right, cy: C.FIELD_CY, vy: 0 },
    },
    obstacleClock: 0,
    obstacleClockRunning: true,
    obstacles: s.obstacles.map((o) => obstaclePose(o.index, 0)),
  };
}
export function toTitle(s: DeepReadonly<CaromState>): CaromState {
  return {
    ...initialState(s.muted),
    titleIndex: s.titleIndex,
    menuIndex: s.titleIndex,
    simTime: s.simTime,
  };
}
export function movePaddle(
  p: DeepReadonly<PaddleState>,
  velocity: number,
  dt: number,
): PaddleState {
  const requested = p.driven ? p.drivenVy : velocity;
  const raw = p.cy + requested * dt;
  const cy = clamp(raw, C.PADDLE_MIN_CY, C.PADDLE_MAX_CY);
  return { ...p, cy, vy: raw !== cy && dt > 0 ? (cy - p.cy) / dt : requested };
}
type Flight = { -readonly [K in keyof BallState]: BallState[K] };
function paddleCollision(
  b: Flight,
  p: DeepReadonly<PaddleState>,
  side: Side,
  events: Set<string>,
): void {
  const x0 = side === "left" ? C.P1_X0 : C.P2_X0,
    x1 = side === "left" ? C.P1_X1 : C.P2_X1;
  const y0 = p.cy - C.PADDLE_HALF,
    y1 = p.cy + C.PADDLE_HALF;
  if (!(
    b.x > x0 - C.BALL_R &&
    b.x < x1 + C.BALL_R &&
    b.y > y0 - C.BALL_R &&
    b.y < y1 + C.BALL_R
  ))
    return;
  const depths = [
    b.x - (x0 - C.BALL_R),
    x1 + C.BALL_R - b.x,
    b.y - (y0 - C.BALL_R),
    y1 + C.BALL_R - b.y,
  ];
  const face = depths.indexOf(Math.min(...depths));
  if (face < 2) {
    b.x = face === 0 ? x0 - C.BALL_R : x1 + C.BALL_R;
    if ((face === 0 && b.vx <= 0) || (face === 1 && b.vx >= 0)) return;
    const angle =
      clamp((b.y - p.cy) / C.PADDLE_HALF, -1, 1) * C.MAX_BOUNCE_ANGLE;
    const speed = Math.min(Math.hypot(b.vx, b.vy) * C.SPEED_MULT, C.SPEED_CAP);
    b.vx = (side === "left" ? 1 : -1) * speed * Math.cos(angle);
    b.vy = speed * Math.sin(angle);
    b.spin = clamp(
      b.spin + p.vy * C.SPIN_FROM_PADDLE,
      -C.SPIN_CLAMP,
      C.SPIN_CLAMP,
    );
    b.x = side === "left" ? C.P1_X1 + C.BALL_R : C.P2_X0 - C.BALL_R;
    events.add(C.CUES.paddleHit);
  } else {
    b.y = face === 2 ? y0 - C.BALL_R : y1 + C.BALL_R;
    if ((face === 2 && b.vy > 0) || (face === 3 && b.vy < 0)) {
      b.vy = -b.vy;
      events.add(C.CUES.wallBounce);
    }
  }
}
function obstacleCollision(
  b: Flight,
  o: DeepReadonly<ObstacleState>,
  events: Set<string>,
): void {
  const c = Math.cos(o.theta),
    s = Math.sin(o.theta),
    dx = b.x - o.cx,
    dy = b.y - o.cy;
  const lx = dx * c + dy * s,
    ly = -dx * s + dy * c;
  const qx = clamp(lx, -C.OBSTACLE_HW, C.OBSTACLE_HW),
    qy = clamp(ly, -C.OBSTACLE_HH, C.OBSTACLE_HH);
  const ax = lx - qx,
    ay = ly - qy,
    d = Math.hypot(ax, ay);
  if (d >= C.BALL_R) return;
  let nx: number, ny: number, penetration: number;
  if (d > 0) {
    nx = ax / d;
    ny = ay / d;
    penetration = C.BALL_R - d;
  } else if (C.OBSTACLE_HW - Math.abs(lx) <= C.OBSTACLE_HH - Math.abs(ly)) {
    nx = lx < 0 ? -1 : 1;
    ny = 0;
    penetration = C.BALL_R + C.OBSTACLE_HW - Math.abs(lx);
  } else {
    nx = 0;
    ny = ly < 0 ? -1 : 1;
    penetration = C.BALL_R + C.OBSTACLE_HH - Math.abs(ly);
  }
  const wx = nx * c - ny * s,
    wy = nx * s + ny * c,
    dot = b.vx * wx + b.vy * wy;
  if (dot < 0) {
    b.vx -= 2 * dot * wx;
    b.vy -= 2 * dot * wy;
    events.add(C.CUES.obstacleBounce);
  }
  b.x += wx * penetration;
  b.y += wy * penetration;
}
/** Pure simulation; cues are returned to the caller, never played here. */
export function simulate(
  s: DeepReadonly<CaromState>,
  dt: number,
  axes: readonly [number, number],
): { state: CaromState; events: Set<string> } {
  const events = new Set<string>();
  let state: CaromState = { ...s, simTime: s.simTime + dt };
  if (s.screen !== "playing" && s.screen !== "countdown")
    return { state, events };
  let aiVy = 0;
  if (s.mode === "solo" && s.ai.movement) {
    const defend =
      s.ai.tracking &&
      s.screen === "playing" &&
      s.ball !== null &&
      s.ball.vx > 0;
    const target =
      defend && s.ball ? s.ball.y - s.ball.vy * C.AI_REACT : C.AI_HOME_Y;
    const diff = target - s.paddles.right.cy;
    if (
      Math.abs(diff) > (defend ? C.AI_DEADZONE : C.AI_HOME_DEADZONE) &&
      dt > 0
    )
      aiVy = Math.sign(diff) * Math.min(C.AI_SPEED, Math.abs(diff) / dt);
  }
  state = {
    ...state,
    paddles: {
      left: movePaddle(s.paddles.left, axes[0] * C.PADDLE_SPEED, dt),
      right: movePaddle(
        s.paddles.right,
        s.mode === "solo" ? aiVy : axes[1] * C.PADDLE_SPEED,
        dt,
      ),
    },
  };
  if (s.ball) {
    const b: Flight = { ...s.ball, trail: [...s.ball.trail] };
    if (b.held) {
      b.x = C.FIELD_CX;
      b.y = C.FIELD_CY;
      b.holdTimer = Math.max(0, b.holdTimer - dt);
      if (b.holdTimer <= 0) {
        b.held = false;
        b.vx =
          (s.receiver === "left" ? -1 : 1) *
          C.SERVE_SPEED *
          Math.cos(C.SERVE_ANGLE);
        b.vy = b.serveSign * C.SERVE_SPEED * Math.sin(C.SERVE_ANGLE);
        b.trail = [];
        state = { ...state, screen: "playing" };
      }
    } else if (s.screen === "playing") {
      const n = Math.max(
          1,
          Math.ceil((Math.hypot(b.vx, b.vy) * dt) / C.MAX_SUBSTEP),
        ),
        h = dt / n;
      for (let i = 0; i < n; i++) {
        const speed = Math.hypot(b.vx, b.vy);
        if (speed > 0) {
          const a = (b.spin / speed) * h,
            c = Math.cos(a),
            sn = Math.sin(a),
            vx = b.vx;
          b.vx = vx * c - b.vy * sn;
          b.vy = vx * sn + b.vy * c;
        }
        b.spin *= Math.pow(0.5, h / C.SPIN_HALFLIFE);
        b.x += b.vx * h;
        b.y += b.vy * h;
        if (b.y - C.BALL_R < 0 && b.vy < 0) {
          b.y = C.BALL_R;
          b.vy = -b.vy;
          events.add(C.CUES.wallBounce);
        } else if (b.y + C.BALL_R > C.FIELD_H && b.vy > 0) {
          b.y = C.FIELD_H - C.BALL_R;
          b.vy = -b.vy;
          events.add(C.CUES.wallBounce);
        }
        paddleCollision(b, state.paddles.left, "left", events);
        paddleCollision(b, state.paddles.right, "right", events);
        for (const o of s.obstacles) obstacleCollision(b, o, events);
      }
    }
    b.trail = [
      ...b.trail.filter((p) => p.t >= state.simTime - C.TRAIL_TIME),
      { x: b.x, y: b.y, t: state.simTime },
    ];
    state = { ...state, ball: b };
    if (
      !b.held &&
      s.screen === "playing" &&
      (b.x - C.BALL_R > C.FIELD_W || b.x + C.BALL_R < 0)
    ) {
      const side: Side = b.x > C.FIELD_W ? "left" : "right";
      const score = {
        p1: s.score.p1 + (side === "left" ? 1 : 0),
        p2: s.score.p2 + (side === "right" ? 1 : 0),
      };
      const won =
        Math.max(score.p1, score.p2) >= C.WIN_SCORE &&
        Math.abs(score.p1 - score.p2) >= C.WIN_LEAD;
      state = {
        ...state,
        score,
        ...(won
          ? { winner: side, screen: "matchover" as const, menuIndex: 0 }
          : {
              receiver:
                side === "left" ? ("right" as const) : ("left" as const),
              ball: parkedBall(),
              screen: "countdown" as const,
            }),
      };
      events.add(C.CUES.score);
    }
  }
  const clock = s.obstacleClock + (s.obstacleClockRunning ? dt : 0);
  state = {
    ...state,
    obstacleClock: clock,
    obstacles: s.obstacles.map((o) => obstaclePose(o.index, clock)),
  };
  return { state, events };
}
