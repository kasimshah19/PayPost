import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import AppShell from './components/AppShell';
import ProtectedRoute from './routes/ProtectedRoute';
import { Skeleton } from './components/ui/Skeleton';

// Lazy-loaded pages for mobile network performance
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const BrandDashboard = lazy(() => import('./pages/BrandDashboard'));
const CreateCampaign = lazy(() => import('./pages/CreateCampaign'));
const CampaignDetail = lazy(() => import('./pages/CampaignDetail'));
const EditCampaign = lazy(() => import('./pages/EditCampaign'));
const CreatorDashboard = lazy(() => import('./pages/CreatorDashboard'));
const CreatorCampaignDetail = lazy(() => import('./pages/CreatorCampaignDetail'));
const CreatorWallet = lazy(() => import('./pages/CreatorWallet'));
const Notifications = lazy(() => import('./pages/Notifications'));
const NotificationSettings = lazy(() => import('./pages/NotificationSettings'));
const NotFound = lazy(() => import('./pages/NotFound'));

function PageFallback() {
  return (
    <div className="space-y-4 py-4" aria-busy="true" aria-label="Loading page content">
      <Skeleton variant="card" className="h-28" />
      <Skeleton variant="stat" />
      <Skeleton variant="list" count={4} />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <ErrorBoundary>
            <AppShell>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Signup />} />

                  {/* Brand Routes */}
                  <Route
                    path="/brand"
                    element={
                      <ProtectedRoute allowedRoles={['brand']}>
                        <BrandDashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/brand/campaigns/new"
                    element={
                      <ProtectedRoute allowedRoles={['brand']}>
                        <CreateCampaign />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/brand/campaigns/:id"
                    element={
                      <ProtectedRoute allowedRoles={['brand']}>
                        <CampaignDetail />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/brand/campaigns/:id/edit"
                    element={
                      <ProtectedRoute allowedRoles={['brand']}>
                        <EditCampaign />
                      </ProtectedRoute>
                    }
                  />

                  {/* Creator Routes */}
                  <Route
                    path="/creator"
                    element={
                      <ProtectedRoute allowedRoles={['creator']}>
                        <CreatorDashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/creator/campaigns/:id"
                    element={
                      <ProtectedRoute allowedRoles={['creator']}>
                        <CreatorCampaignDetail />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/creator/wallet"
                    element={
                      <ProtectedRoute allowedRoles={['creator']}>
                        <CreatorWallet />
                      </ProtectedRoute>
                    }
                  />

                  {/* Notification Routes (Both Roles) */}
                  <Route
                    path="/notifications"
                    element={
                      <ProtectedRoute allowedRoles={['brand', 'creator']}>
                        <Notifications />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings/notifications"
                    element={
                      <ProtectedRoute allowedRoles={['brand', 'creator']}>
                        <NotificationSettings />
                      </ProtectedRoute>
                    }
                  />

                  {/* Catch-all 404 Route */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </AppShell>
          </ErrorBoundary>
        </Router>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;

