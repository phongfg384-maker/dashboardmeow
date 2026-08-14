const { createCanvas } = require("@napi-rs/canvas");

const WIDTH = 1366;
const HEIGHT = 820;

function normalizeTaiXiu(value, total) {
  const text = String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();

  if (text.includes("TAI")) return "TAI";
  if (text.includes("XIU")) return "XIU";
  return total >= 11 ? "TAI" : "XIU";
}

function yFromValue(value, min, max, area) {
  const ratio = (value - min) / (max - min);
  return area.y + area.h - ratio * area.h;
}

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawGrid(ctx, area, xCount, yValues, yMin, yMax) {
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1.2;

  for (let i = 0; i < xCount; i++) {
    const x = area.x + (i * area.w) / Math.max(1, xCount - 1);
    ctx.beginPath();
    ctx.moveTo(x, area.y);
    ctx.lineTo(x, area.y + area.h);
    ctx.stroke();
  }

  for (const yv of yValues) {
    const y = yFromValue(yv, yMin, yMax, area);
    ctx.beginPath();
    ctx.moveTo(area.x, y);
    ctx.lineTo(area.x + area.w, y);
    ctx.stroke();
  }
}

function drawLine(ctx, points, color, width) {
  if (!points.length) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

function drawSoftShadow(ctx, color, blur) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

function resetShadow(ctx) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
}

function generateSoiCauImage(history, totalRounds) {
  if (!Array.isArray(history) || history.length === 0) return null;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  const n = history.length;
  const latest = history[n - 1];
  const latestTotal = Number(latest.total || 0);
  const latestType = normalizeTaiXiu(latest.resultTaiXiu, latestTotal);
  const latestTypeLabel = latestType === "TAI" ? "TÀI" : "XỈU";
  const latestDice = Array.isArray(latest.dice) ? latest.dice.join("-") : "?-?-?";

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, "#0f1020");
  bg.addColorStop(0.5, "#191a34");
  bg.addColorStop(1, "#261633");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Ambient blobs
  const blob1 = ctx.createRadialGradient(220, 90, 10, 220, 90, 260);
  blob1.addColorStop(0, "rgba(255, 200, 80, 0.38)");
  blob1.addColorStop(1, "rgba(255, 200, 80, 0)");
  ctx.fillStyle = blob1;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const blob2 = ctx.createRadialGradient(1180, 760, 20, 1180, 760, 280);
  blob2.addColorStop(0, "rgba(120, 220, 255, 0.30)");
  blob2.addColorStop(1, "rgba(120, 220, 255, 0)");
  ctx.fillStyle = blob2;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Main glass frame
  roundedRect(ctx, 18, 18, WIDTH - 36, HEIGHT - 36, 20);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Header
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffd66e";
  ctx.font = "bold 48px Arial";
  ctx.fillText("SOI CẦU", 56, 76);

  ctx.fillStyle = "rgba(234,236,255,0.88)";
  ctx.font = "bold 30px Arial";
  ctx.fillText("10 phiên gần nhất", 56, 114);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.90)";
  ctx.font = "bold 32px Arial";
  ctx.fillText(
    `#${Math.max(1, totalRounds)}  ${latestTypeLabel}  (${latestDice})`,
    WIDTH - 56,
    88
  );

  // Cards
  roundedRect(ctx, 44, 136, WIDTH - 88, 306, 16);
  ctx.fillStyle = "rgba(14, 18, 37, 0.68)";
  ctx.fill();
  roundedRect(ctx, 44, 452, WIDTH - 88, 344, 16);
  ctx.fillStyle = "rgba(14, 18, 37, 0.68)";
  ctx.fill();

  // Section titles
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px Arial";
  ctx.fillText("Tổng điểm mỗi phiên", 68, 178);
  ctx.fillText("Chi tiết 3 viên xúc xắc", 68, 492);

  // Top chart
  const topArea = { x: 96, y: 198, w: WIDTH - 192, h: 220 };
  const topY = [3, 6, 9, 12, 15, 18];
  drawGrid(ctx, topArea, n, topY, 3, 18);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(220,223,240,0.70)";
  ctx.font = "bold 26px Arial";
  for (const yv of topY) {
    ctx.fillText(String(yv), 82, yFromValue(yv, 3, 18, topArea) + 8);
  }

  const topPoints = history.map((h, i) => {
    const total = Math.max(3, Math.min(18, Number(h.total || 3)));
    return {
      x: topArea.x + (i * topArea.w) / Math.max(1, n - 1),
      y: yFromValue(total, 3, 18, topArea),
      total,
      type: normalizeTaiXiu(h.resultTaiXiu, total),
    };
  });

  const taiCount = topPoints.filter((p) => p.type === "TAI").length;
  const xiuCount = topPoints.length - taiCount;

  // TÀI/XỈU counter: keep it separate from title to avoid text overlap.
  const counterY = 174;
  const rightAnchor = WIDTH - 120;
  ctx.textAlign = "left";
  ctx.font = "bold 22px Arial";

  const xiuX = rightAnchor - 130;
  ctx.beginPath();
  ctx.arc(xiuX, counterY, 8, 0, Math.PI * 2);
  ctx.fillStyle = "#f7f7f7";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#2a2a2a";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`XỈU: ${xiuCount}`, xiuX + 14, counterY + 7);

  const taiX = rightAnchor - 280;
  ctx.beginPath();
  ctx.arc(taiX, counterY, 8, 0, Math.PI * 2);
  ctx.fillStyle = "#111111";
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`TÀI: ${taiCount}`, taiX + 14, counterY + 7);

  // Explicit rule text for readability.
  ctx.font = "bold 16px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.fillText("TÀI: chấm đen, số trắng | XỈU: chấm trắng, số đen", rightAnchor - 450, counterY + 30);

  drawSoftShadow(ctx, "rgba(255,214,110,0.36)", 18);
  drawLine(ctx, topPoints, "#f3f4ff", 4);
  resetShadow(ctx);

  ctx.textAlign = "center";
  for (const p of topPoints) {
    const isTai = p.type === "TAI";
    drawSoftShadow(ctx, isTai ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.45)", 16);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
    ctx.fillStyle = isTai ? "#111111" : "#f7f7f7";
    ctx.fill();
    if (!isTai) {
      // White nodes need border on bright backgrounds.
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#2a2a2a";
      ctx.stroke();
    }
    resetShadow(ctx);

    ctx.fillStyle = isTai ? "#ffffff" : "#101225";
    ctx.font = "bold 23px Arial";
    ctx.fillText(String(p.total), p.x, p.y + 9);
  }

  // Bottom legend
  const legends = [
    { label: "Xí Ngầu 1", color: "#4f7bff" },
    { label: "Xí Ngầu 2", color: "#35d4aa" },
    { label: "Xí Ngầu 3", color: "#b86bff" },
  ];
  const legendY = 536;
  let lx = 420;
  ctx.textAlign = "left";
  ctx.font = "bold 26px Arial";
  for (const lg of legends) {
    ctx.beginPath();
    ctx.arc(lx, legendY, 10, 0, Math.PI * 2);
    ctx.fillStyle = lg.color;
    ctx.fill();
    ctx.fillStyle = "rgba(238,240,255,0.92)";
    ctx.fillText(lg.label, lx + 18, legendY + 8);
    lx += 190;
  }

  // Bottom chart
  const botArea = { x: 96, y: 566, w: WIDTH - 192, h: 206 };
  const botY = [1, 2, 3, 4, 5, 6];
  drawGrid(ctx, botArea, n, botY, 1, 6);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(220,223,240,0.70)";
  ctx.font = "bold 26px Arial";
  for (const yv of botY) {
    ctx.fillText(String(yv), 82, yFromValue(yv, 1, 6, botArea) + 8);
  }

  const colors = ["#4f7bff", "#35d4aa", "#b86bff"];
  for (let di = 0; di < 3; di++) {
    const points = history.map((h, i) => {
      const raw = Array.isArray(h.dice) ? Number(h.dice[di]) : 1;
      const safe = Math.max(1, Math.min(6, Number.isFinite(raw) ? raw : 1));
      return {
        x: botArea.x + (i * botArea.w) / Math.max(1, n - 1),
        y: yFromValue(safe, 1, 6, botArea),
      };
    });

    drawSoftShadow(ctx, `${colors[di]}66`, 14);
    drawLine(ctx, points, colors[di], 3.6);
    resetShadow(ctx);

    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9.5, 0, Math.PI * 2);
      ctx.fillStyle = colors[di];
      ctx.fill();
    }
  }

  // Branded footer chip
  roundedRect(ctx, WIDTH - 410, HEIGHT - 62, 360, 40, 18);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = "#f2f3ff";
  ctx.font = "bold 24px Arial";
  ctx.fillText("Powered by Meow Hub", WIDTH - 230, HEIGHT - 34);

  return canvas.toBuffer("image/png");
}

module.exports = { generateSoiCauImage };
