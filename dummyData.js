// Default initial data for ABC Enterprise POS & ERP System
window.POS_DUMMY_DATA = {
  users: [
    { id: "USR-001", username: "admin", password: "admin", role: "super_admin", name: "ABC Executive Super Admin", branchId: "BR-001", position: "Chief Executive Officer", status: "active", permissions: { view: true, add: true, edit: true, delete: true, export: true, approve: true }, pageName: "ABC Global HQ", pageId: "FB-HQ-001" },
    { id: "USR-002", username: "br-admin-pp", password: "password", role: "branch_admin", name: "Phnom Penh Manager", branchId: "BR-001", position: "PP Branch Manager", status: "active", permissions: { view: true, add: true, edit: true, delete: false, export: true, approve: true }, pageName: "ABC Phnom Penh Store", pageId: "FB-PP-101" },
    { id: "USR-003", username: "br-admin-sr", password: "password", role: "branch_admin", name: "Siem Reap Manager", branchId: "BR-002", position: "SR Branch Manager", status: "active", permissions: { view: true, add: true, edit: true, delete: false, export: true, approve: true }, pageName: "ABC Siem Reap Outlet", pageId: "FB-SR-201" },
    { id: "USR-004", username: "sales-pp", password: "password", role: "sales_staff", name: "Chantra POS Cashier", branchId: "BR-001", position: "Junior Cashier", status: "active", permissions: { view: true, add: true, edit: false, delete: false, export: false, approve: false }, pageName: "ABC Phnom Penh Store", pageId: "FB-PP-101" },
    { id: "USR-005", username: "sales-sr", password: "password", role: "sales_staff", name: "Vannak POS Cashier", branchId: "BR-002", position: "Senior Sales Rep", status: "active", permissions: { view: true, add: true, edit: false, delete: false, export: false, approve: false }, pageName: "ABC Siem Reap Outlet", pageId: "FB-SR-201" },
    { id: "USR-006", username: "warehouse-pp", password: "password", role: "warehouse_staff", name: "Kosal Stocks Keeper", branchId: "BR-001", position: "Inventory Controller", status: "active", permissions: { view: true, add: true, edit: true, delete: false, export: true, approve: false } },
    { id: "USR-007", username: "acct", password: "password", role: "accountant", name: "Sreypich Lead Accountant", branchId: "BR-001", position: "Finance Accountant", status: "active", permissions: { view: true, add: true, edit: true, delete: false, export: true, approve: true } }
  ],

  branches: [
    { id: "BR-001", code: "B-PP", name: "Phnom Penh HQ", nameKh: "ទីស្នាក់ការកណ្តាល ភ្នំពេញ", address: "Veng Sreng Blvd, Phnom Penh", phone: "023-888-111", manager: "Phnom Penh Manager", status: "active", startingCapital: 15000 },
    { id: "BR-002", code: "B-SR", name: "Siem Reap Branch", nameKh: "សាខាខេត្តសៀមរាប", address: "Pub Street Area, Siem Reap", phone: "063-777-222", manager: "Siem Reap Manager", status: "active", startingCapital: 8000 },
    { id: "BR-003", code: "B-SHV", name: "Sihanoukville Branch", nameKh: "សាខាខេត្តព្រះសីហនុ", address: "Ekareach Street, Sihanoukville", phone: "034-666-333", manager: "Unassigned Manager", status: "active", startingCapital: 5000 }
  ],

  customers: [
    { id: "CST-001", name: "General Customer", phone: "-", address: "-", source: "Walk-In", outstandingDebt: 0.00, status: "active", notes: "Default walking client", rank: "Bronze" },
    { id: "CST-002", name: "Kiri Sok", phone: "012-777-777", address: "BKK1, Phnom Penh", source: "Facebook Page", outstandingDebt: 12.50, status: "active", notes: "VIP client from FB ad campaign", rank: "Silver" },
    { id: "CST-003", name: "Sopheap Meas", phone: "099-333-333", address: "Tuol Kork, Phnom Penh", source: "Telegram Channel", outstandingDebt: 0.00, status: "active", notes: "Prefers bank transfers on checkout", rank: "Gold" },
    { id: "CST-004", name: "Bora Lim", phone: "088-555-444", address: "Wat Bo, Siem Reap", source: "Website", outstandingDebt: 45.00, status: "active", notes: "Orders frequently, check stock thresholds", rank: "Bronze" }
  ],

  brands: [
    { id: "BR-001", name: "Coca-Cola" },
    { id: "BR-002", name: "Angkor" },
    { id: "BR-003", name: "Mama" },
    { id: "BR-004", name: "Anker" },
    { id: "BR-005", name: "Lays" },
    { id: "BR-006", name: "Other" }
  ],

  units: [
    { id: "UN-001", name: "Can", nameKh: "កំប៉ុង" },
    { id: "UN-002", name: "Bottle", nameKh: "ដប" },
    { id: "UN-003", name: "Pack", nameKh: "កេស" },
    { id: "UN-004", name: "Pcs", nameKh: "គ្រាប់" }
  ],

  categories: [
    { id: "beverages", nameEn: "Beverages", nameKh: "ភេសជ្ជៈ" },
    { id: "food", nameEn: "Food & Snacks", nameKh: "អាហារ និងអាហារសម្រន់" },
    { id: "grocery", nameEn: "Grocery", nameKh: "ទំនិញប្រចាំថ្ងៃ" },
    { id: "electronics", nameEn: "Electronics", nameKh: "គ្រឿងអេឡិចត្រូនិច" },
    { id: "clothing", nameEn: "Clothing", nameKh: "សម្លៀកបំពាក់" },
    { id: "other", nameEn: "Other", nameKh: "ផ្សេងៗ" }
  ],

  products: [
    {
      sku: "BEV-001",
      barcode: "8841001001",
      nameEn: "Coca-Cola Can 330ml",
      nameKh: "ទឹកក្រូច កូកាកូឡា កំប៉ុង",
      category: "beverages",
      brand: "Coca-Cola",
      unit: "Can",
      costPrice: 0.35,
      sellingPrice: 0.60,
      stockQty: 140,
      minStock: 20,
      status: "active",
      description: "Original Taste Coca-cola beverage can",
      warehouseStock: { "BR-001": 80, "BR-002": 40, "BR-003": 20 }
    },
    {
      sku: "BEV-002",
      barcode: "8841001002",
      nameEn: "Angkor Beer Can 330ml",
      nameKh: "ស្រាបៀរ អង្គរ កំប៉ុង",
      category: "beverages",
      brand: "Angkor",
      unit: "Can",
      costPrice: 0.50,
      sellingPrice: 0.85,
      stockQty: 105,
      minStock: 15,
      status: "active",
      description: "Angkor premium national beer can",
      warehouseStock: { "BR-001": 50, "BR-002": 35, "BR-003": 20 }
    },
    {
      sku: "BEV-003",
      barcode: "8841001003",
      nameEn: "Kulen Mineral Water 1.5L",
      nameKh: "ទឹកបរិសុទ្ធ គូលែន ១.៥លីត្រ",
      category: "beverages",
      brand: "Other",
      unit: "Bottle",
      costPrice: 0.25,
      sellingPrice: 0.50,
      stockQty: 15,
      minStock: 15,
      status: "active",
      description: "Natural mineral spring water from Kulen mountain",
      warehouseStock: { "BR-001": 5, "BR-002": 5, "BR-003": 5 }
    },
    {
      sku: "FOOD-001",
      barcode: "8842001001",
      nameEn: "Mama Instant Noodles Pork 30-Pack",
      nameKh: "មីម៉ាម៉ា រសជាតិសាច់ជ្រូក ១កេស",
      category: "food",
      brand: "Mama",
      unit: "Pack",
      costPrice: 4.80,
      sellingPrice: 6.20,
      stockQty: 55,
      minStock: 10,
      status: "active",
      description: "Mama brand pork flavour instant noodles box",
      warehouseStock: { "BR-001": 30, "BR-002": 15, "BR-003": 10 }
    },
    {
      sku: "FOOD-002",
      barcode: "8842001002",
      nameEn: "Lays Potato Chips Classic 50g",
      nameKh: "ដំឡូងបារាំងបំពង Lays រសជាតិដើម",
      category: "food",
      brand: "Lays",
      unit: "Pack",
      costPrice: 0.70,
      sellingPrice: 1.20,
      stockQty: 70,
      minStock: 12,
      status: "active",
      description: "Classic salted potato chips pouch",
      warehouseStock: { "BR-001": 40, "BR-002": 20, "BR-003": 10 }
    },
    {
      sku: "GROC-001",
      barcode: "8843001001",
      nameEn: "Jasmine Rice Premium 5kg",
      nameKh: "អង្ករផ្ការំដួល ៥គីឡូក្រាម",
      category: "grocery",
      brand: "Other",
      unit: "Pack",
      costPrice: 4.20,
      sellingPrice: 5.80,
      stockQty: 35,
      minStock: 8,
      status: "active",
      description: "Premium Cambodian Jasmine Rice",
      warehouseStock: { "BR-001": 20, "BR-002": 10, "BR-003": 5 }
    },
    {
      sku: "ELEC-001",
      barcode: "8844001001",
      nameEn: "Anker USB-C Fast Charger 20W",
      nameKh: "ក្បាលសាកថ្មល្បឿនលឿន Anker ២០វ៉ាត់",
      category: "electronics",
      brand: "Anker",
      unit: "Pcs",
      costPrice: 7.50,
      sellingPrice: 12.00,
      stockQty: 23,
      minStock: 5,
      status: "active",
      description: "Fast charging adapter for smart phones",
      warehouseStock: { "BR-001": 10, "BR-002": 8, "BR-003": 5 }
    }
  ],

  staff: [
    { id: "STF-001", name: "Sokhom Phalla", role: "Senior Cashier / PP Staff", baseSalary: 280.00, commissionRate: 3.0, branchId: "BR-001" },
    { id: "STF-002", name: "Chanthou Pich", role: "Sales Rep / SR Staff", baseSalary: 200.00, commissionRate: 5.0, branchId: "BR-002" },
    { id: "STF-003", name: "Dara Kimsour", role: "Junior Cashier / PP Staff", baseSalary: 240.00, commissionRate: 2.0, branchId: "BR-001" }
  ],

  transactions: [
    {
      id: "TX-1001",
      invoiceNo: "INV-2026-0001",
      date: "2026-05-18T10:15:30Z",
      staffId: "STF-001",
      staffName: "Sokhom Phalla",
      customerId: "CST-001",
      customerName: "General Customer",
      branchId: "BR-001",
      items: [
        { sku: "BEV-001", nameEn: "Coca-Cola Can 330ml", nameKh: "ទឹកក្រូច កូកាកូឡា កំប៉ុង", price: 0.60, qty: 10, total: 6.00 },
        { sku: "FOOD-001", nameEn: "Mama Instant Noodles Pork 30-Pack", nameKh: "មីម៉ាម៉ា រសជាតិសាច់ជ្រូក ១កេស", price: 6.20, qty: 5, total: 31.00 }
      ],
      subtotal: 37.00,
      discountPercent: 0,
      discountFixed: 2.00,
      shippingFee: 1.50,
      taxRate: 10,
      taxAmount: 3.50,
      total: 40.00,
      paymentMethod: "cash",
      cashReceived: 50.00,
      changeDue: 10.00,
      outstandingDebt: 0.00,
      status: "completed"
    },
    {
      id: "TX-1002",
      invoiceNo: "INV-2026-0002",
      date: "2026-05-19T14:30:15Z",
      staffId: "STF-002",
      staffName: "Chanthou Pich",
      customerId: "CST-002",
      customerName: "Kiri Sok",
      branchId: "BR-002",
      items: [
        { sku: "GROC-001", nameEn: "Jasmine Rice Premium 5kg", nameKh: "អង្ករផ្ការំដួល ៥គីឡូក្រាម", price: 5.80, qty: 5, total: 29.00 },
        { sku: "ELEC-001", nameEn: "Anker USB-C Fast Charger 20W", nameKh: "ក្បាលសាកថ្មល្បឿនលឿន Anker ២០វ៉ាត់", price: 12.00, qty: 2, total: 24.00 }
      ],
      subtotal: 53.00,
      discountPercent: 5,
      discountFixed: 0.00,
      shippingFee: 2.50,
      taxRate: 10,
      taxAmount: 5.04,
      total: 57.89,
      paymentMethod: "khqr",
      cashReceived: 57.89,
      changeDue: 0.00,
      outstandingDebt: 0.00,
      status: "completed"
    },
    {
      id: "TX-1003",
      invoiceNo: "INV-2026-0003",
      date: "2026-05-20T09:45:00Z",
      staffId: "STF-001",
      staffName: "Sokhom Phalla",
      customerId: "CST-002",
      customerName: "Kiri Sok",
      branchId: "BR-001",
      items: [
        { sku: "BEV-002", nameEn: "Angkor Beer Can 330ml", nameKh: "ស្រាបៀរ អង្គរ កំប៉ុង", price: 0.85, qty: 20, total: 17.00 },
        { sku: "FOOD-002", nameEn: "Lays Potato Chips Classic 50g", nameKh: "ដំឡូងបារាំងបំពង Lays រសជាតិដើម", price: 1.20, qty: 10, total: 12.00 }
      ],
      subtotal: 29.00,
      discountPercent: 0,
      discountFixed: 1.00,
      shippingFee: 0.00,
      taxRate: 10,
      taxAmount: 2.80,
      total: 30.80,
      paymentMethod: "bank",
      cashReceived: 20.00,
      changeDue: 0.00,
      outstandingDebt: 10.80,
      status: "completed"
    }
  ],

  expenses: [
    { id: "EXP-1001", date: "2026-05-05T08:00:00Z", category: "rent", amount: 150.00, description: "Monthly Shop Rent B-PP", branchId: "BR-001" },
    { id: "EXP-1002", date: "2026-05-10T15:30:00Z", category: "electricity", amount: 45.20, description: "EDC electricity bill B-SR", branchId: "BR-002" },
    { id: "EXP-1003", date: "2026-05-15T09:00:00Z", category: "water", amount: 12.50, description: "PPWSA Clean water usage", branchId: "BR-001" },
    { id: "EXP-1004", date: "2026-05-16T11:00:00Z", category: "marketing", amount: 25.00, description: "Facebook ads boost for Siem Reap shop launch", branchId: "BR-002" }
  ],

  stockLogs: [
    { id: "SLG-1001", date: "2026-05-15T08:00:00Z", sku: "BEV-001", type: "replenishment", qty: 140, warehouseId: "BR-001", description: "Initial setup load" },
    { id: "SLG-1002", date: "2026-05-15T08:10:00Z", sku: "BEV-001", type: "transfer", qty: -40, warehouseId: "BR-001", description: "Transferred to Siem Reap Shop" },
    { id: "SLG-1003", date: "2026-05-15T08:10:00Z", sku: "BEV-001", type: "transfer", qty: 40, warehouseId: "BR-002", description: "Received from Phnom Penh HQ" },
    { id: "SLG-1004", date: "2026-05-18T10:15:30Z", sku: "BEV-001", type: "sale", qty: -10, warehouseId: "BR-001", description: "Sold via TX-1001" }
  ],

  paymentLogs: [
    { id: "PAY-1001", date: "2026-05-20T10:00:00Z", customerId: "CST-002", customerName: "Kiri Sok", amount: 5.00, paymentMethod: "cash", notes: "Partial debt payoff" }
  ],

  followups: [
    {
      id: "FLP-001",
      saleId: "TX-1002",
      customerId: "CST-002",
      customerName: "Kiri Sok",
      salesStaffId: "STF-002",
      salesStaffName: "Chanthou Pich",
      schedules: [
        { day: 3, date: "2026-05-22T14:30:15Z", type: "satisfaction", status: "completed", notes: "Customer loves the new Jasmine Rice quality!" },
        { day: 5, date: "2026-05-24T14:30:15Z", type: "feedback", status: "pending", notes: "" },
        { day: 8, date: "2026-05-27T14:30:15Z", type: "promo", status: "pending", notes: "" }
      ]
    },
    {
      id: "FLP-002",
      saleId: "TX-1003",
      customerId: "CST-002",
      customerName: "Kiri Sok",
      salesStaffId: "STF-001",
      salesStaffName: "Sokhom Phalla",
      schedules: [
        { day: 3, date: "2026-05-23T09:45:00Z", type: "satisfaction", status: "pending", notes: "" },
        { day: 5, date: "2026-05-25T09:45:00Z", type: "feedback", status: "pending", notes: "" },
        { day: 8, date: "2026-05-28T09:45:00Z", type: "promo", status: "pending", notes: "" }
      ]
    }
  ],

  commissionRules: {
    monthlyTargetUnits: 300,
    tiers: [
      { minUnits: 1, maxUnits: 299, ratePercent: 1.5 },
      { minUnits: 300, maxUnits: 500, ratePercent: 3.0 },
      { minUnits: 501, maxUnits: 700, ratePercent: 5.0 },
      { minUnits: 701, maxUnits: 9999, ratePercent: 7.5 }
    ]
  },

  companySettings: {
    companyName: "ABC System",
    email: "info@aroma-business.com.kh",
    phone: "+855 (0) 23 999 555",
    address: "St. 310, BKK1, Phnom Penh, Cambodia",
    logoBase64: "",
    defaultVatRate: 10,
    vatEnabled: true,
    invoicePrefix: "INV-2026-",
    currency: "USD",
    notificationEnabled: true,
    featuresEnabled: {
      pos: true,
      inventory: true,
      branches: true,
      customers: true,
      followups: true,
      performance: true,
      finance: true,
      staff: true,
      reports: true,
      auditLog: true
    }
  },

  closingLogs: [],
  auditLogs: [
    { id: "AUD-001", timestamp: "2026-06-01T09:00:00Z", username: "admin", actionType: "logIn", activityDetails: "Admin logged into Phnom Penh HQ" }
  ],
  voidedTransactions: []
};
