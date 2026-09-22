/**
 * Sistem Laporan Kerja Lapangan - Logika Utama
 * Fitur:
 * - Kamera Belakang & Kamera Depan (Selfie) dengan Watermark Real-time WIB & GPS
 * - Multi-Foto per Tahap (bisa ambil beberapa foto sebelum kirim)
 * - Multi-Tugas Berjalan (Pekerjaan Mendadak & Tap Kartu untuk Lanjut Tugas)
 * - Pemutusan Sesi Real-time jika akun dihapus oleh Administrator
 * - Isolasi Penuh Tampilan Pekerja vs Dashboard Admin
 */

const AppState = {
  currentUser: null,
  activeTask: null,
  activeTasks: [],
  tasks: [],
  workers: [],
  settings: { companyName: 'Laporan Kerja Lapangan', gasWebhookUrl: '', autoSyncGDrive: false },
  timerInterval: null,
  sessionCheckInterval: null,
  cameraPendingStage: null,      // 'mulai' | 'progress' | 'selesai'
  cameraPendingStageLabel: '',  // 'MULAI PEKERJAAN' | 'PROGRESS / SEDANG DIKERJAKAN' | 'PEKERJAAN SELESAI'
  cameraPendingTaskName: '',
  cameraPendingNote: '',
  cameraMode: 'photo',          // 'photo' | 'video'
  isSubmitting: false
};

let capturedPhotos = []; // Array of Base64 JPEG strings
let capturedVideoResult = null; // Video Base64 String
let loginSelfieBase64 = null; // Foto selfie saat login (opsional)
let loginSelfieStream = null; // Stream kamera selfie login

document.addEventListener('DOMContentLoaded', () => {
  initLiveClock();
  loadSavedUser();
  setupEventListeners();
  setupLoginSelfieControls();
  loadSettings();
});

// ============================================================================
// 1. JAM REAL-TIME & SESI PENGGUNA
// ============================================================================
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

async function loadSavedUser() {
  const saved = localStorage.getItem('laporan_user');
  if (saved) {
    try {
      const user = JSON.parse(saved);
      if (!user || !user.id) { showAuthView(); return; }
      
      // Verifikasi ke server apakah akun masih terdaftar & aktif
      const res = await fetch('/api/auth/me?userId=' + encodeURIComponent(user.id));
      const data = await res.json();
      if (res.ok && data.valid && data.user) {
        AppState.currentUser = data.user;
        localStorage.setItem('laporan_user', JSON.stringify(data.user));
        applyUserSession();
      } else {
        console.warn('Akun tidak lagi terdaftar atau telah dinonaktifkan:', data.error);
        localStorage.removeItem('laporan_user');
        showAuthView();
      }
    } catch (e) {
      showAuthView();
    }
  } else {
    showAuthView();
  }
}

function startSessionHeartbeat() {
  if (AppState.sessionCheckInterval) clearInterval(AppState.sessionCheckInterval);
  AppState.sessionCheckInterval = setInterval(async () => {
    const user = AppState.currentUser;
    if (!user || !user.id) return;
    try {
      const res = await fetch('/api/auth/me?userId=' + encodeURIComponent(user.id));
      if (!res.ok) {
        clearInterval(AppState.sessionCheckInterval);
        alert('Akun Anda telah dinonaktifkan atau dihapus oleh Administrator. Sesi berakhir.');
        showAuthView();
      }
    } catch (_) {}
  }, 10000);
}

function applyUserSession() {
  const user = AppState.currentUser;
  if (!user) { showAuthView(); return; }

  const authSec = document.getElementById('authSection');
  const headerBadge = document.getElementById('headerUserBadge');
  const headerName = document.getElementById('headerUserName');
  const headerRole = document.getElementById('headerUserRole');
  const workerSec = document.getElementById('workerViewSection');
  const adminSec = document.getElementById('adminViewSection');
  const btnSA = document.getElementById('btnOpenSuperAdmin');

  authSec.style.display = 'none';
  headerBadge.style.display = 'flex';
  headerName.textContent = user.fullName || user.username;

  const isSuperAdmin = user.role === 'superadmin';
  const isAdmin = user.role === 'admin';

  headerRole.className = 'user-role-badge';
  if (isSuperAdmin) {
    headerRole.textContent = '👑 Super Admin';
    headerRole.classList.add('superadmin');
  } else if (isAdmin) {
    headerRole.textContent = 'PIC / Admin';
  } else {
    headerRole.textContent = 'Pekerja';
  }

  if (btnSA) btnSA.style.display = isSuperAdmin ? 'inline-flex' : 'none';

  if (isSuperAdmin || isAdmin) {
    // TAMPILKAN KHUSUS DASHBOARD ADMIN
    workerSec.style.display = 'none';
    adminSec.style.display = 'flex';
    adminSec.style.flexDirection = 'column';
    adminSec.style.width = '100%';
    loadAdminDashboard();
  } else {
    // TAMPILKAN KHUSUS TAMPILAN PEKERJA HP
    adminSec.style.display = 'none';
    workerSec.style.display = 'block';
    loadWorkerDashboard();
  }

  startSessionHeartbeat();
}

function showAuthView() {
  AppState.currentUser = null;
  localStorage.removeItem('laporan_user');
  if (AppState.timerInterval) clearInterval(AppState.timerInterval);
  if (AppState.sessionCheckInterval) clearInterval(AppState.sessionCheckInterval);

  document.getElementById('authSection').style.display = 'flex';
  document.getElementById('headerUserBadge').style.display = 'none';
  document.getElementById('workerViewSection').style.display = 'none';
  document.getElementById('adminViewSection').style.display = 'none';
  // Reset selfie saat logout
  stopLoginSelfieCamera();
  loginSelfieBase64 = null;
  resetLoginSelfieWidget();
}

function setupPasswordToggle(btnId, inputId) {
  const btn = document.getElementById(btnId);
  const inp = document.getElementById(inputId);
  if (!btn || !inp) return;
  btn.addEventListener('click', () => {
    const isPw = inp.type === 'password';
    inp.type = isPw ? 'text' : 'password';
    btn.textContent = isPw ? '🙈' : '👁️';
  });
}

// ============================================================================
// 2. EVENT LISTENERS SETUP
// ============================================================================
function setupEventListeners() {
  setupPasswordToggle('btnToggleLoginPw', 'loginPassword');
  setupPasswordToggle('btnToggleNewWorkerPw', 'newWorkerPassword');
  setupPasswordToggle('btnToggleResetPw', 'resetPwInput');
  setupPasswordToggle('btnToggleSuperAdminAdminPw', 'superAdminNewAdminPw');

  // Login Form
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('btnSubmitLogin');
    try {
      btn.disabled = true;
      btn.textContent = 'Memverifikasi...';
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
    } finally {
      btn.disabled = false;
      btn.textContent = 'Masuk ke Sistem';
    }
  });

  // Logout
  document.getElementById('btnLogout').addEventListener('click', () => {
    if (confirm('Keluar dari sistem?')) {
      showAuthView();
    }
  });

  // Worker - Start New Task
  document.getElementById('btnStartNewTask').addEventListener('click', () => {
    const taskName = document.getElementById('newTaskNameInput').value.trim();
    if (!taskName) {
      alert('Ketik aktivitas / pekerjaan yang dilakukan terlebih dahulu!');
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

  // Worker - Progress & Selesai
  document.getElementById('btnProgressAction').addEventListener('click', () => {
    if (!AppState.activeTask) return;
    openCameraModal({
      stage: 'PROGRESS / SEDANG DIKERJAKAN',
      stageKey: 'progress',
      taskName: AppState.activeTask.taskName,
      note: ''
    });
  });

  document.getElementById('btnFinishAction').addEventListener('click', () => {
    if (!AppState.activeTask) return;
    openCameraModal({
      stage: 'PEKERJAAN SELESAI',
      stageKey: 'selesai',
      taskName: AppState.activeTask.taskName,
      note: ''
    });
  });

  // Worker - Tombol Urgent / Kerjaan Mendadak
  const btnUrgent = document.getElementById('btnOpenNewUrgentTask');
  if (btnUrgent) btnUrgent.addEventListener('click', openUrgentTaskForm);
  const btnHeaderUrgent = document.getElementById('btnHeaderUrgentTask');
  if (btnHeaderUrgent) btnHeaderUrgent.addEventListener('click', openUrgentTaskForm);
  const btnCancelForm = document.getElementById('btnCancelNewTaskForm');
  if (btnCancelForm) btnCancelForm.addEventListener('click', renderActiveTaskHero);
  const btnDelTask = document.getElementById('btnDeleteActiveTask');
  if (btnDelTask) btnDelTask.addEventListener('click', handleDeleteActiveTask);

  // Worker - Pencarian Riwayat Kerja per Tanggal
  const btnSearchHist = document.getElementById('btnSearchWorkerHistory');
  if (btnSearchHist) btnSearchHist.addEventListener('click', searchWorkerHistoryByDate);
  const btnTodayHist = document.getElementById('btnShowTodayHistory');
  if (btnTodayHist) btnTodayHist.addEventListener('click', showTodayWorkerHistory);
  const histDateInput = document.getElementById('workerHistoryDateInput');
  if (histDateInput) histDateInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') searchWorkerHistoryByDate(); });

  // Camera Controls
  const btnCloseCam = document.getElementById('btnCloseCamera');
  if (btnCloseCam) btnCloseCam.addEventListener('click', closeCameraModal);
  const btnFlipTop = document.getElementById('btnFlipCamera');
  if (btnFlipTop) btnFlipTop.addEventListener('click', handleFlipCamera);
  const btnFlipBottom = document.getElementById('btnFlipCameraBottom');
  if (btnFlipBottom) btnFlipBottom.addEventListener('click', handleFlipCamera);

  const btnSnap = document.getElementById('btnSnapPhoto');
  if (btnSnap) btnSnap.addEventListener('click', snapPhoto);
  const btnRec = document.getElementById('btnRecordVideo');
  if (btnRec) btnRec.addEventListener('click', handleVideoRecordingClick);
  const btnConfirm = document.getElementById('btnConfirmMultiPhotos');
  if (btnConfirm) btnConfirm.addEventListener('click', submitAllCapturedMedia);

  const btnTabP = document.getElementById('btnTabModePhoto');
  if (btnTabP) btnTabP.addEventListener('click', () => setCameraMode('photo'));
  const btnTabV = document.getElementById('btnTabModeVideo');
  if (btnTabV) btnTabV.addEventListener('click', () => setCameraMode('video'));

  const btnDiscardVid = document.getElementById('btnDiscardVideo');
  if (btnDiscardVid) btnDiscardVid.addEventListener('click', discardCapturedVideo);

  // Camera Note input listener: wajib isi catatan agar shutter aktif
  const noteInput = document.getElementById('cameraNoteInput');
  if (noteInput) {
    noteInput.addEventListener('input', updateCameraShutterState);
  }

  // Modals
  document.getElementById('btnClosePreviewModal').addEventListener('click', () => {
    document.getElementById('previewModal').style.display = 'none';
    const vp = document.getElementById('previewVideoPlayer');
    if (vp) { vp.pause(); vp.src = ''; }
  });

  // Admin Worker Manager
  document.getElementById('btnOpenWorkerManager').addEventListener('click', openWorkerManagerModal);
  document.getElementById('btnCloseWorkerManager').addEventListener('click', closeWorkerManagerModal);
  document.getElementById('formAddWorker').addEventListener('submit', handleAddWorker);
  document.getElementById('formResetPassword').addEventListener('submit', handleResetPasswordSubmit);
  document.getElementById('btnCancelResetPw').addEventListener('click', closeResetPwModal);

  // Admin Settings Cloud (Opsional)
  const btnOpenS = document.getElementById('btnOpenSettings');
  if (btnOpenS) btnOpenS.addEventListener('click', openSettingsModal);
  const btnCloseS = document.getElementById('btnCloseSettings');
  if (btnCloseS) btnCloseS.addEventListener('click', closeSettingsModal);
  const btnCancelS = document.getElementById('btnCancelSettings');
  if (btnCancelS) btnCancelS.addEventListener('click', closeSettingsModal);
  const formS = document.getElementById('settingsForm');
  if (formS) formS.addEventListener('submit', handleSaveSettings);

  // Admin Filters & Export
  document.getElementById('filterWorkerSelect').addEventListener('change', loadTasksList);
  document.getElementById('filterStatusSelect').addEventListener('change', loadTasksList);
  document.getElementById('filterDateInput').addEventListener('change', loadTasksList);
  const btnExport = document.getElementById('btnExportExcel');
  if (btnExport) btnExport.addEventListener('click', handleExportExcel);
  const btnSyncSheets = document.getElementById('btnSyncGoogleSheets');
  if (btnSyncSheets) btnSyncSheets.addEventListener('click', handleSyncAllGoogleSheets);
  const btnTestG = document.getElementById('btnTestGas');
  if (btnTestG) btnTestG.addEventListener('click', handleTestGasConnection);

  // Super Admin
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
}

// ============================================================================
// 2.5. SELFIE LOGIN (FOTO WAJAH SAAT MASUK - OPSIONAL)
// ============================================================================
function setupLoginSelfieControls() {
  const btnOpen = document.getElementById('btnOpenLoginCamera');
  const btnSnap = document.getElementById('btnSnapLoginSelfie');
  const btnRetake = document.getElementById('btnRetakeLoginSelfie');
  if (btnOpen) btnOpen.addEventListener('click', openLoginSelfieCamera);
  if (btnSnap) btnSnap.addEventListener('click', snapLoginSelfie);
  if (btnRetake) btnRetake.addEventListener('click', () => {
    loginSelfieBase64 = null;
    resetLoginSelfieWidget();
    openLoginSelfieCamera();
  });
}

async function openLoginSelfieCamera() {
  const video = document.getElementById('loginSelfieVideo');
  const placeholder = document.getElementById('loginSelfiePlaceholder');
  const badge = document.getElementById('loginSelfieBadge');
  const img = document.getElementById('loginSelfieImg');
  const btnOpen = document.getElementById('btnOpenLoginCamera');
  const btnSnap = document.getElementById('btnSnapLoginSelfie');
  try {
    loginSelfieStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    video.srcObject = loginSelfieStream;
    await video.play();
    if (placeholder) placeholder.style.display = 'none';
    if (img) img.style.display = 'none';
    video.style.display = 'block';
    if (badge) badge.style.display = 'inline-block';
    if (btnOpen) btnOpen.style.display = 'none';
    if (btnSnap) btnSnap.style.display = 'flex';
  } catch (err) {
    console.warn('Kamera selfie login tidak tersedia:', err.message);
    const btnO = document.getElementById('btnOpenLoginCamera');
    if (btnO) { btnO.textContent = '❌ Kamera Tidak Tersedia'; btnO.disabled = true; }
  }
}

function snapLoginSelfie() {
  const video = document.getElementById('loginSelfieVideo');
  const canvas = document.getElementById('loginSelfieCanvas');
  const img = document.getElementById('loginSelfieImg');
  const badge = document.getElementById('loginSelfieBadge');
  const btnSnap = document.getElementById('btnSnapLoginSelfie');
  const btnRetake = document.getElementById('btnRetakeLoginSelfie');
  if (!video || !canvas) return;
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();
  const now = new Date();
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, h - 22, w, 22);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Login: ' + now.toLocaleString('id-ID') + ' WIB', 8, h - 5);
  loginSelfieBase64 = canvas.toDataURL('image/jpeg', 0.85);
  if (img) { img.src = loginSelfieBase64; img.style.display = 'block'; }
  video.style.display = 'none';
  if (badge) badge.style.display = 'none';
  stopLoginSelfieCamera();
  if (btnSnap) btnSnap.style.display = 'none';
  if (btnRetake) btnRetake.style.display = 'flex';
}

function stopLoginSelfieCamera() {
  if (loginSelfieStream) { loginSelfieStream.getTracks().forEach(t => t.stop()); loginSelfieStream = null; }
  const video = document.getElementById('loginSelfieVideo');
  if (video) { video.srcObject = null; video.style.display = 'none'; }
}

function resetLoginSelfieWidget() {
  const placeholder = document.getElementById('loginSelfiePlaceholder');
  const img = document.getElementById('loginSelfieImg');
  const video = document.getElementById('loginSelfieVideo');
  const badge = document.getElementById('loginSelfieBadge');
  const btnOpen = document.getElementById('btnOpenLoginCamera');
  const btnSnap = document.getElementById('btnSnapLoginSelfie');
  const btnRetake = document.getElementById('btnRetakeLoginSelfie');
  if (placeholder) placeholder.style.display = 'flex';
  if (img) { img.style.display = 'none'; img.src = ''; }
  if (video) video.style.display = 'none';
  if (badge) badge.style.display = 'none';
  if (btnOpen) { btnOpen.style.display = 'flex'; btnOpen.disabled = false; btnOpen.textContent = '📷 Buka Kamera'; }
  if (btnSnap) btnSnap.style.display = 'none';
  if (btnRetake) btnRetake.style.display = 'none';
}

// ============================================================================
// 3. KAMERA & MULTI-FOTO DENGAN SELFIE
// ============================================================================
function updateCameraShutterState() {
  const noteInput = document.getElementById('cameraNoteInput');
  const snapBtn = document.getElementById('btnSnapPhoto');
  const recBtn = document.getElementById('btnRecordVideo');
  const requiredBar = document.getElementById('cameraRequiredNote');
  if (!noteInput) return;

  // Keterangan WAJIB hanya saat tahap 'mulai', opsional untuk progress dan selesai
  const isMulaiStage = AppState.cameraPendingStage === 'mulai';
  const hasNote = noteInput.value.trim().length > 0;
  const canShoot = !isMulaiStage || hasNote; // boleh foto jika bukan mulai, atau sudah ada catatan

  if (snapBtn) {
    snapBtn.disabled = !canShoot;
    snapBtn.style.opacity = canShoot ? '1' : '0.4';
  }
  if (recBtn && !window.cameraManager.isRecording) {
    recBtn.disabled = !canShoot;
    recBtn.style.opacity = canShoot ? '1' : '0.4';
  }
  noteInput.style.border = hasNote ? '2px solid rgba(34,197,94,0.7)' : (isMulaiStage ? '2px solid rgba(234,179,8,0.7)' : '2px solid rgba(148,163,184,0.5)');
  if (requiredBar) requiredBar.style.display = (isMulaiStage && !hasNote) ? 'flex' : 'none';
}

async function openCameraModal(opts) {
  const { stage, stageKey, taskName, note } = opts;
  AppState.cameraPendingStage = stageKey;
  AppState.cameraPendingStageLabel = stage;
  AppState.cameraPendingTaskName = taskName;
  AppState.cameraPendingNote = note;

  document.getElementById('cameraStageBadge').textContent = stage;
  const noteInput = document.getElementById('cameraNoteInput');
  if (noteInput) {
    noteInput.value = note || '';
  }

  // Reset foto terambil
  capturedPhotos = [];
  capturedVideoResult = null;
  renderCameraMultiPhotoStrip();

  setCameraMode('photo');
  document.getElementById('cameraModal').style.display = 'flex';
  updateCameraShutterState();

  const videoEl = document.getElementById('cameraLiveVideo');
  try {
    // Mulai kamera belakang secara default
    window.cameraManager.currentFacingMode = 'environment';
    await window.cameraManager.startCamera(videoEl);
    updateFlipButtonLabels();
  } catch (err) {
    alert('Gagal membuka kamera: ' + err.message);
    closeCameraModal();
  }
}

function closeCameraModal() {
  window.cameraManager.stopCamera();
  const camModal = document.getElementById('cameraModal');
  if (camModal) camModal.style.display = 'none';
  capturedPhotos = [];
  capturedVideoResult = null;
  const videoPreview = document.getElementById('cameraVideoPreviewContainer');
  if (videoPreview) videoPreview.style.display = 'none';
}

async function handleFlipCamera() {
  const btnFlipTop = document.getElementById('btnFlipCamera');
  const btnFlipBottom = document.getElementById('btnFlipCameraBottom');
  try {
    if (btnFlipTop) btnFlipTop.disabled = true;
    if (btnFlipBottom) btnFlipBottom.disabled = true;
    await window.cameraManager.flipCamera();
    updateFlipButtonLabels();
  } catch (err) {
    alert('Gagal beralih kamera: ' + err.message);
  } finally {
    if (btnFlipTop) btnFlipTop.disabled = false;
    if (btnFlipBottom) btnFlipBottom.disabled = false;
  }
}

function updateFlipButtonLabels() {
  const isSelfie = window.cameraManager.currentFacingMode === 'user';
  const btnFlipTop = document.getElementById('btnFlipCamera');
  const btnFlipBottom = document.getElementById('btnFlipCameraBottom');
  if (btnFlipTop) {
    btnFlipTop.innerHTML = isSelfie ? '📷 Belakang' : '🤳 Selfie';
  }
  if (btnFlipBottom) {
    btnFlipBottom.innerHTML = isSelfie ? '📷 Belakang' : '🤳 Selfie';
  }
}

function setCameraMode(mode) {
  AppState.cameraMode = mode;
  const btnTabPhoto = document.getElementById('btnTabModePhoto');
  const btnTabVideo = document.getElementById('btnTabModeVideo');
  const snapBtn = document.getElementById('btnSnapPhoto');
  const recBtn = document.getElementById('btnRecordVideo');
  const multiContainer = document.getElementById('cameraMultiPhotoContainer');
  const videoPreview = document.getElementById('cameraVideoPreviewContainer');
  const shutterHint = document.getElementById('cameraShutterHint');
  const submitBtn = document.getElementById('btnConfirmMultiPhotos');

  if (mode === 'photo') {
    if (btnTabPhoto) btnTabPhoto.classList.add('active');
    if (btnTabVideo) btnTabVideo.classList.remove('active');
    if (snapBtn) snapBtn.style.display = 'flex';
    if (recBtn) recBtn.style.display = 'none';
    if (multiContainer) multiContainer.style.display = 'flex';
    if (videoPreview) videoPreview.style.display = 'none';
    if (shutterHint) shutterHint.textContent = 'Multi-Snap';
    renderCameraMultiPhotoStrip();
  } else {
    if (btnTabVideo) btnTabVideo.classList.add('active');
    if (btnTabPhoto) btnTabPhoto.classList.remove('active');
    if (snapBtn) snapBtn.style.display = 'none';
    if (recBtn) recBtn.style.display = 'flex';
    if (multiContainer) multiContainer.style.display = 'none';
    if (shutterHint) shutterHint.textContent = 'Maks 45 Detik';

    if (capturedVideoResult) {
      if (videoPreview) videoPreview.style.display = 'flex';
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.innerHTML = '✅ Simpan Rekaman Video & Kirim Laporan';
      }
    } else {
      if (videoPreview) videoPreview.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.innerHTML = '📹 Tekan Tombol Merah untuk Merekam Video';
      }
    }
  }
  updateCameraShutterState();
}

function discardCapturedVideo() {
  capturedVideoResult = null;
  const videoPreview = document.getElementById('cameraVideoPreviewContainer');
  if (videoPreview) videoPreview.style.display = 'none';
  const submitBtn = document.getElementById('btnConfirmMultiPhotos');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.5';
    submitBtn.innerHTML = '📹 Tekan Tombol Merah untuk Merekam Video';
  }
}

function snapPhoto() {
  const noteInput = document.getElementById('cameraNoteInput');
  const noteVal = noteInput ? noteInput.value.trim() : '';
  // Keterangan WAJIB hanya di tahap 'mulai'
  if (AppState.cameraPendingStage === 'mulai' && !noteVal) {
    alert('Wajib isi keterangan / nama aktivitas terlebih dahulu!');
    if (noteInput) noteInput.focus();
    return;
  }

  const user = AppState.currentUser || {};
  const meta = {
    workerName: user.fullName || user.username || 'Petugas',
    taskName: AppState.cameraPendingTaskName || 'Aktivitas Lapangan',
    stage: AppState.cameraPendingStageLabel || 'DOKUMENTASI',
    note: noteVal,
    stageColor: AppState.cameraPendingStage === 'selesai' ? '#22c55e' : (AppState.cameraPendingStage === 'progress' ? '#eab308' : '#38bdf8')
  };

  try {
    const photoBase64 = window.cameraManager.capturePhotoWithWatermark(meta);
    capturedPhotos.push(photoBase64);
    triggerCameraFlash();
    renderCameraMultiPhotoStrip();
  } catch (err) {
    alert('Gagal mengambil foto: ' + err.message);
  }
}

function triggerCameraFlash() {
  const flash = document.getElementById('cameraFlashOverlay');
  if (!flash) return;
  flash.style.opacity = '0.7';
  setTimeout(() => { flash.style.opacity = '0'; }, 120);
}

function renderCameraMultiPhotoStrip() {
  const strip = document.getElementById('cameraMultiPhotoStrip');
  const submitBtn = document.getElementById('btnConfirmMultiPhotos');
  const badgeCount = document.getElementById('cameraPhotoCountBadge');
  if (!strip) return;

  if (capturedPhotos.length === 0) {
    strip.innerHTML = '<span style="font-size:0.75rem; color:#94a3b8; font-style:italic;">Belum ada foto yang diambil. Tekan tombol bulat untuk jepret foto (bisa multiple/banyak).</span>';
    if (badgeCount) badgeCount.textContent = '0 Foto';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.5';
      submitBtn.textContent = '✅ Ambil Minimal 1 Foto Terlebih Dahulu';
    }
    return;
  }

  if (badgeCount) badgeCount.textContent = capturedPhotos.length + ' Foto';

  strip.innerHTML = capturedPhotos.map((p, idx) => {
    return '<div class="camera-photo-thumb">' +
      '<img src="' + p + '" alt="Foto ' + (idx + 1) + '" />' +
      '<button type="button" class="btn-remove-thumb" onclick="removeCapturedPhoto(' + idx + ')" title="Hapus foto ini">✕</button>' +
      '<span style="position:absolute; bottom:2px; left:2px; background:rgba(0,0,0,0.7); color:#fff; font-size:9px; font-weight:700; padding:1px 4px; border-radius:3px;">#' + (idx + 1) + '</span>' +
    '</div>';
  }).join('');

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.style.opacity = '1';
    submitBtn.innerHTML = '✅ Simpan & Kirim Laporan (' + capturedPhotos.length + ' Foto)';
  }
}

function removeCapturedPhoto(index) {
  if (index >= 0 && index < capturedPhotos.length) {
    capturedPhotos.splice(index, 1);
    renderCameraMultiPhotoStrip();
  }
}

// Perekaman Video
async function handleVideoRecordingClick() {
  const noteInput = document.getElementById('cameraNoteInput');
  const noteVal = noteInput ? noteInput.value.trim() : '';
  // Keterangan WAJIB hanya di tahap 'mulai'
  if (AppState.cameraPendingStage === 'mulai' && !noteVal) {
    alert('Wajib isi keterangan / nama aktivitas terlebih dahulu sebelum merekam video!');
    if (noteInput) noteInput.focus();
    return;
  }

  const recBtn = document.getElementById('btnRecordVideo');
  const badge = document.getElementById('cameraRecordingBadge');
  const timerText = document.getElementById('cameraRecordingTimerText');

  if (!window.cameraManager.isRecording) {
    // Mulai Rekam
    try {
      window.cameraManager.startVideoRecording(
        (sec) => {
          const m = String(Math.floor(sec / 60)).padStart(2, '0');
          const s = String(sec % 60).padStart(2, '0');
          if (timerText) timerText.textContent = '● REC ' + m + ':' + s + ' / 00:45';
        },
        async () => {
          await finishVideoRecording();
        }
      );
      recBtn.classList.add('recording');
      badge.style.display = 'flex';
    } catch (err) {
      alert('Gagal merekam video: ' + err.message);
    }
  } else {
    await finishVideoRecording();
  }
}

async function finishVideoRecording() {
  const recBtn = document.getElementById('btnRecordVideo');
  const badge = document.getElementById('cameraRecordingBadge');
  if (recBtn) recBtn.classList.remove('recording');
  if (badge) badge.style.display = 'none';

  try {
    const blob = await window.cameraManager.stopVideoRecording();
    if (blob && blob.size > 0) {
      const sizeKb = Math.round(blob.size / 1024);
      const reader = new FileReader();
      reader.onloadend = () => {
        capturedVideoResult = reader.result;
        const videoPreview = document.getElementById('cameraVideoPreviewContainer');
        const statusText = document.getElementById('cameraVideoStatusText');
        if (statusText) statusText.textContent = `Video siap dikirim (${sizeKb} KB)`;
        if (videoPreview) videoPreview.style.display = 'flex';

        const submitBtn = document.getElementById('btnConfirmMultiPhotos');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.style.opacity = '1';
          submitBtn.innerHTML = `✅ Simpan Rekaman Video & Kirim Laporan (${sizeKb} KB)`;
        }
      };
      reader.onerror = () => {
        alert('Gagal memproses file rekaman video.');
      };
      reader.readAsDataURL(blob);
    } else {
      alert('Video terlalu singkat atau kosong. Silakan rekam minimal 2 detik.');
    }
  } catch (err) {
    console.error('Error finishVideoRecording:', err);
    alert('Gagal menghentikan rekaman video: ' + err.message);
  }
}

async function submitAllCapturedMedia() {
  if (AppState.isSubmitting) return;
  const stage = AppState.cameraPendingStage;
  const note = (document.getElementById('cameraNoteInput')?.value || '').trim();

  if (AppState.cameraMode === 'photo' && capturedPhotos.length === 0) {
    alert('Ambil minimal 1 foto sebelum mengirim laporan!');
    return;
  }

  if (AppState.cameraMode === 'video' && !capturedVideoResult) {
    alert('Rekam video terlebih dahulu sebelum mengirim laporan!');
    return;
  }

  AppState.isSubmitting = true;
  const overlay = document.getElementById('globalSubmitOverlay');
  if (overlay) overlay.style.display = 'flex';

  const submitBtn = document.getElementById('btnConfirmMultiPhotos');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.style.pointerEvents = 'none';
    submitBtn.style.opacity = '0.6';
    submitBtn.textContent = '⏳ Mengunggah Dokumentasi...';
  }

  try {
    const user = AppState.currentUser;
    let url = '';
    let payload = {};

    if (stage === 'mulai') {
      url = '/api/tasks/start';
      payload = {
        workerId: user.id,
        workerName: user.fullName || user.username,
        taskName: AppState.cameraPendingTaskName,
        notes: note,
        photosBase64: capturedPhotos,
        photoBase64: capturedPhotos[0] || null,
        videoBase64: capturedVideoResult || null,
        location: window.cameraManager.currentGps
      };
    } else if (stage === 'progress') {
      url = '/api/tasks/progress';
      payload = {
        taskId: AppState.activeTask.id,
        workerId: user.id,
        note: note,
        photosBase64: capturedPhotos,
        photoBase64: capturedPhotos[0] || null,
        videoBase64: capturedVideoResult || null
      };
    } else if (stage === 'selesai') {
      url = '/api/tasks/complete';
      payload = {
        taskId: AppState.activeTask.id,
        workerId: user.id,
        finalNotes: note,
        photosBase64: capturedPhotos,
        photoBase64: capturedPhotos[0] || null,
        videoBase64: capturedVideoResult || null
      };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const resText = await res.text();
    let data;
    try {
      data = JSON.parse(resText);
    } catch (_) {
      if (res.status === 413) {
        throw new Error('Ukuran video melebihi batas upload server (413 Payload Too Large). Silakan rekam video lebih singkat (5-15 detik).');
      }
      throw new Error(`Server respon error (${res.status}): ${resText.substring(0, 120)}`);
    }

    if (!res.ok) {
      throw new Error(data.error || 'Gagal mengirim laporan!');
    }

    if (stage === 'mulai') {
      AppState.activeTask = data.task;
      localStorage.setItem('active_task_id_' + user.id, data.task.id);
      closeCameraModal();
      await loadWorkerDashboard();
      alert('Pekerjaan berhasil dimulai!');
    } else if (stage === 'progress') {
      AppState.activeTask = data.task;
      closeCameraModal();
      await loadWorkerDashboard();
      alert('Progress pekerjaan berhasil didokumentasikan!');
    } else if (stage === 'selesai') {
      AppState.activeTask = null;
      localStorage.removeItem('active_task_id_' + user.id);
      closeCameraModal();
      await loadWorkerDashboard();
      alert('Pekerjaan selesai & tercatat rapi!');
    }
  } catch (err) {
    alert('Gagal: ' + err.message);
  } finally {
    AppState.isSubmitting = false;
    if (overlay) overlay.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.style.pointerEvents = 'auto';
      submitBtn.style.opacity = '1';
      if (AppState.cameraMode === 'video' && capturedVideoResult) {
        submitBtn.innerHTML = '✅ Simpan Rekaman Video & Kirim Laporan';
      } else if (AppState.cameraMode === 'photo' && capturedPhotos.length > 0) {
        submitBtn.innerHTML = `✅ Simpan & Kirim Laporan (${capturedPhotos.length} Foto)`;
      }
    }
  }
}

// ============================================================================
// 4. WORKER DASHBOARD & MULTI-TUGAS (TAP UNTUK LANJUT)
// ============================================================================
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
  } else {
    AppState.activeTask = null;
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
  if (tasks.length <= 1) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  listEl.innerHTML = tasks.map(t => {
    const isActive = AppState.activeTask && t.id === AppState.activeTask.id;
    const cnt = (t.progressPhotos || []).length;
    const startCnt = (t.startPhotos || []).length || (t.startPhoto ? 1 : 0);
    const totalPhotos = startCnt + cnt;
    const badge = isActive
      ? '<span style="font-size:0.72rem; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:2px 8px; border-radius:9999px; font-weight:700;">Sedang Dibuka</span>'
      : '<span style="font-size:0.72rem; background:#fefce8; color:#b45309; border:1px solid #fde68a; padding:2px 8px; border-radius:9999px; font-weight:700;">👉 Tap Lanjut</span>';

    return '<div class="task-card-in-progress ' + (isActive ? 'is-selected' : '') + '" onclick="switchToTask(\'' + t.id + '\')">' +
      '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">' +
        '<div>' +
          '<div style="font-weight:700; font-size:0.92rem; color:var(--text-main);">' + escapeHtml(t.taskName) + '</div>' +
          '<div style="font-size:0.75rem; color:var(--text-dim); margin-top:2px;">Mulai: ' + t.startTime + ' WIB | ' + totalPhotos + ' foto terkumpul</div>' +
        '</div>' +
        badge +
      '</div>' +
      (t.notes ? '<div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">' + escapeHtml(t.notes) + '</div>' : '') +
    '</div>';
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
  if (!confirm('Hapus tugas "' + taskName + '"? Semua foto pekerjaan ini akan ikut terhapus.')) return;
  try {
    const res = await fetch('/api/tasks/' + AppState.activeTask.id, { method: 'DELETE' });
    if (!res.ok) throw new Error('Gagal menghapus pekerjaan!');
    AppState.activeTask = null;
    const user = AppState.currentUser;
    if (user) localStorage.removeItem('active_task_id_' + user.id);
    await loadWorkerDashboard();
    alert('Pekerjaan berhasil dihapus.');
  } catch (err) {
    alert('Gagal: ' + err.message);
  }
}

function startTaskStopwatch(startMs) {
  stopTaskStopwatch();
  const timerEl = document.getElementById('activeTaskTimer');
  if (!timerEl) return;
  const update = () => {
    const diff = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    const h = String(Math.floor(diff / 3600)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const s = String(diff % 60).padStart(2, '0');
    timerEl.textContent = h + ':' + m + ':' + s;
  };
  update();
  AppState.timerInterval = setInterval(update, 1000);
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
    // Ambil data tugas milik karyawan ini
    const res = await fetch('/api/tasks?workerName=' + encodeURIComponent(user.fullName || user.username));
    const data = await res.json();
    AppState.tasks = data.tasks || [];
    AppState.activeTasks = AppState.tasks.filter(t => t.status === 'in_progress');

    // Sesuai instruksi: Riwayat kerja setiap hari dibuka dalam kondisi kosong
    // Karyawan harus mencari menggunakan tanggal, bulan, dan tahun
    const dateInput = document.getElementById('workerHistoryDateInput');
    const countEl = document.getElementById('todayHistoryCount');
    const listEl = document.getElementById('workerHistoryList');

    if (dateInput) {
      dateInput.value = ''; // Kosongkan pilihan tanggal saat awal buka
    }
    if (countEl) {
      countEl.textContent = 'Pilih tanggal untuk mencari';
    }
    if (listEl) {
      listEl.innerHTML = '<div style="text-align:center; padding:1.75rem 1rem; color:var(--text-dim);">' +
        '<div style="font-size:2.2rem; margin-bottom:0.5rem; opacity:0.8;">📅</div>' +
        '<div style="font-weight:700; font-size:0.95rem; color:var(--text-main); margin-bottom:0.35rem;">Riwayat Kerja Disimpan Rapi</div>' +
        '<p style="font-size:0.8rem; margin:0; line-height:1.4;">Untuk melihat riwayat pekerjaan, silakan tentukan <b>tanggal, bulan, dan tahun</b> di atas lalu klik tombol <b>🔍 Cari</b>.</p>' +
        '</div>';
    }
  } catch (err) {
    console.warn('Gagal muat riwayat:', err);
  }
}

// Helper: tanggal hari ini format yyyy-MM-dd (untuk input[type=date])
function getTodayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Helper: konversi YYYY-MM-DD ke dd/MM/yyyy (format di tasks.json)
function isoToIndonesianDate(isoStr) {
  if (!isoStr) return null;
  const parts = isoStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return null;
}

function showTodayWorkerHistory() {
  const dateInput = document.getElementById('workerHistoryDateInput');
  const todayIso = getTodayIsoDate();
  if (dateInput) dateInput.value = todayIso;
  filterAndRenderHistory(todayIso);
}

function searchWorkerHistoryByDate() {
  const dateInput = document.getElementById('workerHistoryDateInput');
  const val = dateInput ? dateInput.value : '';
  if (!val) {
    alert('Silakan pilih tanggal terlebih dahulu!');
    if (dateInput) dateInput.focus();
    return;
  }
  filterAndRenderHistory(val);
}

function filterAndRenderHistory(isoDate) {
  const indoDate = isoToIndonesianDate(isoDate);
  let targetYear, targetMonth, targetDay;
  if (isoDate) {
    const parts = isoDate.split('-');
    if (parts.length === 3) {
      targetYear = parseInt(parts[0], 10);
      targetMonth = parseInt(parts[1], 10) - 1; // 0-indexed
      targetDay = parseInt(parts[2], 10);
    }
  }

  // Filter tasks yang tanggalnya sesuai (hanya yang statusnya 'completed')
  const filtered = AppState.tasks.filter(t => {
    if (t.status !== 'completed') return false;
    // 1. Cek via format string 'dd/MM/yyyy'
    if (indoDate && t.date === indoDate) return true;
    // 2. Cek via endTimestamp (waktu lokal)
    if (t.endTimestamp && targetYear !== undefined) {
      const tDate = new Date(t.endTimestamp);
      if (tDate.getFullYear() === targetYear && tDate.getMonth() === targetMonth && tDate.getDate() === targetDay) {
        return true;
      }
    }
    // 3. Fallback via startTimestamp
    if (t.startTimestamp && targetYear !== undefined) {
      const tDate = new Date(t.startTimestamp);
      if (tDate.getFullYear() === targetYear && tDate.getMonth() === targetMonth && tDate.getDate() === targetDay) {
        return true;
      }
    }
    return false;
  });

  const countEl = document.getElementById('todayHistoryCount');
  const isToday = isoDate === getTodayIsoDate();
  const labelDate = indoDate || isoDate;

  if (countEl) {
    if (isToday) {
      countEl.textContent = filtered.length ? `${filtered.length} pekerjaan selesai hari ini` : 'Belum ada hari ini';
    } else {
      countEl.textContent = `${filtered.length} pekerjaan (${labelDate})`;
    }
  }

  renderWorkerHistoryList(filtered, labelDate, isToday);
}

function renderWorkerHistoryList(tasks, labelDate, isToday) {
  const listEl = document.getElementById('workerHistoryList');
  if (!listEl) return;

  const done = tasks.filter(t => t.status === 'completed');
  if (!done.length) {
    const emptyMsg = isToday
      ? 'Belum ada pekerjaan selesai hari ini.'
      : `Tidak ada riwayat pekerjaan pada tanggal ${labelDate || 'yang dipilih'}.`;
    listEl.innerHTML = '<div style="text-align:center; color:var(--text-dim); padding:1.75rem 1rem;">' +
      '<div style="font-size:2rem; margin-bottom:0.5rem; opacity:0.6;">📭</div>' +
      '<p style="font-weight:600; margin:0 0 0.25rem 0; color:var(--text-main);">' + escapeHtml(emptyMsg) + '</p>' +
      '<p style="font-size:0.78rem; margin:0;">Silakan cek tanggal lain atau pastikan pekerjaan sudah diselesaikan.</p>' +
      '</div>';
    return;
  }

  listEl.innerHTML = done.map(t => {
    const durStr = t.durationMinutes ? t.durationMinutes + ' menit' : '-';
    let thumbsHtml = '';

    // Foto & Video Mulai
    if (t.startPhotos && t.startPhotos.length > 0) {
      t.startPhotos.forEach((p, idx) => {
        thumbsHtml += buildThumbHtml(p, 'MULAI ' + (idx + 1), false);
      });
    } else if (t.startPhoto) {
      thumbsHtml += buildThumbHtml(t.startPhoto, 'MULAI', false);
    }
    if (t.startVideo) thumbsHtml += buildThumbHtml(t.startVideo, 'VID MULAI', true);

    // Progress Photos
    if (t.progressPhotos && t.progressPhotos.length) {
      t.progressPhotos.forEach((p, idx) => {
        if (p.photoUrl) thumbsHtml += buildThumbHtml(p.photoUrl, 'PROG ' + (idx + 1), false);
        if (p.videoUrl) thumbsHtml += buildThumbHtml(p.videoUrl, 'VID ' + (idx + 1), true);
      });
    }

    // Finish Photos
    if (t.finishPhotos && t.finishPhotos.length > 0) {
      t.finishPhotos.forEach((p, idx) => {
        thumbsHtml += buildThumbHtml(p, 'SELESAI ' + (idx + 1), false, 'rgba(16,185,129,0.9)');
      });
    } else if (t.finishPhoto) {
      thumbsHtml += buildThumbHtml(t.finishPhoto, 'SELESAI', false, 'rgba(16,185,129,0.9)');
    }
    if (t.finishVideo) thumbsHtml += buildThumbHtml(t.finishVideo, 'VID AKHIR', true, 'rgba(16,185,129,0.9)');

    return '<div class="task-card-mini">' +
      '<div class="task-card-top">' +
        '<div class="task-card-title">' + escapeHtml(t.taskName) + '</div>' +
        '<span class="badge-status ' + t.status + '">SELESAI</span>' +
      '</div>' +
      '<div class="task-card-time">Mulai ' + (t.startTime || '-') + ' s/d ' + (t.endTime || '-') + ' (' + durStr + ')</div>' +
      (t.notes ? '<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">' + escapeHtml(t.notes) + '</div>' : '') +
      (thumbsHtml ? '<div class="task-thumbs-row">' + thumbsHtml + '</div>' : '') +
    '</div>';
  }).join('');
}

function buildThumbHtml(url, label, isVideo, labelBg) {
  if (!url) return '';
  labelBg = labelBg || 'rgba(15,23,42,0.85)';
  if (isVideo) {
    return '<div class="task-thumb-item" onclick="viewMediaDetail(\'' + url + '\', true)">' +
      '<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#0f172a; color:#fff; font-size:1.8rem;">🎬</div>' +
      '<span class="thumb-label" style="background:' + labelBg + ';">' + label + '</span>' +
    '</div>';
  }
  return '<div class="task-thumb-item" onclick="viewMediaDetail(\'' + url + '\', false)">' +
    '<img src="' + url + '" alt="' + label + '" loading="lazy"/>' +
    '<span class="thumb-label" style="background:' + labelBg + ';">' + label + '</span>' +
  '</div>';
}

function viewMediaDetail(url, isVideo) {
  const modal = document.getElementById('previewModal');
  const img = document.getElementById('previewPhotoImg');
  const video = document.getElementById('previewVideoPlayer');
  if (isVideo) {
    img.style.display = 'none';
    video.style.display = 'block';
    video.src = url;
    video.play();
  } else {
    video.style.display = 'none';
    img.style.display = 'block';
    img.src = url;
  }
  modal.style.display = 'flex';
}

// ============================================================================
// 5. DASHBOARD ADMIN & LAPORAN EXCEL
// ============================================================================
async function loadAdminDashboard() {
  await loadWorkersList();
  await loadTasksList();
}

async function loadWorkersList() {
  try {
    const res = await fetch('/api/admin/workers');
    const data = await res.json();
    AppState.workers = data.users || [];

    // Isi dropdown filter
    const select = document.getElementById('filterWorkerSelect');
    if (select) {
      const currentVal = select.value;
      select.innerHTML = '<option value="all">-- Semua Pekerja --</option>' +
        AppState.workers.map(w => '<option value="' + escapeHtml(w.fullName || w.username) + '">' + escapeHtml(w.fullName || w.username) + '</option>').join('');
      select.value = currentVal || 'all';
    }

    // Isi tabel Kelola Karyawan modal
    const tbody = document.getElementById('workersListTableBody');
    if (tbody) {
      if (AppState.workers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1rem; color:var(--text-dim);">Belum ada karyawan terdaftar.</td></tr>';
      } else {
        tbody.innerHTML = AppState.workers.map(w => {
          return '<tr style="border-bottom: 1px solid var(--border-color);">' +
            '<td style="padding: 0.6rem 0.75rem; font-weight: 600;">' + escapeHtml(w.fullName || w.username) + '</td>' +
            '<td style="padding: 0.6rem 0.75rem; color: var(--text-dim);">' + escapeHtml(w.username) + '</td>' +
            '<td style="padding: 0.6rem 0.75rem;">' + escapeHtml(w.phone || '-') + '</td>' +
            '<td style="padding: 0.6rem 0.75rem; text-align: center;">' +
              '<button onclick="openResetPwModal(\'' + w.id + '\', \'' + escapeHtml(w.fullName || w.username) + '\')" style="background:none; border:1px solid #bfdbfe; color:#1d4ed8; border-radius:4px; padding:2px 8px; font-size:0.75rem; cursor:pointer; font-weight:600; margin-right:4px;">🔑 Reset Sandi</button>' +
              '<button onclick="handleDeleteWorker(\'' + w.id + '\', \'' + escapeHtml(w.fullName || w.username) + '\')" style="background:none; border:1px solid #fecaca; color:#dc2626; border-radius:4px; padding:2px 8px; font-size:0.75rem; cursor:pointer; font-weight:600;">🗑️ Hapus</button>' +
            '</td>' +
          '</tr>';
        }).join('');
      }
    }
  } catch (err) {
    console.warn('Gagal memuat pekerja:', err);
  }
}

async function loadTasksList() {
  const worker = document.getElementById('filterWorkerSelect')?.value || 'all';
  const status = document.getElementById('filterStatusSelect')?.value || 'all';
  const date = document.getElementById('filterDateInput')?.value || '';

  const params = new URLSearchParams();
  if (worker !== 'all') params.append('workerName', worker);
  if (status !== 'all') params.append('status', status);
  if (date) params.append('date', date);

  try {
    const res = await fetch('/api/tasks?' + params.toString());
    const data = await res.json();
    AppState.tasks = data.tasks || [];
    renderAdminMetrics(AppState.tasks);
    renderAdminTable(AppState.tasks);
  } catch (err) {
    console.warn('Gagal memuat data tugas:', err);
  }
}

function renderAdminMetrics(tasks) {
  const total = tasks.length;
  const active = tasks.filter(t => t.status === 'in_progress').length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const totalMinutes = tasks.reduce((sum, t) => sum + (t.durationMinutes || 0), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  const elTot = document.getElementById('metricTotalTasks');
  const elAct = document.getElementById('metricActiveTasks');
  const elComp = document.getElementById('metricCompletedTasks');
  const elHrs = document.getElementById('metricTotalHours');

  if (elTot) elTot.textContent = total;
  if (elAct) elAct.textContent = active;
  if (elComp) elComp.textContent = completed;
  if (elHrs) elHrs.textContent = totalHours + ' Jam';
}

function renderAdminTable(tasks) {
  const tbody = document.getElementById('adminTasksTableBody');
  if (!tbody) return;

  if (tasks.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:2rem; color:var(--text-dim);">Tidak ada data laporan untuk filter yang dipilih.</td></tr>';
    return;
  }

  tbody.innerHTML = tasks.map((t, idx) => {
    const durStr = t.durationMinutes ? t.durationMinutes + ' mnt' : (t.status === 'completed' ? 'Selesai' : 'Sedang Berjalan');

    // Foto Mulai
    let startPhotoHtml = '-';
    const mainStartPhoto = (t.startPhotos && t.startPhotos[0]) || t.startPhoto;
    if (mainStartPhoto) {
      const extraCount = (t.startPhotos && t.startPhotos.length > 1) ? '<span style="position:absolute; bottom:2px; right:2px; background:rgba(0,0,0,0.8); color:#fff; font-size:9px; padding:1px 4px; border-radius:3px; font-weight:700;">+' + (t.startPhotos.length - 1) + '</span>' : '';
      startPhotoHtml = '<div class="photo-cell-preview" onclick="viewMediaDetail(\'' + mainStartPhoto + '\', false)" title="Klik untuk perbesar">' +
        '<img src="' + mainStartPhoto + '" alt="Foto Mulai" loading="lazy" />' +
        extraCount +
      '</div>';
    }

    // Foto Progress
    let progressPhotoHtml = '-';
    if (t.progressPhotos && t.progressPhotos.length > 0) {
      const firstProg = t.progressPhotos.find(p => p.photoUrl);
      if (firstProg) {
        const extraCount = t.progressPhotos.length > 1 ? '<span style="position:absolute; bottom:2px; right:2px; background:rgba(0,0,0,0.8); color:#fff; font-size:9px; padding:1px 4px; border-radius:3px; font-weight:700;">+' + (t.progressPhotos.length - 1) + '</span>' : '';
        progressPhotoHtml = '<div class="photo-cell-preview" onclick="viewMediaDetail(\'' + firstProg.photoUrl + '\', false)" title="Klik untuk perbesar">' +
          '<img src="' + firstProg.photoUrl + '" alt="Foto Progress" loading="lazy" />' +
          extraCount +
        '</div>';
      }
    }

    // Foto Selesai
    let finishPhotoHtml = '-';
    const mainFinishPhoto = (t.finishPhotos && t.finishPhotos[0]) || t.finishPhoto;
    if (mainFinishPhoto) {
      const extraCount = (t.finishPhotos && t.finishPhotos.length > 1) ? '<span style="position:absolute; bottom:2px; right:2px; background:rgba(0,0,0,0.8); color:#fff; font-size:9px; padding:1px 4px; border-radius:3px; font-weight:700;">+' + (t.finishPhotos.length - 1) + '</span>' : '';
      finishPhotoHtml = '<div class="photo-cell-preview" onclick="viewMediaDetail(\'' + mainFinishPhoto + '\', false)" title="Klik untuk perbesar">' +
        '<img src="' + mainFinishPhoto + '" alt="Foto Selesai" loading="lazy" />' +
        extraCount +
      '</div>';
    }

    // Video
    let videoHtml = '-';
    if (t.videoUrl || t.startVideo || t.finishVideo) {
      const vid = t.videoUrl || t.startVideo || t.finishVideo;
      videoHtml = '<button type="button" onclick="viewMediaDetail(\'' + vid + '\', true)" style="background:#0f172a; color:#ffffff; border:none; padding:4px 10px; border-radius:4px; font-size:0.75rem; cursor:pointer; font-weight:700;">' +
        '🎬 Putar' +
      '</button>';
    }

    const statusBadge = t.status === 'completed'
      ? '<span class="badge-status completed">SELESAI</span>'
      : '<span class="badge-status in_progress">BERJALAN</span>';

    return '<tr>' +
      '<td style="text-align:center; font-weight:700; color:var(--text-dim);">' + (idx + 1) + '</td>' +
      '<td style="font-weight:700; color:var(--text-main);">' + escapeHtml(t.workerName) + '</td>' +
      '<td>' + (t.date || '-') + '</td>' +
      '<td>' + (t.startTime || '-') + ' - ' + (t.endTime || '-') + '</td>' +
      '<td style="font-weight:600;">' + durStr + '</td>' +
      '<td style="max-width:240px;">' +
        '<div style="font-weight:700; color:var(--text-main);">' + escapeHtml(t.taskName) + '</div>' +
        (t.notes ? '<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">' + escapeHtml(t.notes) + '</div>' : '') +
      '</td>' +
      '<td style="text-align:center;">' + startPhotoHtml + '</td>' +
      '<td style="text-align:center;">' + progressPhotoHtml + '</td>' +
      '<td style="text-align:center;">' + finishPhotoHtml + '</td>' +
      '<td style="text-align:center;">' + videoHtml + '</td>' +
      '<td style="text-align:center;">' +
        '<div style="display:flex; flex-direction:column; align-items:center; gap:4px;">' +
          statusBadge +
          '<button onclick="handleAdminDeleteTask(\'' + t.id + '\', \'' + escapeHtml(t.taskName) + '\')" style="background:none; border:none; color:#dc2626; font-size:0.75rem; cursor:pointer; font-weight:600;">🗑️ Hapus</button>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }).join('');
}

async function handleAdminDeleteTask(id, taskName) {
  if (!confirm('Hapus data pekerjaan "' + taskName + '"? Data tidak bisa dipulihkan.')) return;
  try {
    const res = await fetch('/api/tasks/' + id, { method: 'DELETE' });
    if (!res.ok) throw new Error('Gagal menghapus pekerjaan!');
    await loadTasksList();
  } catch (err) {
    alert('Gagal: ' + err.message);
  }
}

async function handleExportExcel() {
  const btn = document.getElementById('btnExportExcel');
  try {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Membuat Excel...</span>';

    const date = document.getElementById('filterDateInput')?.value || '';
    const worker = document.getElementById('filterWorkerSelect')?.value || 'all';

    // URL yang benar sesuai endpoint server
    const url = '/api/tasks/export-excel?date=' + encodeURIComponent(date) + '&workerName=' + encodeURIComponent(worker);
    window.location.href = url;
  } catch (err) {
    alert('Gagal mengekspor Excel: ' + err.message);
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '<span>📥 Unduh Laporan Excel (.xlsx)</span>';
    }, 2000);
  }
}

async function handleSyncAllGoogleSheets() {
  const btn = document.getElementById('btnSyncGoogleSheets');
  try {
    if (!AppState.settings.gasWebhookUrl) {
      alert('URL Webhook Google Apps Script belum diisi!\n\nSilakan klik tombol "⚙️ Cloud & Sheet" terlebih dahulu untuk memasukkan URL Webhook Google Sheet Anda.');
      openSettingsModal();
      return;
    }

    const date = document.getElementById('filterDateInput')?.value || '';
    const worker = document.getElementById('filterWorkerSelect')?.value || 'all';

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>⏳ Mengirim ke Google Sheet...</span>';
    }

    const res = await fetch('/api/tasks/sync-all-sheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, workerName: worker })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal sinkronisasi Google Sheet');

    alert('🎉 ' + data.message + '\n\nSilakan buka Google Spreadsheet Anda untuk melihat data dan foto yang baru masuk.');
    await loadTasksList();
  } catch (err) {
    alert('Gagal sinkronisasi ke Google Sheet: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>🟢 Kirim ke Google Sheet</span>';
    }
  }
}

// ============================================================================
// 6. KELOLA KARYAWAN & MODAL ADMIN
// ============================================================================
function openWorkerManagerModal() {
  document.getElementById('workerManagerModal').style.display = 'flex';
  loadWorkersList();
}

function closeWorkerManagerModal() {
  document.getElementById('workerManagerModal').style.display = 'none';
}

async function handleAddWorker(e) {
  e.preventDefault();
  const fullName = document.getElementById('newWorkerFullName').value.trim();
  const username = document.getElementById('newWorkerUsername').value.trim();
  const password = document.getElementById('newWorkerPassword').value;
  const phone = document.getElementById('newWorkerPhone').value.trim();

  try {
    const res = await fetch('/api/admin/workers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, username, password, phone })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menambahkan karyawan!');
    alert(data.message);
    document.getElementById('formAddWorker').reset();
    loadWorkersList();
  } catch (err) {
    alert('Gagal: ' + err.message);
  }
}

function openResetPwModal(userId, workerName) {
  document.getElementById('resetPwWorkerId').value = userId;
  document.getElementById('resetPwWorkerName').textContent = workerName;
  document.getElementById('resetPwInput').value = '';
  document.getElementById('resetPasswordModal').style.display = 'flex';
}

function closeResetPwModal() {
  document.getElementById('resetPasswordModal').style.display = 'none';
}

async function handleResetPasswordSubmit(e) {
  e.preventDefault();
  const userId = document.getElementById('resetPwWorkerId').value;
  const newPassword = document.getElementById('resetPwInput').value;
  try {
    const res = await fetch('/api/admin/workers/' + userId + '/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengubah sandi!');
    alert(data.message);
    closeResetPwModal();
  } catch (err) {
    alert('Gagal: ' + err.message);
  }
}

async function handleDeleteWorker(userId, workerName) {
  if (!confirm('Hapus akun karyawan "' + workerName + '"? Karyawan ini tidak akan bisa login lagi ke sistem.')) return;
  try {
    const res = await fetch('/api/admin/workers/' + userId, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menghapus karyawan!');
    alert(data.message);
    loadWorkersList();
  } catch (err) {
    alert('Gagal: ' + err.message);
  }
}

// Settings Cloud
function openSettingsModal() {
  document.getElementById('settingsModal').style.display = 'flex';
  loadSettings();
}

function closeSettingsModal() {
  document.getElementById('settingsModal').style.display = 'none';
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    AppState.settings = data || {};
    const compInput = document.getElementById('settingCompanyName');
    const gasInput = document.getElementById('settingGasUrl');
    if (compInput) compInput.value = AppState.settings.companyName || 'Laporan Kerja Lapangan';
    if (gasInput) gasInput.value = AppState.settings.gasWebhookUrl || '';
    updateGasStatusUI(AppState.settings.gasWebhookUrl);
  } catch (err) {
    console.warn('Gagal memuat pengaturan:', err);
  }
}

function updateGasStatusUI(url) {
  const statusBox = document.getElementById('gasStatusBox');
  const statusText = document.getElementById('gasStatusText');
  if (!statusBox || !statusText) return;
  if (url) {
    statusBox.style.background = '#f0fdf4';
    statusBox.style.border = '1px solid #86efac';
    statusText.innerHTML = '<span>🟢</span><span style="color:#166534;">Google Sheet: Terhubung & Aktif</span>';
  } else {
    statusBox.style.background = '#fef3c7';
    statusBox.style.border = '1px solid #fde047';
    statusText.innerHTML = '<span>⚠️</span><span style="color:#b45309;">Google Sheet: Belum Dikonfigurasi</span>';
  }
}

async function handleTestGasConnection() {
  const gasInput = document.getElementById('settingGasUrl');
  const url = gasInput ? gasInput.value.trim() : (AppState.settings.gasWebhookUrl || '');
  if (!url) {
    alert('Masukkan URL Webhook Google Apps Script terlebih dahulu di kolom input!');
    if (gasInput) gasInput.focus();
    return;
  }

  const btnTest = document.getElementById('btnTestGas');
  if (btnTest) {
    btnTest.disabled = true;
    btnTest.textContent = '⏳ Menguji...';
  }

  try {
    const res = await fetch('/api/tasks/test-gas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Koneksi gagal');
    alert('✅ ' + data.message);
    updateGasStatusUI(url);
  } catch (err) {
    alert('❌ Gagal menghubungi Google Apps Script:\n' + err.message + '\n\nPastikan Deployment Web App di Apps Script disetel "Who has access: Anyone".');
  } finally {
    if (btnTest) {
      btnTest.disabled = false;
      btnTest.textContent = '🔔 Tes Kirim';
    }
  }
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const companyName = document.getElementById('settingCompanyName').value.trim();
  const gasWebhookUrl = document.getElementById('settingGasUrl').value.trim();
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName, gasWebhookUrl, autoSyncGDrive: true })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menyimpan pengaturan!');
    AppState.settings = data.settings || data || {};
    updateGasStatusUI(AppState.settings.gasWebhookUrl);
    alert('Pengaturan Google Spreadsheet berhasil disimpan!');
    closeSettingsModal();
  } catch (err) {
    alert('Gagal: ' + err.message);
  }
}

// Super Admin Modal
function openSuperAdminModal() {
  document.getElementById('superAdminModal').style.display = 'flex';
}

function closeSuperAdminModal() {
  document.getElementById('superAdminModal').style.display = 'none';
}

async function handleSuperAdminChangeAdminPassword(e) {
  e.preventDefault();
  const newPassword = document.getElementById('superAdminNewAdminPw').value;
  try {
    const res = await fetch('/api/superadmin/change-admin-password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal!');
    alert(data.message);
    document.getElementById('superAdminNewAdminPw').value = '';
  } catch (err) {
    alert('Gagal: ' + err.message);
  }
}

async function handleSuperAdminResetTotal() {
  if (!confirm('PERINGATAN: Reset total akan menghapus semua riwayat tugas dan foto! Yakin?')) return;
  const conf = prompt('Ketik "RESET" untuk konfirmasi reset total:');
  if (conf !== 'RESET') { alert('Reset dibatalkan.'); return; }
  try {
    const res = await fetch('/api/superadmin/reset-total', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal!');
    alert(data.message);
    closeSuperAdminModal();
    loadAdminDashboard();
  } catch (err) {
    alert('Gagal: ' + err.message);
  }
}

async function handleSuperAdminResetSheet() {
  if (!confirm('Kosongkan semua baris data di Google Sheets?')) return;
  try {
    const res = await fetch('/api/superadmin/reset-sheet', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal!');
    alert(data.message);
  } catch (err) {
    alert('Gagal: ' + err.message);
  }
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Window globals for inline onclicks
window.switchToTask = switchToTask;
window.removeCapturedPhoto = removeCapturedPhoto;
window.viewMediaDetail = viewMediaDetail;
window.openResetPwModal = openResetPwModal;
window.handleDeleteWorker = handleDeleteWorker;
window.handleAdminDeleteTask = handleAdminDeleteTask;
