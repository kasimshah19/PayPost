import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import MoneyText from '../components/MoneyText';
import FeeBreakdown from '../components/FeeBreakdown';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { formatDateIST } from '../utils/date';

function CreatorWallet() {
  const [wallet, setWallet] = useState(null);
  const [ledger, setLedger] = useState({ entries: [], total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [expandedEntryId, setExpandedEntryId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchWalletSummary();
  }, []);

  useEffect(() => {
    fetchLedgerEntries();
  }, [page, typeFilter]);

  const fetchWalletSummary = async () => {
    try {
      setLoading(true);
      const res = await api.get('/wallet');
      setWallet(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load wallet');
    } finally {
      setLoading(false);
    }
  };

  const fetchLedgerEntries = async () => {
    try {
      setLedgerLoading(true);
      const params = { page, limit: 10 };
      if (typeFilter) params.type = typeFilter;
      const res = await api.get('/wallet/ledger', { params });
      setLedger(res.data);
    } catch (err) {
      console.error('Failed to load ledger:', err);
    } finally {
      setLedgerLoading(false);
    }
  };

  const toggleExpand = (id) => {
    setExpandedEntryId(prev => prev === id ? null : id);
  };

  if (loading) {
    return (
      <div className="p-8 max-w-5xl mx-auto flex justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/creator" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
              &larr; Back to Dashboard
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">Creator Wallet</h1>
          <p className="text-gray-600 text-sm mt-1">
            Track your campaign payouts, current balance, and ledger history.
          </p>
        </div>

        <div className="relative group">
          <button
            disabled
            className="w-full sm:w-auto px-5 py-2.5 bg-gray-200 text-gray-500 font-semibold rounded-lg shadow-sm cursor-not-allowed flex items-center justify-center gap-2 border border-gray-300"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Withdraw Funds
          </button>
          <div className="absolute right-0 top-full mt-1.5 hidden group-hover:block bg-gray-900 text-white text-xs rounded py-1 px-2.5 shadow-lg whitespace-nowrap z-10">
            Withdrawals coming in Phase 7
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {/* 4 Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Available Balance */}
        <div className="bg-white p-5 rounded-xl border border-emerald-200 shadow-sm bg-gradient-to-br from-emerald-50/40 to-white">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Available Balance</div>
          <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-emerald-600">
            <MoneyText paise={wallet?.balancePaise ?? 0} />
          </div>
          <div className="mt-2 text-xs text-emerald-700 flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            Ready to withdraw (Phase 7)
          </div>
        </div>

        {/* On Hold */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm group relative">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">On Hold</div>
            <span className="text-gray-400 text-xs cursor-help" title="Used for locked withdrawal processing">ⓘ</span>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold text-gray-700">
            <MoneyText paise={wallet?.heldPaise ?? 0} />
          </div>
          <div className="mt-2 text-xs text-gray-400">
            Used for withdrawals, coming in Phase 7
          </div>
        </div>

        {/* Lifetime Earned */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Lifetime Earned</div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold text-indigo-600">
            <MoneyText paise={wallet?.lifetimeEarnedPaise ?? 0} />
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Total campaign credits received
          </div>
        </div>

        {/* Expected Earnings */}
        <div className="bg-white p-5 rounded-xl border border-amber-200 shadow-sm bg-gradient-to-br from-amber-50/40 to-white">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-800">Expected Earnings</div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold text-amber-600">
            <MoneyText paise={wallet?.expectedPaise ?? 0} />
          </div>
          <div className="mt-2 text-xs text-amber-700">
            Approved campaigns not paid yet
          </div>
        </div>
      </div>

      {/* Ledger History Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gray-50/60">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Transaction Ledger</h2>
            <p className="text-xs text-gray-500">Immutable, audited double-entry log of all account balance movements</p>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-600">Filter:</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
              <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-500 border-b border-gray-200">
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

                  return (
                    <React.Fragment key={entry.id}>
                      <tr className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-3.5 px-4 text-xs font-mono text-gray-500 whitespace-nowrap">
                          {formatDateIST(entry.createdAt)}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-gray-800">
                          {entry.description || 'Campaign Payout'}
                          {entry.campaignTitle && (
                            <span className="block text-xs text-gray-500 font-normal">
                              Campaign: {entry.campaignTitle}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                            isCredit ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {entry.type === 'payout_credit' ? 'Payout Credit' : entry.type}
                          </span>
                        </td>
                        <td className={`py-3.5 px-4 text-right font-bold whitespace-nowrap ${
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

        {/* Pagination Footer */}
        {ledger.totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 bg-gray-50/50">
            <div>
              Showing page <span className="font-semibold text-gray-800">{ledger.page}</span> of <span className="font-semibold text-gray-800">{ledger.totalPages}</span> ({ledger.total} total)
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={ledger.page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                disabled={ledger.page >= ledger.totalPages}
                onClick={() => setPage(p => Math.min(ledger.totalPages, p + 1))}
                className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CreatorWallet;
