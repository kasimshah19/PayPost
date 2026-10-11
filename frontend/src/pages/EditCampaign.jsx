import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import CampaignForm from '../components/CampaignForm';
import { PageHeader } from '../components/ui/PageHeader';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function EditCampaign() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useDocumentTitle(campaign ? `Edit: ${campaign.title}` : 'Edit Campaign');

  useEffect(() => {
    fetchCampaign();
  }, [id]);

  const fetchCampaign = async () => {
    try {
      const res = await api.get(`/campaigns/${id}`);
      if (res.data.status === 'cancelled') {
        navigate(`/brand/campaigns/${id}`);
        return;
      }
      setCampaign(res.data);
    } catch {
      setError('Failed to load campaign');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (payload, setErrors) => {
    try {
      await api.patch(`/campaigns/${id}`, payload);
      toast.success('Campaign updated successfully!');
      navigate(`/brand/campaigns/${id}`);
    } catch (err) {
      if (err.response?.data?.errors) {
        const errMap = {};
        err.response.data.errors.forEach((e) => {
          const key = e.field || (e.path && e.path.length ? e.path[0] : null);
          if (key) errMap[key] = e.message;
        });
        setErrors(errMap);
      } else {
        setErrors({ form: err.response?.data?.message || 'Failed to update campaign' });
      }
    }
  };

  if (loading) return <Skeleton variant="card" count={1} />;
  if (error) {
    return (
      <div className="p-6 bg-red-50 text-red-700 rounded-xl border border-red-200 text-center">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit: ${campaign.title}`}
        subtitle="Update campaign parameters, budget, slots, or extended deadlines"
      />

      <CampaignForm
        initialData={campaign}
        editRules={campaign.editRules}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/brand/campaigns/${id}`)}
      />
    </div>
  );
}
