import type { RenderApi } from "@clockwyrks/simple-2d";
import type { StateView } from "./game";
import { BACKGROUND, menuItemRect, menuItems } from "./game";
import * as C from "./constants";
const INK = "#e9eee8",
  MINT = "#82f0c0",
  CORAL = "#ff8b80",
  AMBER = "#e9be69",
  DIM = "#6e8490";
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = INK,
  align: CanvasTextAlign = "center",
  weight = 500,
): void {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Arial", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
}
function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  r = 7,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
function line(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  x1: number,
  y1: number,
  color: string,
  width = 1,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}
function court(s: StateView, ctx: CanvasRenderingContext2D): void {
  const glow = ctx.createRadialGradient(
    C.FIELD_CX,
    C.FIELD_CY,
    50,
    C.FIELD_CX,
    C.FIELD_CY,
    700,
  );
  glow.addColorStop(0, "#152730");
  glow.addColorStop(1, BACKGROUND);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  ctx.strokeStyle = "#ffffff04";
  ctx.lineWidth = 1;
  for (let x = 80; x < C.FIELD_W; x += 80)
    line(ctx, x, 0, x, C.FIELD_H, "#ffffff04");
  for (let y = 80; y < C.FIELD_H; y += 80)
    line(ctx, 0, y, C.FIELD_W, y, "#ffffff04");
  line(ctx, 24, 24, C.FIELD_W - 24, 24, "#31404a");
  line(ctx, 24, C.FIELD_H - 24, C.FIELD_W - 24, C.FIELD_H - 24, "#31404a");
  ctx.setLineDash([5, 13]);
  line(ctx, C.NET_X, 116, C.NET_X, C.FIELD_H - 100, "#40515b", 2);
  ctx.setLineDash([]);
  ctx.strokeStyle = "#344851";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(C.FIELD_CX, C.FIELD_CY, 68, 0, Math.PI * 2);
  ctx.stroke();
  for (const o of s.obstacles) {
    ctx.save();
    ctx.translate(o.cx, o.cy);
    ctx.rotate(o.theta);
    ctx.shadowColor = AMBER;
    ctx.shadowBlur = 18;
    bar(
      ctx,
      -C.OBSTACLE_HW,
      -C.OBSTACLE_HH,
      C.OBSTACLE_W,
      C.OBSTACLE_H,
      AMBER,
      5,
    );
    ctx.shadowBlur = 0;
    line(ctx, -3, -C.OBSTACLE_HH + 14, -3, C.OBSTACLE_HH - 14, "#fff1c9", 2);
    ctx.restore();
  }
  for (const side of ["left", "right"] as const) {
    const color = side === "left" ? MINT : CORAL,
      x = side === "left" ? C.P1_X0 : C.P2_X0;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    bar(
      ctx,
      x,
      s.paddles[side].cy - C.PADDLE_HALF,
      C.PADDLE_W,
      C.PADDLE_H,
      color,
    );
    ctx.shadowBlur = 0;
  }
  if (s.ball) {
    const b = s.ball;
    ctx.lineCap = "round";
    for (let i = 1; i < b.trail.length; i++) {
      const a = b.trail[i - 1],
        p = b.trail[i];
      ctx.globalAlpha =
        Math.max(0, 1 - (s.simTime - p.t) / C.TRAIL_TIME) * 0.45;
      line(ctx, a.x, a.y, p.x, p.y, INK, (C.BALL_R * 1.2 * i) / b.trail.length);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = INK;
    ctx.shadowColor = INK;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(b.x, b.y, C.BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}
function hud(s: StateView, ctx: CanvasRenderingContext2D): void {
  text(ctx, "PLAYER 01", C.FIELD_CX - 145, 54, 11, MINT);
  text(
    ctx,
    s.mode === "solo" ? "HOUSE AI" : "PLAYER 02",
    C.FIELD_CX + 145,
    54,
    11,
    CORAL,
  );
  text(
    ctx,
    String(s.score.p1).padStart(2, "0"),
    C.FIELD_CX - 145,
    98,
    58,
    INK,
    "center",
    700,
  );
  text(
    ctx,
    String(s.score.p2).padStart(2, "0"),
    C.FIELD_CX + 145,
    98,
    58,
    INK,
    "center",
    700,
  );
  text(ctx, "CAROM", 44, 57, 18, INK, "left", 800);
  text(
    ctx,
    s.mode === "solo" ? "SOLO / HUMAN × AI" : "VERSUS / LOCAL DUEL",
    44,
    82,
    11,
    DIM,
    "left",
  );
  text(
    ctx,
    `FIRST TO ${C.WIN_SCORE} · WIN BY ${C.WIN_LEAD}`,
    C.FIELD_CX,
    53,
    10,
    DIM,
  );
  text(ctx, "W / S", 56, 660, 11, MINT);
  text(ctx, s.mode === "solo" ? "AI" : "↑ / ↓", 1224, 660, 11, CORAL);
  text(ctx, "P / ESC  PAUSE", C.FIELD_CX, 666, 11, DIM);
}
function menu(s: StateView, ctx: CanvasRenderingContext2D): void {
  menuItems(s).forEach((item, i) => {
    const r = menuItemRect(s, i);
    if (!r) return;
    const selected = s.menuIndex === i;
    bar(ctx, r.x, r.y, r.w, r.h, selected ? MINT : "#18252e", 5);
    text(
      ctx,
      item,
      r.x + 25,
      r.y + r.h / 2,
      16,
      selected ? BACKGROUND : INK,
      "left",
      700,
    );
    text(
      ctx,
      selected ? "↗" : "→",
      r.x + r.w - 28,
      r.y + r.h / 2,
      23,
      selected ? BACKGROUND : DIM,
    );
    if (s.screen === "title")
      text(
        ctx,
        `0${i + 1}`,
        r.x - 25,
        r.y + r.h / 2,
        11,
        selected ? MINT : DIM,
      );
  });
}
export function render(s: StateView, { ctx }: RenderApi): void {
  ctx.save();
  court(s, ctx);
  const live = s.screen === "playing" || s.screen === "countdown";
  if (live || s.screen === "paused" || s.screen === "matchover") hud(s, ctx);
  if (live) {
    if (s.screen === "countdown") {
      text(ctx, "READY TO RETURN", C.FIELD_CX, C.FIELD_CY - 76, 13, MINT);
      text(
        ctx,
        (s.ball?.holdTimer ?? 0).toFixed(1),
        C.FIELD_CX,
        C.FIELD_CY + 78,
        36,
        INK,
        "center",
        700,
      );
    }
  } else {
    ctx.fillStyle =
      s.screen === "title" || s.screen === "howto" ? "#0b131bec" : "#0b131bdc";
    ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
    text(ctx, "C / 01", 45, 48, 15, MINT, "left", 700);
    text(ctx, "THE PADDLE DUEL", C.FIELD_W - 45, 48, 11, DIM, "right");
    if (s.screen === "title") {
      text(ctx, "ANGLES. INSTINCT. A LITTLE SPIN.", C.FIELD_CX, 166, 12, AMBER);
      text(ctx, C.TITLE_TEXT, C.FIELD_CX, 249, 112, INK, "center", 900);
      text(ctx, "Bend the rally. Find your opening.", C.FIELD_CX, 319, 17, DIM);
      // Original emblem: a bank-shot route around two miniature obstacles.
      line(ctx, 177, 290, 227, 340, MINT, 2);
      line(ctx, 227, 340, 185, 402, MINT, 2);
      bar(ctx, 220, 317, 8, 46, AMBER, 3);
      bar(ctx, 1052, 360, 8, 46, AMBER, 3);
      line(ctx, 1096, 310, 1057, 382, CORAL, 2);
      line(ctx, 1057, 382, 1100, 436, CORAL, 2);
      text(ctx, "01 / SOLO", 182, 469, 10, MINT);
      text(ctx, "02 / TOGETHER", 1092, 469, 10, CORAL);
    } else if (s.screen === "howto") {
      text(ctx, "MAKE EVERY RETURN COUNT", C.FIELD_CX, 142, 12, AMBER);
      text(ctx, "HOW TO PLAY", C.FIELD_CX, 198, 52, INK, "center", 800);
      const columns = [
        {
          x: 262,
          n: "01",
          title: "MOVE",
          body: [
            "Solo: W / S or ↑ / ↓",
            "Versus: W / S on the left,",
            "↑ / ↓ on the right.",
          ],
        },
        {
          x: 640,
          n: "02",
          title: "BEND",
          body: [
            "Move your paddle at contact",
            "to put spin on the ball.",
            "Your return curves in flight.",
          ],
        },
        {
          x: 1018,
          n: "03",
          title: "BANK",
          body: [
            "Amber obstacles sway and turn.",
            "Use their angles to find a gap.",
            `First to ${C.WIN_SCORE}, with a ${C.WIN_LEAD}-point lead.`,
          ],
        },
      ];
      for (const col of columns) {
        text(ctx, col.n, col.x, 292, 16, MINT);
        text(ctx, col.title, col.x, 336, 25, INK, "center", 700);
        col.body.forEach((v, i) => text(ctx, v, col.x, 390 + i * 28, 16, DIM));
      }
      text(
        ctx,
        "P / ESC  Pause     ·     M  Sound     ·     Touch sliders move the paddles",
        C.FIELD_CX,
        507,
        13,
        DIM,
      );
    } else if (s.screen === "paused") {
      text(ctx, "TAKE A BREATH", C.FIELD_CX, 215, 12, AMBER);
      text(ctx, "PAUSED", C.FIELD_CX, 285, 70, INK, "center", 800);
    } else {
      text(ctx, "THE FINAL RETURN", C.FIELD_CX, 173, 12, AMBER);
      text(
        ctx,
        s.winner === "left"
          ? "PLAYER 01 WINS"
          : s.mode === "solo"
            ? "HOUSE AI WINS"
            : "PLAYER 02 WINS",
        C.FIELD_CX,
        242,
        52,
        s.winner === "left" ? MINT : CORAL,
        "center",
        800,
      );
      text(
        ctx,
        `${s.score.p1}  :  ${s.score.p2}`,
        C.FIELD_CX,
        314,
        44,
        INK,
        "center",
        700,
      );
    }
    menu(s, ctx);
    text(
      ctx,
      "↑ ↓ / W S  SELECT     ·     ENTER  PLAY",
      C.FIELD_CX,
      652,
      11,
      DIM,
    );
    text(ctx, "SPIN CHANGES EVERYTHING", 45, 683, 10, DIM, "left");
  }
  text(
    ctx,
    s.muted ? "M  SOUND OFF" : "M  SOUND ON",
    C.FIELD_W - 45,
    683,
    10,
    s.muted ? AMBER : DIM,
    "right",
  );
  ctx.restore();
}
