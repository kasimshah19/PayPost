import { createContext, useState, useEffect } from 'react';
import api from '../api/axios';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get('/auth/me');
        setUser(res.data.user);
      } catch (err) {
        console.error('Failed to fetch user:', err);
        setToken(null);
        localStorage.removeItem('token');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [token]);

  const login = async (data) => {
    const res = await api.post('/auth/login', data);
    const { token: newToken, user: newUser } = res.data;
    setToken(newToken);
    localStorage.setItem('token', newToken);
    setUser(newUser);
    return res.data;
  };

  const signup = async (data) => {
    const res = await api.post('/auth/signup', data);
    const { token: newToken, user: newUser } = res.data;
    setToken(newToken);
    localStorage.setItem('token', newToken);
    setUser(newUser);
    return res.data;
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
