import React from 'react';

const StatusBadge = ({ status }) => {
  let colorClass = 'bg-gray-100 text-gray-800';
  
  if (status === 'active' || status === 'approved') colorClass = 'bg-green-100 text-green-800';
  else if (status === 'completed') colorClass = 'bg-blue-100 text-blue-800';
  else if (status === 'cancelled' || status === 'rejected') colorClass = 'bg-red-100 text-red-800';
  else if (status === 'submitted') colorClass = 'bg-blue-100 text-blue-800';
  else if (status === 'revision_requested') colorClass = 'bg-amber-100 text-amber-800';
  else if (status === 'applied') colorClass = 'bg-purple-100 text-purple-800';
  else if (status === 'withdrawn') colorClass = 'bg-gray-200 text-gray-600';
  else if (status === 'not_submitted') colorClass = 'bg-gray-100 text-gray-500';

  const label = (status || '').replace(/_/g, ' ');

  return (
    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full uppercase tracking-wide inline-flex items-center ${colorClass}`}>
      {label}
    </span>
  );
};

export default StatusBadge;
