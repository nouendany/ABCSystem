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

async function run() {
  console.log("Loading transactions from Firestore...");
  const txSnap = await getDocs(collection(db, "transactions"));
  
  const start = new Date("2026-07-01T00:00:00.000Z");
  const end = new Date("2026-07-31T23:59:59.999Z");

  const staffData = {};
  let overallRevenue = 0;
  let overallOrders = 0;

  txSnap.forEach(d => {
    const data = d.data();
    if (!data.date) return;
    const dt = new Date(data.date);
    if (dt >= start && dt <= end) {
      overallRevenue += data.total || 0;
      overallOrders++;

      const staffName = data.staffName || "System / Unknown";
      if (!staffData[staffName]) {
        staffData[staffName] = {
          name: staffName,
          totalRevenue: 0,
          orderCount: 0,
          itemsSold: {} // { sku: { sku, nameKh, nameEn, qty, revenue } }
        };
      }

      const staff = staffData[staffName];
      staff.totalRevenue += data.total || 0;
      staff.orderCount++;

      if (data.items && Array.isArray(data.items)) {
        data.items.forEach(item => {
          const sku = item.sku || "Unknown";
          const qty = parseInt(item.qty) || 0;
          const itemTotal = parseFloat(item.total) || (qty * (parseFloat(item.price) || 0));

          if (!staff.itemsSold[sku]) {
            staff.itemsSold[sku] = {
              sku: sku,
              nameKh: item.nameKh || item.nameEn || sku,
              nameEn: item.nameEn || item.nameKh || sku,
              qty: 0,
              revenue: 0
            };
          }
          staff.itemsSold[sku].qty += qty;
          staff.itemsSold[sku].revenue += itemTotal;
        });
      }
    }
  });

  const staffList = Object.values(staffData);
  // Sort staff by total revenue descending
  staffList.sort((a, b) => b.totalRevenue - a.totalRevenue);

  console.log(`Aggregated sales for ${staffList.length} staff members.`);

  // Generate HTML
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>July 2026 Sales Summary by Staff</title>
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
      border-bottom: 3px solid #2b6cb0;
      padding-bottom: 20px;
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .header-title h1 {
      font-family: 'Kantumruy Pro', sans-serif;
      color: #1a365d;
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
      color: #2b6cb0;
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
      background-color: #ebf8ff;
      border-color: #bee3f8;
    }
    
    .stat-card.primary .value {
      color: #2b6cb0;
    }

    /* Table Styling */
    h2 {
      font-family: 'Kantumruy Pro', sans-serif;
      color: #2b6cb0;
      font-size: 16px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 6px;
      margin-top: 30px;
      margin-bottom: 15px;
      font-weight: 600;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-bottom: 25px;
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
    
    .sku-badge {
      background-color: #edf2f7;
      padding: 2px 5px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 11px;
      color: #4a5568;
    }
    
    .page-break {
      page-break-before: always;
    }

    /* Staff Summary Card List */
    .staff-card {
      border: 1px solid #cbd5e0;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
      background-color: #ffffff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      page-break-inside: avoid;
    }

    .staff-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #ebf8ff;
      padding-bottom: 10px;
      margin-bottom: 15px;
    }

    .staff-card-title {
      font-family: 'Kantumruy Pro', sans-serif;
      font-size: 16px;
      font-weight: 700;
      color: #2b6cb0;
      margin: 0;
    }

    .staff-card-revenue {
      font-size: 16px;
      font-weight: 700;
      color: #2f855a;
    }
    
    @media print {
      body {
        margin: 20px;
        font-size: 11px;
      }
      .stat-card {
        padding: 10px;
      }
      .stat-card .value {
        font-size: 16px;
      }
      .staff-card {
        padding: 15px;
        margin-bottom: 20px;
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
      <h1>របាយការណ៍សង្ខេបការលក់លម្អិតតាមបុគ្គលិក</h1>
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
      <div class="label">ចំណូលលក់សរុប (Total Revenue)</div>
      <div class="value">$${overallRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
    <div class="stat-card">
      <div class="label">ចំនួនប្រតិបត្តិការលក់ (Total Orders)</div>
      <div class="value">${overallOrders}</div>
    </div>
    <div class="stat-card">
      <div class="label">បុគ្គលិកលក់បានច្រើនជាងគេ (Top Seller)</div>
      <div class="value" style="font-family: 'Kantumruy Pro', sans-serif; font-size: 16px; margin-top: 4px;">
        ${staffList[0] ? staffList[0].name : 'N/A'} ($${staffList[0] ? staffList[0].totalRevenue.toFixed(2) : '0.00'})
      </div>
    </div>
  </div>

  <!-- Staff Sales Overview Table -->
  <h2>តារាងសង្ខេបចំណូលលក់តាមបុគ្គលិក (Staff Sales Summary Overview)</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 10%;" class="text-center">លំដាប់</th>
        <th>ឈ្មោះបុគ្គលិក (Staff Name)</th>
        <th class="text-center" style="width: 25%;">ចំនួនកម្មង់ (Order Count)</th>
        <th class="text-right" style="width: 35%;">ចំណូលសរុប (Total Revenue)</th>
      </tr>
    </thead>
    <tbody>
  `;

  staffList.forEach((staff, index) => {
    html += `
      <tr>
        <td class="text-center bold">${index + 1}</td>
        <td class="bold">${staff.name}</td>
        <td class="text-center">${staff.orderCount}</td>
        <td class="text-right bold" style="color: #2b6cb0;">$${staff.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>`;
  });

  html += `
    </tbody>
  </table>

  <div class="page-break"></div>

  <!-- Detailed Sales Breakdown by Employee -->
  <h2>របាយការណ៍ទំនិញលក់បានលម្អិតតាមបុគ្គលិក (Detailed Product Sales by Employee)</h2>
  `;

  staffList.forEach(staff => {
    html += `
    <div class="staff-card">
      <div class="staff-card-header">
        <div class="staff-card-title">👤 ${staff.name} (ចំនួនកម្មង់៖ ${staff.orderCount})</div>
        <div class="staff-card-revenue">លក់សរុប៖ $${staff.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      </div>
      
      <table>
        <thead>
          <tr>
            <th style="width: 20%;">SKU</th>
            <th>ឈ្មោះទំនិញ (Product Name)</th>
            <th class="text-center" style="width: 20%;">ចំនួនលក់បាន (Qty Sold)</th>
            <th class="text-right" style="width: 25%;">ចំណូលលក់បាន (Revenue)</th>
          </tr>
        </thead>
        <tbody>
    `;

    const items = Object.values(staff.itemsSold);
    // Sort items by quantity descending
    items.sort((a, b) => b.qty - a.qty);

    if (items.length === 0) {
      html += `
          <tr>
            <td colspan="4" class="text-center" style="color: #a0aec0; font-style: italic;">(គ្មានការលក់ទំនិញជាក់លាក់ទេ)</td>
          </tr>`;
    } else {
      items.forEach(item => {
        html += `
          <tr>
            <td><span class="sku-badge">${item.sku}</span></td>
            <td class="bold">${item.nameKh} <br><span style="font-size:10px; color:#718096; font-weight: normal;">${item.nameEn}</span></td>
            <td class="text-center bold">${item.qty}</td>
            <td class="text-right bold" style="color: #2f855a;">$${item.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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

  const htmlPath = path.join("C:", "Users", "nouen", ".gemini", "antigravity", "brain", "4e4bb2b4-85c4-4cdd-a717-9c24db0318c6", "scratch", "july_staff_sales_summary.html");
  fs.writeFileSync(htmlPath, html);
  console.log(`HTML generated successfully at: ${htmlPath}`);

  // Copy HTML to workspace
  const workspaceHtmlPath = "c:\\Users\\nouen\\OneDrive\\Desktop\\khmer-pos-system\\July_Staff_Sales_Summary_Report.html";
  fs.copyFileSync(htmlPath, workspaceHtmlPath);
  console.log(`HTML copied to workspace: ${workspaceHtmlPath}`);

  // Call Edge CLI to print to PDF
  const workspacePdfPath = "c:\\Users\\nouen\\OneDrive\\Desktop\\khmer-pos-system\\July_Staff_Sales_Summary_Report.pdf";
  const artifactPdfPath = "C:\\Users\\nouen\\.gemini\\antigravity\\brain\\4e4bb2b4-85c4-4cdd-a717-9c24db0318c6\\July_Staff_Sales_Summary_Report.pdf";
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
