const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const db = require('./database');
const { generateDailyExcelReport } = require('./excelGenerator');

// Helper deteksi IP lokal komputer untuk akses HP pekerja
function getLocalIpAddress() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Cari IPv4 yang bukan loopback
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch (_) {}
  return 'localhost';
}

const app = express();
const PORT = process.env.PORT || 3000;

// Direktori uploads
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Inisialisasi database awal
db.initDatabase();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files (dukung folder public maupun jika di-upload di root)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/uploads', express.static(UPLOADS_DIR));

// Fallback cerdas untuk file CSS & JS jika di-upload di root repository
app.get('/css/style.css', (req, res, next) => {
  const candidates = [
    path.join(__dirname, 'public', 'css', 'style.css'),
    path.join(__dirname, 'css', 'style.css'),
    path.join(__dirname, 'style.css')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return res.sendFile(c);
  }
  next();
});

app.get('/js/:filename', (req, res, next) => {
  const filename = req.params.filename;
  const candidates = [
    path.join(__dirname, 'public', 'js', filename),
    path.join(__dirname, 'js', filename),
    path.join(__dirname, filename)
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return res.sendFile(c);
  }
  next();
});

// Rute Halaman Utama (Utamakan public/index.html, fallback ke root index.html)
app.get('/', (req, res) => {
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  const rootIndex = path.join(__dirname, 'index.html');
  if (fs.existsSync(publicIndex)) {
    return res.sendFile(publicIndex);
  }
  if (fs.existsSync(rootIndex)) {
    return res.sendFile(rootIndex);
  }
  res.status(404).send('File index.html tidak ditemukan. Pastikan folder public di-upload ke repository.');
});

// Konfigurasi Multer untuk upload file media
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'media-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

// Helper untuk simpan dataUrl base64 menjadi file
function saveBase64ToFile(dataUrl, prefix = 'foto') {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  try {
    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return null;
    
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    let ext = '.jpg';
    if (mimeType.includes('png')) ext = '.png';
    if (mimeType.includes('webm')) ext = '.webm';
    if (mimeType.includes('mp4')) ext = '.mp4';

    const filename = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    return `/uploads/${filename}`;
  } catch (err) {
    console.error('Error saving base64 to file:', err);
    return null;
  }
}

// ==========================================
// API AUTENTIKASI (bcrypt Hashing)
// ==========================================

// Helper: Rentang Siklus Kerja Harian (01:00 Pagi s/d 01:00 Pagi Hari Berikutnya)
function getOperationalDayBounds(dateString) {
  if (!dateString) return null;
  // Support YYYY-MM-DD atau DD/MM/YYYY
  let y, m, d;
  if (dateString.includes('-')) {
    [y, m, d] = dateString.split('-').map(Number);
  } else if (dateString.includes('/')) {
    [d, m, y] = dateString.split('/').map(Number);
  } else {
    return null;
  }
  const startDate = new Date(y, m - 1, d, 1, 0, 0, 0); // 01:00 AM Hari H
  const endDate = new Date(y, m - 1, d + 1, 1, 0, 0, 0); // 01:00 AM Hari H+1
  return {
    startMs: startDate.getTime(),
    endMs: endDate.getTime(),
    dateFormatted: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
  };
}

// ==========================================
// API AUTENTIKASI & KELOLA AKUN KARYAWAN
// ==========================================

// Login (Pekerja & Admin)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username dan Password wajib diisi!' });
    }

    const user = db.findUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Username atau Password salah!' });
    }

    const isValid = await db.verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Username atau Password salah!' });
    }

    // Login berhasil
    const { passwordHash: _, ...safeUser } = user;
    res.json({
      success: true,
      message: 'Login berhasil!',
      user: safeUser
    });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan sistem: ' + err.message });
  }
});

// Daftar Seluruh Karyawan (HANYA karyawan biasa, akun superadmin & admin disaring keluar)
app.get('/api/admin/workers', (req, res) => {
  const users = db.getUsers()
    .filter(u => u.role === 'worker')
    .map(u => {
      const { passwordHash: _, ...safeUser } = u;
      return safeUser;
    });
  res.json({ users });
});

// Admin Tambah Akun Karyawan Baru (Hanya pekerja lapangan)
app.post('/api/admin/workers', async (req, res) => {
  try {
    const { username, fullName, password, phone } = req.body;
    if (!username || !fullName || !password) {
      return res.status(400).json({ error: 'Username, Nama Lengkap, dan Kata Sandi wajib diisi!' });
    }
    if (password.length < 5) {
      return res.status(400).json({ error: 'Kata sandi minimal 5 karakter!' });
    }

    const lowerUser = username.trim().toLowerCase();
    if (lowerUser === 'admin' || lowerUser === 'superadmin') {
      return res.status(400).json({ error: 'Username ini dilindungi sistem dan tidak dapat didaftarkan sebagai karyawan!' });
    }

    const newUser = await db.createUser({
      username,
      fullName,
      password,
      phone: phone || '',
      role: 'worker'
    });

    res.json({
      success: true,
      message: `Akun untuk ${fullName} berhasil dibuat!`,
      user: newUser
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Reset / Ubah Password Karyawan (DILINDUNGI: Tidak bisa ubah superadmin/admin)
app.put('/api/admin/workers/:id/password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 5) {
      return res.status(400).json({ error: 'Kata sandi baru minimal 5 karakter!' });
    }

    const target = db.findUserById(req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Karyawan tidak ditemukan!' });
    }
    if (target.role === 'superadmin' || target.role === 'admin') {
      return res.status(403).json({ error: 'Akses Ditolak: Akun Superadmin dan Admin dilindungi dan tidak dapat diubah oleh Admin biasa!' });
    }

    await db.updateUserPassword(req.params.id, newPassword);
    res.json({ success: true, message: `Kata sandi karyawan (${target.fullName || target.username}) berhasil diperbarui!` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Hapus Karyawan (DILINDUNGI: Tidak bisa hapus superadmin/admin)
app.delete('/api/admin/workers/:id', (req, res) => {
  try {
    const target = db.findUserById(req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });
    }
    if (target.role === 'superadmin' || target.role === 'admin') {
      return res.status(403).json({ error: 'Akses Ditolak: Akun Superadmin dan Admin dilindungi sistem dan tidak boleh dihapus!' });
    }

    const success = db.deleteUser(req.params.id);
    res.json({ success, message: success ? 'Akun karyawan berhasil dihapus!' : 'Karyawan tidak ditemukan.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// API SUPERADMIN (Kontrol Penuh)
// ==========================================

// Daftar semua user termasuk admin (hanya superadmin)
app.get('/api/superadmin/users', (req, res) => {
  const users = db.getUsers().map(u => {
    const { passwordHash: _, ...safe } = u;
    return safe;
  });
  res.json({ users });
});

// Ganti password admin biasa oleh superadmin
app.put('/api/superadmin/change-admin-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 5) {
      return res.status(400).json({ error: 'Kata sandi minimal 5 karakter!' });
    }
    const users = db.getUsers();
    const admin = users.find(u => u.role === 'admin');
    if (!admin) return res.status(404).json({ error: 'Akun admin tidak ditemukan!' });
    await db.updateUserPassword(admin.id, newPassword);
    res.json({ success: true, message: `Kata sandi admin (${admin.username}) berhasil diubah!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ganti password user (admin/pekerja) oleh superadmin
app.put('/api/superadmin/change-password', async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword || newPassword.length < 5) {
      return res.status(400).json({ error: 'ID Pengguna dan kata sandi baru (minimal 5 karakter) wajib diisi!' });
    }
    await db.updateUserPassword(userId, newPassword);
    res.json({ success: true, message: 'Kata sandi berhasil diperbarui!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Superadmin Hapus Pengguna (Bisa hapus Admin atau Pekerja, TIDAK bisa hapus Superadmin)
app.delete('/api/superadmin/users/:id', (req, res) => {
  try {
    const target = db.findUserById(req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    }
    if (target.role === 'superadmin') {
      return res.status(400).json({ error: 'Akun Superadmin utama tidak dapat dihapus!' });
    }

    const success = db.deleteUser(req.params.id);
    res.json({ success, message: `Akun ${target.fullName || target.username} (${target.role}) berhasil dihapus!` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Superadmin Tambah Pengguna Baru (Bisa buat Admin atau Karyawan)
app.post('/api/superadmin/users', async (req, res) => {
  try {
    const { username, fullName, password, phone, role } = req.body;
    if (!username || !fullName || !password) {
      return res.status(400).json({ error: 'Username, Nama Lengkap, dan Kata Sandi wajib diisi!' });
    }
    if (password.length < 5) {
      return res.status(400).json({ error: 'Kata sandi minimal 5 karakter!' });
    }

    const targetRole = role === 'admin' ? 'admin' : 'worker';
    const newUser = await db.createUser({
      username,
      fullName,
      password,
      phone: phone || '',
      role: targetRole
    });

    res.json({
      success: true,
      message: `Akun ${targetRole} untuk ${fullName} berhasil dibuat!`,
      user: newUser
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Reset Total: hapus semua tugas + file foto
app.post('/api/superadmin/reset-total', (req, res) => {
  try {
    // Hapus semua file di folder uploads
    let fileCount = 0;
    if (fs.existsSync(UPLOADS_DIR)) {
      const files = fs.readdirSync(UPLOADS_DIR);
      files.forEach(f => {
        try {
          fs.unlinkSync(path.join(UPLOADS_DIR, f));
          fileCount++;
        } catch (_) {}
      });
    }
    // Kosongkan semua data tugas
    const DATA_DIR = path.join(__dirname, 'data');
    fs.writeFileSync(path.join(DATA_DIR, 'tasks.json'), '[]', 'utf8');
    res.json({
      success: true,
      message: `Reset total selesai! ${fileCount} file foto dibersihkan, seluruh riwayat tugas dikosongkan.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset Sheet: kirim perintah bersih ke Google Apps Script
app.post('/api/superadmin/reset-sheet', async (req, res) => {
  try {
    const settings = db.getSettings();
    if (!settings.gasWebhookUrl) {
      return res.status(400).json({ error: 'URL Google Apps Script belum dikonfigurasi di Pengaturan Cloud.' });
    }
    // Kirim sinyal reset ke GAS via native fetch
    const gasRes = await fetch(settings.gasWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'RESET_SHEET' }),
      redirect: 'follow'
    });
    const text = await gasRes.text();
    res.json({ success: true, message: 'Perintah reset sheet telah berhasil dikirim ke Google Sheets.', response: text });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghubungi Google Sheets: ' + err.message });
  }
});

// Mulai Pekerjaan Baru (Foto Mulai)
app.post('/api/tasks/start', (req, res) => {
  try {
    const { workerId, workerName, taskName, notes, photoBase64, location } = req.body;
    if (!workerName || !taskName) {
      return res.status(400).json({ error: 'Nama Pekerja dan Nama Pekerjaan wajib diisi!' });
    }

    let startPhotoUrl = null;
    if (photoBase64) {
      startPhotoUrl = saveBase64ToFile(photoBase64, 'mulai');
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const newTask = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      workerId: workerId || 'guest',
      workerName: workerName.trim(),
      date: dateStr,
      taskName: taskName.trim(),
      notes: notes ? notes.trim() : '',
      startTime: timeStr,
      startTimestamp: now.getTime(),
      endTime: null,
      endTimestamp: null,
      durationMinutes: 0,
      startPhoto: startPhotoUrl,
      progressPhotos: [],
      finishPhoto: null,
      videoUrl: null,
      location: location || null,
      status: 'in_progress',
      gdriveSynced: false,
      createdAt: now.toISOString()
    };

    db.saveTask(newTask);
    res.json({ success: true, message: 'Pekerjaan dimulai!', task: newTask });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tambah Foto / Video Progress
app.post('/api/tasks/progress', (req, res) => {
  try {
    const { taskId, photoBase64, videoBase64, note } = req.body;
    if (!taskId) {
      return res.status(400).json({ error: 'Task ID diperlukan!' });
    }

    const task = db.getTaskById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Pekerjaan tidak ditemukan!' });
    }

    let photoUrl = null;
    let videoUrl = null;

    if (photoBase64) {
      photoUrl = saveBase64ToFile(photoBase64, 'progress');
    }
    if (videoBase64) {
      videoUrl = saveBase64ToFile(videoBase64, 'video');
      task.videoUrl = videoUrl;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    task.progressPhotos = task.progressPhotos || [];
    task.progressPhotos.push({
      photoUrl: photoUrl || '',
      videoUrl: videoUrl || '',
      note: note || '',
      time: timeStr,
      timestamp: now.getTime()
    });

    db.saveTask(task);
    res.json({ success: true, message: 'Progress berhasil didokumentasikan!', task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Selesaikan Pekerjaan (Foto Selesai)
app.post('/api/tasks/complete', (req, res) => {
  try {
    const { taskId, photoBase64, finalNotes } = req.body;
    if (!taskId) {
      return res.status(400).json({ error: 'Task ID diperlukan!' });
    }

    const task = db.getTaskById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Pekerjaan tidak ditemukan!' });
    }

    let finishPhotoUrl = null;
    if (photoBase64) {
      finishPhotoUrl = saveBase64ToFile(photoBase64, 'selesai');
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Hitung durasi kerja dalam menit
    const startMs = task.startTimestamp || now.getTime();
    const endMs = now.getTime();
    const durationMinutes = Math.max(1, Math.round((endMs - startMs) / (1000 * 60)));

    task.endTime = timeStr;
    task.endTimestamp = endMs;
    task.durationMinutes = durationMinutes;
    task.finishPhoto = finishPhotoUrl;
    task.status = 'completed';
    if (finalNotes) {
      task.notes = task.notes ? `${task.notes} | ${finalNotes}` : finalNotes;
    }

    db.saveTask(task);
    res.json({ success: true, message: 'Pekerjaan selesai & tercatat rapi!', task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ambil Daftar Semua Tugas (dengan Filter Siklus 01:00 - 01:00)
app.get('/api/tasks', (req, res) => {
  try {
    let tasks = db.getTasks();
    const { workerName, status, date } = req.query;

    if (workerName && workerName !== 'all') {
      tasks = tasks.filter(t => (t.workerName || '').toLowerCase() === workerName.toLowerCase());
    }
    if (status && status !== 'all') {
      tasks = tasks.filter(t => t.status === status);
    }
    if (date && date !== 'all') {
      const bounds = getOperationalDayBounds(date);
      if (bounds) {
        tasks = tasks.filter(t => {
          if (t.startTimestamp) {
            return t.startTimestamp >= bounds.startMs && t.startTimestamp < bounds.endMs;
          }
          return t.date === date || t.date === bounds.dateFormatted;
        });
      } else {
        tasks = tasks.filter(t => t.date === date);
      }
    }

    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hapus Pekerjaan (Admin)
app.delete('/api/tasks/:id', (req, res) => {
  const success = db.deleteTask(req.params.id);
  res.json({ success });
});

// ==========================================
// EXPORT EXCEL DENGAN FOTO LANGSUNG DI SEL!
// Periode Harian: 01:00 s/d 01:00 Hari Berikutnya
// ==========================================
app.get('/api/tasks/export-excel', async (req, res) => {
  try {
    let tasks = db.getTasks();
    const { workerName, date } = req.query;

    if (workerName && workerName !== 'all') {
      tasks = tasks.filter(t => (t.workerName || '').toLowerCase() === workerName.toLowerCase());
    }
    
    let dateLabel = date || new Date().toISOString().split('T')[0];
    if (date && date !== 'all') {
      const bounds = getOperationalDayBounds(date);
      if (bounds) {
        tasks = tasks.filter(t => {
          if (t.startTimestamp) {
            return t.startTimestamp >= bounds.startMs && t.startTimestamp < bounds.endMs;
          }
          return t.date === date || t.date === bounds.dateFormatted;
        });
        dateLabel = bounds.dateFormatted.replace(/\//g, '-');
      } else {
        tasks = tasks.filter(t => t.date === date);
      }
    }

    const settings = db.getSettings();
    const excelBuffer = await generateDailyExcelReport(tasks, {
      companyName: settings.companyName,
      workerFilter: workerName !== 'all' ? workerName : null,
      dateFilter: `${dateLabel} (01:00 s/d 01:00)`
    });

    const filename = `Laporan_Kerja_${workerName || 'Semua'}_${dateLabel}_01.00-01.00.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(excelBuffer);
  } catch (err) {
    console.error('Error exporting Excel:', err);
    res.status(500).send('Gagal mengekspor file Excel: ' + err.message);
  }
});

// ==========================================
// PENGATURAN & GOOGLE DRIVE/SHEETS SYNC
// ==========================================
app.get('/api/settings', (req, res) => {
  res.json(db.getSettings());
});

app.post('/api/settings', (req, res) => {
  const updated = db.updateSettings(req.body);
  res.json({ success: true, settings: updated });
});

// Proxy Kirim Data ke Google Apps Script Webhook
app.post('/api/tasks/sync-gdrive', async (req, res) => {
  try {
    const { taskId } = req.body;
    const settings = db.getSettings();
    if (!settings.gasWebhookUrl) {
      return res.status(400).json({ error: 'URL Google Apps Script Webhook belum dikonfigurasi di Pengaturan!' });
    }

    const task = db.getTaskById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Pekerjaan tidak ditemukan!' });
    }

    // Helper konversi file lokal ke base64
    const fileToBase64 = (relPath) => {
      if (!relPath) return null;
      try {
        const full = path.join(__dirname, relPath.replace(/^\//, ''));
        if (fs.existsSync(full)) {
          return fs.readFileSync(full, { encoding: 'base64' });
        }
      } catch (e) {
        console.warn('Gagal membaca file untuk gdrive:', e);
      }
      return null;
    };

    const payload = {
      workerName: task.workerName,
      date: task.date,
      taskName: task.taskName,
      notes: task.notes,
      startTime: task.startTime,
      endTime: task.endTime,
      durationMinutes: task.durationMinutes,
      status: task.status,
      startPhotoBase64: fileToBase64(task.startPhoto),
      progressPhotoBase64: task.progressPhotos && task.progressPhotos[0] ? fileToBase64(task.progressPhotos[0].photoUrl) : null,
      finishPhotoBase64: fileToBase64(task.finishPhoto)
    };

    // Kirim via fetch ke Webhook Google Apps Script
    const response = await fetch(settings.gasWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({ status: 'success' }));
    task.gdriveSynced = true;
    db.saveTask(task);

    res.json({ success: true, message: 'Berhasil tersinkronisasi ke Google Drive & Google Sheets!', result });
  } catch (err) {
    res.status(500).json({ error: 'Gagal sinkronisasi Google Drive: ' + err.message });
  }
});

// Info Server & IP Jaringan Lokal (untuk kemudahan akses HP)
app.get('/api/server-info', (req, res) => {
  const localIp = getLocalIpAddress();
  res.json({
    port: PORT,
    localIp,
    hpUrl: `http://${localIp}:${PORT}`,
    localUrl: `http://localhost:${PORT}`
  });
});

// Jalankan Server
app.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIpAddress();
  console.log(`====================================================`);
  console.log(`🚀 Aplikasi Laporan Kerja Lapangan Aktif!`);
  console.log(`🌐 Akses Lokal Laptop : http://localhost:${PORT}`);
  console.log(`📱 Akses via HP Pekerja: http://${localIp}:${PORT}`);
  console.log(`====================================================`);
});
