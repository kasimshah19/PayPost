import React, { useState, useEffect } from 'react';
import { getCountdown, formatDateIST } from '../../utils/date';
import { Icon } from './Icon';

/**
 * CountdownChip displays deadline urgency with text and color.
 * Never uses color alone to communicate state.
 * Refreshes every 60 seconds.
 */
export function CountdownChip({ isoString, prefix = '', className = '' }) {
  const [countdown, setCountdown] = useState(() => getCountdown(isoString));

  useEffect(() => {
    setCountdown(getCountdown(isoString));
    const interval = setInterval(() => {
      setCountdown(getCountdown(isoString));
    }, 60000);
    return () => clearInterval(interval);
  }, [isoString]);

  if (!isoString) return null;

  const colorStyles = {
    overdue: 'bg-red-50 text-red-700 border-red-200',
    urgent: 'bg-amber-50 text-amber-700 border-amber-200',
    soon: 'bg-blue-50 text-blue-700 border-blue-200',
    ok: 'bg-gray-50 text-gray-700 border-gray-200'
  };

  const style = colorStyles[countdown.level] || colorStyles.ok;
  const fullDateIST = formatDateIST(isoString);

  return (
    <span
      title={`Deadline: ${fullDateIST}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style} ${className}`}
    >
      <Icon name="clock" className="w-3.5 h-3.5 flex-shrink-0" />
      <span>
        {prefix ? `${prefix}: ` : ''}
        {countdown.label}
      </span>
    </span>
  );
}
