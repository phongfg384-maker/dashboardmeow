const mongoose = require("mongoose");

const triggerSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    triggerWord: { type: String, required: true },
    response: { type: String, required: true },
    matchType: { 
        type: String, 
        enum: ["exact", "includes", "startswith", "regex"], // Thêm regex
        default: "exact" 
    },
    addedBy: { type: String }
});

triggerSchema.index({ guildId: 1, triggerWord: 1 }, { unique: true });

module.exports = mongoose.model("Trigger", triggerSchema);
