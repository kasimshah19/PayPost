import React from 'react';

const StatusBadge = ({ status }) => {
  let colorClass = 'bg-gray-100 text-gray-800';
  
  if (status === 'active') colorClass = 'bg-green-100 text-green-800';
  if (status === 'completed') colorClass = 'bg-blue-100 text-blue-800';
  if (status === 'cancelled') colorClass = 'bg-red-100 text-red-800';

  return (
    <span className={`px-2 py-1 text-xs font-semibold rounded-full uppercase tracking-wide ${colorClass}`}>
      {status}
    </span>
  );
};

export default StatusBadge;
