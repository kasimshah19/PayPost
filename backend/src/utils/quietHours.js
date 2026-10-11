/**
 * Pure functions for India Standard Time (IST = UTC+5:30) quiet hours evaluation.
 * STRICT RULE: Only pure UTC arithmetic is allowed. NEVER use getHours() or server timezone methods.
 */

const { QUIET_HOURS } = require('../constants');

const IST_OFFSET_MINUTES = 330; // UTC+5:30 = 330 minutes
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;

/**
 * Returns true if the given date falls into IST quiet hours (>= 21:00:00 or < 09:00:00 IST).
 * Exactly 21:00:00 IST is quiet, exactly 09:00:00 IST is allowed.
 *
 * @param {Date} date
 * @returns {boolean}
 */
function isQuietHours(date) {
  const d = new Date(date);
  // Shift timestamp by +5:30 to obtain IST calendar components via getUTC* methods
  const istTime = new Date(d.getTime() + IST_OFFSET_MS);

  const hour = istTime.getUTCHours();
  const start = QUIET_HOURS.START_HOUR_IST; // 21
  const end = QUIET_HOURS.END_HOUR_IST;     // 9

  // Quiet hours: hour >= 21 OR hour < 9
  return hour >= start || hour < end;
}

/**
 * Returns the next allowed send time.
 * - If not quiet hours, returns the same date.
 * - If IST hour >= 21: returns 09:00:00.000 IST of the NEXT IST calendar day.
 * - If IST hour < 9: returns 09:00:00.000 IST of the SAME IST calendar day.
 * Must work seamlessly across month ends and year ends.
 *
 * @param {Date} date
 * @returns {Date}
 */
function nextAllowedSendTime(date) {
  const d = new Date(date);
  if (!isQuietHours(d)) {
    return d;
  }

  // Shift to IST virtual frame
  const istTime = new Date(d.getTime() + IST_OFFSET_MS);
  const hour = istTime.getUTCHours();
  const start = QUIET_HOURS.START_HOUR_IST; // 21
  const end = QUIET_HOURS.END_HOUR_IST;     // 9

  let targetYear = istTime.getUTCFullYear();
  let targetMonth = istTime.getUTCMonth();
  let targetDate = istTime.getUTCDate();

  if (hour >= start) {
    // Next IST calendar day at 09:00:00.000 IST
    targetDate += 1;
  }

  // Construct target 09:00:00.000 IST in UTC space then subtract IST_OFFSET_MS
  // Date.UTC(year, month, date, 9, 0, 0, 0) gives UTC ms if that was UTC; subtract offset to make it 09:00 IST
  const targetUtcMs = Date.UTC(targetYear, targetMonth, targetDate, end, 0, 0, 0) - IST_OFFSET_MS;

  return new Date(targetUtcMs);
}

module.exports = {
  isQuietHours,
  nextAllowedSendTime,
  IST_OFFSET_MINUTES,
  IST_OFFSET_MS
};
