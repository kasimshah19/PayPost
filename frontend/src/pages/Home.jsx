import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function Home() {
  useDocumentTitle('Fair Creator Campaigns & Milestone Payouts');
  const { user } = useAuth();

  return (
    <div className="py-6 sm:py-12 space-y-12">
      {/* Hero Section */}
      <section className="text-center max-w-3xl mx-auto space-y-4 sm:space-y-6">
        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
          Transparent UGC Marketplace
        </span>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight">
          Fair creator campaigns, locked budgets, instant payouts.
        </h1>
        <p className="text-base sm:text-lg text-gray-600 max-w-xl mx-auto leading-relaxed">
          Brands get verified UGC content with guaranteed slot budgets. Creators see net take-home earnings upfront and get paid directly to their UPI wallet.
        </p>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          {!user ? (
            <>
              <Link to="/signup" className="w-full sm:w-auto">
                <Button variant="primary" fullWidth size="lg">
                  Get Started Free
                </Button>
              </Link>
              <Link to="/login" className="w-full sm:w-auto">
                <Button variant="secondary" fullWidth size="lg">
                  Log In
                </Button>
              </Link>
            </>
          ) : (
            <Link to={user.role === 'brand' ? '/brand' : '/creator'} className="w-full sm:w-auto">
              <Button variant="primary" fullWidth size="lg">
                Go to Dashboard
              </Button>
            </Link>
          )}
        </div>
      </section>

      {/* Two-column "How it works" stacked on mobile */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* For Brands */}
        <Card className="flex flex-col justify-between border-indigo-100 bg-gradient-to-br from-white to-indigo-50/30">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 text-indigo-600 font-bold text-lg">
              <span className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-sm">
                🏢
              </span>
              <span>For Brands</span>
            </div>
            <p className="text-sm text-gray-600">
              Launch campaigns with transparent fixed budgets and approve creator posts with total financial control.
            </p>
            <ol className="space-y-2.5 text-sm text-gray-700 list-decimal list-inside">
              <li><strong className="text-gray-900">Create campaign:</strong> Set budget, slots, guidelines and deadlines.</li>
              <li><strong className="text-gray-900">Approve creators:</strong> Fee is locked in escrow immediately.</li>
              <li><strong className="text-gray-900">Approve work and pay:</strong> One-tap approval releases net payout into creator's wallet.</li>
            </ol>
          </div>
          <div className="pt-6">
            <Link to={user?.role === 'brand' ? '/brand/campaigns/new' : '/signup'}>
              <Button variant="secondary" fullWidth>
                Post a Campaign
              </Button>
            </Link>
          </div>
        </Card>

        {/* For Creators */}
        <Card className="flex flex-col justify-between border-emerald-100 bg-gradient-to-br from-white to-emerald-50/30">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 text-emerald-700 font-bold text-lg">
              <span className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-sm">
                📱
              </span>
              <span>For Creators</span>
            </div>
            <p className="text-sm text-gray-600">
              Apply to active brand campaigns, submit your Instagram content, and withdraw earnings directly to UPI.
            </p>
            <ol className="space-y-2.5 text-sm text-gray-700 list-decimal list-inside">
              <li><strong className="text-gray-900">Apply with 1 tap:</strong> Know your estimated net take-home pay upfront.</li>
              <li><strong className="text-gray-900">Submit your post:</strong> Submit your live Instagram link on time.</li>
              <li><strong className="text-gray-900">Withdraw to UPI:</strong> Instant wallet credits with complete ledger breakdown.</li>
            </ol>
          </div>
          <div className="pt-6">
            <Link to={user?.role === 'creator' ? '/creator' : '/signup'}>
              <Button variant="secondary" fullWidth>
                Browse Campaigns
              </Button>
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
