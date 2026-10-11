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

export function formatRelativeTimeIST(isoString) {
  if (!isoString) return '';
  const now = Date.now();
  const target = new Date(isoString).getTime();
  const diffMs = now - target;
  
  if (Math.abs(diffMs) < 60000) {
    return 'just now';
  }

  const isPast = diffMs > 0;
  const absDiff = Math.abs(diffMs);
  const minutes = Math.floor(absDiff / (1000 * 60));
  const hours = Math.floor(absDiff / (1000 * 60 * 60));
  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));

  let timeString = '';
  if (days > 0) {
    timeString = `${days} ${days === 1 ? 'day' : 'days'}`;
  } else if (hours > 0) {
    timeString = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  } else {
    timeString = `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }

  return isPast ? `${timeString} ago` : `in ${timeString}`;
}

/**
 * Returns { label, level }
 * level: 'overdue' | 'urgent' (under 24h) | 'soon' (under 72h) | 'ok'
 */
export function getCountdown(isoString) {
  if (!isoString) return { label: 'No deadline', level: 'ok' };
  const now = Date.now();
  const target = new Date(isoString).getTime();
  const diffMs = target - now;

  if (diffMs < 0) {
    const overdueMs = Math.abs(diffMs);
    const overdueHours = Math.floor(overdueMs / (1000 * 60 * 60));
    const overdueDays = Math.floor(overdueHours / 24);
    if (overdueDays > 0) {
      return { label: `Overdue by ${overdueDays}d`, level: 'overdue' };
    }
    if (overdueHours > 0) {
      return { label: `Overdue by ${overdueHours}h`, level: 'overdue' };
    }
    const overdueMins = Math.max(1, Math.floor(overdueMs / (1000 * 60)));
    return { label: `Overdue by ${overdueMins}m`, level: 'overdue' };
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (hours < 24) {
    if (hours === 0) {
      const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
      return { label: `Due in ${minutes}m`, level: 'urgent' };
    }
    return { label: `Due in ${hours}h`, level: 'urgent' };
  }

  if (hours < 72) {
    return { label: `Due in ${days} ${days === 1 ? 'day' : 'days'}`, level: 'soon' };
  }

  return { label: `Due in ${days} days`, level: 'ok' };
}

export function formatCountdown(isoString) {
  return getCountdown(isoString).label;
}

