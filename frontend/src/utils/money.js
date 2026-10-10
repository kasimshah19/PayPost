export function rupeesToPaise(input) {
  if (!input) return null;
  // Handle commas
  const str = input.toString().replace(/,/g, '');
  const parsed = parseFloat(str);
  if (isNaN(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export function paiseToRupees(paise) {
  if (paise === null || paise === undefined) return 0;
  return paise / 100;
}

export function formatINR(paise) {
  if (paise === null || paise === undefined) return '₹0.00';
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(rupees);
}
