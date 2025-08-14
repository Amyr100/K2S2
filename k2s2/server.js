import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || "dev-change-this-secret";
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "data.db");

sqlite3.verbose();
const db = new sqlite3.Database(DB_PATH);

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const run = (sql, params=[]) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve(this);
  });
});
const get = (sql, params=[]) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});
const all = (sql, params=[]) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

async function migrate() {
  await run(`PRAGMA foreign_keys = ON;`);
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );`);
  await run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    visibility TEXT NOT NULL CHECK (visibility IN ('public','request')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(author_id) REFERENCES users(id) ON DELETE CASCADE
  );`);
  await run(`CREATE TABLE IF NOT EXISTS post_tags (
    post_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
  );`);
  await run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY(author_id) REFERENCES users(id) ON DELETE CASCADE
  );`);
  await run(`CREATE TABLE IF NOT EXISTS subscriptions (
    follower_id INTEGER NOT NULL,
    followee_id INTEGER NOT NULL,
    UNIQUE(follower_id, followee_id),
    FOREIGN KEY(follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(followee_id) REFERENCES users(id) ON DELETE CASCADE
  );`);
  await run(`CREATE TABLE IF NOT EXISTS access_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    requester_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')),
    created_at INTEGER NOT NULL,
    FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY(requester_id) REFERENCES users(id) ON DELETE CASCADE
  );`);

  const user = await get(`SELECT id FROM users WHERE username = ?`, ["alice"]);
  if (!user) {
    const now = Date.now();
    const passAlice = bcrypt.hashSync("alice", 10);
    const passBob = bcrypt.hashSync("bob", 10);
    const passCarol = bcrypt.hashSync("carol", 10);
    const alice = await run(`INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)`, ["alice", passAlice, now]);
    const bob = await run(`INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)`, ["bob", passBob, now]);
    const carol = await run(`INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)`, ["carol", passCarol, now]);

    const aliceId = alice.lastID;
    const bobId = bob.lastID;
    const carolId = carol.lastID;

    const p1 = await run(`INSERT INTO posts (author_id, title, content, visibility, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      [aliceId, "Привет, это публичный пост", "Это пример публичного поста. Его видят все пользователи.", "public", now-86400000, now-86400000]);
    await run(`INSERT INTO post_tags (post_id, tag) VALUES (?,?), (?,?)`,
      [p1.lastID, "intro", p1.lastID, "demo"]);

    const p2 = await run(`INSERT INTO posts (author_id, title, content, visibility, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      [bobId, "Скрытый пост по запросу", "Секретное содержимое — увидит только автор и одобренные пользователи.", "request", now-43200000, now-43200000]);
    await run(`INSERT INTO post_tags (post_id, tag) VALUES (?,?), (?,?)`,
      [p2.lastID, "secret", p2.lastID, "demo"]);

    const p3 = await run(`INSERT INTO posts (author_id, title, content, visibility, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      [carolId, "Пост про теги", "Добавляйте теги и фильтруйте ленту.", "public", now-1800000, now-1800000]);
    await run(`INSERT INTO post_tags (post_id, tag) VALUES (?,?), (?,?)`,
      [p3.lastID, "tags", p3.lastID, "howto"]);

    await run(`INSERT INTO subscriptions (follower_id, followee_id) VALUES (?,?)`, [aliceId, bobId]);
  }
}

function sign(user) {
  return jwt.sign({ uid: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "no_token" });
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = { id: data.uid, username: data.username };
    next();
  } catch (e) {
    return res.status(401).json({ error: "bad_token" });
  }
}

function canViewPost(post, viewerId) {
  if (post.visibility === "public") return true;
  if (post.author_id === viewerId) return true;
  return false;
}

async function canViewPostWithRequests(postId, viewerId) {
  const post = await get(`SELECT * FROM posts WHERE id = ?`, [postId]);
  if (!post) return false;
  if (post.visibility === "public") return true;
  if (post.author_id === viewerId) return true;
  const reqRow = await get(`SELECT status FROM access_requests WHERE post_id = ? AND requester_id = ? ORDER BY id DESC LIMIT 1`, [postId, viewerId]);
  return reqRow?.status === "approved";
}

app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "missing_fields" });
    const exists = await get(`SELECT id FROM users WHERE username = ?`, [username]);
    if (exists) return res.status(409).json({ error: "user_exists" });
    const hash = bcrypt.hashSync(String(password), 10);
    const now = Date.now();
    const r = await run(`INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)`, [username, hash, now]);
    const user = { id: r.lastID, username };
    res.json({ user: { id: user.id, username: user.username }, token: sign(user) });
  } catch (e) { res.status(500).json({ error: "server_error" }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await get(`SELECT * FROM users WHERE username = ?`, [username]);
    if (!user) return res.status(401).json({ error: "invalid_credentials" });
    const ok = bcrypt.compareSync(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });
    res.json({ user: { id: user.id, username: user.username }, token: sign(user) });
  } catch { res.status(500).json({ error: "server_error" }); }
});

app.get("/api/me", auth, async (req, res) => {
  res.json({ user: { id: req.user.id, username: req.user.username } });
});

app.get("/api/users", auth, async (req, res) => {
  const rows = await all(`SELECT id, username, created_at FROM users ORDER BY id ASC`);
  res.json({ users: rows });
});

app.post("/api/subscribe/:id", auth, async (req, res) => {
  const to = Number(req.params.id);
  if (to === req.user.id) return res.status(400).json({ error: "cannot_follow_self" });
  await run(`INSERT OR IGNORE INTO subscriptions (follower_id, followee_id) VALUES (?,?)`, [req.user.id, to]);
  res.json({ ok: true });
});

app.delete("/api/subscribe/:id", auth, async (req, res) => {
  const to = Number(req.params.id);
  await run(`DELETE FROM subscriptions WHERE follower_id = ? AND followee_id = ?`, [req.user.id, to]);
  res.json({ ok: true });
});

app.get("/api/posts/public", async (req, res) => {
  const tag = req.query.tag;
  let sql = `SELECT p.*, u.username AS author_name FROM posts p JOIN users u ON u.id = p.author_id WHERE p.visibility = 'public'`;
  const params = [];
  if (tag) {
    sql += ` AND EXISTS (SELECT 1 FROM post_tags t WHERE t.post_id = p.id AND t.tag = ?)`;
    params.push(tag);
  }
  sql += ` ORDER BY p.created_at DESC`;
  const rows = await all(sql, params);
  const posts = await Promise.all(rows.map(async (p) => {
    const tags = await all(`SELECT tag FROM post_tags WHERE post_id = ?`, [p.id]);
    const comments = await all(`SELECT c.*, u.username AS author_name FROM comments c JOIN users u ON u.id = c.author_id WHERE c.post_id = ? ORDER BY c.created_at ASC`, [p.id]);
    return { ...p, tags: tags.map(x=>x.tag), comments };
  }));
  res.json({ posts });
});

app.get("/api/posts/feed", auth, async (req, res) => {
  const rows = await all(`
    SELECT p.*, u.username AS author_name
    FROM posts p
    JOIN users u ON u.id = p.author_id
    WHERE p.author_id IN (SELECT followee_id FROM subscriptions WHERE follower_id = ?)
    ORDER BY p.created_at DESC
  `, [req.user.id]);
  const filtered = [];
  for (const p of rows) {
    const can = await canViewPostWithRequests(p.id, req.user.id);
    if (can) {
      const tags = await all(`SELECT tag FROM post_tags WHERE post_id = ?`, [p.id]);
      const comments = await all(`SELECT c.*, u.username AS author_name FROM comments c JOIN users u ON u.id = c.author_id WHERE c.post_id = ? ORDER BY c.created_at ASC`, [p.id]);
      filtered.push({ ...p, tags: tags.map(x=>x.tag), comments });
    }
  }
  res.json({ posts: filtered });
});

app.get("/api/posts/mine", auth, async (req, res) => {
  const rows = await all(`SELECT p.*, u.username AS author_name FROM posts p JOIN users u ON u.id = p.author_id WHERE p.author_id = ? ORDER BY p.created_at DESC`, [req.user.id]);
  const posts = await Promise.all(rows.map(async (p) => {
    const tags = await all(`SELECT tag FROM post_tags WHERE post_id = ?`, [p.id]);
    const comments = await all(`SELECT c.*, u.username AS author_name FROM comments c JOIN users u ON u.id = c.author_id WHERE c.post_id = ? ORDER BY c.created_at ASC`, [p.id]);
    return { ...p, tags: tags.map(x=>x.tag), comments };
  }));
  res.json({ posts });
});

app.post("/api/posts", auth, async (req, res) => {
  const { title, content, visibility, tags } = req.body;
  if (!title || !content) return res.status(400).json({ error: "missing_fields" });
  const vis = visibility === "request" ? "request" : "public";
  const now = Date.now();
  const r = await run(`INSERT INTO posts (author_id, title, content, visibility, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
    [req.user.id, title.trim(), content.trim(), vis, now, now]);
  const postId = r.lastID;
  if (Array.isArray(tags)) {
    for (const t of tags.map(x=>String(x).trim()).filter(Boolean)) {
      await run(`INSERT INTO post_tags (post_id, tag) VALUES (?,?)`, [postId, t]);
    }
  }
  const post = await get(`SELECT p.*, u.username AS author_name FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?`, [postId]);
  const tagsRow = await all(`SELECT tag FROM post_tags WHERE post_id = ?`, [postId]);
  res.json({ post: { ...post, tags: tagsRow.map(x=>x.tag), comments: [] } });
});

app.put("/api/posts/:id", auth, async (req, res) => {
  const id = Number(req.params.id);
  const post = await get(`SELECT * FROM posts WHERE id = ?`, [id]);
  if (!post) return res.status(404).json({ error: "not_found" });
  if (post.author_id !== req.user.id) return res.status(403).json({ error: "forbidden" });
  const { title, content, visibility, tags } = req.body;
  const vis = visibility === "request" ? "request" : "public";
  const now = Date.now();
  await run(`UPDATE posts SET title = ?, content = ?, visibility = ?, updated_at = ? WHERE id = ?`, [title.trim(), content.trim(), vis, now, id]);
  await run(`DELETE FROM post_tags WHERE post_id = ?`, [id]);
  if (Array.isArray(tags)) {
    for (const t of tags.map(x=>String(x).trim()).filter(Boolean)) {
      await run(`INSERT INTO post_tags (post_id, tag) VALUES (?,?)`, [id, t]);
    }
  }
  res.json({ ok: true });
});

app.delete("/api/posts/:id", auth, async (req, res) => {
  const id = Number(req.params.id);
  const post = await get(`SELECT * FROM posts WHERE id = ?`, [id]);
  if (!post) return res.status(404).json({ error: "not_found" });
  if (post.author_id !== req.user.id) return res.status(403).json({ error: "forbidden" });
  await run(`DELETE FROM posts WHERE id = ?`, [id]);
  res.json({ ok: true });
});

app.post("/api/posts/:id/comments", auth, async (req, res) => {
  const id = Number(req.params.id);
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "missing_fields" });
  const can = await canViewPostWithRequests(id, req.user.id);
  if (!can) return res.status(403).json({ error: "forbidden" });
  const now = Date.now();
  await run(`INSERT INTO comments (post_id, author_id, content, created_at) VALUES (?,?,?,?)`, [id, req.user.id, content.trim(), now]);
  res.json({ ok: true });
});

app.post("/api/posts/:id/request-access", auth, async (req, res) => {
  const id = Number(req.params.id);
  const post = await get(`SELECT * FROM posts WHERE id = ?`, [id]);
  if (!post) return res.status(404).json({ error: "not_found" });
  const now = Date.now();
  const last = await get(`SELECT status FROM access_requests WHERE post_id = ? AND requester_id = ? ORDER BY id DESC LIMIT 1`, [id, req.user.id]);
  if (last && last.status === "pending") return res.json({ ok: true });
  await run(`INSERT INTO access_requests (post_id, requester_id, status, created_at) VALUES (?,?,?,?)`, [id, req.user.id, "pending", now]);
  res.json({ ok: true });
});

app.get("/api/requests", auth, async (req, res) => {
  const rows = await all(`
    SELECT r.*, p.title AS post_title, p.author_id, u.username AS requester_name
    FROM access_requests r
    JOIN posts p ON p.id = r.post_id
    JOIN users u ON u.id = r.requester_id
    WHERE p.author_id = ? AND r.status = 'pending'
    ORDER BY r.created_at DESC
  `, [req.user.id]);
  res.json({ requests: rows });
});

app.post("/api/requests/:id/resolve", auth, async (req, res) => {
  const id = Number(req.params.id);
  const { approve } = req.body;
  const r = await get(`
    SELECT r.*, p.author_id FROM access_requests r
    JOIN posts p ON p.id = r.post_id
    WHERE r.id = ?
  `, [id]);
  if (!r) return res.status(404).json({ error: "not_found" });
  if (r.author_id !== req.user.id) return res.status(403).json({ error: "forbidden" });
  await run(`UPDATE access_requests SET status = ? WHERE id = ?`, [approve ? "approved" : "rejected", id]);
  res.json({ ok: true });
});

app.get("/api/posts/:id", auth, async (req, res) => {
  const id = Number(req.params.id);
  const can = await canViewPostWithRequests(id, req.user.id);
  if (!can) return res.status(403).json({ error: "forbidden" });
  const p = await get(`SELECT p.*, u.username AS author_name FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?`, [id]);
  if (!p) return res.status(404).json({ error: "not_found" });
  const tags = await all(`SELECT tag FROM post_tags WHERE post_id = ?`, [id]);
  const comments = await all(`SELECT c.*, u.username AS author_name FROM comments c JOIN users u ON u.id = c.author_id WHERE c.post_id = ? ORDER BY c.created_at ASC`, [id]);
  res.json({ post: { ...p, tags: tags.map(x=>x.tag), comments } });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

migrate().then(() => {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}).catch(err => {
  console.error("Migration failed", err);
  process.exit(1);
});
