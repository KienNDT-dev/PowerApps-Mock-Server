require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express();

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

const users = []; // ❗ test only, store in memory
console.log('User list:', users);

// 🔐 Register
app.post('/register', (req, res) => {
  const { email, password } = req.body;
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ message: 'User already exists' });
  }
  users.push({ email, password });
  res.status(201).json({ message: 'User registered successfully' });
});

// 🔐 Login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

// 🔐 Protected test route
app.get('/me', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    res.json({ email: decoded.email });
  } catch (e) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
