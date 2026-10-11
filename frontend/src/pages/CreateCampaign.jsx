import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import CampaignForm from '../components/CampaignForm';
import { PageHeader } from '../components/ui/PageHeader';
import { useToast } from '../components/ui/Toast';
import { Skeleton } from '../components/ui/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function CreateCampaign() {
  useDocumentTitle('Create Campaign');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const duplicateId = searchParams.get('duplicate');
  const [initialData, setInitialData] = useState(null);
  const [copyInfo, setCopyInfo] = useState(null);
  const [loadingDuplicate, setLoadingDuplicate] = useState(Boolean(duplicateId));

  useEffect(() => {
    if (duplicateId) {
      api.get(`/campaigns/${duplicateId}`)
        .then((res) => {
          const original = res.data;
          setCopyInfo(original.title);
          setInitialData({
            title: `${original.title} (copy)`,
            description: original.description,
            budgetPaise: original.budgetPaise,
            perCreatorFeePaise: original.perCreatorFeePaise,
            slots: original.slots,
            // Dates left EMPTY as per Rule E4
            applicationDeadline: '',
            submissionDeadline: ''
          });
        })
        .catch(() => {
          toast.error('Could not copy campaign. Either it does not exist or you do not have permission.');
        })
        .finally(() => {
          setLoadingDuplicate(false);
        });
    }
  }, [duplicateId]);

  const handleSubmit = async (payload, setErrors) => {
    try {
      const res = await api.post('/campaigns', payload);
      toast.success('Campaign created successfully!');
      navigate(`/brand/campaigns/${res.data._id}`);
    } catch (err) {
      if (err.response?.data?.errors) {
        const errMap = {};
        err.response.data.errors.forEach((e) => {
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
    <div className="space-y-6">
      <PageHeader
        title={duplicateId ? 'Duplicate Campaign' : 'Create New Campaign'}
        subtitle="Set up clear guidelines, escrowed budget, and creator slots"
      />

      {loadingDuplicate ? (
        <Skeleton variant="card" count={1} />
      ) : (
        <CampaignForm
          initialData={initialData}
          copyInfo={copyInfo}
          onSubmit={handleSubmit}
          onCancel={() => navigate('/brand')}
        />
      )}
    </div>
  );
}
