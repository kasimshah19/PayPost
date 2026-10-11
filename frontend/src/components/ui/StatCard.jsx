import React from 'react';
import { Card } from './Card';

export function StatCard({ label, value, subtext, icon, className = '' }) {
  return (
    <Card className={`flex flex-col justify-between ${className}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs sm:text-sm font-medium text-gray-500 truncate">{label}</p>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>
      <div className="mt-2">
        <p className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight tabular-nums">
          {value}
        </p>
        {subtext && <p className="mt-0.5 text-xs text-gray-500 truncate">{subtext}</p>}
      </div>
    </Card>
  );
}
