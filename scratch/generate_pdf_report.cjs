const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs } = require("firebase/firestore");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const firebaseConfig = {
  apiKey: "AIzaSyCGVfZo-Hpc-wdQv21he4Js0K3RuyZ3VQ",
  authDomain: "abc-system-2c0e4.firebaseapp.com",
  projectId: "abc-system-2c0e4",
  storageBucket: "abc-system-2c0e4.firebasestorage.app",
  messagingSenderId: "1078178677076",
  appId: "1:1078178677076:web:b2953a455bd930460848c1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function formatKhmerTime(dateStr) {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}`;
}

async function run() {
  console.log("Loading Firebase data...");
  const prodSnap = await getDocs(collection(db, "products"));
  const logSnap = await getDocs(collection(db, "stock_logs"));
  const txSnap = await getDocs(collection(db, "transactions"));

  const products = {};
  prodSnap.forEach(d => {
    const data = d.data();
    products[d.id] = {
      sku: d.id,
      nameEn: data.nameEn,
      nameKh: data.nameKh || data.nameEn,
      dbStockQty: data.stockQty || 0,
      logs: []
    };
  });

  const transactions = {};
  txSnap.forEach(d => {
    transactions[d.id.toUpperCase()] = d.data();
    const invoiceNo = d.data().invoiceNo;
    if (invoiceNo) {
      transactions[invoiceNo.toUpperCase()] = d.data();
    }
  });

  logSnap.forEach(d => {
    const data = d.data();
    const sku = data.sku;
    if (!products[sku]) return;

    const qty = parseInt(data.qty) || 0;
    const desc = data.description || '';
    const dateStr = data.date || '';
    const date = new Date(dateStr);

    let staff = "Unknown";
    let isMiniApp = false;

    if (data.type === 'sale') {
      const invoiceMatch = desc.match(/(INV|TX)-[\w-]+/i);
      if (invoiceMatch) {
        const invNo = invoiceMatch[0].toUpperCase();
        const tx = transactions[invNo];
        if (tx) {
          staff = tx.staffName || tx.createdBy || "Unknown";
        }
      }
      if (desc.toLowerCase().includes("telegram webapp") || staff.toLowerCase().includes("telegram bot")) {
        isMiniApp = true;
        staff = "Telegram Bot";
      }
    }

    products[sku].logs.push({
      id: d.id,
      date: date,
      dateStr: dateStr,
      type: data.type,
      qty: qty,
      description: desc,
      staff: staff,
      isMiniApp: isMiniApp
    });
  });

  for (const sku in products) {
    products[sku].logs.sort((a, b) => a.date - b.date);
  }

  // Updated to include August 1, 2026
  const startJune16 = new Date("2026-06-16T00:00:00.000Z");
  const endJune30 = new Date("2026-06-30T23:59:59.999Z");
  const startJuly1 = new Date("2026-07-01T00:00:00.000Z");
  const endAugust1 = new Date("2026-08-01T23:59:59.999Z");

  const results = {};

  for (const sku in products) {
    const p = products[sku];
    
    let sumLogsAfterAugust1 = 0;
    let sumLogsJulyAug = 0;
    let sumLogsJune16to30 = 0;
    let sumLogsPreJune16 = 0;

    const replenListP1 = [];
    const replenListP2 = [];
    const salesByStaffP1 = {};
    const salesByStaffP2 = {};

    p.logs.forEach(log => {
      const dt = log.date;
      const qty = log.qty;

      if (dt > endAugust1) {
        sumLogsAfterAugust1 += qty;
      } else if (dt >= startJuly1 && dt <= endAugust1) {
        sumLogsJulyAug += qty;
        if (qty > 0) {
          replenListP2.push(log);
        } else if (qty < 0) {
          const staffKey = log.staff;
          salesByStaffP2[staffKey] = (salesByStaffP2[staffKey] || 0) + Math.abs(qty);
        }
      } else if (dt >= startJune16 && dt <= endJune30) {
        sumLogsJune16to30 += qty;
        if (qty > 0) {
          replenListP1.push(log);
        } else if (qty < 0) {
          const staffKey = log.staff;
          salesByStaffP1[staffKey] = (salesByStaffP1[staffKey] || 0) + Math.abs(qty);
        }
      } else {
        sumLogsPreJune16 += qty;
      }
    });

    const sEndingAugust1 = p.dbStockQty - sumLogsAfterAugust1;
    const sEndingJune30 = sEndingAugust1 - sumLogsJulyAug;
    const sInitialJune16 = sEndingJune30 - sumLogsJune16to30;

    results[sku] = {
      sku: sku,
      nameEn: p.nameEn,
      nameKh: p.nameKh,
      currentDBStock: p.dbStockQty,
      initialJune16: sInitialJune16,
      endingJune30: sEndingJune30,
      endingAugust1: sEndingAugust1,
      replenListP1,
      replenListP2,
      salesByStaffP1,
      salesByStaffP2
    };
  }

  // 1. Generate Markdown Report (.md)
  console.log("Generating Markdown report...");
  let md = `# របាយការណ៍លម្អិតអំពីចលនាស្តុកទំនិញ (Detailed Stock Movement Report)
កាលបរិច្ឆេទសរុប៖ **១៦ មិថុនា ២០២៦ ដល់ ០១ សីហា ២០២៦**

របាយការណ៍នេះត្រូវបានរៀបចំឡើងជាបីផ្នែកស្របតាមសំណើរបស់លោកអ្នក ដើម្បីជួយក្នុងការធ្វើបច្ចុប្បន្នភាពស្តុកជាក់ស្តែង៖
1. **តារាងសរុប (១៦ មិថុនា ដល់ ០១ សីហា ២០២៦)**
2. **តារាងសម្រាប់ផ្នែកទី១ (១៦ មិថុនា ដល់ ៣០ មិថុនា ២០២៦)**
3. **តារាងសម្រាប់ផ្នែកទី២ (០១ កក្កដា ដល់ ០១ សីហា ២០២៦)**

---

## ផ្នែកទី ១៖ តារាងសរុបរួម (១៦ មិថុនា ដល់ ០១ សីហា ២០២៦)

| SKU | ឈ្មោះទំនិញ | ស្តុកដើមគ្រា (16-Jun) | ថែមស្តុកសរុប | លក់ចេញសរុប | ស្តុកចុងគ្រា (01-Aug) |
| :--- | :--- | :---: | :---: | :---: | :---: |
`;

  for (const sku in results) {
    const r = results[sku];
    const totalReplen = r.replenListP1.reduce((sum, l) => sum + l.qty, 0) + r.replenListP2.reduce((sum, l) => sum + l.qty, 0);
    const totalSales = Object.values(r.salesByStaffP1).reduce((sum, q) => sum + q, 0) + Object.values(r.salesByStaffP2).reduce((sum, q) => sum + q, 0);
    md += `| \`${sku}\` | **${r.nameKh}** | \`${r.initialJune16}\` | \`+${totalReplen}\` | \`-${totalSales}\` | \`${r.endingAugust1}\` |\n`;
  }

  md += `
---

## ផ្នែកទី ២៖ របាយការណ៍ផ្នែកទី១ (១៦ មិថុនា ដល់ ៣០ មិថុនា ២០២៦)

### ២.១ តារាងសង្ខេបស្តុក (June 16 - June 30)

| SKU | ឈ្មោះទំនិញ | ស្តុកដើមគ្រា (16-Jun) | ថែមស្តុក | លក់ចេញសរុប | ស្តុកចុងគ្រា (30-Jun) |
| :--- | :--- | :---: | :---: | :---: | :---: |
`;

  for (const sku in results) {
    const r = results[sku];
    const replen = r.replenListP1.reduce((sum, l) => sum + l.qty, 0);
    const sales = Object.values(r.salesByStaffP1).reduce((sum, q) => sum + q, 0);
    md += `| \`${sku}\` | **${r.nameKh}** | \`${r.initialJune16}\` | \`+${replen}\` | \`-${sales}\` | \`${r.endingJune30}\` |\n`;
  }

  md += `
### ២.២ ប្រវត្តិនៃការបន្ថែមស្តុកលម្អិត (Replenishments: June 16 - June 30)
`;

  let hasReplenP1 = false;
  for (const sku in results) {
    const r = results[sku];
    if (r.replenListP1.length > 0) {
      hasReplenP1 = true;
      md += `\n#### **${r.nameKh} (${sku})**\n`;
      r.replenListP1.forEach(l => {
        md += `* **ថ្ងៃវេលា៖** \`${formatKhmerTime(l.dateStr)}\` | **ចំនួន៖** \`+${l.qty}\` | **សម្គាល់៖** ${l.description}\n`;
      });
    }
  }
  if (!hasReplenP1) md += `*(គ្មានប្រវត្តិនៃការបន្ថែមស្តុកក្នុងកំឡុងពេលនេះទេ)*\n`;

  md += `
### ២.៣ របាយការណ៍លក់លម្អិតតាមបុគ្គលិកលក់ (Sales by Staff/Channel: June 16 - June 30)
`;

  for (const sku in results) {
    const r = results[sku];
    const staffEntries = Object.entries(r.salesByStaffP1);
    if (staffEntries.length > 0) {
      md += `\n#### **${r.nameKh} (${sku})**\n`;
      staffEntries.forEach(([staff, qty]) => {
        md += `- **${staff}** លក់បាន៖ \`${qty}\` ឯកតា\n`;
      });
    }
  }

  md += `
---

## ផ្នែកទី ៣៖ របាយការណ៍ផ្នែកទី២ (០១ កក្កដា ដល់ ០១ សីហា ២០២៦)

### ៣.១ តារាងសង្ខេបស្តុក (July 1 - August 1)

| SKU | ឈ្មោះទំនិញ | ស្តុកដើមគ្រា (01-Jul) | ថែមស្តុក | លក់ចេញសរុប | ស្តុកចុងគ្រា (01-Aug) |
| :--- | :--- | :---: | :---: | :---: | :---: |
`;

  for (const sku in results) {
    const r = results[sku];
    const replen = r.replenListP2.reduce((sum, l) => sum + l.qty, 0);
    const sales = Object.values(r.salesByStaffP2).reduce((sum, q) => sum + q, 0);
    md += `| \`${sku}\` | **${r.nameKh}** | \`${r.endingJune30}\` | \`+${replen}\` | \`-${sales}\` | \`${r.endingAugust1}\` |\n`;
  }

  md += `
### ៣.២ ប្រវត្តិនៃការបន្ថែមស្តុកលម្អិត (Replenishments: July 1 - August 1)
`;

  let hasReplenP2 = false;
  for (const sku in results) {
    const r = results[sku];
    if (r.replenListP2.length > 0) {
      hasReplenP2 = true;
      md += `\n#### **${r.nameKh} (${sku})**\n`;
      r.replenListP2.forEach(l => {
        md += `* **ថ្ងៃវេលា៖** \`${formatKhmerTime(l.dateStr)}\` | **ចំនួន៖** \`+${l.qty}\` | **សម្គាល់៖** ${l.description}\n`;
      });
    }
  }
  if (!hasReplenP2) md += `*(គ្មានប្រវត្តិនៃការបន្ថែមស្តុកក្នុងកំឡុងពេលនេះទេ)*\n`;

  md += `
### ៣.៣ របាយការណ៍លក់លម្អិតតាមបុគ្គលិកលក់ (Sales by Staff/Channel: July 1 - August 1)
`;

  for (const sku in results) {
    const r = results[sku];
    const staffEntries = Object.entries(r.salesByStaffP2);
    if (staffEntries.length > 0) {
      md += `\n#### **${r.nameKh} (${sku})**\n`;
      staffEntries.forEach(([staff, qty]) => {
        md += `- **${staff}** លក់បាន៖ \`${qty}\` ឯកតា\n`;
      });
    }
  }

  const mdReportPath = path.join("C:", "Users", "nouen", ".gemini", "antigravity", "brain", "4e4bb2b4-85c4-4cdd-a717-9c24db0318c6", "detailed_stock_movement_report.md");
  fs.writeFileSync(mdReportPath, md);
  console.log(`Markdown report saved to: ${mdReportPath}`);


  // 2. Generate HTML Report
  console.log("Generating HTML...");
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Detailed Stock Movement Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Kantumruy+Pro:wght@400;600;700&display=swap');
    
    body {
      font-family: 'Inter', 'Kantumruy Pro', 'Khmer OS Battambang', sans-serif;
      margin: 40px;
      color: #2d3748;
      line-height: 1.6;
    }
    
    h1 {
      font-family: 'Kantumruy Pro', sans-serif;
      color: #1a365d;
      font-size: 26px;
      margin-bottom: 5px;
      font-weight: 700;
    }
    
    .subtitle {
      font-size: 16px;
      color: #718096;
      margin-bottom: 30px;
    }
    
    h2 {
      font-family: 'Kantumruy Pro', sans-serif;
      color: #2b6cb0;
      font-size: 18px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 8px;
      margin-top: 40px;
      margin-bottom: 20px;
      font-weight: 600;
    }
    
    h3 {
      font-family: 'Kantumruy Pro', sans-serif;
      color: #4a5568;
      font-size: 15px;
      margin-top: 25px;
      margin-bottom: 10px;
      font-weight: 600;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
      font-size: 13px;
    }
    
    th {
      background-color: #ebf8ff;
      color: #2b6cb0;
      text-align: left;
      padding: 12px 10px;
      font-weight: 700;
      border: 1px solid #cbd5e0;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
    }
    
    td {
      padding: 10px;
      border: 1px solid #cbd5e0;
    }
    
    tr:nth-child(even) {
      background-color: #f7fafc;
    }
    
    .sku-badge {
      background-color: #edf2f7;
      padding: 3px 6px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      color: #4a5568;
      font-weight: bold;
    }
    
    .qty-plus {
      color: #38a169;
      font-weight: bold;
    }
    
    .qty-minus {
      color: #e53e3e;
      font-weight: bold;
    }
    
    ul {
      padding-left: 20px;
      margin-bottom: 20px;
    }
    
    li {
      margin-bottom: 8px;
      font-size: 13px;
    }
    
    .page-break {
      page-break-before: always;
    }
    
    .footer {
      margin-top: 50px;
      border-top: 1px solid #e2e8f0;
      padding-top: 20px;
      font-size: 11px;
      color: #a0aec0;
      text-align: center;
    }
  </style>
</head>
<body>

  <div style="text-align: center; margin-bottom: 40px;">
    <h1>របាយការណ៍លម្អិតអំពីចលនាស្តុកទំនិញ</h1>
    <div class="subtitle">កាលបរិច្ឆេទសរុប៖ <strong>១៦ មិថុនា ២០២៦ ដល់ ០១ សីហា ២០២៦</strong></div>
  </div>

  <h2>ផ្នែកទី ១៖ តារាងសរុបរួម (១៦ មិថុនា ដល់ ០១ សីហា ២០២៦)</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 15%;">SKU</th>
        <th style="width: 35%;">ឈ្មោះទំនិញ</th>
        <th style="width: 12.5%; text-align: center;">ស្តុកដើមគ្រា (16-Jun)</th>
        <th style="width: 12.5%; text-align: center;">ថែមស្តុកសរុប</th>
        <th style="width: 12.5%; text-align: center;">លក់ចេញសរុប</th>
        <th style="width: 12.5%; text-align: center;">ស្តុកចុងគ្រា (01-Aug)</th>
      </tr>
    </thead>
    <tbody>
  `;

  for (const sku in results) {
    const r = results[sku];
    const totalReplen = r.replenListP1.reduce((sum, l) => sum + l.qty, 0) + r.replenListP2.reduce((sum, l) => sum + l.qty, 0);
    const totalSales = Object.values(r.salesByStaffP1).reduce((sum, q) => sum + q, 0) + Object.values(r.salesByStaffP2).reduce((sum, q) => sum + q, 0);
    html += `
      <tr>
        <td><span class="sku-badge">${sku}</span></td>
        <td><strong>${r.nameKh}</strong><br><span style="font-size:10px; color:#718096;">${r.nameEn}</span></td>
        <td style="text-align: center; font-weight: bold;">${r.initialJune16}</td>
        <td style="text-align: center;" class="qty-plus">+${totalReplen}</td>
        <td style="text-align: center;" class="qty-minus">-${totalSales}</td>
        <td style="text-align: center; font-weight: bold; background-color:#ebf8ff;">${r.endingAugust1}</td>
      </tr>`;
  }

  html += `
    </tbody>
  </table>

  <div class="page-break"></div>

  <h2>ផ្នែកទី ២៖ របាយការណ៍ផ្នែកទី១ (១៦ មិថុនា ដល់ ៣០ មិថុនា ២០២៦)</h2>
  
  <h3>២.១ តារាងសង្ខេបស្តុក (June 16 - June 30)</h3>
  <table>
    <thead>
      <tr>
        <th style="width: 15%;">SKU</th>
        <th style="width: 35%;">ឈ្មោះទំនិញ</th>
        <th style="width: 12.5%; text-align: center;">ស្តុកដើមគ្រា (16-Jun)</th>
        <th style="width: 12.5%; text-align: center;">ថែមស្តុក</th>
        <th style="width: 12.5%; text-align: center;">លក់ចេញសរុប</th>
        <th style="width: 12.5%; text-align: center;">ស្តុកចុងគ្រា (30-Jun)</th>
      </tr>
    </thead>
    <tbody>
  `;

  for (const sku in results) {
    const r = results[sku];
    const replen = r.replenListP1.reduce((sum, l) => sum + l.qty, 0);
    const sales = Object.values(r.salesByStaffP1).reduce((sum, q) => sum + q, 0);
    html += `
      <tr>
        <td><span class="sku-badge">${sku}</span></td>
        <td><strong>${r.nameKh}</strong></td>
        <td style="text-align: center; font-weight: bold;">${r.initialJune16}</td>
        <td style="text-align: center;" class="qty-plus">+${replen}</td>
        <td style="text-align: center;" class="qty-minus">-${sales}</td>
        <td style="text-align: center; font-weight: bold; background-color:#ebf8ff;">${r.endingJune30}</td>
      </tr>`;
  }

  html += `
    </tbody>
  </table>

  <h3>២.២ ប្រវត្តិនៃការបន្ថែមស្តុកលម្អិត (June 16 - June 30)</h3>
  `;

  hasReplenP1 = false;
  for (const sku in results) {
    const r = results[sku];
    if (r.replenListP1.length > 0) {
      hasReplenP1 = true;
      html += `
      <div style="margin-bottom: 15px;">
        <span style="font-weight: bold; color: #2b6cb0;">${r.nameKh} (${sku})</span>
        <ul style="margin-top: 5px;">`;
      r.replenListP1.forEach(l => {
        html += `
          <li>ថ្ងៃវេលា៖ <code>${formatKhmerTime(l.dateStr)}</code> | ចំនួន៖ <span class="qty-plus">+${l.qty}</span> | សម្គាល់៖ <em>${l.description}</em></li>`;
      });
      html += `  </ul>
      </div>`;
    }
  }
  if (!hasReplenP1) html += `<p style="font-style: italic; color:#a0aec0;">(គ្មានប្រវត្តិនៃការបន្ថែមស្តុកក្នុងកំឡុងពេលនេះទេ)</p>`;

  html += `
  <h3>២.៣ របាយការណ៍លក់លម្អិតតាមបុគ្គលិកលក់ (June 16 - June 30)</h3>
  `;

  for (const sku in results) {
    const r = results[sku];
    const staffEntries = Object.entries(r.salesByStaffP1);
    if (staffEntries.length > 0) {
      html += `
      <div style="margin-bottom: 15px;">
        <span style="font-weight: bold; color: #4a5568;">${r.nameKh} (${sku})</span>
        <ul style="margin-top: 5px;">`;
      staffEntries.forEach(([staff, qty]) => {
        html += `
          <li><strong>${staff}</strong> លក់បាន៖ <code>${qty}</code> ឯកតា</li>`;
      });
      html += `  </ul>
      </div>`;
    }
  }

  html += `
  <div class="page-break"></div>

  <h2>ផ្នែកទី ៣៖ របាយការណ៍ផ្នែកទី២ (០១ កក្កដា ដល់ ០១ សីហា ២០២៦)</h2>
  
  <h3>៣.១ តារាងសង្ខេបស្តុក (July 1 - August 1)</h3>
  <table>
    <thead>
      <tr>
        <th style="width: 15%;">SKU</th>
        <th style="width: 35%;">ឈ្មោះទំនិញ</th>
        <th style="width: 12.5%; text-align: center;">ស្តុកដើមគ្រា (01-Jul)</th>
        <th style="width: 12.5%; text-align: center;">ថែមស្តុក</th>
        <th style="width: 12.5%; text-align: center;">លក់ចេញសរុប</th>
        <th style="width: 12.5%; text-align: center;">ស្តុកចុងគ្រា (01-Aug)</th>
      </tr>
    </thead>
    <tbody>
  `;

  for (const sku in results) {
    const r = results[sku];
    const replen = r.replenListP2.reduce((sum, l) => sum + l.qty, 0);
    const sales = Object.values(r.salesByStaffP2).reduce((sum, q) => sum + q, 0);
    html += `
      <tr>
        <td><span class="sku-badge">${sku}</span></td>
        <td><strong>${r.nameKh}</strong></td>
        <td style="text-align: center; font-weight: bold;">${r.endingJune30}</td>
        <td style="text-align: center;" class="qty-plus">+${replen}</td>
        <td style="text-align: center;" class="qty-minus">-${sales}</td>
        <td style="text-align: center; font-weight: bold; background-color:#ebf8ff;">${r.endingAugust1}</td>
      </tr>`;
  }

  html += `
    </tbody>
  </table>

  <h3>៣.២ ប្រវត្តិនៃការបន្ថែមស្តុកលម្អិត (July 1 - August 1)</h3>
  `;

  hasReplenP2 = false;
  for (const sku in results) {
    const r = results[sku];
    if (r.replenListP2.length > 0) {
      hasReplenP2 = true;
      html += `
      <div style="margin-bottom: 15px;">
        <span style="font-weight: bold; color: #2b6cb0;">${r.nameKh} (${sku})</span>
        <ul style="margin-top: 5px;">`;
      r.replenListP2.forEach(l => {
        html += `
          <li>ថ្ងៃវេលា៖ <code>${formatKhmerTime(l.dateStr)}</code> | ចំនួន៖ <span class="qty-plus">+${l.qty}</span> | សម្គាល់៖ <em>${l.description}</em></li>`;
      });
      html += `  </ul>
      </div>`;
    }
  }
  if (!hasReplenP2) html += `<p style="font-style: italic; color:#a0aec0;">(គ្មានប្រវត្តិនៃការបន្ថែមស្តុកក្នុងកំឡុងពេលនេះទេ)</p>`;

  html += `
  <h3>៣.៣ របាយការណ៍លក់លម្អិតតាមបុគ្គលិកលក់ (July 1 - August 1)</h3>
  `;

  for (const sku in results) {
    const r = results[sku];
    const staffEntries = Object.entries(r.salesByStaffP2);
    if (staffEntries.length > 0) {
      html += `
      <div style="margin-bottom: 15px;">
        <span style="font-weight: bold; color: #4a5568;">${r.nameKh} (${sku})</span>
        <ul style="margin-top: 5px;">`;
      staffEntries.forEach(([staff, qty]) => {
        html += `
          <li><strong>${staff}</strong> លក់បាន៖ <code>${qty}</code> ឯកតា</li>`;
      });
      html += `  </ul>
      </div>`;
    }
  }

  html += `
  <div class="footer">
    របាយការណ៍នេះត្រូវបានបង្កើតឡើងដោយស្វ័យប្រវត្តិចេញពីប្រព័ន្ធ ERP & POS របស់ក្រុមហ៊ុន ABC System<br>
    កាលបរិច្ឆេទបង្កើត៖ 2026-08-01 | ទំព័រ 1 នៃ 1
  </div>

</body>
</html>
`;

  const htmlPath = path.join("C:", "Users", "nouen", ".gemini", "antigravity", "brain", "4e4bb2b4-85c4-4cdd-a717-9c24db0318c6", "scratch", "detailed_stock_movement_report.html");
  fs.writeFileSync(htmlPath, html);
  console.log(`HTML generated successfully at: ${htmlPath}`);

  // Copy HTML to workspace
  const workspaceHtmlPath = "c:\\Users\\nouen\\OneDrive\\Desktop\\khmer-pos-system\\Detailed_Stock_Movement_Report.html";
  fs.copyFileSync(htmlPath, workspaceHtmlPath);
  console.log(`HTML copied to workspace: ${workspaceHtmlPath}`);

  // Call Edge CLI to print to PDF
  const workspacePdfPath = "c:\\Users\\nouen\\OneDrive\\Desktop\\khmer-pos-system\\Detailed_Stock_Movement_Report.pdf";
  const artifactPdfPath = "C:\\Users\\nouen\\.gemini\\antigravity\\brain\\4e4bb2b4-85c4-4cdd-a717-9c24db0318c6\\Detailed_Stock_Movement_Report.pdf";
  const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

  const cmd = `"${edgePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${workspacePdfPath}" "${htmlPath}"`;
  console.log(`Executing Edge CLI: ${cmd}`);

  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`Edge CLI execution error: ${error.message}`);
      return;
    }
    console.log("PDF created successfully at: " + workspacePdfPath);

    // Copy PDF to artifact directory
    try {
      fs.copyFileSync(workspacePdfPath, artifactPdfPath);
      console.log("PDF copied successfully to artifact directory: " + artifactPdfPath);
    } catch (err) {
      console.error("Error copying PDF to artifact directory:", err);
    }
  });
}

run().catch(console.error);
