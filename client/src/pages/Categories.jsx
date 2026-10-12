import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';

export default function Categories() {
  const { user } = useAuth();
  const [cats, setCats] = useState([]);
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const load = () => api.categories().then(setCats).catch(console.error);
  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.createCategory({ name, description });
      setName('');
      setDescription('');
      setShow(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete category and all its tasks/work?')) return;
    await api.deleteCategory(id);
    load();
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-0">Categories</h2>
          <p className="text-muted small mb-0">
            Group tasks — e.g. <em>Self Learning</em>, <em>Work</em>, <em>Personal</em>
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShow(true)}>
          <i className="bi bi-plus-lg me-1"></i>Add Category
        </button>
      </div>

      <div className="row g-3">
        {cats.length === 0 && (
          <div className="col-12">
            <div className="card p-5 text-center text-muted">
              No categories yet. Add one to organize your tasks.
            </div>
          </div>
        )}
        {cats.map((c) => (
          <div key={c.id} className="col-md-6 col-lg-4">
            <div className="card h-100">
              <div className="card-body">
                <h5 className="card-title">{c.name}</h5>
                <p className="card-text text-muted small">{c.description || 'No description'}</p>
                <div className="small text-muted">
                  {c.task_count} task(s) · by {c.creator}
                </div>
              </div>
              {c.created_by === user?.id && (
                <div className="card-footer bg-white border-0 text-end">
                  <button className="btn btn-sm btn-outline-danger" onClick={() => remove(c.id)}>
                    <i className="bi bi-trash"></i>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {show && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,.4)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <form onSubmit={create}>
                <div className="modal-header">
                  <h5 className="modal-title">New Category</h5>
                  <button type="button" className="btn-close" onClick={() => setShow(false)} />
                </div>
                <div className="modal-body">
                  {error && <div className="alert alert-danger py-2">{error}</div>}
                  <div className="mb-3">
                    <label className="form-label">Name *</label>
                    <input
                      className="form-control"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="e.g. Self Learning"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShow(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Create
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
