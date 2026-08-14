const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const UserCoin = require("../models/ncoinSchema");
const path = require("path");

try {
    GlobalFonts.registerFromPath(path.join(process.cwd(), "config", "Starborn.ttf"), "Starborn");
} catch (e) {
    console.log("[CANVAS FONT] Không tìm thấy file Starborn.ttf tại thư mục config.");
}

// ─── Layout Constants (MỞ RỘNG KÍCH THƯỚC) ───────────────────────────────────
const WIDTH   = 1280; // Mở rộng chiều rộng giúp bố cục thở hơn
const ROW_H   = 78;   // 🚀 Nâng từ 68 lên 78px giúp Deco quạt cánh rộng rãi
const PAD     = 32;
const TOP_LIMIT = 10;

// ─── Color Palette ──────────────────────────────────────────────────────────────
const C = {
  bg:          "#0a0a0a",
  cardBg:      "rgba(20, 10, 5, 0.80)",
  cardBorder:  "rgba(249, 115, 22, 0.35)",
  neonOrange:  "#f5a54f",
  neonOrange2: "#f97316",
  neonOrange3: "#ea580c",
  textPrimary: "#f1f5f9",
  textMuted:   "#94a3b8",
  textDim:     "#64748b",
  barBg:       "#1a0f0a",
  barFill:     "#f5a54f",
};

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
function drawDecorations(ctx, cardTop, cardH) {
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle   = C.neonOrange;
  const sx = WIDTH - 180, sy = cardTop + 40;
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

  ctx.save();
  ctx.globalAlpha  = 0.08;
  ctx.strokeStyle = C.neonOrange;
  ctx.lineWidth   = 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 - Math.PI / 6;
    const hx = 140, hy = cardTop + cardH - 50;
    const hr = 50;
    const method = i === 0 ? "moveTo" : "lineTo";
    ctx[method](hx + Math.cos(angle) * hr, hy + Math.sin(angle) * hr);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  const orbG = ctx.createRadialGradient(WIDTH - 30, cardTop + cardH + 10, 10, WIDTH - 30, cardTop + cardH + 10, 130);
  orbG.addColorStop(0, "rgba(245, 165, 79, 0.2)");
  orbG.addColorStop(1, "rgba(245, 165, 79, 0)");
  ctx.fillStyle = orbG;
  ctx.beginPath();
  ctx.arc(WIDTH - 30, cardTop + cardH + 10, 130, 0, Math.PI * 2);
  ctx.fill();
}

function drawRankBadge(ctx, rank, y) {
  const bx = PAD + 45;
  const by = y;
  const br = 22;

  const glowColors = [
    "rgba(255, 215, 0, 0.5)",
    "rgba(192, 192, 192, 0.4)",
    "rgba(205, 127, 50, 0.4)",
    "rgba(100, 100, 100, 0.3)",
  ];
  const glowColor = glowColors[rank - 1] || "rgba(100,100,100,0.3)";
  const glow = ctx.createRadialGradient(bx, by, br, bx, by, br + 16);
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  circle(ctx, bx, by, br + 16);
  ctx.fill();

  const bg = ctx.createLinearGradient(bx - br, by - br, bx + br, by + br);
  bg.addColorStop(0, "#1a0f0a");
  bg.addColorStop(1, "#0a0a0a");
  ctx.fillStyle = bg;
  circle(ctx, bx, by, br);
  ctx.fill();

  const ringColors = ["#FFD700", "#C0C0C0", "#CD7F32", "#666666"];
  const border = ctx.createLinearGradient(bx - br, by - br, bx + br, by + br);
  border.addColorStop(0, ringColors[rank - 1] || "#666666");
  border.addColorStop(1, ringColors[rank - 1] ? "#555555" : "#444444");
  ctx.strokeStyle = border;
  ctx.lineWidth   = 2.5;
  circle(ctx, bx, by, br);
  ctx.stroke();

  ctx.fillStyle = C.textPrimary;
  ctx.font      = "16px Starborn";
  ctx.textAlign = "center";
  const label = rank <= 3 ? `#${rank}` : String(rank);
  ctx.fillText(label, bx, by + 5);
}

// 🚀 HÀM VẼ AVATAR VÀ DECO MỞ RỘNG TOÀN DIỆN
async function drawAvatar(ctx, user, y) {
  const size = 48; // Nâng từ 44px lên 48px cho to rõ
  const cx   = PAD + 115;
  const cy   = y;
  const r    = size / 2;

  // Outer glow
  const glow = ctx.createRadialGradient(cx, cy, r, cx, cy, r + 14);
  glow.addColorStop(0,   "rgba(245, 165, 79, 0.4)");
  glow.addColorStop(1,   "rgba(245, 165, 79, 0)");
  ctx.fillStyle = glow;
  circle(ctx, cx, cy, r + 14);
  ctx.fill();

  // Draw Avatar
  ctx.save();
  circle(ctx, cx, cy, r);
  ctx.clip();
  try {
    const url = user.displayAvatarURL({ extension: "png", size: 256, forceStatic: true });
    const img = await loadImage(url);
    ctx.drawImage(img, cx - r, cy - r, size, size);
  } catch (_) {
    ctx.fillStyle = "#1a0f0a";
    ctx.fill();
  }
  ctx.restore();

  // Ring border
  const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, C.neonOrange);
  ring.addColorStop(0.5, C.neonOrange2);
  ring.addColorStop(1, C.neonOrange3);
  ctx.strokeStyle = ring;
  ctx.lineWidth   = 2.5;
  circle(ctx, cx, cy, r + 1);
  ctx.stroke();

  // ✨ TIẾN TRÌNH VẼ DECORATION DISCORD TỈ LỆ 1.22 TẠO KHÔNG GIAN BUNG CÁNH
  if (user && typeof user.avatarDecorationURL === "function") {
    const decoUrl = user.avatarDecorationURL({ extension: "png", size: 256 });
    if (decoUrl) {
      try {
        const decoImg = await loadImage(decoUrl);
        const decoSize = size * 1.22; // Tỷ lệ vàng giúp cánh và hào quang không bị đè
        ctx.drawImage(decoImg, cx - decoSize / 2, cy - decoSize / 2, decoSize, decoSize);
      } catch (_) {}
    }
  }
}
function drawCoinBar(ctx, x, y, w, progress) {
  const bh = 6;
  const barY = y;

  rrect(ctx, x, barY, w, bh, bh / 2);
  ctx.fillStyle = C.barBg;
  ctx.fill();

  if (progress > 0) {
    const fg = ctx.createLinearGradient(x, barY, x + w, barY);
    fg.addColorStop(0,   C.neonOrange);
    fg.addColorStop(0.5, C.neonOrange2);
    fg.addColorStop(1,   C.neonOrange3);
    rrect(ctx, x, barY, Math.max(bh, w * progress), bh, bh / 2);
    ctx.fillStyle = fg;
    ctx.fill();
  }
}
async function generateTopImage(guild) {
  const top = await UserCoin.find({})
    .sort({ coins: -1 })
    .limit(TOP_LIMIT)
    .lean();

  if (!top.length) return null;

  const HEADER_H = 130;
  const FOOTER_H = 55;
  const HEIGHT   = HEADER_H + top.length * ROW_H + FOOTER_H;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx    = canvas.getContext("2d");
  const cardTop = PAD;
  const cardH   = HEIGHT - PAD * 2;

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bgGrad.addColorStop(0, "#0a0a0a");
  bgGrad.addColorStop(0.4, "#140a05");
  bgGrad.addColorStop(1,   "#1a0f0a");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawDecorations(ctx, cardTop, cardH);

  // Main Card
  rrect(ctx, PAD, cardTop, WIDTH - PAD * 2, cardH, 28);
  const cardGrad = ctx.createLinearGradient(PAD, cardTop, WIDTH - PAD, cardTop + cardH);
  cardGrad.addColorStop(0, "rgba(20, 10, 5, 0.88)");
  cardGrad.addColorStop(1, "rgba(10, 5, 2, 0.95)");
  ctx.fillStyle = cardGrad;
  ctx.fill();

  // Border
  rrect(ctx, PAD, cardTop, WIDTH - PAD * 2, cardH, 28);
  ctx.strokeStyle = C.cardBorder;
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Header
  const hx = PAD + 65;
  const hy = cardTop + 65;

  const iconX = PAD + 40;
  const iconY = hy;
  const iconR = 22;

  const iconGlow = ctx.createRadialGradient(iconX, iconY, iconR, iconX, iconY, iconR + 12);
  iconGlow.addColorStop(0, "rgba(245,165,79,0.5)");
  iconGlow.addColorStop(1, "rgba(245,165,79,0)");
  ctx.fillStyle = iconGlow;
  circle(ctx, iconX, iconY, iconR + 12);
  ctx.fill();

  const iconBg = ctx.createLinearGradient(iconX - iconR, iconY - iconR, iconX + iconR, iconY + iconR);
  iconBg.addColorStop(0, "#f5a54f");
  iconBg.addColorStop(1, "#ea580c");
  ctx.fillStyle = iconBg;
  circle(ctx, iconX, iconY, iconR);
  ctx.fill();

  ctx.fillStyle = "#0a0a0a";
  ctx.font      = "18px Starborn";
  ctx.textAlign = "center";
  ctx.fillText("N", iconX, iconY + 6);

  ctx.textAlign = "left";
  ctx.fillStyle = C.neonOrange;
  ctx.font      = "38px Starborn";
  ctx.fillText("TOP NCOIN LEADERBOARD", hx, hy - 4);

  ctx.fillStyle = C.textDim;
  ctx.font      = "15px Starborn";
  ctx.fillText(`Showing top ${top.length} richest players  ·  Global rankings`, hx, hy + 26);

  // Divider
  const divY = cardTop + HEADER_H - 10;
  ctx.strokeStyle = "rgba(245,165,79,0.3)";
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD + 30, divY);
  ctx.lineTo(WIDTH - PAD - 30, divY);
  ctx.stroke();

  // Render Rows
  const maxCoins = top[0].coins;

  for (let i = 0; i < top.length; i++) {
    const entry = top[i];
    const rowY  = cardTop + HEADER_H + i * ROW_H;

    const rowBg = i % 2 === 0 ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.05)";
    rrect(ctx, PAD + 8, rowY + 3, WIDTH - PAD * 2 - 16, ROW_H - 6, 12);
    ctx.fillStyle = rowBg;
    ctx.fill();

    const avatarY = rowY + ROW_H / 2;

    drawRankBadge(ctx, i + 1, avatarY);

    let user = null;
    const member = guild.members.cache.get(entry.userId) || await guild.members.fetch(entry.userId).catch(() => null);
    if (member) {
      user = member.user;
    } else {
      try { user = await guild.client.users.fetch(entry.userId).catch(() => null); } catch (_) {}
    }

    await drawAvatar(ctx, user, avatarY);

    // Tên người dùng thoáng rộng
    const name = user ? (user.username || "Unknown") : "Unknown";
    ctx.textAlign = "left";
    ctx.fillStyle = C.textPrimary;
    ctx.font      = "21px Starborn";
    const nameX = PAD + 160; 
    ctx.fillText(name, nameX, avatarY + 7);

    // Render Coins (Phía bên phải)
    const coinX = WIDTH - PAD - 35;
    ctx.textAlign = "right";
    ctx.fillStyle = "#FFE066";
    ctx.font      = "23px Starborn";
    ctx.fillText(`${entry.coins.toLocaleString("en-US")}`, coinX, avatarY - 2);

    ctx.fillStyle = C.textDim;
    ctx.font      = "12px Starborn";
    ctx.fillText("Ncoin", coinX, avatarY + 16);

    // Thanh Line tiến trình
    const barX = WIDTH - PAD - 245;
    const barW = 210;
    const progress = maxCoins > 0 ? entry.coins / maxCoins : 0;
    drawCoinBar(ctx, barX, avatarY + 24, barW, progress);
  }

  // Footer
  const footerY = cardTop + HEADER_H + top.length * ROW_H + FOOTER_H / 2 + 6;
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  rrect(ctx, PAD + 8, cardTop + HEADER_H + top.length * ROW_H + 2, WIDTH - PAD * 2 - 16, FOOTER_H - 2, 10);
  ctx.fill();

  ctx.fillStyle = "#555555";
  ctx.font      = "13px Starborn";
  ctx.textAlign = "center";
  ctx.fillText("Ncoin Leaderboard  ·  Powered by NNK Bot", WIDTH / 2, footerY);

  return canvas.toBuffer("image/png");
}

module.exports = { generateTopImage };
