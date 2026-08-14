const http = require('http');
const crypto = require('crypto');
const UserCoin = require("./ncoinSchema"); 

function setupTopggWebhook(client) {
    const WEBHOOK_PORT = process.env.WEBHOOK_PORT || 3001;
    const TOPGG_WEBHOOK_SECRET = process.env.TOPGG_WEBHOOK_SECRET;

    if (!TOPGG_WEBHOOK_SECRET) {
        console.warn("[Top.gg Webhook] ⚠️ Cảnh báo: Thiếu TOPGG_WEBHOOK_SECRET trong .env, webhook sẽ không hoạt động!");
        return;
    }

    const webhookServer = http.createServer((req, res) => {
        if (req.method === "POST" && req.url === "/dblwebhook") {
            const signatureHeader = req.headers["x-topgg-signature"];
            if (!signatureHeader) {
                res.writeHead(401, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Unauthorized" }));
            }

            let chunks = [];
            req.on("data", chunk => { chunks.push(chunk); });
            
            req.on("end", async () => {
                try {
                    const rawBody = Buffer.concat(chunks).toString("utf8");
                    const parts = signatureHeader.split(",");
                    const timestampPart = parts.find(p => p.trim().startsWith("t="));
                    const v1Part = parts.find(p => p.trim().startsWith("v1="));

                    if (!timestampPart || !v1Part) throw new Error("Signature payload invalid");

                    const timestamp = timestampPart.split("=")[1];
                    const receivedSig = v1Part.split("=")[1];

                    const expectedSig = crypto
                        .createHmac("sha256", TOPGG_WEBHOOK_SECRET)
                        .update(`${timestamp}.${rawBody}`)
                        .digest("hex");

                    if (!crypto.timingSafeEqual(Buffer.from(receivedSig, "utf-8"), Buffer.from(expectedSig, "utf-8"))) {
                        res.writeHead(403, { "Content-Type": "application/json" });
                        return res.end(JSON.stringify({ error: "Forbidden" }));
                    }

                    const voteData = JSON.parse(rawBody);
                    const userId = voteData.user;
                    const rewardAmount = voteData.isWeekend ? 2000000 : 1000000;

                    await UserCoin.findOneAndUpdate(
                        { userId: userId },
                        { $inc: { coins: rewardAmount } },
                        { upsert: true, new: true }
                    ).lean();

                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: true }));

                    setImmediate(async () => {
                        try {
                            // Gửi thông báo về kênh công khai nếu có cấu hình VOTE_CHANNEL_ID
                            const channelId = process.env.VOTE_CHANNEL_ID;
                            if (channelId) {
                                const channel = await client.channels.fetch(channelId).catch(() => null);
                                if (channel) {
                                    const discordUser = await client.users.fetch(userId).catch(() => null);
                                    const userName = discordUser ? discordUser.tag : `<@${userId}>`;
                                    await channel.send(`🎉 **Cảm ơn ${userName} đã vote cho bot trên Top.gg!** Bạn đã nhận được **${rewardAmount.toLocaleString()} coins**. ⭐`).catch(() => {});
                                }
                            }

                            // Gửi tin nhắn trực tiếp (DM) cho người dùng
                            const discordUser = await client.users.fetch(userId).catch(() => null);
                            if (discordUser) {
                                await discordUser.send(`<:chucmung:1503444084625244270> **Thank you for voting Meow Hub on Top.gg!**\nYou have been rewarded with **${rewardAmount.toLocaleString()} coins**.`);
                            }
                        } catch (err) {
                            console.error("[Top.gg Webhook] Lỗi khi gửi thông báo Discord:", err);
                        }
                    });

                } catch (err) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Bad Request" }));
                }
            });
        } else {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not Found");
        }
    });

    webhookServer.listen(WEBHOOK_PORT, () => {
        console.log(`🌐 [Webhook Engine] Secure bridge active on port ${WEBHOOK_PORT}`);
    });
}

module.exports = setupTopggWebhook;
