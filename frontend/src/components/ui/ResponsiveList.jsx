import React from 'react';

/**
 * Renders data fetched once:
 * - Card list on mobile (< md)
 * - Table rows on desktop (>= md)
 */
export function ResponsiveList({
  items = [],
  renderCard,
  renderRow,
  headers = [],
  emptyText = 'No items found',
  className = ''
}) {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-8 px-4 bg-white rounded-xl border border-gray-200 text-gray-500 text-sm">
        {emptyText}
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Mobile Card List (< md) */}
      <div className="block md:hidden space-y-3">
        {items.map((item, index) => (
          <React.Fragment key={item._id || item.id || index}>
            {renderCard(item, index)}
          </React.Fragment>
        ))}
      </div>

      {/* Desktop Table View (>= md) */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
          {headers.length > 0 && (
            <thead className="bg-gray-50 text-gray-700 font-semibold">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="px-4 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-gray-200">
            {items.map((item, index) => (
              <React.Fragment key={item._id || item.id || index}>
                {renderRow(item, index)}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
