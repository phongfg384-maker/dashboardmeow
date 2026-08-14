const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");

// Đường dẫn lưu file cấu hình ticket tạm thời bằng JSON
const configPath = path.join(__dirname, "../ticket-config.json");

/**
 * Đọc cấu hình ticket từ file JSON
 */
function getTicketConfig() {
  let configData = { supportRoles: [], logChannelId: null };
  if (fs.existsSync(configPath)) {
    try {
      configData = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (e) {
      console.error("Lỗi đọc file ticket-config.json:", e);
    }
  }
  return configData;
}

/**
 * Xử lý tạo Log khi mở Ticket bằng Thread
 */
async function logTicketOpen(interaction, thread, type, categoryEmoji) {
  const config = getTicketConfig();
  if (!config.logChannelId) return;

  const logChannel = interaction.guild.channels.cache.get(config.logChannelId);
  if (!logChannel) return;

  const openLogEmbed = new EmbedBuilder()
    .setAuthor({ name: "Meow Hub", iconURL: interaction.client.user.displayAvatarURL() })
    .setTitle("Ticket Opened")
    .addFields(
      { name: "Ticket Name", value: `${thread}`, inline: false },
      { name: "Created By", value: `<@${interaction.member.id}>`, inline: false },
      { name: "Opened Date", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
      { name: "Ticket Type", value: `${categoryEmoji} ${type.charAt(0).toUpperCase() + type.slice(1)}`, inline: false }
    )
    .setColor("#FEA166");

  await logChannel.send({ embeds: [openLogEmbed] }).catch(() => null);
}

/**
 * Xử lý tạo Log khi đóng Ticket bằng Thread
 */
async function logTicketClose(interaction, threadName, creatorName) {
  const config = getTicketConfig();
  if (!config.logChannelId) return;

  const logChannel = interaction.guild.channels.cache.get(config.logChannelId);
  if (!logChannel) return;

  const closeLogEmbed = new EmbedBuilder()
    .setAuthor({ name: "Meow Hub", iconURL: interaction.client.user.displayAvatarURL() })
    .setTitle("Ticket Closed")
    .addFields(
      { name: "Ticket Name", value: `\`${threadName}\``, inline: false },
      { name: "Ticket Author", value: `\`${creatorName}\``, inline: false },
      { name: "Closed By", value: `${interaction.user}`, inline: false },
      { name: "Close Date", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
      { name: "Ticket Close Reason", value: `Được đóng thủ công bởi thành viên ban quản trị.`, inline: false }
    )
    .setColor("#FEA166");

  await logChannel.send({ embeds: [closeLogEmbed] }).catch(() => null);
}

module.exports = {
  getTicketConfig,
  logTicketOpen,
  logTicketClose
};
