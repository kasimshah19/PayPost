import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import MoneyText from '../components/MoneyText';
import FeeBreakdown from '../components/FeeBreakdown';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import WithdrawModal from '../components/WithdrawModal';
import { formatDateIST } from '../utils/date';

function CreatorWallet() {
  const [wallet, setWallet] = useState(null);
  const [ledger, setLedger] = useState({ entries: [], total: 0, page: 1, totalPages: 1 });
  const [withdrawals, setWithdrawals] = useState({ list: [], total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [ledgerPage, setLedgerPage] = useState(1);
  const [withdrawalPage, setWithdrawalPage] = useState(1);
  const [expandedEntryId, setExpandedEntryId] = useState(null);
  const [error, setError] = useState(null);

  // Modal and completion status state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialAmount, setModalInitialAmount] = useState(null);
  const [modalInitialUpi, setModalInitialUpi] = useState(null);
  const [statusBanner, setStatusBanner] = useState(null); // { type: 'success' | 'error', message: string }

  // Track previous active withdrawal to detect completion transition
  const prevActiveRef = useRef(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchLedgerEntries();
  }, [ledgerPage, typeFilter]);

  useEffect(() => {
    fetchWithdrawals();
  }, [withdrawalPage]);

  // Polling loop while withdrawal is pending or processing
  useEffect(() => {
    if (!wallet?.activeWithdrawal) {
      return;
    }

    const intervalId = setInterval(async () => {
      try {
        const [walletRes, withRes] = await Promise.all([
          api.get('/wallet'),
          api.get('/withdrawals', { params: { page: 1, limit: 10 } })
        ]);

        const newWallet = walletRes.data;
        const newWithdrawals = withRes.data;

        // Check if active withdrawal finished
        if (prevActiveRef.current && !newWallet.activeWithdrawal) {
          const finishedId = prevActiveRef.current.id || prevActiveRef.current._id;
          const finishedDoc = newWithdrawals.withdrawals.find(w => (w.id === finishedId || w._id === finishedId));

          if (finishedDoc) {
            const formattedAmount = `₹${(finishedDoc.amountPaise / 100).toFixed(2)}`;
            if (finishedDoc.status === 'succeeded') {
              setStatusBanner({
                type: 'success',
                message: `${formattedAmount} successfully sent to ${finishedDoc.payoutDestination?.upiId || 'your UPI ID'}.`
              });
            } else if (finishedDoc.status === 'failed') {
              setStatusBanner({
                type: 'error',
                message: `Withdrawal failed: ${finishedDoc.failureReason || 'Bank rejected the transfer'}. ${formattedAmount} has been returned to your wallet.`
              });
            }
          }

          // Trigger ledger reload and notify navbar chip
          fetchLedgerEntries();
          window.dispatchEvent(new Event('wallet_updated'));
        }

        prevActiveRef.current = newWallet.activeWithdrawal;
        setWallet(newWallet);
        setWithdrawals({
          list: newWithdrawals.withdrawals || [],
          total: newWithdrawals.total || 0,
          page: newWithdrawals.page || 1,
          totalPages: newWithdrawals.totalPages || 1
        });
      } catch (pollErr) {
        console.error('Polling error:', pollErr);
      }
    }, 3000);

    return () => clearInterval(intervalId);
  }, [wallet?.activeWithdrawal]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [walletRes, withRes] = await Promise.all([
        api.get('/wallet'),
        api.get('/withdrawals', { params: { page: 1, limit: 10 } })
      ]);
      setWallet(walletRes.data);
      prevActiveRef.current = walletRes.data.activeWithdrawal;
      setWithdrawals({
        list: withRes.data.withdrawals || [],
        total: withRes.data.total || 0,
        page: withRes.data.page || 1,
        totalPages: withRes.data.totalPages || 1
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load wallet');
    } finally {
      setLoading(false);
    }
  };

  const fetchLedgerEntries = async () => {
    try {
      setLedgerLoading(true);
      const params = { page: ledgerPage, limit: 10 };
      if (typeFilter) params.type = typeFilter;
      const res = await api.get('/wallet/ledger', { params });
      setLedger(res.data);
    } catch (err) {
      console.error('Failed to load ledger:', err);
    } finally {
      setLedgerLoading(false);
    }
  };

  const fetchWithdrawals = async () => {
    try {
      setWithdrawalsLoading(true);
      const res = await api.get('/withdrawals', { params: { page: withdrawalPage, limit: 10 } });
      setWithdrawals({
        list: res.data.withdrawals || [],
        total: res.data.total || 0,
        page: res.data.page || 1,
        totalPages: res.data.totalPages || 1
      });
    } catch (err) {
      console.error('Failed to load withdrawals:', err);
    } finally {
      setWithdrawalsLoading(false);
    }
  };

  const toggleExpand = (id) => {
    setExpandedEntryId(prev => prev === id ? null : id);
  };

  const openWithdrawModal = (amountPaise = null, upiId = null) => {
    setModalInitialAmount(amountPaise);
    setModalInitialUpi(upiId);
    setIsModalOpen(true);
  };

  const handleWithdrawalSuccess = (data) => {
    setStatusBanner(null);
    setWallet(prev => ({
      ...prev,
      balancePaise: data.wallet.balancePaise,
      heldPaise: data.wallet.heldPaise,
      activeWithdrawal: data.withdrawal
    }));
    prevActiveRef.current = data.withdrawal;
    fetchWithdrawals();
    fetchLedgerEntries();
    window.dispatchEvent(new Event('wallet_updated'));
  };

  if (loading) {
    return (
      <div className="p-8 max-w-5xl mx-auto flex justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  const availableBalance = wallet?.balancePaise ?? 0;
  const isWithdrawActive = Boolean(wallet?.activeWithdrawal);
  const canWithdraw = availableBalance >= 10000 && !isWithdrawActive;

  let withdrawDisabledReason = '';
  if (isWithdrawActive) {
    withdrawDisabledReason = 'A withdrawal is already in progress.';
  } else if (availableBalance < 10000) {
    withdrawDisabledReason = 'Minimum withdrawal balance is ₹100.00.';
  }

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-8">
      {/* Active Withdrawal Live Processing Banner */}
      {wallet?.activeWithdrawal && (
        <div className="p-4 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-xl text-white">
              <Spinner size="sm" />
            </div>
            <div>
              <div className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                <span>Withdrawal of <MoneyText paise={wallet.activeWithdrawal.amountPaise} /> is being processed</span>
                <StatusBadge status={wallet.activeWithdrawal.status} />
              </div>
              <p className="text-xs text-indigo-700 mt-0.5">
                Funds are temporarily locked on hold. The payout worker will settle your transfer in a few seconds.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-semibold text-indigo-600 uppercase tracking-wider self-start sm:self-center">
            Live Polling
          </span>
        </div>
      )}

      {/* Completion Alert Banner (Success / Reversal Alert) */}
      {statusBanner && (
        <div className={`p-4 rounded-2xl border shadow-sm flex items-start justify-between gap-3 ${
          statusBanner.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-rose-50 border-rose-200 text-rose-900'
        }`}>
          <div className="flex items-start gap-2.5">
            <span className="text-lg leading-none mt-0.5">
              {statusBanner.type === 'success' ? '✅' : '❌'}
            </span>
            <div>
              <div className="text-sm font-bold">
                {statusBanner.type === 'success' ? 'Transfer Succeeded' : 'Withdrawal Failed'}
              </div>
              <p className="text-xs mt-0.5 font-medium leading-relaxed">
                {statusBanner.message}
              </p>
            </div>
          </div>
          <button
            onClick={() => setStatusBanner(null)}
            className="text-gray-400 hover:text-gray-600 text-sm font-bold p-1"
          >
            &times;
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/creator" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1">
              <span>&larr;</span> Back to Dashboard
            </Link>
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mt-1.5">Creator Wallet</h1>
          <p className="text-gray-600 text-sm mt-1">
            Track your campaign earnings, manage payouts, and review your audited ledger.
          </p>
        </div>

        {/* Withdraw Button */}
        <div className="relative group">
          <button
            type="button"
            disabled={!canWithdraw}
            onClick={() => openWithdrawModal()}
            className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition-all ${
              canWithdraw
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-95 shadow-emerald-200'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            Withdraw Funds
          </button>

          {!canWithdraw && withdrawDisabledReason && (
            <div className="absolute right-0 top-full mt-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg py-1.5 px-3 shadow-xl whitespace-nowrap z-20">
              {withdrawDisabledReason}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 text-sm">
          {error}
        </div>
      )}

      {/* 4 Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Available Balance */}
        <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm bg-gradient-to-br from-emerald-50/50 to-white">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-800">Available Balance</div>
          <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-emerald-600">
            <MoneyText paise={availableBalance} />
          </div>
          <div className="mt-2 text-xs text-emerald-700 flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Ready to withdraw anytime
          </div>
        </div>

        {/* On Hold */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm bg-gradient-to-br from-gray-50/50 to-white">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500">On Hold</div>
            <span className="text-gray-400 text-xs" title="Locked in pending or processing withdrawals">🔒</span>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold text-gray-800">
            <MoneyText paise={wallet?.heldPaise ?? 0} />
          </div>
          <div className="mt-2 text-xs text-gray-500 font-medium">
            Locked in pending/processing payouts
          </div>
        </div>

        {/* Total Withdrawn */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm bg-gradient-to-br from-blue-50/30 to-white">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Total Withdrawn</div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold text-indigo-600">
            <MoneyText paise={wallet?.totalWithdrawnPaise ?? 0} />
          </div>
          <div className="mt-2 text-xs text-gray-500 font-medium">
            Lifetime payouts successfully completed
          </div>
        </div>

        {/* Expected Earnings */}
        <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-sm bg-gradient-to-br from-amber-50/40 to-white">
          <div className="text-xs font-bold uppercase tracking-wider text-amber-800">Expected Earnings</div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold text-amber-600">
            <MoneyText paise={wallet?.expectedPaise ?? 0} />
          </div>
          <div className="mt-2 text-xs text-amber-700 font-medium">
            Approved campaigns awaiting submission
          </div>
        </div>
      </div>

      {/* Withdrawals History Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Withdrawals History</h2>
            <p className="text-xs text-gray-500">Record of all bank/UPI payout requests and mock gateway settlement</p>
          </div>
          <button
            onClick={fetchWithdrawals}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
          >
            Refresh
          </button>
        </div>

        {withdrawalsLoading ? (
          <div className="p-8 flex justify-center">
            <Spinner />
          </div>
        ) : withdrawals.list.length === 0 ? (
          <div className="p-8">
            <EmptyState message="No withdrawal requests made yet. When you withdraw funds, your payouts will show here." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-[11px] uppercase font-semibold text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Date (IST)</th>
                  <th className="py-3 px-4">Payout UPI</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Details / Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {withdrawals.list.map((w) => {
                  const isFailed = w.status === 'failed';
                  const wId = w.id || w._id;

                  return (
                    <tr key={wId} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3.5 px-4 text-xs font-mono text-gray-500 whitespace-nowrap">
                        {formatDateIST(w.requestedAt)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs font-medium text-gray-800 whitespace-nowrap">
                        {w.payoutDestination?.upiId || '—'}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <StatusBadge status={w.status} />
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold font-mono text-gray-900 whitespace-nowrap">
                        <MoneyText paise={w.amountPaise} />
                      </td>
                      <td className="py-3.5 px-4 text-xs whitespace-nowrap">
                        {isFailed ? (
                          <div className="flex items-center gap-3">
                            <span className="text-rose-600 font-medium truncate max-w-xs" title={w.failureReason}>
                              {w.failureReason || 'Failed'}
                            </span>
                            <button
                              type="button"
                              onClick={() => openWithdrawModal(w.amountPaise, wallet?.lastUpiId || '')}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg text-xs border border-indigo-200 shadow-sm transition-all"
                            >
                              Try again
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400 font-mono text-[11px]">
                            {w.providerRef ? `Ref: ${w.providerRef}` : (w.status === 'processing' ? 'Processing...' : '—')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Withdrawals Pagination */}
        {withdrawals.totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 bg-gray-50/50">
            <div>
              Showing page <span className="font-semibold text-gray-800">{withdrawals.page}</span> of <span className="font-semibold text-gray-800">{withdrawals.totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={withdrawals.page <= 1}
                onClick={() => setWithdrawalPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                disabled={withdrawals.page >= withdrawals.totalPages}
                onClick={() => setWithdrawalPage(p => Math.min(withdrawals.totalPages, p + 1))}
                className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Ledger Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gray-50/60">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Transaction Ledger</h2>
            <p className="text-xs text-gray-500">Immutable, audited double-entry log of all account balance movements</p>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-gray-600">Filter:</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setLedgerPage(1);
              }}
              className="text-xs border border-gray-300 rounded-xl px-3 py-1.5 bg-white text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Transactions</option>
              <option value="payout_credit">Payout Credits</option>
              <option value="withdrawal_hold">Withdrawal Holds</option>
              <option value="withdrawal_reversal">Withdrawal Reversals</option>
            </select>
          </div>
        </div>

        {ledgerLoading ? (
          <div className="p-8 flex justify-center">
            <Spinner />
          </div>
        ) : ledger.entries.length === 0 ? (
          <div className="p-8">
            <EmptyState message="No transactions recorded yet in your wallet ledger." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-[11px] uppercase font-semibold text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Date (IST)</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-right">Balance After</th>
                  <th className="py-3 px-4 text-center">Breakdown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ledger.entries.map((entry) => {
                  const isCredit = entry.direction === 'credit';
                  const isExpanded = expandedEntryId === entry.id;
                  const breakdown = entry.breakdown || entry.meta?.breakdown;

                  // Clear human label for each ledger type
                  let typeLabel = entry.type;
                  let badgeBg = 'bg-gray-100 text-gray-800';

                  if (entry.type === 'payout_credit') {
                    typeLabel = 'Payout Credit';
                    badgeBg = 'bg-emerald-100 text-emerald-800';
                  } else if (entry.type === 'withdrawal_hold') {
                    typeLabel = 'Withdrawal Hold';
                    badgeBg = 'bg-rose-100 text-rose-800';
                  } else if (entry.type === 'withdrawal_reversal') {
                    typeLabel = 'Withdrawal Reversal (Refund)';
                    badgeBg = 'bg-emerald-100 text-emerald-800';
                  }

                  return (
                    <React.Fragment key={entry.id}>
                      <tr className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-3.5 px-4 text-xs font-mono text-gray-500 whitespace-nowrap">
                          {formatDateIST(entry.createdAt)}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-gray-800">
                          <div className="flex items-center gap-2">
                            <span>{entry.description || 'Account Transaction'}</span>
                            {/* If withdrawal_hold has linked withdrawal status, show badge */}
                            {entry.type === 'withdrawal_hold' && entry.withdrawalStatus && (
                              <StatusBadge status={entry.withdrawalStatus} />
                            )}
                          </div>
                          {entry.campaignTitle && (
                            <span className="block text-xs text-gray-500 font-normal mt-0.5">
                              Campaign: {entry.campaignTitle}
                            </span>
                          )}
                          {entry.meta?.upiMasked && (
                            <span className="block text-xs text-gray-400 font-mono">
                              UPI: {entry.meta.upiMasked}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${badgeBg}`}>
                            {typeLabel}
                          </span>
                        </td>
                        <td className={`py-3.5 px-4 text-right font-bold font-mono whitespace-nowrap ${
                          isCredit ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {isCredit ? '+' : '-'}&nbsp;<MoneyText paise={entry.amountPaise} />
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-medium text-gray-700 whitespace-nowrap">
                          <MoneyText paise={entry.balanceAfterPaise} />
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {breakdown ? (
                            <button
                              type="button"
                              onClick={() => toggleExpand(entry.id)}
                              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline focus:outline-none"
                            >
                              {isExpanded ? 'Hide' : 'View'}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Expandable Breakdown Drawer */}
                      {isExpanded && breakdown && (
                        <tr className="bg-indigo-50/30">
                          <td colSpan="6" className="p-4">
                            <div className="max-w-md mx-auto">
                              <h4 className="text-xs font-bold uppercase text-gray-700 mb-2">
                                Payout Deductions & Net Transfer
                              </h4>
                              <FeeBreakdown breakdown={breakdown} isCreator={true} compact={false} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Ledger Pagination */}
        {ledger.totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 bg-gray-50/50">
            <div>
              Showing page <span className="font-semibold text-gray-800">{ledger.page}</span> of <span className="font-semibold text-gray-800">{ledger.totalPages}</span> ({ledger.total} total)
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={ledger.page <= 1}
                onClick={() => setLedgerPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                disabled={ledger.page >= ledger.totalPages}
                onClick={() => setLedgerPage(p => Math.min(ledger.totalPages, p + 1))}
                className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Withdraw Modal */}
      <WithdrawModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        availableBalancePaise={availableBalance}
        lastUpiId={wallet?.lastUpiId || ''}
        initialAmountPaise={modalInitialAmount}
        initialUpiId={modalInitialUpi}
        onSuccess={handleWithdrawalSuccess}
      />
    </div>
  );
}

export default CreatorWallet;
