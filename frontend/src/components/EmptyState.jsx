import React from 'react';

const EmptyState = ({ message }) => {
  return (
    <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center text-gray-500">
      <p className="text-lg">{message}</p>
    </div>
  );
};

export default EmptyState;
