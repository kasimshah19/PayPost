import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import MoneyText from './MoneyText';
import Spinner from './Spinner';

// Standard UPI ID validation regex
const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

function maskUpiPreview(upi) {
  if (!upi || typeof upi !== 'string') return '';
  const parts = upi.split('@');
  if (parts.length !== 2) return upi;
  const prefix = parts[0];
  const handle = parts[1];
  return `${prefix.slice(0, 2)}***@${handle}`;
}

// Generate UUID safely in browser
function getUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'idem_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

const WithdrawModal = ({
  isOpen,
  onClose,
  availableBalancePaise = 0,
  lastUpiId = '',
  initialAmountPaise = null,
  initialUpiId = null,
  onSuccess
}) => {
  const [rupees, setRupees] = useState('');
  const [upiId, setUpiId] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initialize inputs and unique idempotency key when modal opens
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

  const isMinMet = amountPaise >= 10000;
  const isWithinBalance = amountPaise <= availableBalancePaise;
  const isUpiValid = UPI_REGEX.test(upiId.trim());
  const canSubmit = isMinMet && isWithinBalance && isUpiValid && !loading;

  const handleWithdrawAll = () => {
    if (availableBalancePaise >= 10000) {
      setRupees((availableBalancePaise / 100).toString());
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setLoading(true);

    try {
      const res = await api.post(
        '/withdrawals',
        {
          amountPaise,
          upiId: upiId.trim()
        },
        {
          headers: {
            'Idempotency-Key': idempotencyKey
          }
        }
      );

      if (onSuccess) {
        onSuccess(res.data);
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit withdrawal request.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 transition-all">
        {/* Modal Header */}
        <div className="flex justify-between items-center pb-4 border-b border-gray-100">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Withdraw Funds</h3>
            <p className="text-xs text-gray-500 mt-0.5">Transfer your earnings directly to your UPI ID</p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1 text-lg font-bold disabled:opacity-50"
          >
            &times;
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2">
            <span className="text-base font-bold leading-none">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Amount input */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1.5">
              <label className="font-semibold text-gray-700">Withdrawal Amount (₹)</label>
              <div className="text-gray-500 flex items-center gap-1.5">
                <span>Available: <strong className="text-emerald-700"><MoneyText paise={availableBalancePaise} /></strong></span>
                {availableBalancePaise >= 10000 && (
                  <button
                    type="button"
                    onClick={handleWithdrawAll}
                    className="text-indigo-600 hover:text-indigo-800 font-semibold underline text-xs"
                  >
                    Withdraw all
                  </button>
                )}
              </div>
            </div>

            <div className="relative rounded-lg shadow-sm">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-500 font-medium sm:text-sm">
                ₹
              </span>
              <input
                type="number"
                step="any"
                min="100"
                placeholder="100.00"
                value={rupees}
                onChange={(e) => setRupees(e.target.value)}
                disabled={loading}
                className="w-full pl-8 pr-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="flex justify-between text-[11px] text-gray-500 mt-1">
              <span>Minimum: ₹100.00</span>
              {amountPaise > availableBalancePaise && (
                <span className="text-rose-600 font-medium">Exceeds available balance</span>
              )}
            </div>
          </div>

          {/* UPI ID input */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Payout UPI ID
            </label>
            <input
              type="text"
              placeholder="username@bank"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              disabled={loading}
              className={`w-full px-3.5 py-2.5 text-sm border rounded-xl focus:ring-2 focus:ring-indigo-500 ${
                upiId && !isUpiValid ? 'border-rose-400 bg-rose-50/20' : 'border-gray-300'
              }`}
            />
            {upiId && !isUpiValid && (
              <p className="text-[11px] text-rose-600 mt-1">
                Enter a valid UPI ID (e.g. mobile@upi or name@okbank)
              </p>
            )}
            {/* Dev helper hints */}
            <p className="text-[11px] text-gray-400 mt-1.5 leading-tight">
              Test mode: use <span className="font-mono text-gray-600">success@mock</span> to simulate success, or <span className="font-mono text-gray-600">fail@mock</span> to simulate failure.
            </p>
          </div>

          {/* Dynamic Summary Card */}
          {amountPaise >= 10000 && isUpiValid && (
            <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-xl text-xs space-y-1">
              <div className="font-semibold text-emerald-900 flex items-center justify-between">
                <span>Net Transfer Amount:</span>
                <span className="text-sm font-bold text-emerald-700">₹{numRupees.toFixed(2)}</span>
              </div>
              <p className="text-emerald-800 text-[11px]">
                ₹{numRupees.toFixed(2)} will be sent to <span className="font-mono font-medium">{maskUpiPreview(upiId.trim())}</span>. No withdrawal fee.
              </p>
            </div>
          )}

          {/* Processing Note */}
          <div className="text-[11px] text-gray-400 italic">
            Note: This demo processes payouts in a few seconds via background worker.
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 px-4 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Spinner size="sm" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>Confirm & Withdraw</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default WithdrawModal;
