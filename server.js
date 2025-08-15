import express from 'express';
import fs from 'fs';
import path from 'path';
import bodyParser from 'body-parser';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

const __dirname = path.resolve();
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Создаем папку data и файл users.json, если их нет
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}

// Загрузка пользователей
function loadUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            fs.writeFileSync(USERS_FILE, JSON.stringify([]));
            return [];
        }
        const data = fs.readFileSync(USERS_FILE, 'utf-8');
        return data ? JSON.parse(data) : [];
    } catch (err) {
        console.error('Ошибка загрузки пользователей:', err);
        return [];
    }
}

// Сохранение пользователей
function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Поиск пользователя по имени
function uByName(name) {
    const users = loadUsers();
    return users.find(u => u.username === name);
}

// Маршрут регистрации
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Имя пользователя и пароль обязательны' });
    }
    const users = loadUsers();
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ message: 'Пользователь уже существует' });
    }
    users.push({ username, password });
    saveUsers(users);
    res.json({ message: 'Регистрация успешна' });
});

// Маршрут входа
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = uByName(username);
    if (!user || user.password !== password) {
        return res.status(401).json({ message: 'Неверное имя пользователя или пароль' });
    }
    res.json({ message: 'Вход выполнен успешно' });
});

app.listen(PORT, () => console.log(`Сервер запущен на http://localhost:${PORT}`));
