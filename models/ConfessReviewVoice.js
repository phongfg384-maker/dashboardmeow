const mongoose = require('mongoose');

const confessReviewVoiceSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  confessChannel: String, // Public confession channel
  reviewChannel: String,  // Moderator review channel
  voiceChannel: String    // Join-to-create voice channel
});

module.exports = mongoose.model('ConfessReviewVoice', confessReviewVoiceSchema);
