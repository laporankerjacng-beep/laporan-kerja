/**
 * Modul Kamera Khusus Lapangan:
 * 1. Mengunci hanya akses kamera langsung (In-App Viewfinder) - TIDAK BISA BUKA GALERI.
 * 2. Mencetak Watermark Otomatis (Waktu real-time, Nama Pekerja, Tahap Pekerjaan, Catatan, GPS).
 * 3. Merekam video bukti langsung via MediaRecorder.
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

    // Mulai pelacakan GPS di latar belakang
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
   * Buka stream kamera belakang (environment) langsung di elemen video
   */
  async startCamera(videoElement) {
    this.videoElement = videoElement;
    if (this.stream) {
      this.stopCamera();
    }

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' }, // Prioritaskan kamera belakang ponsel
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();
      return true;
    } catch (err) {
      console.warn('Gagal dengan ideal constraints, mencoba fallback generic kamera:', err);
      // Fallback 1: Coba kamera standar tanpa facingMode
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        this.videoElement.srcObject = this.stream;
        await this.videoElement.play();
        return true;
      } catch (errFallback) {
        throw new Error('Tidak dapat membuka kamera perangkat: ' + errFallback.message);
      }
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
   * Jepret foto dari video dan cetak Watermark Otomatis ke dalam Canvas
   * @param {Object} meta - { workerName, stage, note, taskName }
   * @returns {String} DataUrl Base64 JPEG ber-watermark
   */
  capturePhotoWithWatermark(meta = {}) {
    if (!this.videoElement || !this.stream) {
      throw new Error('Kamera belum aktif!');
    }

    const video = this.videoElement;
    const canvas = document.createElement('canvas');
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 1. Gambar frame video asli ke canvas
    ctx.drawImage(video, 0, 0, width, height);

    // 2. Format Informasi Watermark
    const now = new Date();
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    
    const dayName = days[now.getDay()];
    const dateFormatted = `${dayName}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
    const timeFormatted = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';
    
    const worker = meta.workerName || 'Pekerja Lapangan';
    const stage = (meta.stage || 'PROGRESS').toUpperCase();
    const taskTitle = meta.taskName || 'Dokumentasi Kerja';
    const noteText = meta.note || 'Pengerjaan lapangan';
    
    let gpsStr = 'GPS: Akurasi Standar';
    if (this.currentGps) {
      gpsStr = `GPS: ${this.currentGps.lat}, ${this.currentGps.lng} (±${this.currentGps.accuracy}m)`;
    }

    // 3. Gambar Banner Watermark di Bagian Bawah Gambar
    const bannerHeight = Math.max(120, Math.round(height * 0.22));
    const bannerY = height - bannerHeight;

    // Background gradasi gelap transparan agar teks sangat tajam & jelas dibaca
    const grad = ctx.createLinearGradient(0, bannerY, 0, height);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.75)'); // Slate 900 semi-transparan
    grad.addColorStop(0.3, 'rgba(15, 23, 42, 0.95)');
    grad.addColorStop(1, 'rgba(10, 15, 29, 0.98)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, bannerY, width, bannerHeight);

    // Garis aksen warna penanda tahap di atas banner
    let stageColor = '#3B82F6'; // Blue untuk Mulai
    if (stage.includes('SELESAI') || stage.includes('SIAP')) stageColor = '#10B981'; // Emerald Green untuk Selesai
    if (stage.includes('PROGRESS')) stageColor = '#F59E0B'; // Amber untuk Progress

    ctx.fillStyle = stageColor;
    ctx.fillRect(0, bannerY, width, 6);

    // 4. Render Teks Watermark
    ctx.textBaseline = 'top';

    // Badge Tahap (Kotak Rounded)
    const paddingX = Math.round(width * 0.03);
    let currentY = bannerY + 16;

    ctx.fillStyle = stageColor;
    const badgeText = ` ${stage} `;
    ctx.font = `bold ${Math.round(bannerHeight * 0.14)}px 'Plus Jakarta Sans', Arial, sans-serif`;
    const badgeWidth = ctx.measureText(badgeText).width + 16;
    const badgeHeight = Math.round(bannerHeight * 0.17);

    // Gambar rounded rect badge (dengan fallback jika browser belum support roundRect)
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(paddingX, currentY, badgeWidth, badgeHeight, 6);
    } else {
      ctx.rect(paddingX, currentY, badgeWidth, badgeHeight);
    }
    ctx.fill();

    // Teks di dalam badge
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(badgeText, paddingX + 8, currentY + 3);

    // Waktu & Tanggal di samping badge
    ctx.fillStyle = '#F8FAFC';
    ctx.font = `bold ${Math.round(bannerHeight * 0.15)}px 'Plus Jakarta Sans', Arial, sans-serif`;
    ctx.fillText(`🕒 ${dateFormatted} | ${timeFormatted}`, paddingX + badgeWidth + 14, currentY + 3);

    // Baris 2: Nama Pekerja & GPS
    currentY += badgeHeight + 10;
    ctx.fillStyle = '#E2E8F0';
    ctx.font = `600 ${Math.round(bannerHeight * 0.13)}px 'Plus Jakarta Sans', Arial, sans-serif`;
    ctx.fillText(`👷 Pekerja: ${worker}   |   📍 ${gpsStr}`, paddingX, currentY);

    // Baris 3: Pekerjaan & Catatan
    currentY += Math.round(bannerHeight * 0.16);
    ctx.fillStyle = '#38BDF8'; // Sky blue
    ctx.font = `bold ${Math.round(bannerHeight * 0.14)}px 'Plus Jakarta Sans', Arial, sans-serif`;
    ctx.fillText(`📌 ${taskTitle}`, paddingX, currentY);

    if (noteText && noteText !== taskTitle) {
      currentY += Math.round(bannerHeight * 0.16);
      ctx.fillStyle = '#CBD5E1';
      ctx.font = `normal ${Math.round(bannerHeight * 0.12)}px 'Plus Jakarta Sans', Arial, sans-serif`;
      // Potong teks jika terlalu panjang
      const maxChars = Math.floor((width - paddingX * 2) / (bannerHeight * 0.08));
      const truncatedNote = noteText.length > maxChars ? noteText.substring(0, maxChars) + '...' : noteText;
      ctx.fillText(`💬 "${truncatedNote}"`, paddingX, currentY);
    }

    // 5. Kembalikan dataURL JPEG berkualitas tinggi
    return canvas.toDataURL('image/jpeg', 0.88);
  }

  /**
   * Deteksi format video yang didukung oleh browser/ponsel
   */
  getBestMimeType() {
    const candidates = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=avc1',
      'video/mp4'
    ];
    for (const type of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  }

  /**
   * Rekam Video Singkat dari stream kamera
   */
  startVideoRecording(onUpdateSeconds, onMaxDuration) {
    if (!this.stream) throw new Error('Kamera belum aktif!');
    this.recordedChunks = [];
    this.recordSeconds = 0;
    this.onMaxDurationReached = onMaxDuration;

    const mimeType = this.getBestMimeType();
    const options = mimeType ? { mimeType } : {};
    this.recordedMimeType = mimeType || 'video/webm';

    try {
      this.mediaRecorder = new MediaRecorder(this.stream, options);
    } catch (e) {
      console.warn('Gagal dengan opsi mimeType, mencoba default MediaRecorder:', e);
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.recordedMimeType = this.mediaRecorder.mimeType || 'video/webm';
    }

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.start(1000);
    this.isRecording = true;

    this.recordTimer = setInterval(() => {
      this.recordSeconds++;
      if (onUpdateSeconds) onUpdateSeconds(this.recordSeconds);
      // Batasi maksimal 30 detik agar ringan di hp
      if (this.recordSeconds >= 30) {
        if (this.onMaxDurationReached) {
          this.onMaxDurationReached();
        }
      }
    }, 1000);
  }

  stopVideoRecording(meta = {}) {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.isRecording) {
        resolve(null);
        return;
      }

      clearInterval(this.recordTimer);
      this.isRecording = false;

      // Ambil frame cuplikan foto ber-watermark untuk thumbnail video
      let thumbnailBase64 = null;
      try {
        thumbnailBase64 = this.capturePhotoWithWatermark(meta);
      } catch (e) {
        console.warn('Gagal mengambil thumbnail video:', e);
      }

      this.mediaRecorder.onstop = () => {
        const mime = this.recordedMimeType || 'video/webm';
        const blob = new Blob(this.recordedChunks, { type: mime });
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve({
            dataUrl: reader.result,
            blob: blob,
            mimeType: mime,
            duration: this.recordSeconds,
            thumbnailBase64: thumbnailBase64
          });
        };
        reader.readAsDataURL(blob);
      };

      try {
        this.mediaRecorder.stop();
      } catch (err) {
        console.warn('Error saat stop mediaRecorder:', err);
        resolve(null);
      }
    });
  }
}

// Ekspor instance global
window.cameraManager = new CameraManager();
