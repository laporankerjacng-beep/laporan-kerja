/**
 * Logika Utama Aplikasi Laporan Kerja Lapangan
 * Versi baru dengan fitur:
 * - Multi-foto per tahap (jepret banyak foto sebelum kirim)
 * - Mode video berfungsi penuh (rekam & upload ke server)
 * - Multi-tugas berjalan (bisa tap kerjaan tertunda untuk lanjut)
 * - Hapus foto progress duplikat
 * - Hapus tugas aktif
 * - Thumbnail lebih besar di riwayat
 */

const AppState = {
  currentUser: null,
  activeTask: null,
  activeTasks: [],
  tasks: [],
  workers: [],
  settings: { companyName: 'Laporan Kerja Lapangan', gasWebhookUrl: '', autoSyncGDrive: false },
  timerInterval: null,
  cameraPendingStage: null,
  cameraPendingNote: '',
  cameraPendingTaskName: '',
  cameraMode: 'photo',
  isSubmitting: false
};

let capturedPhotos = [];
let capturedVideoResult = null;

document.addEventListener('DOMContentLoaded', () => {
  initLiveClock();
  loadSavedUser();
  setupEventListeners();
  loadSettings();
});

function initLiveClock() {
  const clockEl = document.getElementById('liveHeaderClock');
  const update = () => {
    const now = new Date();
    const str = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';
    if (clockEl) clockEl.textContent = str;
    const cam = document.getElementById('cameraLiveClock');
    if (cam) cam.textContent = str;
  };
  setInterval(update, 1000);
  update();
}

function loadSavedUser() {
  const saved = localStorage.getItem('laporan_user');
  if (saved) {
    try { AppState.currentUser = JSON.parse(saved); applyUserSession(); }
    catch (e) { localStorage.removeItem('laporan_user'); }
  } else { showAuthView(); }
}

function applyUserSession() {
  const user = AppState.currentUser;
  if (!user) { showAuthView(); return; }
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('headerUserBadge').style.display = 'flex';
  document.getElementById('headerUserName').textContent = user.fullName || user.username;
  const roleBadge = document.getElementById('headerUserRole');
  roleBadge.className = 'user-role-badge';
  const isSuperAdmin = user.role === 'superadmin';
  const isAdmin = user.role === 'admin';
  if (isSuperAdmin) { roleBadge.textContent = '\u{1F451} Super Admin'; roleBadge.classList.add('superadmin'); }
  else if (isAdmin) { roleBadge.textContent = 'PIC / Admin'; }
  else { roleBadge.textContent = 'Pekerja'; }
  const btnSA = document.getElementById('btnOpenSuperAdmin');
  if (btnSA) btnSA.style.display = isSuperAdmin ? 'inline-flex' : 'none';
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

function setupPasswordToggle(btnId, inputId) {
  const btn = document.getElementById(btnId);
  const inp = document.getElementById(inputId);
  if (!btn || !inp) return;
  btn.addEventListener('click', () => {
    const h = inp.type === 'password';
    inp.type = h ? 'text' : 'password';
    btn.textContent = h ? '\u{1F648}' : '\u{1F441}\uFE0F';
  });
}

function updateCameraShutterState() {
  const noteInput = document.getElementById('cameraNoteInput');
  const snapBtn = document.getElementById('btnSnapPhoto');
  const recBtn = document.getElementById('btnRecordVideo');
  const requiredBar = document.getElementById('cameraRequiredNote');
  if (!noteInput) return;
  const hasNote = noteInput.value.trim().length > 0;
  if (snapBtn) { snapBtn.disabled = !hasNote; snapBtn.style.opacity = hasNote ? '1' : '0.4'; }
  if (recBtn && !window.cameraManager.isRecording) { recBtn.disabled = !hasNote; recBtn.style.opacity = hasNote ? '1' : '0.4'; }
  noteInput.style.border = hasNote ? '2px solid rgba(34,197,94,0.7)' : '2px solid rgba(234,179,8,0.7)';
  if (requiredBar) requiredBar.style.display = hasNote ? 'none' : 'flex';
}

function setupEventListeners() {
  setupPasswordToggle('btnToggleLoginPw', 'loginPassword');
  setupPasswordToggle('btnToggleNewWorkerPw', 'newWorkerPassword');
  setupPasswordToggle('btnToggleResetPw', 'resetPwInput');
  setupPasswordToggle('btnToggleSuperAdminAdminPw', 'superAdminNewAdminPw');

  const btnSA = document.getElementById('btnOpenSuperAdmin');
  if (btnSA) btnSA.addEventListener('click', openSuperAdminModal);
  const btnCloseSA = document.getElementById('btnCloseSuperAdmin');
  if (btnCloseSA) btnCloseSA.addEventListener('click', closeSuperAdminModal);
  const formSAPw = document.getElementById('formSuperAdminChangeAdminPw');
  if (formSAPw) formSAPw.addEventListener('submit', handleSuperAdminChangeAdminPassword);
  const btnRT = document.getElementById('btnTriggerResetTotal');
  if (btnRT) btnRT.addEventListener('click', handleSuperAdminResetTotal);
  const btnRS = document.getElementById('btnTriggerResetSheet');
  if (btnRS) btnRS.addEventListener('click', handleSuperAdminResetSheet);

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login gagal!');
      AppState.currentUser = data.user;
      localStorage.setItem('laporan_user', JSON.stringify(data.user));
      applyUserSession();
    } catch (err) { alert(err.message); }
  });

  document.getElementById('btnLogout').addEventListener('click', () => {
    if (confirm('Keluar dari sistem?')) { if (AppState.timerInterval) clearInterval(AppState.timerInterval); showAuthView(); }
  });

  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      document.getElementById('newTaskNameInput').value = chip.getAttribute('data-value');
    });
  });

  document.getElementById('btnStartNewTask').addEventListener('click', () => {
    const taskName = document.getElementById('newTaskNameInput').value.trim();
    if (!taskName) { alert('Pilih atau ketik nama pekerjaan!'); document.getElementById('newTaskNameInput').focus(); return; }
    const notes = document.getElementById('newTaskNoteInput').value.trim();
    openCameraModal({ stage: 'MULAI PEKERJAAN', stageKey: 'mulai', taskName, note: notes || '' });
  });

  const btnCancelForm = document.getElementById('btnCancelNewTaskForm');
  if (btnCancelForm) btnCancelForm.addEventListener('click', renderActiveTaskHero);
  const btnUrgent = document.getElementById('btnOpenNewUrgentTask');
  if (btnUrgent) btnUrgent.addEventListener('click', openUrgentTaskForm);
  const btnHeaderUrgent = document.getElementById('btnHeaderUrgentTask');
  if (btnHeaderUrgent) btnHeaderUrgent.addEventListener('click', openUrgentTaskForm);
  const btnDelTask = document.getElementById('btnDeleteActiveTask');
  if (btnDelTask) btnDelTask.addEventListener('click', handleDeleteActiveTask);

  document.getElementById('btnProgressAction').addEventListener('click', () => {
    if (!AppState.activeTask) return;
    openCameraModal({ stage: 'PROGRESS / SEDANG DIKERJAKAN', stageKey: 'progress', taskName: AppState.activeTask.taskName, note: '' });
  });

  document.getElementById('btnFinishAction').addEventListener('click', () => {
    if (!AppState.activeTask) return;
    if (confirm('Pekerjaan sudah selesai?')) {
      openCameraModal({ stage: 'PEKERJAAN SELESAI / SIAP', stageKey: 'selesai', taskName: AppState.activeTask.taskName, note: '' });
    }
  });

  document.getElementById('btnCloseCamera').addEventListener('click', closeCameraModal);
  document.getElementById('cameraNoteInput').addEventListener('input', updateCameraShutterState);
  document.getElementById('btnSnapPhoto').addEventListener('click', snapWatermarkedPhoto);

  const recBtn = document.getElementById('btnRecordVideo');
  if (recBtn) recBtn.addEventListener('click', toggleVideoRecording);

  const btnTabPhoto = document.getElementById('btnTabModePhoto');
  if (btnTabPhoto) btnTabPhoto.addEventListener('click', () => setCameraMode('photo'));
  const btnTabVideo = document.getElementById('btnTabModeVideo');
  if (btnTabVideo) btnTabVideo.addEventListener('click', () => setCameraMode('video'));
  const btnToggleMode = document.getElementById('btnToggleCameraMode');
  if (btnToggleMode) btnToggleMode.addEventListener('click', () => setCameraMode(AppState.cameraMode === 'photo' ? 'video' : 'photo'));

  document.getElementById('btnRetakePhoto').addEventListener('click', () => {
    document.getElementById('previewModal').style.display = 'none';
    stopPreviewVideo();
  });
  document.getElementById('btnConfirmPhoto').addEventListener('click', submitPendingMedia);

  document.getElementById('filterWorkerSelect').addEventListener('change', loadTasksList);
  document.getElementById('filterStatusSelect').addEventListener('change', loadTasksList);
  document.getElementById('filterDateInput').addEventListener('change', loadTasksList);
  document.getElementById('btnExportExcel').addEventListener('click', handleExportExcel);
  document.getElementById('btnOpenWorkerManager').addEventListener('click', openWorkerManagerModal);
  document.getElementById('btnCloseWorkerManager').addEventListener('click', () => { document.getElementById('workerManagerModal').style.display = 'none'; });
  document.getElementById('createWorkerForm').addEventListener('submit', async (e) => { e.preventDefault(); await handleCreateWorker(); });
  document.getElementById('btnCancelResetPw').addEventListener('click', () => { document.getElementById('resetPasswordModal').style.display = 'none'; });
  document.getElementById('resetPasswordForm').addEventListener('submit', async (e) => { e.preventDefault(); await handleResetPassword(); });
  document.getElementById('btnOpenSettings').addEventListener('click', openSettingsModal);
  document.getElementById('btnCloseSettings').addEventListener('click', () => { document.getElementById('settingsModal').style.display = 'none'; });
  document.getElementById('settingsForm').addEventListener('submit', async (e) => { e.preventDefault(); await saveSettings(); });
}

function setCameraMode(mode) {
  AppState.cameraMode = mode;
  const snapBtn = document.getElementById('btnSnapPhoto');
  const recBtn = document.getElementById('btnRecordVideo');
  const tabPhoto = document.getElementById('btnTabModePhoto');
  const tabVideo = document.getElementById('btnTabModeVideo');
  const hintEl = document.getElementById('cameraModeHint');
  const modeBadge = document.getElementById('cameraActiveModeBadge');
  const toggleBtn = document.getElementById('btnToggleCameraMode');
  if (mode === 'photo') {
    if (snapBtn) snapBtn.style.display = 'block';
    if (recBtn) recBtn.style.display = 'none';
    if (tabPhoto) tabPhoto.classList.add('active');
    if (tabVideo) tabVideo.classList.remove('active');
    if (hintEl) hintEl.textContent = 'Mode Foto: Tekan tombol bulat putih untuk jepret foto.';
    if (modeBadge) modeBadge.textContent = '\u{1F4F7} Mode: FOTO';
    if (toggleBtn) toggleBtn.textContent = '\u{1F3A5} Switch Video';
  } else {
    if (snapBtn) snapBtn.style.display = 'none';
    if (recBtn) recBtn.style.display = 'flex';
    if (tabPhoto) tabPhoto.classList.remove('active');
    if (tabVideo) tabVideo.classList.add('active');
    if (hintEl) hintEl.textContent = 'Mode Video: Tekan tombol merah untuk mulai/stop rekam. Maks 30 detik.';
    if (modeBadge) modeBadge.textContent = '\u{1F3A5} Mode: VIDEO';
    if (toggleBtn) toggleBtn.textContent = '\u{1F4F7} Switch Foto';
  }
  updateCameraShutterState();
}

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
    if (!workers.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:1.5rem;">Belum ada karyawan.</td></tr>'; return; }
    tbody.innerHTML = workers.map(u => `
      <tr>
        <td><strong>${escapeHtml(u.fullName || u.username)}</strong></td>
        <td><code>${escapeHtml(u.username)}</code></td>
        <td>${escapeHtml(u.phone || '-')}</td>
        <td style="text-align:center;">
          <button onclick="openResetPwModal('${u.id}','${escapeHtml(u.fullName||u.username).replace(/'/g,'')}')" style="padding:4px 10px;font-size:0.78rem;background:#1e293b;border:1px solid #38bdf8;color:#38bdf8;border-radius:6px;cursor:pointer;margin-right:4px;">\u{1F511} Ganti Sandi</button>
          <button onclick="handleDeleteWorker('${u.id}','${escapeHtml(u.fullName||u.username).replace(/'/g,'')}')" style="padding:4px 10px;font-size:0.78rem;background:#1e293b;border:1px solid #f87171;color:#f87171;border-radius:6px;cursor:pointer;">\u{1F5D1}\uFE0F Hapus</button>
        </td>
      </tr>`).join('');
  } catch (err) { console.warn('Gagal muat karyawan:', err); }
}

async function handleCreateWorker() {
  const fullName = document.getElementById('newWorkerFullName').value.trim();
  const username = document.getElementById('newWorkerUsername').value.trim();
  const password = document.getElementById('newWorkerPassword').value;
  const phone = document.getElementById('newWorkerPhone').value.trim();
  if (!fullName || !username || !password) { alert('Nama, Username, dan Sandi wajib diisi!'); return; }
  try {
    const res = await fetch('/api/admin/workers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName, username, password, phone }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal!');
    alert('Akun berhasil dibuat! Username: ' + username);
    document.getElementById('createWorkerForm').reset();
    await refreshWorkerManagerTable();
    await loadWorkersList();
  } catch (err) { alert('Gagal: ' + err.message); }
}

function openResetPwModal(userId, workerName) {
  document.getElementById('resetPwUserId').value = userId;
  document.getElementById('resetPwWorkerName').textContent = 'Karyawan: ' + workerName;
  document.getElementById('resetPwInput').value = '';
  document.getElementById('resetPwInput').type = 'password';
  const btn = document.getElementById('btnToggleResetPw');
  if (btn) btn.textContent = '\u{1F441}\uFE0F';
  document.getElementById('resetPasswordModal').style.display = 'flex';
}

async function handleResetPassword() {
  const userId = document.getElementById('resetPwUserId').value;
  const newPassword = document.getElementById('resetPwInput').value;
  if (!newPassword || newPassword.length < 5) { alert('Sandi minimal 5 karakter!'); return; }
  try {
    const res = await fetch('/api/admin/workers/' + userId + '/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newPassword }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal!');
    alert('Sandi berhasil diperbarui!');
    document.getElementById('resetPasswordModal').style.display = 'none';
  } catch (err) { alert('Gagal: ' + err.message); }
}

async function handleDeleteWorker(userId, workerName) {
  if (!confirm('Hapus akun "' + workerName + '"?')) return;
  try {
    const res = await fetch('/api/admin/workers/' + userId, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal!');
    alert('Akun ' + workerName + ' berhasil dihapus.');
    await refreshWorkerManagerTable();
    await loadWorkersList();
  } catch (err) { alert('Gagal: ' + err.message); }
}

async function loadWorkerDashboard() {
  const user = AppState.currentUser;
  if (!user) return;
  await loadWorkerHistory();
  AppState.activeTasks = AppState.tasks.filter(t => t.status === 'in_progress');
  const savedId = localStorage.getItem('active_task_id_' + user.id);
  if (savedId) {
    const found = AppState.activeTasks.find(t => t.id === savedId);
    AppState.activeTask = found || (AppState.activeTasks[0] || null);
    if (!found) {
      if (AppState.activeTask) localStorage.setItem('active_task_id_' + user.id, AppState.activeTask.id);
      else localStorage.removeItem('active_task_id_' + user.id);
    }
  } else if (AppState.activeTasks.length > 0) {
    AppState.activeTask = AppState.activeTasks[0];
    localStorage.setItem('active_task_id_' + user.id, AppState.activeTask.id);
  }
  renderActiveTaskHero();
  renderInProgressSection();
}

function renderActiveTaskHero() {
  const heroEl = document.getElementById('activeTaskHero');
  const task = AppState.activeTask;
  document.getElementById('noTaskPrompt').style.display = 'none';
  document.getElementById('activeTaskDetails').style.display = 'none';
  document.getElementById('newTaskNameInput').value = '';
  document.getElementById('newTaskNoteInput').value = '';
  const btnCancel = document.getElementById('btnCancelNewTaskForm');
  if (btnCancel) btnCancel.style.display = 'none';
  const heading = document.getElementById('taskFormHeading');
  if (heading) heading.textContent = 'Mulai Pekerjaan Baru';

  if (task && task.status === 'in_progress') {
    heroEl.classList.add('working');
    document.getElementById('activeTaskDetails').style.display = 'block';
    document.getElementById('activeTaskTitle').textContent = task.taskName;
    document.getElementById('activeTaskNotes').textContent = task.notes || 'Tidak ada catatan tambahan.';
    document.getElementById('activeTaskStartTime').textContent = 'Mulai pukul ' + task.startTime;
    startTaskStopwatch(task.startTimestamp);
  } else {
    heroEl.classList.remove('working');
    document.getElementById('noTaskPrompt').style.display = 'block';
    stopTaskStopwatch();
  }
}

function openUrgentTaskForm() {
  document.getElementById('activeTaskDetails').style.display = 'none';
  document.getElementById('noTaskPrompt').style.display = 'block';
  document.getElementById('newTaskNameInput').value = '';
  document.getElementById('newTaskNoteInput').value = '';
  const btnCancel = document.getElementById('btnCancelNewTaskForm');
  if (btnCancel) btnCancel.style.display = 'inline-block';
  const heading = document.getElementById('taskFormHeading');
  if (heading) heading.textContent = 'Kerjaan Mendadak Baru';
  document.getElementById('activeTaskHero').classList.remove('working');
  document.getElementById('newTaskNameInput').focus();
}

function renderInProgressSection() {
  const section = document.getElementById('workerInProgressSection');
  const listEl = document.getElementById('workerInProgressList');
  if (!section || !listEl) return;
  const tasks = AppState.activeTasks;
  if (tasks.length <= 1) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  listEl.innerHTML = tasks.map(t => {
    const isActive = AppState.activeTask && t.id === AppState.activeTask.id;
    const cnt = (t.progressPhotos || []).length;
    const badge = isActive
      ? '<span style="font-size:0.72rem;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;padding:2px 8px;border-radius:9999px;font-weight:700;">Aktif</span>'
      : '<span style="font-size:0.72rem;background:#fefce8;color:#b45309;border:1px solid #fde68a;padding:2px 8px;border-radius:9999px;font-weight:700;">Tap Lanjut</span>';
    return `<div class="task-card-in-progress ${isActive ? 'is-selected' : ''}" onclick="switchToTask('${t.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div>
          <div style="font-weight:700;font-size:0.9rem;color:var(--text-main);">${escapeHtml(t.taskName)}</div>
          <div style="font-size:0.75rem;color:var(--text-dim);margin-top:2px;">Mulai ${t.startTime} | ${cnt} foto</div>
        </div>
        ${badge}
      </div>
      ${t.notes ? '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px;">' + escapeHtml(t.notes) + '</div>' : ''}
    </div>`;
  }).join('');
}

function switchToTask(taskId) {
  const task = AppState.activeTasks.find(t => t.id === taskId);
  if (!task) return;
  AppState.activeTask = task;
  const user = AppState.currentUser;
  if (user) localStorage.setItem('active_task_id_' + user.id, taskId);
  renderActiveTaskHero();
  renderInProgressSection();
}

async function handleDeleteActiveTask() {
  if (!AppState.activeTask) return;
  const taskName = AppState.activeTask.taskName;
  if (!confirm('Hapus tugas "' + taskName + '"? Semua foto akan ikut terhapus.')) return;
  try {
    const res = await fetch('/api/tasks/' + AppState.activeTask.id, { method: 'DELETE' });
    if (!res.ok) throw new Error('Gagal menghapus!');
    const user = AppState.currentUser;
    localStorage.removeItem('active_task_id_' + (user ? user.id : ''));
    AppState.activeTasks = AppState.activeTasks.filter(t => t.id !== AppState.activeTask.id);
    AppState.activeTask = AppState.activeTasks.length > 0 ? AppState.activeTasks[0] : null;
    if (AppState.activeTask && user) localStorage.setItem('active_task_id_' + user.id, AppState.activeTask.id);
    alert('Tugas berhasil dihapus.');
    await loadWorkerHistory();
    renderActiveTaskHero();
    renderInProgressSection();
  } catch (err) { alert('Gagal: ' + err.message); }
}

function startTaskStopwatch(startTimestamp) {
  stopTaskStopwatch();
  const timerEl = document.getElementById('activeTaskTimer');
  const update = () => {
    const diff = Math.max(0, Math.floor((Date.now() - startTimestamp) / 1000));
    const h = String(Math.floor(diff / 3600)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const s = String(diff % 60).padStart(2, '0');
    if (timerEl) timerEl.textContent = h + ':' + m + ':' + s;
  };
  AppState.timerInterval = setInterval(update, 1000);
  update();
}

function stopTaskStopwatch() {
  if (AppState.timerInterval) { clearInterval(AppState.timerInterval); AppState.timerInterval = null; }
  const timerEl = document.getElementById('activeTaskTimer');
  if (timerEl) timerEl.textContent = '00:00:00';
}

async function loadWorkerHistory() {
  const user = AppState.currentUser;
  if (!user) return;
  try {
    const res = await fetch('/api/tasks?workerName=' + encodeURIComponent(user.fullName || user.username));
    const data = await res.json();
    AppState.tasks = data.tasks || [];
    AppState.activeTasks = AppState.tasks.filter(t => t.status === 'in_progress');
    const todayCount = document.getElementById('todayHistoryCount');
    if (todayCount) todayCount.textContent = AppState.tasks.length + ' pekerjaan';
    renderWorkerHistoryList(AppState.tasks);
  } catch (err) { console.warn('Gagal muat riwayat:', err); }
}

function renderWorkerHistoryList(tasks) {
  const listEl = document.getElementById('workerHistoryList');
  if (!listEl) return;
  const done = tasks.filter(t => t.status === 'completed');
  if (!done.length) {
    listEl.innerHTML = '<p style="text-align:center;color:var(--text-dim);padding:1rem;">Belum ada riwayat pekerjaan selesai hari ini.</p>';
    return;
  }
  listEl.innerHTML = done.map(t => {
    const durStr = t.durationMinutes ? t.durationMinutes + ' menit' : '-';
    let thumbsHtml = '';
    if (t.startPhoto) thumbsHtml += buildThumbHtml(t.startPhoto, 'MULAI', false);
    if (t.startVideo) thumbsHtml += buildThumbHtml(t.startVideo, 'VID MULAI', true);
    if (t.progressPhotos && t.progressPhotos.length) {
      t.progressPhotos.forEach((p, idx) => {
        if (p.photoUrl) thumbsHtml += buildThumbHtml(p.photoUrl, 'PROG ' + (idx+1), false);
        if (p.videoUrl) thumbsHtml += buildThumbHtml(p.videoUrl, 'VID ' + (idx+1), true);
      });
    }
    if (t.finishPhoto) thumbsHtml += buildThumbHtml(t.finishPhoto, 'SELESAI', false, 'rgba(16,185,129,0.9)');
    if (t.finishVideo) thumbsHtml += buildThumbHtml(t.finishVideo, 'VID AKHIR', true, 'rgba(16,185,129,0.9)');
    return `<div class="task-card-mini">
      <div class="task-card-top">
        <div class="task-card-title">${escapeHtml(t.taskName)}</div>
        <span class="badge-status ${t.status}">SELESAI</span>
      </div>
      <div class="task-card-time">Mulai ${t.startTime||'-'} s/d ${t.endTime||'-'} (${durStr})</div>
      ${t.notes ? '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.25rem;">' + escapeHtml(t.notes) + '</div>' : ''}
      ${thumbsHtml ? '<div class="task-thumbs-row">' + thumbsHtml + '</div>' : ''}
    </div>`;
  }).join('');
}

function buildThumbHtml(url, label, isVideo, labelBg) {
  if (!url) return '';
  labelBg = labelBg || 'rgba(15,23,42,0.85)';
  if (isVideo) {
    return '<div class="task-thumb-item" onclick="viewMediaDetail(\'' + url + '\',true)">'
      + '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#fff;font-size:2rem;">&#x1F3AC;</div>'
      + '<span class="thumb-label" style="background:' + labelBg + ';">' + label + '</span></div>';
  }
  return '<div class="task-thumb-item" onclick="viewMediaDetail(\'' + url + '\',false)">'
    + '<img src="' + url + '" alt="' + label + '" loading="lazy"/>'
    + '<span class="thumb-label" style="background:' + labelBg + ';">' + label + '</span></div>';
}

async function openCameraModal(opts) {
  const { stage, stageKey, taskName, note } = opts;
  AppState.cameraPendingStage = stageKey;
  AppState.cameraPendingTaskName = taskName;
  AppState.cameraPendingNote = note;
  document.getElementById('cameraStageBadge').textContent = stage;
  document.getElementById('cameraNoteInput').value = note || '';
  capturedPhotos = [];
  capturedVideoResult = null;
  AppState.cameraMode = 'photo';
  setCameraMode('photo');
  updatePhotoCounter();
  updateCameraShutterState();
  document.getElementById('cameraOverlayModal').style.display = 'flex';
  try { await window.cameraManager.startCamera(document.getElementById('cameraLiveVideo')); }
  catch (err) { alert('Kamera tidak dapat diakses: ' + err.message); closeCameraModal(); }
}

function closeCameraModal() {
  if (window.cameraManager.isRecording) window.cameraManager.stopVideoRecording();
  window.cameraManager.stopCamera();
  const badge = document.getElementById('cameraRecordingBadge');
  if (badge) badge.style.display = 'none';
  document.getElementById('cameraOverlayModal').style.display = 'none';
  document.getElementById('previewModal').style.display = 'none';
  stopPreviewVideo();
  const recBtn = document.getElementById('btnRecordVideo');
  if (recBtn) { recBtn.classList.remove('recording'); recBtn.innerHTML = '<span class="video-record-icon"></span>'; }
}

function updatePhotoCounter() {
  const hint = document.getElementById('cameraModeHint');
  if (!hint) return;
  if (AppState.cameraMode === 'photo') {
    if (capturedPhotos.length > 0) {
      hint.innerHTML = 'Mode Foto: Jepret lebih banyak atau <strong style="color:#22c55e;">' + capturedPhotos.length + ' foto siap</strong>. <span onclick="submitAllCapturedMedia()" style="color:#38bdf8;text-decoration:underline;cursor:pointer;">Kirim Sekarang</span>';
    } else {
      hint.textContent = 'Mode Foto: Tekan tombol bulat putih untuk jepret foto. Bisa jepret beberapa kali!';
    }
  }
}

function snapWatermarkedPhoto() {
  const note = document.getElementById('cameraNoteInput').value.trim();
  if (!note) { alert('Isi keterangan dahulu!'); document.getElementById('cameraNoteInput').focus(); return; }
  try {
    const user = AppState.currentUser;
    const photoBase64 = window.cameraManager.capturePhotoWithWatermark({
      workerName: user ? (user.fullName || user.username) : 'Pekerja',
      stage: AppState.cameraPendingStage,
      taskName: AppState.cameraPendingTaskName,
      note
    });
    capturedPhotos.push(photoBase64);
    showPhotoPreview(photoBase64);
    updatePhotoCounter();
  } catch (err) { alert('Gagal ambil foto: ' + err.message); }
}

function showPhotoPreview(photoBase64) {
  const previewImg = document.getElementById('previewPhotoImg');
  const previewVideo = document.getElementById('previewVideoPlayer');
  previewImg.src = photoBase64;
  previewImg.style.display = 'block';
  if (previewVideo) previewVideo.style.display = 'none';
  const modal = document.getElementById('previewModal');
  const confirmBtn = document.getElementById('btnConfirmPhoto');
  const retakeBtn = document.getElementById('btnRetakePhoto');
  if (confirmBtn) {
    confirmBtn.style.display = 'block';
    confirmBtn.textContent = capturedPhotos.length > 1 ? 'Kirim ' + capturedPhotos.length + ' Foto Sekarang' : 'Gunakan Foto Ini';
    confirmBtn.onclick = submitPendingMedia;
  }
  if (retakeBtn) {
    retakeBtn.textContent = capturedPhotos.length > 1 ? 'Tambah Foto Lagi' : 'Ambil Ulang';
    retakeBtn.onclick = () => { modal.style.display = 'none'; stopPreviewVideo(); };
  }
  modal.style.display = 'flex';
}

function showVideoPreview(videoResult) {
  const previewImg = document.getElementById('previewPhotoImg');
  const previewVideo = document.getElementById('previewVideoPlayer');
  if (previewImg) previewImg.style.display = 'none';
  if (previewVideo) {
    previewVideo.style.display = 'block';
    previewVideo.src = videoResult.dataUrl;
    previewVideo.load();
    previewVideo.controls = true;
  }
  const modal = document.getElementById('previewModal');
  const confirmBtn = document.getElementById('btnConfirmPhoto');
  const retakeBtn = document.getElementById('btnRetakePhoto');
  if (confirmBtn) { confirmBtn.style.display = 'block'; confirmBtn.textContent = 'Kirim Video (' + videoResult.duration + 's)'; confirmBtn.onclick = submitPendingMedia; }
  if (retakeBtn) { retakeBtn.textContent = 'Rekam Ulang'; retakeBtn.onclick = () => { modal.style.display = 'none'; stopPreviewVideo(); capturedVideoResult = null; }; }
  modal.style.display = 'flex';
}

function stopPreviewVideo() {
  const pv = document.getElementById('previewVideoPlayer');
  if (pv) { pv.pause(); pv.src = ''; pv.style.display = 'none'; }
  const pi = document.getElementById('previewPhotoImg');
  if (pi) pi.style.display = 'block';
}

function toggleVideoRecording() {
  const btn = document.getElementById('btnRecordVideo');
  const badge = document.getElementById('cameraRecordingBadge');
  const timerText = document.getElementById('cameraRecordingTimerText');
  const note = document.getElementById('cameraNoteInput').value.trim();
  if (!window.cameraManager.isRecording) {
    if (!note) { alert('Isi keterangan dahulu!'); document.getElementById('cameraNoteInput').focus(); return; }
    startVideoRecordingWithAudio();
  } else {
    btn.classList.remove('recording');
    btn.innerHTML = '<span class="video-record-icon"></span>';
    if (badge) badge.style.display = 'none';
    const user = AppState.currentUser;
    const meta = { workerName: user ? (user.fullName || user.username) : 'Pekerja', stage: AppState.cameraPendingStage, taskName: AppState.cameraPendingTaskName, note };
    window.cameraManager.stopVideoRecording(meta).then(res => {
      if (res && res.dataUrl) { capturedVideoResult = res; showVideoPreview(res); }
      else alert('Video gagal direkam. Coba lagi.');
    });
  }
}

async function startVideoRecordingWithAudio() {
  const btn = document.getElementById('btnRecordVideo');
  const badge = document.getElementById('cameraRecordingBadge');
  const timerText = document.getElementById('cameraRecordingTimerText');
  try {
    const videoEl = document.getElementById('cameraLiveVideo');
    window.cameraManager.stopCamera();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } }); }
    catch (e) { console.warn('Tanpa audio:', e); stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
    window.cameraManager.stream = stream;
    window.cameraManager.videoElement = videoEl;
    videoEl.srcObject = stream;
    await videoEl.play();
    btn.classList.add('recording');
    btn.innerHTML = '<span class="video-record-icon" style="border-radius:4px;background:#dc2626;"></span>';
    if (badge) badge.style.display = 'flex';
    window.cameraManager.startVideoRecording(
      secs => {
        const m = String(Math.floor(secs/60)).padStart(2,'0');
        const s = String(secs%60).padStart(2,'0');
        if (timerText) timerText.textContent = 'REC ' + m + ':' + s + ' / 00:30';
      },
      () => { if (window.cameraManager.isRecording) toggleVideoRecording(); }
    );
  } catch (err) {
    alert('Gagal rekam video: ' + err.message);
    btn.classList.remove('recording');
    btn.innerHTML = '<span class="video-record-icon"></span>';
    if (badge) badge.style.display = 'none';
  }
}

async function submitAllCapturedMedia() {
  document.getElementById('previewModal').style.display = 'none';
  await submitPendingMedia();
}

async function submitPendingMedia() {
  if (AppState.isSubmitting) return;
  const hasPhotos = capturedPhotos.length > 0;
  const hasVideo = capturedVideoResult && capturedVideoResult.dataUrl;
  if (!hasPhotos && !hasVideo) { alert('Belum ada foto atau video!'); return; }
  AppState.isSubmitting = true;
  const user = AppState.currentUser;
  const stage = AppState.cameraPendingStage;
  const note = document.getElementById('cameraNoteInput').value.trim();
  const confirmBtn = document.getElementById('btnConfirmPhoto');
  if (confirmBtn) confirmBtn.textContent = 'Mengunggah...';
  try {
    if (stage === 'mulai') {
      const res = await fetch('/api/tasks/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        workerId: user.id, workerName: user.fullName || user.username, taskName: AppState.cameraPendingTaskName, notes: note,
        photoBase64: hasPhotos ? capturedPhotos[0] : null, videoBase64: hasVideo ? capturedVideoResult.dataUrl : null
      })});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal!');
      AppState.activeTask = data.task;
      if (user) localStorage.setItem('active_task_id_' + user.id, data.task.id);
      for (let i = 1; i < capturedPhotos.length; i++) {
        await fetch('/api/tasks/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: data.task.id, note, photoBase64: capturedPhotos[i] }) });
      }
      renderActiveTaskHero();
      alert('Pekerjaan dimulai! ' + (capturedPhotos.length > 1 ? capturedPhotos.length + ' foto' : (hasVideo ? 'Video' : 'Foto')) + ' berhasil disimpan.');
    } else if (stage === 'progress') {
      if (!AppState.activeTask) throw new Error('Tidak ada pekerjaan aktif!');
      for (let i = 0; i < capturedPhotos.length; i++) {
        await fetch('/api/tasks/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: AppState.activeTask.id, note, photoBase64: capturedPhotos[i] }) });
      }
      if (hasVideo) {
        await fetch('/api/tasks/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: AppState.activeTask.id, note, videoBase64: capturedVideoResult.dataUrl }) });
      }
      alert((capturedPhotos.length > 0 ? capturedPhotos.length + ' foto' : '') + (hasPhotos && hasVideo ? ' & ' : '') + (hasVideo ? 'video' : '') + ' progress berhasil!');
    } else if (stage === 'selesai') {
      if (!AppState.activeTask) throw new Error('Tidak ada pekerjaan aktif!');
      const res = await fetch('/api/tasks/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        taskId: AppState.activeTask.id, finalNotes: note,
        photoBase64: hasPhotos ? capturedPhotos[0] : null, videoBase64: hasVideo ? capturedVideoResult.dataUrl : null
      })});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal!');
      for (let i = 1; i < capturedPhotos.length; i++) {
        await fetch('/api/tasks/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: AppState.activeTask.id, note, photoBase64: capturedPhotos[i] }) });
      }
      AppState.activeTasks = AppState.activeTasks.filter(t => t.id !== AppState.activeTask.id);
      localStorage.removeItem('active_task_id_' + (user ? user.id : ''));
      AppState.activeTask = AppState.activeTasks.length > 0 ? AppState.activeTasks[0] : null;
      if (AppState.activeTask && user) localStorage.setItem('active_task_id_' + user.id, AppState.activeTask.id);
      renderActiveTaskHero();
      renderInProgressSection();
      alert('Alhamdulillah! Pekerjaan selesai dan tercatat rapi.');
    }
    closeCameraModal();
    await loadWorkerHistory();
    renderInProgressSection();
    capturedPhotos = [];
    capturedVideoResult = null;
  } catch (err) { alert('Kesalahan: ' + err.message); }
  finally { AppState.isSubmitting = false; if (confirmBtn) confirmBtn.textContent = 'Gunakan Foto Ini'; }
}

async function deleteProgressPhoto(taskId, index, workerRefresh) {
  workerRefresh = workerRefresh !== false;
  if (!confirm('Hapus foto/video progress ke-' + (index + 1) + '? Biasanya untuk hapus upload duplikat.')) return;
  try {
    const res = await fetch('/api/tasks/' + taskId + '/progress/' + index, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal!');
    alert('Foto progress dihapus.');
    if (workerRefresh) await loadWorkerHistory();
  } catch (err) { alert('Gagal: ' + err.message); }
}

async function loadAdminDashboard() { await loadWorkersList(); await loadTasksList(); }

async function loadWorkersList() {
  try {
    const res = await fetch('/api/admin/workers');
    const data = await res.json();
    AppState.workers = data.users || [];
    const select = document.getElementById('filterWorkerSelect');
    if (select) {
      select.innerHTML = '<option value="all">-- Semua Pekerja (Abang-Abang) --</option>'
        + AppState.workers.filter(u => u.role === 'worker').map(u => '<option value="' + escapeHtml(u.fullName||u.username) + '">' + escapeHtml(u.fullName||u.username) + '</option>').join('');
    }
  } catch (err) { console.warn('Gagal muat pekerja:', err); }
}

async function loadTasksList() {
  const wf = document.getElementById('filterWorkerSelect').value;
  const sf = document.getElementById('filterStatusSelect').value;
  const df = document.getElementById('filterDateInput').value;
  let url = '/api/tasks?workerName=' + encodeURIComponent(wf) + '&status=' + encodeURIComponent(sf);
  if (df) { const p = df.split('-'); if (p.length === 3) url += '&date=' + encodeURIComponent(p[2]+'/'+p[1]+'/'+p[0]); }
  try {
    const res = await fetch(url);
    const data = await res.json();
    AppState.tasks = data.tasks || [];
    renderAdminMetrics(AppState.tasks);
    renderAdminTable(AppState.tasks);
  } catch (err) { console.error('Gagal muat tugas admin:', err); }
}

function renderAdminMetrics(tasks) {
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'completed').length;
  const active = tasks.filter(t => t.status === 'in_progress').length;
  const mins = tasks.reduce((s, t) => s + (t.durationMinutes || 0), 0);
  document.getElementById('metricTotalTasks').textContent = total;
  document.getElementById('metricActiveTasks').textContent = active;
  document.getElementById('metricCompletedTasks').textContent = done;
  document.getElementById('metricTotalHours').textContent = (mins / 60).toFixed(1) + ' Jam';
}

function renderAdminTable(tasks) {
  const tbody = document.getElementById('adminTasksTableBody');
  if (!tbody) return;
  if (!tasks.length) { tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:2rem;color:var(--text-dim);">Tidak ada data.</td></tr>'; return; }
  tbody.innerHTML = tasks.map((t, idx) => {
    const isDone = t.status === 'completed';
    const dur = t.durationMinutes ? Math.floor(t.durationMinutes/60) + 'j ' + t.durationMinutes%60 + 'm' : '-';
    const sImg = t.startPhoto ? '<div class="photo-cell-preview" onclick="viewMediaDetail(\'' + t.startPhoto + '\',false)"><img src="' + t.startPhoto + '" alt="Mulai"/></div>' : '-';
    const sVid = t.startVideo ? '<div class="photo-cell-preview" onclick="viewMediaDetail(\'' + t.startVideo + '\',true)" style="background:#0f172a;display:flex;align-items:center;justify-content:center;font-size:2rem;">&#x1F3AC;</div>' : '';
    let progHtml = '-';
    if (t.progressPhotos && t.progressPhotos.length) {
      const items = t.progressPhotos.map((p, pIdx) => {
        let h = '';
        if (p.photoUrl) h += '<div class="photo-cell-preview" style="position:relative;margin-bottom:4px;" onclick="viewMediaDetail(\'' + p.photoUrl + '\',false)"><img src="' + p.photoUrl + '" alt="P"/><button onclick="event.stopPropagation();deleteProgressPhotoAdmin(\'' + t.id + '\',' + pIdx + ')" style="position:absolute;top:2px;right:2px;background:rgba(220,38,38,0.85);border:none;color:#fff;font-size:0.65rem;padding:2px 5px;border-radius:4px;cursor:pointer;">Hapus</button></div>';
        if (p.videoUrl) h += '<div class="photo-cell-preview" onclick="viewMediaDetail(\'' + p.videoUrl + '\',true)" style="background:#0f172a;display:flex;align-items:center;justify-content:center;font-size:1.5rem;">&#x1F3AC;</div>';
        return h;
      }).join('');
      progHtml = items || '-';
    }
    const fImg = t.finishPhoto ? '<div class="photo-cell-preview" onclick="viewMediaDetail(\'' + t.finishPhoto + '\',false)"><img src="' + t.finishPhoto + '" alt="Selesai"/></div>' : '-';
    const vidHtml = t.finishVideo ? '<div class="photo-cell-preview" onclick="viewMediaDetail(\'' + t.finishVideo + '\',true)" style="background:#0f172a;display:flex;align-items:center;justify-content:center;font-size:2rem;">&#x1F3AC;</div>'
      : (t.videoUrl && t.videoUrl !== t.startVideo ? '<div class="photo-cell-preview" onclick="viewMediaDetail(\'' + t.videoUrl + '\',true)" style="background:#0f172a;display:flex;align-items:center;justify-content:center;font-size:2rem;">&#x1F3AC;</div>' : '-');
    return '<tr>'
      + '<td style="text-align:center;font-weight:700;">' + (idx+1) + '</td>'
      + '<td><strong>' + escapeHtml(t.workerName) + '</strong></td>'
      + '<td>' + t.date + '</td>'
      + '<td>' + t.startTime + ' - ' + (t.endTime || '<em style="color:#fbbf24">Berjalan</em>') + '</td>'
      + '<td style="font-weight:600;">' + dur + '</td>'
      + '<td><div style="font-weight:600;color:#0f172a;">' + escapeHtml(t.taskName) + '</div><div style="font-size:0.75rem;color:var(--text-muted);">' + escapeHtml(t.notes||'-') + '</div></td>'
      + '<td style="text-align:center;">' + sImg + sVid + '</td>'
      + '<td style="text-align:center;">' + progHtml + '</td>'
      + '<td style="text-align:center;">' + fImg + '</td>'
      + '<td style="text-align:center;">' + vidHtml + '</td>'
      + '<td style="text-align:center;"><span class="badge-status ' + t.status + '">' + (isDone?'SELESAI':'PROSES') + '</span>'
      + '<button onclick="syncSingleTaskGDrive(\'' + t.id + '\')" style="margin-top:4px;padding:2px 6px;font-size:0.7rem;background:#1e293b;border:1px solid #475569;color:#38bdf8;border-radius:4px;cursor:pointer;display:block;width:100%;">Sync GDrive</button>'
      + '<button onclick="handleAdminDeleteTask(\'' + t.id + '\')" style="margin-top:2px;padding:2px 6px;font-size:0.7rem;background:#1e293b;border:1px solid #f87171;color:#f87171;border-radius:4px;cursor:pointer;display:block;width:100%;">Hapus</button>'
      + '</td></tr>';
  }).join('');
}

async function deleteProgressPhotoAdmin(taskId, index) {
  await deleteProgressPhoto(taskId, index, false);
  await loadTasksList();
}

async function handleAdminDeleteTask(taskId) {
  if (!confirm('Hapus tugas ini?')) return;
  try {
    const res = await fetch('/api/tasks/' + taskId, { method: 'DELETE' });
    if (!res.ok) throw new Error('Gagal!');
    alert('Tugas berhasil dihapus.');
    await loadTasksList();
  } catch (err) { alert('Gagal: ' + err.message); }
}

function viewMediaDetail(url, isVideo) {
  if (!url) return;
  const modal = document.getElementById('previewModal');
  const previewImg = document.getElementById('previewPhotoImg');
  const previewVideo = document.getElementById('previewVideoPlayer');
  if (isVideo) {
    if (previewImg) previewImg.style.display = 'none';
    if (previewVideo) { previewVideo.style.display = 'block'; previewVideo.src = url; previewVideo.load(); previewVideo.controls = true; }
  } else {
    if (previewVideo) { previewVideo.pause(); previewVideo.style.display = 'none'; }
    if (previewImg) { previewImg.src = url; previewImg.style.display = 'block'; }
  }
  modal.style.display = 'flex';
  const confirmBtn = document.getElementById('btnConfirmPhoto');
  const retakeBtn = document.getElementById('btnRetakePhoto');
  if (confirmBtn) confirmBtn.style.display = 'none';
  if (retakeBtn) {
    retakeBtn.textContent = 'Tutup';
    retakeBtn.onclick = () => {
      modal.style.display = 'none';
      stopPreviewVideo();
      if (confirmBtn) confirmBtn.style.display = 'block';
      retakeBtn.textContent = 'Ambil Ulang';
      retakeBtn.onclick = null;
    };
  }
}

function viewPhotoDetail(url) { viewMediaDetail(url, false); }

async function handleExportExcel() {
  const btn = document.getElementById('btnExportExcel');
  const orig = btn.innerHTML;
  btn.innerHTML = 'Menyiapkan...'; btn.disabled = true;
  try {
    const w = document.getElementById('filterWorkerSelect').value;
    const d = document.getElementById('filterDateInput').value;
    let url = '/api/tasks/export-excel?workerName=' + encodeURIComponent(w);
    if (d) { const p = d.split('-'); url += '&date=' + encodeURIComponent(p[2]+'/'+p[1]+'/'+p[0]); }
    const response = await fetch(url);
    if (response.ok) {
      const blob = await response.blob();
      const a = document.createElement('a');
      a.href = window.URL.createObjectURL(blob);
      a.download = 'Laporan_' + w + '_' + new Date().toISOString().split('T')[0] + '.xlsx';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } else { await window.exportTasksToExcelClient(AppState.tasks, AppState.settings.companyName); }
    alert('File Excel berhasil diunduh!');
  } catch (err) { alert('Gagal ekspor: ' + err.message); }
  finally { btn.innerHTML = orig; btn.disabled = false; }
}

async function syncSingleTaskGDrive(taskId) {
  try {
    const res = await fetch('/api/tasks/sync-gdrive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal!');
    alert(data.message);
  } catch (err) { alert('Sync gagal: ' + err.message); }
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    AppState.settings = data;
    const u = document.getElementById('settingGasUrl');
    if (u) u.value = data.gasWebhookUrl || '';
    const c = document.getElementById('settingCompanyName');
    if (c) c.value = data.companyName || '';
  } catch (e) { console.warn('Gagal muat settings:', e); }
}

function openSettingsModal() { loadSettings(); document.getElementById('settingsModal').style.display = 'flex'; }

async function saveSettings() {
  const gasWebhookUrl = document.getElementById('settingGasUrl').value.trim();
  const companyName = document.getElementById('settingCompanyName').value.trim();
  try {
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gasWebhookUrl, companyName }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal!');
    AppState.settings = data.settings;
    alert('Pengaturan disimpan!');
    document.getElementById('settingsModal').style.display = 'none';
  } catch (err) { alert(err.message); }
}

function openSuperAdminModal() {
  const m = document.getElementById('superAdminModal');
  if (m) m.style.display = 'flex';
  const pw = document.getElementById('superAdminNewAdminPw');
  if (pw) pw.value = '';
  loadSuperAdminUsers();
}

function closeSuperAdminModal() { const m = document.getElementById('superAdminModal'); if (m) m.style.display = 'none'; }

async function loadSuperAdminUsers() {
  const tbody = document.getElementById('superAdminUsersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1rem;color:#94a3b8;">Memuat...</td></tr>';
  try {
    const res = await fetch('/api/superadmin/users');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal!');
    if (!data.users || !data.users.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1rem;">Tidak ada pengguna.</td></tr>'; return; }
    tbody.innerHTML = data.users.map(u => {
      let rb = '<span style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:9999px;font-weight:700;font-size:0.72rem;">PEKERJA</span>';
      if (u.role === 'superadmin') rb = '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:9999px;font-weight:700;font-size:0.72rem;">SUPERADMIN</span>';
      else if (u.role === 'admin') rb = '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:9999px;font-weight:700;font-size:0.72rem;">ADMIN</span>';
      const actions = u.role === 'superadmin' ? '<span style="font-size:0.75rem;color:#94a3b8;">(Akun Utama)</span>'
        : '<button onclick="openResetPwModal(\'' + u.id + '\',\'' + escapeHtml(u.fullName||u.username).replace(/'/g,'') + '\')" style="background:#f1f5f9;border:1px solid #cbd5e1;padding:3px 8px;border-radius:4px;font-size:0.75rem;cursor:pointer;margin-right:4px;">Ganti Sandi</button><button onclick="handleSuperAdminDeleteUser(\'' + u.id + '\',\'' + escapeHtml(u.fullName||u.username).replace(/'/g,'') + '\',\'' + u.role + '\')" style="background:#fee2e2;border:1px solid #fca5a5;color:#b91c1c;padding:3px 8px;border-radius:4px;font-size:0.75rem;cursor:pointer;">Hapus</button>';
      return '<tr><td style="font-weight:600;">' + escapeHtml(u.fullName||'-') + '</td><td><code>' + escapeHtml(u.username) + '</code></td><td>' + rb + '</td><td>' + escapeHtml(u.phone||'-') + '</td><td style="text-align:center;">' + actions + '</td></tr>';
    }).join('');
  } catch (err) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1rem;color:#ef4444;">Gagal: ' + err.message + '</td></tr>'; }
}

async function handleSuperAdminDeleteUser(id, name, role) {
  if (!confirm('Hapus "' + name + '"?')) return;
  try {
    const res = await fetch('/api/superadmin/users/' + id, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal!');
    alert(data.message);
    loadSuperAdminUsers(); loadWorkersList();
  } catch (err) { alert(err.message); }
}

async function handleSuperAdminChangeAdminPassword(e) {
  e.preventDefault();
  const pw = document.getElementById('superAdminNewAdminPw').value.trim();
  if (!pw || pw.length < 5) { alert('Sandi minimal 5 karakter!'); return; }
  try {
    const res = await fetch('/api/superadmin/change-admin-password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newPassword: pw }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal!');
    alert(data.message);
    document.getElementById('superAdminNewAdminPw').value = '';
    loadSuperAdminUsers();
  } catch (err) { alert(err.message); }
}

async function handleSuperAdminResetTotal() {
  if (!confirm('Reset total semua data? TIDAK BISA DIBATALKAN!')) return;
  const conf = prompt('Ketik "RESET" untuk konfirmasi:');
  if (conf !== 'RESET') { alert('Batal.'); return; }
  try {
    const res = await fetch('/api/superadmin/reset-total', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal!');
    alert(data.message);
    closeSuperAdminModal();
    loadAdminDashboard();
  } catch (err) { alert(err.message); }
}

async function handleSuperAdminResetSheet() {
  if (!confirm('Kosongkan semua data di Google Sheets?')) return;
  try {
    const res = await fetch('/api/superadmin/reset-sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal!');
    alert(data.message);
  } catch (err) { alert(err.message); }
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

window.viewPhotoDetail = viewPhotoDetail;
window.viewMediaDetail = viewMediaDetail;
window.syncSingleTaskGDrive = syncSingleTaskGDrive;
window.openResetPwModal = openResetPwModal;
window.handleDeleteWorker = handleDeleteWorker;
window.openSuperAdminModal = openSuperAdminModal;
window.closeSuperAdminModal = closeSuperAdminModal;
window.handleSuperAdminDeleteUser = handleSuperAdminDeleteUser;
window.switchToTask = switchToTask;
window.submitAllCapturedMedia = submitAllCapturedMedia;
window.deleteProgressPhoto = deleteProgressPhoto;
window.deleteProgressPhotoAdmin = deleteProgressPhotoAdmin;
window.handleAdminDeleteTask = handleAdminDeleteTask;
