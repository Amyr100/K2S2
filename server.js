import express from "express";
import fs from "fs";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const app = express();
app.use(express.json());

const SECRET = "supersecret";
const DATA_FILE = "data.json";

let { users, posts } = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));

// Сохранение данных
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ users, posts }, null, 2));
}

// ====== Middleware ======
function auth(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "Нет токена" });
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, SECRET);
    const user = users.find((u) => u.username === decoded.username);
    if (!user) return res.status(401).json({ error: "Неверный токен" });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Ошибка токена" });
  }
}

function authOptional(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (authHeader) {
    try {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, SECRET);
      const user = users.find((u) => u.username === decoded.username);
      if (user) req.user = user;
    } catch (err) {
      // игнорируем ошибки
    }
  }
  next();
}

// ====== Роуты ======

// Регистрация
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (users.find((u) => u.username === username)) {
    return res.status(400).json({ error: "Пользователь уже существует" });
  }
  const hashed = await bcrypt.hash(password, 10);
  const newUser = { username, password: hashed, subscriptions: [] };
  users.push(newUser);
  saveData();
  res.json({ success: true });
});

// Логин
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = users.find((u) => u.username === username);
  if (!user) return res.status(400).json({ error: "Нет такого пользователя" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: "Неверный пароль" });

  const token = jwt.sign({ username: user.username }, SECRET);
  res.json({ token });
});

// Получение всех постов (с фильтрацией по тегам)
app.get("/posts", authOptional, (req, res) => {
  let result = posts;
  if (req.query.tag) {
    result = result.filter((p) => p.tags && p.tags.includes(req.query.tag));
  }
  res.json(result);
});

// Подписки
app.get("/subscriptions", auth, (req, res) => {
  const subs = req.user.subscriptions || [];
  const visiblePosts = posts.filter((p) => subs.includes(p.author));
  res.json(visiblePosts);
});

app.post("/subscribe/:username", auth, (req, res) => {
  const target = req.params.username;
  if (!req.user.subscriptions) req.user.subscriptions = [];
  if (!req.user.subscriptions.includes(target)) {
    req.user.subscriptions.push(target);
  }
  saveData();
  res.json({ success: true, subscriptions: req.user.subscriptions });
});

app.post("/unsubscribe/:username", auth, (req, res) => {
  const target = req.params.username;
  if (!req.user.subscriptions) req.user.subscriptions = [];
  req.user.subscriptions = req.user.subscriptions.filter((u) => u !== target);
  saveData();
  res.json({ success: true, subscriptions: req.user.subscriptions });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
