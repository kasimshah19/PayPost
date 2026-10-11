import React from 'react';

export function PageHeader({ title, subtitle, actions, className = '' }) {
  return (
    <div className={`mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${className}`}>
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm sm:text-base text-gray-500">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
