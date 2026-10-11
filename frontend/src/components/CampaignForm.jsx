import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { rupeesToPaise, paiseToRupees } from '../utils/money';
import { toInputValue, fromInputValue } from '../utils/date';
import MoneyText from './MoneyText';
import FeeBreakdown from './FeeBreakdown';

const CampaignForm = ({ initialData, onSubmit, onCancel, editRules = null }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    budgetRupees: '',
    perCreatorFeeRupees: '',
    slots: '',
    applicationDeadline: '',
    submissionDeadline: ''
  });

  const [errors, setErrors] = useState({});
  const [feePreview, setFeePreview] = useState(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title || '',
        description: initialData.description || '',
        budgetRupees: initialData.budgetPaise ? paiseToRupees(initialData.budgetPaise) : '',
        perCreatorFeeRupees: initialData.perCreatorFeePaise ? paiseToRupees(initialData.perCreatorFeePaise) : '',
        slots: initialData.slots || '',
        applicationDeadline: toInputValue(initialData.applicationDeadline),
        submissionDeadline: toInputValue(initialData.submissionDeadline)
      });
    }
  }, [initialData]);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrors({});
    
    const budgetPaise = rupeesToPaise(formData.budgetRupees);
    const perCreatorFeePaise = rupeesToPaise(formData.perCreatorFeeRupees);
    
    if (budgetPaise === null || perCreatorFeePaise === null) {
      setErrors({ form: 'Please enter valid numbers for money fields' });
      return;
    }

    if (perCreatorFeePaise > budgetPaise) {
      setErrors({ perCreatorFeePaise: 'Fee per creator cannot exceed total budget' });
      return;
    }

    const appIso = fromInputValue(formData.applicationDeadline);
    const subIso = fromInputValue(formData.submissionDeadline);

    if (!appIso) {
      setErrors({ applicationDeadline: 'Please select an application deadline' });
      return;
    }
    if (!subIso) {
      setErrors({ submissionDeadline: 'Please select a submission deadline' });
      return;
    }

    const appDate = new Date(appIso);
    const subDate = new Date(subIso);

    if (appDate <= new Date()) {
      setErrors({ applicationDeadline: 'Application deadline must be in the future' });
      return;
    }

    if (subDate <= appDate) {
      setErrors({ submissionDeadline: 'Submission deadline must be after application deadline' });
      return;
    }

    const payload = {
      title: formData.title,
      description: formData.description,
      budgetPaise,
      perCreatorFeePaise,
      slots: parseInt(formData.slots, 10),
      applicationDeadline: appIso,
      submissionDeadline: subIso
    };

    onSubmit(payload, setErrors);
  };

  const budgetPaise = rupeesToPaise(formData.budgetRupees) || 0;
  const feePaise = rupeesToPaise(formData.perCreatorFeeRupees) || 0;
  const slots = parseInt(formData.slots, 10) || 0;
  
  let maxPossible = 0;
  if (feePaise > 0) {
    maxPossible = Math.floor(budgetPaise / feePaise);
  }

  const showWarning = slots > 0 && maxPossible < slots;

  useEffect(() => {
    if (!feePaise || feePaise <= 0) {
      setFeePreview(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/fees/preview', { params: { feePaise } });
        setFeePreview(res.data);
      } catch (err) {
        setFeePreview(null);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [feePaise]);

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-sm border max-w-2xl">
      {errors.form && <div className="bg-red-100 text-red-700 p-3 rounded mb-6 text-sm">{errors.form}</div>}
      
      {editRules?.hasApprovals && (
        <div className="bg-blue-50 text-blue-800 p-4 rounded-md mb-6 text-sm">
          <strong>Note:</strong> Since this campaign has approved creators, budget cannot go below ₹{paiseToRupees(editRules.minBudgetPaise)}, 
          slots cannot be less than {editRules.minSlots}, deadlines can only be extended, and fee changes will only apply to future approvals.
        </div>
      )}

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Title</label>
          <input required type="text" name="title" value={formData.title} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border" />
          {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea name="description" value={formData.description} onChange={handleChange} rows="4" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"></textarea>
          {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Budget (₹)</label>
            <input required type="number" step="1" name="budgetRupees" value={formData.budgetRupees} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border" />
            {errors.budgetPaise && <p className="text-red-500 text-xs mt-1">{errors.budgetPaise}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Fee per creator (₹)</label>
            <input required type="number" step="1" name="perCreatorFeeRupees" value={formData.perCreatorFeeRupees} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border" />
            {errors.perCreatorFeePaise && <p className="text-red-500 text-xs mt-1">{errors.perCreatorFeePaise}</p>}
          </div>

          {feePreview && (
            <div className="col-span-2 bg-indigo-50/60 border border-indigo-100 rounded-lg p-3 text-xs text-gray-700">
              <p className="font-medium text-gray-800">
                You pay <MoneyText paise={feePreview.grossFeePaise} /> per creator. Platform fee, GST and TDS are deducted from the creator's side.
              </p>
              <div className="mt-2">
                <FeeBreakdown breakdown={feePreview} compact={true} isCreator={false} showExpandToggle={true} />
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Slots</label>
          <input required type="number" min="1" name="slots" value={formData.slots} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border" />
          {errors.slots && <p className="text-red-500 text-xs mt-1">{errors.slots}</p>}
        </div>

        {(budgetPaise > 0 && feePaise > 0) && (
          <div className={`text-sm p-3 rounded-md ${showWarning ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' : 'bg-green-50 text-green-800'}`}>
            With this budget you can fund up to <strong>{Math.min(slots, maxPossible)}</strong> of {slots} slots.
            {showWarning && ' (Warning: Budget is not enough for all slots)'}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Application Deadline</label>
            <input required type="datetime-local" name="applicationDeadline" value={formData.applicationDeadline} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border" />
            {errors.applicationDeadline && <p className="text-red-500 text-xs mt-1">{errors.applicationDeadline}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Submission Deadline</label>
            <input required type="datetime-local" name="submissionDeadline" value={formData.submissionDeadline} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border" />
            {errors.submissionDeadline && <p className="text-red-500 text-xs mt-1">{errors.submissionDeadline}</p>}
          </div>
        </div>
        <p className="text-xs text-gray-500">All times are in IST</p>

        <div className="flex justify-end gap-4 pt-4 border-t">
          <button type="button" onClick={onCancel} className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Save</button>
        </div>
      </div>
    </form>
  );
};

export default CampaignForm;
