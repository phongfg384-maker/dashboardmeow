const { createCanvas, loadImage } = require("@napi-rs/canvas");

const WIDTH = 1000;
const HEIGHT = 360;

function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

async function buildDailyRewardCanvas(user, rewardAmount) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");

    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, "#0a0a0a");
    gradient.addColorStop(1, "#1a0f0a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    roundedRect(ctx, 30, 30, WIDTH - 60, HEIGHT - 60, 24);
    ctx.fillStyle = "#0f0805cc";
    ctx.fill();

    const avatarSize = 160;
    const avatarX = 70;
    const avatarY = HEIGHT / 2 - avatarSize / 2;

    try {
        const avatarUrl = user.displayAvatarURL({ extension: "png", size: 256, forceStatic: true });
        const avatar = await loadImage(avatarUrl);

        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();

        ctx.strokeStyle = "#f5a54f";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 4, 0, Math.PI * 2);
        ctx.stroke();
    } catch (_) {
        ctx.fillStyle = "#1a0f0a";
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    const name = user.globalName || user.username;

    ctx.fillStyle = "#0a0a0a";
    ctx.font = "bold 58px Arial";
    ctx.fillText("CONGRATS!", 280, 125);

    ctx.font = "bold 36px Arial";
    ctx.fillStyle = "#f5a54f";
    ctx.fillText(name, 280, 180);

    ctx.font = "30px Arial";
    ctx.fillStyle = "#64748b";
    ctx.fillText("you have received your daily reward", 280, 225);

    ctx.font = "bold 50px Arial";
    ctx.fillStyle = "#f5a54f";
    ctx.fillText(`+${rewardAmount.toLocaleString("en-US")} Ncoin`, 280, 295);

    return canvas.toBuffer("image/png");
}

module.exports = { buildDailyRewardCanvas };
