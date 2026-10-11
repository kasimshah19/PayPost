import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function NotFound() {
  useDocumentTitle('Page Not Found');
  const { user } = useAuth();

  const destination = user?.role === 'brand' ? '/brand' : user?.role === 'creator' ? '/creator' : '/';
  const label = user?.role === 'brand' ? 'Go to Brand Dashboard' : user?.role === 'creator' ? 'Go to Creator Dashboard' : 'Go Home';

  return (
    <div className="min-h-[70dvh] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm max-w-md w-full p-8 text-center space-y-4">
        <p className="text-5xl font-extrabold text-indigo-600">404</p>
        <h1 className="text-2xl font-bold text-gray-900">Page not found</h1>
        <p className="text-sm text-gray-500">
          The page you are looking for doesn't exist or has been moved.
        </p>
        <div className="pt-2">
          <Link to={destination}>
            <Button variant="primary" fullWidth>
              {label}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
