import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  if (user) {
    navigate('/');
    return null;
  }

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="row justify-content-center mt-5">
      <div className="col-md-5 col-lg-4">
        <div className="card p-4">
          <h3 className="text-center mb-4">
            <i className="bi bi-box-arrow-in-right me-2"></i>Login
          </h3>
          {error && <div className="alert alert-danger py-2">{error}</div>}
          <form onSubmit={submit}>
            <div className="mb-3">
              <label className="form-label">Email or username</label>
              <input
                type="text"
                className="form-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary w-100" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
          <p className="text-center mt-3 mb-0 text-muted">
            No account? <Link to="/register">Register</Link>
          </p>
          <hr />
          <p className="text-center small text-muted mb-0">
            Default: <code>admin@example.com</code> / <code>admin123</code>
          </p>
        </div>
      </div>
    </div>
  );
}
