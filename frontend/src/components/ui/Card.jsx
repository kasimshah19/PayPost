import React from 'react';

export function Card({ children, className = '', ...props }) {
  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
