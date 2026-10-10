const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  balancePaise: { type: Number, default: 0, min: 0, validate: Number.isInteger }, // withdrawable amount
  heldPaise: { type: Number, default: 0, min: 0, validate: Number.isInteger }     // amount locked in withdrawals that are pending/processing
}, { timestamps: true });

// Note: The ledger (LedgerEntry) is the source of truth for the balance.
// The wallet is a cached balance updated atomically together with every ledger entry.

module.exports = mongoose.model('Wallet', walletSchema);
