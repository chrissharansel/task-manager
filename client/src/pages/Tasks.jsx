import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filterCat, setFilterCat] = useState('');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category_id: '' });
  const [error, setError] = useState('');

  const load = () => {
    api.tasks(filterCat || undefined).then(setTasks).catch(console.error);
    api.categories().then(setCategories).catch(console.error);
  };

  useEffect(() => {
    load();
  }, [filterCat]);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.createTask(form);
      setForm({ title: '', description: '', category_id: '' });
      setShow(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h2 className="mb-0">Tasks</h2>
          <p className="text-muted small mb-0">
            A task lives in a category and contains work items + members
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShow(true)}
          disabled={categories.length === 0}
        >
          <i className="bi bi-plus-lg me-1"></i>Add Task
        </button>
      </div>

      {categories.length === 0 && (
        <div className="alert alert-info">
          Create a <Link to="/categories">category</Link> first, then add tasks.
        </div>
      )}

      <div className="mb-3">
        <select
          className="form-select form-select-sm w-auto"
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="row g-3">
        {tasks.length === 0 && (
          <div className="col-12">
            <div className="card p-4 text-center text-muted">No tasks yet</div>
          </div>
        )}
        {tasks.map((t) => (
          <div key={t.id} className="col-md-6 col-lg-4">
            <Link to={`/tasks/${t.id}`} className="text-decoration-none text-dark">
              <div className="card h-100">
                <div className="card-body">
                  <div className="hierarchy-cat">{t.category_name}</div>
                  <h5 className="card-title">{t.title}</h5>
                  <p className="card-text small text-muted text-truncate">
                    {t.description || 'No description'}
                  </p>
                  <div className="d-flex flex-wrap gap-1 mb-2">
                    {(t.members || []).slice(0, 5).map((m) => (
                      <span
                        key={m.id}
                        className={`member-chip ${m.status === 'pending' ? 'pending' : ''}`}
                      >
                        {m.username || m.email}
                        {m.status === 'pending' && ' (invited)'}
                      </span>
                    ))}
                  </div>
                  <div className="small text-muted">
                    <i className="bi bi-list-check me-1"></i>
                    {t.works?.length || 0} work · {t.members?.length || 0} members
                  </div>
                </div>
              </div>
            </Link>
          </div>
        ))}
      </div>

      {show && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,.4)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <form onSubmit={create}>
                <div className="modal-header">
                  <h5 className="modal-title">New Task</h5>
                  <button type="button" className="btn-close" onClick={() => setShow(false)} />
                </div>
                <div className="modal-body">
                  {error && <div className="alert alert-danger py-2">{error}</div>}
                  <div className="mb-3">
                    <label className="form-label">Category *</label>
                    <select
                      className="form-select"
                      value={form.category_id}
                      onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                      required
                    >
                      <option value="">Select…</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Title *</label>
                    <input
                      className="form-control"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      required
                      placeholder="e.g. Develop App"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShow(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Create Task
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
