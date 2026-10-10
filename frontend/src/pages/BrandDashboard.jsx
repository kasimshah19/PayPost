import { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../api/axios';

function BrandDashboard() {
  const { user } = useContext(AuthContext);
  const [pingResult, setPingResult] = useState('');

  const testApi = async () => {
    try {
      const res = await api.get('/brand/ping');
      setPingResult(JSON.stringify(res.data));
    } catch (err) {
      setPingResult(err.response?.data?.message || err.message);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Brand Dashboard</h1>
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-8">
        <p className="text-lg">Welcome, <span className="font-semibold">{user.name}</span></p>
        <span className="inline-block mt-2 text-xs bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full uppercase font-bold tracking-wider">
          {user.role}
        </span>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="text-xl font-semibold mb-4">Test API Access</h2>
        <button onClick={testApi} className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-md transition-colors">
          Call /api/brand/ping
        </button>
        {pingResult && (
          <div className="mt-4 p-4 bg-gray-50 rounded-md border text-sm font-mono text-gray-700">
            {pingResult}
          </div>
        )}
      </div>
    </div>
  );
}

export default BrandDashboard;
