/**
 * Logika Utama Aplikasi Laporan Kerja Lapangan
 * Menghubungkan Autentikasi, Alur Pekerja (Mulai, Progress, Selesai),
 * Pengambilan Foto Watermark In-App, Dashboard PIC, dan Ekspor Excel.
 */

// State Global Aplikasi
const AppState = {
  currentUser: null,
  activeTask: null,
  tasks: [],
  workers: [],
  settings: {
    companyName: 'Laporan Kerja Lapangan',
    gasWebhookUrl: '',
    autoSyncGDrive: false
  },
  timerInterval: null,
  cameraPendingStage: null, // 'mulai' | 'progress' | 'selesai'
  cameraPendingNote: '',
  cameraPendingTaskName: ''
};

// Inisialisasi saat dokumen siap
document.addEventListener('DOMContentLoaded', () => {
  initLiveClock();
  loadSavedUser();
  setupEventListeners();
  loadSettings();
});

// Jam Digital Real-Time di Header / Kamera
function initLiveClock() {
  const clockEl = document.getElementById('liveHeaderClock');
  const updateClock = () => {
    const now = new Date();
    const str = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';
    if (clockEl) clockEl.textContent = str;
    const camClock = document.getElementById('cameraLiveClock');
    if (camClock) camClock.textContent = str;
  };
  setInterval(updateClock, 1000);
  updateClock();
}

// Muat Akun dari LocalStorage
function loadSavedUser() {
  const saved = localStorage.getItem('laporan_user');
  if (saved) {
    try {
      AppState.currentUser = JSON.parse(saved);
      applyUserSession();
    } catch (e) {
      localStorage.removeItem('laporan_user');
    }
  } else {
    showAuthView();
  }
}

// Pasang Session Pengguna
function applyUserSession() {
  const user = AppState.currentUser;
  if (!user) {
    showAuthView();
    return;
  }

  // Tampilkan info pengguna di header
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('headerUserBadge').style.display = 'flex';
  document.getElementById('headerUserName').textContent = user.fullName || user.username;

  const roleBadge = document.getElementById('headerUserRole');
  roleBadge.className = 'user-role-badge';

  const isSuperAdmin = user.role === 'superadmin';
  const isAdmin = user.role === 'admin';

  if (isSuperAdmin) {
    roleBadge.textContent = '👑 Super Admin';
    roleBadge.classList.add('superadmin');
  } else if (isAdmin) {
    roleBadge.textContent = 'PIC / Admin';
  } else {
    roleBadge.textContent = 'Pekerja';
  }

  // Tampilkan / sembunyikan tombol Panel Super Admin
  const btnSuperAdmin = document.getElementById('btnOpenSuperAdmin');
  if (btnSuperAdmin) {
    btnSuperAdmin.style.display = isSuperAdmin ? 'inline-flex' : 'none';
  }

  // Alihkan tampilan berdasarkan peran
  if (isSuperAdmin || isAdmin) {
    document.getElementById('adminViewSection').style.display = 'flex';
    document.getElementById('workerViewSection').style.display = 'none';
    loadAdminDashboard();
  } else {
    document.getElementById('workerViewSection').style.display = 'block';
    document.getElementById('adminViewSection').style.display = 'none';
    loadWorkerDashboard();
  }
}

function showAuthView() {
  AppState.currentUser = null;
  localStorage.removeItem('laporan_user');
  document.getElementById('authSection').style.display = 'flex';
  document.getElementById('headerUserBadge').style.display = 'none';
  document.getElementById('workerViewSection').style.display = 'none';
  document.getElementById('adminViewSection').style.display = 'none';
}

// Helper: Toggle password visibility
function setupPasswordToggle(btnId, inputId) {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.textContent = isHidden ? '🙈' : '👁️';
  });
}

// ==========================================
// VALIDASI KAMERA: Keterangan wajib diisi
// ==========================================
function updateCameraShutterState() {
  const noteInput = document.getElementById('cameraNoteInput');
  const snapBtn = document.getElementById('btnSnapPhoto');
  const recBtn = document.getElementById('btnRecordVideo');
  const requiredBar = document.getElementById('cameraRequiredNote');
  if (!noteInput) return;

  const hasNote = noteInput.value.trim().length > 0;

  if (snapBtn) {
    snapBtn.disabled = !hasNote;
    snapBtn.style.opacity = hasNote ? '1' : '0.4';
    snapBtn.title = hasNote ? 'Ambil Foto' : 'Isi keterangan pekerjaan dulu';
  }
  if (recBtn) {
    recBtn.disabled = !hasNote;
    recBtn.style.opacity = hasNote ? '1' : '0.4';
  }
  noteInput.style.border = hasNote
    ? '2px solid rgba(34,197,94,0.7)'
    : '2px solid rgba(234,179,8,0.7)';
  if (requiredBar) {
    requiredBar.style.display = hasNote ? 'none' : 'flex';
  }
}

// Setup Event Listeners
function setupEventListeners() {

  // ------ Password Toggle (Lihat / Sembunyikan) ------
  setupPasswordToggle('btnToggleLoginPw', 'loginPassword');
  setupPasswordToggle('btnToggleNewWorkerPw', 'newWorkerPassword');
  setupPasswordToggle('btnToggleResetPw', 'resetPwInput');
  setupPasswordToggle('btnToggleSuperAdminAdminPw', 'superAdminNewAdminPw');

  // ------ Kontrol Super Admin ------
  const btnSuperAdmin = document.getElementById('btnOpenSuperAdmin');
  if (btnSuperAdmin) {
    btnSuperAdmin.addEventListener('click', openSuperAdminModal);
  }
  const btnCloseSuperAdmin = document.getElementById('btnCloseSuperAdmin');
  if (btnCloseSuperAdmin) {
    btnCloseSuperAdmin.addEventListener('click', closeSuperAdminModal);
  }

  // Superadmin: Ganti Sandi Akun Admin
  const formSuperAdminAdminPw = document.getElementById('formSuperAdminChangeAdminPw');
  if (formSuperAdminAdminPw) {
    formSuperAdminAdminPw.addEventListener('submit', handleSuperAdminChangeAdminPassword);
  }

  // Superadmin: Dua Tombol Reset
  const btnResetTotal = document.getElementById('btnTriggerResetTotal');
  if (btnResetTotal) {
    btnResetTotal.addEventListener('click', handleSuperAdminResetTotal);
  }
  const btnResetSheet = document.getElementById('btnTriggerResetSheet');
  if (btnResetSheet) {
    btnResetSheet.addEventListener('click', handleSuperAdminResetSheet);
  }

  // Submit Login
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login gagal!');

      AppState.currentUser = data.user;
      localStorage.setItem('laporan_user', JSON.stringify(data.user));
      applyUserSession();
    } catch (err) {
      alert(err.message);
    }
  });

  // Logout
  document.getElementById('btnLogout').addEventListener('click', () => {
    if (confirm('Apakah Anda yakin ingin keluar?')) {
      showAuthView();
    }
  });

  // Preset Catatan Cepat
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      const val = chip.getAttribute('data-value');
      document.getElementById('newTaskNameInput').value = val;
    });
  });

  // Tombol Mulai Pekerjaan: Wajib ada nama tugas, catatan jika ada
  document.getElementById('btnStartNewTask').addEventListener('click', () => {
    const taskName = document.getElementById('newTaskNameInput').value.trim();
    if (!taskName) {
      alert('Silakan pilih atau ketik nama pekerjaan terlebih dahulu!');
      document.getElementById('newTaskNameInput').focus();
      return;
    }
    const notes = document.getElementById('newTaskNoteInput').value.trim();

    openCameraModal({
      stage: 'MULAI PEKERJAAN',
      stageKey: 'mulai',
      taskName: taskName,
      note: notes || ''
    });
  });

  // Tombol Tambah Foto/Video Progress: Wajib beri keterangan progress
  document.getElementById('btnProgressAction').addEventListener('click', () => {
    if (!AppState.activeTask) return;
    openCameraModal({
      stage: 'PROGRESS / SEDANG DIKERJAKAN',
      stageKey: 'progress',
      taskName: AppState.activeTask.taskName,
      note: ''
    });
  });

  // Tombol Selesaikan Pekerjaan: Wajib beri keterangan selesai
  document.getElementById('btnFinishAction').addEventListener('click', () => {
    if (!AppState.activeTask) return;
    if (confirm('Apakah pekerjaan sudah benar-benar siap dan selesai?')) {
      openCameraModal({
        stage: 'PEKERJAAN SELESAI / SIAP',
        stageKey: 'selesai',
        taskName: AppState.activeTask.taskName,
        note: ''
      });
    }
  });

  // Kamera: Tutup Modal
  document.getElementById('btnCloseCamera').addEventListener('click', () => {
    closeCameraModal();
  });

  // Kamera: Keterangan WAJIB diisi — pasang listener saja, fungsinya di luar
  document.getElementById('cameraNoteInput').addEventListener('input', updateCameraShutterState);

  // Kamera: Ambil Foto
  document.getElementById('btnSnapPhoto').addEventListener('click', () => {
    snapWatermarkedPhoto();
  });

  // Kamera: Rekam Video Singkat
  const recBtn = document.getElementById('btnRecordVideo');
  if (recBtn) {
    recBtn.addEventListener('click', () => {
      toggleVideoRecording();
    });
  }

  // Pratinjau Foto: Ulangi Foto
  document.getElementById('btnRetakePhoto').addEventListener('click', () => {
    document.getElementById('previewModal').style.display = 'none';
    // Kamera tetap aktif untuk jepret ulang
  });

  // Pratinjau Foto: Konfirmasi & Kirim
  document.getElementById('btnConfirmPhoto').addEventListener('click', () => {
    submitPendingPhoto();
  });

  // Dashboard Admin: Filter
  document.getElementById('filterWorkerSelect').addEventListener('change', () => {
    loadTasksList();
  });
  document.getElementById('filterStatusSelect').addEventListener('change', () => {
    loadTasksList();
  });
  document.getElementById('filterDateInput').addEventListener('change', () => {
    loadTasksList();
  });

  // Dashboard Admin: Export Excel (.xlsx dengan foto di sel)
  document.getElementById('btnExportExcel').addEventListener('click', async () => {
    await handleExportExcel();
  });

  // Dashboard Admin: Kelola Karyawan Modal
  document.getElementById('btnOpenWorkerManager').addEventListener('click', () => {
    openWorkerManagerModal();
  });
  document.getElementById('btnCloseWorkerManager').addEventListener('click', () => {
    document.getElementById('workerManagerModal').style.display = 'none';
  });

  // Formulir Tambah Karyawan Baru
  document.getElementById('createWorkerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleCreateWorker();
  });

  // Reset Password Modal: Batal
  document.getElementById('btnCancelResetPw').addEventListener('click', () => {
    document.getElementById('resetPasswordModal').style.display = 'none';
  });

  // Reset Password Modal: Submit
  document.getElementById('resetPasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleResetPassword();
  });

  // Dashboard Admin: Pengaturan Modal
  document.getElementById('btnOpenSettings').addEventListener('click', () => {
    openSettingsModal();
  });
  document.getElementById('btnCloseSettings').addEventListener('click', () => {
    document.getElementById('settingsModal').style.display = 'none';
  });
  document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveSettings();
  });
}

// ==========================================
// KELOLA KARYAWAN (ADMIN WORKER MANAGER)
// ==========================================
async function openWorkerManagerModal() {
  document.getElementById('workerManagerModal').style.display = 'flex';
  await refreshWorkerManagerTable();
}

async function refreshWorkerManagerTable() {
  try {
    const res = await fetch('/api/admin/workers');
    const data = await res.json();
    const workers = (data.users || []).filter(u => u.role === 'worker');
    const tbody = document.getElementById('workerManagerTableBody');
    if (workers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:1.5rem; color:var(--text-dim);">Belum ada karyawan terdaftar. Tambahkan di form di atas.</td></tr>`;
      return;
    }
    tbody.innerHTML = workers.map(u => `
      <tr>
        <td><strong>${u.fullName || u.username}</strong></td>
        <td><code>${u.username}</code></td>
        <td>${u.phone || '-'}</td>
        <td style="text-align:center;">
          <button onclick="openResetPwModal('${u.id}', '${(u.fullName || u.username).replace(/'/g, '\\\'')}')" style="padding:4px 10px; font-size:0.78rem; background:#1e293b; border:1px solid #38bdf8; color:#38bdf8; border-radius:6px; cursor:pointer; margin-right:4px;">🔑 Ganti Sandi</button>
          <button onclick="handleDeleteWorker('${u.id}', '${(u.fullName || u.username).replace(/'/g, '\\\'')}')" style="padding:4px 10px; font-size:0.78rem; background:#1e293b; border:1px solid #f87171; color:#f87171; border-radius:6px; cursor:pointer;">🗑️ Hapus</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.warn('Gagal memuat daftar karyawan:', err);
  }
}

async function handleCreateWorker() {
  const fullName = document.getElementById('newWorkerFullName').value.trim();
  const username = document.getElementById('newWorkerUsername').value.trim();
  const password = document.getElementById('newWorkerPassword').value;
  const phone = document.getElementById('newWorkerPhone').value.trim();

  if (!fullName || !username || !password) {
    alert('Nama Lengkap, Username, dan Kata Sandi wajib diisi!');
    return;
  }

  try {
    const res = await fetch('/api/admin/workers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, username, password, phone })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menambahkan karyawan!');

    alert(`✅ Akun untuk ${fullName} berhasil dibuat!\nUsername: ${username}`);
    // Reset form
    document.getElementById('createWorkerForm').reset();
    // Refresh tabel
    await refreshWorkerManagerTable();
    // Refresh dropdown filter
    await loadWorkersList();
  } catch (err) {
    alert('Gagal: ' + err.message);
  }
}

function openResetPwModal(userId, workerName) {
  document.getElementById('resetPwUserId').value = userId;
  document.getElementById('resetPwWorkerName').textContent = `Karyawan: ${workerName}`;
  document.getElementById('resetPwInput').value = '';
  document.getElementById('resetPwInput').type = 'password';
  const btn = document.getElementById('btnToggleResetPw');
  if (btn) btn.textContent = '👁️';
  document.getElementById('resetPasswordModal').style.display = 'flex';
}

async function handleResetPassword() {
  const userId = document.getElementById('resetPwUserId').value;
  const newPassword = document.getElementById('resetPwInput').value;

  if (!newPassword || newPassword.length < 5) {
    alert('Kata sandi baru minimal 5 karakter!');
    return;
  }

  try {
    const res = await fetch(`/api/admin/workers/${userId}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengubah kata sandi!');

    alert('✅ Kata sandi karyawan berhasil diperbarui!');
    document.getElementById('resetPasswordModal').style.display = 'none';
  } catch (err) {
    alert('Gagal: ' + err.message);
  }
}

async function handleDeleteWorker(userId, workerName) {
  if (!confirm(`Hapus akun karyawan "${workerName}"?\nTindakan ini tidak dapat dibatalkan.`)) return;

  try {
    const res = await fetch(`/api/admin/workers/${userId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menghapus karyawan!');

    alert(`✅ Akun ${workerName} berhasil dihapus.`);
    await refreshWorkerManagerTable();
    await loadWorkersList();
  } catch (err) {
    alert('Gagal: ' + err.message);
  }
}

// ==========================================
// ALUR KERJA PEKERJA (WORKER DASHBOARD)
// ==========================================
async function loadWorkerDashboard() {
  const user = AppState.currentUser;
  if (!user) return;

  // Cek active task di localStorage atau server
  const savedActive = localStorage.getItem('active_task_' + user.id);
  if (savedActive) {
    try {
      AppState.activeTask = JSON.parse(savedActive);
      renderActiveTaskHero();
    } catch (e) {
      AppState.activeTask = null;
    }
  }

  // Muat riwayat tugas pekerja ini
  await loadWorkerHistory();
}

function renderActiveTaskHero() {
  const heroEl = document.getElementById('activeTaskHero');
  const task = AppState.activeTask;

  if (task && task.status === 'in_progress') {
    heroEl.classList.add('working');
    document.getElementById('noTaskPrompt').style.display = 'none';
    document.getElementById('activeTaskDetails').style.display = 'block';

    document.getElementById('activeTaskTitle').textContent = task.taskName;
    document.getElementById('activeTaskNotes').textContent = task.notes || 'Tidak ada catatan tambahan.';
    document.getElementById('activeTaskStartTime').textContent = `Mulai pukul ${task.startTime}`;

    // Jalankan timer stopwatch
    startTaskStopwatch(task.startTimestamp);
  } else {
    heroEl.classList.remove('working');
    document.getElementById('noTaskPrompt').style.display = 'block';
    document.getElementById('activeTaskDetails').style.display = 'none';
    stopTaskStopwatch();
  }
}

function startTaskStopwatch(startTimestamp) {
  stopTaskStopwatch();
  const timerEl = document.getElementById('activeTaskTimer');

  const update = () => {
    const now = Date.now();
    const diffSec = Math.max(0, Math.floor((now - startTimestamp) / 1000));
    const hrs = String(Math.floor(diffSec / 3600)).padStart(2, '0');
    const mins = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
    const secs = String(diffSec % 60).padStart(2, '0');
    if (timerEl) timerEl.textContent = `${hrs}:${mins}:${secs}`;
  };

  AppState.timerInterval = setInterval(update, 1000);
  update();
}

function stopTaskStopwatch() {
  if (AppState.timerInterval) {
    clearInterval(AppState.timerInterval);
    AppState.timerInterval = null;
  }
  const timerEl = document.getElementById('activeTaskTimer');
  if (timerEl) timerEl.textContent = '00:00:00';
}

async function loadWorkerHistory() {
  const user = AppState.currentUser;
  if (!user) return;

  try {
    const res = await fetch(`/api/tasks?workerName=${encodeURIComponent(user.fullName || user.username)}`);
    const data = await res.json();
    AppState.tasks = data.tasks || [];
    renderWorkerHistoryList(AppState.tasks);
  } catch (err) {
    console.warn('Gagal memuat riwayat:', err);
  }
}

function renderWorkerHistoryList(tasks) {
  const listEl = document.getElementById('workerHistoryList');
  if (!listEl) return;

  if (tasks.length === 0) {
    listEl.innerHTML = `<p style="text-align:center; color:var(--text-dim); padding:1rem;">Belum ada riwayat pekerjaan hari ini.</p>`;
    return;
  }

  listEl.innerHTML = tasks.map(t => {
    const isDone = t.status === 'completed';
    const durStr = t.durationMinutes ? `${t.durationMinutes} menit` : '-';

    // Thumbnail foto
    let thumbsHtml = '';
    if (t.startPhoto) {
      thumbsHtml += `<div class="task-thumb-item" onclick="viewPhotoDetail('${t.startPhoto}')">
        <img src="${t.startPhoto}" alt="Mulai" />
        <span class="thumb-label">MULAI</span>
      </div>`;
    }
    if (t.progressPhotos && t.progressPhotos.length > 0) {
      t.progressPhotos.forEach((p, idx) => {
        if (p.photoUrl) {
          thumbsHtml += `<div class="task-thumb-item" onclick="viewPhotoDetail('${p.photoUrl}')">
            <img src="${p.photoUrl}" alt="Progress ${idx+1}" />
            <span class="thumb-label">PROG</span>
          </div>`;
        }
      });
    }
    if (t.finishPhoto) {
      thumbsHtml += `<div class="task-thumb-item" onclick="viewPhotoDetail('${t.finishPhoto}')">
        <img src="${t.finishPhoto}" alt="Selesai" />
        <span class="thumb-label" style="background:rgba(16,185,129,0.9);">SELESAI</span>
      </div>`;
    }

    return `
      <div class="task-card-mini">
        <div class="task-card-top">
          <div class="task-card-title">${t.taskName}</div>
          <span class="badge-status ${t.status}">${isDone ? 'SELESAI' : 'BERJALAN'}</span>
        </div>
        <div class="task-card-time">
          🕒 ${t.startTime || '-'} s/d ${t.endTime || 'Sekarang'} (${durStr})
        </div>
        ${t.notes ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">📝 ${t.notes}</div>` : ''}
        <div class="task-thumbs-row">
          ${thumbsHtml}
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// KAMERA KHUSUS LAPANGAN DENGAN WATERMARK
// ==========================================
let capturedPhotoBase64 = null;

async function openCameraModal({ stage, stageKey, taskName, note }) {
  AppState.cameraPendingStage = stageKey;
  AppState.cameraPendingTaskName = taskName;
  AppState.cameraPendingNote = note;

  document.getElementById('cameraStageBadge').textContent = stage;

  const noteInput = document.getElementById('cameraNoteInput');
  noteInput.value = note || '';

  // Reset & evaluasi status tombol foto
  updateCameraShutterState();

  const modal = document.getElementById('cameraOverlayModal');
  modal.style.display = 'flex';

  const video = document.getElementById('cameraLiveVideo');
  try {
    await window.cameraManager.startCamera(video);
  } catch (err) {
    alert('Kamera tidak dapat diakses: ' + err.message + '\nPastikan browser Anda diizinkan mengakses kamera ponsel.');
    closeCameraModal();
  }
}

function closeCameraModal() {
  window.cameraManager.stopCamera();
  document.getElementById('cameraOverlayModal').style.display = 'none';
  document.getElementById('previewModal').style.display = 'none';
}

function snapWatermarkedPhoto() {
  try {
    const user = AppState.currentUser;
    const note = document.getElementById('cameraNoteInput').value.trim();
    if (!note) {
      alert('Wajib mengisi keterangan / penjelasan pekerjaan terlebih dahulu!');
      document.getElementById('cameraNoteInput').focus();
      return;
    }
    
    // Watermark dicetak otomatis langsung di canvas
    capturedPhotoBase64 = window.cameraManager.capturePhotoWithWatermark({
      workerName: user ? (user.fullName || user.username) : 'Pekerja',
      stage: AppState.cameraPendingStage,
      taskName: AppState.cameraPendingTaskName,
      note: note
    });

    // Tampilkan pratinjau sebelum dikonfirmasi
    const previewImg = document.getElementById('previewPhotoImg');
    previewImg.src = capturedPhotoBase64;
    document.getElementById('previewModal').style.display = 'flex';

  } catch (err) {
    alert('Gagal mengambil foto: ' + err.message);
  }
}

// Rekam Video Singkat
function toggleVideoRecording() {
  const btn = document.getElementById('btnRecordVideo');
  if (!window.cameraManager.isRecording) {
    btn.classList.add('recording');
    btn.innerHTML = '⏹️ Berhenti (0s)';
    window.cameraManager.startVideoRecording((secs) => {
      btn.innerHTML = `⏹️ Berhenti (${secs}s)`;
    });
  } else {
    btn.classList.remove('recording');
    btn.innerHTML = '🎥 Rekam Video Singkat';
    window.cameraManager.stopVideoRecording().then((res) => {
      if (res && res.dataUrl) {
        alert(`Video singkat (${res.duration} detik) berhasil direkam!`);
      }
    });
  }
}

// Kirim Foto yang Sudah Di-Watermark ke Server
async function submitPendingPhoto() {
  if (!capturedPhotoBase64) return;
  const user = AppState.currentUser;
  const stage = AppState.cameraPendingStage;
  const note = document.getElementById('cameraNoteInput').value.trim();

  document.getElementById('btnConfirmPhoto').textContent = 'Mengunggah...';

  try {
    if (stage === 'mulai') {
      const res = await fetch('/api/tasks/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerId: user.id,
          workerName: user.fullName || user.username,
          taskName: AppState.cameraPendingTaskName,
          notes: note,
          photoBase64: capturedPhotoBase64
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memulai pekerjaan!');

      AppState.activeTask = data.task;
      localStorage.setItem('active_task_' + user.id, JSON.stringify(data.task));
      renderActiveTaskHero();
      alert('Pekerjaan dimulai dan foto awal berhasil disimpan!');

    } else if (stage === 'progress') {
      const res = await fetch('/api/tasks/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: AppState.activeTask.id,
          note: note,
          photoBase64: capturedPhotoBase64
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menambah progress!');

      AppState.activeTask = data.task;
      localStorage.setItem('active_task_' + user.id, JSON.stringify(data.task));
      alert('Foto progress pengerjaan berhasil ditambahkan!');

    } else if (stage === 'selesai') {
      const res = await fetch('/api/tasks/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: AppState.activeTask.id,
          finalNotes: note,
          photoBase64: capturedPhotoBase64
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyelesaikan pekerjaan!');

      // Selesai -> Bersihkan active task
      AppState.activeTask = null;
      localStorage.removeItem('active_task_' + user.id);
      renderActiveTaskHero();
      alert('Alhamdulillah! Pekerjaan selesai dan durasi jam kerja telah terhitung rapi.');
    }

    closeCameraModal();
    loadWorkerHistory();

  } catch (err) {
    alert('Terjadi kesalahan: ' + err.message);
  } finally {
    document.getElementById('btnConfirmPhoto').textContent = '✅ Gunakan Foto Ini';
  }
}

// ==========================================
// DASHBOARD PIC / SUPERVISOR (ADMIN)
// ==========================================
async function loadAdminDashboard() {
  await loadWorkersList();
  await loadTasksList();
}

async function loadWorkersList() {
  try {
    const res = await fetch('/api/admin/workers');
    const data = await res.json();
    AppState.workers = data.users || [];

    // Isi dropdown filter nama pekerja
    const select = document.getElementById('filterWorkerSelect');
    if (select) {
      select.innerHTML = '<option value="all">-- Semua Pekerja (Abang-Abang) --</option>' +
        AppState.workers
          .filter(u => u.role === 'worker')
          .map(u => `<option value="${u.fullName || u.username}">${u.fullName || u.username}</option>`)
          .join('');
    }
  } catch (err) {
    console.warn('Gagal memuat daftar pekerja:', err);
  }
}

async function loadTasksList() {
  const workerFilter = document.getElementById('filterWorkerSelect').value;
  const statusFilter = document.getElementById('filterStatusSelect').value;
  const dateFilter = document.getElementById('filterDateInput').value;

  let url = `/api/tasks?workerName=${encodeURIComponent(workerFilter)}&status=${encodeURIComponent(statusFilter)}`;
  if (dateFilter) {
    const parts = dateFilter.split('-'); // YYYY-MM-DD
    if (parts.length === 3) {
      const formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      url += `&date=${encodeURIComponent(formattedDate)}`;
    }
  }

  try {
    const res = await fetch(url);
    const data = await res.json();
    AppState.tasks = data.tasks || [];
    renderAdminMetrics(AppState.tasks);
    renderAdminTable(AppState.tasks);
  } catch (err) {
    console.error('Gagal memuat tugas admin:', err);
  }
}

function renderAdminMetrics(tasks) {
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const active = tasks.filter(t => t.status === 'in_progress').length;

  const totalMinutes = tasks.reduce((sum, t) => sum + (t.durationMinutes || 0), 0);
  const hours = (totalMinutes / 60).toFixed(1);

  document.getElementById('metricTotalTasks').textContent = total;
  document.getElementById('metricActiveTasks').textContent = active;
  document.getElementById('metricCompletedTasks').textContent = completed;
  document.getElementById('metricTotalHours').textContent = `${hours} Jam`;
}

function renderAdminTable(tasks) {
  const tbody = document.getElementById('adminTasksTableBody');
  if (!tbody) return;

  if (tasks.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2rem; color:var(--text-dim);">Belum ada data pekerjaan yang cocok dengan filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = tasks.map((t, idx) => {
    const isDone = t.status === 'completed';
    const durStr = t.durationMinutes ? `${Math.floor(t.durationMinutes/60)}j ${t.durationMinutes%60}m` : '-';

    // Pratinjau Foto Mulai
    const startImgHtml = t.startPhoto 
      ? `<div class="photo-cell-preview" onclick="viewPhotoDetail('${t.startPhoto}')"><img src="${t.startPhoto}" alt="Mulai" /></div>`
      : '<span style="color:var(--text-dim);">-</span>';

    // Pratinjau Foto Progress
    let progImgHtml = '<span style="color:var(--text-dim);">-</span>';
    if (t.progressPhotos && t.progressPhotos.length > 0 && t.progressPhotos[0].photoUrl) {
      progImgHtml = `<div class="photo-cell-preview" onclick="viewPhotoDetail('${t.progressPhotos[0].photoUrl}')"><img src="${t.progressPhotos[0].photoUrl}" alt="Progress" /></div>`;
    }

    // Pratinjau Foto Selesai
    const finishImgHtml = t.finishPhoto 
      ? `<div class="photo-cell-preview" onclick="viewPhotoDetail('${t.finishPhoto}')"><img src="${t.finishPhoto}" alt="Selesai" /></div>`
      : '<span style="color:var(--text-dim);">-</span>';

    return `
      <tr>
        <td style="text-align:center; font-weight:700;">${idx + 1}</td>
        <td><strong>${t.workerName}</strong></td>
        <td>${t.date}</td>
        <td>${t.startTime} - ${t.endTime || '<em style="color:#fbbf24">Sedang Jalan</em>'}</td>
        <td style="font-weight:600;">${durStr}</td>
        <td>
          <div style="font-weight:600; color:#fff;">${t.taskName}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${t.notes || '-'}</div>
        </td>
        <td style="text-align:center;">${startImgHtml}</td>
        <td style="text-align:center;">${progImgHtml}</td>
        <td style="text-align:center;">${finishImgHtml}</td>
        <td style="text-align:center;">
          <span class="badge-status ${t.status}">${isDone ? 'SELESAI' : 'PROSES'}</span>
          <button onclick="syncSingleTaskGDrive('${t.id}')" title="Kirim ke Google Drive/Sheets" style="margin-top:4px; padding:2px 6px; font-size:0.7rem; background:#1e293b; border:1px solid #475569; color:#38bdf8; border-radius:4px; cursor:pointer; display:block; width:100%;">
            ☁️ Sync
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Modal Pratinjau Detail Foto
function viewPhotoDetail(photoUrl) {
  if (!photoUrl) return;
  const modal = document.getElementById('previewModal');
  const img = document.getElementById('previewPhotoImg');
  img.src = photoUrl;
  modal.style.display = 'flex';
  document.getElementById('btnConfirmPhoto').style.display = 'none';
  document.getElementById('btnRetakePhoto').textContent = 'Tutup';
  document.getElementById('btnRetakePhoto').onclick = () => {
    modal.style.display = 'none';
    document.getElementById('btnConfirmPhoto').style.display = 'block';
    document.getElementById('btnRetakePhoto').textContent = 'Ambil Ulang';
  };
}

// Ekspor Excel (.xlsx) dengan Foto Tertanam Langsung di Dalam Sel
async function handleExportExcel() {
  const btn = document.getElementById('btnExportExcel');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Menyiapkan Excel & Foto...';
  btn.disabled = true;

  try {
    const workerFilter = document.getElementById('filterWorkerSelect').value;
    const dateFilter = document.getElementById('filterDateInput').value;

    // Coba unduh via backend /api/tasks/export-excel
    let downloadUrl = `/api/tasks/export-excel?workerName=${encodeURIComponent(workerFilter)}`;
    if (dateFilter) {
      const parts = dateFilter.split('-');
      downloadUrl += `&date=${encodeURIComponent(`${parts[2]}/${parts[1]}/${parts[0]}`)}`;
    }

    const response = await fetch(downloadUrl);
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Laporan_Kerja_${workerFilter}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } else {
      // Fallback ke Client-Side ExcelJS
      console.log('Menggunakan fallback export client-side...');
      await window.exportTasksToExcelClient(AppState.tasks, AppState.settings.companyName);
    }

    alert('✅ File Excel berhasil diunduh! Foto-foto pekerjaan sudah tertanam langsung di dalam kotak sel Excel tanpa perlu buka link lagi.');
  } catch (err) {
    alert('Gagal mengekspor Excel: ' + err.message);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// Sync Manual 1 Task ke Google Drive & Sheets
async function syncSingleTaskGDrive(taskId) {
  try {
    const res = await fetch('/api/tasks/sync-gdrive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal sinkronisasi!');
    alert('✅ ' + data.message);
  } catch (err) {
    alert('Sinkronisasi Google Drive gagal: ' + err.message + '\nPastikan URL Google Apps Script sudah disetel di menu Pengaturan.');
  }
}

// Pengaturan
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    AppState.settings = data;
    const inputUrl = document.getElementById('settingGasUrl');
    if (inputUrl) inputUrl.value = data.gasWebhookUrl || '';
    const inputCompany = document.getElementById('settingCompanyName');
    if (inputCompany) inputCompany.value = data.companyName || 'Laporan Kerja Lapangan';
  } catch (e) {
    console.warn('Gagal muat settings:', e);
  }
}

function openSettingsModal() {
  loadSettings();
  document.getElementById('settingsModal').style.display = 'flex';
}

async function saveSettings() {
  const gasWebhookUrl = document.getElementById('settingGasUrl').value.trim();
  const companyName = document.getElementById('settingCompanyName').value.trim();

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gasWebhookUrl, companyName })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menyimpan pengaturan');

    AppState.settings = data.settings;
    alert('✅ Pengaturan berhasil disimpan!');
    document.getElementById('settingsModal').style.display = 'none';
  } catch (err) {
    alert(err.message);
  }
}

// ==========================================
// KONTROL SUPER ADMIN (PANEL KENDALI PENUH)
// ==========================================
function openSuperAdminModal() {
  const modal = document.getElementById('superAdminModal');
  if (modal) modal.style.display = 'flex';
  const pwInput = document.getElementById('superAdminNewAdminPw');
  if (pwInput) pwInput.value = '';
  loadSuperAdminUsers();
}

function closeSuperAdminModal() {
  const modal = document.getElementById('superAdminModal');
  if (modal) modal.style.display = 'none';
}

async function loadSuperAdminUsers() {
  const tbody = document.getElementById('superAdminUsersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:1rem; color:#94a3b8;">Memuat data pengguna...</td></tr>';

  try {
    const res = await fetch('/api/superadmin/users');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal memuat pengguna');

    if (!data.users || data.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:1rem; color:#94a3b8;">Tidak ada pengguna terdaftar.</td></tr>';
      return;
    }

    tbody.innerHTML = data.users.map(u => {
      let roleBadge = '<span style="background:#e0e7ff; color:#3730a3; padding:2px 8px; border-radius:9999px; font-weight:700; font-size:0.72rem;">PEKERJA</span>';
      if (u.role === 'superadmin') {
        roleBadge = '<span style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:9999px; font-weight:700; font-size:0.72rem;">👑 SUPERADMIN</span>';
      } else if (u.role === 'admin') {
        roleBadge = '<span style="background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:9999px; font-weight:700; font-size:0.72rem;">ADMIN / PIC</span>';
      }

      const isSelf = u.role === 'superadmin';
      let actionButtons = '';

      if (isSelf) {
        actionButtons = '<span style="font-size:0.75rem; color:#94a3b8; font-weight:600;">(Akun Utama)</span>';
      } else {
        actionButtons = `
          <button type="button" class="btn-sm" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:3px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer; margin-right:4px;" onclick="openResetPwModal('${u.id}', '${escapeHtml(u.fullName || u.username)}')">
            🔑 Ganti Sandi
          </button>
          <button type="button" class="btn-sm" style="background:#fee2e2; border:1px solid #fca5a5; color:#b91c1c; padding:3px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer;" onclick="handleSuperAdminDeleteUser('${u.id}', '${escapeHtml(u.fullName || u.username)}', '${u.role}')">
            🗑️ Hapus
          </button>
        `;
      }

      return `
        <tr>
          <td style="font-weight:600;">${escapeHtml(u.fullName || '-')}</td>
          <td><code>${escapeHtml(u.username)}</code></td>
          <td>${roleBadge}</td>
          <td>${escapeHtml(u.phone || '-')}</td>
          <td style="text-align:center; white-space:nowrap;">
            ${actionButtons}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1rem; color:#ef4444;">Gagal: ${err.message}</td></tr>`;
  }
}

async function handleSuperAdminDeleteUser(id, name, role) {
  const roleLabel = role === 'admin' ? 'Akun Admin' : 'Akun Karyawan';
  if (!confirm(`⚠️ PERINGATAN SUPERADMIN:\n\nApakah Anda yakin ingin MENGHAPUS ${roleLabel} "${name}"?\n\nTindakan ini tidak dapat dibatalkan.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/superadmin/users/${id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menghapus pengguna');
    alert('✅ ' + data.message);
    loadSuperAdminUsers();
    loadWorkersList();
  } catch (err) {
    alert('❌ ' + err.message);
  }
}

async function handleSuperAdminChangeAdminPassword(e) {
  e.preventDefault();
  const newPassword = document.getElementById('superAdminNewAdminPw').value.trim();
  if (!newPassword || newPassword.length < 5) {
    alert('Kata sandi minimal 5 karakter!');
    return;
  }

  try {
    const res = await fetch('/api/superadmin/change-admin-password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengubah kata sandi admin');
    alert('✅ ' + data.message);
    document.getElementById('superAdminNewAdminPw').value = '';
    loadSuperAdminUsers();
  } catch (err) {
    alert('❌ ' + err.message);
  }
}

async function handleSuperAdminResetTotal() {
  const confirm1 = confirm('⚠️ PERINGATAN KERAS DARI SUPERADMIN:\n\nApakah Anda yakin ingin melakukan RESET TOTAL?\n\nTindakan ini akan:\n1. MENGHAPUS SEMUA DATA LAPORAN & PEKERJAAN\n2. MENGHAPUS SEMUA FILE FOTO DI SERVER\n\nOperasional akan dimulai bersih 100% dari awal!');
  if (!confirm1) return;

  const confirmText = prompt('Ketik kata "RESET" (huruf besar semua) untuk konfirmasi eksekusi:');
  if (confirmText !== 'RESET') {
    alert('Konfirmasi batal. Kata konfirmasi yang dimasukkan tidak sesuai.');
    return;
  }

  try {
    const res = await fetch('/api/superadmin/reset-total', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal melakukan reset total');
    alert('✅ ' + data.message);
    closeSuperAdminModal();
    loadAdminDashboard();
  } catch (err) {
    alert('❌ ' + err.message);
  }
}

async function handleSuperAdminResetSheet() {
  const confirm1 = confirm('⚠️ KONFIRMASI RESET GOOGLE SHEETS:\n\nApakah Anda yakin ingin mengosongkan seluruh baris data di Google Spreadsheet kantor?\n\nFormat header kolom tabel akan tetap terjaga.');
  if (!confirm1) return;

  try {
    const res = await fetch('/api/superadmin/reset-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal melakukan reset Google Sheets');
    alert('✅ ' + data.message);
  } catch (err) {
    alert('❌ ' + err.message);
  }
}

// Expose globals for onclick events
window.viewPhotoDetail = viewPhotoDetail;
window.syncSingleTaskGDrive = syncSingleTaskGDrive;
window.openResetPwModal = openResetPwModal;
window.handleDeleteWorker = handleDeleteWorker;
window.openSuperAdminModal = openSuperAdminModal;
window.closeSuperAdminModal = closeSuperAdminModal;
window.handleSuperAdminDeleteUser = handleSuperAdminDeleteUser;
