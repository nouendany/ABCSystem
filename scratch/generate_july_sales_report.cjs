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

// Convert Date to Cambodia Time Zone (UTC+7)
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
  console.log("Loading transactions from Firestore...");
  const txSnap = await getDocs(collection(db, "transactions"));
  
  const start = new Date("2026-07-01T00:00:00.000Z");
  const end = new Date("2026-07-31T23:59:59.999Z");

  const transactions = [];
  let totalRevenue = 0;
  const staffSales = {};
  const paymentSales = {};

  txSnap.forEach(d => {
    const data = d.data();
    if (!data.date) return;
    const dt = new Date(data.date);
    if (dt >= start && dt <= end) {
      transactions.push({
        id: d.id,
        ...data,
        parsedDate: dt
      });
      totalRevenue += data.total || 0;
      
      const sName = data.staffName || "System / Unknown";
      staffSales[sName] = (staffSales[sName] || 0) + (data.total || 0);

      const pMethod = data.paymentMethod || "Unknown";
      paymentSales[pMethod] = (paymentSales[pMethod] || 0) + (data.total || 0);
    }
  });

  // Sort chronologically
  transactions.sort((a, b) => a.parsedDate - b.parsedDate);

  const totalSalesCount = transactions.length;
  const averageOrderValue = totalSalesCount > 0 ? (totalRevenue / totalSalesCount) : 0;

  console.log(`Transactions filtered: ${totalSalesCount}`);

  // Generate HTML
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>July 2026 Sales Report</title>
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
      border-bottom: 3px solid #3182ce;
      padding-bottom: 20px;
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .header-title h1 {
      font-family: 'Kantumruy Pro', sans-serif;
      color: #1a365d;
      font-size: 24px;
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
      color: #2b6cb0;
      margin: 0;
    }
    
    .report-meta {
      font-size: 11px;
      color: #a0aec0;
      margin-top: 5px;
    }
    
    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 30px;
    }
    
    .stat-card {
      background-color: #f7fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    
    .stat-card .label {
      font-family: 'Kantumruy Pro', sans-serif;
      font-size: 13px;
      color: #718096;
      margin-bottom: 5px;
      font-weight: 600;
    }
    
    .stat-card .value {
      font-size: 22px;
      font-weight: 700;
      color: #2d3748;
    }
    
    .stat-card.primary {
      background-color: #ebf8ff;
      border-color: #bee3f8;
    }
    
    .stat-card.primary .value {
      color: #2b6cb0;
    }

    /* Grid for Staff & Payments Table */
    .summary-tables-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin-bottom: 40px;
    }
    
    h2 {
      font-family: 'Kantumruy Pro', sans-serif;
      color: #2b6cb0;
      font-size: 16px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 6px;
      margin-top: 0;
      margin-bottom: 15px;
      font-weight: 600;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    
    th {
      background-color: #ebf8ff;
      color: #2b6cb0;
      text-align: left;
      padding: 10px;
      font-weight: 700;
      border: 1px solid #cbd5e0;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.5px;
    }
    
    td {
      padding: 8px 10px;
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
    
    .badge {
      background-color: #edf2f7;
      padding: 2px 5px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 11px;
    }
    
    .page-break {
      page-break-before: always;
    }
    
    /* Print Styling Optimization */
    @media print {
      body {
        margin: 20px;
        font-size: 11px;
      }
      .stat-card {
        padding: 12px;
      }
      .stat-card .value {
        font-size: 18px;
      }
      tr {
        page-break-inside: avoid;
      }
      thead {
        display: table-header-group;
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
      <h1>របាយការណ៍លម្អិតនៃការលក់ប្រចាំខែកក្កដា</h1>
      <div class="subtitle">កាលបរិច្ឆេទ៖ <strong>០១ កក្កដា ២០២៦ ដល់ ៣១ កក្កដា ២០២៦</strong></div>
    </div>
    <div class="company-logo">
      <div class="company-name">ABC SYSTEM</div>
      <div class="report-meta">ថ្ងៃបង្កើតរបាយការណ៍៖ ${new Date().toISOString().split('T')[0]}</div>
    </div>
  </div>

  <!-- Key Metrics -->
  <div class="stats-grid">
    <div class="stat-card primary">
      <div class="label">ចំណូលសរុប (Total Revenue)</div>
      <div class="value">$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
    <div class="stat-card">
      <div class="label">ចំនួនប្រតិបត្តិការលក់ (Total Orders)</div>
      <div class="value">${totalSalesCount}</div>
    </div>
    <div class="stat-card">
      <div class="label">តម្លៃមធ្យមក្នុងមួយការបញ្ជាទិញ (AOV)</div>
      <div class="value">$${averageOrderValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
  </div>

  <!-- Summary Tables -->
  <div class="summary-tables-grid">
    <!-- Staff Sales Table -->
    <div>
      <h2>លក់សរុបតាមបុគ្គលិកទទួលខុសត្រូវ (Sales by Responsible Staff)</h2>
      <table>
        <thead>
          <tr>
            <th>ឈ្មោះបុគ្គលិក (Staff Name)</th>
            <th class="text-right" style="width: 40%;">លក់បានសរុប (Total Sales)</th>
          </tr>
        </thead>
        <tbody>
  `;

  // Sort staff by sales descending
  const sortedStaff = Object.entries(staffSales).sort((a, b) => b[1] - a[1]);
  sortedStaff.forEach(([name, amount]) => {
    html += `
          <tr>
            <td class="bold">${name}</td>
            <td class="text-right bold" style="color: #2b6cb0;">$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>`;
  });

  html += `
        </tbody>
      </table>
    </div>

    <!-- Payment Method Table -->
    <div>
      <h2>លក់សរុបតាមប្រភេទបង់ប្រាក់ (Sales by Payment Method)</h2>
      <table>
        <thead>
          <tr>
            <th>ប្រភេទបង់ប្រាក់ (Payment Method)</th>
            <th class="text-right" style="width: 40%;">សរុប (Total)</th>
          </tr>
        </thead>
        <tbody>
  `;

  const sortedPayments = Object.entries(paymentSales).sort((a, b) => b[1] - a[1]);
  sortedPayments.forEach(([method, amount]) => {
    html += `
          <tr>
            <td class="bold">${method}</td>
            <td class="text-right bold" style="color: #2c5282;">$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>`;
  });

  html += `
        </tbody>
      </table>
    </div>
  </div>

  <div class="page-break"></div>

  <!-- Detailed Sales Log Table -->
  <h2>របាយការណ៍លក់លម្អិត (Detailed Sales Log)</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 14%;">ថ្ងៃខែ-ម៉ោង (Date & Time)</th>
        <th style="width: 12%;">លេខវិក្កយបត្រ (Inv No)</th>
        <th style="width: 16%;">ឈ្មោះអតិថិជន (Customer)</th>
        <th style="width: 14%;">អ្នកលក់ (Responsible Staff)</th>
        <th style="width: 12%;">វិធីទូទាត់ (Payment)</th>
        <th>ទំនិញលម្អិត (Ordered Items)</th>
        <th class="text-right" style="width: 10%;">សរុប (Total)</th>
      </tr>
    </thead>
    <tbody>
  `;

  transactions.forEach(tx => {
    const itemsText = (tx.items || []).map(it => `${it.nameKh || it.nameEn} x ${it.qty}`).join(', ');
    html += `
      <tr>
        <td style="font-size: 11px;">${formatKhmerTime(tx.date)}</td>
        <td><span class="badge">${tx.invoiceNo || tx.id}</span></td>
        <td class="bold">${tx.customerName || "General Customer"}</td>
        <td class="bold" style="color: #4a5568;">${tx.staffName || "System"}</td>
        <td>${tx.paymentMethod || "ABA Pay / KHQR"}</td>
        <td style="font-size: 11px; color: #4a5568;">${itemsText}</td>
        <td class="text-right bold" style="color: #2b6cb0;">$${(tx.total || 0).toFixed(2)}</td>
      </tr>`;
  });

  html += `
    </tbody>
  </table>

  <!-- Footer -->
  <div class="footer">
    របាយការណ៍លក់នេះត្រូវបានបង្កើតឡើងដោយស្វ័យប្រវត្តិចេញពីប្រព័ន្ធ ERP & POS របស់ក្រុមហ៊ុន ABC System<br>
    កាលបរិច្ឆេទបង្កើត៖ ${new Date().toISOString()}
  </div>

</body>
</html>
`;

  const htmlPath = path.join("C:", "Users", "nouen", ".gemini", "antigravity", "brain", "4e4bb2b4-85c4-4cdd-a717-9c24db0318c6", "scratch", "july_sales_report.html");
  fs.writeFileSync(htmlPath, html);
  console.log(`HTML generated successfully at: ${htmlPath}`);

  // Copy HTML to workspace
  const workspaceHtmlPath = "c:\\Users\\nouen\\OneDrive\\Desktop\\khmer-pos-system\\July_Sales_Report.html";
  fs.copyFileSync(htmlPath, workspaceHtmlPath);
  console.log(`HTML copied to workspace: ${workspaceHtmlPath}`);

  // Call Edge CLI to print to PDF
  const workspacePdfPath = "c:\\Users\\nouen\\OneDrive\\Desktop\\khmer-pos-system\\July_Sales_Report.pdf";
  const artifactPdfPath = "C:\\Users\\nouen\\.gemini\\antigravity\\brain\\4e4bb2b4-85c4-4cdd-a717-9c24db0318c6\\July_Sales_Report.pdf";
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
