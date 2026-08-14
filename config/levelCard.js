const { createCanvas, loadImage } = require("@napi-rs/canvas");

// ─── Layout Constants ───────────────────────────────────────────────────────────
const WIDTH   = 1200;
const HEIGHT  = 360;
const CARD_R  = 28;
const PAD     = 32;

// ─── Color Palette ────────────────────────────────────────────────────────────
// Orange + Black theme — matching bot branding
const C = {
  bg:          "#0a0a0a",
  cardBg:      "rgba(20, 10, 5, 0.80)",
  cardBorder:  "rgba(249, 115, 22, 0.35)",

  neonOrange:  "#f5a54f",
  neonOrange2: "#f97316",
  neonOrange3: "#ea580c",

  textPrimary: "#f1f5f9",
  textMuted:  "#94a3b8",
  textDim:    "#64748b",

  barBg:       "#1a0f0a",
  barFill:     "#f5a54f",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
}

function fillText(ctx, text, x, y, font, color, align = "left") {
  ctx.font      = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

// ─── Avatar ────────────────────────────────────────────────────────────────────

async function drawAvatar(ctx, user) {
  const size = 200;
  const cx   = 100 + PAD;
  const cy   = HEIGHT / 2;
  const r    = size / 2;

  // outer glow ring
  const glow = ctx.createRadialGradient(cx, cy, r, cx, cy, r + 28);
  glow.addColorStop(0,   "rgba(245, 165, 79, 0.5)");
  glow.addColorStop(0.5, "rgba(245, 165, 79, 0.15)");
  glow.addColorStop(1,   "rgba(245, 165, 79, 0)");
  ctx.fillStyle = glow;
  circle(ctx, cx, cy, r + 28);
  ctx.fill();

  // avatar clip
  ctx.save();
  circle(ctx, cx, cy, r);
  ctx.clip();
  try {
    const url   = user.displayAvatarURL({ extension: "png", size: 512, forceStatic: true });
    const img   = await loadImage(url);
    ctx.drawImage(img, cx - r, cy - r, size, size);
  } catch (_) {
    ctx.fillStyle = "#1a0f0a";
    ctx.fill();
  }
  ctx.restore();

  // ring
  const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, C.neonOrange);
  ring.addColorStop(0.5, C.neonOrange2);
  ring.addColorStop(1, C.neonOrange3);
  ctx.strokeStyle = ring;
  ctx.lineWidth   = 6;
  circle(ctx, cx, cy, r + 3);
  ctx.stroke();
}

// ─── Level Badge ───────────────────────────────────────────────────────────────

function drawLevelBadge(ctx, level) {
  const bx = WIDTH - PAD - 80;
  const by = PAD + 48;
  const br = 52;

  // glow
  const glow = ctx.createRadialGradient(bx, by, br, bx, by, br + 24);
  glow.addColorStop(0, "rgba(245, 165, 79, 0.45)");
  glow.addColorStop(1, "rgba(245, 165, 79, 0)");
  ctx.fillStyle = glow;
  circle(ctx, bx, by, br + 24);
  ctx.fill();

  // bg
  const bg = ctx.createLinearGradient(bx - br, by - br, bx + br, by + br);
  bg.addColorStop(0, "#1a0f0a");
  bg.addColorStop(1, "#0a0a0a");
  ctx.fillStyle = bg;
  circle(ctx, bx, by, br);
  ctx.fill();

  // border
  const border = ctx.createLinearGradient(bx - br, by - br, bx + br, by + br);
  border.addColorStop(0, C.neonOrange);
  border.addColorStop(1, C.neonOrange3);
  ctx.strokeStyle = border;
  ctx.lineWidth   = 4;
  circle(ctx, bx, by, br);
  ctx.stroke();

  // level number
  fillText(ctx, String(level), bx, by + 14, "bold 36px Arial", C.textPrimary, "center");
  fillText(ctx, "LVL", bx, by - 22, "700 16px Arial", C.neonOrange, "center");
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function drawProgressBar(ctx, progress, label) {
  const bx   = WIDTH - PAD - 210;
  const by   = PAD + 130;
  const bw   = 210;
  const bh   = 20;

  // bg
  rrect(ctx, bx, by, bw, bh, bh / 2);
  ctx.fillStyle = C.barBg;
  ctx.fill();

  // fill with gradient + glow
  const fillW = Math.max(bh, bw * progress);
  if (fillW > bh) {
    const fg = ctx.createLinearGradient(bx, by, bx + bw, by);
    fg.addColorStop(0,   C.neonOrange);
    fg.addColorStop(0.5, C.neonOrange2);
    fg.addColorStop(1,   C.neonOrange3);
    rrect(ctx, bx, by, fillW, bh, bh / 2);
    ctx.fillStyle = fg;
    ctx.fill();

    // inner shine
    const shine = ctx.createLinearGradient(bx, by, bx, by + bh);
    shine.addColorStop(0,   "rgba(255,255,255,0.18)");
    shine.addColorStop(0.5, "rgba(255,255,255,0.05)");
    shine.addColorStop(1,   "rgba(255,255,255,0)");
    rrect(ctx, bx, by, fillW, bh / 2, bh / 2);
    ctx.fillStyle = shine;
    ctx.fill();
  }

  fillText(ctx, label, bx + bw / 2, by - 8, "600 13px Arial", C.textDim, "center");
}

// ─── Stat Block ────────────────────────────────────────────────────────────────

function drawStatBlock(ctx, x, y, label, value, accent) {
  rrect(ctx, x, y, 145, 64, 16);
  ctx.fillStyle = "rgba(26, 15, 10, 0.7)";
  ctx.fill();

  fillText(ctx, label, x + 72, y + 24, "600 13px Arial", C.textDim, "center");
  fillText(ctx, value,  x + 72, y + 50, "bold 22px Arial", accent || C.textPrimary, "center");
}

// ─── Decorative Elements ───────────────────────────────────────────────────────

function drawDecorations(ctx) {
  // top-right sparkle cluster
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle   = C.neonOrange;
  // star shape via small circles
  const sx = WIDTH - 200, sy = 60;
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const dist  = 18;
    circle(ctx, sx + Math.cos(angle) * dist, sy + Math.sin(angle) * dist, 3);
    ctx.fill();
  }
  ctx.fillStyle = "#fff";
  circle(ctx, sx, sy, 4);
  ctx.fill();
  ctx.restore();

  // bottom-left hexagon hint
  ctx.save();
  ctx.globalAlpha  = 0.08;
  ctx.strokeStyle  = C.neonOrange;
  ctx.lineWidth    = 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 - Math.PI / 6;
    const hx = 160, hy = HEIGHT - 60;
    const hr = 50;
    const method = i === 0 ? "moveTo" : "lineTo";
    ctx[method](hx + Math.cos(angle) * hr, hy + Math.sin(angle) * hr);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // subtle orb bottom-right
  const orbG = ctx.createRadialGradient(WIDTH - 40, HEIGHT + 20, 10, WIDTH - 40, HEIGHT + 20, 120);
  orbG.addColorStop(0, "rgba(245, 165, 79, 0.2)");
  orbG.addColorStop(1, "rgba(245, 165, 79, 0)");
  ctx.fillStyle = orbG;
  ctx.beginPath();
  ctx.arc(WIDTH - 40, HEIGHT + 20, 120, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Badge Icon ────────────────────────────────────────────────────────────────

function drawBadge(ctx, level) {
  if (level < 10)  return; // no badge below level 10
  const tier =
    level >= 200 ? { label: "DIAMOND", color: "#e0f2fe", glow: "rgba(200,230,255,0.4)" } :
    level >= 100 ? { label: "PLATINUM", color: "#d1fae5", glow: "rgba(110,231,183,0.4)" } :
    level >= 50  ? { label: "GOLD",     color: "#fef08a", glow: "rgba(253,224,71,0.4)"  } :
    level >= 25  ? { label: "SILVER",   color: "#e5e7eb", glow: "rgba(229,231,235,0.4)" } :
                   { label: "BRONZE",   color: "#fed7aa", glow: "rgba(253,186,116,0.4)" };

  const bx = WIDTH - PAD - 210, by = PAD + 180;

  // glow
  const glow = ctx.createRadialGradient(bx + 72, by + 12, 4, bx + 72, by + 12, 40);
  glow.addColorStop(0, tier.glow);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(bx, by - 20, 145, 70);

  rrect(ctx, bx, by, 145, 44, 12);
  const badgeBg = ctx.createLinearGradient(bx, by, bx, by + 44);
  badgeBg.addColorStop(0, tier.color + "28");
  badgeBg.addColorStop(1, tier.color + "10");
  ctx.fillStyle = badgeBg;
  ctx.fill();
  ctx.strokeStyle = tier.color + "66";
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  fillText(ctx, tier.label, bx + 72, by + 28, "bold 15px Arial", tier.color, "center");
}

// ─── Rank Bar (thin) ──────────────────────────────────────────────────────────

function drawRankBar(ctx, progress, rank) {
  const rx   = PAD + 230;
  const ry   = 290;
  const rw   = 700;
  const rh   = 10;

  rrect(ctx, rx, ry, rw, rh, rh / 2);
  ctx.fillStyle = "#1a0f0a";
  ctx.fill();

  const fg = ctx.createLinearGradient(rx, ry, rx + rw, ry);
  fg.addColorStop(0,   C.neonOrange);
  fg.addColorStop(0.5, C.neonOrange2);
  fg.addColorStop(1,   C.neonOrange3);
  rrect(ctx, rx, ry, Math.max(rh, rw * progress), rh, rh / 2);
  ctx.fillStyle = fg;
  ctx.fill();

  // rank pip
  const pipX = rx + rw * progress;
  ctx.save();
  ctx.shadowColor = "#fff";
  ctx.shadowBlur  = 8;
  circle(ctx, pipX, ry + rh / 2, 5);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.restore();
}

// ─── Main Build ───────────────────────────────────────────────────────────────

async function buildLevelCard(user, level, xp = 0, xpNeed = 100, options = {}) {
  const reward      = typeof options === "number" ? options : (options.reward      || 0);
  const totalXp     = typeof options === "object" ? (options.totalXp     || 0) : 0;
  const messageCount= typeof options === "object" ? (options.messageCount|| 0) : 0;
  const rank        = typeof options === "object" ? (options.rank         || null) : null;
  const joinedAt    = typeof options === "object" ? (options.joinedAt     || null) : null;
  const memberCount = typeof options === "object" ? (options.memberCount  || 0)  : 0;

  const progress = xpNeed > 0 ? Math.max(0, Math.min(1, xp / xpNeed)) : 0;
  const rankProgress = (rank && memberCount > 0) ? rank / memberCount : null;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx    = canvas.getContext("2d");

  // ── Background ──
  const bgGrad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bgGrad.addColorStop(0, "#0a0a0a");
  bgGrad.addColorStop(0.4, "#140a05");
  bgGrad.addColorStop(1,   "#1a0f0a");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawDecorations(ctx);

  // ── Card ──
  rrect(ctx, PAD, PAD, WIDTH - PAD * 2, HEIGHT - PAD * 2, CARD_R);

  const cardGrad = ctx.createLinearGradient(PAD, PAD, WIDTH - PAD, HEIGHT - PAD);
  cardGrad.addColorStop(0, "rgba(20, 10, 5, 0.85)");
  cardGrad.addColorStop(1, "rgba(10, 5, 2, 0.92)");
  ctx.fillStyle = cardGrad;
  ctx.fill();

  // card border
  const borderGrad = ctx.createLinearGradient(PAD, PAD, WIDTH - PAD, HEIGHT - PAD);
  borderGrad.addColorStop(0,   C.neonOrange + "55");
  borderGrad.addColorStop(0.5, C.neonOrange2 + "22");
  borderGrad.addColorStop(1,   C.neonOrange3 + "55");
  rrect(ctx, PAD, PAD, WIDTH - PAD * 2, HEIGHT - PAD * 2, CARD_R);
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth   = 2;
  ctx.stroke();

  // ── Avatar ──
  await drawAvatar(ctx, user);

  // ── Level Badge ──
  drawLevelBadge(ctx, level);

  // ── Name & Tag ──
  const name = user.globalName || user.username;
  const tag  = user.discriminator && user.discriminator !== "0"
    ? `#${user.discriminator}` : "";

  const tx = PAD + 230;
  fillText(ctx, "LEVEL CARD", tx, PAD + 34, "700 15px Arial", C.neonOrange);
  fillText(ctx, name, tx, PAD + 72, "bold 44px Arial", C.textPrimary);

  if (tag) fillText(ctx, tag, tx, PAD + 102, "26px Arial", C.textMuted);

  // ── XP Text ──
  const xpLabel = `${Number(xp || 0).toLocaleString("en-US")} / ${Number(xpNeed || 0).toLocaleString("en-US")} XP`;
  fillText(ctx, xpLabel, tx + 280, PAD + 72, "26px Arial", C.textMuted);

  // ── Rank Bar (full width line) ──
  if (rankProgress !== null) {
    const rankLabel = `RANK  #${rank}  ·  TOP ${Math.round((1 - rankProgress) * 100)}%`;
    fillText(ctx, rankLabel, tx, PAD + 108, "600 13px Arial", C.textDim);
    drawRankBar(ctx, 1 - rankProgress, rank);
  }

  // ── Stats row ──
  const statsY = PAD + 155;
  const statAccents = [C.neonOrange, C.neonOrange2, C.neonOrange3, C.neonOrange];
  const stats = [
    { label: "LEVEL",       value: String(level)                      },
    { label: "TOTAL XP",    value: Number(totalXp || 0).toLocaleString("en-US") },
    { label: "MESSAGES",    value: Number(messageCount || 0).toLocaleString("en-US") },
    { label: "REWARD",       value: reward > 0 ? `+${Number(reward).toLocaleString("en-US")}` : "—" },
  ];

  stats.forEach((s, i) => {
    drawStatBlock(ctx, tx + i * 158, statsY, s.label, s.value, statAccents[i]);
  });

  // ── Badge ──
  drawBadge(ctx, level);

  // ── Progress Bar (bottom) ──
  drawProgressBar(ctx, progress, `${round2(progress * 100)}% to next level`);

  // ── Ncoin reward highlight ──
  if (reward > 0) {
    const rc = ctx.createRadialGradient(WIDTH - 180, HEIGHT - 80, 4, WIDTH - 180, HEIGHT - 80, 60);
    rc.addColorStop(0, "rgba(245, 165, 79, 0.25)");
    rc.addColorStop(1, "rgba(245, 165, 79, 0)");
    ctx.fillStyle = rc;
    ctx.fillRect(WIDTH - 240, HEIGHT - 140, 120, 80);
    fillText(ctx, `+${Number(reward).toLocaleString("en-US")}`, WIDTH - PAD - 72, HEIGHT - PAD - 4, "bold 26px Arial", C.neonOrange, "center");
    fillText(ctx, "Ncoin", WIDTH - PAD - 72, HEIGHT - PAD + 22, "600 13px Arial", C.textDim, "center");
  }

  return canvas.toBuffer("image/png");
}

module.exports = buildLevelCard;
