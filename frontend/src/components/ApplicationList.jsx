import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import StatusBadge from './StatusBadge';
import Spinner from './Spinner';

function ApplicationList({ campaignId, onStatusChange }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchApplications();
  }, [campaignId]);

  const fetchApplications = async () => {
    try {
      const res = await api.get(`/campaigns/${campaignId}/applications`);
      setApplications(res.data);
    } catch (err) {
      setError('Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (appId, action, data = {}) => {
    setActionLoading(true);
    try {
      await api.post(`/applications/${appId}/${action}`, data);
      await fetchApplications();
      if (onStatusChange) onStatusChange();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to perform action');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <div className="text-red-500 p-4">{error}</div>;
  if (applications.length === 0) return <div className="p-4 text-gray-500">No applications yet.</div>;

  return (
    <div className="space-y-4">
      {applications.map(app => (
        <div key={app._id} className="border rounded-lg p-4 bg-white shadow-sm flex flex-col md:flex-row justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-bold">{app.creator?.name}</span>
              <StatusBadge status={app.status} />
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{app.pitch || <span className="italic text-gray-400">No pitch provided</span>}</p>
            <p className="text-xs text-gray-500 mt-2">Applied on {new Date(app.createdAt).toLocaleDateString()}</p>
          </div>
          
          <div className="flex gap-2 shrink-0">
            {app.status === 'applied' && (
              <>
                <button 
                  onClick={() => handleAction(app._id, 'approve')}
                  disabled={actionLoading}
                  className="px-3 py-1 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Approve
                </button>
                <button 
                  onClick={() => {
                    const note = prompt("Reason for rejection (optional):");
                    if (note !== null) {
                      handleAction(app._id, 'reject', { note });
                    }
                  }}
                  disabled={actionLoading}
                  className="px-3 py-1 bg-red-100 text-red-700 text-sm font-medium rounded hover:bg-red-200 disabled:opacity-50"
                >
                  Reject
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default ApplicationList;
