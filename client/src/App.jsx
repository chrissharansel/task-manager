import React from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Categories from './pages/Categories';
import Tasks from './pages/Tasks';
import TaskDetail from './pages/TaskDetail';
import Settings from './pages/Settings';

function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark shadow-sm">
        <div className="container-fluid">
          <NavLink className="navbar-brand" to="/">
            <i className="bi bi-people me-2"></i>Collab Tasks
          </NavLink>
          <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav">
            <span className="navbar-toggler-icon"></span>
          </button>
          <div className="collapse navbar-collapse" id="nav">
            <ul className="navbar-nav me-auto">
              <li className="nav-item">
                <NavLink className="nav-link" to="/" end>Dashboard</NavLink>
              </li>
              <li className="nav-item">
                <NavLink className="nav-link" to="/categories">Categories</NavLink>
              </li>
              <li className="nav-item">
                <NavLink className="nav-link" to="/tasks">Tasks</NavLink>
              </li>
              <li className="nav-item">
                <NavLink className="nav-link" to="/settings">Settings</NavLink>
              </li>
            </ul>
            <div className="d-flex align-items-center text-white gap-3">
              <span>
                <i className="bi bi-person-circle me-1"></i>
                {user?.username}
                <small className="text-white-50 ms-1">({user?.email})</small>
              </span>
              <button
                className="btn btn-outline-light btn-sm"
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="container py-4">{children}</main>
      <footer className="text-center py-3">
        Collab Tasks — Category → Task → Work · Email invites & reminders
      </footer>
    </>
  );
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
        <div className="spinner-border text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/categories" element={<PrivateRoute><Categories /></PrivateRoute>} />
      <Route path="/tasks" element={<PrivateRoute><Tasks /></PrivateRoute>} />
      <Route path="/tasks/:id" element={<PrivateRoute><TaskDetail /></PrivateRoute>} />
      <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
