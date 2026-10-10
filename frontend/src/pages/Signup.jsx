import { useState, useContext } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

function Signup() {
  const { signup, user } = useContext(AuthContext);
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'creator' // default
  });
  const [errors, setErrors] = useState(null);
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
    setErrors(null);
    setLoading(true);
    try {
      const data = await signup(formData);
      navigate(`/${data.user.role}`);
    } catch (err) {
      if (err.response && err.response.data) {
        setErrors(err.response.data.message || err.response.data.errors);
      } else {
        setErrors('Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">Create your account</h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            
            {/* Role Selection */}
            <div className="flex gap-4">
              <label className={`flex-1 cursor-pointer border-2 rounded-lg p-4 text-center ${formData.role === 'creator' ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="role" value="creator" checked={formData.role === 'creator'} onChange={handleChange} className="sr-only" />
                <span className={`block font-medium ${formData.role === 'creator' ? 'text-indigo-900' : 'text-gray-900'}`}>Creator</span>
              </label>
              <label className={`flex-1 cursor-pointer border-2 rounded-lg p-4 text-center ${formData.role === 'brand' ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="role" value="brand" checked={formData.role === 'brand'} onChange={handleChange} className="sr-only" />
                <span className={`block font-medium ${formData.role === 'brand' ? 'text-indigo-900' : 'text-gray-900'}`}>Brand</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Full Name</label>
              <div className="mt-1">
                <input name="name" type="text" required value={formData.name} onChange={handleChange} className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Email address</label>
              <div className="mt-1">
                <input name="email" type="email" required value={formData.email} onChange={handleChange} className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <div className="mt-1 relative">
                <input name="password" type={showPassword ? "text" : "password"} required value={formData.password} onChange={handleChange} className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm pr-16" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5 text-gray-500 hover:text-gray-700 font-medium">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Phone (Optional)</label>
              <div className="mt-1">
                <input name="phone" type="text" value={formData.phone} onChange={handleChange} className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
              </div>
            </div>

            {errors && (
              <div className="text-red-600 text-sm">
                {typeof errors === 'string' ? errors : (
                  <ul className="list-disc pl-5">
                    {errors.map((err, i) => <li key={i}>{err.message}</li>)}
                  </ul>
                )}
              </div>
            )}

            <div>
              <button type="submit" disabled={loading} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50">
                {loading ? 'Signing up...' : 'Sign up'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Signup;
