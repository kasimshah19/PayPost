import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import MoneyText from '../components/MoneyText';
import FeeBreakdown from '../components/FeeBreakdown';
import StatusBadge from '../components/StatusBadge';
import WithdrawModal from '../components/WithdrawModal';
import { formatDateIST } from '../utils/date';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ResponsiveList } from '../components/ui/ResponsiveList';
import { Skeleton } from '../components/ui/Skeleton';
import { Icon } from '../components/ui/Icon';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { usePolling } from '../hooks/usePolling';

export default function CreatorWallet() {
  useDocumentTitle('Wallet');
  const [searchParams, setSearchParams] = useSearchParams();

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

  // Modal and completion status state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialAmount, setModalInitialAmount] = useState(null);
  const [modalInitialUpi, setModalInitialUpi] = useState(null);
  const [statusBanner, setStatusBanner] = useState(null);

  const prevActiveRef = useRef(null);

  // Support deep link ?retry=<withdrawalId>
  const retryId = searchParams.get('retry');

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchLedgerEntries();
  }, [ledgerPage, typeFilter]);

  useEffect(() => {
    fetchWithdrawals();
  }, [withdrawalPage]);

  // Handle retry deep link
  useEffect(() => {
    if (retryId) {
      api.get(`/withdrawals/${retryId}`)
        .then((res) => {
          const w = res.data;
          setModalInitialAmount(w.amountPaise);
          setModalInitialUpi(w.payoutDestination?.upiId || '');
          setIsModalOpen(true);
        })
        .catch(() => {
          // If not found, ignore
        });
    }
  }, [retryId]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [walletRes, ledgerRes, withRes] = await Promise.all([
        api.get('/wallet'),
        api.get('/wallet/ledger', { params: { page: 1, limit: 10 } }),
        api.get('/withdrawals', { params: { page: 1, limit: 10 } })
      ]);
      setWallet(walletRes.data);
      prevActiveRef.current = walletRes.data.activeWithdrawal;
      setLedger({
        entries: ledgerRes.data.entries || [],
        total: ledgerRes.data.total || 0,
        page: ledgerRes.data.page || 1,
        totalPages: ledgerRes.data.totalPages || 1
      });
      setWithdrawals({
        list: withRes.data.withdrawals || [],
        total: withRes.data.total || 0,
        page: withRes.data.page || 1,
        totalPages: withRes.data.totalPages || 1
      });
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  };

  const fetchLedgerEntries = async () => {
    setLedgerLoading(true);
    try {
      const params = { page: ledgerPage, limit: 10 };
      if (typeFilter) params.type = typeFilter;
      const res = await api.get('/wallet/ledger', { params });
      setLedger({
        entries: res.data.entries || [],
        total: res.data.total || 0,
        page: res.data.page || 1,
        totalPages: res.data.totalPages || 1
      });
    } catch {
      // Ignored
    } finally {
      setLedgerLoading(false);
    }
  };

  const fetchWithdrawals = async () => {
    setWithdrawalsLoading(true);
    try {
      const res = await api.get('/withdrawals', { params: { page: withdrawalPage, limit: 10 } });
      setWithdrawals({
        list: res.data.withdrawals || [],
        total: res.data.total || 0,
        page: res.data.page || 1,
        totalPages: res.data.totalPages || 1
      });
    } catch {
      // Ignored
    } finally {
      setWithdrawalsLoading(false);
    }
  };

  // Poll while an active withdrawal is processing
  const pollActiveWithdrawal = async () => {
    if (!wallet?.activeWithdrawal) return;

    try {
      const [walletRes, withRes] = await Promise.all([
        api.get('/wallet'),
        api.get('/withdrawals', { params: { page: 1, limit: 10 } })
      ]);

      const newWallet = walletRes.data;
      const newWithdrawals = withRes.data;

      if (prevActiveRef.current && !newWallet.activeWithdrawal) {
        const finishedId = prevActiveRef.current.id || prevActiveRef.current._id;
        const finishedDoc = newWithdrawals.withdrawals?.find(w => (w.id === finishedId || w._id === finishedId));

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
        fetchLedgerEntries();
      }

      prevActiveRef.current = newWallet.activeWithdrawal;
      setWallet(newWallet);
      setWithdrawals(prev => ({
        ...prev,
        list: newWithdrawals.withdrawals || []
      }));
    } catch {
      // Ignored
    }
  };

  usePolling(pollActiveWithdrawal, 3000, Boolean(wallet?.activeWithdrawal));

  const handleWithdrawClick = () => {
    setModalInitialAmount(null);
    setModalInitialUpi(null);
    setIsModalOpen(true);
  };

  const handleRetryWithdrawal = (w) => {
    setModalInitialAmount(w.amountPaise);
    const unmasked = wallet?.lastUpiId || '';
    setModalInitialUpi(unmasked);
    setIsModalOpen(true);
  };

  const handleModalSuccess = (data) => {
    setIsModalOpen(false);
    setStatusBanner(null);
    const newWithdrawal = data?.withdrawal || data;
    const newWallet = data?.wallet;
    if (newWallet) {
      setWallet(prev => ({
        ...prev,
        balancePaise: newWallet.balancePaise,
        heldPaise: newWallet.heldPaise,
        activeWithdrawal: newWithdrawal
      }));
    } else if (newWithdrawal) {
      setWallet(prev => ({
        ...prev,
        balancePaise: (prev?.balancePaise || 0) - (newWithdrawal.amountPaise || 0),
        heldPaise: (prev?.heldPaise || 0) + (newWithdrawal.amountPaise || 0),
        activeWithdrawal: newWithdrawal
      }));
    }
    prevActiveRef.current = newWithdrawal;
    fetchInitialData();
    window.dispatchEvent(new Event('wallet_updated'));
  };

  const clearRetryParam = () => {
    if (retryId) {
      const next = new URLSearchParams(searchParams);
      next.delete('retry');
      setSearchParams(next, { replace: true });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallet & Ledger"
        subtitle="Track verified payouts, milestone credits, and UPI withdrawals"
        actions={
          <Button
            variant="primary"
            onClick={handleWithdrawClick}
            disabled={!wallet || wallet.balancePaise < 10000 || Boolean(wallet.activeWithdrawal)}
            fullWidth
            className="sm:w-auto"
          >
            <Icon name="wallet" className="w-4 h-4 mr-1.5" />
            Withdraw Money
          </Button>
        }
      />

      {/* Status Alert Banner */}
      {statusBanner && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-red-50 text-red-900 border-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <Icon name={statusBanner.type === 'success' ? 'check' : 'alert-circle'} className="w-5 h-5 flex-shrink-0" />
            <span>{statusBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-xs font-semibold opacity-70 hover:opacity-100 p-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Active Withdrawal Notification Card */}
      {wallet?.activeWithdrawal && (
        <Card className="border-indigo-200 bg-indigo-50/50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
              Active Withdrawal in Progress
            </span>
            <StatusBadge status={wallet.activeWithdrawal.status} />
          </div>
          <p className="text-sm text-indigo-900">
            Processing <strong><MoneyText paise={wallet.activeWithdrawal.amountPaise} /></strong> to UPI destination{' '}
            <strong className="font-mono">{wallet.activeWithdrawal.payoutDestination?.upiId}</strong>.
          </p>
        </Card>
      )}

      {/* StatCards (2 per row on mobile, 4 on desktop) */}
      {loading ? (
        <Skeleton variant="stat" count={4} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            label="Available Balance"
            value={<MoneyText paise={wallet?.balancePaise ?? 0} />}
            subtext="Ready to withdraw"
            icon={<Icon name="wallet" className="w-4 h-4 text-emerald-600" />}
          />
          <StatCard
            label="On Hold"
            value={<MoneyText paise={wallet?.heldPaise ?? 0} />}
            subtext="In active withdrawal"
            icon={<Icon name="clock" className="w-4 h-4 text-amber-600" />}
          />
          <StatCard
            label="Expected Earnings"
            value={<MoneyText paise={wallet?.expectedPaise ?? 0} />}
            subtext="Approved submissions"
            icon={<Icon name="info" className="w-4 h-4 text-blue-600" />}
          />
          <StatCard
            label="Lifetime Earned"
            value={<MoneyText paise={wallet?.lifetimeEarnedPaise ?? 0} />}
            subtext="Total completed work"
            icon={<Icon name="check" className="w-4 h-4 text-gray-500" />}
          />
        </div>
      )}

      {/* Withdrawals Section: ResponsiveList (cards on mobile, table on desktop) */}
      <Card className="space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Withdrawal Requests</h2>
        {withdrawalsLoading ? (
          <Skeleton variant="list" count={2} />
        ) : (
          <ResponsiveList
            items={withdrawals.list}
            emptyText="No withdrawals initiated yet."
            headers={['Date', 'Amount', 'Destination', 'Status', 'Actions']}
            renderCard={(w) => (
              <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-2 text-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-bold text-gray-900 tabular-nums">
                      <MoneyText paise={w.amountPaise} />
                    </span>
                    <p className="text-xs text-gray-500">{formatDateIST(w.createdAt || w.requestedAt)}</p>
                  </div>
                  <StatusBadge status={w.status} />
                </div>
                <div className="text-xs text-gray-600 flex justify-between items-center pt-1 border-t border-gray-100">
                  <span>Destination: <strong className="font-mono text-gray-800">{w.payoutDestination?.upiId}</strong></span>
                  {w.status === 'failed' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleRetryWithdrawal(w)}
                      className="text-xs px-2.5 py-1 min-h-9"
                    >
                      Try again
                    </Button>
                  )}
                </div>
                {w.failureReason && (
                  <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg">
                    Reason: {w.failureReason}
                  </p>
                )}
              </div>
            )}
            renderRow={(w) => (
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDateIST(w.createdAt || w.requestedAt)}</td>
                <td className="px-4 py-3 font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                  <MoneyText paise={w.amountPaise} />
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{w.payoutDestination?.upiId}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusBadge status={w.status} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {w.status === 'failed' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleRetryWithdrawal(w)}
                      className="text-xs px-2.5 py-1 min-h-9"
                    >
                      Try again
                    </Button>
                  )}
                </td>
              </tr>
            )}
          />
        )}
      </Card>

      {/* Ledger Section: ResponsiveList with expandable breakdown */}
      <Card className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-gray-900">Ledger History</h2>

          {/* Type filter */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {['', 'payout_credit', 'withdrawal_hold', 'withdrawal_debit', 'withdrawal_refund'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTypeFilter(t);
                  setLedgerPage(1);
                }}
                className={`min-h-11 px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap transition-colors ${
                  typeFilter === t
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t ? t.replace('_', ' ') : 'All'}
              </button>
            ))}
          </div>
        </div>

        {ledgerLoading ? (
          <Skeleton variant="list" count={3} />
        ) : (
          <ResponsiveList
            items={ledger.entries}
            emptyText="No ledger transactions found."
            headers={['Date', 'Type', 'Amount', 'Balance After', 'Details']}
            renderCard={(entry) => {
              const isCredit = entry.amountPaise > 0;
              const isExpanded = expandedEntryId === entry._id;
              return (
                <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-2 text-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className={`font-bold tabular-nums text-base ${isCredit ? 'text-emerald-600' : 'text-gray-900'}`}>
                        {isCredit ? '+' : ''}
                        <MoneyText paise={entry.amountPaise} />
                      </span>
                      <p className="text-xs text-gray-500">{formatDateIST(entry.createdAt)}</p>
                    </div>
                    <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                      {entry.type?.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs text-gray-500 pt-1 border-t border-gray-100">
                    <span>Balance: <strong className="text-gray-800 tabular-nums"><MoneyText paise={entry.balanceAfterPaise} /></strong></span>
                    {entry.breakdown && (
                      <button
                        type="button"
                        onClick={() => setExpandedEntryId(isExpanded ? null : entry._id)}
                        className="text-indigo-600 font-semibold"
                      >
                        {isExpanded ? 'Hide breakdown' : 'View breakdown'}
                      </button>
                    )}
                  </div>

                  {isExpanded && entry.breakdown && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <FeeBreakdown breakdown={entry.breakdown} compact={true} isCreator={true} />
                    </div>
                  )}
                </div>
              );
            }}
            renderRow={(entry) => {
              const isCredit = entry.amountPaise > 0;
              const isExpanded = expandedEntryId === entry._id;
              return (
                <React.Fragment>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDateIST(entry.createdAt)}</td>
                    <td className="px-4 py-3 text-xs font-semibold capitalize whitespace-nowrap">{entry.type?.replace('_', ' ')}</td>
                    <td className={`px-4 py-3 font-semibold tabular-nums whitespace-nowrap ${isCredit ? 'text-emerald-600' : 'text-gray-900'}`}>
                      {isCredit ? '+' : ''}
                      <MoneyText paise={entry.amountPaise} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700 tabular-nums whitespace-nowrap">
                      <MoneyText paise={entry.balanceAfterPaise} />
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {entry.breakdown && (
                        <button
                          type="button"
                          onClick={() => setExpandedEntryId(isExpanded ? null : entry._id)}
                          className="text-indigo-600 hover:underline font-semibold"
                        >
                          {isExpanded ? 'Hide' : 'Breakdown'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && entry.breakdown && (
                    <tr>
                      <td colSpan="5" className="p-4 bg-gray-50">
                        <FeeBreakdown breakdown={entry.breakdown} compact={true} isCreator={true} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            }}
          />
        )}
      </Card>

      {/* Withdraw Modal / Bottom Sheet */}
      <WithdrawModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          clearRetryParam();
        }}
        availableBalancePaise={wallet?.balancePaise ?? 0}
        lastUpiId={wallet?.lastUpiId || ''}
        initialAmountPaise={modalInitialAmount}
        initialUpiId={modalInitialUpi}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
}
