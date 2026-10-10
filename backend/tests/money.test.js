const { rupeesToPaise, paiseToRupees, formatINR } = require('../src/utils/money');

describe('Money Utilities', () => {
  describe('rupeesToPaise', () => {
    it('converts correctly', () => {
      expect(rupeesToPaise(1)).toBe(100);
      expect(rupeesToPaise(1.5)).toBe(150);
      expect(rupeesToPaise('2.99')).toBe(299);
      // float precision issues
      expect(rupeesToPaise(0.1 + 0.2)).toBe(30); 
    });
    it('throws on invalid', () => {
      expect(() => rupeesToPaise(-1)).toThrow();
      expect(() => rupeesToPaise('abc')).toThrow();
    });
  });
  describe('paiseToRupees', () => {
    it('converts correctly', () => {
      expect(paiseToRupees(100)).toBe(1);
      expect(paiseToRupees(150)).toBe(1.5);
    });
    it('throws on invalid', () => {
      expect(() => paiseToRupees(-100)).toThrow();
      expect(() => paiseToRupees(150.5)).toThrow(); // must be integer
    });
  });
  describe('formatINR', () => {
    it('formats correctly', () => {
      expect(formatINR(123450)).toBe('₹1,234.50');
      expect(formatINR(0)).toBe('₹0.00');
    });
  });
});
