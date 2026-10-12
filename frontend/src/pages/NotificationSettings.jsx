import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Icon } from '../components/ui/Icon';

export default function NotificationSettings() {
  useDocumentTitle('Notification Settings');
  const { user, updateUser } = useAuth();
  const toast = useToast();

  const [emailPref, setEmailPref] = useState(true);
  const [whatsappPref, setWhatsappPref] = useState(true);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusInfo, setStatusInfo] = useState(null);

  // Indian mobile validation pattern: 10 digits or +91 followed by 10 digits
  const phonePattern = /^(\+91)?[6-9]\d{9}$/;

  useEffect(() => {
    if (user) {
      setEmailPref(user.notificationPrefs?.email !== false);
      setWhatsappPref(user.notificationPrefs?.whatsapp !== false);
      setPhone(user.phone || '');
    }
    api.get('/notifications/status')
      .then(res => setStatusInfo(res.data))
      .catch(() => {});
  }, [user]);

  const handlePhoneChange = (e) => {
    const val = e.target.value.trim();
    setPhone(val);

    if (val === '') {
      setPhoneError('');
      return;
    }

    if (!phonePattern.test(val)) {
      setPhoneError('Enter a valid 10-digit Indian mobile number (e.g. 9876543210 or +919876543210)');
    } else {
      setPhoneError('');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (phone !== '' && !phonePattern.test(phone)) {
      toast.error('Please enter a valid Indian phone number before saving');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        phone: phone,
        notificationPrefs: {
          email: Boolean(emailPref),
          whatsapp: Boolean(whatsappPref)
        }
      };

      const res = await api.patch('/auth/preferences', payload);
      if (res.data.user) {
        updateUser(res.data.user);
      }
      toast.success('Notification preferences saved successfully!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update preferences');
    } finally {
      setSaving(false);
    }
  };

  const hasPhoneSaved = Boolean(user?.phone && user.phone.trim());
  const showPhoneWarning = whatsappPref && !hasPhoneSaved;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Notification Settings"
        subtitle="Manage communication channels and quiet hours preferences"
      />

      <Card>
        <form onSubmit={handleSave} className="space-y-6" noValidate>
          {/* Channels Section */}
          <div className="space-y-4">
            <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">
              Delivery Channels
            </h2>

            {/* Email Toggle: Large 44px touch target row */}
            <label className="min-h-14 flex items-center justify-between p-3.5 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
              <div className="pr-4">
                <span className="font-semibold text-gray-900 text-sm block">Email Notifications</span>
                <span className="text-xs text-gray-500">
                  Transactional updates sent to {user?.email}
                </span>
              </div>
              <input
                type="checkbox"
                checked={emailPref}
                onChange={(e) => setEmailPref(e.target.checked)}
                className="w-6 h-6 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 min-h-6 min-w-6"
              />
            </label>

            {/* WhatsApp Toggle: Large 44px touch target row */}
            <label className="min-h-14 flex items-center justify-between p-3.5 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
              <div className="pr-4">
                <span className="font-semibold text-gray-900 text-sm block">WhatsApp Alerts</span>
                <span className="text-xs text-gray-500">
                  Instant mobile notifications sent to your registered phone
                </span>
              </div>
              <input
                type="checkbox"
                checked={whatsappPref}
                onChange={(e) => setWhatsappPref(e.target.checked)}
                className="w-6 h-6 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 min-h-6 min-w-6"
              />
            </label>
          </div>

          {/* Phone Number Input */}
          <div className="space-y-2 border-t border-gray-100 pt-4">
            <Input
              id="notif-settings-phone"
              label="Indian Mobile Number (for WhatsApp)"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={handlePhoneChange}
              placeholder="+919876543210"
              hint="Format: 10 digits or +91 followed by 10 digits"
              error={phoneError}
            />

            {showPhoneWarning && (
              <div className="p-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs flex items-center gap-2">
                <Icon name="alert-circle" className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  WhatsApp is enabled, but no mobile number is saved. Messages will be skipped until you add a phone number.
                </span>
              </div>
            )}
          </div>

          {/* Quiet Hours Explainer & Live Status */}
          <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl text-xs text-indigo-900 space-y-2">
            <p className="font-bold flex items-center gap-1.5 text-sm">
              <Icon name="clock" className="w-4 h-4 text-indigo-600" />
              Quiet Hours Policy (9:00 PM - 9:00 AM IST)
            </p>
            <p className="text-indigo-800">
              Messages are not sent between 9:00 PM and 9:00 AM IST. They are held and sent at 9:00 AM IST.
            </p>
            {statusInfo && (
              <div className="pt-2 border-t border-indigo-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] font-medium">
                <span>Current IST: <strong className="font-mono text-indigo-950">{statusInfo.nowIst || 'N/A'}</strong></span>
                <span className={statusInfo.quietHoursActive ? 'text-amber-800 font-bold' : 'text-emerald-800 font-bold'}>
                  {statusInfo.quietHoursActive
                    ? 'Quiet hours are active now. Next messages go out at 9:00 AM IST.'
                    : 'Messages are being sent normally.'}
                </span>
              </div>
            )}
            <p className="text-[11px] text-gray-500 italic pt-1">
              Note: If you turn a channel off, you will not get any message on it, including payment updates.
            </p>
          </div>

          <div className="pt-2 flex justify-end">
            <Button type="submit" variant="primary" loading={saving} fullWidth className="sm:w-auto">
              Save Preferences
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
