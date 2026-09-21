const ExcelJS = require('exceljs');
const path = require('path');

async function check() {
  const wb = new ExcelJS.Workbook();
  const filePath = path.join(__dirname, 'uploads', 'Test_Laporan_Kerja.xlsx');
  await wb.xlsx.readFile(filePath);
  console.log('=== VERIFIKASI FILE EXCEL (.XLSX) ===');
  console.log('Total Tab Lembar Kerja:', wb.worksheets.length);
  wb.worksheets.forEach((ws, idx) => {
    const images = ws.getImages();
    console.log(`Tab [${idx + 1}]: "${ws.name}"`);
    console.log(`  - Jumlah Baris: ${ws.rowCount}`);
    console.log(`  - Gambar Tertanam di Dalam Sel: ${images.length} gambar`);
  });
  console.log('====================================');
}

check().catch(console.error);
