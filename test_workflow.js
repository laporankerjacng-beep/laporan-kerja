const fs = require('fs');
const path = require('path');

// 1x1 transparent/colored JPEG base64
const sampleJpgBase64 = 'data:image/jpeg;base64,' + 
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

async function runTest() {
  console.log('--- Mulai Simulasi Alur Kerja Lapangan ---');

  // 1. Worker Liston: Mulai Tugas 1
  const startRes = await fetch('http://localhost:3000/api/tasks/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workerId: 'usr_worker_01',
      workerName: 'Abang Liston',
      taskName: 'Membersihkan Ruangan Lantai 2',
      notes: 'Sapu, pel lantai dan lap kaca jendela',
      photoBase64: sampleJpgBase64
    })
  });
  const startData = await startRes.json();
  const taskId = startData.task.id;
  console.log('1. Tugas Liston Dimulai:', taskId, '| Jam:', startData.task.startTime);

  // 2. Tambah Progress Tugas 1
  await fetch('http://localhost:3000/api/tasks/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      taskId: taskId,
      note: 'Lantai selesai dipel, lanjut pembersihan kaca',
      photoBase64: sampleJpgBase64
    })
  });
  console.log('2. Foto Progress Ditambahkan');

  // 3. Selesaikan Tugas 1
  const compRes = await fetch('http://localhost:3000/api/tasks/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      taskId: taskId,
      finalNotes: 'Ruangan sudah bersih, wangi dan rapi',
      photoBase64: sampleJpgBase64
    })
  });
  const compData = await compRes.json();
  console.log('3. Tugas Selesai | Durasi:', compData.task.durationMinutes, 'menit');

  // 4. Tambah Pekerja Budi
  await fetch('http://localhost:3000/api/tasks/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workerId: 'usr_worker_02',
      workerName: 'Budi Santoso',
      taskName: 'Perbaikan Kursi Rapat & Meja',
      notes: 'Pengencangan baut 6 kursi rapat',
      photoBase64: sampleJpgBase64
    })
  });
  console.log('4. Tugas Budi Santoso Dimulai');

  // 5. Uji Ekspor Excel
  console.log('5. Menguji Ekspor Excel...');
  const excelRes = await fetch('http://localhost:3000/api/tasks/export-excel');
  if (excelRes.ok) {
    const arrayBuffer = await excelRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const testExcelPath = path.join(__dirname, 'uploads', 'Test_Laporan_Kerja.xlsx');
    fs.writeFileSync(testExcelPath, buffer);
    console.log('✅ Berhasil membuat file Excel (.xlsx)! Ukuran:', buffer.length, 'bytes');
    console.log('   File tersimpan di:', testExcelPath);
  } else {
    console.error('❌ Gagal ekspor excel:', await excelRes.text());
  }
}

runTest().catch(console.error);
