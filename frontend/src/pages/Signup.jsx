import React, { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Icon } from '../components/ui/Icon';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function Signup() {
  useDocumentTitle('Create Account');
  const { signup, user } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'creator'
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (user) {
    return <Navigate to={`/${user.role}`} replace />;
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRoleSelect = (role) => {
    setFormData({ ...formData, role });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await signup(formData);
      navigate(`/${data.user.role}`);
    } catch (err) {
      if (err.response && err.response.data) {
        const msg = err.response.data.message || (Array.isArray(err.response.data.errors) ? err.response.data.errors[0]?.message : null);
        setError(msg || 'Registration failed');
      } else {
        setError('Something went wrong during sign up');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="py-6 sm:py-12 flex justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Join PayPost as a Creator or Brand
          </p>
        </div>

        <Card>
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            {/* Role Selection: Two big tappable cards */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                I want to join as:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleRoleSelect('creator')}
                  className={`min-h-16 p-3 rounded-xl border-2 text-left transition-all flex flex-col justify-between ${
                    formData.role === 'creator'
                      ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-1 ring-indigo-600'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <span className="text-lg">📱</span>
                  <div>
                    <p className="text-sm font-bold">Creator</p>
                    <p className="text-xs text-gray-500">Get paid for UGC</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleRoleSelect('brand')}
                  className={`min-h-16 p-3 rounded-xl border-2 text-left transition-all flex flex-col justify-between ${
                    formData.role === 'brand'
                      ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-1 ring-indigo-600'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <span className="text-lg">🏢</span>
                  <div>
                    <p className="text-sm font-bold">Brand</p>
                    <p className="text-xs text-gray-500">Hire creators</p>
                  </div>
                </button>
              </div>
            </div>

            <Input
              id="signup-name"
              label="Full Name"
              name="name"
              type="text"
              required
              autoComplete="name"
              enterKeyHint="next"
              value={formData.name}
              onChange={handleChange}
              placeholder="Your full name"
            />

            <Input
              id="signup-email"
              label="Email address"
              name="email"
              type="email"
              required
              autoComplete="email"
              enterKeyHint="next"
              value={formData.email}
              onChange={handleChange}
              placeholder="you@example.com"
            />

            <div className="w-full">
              <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700 mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="signup-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  enterKeyHint="next"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="At least 6 characters"
                  className="w-full min-h-11 px-3 py-2 text-base rounded-lg border border-gray-300 bg-white text-gray-900 pr-12 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3 min-w-11 min-h-11 flex items-center justify-center text-gray-500 hover:text-gray-700"
                >
                  <Icon name={showPassword ? 'eye-off' : 'eye'} className="w-5 h-5" />
                </button>
              </div>
            </div>

            <Input
              id="signup-phone"
              label="Phone number (Optional)"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              enterKeyHint="done"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+919876543210"
              hint="Format: +91 followed by 10 digits"
            />

            {error && (
              <div
                className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200"
                role="alert"
                aria-live="polite"
              >
                {typeof error === 'string' ? error : JSON.stringify(error)}
              </div>
            )}

            <div className="pt-2">
              <Button type="submit" variant="primary" fullWidth loading={loading}>
                Create Account
              </Button>
            </div>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
              Sign In
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
