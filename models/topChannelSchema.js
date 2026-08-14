const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  guildId: String,
  channelId: String,
  messageId: String
});

module.exports = mongoose.model("topchannel", schema);