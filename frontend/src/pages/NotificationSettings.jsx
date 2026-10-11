import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../api/axios';
import Spinner from '../components/Spinner';

const NotificationSettings = () => {
  const { user, updateUser } = useContext(AuthContext);

  const [emailPref, setEmailPref] = useState(true);
  const [whatsappPref, setWhatsappPref] = useState(true);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const [statusData, setStatusData] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Indian mobile validation pattern: 10 digits or +91 followed by 10 digits (starting 6-9)
  const phonePattern = /^(\+91)?[6-9]\d{9}$/;

  useEffect(() => {
    if (user) {
      setEmailPref(user.notificationPrefs?.email !== false);
      setWhatsappPref(user.notificationPrefs?.whatsapp !== false);
      setPhone(user.phone || '');
    }
  }, [user]);

  const fetchStatus = async () => {
    try {
      const res = await api.get('/notifications/status');
      setStatusData(res.data);
    } catch (err) {
      console.error('Failed to fetch notification status:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

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
    setSuccessMsg('');
    setErrorMsg('');

    if (phone !== '' && !phonePattern.test(phone)) {
      setErrorMsg('Please enter a valid Indian phone number before saving');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        phone: phone, // empty string clears phone per API spec
        notificationPrefs: {
          email: Boolean(emailPref),
          whatsapp: Boolean(whatsappPref)
        }
      };

      const res = await api.patch('/auth/preferences', payload);
      if (res.data.user) {
        updateUser(res.data.user);
      }
      setSuccessMsg('Notification preferences saved successfully!');
      fetchStatus();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to update preferences');
    } finally {
      setSaving(false);
    }
  };

  const hasPhoneSaved = Boolean(user?.phone && user.phone.trim());
  const showPhoneWarning = whatsappPref && !hasPhoneSaved;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Notification Settings</h1>
        <p className="text-sm text-gray-600 mt-1">
          Manage how and when you receive updates regarding campaigns, submissions, and payments.
        </p>
      </div>

      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-sm flex items-center gap-2">
          <svg className="w-5 h-5 text-rose-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
        <form onSubmit={handleSave} className="space-y-6">
          {/* Channel Preferences */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800 border-b pb-2">Channels</h2>

            {/* Email Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
              <div>
                <span className="font-medium text-gray-900 block">Email Notifications</span>
                <span className="text-xs text-gray-500">
                  Transactional updates sent to {user?.email}
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailPref}
                  onChange={(e) => setEmailPref(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {/* WhatsApp Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
              <div>
                <span className="font-medium text-gray-900 block">WhatsApp Notifications</span>
                <span className="text-xs text-gray-500">
                  Real-time alerts sent directly to your phone number
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={whatsappPref}
                  onChange={(e) => setWhatsappPref(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>
          </div>

          {/* Phone Number Input */}
          <div className="space-y-2 border-t pt-4">
            <label className="block text-sm font-semibold text-gray-800">
              Indian Mobile Number (for WhatsApp)
            </label>
            <div className="max-w-md">
              <input
                type="text"
                value={phone}
                onChange={handlePhoneChange}
                placeholder="e.g. 9876543210 or +919876543210"
                className={`w-full px-3.5 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
                  phoneError ? 'border-rose-400 focus:ring-rose-200' : 'border-gray-300 focus:ring-indigo-200'
                }`}
              />
              {phoneError && (
                <p className="text-xs text-rose-600 mt-1">{phoneError}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Leave empty to remove your phone number.
              </p>
            </div>

            {showPhoneWarning && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs flex items-center gap-2 mt-2">
                <svg className="w-4 h-4 text-amber-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>Add your phone number to receive WhatsApp messages</span>
              </div>
            )}
          </div>

          {/* Opt-out note */}
          <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-600 border border-gray-100">
            <strong>Note:</strong> If you turn a channel off, you will not get any message on it, including payment updates.
          </div>

          <button
            type="submit"
            disabled={saving || Boolean(phoneError)}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Spinner />}
            <span>Save Preferences</span>
          </button>
        </form>

        {/* Quiet Hours Status Card */}
        <div className="border-t pt-6">
          <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="font-semibold text-gray-900 text-sm">Quiet Hours Policy (9:00 PM – 9:00 AM IST)</h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Messages are not sent between 9:00 PM and 9:00 AM IST. They are held and sent at 9:00 AM.
            </p>

            <div className="pt-2 border-t border-indigo-100/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div>
                <span className="text-gray-500">Current Time (IST): </span>
                <span className="font-mono font-medium text-gray-800">
                  {statusData?.nowIst || 'Loading...'}
                </span>
              </div>

              <div>
                {statusData?.quietHoursActive ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    Quiet hours are active now. Next messages go out at 9:00 AM IST
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Messages are being sent normally
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationSettings;
