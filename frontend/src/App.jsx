import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import BrandDashboard from './pages/BrandDashboard';
import CreateCampaign from './pages/CreateCampaign';
import CampaignDetail from './pages/CampaignDetail';
import EditCampaign from './pages/EditCampaign';
import CreatorDashboard from './pages/CreatorDashboard';
import CreatorCampaignDetail from './pages/CreatorCampaignDetail';
import CreatorWallet from './pages/CreatorWallet';
import Notifications from './pages/Notifications';
import NotificationSettings from './pages/NotificationSettings';
import ProtectedRoute from './routes/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-gray-50 text-gray-900">
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            
            {/* Brand Routes */}
            <Route path="/brand" element={<ProtectedRoute allowedRoles={['brand']}><BrandDashboard /></ProtectedRoute>} />
            <Route path="/brand/campaigns/new" element={<ProtectedRoute allowedRoles={['brand']}><CreateCampaign /></ProtectedRoute>} />
            <Route path="/brand/campaigns/:id" element={<ProtectedRoute allowedRoles={['brand']}><CampaignDetail /></ProtectedRoute>} />
            <Route path="/brand/campaigns/:id/edit" element={<ProtectedRoute allowedRoles={['brand']}><EditCampaign /></ProtectedRoute>} />

            {/* Creator Routes */}
            <Route path="/creator" element={<ProtectedRoute allowedRoles={['creator']}><CreatorDashboard /></ProtectedRoute>} />
            <Route path="/creator/campaigns/:id" element={<ProtectedRoute allowedRoles={['creator']}><CreatorCampaignDetail /></ProtectedRoute>} />
            <Route path="/creator/wallet" element={<ProtectedRoute allowedRoles={['creator']}><CreatorWallet /></ProtectedRoute>} />

            {/* Notification Routes (Both Roles) */}
            <Route path="/notifications" element={<ProtectedRoute allowedRoles={['brand', 'creator']}><Notifications /></ProtectedRoute>} />
            <Route path="/settings/notifications" element={<ProtectedRoute allowedRoles={['brand', 'creator']}><NotificationSettings /></ProtectedRoute>} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
