import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Tabs } from '../components/ui/Tabs';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { CountdownChip } from '../components/ui/CountdownChip';
import { Icon } from '../components/ui/Icon';
import MoneyText from '../components/MoneyText';
import CampaignCard from '../components/CampaignCard';
import CreatorApplicationList from '../components/CreatorApplicationList';
import CreatorSubmissionList from '../components/CreatorSubmissionList';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { usePolling } from '../hooks/usePolling';
import { useSocket } from '../realtime/SocketProvider';
import { useRealtimeRefetch } from '../realtime/useRealtimeRefetch';

export default function CreatorDashboard() {
  useDocumentTitle('Creator Dashboard');
  const { user } = useAuth();
  const { connected } = useSocket();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [wallet, setWallet] = useState(null);
  const [nextActions, setNextActions] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  // Discover search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sortOption, setSortOption] = useState('newest');
  const [minFee, setMinFee] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const activeTab = searchParams.get('tab') || 'discover';

  // 400ms search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchDashboardData = async () => {
    try {
      const [walletRes, nextRes] = await Promise.all([
        api.get('/wallet'),
        api.get('/creator/next-actions')
      ]);
      setWallet(walletRes.data);
      setNextActions(nextRes.data.items || []);
    } catch {
      // Ignored for smooth polling
    }
  };

  const fetchCampaigns = async (isBackground = false) => {
    if (!isBackground) {
      setLoading(true);
    }
    try {
      const params = {};
      if (debouncedQuery) params.q = debouncedQuery;
      if (sortOption) params.sort = sortOption;
      if (minFee && Number(minFee) > 0) params.minFeePaise = Number(minFee) * 100;

      const res = await api.get('/campaigns', { params });
      setCampaigns(res.data);
    } catch {
      // Handled
    } finally {
      if (!isBackground) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Real-time updates for Next Actions, Applications, Submissions and Wallet
  useRealtimeRefetch(
    ['application:changed', 'submission:changed', 'campaign:changed', 'wallet:changed', 'withdrawal:changed'],
    fetchDashboardData
  );

  // Real-time updates for Discover campaigns
  useRealtimeRefetch('discover:changed', () => fetchCampaigns(true));

  // Fallback polling when socket is disconnected
  usePolling(fetchDashboardData, 10000, !connected);

  useEffect(() => {
    fetchCampaigns();
  }, [debouncedQuery, sortOption, minFee]);

  const tabsConfig = [
    { id: 'discover', label: 'Discover' },
    { id: 'applications', label: 'My Applications' },
    { id: 'submissions', label: 'My Submissions' }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Creator Dashboard"
        subtitle={`Welcome back, ${user?.name}`}
      />

      {/* 1) WALLET CARD */}
      <Card className="border-emerald-100 bg-gradient-to-r from-emerald-50/40 to-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
              Available to withdraw
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 tracking-tight tabular-nums">
              <MoneyText paise={wallet?.balancePaise ?? 0} />
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500 pt-1">
              <span>Expected: <strong className="text-gray-700 tabular-nums"><MoneyText paise={wallet?.expectedPaise ?? 0} /></strong></span>
              {wallet?.heldPaise > 0 && (
                <span className="text-amber-700">On hold: <strong className="tabular-nums"><MoneyText paise={wallet.heldPaise} /></strong></span>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {wallet?.activeWithdrawal && (
              <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900">
                <span className="font-bold">Withdrawal processing:</span> <MoneyText paise={wallet.activeWithdrawal.amountPaise} />
              </div>
            )}
            <Link to="/creator/wallet">
              <Button variant="primary" fullWidth className="sm:w-auto">
                <Icon name="wallet" className="w-4 h-4 mr-1.5" />
                Withdraw Money
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      {/* 2) NEXT ACTIONS STRIP */}
      <div className="space-y-2">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
          Next Actions
        </h2>

        {nextActions.length === 0 ? (
          <div className="p-3.5 bg-white rounded-xl border border-gray-200 text-xs text-gray-500">
            Nothing urgent right now. Keep exploring new campaigns!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {nextActions.map((item, idx) => (
              <Link
                key={idx}
                to={item.path}
                className={`p-4 rounded-xl border transition-all hover:shadow-sm block space-y-2 ${
                  item.overdue
                    ? 'bg-red-50/60 border-red-200 hover:border-red-300'
                    : item.type === 'withdrawal_failed'
                    ? 'bg-amber-50/60 border-amber-200 hover:border-amber-300'
                    : 'bg-white border-gray-200 hover:border-indigo-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">
                      {item.type === 'withdrawal_failed' ? '⚠️' : item.type === 'resubmit' ? '🔄' : '🎬'}
                    </span>
                    <strong className="text-sm text-gray-900 font-bold truncate">
                      {item.title}
                    </strong>
                  </div>
                  {item.dueAt && <CountdownChip isoString={item.dueAt} />}
                </div>

                <p className="text-xs text-gray-600 line-clamp-2">
                  {item.hint}
                </p>

                <div className="text-xs font-semibold text-indigo-600 flex items-center justify-between pt-1">
                  <span>Take action</span>
                  <span>&rarr;</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 3) TABS: Discover | My applications | My submissions */}
      <Tabs tabs={tabsConfig} defaultTab="discover" />

      {activeTab === 'discover' && (
        <div className="space-y-4">
          {/* Search bar & Filter trigger */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Icon name="search" className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search campaigns by title..."
                className="w-full min-h-11 pl-10 pr-4 rounded-lg border border-gray-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Desktop inline filters */}
            <div className="hidden sm:flex items-center gap-3">
              <Select
                id="desktop-sort"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                options={[
                  { value: 'newest', label: 'Newest First' },
                  { value: 'fee_desc', label: 'Highest Fee' },
                  { value: 'ending_soon', label: 'Ending Soon' }
                ]}
                className="w-44"
              />
              <Input
                id="desktop-min-fee"
                type="number"
                inputMode="numeric"
                value={minFee}
                onChange={(e) => setMinFee(e.target.value)}
                placeholder="Min Fee (₹)"
                className="w-36"
              />
            </div>

            {/* Mobile Filter Button */}
            <div className="sm:hidden">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setIsFilterOpen(true)}
              >
                <Icon name="filter" className="w-4 h-4 mr-1.5" />
                Sort & Filters
              </Button>
            </div>
          </div>

          {/* Campaign List */}
          {loading ? (
            <Skeleton variant="card" count={3} />
          ) : campaigns.length === 0 ? (
            <Card className="text-center py-12 text-gray-500">
              No matching campaigns found. Try adjusting your search or filters.
            </Card>
          ) : (
            <div className="grid gap-4">
              {campaigns.map((camp) => (
                <CampaignCard key={camp._id} campaign={camp} isBrand={false} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'applications' && (
        <Card>
          <CreatorApplicationList />
        </Card>
      )}

      {activeTab === 'submissions' && (
        <Card>
          <CreatorSubmissionList />
        </Card>
      )}

      {/* Filter Bottom Sheet (Mobile) */}
      <Modal
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        title="Filter & Sort Campaigns"
      >
        <div className="space-y-4">
          <Select
            id="mobile-sort"
            label="Sort By"
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            options={[
              { value: 'newest', label: 'Newest First' },
              { value: 'fee_desc', label: 'Highest Fee' },
              { value: 'ending_soon', label: 'Ending Soon' }
            ]}
          />

          <Input
            id="mobile-min-fee"
            label="Minimum Fee (₹)"
            type="number"
            inputMode="numeric"
            value={minFee}
            onChange={(e) => setMinFee(e.target.value)}
            placeholder="e.g. 500"
          />

          <div className="pt-4 flex gap-3">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setSortOption('newest');
                setMinFee('');
                setIsFilterOpen(false);
              }}
            >
              Reset
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={() => setIsFilterOpen(false)}
            >
              Apply Filters
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
