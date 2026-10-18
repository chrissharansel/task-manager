import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, AuthError } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      setLoading(false);
      return;
    }
    // Keep cached user visible while validating (stay logged in across refresh)
    api
      .me()
      .then((d) => {
        setUser(d.user);
        localStorage.setItem('user', JSON.stringify(d.user));
      })
      .catch((err) => {
        // Only log out on real auth failure — not network / Render cold start
        if (err instanceof AuthError || err.message === 'Unauthorized') {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        }
        // otherwise keep existing user from localStorage
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password, rememberMe = true) => {
    const d = await api.login(email, password, rememberMe);
    localStorage.setItem('token', d.token);
    localStorage.setItem('user', JSON.stringify(d.user));
    setUser(d.user);
    return d.user;
  };

  const register = async (email, username, password) => {
    const d = await api.register(email, username, password);
    localStorage.setItem('token', d.token);
    localStorage.setItem('user', JSON.stringify(d.user));
    setUser(d.user);
    return d.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const refreshUser = async () => {
    const d = await api.me();
    setUser(d.user);
    localStorage.setItem('user', JSON.stringify(d.user));
    return d.user;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}