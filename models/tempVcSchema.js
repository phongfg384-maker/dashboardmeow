const mongoose = require("mongoose");

const tempVcSchema = new mongoose.Schema({
    guildId: String,
    creatorChannelId: String, // channel lobby
    categoryId: String
});

module.exports = mongoose.model("TempVC", tempVcSchema);