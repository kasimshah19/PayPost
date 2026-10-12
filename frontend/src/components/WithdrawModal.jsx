import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import MoneyText from './MoneyText';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

function maskUpiPreview(upi) {
  if (!upi || typeof upi !== 'string') return '';
  const parts = upi.split('@');
  if (parts.length !== 2) return upi;
  const prefix = parts[0];
  const handle = parts[1];
  return `${prefix.slice(0, 2)}***@${handle}`;
}

function getUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'idem_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

export default function WithdrawModal({
  isOpen,
  onClose,
  availableBalancePaise = 0,
  lastUpiId = '',
  initialAmountPaise = null,
  initialUpiId = null,
  onSuccess
}) {
  const [rupees, setRupees] = useState('');
  const [upiId, setUpiId] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setLoading(false);
      setIdempotencyKey(getUuid());

      if (initialAmountPaise) {
        setRupees((initialAmountPaise / 100).toString());
      } else {
        setRupees('');
      }

      setUpiId(initialUpiId || lastUpiId || '');
    }
  }, [isOpen, initialAmountPaise, initialUpiId, lastUpiId]);

  if (!isOpen) return null;

  const numRupees = parseFloat(rupees) || 0;
  const amountPaise = Math.round(numRupees * 100);

  const isAmountValid = amountPaise >= 10000 && amountPaise <= availableBalancePaise;
  const isUpiValid = UPI_REGEX.test(upiId.trim());
  const canSubmit = isAmountValid && isUpiValid && !loading;

  const handleWithdrawAll = () => {
    setRupees((availableBalancePaise / 100).toString());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);

    try {
      const payload = {
        amountPaise,
        upiId: upiId.trim()
      };

      const res = await api.post('/withdrawals', payload, {
        headers: {
          'Idempotency-Key': idempotencyKey
        }
      });
      if (onSuccess) onSuccess(res.data);
      onClose();
    } catch (err) {
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError('Failed to initiate withdrawal. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Withdraw to UPI">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm border border-red-200" role="alert">
            {error}
          </div>
        )}

        {/* Balance Card */}
        <div className="p-3.5 bg-gray-50 rounded-xl flex items-center justify-between text-xs">
          <span className="text-gray-500">Available to Withdraw:</span>
          <span className="text-sm font-bold text-gray-900 tabular-nums">
            <MoneyText paise={availableBalancePaise} />
          </span>
        </div>

        {/* Amount Input */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label htmlFor="withdraw-rupees" className="text-sm font-medium text-gray-700">
              Amount (₹)
            </label>
            <button
              type="button"
              onClick={handleWithdrawAll}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              Withdraw all (₹{(availableBalancePaise / 100).toFixed(2)})
            </button>
          </div>
          <Input
            id="withdraw-rupees"
            type="number"
            inputMode="decimal"
            placeholder="Min ₹100"
            value={rupees}
            onChange={(e) => setRupees(e.target.value)}
            disabled={loading}
          />
          <p className="text-xs text-gray-400 mt-1">Minimum withdrawal is ₹100.00.</p>
        </div>

        {/* UPI ID Input */}
        <div>
          <Input
            id="withdraw-upi-id"
            label="Payout UPI ID"
            type="text"
            placeholder="username@bank"
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            disabled={loading}
            hint="Test mode: use success@mock to succeed, fail@mock to simulate failure."
            error={upiId && !isUpiValid ? 'Enter a valid UPI ID (e.g. mobile@upi or name@okhdfcbank)' : null}
          />
        </div>

        {/* Dynamic Summary */}
        {amountPaise >= 10000 && isUpiValid && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1">
            <div className="font-semibold text-emerald-900 flex items-center justify-between">
              <span>Net Transfer Amount:</span>
              <span className="text-sm font-bold text-emerald-700">₹{numRupees.toFixed(2)}</span>
            </div>
            <p className="text-emerald-800">
              ₹{numRupees.toFixed(2)} will be transferred to <span className="font-mono font-medium">{maskUpiPreview(upiId.trim())}</span>. No platform fees on withdrawal.
            </p>
          </div>
        )}

        {/* Sticky Actions on Mobile */}
        <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sticky bottom-0 bg-white">
          <Button variant="secondary" onClick={onClose} disabled={loading} fullWidth className="sm:w-auto">
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={loading} disabled={!canSubmit} fullWidth className="sm:w-auto">
            Confirm & Withdraw
          </Button>
        </div>
      </form>
    </Modal>
  );
}
