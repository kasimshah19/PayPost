import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import StatusBadge from '../components/StatusBadge';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ResponsiveList } from '../components/ui/ResponsiveList';
import { Skeleton } from '../components/ui/Skeleton';
import { Icon } from '../components/ui/Icon';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { usePolling } from '../hooks/usePolling';

export default function Notifications() {
  useDocumentTitle('Notifications');

  const [notifications, setNotifications] = useState([]);
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [workerResult, setWorkerResult] = useState(null);
  const [devActionLoading, setDevActionLoading] = useState(false);
  const [activeClockAction, setActiveClockAction] = useState('tonight_10pm');
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await api.get('/notifications/status');
      setStatusData(res.data);
    } catch {
      // Ignored
    }
  };

  const fetchNotifications = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const params = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (channelFilter) params.channel = channelFilter;

      const res = await api.get('/notifications', { params });
      setNotifications(res.data.notifications || []);
      setPagination(res.data.pagination || { total: 0, pages: 1 });
    } catch {
      // Ignored
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchNotifications();
  }, [statusFilter, channelFilter, page]);

  // Visibility-aware polling every 5s
  usePolling(() => {
    fetchStatus();
    fetchNotifications();
  }, 5000, true);

  const handleDevClockAction = async (action) => {
    setActiveClockAction(action);
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Real-time feed of your campaign, submission, and payout messages"
        actions={
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Link to="/settings/notifications" className="flex-1 sm:flex-none">
              <Button variant="secondary" fullWidth className="sm:w-auto text-sm">
                <Icon name="settings" className="w-4 h-4 mr-1.5" />
                Preferences
              </Button>
            </Link>
            <Button
              variant="secondary"
              onClick={() => fetchNotifications(true)}
              loading={refreshing}
              className="text-sm px-3"
            >
              <Icon name="refresh" className="w-4 h-4 mr-1" />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Held notifications banner */}
      {statusData && statusData.heldCount > 0 && (
        <div className="bg-amber-50 border border-amber-300 p-4 rounded-xl flex items-center justify-between text-sm text-amber-900">
          <div className="flex items-center gap-2.5">
            <Icon name="clock" className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p>
              <strong>{statusData.heldCount} message{statusData.heldCount > 1 ? 's are' : ' is'}</strong> held until 9:00 AM IST due to quiet hours.
            </p>
          </div>
          <span className="text-xs bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
            Quiet Hours Active
          </span>
        </div>
      )}

      {/* Dev Panel: Collapses into <details> on mobile */}
      {statusData?.devToolsEnabled && (
        <details className="p-4 sm:p-5 border-2 border-dashed border-indigo-300 bg-indigo-50/60 rounded-xl space-y-4 group">
          <summary className="font-semibold text-indigo-950 cursor-pointer flex items-center justify-between min-h-11 select-none">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-bold uppercase rounded tracking-wider">
                DEV TOOL
              </span>
              <span>Developer Clock & Worker Controls</span>
            </div>
            <span className="text-xs text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded font-mono">
              IST: {statusData.nowIst || 'N/A'}
            </span>
          </summary>

          <div className="pt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={activeClockAction === 'tonight_10pm' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => handleDevClockAction('tonight_10pm')}
                disabled={devActionLoading}
                className="text-xs min-h-9 px-3"
              >
                Set to tonight 10:00 PM IST
              </Button>
              <Button
                variant={activeClockAction === 'next_9am' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => handleDevClockAction('next_9am')}
                disabled={devActionLoading}
                className="text-xs min-h-9 px-3"
              >
                Jump to next 9:00 AM IST
              </Button>
              <Button
                variant={activeClockAction === 'realtime' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => handleDevClockAction('realtime')}
                disabled={devActionLoading}
                className="text-xs min-h-9 px-3"
              >
                Back to real time
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleRunWorker}
                disabled={devActionLoading}
                className="text-xs min-h-9 px-3 bg-emerald-600 hover:bg-emerald-700"
              >
                Run worker now
              </Button>
            </div>

            {workerResult && (
              <div className="p-3 bg-white border border-indigo-200 rounded-lg text-xs font-mono flex flex-wrap gap-3">
                <span>Claimed: <strong>{workerResult.claimed}</strong></span>
                <span>Sent: <strong className="text-emerald-600">{workerResult.sent}</strong></span>
                <span>Skipped: <strong className="text-gray-500">{workerResult.skipped}</strong></span>
                <span>Failed: <strong className="text-red-600">{workerResult.failed}</strong></span>
                <span>Rescheduled: <strong className="text-amber-600">{workerResult.rescheduled}</strong></span>
              </div>
            )}
          </div>
        </details>
      )}

      {/* Filter Chips and Notifications List */}
      <Card className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          {/* Status chips */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
            {[
              { id: '', label: 'All' },
              { id: 'sent', label: 'Sent' },
              { id: 'held', label: 'Held' },
              { id: 'skipped', label: 'Skipped' },
              { id: 'failed', label: 'Failed' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.id);
                  setPage(1);
                }}
                className={`min-h-11 px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Channel Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Channel:</span>
            <select
              value={channelFilter}
              onChange={(e) => {
                setChannelFilter(e.target.value);
                setPage(1);
              }}
              className="min-h-11 px-3 py-1 rounded-lg border border-gray-300 text-xs bg-white text-gray-800"
            >
              <option value="">All Channels</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
        </div>

        {loading ? (
          <Skeleton variant="list" count={4} />
        ) : (
          <ResponsiveList
            items={notifications}
            emptyText="No notifications found in this filter."
            headers={['Channel', 'Subject & Message', 'Event', 'Status', 'Date']}
            renderCard={(job) => {
              const isHeld = job.heldForQuietHours && job.status === 'pending';
              const createdDate = new Date(job.createdAt).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              });
              return (
                <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-2 text-sm">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${job.channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                        {job.channel}
                      </span>
                      <h3 className="font-bold text-gray-900 text-sm truncate">{job.title}</h3>
                    </div>
                    <StatusBadge status={job.status} />
                  </div>

                  <p className="text-xs text-gray-600 whitespace-pre-line leading-relaxed break-words">
                    {job.message}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1 border-t border-gray-100">
                    <span>{createdDate} IST</span>
                    {isHeld && (
                      <span className="text-amber-600 font-semibold flex items-center gap-1">
                        <Icon name="clock" className="w-3.5 h-3.5" />
                        Will be sent at 9:00 AM IST
                      </span>
                    )}
                  </div>
                </div>
              );
            }}
            renderRow={(job) => {
              const isHeld = job.heldForQuietHours && job.status === 'pending';
              const createdDate = new Date(job.createdAt).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              });
              return (
                <tr className="hover:bg-gray-50 text-xs">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${job.channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                      {job.channel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-gray-900">{job.title}</p>
                    <p className="text-gray-600 line-clamp-2">{job.message}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono whitespace-nowrap">{job.event}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={job.status} />
                    {isHeld && <p className="text-[10px] text-amber-600 mt-1">Quiet hours</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{createdDate} IST</td>
                </tr>
              );
            }}
          />
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex justify-between items-center pt-4 border-t border-gray-100 text-xs text-gray-600">
            <span>
              Page {page} of {pagination.pages} ({pagination.total} total)
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="text-xs min-h-9 px-3"
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= pagination.pages}
                onClick={() => setPage(p => p + 1)}
                className="text-xs min-h-9 px-3"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
