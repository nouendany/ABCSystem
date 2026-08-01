const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs } = require("firebase/firestore");
const fs = require("fs");
const path = require("path");

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

// Helper to format date in UTC/Khmer time
function formatKhmerTime(dateStr) {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  // Format as YYYY-MM-DD HH:mm
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}`;
}

async function run() {
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

  // Collect all stock logs and link them to transactions
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
      type: data.type, // 'sale', 'replenishment', 'transfer', 'adjustment'
      qty: qty,
      description: desc,
      staff: staff,
      isMiniApp: isMiniApp
    });
  });

  // Sort logs chronologically for each product
  for (const sku in products) {
    products[sku].logs.sort((a, b) => a.date - b.date);
  }

  // Date constants
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
    const salesByStaffP1 = {}; // { staff: qty }
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

  // Generate the Markdown report
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
    // Calculate total replenishments and sales in both periods combined
    const totalReplen = r.replenListP1.reduce((sum, l) => sum + l.qty, 0) + r.replenListP2.reduce((sum, l) => sum + l.qty, 0);
    const totalSalesP1 = Object.values(r.salesByStaffP1).reduce((sum, q) => sum + q, 0);
    const totalSalesP2 = Object.values(r.salesByStaffP2).reduce((sum, q) => sum + q, 0);
    const totalSales = totalSalesP1 + totalSalesP2;

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

  const targetPath = path.join("C:", "Users", "nouen", ".gemini", "antigravity", "brain", "4e4bb2b4-85c4-4cdd-a717-9c24db0318c6", "detailed_stock_movement_report.md");
  fs.writeFileSync(targetPath, md);
  console.log(`Report generated successfully at: ${targetPath}`);
}

run().catch(console.error);
