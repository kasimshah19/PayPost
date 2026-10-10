import React, { useState } from 'react';

const ConfirmModal = ({ isOpen, title, message, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onCancel, requiresReason = false, error = '' }) => {
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 className="text-xl font-bold mb-4">{title}</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        
        {requiresReason && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border-gray-300 rounded-md shadow-sm p-2 border focus:ring-indigo-500 focus:border-indigo-500"
              rows="3"
              placeholder="Please explain why..."
            />
          </div>
        )}

        {error && <div className="text-red-500 text-sm mb-4">{error}</div>}

        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            {cancelText}
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={requiresReason && reason.trim().length < 3}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
