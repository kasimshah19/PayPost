const { isQuietHours, nextAllowedSendTime } = require('../src/utils/quietHours');

describe('Quiet Hours Utility (utils/quietHours.js)', () => {
  describe('isQuietHours(date)', () => {
    // IST = UTC + 5:30 (330 mins)
    // 21:00 IST = 15:30 UTC
    // 09:00 IST = 03:30 UTC

    test('20:59:59 IST is false (not quiet yet)', () => {
      // 20:59:59 IST = 15:29:59 UTC
      const d = new Date(Date.UTC(2026, 9, 11, 15, 29, 59));
      expect(isQuietHours(d)).toBe(false);
    });

    test('21:00:00 IST is true (quiet starts exactly at 21:00:00)', () => {
      // 21:00:00 IST = 15:30:00 UTC
      const d = new Date(Date.UTC(2026, 9, 11, 15, 30, 0));
      expect(isQuietHours(d)).toBe(true);
    });

    test('23:59:59 IST is true (late night)', () => {
      // 23:59:59 IST = 18:29:59 UTC
      const d = new Date(Date.UTC(2026, 9, 11, 18, 29, 59));
      expect(isQuietHours(d)).toBe(true);
    });

    test('00:00:00 IST is true (midnight)', () => {
      // 00:00:00 IST = 18:30:00 UTC of previous UTC day
      const d = new Date(Date.UTC(2026, 9, 11, 18, 30, 0));
      expect(isQuietHours(d)).toBe(true);
    });

    test('08:59:59 IST is true (morning quiet before 9 AM)', () => {
      // 08:59:59 IST = 03:29:59 UTC
      const d = new Date(Date.UTC(2026, 9, 11, 3, 29, 59));
      expect(isQuietHours(d)).toBe(true);
    });

    test('09:00:00 IST is false (allowed at exactly 09:00:00)', () => {
      // 09:00:00 IST = 03:30:00 UTC
      const d = new Date(Date.UTC(2026, 9, 11, 3, 30, 0));
      expect(isQuietHours(d)).toBe(false);
    });

    test('12:00:00 IST is false (midday)', () => {
      // 12:00:00 IST = 06:30:00 UTC
      const d = new Date(Date.UTC(2026, 9, 11, 6, 30, 0));
      expect(isQuietHours(d)).toBe(false);
    });
  });

  describe('nextAllowedSendTime(date)', () => {
    test('12:00 IST returns unchanged date', () => {
      const d = new Date(Date.UTC(2026, 9, 11, 6, 30, 0));
      const res = nextAllowedSendTime(d);
      expect(res.getTime()).toBe(d.getTime());
    });

    test('22:30 IST returns next day 09:00 IST', () => {
      // 22:30 IST on Oct 11 = 17:00 UTC on Oct 11
      const d = new Date(Date.UTC(2026, 9, 11, 17, 0, 0));
      const res = nextAllowedSendTime(d);
      // Next day 09:00 IST on Oct 12 = 03:30 UTC on Oct 12
      const expected = new Date(Date.UTC(2026, 9, 12, 3, 30, 0));
      expect(res.getTime()).toBe(expected.getTime());
      expect(res.getMilliseconds()).toBe(0);
    });

    test('02:00 IST returns same day 09:00 IST', () => {
      // 02:00 IST on Oct 12 = 20:30 UTC on Oct 11
      const d = new Date(Date.UTC(2026, 9, 11, 20, 30, 0));
      const res = nextAllowedSendTime(d);
      // Same day 09:00 IST on Oct 12 = 03:30 UTC on Oct 12
      const expected = new Date(Date.UTC(2026, 9, 12, 3, 30, 0));
      expect(res.getTime()).toBe(expected.getTime());
      expect(res.getMilliseconds()).toBe(0);
    });

    test('31 Dec 22:00 IST rolls over year to 1 Jan 09:00 IST', () => {
      // 22:00 IST on Dec 31, 2026 = 16:30 UTC on Dec 31, 2026
      const d = new Date(Date.UTC(2026, 11, 31, 16, 30, 0));
      const res = nextAllowedSendTime(d);
      // 09:00 IST on Jan 1, 2027 = 03:30 UTC on Jan 1, 2027
      const expected = new Date(Date.UTC(2027, 0, 1, 3, 30, 0));
      expect(res.getTime()).toBe(expected.getTime());
      expect(res.getMilliseconds()).toBe(0);
    });

    test('28 Feb 23:00 IST in leap year (2024) rolls to 29 Feb 09:00 IST', () => {
      // 23:00 IST on Feb 28, 2024 = 17:30 UTC on Feb 28, 2024
      const d = new Date(Date.UTC(2024, 1, 28, 17, 30, 0));
      const res = nextAllowedSendTime(d);
      // 09:00 IST on Feb 29, 2024 = 03:30 UTC on Feb 29, 2024
      const expected = new Date(Date.UTC(2024, 1, 29, 3, 30, 0));
      expect(res.getTime()).toBe(expected.getTime());
      expect(res.getMilliseconds()).toBe(0);
    });

    test('28 Feb 23:00 IST in non-leap year (2023) rolls to 1 Mar 09:00 IST', () => {
      // 23:00 IST on Feb 28, 2023 = 17:30 UTC on Feb 28, 2023
      const d = new Date(Date.UTC(2023, 1, 28, 17, 30, 0));
      const res = nextAllowedSendTime(d);
      // 09:00 IST on Mar 1, 2023 = 03:30 UTC on Mar 1, 2023
      const expected = new Date(Date.UTC(2023, 2, 1, 3, 30, 0));
      expect(res.getTime()).toBe(expected.getTime());
      expect(res.getMilliseconds()).toBe(0);
    });

    test('instant that is 21:30 IST but earlier calendar day in UTC (handles timezone boundary)', () => {
      // 21:30 IST on Oct 11 = 16:00 UTC on Oct 11
      const d = new Date(Date.UTC(2026, 9, 11, 16, 0, 0));
      const res = nextAllowedSendTime(d);
      // Should roll to Oct 12 09:00 IST = 03:30 UTC Oct 12
      const expected = new Date(Date.UTC(2026, 9, 12, 3, 30, 0));
      expect(res.getTime()).toBe(expected.getTime());
    });

    test('instant that is 02:30 IST on Oct 12 is 21:00 UTC on Oct 11 (different date in UTC vs IST)', () => {
      const d = new Date(Date.UTC(2026, 9, 11, 21, 0, 0)); // 02:30 IST on Oct 12
      const res = nextAllowedSendTime(d);
      // Should roll to Oct 12 09:00 IST = 03:30 UTC Oct 12
      const expected = new Date(Date.UTC(2026, 9, 12, 3, 30, 0));
      expect(res.getTime()).toBe(expected.getTime());
    });
  });

  describe('Property fuzz test: 2000 random instants', () => {
    test('result is never quiet, >= input, and at most 12 hours later', () => {
      const baseMs = Date.UTC(2024, 0, 1, 0, 0, 0);
      const spanMs = 3 * 365 * 24 * 60 * 60 * 1000; // 3 years

      for (let i = 0; i < 2000; i++) {
        const randMs = baseMs + Math.floor(Math.random() * spanMs);
        const d = new Date(randMs);
        const next = nextAllowedSendTime(d);

        expect(isQuietHours(next)).toBe(false);
        expect(next.getTime()).toBeGreaterThanOrEqual(d.getTime());

        const diffHours = (next.getTime() - d.getTime()) / (1000 * 60 * 60);
        // From 21:00:00 IST to 09:00:00 IST next day is exactly 12 hours max
        expect(diffHours).toBeLessThanOrEqual(12.0001);
      }
    });
  });
});
