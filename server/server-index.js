/**
 * Collab Tasks API — MongoDB
 * Category → Task → Work · email invites · reminders
 */
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'collab-tasks-secret-change-in-prod';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const FRONTEND_URL = process.env.FRONTEND_URL || '';
const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URL ||
  'mongodb://127.0.0.1:27017/collab_tasks';

const corsOrigin = FRONTEND_URL
  ? FRONTEND_URL.split(',').map((s) => s.trim()).filter(Boolean)
  : true;
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true },
    password_hash: { type: String, required: true },
    notifications: {
      enabled: { type: Boolean, default: true },
      frequencyHours: { type: Number, default: 24 },
      lastReminderAt: { type: Date, default: null },
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

const taskMemberSchema = new mongoose.Schema(
  {
    task_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    email: { type: String, required: true, lowercase: true, trim: true },
    invited_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
    joined_at: { type: Date, default: null },
  },
  { timestamps: false }
);

const workSchema = new mongoose.Schema(
  {
    task_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

const workCompletionSchema = new mongoose.Schema(
  {
    work_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Work', required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    completed: { type: Boolean, default: false },
    completed_at: { type: Date, default: null },
    notes: { type: String, default: '' },
  },
  { timestamps: false }
);

workCompletionSchema.index({ work_id: 1, user_id: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);
const Category = mongoose.model('Category', categorySchema);
const Task = mongoose.model('Task', taskSchema);
const TaskMember = mongoose.model('TaskMember', taskMemberSchema);
const Work = mongoose.model('Work', workSchema);
const WorkCompletion = mongoose.model('WorkCompletion', workCompletionSchema);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isValidObjectId(id) {
  // Must be 24-char hex string (rejects old numeric ids like 1 from JSON-era tokens)
  return typeof id === 'string' && /^[a-fA-F0-9]{24}$/.test(id);
}

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    // Reject old JSON-DB tokens (numeric ids like 1) — client must log in again
    if (!isValidObjectId(payload.id)) {
      return res.status(401).json({ error: 'Invalid or expired token — please log in again' });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function signToken(user, rememberMe = true) {
  // Stay logged in: 90 days by default; 1 day if rememberMe is false
  return jwt.sign(
    { id: user._id.toString(), email: user.email, username: user.username },
    JWT_SECRET,
    { expiresIn: rememberMe ? '90d' : '1d' }
  );
}

function publicUser(u) {
  return {
    id: u._id.toString(),
    email: u.email,
    username: u.username,
    notifications: u.notifications || { enabled: true, frequencyHours: 24 },
    created_at: u.created_at,
  };
}

async function isTaskMember(taskId, userId) {
  const m = await TaskMember.findOne({
    task_id: taskId,
    user_id: userId,
    status: 'accepted',
  });
  return !!m;
}

async function canAccessTask(task, userId) {
  if (task.created_by.toString() === userId) return true;
  return isTaskMember(task._id, userId);
}

async function enrichWork(work, memberUserIds) {
  const completions = await WorkCompletion.find({ work_id: work._id }).lean();
  const byUser = new Map(completions.map((c) => [c.user_id.toString(), c]));
  const list = [];
  for (const uid of memberUserIds) {
    const c = byUser.get(uid);
    const u = await User.findById(uid).lean();
    list.push({
      user_id: uid,
      username: u?.username || null,
      email: u?.email || null,
      completed: !!c?.completed,
      completed_at: c?.completed_at || null,
      notes: c?.notes || '',
    });
  }
  return {
    id: work._id.toString(),
    task_id: work.task_id.toString(),
    title: work.title,
    description: work.description || '',
    created_at: work.created_at,
    completions: list,
  };
}

async function enrichTask(task) {
  const cat = await Category.findById(task.category_id).lean();
  const creator = await User.findById(task.created_by).lean();
  const members = await TaskMember.find({ task_id: task._id }).lean();
  const memberRows = await Promise.all(
    members.map(async (m) => {
      const u = m.user_id ? await User.findById(m.user_id).lean() : null;
      return {
        id: m._id.toString(),
        user_id: m.user_id ? m.user_id.toString() : null,
        email: m.email,
        status: m.status,
        username: u?.username || null,
        joined_at: m.joined_at,
      };
    })
  );
  const memberUserIds = memberRows.filter((m) => m.user_id && m.status === 'accepted').map((m) => m.user_id);
  const works = await Work.find({ task_id: task._id }).lean();
  const workRows = await Promise.all(works.map((w) => enrichWork(w, memberUserIds)));

  return {
    id: task._id.toString(),
    title: task.title,
    description: task.description || '',
    category_id: task.category_id.toString(),
    category_name: cat?.name || null,
    created_by: task.created_by.toString(),
    creator: creator?.username || null,
    created_at: task.created_at,
    members: memberRows,
    works: workRows,
  };
}

async function deleteTaskCascade(taskId) {
  const works = await Work.find({ task_id: taskId }).select('_id');
  const workIds = works.map((w) => w._id);
  await WorkCompletion.deleteMany({ work_id: { $in: workIds } });
  await Work.deleteMany({ task_id: taskId });
  await TaskMember.deleteMany({ task_id: taskId });
  await Task.deleteOne({ _id: taskId });
}

// ---------------------------------------------------------------------------
// Email — Resend (https://resend.com)
// Set RESEND_API_KEY and RESEND_FROM on Render
// ---------------------------------------------------------------------------
const resendApiKey = process.env.RESEND_API_KEY || '';
const resendFrom =
  process.env.RESEND_FROM ||
  process.env.SMTP_FROM ||
  'Collab Tasks <onboarding@resend.dev>';
const resend = resendApiKey ? new Resend(resendApiKey) : null;

async function sendEmail(to, subject, text, html) {
  if (!resend) {
    console.log(`[EMAIL MOCK] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return { mock: true };
  }
  try {
    const result = await resend.emails.send({
      from: resendFrom,
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html: html || text.replace(/\n/g, '<br>'),
    });
    if (result.error) {
      console.error('[Resend error]', result.error);
      throw new Error(result.error.message || 'Resend failed');
    }
    console.log(`[Resend] sent to ${to} id=${result.data?.id || 'ok'}`);
    return result;
  } catch (e) {
    console.error('[Resend] send failed:', e.message);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
app.post('/api/register', async (req, res) => {
  try {
    const { email, username, password } = req.body || {};
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username and password required' });
    }
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

    const emailNorm = email.trim().toLowerCase();
    if (await User.findOne({ email: emailNorm })) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    if (await User.findOne({ username: username.trim() })) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const user = await User.create({
      email: emailNorm,
      username: username.trim(),
      password_hash: bcrypt.hashSync(password, 10),
      notifications: { enabled: true, frequencyHours: 24, lastReminderAt: null },
    });

    // Accept pending invites for this email
    await TaskMember.updateMany(
      { email: emailNorm, user_id: null },
      { $set: { user_id: user._id, status: 'accepted', joined_at: new Date() } }
    );

    res.status(201).json({ token: signToken(user, true), user: publicUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const login = (req.body?.email || '').trim();
    const password = req.body?.password || '';
    const user =
      (await User.findOne({ email: login.toLowerCase() })) ||
      (await User.findOne({ username: login }));
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email/username or password' });
    }
    const rememberMe = req.body?.rememberMe !== false;
    res.json({ token: signToken(user, rememberMe), user: publicUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ user: publicUser(user) });
  } catch (e) {
    console.error('/api/me', e.message);
    return res.status(401).json({ error: 'Invalid or expired token — please log in again' });
  }
});

app.put('/api/me/notifications', auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { enabled, frequencyHours } = req.body || {};
  if (!user.notifications) user.notifications = { enabled: true, frequencyHours: 24 };
  if (typeof enabled === 'boolean') user.notifications.enabled = enabled;
  if (frequencyHours !== undefined) {
    const h = parseInt(frequencyHours, 10);
    if (![1, 6, 12, 24, 48, 72, 168].includes(h)) {
      return res.status(400).json({ error: 'frequencyHours must be 1, 6, 12, 24, 48, 72, or 168' });
    }
    user.notifications.frequencyHours = h;
  }
  await user.save();
  res.json({ user: publicUser(user) });
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
app.get('/api/categories', auth, async (req, res) => {
  const cats = await Category.find().sort({ created_at: -1 }).lean();
  const out = await Promise.all(
    cats.map(async (c) => {
      const creator = await User.findById(c.created_by).lean();
      const task_count = await Task.countDocuments({ category_id: c._id });
      return {
        id: c._id.toString(),
        name: c.name,
        description: c.description || '',
        created_by: c.created_by.toString(),
        creator: creator?.username || null,
        created_at: c.created_at,
        task_count,
      };
    })
  );
  res.json(out);
});

app.post('/api/categories', auth, async (req, res) => {
  const { name, description } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const cat = await Category.create({
    name: name.trim(),
    description: (description || '').trim(),
    created_by: req.user.id,
  });
  res.status(201).json({
    id: cat._id.toString(),
    name: cat.name,
    description: cat.description,
    created_by: cat.created_by.toString(),
    created_at: cat.created_at,
  });
});

app.delete('/api/categories/:id', auth, async (req, res) => {
  const cat = await Category.findById(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Not found' });
  if (cat.created_by.toString() !== req.user.id) {
    return res.status(403).json({ error: 'Only creator can delete' });
  }
  const tasks = await Task.find({ category_id: cat._id });
  for (const t of tasks) await deleteTaskCascade(t._id);
  await Category.deleteOne({ _id: cat._id });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Tasks + members
// ---------------------------------------------------------------------------
app.get('/api/tasks', auth, async (req, res) => {
  const { category_id } = req.query;
  const memberTaskIds = (
    await TaskMember.find({ user_id: req.user.id, status: 'accepted' }).select('task_id')
  ).map((m) => m.task_id);

  const filter = {
    $or: [{ created_by: req.user.id }, { _id: { $in: memberTaskIds } }],
  };
  if (category_id) filter.category_id = category_id;

  const tasks = await Task.find(filter).sort({ created_at: -1 });
  res.json(await Promise.all(tasks.map((t) => enrichTask(t))));
});

app.get('/api/tasks/:id', auth, async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (!(await canAccessTask(task, req.user.id))) {
    return res.status(403).json({ error: 'Not a member of this task' });
  }
  res.json(await enrichTask(task));
});

app.post('/api/tasks', auth, async (req, res) => {
  const { title, description, category_id } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
  if (!category_id) return res.status(400).json({ error: 'Category required' });
  const cat = await Category.findById(category_id);
  if (!cat) return res.status(400).json({ error: 'Category not found' });

  const me = await User.findById(req.user.id);
  const task = await Task.create({
    title: title.trim(),
    description: (description || '').trim(),
    category_id: cat._id,
    created_by: req.user.id,
  });
  await TaskMember.create({
    task_id: task._id,
    user_id: req.user.id,
    email: me.email,
    invited_by: req.user.id,
    status: 'accepted',
    joined_at: new Date(),
  });
  res.status(201).json(await enrichTask(task));
});

app.delete('/api/tasks/:id', auth, async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  if (task.created_by.toString() !== req.user.id) {
    return res.status(403).json({ error: 'Only creator can delete' });
  }
  await deleteTaskCascade(task._id);
  res.json({ ok: true });
});

app.post('/api/tasks/:id/members', auth, async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (!(await canAccessTask(task, req.user.id))) return res.status(403).json({ error: 'Not allowed' });

  const emailNorm = (req.body?.email || '').trim().toLowerCase();
  if (!emailNorm) return res.status(400).json({ error: 'Email required' });

  const existing = await TaskMember.findOne({ task_id: task._id, email: emailNorm });
  if (existing) return res.status(400).json({ error: 'Already a member or invited' });

  const existingUser = await User.findOne({ email: emailNorm });
  const member = await TaskMember.create({
    task_id: task._id,
    user_id: existingUser?._id || null,
    email: emailNorm,
    invited_by: req.user.id,
    status: existingUser ? 'accepted' : 'pending',
    joined_at: existingUser ? new Date() : null,
  });

  const inviter = await User.findById(req.user.id);
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
    id: member._id.toString(),
    user_id: member.user_id ? member.user_id.toString() : null,
    email: member.email,
    status: member.status,
    username: existingUser?.username || null,
  });
});

app.delete('/api/tasks/:taskId/members/:memberId', auth, async (req, res) => {
  const task = await Task.findById(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.created_by.toString() !== req.user.id) {
    return res.status(403).json({ error: 'Only creator can remove members' });
  }
  const member = await TaskMember.findOne({ _id: req.params.memberId, task_id: task._id });
  if (!member) return res.status(404).json({ error: 'Member not found' });
  if (member.user_id && member.user_id.toString() === task.created_by.toString()) {
    return res.status(400).json({ error: 'Cannot remove task creator' });
  }
  await TaskMember.deleteOne({ _id: member._id });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Work
// ---------------------------------------------------------------------------
app.post('/api/tasks/:id/works', auth, async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (!(await canAccessTask(task, req.user.id))) return res.status(403).json({ error: 'Not allowed' });

  const { title, description } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: 'Title required' });

  const work = await Work.create({
    task_id: task._id,
    title: title.trim(),
    description: (description || '').trim(),
    created_by: req.user.id,
  });

  const members = await TaskMember.find({ task_id: task._id, status: 'accepted', user_id: { $ne: null } });
  const memberUserIds = members.map((m) => m.user_id.toString());
  res.status(201).json(await enrichWork(work, memberUserIds));
});

app.delete('/api/works/:id', auth, async (req, res) => {
  const work = await Work.findById(req.params.id);
  if (!work) return res.status(404).json({ error: 'Not found' });
  const task = await Task.findById(work.task_id);
  if (!task || !(await canAccessTask(task, req.user.id))) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  await WorkCompletion.deleteMany({ work_id: work._id });
  await Work.deleteOne({ _id: work._id });
  res.json({ ok: true });
});

app.put('/api/works/:id/completion', auth, async (req, res) => {
  const work = await Work.findById(req.params.id);
  if (!work) return res.status(404).json({ error: 'Work not found' });
  const task = await Task.findById(work.task_id);
  if (!task || !(await canAccessTask(task, req.user.id))) {
    return res.status(403).json({ error: 'Not allowed' });
  }

  const { completed, notes, user_id } = req.body || {};
  let targetUserId = req.user.id;
  if (user_id && user_id !== req.user.id) {
    if (task.created_by.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Can only update your own completion' });
    }
    targetUserId = user_id;
  }

  let rec = await WorkCompletion.findOne({ work_id: work._id, user_id: targetUserId });
  const now = new Date();
  if (!rec) {
    rec = await WorkCompletion.create({
      work_id: work._id,
      user_id: targetUserId,
      completed: !!completed,
      completed_at: completed ? now : null,
      notes: (notes || '').trim(),
    });
  } else {
    if (completed !== undefined) {
      rec.completed = !!completed;
      rec.completed_at = rec.completed ? now : null;
    }
    if (notes !== undefined) rec.notes = (notes || '').trim();
    await rec.save();
  }

  const members = await TaskMember.find({ task_id: task._id, status: 'accepted', user_id: { $ne: null } });
  const memberUserIds = members.map((m) => m.user_id.toString());
  res.json(await enrichWork(work, memberUserIds));
});

// ---------------------------------------------------------------------------
// Dashboard / export / reminders
// ---------------------------------------------------------------------------
app.get('/api/dashboard', auth, async (req, res) => {
  const memberTaskIds = (
    await TaskMember.find({ user_id: req.user.id, status: 'accepted' }).select('task_id')
  ).map((m) => m.task_id);
  const tasks = await Task.find({
    $or: [{ created_by: req.user.id }, { _id: { $in: memberTaskIds } }],
  })
    .sort({ created_at: -1 })
    .limit(50);

  const enriched = await Promise.all(tasks.map((t) => enrichTask(t)));
  let myPending = 0;
  let myDone = 0;
  enriched.forEach((t) => {
    t.works.forEach((w) => {
      const mine = w.completions.find((c) => c.user_id === req.user.id);
      if (mine?.completed) myDone++;
      else myPending++;
    });
  });

  res.json({
    categories: await Category.countDocuments(),
    tasks: enriched.length,
    pending_work: myPending,
    completed_work: myDone,
    recent_tasks: enriched.slice(0, 8),
  });
});

app.get('/api/export/excel', auth, async (req, res) => {
  const memberTaskIds = (
    await TaskMember.find({ user_id: req.user.id, status: 'accepted' }).select('task_id')
  ).map((m) => m.task_id);
  const tasks = await Task.find({
    $or: [{ created_by: req.user.id }, { _id: { $in: memberTaskIds } }],
  });
  const enriched = await Promise.all(tasks.map((t) => enrichTask(t)));

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

  enriched.forEach((t) => {
    if (!t.works.length) {
      ws.addRow({
        category: t.category_name,
        task: t.title,
        work: '—',
        member: t.members.map((m) => m.username || m.email).join(', '),
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
          completed_at: c.completed_at ? new Date(c.completed_at).toISOString().slice(0, 19) : '',
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

async function runReminders() {
  const users = await User.find({ 'notifications.enabled': true });
  const now = Date.now();
  for (const user of users) {
    const prefs = user.notifications || { enabled: true, frequencyHours: 24 };
    if (!prefs.enabled) continue;
    const freqMs = (prefs.frequencyHours || 24) * 3600 * 1000;
    if (prefs.lastReminderAt && now - new Date(prefs.lastReminderAt).getTime() < freqMs) continue;

    const memberships = await TaskMember.find({ user_id: user._id, status: 'accepted' });
    const incomplete = [];
    for (const m of memberships) {
      const task = await Task.findById(m.task_id);
      if (!task) continue;
      const works = await Work.find({ task_id: task._id });
      for (const w of works) {
        const comp = await WorkCompletion.findOne({ work_id: w._id, user_id: user._id });
        if (!comp?.completed) incomplete.push({ task: task.title, work: w.title });
      }
    }
    if (!incomplete.length) continue;

    const lines = incomplete.map((i) => `• ${i.task} → ${i.work}`).join('\n');
    await sendEmail(
      user.email,
      `Reminder: ${incomplete.length} incomplete work item(s)`,
      `Hi ${user.username},\n\nYou have incomplete work:\n\n${lines}\n\nOpen ${APP_URL} to update.\n\n— Collab Tasks`
    );
    user.notifications.lastReminderAt = new Date();
    await user.save();
  }
}

setInterval(() => {
  runReminders().catch((e) => console.error('Reminder job error:', e));
}, 15 * 60 * 1000);

app.post('/api/reminders/run', auth, async (req, res) => {
  await runReminders();
  res.json({ ok: true, message: 'Reminder job ran (check server logs if RESEND_API_KEY not set)' });
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

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function start() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI);
  console.log('MongoDB connected');

  const count = await User.countDocuments();
  if (count === 0) {
    await User.create({
      email: 'admin@example.com',
      username: 'admin',
      password_hash: bcrypt.hashSync('admin123', 10),
      notifications: { enabled: true, frequencyHours: 24, lastReminderAt: null },
    });
    console.log('>>> Default admin: admin@example.com / admin123  (username: admin)');
  }

  const publicUrl =
    process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || `http://localhost:${PORT}`;
  app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(55));
    console.log(`  Collab Tasks API  →  ${publicUrl}`);
    console.log(`  Listening on port ${PORT}`);
    console.log(`  Default: admin@example.com / admin123`);
    console.log(`  Email: ${resend ? 'Resend configured' : 'MOCK (set RESEND_API_KEY)'}`);
    console.log('='.repeat(55));
  });
}

// Express error handler — avoid process crash on CastError etc.
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid id — please log in again or refresh' });
  }
  res.status(500).json({ error: 'Server error' });
});

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
