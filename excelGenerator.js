const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

/**
 * Generate multi-tab Excel workbook with direct embedded images in cells.
 * - Tab 1: Ringkasan Semua Pekerja
 * - Tab 2+: 1 Tab sheet per masing-masing nama karyawan (e.g. Liston, Budi, dll)
 * 
 * @param {Array} tasks - Array of task objects
 * @param {Object} options - { companyName, dateFilter, workerFilter }
 * @returns {Promise<Buffer>}
 */
async function generateDailyExcelReport(tasks, options = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistem Laporan Kerja Lapangan';
  workbook.created = new Date();

  const companyName = options.companyName || 'LAPORAN KERJA LAPANGAN';
  const currentDateStr = options.dateFilter || new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Helper untuk menambahkan gambar aman ke sel
  function tryAddImageToCell(worksheet, filePath, colIndex, rowIndex) {
    if (!filePath) return false;
    try {
      // Periksa path absolut lokal atau relatif
      let fullPath = filePath;
      const cleanRel = filePath.replace(/^[\\\/]+/, '');
      const localCandidate = path.join(__dirname, cleanRel);
      if (fs.existsSync(localCandidate)) {
        fullPath = localCandidate;
      } else if (!fs.existsSync(fullPath)) {
        return false;
      }

      if (fs.existsSync(fullPath)) {
        const ext = path.extname(fullPath).toLowerCase().replace('.', '') || 'jpeg';
        const imageId = workbook.addImage({
          filename: fullPath,
          extension: ext === 'png' ? 'png' : 'jpeg'
        });

        // Sematkan gambar di dalam batas sel (dengan margin 4%)
        worksheet.addImage(imageId, {
          tl: { col: colIndex - 1 + 0.05, row: rowIndex - 1 + 0.05 },
          br: { col: colIndex - 0.05, row: rowIndex - 0.05 },
          editAs: 'oneCell'
        });
        return true;
      }
    } catch (err) {
      console.warn(`[Excel] Gagal menyematkan gambar ${filePath}:`, err.message);
    }
    return false;
  }

  // Helper untuk membangun satu sheet laporan
  async function buildSheet(sheetTitle, sheetTasks, isIndividual = false) {
    // Bersihkan nama sheet (Excel max 31 karakter, no special chars : \ / ? * [ ])
    const safeSheetTitle = sheetTitle.replace(/[\\/?*\[\]:]/g, ' ').substring(0, 31).trim() || 'Laporan';
    const worksheet = workbook.addWorksheet(safeSheetTitle, {
      views: [{ showGridLines: true }]
    });

    // 1. Judul Header Atas
    worksheet.mergeCells('A1:L1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `${companyName.toUpperCase()}`;
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' } // Slate 900
    };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 34;

    // Subtitle
    worksheet.mergeCells('A2:L2');
    const subCell = worksheet.getCell('A2');
    subCell.value = isIndividual 
      ? `LAPORAN KERJA INDIVIDU: ${sheetTitle.toUpperCase()}  |  Tanggal: ${currentDateStr}`
      : `REKAPITULASI SELURUH AKTIVITAS PEKERJA LAPANGAN  |  Tanggal: ${currentDateStr}`;
    subCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FFFFFFFF' } };
    subCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' } // Slate 800
    };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(2).height = 26;

    // Baris kosong
    worksheet.getRow(3).height = 10;

    // 2. Definisi Kolom Tabel (Header)
    const headerRow = worksheet.getRow(4);
    headerRow.height = 30;

    const columnsConfig = [
      { key: 'no', header: 'NO', width: 6 },
      { key: 'date', header: 'TANGGAL', width: 14 },
      { key: 'workerName', header: 'NAMA PEKERJA', width: 20 },
      { key: 'startTime', header: 'JAM MULAI', width: 12 },
      { key: 'endTime', header: 'JAM SELESAI', width: 12 },
      { key: 'duration', header: 'DURASI', width: 14 },
      { key: 'notes', header: 'AKTIVITAS / CATATAN KERJA', width: 32 },
      { key: 'startPhoto', header: 'FOTO MULAI (BESAR)', width: 38 },
      { key: 'progressPhoto', header: 'FOTO PROGRESS (BESAR)', width: 38 },
      { key: 'finishPhoto', header: 'FOTO SELESAI (BESAR)', width: 38 },
      { key: 'videoUrl', header: 'BUKTI VIDEO', width: 26 },
      { key: 'status', header: 'STATUS', width: 14 }
    ];

    columnsConfig.forEach((col, idx) => {
      worksheet.getColumn(idx + 1).width = col.width;
      const cell = headerRow.getCell(idx + 1);
      cell.value = col.header;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' } // Royal Blue
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF94A3B8' } },
        left: { style: 'thin', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        right: { style: 'thin', color: { argb: 'FF94A3B8' } }
      };
    });

    // 3. Isi Data Baris
    let currentRowNum = 5;

    if (sheetTasks.length === 0) {
      worksheet.mergeCells(`A${currentRowNum}:L${currentRowNum}`);
      const emptyCell = worksheet.getCell(`A${currentRowNum}`);
      emptyCell.value = 'Belum ada data pekerjaan pada tanggal / filter ini.';
      emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
      emptyCell.font = { italic: true, color: { argb: 'FF64748B' } };
      worksheet.getRow(currentRowNum).height = 40;
      return;
    }

    sheetTasks.forEach((task, index) => {
      const row = worksheet.getRow(currentRowNum);
      row.height = 210; // Tinggi baris luas & besar agar foto tertanam tampil tajam, besar & jelas

      const isEven = index % 2 === 0;
      const rowBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

      // Hitung durasi tampil
      let durationStr = '-';
      if (task.durationMinutes) {
        const hours = Math.floor(task.durationMinutes / 60);
        const mins = task.durationMinutes % 60;
        durationStr = hours > 0 ? `${hours} jam ${mins} mnt` : `${mins} menit`;
      } else if (task.startTime && task.endTime) {
        durationStr = 'Selesai';
      } else {
        durationStr = 'Sedang Berjalan';
      }

      // Catatan gabungan
      const activityText = task.taskName 
        ? `${task.taskName}\n\nCatatan: ${task.notes || '-'}`
        : (task.notes || '-');

      // Status label
      const isCompleted = task.status === 'completed';
      const statusText = isCompleted ? 'SELESAI' : 'PROSES';

      // Set cell values
      row.getCell(1).value = index + 1;
      row.getCell(2).value = task.date || '-';
      row.getCell(3).value = task.workerName || '-';
      row.getCell(4).value = task.startTime || '-';
      row.getCell(5).value = task.endTime || '-';
      row.getCell(6).value = durationStr;
      row.getCell(7).value = activityText;
      row.getCell(8).value = ''; // Foto Mulai (Gambar)
      row.getCell(9).value = ''; // Foto Progress (Gambar)
      row.getCell(10).value = ''; // Foto Selesai (Gambar)
      row.getCell(11).value = ''; // Video Bukti
      row.getCell(12).value = statusText;

      // Styling setiap cell
      for (let c = 1; c <= 12; c++) {
        const cell = row.getCell(c);
        cell.font = { name: 'Calibri', size: 10 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowBg }
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
        // Alignment
        if (c === 7) {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        } else {
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        }
      }

      // Status styling
      const statusCell = row.getCell(12);
      statusCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: isCompleted ? 'FF15803D' : 'FFB45309' } };
      statusCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isCompleted ? 'FFDCFCE7' : 'FFFEF3C7' }
      };

      // 4. SEMATKAN GAMBAR ASLI LANGSUNG DI DALAM KOTAK SEL BESAR!
      // Foto Mulai -> Kolom 8 (H)
      const hasStart = tryAddImageToCell(worksheet, task.startPhoto, 8, currentRowNum);
      if (!hasStart) {
        row.getCell(8).value = '[Foto Mulai tidak ada]';
        row.getCell(8).font = { size: 9, italic: true, color: { argb: 'FF94A3B8' } };
      }

      // Foto Progress -> Kolom 9 (I)
      let progPath = null;
      if (task.progressPhotos && task.progressPhotos.length > 0) {
        progPath = task.progressPhotos[0].photoUrl || task.progressPhotos[0];
      }
      const hasProg = tryAddImageToCell(worksheet, progPath, 9, currentRowNum);
      if (!hasProg) {
        row.getCell(9).value = task.progressPhotos && task.progressPhotos.length > 0 ? '[Format foto]' : '[Tidak ada progress]';
        row.getCell(9).font = { size: 9, italic: true, color: { argb: 'FF94A3B8' } };
      }

      // Foto Selesai -> Kolom 10 (J)
      const hasFinish = tryAddImageToCell(worksheet, task.finishPhoto, 10, currentRowNum);
      if (!hasFinish) {
        row.getCell(10).value = isCompleted ? '[Foto Selesai tidak ada]' : '[Belum Selesai]';
        row.getCell(10).font = { size: 9, italic: true, color: { argb: 'FF94A3B8' } };
      }

      // Bukti Video -> Kolom 11 (K)
      const videoLink = task.videoUrl || 
        (task.progressPhotos && task.progressPhotos.find(p => p.videoUrl)?.videoUrl) || 
        task.finishVideo || task.startVideo;

      if (videoLink) {
        row.getCell(11).value = {
          text: '▶️ BUKA / PUTAR VIDEO',
          hyperlink: videoLink
        };
        row.getCell(11).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF2563EB' }, underline: true };
      } else {
        row.getCell(11).value = '-';
        row.getCell(11).font = { size: 9, italic: true, color: { argb: 'FF94A3B8' } };
      }

      currentRowNum++;
    });
  }

  // 1. BUAT TAB 1: "Ringkasan Semua"
  await buildSheet('Ringkasan Semua', tasks, false);

  // 2. KELOMPOKKAN PEKERJAAN PER NAMA KARYAWAN
  const workerGroups = {};
  tasks.forEach(t => {
    const wName = (t.workerName || 'Lainnya').trim();
    if (!workerGroups[wName]) {
      workerGroups[wName] = [];
    }
    workerGroups[wName].push(t);
  });

  // 3. BUAT TAB MASING-MASING PER KARYAWAN (Contoh Tab "Liston", Tab "Budi", dll)
  for (const workerName of Object.keys(workerGroups)) {
    const workerTasks = workerGroups[workerName];
    await buildSheet(workerName, workerTasks, true);
  }

  // Return buffer file .xlsx
  return await workbook.xlsx.writeBuffer();
}

module.exports = {
  generateDailyExcelReport
};
