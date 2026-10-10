import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import StatusBadge from './StatusBadge';
import Spinner from './Spinner';
import MoneyText from './MoneyText';

function CreatorApplicationList() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      const res = await api.get('/applications/mine');
      setApplications(res.data);
    } catch (err) {
      setError('Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async (appId) => {
    if (!window.confirm('Are you sure you want to withdraw this application?')) return;
    
    setActionLoading(true);
    try {
      await api.post(`/applications/${appId}/withdraw`);
      await fetchApplications();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to withdraw application');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <div className="text-red-500">{error}</div>;
  if (applications.length === 0) return <div className="text-gray-500">You haven't applied to any campaigns yet.</div>;

  return (
    <div className="space-y-4">
      {applications.map(app => (
        <div key={app._id} className="border rounded-lg p-4 bg-white shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div>
              <Link to={`/creator/campaigns/${app.campaign?._id}`} className="font-bold text-indigo-600 hover:underline">
                {app.campaign?.title || 'Unknown Campaign'}
              </Link>
              <div className="text-sm text-gray-500 mb-2">{app.campaign?.brand?.name}</div>
            </div>
            <StatusBadge status={app.status} />
          </div>
          
          <div className="flex justify-between items-end mt-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Fee</p>
              <p className="font-semibold text-gray-800"><MoneyText paise={app.feePaise} /></p>
            </div>
            
            {['applied', 'approved'].includes(app.status) && (
              <button 
                onClick={() => handleWithdraw(app._id)}
                disabled={actionLoading}
                className="px-3 py-1 bg-gray-100 text-gray-700 text-sm font-medium rounded hover:bg-gray-200 disabled:opacity-50"
              >
                Withdraw
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default CreatorApplicationList;
