function rupeesToPaise(rupees) {
  const value = Number(rupees);
  if (isNaN(value) || value < 0) {
    throw new Error('Invalid input: rupees must be a non-negative number');
  }
  return Math.round(value * 100);
}

function paiseToRupees(paise) {
  if (typeof paise !== 'number' || paise < 0 || !Number.isInteger(paise)) {
    throw new Error('Invalid input: paise must be a non-negative integer');
  }
  return Number((paise / 100).toFixed(2));
}

function formatINR(paise) {
  const rupees = paiseToRupees(paise);
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

module.exports = { rupeesToPaise, paiseToRupees, formatINR };
