import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

function Home() {
  const { user } = useContext(AuthContext);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
      <h1 className="text-5xl font-extrabold text-gray-900 tracking-tight sm:text-6xl mb-6">
        The UGC Campaign Marketplace
      </h1>
      <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10">
        Connect with top brands and creators. Run paid campaigns, submit content, and get paid instantly.
      </p>
      
      {!user ? (
        <div className="flex justify-center gap-4">
          <Link to="/signup" className="px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 md:text-lg">
            Get Started
          </Link>
          <Link to="/login" className="px-8 py-3 border border-transparent text-base font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 md:text-lg">
            Log In
          </Link>
        </div>
      ) : (
        <div className="mt-8">
          <Link to={`/${user.role}`} className="px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 md:text-lg">
            Go to Dashboard
          </Link>
        </div>
      )}
    </div>
  );
}

export default Home;
