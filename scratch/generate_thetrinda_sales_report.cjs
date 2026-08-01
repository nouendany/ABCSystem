const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, doc, getDoc } = require("firebase/firestore");
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

// Cambodia Time Zone (UTC+7) Date formatter
function formatKhmerTime(dateStr) {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const camDate = new Date(utc + (3600000 * 7));
  const y = camDate.getFullYear();
  const m = String(camDate.getMonth() + 1).padStart(2, '0');
  const d = String(camDate.getDate()).padStart(2, '0');
  const h = String(camDate.getHours()).padStart(2, '0');
  const min = String(camDate.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}`;
}

async function run() {
  console.log("Loading transactions...");
  const txSnap = await getDocs(collection(db, "transactions"));
  console.log("Loading customers...");
  const custSnap = await getDocs(collection(db, "customers"));

  // Map customers for fast lookup
  const customers = {};
  custSnap.forEach(d => {
    customers[d.id] = { id: d.id, ...d.data() };
  });

  const startJune16 = new Date("2026-06-16T00:00:00.000Z");
  const endAugust1 = new Date("2026-08-01T23:59:59.999Z");

  // Periods: June (16-30), July (1-31), August (1)
  const juneStart = new Date("2026-06-16T00:00:00.000Z");
  const juneEnd = new Date("2026-06-30T23:59:59.999Z");
  const julyStart = new Date("2026-07-01T00:00:00.000Z");
  const julyEnd = new Date("2026-07-31T23:59:59.999Z");
  const augStart = new Date("2026-08-01T00:00:00.000Z");
  const augEnd = new Date("2026-08-01T23:59:59.999Z");

  const targetStaffId = "ABC2026001"; // Yuk Thetrinda
  const targetStaffName = "Yuk Thetrinda";

  const periods = [
    { name: "មិថុនា ២០២៦ (16-Jun to 30-Jun)", start: juneStart, end: juneEnd, transactions: [], revenue: 0, products: {} },
    { name: "កក្កដា ២០២៦ (01-Jul to 31-Jul)", start: julyStart, end: julyEnd, transactions: [], revenue: 0, products: {} },
    { name: "សីហា ២០២៦ (01-Aug)", start: augStart, end: augEnd, transactions: [], revenue: 0, products: {} }
  ];

  let totalThetrindaRevenue = 0;
  let totalThetrindaOrders = 0;

  txSnap.forEach(d => {
    const data = d.data();
    if (!data.date) return;
    
    // Check if salesperson is Yuk Thetrinda
    const isStaff = (data.staffId === targetStaffId || 
                     (data.staffName && data.staffName.toLowerCase() === targetStaffName.toLowerCase()) ||
                     (data.createdBy && data.createdBy.toLowerCase() === targetStaffName.toLowerCase()));
    
    if (!isStaff) return;

    const dt = new Date(data.date);
    if (dt >= startJune16 && dt <= endAugust1) {
      totalThetrindaRevenue += data.total || 0;
      totalThetrindaOrders++;

      // Find period
      const period = periods.find(p => dt >= p.start && dt <= p.end);
      if (period) {
        // Fetch full customer info
        const cId = data.customerId;
        const custInfo = customers[cId] || {
          name: data.customerName || "General Customer",
          phone: "N/A",
          address: "N/A",
          source: "N/A"
        };

        const tx = {
          id: d.id,
          ...data,
          customerDetails: custInfo,
          formattedDate: formatKhmerTime(data.date)
        };
        period.transactions.push(tx);
        period.revenue += data.total || 0;

        // Aggregate items
        if (data.items && Array.isArray(data.items)) {
          data.items.forEach(item => {
            const sku = item.sku || "Unknown";
            const qty = parseInt(item.qty) || 0;
            const itemTotal = parseFloat(item.total) || (qty * (parseFloat(item.price) || 0));

            if (!period.products[sku]) {
              period.products[sku] = {
                sku: sku,
                nameKh: item.nameKh || item.nameEn || sku,
                nameEn: item.nameEn || item.nameKh || sku,
                qty: 0,
                revenue: 0
              };
            }
            period.products[sku].qty += qty;
            period.products[sku].revenue += itemTotal;
          });
        }
      }
    }
  });

  // Sort transactions inside each period chronologically
  periods.forEach(p => {
    p.transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
  });

  console.log(`Yuk Thetrinda Report: Total Orders: ${totalThetrindaOrders}, Total Revenue: $${totalThetrindaRevenue.toFixed(2)}`);
  periods.forEach(p => {
    console.log(`Period ${p.name}: Orders: ${p.transactions.length}, Revenue: $${p.revenue.toFixed(2)}`);
  });

  // Generate HTML
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Sales Report for Yuk Thetrinda</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Kantumruy+Pro:wght@400;500;600;700&display=swap');
    
    body {
      font-family: 'Inter', 'Kantumruy Pro', 'Khmer OS Battambang', sans-serif;
      margin: 40px;
      color: #2d3748;
      line-height: 1.5;
      background-color: #ffffff;
    }
    
    .header-container {
      border-bottom: 3px solid #b7791f;
      padding-bottom: 20px;
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .header-title h1 {
      font-family: 'Kantumruy Pro', sans-serif;
      color: #744210;
      font-size: 22px;
      margin: 0 0 5px 0;
      font-weight: 700;
    }
    
    .header-title .subtitle {
      font-size: 14px;
      color: #718096;
      margin: 0;
    }
    
    .company-logo {
      text-align: right;
    }
    
    .company-name {
      font-family: 'Kantumruy Pro', sans-serif;
      font-size: 20px;
      font-weight: 700;
      color: #b7791f;
      margin: 0;
    }
    
    .report-meta {
      font-size: 11px;
      color: #a0aec0;
      margin-top: 5px;
    }

    /* Overall Summary Cards */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 35px;
    }
    
    .stat-card {
      background-color: #f7fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 15px 20px;
      text-align: center;
    }
    
    .stat-card .label {
      font-family: 'Kantumruy Pro', sans-serif;
      font-size: 12px;
      color: #718096;
      margin-bottom: 5px;
      font-weight: 600;
    }
    
    .stat-card .value {
      font-size: 20px;
      font-weight: 700;
      color: #2d3748;
    }
    
    .stat-card.primary {
      background-color: #fefcbf;
      border-color: #faf089;
    }
    
    .stat-card.primary .value {
      color: #744210;
    }

    /* Period Summary Section */
    .period-section {
      margin-bottom: 50px;
      page-break-inside: avoid;
    }
    
    .period-header {
      background-color: #744210;
      color: #ffffff;
      padding: 10px 15px;
      border-radius: 6px;
      font-family: 'Kantumruy Pro', sans-serif;
      font-size: 15px;
      font-weight: bold;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .period-summary-info {
      font-size: 13px;
      font-weight: normal;
    }

    h3 {
      font-family: 'Kantumruy Pro', sans-serif;
      color: #744210;
      font-size: 14px;
      border-left: 4px solid #b7791f;
      padding-left: 10px;
      margin-top: 25px;
      margin-bottom: 15px;
      font-weight: 600;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-bottom: 25px;
    }
    
    th {
      background-color: #f7fafc;
      color: #744210;
      text-align: left;
      padding: 8px 10px;
      font-weight: 700;
      border: 1px solid #cbd5e0;
      text-transform: uppercase;
      font-size: 9px;
      letter-spacing: 0.5px;
    }
    
    td {
      padding: 6px 10px;
      border: 1px solid #cbd5e0;
    }
    
    tr:nth-child(even) {
      background-color: #f7fafc;
    }
    
    .text-right {
      text-align: right;
    }
    
    .text-center {
      text-align: center;
    }
    
    .bold {
      font-weight: bold;
    }
    
    .sku-badge {
      background-color: #edf2f7;
      padding: 2px 5px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 10px;
      color: #4a5568;
    }
    
    .page-break {
      page-break-before: always;
    }
    
    @media print {
      body {
        margin: 20px;
        font-size: 10px;
      }
      .stat-card {
        padding: 10px;
      }
      .stat-card .value {
        font-size: 16px;
      }
      .period-section {
        margin-bottom: 30px;
        page-break-inside: auto;
      }
      tr {
        page-break-inside: avoid;
      }
    }
    
    .footer {
      margin-top: 40px;
      border-top: 1px solid #e2e8f0;
      padding-top: 15px;
      font-size: 10px;
      color: #a0aec0;
      text-align: center;
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header-container">
    <div class="header-title">
      <h1>របាយការណ៍លក់លម្អិតរបស់បុគ្គលិក៖ Yuk Thetrinda</h1>
      <div class="subtitle">កាលបរិច្ឆេទសរុប៖ <strong>១៦ មិថុនា ២០២៦ ដល់ ០១ សីហា ២០២៦</strong></div>
    </div>
    <div class="company-logo">
      <div class="company-name">ABC SYSTEM</div>
      <div class="report-meta">ថ្ងៃបង្កើតរបាយការណ៍៖ ${new Date().toISOString().split('T')[0]}</div>
    </div>
  </div>

  <!-- Key Metrics -->
  <div class="stats-grid">
    <div class="stat-card primary">
      <div class="label">ចំណូលលក់សរុប (Total Revenue)</div>
      <div class="value">$${totalThetrindaRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
    <div class="stat-card">
      <div class="label">ចំនួនប្រតិបត្តិការលក់ (Total Orders)</div>
      <div class="value">${totalThetrindaOrders} កម្មង់</div>
    </div>
    <div class="stat-card">
      <div class="label">លក់មធ្យមក្នុងមួយកម្មង់ (AOV)</div>
      <div class="value">$${(totalThetrindaOrders > 0 ? (totalThetrindaRevenue / totalThetrindaOrders) : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
  </div>

  <!-- Render Period By Period -->
  `;

  periods.forEach((p, pIndex) => {
    if (pIndex > 0) {
      html += `<div class="page-break"></div>`;
    }

    html += `
    <div class="period-section">
      <div class="period-header">
        <div>📅 ផ្នែក៖ ${p.name}</div>
        <div class="period-summary-info">លក់សរុប៖ $${p.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | កម្មង់៖ ${p.transactions.length}</div>
      </div>
      
      <!-- Product Sales Summary for this period -->
      <h3>១. សង្ខេបមុខទំនិញលក់បាន (Product Sales Summary)</h3>
      <table>
        <thead>
          <tr>
            <th style="width: 20%;">SKU</th>
            <th>ឈ្មោះទំនិញ (Product Name)</th>
            <th class="text-center" style="width: 20%;">ចំនួនលក់បាន (Qty Sold)</th>
            <th class="text-right" style="width: 25%;">ចំណូលសរុប (Total Revenue)</th>
          </tr>
        </thead>
        <tbody>
    `;

    const items = Object.values(p.products);
    items.sort((a, b) => b.qty - a.qty);

    if (items.length === 0) {
      html += `
          <tr>
            <td colspan="4" class="text-center" style="color: #a0aec0; font-style: italic;">(គ្មានការលក់ក្នុងកំឡុងពេលនេះទេ)</td>
          </tr>`;
    } else {
      items.forEach(item => {
        html += `
          <tr>
            <td><span class="sku-badge">${item.sku}</span></td>
            <td class="bold">${item.nameKh} <br><span style="font-size:9px; color:#718096; font-weight: normal;">${item.nameEn}</span></td>
            <td class="text-center bold">${item.qty}</td>
            <td class="text-right bold" style="color: #2f855a;">$${item.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>`;
      });
    }

    html += `
        </tbody>
      </table>
      
      <!-- Detailed Transaction Logs & Customer Info for this period -->
      <h3>២. របាយការណ៍លក់ និងព័ត៌មានអតិថិជនលម្អិត (Detailed Transactions & Customer Info)</h3>
      <table>
        <thead>
          <tr>
            <th style="width: 13%;">ថ្ងៃវេលា (Date/Time)</th>
            <th style="width: 11%;">វិក្កយបត្រ (Inv No)</th>
            <th style="width: 14%;">អតិថិជន (Customer Name)</th>
            <th style="width: 18%;">ទូរស័ព្ទ/អាសយដ្ឋាន (Phone/Address)</th>
            <th style="width: 11%;">ទូទាត់ (Payment)</th>
            <th>ទំនិញលម្អិត (Items)</th>
            <th class="text-right" style="width: 10%;">សរុប (Total)</th>
          </tr>
        </thead>
        <tbody>
    `;

    if (p.transactions.length === 0) {
      html += `
          <tr>
            <td colspan="7" class="text-center" style="color: #a0aec0; font-style: italic;">(គ្មានប្រតិបត្តិការលក់ក្នុងកំឡុងពេលនេះទេ)</td>
          </tr>`;
    } else {
      p.transactions.forEach(tx => {
        const cPhone = tx.customerDetails.phone || "N/A";
        const cAddress = tx.customerDetails.address && tx.customerDetails.address !== "-" ? tx.customerDetails.address : "N/A";
        const itemsText = (tx.items || []).map(it => `${it.nameKh || it.nameEn} x ${it.qty}`).join(', ');
        
        html += `
          <tr>
            <td>${tx.formattedDate}</td>
            <td><span class="sku-badge">${tx.invoiceNo || tx.id}</span></td>
            <td class="bold">${tx.customerName || "General Customer"}</td>
            <td>
              <strong>ទូរស័ព្ទ៖</strong> <code>${cPhone}</code><br>
              <span style="font-size: 9px; color: #718096;"><strong>អាសយដ្ឋាន៖</strong> ${cAddress}</span>
            </td>
            <td>${tx.paymentMethod || "N/A"}</td>
            <td style="font-size: 10px; color: #4a5568;">${itemsText}</td>
            <td class="text-right bold" style="color: #2b6cb0;">$${(tx.total || 0).toFixed(2)}</td>
          </tr>`;
      });
    }

    html += `
        </tbody>
      </table>
    </div>
    `;
  });

  html += `
  <!-- Footer -->
  <div class="footer">
    របាយការណ៍លក់នេះត្រូវបានបង្កើតឡើងដោយស្វ័យប្រវត្តិចេញពីប្រព័ន្ធ ERP & POS របស់ក្រុមហ៊ុន ABC System<br>
    កាលបរិច្ឆេទបង្កើត៖ ${new Date().toISOString()}
  </div>

</body>
</html>
`;

  const htmlPath = path.join("C:", "Users", "nouen", ".gemini", "antigravity", "brain", "4e4bb2b4-85c4-4cdd-a717-9c24db0318c6", "scratch", "thetrinda_sales_report.html");
  fs.writeFileSync(htmlPath, html);
  console.log(`HTML generated successfully at: ${htmlPath}`);

  // Copy HTML to workspace
  const workspaceHtmlPath = "c:\\Users\\nouen\\OneDrive\\Desktop\\khmer-pos-system\\Yuk_Thetrinda_Sales_Report.html";
  fs.copyFileSync(htmlPath, workspaceHtmlPath);
  console.log(`HTML copied to workspace: ${workspaceHtmlPath}`);

  // Call Edge CLI to print to PDF
  const workspacePdfPath = "c:\\Users\\nouen\\OneDrive\\Desktop\\khmer-pos-system\\Yuk_Thetrinda_Sales_Report.pdf";
  const artifactPdfPath = "C:\\Users\\nouen\\.gemini\\antigravity\\brain\\4e4bb2b4-85c4-4cdd-a717-9c24db0318c6\\Yuk_Thetrinda_Sales_Report.pdf";
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
