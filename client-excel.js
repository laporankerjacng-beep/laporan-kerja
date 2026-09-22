/**
 * Generator File Excel (.xlsx) Sisi Klien (Browser)
 * Memungkinkan ekspor Excel dengan FOTO TERTANAM LANGSUNG DI DALAM SEL
 * bahkan saat aplikasi dijalankan 100% statis tanpa VPS!
 */

async function exportTasksToExcelClient(tasks, companyName = 'LAPORAN KERJA LAPANGAN') {
  if (typeof ExcelJS === 'undefined') {
    alert('Library ExcelJS sedang dimuat, silakan coba 2 detik lagi...');
    return;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistem Laporan Kerja Lapangan';
  workbook.created = new Date();

  const currentDateStr = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Helper konversi URL (relatif/base64) ke base64 image untuk disematkan
  async function resolveImageBase64(photoPath) {
    if (!photoPath) return null;
    if (photoPath.startsWith('data:image')) {
      return photoPath;
    }
    try {
      const res = await fetch(photoPath);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('Gagal memuat gambar untuk Excel:', e);
      return null;
    }
  }

  // Fungsi pembuat lembar kerja
  async function buildWorksheet(sheetTitle, sheetTasks, isIndividual = false) {
    const safeTitle = sheetTitle.replace(/[\\/?*\[\]:]/g, ' ').substring(0, 31).trim() || 'Laporan';
    const worksheet = workbook.addWorksheet(safeTitle, {
      views: [{ showGridLines: true }]
    });

    // 1. Header Judul Laporan
    worksheet.mergeCells('A1:L1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = companyName.toUpperCase();
    titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 32;

    worksheet.mergeCells('A2:L2');
    const subCell = worksheet.getCell('A2');
    subCell.value = isIndividual 
      ? `LAPORAN KERJA INDIVIDU: ${sheetTitle.toUpperCase()}  |  Tanggal: ${currentDateStr}`
      : `REKAPITULASI SELURUH AKTIVITAS PEKERJA LAPANGAN  |  Tanggal: ${currentDateStr}`;
    subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FFFFFFFF' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(2).height = 24;

    worksheet.getRow(3).height = 8;

    // 2. Kolom Header
    const headerRow = worksheet.getRow(4);
    headerRow.height = 28;

    const cols = [
      { header: 'NO', width: 6 },
      { header: 'TANGGAL', width: 14 },
      { header: 'NAMA PEKERJA', width: 22 },
      { header: 'JAM MULAI', width: 13 },
      { header: 'JAM SELESAI', width: 13 },
      { header: 'DURASI', width: 14 },
      { header: 'AKTIVITAS / CATATAN KERJA', width: 34 },
      { header: 'FOTO MULAI (BESAR)', width: 48 },
      { header: 'FOTO PROGRESS (BESAR)', width: 48 },
      { header: 'FOTO SELESAI (BESAR)', width: 48 },
      { header: 'BUKTI VIDEO REKAMAN', width: 34 },
      { header: 'STATUS', width: 14 }
    ];

    cols.forEach((col, idx) => {
      worksheet.getColumn(idx + 1).width = col.width;
      const cell = headerRow.getCell(idx + 1);
      cell.value = col.header;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } }
      };
    });

    let rowNum = 5;
    for (let i = 0; i < sheetTasks.length; i++) {
      const task = sheetTasks[i];
      const row = worksheet.getRow(rowNum);
      row.height = 270; // Ruang lapang & besar untuk foto

      const isEven = i % 2 === 0;
      const rowBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

      let durationStr = '-';
      if (task.durationMinutes) {
        const hours = Math.floor(task.durationMinutes / 60);
        const mins = task.durationMinutes % 60;
        durationStr = hours > 0 ? `${hours} jam ${mins} mnt` : `${mins} mnt`;
      } else if (task.status === 'completed') {
        durationStr = 'Selesai';
      } else {
        durationStr = 'Sedang Berjalan';
      }

      const activityText = task.taskName 
        ? `${task.taskName}\nCatatan: ${task.notes || '-'}`
        : (task.notes || '-');

      row.getCell(1).value = i + 1;
      row.getCell(2).value = task.date || '-';
      row.getCell(3).value = task.workerName || '-';
      row.getCell(4).value = task.startTime || '-';
      row.getCell(5).value = task.endTime || '-';
      row.getCell(6).value = durationStr;
      row.getCell(7).value = activityText;
      row.getCell(8).value = '';
      row.getCell(9).value = '';
      row.getCell(10).value = '';
      row.getCell(11).value = '';
      row.getCell(12).value = task.status === 'completed' ? 'SELESAI' : 'PROSES';

      for (let c = 1; c <= 12; c++) {
        const cell = row.getCell(c);
        cell.font = { name: 'Calibri', size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
        cell.alignment = { horizontal: c === 7 ? 'left' : 'center', vertical: 'middle', wrapText: true };
      }

      // Status style
      const stCell = row.getCell(12);
      const isDone = task.status === 'completed';
      stCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: isDone ? 'FF15803D' : 'FFB45309' } };
      stCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isDone ? 'FFDCFCE7' : 'FFFEF3C7' } };

      // Sematkan Foto Mulai (Kolom 8)
      const startPic = (task.startPhotos && task.startPhotos[0]) || task.startPhoto;
      if (startPic) {
        const base64 = await resolveImageBase64(startPic);
        if (base64) {
          const imgId = workbook.addImage({ base64: base64, extension: 'jpeg' });
          worksheet.addImage(imgId, {
            tl: { col: 7 + 0.03, row: rowNum - 1 + 0.03 },
            br: { col: 8 - 0.03, row: rowNum - 0.03 },
            editAs: 'oneCell'
          });
        }
      } else {
        row.getCell(8).value = '[Tidak ada foto]';
        row.getCell(8).font = { size: 9, italic: true, color: { argb: 'FF94A3B8' } };
      }

      // Sematkan Foto Progress (Kolom 9)
      const progPath = task.progressPhotos && task.progressPhotos[0] 
        ? (task.progressPhotos[0].photoUrl || task.progressPhotos[0]) 
        : null;
      if (progPath) {
        const base64 = await resolveImageBase64(progPath);
        if (base64) {
          const imgId = workbook.addImage({ base64: base64, extension: 'jpeg' });
          worksheet.addImage(imgId, {
            tl: { col: 8 + 0.03, row: rowNum - 1 + 0.03 },
            br: { col: 9 - 0.03, row: rowNum - 0.03 },
            editAs: 'oneCell'
          });
        }
      } else {
        row.getCell(9).value = '-';
        row.getCell(9).font = { size: 9, italic: true, color: { argb: 'FF94A3B8' } };
      }

      // Sematkan Foto Selesai (Kolom 10)
      const finishPic = (task.finishPhotos && task.finishPhotos[0]) || task.finishPhoto;
      if (finishPic) {
        const base64 = await resolveImageBase64(finishPic);
        if (base64) {
          const imgId = workbook.addImage({ base64: base64, extension: 'jpeg' });
          worksheet.addImage(imgId, {
            tl: { col: 9 + 0.03, row: rowNum - 1 + 0.03 },
            br: { col: 10 - 0.03, row: rowNum - 0.03 },
            editAs: 'oneCell'
          });
        }
      } else {
        row.getCell(10).value = isDone ? '[Tidak ada foto]' : '[Belum Selesai]';
        row.getCell(10).font = { size: 9, italic: true, color: { argb: 'FF94A3B8' } };
      }

      // Bukti Video (Kolom 11)
      let videoLink = task.videoUrl || 
        (task.progressPhotos && task.progressPhotos.find(p => p.videoUrl)?.videoUrl) || 
        task.finishVideo || task.startVideo;

      if (videoLink) {
        let fullVideoUrl = videoLink;
        if (videoLink.startsWith('/') && window.location && window.location.origin) {
          fullVideoUrl = `${window.location.origin}${videoLink}`;
        }
        row.getCell(11).value = {
          text: '🎬 KLIK DISINI UNTUK\nMEMUTAR VIDEO BUKTI\n(Klik Link)',
          hyperlink: fullVideoUrl
        };
        row.getCell(11).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1D4ED8' }, underline: true };
        row.getCell(11).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFEFF6FF' }
        };
        row.getCell(11).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      } else {
        row.getCell(11).value = '[Tidak Ada Video]';
        row.getCell(11).font = { size: 9, italic: true, color: { argb: 'FF94A3B8' } };
      }

      rowNum++;
    }
    }
  }

  // 1. Tab Ringkasan Semua
  await buildWorksheet('Ringkasan Semua', tasks, false);

  // 2. Tab Khusus Per Karyawan (Contoh: Tab "Liston", Tab "Budi")
  const groups = {};
  tasks.forEach(t => {
    const name = (t.workerName || 'Lainnya').trim();
    if (!groups[name]) groups[name] = [];
    groups[name].push(t);
  });

  for (const workerName of Object.keys(groups)) {
    await buildWorksheet(workerName, groups[workerName], true);
  }

  // Unduh file langsung di browser
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Laporan_Kerja_Harian_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

window.exportTasksToExcelClient = exportTasksToExcelClient;
