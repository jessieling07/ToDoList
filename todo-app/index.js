const cors = require('cors');

const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

const app = express();
app.use(express.json());



app.use(cors());
app.use(express.static(path.join(__dirname, 'public'))) // Serve static files from the "public" directory

// Connect to MySQL
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Jessie@008',
  database: 'todo_app'
});

db.connect((err) => {
  if (err) {
    console.log('Database connection failed:', err);
    return;
  }
  console.log('Connected to MySQL!');
});

// Create tasks table if it doesn't exist
const createTable = `
  CREATE TABLE IF NOT EXISTS tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    completed BOOLEAN DEFAULT false
  )
`;

db.query(createTable, (err) => {
  if (err) {
    console.log('Error creating table:', err);
    return;
  }
  console.log('Tasks table ready!');
});

const createUsersTable = `
  CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL
  )
`;

db.query(`CREATE TABLE IF NOT EXISTS notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  userId INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`, (err) => { if (err) console.log('Notes error:', err); else console.log('Notes table ready!'); });

db.query(`CREATE TABLE IF NOT EXISTS files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  originalname VARCHAR(255) NOT NULL,
  userId INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`, (err) => { if (err) console.log('Files error:', err); else console.log('Files table ready!'); });

db.query(`CREATE TABLE IF NOT EXISTS events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  userId INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`, (err) => { if (err) console.log('Events error:', err); else console.log('Events table ready!'); });

db.query(createUsersTable, (err) => {
  if (err) {
    console.log('Error creating users table:', err);
    return;
  }
  console.log('Users table ready!');
});

// Middleware to verify token
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.userId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};


// GET all tasks for logged in user
app.get('/tasks', authenticate, (req, res) => {
  db.query('SELECT * FROM tasks WHERE userId = ?', [req.userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// POST a new task for logged in user
app.post('/tasks', authenticate, (req, res) => {
  const { title } = req.body;
  db.query('INSERT INTO tasks (title, userId) VALUES (?, ?)', [title, req.userId], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: result.insertId, title, completed: false });
  });
});

// PUT (update) a task
app.put('/tasks/:id', authenticate, (req, res) => {
  const { completed } = req.body;
  db.query('UPDATE tasks SET completed = ? WHERE id = ? AND userId = ?', [completed, req.params.id, req.userId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Task updated!' });
  });
});

// DELETE a task
app.delete('/tasks/:id', authenticate, (req, res) => {
  db.query('DELETE FROM tasks WHERE id = ? AND userId = ?', [req.params.id, req.userId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Task deleted!' });
  });
});

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const SECRET_KEY = 'your_secret_key'; // change this to anything secret

app.get('/', (req, res) => {
   res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// SIGNUP
app.post('/signup', async (req, res) => {
  const { email, password, username} = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  db.query('INSERT INTO users (email, password, username) VALUES (?, ?, ?)', [email, hashedPassword, username], (err, result) => {
    if (err) return res.status(500).json({ error: 'Email already exists' });
    res.json({ message: 'Account created!' });
  });
});

// LOGIN
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err || results.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1d' });
    res.json({ token });
  });
});

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// NOTES
app.get('/notes', authenticate, (req, res) => {
  db.query('SELECT * FROM notes WHERE userId = ? ORDER BY created_at DESC', [req.userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/notes', authenticate, (req, res) => {
  const { title, content } = req.body;
  db.query('INSERT INTO notes (title, content, userId) VALUES (?, ?, ?)', [title, content, req.userId], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: result.insertId, title, content });
  });
});

app.delete('/notes/:id', authenticate, (req, res) => {
  db.query('DELETE FROM notes WHERE id = ? AND userId = ?', [req.params.id, req.userId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Note deleted' });
  });
});

// FILES
app.get('/files', authenticate, (req, res) => {
  db.query('SELECT * FROM files WHERE userId = ? ORDER BY created_at DESC', [req.userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/files', authenticate, upload.single('file'), (req, res) => {
  const { filename, originalname } = req.file;
  db.query('INSERT INTO files (filename, originalname, userId) VALUES (?, ?, ?)', [filename, originalname, req.userId], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: result.insertId, filename, originalname });
  });
});

app.delete('/files/:id', authenticate, (req, res) => {
  db.query('SELECT * FROM files WHERE id = ? AND userId = ?', [req.params.id, req.userId], (err, results) => {
    if (err || results.length === 0) return res.status(404).json({ error: 'File not found' });
    fs.unlinkSync('uploads/' + results[0].filename);
    db.query('DELETE FROM files WHERE id = ?', [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'File deleted' });
    });
  });
});

// EVENTS
app.get('/events', authenticate, (req, res) => {
  db.query('SELECT * FROM events WHERE userId = ? ORDER BY date ASC', [req.userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/events', authenticate, (req, res) => {
  const { title, date } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'Title and date are required' });
  db.query('INSERT INTO events (title, date, userId) VALUES (?, ?, ?)', [title, date, req.userId], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: result.insertId, title, date });
  });
});

app.delete('/events/:id', authenticate, (req, res) => {
  db.query('DELETE FROM events WHERE id = ? AND userId = ?', [req.params.id, req.userId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Event deleted' });
  });
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});