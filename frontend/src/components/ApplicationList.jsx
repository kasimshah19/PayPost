import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import StatusBadge from './StatusBadge';
import { Skeleton } from './ui/Skeleton';
import { Button } from './ui/Button';
import { ResponsiveList } from './ui/ResponsiveList';
import ConfirmModal from './ConfirmModal';
import { formatDateIST } from '../utils/date';
import { useToast } from './ui/Toast';

export default function ApplicationList({ campaignId, onStatusChange, refreshKey }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const toast = useToast();

  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);

  useEffect(() => {
    fetchApplications();
  }, [campaignId, refreshKey]);

  const fetchApplications = async () => {
    try {
      const res = await api.get(`/campaigns/${campaignId}/applications`);
      setApplications(res.data.applications || []);
    } catch {
      setError('Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    setActionLoading(true);
    try {
      await api.post(`/applications/${approveTarget._id}/approve`);
      toast.success(`Approved ${approveTarget.creator?.name}`);
      setApproveTarget(null);
      await fetchApplications();
      if (onStatusChange) onStatusChange();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve application');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (reason) => {
    if (!rejectTarget) return;
    setActionLoading(true);
    try {
      await api.post(`/applications/${rejectTarget._id}/reject`, { note: reason });
      toast.info(`Rejected application from ${rejectTarget.creator?.name}`);
      setRejectTarget(null);
      await fetchApplications();
      if (onStatusChange) onStatusChange();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject application');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Skeleton variant="list" count={3} />;
  if (error) return <div className="text-red-600 p-4">{error}</div>;

  return (
    <div className="space-y-4">
      <ResponsiveList
        items={applications}
        emptyText="No applications submitted for this campaign yet."
        headers={['Creator', 'Pitch', 'Date', 'Status', 'Actions']}
        renderCard={(app) => (
          <div id={`item-${app._id}`} className="p-4 rounded-xl border border-gray-200 bg-white space-y-3">
            <div className="flex justify-between items-start gap-2">
              <div>
                <strong className="text-gray-900 text-sm block">{app.creator?.name}</strong>
                <span className="text-xs text-gray-500">{formatDateIST(app.createdAt)}</span>
              </div>
              <StatusBadge status={app.status} />
            </div>

            <p className="text-xs text-gray-600 line-clamp-3 whitespace-pre-wrap break-words italic">
              {app.pitch ? `"${app.pitch}"` : 'No pitch provided.'}
            </p>

            {app.status === 'applied' && (
              <div className="pt-2 border-t border-gray-100 flex gap-2">
                <Button
                  variant="primary"
                  onClick={() => setApproveTarget(app)}
                  disabled={actionLoading}
                  className="flex-1 text-xs min-h-11"
                >
                  Approve
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setRejectTarget(app)}
                  disabled={actionLoading}
                  className="flex-1 text-xs min-h-11 text-red-600 hover:text-red-700"
                >
                  Reject
                </Button>
              </div>
            )}
          </div>
        )}
        renderRow={(app) => (
          <tr id={`item-${app._id}`} className="hover:bg-gray-50 text-xs">
            <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">{app.creator?.name}</td>
            <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{app.pitch || 'None'}</td>
            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDateIST(app.createdAt)}</td>
            <td className="px-4 py-3 whitespace-nowrap">
              <StatusBadge status={app.status} />
            </td>
            <td className="px-4 py-3 whitespace-nowrap">
              {app.status === 'applied' && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setApproveTarget(app)}
                    disabled={actionLoading}
                    className="text-xs px-2.5 py-1 min-h-9"
                  >
                    Approve
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setRejectTarget(app)}
                    disabled={actionLoading}
                    className="text-xs px-2.5 py-1 min-h-9 text-red-600"
                  >
                    Reject
                  </Button>
                </div>
              )}
            </td>
          </tr>
        )}
      />

      <ConfirmModal
        isOpen={Boolean(approveTarget)}
        title="Approve Creator Application"
        message={
          approveTarget ? (
            <p>
              Approve <strong>{approveTarget.creator?.name}</strong>? Their slot fee will be locked from campaign budget.
            </p>
          ) : null
        }
        confirmText="Approve"
        destructive={false}
        loading={actionLoading}
        onConfirm={handleApprove}
        onCancel={() => setApproveTarget(null)}
      />

      <ConfirmModal
        isOpen={Boolean(rejectTarget)}
        title="Reject Application"
        message={
          rejectTarget ? (
            <p>
              Are you sure you want to reject the application from <strong>{rejectTarget.creator?.name}</strong>?
            </p>
          ) : null
        }
        confirmText="Reject Application"
        destructive={true}
        requiresReason={false}
        loading={actionLoading}
        onConfirm={handleReject}
        onCancel={() => setRejectTarget(null)}
      />
    </div>
  );
}
