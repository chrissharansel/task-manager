// Hosting: set VITE_API_URL to your backend, e.g. https://api.example.com/api
// Local dev: leave unset — uses /api (Vite proxy → localhost:3001)
const API = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

function token() {
  return localStorage.getItem('token');
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (!window.location.pathname.includes('/login')) window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('spreadsheet')) return res.blob();
  return res.json();
}

export const api = {
  login: (email, password) =>
    request('/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email, username, password) =>
    request('/register', { method: 'POST', body: JSON.stringify({ email, username, password }) }),
  me: () => request('/me'),
  updateNotifications: (data) =>
    request('/me/notifications', { method: 'PUT', body: JSON.stringify(data) }),

  categories: () => request('/categories'),
  createCategory: (data) => request('/categories', { method: 'POST', body: JSON.stringify(data) }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),

  tasks: (categoryId) =>
    request(categoryId ? `/tasks?category_id=${categoryId}` : '/tasks'),
  task: (id) => request(`/tasks/${id}`),
  createTask: (data) => request('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
  addMember: (taskId, email) =>
    request(`/tasks/${taskId}/members`, { method: 'POST', body: JSON.stringify({ email }) }),
  removeMember: (taskId, memberId) =>
    request(`/tasks/${taskId}/members/${memberId}`, { method: 'DELETE' }),

  addWork: (taskId, data) =>
    request(`/tasks/${taskId}/works`, { method: 'POST', body: JSON.stringify(data) }),
  deleteWork: (id) => request(`/works/${id}`, { method: 'DELETE' }),
  setCompletion: (workId, data) =>
    request(`/works/${workId}/completion`, { method: 'PUT', body: JSON.stringify(data) }),

  dashboard: () => request('/dashboard'),
  runReminders: () => request('/reminders/run', { method: 'POST' }),
  exportExcel: async () => {
    const blob = await request('/export/excel');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `collab_tasks_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
