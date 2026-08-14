const mongoose = require("mongoose");

const sellerVouchSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  sellerId: { type: String, required: true },

  vouches: [{
    buyerId: { type: String, required: true },
    review: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

sellerVouchSchema.index({ guildId: 1, sellerId: 1 }, { unique: true });

module.exports = mongoose.models.SellerVouch || mongoose.model("SellerVouch", sellerVouchSchema);
