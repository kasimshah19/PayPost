import React from 'react';
import { useSocket } from '../realtime/SocketProvider';

/**
 * Small indicator displayed in the top navigation bar showing connection status.
 * Uses both text and color cues (never color alone) and is fully responsive (fits 320px screens).
 */
export default function ConnectionBadge() {
  const { status } = useSocket();

  // Status mapping: 'live' | 'connecting' | 'reconnecting' | 'offline'
  let label = 'Live';
  let dotColor = 'bg-emerald-500';
  let badgeClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';

  if (status === 'connecting' || status === 'reconnecting') {
    label = 'Reconnecting...';
    dotColor = 'bg-amber-500 animate-pulse';
    badgeClasses = 'bg-amber-50 text-amber-700 border-amber-200';
  } else if (status === 'offline') {
    label = 'Offline';
    dotColor = 'bg-slate-400';
    badgeClasses = 'bg-slate-50 text-slate-600 border-slate-200';
  }

  return (
    <div
      role="status"
      aria-label={`Real-time connection status: ${label}`}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors shrink-0 max-w-[110px] sm:max-w-none ${badgeClasses}`}
      title={`Real-time updates status: ${label}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </div>
  );
}
