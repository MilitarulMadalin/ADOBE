const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');

const APP_ROOT = __dirname;
const DATA_DIR = path.join(APP_ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const STATS_FILE_PATH = path.join(APP_ROOT, '..', 'Stats.md');

dotenv.config({ path: path.join(APP_ROOT, '..', '.env') });

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const SESSION_COOKIE = 'session_token';
const DEFAULT_SESSION_TTL_MINUTES = 60 * 24 * 7; // 7 days
const REMEMBER_ME_SESSION_TTL_MINUTES = 60 * 24 * 30; // 30 days
const MAX_AVATAR_SIZE_BYTES = 800 * 1024;
const GEMINI_ENDPOINT_CANDIDATES = [
  { baseUrl: 'https://generativelanguage.googleapis.com/v1/models', model: 'gemini-2.5-flash' }
];

function ensureDataDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function initializeDatabase() {
  ensureDataDirectory();
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();

  db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)').run();

  const userColumns = new Set(
    db
      .prepare('PRAGMA table_info(users)')
      .all()
      .map(column => column.name)
  );

  const ensureUserColumn = (name, definition) => {
    if (!userColumns.has(name)) {
      db.prepare(`ALTER TABLE users ADD COLUMN ${name} ${definition}`).run();
      userColumns.add(name);
    }
  };

  ensureUserColumn('phone_number', 'TEXT');
  ensureUserColumn('address', 'TEXT');
  ensureUserColumn('state', 'TEXT');
  ensureUserColumn('zip_code', 'TEXT');
  ensureUserColumn('country', 'TEXT');
  ensureUserColumn('language', 'TEXT');
  ensureUserColumn('timezone', 'TEXT');
  ensureUserColumn('currency', 'TEXT');
  ensureUserColumn('avatar_filename', 'TEXT');

  return db;
}

const db = initializeDatabase();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\\d+)?$/.test(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Accept');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

// Utility helpers
function nowISO() {
  return new Date().toISOString();
}

function hashPassword(password) {
  const rounds = 12;
  return bcrypt.hashSync(password, rounds);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeProfileValue(value, maxLength) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (maxLength && trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }
  return trimmed;
}

function deleteAvatarFile(filename) {
  if (!filename) return;
  const filePath = path.join(UPLOAD_DIR, filename);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to delete avatar file:', error);
  }
}

function saveAvatarData(userId, dataUrl) {
  if (typeof dataUrl !== 'string') {
    throw new Error('invalid_avatar');
  }

  const match = dataUrl.match(/^data:(image\/(png|jpeg|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error('invalid_avatar');
  }

  const mimeType = match[1];
  const extensionMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' };
  const extension = extensionMap[mimeType];
  if (!extension) {
    throw new Error('invalid_avatar');
  }

  const base64Data = match[3];
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length > MAX_AVATAR_SIZE_BYTES) {
    throw new Error('avatar_too_large');
  }

  const filename = `user-${userId}-${Date.now()}.${extension}`;
  const filePath = path.join(UPLOAD_DIR, filename);

  try {
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    fs.writeFileSync(filePath, buffer);
  } catch (error) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    throw new Error('avatar_store_failed');
  }

  return filename;
}

async function generateGeminiResponse(prompt, fallbackMessage) {
  if (!GOOGLE_API_KEY) {
    return fallbackMessage;
  }

  if (typeof fetch !== 'function') {
    // eslint-disable-next-line no-console
    console.error('Fetch API is not available in this Node.js version.');
    return fallbackMessage;
  }

  for (const { baseUrl, model } of GEMINI_ENDPOINT_CANDIDATES) {
    const endpoint = `${baseUrl}/${model}:generateContent?key=${encodeURIComponent(GOOGLE_API_KEY)}`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
            }
          ]
        })
      });

      if (!response.ok) {
        // eslint-disable-next-line no-console
        console.error('Gemini API error:', response.status, response.statusText, 'for', model);
        if (response.status === 404) {
          continue;
        }
        return fallbackMessage;
      }

      const payload = await response.json();
      const parts =
        payload?.candidates?.[0]?.content?.parts?.map(part => part.text).filter(Boolean) ?? [];
      const text = parts.join('\n').trim();
      return text || fallbackMessage;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Gemini request failed for', model, error);
    }
  }

  return fallbackMessage;
}

function createSession(userId, rememberMe) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const ttlMinutes = rememberMe ? REMEMBER_ME_SESSION_TTL_MINUTES : DEFAULT_SESSION_TTL_MINUTES;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  db.prepare(
    'INSERT INTO sessions (user_id, token_hash, created_at, expires_at) VALUES (@userId, @tokenHash, @createdAt, @expiresAt)'
  ).run({
    userId,
    tokenHash,
    createdAt: nowISO(),
    expiresAt
  });

  return { token, expiresAt };
}

function deleteSession(token) {
  if (!token) return;
  const tokenHash = hashToken(token);
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

function fetchSession(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const record = db
    .prepare(
      `SELECT s.id, s.user_id, s.expires_at, u.email, u.username, u.first_name, u.last_name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash);
  if (!record) return null;
  if (new Date(record.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(record.id);
    return null;
  }
  return record;
}

function sanitizeUserPayload(user) {
  if (!user) return null;
  const avatarUrl = user.avatar_filename ? `/uploads/${user.avatar_filename}` : '/fonts/unknown.png';
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    phoneNumber: user.phone_number,
    address: user.address,
    state: user.state,
    zipCode: user.zip_code,
    country: user.country,
    language: user.language,
    timezone: user.timezone,
    currency: user.currency,
    avatarUrl
  };
}

function requireAuth(req, res, next) {
  const session = fetchSession(req.cookies[SESSION_COOKIE]);
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  req.session = session;
  next();
}

// Auth routes
app.post('/api/register', (req, res) => {
  try {
    const { email, password, username, firstName, lastName } = req.body || {};
    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const trimmedUsername = typeof username === 'string' ? username.trim() : '';
    const trimmedFirstName = typeof firstName === 'string' ? firstName.trim() : '';
    const trimmedLastName = typeof lastName === 'string' ? lastName.trim() : '';

    if (!trimmedEmail || !password || password.length < 8) {
      res.status(400).json({ error: 'Completează emailul și parola (minim 8 caractere).' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(trimmedEmail);
    if (existing) {
      res.status(409).json({ error: 'Există deja un cont asociat acestui email.' });
      return;
    }

    const passwordHash = hashPassword(password);
    const timestamp = nowISO();
    const insert = db.prepare(
      `INSERT INTO users (email, username, first_name, last_name, password_hash, created_at, updated_at)
       VALUES (@email, @username, @firstName, @lastName, @passwordHash, @createdAt, @updatedAt)`
    );

    const info = insert.run({
      email: trimmedEmail,
      username: trimmedUsername || null,
      firstName: trimmedFirstName || null,
      lastName: trimmedLastName || null,
      passwordHash,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ user: sanitizeUserPayload(user) });
  } catch (error) {
    if (error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'Există deja un cont asociat acestui email.' });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('Register error:', error);
    res.status(500).json({ error: 'A apărut o eroare. Încearcă din nou.' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password, rememberMe } = req.body || {};
  const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!trimmedEmail || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(trimmedEmail);
  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid credentials.' });
    return;
  }

  deleteSession(req.cookies[SESSION_COOKIE]);
  const session = createSession(user.id, Boolean(rememberMe));

  res.cookie(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: new Date(session.expiresAt).getTime() - Date.now()
  });

  res.json({ user: sanitizeUserPayload(user) });
});

app.post('/api/logout', (req, res) => {
  const token = req.cookies[SESSION_COOKIE];
  deleteSession(token);
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });
  res.status(204).end();
});

app.get('/api/me', (req, res) => {
  const session = fetchSession(req.cookies[SESSION_COOKIE]);
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  res.json(sanitizeUserPayload(user));
});

app.put('/api/me', requireAuth, (req, res) => {
  const userId = req.session.user_id;
  const body = req.body || {};

  const existingUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!existingUser) {
    res.status(404).json({ error: 'Utilizatorul nu există.' });
    return;
  }

  let avatarFilename;
  if (body.avatarData) {
    try {
      avatarFilename = saveAvatarData(existingUser.id, body.avatarData);
    } catch (error) {
      if (error && error.message === 'avatar_too_large') {
        res.status(400).json({ error: 'Imaginea trebuie să fie mai mică de 800 KB.' });
        return;
      }
      if (error && error.message === 'invalid_avatar') {
        res.status(400).json({ error: 'Imaginea de profil nu este validă.' });
        return;
      }
      // eslint-disable-next-line no-console
      console.error('Avatar upload error:', error);
      res.status(500).json({ error: 'Nu am putut salva imaginea de profil.' });
      return;
    }
  }

  const updateParams = {
    firstName: normalizeProfileValue(body.firstName, 100),
    lastName: normalizeProfileValue(body.lastName, 100),
    username: normalizeProfileValue(body.username, 100),
    phoneNumber: normalizeProfileValue(body.phoneNumber, 40),
    address: normalizeProfileValue(body.address, 255),
    state: normalizeProfileValue(body.state, 120),
    zipCode: normalizeProfileValue(body.zipCode, 20),
    country: normalizeProfileValue(body.country, 120),
    language: normalizeProfileValue(body.language, 20),
    timezone: normalizeProfileValue(body.timezone, 150),
    currency: normalizeProfileValue(body.currency, 20),
    updatedAt: nowISO(),
    id: existingUser.id
  };

  const assignments = [
    'first_name = @firstName',
    'last_name = @lastName',
    'username = @username',
    'phone_number = @phoneNumber',
    'address = @address',
    'state = @state',
    'zip_code = @zipCode',
    'country = @country',
    'language = @language',
    'timezone = @timezone',
    'currency = @currency',
    'updated_at = @updatedAt'
  ];

  if (typeof avatarFilename === 'string') {
    assignments.push('avatar_filename = @avatarFilename');
    updateParams.avatarFilename = avatarFilename;
  }

  try {
    db.prepare(`UPDATE users SET ${assignments.join(', ')} WHERE id = @id`).run(updateParams);
  } catch (error) {
    if (avatarFilename) {
      deleteAvatarFile(avatarFilename);
    }
    // eslint-disable-next-line no-console
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Nu am putut salva datele tale.' });
    return;
  }

  if (avatarFilename && existingUser.avatar_filename && existingUser.avatar_filename !== avatarFilename) {
    deleteAvatarFile(existingUser.avatar_filename);
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(existingUser.id);
  res.json({ user: sanitizeUserPayload(user) });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: nowISO() });
});

app.get('/api/chat', async (_req, res) => {
  const fallback = 'Salut! Sunt FashionAI, cu ce te pot ajuta astăzi?';
  const prompt =
    'Oferă o urare scurtă, prietenoasă și profesionistă în limba română din perspectiva FashionAI, consultant virtual în trenduri vestimentare.';
  const message = await generateGeminiResponse(prompt, fallback);
  res.json({ message });
});

app.post('/api/chat', async (req, res) => {
  const { message } = req.body || {};
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  if (!trimmedMessage) {
    res.status(400).json({ message: 'Mesajul nu poate fi gol.' });
    return;
  }

  const safeMessage = trimmedMessage.replace(/"/g, '\\"');
  const prompt = `Răspunde prietenos, concis și profesionist în limba română ca FashionAI, expert în modă, la mesajul utilizatorului: "${safeMessage}"`;
  const fallback = 'Îți mulțumesc pentru mesaj! Momentan nu pot contacta serviciul Gemini.';
  const reply = await generateGeminiResponse(prompt, fallback);
  res.json({ message: reply });
});

app.get('/api/stats', (_req, res) => {
  fs.readFile(STATS_FILE_PATH, 'utf8', (error, data) => {
    if (error) {
      res.status(500).json({ error: 'Nu am putut încărca statisticile.' });
      return;
    }
    res.type('text/plain').send(data);
  });
});

// Static content
const staticOptions = {
  extensions: ['html']
};

app.use('/assets', express.static(path.join(APP_ROOT, 'assets')));
app.use('/libs', express.static(path.join(APP_ROOT, 'libs')));
app.use('/js', express.static(path.join(APP_ROOT, 'js')));
app.use('/fonts', express.static(path.join(APP_ROOT, 'fonts')));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/html', express.static(path.join(APP_ROOT, 'html'), staticOptions));
app.use('/tasks', express.static(path.join(APP_ROOT, 'tasks')));
app.use(express.static(path.join(APP_ROOT, 'html'), staticOptions));

app.get('/', (_req, res) => {
  res.sendFile(path.join(APP_ROOT, 'html', 'index.html'));
});

app.get('/:page', (req, res, next) => {
  const filePath = path.join(APP_ROOT, 'html', req.params.page);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    next();
  }
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(APP_ROOT, 'html', 'pages-misc-error.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const basePath = `/html/index.html`;
  const localUrl = `http://localhost:${PORT}${basePath}`;

  const interfaces = os.networkInterfaces();
  let externalAddress = null;
  for (const records of Object.values(interfaces)) {
    if (externalAddress) break;
    for (const record of records || []) {
      if (record.family === 'IPv4' && !record.internal) {
        externalAddress = record.address;
        break;
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Local:    ${localUrl}`);
  if (externalAddress) {
    // eslint-disable-next-line no-console
    console.log(`External: http://${externalAddress}:${PORT}${basePath}`);
  }
});
