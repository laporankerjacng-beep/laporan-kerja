# 📋 PANDUAN LENGKAP: APLIKASI LAPORAN KERJA LAPANGAN

Solusi khusus untuk masalah pelaporan kerja harian: pekerja ("abang-abang") cukup foto lewat HP (waktu & nama ter-cap otomatis, tidak bisa ambil dari galeri), dan PIC/Bos bisa langsung unduh file **Excel (.xlsx) dengan foto tertanam langsung di dalam sel** atau tersambung otomatis ke **Google Drive & Google Spreadsheet**.

---

## 🚀 1. CARA MENJALANKAN APLIKASI DI LAPTOP
Cukup klik ganda (double-click) file:
👉 **`JALANKAN_APLIKASI.bat`**

Browser akan otomatis terbuka menampilkan aplikasi di alamat:
`http://localhost:3000`

---

## 📱 2. CARA MEMBUKA APLIKASI DARI HP PEKERJA (ABANG-ABANG)
1. Pastikan HP pekerja dan Laptop Anda tersambung ke **jaringan WiFi / Hotspot yang sama**.
2. Cari tahu alamat IP laptop Anda (contoh: `192.168.1.15`).
3. Buka browser di HP pekerja (Google Chrome/Safari), lalu ketik:
   `http://192.168.1.15:3000` (sesuaikan dengan IP laptop Anda).
4. Di browser HP, klik menu titik tiga > pilih **"Tambahkan ke Layar Utama" (Add to Home Screen)** agar tampil seperti aplikasi native di HP!

---

## 🔐 3. AKUN & TINGKATAN AKSES (DIENKRIPSI BCRYPT)
Semua kata sandi di sistem ini dienkripsi secara aman dengan algoritma **bcrypt**:

1. **Akun Super Admin (Akses Tertinggi & Kendali Penuh)**:
   - **Username**: `superadmin`
   - **Password**: `admin123`
   - *Fasilitas: Kontrol semua fitur, ubah kata sandi Admin utama, dan **2 Tombol Reset** (Reset Total database & foto lokal, serta Reset Sheet Google Spreadsheet).*

2. **Akun PIC / Supervisor (Admin Utama Lapangan)**:
   - **Username**: `admin`
   - **Password**: `amazon9972`
   - *Fasilitas: Mendaftarkan & kelola akun karyawan baru, ubah kata sandi karyawan, pantau rekap kerja harian, download Excel berfoto tertanam (siklus 01:00 - 01:00).*

3. **Akun Pekerja Lapangan (Akses HP)**:
   - Didaftarkan langsung oleh Admin / Superadmin melalui menu **"👥 Kelola Karyawan"** untuk mencegah karyawan lupa sandi atau salah ketik.
   - Dilengkapi fitur **Lihat / Sembunyikan Kata Sandi (👁️)** di halaman login dan kelola akun.

---

## 📸 4. CARA KERJA KAMERA (WAJIB KETERANGAN & TANPA GALERI)
- **Wajib Isi Penjelasan / Keterangan:** Sebelum tombol foto atau rekam video aktif, pekerja **wajib** mengetikkan keterangan atau penjelasan pekerjaan yang sedang dikerjakan. Tombol foto akan otomatis terkunci jika keterangan masih kosong.
- **Tanpa Akses Galeri:** Kamera bekerja langsung (*In-App Viewfinder*) tanpa tombol pilih dari galeri HP, menjamin kejujuran foto di lapangan.
- **Watermark Permanen Otomatis:** Setiap foto secara instan dicap permanen dengan:
  - 🕒 **Hari, Tanggal, & Jam Real-Time**
  - 👷 **Nama Pekerja**
  - 🏷️ **Tahap Pekerjaan** (*MULAI*, *PROGRESS*, atau *SELESAI*)
  - 📝 **Catatan / Penjelasan Pekerjaan**
  - 📍 **Koordinat GPS & Akurasi Lokasi**
  - 🕒 **Hari, Tanggal, & Jam Real-Time** (contoh: *Senin, 21 September 2026, 10:15:30 WIB*)
  - 👷 **Nama Pekerja** (contoh: *Abang Liston*)
  - 🏷️ **Tahap Pekerjaan** (*[MULAI PEKERJAAN]*, *[PROGRESS]*, atau *[PEKERJAAN SELESAI]*)
  - 📝 **Catatan Pekerjaan** (contoh: *Membersihkan ruangan lantai 2*)
  - 📍 **Koordinat GPS & Akurasi Lokasi**

---

## 📊 5. EXCEL KHUSUS BOS (FOTO LANGSUNG DI DALAM KOTAK SEL)
Bos tidak perlu repot klik link atau buka browser lagi:
1. Masuk sebagai `admin` di laptop atau tablet.
2. Di toolbar atas, klik tombol hijau: **"📥 Download Excel (.xlsx) Lengkap Foto"**.
3. File Excel yang terunduh memiliki format rapi:
   - **Tab 1: `Ringkasan Semua`** (Semua aktivitas seluruh pekerja pada tanggal tersebut).
   - **Tab 2, 3, dst: `Tab Nama Karyawan`** (Tab khusus si Liston, Tab khusus si Budi, dll).
   - Di setiap baris, **Foto Mulai, Foto Progress, dan Foto Selesai tertanam visual langsung di dalam kotak sel Excel** dengan tinggi baris yang proporsional!

---

## ☁️ 6. INTEGRASI GOOGLE DRIVE & SPREADSHEET (100% GRATIS TANPA SEWA VPS)
Jika kantor ingin setiap laporan pekerja otomatis masuk ke Google Spreadsheet & Google Drive kantor:
1. Buka Google Spreadsheet baru di browser Anda: [sheets.google.com](https://sheets.google.com)
2. Klik menu **Ekstensi > Apps Script**.
3. Buka file `google-apps-script/Code.gs` di folder ini, salin seluruh isinya, lalu tempel di editor Google.
4. Klik tombol **Simpan (Save)**.
5. Klik tombol biru **Terapkan (Deploy) > Deployment Baru**.
6. Pilih jenis: **Aplikasi Web (Web App)**.
   - Akses: **Siapa Saja (Anyone)** -> *Wajib dipilih agar bisa menerima laporan*.
7. Klik **Terapkan**, lalu salin URL Aplikasi Web (akhiran `/exec`).
8. Di aplikasi ini, klik menu **"Pengaturan Cloud"** di dashboard PIC, lalu tempel URL tersebut dan klik Simpan!
9. Selesai! Foto akan otomatis masuk ke folder Google Drive dan baris data akan tertulis di Google Sheets lengkap dengan rumus gambar visual `=IMAGE()`.
