import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.dashboard().then(setData).catch(console.error);
  }, []);

  if (!data) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <h2 className="mb-0">Dashboard</h2>
        <button className="btn btn-outline-success btn-sm" onClick={() => api.exportExcel()}>
          <i className="bi bi-file-earmark-excel me-1"></i>Export Excel
        </button>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3">
          <div className="card p-3 stat-box">
            <div className="text-muted small">Categories</div>
            <div className="fs-3 fw-bold">{data.categories}</div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card p-3 stat-box" style={{ borderColor: '#6f42c1' }}>
            <div className="text-muted small">My Tasks</div>
            <div className="fs-3 fw-bold">{data.tasks}</div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card p-3 stat-box" style={{ borderColor: '#ffc107' }}>
            <div className="text-muted small">Pending Work</div>
            <div className="fs-3 fw-bold">{data.pending_work}</div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card p-3 stat-box" style={{ borderColor: '#198754' }}>
            <div className="text-muted small">Completed Work</div>
            <div className="fs-3 fw-bold">{data.completed_work}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header bg-white d-flex justify-content-between">
          <strong>Recent tasks</strong>
          <Link to="/tasks" className="btn btn-sm btn-outline-primary">
            All tasks
          </Link>
        </div>
        <div className="list-group list-group-flush">
          {data.recent_tasks.length === 0 && (
            <div className="list-group-item text-muted text-center py-4">
              No tasks yet. Create a category, then a task.
            </div>
          )}
          {data.recent_tasks.map((t) => (
            <Link
              key={t.id}
              to={`/tasks/${t.id}`}
              className="list-group-item list-group-item-action"
            >
              <div className="hierarchy-cat">{t.category_name || 'Uncategorized'}</div>
              <div className="fw-medium">{t.title}</div>
              <div className="small text-muted">
                {t.members?.length || 0} member(s) · {t.works?.length || 0} work item(s)
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
