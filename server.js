import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const DATA_FILE = path.join(__dirname, 'data.json');

let db = {
  users: [],
  posts: [],
};

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      db = JSON.parse(raw);
      if (!db.users) db.users = [];
      if (!db.posts) db.posts = [];
    } catch (e) {
      console.error('Failed to read data.json, starting fresh', e);
      db = { users: [], posts: [] };
    }
  }
}
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function publicUser(u) {
  return { id: u.id, username: u.username, subscriptions: u.subscriptions || [] };
}

function canViewPost(post, viewerId) {
  if (post.visibility === 'public') return true;
  if (!viewerId) return false;
  if (post.userId === viewerId) return true;
  // request-only: allowedUsers contains viewerId
  return (post.allowedUsers || []).includes(viewerId);
}

loadData();

// Seed some demo users/posts if empty
if (db.users.length === 0) {
  const seed = async () => {
    const aliceId = uuidv4();
    const bobId = uuidv4();
    const carolId = uuidv4();
    db.users.push(
      { id: aliceId, username: 'alice', passwordHash: await bcrypt.hash('alice', 10), subscriptions: [bobId] },
      { id: bobId, username: 'bob', passwordHash: await bcrypt.hash('bob', 10), subscriptions: [] },
      { id: carolId, username: 'carol', passwordHash: await bcrypt.hash('carol', 10), subscriptions: [] },
    );
    const now = new Date().toISOString();
    db.posts.push(
      { id: uuidv4(), userId: bobId, title: 'Welcome to the blog', content: 'This is a public post by Bob. 🎉',
        tags: ['intro','public'], visibility: 'public', allowedUsers: [], pendingRequests: [], createdAt: now, updatedAt: now },
      { id: uuidv4(), userId: bobId, title: 'Hidden gems', content: 'This is a request-only post by Bob. Ask for access. 🔒',
        tags: ['hidden','gems'], visibility: 'request', allowedUsers: [aliceId], pendingRequests: [], createdAt: now, updatedAt: now },
    );
    saveData();
  };
  await seed();
}

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Auth ----------
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase()))
    return res.status(400).json({ error: 'User exists' });
  const passwordHash = await bcrypt.hash(password, 10);
  const newUser = { id: uuidv4(), username, passwordHash, subscriptions: [] };
  db.users.push(newUser);
  saveData();
  res.json({ success: true, user: publicUser(newUser) });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  const user = db.users.find(u => u.username.toLowerCase() === (username||'').toLowerCase());
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password || '', user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
  res.json({ success: true, user: publicUser(user) });
});

app.get('/api/users', (req, res) => {
  res.json(db.users.map(publicUser));
});

// ---------- Subscriptions ----------
app.post('/api/subscribe', (req, res) => {
  const { userId, targetId } = req.body || {};
  const user = db.users.find(u => u.id === userId);
  const target = db.users.find(u => u.id === targetId);
  if (!user || !target) return res.status(400).json({ error: 'User not found' });
  user.subscriptions = user.subscriptions || [];
  if (!user.subscriptions.includes(targetId)) user.subscriptions.push(targetId);
  saveData();
  res.json({ success: true, subscriptions: user.subscriptions });
});

app.post('/api/unsubscribe', (req, res) => {
  const { userId, targetId } = req.body || {};
  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(400).json({ error: 'User not found' });
  user.subscriptions = (user.subscriptions || []).filter(id => id !== targetId);
  saveData();
  res.json({ success: true, subscriptions: user.subscriptions });
});

app.get('/api/feed/:userId', (req, res) => {
  const { userId } = req.params;
  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(400).json({ error: 'User not found' });
  const subs = user.subscriptions || [];
  const list = db.posts
    .filter(p => subs.includes(p.userId) && canViewPost(p, userId))
    .sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});

// ---------- Posts ----------
app.get('/api/posts/public', (req, res) => {
  const qTag = (req.query.tag || '').toString().trim().toLowerCase();
  let list = db.posts.filter(p => p.visibility === 'public');
  if (qTag) list = list.filter(p => (p.tags||[]).some(t => t.toLowerCase() === qTag));
  list = list.sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});

app.get('/api/posts/visible/:viewerId?', (req, res) => {
  const viewerId = req.params.viewerId || null;
  const qTag = (req.query.tag || '').toString().trim().toLowerCase();
  let list = db.posts.filter(p => canViewPost(p, viewerId));
  if (qTag) list = list.filter(p => (p.tags||[]).some(t => t.toLowerCase() === qTag));
  list = list.sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});

app.post('/api/posts', (req, res) => {
  const { userId, title, content, tags, visibility } = req.body || {};
  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(400).json({ error: 'User not found' });
  if (!title || !content) return res.status(400).json({ error: 'Missing fields' });
  const now = new Date().toISOString();
  const post = {
    id: uuidv4(),
    userId,
    title,
    content,
    tags: Array.isArray(tags) ? tags : [],
    visibility: visibility === 'request' ? 'request' : 'public',
    allowedUsers: [],
    pendingRequests: [],
    createdAt: now,
    updatedAt: now,
  };
  db.posts.push(post);
  saveData();
  res.json({ success: true, post });
});

app.put('/api/posts/:postId', (req, res) => {
  const { postId } = req.params;
  const { userId, title, content, tags, visibility } = req.body || {};
  const post = db.posts.find(p => p.id === postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.userId !== userId) return res.status(403).json({ error: 'Not the author' });
  if (title !== undefined) post.title = title;
  if (content !== undefined) post.content = content;
  if (tags !== undefined) post.tags = Array.isArray(tags) ? tags : [];
  if (visibility !== undefined) post.visibility = visibility === 'request' ? 'request' : 'public';
  post.updatedAt = new Date().toISOString();
  saveData();
  res.json({ success: true, post });
});

app.delete('/api/posts/:postId', (req, res) => {
  const { postId } = req.params;
  const { userId } = req.body || {};
  const idx = db.posts.findIndex(p => p.id === postId);
  if (idx === -1) return res.status(404).json({ error: 'Post not found' });
  if (db.posts[idx].userId !== userId) return res.status(403).json({ error: 'Not the author' });
  db.posts.splice(idx, 1);
  saveData();
  res.json({ success: true });
});

// ---------- Access Requests for request-only posts ----------
app.post('/api/request-access', (req, res) => {
  const { userId, postId } = req.body || {};
  const post = db.posts.find(p => p.id === postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.visibility !== 'request') return res.status(400).json({ error: 'Not a request-only post' });
  post.pendingRequests = post.pendingRequests || [];
  if (!post.pendingRequests.includes(userId) && !(post.allowedUsers||[]).includes(userId)) {
    post.pendingRequests.push(userId);
    saveData();
  }
  res.json({ success: true, pendingRequests: post.pendingRequests });
});

// List requests for posts owned by user
app.get('/api/requests/:ownerId', (req, res) => {
  const { ownerId } = req.params;
  const owned = db.posts.filter(p => p.userId === ownerId && (p.pendingRequests||[]).length > 0);
  res.json(owned.map(p => ({
    postId: p.id,
    title: p.title,
    pendingRequests: p.pendingRequests
  })));
});

// Approve / deny request
app.post('/api/requests/resolve', (req, res) => {
  const { ownerId, postId, requesterId, approve } = req.body || {};
  const post = db.posts.find(p => p.id === postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.userId !== ownerId) return res.status(403).json({ error: 'Not the owner' });
  post.pendingRequests = (post.pendingRequests || []).filter(id => id !== requesterId);
  if (approve) {
    post.allowedUsers = post.allowedUsers || [];
    if (!post.allowedUsers.includes(requesterId)) post.allowedUsers.push(requesterId);
  }
  saveData();
  res.json({ success: true, allowedUsers: post.allowedUsers, pendingRequests: post.pendingRequests });
});

// ---------- Comments ----------
app.get('/api/posts/:postId/comments', (req, res) => {
  const { postId } = req.params;
  const post = db.posts.find(p => p.id === postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json(post.comments || []);
});

app.post('/api/posts/:postId/comments', (req, res) => {
  const { postId } = req.params;
  const { userId, content } = req.body || {};
  const post = db.posts.find(p => p.id === postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!canViewPost(post, userId)) return res.status(403).json({ error: 'No access' });
  if (!content) return res.status(400).json({ error: 'Empty comment' });
  post.comments = post.comments || [];
  post.comments.push({ id: uuidv4(), userId, content, createdAt: new Date().toISOString() });
  saveData();
  res.json({ success: true });
});

// ---------- Tags ----------
app.get('/api/tags', (req, res) => {
  const set = new Set();
  db.posts.forEach(p => (p.tags||[]).forEach(t => set.add(t)));
  res.json([...set].sort((a,b)=> a.localeCompare(b)));
});

// Fallback to SPA index
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
});
