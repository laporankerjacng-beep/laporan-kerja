/**
 * Modul Kamera Khusus Lapangan:
 * 1. Akses kamera langsung (In-App Viewfinder) - TIDAK BISA BUKA GALERI.
 * 2. Fitur Tukar Kamera Depan (Selfie) & Belakang (Environment).
 * 3. Watermark Otomatis: Waktu real-time WIB, Nama Pekerja, Tahap, Catatan, GPS.
 * 4. Perekaman Video Bukti langsung via MediaRecorder.
 */

class CameraManager {
  constructor() {
    this.stream = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.recordTimer = null;
    this.recordSeconds = 0;
    this.currentGps = null;
    this.videoElement = null;
    this.canvasElement = null;
    this.currentFacingMode = 'environment'; // 'environment' (belakang) atau 'user' (depan/selfie)

    // Inisialisasi GPS di latar belakang
    this.initGps();
  }

  initGps() {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.currentGps = {
            lat: pos.coords.latitude.toFixed(5),
            lng: pos.coords.longitude.toFixed(5),
            accuracy: Math.round(pos.coords.accuracy)
          };
        },
        (err) => {
          console.warn('GPS tidak dapat diakses:', err.message);
          this.currentGps = null;
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    }
  }

  /**
   * Buka stream kamera sesuai facingMode aktif
   */
  async startCamera(videoElement) {
    this.videoElement = videoElement;
    if (this.stream) {
      this.stopCamera();
    }

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: this.currentFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.stream;
      this.applyMirrorEffect();
      await this.videoElement.play();
      return true;
    } catch (err) {
      console.warn('Gagal dengan ideal constraints, mencoba fallback kamera standar:', err);
      try {
        const fallbackConstraints = {
          video: { facingMode: this.currentFacingMode },
          audio: false
        };
        this.stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        this.videoElement.srcObject = this.stream;
        this.applyMirrorEffect();
        await this.videoElement.play();
        return true;
      } catch (err2) {
        // Fallback generic tanpa facingMode
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          this.videoElement.srcObject = this.stream;
          this.applyMirrorEffect();
          await this.videoElement.play();
          return true;
        } catch (errFallback) {
          throw new Error('Tidak dapat membuka kamera perangkat: ' + errFallback.message);
        }
      }
    }
  }

  /**
   * Balik kamera antara selfie (depan) dan belakang
   */
  async flipCamera() {
    this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
    if (this.videoElement) {
      return await this.startCamera(this.videoElement);
    }
    return false;
  }

  /**
   * Atur efek cermin pada viewfinder saat selfie agar terasa natural
   */
  applyMirrorEffect() {
    if (!this.videoElement) return;
    if (this.currentFacingMode === 'user') {
      this.videoElement.style.transform = 'scaleX(-1)';
      this.videoElement.style.webkitTransform = 'scaleX(-1)';
    } else {
      this.videoElement.style.transform = 'none';
      this.videoElement.style.webkitTransform = 'none';
    }
  }

  /**
   * Hentikan stream kamera
   */
  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  /**
   * Jepret foto dari video dan cetak Watermark Otomatis ke Canvas
   * @param {Object} meta - { workerName, stage, note, taskName }
   * @returns {String} DataUrl Base64 JPEG ber-watermark
   */
  capturePhotoWithWatermark(meta = {}) {
    if (!this.videoElement || !this.stream) {
      throw new Error('Kamera belum aktif!');
    }

    const video = this.videoElement;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Jika mode selfie, kita gambar cermin agar foto cocok dengan yang dilihat pengguna di layar
    if (this.currentFacingMode === 'user') {
      ctx.save();
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, width, height);
      ctx.restore();
    } else {
      ctx.drawImage(video, 0, 0, width, height);
    }

    // Gambar watermark otomatis (TIDAK TERBALIK karena digambar setelah restore)
    this.drawWatermark(ctx, width, height, meta);

    return canvas.toDataURL('image/jpeg', 0.85);
  }

  /**
   * Cetak panel watermark semi-transparan dengan teks rapi dan terbaca jelas
   */
  drawWatermark(ctx, width, height, meta) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';
    const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Panel bawah untuk watermark
    const panelHeight = Math.max(120, Math.round(height * 0.19));
    const panelY = height - panelHeight;

    // Gradient background gelap transparan
    const grad = ctx.createLinearGradient(0, panelY, 0, height);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.0)');
    grad.addColorStop(0.2, 'rgba(15, 23, 42, 0.78)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, panelY, width, panelHeight);

    // Garis aksen status di batas atas panel
    ctx.fillStyle = meta.stageColor || '#38bdf8';
    ctx.fillRect(0, panelY + Math.round(panelHeight * 0.2), width, 4);

    // Font skala proporsional
    const baseFontSize = Math.max(13, Math.round(height * 0.024));
    const titleFontSize = Math.max(16, Math.round(height * 0.032));
    const startX = 24;
    let textY = panelY + Math.round(panelHeight * 0.42);

    // Baris 1: Stage / Tahap Pekerjaan & Waktu WIB
    ctx.font = `bold ${titleFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = meta.stageColor || '#38bdf8';
    const stageBadge = `[ ${meta.stage || 'DOKUMENTASI'} ]`;
    ctx.fillText(stageBadge, startX, textY);

    const stageWidth = ctx.measureText(stageBadge).width;
    ctx.font = `bold ${titleFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(` ${timeStr} • ${dateStr}`, startX + stageWidth, textY);

    // Baris 2: Nama Pekerja & Pekerjaan
    textY += Math.round(baseFontSize * 1.5);
    ctx.font = `600 ${baseFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = '#f8fafc';
    const workerText = `Pekerja: ${meta.workerName || 'Petugas Lapangan'}  |  Tugas: ${meta.taskName || 'Operasional Lapangan'}`;
    ctx.fillText(workerText, startX, textY);

    // Baris 3: Catatan Aktivitas
    if (meta.note) {
      textY += Math.round(baseFontSize * 1.4);
      ctx.font = `normal ${baseFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = '#fde047'; // Kuning terang agar kontras
      const noteText = `Ket: "${meta.note}"`;
      ctx.fillText(noteText.substring(0, 110), startX, textY);
    }

    // Baris 4: Koordinat GPS (jika tersedia)
    if (this.currentGps) {
      textY += Math.round(baseFontSize * 1.3);
      ctx.font = `normal ${Math.round(baseFontSize * 0.88)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`GPS: ${this.currentGps.lat}, ${this.currentGps.lng} (Akurasi: ±${this.currentGps.accuracy}m)`, startX, textY);
    }
  }

  /**
   * Mulai Perekaman Video Bukti Langsung
   */
  startVideoRecording(onTimeUpdate, onMaxReached) {
    if (!this.stream) throw new Error('Kamera belum siap merekam!');
    if (this.isRecording) return;

    this.recordedChunks = [];
    const mimeTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4'
    ];
    let selectedMime = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || '';

    try {
      this.mediaRecorder = selectedMime
        ? new MediaRecorder(this.stream, { mimeType: selectedMime })
        : new MediaRecorder(this.stream);
    } catch (e) {
      this.mediaRecorder = new MediaRecorder(this.stream);
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.mediaRecorder.start(500); // chunk setiap 500ms
    this.isRecording = true;
    this.recordSeconds = 0;

    this.recordTimer = setInterval(() => {
      this.recordSeconds++;
      if (typeof onTimeUpdate === 'function') {
        onTimeUpdate(this.recordSeconds);
      }
      // Batasi perekaman maksimal 45 detik agar ukuran wajar
      if (this.recordSeconds >= 45) {
        this.stopVideoRecording();
        if (typeof onMaxReached === 'function') onMaxReached();
      }
    }, 1000);
  }

  /**
   * Hentikan Perekaman Video Bukti
   * @returns {Promise<Blob>} Video Blob hasil rekaman
   */
  stopVideoRecording() {
    return new Promise((resolve) => {
      if (!this.isRecording || !this.mediaRecorder) {
        resolve(null);
        return;
      }

      if (this.recordTimer) {
        clearInterval(this.recordTimer);
        this.recordTimer = null;
      }
      this.isRecording = false;

      this.mediaRecorder.onstop = () => {
        const mime = this.mediaRecorder.mimeType || 'video/webm';
        const blob = new Blob(this.recordedChunks, { type: mime });
        this.recordedChunks = [];
        resolve(blob);
      };

      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    });
  }
}

// Inisialisasi instance tunggal global
window.cameraManager = new CameraManager();
