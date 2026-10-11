/**
 * Global clock provider for notifications and tests.
 * Allows simulated time-travel in development and tests via offsetMs.
 */

let offsetMs = 0;

function now() {
  return new Date(Date.now() + offsetMs);
}

function setOffsetMs(ms) {
  offsetMs = Number(ms) || 0;
}

function getOffsetMs() {
  return offsetMs;
}

function resetClock() {
  offsetMs = 0;
}

module.exports = {
  now,
  setOffsetMs,
  getOffsetMs,
  resetClock
};
