import React from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import CampaignForm from '../components/CampaignForm';

function CreateCampaign() {
  const navigate = useNavigate();

  const handleSubmit = async (payload, setErrors) => {
    try {
      const res = await api.post('/campaigns', payload);
      navigate(`/brand/campaigns/${res.data._id}`);
    } catch (err) {
      if (err.response?.data?.errors) {
        const errMap = {};
        err.response.data.errors.forEach(e => {
          const key = e.field || (e.path && e.path.length ? e.path[0] : null);
          if (key) errMap[key] = e.message;
        });
        setErrors(errMap);
      } else {
        setErrors({ form: err.response?.data?.message || 'Failed to create campaign' });
      }
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Create New Campaign</h1>
      <CampaignForm 
        onSubmit={handleSubmit}
        onCancel={() => navigate('/brand')}
      />
    </div>
  );
}

export default CreateCampaign;
