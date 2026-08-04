const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

async function run() {
  const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const brainDir = "C:\\Users\\nouen\\.gemini\\antigravity\\brain\\4e4bb2b4-85c4-4cdd-a717-9c24db0318c6";
  const workspaceDir = "c:\\Users\\nouen\\OneDrive\\Desktop\\khmer-pos-system";

  console.log("Generating Invoice Template HTML...");

  // 1. Invoice Template HTML
  const invoiceHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ABC System Sale Invoice</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Kantumruy+Pro:wght@400;500;600;700&display=swap');
    
    body {
      font-family: 'Inter', 'Kantumruy Pro', 'Khmer OS Battambang', sans-serif;
      margin: 40px;
      color: #2d3748;
      line-height: 1.6;
      background-color: #ffffff;
    }
    
    .invoice-header {
      display: flex;
      justify-content: space-between;
      border-bottom: 2px solid #2b6cb0;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    
    .company-logo {
      font-family: 'Kantumruy Pro', sans-serif;
      color: #2b6cb0;
      font-size: 24px;
      font-weight: 700;
      margin: 0;
    }
    
    .company-sub {
      font-size: 12px;
      color: #718096;
    }
    
    .invoice-title {
      text-align: right;
    }
    
    .invoice-title h1 {
      font-family: 'Kantumruy Pro', sans-serif;
      color: #1a365d;
      font-size: 26px;
      margin: 0 0 5px 0;
      font-weight: 700;
    }
    
    .invoice-title p {
      font-size: 13px;
      color: #4a5568;
      margin: 0;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-bottom: 40px;
      font-size: 13px;
    }
    
    .info-section h3 {
      font-family: 'Kantumruy Pro', sans-serif;
      color: #2b6cb0;
      font-size: 14px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 5px;
      margin-top: 0;
      margin-bottom: 10px;
    }
    
    .info-section p {
      margin: 4px 0;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-bottom: 30px;
    }
    
    th {
      background-color: #ebf8ff;
      color: #2b6cb0;
      text-align: left;
      padding: 12px 10px;
      font-weight: 700;
      border: 1px solid #cbd5e0;
      font-size: 11px;
    }
    
    td {
      padding: 10px;
      border: 1px solid #cbd5e0;
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
    
    .totals-table {
      width: 40%;
      float: right;
      margin-bottom: 30px;
    }
    
    .totals-table td {
      border: none;
      padding: 6px 10px;
    }
    
    .totals-table tr.grand-total {
      border-top: 2px solid #2b6cb0;
      font-size: 14px;
    }
    
    .payment-instructions {
      clear: both;
      background-color: #f7fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 40px;
      font-size: 12px;
    }
    
    .payment-instructions h3 {
      font-family: 'Kantumruy Pro', sans-serif;
      color: #1a365d;
      margin-top: 0;
      margin-bottom: 10px;
    }
    
    .qr-area {
      display: flex;
      align-items: center;
      gap: 20px;
      margin-top: 15px;
    }
    
    .qr-box {
      width: 100px;
      height: 100px;
      border: 1px solid #cbd5e0;
      background-color: #edf2f7;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: #a0aec0;
      font-weight: bold;
      border-radius: 6px;
    }
    
    .sign-section {
      display: flex;
      justify-content: space-between;
      margin-top: 60px;
      font-size: 12px;
    }
    
    .signature-block {
      text-align: center;
      width: 200px;
    }
    
    .signature-line {
      border-bottom: 1px solid #a0aec0;
      margin-bottom: 8px;
      height: 60px;
    }
    
    @media print {
      body {
        margin: 20px;
        font-size: 11px;
      }
      .payment-instructions {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>

  <!-- Invoice Header -->
  <div class="invoice-header">
    <div>
      <div class="company-logo">ABC SYSTEM</div>
      <div class="company-sub">POS, ERP & CRM Solutions Provider</div>
      <p style="font-size:11px; margin: 5px 0 0 0; color:#718096;">
        Email: contact@abcsystem.com | Tel: 096 322 2604
      </p>
    </div>
    <div class="invoice-title">
      <h1>វិក្កយបត្រ (INVOICE)</h1>
      <p>លេខវិក្កយបត្រ៖ <strong>INV-SYS-2026-0001</strong></p>
      <p>កាលបរិច្ឆេទ៖ <strong>${new Date().toISOString().split('T')[0]}</strong></p>
    </div>
  </div>

  <!-- Billing Info -->
  <div class="info-grid">
    <div class="info-section">
      <h3>ព័ត៌មានអតិថិជន (BILL TO)</h3>
      <p class="bold" style="font-size: 14px;">[ឈ្មោះក្រុមហ៊ុន ឬហាងអតិថិជន / Client Store Name]</p>
      <p><strong>អ្នកតំណាង៖</strong> [ឈ្មោះអ្នកទាក់ទង / Contact Person Name]</p>
      <p><strong>លេខទូរស័ព្ទ៖</strong> [លេខទូរស័ព្ទ / Phone Number]</p>
      <p><strong>អាសយដ្ឋាន៖</strong> [អាសយដ្ឋានហាង / Store Address]</p>
    </div>
    <div class="info-section">
      <h3>ព័ត៌មានការទូទាត់ (PAYMENT TERMS)</h3>
      <p><strong>លក្ខខណ្ឌទូទាត់៖</strong> Due on Receipt (បង់ពេលទទួលបានវិក្កយបត្រ)</p>
      <p><strong>វិធីទូទាត់៖</strong> ផ្ទេរប្រាក់តាមធនាគារ (ABA Bank / KHQR)</p>
      <p><strong>ថ្ងៃកំណត់បង់៖</strong> ភ្លាមៗ (Immediate)</p>
    </div>
  </div>

  <!-- Invoice Items Table -->
  <table>
    <thead>
      <tr>
        <th style="width: 5%;" class="text-center">ល.រ</th>
        <th style="width: 50%;">ពិពណ៌នាមុខទំនិញ / សេវាកម្ម (Description of Services)</th>
        <th style="width: 15%; text-align: center;">រយៈពេល/ចំនួន (Qty)</th>
        <th style="width: 15%; text-align: right;">តម្លៃរាយ (Unit Price)</th>
        <th style="width: 15%; text-align: right;">សរុប (Total)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="text-center">១</td>
        <td>
          <span class="bold">ប្រព័ន្ធគ្រប់គ្រងការលក់ ABC System - កញ្ចប់ធំ (Premium Subscription)</span><br>
          <span style="font-size:10px; color:#718096;">
            - រួមបញ្ចូលប្រព័ន្ធ POS លក់, គ្រប់គ្រងស្តុកលម្អិត (ERP), ប្រព័ន្ធ CRM ម៉ូយ, និង Telegram Attendance Bot
          </span>
        </td>
        <td class="text-center">១ ឆ្នាំ (1 Year)</td>
        <td class="text-right">$600.00</td>
        <td class="text-right bold">$600.00</td>
      </tr>
      <tr>
        <td class="text-center">២</td>
        <td>
          <span class="bold">សេវាដំឡើង និងបណ្តុះបណ្តាលបុគ្គលិក (Implementation & Staff Training)</span><br>
          <span style="font-size:10px; color:#718096;">
            - រួមបញ្ចូលការតភ្ជាប់ម៉ាស៊ីនព្រីនវិក្កយបត្រ, setup គណនីបុគ្គលិក និងការបង្រៀនឱ្យចេះប្រើប្រាស់
          </span>
        </td>
        <td class="text-center">១ លើក (Once)</td>
        <td class="text-right">$150.00</td>
        <td class="text-right bold">$150.00</td>
      </tr>
      <tr>
        <td class="text-center">៣</td>
        <td>
          <span class="bold">ការបញ្ចុះតម្លៃពិសេស (Yearly Promotion Discount)</span>
        </td>
        <td class="text-center">១ លើក</td>
        <td class="text-right">-$100.00</td>
        <td class="text-right bold" style="color: #e53e3e;">-$100.00</td>
      </tr>
    </tbody>
  </table>

  <!-- Totals -->
  <table class="totals-table">
    <tr>
      <td>សរុបរង (Subtotal):</td>
      <td class="text-right bold">$750.00</td>
    </tr>
    <tr>
      <td>បញ្ចុះតម្លៃ (Discount):</td>
      <td class="text-right bold" style="color: #e53e3e;">-$100.00</td>
    </tr>
    <tr class="grand-total">
      <td class="bold" style="color: #1a365d;">ទឹកប្រាក់សរុប (Grand Total):</td>
      <td class="text-right bold" style="color: #2b6cb0; font-size: 16px;">$650.00</td>
    </tr>
  </table>

  <div style="clear: both;"></div>

  <!-- Payment Instructions -->
  <div class="payment-instructions">
    <h3>💳 ព័ត៌មានផ្ទេរប្រាក់ (How to Pay)</h3>
    <p>សូមធ្វើការផ្ទេរប្រាក់មកកាន់គណនីធនាគារខាងក្រោម និងផ្ញើបង្កាន់ដៃមកយើងខ្ញុំវិញ៖</p>
    <div class="qr-area">
      <div class="qr-box">[ ស្កេន KHQR <br>ដើម្បីបង់ប្រាក់ ]</div>
      <div>
        <p><strong>ធនាគារ៖</strong> ធនាគារ អាស៊ីវីដា (ABA Bank)</p>
        <p><strong>ឈ្មោះគណនី៖</strong> [ឈ្មោះគណនីធនាគាររបស់អ្នក / Account Name]</p>
        <p><strong>លេខគណនី៖</strong> <code class="bold" style="font-size: 13px;">[លេខគណនីធនាគារ / Account Number]</code></p>
      </div>
    </div>
  </div>

  <!-- Signature Section -->
  <div class="sign-section">
    <div class="signature-block">
      <p>រៀបចំដោយ (Prepared By)</p>
      <div class="signature-line"></div>
      <p class="bold">Yuk Thetrinda</p>
      <p style="font-size: 10px; color: #a0aec0;">អ្នកតំណាងផ្នែកលក់</p>
    </div>
    <div class="signature-block">
      <p>អតិថិជនយល់ព្រម (Customer Approved)</p>
      <div class="signature-line"></div>
      <p class="bold">[ឈ្មោះអតិថិជន]</p>
      <p style="font-size: 10px; color: #a0aec0;">ហត្ថលេខា និងត្រាហាង</p>
    </div>
  </div>

  <div class="footer" style="margin-top: 50px;">
    សូមអរគុណចំពោះការគាំទ្រ និងប្រើប្រាស់សេវាកម្មរបស់ ABC System!
  </div>

</body>
</html>`;

  // 2. Owner Deployment Checklist HTML
  console.log("Generating Owner Action Checklist HTML...");
  const checklistHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ABC System Deployment Checklist</title>
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
      border-bottom: 3px solid #2f855a;
      padding-bottom: 15px;
      margin-bottom: 30px;
    }
    
    .header-container h1 {
      font-family: 'Kantumruy Pro', sans-serif;
      color: #22543d;
      font-size: 22px;
      margin: 0 0 5px 0;
      font-weight: 700;
    }
    
    .header-container .subtitle {
      font-size: 13px;
      color: #718096;
      margin: 0;
    }

    .section-title {
      font-family: 'Kantumruy Pro', sans-serif;
      color: #2f855a;
      font-size: 15px;
      background-color: #f0fff4;
      padding: 8px 12px;
      border-left: 5px solid #2f855a;
      margin-top: 30px;
      margin-bottom: 15px;
      font-weight: 600;
      border-radius: 0 4px 4px 0;
    }

    .todo-list {
      list-style-type: none;
      padding-left: 0;
      margin-bottom: 25px;
    }

    .todo-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 12px;
      font-size: 12px;
    }

    .checkbox {
      width: 16px;
      height: 16px;
      border: 2px solid #718096;
      border-radius: 3px;
      margin-right: 12px;
      margin-top: 2px;
      flex-shrink: 0;
    }

    .todo-content {
      flex-grow: 1;
    }

    .todo-title {
      font-weight: 600;
      color: #2d3748;
      margin-bottom: 2px;
    }

    .todo-desc {
      color: #718096;
      font-size: 11px;
    }

    .info-box {
      background-color: #ebf8ff;
      border-left: 4px solid #3182ce;
      padding: 15px;
      border-radius: 0 6px 6px 0;
      font-size: 12px;
      margin-bottom: 30px;
    }

    .info-box h4 {
      margin-top: 0;
      margin-bottom: 5px;
      color: #2b6cb0;
      font-weight: bold;
    }
    
    .page-break {
      page-break-before: always;
    }
    
    @media print {
      body {
        margin: 20px;
        font-size: 11px;
      }
      .todo-item {
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
    <h1>បញ្ជីការងាររៀបចំ និងផ្ទេរប្រព័ន្ធជូនអតិថិជន (Owner Setup & Handover Checklist)</h1>
    <div class="subtitle">ឯកសារណែនាំ និងជំហានការងារសម្រាប់ម្ចាស់ប្រព័ន្ធ ABC System យកទៅអនុវត្តពេលមានអតិថិជនថ្មី</div>
  </div>

  <div class="info-box">
    <h4>💡 អត្ថប្រយោជន៍នៃឯកសារនេះ៖</h4>
    ជំហានការងារទាំងនេះ នឹងធានាថា លោកអ្នកអាចដំឡើងប្រព័ន្ធជូនអតិថិជនថ្មីបានលឿន គ្មានកំហុសបច្ចេកទេស និងបង្ហាញពីភាពអាជីពខ្ពស់ក្នុងការថែទាំអតិថិជន។
  </div>

  <!-- Phase 1 -->
  <div class="section-title">វគ្គទី ១៖ ប្រមូលព័ត៌មាន និងតម្រូវការរបស់អតិថិជន (Requirement Gathering)</div>
  <ul class="todo-list">
    <li class="todo-item">
      <div class="checkbox"></div>
      <div class="todo-content">
        <div class="todo-title">ប្រមូលព័ត៌មានហាង និងសាខា (Store & Branch Details)</div>
        <div class="todo-desc">សួរនាំពីឈ្មោះហាងជាភាសាខ្មែរ/អង់គ្លេស, អាសយដ្ឋានហាង, លេខទូរស័ព្ទ និងចំនួនសាខាដែលត្រូវបង្កើត។</div>
      </div>
    </li>
    <li class="todo-item">
      <div class="checkbox"></div>
      <div class="todo-content">
        <div class="todo-title">ប្រមូលបញ្ជីមុខទំនិញ និងស្តុកដើម (Product Catalog & Initial Stock)</div>
        <div class="todo-desc">ឱ្យអតិថិជនរៀបចំបញ្ជីមុខទំនិញ (SKU, ឈ្មោះខ្មែរ/អង់គ្លេស, តម្លៃដើម, តម្លៃលក់, និងចំនួនស្តុកនៅក្នុងសាខានីមួយៗ)។</div>
      </div>
    </li>
    <li class="todo-item">
      <div class="checkbox"></div>
      <div class="todo-content">
        <div class="todo-title">ប្រមូលបញ្ជីឈ្មោះបុគ្គលិក និងគណនីធនាគារ (Staff List & Bank Accounts)</div>
        <div class="todo-desc">សួររកឈ្មោះបុគ្គលិកដែលត្រូវប្រើប្រព័ន្ធ, លេខ Telegram ID របស់ពួកគេ (សម្រាប់ស្កេនវត្តមាន) និងលេខគណនីធនាគារ ABA របស់ហាងសម្រាប់ទទួលលុយ។</div>
      </div>
    </li>
  </ul>

  <!-- Phase 2 -->
  <div class="section-title">វគ្គទី ២៖ ការរៀបចំផ្នែកបច្ចេកទេស (Technical & System Setup)</div>
  <ul class="todo-list">
    <li class="todo-item">
      <div class="checkbox"></div>
      <div class="todo-content">
        <div class="todo-title">បង្កើត Database Firebase និងគម្រោង Vercel ថ្មី (Firebase & Vercel Initialization)</div>
        <div class="todo-desc">បង្កើត Firebase project ថ្មីដាច់ដោយឡែកសម្រាប់អតិថិជននោះ រួចទាញកូដពី GitHub ទៅ Deploy លើ Vercel របស់ពួកគេ (ប្រសិនបើប្រើជម្រើសបំបែក Server ដាច់ពីគ្នា)។</div>
      </div>
    </li>
    <li class="todo-item">
      <div class="checkbox"></div>
      <div class="todo-content">
        <div class="todo-title">បញ្ចូលទិន្នន័យដំបូងទៅក្នុង Firestore (Data Seeding)</div>
        <div class="todo-desc">ប្រើប្រាស់កូដ Script ដើម្បីបញ្ចូល (Seed) ទិន្នន័យទំនិញ, សាខា, បុគ្គលិក, និងគណនីធនាគារ ទៅក្នុង Firestore Database របស់អតិថិជន។</div>
      </div>
    </li>
    <li class="todo-item">
      <div class="checkbox"></div>
      <div class="todo-content">
        <div class="todo-title">បង្កើត និងភ្ជាប់ Telegram Bot (Telegram Bot Setup)</div>
        <div class="todo-desc">បង្កើត Telegram Bot ថ្មីតាម BotFather (មួយសម្រាប់ HR/Attendance និងមួយទៀតសម្រាប់ Sales WebApp Store) រួចយក Token ទៅបញ្ចូលក្នុងប្រព័ន្ធកំណត់ Settings របស់ពួកគេ។</div>
      </div>
    </li>
  </ul>

  <div class="page-break"></div>

  <!-- Phase 3 -->
  <div class="section-title">វគ្គទី ៣៖ ការដំឡើង និងតភ្ជាប់ឧបករណ៍នៅហាងផ្ទាល់ (Hardware Onsite Integration)</div>
  <ul class="todo-list">
    <li class="todo-item">
      <div class="checkbox"></div>
      <div class="todo-content">
        <div class="todo-title">ដំឡើង និងតភ្ជាប់ម៉ាស៊ីនព្រីនវិក្កយបត្រ (Receipt Printer Setup)</div>
        <div class="todo-desc">ភ្ជាប់ម៉ាស៊ីនព្រីនកំដៅទៅនឹងកុំព្យូទ័រ ឬ iPad របស់ហាងតាមរយៈ USB/Bluetooth ឬ Network រួចធ្វើការ Test ព្រីនចេញពីកម្មវិធី POS ដើម្បីផ្ទៀងផ្ទាត់ទំហំក្រដាស (80mm/58mm) និងភាសាខ្មែរ។</div>
      </div>
    </li>
    <li class="todo-item">
      <div class="checkbox"></div>
      <div class="todo-content">
        <div class="todo-title">ដំឡើងម៉ាស៊ីនស្កេនបាកូដ (Barcode Scanner Test)</div>
        <div class="todo-desc">ដោតភ្ជាប់ម៉ាស៊ីនស្កេន រួចតេស្តស្កេនលេខកូដទំនិញនៅលើផ្ទាំង POS ធានាថាវាដំណើរការស្វែងរកមុខទំនិញបានលឿន និងត្រឹមត្រូវ។</div>
      </div>
    </li>
  </ul>

  <!-- Phase 4 -->
  <div class="section-title">វគ្គទី ៤៖ ការបណ្តុះបណ្តាល និងប្រគល់ប្រព័ន្ធ (User Training & Handover)</div>
  <ul class="todo-list">
    <li class="todo-item">
      <div class="checkbox"></div>
      <div class="todo-content">
        <div class="todo-title">បណ្តុះបណ្តាលបុគ្គលិកលក់ និងអ្នកគ្រប់គ្រងស្តុក (Staff Hands-on Training)</div>
        <div class="todo-desc">ចំណាយពេល ១ ទៅ ២ ម៉ោងបង្រៀនបុគ្គលិកឱ្យចេះស្កេនវត្តមានការងារ, របៀបលក់កាត់ស្តុក, របៀបបញ្ចូលស្តុក និងកត់ត្រាការជំពាក់។</div>
      </div>
    </li>
    <li class="todo-item">
      <div class="checkbox"></div>
      <div class="todo-content">
        <div class="todo-title">ប្រគល់ឯកសារណែនាំ និងគណនី (Documents & Account Handover)</div>
        <div class="todo-desc">ផ្ញើសៀវភៅណែនាំការប្រើប្រាស់ (User Manual), វីដេអូបង្រៀនខ្លីៗ និងក្រដាសព័ត៌មានគណនី Admin/Passwords ជូនម្ចាស់ហាង។</div>
      </div>
    </li>
    <li class="todo-item">
      <div class="checkbox"></div>
      <div class="todo-content">
        <div class="todo-title">ស៊ីញ៉ូលើកិច្ចសន្យា និងទទួលការទូទាត់ (Contract Signing & Payment)</div>
        <div class="todo-desc">ឱ្យអតិថិជនចុះហត្ថលេខាទទួលប្រព័ន្ធ និងចុះហត្ថលេខាលើកិច្ចសន្យាសេវាកម្ម រួចទូទាត់ប្រាក់ថ្លៃដំឡើង និងជាវប្រចាំឆ្នាំ។</div>
      </div>
    </li>
  </ul>

  <!-- Footer -->
  <div class="footer">
    បញ្ជីការងារនេះត្រូវបានរៀបចំឡើងដោយស្វ័យប្រវត្តិចេញពីប្រព័ន្ធ ERP & POS របស់ក្រុមហ៊ុន ABC System<br>
    កាលបរិច្ឆេទបង្កើត៖ ${new Date().toISOString()}
  </div>

</body>
</html>`;

  // Write HTML files
  const invHtmlPath = path.join(brainDir, "scratch", "abc_system_invoice_template.html");
  const checkHtmlPath = path.join(brainDir, "scratch", "abc_system_deployment_checklist.html");
  
  fs.writeFileSync(invHtmlPath, invoiceHtml);
  fs.writeFileSync(checkHtmlPath, checklistHtml);
  
  console.log("HTML files generated successfully.");

  // Copy to workspace
  const workspaceInvHtml = path.join(workspaceDir, "ABC_System_Invoice_Template.html");
  const workspaceCheckHtml = path.join(workspaceDir, "ABC_System_Deployment_Checklist.html");
  fs.copyFileSync(invHtmlPath, workspaceInvHtml);
  fs.copyFileSync(checkHtmlPath, workspaceCheckHtml);

  // Generate PDFs using headless Edge
  console.log("Generating PDFs using Edge CLI...");
  const workspaceInvPdf = path.join(workspaceDir, "ABC_System_Invoice_Template.pdf");
  const workspaceCheckPdf = path.join(workspaceDir, "ABC_System_Deployment_Checklist.pdf");

  const artifactInvPdf = path.join(brainDir, "ABC_System_Invoice_Template.pdf");
  const artifactCheckPdf = path.join(brainDir, "ABC_System_Deployment_Checklist.pdf");

  const cmd1 = `"${edgePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${workspaceInvPdf}" "${invHtmlPath}"`;
  const cmd2 = `"${edgePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${workspaceCheckPdf}" "${checkHtmlPath}"`;

  exec(cmd1, (error, stdout, stderr) => {
    if (error) {
      console.error(`Edge CLI (Invoice) error: ${error.message}`);
      return;
    }
    console.log("Invoice PDF generated at: " + workspaceInvPdf);
    fs.copyFileSync(workspaceInvPdf, artifactInvPdf);
  });

  exec(cmd2, (error, stdout, stderr) => {
    if (error) {
      console.error(`Edge CLI (Checklist) error: ${error.message}`);
      return;
    }
    console.log("Checklist PDF generated at: " + workspaceCheckPdf);
    fs.copyFileSync(workspaceCheckPdf, artifactCheckPdf);
  });
}

run().catch(console.error);
