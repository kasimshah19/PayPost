import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from './ui/Button';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[70dvh] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm max-w-md w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto text-xl font-bold">
              !
            </div>
            <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
            <p className="text-sm text-gray-600">
              An unexpected error occurred. You can reload this page or go back to the home screen.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button variant="primary" fullWidth onClick={this.handleReload}>
                Reload page
              </Button>
              <Link to="/" className="w-full">
                <Button variant="secondary" fullWidth>
                  Go Home
                </Button>
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
