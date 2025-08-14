const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static('public'));

// In-memory storage
let users = [];
let posts = [];

// Register
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  if (users.find(u => u.username === username)) return res.status(400).json({ error: 'User exists' });

  const hashed = await bcrypt.hash(password, 10);
  users.push({ id: uuidv4(), username, password: hashed });
  res.json({ success: true });
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username);
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ error: 'Invalid credentials' });
  res.json({ success: true, userId: user.id, username: user.username });
});

// Create post
app.post('/api/posts', (req, res) => {
  const { userId, title, content, tags } = req.body;
  if (!userId || !title || !content) return res.status(400).json({ error: 'Missing fields' });
  posts.push({ id: uuidv4(), userId, title, content, tags: tags || [], date: new Date() });
  res.json({ success: true });
});

// Get all posts
app.get('/api/posts', (req, res) => {
  res.json(posts);
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
