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

export function formatCountdown(isoString) {
  if (!isoString) return '';
  const now = Date.now();
  const target = new Date(isoString).getTime();
  const diffMs = target - now;
  if (diffMs <= 0) {
    return 'Deadline has passed';
  }
  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) {
    return `Due in ${days} ${days === 1 ? 'day' : 'days'} ${hours} ${hours === 1 ? 'hour' : 'hours'}, IST`;
  }
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `Due in ${hours}h ${minutes}m, IST`;
}
