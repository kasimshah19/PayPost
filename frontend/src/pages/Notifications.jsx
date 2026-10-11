import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [workerResult, setWorkerResult] = useState(null);
  const [devActionLoading, setDevActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch status info (quiet hours, simulated time, heldCount, devToolsEnabled)
  const fetchStatus = async () => {
    try {
      const res = await api.get('/notifications/status');
      setStatusData(res.data);
    } catch (err) {
      console.error('Failed to fetch notification status:', err);
    }
  };

  // Fetch paginated notification jobs
  const fetchNotifications = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const params = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (channelFilter) params.channel = channelFilter;

      const res = await api.get('/notifications', { params });
      setNotifications(res.data.notifications || []);
      setPagination(res.data.pagination || { total: 0, pages: 1 });
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  // Fetch data on filter/page change and poll every 5 seconds
  useEffect(() => {
    fetchStatus();
    fetchNotifications();

    const interval = setInterval(() => {
      fetchStatus();
      fetchNotifications();
    }, 5000);

    return () => clearInterval(interval);
  }, [statusFilter, channelFilter, page]);

  // Dev clock action (realtime, tonight_10pm, next_9am)
  const handleDevClockAction = async (action) => {
    setDevActionLoading(true);
    try {
      await api.post('/dev/clock', { action });
      await fetchStatus();
      await fetchNotifications();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update dev clock');
    } finally {
      setDevActionLoading(false);
    }
  };

  // Dev worker run
  const handleRunWorker = async () => {
    setDevActionLoading(true);
    try {
      const res = await api.post('/dev/notifications/run-worker');
      setWorkerResult(res.data);
      await fetchStatus();
      await fetchNotifications();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to run worker');
    } finally {
      setDevActionLoading(false);
    }
  };

  // Status badge styling helper
  const getBadgeVariant = (status) => {
    switch (status) {
      case 'sent': return 'success';
      case 'pending': return 'warning';
      case 'processing': return 'info';
      case 'skipped': return 'neutral';
      case 'failed': return 'danger';
      default: return 'neutral';
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500">
            Real-time feed of your campaign, submission, and payment updates.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/settings/notifications"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Preferences
          </Link>

          <button
            onClick={() => fetchNotifications(true)}
            disabled={refreshing}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-600' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Held Banner */}
      {statusData && statusData.heldCount > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-md flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-amber-800 font-medium">
              {statusData.heldCount} message{statusData.heldCount > 1 ? 's are' : ' is'} held until 9:00 AM IST due to quiet hours.
            </p>
          </div>
          <span className="text-xs bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full">
            Quiet Hours Active
          </span>
        </div>
      )}

      {/* DEV PANEL (Only if devToolsEnabled is true) */}
      {statusData?.devToolsEnabled && (
        <div className="p-5 border-2 border-dashed border-indigo-300 bg-indigo-50/60 rounded-xl space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-indigo-200 pb-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-indigo-600 text-white text-xs font-bold uppercase rounded tracking-wider">
                DEV TOOL
              </span>
              <h2 className="text-base font-semibold text-indigo-950">
                Developer tools (testing only)
              </h2>
            </div>
            <div className="text-xs text-indigo-800 bg-indigo-100 px-3 py-1 rounded-md font-mono">
              Simulated IST: <span className="font-bold">{statusData.nowIst || 'N/A'}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => handleDevClockAction('tonight_10pm')}
              disabled={devActionLoading}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-medium shadow-sm transition-colors disabled:opacity-50"
            >
              Set time to tonight 10:00 PM IST
            </button>

            <button
              onClick={() => handleDevClockAction('next_9am')}
              disabled={devActionLoading}
              className="px-3 py-1.5 bg-purple-600 hover:purple-700 text-white rounded-md text-xs font-medium shadow-sm transition-colors disabled:opacity-50"
            >
              Jump to next 9:00 AM IST
            </button>

            <button
              onClick={() => handleDevClockAction('realtime')}
              disabled={devActionLoading}
              className="px-3 py-1.5 bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-100 rounded-md text-xs font-medium shadow-sm transition-colors disabled:opacity-50"
            >
              Back to real time
            </button>

            <button
              onClick={handleRunWorker}
              disabled={devActionLoading}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-medium shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Run notification worker now
            </button>
          </div>

          {workerResult && (
            <div className="p-3 bg-white border border-indigo-200 rounded-md text-xs text-gray-700 font-mono flex flex-wrap gap-4 items-center">
              <span className="font-semibold text-indigo-900">Worker Run:</span>
              <span>Claimed: <strong className="text-gray-900">{workerResult.claimed}</strong></span>
              <span>Sent: <strong className="text-emerald-600">{workerResult.sent}</strong></span>
              <span>Skipped: <strong className="text-gray-500">{workerResult.skipped}</strong></span>
              <span>Failed: <strong className="text-red-600">{workerResult.failed}</strong></span>
              <span>Rescheduled: <strong className="text-amber-600">{workerResult.rescheduled}</strong></span>
            </div>
          )}
        </div>
      )}

      {/* Filter Tabs & Channel Selector */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-md text-xs font-medium">
            {[
              { id: '', label: 'All' },
              { id: 'sent', label: 'Sent' },
              { id: 'held', label: 'Held' },
              { id: 'skipped', label: 'Skipped' },
              { id: 'failed', label: 'Failed' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setStatusFilter(tab.id); setPage(1); }}
                className={`px-3 py-1.5 rounded transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-white text-indigo-600 shadow-sm font-semibold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Channel Dropdown Filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-600">Channel:</label>
            <select
              value={channelFilter}
              onChange={(e) => { setChannelFilter(e.target.value); setPage(1); }}
              className="text-xs border border-gray-300 rounded-md px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All Channels</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
        </div>

        {/* Notification List */}
        {loading ? (
          <div className="py-12 flex justify-center">
            <Spinner />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-12">
            <EmptyState
              title="No notifications found"
              description="No messages match your current filter settings."
            />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((job) => {
              const isHeld = job.heldForQuietHours && job.status === 'pending';
              const createdDate = new Date(job.createdAt).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              });

              return (
                <div key={job.id} className="py-4 flex flex-col sm:flex-row justify-between items-start gap-4 hover:bg-gray-50/50 p-2 rounded transition-colors">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Channel Badge */}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                        job.channel === 'whatsapp' 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {job.channel === 'whatsapp' ? (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/>
                          </svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        )}
                        <span className="capitalize">{job.channel}</span>
                      </span>

                      {/* Title */}
                      <h3 className="text-sm font-semibold text-gray-900">{job.title}</h3>

                      {/* Event tag */}
                      <span className="text-xs text-gray-400 font-mono">({job.event})</span>
                    </div>

                    {/* Message Body */}
                    <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{job.message}</p>

                    {/* Meta info & Held indicator */}
                    <div className="flex items-center gap-3 text-xs text-gray-400 pt-1">
                      <span>{createdDate} IST</span>
                      {isHeld && (
                        <span className="text-amber-600 font-medium flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Will be sent at 9:00 AM IST
                        </span>
                      )}
                      {job.lastError && (
                        <span className="text-red-500 font-mono">Error: {job.lastError}</span>
                      )}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="flex flex-col sm:items-end gap-1 flex-shrink-0">
                    <StatusBadge variant={getBadgeVariant(job.status)}>
                      {job.statusLabel || job.status}
                    </StatusBadge>
                    {job.attempts > 1 && (
                      <span className="text-xs text-gray-400">
                        {job.attempts} attempts
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex justify-between items-center pt-4 border-t border-gray-100 text-sm">
            <span className="text-gray-500 text-xs">
              Page {page} of {pagination.pages} ({pagination.total} total)
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1 border border-gray-300 rounded text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={page >= pagination.pages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 border border-gray-300 rounded text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Notifications;
