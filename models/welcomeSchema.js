const mongoose = require("mongoose");

const welcomeSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },

  // Welcome (channel greeting)
  welcomeEnabled: { type: Boolean, default: false },
  welcomeChannelId: { type: String, default: null },
  welcomeMessage: {
    type: String,
    default: "👋 Chào mừng {user} đã đến với **{server}**! Hiện server đang có **{membercount}** thành viên."
  },

  // Welcome DM (greeting sent privately)
  dmEnabled: { type: Boolean, default: false },
  dmMessage: {
    type: String,
    default: "Chào {username}! Cảm ơn bạn đã tham gia **{server}**. Chúc bạn có khoảng thời gian vui vẻ tại đây!"
  },

  // Goodbye (channel message on leave)
  goodbyeEnabled: { type: Boolean, default: false },
  goodbyeChannelId: { type: String, default: null },
  goodbyeMessage: {
    type: String,
    default: "👋 **{username}** đã rời khỏi server. Server hiện còn **{membercount}** thành viên."
  }
}, { timestamps: true });

module.exports = mongoose.models.WelcomeConfig || mongoose.model("WelcomeConfig", welcomeSchema);
