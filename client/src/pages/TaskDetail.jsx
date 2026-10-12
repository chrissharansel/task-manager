import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

export default function TaskDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [error, setError] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [workForm, setWorkForm] = useState({ title: '', description: '' });
  const [showWork, setShowWork] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () =>
    api
      .task(id)
      .then(setTask)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, [id]);

  if (error) {
    return (
      <div className="alert alert-danger">
        {error} <Link to="/tasks">Back to tasks</Link>
      </div>
    );
  }
  if (!task) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" />
      </div>
    );
  }

  const isCreator = task.created_by === user?.id;

  const addMember = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api.addMember(task.id, memberEmail);
      setMemberEmail('');
      setMsg('Member invited (email sent if SMTP configured)');
      load();
    } catch (err) {
      setMsg(err.message);
    }
  };

  const removeMember = async (memberId) => {
    if (!confirm('Remove this member?')) return;
    await api.removeMember(task.id, memberId);
    load();
  };

  const addWork = async (e) => {
    e.preventDefault();
    try {
      await api.addWork(task.id, workForm);
      setWorkForm({ title: '', description: '' });
      setShowWork(false);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleComplete = async (workId, currentlyDone) => {
    await api.setCompletion(workId, { completed: !currentlyDone });
    load();
  };

  const deleteTask = async () => {
    if (!confirm('Delete this task and all work items?')) return;
    await api.deleteTask(task.id);
    navigate('/tasks');
  };

  return (
    <>
      <div className="mb-3">
        <Link to="/tasks" className="text-decoration-none small">
          ← Tasks
        </Link>
      </div>

      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-2">
        <div>
          <div className="hierarchy-cat">{task.category_name}</div>
          <h2 className="mb-1">{task.title}</h2>
          <p className="text-muted mb-0">{task.description || 'No description'}</p>
          <small className="text-muted">Created by {task.creator}</small>
        </div>
        {isCreator && (
          <button className="btn btn-outline-danger btn-sm" onClick={deleteTask}>
            <i className="bi bi-trash me-1"></i>Delete task
          </button>
        )}
      </div>

      <div className="row g-4">
        {/* Members */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-header bg-white">
              <strong>
                <i className="bi bi-people me-1"></i>Members
              </strong>
            </div>
            <div className="card-body">
              {(task.members || []).map((m) => (
                <div
                  key={m.id}
                  className="d-flex justify-content-between align-items-center mb-2"
                >
                  <div>
                    <span className={`member-chip ${m.status === 'pending' ? 'pending' : ''}`}>
                      {m.username || m.email}
                    </span>
                    {m.status === 'pending' && (
                      <small className="text-muted d-block ms-1">Invite pending</small>
                    )}
                  </div>
                  {isCreator && m.user_id !== task.created_by && (
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => removeMember(m.id)}
                    >
                      <i className="bi bi-x"></i>
                    </button>
                  )}
                </div>
              ))}

              <hr />
              <form onSubmit={addMember}>
                <label className="form-label">Add member by email</label>
                <div className="input-group input-group-sm">
                  <input
                    type="email"
                    className="form-control"
                    placeholder="colleague@email.com"
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    required
                  />
                  <button className="btn btn-primary" type="submit">
                    Invite
                  </button>
                </div>
              </form>
              {msg && <div className="small mt-2 text-muted">{msg}</div>}
            </div>
          </div>
        </div>

        {/* Work items */}
        <div className="col-lg-8">
          <div className="card">
            <div className="card-header bg-white d-flex justify-content-between align-items-center">
              <strong>
                <i className="bi bi-list-check me-1"></i>Work items
              </strong>
              <button className="btn btn-sm btn-primary" onClick={() => setShowWork(true)}>
                <i className="bi bi-plus-lg me-1"></i>Add Work
              </button>
            </div>
            <div className="card-body p-0">
              {(task.works || []).length === 0 && (
                <div className="text-center text-muted py-4">
                  No work yet. Add items like <em>dev</em>, <em>deploy</em>, <em>test</em>…
                </div>
              )}
              {(task.works || []).map((w) => {
                const mine = (w.completions || []).find((c) => c.user_id === user?.id);
                const done = !!mine?.completed;
                return (
                  <div key={w.id} className="border-bottom p-3 work-row">
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <div>
                        <strong>{w.title}</strong>
                        {w.description && (
                          <div className="small text-muted">{w.description}</div>
                        )}
                      </div>
                      <div className="d-flex gap-2">
                        <button
                          className={`btn btn-sm ${done ? 'btn-success' : 'btn-outline-secondary'}`}
                          onClick={() => toggleComplete(w.id, done)}
                        >
                          {done ? (
                            <>
                              <i className="bi bi-check-lg me-1"></i>Done
                            </>
                          ) : (
                            <>
                              <i className="bi bi-circle me-1"></i>Mark done
                            </>
                          )}
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={async () => {
                            if (confirm('Delete this work item?')) {
                              await api.deleteWork(w.id);
                              load();
                            }
                          }}
                        >
                          <i className="bi bi-trash"></i>
                        </button>
                      </div>
                    </div>
                    <div className="table-responsive">
                      <table className="table table-sm mb-0">
                        <thead>
                          <tr>
                            <th>Member</th>
                            <th>Status</th>
                            <th>When</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(w.completions || []).map((c) => (
                            <tr key={c.user_id}>
                              <td>
                                {c.username || c.email}
                                {c.user_id === user?.id && (
                                  <span className="badge bg-secondary ms-1">you</span>
                                )}
                              </td>
                              <td>
                                <span className={`badge ${c.completed ? 'badge-yes' : 'badge-no'}`}>
                                  {c.completed ? 'Completed' : 'Not done'}
                                </span>
                              </td>
                              <td className="small text-muted">
                                {c.completed_at
                                  ? c.completed_at.slice(0, 16).replace('T', ' ')
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {showWork && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,.4)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <form onSubmit={addWork}>
                <div className="modal-header">
                  <h5 className="modal-title">Add Work</h5>
                  <button type="button" className="btn-close" onClick={() => setShowWork(false)} />
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Title *</label>
                    <input
                      className="form-control"
                      value={workForm.title}
                      onChange={(e) => setWorkForm({ ...workForm, title: e.target.value })}
                      required
                      placeholder="e.g. dev, deploy, write docs"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={workForm.description}
                      onChange={(e) => setWorkForm({ ...workForm, description: e.target.value })}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowWork(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Add Work
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
