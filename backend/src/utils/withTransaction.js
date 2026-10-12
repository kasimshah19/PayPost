const mongoose = require('mongoose');
const { flushAfterCommit, clearAfterCommit } = require('../realtime');

async function withTransaction(callback) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      // Clear any events accumulated from previous failed attempt (retry handling)
      clearAfterCommit(session);
      result = await callback(session);
    });
    // Reached only if transaction committed successfully
    flushAfterCommit(session);
    return result;
  } catch (err) {
    // Transaction rolled back
    clearAfterCommit(session);
    throw err;
  } finally {
    await session.endSession();
  }
}

module.exports = withTransaction;
