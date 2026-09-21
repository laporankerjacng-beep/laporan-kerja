const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper: safe JSON read
function readJson(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf8');
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content || 'null') || defaultValue;
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return defaultValue;
  }
}

// Helper: safe JSON write (atomic write via temp file)
function writeJson(filePath, data) {
  const tempPath = `${filePath}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

// Inisialisasi data awal — pastikan superadmin & admin selalu ada
function initDatabase() {
  let users = readJson(USERS_FILE, []);
  let changed = false;

  // Selalu pastikan superadmin ada
  if (!users.some(u => u.username === 'superadmin')) {
    users.unshift({
      id: 'usr_superadmin_01',
      username: 'superadmin',
      fullName: 'Super Administrator',
      role: 'superadmin',
      phone: '',
      passwordHash: bcrypt.hashSync('admin123', 10),
      createdAt: new Date().toISOString()
    });
    changed = true;
    console.log('[DB] Superadmin dibuat: superadmin / admin123');
  }

  // Pastikan minimal ada 1 akun admin biasa
  if (!users.some(u => u.role === 'admin')) {
    users.push({
      id: 'usr_admin_01',
      username: 'admin',
      fullName: 'PIC / Supervisor (Admin)',
      role: 'admin',
      phone: '',
      passwordHash: bcrypt.hashSync('amazon9972', 10),
      createdAt: new Date().toISOString()
    });
    changed = true;
    console.log('[DB] Admin dibuat: admin / amazon9972');
  }

  if (changed) writeJson(USERS_FILE, users);

  // Pastikan file tasks & settings tersedia
  readJson(TASKS_FILE, []);
  readJson(SETTINGS_FILE, {
    companyName: 'Laporan Kerja Lapangan',
    gasWebhookUrl: '',
    autoSyncGDrive: false
  });
}

// Ekspor fungsi manipulasi database
module.exports = {
  initDatabase,

  // Users
  getUsers: () => readJson(USERS_FILE, []),
  
  findUserByUsername: (username) => {
    const users = readJson(USERS_FILE, []);
    return users.find(u => u.username.toLowerCase() === String(username).toLowerCase());
  },

  findUserById: (id) => {
    const users = readJson(USERS_FILE, []);
    return users.find(u => u.id === id);
  },

  createUser: async ({ username, fullName, password, phone, role = 'worker' }) => {
    const users = readJson(USERS_FILE, []);
    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      throw new Error('Username sudah terdaftar! Gunakan username lain.');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = {
      id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      username: username.trim().toLowerCase(),
      fullName: fullName.trim(),
      role: role === 'admin' ? 'admin' : 'worker',
      phone: (phone || '').trim(),
      passwordHash,
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    writeJson(USERS_FILE, users);
    
    // Return sanitized user (without hash)
    const { passwordHash: _, ...safeUser } = newUser;
    return safeUser;
  },

  verifyPassword: async (inputPassword, storedHash) => {
    return await bcrypt.compare(inputPassword, storedHash);
  },

  updateUserPassword: async (id, newPassword) => {
    const users = readJson(USERS_FILE, []);
    const user = users.find(u => u.id === id);
    if (!user) throw new Error('Pengguna tidak ditemukan!');
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    writeJson(USERS_FILE, users);
    return true;
  },

  deleteUser: (id) => {
    let users = readJson(USERS_FILE, []);
    const target = users.find(u => u.id === id);
    if (target && target.role === 'superadmin') {
      throw new Error('Akun Superadmin utama tidak boleh dihapus!');
    }
    const initialLen = users.length;
    users = users.filter(u => u.id !== id);
    writeJson(USERS_FILE, users);
    return users.length < initialLen;
  },

  // Tasks
  getTasks: () => readJson(TASKS_FILE, []),

  getTaskById: (id) => {
    const tasks = readJson(TASKS_FILE, []);
    return tasks.find(t => t.id === id);
  },

  saveTask: (task) => {
    const tasks = readJson(TASKS_FILE, []);
    const idx = tasks.findIndex(t => t.id === task.id);
    if (idx >= 0) {
      tasks[idx] = task;
    } else {
      tasks.unshift(task);
    }
    writeJson(TASKS_FILE, tasks);
    return task;
  },

  deleteTask: (id) => {
    let tasks = readJson(TASKS_FILE, []);
    const initialLen = tasks.length;
    tasks = tasks.filter(t => t.id !== id);
    writeJson(TASKS_FILE, tasks);
    return tasks.length < initialLen;
  },

  // Settings
  getSettings: () => readJson(SETTINGS_FILE, {
    companyName: 'Laporan Kerja Lapangan',
    gasWebhookUrl: '',
    autoSyncGDrive: false
  }),

  updateSettings: (newSettings) => {
    const current = readJson(SETTINGS_FILE, {});
    const updated = { ...current, ...newSettings };
    writeJson(SETTINGS_FILE, updated);
    return updated;
  }
};
