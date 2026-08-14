const mongoose = require("mongoose");

const ncoinTopupSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      required: true,
      unique: true,
    },
    providerTransId: {
      type: String,
      default: "",
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    username: {
      type: String,
      default: "",
    },
    provider: {
      type: String,
      default: "gachthefast",
    },
    telco: {
      type: String,
      required: true,
    },
    serial: {
      type: String,
      required: true,
    },
    code: {
      type: String,
      required: true,
    },
    declaredValue: {
      type: Number,
      required: true,
      min: 0,
    },
    actualValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    providerAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    creditedCoins: {
      type: Number,
      default: 0,
      min: 0,
    },
    bonusCoins: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: Number,
      default: 99,
    },
    statusText: {
      type: String,
      default: "PENDING",
    },
    creditedAt: {
      type: Date,
      default: null,
    },
    lastCheckedAt: {
      type: Date,
      default: null,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("NcoinTopup", ncoinTopupSchema);
