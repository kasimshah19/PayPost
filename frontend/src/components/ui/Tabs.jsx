import React from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Scrollable tabs component synchronized with URL query param ?tab=
 */
export function Tabs({ tabs = [], defaultTab, paramName = 'tab', className = '' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get(paramName) || defaultTab || (tabs[0] && tabs[0].id);

  const handleSelect = (tabId) => {
    const next = new URLSearchParams(searchParams);
    next.set(paramName, tabId);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className={`relative border-b border-gray-200 ${className}`}>
      <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 px-1 scroll-smooth">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSelect(tab.id)}
              className={`min-h-11 px-4 py-2 text-sm sm:text-base font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700 font-semibold border-b-2 border-indigo-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    isActive ? 'bg-indigo-200 text-indigo-900' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
