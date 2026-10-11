import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { rupeesToPaise, paiseToRupees } from '../utils/money';
import { toInputValue, fromInputValue } from '../utils/date';
import MoneyText from './MoneyText';
import FeeBreakdown from './FeeBreakdown';
import { Button } from './ui/Button';
import { Input, Textarea } from './ui/Input';
import { Card } from './ui/Card';

export default function CampaignForm({ initialData, onSubmit, onCancel, editRules = null, copyInfo = null }) {
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title || '',
        description: initialData.description || '',
        budgetRupees: initialData.budgetPaise ? paiseToRupees(initialData.budgetPaise) : '',
        perCreatorFeeRupees: initialData.perCreatorFeePaise ? paiseToRupees(initialData.perCreatorFeePaise) : '',
        slots: initialData.slots || '',
        applicationDeadline: initialData.applicationDeadline ? toInputValue(initialData.applicationDeadline) : '',
        submissionDeadline: initialData.submissionDeadline ? toInputValue(initialData.submissionDeadline) : ''
      });
    }
  }, [initialData]);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
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

    setIsSubmitting(true);
    try {
      await onSubmit(payload, setErrors);
    } finally {
      setIsSubmitting(false);
    }
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
      } catch {
        setFeePreview(null);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [feePaise]);

  return (
    <Card className="max-w-2xl mx-auto">
      {copyInfo && (
        <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 p-4 rounded-xl mb-6 text-sm flex items-start gap-2">
          <span className="text-lg">📋</span>
          <div>
            <strong>Copied from {copyInfo}.</strong> Choose new application and submission dates.
          </div>
        </div>
      )}

      {errors.form && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 mb-6 text-sm" role="alert">
          {errors.form}
        </div>
      )}
      
      {editRules?.hasApprovals && (
        <div className="bg-blue-50 text-blue-900 border border-blue-200 p-4 rounded-xl mb-6 text-sm">
          <strong>Note:</strong> Since this campaign has approved creators, budget cannot go below ₹{paiseToRupees(editRules.minBudgetPaise)}, 
          slots cannot be less than {editRules.minSlots}, deadlines can only be extended, and fee changes will only apply to future approvals.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <Input
          id="camp-title"
          label="Campaign Title"
          name="title"
          required
          value={formData.title}
          onChange={handleChange}
          placeholder="e.g. Diwali Fashion Reels 2026"
          error={errors.title}
        />

        <Textarea
          id="camp-description"
          label="Campaign Brief / Guidelines"
          name="description"
          rows={4}
          value={formData.description}
          onChange={handleChange}
          placeholder="Specify content requirements, do's & don'ts, hashtags, tags..."
          error={errors.description}
        />

        {/* Money Fields: Paired on md */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            id="camp-budget"
            label="Total Campaign Budget (₹)"
            name="budgetRupees"
            type="number"
            inputMode="decimal"
            required
            value={formData.budgetRupees}
            onChange={handleChange}
            placeholder="e.g. 50000"
            error={errors.budgetPaise}
          />

          <Input
            id="camp-fee"
            label="Fee Per Creator (₹)"
            name="perCreatorFeeRupees"
            type="number"
            inputMode="decimal"
            required
            value={formData.perCreatorFeeRupees}
            onChange={handleChange}
            placeholder="e.g. 10000"
            error={errors.perCreatorFeePaise}
          />

          {feePreview && (
            <div className="col-span-1 md:col-span-2 bg-indigo-50/70 border border-indigo-100 rounded-xl p-3 text-xs text-gray-700">
              <p className="font-semibold text-gray-800">
                You pay <MoneyText paise={feePreview.grossFeePaise} /> per creator. Platform fee, GST and TDS are deducted on the creator's side.
              </p>
              <div className="mt-2">
                <FeeBreakdown breakdown={feePreview} compact={true} isCreator={false} showExpandToggle={true} />
              </div>
            </div>
          )}
        </div>

        <div>
          <Input
            id="camp-slots"
            label="Creator Slots"
            name="slots"
            type="number"
            inputMode="numeric"
            required
            min="1"
            value={formData.slots}
            onChange={handleChange}
            placeholder="e.g. 5"
            error={errors.slots}
          />
        </div>

        {budgetPaise > 0 && feePaise > 0 && (
          <div className={`text-sm p-3.5 rounded-xl border ${showWarning ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-emerald-50 text-emerald-900 border-emerald-200'}`}>
            With this budget you can fund up to <strong>{Math.min(slots, maxPossible)}</strong> of {slots} slots.
            {showWarning && ' (Warning: Budget is not enough for all slots)'}
          </div>
        )}

        {/* Deadlines: Paired on md */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            id="camp-app-deadline"
            label="Application Deadline (IST)"
            name="applicationDeadline"
            type="datetime-local"
            required
            value={formData.applicationDeadline}
            onChange={handleChange}
            error={errors.applicationDeadline}
          />

          <Input
            id="camp-sub-deadline"
            label="Submission Deadline (IST)"
            name="submissionDeadline"
            type="datetime-local"
            required
            value={formData.submissionDeadline}
            onChange={handleChange}
            error={errors.submissionDeadline}
          />
        </div>

        {/* Action Bar: Sticky on mobile above bottom tab bar and safe area */}
        <div className="pt-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sticky bottom-16 md:static bg-white/95 backdrop-blur-sm sm:bg-transparent pb-safe z-10 -mx-4 px-4 sm:mx-0 sm:px-0">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting} fullWidth className="sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isSubmitting} fullWidth className="sm:w-auto">
            Save Campaign
          </Button>
        </div>
      </form>
    </Card>
  );
}
