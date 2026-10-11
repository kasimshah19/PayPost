import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import CampaignForm from '../components/CampaignForm';
import Spinner from '../components/Spinner';

function EditCampaign() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    } catch (err) {
      setError('Failed to load campaign');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (payload, setErrors) => {
    try {
      await api.patch(`/campaigns/${id}`, payload);
      navigate(`/brand/campaigns/${id}`);
    } catch (err) {
      if (err.response?.data?.errors) {
        const errMap = {};
        err.response.data.errors.forEach(e => {
          const key = e.field || (e.path && e.path.length ? e.path[0] : null);
          if (key) errMap[key] = e.message;
        });
        setErrors(errMap);
      } else {
        setErrors({ form: err.response?.data?.message || 'Failed to update campaign' });
      }
    }
  };

  if (loading) return <Spinner />;
  if (error) return <div className="p-8 text-red-500">{error}</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Edit Campaign: {campaign.title}</h1>
      <CampaignForm 
        initialData={campaign}
        editRules={campaign.editRules}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/brand/campaigns/${id}`)}
      />
    </div>
  );
}

export default EditCampaign;
