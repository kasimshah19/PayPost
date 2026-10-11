import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Textarea } from './ui/Input';

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  requiresReason = false,
  error = '',
  loading = false,
  destructive = true
}) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    onConfirm(reason);
  };

  const handleClose = () => {
    setReason('');
    onCancel();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <div className="space-y-4">
        {typeof message === 'string' ? (
          <p className="text-sm text-gray-600 leading-relaxed break-words">{message}</p>
        ) : (
          message
        )}

        {requiresReason && (
          <Textarea
            id="confirm-modal-reason"
            label="Reason (required, min 3 characters)"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Please provide details..."
            rows={3}
          />
        )}

        {error && (
          <div
            className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="pt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sticky bottom-0 bg-white">
          <Button variant="secondary" onClick={handleClose} disabled={loading} fullWidth className="sm:w-auto">
            {cancelText}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={handleConfirm}
            loading={loading}
            disabled={requiresReason && reason.trim().length < 3}
            fullWidth
            className="sm:w-auto"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
