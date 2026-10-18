/**
 * Collab Tasks API
 * Category → Task → Work hierarchy
 * Multi-member tasks via email invite
 * Completion tracking + configurable email reminders
 */
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'collab-tasks-secret-change-in-prod';
const DB_PATH = path.join(__dirname, 'data.json');
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
// Comma-separated list of frontend origins, e.g. https://myapp.vercel.app
// Leave empty to allow all origins (dev-friendly)
const FRONTEND_URL = process.env.FRONTEND_URL || '';

const corsOrigin = FRONTEND_URL
  ? FRONTEND_URL.split(',').map((s) => s.trim()).filter(Boolean)
  : true;
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------
function emptyDb() {
  return {
    users: [],
    categories: [],
    tasks: [],
    task_members: [],
    works: [],
    work_completions: [],
    nextIds: { user: 1, category: 1, task: 1, member: 1, work: 1, completion: 1 },
  };
}

function loadDb() {
  if (!fs.existsSync(DB_PATH)) return emptyDb();
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return emptyDb();
  }
}

function saveDb() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

let db = loadDb();

// Seed admin
if (db.users.length === 0) {
  db.users.push({
    id: db.nextIds.user++,
    email: 'admin@example.com',
    username: 'admin',
    password_hash: bcrypt.hashSync('admin123', 10),
    notifications: { enabled: true, frequencyHours: 24, lastReminderAt: null },
    created_at: new Date().toISOString(),
  });
  saveDb();
  console.log('>>> Default admin: admin@example.com / admin123  (username: admin)');
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------
function createTransporter() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

const transporter = createTransporter();

async function sendEmail(to, subject, text, html) {
  if (!transporter) {
    console.log(`[EMAIL MOCK] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return { mock: true };
  }
  return transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@collabtasks.local',
    to,
    subject,
    text,
    html: html || text.replace(/\n/g, '<br>'),
  });
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    notifications: u.notifications || { enabled: true, frequencyHours: 24 },
    created_at: u.created_at,
  };
}

function findUserById(id) {
  return db.users.find((u) => u.id === id);
}

function findUserByEmail(email) {
  return db.users.find((u) => u.email.toLowerCase() === (email || '').toLowerCase().trim());
}

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------
app.post('/api/register', async (req, res) => {
  const { email, username, password } = req.body || {};
  if (!email || !username || !password) {
    return res.status(400).json({ error: 'Email, username and password required' });
  }
  if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  if (findUserByEmail(email)) return res.status(400).json({ error: 'Email already registered' });
  if (db.users.some((u) => u.username === username.trim())) {
    return res.status(400).json({ error: 'Username already taken' });
  }

  const user = {
    id: db.nextIds.user++,
    email: email.trim().toLowerCase(),
    username: username.trim(),
    password_hash: bcrypt.hashSync(password, 10),
    notifications: { enabled: true, frequencyHours: 24, lastReminderAt: null },
    created_at: new Date().toISOString(),
  };
  db.users.push(user);

  // Accept pending invites for this email
  db.task_members.forEach((m) => {
    if (m.email?.toLowerCase() === user.email && !m.user_id) {
      m.user_id = user.id;
      m.status = 'accepted';
      m.joined_at = new Date().toISOString();
    }
  });

  saveDb();
  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  // allow login with email OR username
  const login = (email || '').trim();
  const user =
    findUserByEmail(login) || db.users.find((u) => u.username === login);
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email/username or password' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get('/api/me', auth, (req, res) => {
  const user = findUserById(req.user.id);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

// Notification settings
app.put('/api/me/notifications', auth, (req, res) => {
  const user = findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { enabled, frequencyHours } = req.body || {};
  if (!user.notifications) user.notifications = { enabled: true, frequencyHours: 24, lastReminderAt: null };
  if (typeof enabled === 'boolean') user.notifications.enabled = enabled;
  if (frequencyHours !== undefined) {
    const h = parseInt(frequencyHours, 10);
    if (![1, 6, 12, 24, 48, 72, 168].includes(h)) {
      return res.status(400).json({ error: 'frequencyHours must be 1, 6, 12, 24, 48, 72, or 168' });
    }
    user.notifications.frequencyHours = h;
  }
  saveDb();
  res.json({ user: publicUser(user) });
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
app.get('/api/categories', auth, (req, res) => {
  const cats = db.categories
    .map((c) => ({
      ...c,
      creator: findUserById(c.created_by)?.username || null,
      task_count: db.tasks.filter((t) => t.category_id === c.id).length,
    }))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(cats);
});

app.post('/api/categories', auth, (req, res) => {
  const { name, description } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const cat = {
    id: db.nextIds.category++,
    name: name.trim(),
    description: (description || '').trim(),
    created_by: req.user.id,
    created_at: new Date().toISOString(),
  };
  db.categories.push(cat);
  saveDb();
  res.status(201).json(cat);
});

app.delete('/api/categories/:id', auth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const cat = db.categories.find((c) => c.id === id);
  if (!cat) return res.status(404).json({ error: 'Not found' });
  if (cat.created_by !== req.user.id) return res.status(403).json({ error: 'Only creator can delete' });
  // cascade: remove tasks under category (and their works/members/completions)
  const taskIds = db.tasks.filter((t) => t.category_id === id).map((t) => t.id);
  taskIds.forEach((tid) => deleteTaskCascade(tid));
  db.categories = db.categories.filter((c) => c.id !== id);
  saveDb();
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Tasks + members
// ---------------------------------------------------------------------------
function isTaskMember(taskId, userId) {
  return db.task_members.some(
    (m) => m.task_id === taskId && m.user_id === userId && m.status === 'accepted'
  );
}

function canAccessTask(task, userId) {
  return task.created_by === userId || isTaskMember(task.id, userId);
}

function enrichTask(t) {
  const members = db.task_members
    .filter((m) => m.task_id === t.id)
    .map((m) => ({
      id: m.id,
      user_id: m.user_id,
      email: m.email,
      status: m.status,
      username: m.user_id ? findUserById(m.user_id)?.username : null,
      joined_at: m.joined_at,
    }));
  const works = db.works
    .filter((w) => w.task_id === t.id)
    .map((w) => enrichWork(w, members));
  return {
    ...t,
    category_name: db.categories.find((c) => c.id === t.category_id)?.name || null,
    creator: findUserById(t.created_by)?.username || null,
    members,
    works,
  };
}

function enrichWork(w, members) {
  const completions = db.work_completions
    .filter((c) => c.work_id === w.id)
    .map((c) => ({
      user_id: c.user_id,
      username: findUserById(c.user_id)?.username,
      email: findUserById(c.user_id)?.email,
      completed: c.completed,
      completed_at: c.completed_at,
      notes: c.notes || '',
    }));
  // include members who haven't started yet
  const memberUsers = (members || db.task_members.filter((m) => m.task_id === w.task_id && m.status === 'accepted'))
    .filter((m) => m.user_id)
    .map((m) => m.user_id);
  memberUsers.forEach((uid) => {
    if (!completions.find((c) => c.user_id === uid)) {
      const u = findUserById(uid);
      completions.push({
        user_id: uid,
        username: u?.username,
        email: u?.email,
        completed: false,
        completed_at: null,
        notes: '',
      });
    }
  });
  return { ...w, completions };
}

function deleteTaskCascade(taskId) {
  const workIds = db.works.filter((w) => w.task_id === taskId).map((w) => w.id);
  db.work_completions = db.work_completions.filter((c) => !workIds.includes(c.work_id));
  db.works = db.works.filter((w) => w.task_id !== taskId);
  db.task_members = db.task_members.filter((m) => m.task_id !== taskId);
  db.tasks = db.tasks.filter((t) => t.id !== taskId);
}

app.get('/api/tasks', auth, (req, res) => {
  const { category_id } = req.query;
  let tasks = db.tasks.filter((t) => canAccessTask(t, req.user.id));
  if (category_id) tasks = tasks.filter((t) => t.category_id === parseInt(category_id, 10));
  tasks = tasks.map(enrichTask).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(tasks);
});

app.get('/api/tasks/:id', auth, (req, res) => {
  const task = db.tasks.find((t) => t.id === parseInt(req.params.id, 10));
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (!canAccessTask(task, req.user.id)) return res.status(403).json({ error: 'Not a member of this task' });
  res.json(enrichTask(task));
});

app.post('/api/tasks', auth, (req, res) => {
  const { title, description, category_id } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
  if (!category_id) return res.status(400).json({ error: 'Category required' });
  const cat = db.categories.find((c) => c.id === parseInt(category_id, 10));
  if (!cat) return res.status(400).json({ error: 'Category not found' });

  const now = new Date().toISOString();
  const task = {
    id: db.nextIds.task++,
    title: title.trim(),
    description: (description || '').trim(),
    category_id: cat.id,
    created_by: req.user.id,
    created_at: now,
  };
  db.tasks.push(task);
  // creator is auto-member
  const me = findUserById(req.user.id);
  db.task_members.push({
    id: db.nextIds.member++,
    task_id: task.id,
    user_id: req.user.id,
    email: me.email,
    invited_by: req.user.id,
    status: 'accepted',
    joined_at: now,
  });
  saveDb();
  res.status(201).json(enrichTask(task));
});

app.delete('/api/tasks/:id', auth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const task = db.tasks.find((t) => t.id === id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  if (task.created_by !== req.user.id) return res.status(403).json({ error: 'Only creator can delete' });
  deleteTaskCascade(id);
  saveDb();
  res.json({ ok: true });
});

// Add member by email
app.post('/api/tasks/:id/members', auth, async (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const task = db.tasks.find((t) => t.id === taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (!canAccessTask(task, req.user.id)) return res.status(403).json({ error: 'Not allowed' });

  const { email } = req.body || {};
  if (!email?.trim()) return res.status(400).json({ error: 'Email required' });
  const emailNorm = email.trim().toLowerCase();

  const existing = db.task_members.find(
    (m) => m.task_id === taskId && m.email?.toLowerCase() === emailNorm
  );
  if (existing) return res.status(400).json({ error: 'Already a member or invited' });

  const existingUser = findUserByEmail(emailNorm);
  const now = new Date().toISOString();
  const member = {
    id: db.nextIds.member++,
    task_id: taskId,
    user_id: existingUser?.id || null,
    email: emailNorm,
    invited_by: req.user.id,
    status: existingUser ? 'accepted' : 'pending',
    joined_at: existingUser ? now : null,
  };
  db.task_members.push(member);
  saveDb();

  const inviter = findUserById(req.user.id);
  await sendEmail(
    emailNorm,
    `You're invited to task: ${task.title}`,
    `Hi!\n\n${inviter.username} invited you to collaborate on "${task.title}".\n\n` +
      (existingUser
        ? `Log in at ${APP_URL} to start working.\n`
        : `Register at ${APP_URL}/register with this email (${emailNorm}) to join.\n`) +
      `\n— Collab Tasks`
  );

  res.status(201).json({
    id: member.id,
    user_id: member.user_id,
    email: member.email,
    status: member.status,
    username: existingUser?.username || null,
  });
});

app.delete('/api/tasks/:taskId/members/:memberId', auth, (req, res) => {
  const taskId = parseInt(req.params.taskId, 10);
  const memberId = parseInt(req.params.memberId, 10);
  const task = db.tasks.find((t) => t.id === taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.created_by !== req.user.id) return res.status(403).json({ error: 'Only creator can remove members' });
  const member = db.task_members.find((m) => m.id === memberId && m.task_id === taskId);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  if (member.user_id === task.created_by) return res.status(400).json({ error: 'Cannot remove task creator' });
  db.task_members = db.task_members.filter((m) => m.id !== memberId);
  saveDb();
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Work items under a task
// ---------------------------------------------------------------------------
app.post('/api/tasks/:id/works', auth, (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const task = db.tasks.find((t) => t.id === taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (!canAccessTask(task, req.user.id)) return res.status(403).json({ error: 'Not allowed' });

  const { title, description } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: 'Title required' });

  const work = {
    id: db.nextIds.work++,
    task_id: taskId,
    title: title.trim(),
    description: (description || '').trim(),
    created_by: req.user.id,
    created_at: new Date().toISOString(),
  };
  db.works.push(work);
  saveDb();
  res.status(201).json(enrichWork(work));
});

app.delete('/api/works/:id', auth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const work = db.works.find((w) => w.id === id);
  if (!work) return res.status(404).json({ error: 'Not found' });
  const task = db.tasks.find((t) => t.id === work.task_id);
  if (!task || !canAccessTask(task, req.user.id)) return res.status(403).json({ error: 'Not allowed' });
  db.work_completions = db.work_completions.filter((c) => c.work_id !== id);
  db.works = db.works.filter((w) => w.id !== id);
  saveDb();
  res.json({ ok: true });
});

// Toggle / set completion for current user (or admin of task for others)
app.put('/api/works/:id/completion', auth, (req, res) => {
  const workId = parseInt(req.params.id, 10);
  const work = db.works.find((w) => w.id === workId);
  if (!work) return res.status(404).json({ error: 'Work not found' });
  const task = db.tasks.find((t) => t.id === work.task_id);
  if (!task || !canAccessTask(task, req.user.id)) return res.status(403).json({ error: 'Not allowed' });

  const { completed, notes, user_id } = req.body || {};
  // only mark own completion unless you're task creator
  let targetUserId = req.user.id;
  if (user_id && parseInt(user_id, 10) !== req.user.id) {
    if (task.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Can only update your own completion' });
    }
    targetUserId = parseInt(user_id, 10);
  }

  let rec = db.work_completions.find((c) => c.work_id === workId && c.user_id === targetUserId);
  const now = new Date().toISOString();
  if (!rec) {
    rec = {
      id: db.nextIds.completion++,
      work_id: workId,
      user_id: targetUserId,
      completed: !!completed,
      completed_at: completed ? now : null,
      notes: (notes || '').trim(),
    };
    db.work_completions.push(rec);
  } else {
    if (completed !== undefined) {
      rec.completed = !!completed;
      rec.completed_at = rec.completed ? now : null;
    }
    if (notes !== undefined) rec.notes = (notes || '').trim();
  }
  saveDb();
  res.json(enrichWork(work));
});

// ---------------------------------------------------------------------------
// Dashboard / stats
// ---------------------------------------------------------------------------
app.get('/api/dashboard', auth, (req, res) => {
  const myTasks = db.tasks.filter((t) => canAccessTask(t, req.user.id)).map(enrichTask);
  let myPending = 0;
  let myDone = 0;
  myTasks.forEach((t) => {
    t.works.forEach((w) => {
      const mine = w.completions.find((c) => c.user_id === req.user.id);
      if (mine?.completed) myDone++;
      else myPending++;
    });
  });
  res.json({
    categories: db.categories.length,
    tasks: myTasks.length,
    pending_work: myPending,
    completed_work: myDone,
    recent_tasks: myTasks.slice(0, 8),
  });
});

// ---------------------------------------------------------------------------
// Excel export
// ---------------------------------------------------------------------------
app.get('/api/export/excel', auth, async (req, res) => {
  const tasks = db.tasks.filter((t) => canAccessTask(t, req.user.id)).map(enrichTask);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Tasks & Work');
  ws.columns = [
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Task', key: 'task', width: 24 },
    { header: 'Work', key: 'work', width: 20 },
    { header: 'Member', key: 'member', width: 16 },
    { header: 'Email', key: 'email', width: 24 },
    { header: 'Completed', key: 'completed', width: 12 },
    { header: 'Completed At', key: 'completed_at', width: 18 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };

  tasks.forEach((t) => {
    if (t.works.length === 0) {
      ws.addRow({
        category: t.category_name,
        task: t.title,
        work: '—',
        member: t.members.map((m) => m.username || m.email).join(', '),
        email: '',
        completed: '',
        completed_at: '',
        notes: '',
      });
    }
    t.works.forEach((w) => {
      w.completions.forEach((c) => {
        ws.addRow({
          category: t.category_name,
          task: t.title,
          work: w.title,
          member: c.username || '',
          email: c.email || '',
          completed: c.completed ? 'Yes' : 'No',
          completed_at: c.completed_at ? c.completed_at.slice(0, 19) : '',
          notes: c.notes || '',
        });
      });
    });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=collab_tasks_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
  await wb.xlsx.write(res);
  res.end();
});

// ---------------------------------------------------------------------------
// Reminder job — runs every 15 minutes
// ---------------------------------------------------------------------------
async function runReminders() {
  const now = Date.now();
  for (const user of db.users) {
    const prefs = user.notifications || { enabled: true, frequencyHours: 24 };
    if (!prefs.enabled) continue;
    const freqMs = (prefs.frequencyHours || 24) * 3600 * 1000;
    if (prefs.lastReminderAt && now - new Date(prefs.lastReminderAt).getTime() < freqMs) continue;

    // incomplete work for this user
    const incomplete = [];
    db.task_members
      .filter((m) => m.user_id === user.id && m.status === 'accepted')
      .forEach((m) => {
        const task = db.tasks.find((t) => t.id === m.task_id);
        if (!task) return;
        db.works
          .filter((w) => w.task_id === task.id)
          .forEach((w) => {
            const comp = db.work_completions.find(
              (c) => c.work_id === w.id && c.user_id === user.id
            );
            if (!comp?.completed) {
              incomplete.push({ task: task.title, work: w.title });
            }
          });
      });

    if (incomplete.length === 0) continue;

    const lines = incomplete.map((i) => `• ${i.task} → ${i.work}`).join('\n');
    await sendEmail(
      user.email,
      `Reminder: ${incomplete.length} incomplete work item(s)`,
      `Hi ${user.username},\n\nYou have incomplete work:\n\n${lines}\n\nOpen ${APP_URL} to update.\n\nYou can change reminder frequency or disable emails in Settings.\n\n— Collab Tasks`
    );
    user.notifications = prefs;
    user.notifications.lastReminderAt = new Date().toISOString();
  }
  saveDb();
}

setInterval(() => {
  runReminders().catch((e) => console.error('Reminder job error:', e));
}, 15 * 60 * 1000);

// manual trigger (for testing)
app.post('/api/reminders/run', auth, async (req, res) => {
  await runReminders();
  res.json({ ok: true, message: 'Reminder job ran (check server logs if SMTP not configured)' });
});

// ---------------------------------------------------------------------------
// Serve React build
// ---------------------------------------------------------------------------
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(55));
  console.log(`  Collab Tasks API  →  http://localhost:${PORT}`);
  console.log(`  Default: admin@example.com / admin123`);
  console.log(`  Email: ${transporter ? 'SMTP configured' : 'MOCK (set SMTP_* env vars)'}`);
  console.log('='.repeat(55));
});
