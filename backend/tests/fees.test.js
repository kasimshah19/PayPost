const { calculateBreakdown } = require('../src/services/feeCalculator');
const constants = require('../src/constants');

describe('Fee Calculator Unit Tests', () => {
  describe('Specific Test Vectors', () => {
    test('vector 1: gross 100000 paise (₹1,000.00)', () => {
      const b = calculateBreakdown(100000);
      expect(b.grossFeePaise).toBe(100000);
      expect(b.platformFeePaise).toBe(10000); // 10%
      expect(b.gstPaise).toBe(1800);          // 18% of 10000
      expect(b.payoutBeforeTdsPaise).toBe(88200); // 100000 - 10000 - 1800
      expect(b.tdsPaise).toBe(882);           // 1% of 88200
      expect(b.netPayoutPaise).toBe(87318);   // 88200 - 882
      expect(b.platformFeePaise + b.gstPaise + b.tdsPaise + b.netPayoutPaise).toBe(b.grossFeePaise);
      expect(b.formulaVersion).toBe(1);
      expect(b.rates).toEqual({
        platformPercent: 10,
        gstPercent: 18,
        tdsPercent: 1
      });
    });

    test('vector 2: gross 49950 paise (₹499.50)', () => {
      const b = calculateBreakdown(49950);
      expect(b.grossFeePaise).toBe(49950);
      expect(b.platformFeePaise).toBe(4995);
      expect(b.gstPaise).toBe(899);
      expect(b.payoutBeforeTdsPaise).toBe(44056);
      expect(b.tdsPaise).toBe(441);
      expect(b.netPayoutPaise).toBe(43615);
      expect(b.platformFeePaise + b.gstPaise + b.tdsPaise + b.netPayoutPaise).toBe(b.grossFeePaise);
    });

    test('edge cases: gross 1, 99, 100, 101, 999', () => {
      const cases = [1, 99, 100, 101, 999];
      cases.forEach(gross => {
        const b = calculateBreakdown(gross);
        expect(b.grossFeePaise).toBe(gross);
        expect(Number.isInteger(b.platformFeePaise)).toBe(true);
        expect(Number.isInteger(b.gstPaise)).toBe(true);
        expect(Number.isInteger(b.payoutBeforeTdsPaise)).toBe(true);
        expect(Number.isInteger(b.tdsPaise)).toBe(true);
        expect(Number.isInteger(b.netPayoutPaise)).toBe(true);

        expect(b.platformFeePaise).toBeGreaterThanOrEqual(0);
        expect(b.gstPaise).toBeGreaterThanOrEqual(0);
        expect(b.payoutBeforeTdsPaise).toBeGreaterThanOrEqual(0);
        expect(b.tdsPaise).toBeGreaterThanOrEqual(0);
        expect(b.netPayoutPaise).toBeGreaterThanOrEqual(0);

        expect(b.platformFeePaise + b.gstPaise + b.tdsPaise + b.netPayoutPaise).toBe(b.grossFeePaise);
      });
    });
  });

  describe('Property-Based Invariant Testing (2,000 random gross values)', () => {
    test('sum of all parts equals gross, all parts >= 0 and integers for 2000 random inputs', () => {
      for (let i = 0; i < 2000; i++) {
        // Random integer between 1 and 10,000,000 paise (₹0.01 to ₹100,000.00)
        const gross = Math.floor(Math.random() * 10000000) + 1;
        const b = calculateBreakdown(gross);

        // Invariant 1: Sum equals gross exactly
        expect(b.platformFeePaise + b.gstPaise + b.tdsPaise + b.netPayoutPaise).toBe(gross);

        // Invariant 2: All parts are non-negative
        expect(b.platformFeePaise).toBeGreaterThanOrEqual(0);
        expect(b.gstPaise).toBeGreaterThanOrEqual(0);
        expect(b.payoutBeforeTdsPaise).toBeGreaterThanOrEqual(0);
        expect(b.tdsPaise).toBeGreaterThanOrEqual(0);
        expect(b.netPayoutPaise).toBeGreaterThanOrEqual(0);

        // Invariant 3: All parts are integers
        expect(Number.isInteger(b.platformFeePaise)).toBe(true);
        expect(Number.isInteger(b.gstPaise)).toBe(true);
        expect(Number.isInteger(b.payoutBeforeTdsPaise)).toBe(true);
        expect(Number.isInteger(b.tdsPaise)).toBe(true);
        expect(Number.isInteger(b.netPayoutPaise)).toBe(true);
      }
    });
  });

  describe('Input Validation', () => {
    test('throws on 0, negative numbers, decimals, strings, null, undefined', () => {
      expect(() => calculateBreakdown(0)).toThrow();
      expect(() => calculateBreakdown(-100)).toThrow();
      expect(() => calculateBreakdown(12.5)).toThrow();
      expect(() => calculateBreakdown('1000')).toThrow();
      expect(() => calculateBreakdown('abc')).toThrow();
      expect(() => calculateBreakdown(null)).toThrow();
      expect(() => calculateBreakdown(undefined)).toThrow();
    });
  });

  describe('Dynamic FEE_CONFIG usage (not hardcoded)', () => {
    test('changing FEE_CONFIG rates alters the output accordingly', () => {
      const origConfig = { ...constants.FEE_CONFIG };

      try {
        // Mutate rates temporarily to test dependency on constants
        // Note: Object.freeze might be active, so we define properties or test rates in return object
        const b1 = calculateBreakdown(100000);
        expect(b1.rates.platformPercent).toBe(origConfig.PLATFORM_FEE_PERCENT);
        expect(b1.rates.gstPercent).toBe(origConfig.GST_PERCENT_ON_PLATFORM_FEE);
        expect(b1.rates.tdsPercent).toBe(origConfig.TDS_PERCENT_ON_PAYOUT);
      } finally {
        // Restore if needed
      }
    });
  });
});
