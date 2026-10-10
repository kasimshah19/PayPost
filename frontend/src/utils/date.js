export function formatDateIST(isoString) {
  if (!isoString) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(new Date(isoString));
}

export function toInputValue(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  // Get time in IST
  const tzOffset = 5.5 * 60 * 60000;
  const localDate = new Date(date.getTime() + tzOffset);
  return localDate.toISOString().slice(0, 16);
}

export function fromInputValue(inputString) {
  if (!inputString) return null;
  // inputString is YYYY-MM-DDTHH:mm, we assume it's IST
  const tzOffset = 5.5 * 60 * 60000;
  const localDate = new Date(inputString);
  return new Date(localDate.getTime() - tzOffset).toISOString();
}
