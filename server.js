
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

import cors from 'cors';
app.use(cors());

const DATA_FILE = path.join(__dirname, 'data.json');
let data = { users: [], posts: [], accessRequests: [] };

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      data.users = data.users || [];
      data.posts = data.posts || [];
      data.accessRequests = data.accessRequests || [];
      for (const u of data.users) { u.subscriptions = u.subscriptions || []; }
      for (const p of data.posts) {
        p.tags = p.tags || [];
        p.allowedUsers = p.allowedUsers || [];
        p.comments = p.comments || [];
      }
    } else {
      saveData();
    }
  } catch (e) { console.error('Failed to load data.json', e); }
}
function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
loadData();

const sessions = new Map(); // token -> userId
function requireAuth(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.slice('Bearer '.length);
  const userId = sessions.get(token);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = data.users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

app.use(express.static(path.join(__dirname, 'public')));

// Auth
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  if (data.users.find(u => u.username === username)) return res.status(400).json({ error: 'User exists' });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = { id: uuidv4(), username, passwordHash, subscriptions: [] };
  data.users.push(user);
  saveData();
  const token = uuidv4();
  sessions.set(token, user.id);
  res.json({ success: true, token, user: { id: user.id, username: user.username, subscriptions: user.subscriptions } });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = data.users.find(u => u.username === username);
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
  const token = uuidv4();
  sessions.set(token, user.id);
  res.json({ success: true, token, user: { id: user.id, username: user.username, subscriptions: user.subscriptions } });
});

app.post('/api/logout', requireAuth, (req, res) => {
  const token = req.headers['authorization'].slice('Bearer '.length);
  sessions.delete(token);
  res.json({ success: true });
});

// Users
app.get('/api/users', (req, res) => {
  res.json(data.users.map(u => ({ id: u.id, username: u.username })));
});

// Posts CRUD
app.post('/api/posts', requireAuth, (req, res) => {
  const { title, content, tags = [], visibility = 'public' } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Missing fields' });
  const post = {
    id: uuidv4(),
    authorId: req.user.id,
    author: req.user.username,
    title,
    content,
    tags: (Array.isArray(tags) ? tags : String(tags).split(',').map(s => s.trim()).filter(Boolean)),
    visibility: (visibility === 'request' ? 'request' : 'public'),
    allowedUsers: [],
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.posts.unshift(post);
  saveData();
  res.json({ success: true, post });
});

app.put('/api/posts/:id', requireAuth, (req, res) => {
  const post = data.posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (post.authorId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  const { title, content, tags, visibility } = req.body;
  if (title !== undefined) post.title = title;
  if (content !== undefined) post.content = content;
  if (tags !== undefined) post.tags = Array.isArray(tags) ? tags : String(tags).split(',').map(s => s.trim()).filter(Boolean);
  if (visibility !== undefined) post.visibility = (visibility === 'request' ? 'request' : 'public');
  post.updatedAt = new Date().toISOString();
  saveData();
  res.json({ success: true, post });
});

app.delete('/api/posts/:id', requireAuth, (req, res) => {
  const idx = data.posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (data.posts[idx].authorId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  data.posts.splice(idx, 1);
  saveData();
  res.json({ success: true });
});

// Публичная лента: видны все посты (и открытые, и закрытые)
app.get('/api/posts/public', (req, res) => {
  const posts = data.posts.map(p => {
    if (p.isPublic) {
      // Обычный публичный пост
      return p;
    } else {
      // Закрытый пост: скрываем контент, но показываем заглушку
      return {
        id: p.id,
        title: p.title,
        content: "🔒 Закрытый пост. Нажмите «Запросить доступ».",
        userId: p.userId,
        tags: p.tags || [],
        isPublic: false,
        isHidden: true
      };
    }
  });

  res.json(posts);
});

app.get('/api/posts/feed', requireAuth, (req, res) => {
  const subs = req.user.subscriptions || [];
  const uid = req.user.id;
  const list = data.posts.filter(p => {
    const authoredBySub = subs.includes(p.authorId);
    const mine = p.authorId === uid;
    if (!(authoredBySub || mine)) return false;
    if (p.visibility === 'public') return true;
    if (p.authorId === uid) return true;
    return p.allowedUsers.includes(uid);
  });
  res.json(list);
});

// Access requests
app.post('/api/posts/:id/request-access', requireAuth, (req, res) => {
  const post = data.posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (post.visibility !== 'request') return res.status(400).json({ error: 'Post is not restricted' });
  if (post.authorId === req.user.id) return res.status(400).json({ error: 'Author already has access' });
  if (post.allowedUsers.includes(req.user.id)) return res.status(400).json({ error: 'Already allowed' });
  if (data.accessRequests.find(r => r.postId === post.id && r.fromUserId === req.user.id && r.status === 'pending')) {
    return res.status(400).json({ error: 'Request already pending' });
  }
  const request = {
    id: uuidv4(),
    postId: post.id,
    fromUserId: req.user.id,
    toUserId: post.authorId,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  data.accessRequests.push(request);
  saveData();
  res.json({ success: true, request });
});

app.get('/api/requests', requireAuth, (req, res) => {
  const list = data.accessRequests
    .filter(r => r.toUserId === req.user.id && r.status === 'pending')
    .map(r => ({
      ...r,
      fromUser: (data.users.find(u => u.id === r.fromUserId)?.username || 'unknown'),
      postTitle: (data.posts.find(p => p.id === r.postId)?.title || 'unknown')
    }));
  res.json(list);
});

app.post('/api/requests/:id/approve', requireAuth, (req, res) => {
  const r = data.accessRequests.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (r.toUserId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  r.status = 'approved';
  const post = data.posts.find(p => p.id === r.postId);
  if (post && !post.allowedUsers.includes(r.fromUserId)) post.allowedUsers.push(r.fromUserId);
  saveData();
  res.json({ success: true });
});
app.post('/api/requests/:id/reject', requireAuth, (req, res) => {
  const r = data.accessRequests.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (r.toUserId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  r.status = 'rejected';
  saveData();
  res.json({ success: true });
});

// Subscriptions
app.post('/api/subscribe', requireAuth, (req, res) => {
  const { targetId } = req.body;
  const target = data.users.find(u => u.id === targetId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (!req.user.subscriptions.includes(targetId)) req.user.subscriptions.push(targetId);
  saveData();
  res.json({ success: true, subscriptions: req.user.subscriptions });
});
app.post('/api/unsubscribe', requireAuth, (req, res) => {
  const { targetId } = req.body;
  req.user.subscriptions = (req.user.subscriptions || []).filter(id => id !== targetId);
  saveData();
  res.json({ success: true, subscriptions: req.user.subscriptions });
});

// Comments
function canReadPost(user, post) {
  if (post.visibility === 'public') return true;
  if (!user) return false;
  if (post.authorId === user.id) return true;
  return post.allowedUsers.includes(user.id);
}
app.get('/api/posts/:id/comments', (req, res) => {
  const post = data.posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (!canReadPost(null, post)) {
    const auth = req.headers['authorization'];
    if (auth && auth.startsWith('Bearer ')) {
      const token = auth.slice('Bearer '.length);
      const userId = sessions.get(token);
      const user = data.users.find(u => u.id === userId);
      if (!canReadPost(user, post)) return res.status(403).json({ error: 'Forbidden' });
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  res.json(post.comments || []);
});
app.post('/api/posts/:id/comments', requireAuth, (req, res) => {
  const post = data.posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (!canReadPost(req.user, post)) return res.status(403).json({ error: 'Forbidden' });
  post.comments = post.comments || [];
  const c = {
    id: uuidv4(),
    userId: req.user.id,
    username: req.user.username,
    text: String(req.body.text || '').slice(0, 1000),
    createdAt: new Date().toISOString()
  };
  post.comments.push(c);
  saveData();
  res.json({ success: true, comment: c });
});

// Seed demo data (first run)
if (data.users.length === 0 && data.posts.length === 0) {
  (async () => {
    const alice = { id: uuidv4(), username: 'alice', passwordHash: await bcrypt.hash('alice', 10), subscriptions: [] };
    const bob   = { id: uuidv4(), username: 'bob',   passwordHash: await bcrypt.hash('bob', 10),   subscriptions: [] };
    const carol = { id: uuidv4(), username: 'carol', passwordHash: await bcrypt.hash('carol', 10), subscriptions: [] };
    data.users.push(alice, bob, carol);
    data.posts.push({
      id: uuidv4(),
      authorId: bob.id, author: bob.username,
      title: 'Публичный пост Боба',
      content: 'Это публичный пост, доступен всем, даже гостям.',
      tags: ['news','public'],
      visibility: 'public', allowedUsers: [], comments: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    data.posts.push({
      id: uuidv4(),
      authorId: carol.id, author: carol.username,
      title: 'Скрытый пост Кэрол',
      content: 'Этот пост виден только по запросу.',
      tags: ['secret'],
      visibility: 'request', allowedUsers: [], comments: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    alice.subscriptions.push(bob.id);
    saveData();
  })();
}

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server listening on http://localhost:' + PORT));

// Подписаться на пользователя
app.post('/api/subscribe', requireAuth, (req, res) => {
  const { targetId } = req.body;
  const user = data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (!user.subscriptions) user.subscriptions = [];
  if (!user.subscriptions.includes(targetId)) {
    user.subscriptions.push(targetId);
    saveData();
  }

  res.json({ success: true });
});

// Отписаться от пользователя
app.post('/api/unsubscribe', requireAuth, (req, res) => {
  const { targetId } = req.body;
  const user = data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.subscriptions = (user.subscriptions || []).filter(id => id !== targetId);
  saveData();

  res.json({ success: true });
});

// =========================
// Лента по подпискам
// =========================
app.get('/api/feed', requireAuth, (req, res) => {
  const user = data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const subscribedPosts = data.posts.filter(p =>
    (user.subscriptions || []).includes(p.userId)
  );

  res.json(subscribedPosts);
});

// =========================
// Фильтрация по тегам
// =========================
app.get('/api/posts/tag/:tag', (req, res) => {
  const tag = req.params.tag.toLowerCase();
  const filtered = data.posts.filter(p =>
    p.tags && p.tags.some(t => t.toLowerCase() === tag)
  );
  res.json(filtered);
});
