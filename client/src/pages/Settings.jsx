import React, { useState } from 'react';
import { useAuth } from '../auth';
import { api } from '../api';

const FREQUENCIES = [
  { value: 1, label: 'Every 1 hour' },
  { value: 6, label: 'Every 6 hours' },
  { value: 12, label: 'Every 12 hours' },
  { value: 24, label: 'Every day (24h)' },
  { value: 48, label: 'Every 2 days' },
  { value: 72, label: 'Every 3 days' },
  { value: 168, label: 'Every week' },
];

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const prefs = user?.notifications || { enabled: true, frequencyHours: 24 };
  const [enabled, setEnabled] = useState(!!prefs.enabled);
  const [frequencyHours, setFrequencyHours] = useState(prefs.frequencyHours || 24);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      await api.updateNotifications({ enabled, frequencyHours: Number(frequencyHours) });
      await refreshUser();
      setMsg('Saved');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const testReminders = async () => {
    setMsg('');
    try {
      const r = await api.runReminders();
      setMsg(r.message || 'Reminder job ran — check server console if SMTP is not set');
    } catch (err) {
      setMsg(err.message);
    }
  };

  return (
    <>
      <h2 className="mb-4">Settings</h2>

      <div className="row g-4">
        <div className="col-lg-6">
          <div className="card">
            <div className="card-header bg-white">
              <strong>
                <i className="bi bi-bell me-1"></i>Email reminders
              </strong>
            </div>
            <div className="card-body">
              <p className="text-muted small">
                If you have incomplete work on any task, you get reminder emails on the schedule
                below. Turn them off anytime.
              </p>
              <form onSubmit={save}>
                <div className="form-check form-switch mb-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="notifEnabled"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="notifEnabled">
                    Enable email reminders
                  </label>
                </div>

                <div className="mb-3">
                  <label className="form-label">How often</label>
                  <select
                    className="form-select"
                    value={frequencyHours}
                    onChange={(e) => setFrequencyHours(e.target.value)}
                    disabled={!enabled}
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save settings'}
                </button>
              </form>
              {msg && <div className="alert alert-info mt-3 py-2 mb-0">{msg}</div>}
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card">
            <div className="card-header bg-white">
              <strong>Account</strong>
            </div>
            <div className="card-body">
              <dl className="mb-0">
                <dt>Username</dt>
                <dd>{user?.username}</dd>
                <dt>Email</dt>
                <dd>{user?.email}</dd>
              </dl>
              <hr />
              <p className="small text-muted">
                To send real emails, set environment variables on the server:{' '}
                <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>,{' '}
                <code>SMTP_PASS</code>, <code>SMTP_FROM</code>, <code>APP_URL</code>.
                Without them, reminders are printed in the server log.
              </p>
              <button className="btn btn-outline-secondary btn-sm" onClick={testReminders}>
                Run reminder job now (test)
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
