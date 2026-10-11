import React, { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Icon } from '../components/ui/Icon';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function Login() {
  useDocumentTitle('Sign In');
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (user) {
    return <Navigate to={`/${user.role}`} replace />;
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await login(formData);
      navigate(`/${data.user.role}`);
    } catch (err) {
      if (err.response && err.response.data) {
        setError(err.response.data.message);
      } else {
        setError('Something went wrong. Please check your credentials.');
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
            Sign in to your account
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Welcome back to PayPost
          </p>
        </div>

        <Card>
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <Input
              id="login-email"
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
              <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  enterKeyHint="done"
                  value={formData.password}
                  onChange={handleChange}
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

            {error && (
              <div
                className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200"
                role="alert"
                aria-live="polite"
              >
                {error}
              </div>
            )}

            <div className="pt-2">
              <Button type="submit" variant="primary" fullWidth loading={loading}>
                Sign In
              </Button>
            </div>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            Don't have an account?{' '}
            <Link to="/signup" className="font-semibold text-indigo-600 hover:text-indigo-500">
              Create an account
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
