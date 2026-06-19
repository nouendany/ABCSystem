// ABC System Enterprise POS & ERP System Logic
(function() {
  // Global memory fallbacks if LocalStorage/SessionStorage are blocked
  const memoryStorage = {};
  const memorySessionStorage = {};

  function safeGetItem(key, fallback = null) {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? val : fallback;
    } catch (e) {
      console.warn(`LocalStorage read failed for "${key}", using memory storage fallback:`, e);
      return memoryStorage[key] !== undefined ? memoryStorage[key] : fallback;
    }
  }

  function safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`LocalStorage write failed for "${key}", using memory storage fallback:`, e);
      memoryStorage[key] = String(value);
    }
  }

  function safeRemoveItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`LocalStorage remove failed for "${key}", using memory storage fallback:`, e);
      delete memoryStorage[key];
    }
  }

  function safeGetSessionItem(key, fallback = null) {
    try {
      const val = sessionStorage.getItem(key);
      return val !== null ? val : fallback;
    } catch (e) {
      console.warn(`SessionStorage read failed for "${key}", using memory storage fallback:`, e);
      return memorySessionStorage[key] !== undefined ? memorySessionStorage[key] : fallback;
    }
  }

  function safeSetSessionItem(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch (e) {
      console.warn(`SessionStorage write failed for "${key}", using memory storage fallback:`, e);
      memorySessionStorage[key] = String(value);
    }
  }

  function safeRemoveSessionItem(key) {
    try {
      sessionStorage.removeItem(key);
    } catch (e) {
      console.warn(`SessionStorage remove failed for "${key}", using memory storage fallback:`, e);
      delete memorySessionStorage[key];
    }
  }

  // Auto-migrate old local storage database keys from geda_ to abc_
  const migrateKeys = [
    'lang', 'theme', 'users', 'branches', 'customers', 'brands', 'units', 
    'categories', 'products', 'staff', 'transactions', 'expenses', 'stock_logs', 
    'payment_logs', 'followups', 'commission_rules', 'company_settings', 
    'voided_transactions', 'closing_logs', 'audit_logs', 'current_user'
  ];
  migrateKeys.forEach(key => {
    const oldVal = safeGetItem('geda_' + key);
    const newVal = safeGetItem('abc_' + key);
    if (oldVal !== null && newVal === null) {
      safeSetItem('abc_' + key, oldVal);
    }
  });
  const state = {
    lang: safeGetItem('abc_lang') || 'en',
    theme: safeGetItem('abc_theme') || 'dark',
    activeView: 'view-dashboard',
    activeSettingTab: 'company',
    activeReportTab: 'prodReport',
    hideFollowupRoadmap: safeGetItem('abc_hide_followup_roadmap') === 'true',
    
    // DB Collections
    users: [],
    branches: [],
    customers: [],
    brands: [],
    units: [],
    categories: [],
    products: [],
    staff: [],
    transactions: [],
    expenses: [],
    stockLogs: [],
    paymentLogs: [],
    followups: [],
    commissionRules: {},
    companySettings: {},
    voidedTransactions: [],
    employees: [],
    attendance: [],
    leaveRequests: [],
    companies: [],
    departments: [],
    teams: [],
    positions: [],
    payrollItems: [],
    kpis: [],

    // POS State
    cart: [],
    checkoutMethod: 'cash',
    activePOSCategory: 'all',
    currentPOSStaffId: '',
    selectedProductImageBase64: null,
    currentUser: null,
    
    // Date Filters
    reportStartDate: '',
    reportEndDate: '',

    // Performance tab filters
    perfFilterEmployee: 'all',
    perfFilterRange: 'all',
    perfFilterStart: '',
    perfFilterEnd: '',

    // Chart.js instances
    revenueChart: null,
    branchChart: null,
    employeeChart: null,
    pageChart: null
  };

  let lastSyncedState = {
    users: [],
    branches: [],
    customers: [],
    products: [],
    staff: [],
    transactions: [],
    expenses: [],
    stockLogs: [],
    paymentLogs: [],
    followups: [],
    employees: [],
    attendance: [],
    leaveRequests: [],
    companies: [],
    departments: [],
    teams: [],
    positions: [],
    payrollItems: [],
    kpis: []
  };

  let firebaseActive = false;

  const ROLE_ALLOWED_VIEWS = {
    super_admin: [
      'view-dashboard', 'view-pos', 'view-inventory', 'view-branches',
      'view-customers', 'view-followups', 'view-performance', 'view-finance',
      'view-staff', 'view-reports', 'view-settings'
    ],
    branch_admin: [
      'view-dashboard', 'view-pos', 'view-inventory', 'view-branches',
      'view-customers', 'view-followups', 'view-performance', 'view-finance',
      'view-staff', 'view-reports'
    ],
    sales_staff: [
      'view-dashboard', 'view-pos', 'view-customers', 'view-followups', 'view-performance'
    ],
    warehouse_staff: [
      'view-dashboard', 'view-inventory', 'view-branches'
    ],
    accountant: [
      'view-dashboard', 'view-finance', 'view-reports', 'view-staff', 'view-customers'
    ]
  };

  function isViewAccessible(targetView) {
    if (!state.currentUser) return false;
    if (state.currentUser.role === 'super_admin') return true;
    
    // Check if Custom Role Permissions Matrix allows 'view' for this role
    if (!checkPermission('view')) return false;

    const module = targetView.replace('view-', '');
    if (module === 'settings') return false;
    
    // 1. Check if the module is enabled globally
    const features = state.companySettings.featuresEnabled || {};
    if (features[module] === false) return false;
    
    // 2. Check if the role is allowed to see this view
    const role = state.currentUser.role;
    const isRoleAllowed = ROLE_ALLOWED_VIEWS[role] && ROLE_ALLOWED_VIEWS[role].includes(targetView);
    if (!isRoleAllowed) return false;
    
    return true;
  }

  // Helper: File Compression for Product Images
  function compressProductImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const max_size = 240;
        
        if (width > height) {
          if (width > max_size) {
            height *= max_size / width;
            width = max_size;
          }
        } else {
          if (height > max_size) {
            width *= max_size / height;
            height = max_size;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        callback(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Branch Access Control Filter Helpers
  function getFilteredTransactions() {
    if (!state.currentUser) return [];
    if (state.currentUser.role === 'super_admin') return state.transactions;
    return state.transactions.filter(t => t.branchId === state.currentUser.branchId);
  }

  function getFilteredExpenses() {
    if (!state.currentUser) return [];
    if (state.currentUser.role === 'super_admin') return state.expenses;
    return state.expenses.filter(e => e.branchId === state.currentUser.branchId);
  }

  function getFilteredStaff() {
    if (!state.currentUser) return [];
    if (state.currentUser.role === 'super_admin') return state.staff;
    return state.staff.filter(s => s.branchId === state.currentUser.branchId);
  }

  function getFilteredFollowups() {
    if (!state.currentUser) return [];
    if (state.currentUser.role === 'super_admin') return state.followups;
    return state.followups.filter(f => f.branchId === state.currentUser.branchId);
  }

  function getFilteredPaymentLogs() {
    if (!state.currentUser) return [];
    if (state.currentUser.role === 'super_admin') return state.paymentLogs;
    return state.paymentLogs.filter(p => p.branchId === state.currentUser.branchId);
  }

  function getFilteredStockLogs() {
    if (!state.currentUser) return [];
    if (state.currentUser.role === 'super_admin') return state.stockLogs;
    return state.stockLogs.filter(s => s.branchId === state.currentUser.branchId);
  }

  function getFilteredCustomers() {
    if (!state.currentUser) return [];
    if (state.currentUser.role === 'super_admin') return state.customers;
    return state.customers.filter(c => c.branchId === state.currentUser.branchId || c.id === 'CST-001');
  }

  function getFilteredUsers() {
    if (!state.currentUser) return [];
    if (state.currentUser.role === 'super_admin') return state.users;
    return state.users.filter(u => u.branchId === state.currentUser.branchId);
  }

  function getFilteredVoidedTransactions() {
    if (!state.currentUser) return [];
    if (state.currentUser.role === 'super_admin') return state.voidedTransactions;
    return state.voidedTransactions.filter(v => v.branchId === state.currentUser.branchId);
  }

  // Database LocalStorage Seeding
  function initLocalStorageData() {
    const seed = (key, fallback) => {
      const val = safeGetItem(key);
      if (!val || val === 'null' || val === 'undefined') {
        safeSetItem(key, JSON.stringify(fallback));
      }
    };

    const cleanUsers = [
      { id: "USR-001", username: "admin", password: "admin", role: "super_admin", name: "ABC Executive Super Admin", branchId: "BR-001", position: "Chief Executive Officer", status: "active", permissions: { view: true, add: true, edit: true, delete: true, export: true, approve: true } }
    ];

    const cleanBranches = [
      { id: "BR-001", code: "B-PP", name: "Phnom Penh HQ", nameKh: "ទីស្នាក់ការកណ្តាល ភ្នំពេញ", address: "Veng Sreng Blvd, Phnom Penh", phone: "023-888-111", manager: "Super Admin", status: "active", startingCapital: 10000 }
    ];

    const cleanCustomers = [
      { id: "CST-001", name: "General Customer", phone: "-", address: "-", source: "Walk-In", outstandingDebt: 0.00, status: "active", notes: "Default walking client", rank: "Bronze" }
    ];

    const cleanCompanySettings = {
      companyName: "ABC System",
      currency: "USD",
      defaultVatRate: 0,
      invoicePrefix: "INV-2026-",
      startingCapital: 10000,
      firebaseEnabled: true,
      firebaseConfig: ""
    };

    seed('abc_users', cleanUsers);
    seed('abc_branches', cleanBranches);
    seed('abc_customers', cleanCustomers);
    seed('abc_brands', window.POS_DUMMY_DATA.brands);
    seed('abc_units', window.POS_DUMMY_DATA.units);
    seed('abc_categories', window.POS_DUMMY_DATA.categories);
    seed('abc_products', []);
    seed('abc_staff', []);
    seed('abc_transactions', []);
    seed('abc_expenses', []);
    seed('abc_stock_logs', []);
    seed('abc_payment_logs', []);
    seed('abc_followups', []);
     const defaultCommissionRules = {
       monthlyTargetUnits: 300,
       tiers: [
         { minUnits: 1, maxUnits: 299, ratePercent: 1.5 },
         { minUnits: 300, maxUnits: 500, ratePercent: 3.0 },
         { minUnits: 501, maxUnits: 700, ratePercent: 5.0 },
         { minUnits: 701, maxUnits: 9999, ratePercent: 7.5 }
       ]
     };
     seed('abc_commission_rules', defaultCommissionRules);
    seed('abc_company_settings', cleanCompanySettings);
    seed('abc_voided_transactions', []);
    seed('abc_closing_logs', []);
    seed('abc_audit_logs', []);

    const safeParse = (key, fallback) => {
      try {
        const val = safeGetItem(key);
        if (!val || val === 'null' || val === 'undefined') return fallback;
        return JSON.parse(val) || fallback;
      } catch (e) {
        return fallback;
      }
    };

    state.users = safeParse('abc_users', []);

    // Migration: Update GEDA branding in user names
    let usersUpdated = false;
    state.users.forEach(u => {
      if (u.name && u.name.includes('GEDA')) {
        u.name = u.name.replace(/GEDA/g, 'ABC');
        usersUpdated = true;
      }
    });
    if (usersUpdated) {
      safeSetItem('abc_users', JSON.stringify(state.users));
      const savedUser = safeGetSessionItem('abc_current_user');
      if (savedUser) {
        const parsedUser = JSON.parse(savedUser);
        const matched = state.users.find(u => u.id === parsedUser.id);
        if (matched) {
          safeSetSessionItem('abc_current_user', JSON.stringify(matched));
        }
      }
    }

    state.branches = safeParse('abc_branches', []);
    state.customers = safeParse('abc_customers', []);
    state.brands = safeParse('abc_brands', []);
    state.units = safeParse('abc_units', []);
    state.categories = safeParse('abc_categories', []);
    state.products = safeParse('abc_products', []);
    state.staff = safeParse('abc_staff', []);
    state.transactions = safeParse('abc_transactions', []);
    state.expenses = safeParse('abc_expenses', []);
    state.stockLogs = safeParse('abc_stock_logs', []);
    state.paymentLogs = safeParse('abc_payment_logs', []);
    state.followups = safeParse('abc_followups', []);
    state.employees = safeParse('abc_employees', []);
    state.attendance = safeParse('abc_attendance', []);
    state.leaveRequests = safeParse('abc_leave_requests', []);
    state.companies = safeParse('abc_companies', []);
    state.departments = safeParse('abc_departments', []);
    state.teams = safeParse('abc_teams', []);
    state.positions = safeParse('abc_positions', []);
    state.payrollItems = safeParse('abc_payroll_items', []);
    state.kpis = safeParse('abc_kpis', []);
    state.commissionRules = safeParse('abc_commission_rules', {});
    state.companySettings = safeParse('abc_company_settings', {});
    if (state.companySettings.startingCapital === undefined) {
      state.companySettings.startingCapital = 10000;
    }
    if (!state.companySettings.customExpenseCategories || !Array.isArray(state.companySettings.customExpenseCategories)) {
      state.companySettings.customExpenseCategories = [];
    }
    if (!state.companySettings.companyName || 
        state.companySettings.companyName === 'GEDA Distribution Co., Ltd.' || 
        state.companySettings.companyName === 'GEDA System' || 
        state.companySettings.companyName === 'Aroma Business Core Value' || 
        state.companySettings.companyName === 'ABA' || 
        state.companySettings.companyName === 'ABA System') {
      state.companySettings.companyName = 'ABC System';
    }
    safeSetItem('abc_company_settings', JSON.stringify(state.companySettings));
    state.voidedTransactions = safeParse('abc_voided_transactions', []);
    state.closingLogs = safeParse('abc_closing_logs', []);
    state.auditLogs = safeParse('abc_audit_logs', []);

    // Align branch stock allocations
    state.products.forEach(p => {
      if (!p.warehouseStock || Array.isArray(p.warehouseStock)) {
        p.warehouseStock = {};
      }
      state.branches.forEach(b => {
        if (p.warehouseStock[b.id] === undefined) {
          p.warehouseStock[b.id] = 0;
        }
      });
      // Sum stockQty
      let sum = 0;
      for (const bId in p.warehouseStock) {
        sum += parseInt(p.warehouseStock[bId]) || 0;
      }
      p.stockQty = sum;
    });

    lastSyncedState = {
      users: JSON.parse(JSON.stringify(state.users)),
      branches: JSON.parse(JSON.stringify(state.branches)),
      customers: JSON.parse(JSON.stringify(state.customers)),
      products: JSON.parse(JSON.stringify(state.products)),
      staff: JSON.parse(JSON.stringify(state.staff)),
      transactions: JSON.parse(JSON.stringify(state.transactions)),
      expenses: JSON.parse(JSON.stringify(state.expenses)),
      stockLogs: JSON.parse(JSON.stringify(state.stockLogs)),
      paymentLogs: JSON.parse(JSON.stringify(state.paymentLogs)),
      followups: JSON.parse(JSON.stringify(state.followups)),
      employees: JSON.parse(JSON.stringify(state.employees)),
      attendance: JSON.parse(JSON.stringify(state.attendance)),
      leaveRequests: JSON.parse(JSON.stringify(state.leaveRequests))
    };

    // Check Theme
    document.body.className = state.theme === 'light' ? 'light-theme' : 'dark-theme';
    document.getElementById('btn-theme-toggle').innerText = state.theme === 'light' ? '☀ Light Mode' : '🌙 Dark Mode';

    // Active session
    const savedUser = safeGetSessionItem('abc_current_user');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      const actualUserObj = state.users.find(u => u.id === parsedUser.id);
      if (actualUserObj && actualUserObj.status !== 'suspended') {
        state.currentUser = actualUserObj; // Use fresh database copy
        document.getElementById('login-screen').classList.remove('active-login');
        updateUserCardHeader();
      } else {
        state.currentUser = null;
        safeRemoveSessionItem('abc_current_user');
        document.getElementById('login-screen').classList.add('active-login');
      }
    } else {
      state.currentUser = null;
      document.getElementById('login-screen').classList.add('active-login');
    }

    // Default dates
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];
    state.reportStartDate = firstDay;
    state.reportEndDate = today;
    document.getElementById('report-start-date').value = firstDay;
    document.getElementById('report-end-date').value = today;
    migrateCRMData();
    updateCompanyLogoUI();
  }

  function migrateCRMData() {
    state.followups.forEach(f => {
      // 1. If schedules are missing but we have nextFollowupDate, migrate to schedules-based structure
      if (!f.schedules || f.schedules.length === 0) {
        const schedules = [];
        const followUpDays = [3, 5, 7, 22, 37, 52, 82, 112, 142];
        const types = ['satisfaction', 'feedback', 'satisfaction', 'promo', 'engagement', 'engagement', 'engagement', 'promo', 'engagement'];
        
        const currentLvl = f.currentAlertLevel || 1;
        const nextDate = f.nextFollowupDate ? new Date(f.nextFollowupDate) : new Date();
        
        // Calculate estimated purchase date based on nextDate and the current level's offset
        const dayOffset = followUpDays[Math.min(currentLvl - 1, followUpDays.length - 1)];
        const purchaseDate = new Date(nextDate);
        purchaseDate.setDate(purchaseDate.getDate() - dayOffset);

        followUpDays.forEach((day, idx) => {
          const d = new Date(purchaseDate);
          d.setDate(d.getDate() + day);
          
          let status = 'pending';
          let notes = '';
          if (idx < currentLvl - 1) {
            status = 'completed';
            notes = 'Completed in legacy follow-up system';
          }
          
          schedules.push({
            day: day,
            date: d.toISOString(),
            type: types[idx],
            status: status,
            notes: notes
          });
        });
        f.schedules = schedules;
      }
      
      if (!f.history) f.history = [];
    });

    state.customers.forEach(c => {
      if (!c.timeline) c.timeline = [];
      if (!c.orders) c.orders = [];
      if (c.purchaseCount === undefined) {
        const txs = state.transactions.filter(t => t.customerId === c.id);
        c.purchaseCount = txs.length;
      }
      
      if (c.timeline.length === 0) {
        const flps = state.followups.filter(f => f.customerId === c.id);
        const entries = [];
        
        const txs = state.transactions.filter(t => t.customerId === c.id);
        txs.forEach(t => {
          const itemsDesc = t.items.map(item => `${item.nameEn || item.sku} x ${item.qty}`).join(', ');
          entries.push({
            date: t.date,
            status: 'Purchase',
            staffName: t.staffName || 'System',
            feedback: 'Purchase recorded',
            notes: `Purchased: ${itemsDesc}`
          });
        });
        
        flps.forEach(f => {
          if (f.history) {
            f.history.forEach(h => {
              entries.push(h);
            });
          }
        });
        
        entries.sort((a, b) => new Date(a.date) - new Date(b.date));
        c.timeline = entries;
      }
    });
    safeSetItem('abc_followups', JSON.stringify(state.followups));
    safeSetItem('abc_customers', JSON.stringify(state.customers));
    try { cleanupOldSelfies(); } catch(e) {}
  }

  function saveStateToLocalStorage() {
    safeSetItem('abc_users', JSON.stringify(state.users));
    safeSetItem('abc_branches', JSON.stringify(state.branches));
    safeSetItem('abc_customers', JSON.stringify(state.customers));
    safeSetItem('abc_brands', JSON.stringify(state.brands));
    safeSetItem('abc_units', JSON.stringify(state.units));
    safeSetItem('abc_categories', JSON.stringify(state.categories));
    safeSetItem('abc_products', JSON.stringify(state.products));
    safeSetItem('abc_staff', JSON.stringify(state.staff));
    safeSetItem('abc_transactions', JSON.stringify(state.transactions));
    safeSetItem('abc_expenses', JSON.stringify(state.expenses));
    safeSetItem('abc_stock_logs', JSON.stringify(state.stockLogs));
    safeSetItem('abc_payment_logs', JSON.stringify(state.paymentLogs));
    safeSetItem('abc_followups', JSON.stringify(state.followups));
    safeSetItem('abc_commission_rules', JSON.stringify(state.commissionRules));
    safeSetItem('abc_company_settings', JSON.stringify(state.companySettings));
    safeSetItem('abc_voided_transactions', JSON.stringify(state.voidedTransactions));
    safeSetItem('abc_closing_logs', JSON.stringify(state.closingLogs));
    safeSetItem('abc_audit_logs', JSON.stringify(state.auditLogs));
    safeSetItem('abc_employees', JSON.stringify(state.employees));
    safeSetItem('abc_attendance', JSON.stringify(state.attendance));
    safeSetItem('abc_leave_requests', JSON.stringify(state.leaveRequests));
    safeSetItem('abc_companies', JSON.stringify(state.companies));
    safeSetItem('abc_departments', JSON.stringify(state.departments));
    safeSetItem('abc_teams', JSON.stringify(state.teams));
    safeSetItem('abc_positions', JSON.stringify(state.positions));
    safeSetItem('abc_payroll_items', JSON.stringify(state.payrollItems));
    safeSetItem('abc_kpis', JSON.stringify(state.kpis));

    // If Firebase Sync is active, write added/modified records to Firestore
    if (state.firebaseDb) {
      const db = state.firebaseDb;

      const syncChanges = (colName, currentItems, lastItems, idKey) => {
        // Find added or modified items
        currentItems.forEach(item => {
          const id = item[idKey];
          if (!id) return;
          const oldItem = lastItems.find(x => x[idKey] === id);
          if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(item)) {
            db.collection(colName).doc(id).set(item).catch(e => console.error("Firebase write error:", e));
          }
        });

        // Find deleted items
        lastItems.forEach(item => {
          const id = item[idKey];
          if (!id) return;
          const currentItem = currentItems.find(x => x[idKey] === id);
          if (!currentItem) {
            db.collection(colName).doc(id).delete().catch(e => console.error("Firebase delete error:", e));
          }
        });
      };

      try {
        syncChanges('users', state.users, lastSyncedState.users, 'id');
        syncChanges('branches', state.branches, lastSyncedState.branches, 'id');
        syncChanges('customers', state.customers, lastSyncedState.customers, 'id');
        syncChanges('products', state.products, lastSyncedState.products, 'sku');
        syncChanges('staff', state.staff, lastSyncedState.staff, 'id');
        syncChanges('transactions', state.transactions, lastSyncedState.transactions, 'id');
        syncChanges('expenses', state.expenses, lastSyncedState.expenses, 'id');
        syncChanges('stock_logs', state.stockLogs, lastSyncedState.stockLogs, 'id');
        syncChanges('payment_logs', state.paymentLogs, lastSyncedState.paymentLogs, 'id');
        syncChanges('followups', state.followups, lastSyncedState.followups, 'id');
        syncChanges('employees', state.employees, lastSyncedState.employees, 'id');
        syncChanges('attendance', state.attendance, lastSyncedState.attendance, 'id');
        syncChanges('leave_requests', state.leaveRequests, lastSyncedState.leaveRequests, 'id');
        syncChanges('companies', state.companies, lastSyncedState.companies, 'id');
        syncChanges('departments', state.departments, lastSyncedState.departments, 'id');
        syncChanges('teams', state.teams, lastSyncedState.teams, 'id');
        syncChanges('positions', state.positions, lastSyncedState.positions, 'id');
        syncChanges('payroll_items', state.payrollItems, lastSyncedState.payrollItems, 'id');
        syncChanges('kpis', state.kpis, lastSyncedState.kpis, 'id');

        db.collection('company_settings').doc('global').set(state.companySettings).catch(e => console.error("Firebase config save error:", e));
        db.collection('company_settings').doc('commission_rules').set(state.commissionRules).catch(e => console.error("Firebase commission rules save error:", e));


        // Update baseline sync cache to reflect current state
        lastSyncedState = {
          users: JSON.parse(JSON.stringify(state.users)),
          branches: JSON.parse(JSON.stringify(state.branches)),
          customers: JSON.parse(JSON.stringify(state.customers)),
          products: JSON.parse(JSON.stringify(state.products)),
          staff: JSON.parse(JSON.stringify(state.staff)),
          transactions: JSON.parse(JSON.stringify(state.transactions)),
          expenses: JSON.parse(JSON.stringify(state.expenses)),
          stockLogs: JSON.parse(JSON.stringify(state.stockLogs)),
          paymentLogs: JSON.parse(JSON.stringify(state.paymentLogs)),
          followups: JSON.parse(JSON.stringify(state.followups)),
          employees: JSON.parse(JSON.stringify(state.employees)),
          attendance: JSON.parse(JSON.stringify(state.attendance)),
          leaveRequests: JSON.parse(JSON.stringify(state.leaveRequests)),
          companies: JSON.parse(JSON.stringify(state.companies)),
          departments: JSON.parse(JSON.stringify(state.departments)),
          teams: JSON.parse(JSON.stringify(state.teams)),
          positions: JSON.parse(JSON.stringify(state.positions)),
          payrollItems: JSON.parse(JSON.stringify(state.payrollItems)),
          kpis: JSON.parse(JSON.stringify(state.kpis))
        };
      } catch (err) {
        console.error("Cloud sync diff error:", err);
      }
    }
  }

  // Synthesize and play custom premium sounds programmatically using Web Audio API
  function playSound(type) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      if (type === 'success') {
        // High-quality double-tone chime for success (checkout)
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
        
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
        
        gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        
        osc1.start(audioCtx.currentTime);
        osc1.stop(audioCtx.currentTime + 0.15);
        
        osc2.start(audioCtx.currentTime + 0.1);
        osc2.stop(audioCtx.currentTime + 0.4);
      } else if (type === 'alert' || type === 'notification') {
        // High-quality synthesized metal bell chime (Ding!)
        const now = audioCtx.currentTime;
        const gainNode = audioCtx.createGain();
        gainNode.connect(audioCtx.destination);
        
        const baseFreq = 880; // Bright A5 bell pitch
        const ratios = [1.0, 1.2, 1.5, 2.0, 2.5, 3.0];
        const gains = [0.4, 0.2, 0.15, 0.1, 0.05, 0.02];
        const decays = [0.8, 0.6, 0.4, 0.3, 0.2, 0.1];
        
        ratios.forEach((ratio, idx) => {
          const osc = audioCtx.createOscillator();
          const oscGain = audioCtx.createGain();
          
          osc.connect(oscGain);
          oscGain.connect(gainNode);
          
          osc.type = 'sine';
          osc.frequency.setValueAtTime(baseFreq * ratio, now);
          
          oscGain.gain.setValueAtTime(gains[idx], now);
          oscGain.gain.exponentialRampToValueAtTime(0.0001, now + decays[idx]);
          
          osc.start(now);
          osc.stop(now + decays[idx] + 0.1);
        });
        
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
      } else if (type === 'click') {
        // Soft click feedback sound
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        
        gainNode.gain.setValueAtTime(0.03, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
        
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.05);
      }
    } catch (e) {
      console.warn("Web Audio API not supported or blocked by browser gesture:", e);
    }
  }

  function getActiveBranchFilter() {
    if (!state.currentUser) return null;
    if (state.currentUser.role === 'super_admin' || state.currentUser.role === 'accountant') return null;
    if (state.currentUser.branchId === 'all') return null;
    return state.currentUser.branchId;
  }

  // System Security Audit Logging Helper
  function logAuditEvent(actionType, activityDetails) {
    const newLog = {
      id: 'AUD-' + String(state.auditLogs.length + 1).padStart(4, '0'),
      timestamp: new Date().toISOString(),
      username: state.currentUser ? state.currentUser.username : 'system',
      actionType: actionType,
      activityDetails: activityDetails
    };
    state.auditLogs.push(newLog);
    safeSetItem('abc_audit_logs', JSON.stringify(state.auditLogs));
  }

  // Permission Verification Helper
  function checkPermission(action) {
    if (!state.currentUser) return false;
    if (state.currentUser.role === 'super_admin') return true;
    const role = state.currentUser.role;
    if (state.companySettings.rolePermissions && state.companySettings.rolePermissions[role]) {
      return !!state.companySettings.rolePermissions[role][action];
    }
    return !!(state.currentUser.permissions && state.currentUser.permissions[action]);
  }

  function guardAction(action) {
    if (!checkPermission(action)) {
      alert(window.POS_TRANSLATIONS[state.lang].permissionError);
      return false;
    }
    return true;
  }

  // Update headers panels
  function updateUserCardHeader() {
    if (!state.currentUser) return;
    const nameEl = document.getElementById('display-user-name');
    const roleEl = document.getElementById('display-user-role');
    const branchEl = document.getElementById('display-user-branch');
    const branchBannerEl = document.getElementById('active-branch-name-txt');

    const name = state.currentUser.name || state.currentUser.username;
    nameEl.innerText = name;
    
    const initialEl = document.getElementById('display-user-initial');
    if (initialEl) {
      initialEl.innerText = name.charAt(0).toUpperCase();
    }
    
    const roleKey = state.currentUser.role;
    roleEl.innerText = window.POS_TRANSLATIONS[state.lang][roleKey] || roleKey;
    roleEl.className = `role-indicator-badge ${state.currentUser.role === 'super_admin' ? 'admin-role' : ''}`;

    const br = state.branches.find(b => b.id === state.currentUser.branchId);
    const branchName = br ? (state.lang === 'km' ? br.nameKh : br.name) : (state.currentUser.branchId === 'all' ? 'All Branches' : 'HQ - Phnom Penh');
    
    branchEl.innerText = branchName;
    branchBannerEl.innerText = branchName;

    applyFeatureToggles();
  }

  function updateCompanyLogoUI() {
    const logoBase64 = state.companySettings.logoBase64;
    const companyName = state.companySettings.companyName || 'ABC System';

    // Update Login Screen logo
    const loginDefaultLogo = document.getElementById('login-default-logo');
    const loginCustomLogo = document.getElementById('login-custom-logo');
    const loginSystemTitle = document.getElementById('login-system-title');

    if (loginSystemTitle) {
      loginSystemTitle.innerText = companyName;
    }

    if (logoBase64) {
      if (loginDefaultLogo) loginDefaultLogo.style.display = 'none';
      if (loginCustomLogo) {
        loginCustomLogo.src = logoBase64;
        loginCustomLogo.style.display = 'block';
      }
    } else {
      if (loginDefaultLogo) loginDefaultLogo.style.display = 'block';
      if (loginCustomLogo) {
        loginCustomLogo.src = '';
        loginCustomLogo.style.display = 'none';
      }
    }

    // Update Sidebar logo
    const sidebarDefaultLogo = document.getElementById('sidebar-default-logo');
    const sidebarCustomLogo = document.getElementById('sidebar-custom-logo');
    const sidebarLogoText = document.getElementById('sidebar-logo-text');

    if (sidebarLogoText) {
      sidebarLogoText.innerText = companyName;
    }

    if (logoBase64) {
      if (sidebarDefaultLogo) sidebarDefaultLogo.style.display = 'none';
      if (sidebarCustomLogo) {
        sidebarCustomLogo.src = logoBase64;
        sidebarCustomLogo.style.display = 'block';
      }
    } else {
      if (sidebarDefaultLogo) sidebarDefaultLogo.style.display = 'block';
      if (sidebarCustomLogo) {
        sidebarCustomLogo.src = '';
        sidebarCustomLogo.style.display = 'none';
      }
    }
  }

  function applyFeatureToggles() {
    const features = state.companySettings.featuresEnabled || {};
    const role = state.currentUser ? state.currentUser.role : null;
    
    document.querySelectorAll('.nav-menu .nav-item, .pos-cta-btn').forEach(item => {
      const view = item.getAttribute('data-view');
      if (!view) return;
      
      const isAccessible = isViewAccessible(view);
      
      if (!isAccessible) {
        item.style.setProperty('display', 'none', 'important');
      } else {
        item.style.setProperty('display', 'flex', 'important');
      }
    });

    // Handle Capital Tracking and finance KPI card visibility based on role
    const canSeeFinance = role === 'super_admin' || role === 'branch_admin' || role === 'accountant';
    
    // Hide/show other financial KPI cards on Dashboard and Financial Ledger
    document.querySelectorAll('.kpi-revenue, .kpi-deducted, .kpi-expense, .kpi-profit').forEach(card => {
      card.style.setProperty('display', canSeeFinance ? 'flex' : 'none', 'important');
    });

    // Capital Tracking enabled check: ONLY visible to super_admin
    const capitalEnabled = (features.capital !== false) && (role === 'super_admin');
    document.querySelectorAll('.kpi-capital, .kpi-capital-balance').forEach(card => {
      card.style.setProperty('display', capitalEnabled ? 'flex' : 'none', 'important');
    });

    if (capitalEnabled) {
      document.body.classList.remove('capital-disabled');
    } else {
      document.body.classList.add('capital-disabled');
    }

    // Hide/show starting capital field inside settings profile form if it exists
    const settingsCapitalGroup = document.getElementById('c-starting-capital')?.closest('.form-group');
    if (settingsCapitalGroup) {
      settingsCapitalGroup.style.display = capitalEnabled ? 'block' : 'none';
    }

    // Hide financial charts on Dashboard from unauthorized roles
    const revenueExpensesCard = document.getElementById('chart-revenue-expenses')?.closest('.glass-card');
    const branchSalesCard = document.getElementById('chart-branch-sales')?.closest('.glass-card');
    const pageRankingsCard = document.getElementById('chart-page-rankings')?.closest('.glass-card');
    
    if (revenueExpensesCard) revenueExpensesCard.style.setProperty('display', canSeeFinance ? 'flex' : 'none', 'important');
    if (branchSalesCard) branchSalesCard.style.setProperty('display', canSeeFinance ? 'flex' : 'none', 'important');
    if (pageRankingsCard) pageRankingsCard.style.setProperty('display', canSeeFinance ? 'flex' : 'none', 'important');
  }

  // Theme Mode Switcher
  function setupThemeToggle() {
    const toggleBtn = document.getElementById('btn-theme-toggle');
    toggleBtn.addEventListener('click', () => {
      if (state.theme === 'dark') {
        state.theme = 'light';
        document.body.className = 'light-theme';
        toggleBtn.innerText = '☀ Light Mode';
      } else {
        state.theme = 'dark';
        document.body.className = 'dark-theme';
        toggleBtn.innerText = '🌙 Dark Mode';
      }
      safeSetItem('abc_theme', state.theme);
      renderDashboard(); // Re-draw charts with new text contrasts
    });
  }

  // Enterprise login form
  function setupLoginHandler() {
    const form = document.getElementById('login-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const userVal = document.getElementById('login-username').value.trim();
      const passVal = document.getElementById('login-password').value;
      const errorMsg = document.getElementById('login-error-msg');

      const matched = state.users.find(u => u.username === userVal && u.password === passVal);
      if (matched) {
        if (matched.status === 'suspended') {
          errorMsg.setAttribute('data-translate', 'loginError');
          errorMsg.innerText = state.lang === 'km' ? 'គណនីនេះត្រូវបានផ្អាកដំណើរការ!' : 'This account has been suspended!';
          errorMsg.style.display = 'block';
          return;
        }
        state.currentUser = matched;
        safeSetSessionItem('abc_current_user', JSON.stringify(matched));
        document.getElementById('login-screen').classList.remove('active-login');
        errorMsg.style.display = 'none';
        
        // Reset forms
        form.reset();
        
        // Log Audit Event
        logAuditEvent('logIn', `${matched.name} (${matched.username}) logged in from branch ID ${matched.branchId}`);

        updateUserCardHeader();
        populatePOSSelects();
        navigateToView('view-dashboard');
        translateApp();
      } else {
        errorMsg.setAttribute('data-translate', 'loginError');
        errorMsg.innerText = window.POS_TRANSLATIONS[state.lang].loginError || 'Invalid credentials or account suspended!';
        errorMsg.style.display = 'block';
      }
    });

    const logoutBtn = document.getElementById('btn-logout');
    logoutBtn.addEventListener('click', () => {
      if (confirm(state.lang === 'km' ? 'តើអ្នកចង់ចាកចេញពីប្រព័ន្ធ?' : 'Log out from system?')) {
        state.currentUser = null;
        safeRemoveSessionItem('abc_current_user');
        document.getElementById('login-screen').classList.add('active-login');
        state.activeView = 'view-dashboard';
      }
    });
  }

  // Routing Framework SPA
  function setupRouting() {
    const navItems = document.querySelectorAll('.nav-menu .nav-item, .pos-cta-btn');
    console.log("setupRouting: found nav items count:", navItems.length);
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const targetView = item.getAttribute('data-view');
        console.log("setupRouting: Navigation item clicked:", targetView);
        
        // Permission routing guard
        const isAccessible = isViewAccessible(targetView);
        console.log(`setupRouting: isViewAccessible('${targetView}') =`, isAccessible);
        if (!isAccessible) {
          alert(window.POS_TRANSLATIONS[state.lang].permissionError);
          return;
        }

        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        navigateToView(targetView);
      });
    });
  }

  function navigateToView(targetView) {
    console.log("navigateToView: targetView =", targetView);
    // Check if target view is accessible; if not, try to fallback to the first allowed view
    if (!isViewAccessible(targetView)) {
      let fallbackView = null;
      if (state.currentUser) {
        const role = state.currentUser.role;
        const allowed = ROLE_ALLOWED_VIEWS[role] || [];
        for (const v of allowed) {
          if (isViewAccessible(v)) {
            fallbackView = v;
            break;
          }
        }
      }
      
      console.log("navigateToView: view is blocked, fallbackView =", fallbackView);
      if (fallbackView) {
        targetView = fallbackView;
      } else {
        // No views are accessible (e.g. view permission disabled)! Force logout.
        alert(window.POS_TRANSLATIONS[state.lang].permissionError);
        state.currentUser = null;
        safeRemoveSessionItem('abc_current_user');
        document.getElementById('login-screen').classList.add('active-login');
        return;
      }
    }

    state.activeView = targetView;
    console.log("navigateToView: state.activeView updated to", state.activeView);
    
    // Ensure correct nav menu highlights are matched
    document.querySelectorAll('.nav-menu .nav-item, .pos-cta-btn').forEach(nav => {
      if (nav.getAttribute('data-view') === targetView) {
        nav.classList.add('active');
      } else {
        nav.classList.remove('active');
      }
    });

    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.remove('active-view');
    });
    
    const activePanel = document.getElementById(targetView);
    if (activePanel) {
      activePanel.classList.add('active-view');
    }

    // Set Header titles
    const titleKey = targetView.replace('view-', '');
    const titleEl = document.getElementById('page-title');
    if (titleEl) {
      titleEl.innerText = window.POS_TRANSLATIONS[state.lang][titleKey] || titleKey;
    }

    renderCurrentView();
  }

  function renderCurrentView() {
    console.log("renderCurrentView: Rendering activeView =", state.activeView);
    switch(state.activeView) {
      case 'view-dashboard':
        renderDashboard();
        break;
      case 'view-pos':
        renderPOS();
        break;
      case 'view-inventory':
        renderInventory();
        break;
      case 'view-branches':
        renderBranches();
        break;
      case 'view-customers':
        renderCustomers();
        break;
      case 'view-followups':
        renderFollowups();
        break;
      case 'view-performance':
        renderPerformance();
        break;
      case 'view-finance':
        renderFinance();
        break;
      case 'view-staff':
        renderHRMain();
        renderStaff();
        break;
      case 'view-reports':
        renderReports();
        break;
      case 'view-settings':
        renderSettings();
        break;
    }
  }

  // Language selectors
  function setupLanguageSelector() {
    const btnEn = document.getElementById('btn-lang-en');
    const btnKm = document.getElementById('btn-lang-km');

    const switchLang = (newLang) => {
      state.lang = newLang;
      safeSetItem('abc_lang', newLang);
      
      if (newLang === 'km') {
        btnKm.classList.add('active');
        btnEn.classList.remove('active');
      } else {
        btnEn.classList.add('active');
        btnKm.classList.remove('active');
      }

      translateApp();
      updateUserCardHeader();
      renderCurrentView();
    };

    btnEn.addEventListener('click', () => switchLang('en'));
    btnKm.addEventListener('click', () => switchLang('km'));

    // Init state
    switchLang(state.lang);
  }

  function translateApp() {
    const kmText = state.lang === 'km';
    document.querySelectorAll('[data-translate]').forEach(el => {
      const key = el.getAttribute('data-translate');
      const val = window.POS_TRANSLATIONS[state.lang][key];
      if (val) {
        if (el.tagName === 'INPUT' && el.getAttribute('placeholder') !== null) {
          el.setAttribute('placeholder', val);
        } else {
          el.innerText = val;
        }
      }
    });

    // Toggle body fonts classes
    populateExpenseCategories();

    if (kmText) {
      document.body.classList.add('lang-km');
      document.body.setAttribute('lang', 'km');
    } else {
      document.body.classList.remove('lang-km');
      document.body.removeAttribute('lang');
    }
  }

  // Live ticking clock
  function setupClock() {
    const clockEl = document.getElementById('clock-display');
    const tick = () => {
      const d = new Date();
      clockEl.innerText = d.toLocaleTimeString(state.lang === 'km' ? 'kh-KH' : 'en-US');
    };
    setInterval(tick, 1000);
    tick();
  }

  // 1. DASHBOARD ANALYTICS RENDER
  function renderDashboard() {
    // 1. Calculations
    let totalRevenue = 0;
    let totalExpenses = 0;
    let totalCOGS = 0;
    
    // Filter calculations by assigned branch if not super_admin/accountant
    const filterBranch = getActiveBranchFilter();

    state.transactions.forEach(t => {
      if (!filterBranch || t.branchId === filterBranch) {
        totalRevenue += t.total;
        t.items.forEach(item => {
          const p = state.products.find(prod => prod.sku === item.sku);
          const costPrice = item.costPrice !== undefined ? item.costPrice : (p ? (p.costPrice || 0) : 0);
          totalCOGS += costPrice * item.qty;
        });
      }
    });

    state.expenses.forEach(e => {
      if (!filterBranch || e.branchId === filterBranch) {
        totalExpenses += e.amount;
      }
    });

    const totalDeducted = totalCOGS + totalExpenses;
    const actualProfit = totalRevenue - totalDeducted;
    const startingCapital = state.companySettings.startingCapital !== undefined ? parseFloat(state.companySettings.startingCapital) : 10000;
    const salesCount = state.transactions.filter(t => !filterBranch || t.branchId === filterBranch).length;
    const pendingFollows = state.followups.filter(f => {
      const belongs = !filterBranch || f.schedules.some(s => f.salesStaffId === state.currentUser?.id || state.currentUser?.role === 'super_admin');
      const hasPending = f.schedules.some(s => s.status === 'pending');
      return belongs && hasPending;
    }).length;

    // Load elements
    const capitalValDash = document.getElementById('kpi-capital-val');
    if (capitalValDash) {
      capitalValDash.innerText = window.POS_HELPERS.formatUSD(startingCapital);
    }
    const capitalRielDash = document.getElementById('kpi-capital-riel');
    if (capitalRielDash) {
      capitalRielDash.innerText = window.POS_HELPERS.formatKHR(startingCapital);
    }

    const currentCapitalBalance = startingCapital + actualProfit;
    const capitalBalanceValDash = document.getElementById('kpi-capital-balance-val');
    if (capitalBalanceValDash) {
      capitalBalanceValDash.innerText = window.POS_HELPERS.formatUSD(currentCapitalBalance);
    }
    const capitalBalanceRielDash = document.getElementById('kpi-capital-balance-riel');
    if (capitalBalanceRielDash) {
      capitalBalanceRielDash.innerText = window.POS_HELPERS.formatKHR(currentCapitalBalance);
    }

    const deductedValDash = document.getElementById('kpi-deducted-val');
    if (deductedValDash) {
      deductedValDash.innerText = window.POS_HELPERS.formatUSD(totalDeducted);
    }
    const deductedRielDash = document.getElementById('kpi-deducted-riel');
    if (deductedRielDash) {
      deductedRielDash.innerText = window.POS_HELPERS.formatKHR(totalDeducted);
    }

    document.getElementById('kpi-revenue-val').innerText = window.POS_HELPERS.formatUSD(totalRevenue);
    document.getElementById('kpi-revenue-riel').innerText = window.POS_HELPERS.formatKHR(totalRevenue);
    document.getElementById('kpi-expense-val').innerText = window.POS_HELPERS.formatUSD(totalExpenses);
    document.getElementById('kpi-expense-riel').innerText = window.POS_HELPERS.formatKHR(totalExpenses);
    document.getElementById('kpi-profit-val').innerText = window.POS_HELPERS.formatUSD(actualProfit);
    document.getElementById('kpi-profit-riel').innerText = window.POS_HELPERS.formatKHR(actualProfit);
    document.getElementById('kpi-profit-val').style.color = actualProfit < 0 ? 'var(--danger)' : '';
    document.getElementById('kpi-sales-count').innerText = salesCount;
    document.getElementById('kpi-followups-badge').innerText = `${pendingFollows} Pending CRM Follow-ups`;
    checkCRMNotifications();

    // 2. Render charts using Chart.js CDN (Checking availability)
    const isLightTheme = document.body.classList.contains('light-theme');
    const textThemeColor = isLightTheme ? '#0f172a' : '#94a3b8';
    const gridThemeColor = isLightTheme ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';

    if (typeof Chart !== 'undefined') {
      // Line Chart: Revenue vs Expenses
      const ctxRev = document.getElementById('chart-revenue-expenses');
      if (ctxRev) {
        if (state.revenueChart) state.revenueChart.destroy();
        
        // Generate daily datasets in the current month
        const dailyRev = {};
        const dailyExp = {};
        const days = [];
        for(let i=14; i>=0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          days.push(dateStr);
          dailyRev[dateStr] = 0;
          dailyExp[dateStr] = 0;
        }

        state.transactions.forEach(t => {
          const dateStr = t.date.split('T')[0];
          if (dailyRev[dateStr] !== undefined && (!filterBranch || t.branchId === filterBranch)) {
            dailyRev[dateStr] += t.total;
          }
        });

        state.expenses.forEach(e => {
          const dateStr = e.date.split('T')[0];
          if (dailyExp[dateStr] !== undefined && (!filterBranch || e.branchId === filterBranch)) {
            dailyExp[dateStr] += e.amount;
          }
        });

        state.revenueChart = new Chart(ctxRev, {
          type: 'line',
          data: {
            labels: days.map(d => window.POS_HELPERS.formatDate(d, state.lang).split(' ')[0]),
            datasets: [
              {
                label: state.lang === 'km' ? 'ចំណូលលក់' : 'Sales Revenue',
                data: days.map(d => dailyRev[d]),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.05)',
                fill: true,
                tension: 0.35,
                borderWidth: 2.5
              },
              {
                label: state.lang === 'km' ? 'ចំណាយ' : 'Expenses',
                data: days.map(d => dailyExp[d]),
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.05)',
                fill: true,
                tension: 0.35,
                borderWidth: 2.5
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { labels: { color: textThemeColor, font: { family: varStyle('font-english') } } }
            },
            scales: {
              x: { grid: { color: gridThemeColor }, ticks: { color: textThemeColor } },
              y: { grid: { color: gridThemeColor }, ticks: { color: textThemeColor } }
            }
          }
        });
      }

      // Bar Chart: Branch Comparison
      const ctxBr = document.getElementById('chart-branch-sales');
      if (ctxBr) {
        const cardBr = ctxBr.closest('.glass-card');
        if (filterBranch) {
          if (cardBr) cardBr.style.display = 'none';
        } else {
          if (cardBr) cardBr.style.display = 'flex';
          if (state.branchChart) state.branchChart.destroy();

          const branchSales = {};
          state.branches.forEach(b => branchSales[b.id] = 0);
          state.transactions.forEach(t => {
            if (branchSales[t.branchId] !== undefined) {
              branchSales[t.branchId] += t.total;
            }
          });

          state.branchChart = new Chart(ctxBr, {
            type: 'bar',
            data: {
              labels: state.branches.map(b => state.lang === 'km' ? b.nameKh : b.name),
              datasets: [{
                label: state.lang === 'km' ? 'លក់សរុប ($)' : 'Total Sales ($)',
                data: state.branches.map(b => branchSales[b.id]),
                backgroundColor: ['#6366f1', '#10b981', '#3b82f6', '#f59e0b'],
                borderRadius: 6
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false }
              },
              scales: {
                x: { grid: { color: gridThemeColor }, ticks: { color: textThemeColor } },
                y: { grid: { color: gridThemeColor }, ticks: { color: textThemeColor } }
              }
            }
          });
        }
      }

      // Bar Chart: Employee Performance
      const ctxEmp = document.getElementById('chart-employee-performance');
      if (ctxEmp) {
        if (state.employeeChart) state.employeeChart.destroy();
        
        const empSales = {};
        getFilteredStaff().forEach(s => empSales[s.name] = 0);
        
        getFilteredTransactions().forEach(t => {
          if (empSales[t.staffName] !== undefined) {
            empSales[t.staffName] += t.total;
          }
        });

        const empNames = Object.keys(empSales);
        const empVals = Object.values(empSales);

        state.employeeChart = new Chart(ctxEmp, {
          type: 'bar',
          data: {
            labels: empNames,
            datasets: [{
              label: state.lang === 'km' ? 'លក់បាន ($)' : 'Sales Volume ($)',
              data: empVals,
              backgroundColor: '#4f46e5',
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false }
            },
            scales: {
              x: { grid: { color: gridThemeColor }, ticks: { color: textThemeColor } },
              y: { grid: { color: gridThemeColor }, ticks: { color: textThemeColor } }
            }
          }
        });
      }

      // Pie/Doughnut Chart: Social Page Sales Contribution
      const ctxPage = document.getElementById('chart-page-rankings');
      if (ctxPage) {
        if (state.pageChart) state.pageChart.destroy();

        const pageSales = {};
        getFilteredTransactions().forEach(t => {
          const pg = t.pageName || 'Direct Sales';
          pageSales[pg] = (pageSales[pg] || 0) + t.total;
        });

        const pageLabels = Object.keys(pageSales);
        const pageVals = Object.values(pageSales);

        state.pageChart = new Chart(ctxPage, {
          type: 'doughnut',
          data: {
            labels: pageLabels,
            datasets: [{
              data: pageVals,
              backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#6b7280'],
              borderWidth: 1,
              borderColor: isLightTheme ? '#ffffff' : '#1e293b'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { 
                position: 'right',
                labels: { color: textThemeColor, font: { size: 10 } }
              }
            }
          }
        });
      }
    }

    // 3. Recent sales injection
    const recentBody = document.getElementById('db-recent-transactions');
    recentBody.innerHTML = '';
    const sorted = [...state.transactions]
      .filter(t => !filterBranch || t.branchId === filterBranch)
      .sort((a,b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);

    if (sorted.length === 0) {
      recentBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">${window.POS_TRANSLATIONS[state.lang].noData}</td></tr>`;
    } else {
      sorted.forEach(tx => {
        const br = state.branches.find(b => b.id === tx.branchId);
        const brName = br ? (state.lang === 'km' ? br.nameKh : br.name) : 'HQ';
        const methodTranslate = window.POS_TRANSLATIONS[state.lang][tx.paymentMethod] || tx.paymentMethod;
        
        recentBody.innerHTML += `
          <tr>
            <td><strong style="color:var(--secondary);">${tx.invoiceNo || tx.id}</strong></td>
            <td><span class="badge badge-warning" style="font-size:10px;">${brName}</span></td>
            <td style="font-size:11px;">${window.POS_HELPERS.formatDate(tx.date, state.lang)}</td>
            <td style="font-weight:750; color:var(--primary);">${window.POS_HELPERS.formatUSD(tx.total)}</td>
            <td><span style="font-size:11px; text-transform:uppercase;">${methodTranslate}</span></td>
          </tr>
        `;
      });
    }

    // 4. Low stock quick alert rows
    const lowStockBody = document.getElementById('db-low-stock-rows');
    lowStockBody.innerHTML = '';
    const lowProducts = state.products.filter(p => {
      if (filterBranch) {
        return (p.warehouseStock[filterBranch] || 0) <= p.minStock;
      }
      return p.stockQty <= p.minStock;
    });

    updateLowStockAlertCount();

    if (lowProducts.length === 0) {
      lowStockBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--primary); font-weight:750;">${window.POS_TRANSLATIONS[state.lang].allGood}</td></tr>`;
    } else {
      lowProducts.slice(0, 6).forEach(p => {
        const qtyVal = filterBranch ? (p.warehouseStock[filterBranch] || 0) : p.stockQty;
        lowStockBody.innerHTML += `
          <tr>
            <td><span style="font-family:monospace; font-weight:700;">${p.sku}</span></td>
            <td>${state.lang === 'km' ? p.nameKh : p.nameEn}</td>
            <td style="text-align:center; font-weight:800; color:var(--danger);">${qtyVal}</td>
            <td style="text-align:center; color:var(--text-secondary);">${p.minStock}</td>
          </tr>
        `;
      });
    }
  }

  function varStyle(name) {
    return getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim();
  }

  function updateLowStockAlertCount() {
    const filterBranch = getActiveBranchFilter();
    const lowProducts = state.products.filter(p => {
      const qtyVal = filterBranch ? (p.warehouseStock[filterBranch] || 0) : p.stockQty;
      return qtyVal <= p.minStock;
    });

    const badgeCount = document.getElementById('alert-badge-count');
    badgeCount.innerText = lowProducts.length;

    const banner = document.getElementById('low-stock-banner');
    const bannerItems = document.getElementById('low-stock-list-items');
    
    if (lowProducts.length > 0 && state.activeView === 'view-dashboard') {
      banner.style.display = 'flex';
      bannerItems.innerText = lowProducts.map(p => `${p.sku} (${state.lang === 'km' ? p.nameKh : p.nameEn})`).join(', ');
    } else {
      banner.style.display = 'none';
    }
  }

  // 2. POS SALES BILLING MODULE RENDER
  function renderPOS() {
    // 1. Generate category tab tags
    const catSlider = document.getElementById('pos-category-tabs');
    catSlider.innerHTML = `<span class="category-tab ${state.activePOSCategory === 'all' ? 'active' : ''}" data-cat="all" data-translate="all">${window.POS_TRANSLATIONS[state.lang].all}</span>`;
    
    state.categories.forEach(cat => {
      const name = state.lang === 'km' ? cat.nameKh : cat.nameEn;
      catSlider.innerHTML += `<span class="category-tab ${state.activePOSCategory === cat.id ? 'active' : ''}" data-cat="${cat.id}">${name}</span>`;
    });

    // Category click handler
    catSlider.querySelectorAll('.category-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        state.activePOSCategory = tab.getAttribute('data-cat');
        renderPOSProductGrid();
        renderPOS(); // redraw tags state
      });
    });

    renderPOSProductGrid();
    renderCart();
    setupCartEnhancements();
  }

  // Cart Enhancements Search & Suggest & Chips (Advanced Update Requirement 7)
  function setupCartEnhancements() {
    const searchInput = document.getElementById('cart-product-search-input');
    const suggestDropdown = document.getElementById('cart-suggest-dropdown');
    
    if (searchInput && suggestDropdown) {
      // Clear previous listeners (cloning and replacing element is a safe clean-up approach)
      const newSearchInput = searchInput.cloneNode(true);
      searchInput.parentNode.replaceChild(newSearchInput, searchInput);
      
      newSearchInput.addEventListener('input', () => {
        const query = newSearchInput.value.toLowerCase().trim();
        if (!query) {
          suggestDropdown.style.display = 'none';
          return;
        }
        
        // Find matching active products
        const matches = state.products.filter(p => {
          return p.status === 'active' && (
            p.sku.toLowerCase().includes(query) ||
            p.barcode.toLowerCase().includes(query) ||
            p.nameEn.toLowerCase().includes(query) ||
            p.nameKh.toLowerCase().includes(query)
          );
        });
        
        if (matches.length === 0) {
          suggestDropdown.style.display = 'none';
          return;
        }
        
        suggestDropdown.innerHTML = '';
        matches.slice(0, 5).forEach(p => {
          const name = state.lang === 'km' ? p.nameKh : p.nameEn;
          const itemEl = document.createElement('div');
          itemEl.className = 'cart-suggest-item';
          itemEl.innerHTML = `
            <span><strong>${p.sku}</strong> - ${name}</span>
            <span style="color:var(--primary); font-weight:700;">$${p.sellingPrice.toFixed(2)}</span>
          `;
          itemEl.addEventListener('click', () => {
            addToCart(p.sku);
            newSearchInput.value = '';
            suggestDropdown.style.display = 'none';
          });
          suggestDropdown.appendChild(itemEl);
        });
        suggestDropdown.style.display = 'block';
      });
      
      // Hide suggest dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!newSearchInput.contains(e.target) && !suggestDropdown.contains(e.target)) {
          suggestDropdown.style.display = 'none';
        }
      });
    }
    
    // Fast select panel click events
    const fastSelect = document.getElementById('cart-fast-select-container');
    if (fastSelect) {
      fastSelect.innerHTML = '';
      const topSkus = ['BEV-001', 'BEV-002', 'FOOD-001', 'FOOD-002', 'ELEC-001'];
      topSkus.forEach(sku => {
        const p = state.products.find(prod => prod.sku === sku);
        if (p) {
          const chip = document.createElement('span');
          chip.className = 'cart-fast-chip';
          chip.innerText = state.lang === 'km' ? p.nameKh.split(' ')[0] : p.nameEn.split(' ')[0];
          chip.title = state.lang === 'km' ? p.nameKh : p.nameEn;
          chip.addEventListener('click', () => {
            addToCart(p.sku);
          });
          fastSelect.appendChild(chip);
        }
      });
    }
  }

  function populatePOSSelects() {
    const filterBranch = getActiveBranchFilter();
    
    // Branches POS select
    const brSelect = document.getElementById('cart-branch-select');
    brSelect.innerHTML = '';
    state.branches.forEach(b => {
      if (!filterBranch || b.id === filterBranch) {
        brSelect.innerHTML += `<option value="${b.id}">${state.lang === 'km' ? b.nameKh : b.name}</option>`;
      }
    });
    if (filterBranch) {
      brSelect.disabled = true;
    } else {
      brSelect.disabled = false;
    }

    // Staff POS select
    const staffSelect = document.getElementById('cart-staff-select');
    staffSelect.innerHTML = '';
    state.staff.forEach(s => {
      if (!filterBranch || s.branchId === filterBranch) {
        staffSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`;
      }
    });
    if (state.staff.length > 0) {
      state.currentPOSStaffId = state.staff[0].id;
      staffSelect.value = state.currentPOSStaffId;
    }

    // Customers POS select
    const custSearch = document.getElementById('cart-customer-search');
    if (custSearch) custSearch.value = '';

    const custSelect = document.getElementById('cart-customer-select');
    custSelect.innerHTML = '';

    // Calculate customer order stats for sorting
    const customerStats = {};
    state.customers.forEach(c => {
      customerStats[c.id] = { orderCount: 0, lastOrderTime: 0 };
    });
    state.transactions.forEach(t => {
      const cId = t.customerId || 'CST-001';
      if (!customerStats[cId]) {
        customerStats[cId] = { orderCount: 0, lastOrderTime: 0 };
      }
      customerStats[cId].orderCount++;
      const tTime = new Date(t.date).getTime();
      if (tTime > customerStats[cId].lastOrderTime) {
        customerStats[cId].lastOrderTime = tTime;
      }
    });

    const sortedCustomers = [...state.customers].sort((a, b) => {
      if (a.id === 'CST-001') return -1;
      if (b.id === 'CST-001') return 1;
      const statsA = customerStats[a.id] || { lastOrderTime: 0, orderCount: 0 };
      const statsB = customerStats[b.id] || { lastOrderTime: 0, orderCount: 0 };
      
      // Sort by recent order date (newest first)
      if (statsA.lastOrderTime !== statsB.lastOrderTime) {
        return statsB.lastOrderTime - statsA.lastOrderTime;
      }
      // Sort by order count (most first)
      if (statsA.orderCount !== statsB.orderCount) {
        return statsB.orderCount - statsA.orderCount;
      }
      return a.name.localeCompare(b.name);
    });

    sortedCustomers.forEach(c => {
      if (!filterBranch || c.branchId === filterBranch || c.id === 'CST-001') {
        const stats = customerStats[c.id] || { orderCount: 0 };
        const debtText = c.outstandingDebt > 0 ? ` [Debt: $${c.outstandingDebt.toFixed(2)}]` : '';
        const vipText = c.isVip ? '★ [VIP] ' : '';
        const orderText = stats.orderCount > 0 ? ` [Orders: ${stats.orderCount}]` : '';
        custSelect.innerHTML += `<option value="${c.id}">${vipText}${c.name} (${c.phone})${orderText}${debtText}</option>`;
      }
    });

    // Modal forms selects
    const expBrSelect = document.getElementById('exp-branch-id');
    if (expBrSelect) {
      expBrSelect.innerHTML = '';
      state.branches.forEach(b => {
        if (!filterBranch || b.id === filterBranch) {
          expBrSelect.innerHTML += `<option value="${b.id}">${state.lang === 'km' ? b.nameKh : b.name}</option>`;
        }
      });
      if (filterBranch) {
        expBrSelect.disabled = true;
      } else {
        expBrSelect.disabled = false;
      }
    }

    const staffBrSelect = document.getElementById('staff-form-branch');
    if (staffBrSelect) {
      staffBrSelect.innerHTML = '';
      state.branches.forEach(b => {
        if (!filterBranch || b.id === filterBranch) {
          staffBrSelect.innerHTML += `<option value="${b.id}">${state.lang === 'km' ? b.nameKh : b.name}</option>`;
        }
      });
      if (filterBranch) {
        staffBrSelect.disabled = true;
      } else {
        staffBrSelect.disabled = false;
      }
    }

    const adjBrSelect = document.getElementById('adj-branch-id');
    if (adjBrSelect) {
      adjBrSelect.innerHTML = '';
      state.branches.forEach(b => {
        if (!filterBranch || b.id === filterBranch) {
          adjBrSelect.innerHTML += `<option value="${b.id}">${state.lang === 'km' ? b.nameKh : b.name}</option>`;
        }
      });
      if (filterBranch) {
        adjBrSelect.disabled = true;
      } else {
        adjBrSelect.disabled = false;
      }
    }

    const tfSrcSelect = document.getElementById('tf-source-branch');
    const tfTarSelect = document.getElementById('tf-target-branch');
    if (tfSrcSelect && tfTarSelect) {
      tfSrcSelect.innerHTML = '';
      tfTarSelect.innerHTML = '';
      state.branches.forEach(b => {
        if (!filterBranch || b.id === filterBranch) {
          tfSrcSelect.innerHTML += `<option value="${b.id}">${state.lang === 'km' ? b.nameKh : b.name}</option>`;
        }
        tfTarSelect.innerHTML += `<option value="${b.id}">${state.lang === 'km' ? b.nameKh : b.name}</option>`;
      });
      if (filterBranch) {
        tfSrcSelect.disabled = true;
        const firstNonSrc = state.branches.find(b => b.id !== filterBranch);
        if (firstNonSrc) tfTarSelect.value = firstNonSrc.id;
      } else {
        tfSrcSelect.disabled = false;
      }
    }

    // Products selectors
    const adjProdSelect = document.getElementById('adj-product-sku');
    const tfProdSelect = document.getElementById('tf-product-sku');
    if (adjProdSelect && tfProdSelect) {
      adjProdSelect.innerHTML = '';
      tfProdSelect.innerHTML = '';
      state.products.forEach(p => {
        const text = `${p.sku} - ${state.lang === 'km' ? p.nameKh : p.nameEn}`;
        adjProdSelect.innerHTML += `<option value="${p.sku}">${text}</option>`;
        tfProdSelect.innerHTML += `<option value="${p.sku}">${text}</option>`;
      });
    }
  }

  function populateExpenseCategories() {
    const selectEl = document.getElementById('exp-category');
    if (!selectEl) return;
    
    const selectedValue = selectEl.value;
    selectEl.innerHTML = '';
    
    const standardCats = [
      { value: 'rent', langKey: 'rent' },
      { value: 'electricity', langKey: 'electricity' },
      { value: 'water', langKey: 'water' },
      { value: 'marketing', langKey: 'marketing' },
      { value: 'rawMaterials', langKey: 'rawMaterials' },
      { value: 'salaries', langKey: 'salaries' },
      { value: 'transportation', langKey: 'transportation' },
      { value: 'otherExpenses', langKey: 'otherExpenses' }
    ];
    
    standardCats.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.value;
      option.setAttribute('data-translate', cat.langKey);
      option.innerText = window.POS_TRANSLATIONS[state.lang][cat.langKey] || cat.value;
      selectEl.appendChild(option);
    });
    
    if (state.companySettings && Array.isArray(state.companySettings.customExpenseCategories)) {
      state.companySettings.customExpenseCategories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.innerText = cat;
        selectEl.appendChild(option);
      });
    }
    
    if (selectedValue) {
      selectEl.value = selectedValue;
    }
  }

  function renderCustomExpenseCategoriesList() {
    const listEl = document.getElementById('custom-exp-cats-list');
    if (!listEl) return;
    
    listEl.innerHTML = '';
    const customCats = state.companySettings.customExpenseCategories || [];
    
    if (customCats.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 12px;" data-translate="noData">${window.POS_TRANSLATIONS[state.lang].noData || 'No custom categories'}</div>`;
      return;
    }
    
    customCats.forEach((cat, index) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.padding = '8px 12px';
      row.style.background = 'rgba(255, 255, 255, 0.05)';
      row.style.border = '1px solid var(--border-color)';
      row.style.borderRadius = 'var(--radius-sm)';
      row.style.gap = '8px';
      
      row.innerHTML = `
        <span style="font-weight: 500; font-size: 13px; color: var(--text-primary); word-break: break-all;">${cat}</span>
        <button type="button" class="btn btn-danger btn-sm btn-delete-custom-cat" data-index="${index}" style="padding: 2px 6px; font-size: 10px;">🗑️</button>
      `;
      
      row.querySelector('.btn-delete-custom-cat').addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-index'));
        const catName = customCats[idx];
        if (confirm(window.POS_TRANSLATIONS[state.lang].confirmDeleteCat || `Are you sure you want to delete this category?`)) {
          state.companySettings.customExpenseCategories.splice(idx, 1);
          saveStateToLocalStorage();
          renderCustomExpenseCategoriesList();
          populateExpenseCategories();
        }
      });
      
      listEl.appendChild(row);
    });
  }

  function renderPOSProductGrid() {
    const grid = document.getElementById('pos-products-grid');
    grid.innerHTML = '';

    const query = document.getElementById('pos-search-input').value.toLowerCase().trim();
    const branchId = document.getElementById('cart-branch-select').value || (state.branches[0]?.id || "BR-001");

    const filtered = state.products.filter(p => {
      if (p.status !== 'active') return false;
      
      const categoryMatch = state.activePOSCategory === 'all' || p.category === state.activePOSCategory;
      const searchMatch = p.sku.toLowerCase().includes(query) || 
                          p.barcode.toLowerCase().includes(query) ||
                          p.nameEn.toLowerCase().includes(query) ||
                          p.nameKh.toLowerCase().includes(query);
      return categoryMatch && searchMatch;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:var(--text-secondary); padding:40px;" data-translate="noData">${window.POS_TRANSLATIONS[state.lang].noData}</div>`;
      return;
    }

    filtered.forEach(p => {
      const branchQty = p.warehouseStock[branchId] || 0;
      const isOutOfStock = branchQty <= 0;
      const displayImg = p.image 
        ? `<img src="${p.image}" alt="${p.nameEn}">`
        : `<span style="font-size:32px;">📦</span>`;

      const card = document.createElement('div');
      card.className = 'product-card' + (isOutOfStock ? ' out-of-stock' : '');
      card.innerHTML = `
        ${isOutOfStock 
          ? `<span class="product-card-badge badge-out-of-stock">${state.lang === 'km' ? 'អស់ស្តុក' : 'Out of Stock'}</span>`
          : (branchQty <= p.minStock 
            ? `<span class="product-card-badge">${window.POS_TRANSLATIONS[state.lang].lowStockAlert}</span>`
            : '')}
        <div class="product-image-container">
          ${displayImg}
        </div>
        <h4 title="${state.lang === 'km' ? p.nameKh : p.nameEn}">${state.lang === 'km' ? p.nameKh : p.nameEn}</h4>
        <div class="product-card-footer">
          <span class="product-price">${window.POS_HELPERS.formatUSD(p.sellingPrice)}</span>
          <span class="product-stock-text">Qty: <strong style="${isOutOfStock ? 'color: var(--danger);' : ''}">${branchQty}</strong></span>
        </div>
      `;

      card.addEventListener('click', () => {
        if (isOutOfStock) {
          alert(state.lang === 'km' ? 'ទំនិញគ្មានសល់ក្នុងស្តុកសម្រាប់សាខានេះទេ!' : 'Out of stock in selected branch!');
          return;
        }
        addToCart(p.sku);
      });

      grid.appendChild(card);
    });
  }

  // Shopping Cart Operations
  function addToCart(sku) {
    const product = state.products.find(p => p.sku === sku);
    if (!product) return;

    const branchId = document.getElementById('cart-branch-select').value;
    const branchQty = product.warehouseStock[branchId] || 0;

    const cartItem = state.cart.find(item => item.sku === sku);
    if (cartItem) {
      if (cartItem.qty + 1 > branchQty) {
        alert(state.lang === 'km' ? 'មិនអាចលក់លើសចំនួនក្នុងស្តុកបានទេ!' : 'Cannot checkout more than branch stock qty!');
        return;
      }
      cartItem.qty++;
    } else {
      state.cart.push({ sku: sku, qty: 1 });
    }

    renderCart();
  }

  function updateCartQty(sku, change) {
    const product = state.products.find(p => p.sku === sku);
    if (!product) return;

    const branchId = document.getElementById('cart-branch-select').value;
    const branchQty = product.warehouseStock[branchId] || 0;

    const cartItem = state.cart.find(item => item.sku === sku);
    if (cartItem) {
      const newQty = cartItem.qty + change;
      if (newQty <= 0) {
        deleteFromCart(sku);
      } else {
        if (newQty > branchQty) {
          alert(state.lang === 'km' ? 'មិនអាចលក់លើសចំនួនក្នុងស្តុកបានទេ!' : 'Cannot exceed available branch stock!');
          return;
        }
        cartItem.qty = newQty;
      }
    }
    renderCart();
  }

  function deleteFromCart(sku) {
    state.cart = state.cart.filter(item => item.sku !== sku);
    renderCart();
  }

  function renderCart() {
    const container = document.getElementById('cart-items-container');
    container.innerHTML = '';

    let subtotal = 0;
    let itemCount = 0;

    if (state.cart.length === 0) {
      container.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:30px; font-size:12px;" data-translate="emptyCart">${window.POS_TRANSLATIONS[state.lang].emptyCart}</div>`;
    } else {
      state.cart.forEach(item => {
        const p = state.products.find(prod => prod.sku === item.sku);
        if (p) {
          const itemTotal = p.sellingPrice * item.qty;
          subtotal += itemTotal;
          itemCount += item.qty;

          const itemEl = document.createElement('div');
          itemEl.className = 'cart-item';
          itemEl.innerHTML = `
            <div>
              <h5 title="${state.lang === 'km' ? p.nameKh : p.nameEn}">${state.lang === 'km' ? p.nameKh : p.nameEn}</h5>
              <div class="cart-item-price">${window.POS_HELPERS.formatUSD(p.sellingPrice)}</div>
            </div>
            <div class="qty-controls">
              <button class="qty-btn btn-minus">-</button>
              <span style="font-size:11px; font-weight:700;">${item.qty}</span>
              <button class="qty-btn btn-plus">+</button>
            </div>
            <div class="cart-item-total">${window.POS_HELPERS.formatUSD(itemTotal)}</div>
            <button class="qty-btn btn-del" style="color:var(--danger); font-size:11px;">×</button>
          `;

          itemEl.querySelector('.btn-minus').addEventListener('click', () => updateCartQty(item.sku, -1));
          itemEl.querySelector('.btn-plus').addEventListener('click', () => updateCartQty(item.sku, 1));
          itemEl.querySelector('.btn-del').addEventListener('click', () => deleteFromCart(item.sku));

          container.appendChild(itemEl);
        }
      });
    }

    document.getElementById('cart-item-count').innerText = itemCount;

    // Apply Calculations
    const discPercent = parseFloat(document.getElementById('cart-discount-percent').value) || 0;
    const discFixed = parseFloat(document.getElementById('cart-discount-fixed').value) || 0;
    const shipping = parseFloat(document.getElementById('cart-shipping-fee').value) || 0;
    
    const discFromPercent = subtotal * (discPercent / 100);
    const totalDiscount = discFromPercent + discFixed;
    
    const taxable = Math.max(0, subtotal - totalDiscount);
    const vatEnabled = state.companySettings.vatEnabled !== false;
    const vatRate = vatEnabled ? (state.companySettings.defaultVatRate !== undefined ? state.companySettings.defaultVatRate : 10) : 0;
    const tax = taxable * (vatRate / 100);
    const total = taxable + tax + shipping;

    document.getElementById('cart-subtotal').innerText = window.POS_HELPERS.formatUSD(subtotal);
    
    // Dynamic discount value badge update
    const discountValEl = document.getElementById('cart-discount-val');
    if (discountValEl) {
      discountValEl.innerText = totalDiscount > 0 ? `-${window.POS_HELPERS.formatUSD(totalDiscount)}` : `$0.00`;
    }

    // Reactive update of preset discount button active styling
    document.querySelectorAll('.discount-preset-btn').forEach(btn => {
      const val = parseFloat(btn.getAttribute('data-value')) || 0;
      if (val === discPercent && discFixed === 0) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Dynamic tax label formatting
    const taxLabel = document.querySelector('[data-translate="tax"]');
    if (taxLabel) {
      taxLabel.innerText = state.lang === 'km' ? `ពន្ធអាករ (VAT ${vatRate}%)` : `Tax (VAT ${vatRate}%)`;
    }
    document.getElementById('cart-tax').innerText = window.POS_HELPERS.formatUSD(tax);
    document.getElementById('cart-total-usd').innerText = window.POS_HELPERS.formatUSD(total);
    document.getElementById('cart-total-riel').innerText = window.POS_HELPERS.formatKHR(total);
  }

  // Checkout modal drawer
  function openCheckout() {
    if (state.cart.length === 0) {
      alert(state.lang === 'km' ? 'កន្ត្រកទទេស្អាត! សូមជ្រើសរើសផលិតផលលក់ជាមុនសិន។' : 'Shopping cart is empty!');
      return;
    }

    const branchId = document.getElementById('cart-branch-select').value;
    const staffId = document.getElementById('cart-staff-select').value;
    if (!staffId) {
      alert(state.lang === 'km' ? 'សូមជ្រើសរើសបុគ្គលិកលក់!' : 'Please select cashier/staff member!');
      return;
    }

    let subtotal = 0;
    state.cart.forEach(item => {
      const p = state.products.find(prod => prod.sku === item.sku);
      if (p) subtotal += p.sellingPrice * item.qty;
    });

    const discPercent = parseFloat(document.getElementById('cart-discount-percent').value) || 0;
    const discFixed = parseFloat(document.getElementById('cart-discount-fixed').value) || 0;
    const shipping = parseFloat(document.getElementById('cart-shipping-fee').value) || 0;
    
    const totalDiscount = (subtotal * (discPercent / 100)) + discFixed;
    const taxable = Math.max(0, subtotal - totalDiscount);
    const vatRate = state.companySettings.defaultVatRate !== undefined ? state.companySettings.defaultVatRate : 10;
    const tax = taxable * (vatRate / 100);
    const total = taxable + tax + shipping;

    document.getElementById('checkout-total-usd').innerText = window.POS_HELPERS.formatUSD(total);
    document.getElementById('checkout-total-riel').innerText = window.POS_HELPERS.formatKHR(total);

    // Default cash inputs
    document.getElementById('checkout-cash-input').value = total.toFixed(2);
    document.getElementById('checkout-cash-input').min = 0;
    updateCheckoutChange(total);

    // Draw Quick Cash Assist badges
    const assist = document.getElementById('cash-assist-tags');
    assist.innerHTML = '';
    const roundedUp = Math.ceil(total);
    const next5 = Math.ceil(total / 5) * 5;
    const next10 = Math.ceil(total / 10) * 10;
    const next50 = Math.ceil(total / 50) * 50;

    [total, roundedUp, next5, next10, next50].forEach(val => {
      if (val >= total) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-outline btn-sm';
        btn.innerText = '$' + val;
        btn.addEventListener('click', () => {
          document.getElementById('checkout-cash-input').value = val.toFixed(2);
          updateCheckoutChange(total);
        });
        assist.appendChild(btn);
      }
    });

    // Set standard method
    switchCheckoutMethod('cash', total);

    document.getElementById('modal-checkout').classList.add('active-modal');
  }

  function switchCheckoutMethod(method, totalDue) {
    state.checkoutMethod = method;
    document.querySelectorAll('.checkout-method-card').forEach(card => card.classList.remove('active'));
    
    const activeCard = document.getElementById('pay-card-' + method);
    if (activeCard) activeCard.classList.add('active');

    const cashDrawer = document.getElementById('checkout-cash-drawer');
    const khqrDrawer = document.getElementById('checkout-khqr-drawer');

    if (method === 'cash') {
      cashDrawer.style.display = 'block';
      khqrDrawer.style.display = 'none';
    } else if (method === 'khqr') {
      cashDrawer.style.display = 'none';
      khqrDrawer.style.display = 'flex';

      const canvas = document.getElementById('khqr-canvas');
      const img = document.getElementById('checkout-custom-khqr');
      const caption = document.getElementById('khqr-drawer-caption');

      if (state.companySettings && state.companySettings.khqrBase64) {
        if (canvas) canvas.style.display = 'none';
        if (img) {
          img.style.display = 'block';
          img.src = state.companySettings.khqrBase64;
        }
        if (caption) {
          caption.innerText = state.lang === 'km' ? 'ស្កេនបាកូដដើម្បីទូទាត់ប្រាក់ (ABA Pay / KHQR របស់អ្នក)' : 'Scan code to complete transaction (Your ABA Pay / KHQR)';
        }
      } else {
        if (canvas) {
          canvas.style.display = 'block';
          window.POS_HELPERS.drawKHQR('khqr-canvas', totalDue);
        }
        if (img) img.style.display = 'none';
        if (caption) {
          caption.innerText = state.lang === 'km' ? 'ស្កេនបាកូដដើម្បីទូទាត់ប្រាក់ (Dynamic ABA Pay QR)' : 'Scan code to complete transaction (Simulated ABA Pay QR)';
        }
      }
    } else {
      // bank or card
      cashDrawer.style.display = 'none';
      khqrDrawer.style.display = 'none';
    }
  }

  function updateCheckoutChange(totalDue) {
    const cashInput = parseFloat(document.getElementById('checkout-cash-input').value) || 0;
    const changeUsd = document.getElementById('checkout-change-usd');
    const changeRiel = document.getElementById('checkout-change-riel');
    const debtWarning = document.getElementById('checkout-debt-warning');
    const debtUsd = document.getElementById('checkout-debt-usd');
    const debtRiel = document.getElementById('checkout-debt-riel');

    if (cashInput >= totalDue) {
      const change = cashInput - totalDue;
      changeUsd.innerText = window.POS_HELPERS.formatUSD(change);
      changeRiel.innerText = window.POS_HELPERS.formatKHR(change);
      debtWarning.style.display = 'none';
    } else {
      const debt = totalDue - cashInput;
      changeUsd.innerText = '$0.00';
      changeRiel.innerText = '0 ៛';
      
      debtWarning.style.display = 'block';
      debtUsd.innerText = window.POS_HELPERS.formatUSD(debt);
      debtRiel.innerText = window.POS_HELPERS.formatKHR(debt);
    }
  }

  function sendTelegramCheckoutNotification(tx) {
    const token = state.companySettings.telegramToken;
    const chatId = state.companySettings.telegramChatId;

    if (!token || !chatId) {
      console.log("Telegram notification skipped: Token or Chat ID not configured.");
      return;
    }

    try {
      const branch = state.branches.find(b => b.id === tx.branchId) || { name: 'ABC System' };
      const customer = state.customers.find(c => c.id === tx.customerId);
      const isGeneral = tx.customerId === 'CST-001';
      const purchaseCount = isGeneral ? 1 : state.transactions.filter(t => t.customerId === tx.customerId).length;

      const esc = (text) => (text || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      
      const branchName = esc(branch.name);
      const invoiceNo = esc(tx.invoiceNo);
      const staffName = esc(tx.staffName);
      const pageName = esc(tx.pageName || 'Direct Sales');
      const customerName = esc(isGeneral ? 'General Customer / អតិថិជនទូទៅ' : tx.customerName);
      const phone = esc(customer && customer.phone ? customer.phone : 'N/A');
      const paymentMethod = esc(tx.paymentMethod.toUpperCase());

      // Parse Facebook URL
      const getFbUrl = (link) => {
        if (!link) return '';
        const trimmed = link.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
        if (trimmed.includes('facebook.com') || trimmed.includes('fb.com')) {
          return 'https://' + trimmed.replace(/^(https?:\/\/)?(www\.)?/, '');
        }
        return 'https://facebook.com/' + trimmed;
      };

      const fbLink = customer && customer.facebookLink ? getFbUrl(customer.facebookLink) : '';
      const fbSection = fbLink ? `🌐 <b>Facebook:</b> <a href="${esc(fbLink)}">View Profile</a>` : '🌐 <b>Facebook:</b> N/A';

      // Build items text
      let itemsText = '';
      tx.items.forEach((item, index) => {
        itemsText += `${index + 1}. 🛒 <b>${esc(item.nameEn)}</b> (Qty: ${item.qty}) - $${item.price.toFixed(2)}\n`;
      });

      // Helper for Khmer numerals
      const toKhmerNumerals = (num) => {
        const khmerDigits = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'];
        return num.toString().split('').map(digit => khmerDigits[digit] || digit).join('');
      };

      // Helper for English ordinal
      const getOrdinal = (n) => {
        if (n === 1) return '1st';
        if (n === 2) return '2nd';
        if (n === 3) return '3rd';
        return n + 'th';
      };

      let headerText = '🔔 <b>New Order / ការកម្មង់ថ្មី</b>';
      if (!isGeneral && purchaseCount > 1) {
        const ord = getOrdinal(purchaseCount);
        const khNum = toKhmerNumerals(purchaseCount);
        headerText = `🔔 <b>Repeat Order (${ord}) / ការកម្មង់លើកទី${khNum}</b>`;
      }

      // Build full message in HTML
      let message = `${headerText}\n\n`;
      message += `📄 <b>Invoice No:</b> <code>${invoiceNo}</code>\n`;
      message += `📅 <b>Date:</b> ${window.POS_HELPERS.formatDate(tx.date || new Date().toISOString(), state.lang)}\n`;
      message += `🏪 <b>Branch:</b> ${branchName}\n`;
      message += `👤 <b>Staff:</b> ${staffName} (${pageName})\n\n`;

      message += `👤 <b>Customer:</b> ${customerName}\n`;
      message += `📞 <b>Phone:</b> <code>${phone}</code>\n`;
      message += `${fbSection}\n\n`;

      message += `📦 <b>Ordered Items:</b>\n${itemsText}\n`;
      message += `💵 <b>Total Amount:</b> $${tx.total.toFixed(2)}\n`;
      message += `💳 <b>Payment Method:</b> ${paymentMethod}\n`;
      if (tx.outstandingDebt > 0) {
        message += `⚠️ <b>Outstanding Debt:</b> $${tx.outstandingDebt.toFixed(2)}\n`;
      }

      // Send to Telegram API asynchronously using fetch
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      })
      .then(response => {
        if (!response.ok) {
          return response.json().then(err => {
            console.error('Telegram API error response:', err);
          });
        }
        console.log('Telegram notification sent successfully!');
      })
      .catch(err => {
        console.error('Error sending Telegram notification:', err);
      });
    } catch (e) {
      console.error('Error constructing Telegram notification:', e);
    }
  }

  function completeCheckout() {
    const branchId = document.getElementById('cart-branch-select').value || "BR-001";
    const staffId = document.getElementById('cart-staff-select').value;
    const customerId = document.getElementById('cart-customer-select').value;
    
    const staff = state.staff.find(s => s.id === staffId) || { name: 'Unknown', id: 'STF-001' };
    const customer = state.customers.find(c => c.id === customerId);

    let subtotal = 0;
    let totalQty = 0;
    state.cart.forEach(item => {
      const p = state.products.find(prod => prod.sku === item.sku);
      if (p) {
        subtotal += p.sellingPrice * item.qty;
        totalQty += item.qty;
      }
    });

    const discPercent = parseFloat(document.getElementById('cart-discount-percent').value) || 0;
    const discFixed = parseFloat(document.getElementById('cart-discount-fixed').value) || 0;
    const shipping = parseFloat(document.getElementById('cart-shipping-fee').value) || 0;
    
    const discFromPercent = subtotal * (discPercent / 100);
    const totalDiscount = discFromPercent + discFixed;
    
    const taxable = Math.max(0, subtotal - totalDiscount);
    // VAT Management Settings integration
    const vatEnabled = state.companySettings.vatEnabled !== false;
    const vatRate = vatEnabled ? (state.companySettings.defaultVatRate !== undefined ? state.companySettings.defaultVatRate : 10) : 0;
    const tax = taxable * (vatRate / 100);
    const total = taxable + tax + shipping;

    let cashReceived = total;
    let changeDue = 0;
    let outstandingDebt = 0;

    if (state.checkoutMethod === 'cash') {
      cashReceived = parseFloat(document.getElementById('checkout-cash-input').value) || 0;
      if (cashReceived < total) {
        if (customerId === 'CST-001') {
          alert(state.lang === 'km' 
            ? 'គណនីអតិថិជនទូទៅមិនអាចកត់ត្រាជំពាក់បានទេ! សូមជ្រើសរើស ឬចុះឈ្មោះអតិថិជនជាក់លាក់។' 
            : 'General Customer cannot buy on credit/debt. Please select or register specific customer.');
          return;
        }
        outstandingDebt = total - cashReceived;
        changeDue = 0;
      } else {
        changeDue = cashReceived - total;
      }
    }

    // Role-based verification checks
    if (!guardAction('add')) return;

    // VIP Customer Automation (Advanced Update Requirement 5)
    if (totalQty >= 5 && customer && customer.id !== 'CST-001') {
      if (!customer.isVip) {
        customer.isVip = true;
        customer.vipDate = new Date().toISOString().split('T')[0];
        customer.rank = 'Platinum VIP';
        logAuditEvent('customerEdit', `Customer ${customer.name} automatically upgraded to VIP due to purchasing ${totalQty} units`);
      }
    }

    // Deduct stock and log
    state.cart.forEach(item => {
      const product = state.products.find(p => p.sku === item.sku);
      if (product) {
        const branchStock = product.warehouseStock[branchId] || 0;
        product.warehouseStock[branchId] = Math.max(0, branchStock - item.qty);
        
        let sum = 0;
        for (const b in product.warehouseStock) {
          sum += parseInt(product.warehouseStock[b]) || 0;
        }
        product.stockQty = sum;

        // Log Stock Movement
        state.stockLogs.push({
          id: 'SLG-' + (1000 + state.stockLogs.length + 1),
          date: new Date().toISOString(),
          sku: product.sku,
          type: 'sale',
          qty: -item.qty,
          warehouseId: branchId,
          description: `Sold via Invoice INV-2026-${1000 + state.transactions.length + 1}`,
          branchId: branchId,
          createdBy: state.currentUser ? state.currentUser.username : 'system',
          updatedBy: state.currentUser ? state.currentUser.username : 'system',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Update customer outstanding debt
    if (outstandingDebt > 0 && customer) {
      customer.outstandingDebt = (customer.outstandingDebt || 0) + outstandingDebt;
    }

    // Save CRM auto-followups (Restart schedule on new purchase, update order counts & histories)
    if (customerId !== 'CST-001' && customer) {
      // 1. Update customer order count and list
      customer.purchaseCount = (customer.purchaseCount || 0) + 1;
      
      const itemsDesc = state.cart.map(item => {
        const p = state.products.find(prod => prod.sku === item.sku);
        const name = p ? (state.lang === 'km' ? p.nameKh : p.nameEn) : item.sku;
        return `${name} x ${item.qty}`;
      }).join(', ');
      
      const totalQty = state.cart.reduce((sum, item) => sum + item.qty, 0);

      if (!customer.orders) customer.orders = [];
      customer.orders.push({
        date: new Date().toISOString(),
        product: itemsDesc,
        qty: totalQty,
        staffName: staff.name
      });

      // 2. Add purchase timeline item
      if (!customer.timeline) customer.timeline = [];
      customer.timeline.push({
        date: new Date().toISOString(),
        status: 'Purchase',
        staffName: staff.name,
        feedback: 'Repeat purchase recorded',
        notes: `Purchased ${itemsDesc}`
      });

      // 3. Restart follow-up schedule
      const schedules = [];
      const followUpDays = [3, 5, 7, 22, 37, 52, 82, 112, 142];
      const types = ['satisfaction', 'feedback', 'satisfaction', 'promo', 'engagement', 'engagement', 'engagement', 'promo', 'engagement'];
      
      followUpDays.forEach((day, idx) => {
        const d = new Date();
        d.setDate(d.getDate() + day);
        schedules.push({
          day: day,
          date: d.toISOString(),
          type: types[idx],
          status: 'pending',
          notes: ''
        });
      });

      let flp = state.followups.find(f => f.customerId === customerId);
      if (flp) {
        flp.schedules = schedules;
        flp.salesStaffId = staff.id;
        flp.salesStaffName = staff.name;
        flp.branchId = branchId;
      } else {
        const flpId = 'FLP-' + String(state.followups.length + 1).padStart(3, '0');
        state.followups.push({
          id: flpId,
          saleId: 'TX-' + (1000 + state.transactions.length + 1),
          customerId: customerId,
          customerName: customer.name,
          salesStaffId: staff.id,
          salesStaffName: staff.name,
          branchId: branchId,
          schedules: schedules
        });
      }
    }

    // Build Transaction object
    const prefix = state.companySettings.invoicePrefix || 'INV-2026-';
    const invoiceNo = prefix + String(1000 + state.transactions.length + 1);
    
    // Find the user matched with staff to extract Facebook Page assignment (Requirement 10)
    const staffUser = state.users.find(u => u.name === staff.name || u.id === staff.id || u.username === staff.id);
    const pageName = staffUser ? (staffUser.pageName || "Direct Sales") : "Direct Sales";
    const pageId = staffUser ? (staffUser.pageId || null) : null;

    const newTX = {
      id: 'TX-' + (1000 + state.transactions.length + 1),
      invoiceNo: invoiceNo,
      date: new Date().toISOString(),
      staffId: staff.id,
      staffName: staff.name,
      pageName: pageName,
      pageId: pageId,
      customerId: customerId,
      customerName: customer ? customer.name : 'General Customer',
      branchId: branchId,
      items: state.cart.map(item => {
        const p = state.products.find(prod => prod.sku === item.sku);
        return {
          sku: item.sku,
          nameEn: p.nameEn,
          nameKh: p.nameKh,
          price: p.sellingPrice,
          costPrice: p ? (p.costPrice !== undefined ? p.costPrice : 0) : 0,
          qty: item.qty,
          total: p.sellingPrice * item.qty
        };
      }),
      subtotal: subtotal,
      discountPercent: discPercent,
      discountFixed: discFixed,
      shippingFee: shipping,
      taxRate: vatRate,
      taxAmount: tax,
      total: total,
      paymentMethod: state.checkoutMethod,
      cashReceived: cashReceived,
      changeDue: changeDue,
      outstandingDebt: outstandingDebt,
      status: "completed",
      createdBy: state.currentUser ? state.currentUser.username : 'system',
      updatedBy: state.currentUser ? state.currentUser.username : 'system',
      timestamp: new Date().toISOString()
    };

    state.transactions.push(newTX);
    saveStateToLocalStorage();
    sendTelegramCheckoutNotification(newTX);
    updateLowStockAlertCount();
    checkCRMNotifications();
    playSound('success');

    // Close overlays & modals
    document.getElementById('modal-checkout').classList.remove('active-modal');

    // Trigger Print Receipt preview
    openReceiptModal(newTX);

    // Reset shopping cart
    state.cart = [];
    document.getElementById('cart-discount-percent').value = 0;
    document.getElementById('cart-discount-fixed').value = 0;
    document.getElementById('cart-shipping-fee').value = 0;
    
    renderPOS();
    populatePOSSelects();
  }

  function openReceiptModal(tx) {
    const area = document.getElementById('receipt-print-area');
    const br = state.branches.find(b => b.id === tx.branchId) || { name: 'ABC System' };
    
    let itemsHtml = '';
    tx.items.forEach(item => {
      const name = state.lang === 'km' ? item.nameKh : item.nameEn;
      itemsHtml += `
        <tr>
          <td>${name}<br><span style="font-size:9px;color:#555;">${item.sku} x ${item.qty}</span></td>
          <td style="text-align:right; vertical-align:bottom;">${window.POS_HELPERS.formatUSD(item.total)}</td>
        </tr>
      `;
    });

    const isKm = state.lang === 'km';
    const methodTranslate = window.POS_TRANSLATIONS[state.lang][tx.paymentMethod] || tx.paymentMethod;

    const logoHtml = state.companySettings.logoBase64
      ? `<div style="margin-bottom:6px;"><img src="${state.companySettings.logoBase64}" style="max-height:50px; max-width:145px; object-fit:contain;"></div>`
      : '';

    area.innerHTML = `
      <div style="text-align:center; border-bottom:1px dashed #000; padding-bottom:10px; margin-bottom:10px;">
        ${logoHtml}
        <h3 style="margin:0; font-size:16px;">${state.companySettings.companyName || 'ABC System'}</h3>
        <p style="margin:2px 0; font-size:10px;">${isKm ? br.nameKh : br.name}</p>
        <p style="margin:2px 0; font-size:9px;">Tel: ${state.companySettings.phone || br.phone}</p>
      </div>

      <div style="font-size:10px; margin-bottom:10px; border-bottom:1px dashed #000; padding-bottom:10px; display:flex; flex-direction:column; gap:2px;">
        <div><strong>Invoice No:</strong> ${tx.invoiceNo}</div>
        <div><strong>Date:</strong> ${window.POS_HELPERS.formatDate(tx.date, state.lang)}</div>
        <div><strong>Cashier:</strong> ${tx.staffName}</div>
        <div><strong>Customer:</strong> ${tx.customerName}</div>
      </div>

      <table style="width:100%; font-size:10px; border-collapse:collapse; margin-bottom:10px;">
        <thead>
          <tr style="border-bottom:1px solid #000;">
            <th style="text-align:left; padding-bottom:4px;">Item</th>
            <th style="text-align:right; padding-bottom:4px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="border-top:1px dashed #000; padding-top:10px; font-size:10px; display:flex; flex-direction:column; gap:4px;">
        <div style="display:flex; justify-content:space-between;">
          <span>Subtotal:</span>
          <span>${window.POS_HELPERS.formatUSD(tx.subtotal)}</span>
        </div>
        ${tx.discountPercent > 0 || tx.discountFixed > 0 ? `
          <div style="display:flex; justify-content:space-between; color:#444;">
            <span>Discount:</span>
            <span>-${window.POS_HELPERS.formatUSD((tx.subtotal * (tx.discountPercent / 100)) + tx.discountFixed)}</span>
          </div>
        ` : ''}
        ${tx.shippingFee > 0 ? `
          <div style="display:flex; justify-content:space-between; color:#444;">
            <span>Shipping:</span>
            <span>${window.POS_HELPERS.formatUSD(tx.shippingFee)}</span>
          </div>
        ` : ''}
        <div style="display:flex; justify-content:space-between;">
          <span>VAT (${tx.taxRate}%):</span>
          <span>${window.POS_HELPERS.formatUSD(tx.taxAmount)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:12px; border-top:1px solid #000; padding-top:4px; margin-top:4px;">
          <span>Total Due:</span>
          <span>${window.POS_HELPERS.formatUSD(tx.total)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:10px; color:#555;">
          <span>Riel Amount:</span>
          <span>${window.POS_HELPERS.formatKHR(tx.total)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; border-top:1px dashed #000; padding-top:4px; margin-top:4px;">
          <span>Payment:</span>
          <span style="text-transform:uppercase;">${methodTranslate}</span>
        </div>
        ${tx.outstandingDebt > 0 ? `
          <div style="display:flex; justify-content:space-between; font-weight:bold; color:red;">
            <span>On Account (Debt):</span>
            <span>${window.POS_HELPERS.formatUSD(tx.outstandingDebt)}</span>
          </div>
        ` : `
          <div style="display:flex; justify-content:space-between; color:#555;">
            <span>Cash Paid:</span>
            <span>${window.POS_HELPERS.formatUSD(tx.cashReceived)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; color:#555;">
            <span>Change:</span>
            <span>${window.POS_HELPERS.formatUSD(tx.changeDue)}</span>
          </div>
        `}
      </div>

      <div style="text-align:center; margin-top:16px; font-size:9px; border-top:1px dashed #000; padding-top:8px;">
        <p style="margin:0;">${window.POS_TRANSLATIONS[state.lang].thankYou}</p>
        <p style="margin:4px 0 0 0; font-size:8px; color:#555; font-weight:500;">
          ${window.POS_TRANSLATIONS[state.lang].developedBy}: NOUEN Dany • Support: (+855) 10 955 536
        </p>
        <div style="margin-top:6px; display:inline-block; opacity:0.85;">
          ${window.POS_HELPERS.generateBarcode(tx.invoiceNo)}
          <span style="font-size:8px; display:block; margin-top:2px;">${tx.invoiceNo}</span>
        </div>
      </div>
    `;

    document.getElementById('modal-receipt').classList.add('active-modal');
  }

  // 3. PRODUCTS & INVENTORY RENDER
  function renderInventory() {
    const tbody = document.getElementById('inventory-table-body');
    tbody.innerHTML = '';

    const filterBranch = getActiveBranchFilter();

    state.products.forEach((p, idx) => {
      const branchQty = filterBranch ? (p.warehouseStock[filterBranch] || 0) : p.stockQty;
      const statusBadge = p.status === 'active' 
        ? `<span class="badge badge-success" data-translate="active">${window.POS_TRANSLATIONS[state.lang].active}</span>`
        : `<span class="badge badge-danger" data-translate="inactive">${window.POS_TRANSLATIONS[state.lang].inactive}</span>`;
      
      const thumb = p.image 
        ? `<img src="${p.image}" style="width:36px; height:36px; object-fit:cover; border-radius:4px; border: 1px solid var(--border-color);">`
        : `<span style="font-size:20px;">📦</span>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color:var(--secondary); font-family:monospace;">${p.sku}</strong></td>
        <td>${thumb}</td>
        <td><strong>${p.nameEn}</strong></td>
        <td>${p.nameKh}</td>
        <td><span class="badge badge-warning" style="text-transform:none;">${p.category}</span></td>
        <td style="font-weight:750; color:var(--primary);">${window.POS_HELPERS.formatUSD(p.sellingPrice)}</td>
        <td style="text-align:center; font-weight:800; color:${branchQty <= p.minStock ? 'var(--danger)' : 'var(--text-primary)'};">${branchQty}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-outline btn-sm btn-edit-p" data-idx="${idx}" style="padding:2px 6px;">✏️</button>
          <button class="btn btn-danger btn-sm btn-del-p" data-idx="${idx}" style="padding:2px 6px;">🗑️</button>
        </td>
      `;

      tr.querySelector('.btn-edit-p').addEventListener('click', () => openEditProductModal(idx));
      tr.querySelector('.btn-del-p').addEventListener('click', () => deleteProduct(idx));

      tbody.appendChild(tr);
    });
  }

  function openEditProductModal(idx) {
    if (!guardAction('edit')) return;
    
    populateProductDropdowns();
    
    const p = state.products[idx];
    document.getElementById('product-modal-title').innerText = window.POS_TRANSLATIONS[state.lang].editProduct;
    document.getElementById('product-edit-index').value = idx;

    document.getElementById('prod-sku').value = p.sku;
    document.getElementById('prod-barcode').value = p.barcode;
    document.getElementById('prod-name-kh').value = p.nameKh;
    document.getElementById('prod-name-en').value = p.nameEn;
    document.getElementById('prod-category').value = p.category;
    document.getElementById('prod-brand').value = p.brand;
    document.getElementById('prod-unit').value = p.unit;
    document.getElementById('prod-cost').value = p.costPrice;
    document.getElementById('prod-price').value = p.sellingPrice;
    document.getElementById('prod-min-stock').value = p.minStock;
    document.getElementById('prod-desc').value = p.description || '';

    state.selectedProductImageBase64 = p.image || null;

    const preview = document.getElementById('prod-image-preview');
    const placeholder = document.getElementById('prod-image-placeholder');
    const removeBtn = document.getElementById('btn-remove-prod-image');

    if (p.image) {
      preview.src = p.image;
      preview.style.display = 'block';
      placeholder.style.display = 'none';
      removeBtn.style.display = 'block';
    } else {
      preview.src = '';
      preview.style.display = 'none';
      placeholder.style.display = 'flex';
      removeBtn.style.display = 'none';
    }

    document.getElementById('modal-product').classList.add('active-modal');
  }

  function deleteProduct(idx) {
    if (!guardAction('delete')) return;
    if (confirm(window.POS_TRANSLATIONS[state.lang].confirmDelete)) {
      state.products.splice(idx, 1);
      saveStateToLocalStorage();
      updateLowStockAlertCount();
      renderInventory();
    }
  }

  // 4. MULTI-BRANCH PANEL
  function renderBranches() {
    // 1. Branches list
    const tbody = document.getElementById('branches-table-body');
    tbody.innerHTML = '';

    state.branches.forEach((b) => {
      const statusBadge = b.status === 'active'
        ? `<span class="badge badge-success" data-translate="active">${window.POS_TRANSLATIONS[state.lang].active}</span>`
        : `<span class="badge badge-danger" data-translate="inactive">${window.POS_TRANSLATIONS[state.lang].inactive}</span>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color:var(--secondary); font-family:monospace;">${b.code}</strong></td>
        <td><strong>${state.lang === 'km' ? b.nameKh : b.name}</strong></td>
        <td>${b.phone}</td>
        <td>${b.manager}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-outline btn-sm btn-edit-b" data-id="${b.id}" style="padding:2px 6px;">✏️</button>
          <button class="btn btn-danger btn-sm btn-del-b" data-id="${b.id}" style="padding:2px 6px;">🗑️</button>
        </td>
      `;

      tr.querySelector('.btn-edit-b').addEventListener('click', () => openEditBranchModal(b.id));
      tr.querySelector('.btn-del-b').addEventListener('click', () => deleteBranch(b.id));

      tbody.appendChild(tr);
    });

    // 2. Stock Matrix Grid
    const matrix = document.getElementById('branch-inventory-matrix-table');
    matrix.innerHTML = '';

    let headHtml = '<tr><th>Product (SKU)</th>';
    state.branches.forEach(b => {
      headHtml += `<th class="branch-cell-header">${state.lang === 'km' ? b.nameKh : b.name}</th>`;
    });
    headHtml += '<th style="text-align:center;">Total Qty</th></tr>';

    let bodyHtml = '';
    state.products.forEach(p => {
      bodyHtml += `<tr><td><strong>${state.lang === 'km' ? p.nameKh : p.nameEn}</strong><br><span style="font-size:9px;color:var(--text-muted); font-family:monospace;">${p.sku}</span></td>`;
      state.branches.forEach(b => {
        const qty = p.warehouseStock[b.id] || 0;
        bodyHtml += `<td class="branch-stock-val" style="color:${qty <= p.minStock ? 'var(--danger)' : 'var(--text-primary)'};">${qty}</td>`;
      });
      bodyHtml += `<td style="text-align:center; font-weight:800; color:var(--primary);">${p.stockQty}</td></tr>`;
    });

    matrix.innerHTML = `<thead>${headHtml}</thead><tbody>${bodyHtml}</tbody>`;
  }

  function openEditBranchModal(id) {
    if (!guardAction('edit')) return;
    const b = state.branches.find(br => br.id === id);
    if (!b) return;

    document.getElementById('branch-card-title').innerText = window.POS_TRANSLATIONS[state.lang].editBranch;
    document.getElementById('branch-edit-id').value = b.id;
    document.getElementById('br-form-code').value = b.code;
    document.getElementById('br-form-name').value = b.name;
    document.getElementById('br-form-name-kh').value = b.nameKh;
    document.getElementById('br-form-address').value = b.address;
    document.getElementById('br-form-phone').value = b.phone;
    document.getElementById('br-form-manager').value = b.manager;
    document.getElementById('br-form-status').value = b.status;
  }

  function deleteBranch(id) {
    if (!guardAction('delete')) return;
    if (state.branches.length <= 1) {
      alert(state.lang === 'km' ? 'ត្រូវតែមានសាខាយ៉ាងហោចណាស់មួយជានិច្ច!' : 'Must always maintain at least one branch!');
      return;
    }
    if (confirm(window.POS_TRANSLATIONS[state.lang].confirmDelete)) {
      state.branches = state.branches.filter(br => br.id !== id);
      
      // Delete stock mappings
      state.products.forEach(p => {
        if (p.warehouseStock && p.warehouseStock[id] !== undefined) {
          delete p.warehouseStock[id];
          // Recalculate
          let sum = 0;
          for (const key in p.warehouseStock) sum += parseInt(p.warehouseStock[key]) || 0;
          p.stockQty = sum;
        }
      });

      saveStateToLocalStorage();
      renderBranches();
      populatePOSSelects();
    }
  }

  // Customer Retention & Engagement Score calculator (Advanced Update Requirement 9)
  function getCustomerEngagementScore(customerId) {
    if (customerId === 'CST-001') return 100;
    let score = 85; // Base default score
    const customerFollowups = state.followups.filter(f => f.customerId === customerId);
    
    let totalSchedules = 0;
    let completedSchedules = 0;
    let delayedSchedules = 0;
    
    customerFollowups.forEach(f => {
      f.schedules.forEach(s => {
        totalSchedules++;
        if (s.status === 'completed') {
          completedSchedules++;
          if (s.notes && (s.notes.toLowerCase().includes('no response') || s.notes.toLowerCase().includes('unresponsive') || s.notes.toLowerCase().includes('not answer'))) {
            score -= 15;
          } else if (s.notes && (s.notes.toLowerCase().includes('angry') || s.notes.toLowerCase().includes('bad') || s.notes.toLowerCase().includes('dislike') || s.notes.toLowerCase().includes('unhappy'))) {
            score -= 25;
          } else {
            score += 5; // Positive engagement
          }
        } else {
          // Pending
          const d = new Date(s.date);
          if (d < new Date()) {
            delayedSchedules++;
            score -= 10; // Overdue reminder
          }
        }
      });
    });
    
    if (totalSchedules === 0) return 100; // New customer
    return Math.min(100, Math.max(0, score));
  }

  function renderCustomers() {
    const tbody = document.getElementById('customers-crm-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Calculate customer order stats
    const customerStats = {};
    state.customers.forEach(c => {
      customerStats[c.id] = { orderCount: 0, totalSpent: 0 };
    });
    state.transactions.forEach(t => {
      const cId = t.customerId || 'CST-001';
      if (!customerStats[cId]) {
        customerStats[cId] = { orderCount: 0, totalSpent: 0 };
      }
      customerStats[cId].orderCount++;
      customerStats[cId].totalSpent += t.total;
    });

    // Populate filter dropdown if it exists
    const filterSelect = document.getElementById('filter-customer-staff');
    if (filterSelect) {
      const currentFilterVal = filterSelect.value || 'all';
      let filterOpts = `<option value="all">${state.lang === 'km' ? '--- បុគ្គលិកទាំងអស់ ---' : '--- All Staff ---'}</option>`;
      filterOpts += `<option value="unassigned">${state.lang === 'km' ? '--- មិនទាន់ចាត់តាំង ---' : '--- Unassigned ---'}</option>`;
      state.staff.forEach(s => {
        filterOpts += `<option value="${s.id}">${s.name}</option>`;
      });
      filterSelect.innerHTML = filterOpts;
      filterSelect.value = currentFilterVal;
    }

    const activeStaffFilter = filterSelect ? filterSelect.value : 'all';
    const filterBranch = getActiveBranchFilter();

    state.customers.forEach((c, idx) => {
      if (filterBranch && c.branchId && c.branchId !== filterBranch && c.id !== 'CST-001') return;

      // Filter by Staff
      if (activeStaffFilter === 'unassigned' && c.staffId) return;
      if (activeStaffFilter !== 'all' && activeStaffFilter !== 'unassigned' && c.staffId !== activeStaffFilter) return;

      let badgeColor = 'badge-success';
      if (c.rank === 'Silver') badgeColor = 'badge-warning';
      else if (c.rank === 'Gold') badgeColor = 'badge-primary';
      else if (c.rank === 'Platinum VIP' || c.isVip) badgeColor = 'badge-secondary';

      const vipBadge = c.isVip ? '<span class="vip-badge">★ VIP</span>' : '';
      
      const score = getCustomerEngagementScore(c.id);
      let scoreColor = '#10b981'; // green
      if (score < 50) scoreColor = '#ef4444'; // red
      else if (score < 80) scoreColor = '#f59e0b'; // yellow

      const staff = state.staff.find(s => s.id === c.staffId);
      let staffDisplay = `<span style="color:var(--text-muted); font-style:italic;">${state.lang === 'km' ? 'មិនទាន់ចាត់តាំង' : 'Unassigned'}</span>`;
      if (staff) {
        staffDisplay = `<strong>${staff.name}</strong>`;
        if (staff.fbPage) {
          staffDisplay += `<br><span style="font-size:9px;color:#1877f2;font-weight:600;">🌐 ${staff.fbPage}</span>`;
        }
      }

      const stats = customerStats[c.id] || { orderCount: 0, totalSpent: 0 };
      const ordersHtml = `
        <div style="text-align:center;">
          <span class="badge badge-info btn-view-history" style="cursor:pointer; font-weight:700; background:rgba(6,182,212,0.1); color:#06b6d4; border:1px solid rgba(6,182,212,0.2);" data-id="${c.id}">
            ${stats.orderCount} ${state.lang === 'km' ? 'ដង' : 'Orders'} 📜
          </span>
        </div>
      `;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color:var(--secondary); font-family:monospace;">${c.id}</strong></td>
        <td><strong>${c.name}</strong>${vipBadge}</td>
        <td>${c.phone}</td>
        <td><span class="badge badge-warning" style="text-transform:none;">${c.source}</span></td>
        <td>${staffDisplay}</td>
        <td>
          <span class="badge ${badgeColor}">${c.rank || 'Bronze'}</span>
          <div class="engagement-container">
            <div class="engagement-bar-bg">
              <div class="engagement-bar-fill" style="width:${score}%; background:${scoreColor};"></div>
            </div>
            <span style="font-size:9px; font-weight:700; color:${scoreColor}">${score}%</span>
          </div>
        </td>
        <td>${ordersHtml}</td>
        <td style="text-align:right; font-weight:750; color:${c.outstandingDebt > 0 ? 'var(--danger)' : 'var(--text-primary)'};">${window.POS_HELPERS.formatUSD(c.outstandingDebt || 0)}</td>
        <td style="text-align:center;">
          ${c.outstandingDebt > 0 ? `<button class="btn btn-secondary btn-sm btn-pay-debt" data-idx="${idx}" style="padding:2px 8px; font-size:11px; background-color:#10b981; border:none;" data-translate="pay">Pay</button>` : '—'}
        </td>
        <td style="font-size:11px; color:var(--text-secondary); max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${c.notes || '-'}</td>
        <td>
          <button class="btn btn-outline btn-sm btn-edit-c" data-idx="${idx}" style="padding:2px 6px;">✏️</button>
          <button class="btn btn-outline btn-sm btn-history-c" data-id="${c.id}" style="padding:2px 6px;" title="View History">📜</button>
          <button class="btn btn-danger btn-sm btn-del-c" data-idx="${idx}" style="padding:2px 6px;">🗑️</button>
        </td>

      `;

      tr.querySelector('.btn-edit-c').addEventListener('click', () => openCustomerModal(idx));
      tr.querySelector('.btn-del-c').addEventListener('click', () => deleteCustomer(idx));
      
      const viewHistoryBtn = tr.querySelector('.btn-history-c');
      if (viewHistoryBtn) {
        viewHistoryBtn.addEventListener('click', () => openCustomerHistoryModal(c.id));
      }
      const viewHistoryBadge = tr.querySelector('.btn-view-history');
      if (viewHistoryBadge) {
        viewHistoryBadge.addEventListener('click', () => openCustomerHistoryModal(c.id));
      }

      if (c.outstandingDebt > 0) {
        tr.querySelector('.btn-pay-debt').addEventListener('click', () => openPayDebtModal(c));
      }

      tbody.appendChild(tr);
    });
  }

  function openCustomerHistoryModal(customerId) {
    const customer = state.customers.find(c => c.id === customerId);
    if (!customer) return;

    // Reset tabs state to purchases first
    const tabPurchases = document.getElementById('tab-cust-purchases');
    const tabTimeline = document.getElementById('tab-cust-timeline');
    const contentPurchases = document.getElementById('content-cust-purchases');
    const contentTimeline = document.getElementById('content-cust-timeline');

    if (tabPurchases && tabTimeline && contentPurchases && contentTimeline) {
      tabPurchases.classList.add('active');
      tabTimeline.classList.remove('active');
      contentPurchases.classList.add('active');
      contentTimeline.classList.remove('active');

      tabPurchases.onclick = () => {
        tabPurchases.classList.add('active');
        tabTimeline.classList.remove('active');
        contentPurchases.classList.add('active');
        contentTimeline.classList.remove('active');
      };
      tabTimeline.onclick = () => {
        tabTimeline.classList.add('active');
        tabPurchases.classList.remove('active');
        contentTimeline.classList.add('active');
        contentPurchases.classList.remove('active');
      };
    }

    // Calculate customer order stats
    const orderDates = [];
    let totalSpent = 0;
    state.transactions.forEach(t => {
      const cId = t.customerId || 'CST-001';
      if (cId === customerId) {
        totalSpent += t.total;
        orderDates.push({
          date: t.date,
          total: t.total,
          invoiceNo: t.invoiceNo || t.id,
          paymentMethod: t.paymentMethod,
          items: t.items
        });
      }
    });

    // Sort orderDates (newest first)
    orderDates.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Load elements
    document.getElementById('cust-hist-title').innerText = state.lang === 'km' 
      ? `ប្រវត្តិទិញទំនិញ - ${customer.name}` 
      : `Purchase History - ${customer.name}`;
      
    document.getElementById('cust-hist-total-orders').innerText = state.lang === 'km'
      ? `${orderDates.length} ដង`
      : `${orderDates.length} Orders`;
      
    document.getElementById('cust-hist-total-spent').innerText = window.POS_HELPERS.formatUSD(totalSpent);

    const tbody = document.getElementById('cust-hist-table-body');
    tbody.innerHTML = '';

    if (orderDates.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">${window.POS_TRANSLATIONS[state.lang].noData}</td></tr>`;
    } else {
      orderDates.forEach(o => {
        let itemsDesc = '';
        o.items.forEach(item => {
          const name = state.lang === 'km' ? item.nameKh : item.nameEn;
          itemsDesc += `• ${name} x ${item.qty}<br>`;
        });
        
        const methodTranslate = window.POS_TRANSLATIONS[state.lang][o.paymentMethod] || o.paymentMethod;

        tbody.innerHTML += `
          <tr>
            <td style="font-size:10px;">${window.POS_HELPERS.formatDate(o.date, state.lang)}</td>
            <td><strong style="color:var(--secondary); font-family:monospace;">${o.invoiceNo}</strong></td>
            <td style="text-align:right; font-weight:750; color:var(--primary);">${window.POS_HELPERS.formatUSD(o.total)}</td>
            <td><span class="badge badge-warning" style="text-transform:none;">${methodTranslate}</span></td>
            <td style="font-size:10px; line-height: 1.3;">${itemsDesc}</td>
          </tr>
        `;
      });
    }

    // Populate Vertical CRM Timeline History
    const timelineBody = document.getElementById('cust-crm-timeline-body');
    if (timelineBody) {
      timelineBody.innerHTML = '';
      const timelineData = customer.timeline || [];
      
      if (timelineData.length === 0) {
        timelineBody.innerHTML = `<div style="text-align:center; padding: 24px; color: var(--text-muted); font-style: italic;">${state.lang === 'km' ? 'មិនទាន់មានប្រវត្តិទំនាក់ទំនងទេ' : 'No follow-up interactions logged yet.'}</div>`;
      } else {
        // Sort oldest first for chronological flow
        const sortedTimeline = [...timelineData].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        sortedTimeline.forEach(item => {
          let dotClass = 'contact';
          let dotIcon = '📞';
          if (item.status === 'Purchase') {
            dotClass = 'purchase';
            dotIcon = '🛒';
          } else if (item.result === 'No Answer' || item.result === 'Busy / Call Later') {
            dotClass = 'due_today';
            dotIcon = '⚠️';
          } else if (item.result === 'Declined / Not Interested') {
            dotClass = 'overdue';
            dotIcon = '❌';
          }

          timelineBody.innerHTML += `
            <div class="timeline-item">
              <div class="timeline-dot ${dotClass}">${dotIcon}</div>
              <div class="timeline-card">
                <div class="timeline-card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <strong class="timeline-title" style="color: var(--primary); font-size: 12.5px;">${item.status}</strong>
                  <span class="timeline-date" style="font-size: 10px; color: var(--text-secondary);">${window.POS_HELPERS.formatDate(item.date, state.lang)}</span>
                </div>
                <div class="timeline-meta" style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">
                  <span>Staff: <strong>${item.staffName}</strong></span>
                  ${item.result ? ` | Result: <strong>${item.result}</strong>` : ''}
                  ${item.nextInterest ? ` | Interest: <strong>${item.nextInterest}</strong>` : ''}
                </div>
                ${item.feedback ? `<div class="timeline-feedback" style="background: rgba(255,255,255,0.03); border-left: 3px solid var(--primary); padding: 6px 10px; border-radius: 4px; font-style: italic; font-size: 11.5px; margin-top: 4px;">Feedback: "${item.feedback}"</div>` : ''}
                ${item.notes ? `<div style="margin-top: 6px; font-size: 11px; color: var(--text-secondary);">Notes: ${item.notes}</div>` : ''}
              </div>
            </div>
          `;
        });
      }
    }

    const modal = document.getElementById('modal-customer-history');
    if (modal) {
      modal.classList.add('active-modal');
    }
  }

  function openCustomerModal(idx = null) {
    if (idx !== null && !guardAction('edit')) return;
    if (idx === null && !guardAction('add')) return;

    const form = document.getElementById('customer-form');
    form.reset();

    // Populate staff dropdown in modal
    const modalStaffSelect = document.getElementById('cust-staff');
    if (modalStaffSelect) {
      modalStaffSelect.innerHTML = `<option value="">${state.lang === 'km' ? '-- មិនទាន់ចាត់តាំង --' : '-- Unassigned --'}</option>`;
      state.staff.forEach(s => {
        modalStaffSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`;
      });
    }

    // Populate product dropdown in modal
    const productSelect = document.getElementById('cust-product-purchased');
    if (productSelect) {
      productSelect.innerHTML = '';
      state.products.forEach(p => {
        const name = state.lang === 'km' ? p.nameKh : p.nameEn;
        productSelect.innerHTML += `<option value="${p.sku}">${name} (${p.sku})</option>`;
      });
    }

    if (idx !== null) {
      const c = state.customers[idx];
      document.getElementById('customer-modal-title').innerText = window.POS_TRANSLATIONS[state.lang].editCustomer;
      document.getElementById('customer-edit-index').value = idx;
      document.getElementById('cust-id').value = c.id;
      document.getElementById('cust-name').value = c.name;
      document.getElementById('cust-phone').value = c.phone;
      document.getElementById('cust-facebook').value = c.facebookLink || '';
      document.getElementById('cust-address').value = c.address;
      document.getElementById('cust-source').value = c.source;
      document.getElementById('cust-status').value = c.status;
      document.getElementById('cust-notes').value = c.notes || '';
      document.getElementById('cust-birthday').value = c.birthday || '';
      if (modalStaffSelect) {
        modalStaffSelect.value = c.staffId || '';
      }
      // Hide purchase section on edit
      const purchaseSection = document.getElementById('cust-purchase-section');
      if (purchaseSection) purchaseSection.style.display = 'none';
    } else {
      document.getElementById('customer-modal-title').innerText = window.POS_TRANSLATIONS[state.lang].addCustomer;
      document.getElementById('customer-edit-index').value = '';
      
      // Pre-calculate next Customer ID
      const nextId = 'CST-' + String(state.customers.length + 1).padStart(3, '0');
      document.getElementById('cust-id').value = nextId;
      document.getElementById('cust-facebook').value = '';
      document.getElementById('cust-birthday').value = '';

      // Show purchase section on add, and set default date to today
      const purchaseSection = document.getElementById('cust-purchase-section');
      if (purchaseSection) purchaseSection.style.display = 'block';
      const purchaseDateInput = document.getElementById('cust-purchase-date');
      if (purchaseDateInput) purchaseDateInput.value = new Date().toISOString().split('T')[0];
    }

    document.getElementById('modal-customer').classList.add('active-modal');
  }

  function deleteCustomer(idx) {
    if (!guardAction('delete')) return;
    const c = state.customers[idx];
    if (c.id === 'CST-001') {
      alert(state.lang === 'km' ? 'មិនអាចលុបគណនីអតិថិជនទូទៅបានឡើយ!' : 'Cannot delete default General Customer profile!');
      return;
    }
    if (confirm(window.POS_TRANSLATIONS[state.lang].confirmDelete)) {
      state.customers.splice(idx, 1);
      state.followups = state.followups.filter(f => f.customerId !== c.id);
      saveStateToLocalStorage();
      renderCustomers();
      populatePOSSelects();
      if (state.activeView === 'view-followups') {
        renderFollowups();
      }
      checkCRMNotifications();
    }
  }

  function openPayDebtModal(c) {
    if (!guardAction('edit')) return;
    document.getElementById('pay-debt-customer-id').value = c.id;
    document.getElementById('pay-debt-customer-name').innerText = c.name;
    document.getElementById('pay-debt-current-val').innerText = window.POS_HELPERS.formatUSD(c.outstandingDebt);
    document.getElementById('pay-debt-amount').value = c.outstandingDebt.toFixed(2);
    document.getElementById('pay-debt-amount').max = c.outstandingDebt;

    document.getElementById('modal-pay-debt').classList.add('active-modal');
  }

  // 6. CRM AUTO FOLLOW-UPS
  // 6. CRM AUTO FOLLOW-UPS
  function renderFollowups() {
    const areaToday = document.getElementById('k-cards-today');
    const areaPending = document.getElementById('k-cards-pending');
    const areaCompleted = document.getElementById('k-cards-completed');

    if (!areaToday || !areaPending || !areaCompleted) return;

    areaToday.innerHTML = '';
    areaPending.innerHTML = '';
    areaCompleted.innerHTML = '';

    let countToday = 0;
    let countPending = 0;
    let countCompleted = 0;

    const filterBranch = getActiveBranchFilter();

    // Set up search and filter elements
    const filterStaffSelect = document.getElementById('f-filter-staff');
    if (filterStaffSelect) {
      if (filterStaffSelect.options.length === 0 || filterStaffSelect.dataset.lang !== state.lang) {
        const currentVal = filterStaffSelect.value || 'all';
        filterStaffSelect.innerHTML = `<option value="all">${state.lang === 'km' ? 'បុគ្គលិកទាំងអស់' : 'All Staff'}</option>`;
        getFilteredStaff().forEach(s => {
          filterStaffSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`;
        });
        filterStaffSelect.value = currentVal;
        filterStaffSelect.dataset.lang = state.lang;
      }
      
      if (filterStaffSelect.dataset.listenerBound !== 'true') {
        filterStaffSelect.addEventListener('change', renderFollowups);
        const searchInput = document.getElementById('f-search-input');
        if (searchInput) {
          searchInput.addEventListener('input', renderFollowups);
        }
        filterStaffSelect.dataset.listenerBound = 'true';
      }
    }

    const searchVal = document.getElementById('f-search-input') ? document.getElementById('f-search-input').value.toLowerCase().trim() : '';
    const filterStaffId = document.getElementById('f-filter-staff') ? document.getElementById('f-filter-staff').value : 'all';

    state.followups.forEach(f => {
      const tx = state.transactions.find(t => t.id === f.saleId);
      const itemBranch = f.branchId || (tx ? tx.branchId : null);
      if (filterBranch && itemBranch && itemBranch !== filterBranch) return;

      if (filterStaffId !== 'all' && f.salesStaffId !== filterStaffId) return;

      // Robust Search
      const custObj = state.customers.find(c => c.id === f.customerId);
      const phone = (custObj && custObj.phone && custObj.phone !== '-') ? custObj.phone : '';
      const phoneClean = phone.toLowerCase();
      const facebook = (custObj && custObj.facebookLink) ? custObj.facebookLink.toLowerCase() : '';
      const staffName = (f.salesStaffName || '').toLowerCase();
      const productsStr = (custObj && custObj.orders) ? custObj.orders.map(o => o.product.toLowerCase()).join(' ') : '';
      
      const matchesSearch = !searchVal || 
        f.customerName.toLowerCase().includes(searchVal) ||
        phoneClean.includes(searchVal) ||
        facebook.includes(searchVal) ||
        staffName.includes(searchVal) ||
        productsStr.includes(searchVal);

      if (!matchesSearch) return;

      if (f.schedules) {
        f.schedules.forEach(sch => {
          const d = new Date(sch.date);
          const todayDate = new Date();
          const isToday = d.toDateString() === todayDate.toDateString() && sch.status === 'pending';

          const source = custObj ? custObj.source : 'Walk-In';
          
          let sourceBadge = '🚶 Walk-In';
          const cleanSrc = source.toLowerCase();
          if (cleanSrc.includes('facebook') || cleanSrc.includes('fb')) {
            sourceBadge = '📲 Facebook';
          } else if (cleanSrc.includes('telegram') || cleanSrc.includes('tg')) {
            sourceBadge = '💬 Telegram';
          } else if (cleanSrc.includes('website')) {
            sourceBadge = '🌐 Website';
          } else if (cleanSrc.includes('referral')) {
            sourceBadge = '🤝 Referral';
          }

          // Facebook URL Helper
          const getFacebookUrl = (link) => {
            if (!link) return '';
            const trimmed = link.trim();
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
            if (trimmed.includes('facebook.com') || trimmed.includes('fb.com')) {
              return 'https://' + trimmed.replace(/^(https?:\/\/)?(www\.)?/, '');
            }
            return 'https://facebook.com/' + trimmed;
          };

          const card = document.createElement('div');
          card.className = `kanban-card card-${sch.status} day-${sch.day}`;
          
          // Calculate status badge based on date difference
          const dStart = new Date(sch.date);
          dStart.setHours(0,0,0,0);
          const todayStart = new Date();
          todayStart.setHours(0,0,0,0);
          const diffTime = dStart.getTime() - todayStart.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          let statusBadgeHtml = '';
          if (sch.status === 'completed') {
            statusBadgeHtml = `<span class="status-badge status-completed" style="font-size: 8.5px; padding: 1px 4px;">${state.lang === 'km' ? 'បានបញ្ចប់' : 'COMPLETED'}</span>`;
          } else if (diffDays === 0) {
            statusBadgeHtml = `<span class="status-badge status-today" style="font-size: 8.5px; padding: 1px 4px;">${state.lang === 'km' ? 'ថ្ងៃនេះ' : 'TODAY'}</span>`;
          } else if (diffDays < 0) {
            const overdueDays = Math.abs(diffDays);
            statusBadgeHtml = `<span class="status-badge status-overdue" style="font-size: 8.5px; padding: 1px 4px;">${state.lang === 'km' ? overdueDays + ' ថ្ងៃមុន' : overdueDays + 'D AGO'}</span>`;
          } else {
            statusBadgeHtml = `<span class="status-badge status-future" style="font-size: 8.5px; padding: 1px 4px;">${state.lang === 'km' ? 'ក្នុង ' + diffDays + ' ថ្ងៃ' : 'In ' + diffDays + 'd'}</span>`;
          }

          const fbLink = custObj && custObj.facebookLink ? custObj.facebookLink.trim() : '';
          
          let contactInfoHtml = '';
          const phoneText = phone ? phone : '';
          if (phoneText || fbLink) {
            const fbUrl = getFacebookUrl(fbLink);
            contactInfoHtml = `
              <div class="cust-contact-line" style="font-size: 11px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 1px;">
                ${phoneText ? `<span style="font-weight: 700; color: var(--primary);">📞 ${phoneText}</span>` : ''}
                ${(phoneText && fbLink) ? `<span style="color: var(--text-muted); opacity: 0.5;">|</span>` : ''}
                ${fbLink ? `
                  <a href="${fbUrl}" target="_blank" class="fb-link" style="display: inline-flex; align-items: center; gap: 2px; font-weight: 600;" onclick="event.stopPropagation();">
                    📲 ${state.lang === 'km' ? 'ឆាត' : 'Chat'}
                  </a>
                ` : ''}
              </div>
            `;
          }

          // Facebook Page info & Sales Staff Info
          const staffMember = state.staff.find(s => s.id === f.salesStaffId || s.name === f.salesStaffName);
          const staffUser = state.users.find(u => u.name === f.salesStaffName || u.id === f.salesStaffId || u.username === f.salesStaffId);
          const pageNameVal = staffMember && staffMember.fbPage ? staffMember.fbPage : (staffUser ? (staffUser.pageName || "Direct Sales") : (tx && tx.pageName ? tx.pageName : (custObj && custObj.source ? custObj.source : 'Walk-In')));
          const staffNameVal = f.salesStaffName || 'System';

          const metadataLineHtml = `
            <div class="cust-metadata-line" style="font-size: 10.5px; color: var(--text-secondary); display: flex; flex-wrap: wrap; gap: 2px 6px; margin-top: 2px; line-height: 1.2;">
              <span>👤 <strong>${state.lang === 'km' ? 'លក់ដោយ' : 'Staff'}:</strong> ${staffNameVal}</span>
              <span style="color: var(--text-muted); opacity: 0.3;">|</span>
              <span>📄 <strong>${state.lang === 'km' ? 'ផេក' : 'Page'}:</strong> ${pageNameVal}</span>
            </div>
          `;

          // Get exact products purchased as pill badges
          let productsHtml = '';
          let pillsHtml = '';

          if (tx && tx.items && tx.items.length > 0) {
            pillsHtml = tx.items.map(item => {
              const pName = (state.lang === 'km' && item.nameKh) ? item.nameKh : (item.nameEn || item.sku);
              return `
                <span class="prod-pill">
                  ${pName} <span class="prod-qty">x${item.qty}</span>
                </span>
              `;
            }).join('');
          } else if (custObj && custObj.orders && custObj.orders.length > 0) {
            const lastOrder = custObj.orders[custObj.orders.length - 1];
            if (lastOrder.product) {
              pillsHtml = lastOrder.product.split(', ').map(pStr => {
                const parts = pStr.split(/\s*x\s*(\d+)/i);
                if (parts.length >= 2) {
                  return `
                    <span class="prod-pill">
                      ${parts[0]} <span class="prod-qty">x${parts[1]}</span>
                    </span>
                  `;
                }
                return `<span class="prod-pill">${pStr}</span>`;
              }).join('');
            }
          }

          if (pillsHtml) {
            productsHtml = `
              <div class="card-products-container">
                ${pillsHtml}
              </div>
            `;
          }

          // Avatar Initials
          const nameParts = f.customerName ? f.customerName.trim().split(/\s+/) : [];
          let initials = '👤';
          if (nameParts.length > 0) {
            if (nameParts.length >= 2) {
              initials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
            } else {
              initials = nameParts[0].slice(0, 2).toUpperCase();
            }
          }

          const initialsHtml = `
            <div class="cust-avatar" style="width: 26px; height: 26px; font-size: 10px; box-shadow: 0 2px 6px rgba(99, 102, 241, 0.15);">
              ${initials}
            </div>
          `;

          const dayLabel = window.POS_TRANSLATIONS[state.lang]['day' + sch.day] || `Day ${sch.day} Contact`;

          card.innerHTML = `
            <div class="card-header" style="margin-bottom: 4px;">
              <span class="day-badge badge-${sch.day}" style="font-size: 9px; padding: 2px 4px;">${dayLabel}</span>
              <div style="display: flex; gap: 4px; align-items: center;">
                ${statusBadgeHtml}
                <span class="source-badge" style="font-size: 9px; padding: 1px 4px;">${sourceBadge}</span>
              </div>
            </div>
            
            <div class="card-profile-section" style="gap: 8px; margin-top: 2px;">
              ${initialsHtml}
              <div class="cust-info-block">
                <h4 class="cust-name" style="font-size: 13.5px; font-weight: 750; color: var(--text-primary); margin: 0;">${f.customerName}</h4>
                ${contactInfoHtml}
              </div>
            </div>
            
            ${metadataLineHtml}
            
            <div class="invoice-info" style="margin-left: 0; font-size: 10px; display: flex; justify-content: space-between; margin-top: 2px; color: var(--text-muted);">
              <span>Invoice: <strong>${tx ? tx.invoiceNo : (f.saleId || 'MANUAL')}</strong></span>
              <span>Due: <strong>${window.POS_HELPERS.formatDate(sch.date, state.lang).split(' ')[0]}</strong></span>
            </div>
            
            ${productsHtml}
            
            ${sch.notes ? `<div class="card-notes" style="margin-left: 0; padding: 4px 6px; font-size: 10.5px; margin-top: 2px;">"${sch.notes}"</div>` : ''}
            
            <div class="card-actions" style="margin-top: 6px; padding-top: 6px; gap: 4px; display: flex; justify-content: flex-end;">
              ${phone ? `
                <a href="tel:${phone}" class="action-btn btn-card-call" title="${window.POS_TRANSLATIONS[state.lang].callNow || 'Call Now'}" onclick="event.stopPropagation();" style="width: 24px; height: 24px;">
                  <svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                </a>
              ` : ''}
              ${fbLink ? `
                <a href="${getFacebookUrl(fbLink)}" target="_blank" class="action-btn btn-card-fb" title="Chat on Messenger" onclick="event.stopPropagation();" style="width: 24px; height: 24px; color: #3b82f6; background: rgba(59, 130, 246, 0.06); border-color: rgba(59, 130, 246, 0.15);">
                  <svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                </a>
              ` : ''}
              ${sch.status === 'pending' ? `
                <button class="action-btn btn-card-complete" title="${window.POS_TRANSLATIONS[state.lang].quickComplete || 'Quick Complete'}" onclick="event.stopPropagation();" style="width: 24px; height: 24px;">
                  <svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </button>
              ` : ''}
              <button class="action-btn btn-card-details" title="${window.POS_TRANSLATIONS[state.lang].viewDetails || 'Details'}" onclick="event.stopPropagation();" style="width: 24px; height: 24px;">
                <svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </button>
            </div>
          `;

          card.addEventListener('click', () => openFollowupDetailsModal(f.id, sch.day));

          const btnCall = card.querySelector('.btn-card-call');
          const btnFb = card.querySelector('.btn-card-fb');
          const btnComplete = card.querySelector('.btn-card-complete');
          const btnDetails = card.querySelector('.btn-card-details');

          if (btnCall) {
            btnCall.addEventListener('click', (e) => {
              e.stopPropagation();
            });
          }
          if (btnFb) {
            btnFb.addEventListener('click', (e) => {
              e.stopPropagation();
            });
          }
          if (btnComplete) {
            btnComplete.addEventListener('click', (e) => {
              e.stopPropagation();
              quickCompleteFollowup(f.id, sch.day);
            });
          }
          if (btnDetails) {
            btnDetails.addEventListener('click', (e) => {
              e.stopPropagation();
              openFollowupDetailsModal(f.id, sch.day);
            });
          }

          if (sch.status === 'completed') {
            areaCompleted.appendChild(card);
            countCompleted++;
          } else if (isToday || d < todayDate) {
            areaToday.appendChild(card);
            countToday++;
          } else {
            areaPending.appendChild(card);
            countPending++;
          }
        });
      }
    });

    if (countToday === 0) {
      areaToday.innerHTML = `<div class="kanban-empty-state"><span class="empty-icon">📭</span><p>${window.POS_TRANSLATIONS[state.lang].noTasks || 'No tasks in this column'}</p></div>`;
    }
    if (countPending === 0) {
      areaPending.innerHTML = `<div class="kanban-empty-state"><span class="empty-icon">📅</span><p>${window.POS_TRANSLATIONS[state.lang].noTasks || 'No tasks in this column'}</p></div>`;
    }
    if (countCompleted === 0) {
      areaCompleted.innerHTML = `<div class="kanban-empty-state"><span class="empty-icon">✅</span><p>${window.POS_TRANSLATIONS[state.lang].noTasks || 'No tasks in this column'}</p></div>`;
    }

    // Update counters
    document.getElementById('col-count-today').innerText = countToday;
    document.getElementById('col-count-pending').innerText = countPending;
    document.getElementById('col-count-completed').innerText = countCompleted;

    document.getElementById('f-val-today').innerText = countToday;
    document.getElementById('f-val-pending').innerText = countPending;
    document.getElementById('f-val-completed').innerText = countCompleted;
  }

  function getLevelLabel(level) {
    if (level === 1) return state.lang === 'km' ? "Day 3 Contact (សួរការប្រើប្រាស់)" : "Day 3 Contact (Product Experience)";
    if (level === 2) return state.lang === 'km' ? "Day 8 Contact (សុំ Feedback)" : "Day 8 Contact (Feedback Check)";
    if (level === 3) return state.lang === 'km' ? "Day 15 Contact (ផ្ញើ Tips)" : "Day 15 Contact (Engagement & Tips)";
    if (level === 4) return state.lang === 'km' ? "Day 30 Contact (ផ្តល់ Promo)" : "Day 30 Contact (Promo & Reorder)";
    if (level === 5) return state.lang === 'km' ? "Day 60 Contact (Loyalty Check)" : "Day 60 Contact (Loyalty Check)";
    return state.lang === 'km' ? "Monthly Follow-up (ថែទាំប្រចាំខែ)" : "Monthly Follow-up (Forever Retention)";
  }

  function quickCompleteFollowup(fId, day) {
    if (!guardAction('edit')) return;
    const f = state.followups.find(fl => fl.id === fId);
    if (!f) return;
    const sch = f.schedules.find(s => s.day === day);
    if (!sch) return;

    sch.status = 'completed';
    const notesText = state.lang === 'km' ? 'បានបញ្ចប់តាមរយៈការកត់ត្រារហ័ស' : 'Completed via quick-log';
    sch.notes = notesText;

    // Add to customer timeline
    const c = state.customers.find(cust => cust.id === f.customerId);
    if (c) {
      if (!c.timeline) c.timeline = [];
      const dayLabel = window.POS_TRANSLATIONS[state.lang]['day' + day] || `Day ${day} Contact`;
      c.timeline.push({
        date: new Date().toISOString(),
        status: dayLabel,
        staffName: f.salesStaffName || 'System',
        feedback: notesText,
        notes: 'Quick completed follow-up'
      });
    }

    saveStateToLocalStorage();
    renderFollowups();
    checkCRMNotifications();
    alert(window.POS_TRANSLATIONS[state.lang].followUpSaved);
  }

  function openFollowupDetailsModal(fId, day) {
    if (!guardAction('edit')) return;
    const f = state.followups.find(fl => fl.id === fId);
    if (!f) return;
    const sch = f.schedules.find(s => s.day === day);
    if (!sch) return;

    const tx = state.transactions.find(t => t.id === f.saleId);

    document.getElementById('f-form-id').value = fId;
    document.getElementById('f-form-day').value = day;
    document.getElementById('f-disp-invoice').innerText = tx ? tx.invoiceNo : (f.saleId || 'MANUAL');
    document.getElementById('f-disp-customer').innerText = f.customerName;
    document.getElementById('f-disp-task-type').innerText = `Task: ${window.POS_TRANSLATIONS[state.lang]['day' + day] || ('Day ' + day + ' Contact')}`;

    // Staff selector
    const selectStaff = document.getElementById('f-form-staff');
    selectStaff.innerHTML = '';
    getFilteredStaff().forEach(s => {
      selectStaff.innerHTML += `<option value="${s.id}">${s.name}</option>`;
    });
    selectStaff.value = f.salesStaffId;

    document.getElementById('f-form-status').value = sch.status;
    document.getElementById('f-form-notes').value = sch.notes || '';

    // Render quick note chips
    const chipsContainer = document.getElementById('f-quick-note-chips');
    if (chipsContainer) {
      chipsContainer.innerHTML = '';
      const templates = state.lang === 'km' ? [
        "អតិថិជនពេញចិត្តខ្លាំង 👍",
        "ទូរស័ព្ទចូល តែគ្មានអ្នកទទួល 📵",
        "រវល់សុំតេមកវិញក្រោយ ⏳",
        "សួររកការបញ្ចុះតម្លៃបន្ថែម 🏷️",
        "សន្យានឹងមកហាងផ្ទាល់ 🤝",
        "មិនចាប់អារម្មណ៍ / បដិសេធ ❌"
      ] : [
        "Customer highly satisfied 👍",
        "Called, but no answer 📵",
        "Busy, requested call back ⏳",
        "Asked for additional promo 🏷️",
        "Promised to visit store 🤝",
        "Not interested / Declined ❌"
      ];

      templates.forEach(t => {
        const chip = document.createElement('span');
        chip.className = 'quick-note-chip';
        chip.innerText = t;
        chip.addEventListener('click', () => {
          document.getElementById('f-form-notes').value = t;
        });
        chipsContainer.appendChild(chip);
      });
    }

    document.getElementById('modal-followup').classList.add('active-modal');
  }

  // 7. EMPLOYEE SALES PERFORMANCE & COMMISSION
  function renderPerformance() {
    // 1. Populate filters dropdown
    const empSelect = document.getElementById('perf-filter-employee');
    if (empSelect && empSelect.options.length <= 1) {
      empSelect.innerHTML = '<option value="all">All Employees</option>';
      getFilteredStaff().forEach(s => {
        empSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`;
      });
      empSelect.value = state.perfFilterEmployee;
    }

    // Toggle custom date groups
    const range = state.perfFilterRange;
    document.getElementById('perf-custom-start-group').style.display = range === 'custom' ? 'block' : 'none';
    document.getElementById('perf-custom-end-group').style.display = range === 'custom' ? 'block' : 'none';

    // 2. Perform transaction filtering
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const monthStr = todayStr.substring(0, 7);
    const yearStr = todayStr.substring(0, 4);

    let filteredTX = getFilteredTransactions();
    if (range === 'daily') {
      filteredTX = filteredTX.filter(t => t.date.split('T')[0] === todayStr);
    } else if (range === 'monthly') {
      filteredTX = filteredTX.filter(t => t.date.startsWith(monthStr));
    } else if (range === 'yearly') {
      filteredTX = filteredTX.filter(t => t.date.startsWith(yearStr));
    } else if (range === 'custom') {
      const sDate = state.perfFilterStart ? new Date(state.perfFilterStart + 'T00:00:00Z') : null;
      const eDate = state.perfFilterEnd ? new Date(state.perfFilterEnd + 'T23:59:59Z') : null;
      filteredTX = filteredTX.filter(t => {
        const d = new Date(t.date);
        return (!sDate || d >= sDate) && (!eDate || d <= eDate);
      });
    }

    // 3. Aggregate stats by staff member
    const statsMap = {};
    getFilteredStaff().forEach(s => {
      const u = state.users.find(user => user.name === s.name || user.username === s.id);
      statsMap[s.id] = {
        id: s.id,
        name: s.name,
        pageName: u ? (u.pageName || 'Direct Sales') : 'Direct Sales',
        orders: 0,
        revenue: 0,
        discount: 0,
        profit: 0,
        customers: new Set()
      };
    });

    filteredTX.forEach(t => {
      if (statsMap[t.staffId]) {
        const stat = statsMap[t.staffId];
        stat.orders++;
        stat.revenue += t.total;
        
        const sub = t.subtotal || 0;
        const discPercentVal = t.discountPercent || 0;
        const discFixedVal = t.discountFixed || 0;
        stat.discount += (sub * (discPercentVal / 100)) + discFixedVal;
        
        let cost = 0;
        t.items.forEach(it => {
          const p = state.products.find(prod => prod.sku === it.sku);
          cost += (p ? p.costPrice : 0) * it.qty;
        });
        stat.profit += t.total - cost - (t.shippingFee || 0);
        stat.customers.add(t.customerId);
      }
    });

    const staffStats = Object.values(statsMap).map(st => {
      return {
        ...st,
        customerCount: st.customers.size
      };
    }).sort((a,b) => b.revenue - a.revenue);

    let displayedStats = staffStats;
    if (state.perfFilterEmployee !== 'all') {
      displayedStats = staffStats.filter(st => st.id === state.perfFilterEmployee);
    }

    // Render podium
    const podium = document.getElementById('leaderboard-podium');
    podium.innerHTML = '';

    const first = staffStats[0];
    const second = staffStats[1];
    const third = staffStats[2];

    const drawStep = (staffObj, rankClass, labelRank) => {
      if (!staffObj) return `<div class="podium-step ${rankClass}" style="opacity:0.3;"><span class="avatar">👤</span><div class="name">No Staff</div><div class="val">$0.00</div><div class="rank-badge">${labelRank}</div></div>`;
      return `
        <div class="podium-step ${rankClass}">
          <span class="avatar">🏅</span>
          <div class="name" title="${staffObj.name}">${staffObj.name}</div>
          <div class="val">${window.POS_HELPERS.formatUSD(staffObj.revenue)}</div>
          <div class="rank-badge">${labelRank}</div>
        </div>
      `;
    };

    podium.innerHTML = drawStep(second, 'podium-2nd', '2') + drawStep(first, 'podium-1st', '1') + drawStep(third, 'podium-3rd', '3');

    // Render Standings Table
    const tbody = document.getElementById('leaderboard-standings-body');
    tbody.innerHTML = '';

    displayedStats.forEach((st) => {
      const overallRank = staffStats.findIndex(item => item.id === st.id) + 1;
      
      tbody.innerHTML += `
        <tr>
          <td><strong>#${overallRank}</strong></td>
          <td><strong>${st.name}</strong></td>
          <td><span class="badge badge-warning" style="text-transform:none;">${st.pageName}</span></td>
          <td style="text-align:center; font-weight:750;">${st.orders}</td>
          <td style="text-align:right; font-weight:800; color:var(--primary);">${window.POS_HELPERS.formatUSD(st.revenue)}</td>
          <td style="text-align:right; color:var(--text-secondary);">${window.POS_HELPERS.formatUSD(st.discount)}</td>
          <td style="text-align:right; font-weight:750; color:${st.profit < 0 ? 'var(--danger)' : 'var(--primary)'};">${window.POS_HELPERS.formatUSD(st.profit)}</td>
          <td style="text-align:center; font-weight:750;">${st.customerCount}</td>
        </tr>
      `;
    });

    document.getElementById('perf-target-units').value = (state.commissionRules && state.commissionRules.monthlyTargetUnits) || 300;
    if (state.commissionRules && state.commissionRules.tiers) {
      state.commissionRules.tiers.forEach((t, idx) => {
        const el = document.getElementById('tier-rate-' + idx);
        if (el) el.value = t.ratePercent;
      });
    }

    const commBody = document.getElementById('commission-report-rows');
    commBody.innerHTML = '';

    const unitsVolume = {};
    getFilteredTransactions().forEach(t => {
      if (t.date.startsWith(monthStr)) {
        let uSum = 0;
        t.items.forEach(it => uSum += it.qty);
        unitsVolume[t.staffId] = (unitsVolume[t.staffId] || 0) + uSum;
      }
    });

    displayedStats.forEach(st => {
      const units = unitsVolume[st.id] || 0;
      let rate = 0;
      state.commissionRules.tiers.forEach(t => {
        if (units >= t.minUnits && units <= t.maxUnits) {
          rate = t.ratePercent;
        }
      });
      const commAmount = st.revenue * (rate / 100);

      commBody.innerHTML += `
        <tr>
          <td><strong>${st.name}</strong></td>
          <td style="text-align:center; font-weight:800; color:var(--secondary);">${units}</td>
          <td style="text-align:right; font-weight:750;">${window.POS_HELPERS.formatUSD(st.revenue)}</td>
          <td style="text-align:center; font-weight:750; color:var(--warning);">${rate}%</td>
          <td style="text-align:right; font-weight:800; color:var(--primary);">${window.POS_HELPERS.formatUSD(commAmount)}</td>
        </tr>
      `;
    });
  }

  // 8. FINANCIAL LEDGER RENDER
  function renderFinance() {
    let totalRevenue = 0;
    let totalCOGS = 0;
    
    getFilteredTransactions().forEach(t => {
      totalRevenue += t.total;
      t.items.forEach(item => {
        const p = state.products.find(prod => prod.sku === item.sku);
        const costPrice = item.costPrice !== undefined ? item.costPrice : (p ? (p.costPrice || 0) : 0);
        totalCOGS += costPrice * item.qty;
      });
    });

    let totalExpenses = 0;
    getFilteredExpenses().forEach(e => totalExpenses += e.amount);

    const totalDeducted = totalCOGS + totalExpenses;
    const actualProfit = totalRevenue - totalDeducted;
    const startingCapital = state.companySettings.startingCapital !== undefined ? parseFloat(state.companySettings.startingCapital) : 10000;

    const capitalValFin = document.getElementById('fin-capital-val');
    if (capitalValFin) {
      capitalValFin.innerText = window.POS_HELPERS.formatUSD(startingCapital);
    }
    const capitalRielFin = document.getElementById('fin-capital-riel');
    if (capitalRielFin) {
      capitalRielFin.innerText = window.POS_HELPERS.formatKHR(startingCapital);
    }

    const currentCapitalBalance = startingCapital + actualProfit;
    const capitalBalanceValFin = document.getElementById('fin-capital-balance-val');
    if (capitalBalanceValFin) {
      capitalBalanceValFin.innerText = window.POS_HELPERS.formatUSD(currentCapitalBalance);
    }
    const capitalBalanceRielFin = document.getElementById('fin-capital-balance-riel');
    if (capitalBalanceRielFin) {
      capitalBalanceRielFin.innerText = window.POS_HELPERS.formatKHR(currentCapitalBalance);
    }

    const deductedValFin = document.getElementById('fin-deducted-val');
    if (deductedValFin) {
      deductedValFin.innerText = window.POS_HELPERS.formatUSD(totalDeducted);
    }
    const deductedRielFin = document.getElementById('fin-deducted-riel');
    if (deductedRielFin) {
      deductedRielFin.innerText = window.POS_HELPERS.formatKHR(totalDeducted);
    }

    document.getElementById('fin-income-val').innerText = window.POS_HELPERS.formatUSD(totalRevenue);
    document.getElementById('fin-income-riel').innerText = window.POS_HELPERS.formatKHR(totalRevenue);

    document.getElementById('fin-expense-val').innerText = window.POS_HELPERS.formatUSD(totalExpenses);
    document.getElementById('fin-expense-riel').innerText = window.POS_HELPERS.formatKHR(totalExpenses);

    const actualProfitValEl = document.getElementById('fin-actual-profit-val');
    if (actualProfitValEl) {
      actualProfitValEl.innerText = window.POS_HELPERS.formatUSD(actualProfit);
      actualProfitValEl.style.color = actualProfit < 0 ? 'var(--danger)' : '';
    }
    const actualProfitRielEl = document.getElementById('fin-actual-profit-riel');
    if (actualProfitRielEl) {
      actualProfitRielEl.innerText = window.POS_HELPERS.formatKHR(actualProfit);
    }

    // Income ledger
    const incomeBody = document.getElementById('fin-sales-ledger');
    incomeBody.innerHTML = '';
    const sortedTX = [...getFilteredTransactions()].sort((a,b) => new Date(b.date) - new Date(a.date));

    if (sortedTX.length === 0) {
      incomeBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">${window.POS_TRANSLATIONS[state.lang].noData}</td></tr>`;
    } else {
      sortedTX.forEach(tx => {
        incomeBody.innerHTML += `
          <tr>
            <td><strong style="color:var(--secondary); font-family:monospace;">${tx.invoiceNo || tx.id}</strong></td>
            <td style="font-size:10px;">${window.POS_HELPERS.formatDate(tx.date, state.lang)}</td>
            <td>${tx.staffName}</td>
            <td style="font-weight:750; color:var(--primary);">${window.POS_HELPERS.formatUSD(tx.total)}</td>
          </tr>
        `;
      });
    }

    // Expense ledger
    const expenseBody = document.getElementById('fin-expense-ledger');
    expenseBody.innerHTML = '';
    const sortedExp = [...getFilteredExpenses()].sort((a,b) => new Date(b.date) - new Date(a.date));

    if (sortedExp.length === 0) {
      expenseBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">${window.POS_TRANSLATIONS[state.lang].noData}</td></tr>`;
    } else {
      sortedExp.forEach((exp) => {
        const catName = window.POS_TRANSLATIONS[state.lang][exp.category] || exp.category;
        const br = state.branches.find(b => b.id === exp.branchId);
        const brText = br ? (state.lang === 'km' ? br.nameKh : br.name) : 'HQ';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-size:10px;">${window.POS_HELPERS.formatDate(exp.date, state.lang)}</td>
          <td><span class="badge badge-warning" style="text-transform:none;">${catName}</span><br><span style="font-size:8px;color:var(--text-muted);">${brText}</span></td>
          <td style="font-size:11px; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${exp.description}">${exp.description}</td>
          <td style="font-weight:750; color:var(--danger);">${window.POS_HELPERS.formatUSD(exp.amount)}</td>
          <td>
            <button class="btn btn-danger btn-sm btn-delete-exp" style="padding:2px 6px;">🗑️</button>
          </td>
        `;

        tr.querySelector('.btn-delete-exp').addEventListener('click', () => {
          if (!guardAction('delete')) return;
          if (confirm(window.POS_TRANSLATIONS[state.lang].confirmDelete)) {
            state.expenses = state.expenses.filter(e => e.id !== exp.id);
            saveStateToLocalStorage();
            renderFinance();
          }
        });

        expenseBody.appendChild(tr);
      });
    }
  }

  function getEmployeeAttendanceStatus(empId) {
    const today = new Date().toLocaleDateString('en-CA');
    const log = state.attendance.find(a => a.employeeId === empId && a.date === today);
    if (log) {
      if (log.checkIn && log.checkIn.status === 'Late') {
        return { text: 'late', badgeClass: 'badge-late' };
      }
      return { text: 'present', badgeClass: 'badge-approved' };
    }
    
    const leaveActive = state.leaveRequests.some(req => {
      if (req.employeeId !== empId || req.status !== 'Approved') return false;
      const start = new Date(req.startDate);
      const end = new Date(req.endDate);
      const cur = new Date(today);
      return cur >= start && cur <= end;
    });
    
    if (leaveActive) {
      return { text: 'onLeave', badgeClass: 'badge-pending' };
    }
    
    return { text: 'absent', badgeClass: 'badge-rejected' };
  }

  function populateStaffEmployeeSelect(selectedEmployeeId = '') {
    const select = document.getElementById('staff-employee-id');
    if (!select) return;
    
    select.innerHTML = `<option value="" data-translate="noLink">${window.POS_TRANSLATIONS[state.lang].noLink || 'No Link'}</option>`;
    
    const employees = [...state.employees].sort((a, b) => a.fullName.localeCompare(b.fullName));
    
    employees.forEach(emp => {
      const opt = document.createElement('option');
      opt.value = emp.id;
      opt.innerText = `${emp.fullName} (${emp.id})`;
      if (emp.id === selectedEmployeeId) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
  }

  // 9. STAFF PAYROLL SYSTEM RENDER
  function renderStaff() {
    const tbody = document.getElementById('staff-table-body');
    tbody.innerHTML = '';

    const filterBranch = getActiveBranchFilter();

    // Get stats
    const salesVolume = {};
    const unitsVolume = {};
    state.transactions.forEach(t => {
      salesVolume[t.staffId] = (salesVolume[t.staffId] || 0) + t.total;
      let units = 0;
      t.items.forEach(it => units += it.qty);
      unitsVolume[t.staffId] = (unitsVolume[t.staffId] || 0) + units;
    });

    state.staff.forEach((s, idx) => {
      if (filterBranch && s.branchId !== filterBranch) return;

      const sales = salesVolume[s.id] || 0;
      const units = unitsVolume[s.id] || 0;

      // Commission Tier calculation
      let rate = s.commissionRate;
      state.commissionRules.tiers.forEach(t => {
        if (units >= t.minUnits && units <= t.maxUnits) {
          rate = t.ratePercent;
        }
      });
      const commEarned = sales * (rate / 100);

      const br = state.branches.find(b => b.id === s.branchId);
      const brName = br ? (state.lang === 'km' ? br.nameKh : br.name) : 'HQ';

      let attendanceHtml = '<span style="color:var(--text-muted); font-size:11px;">—</span>';
      if (s.employeeId) {
        const status = getEmployeeAttendanceStatus(s.employeeId);
        const transKey = status.text + 'Today';
        const transText = window.POS_TRANSLATIONS[state.lang][transKey] || status.text;
        attendanceHtml = `<span class="badge ${status.badgeClass}" style="font-size:10px;">${transText}</span>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color:var(--secondary); font-family:monospace;">${s.id}</strong></td>
        <td><strong>${s.name}</strong>${s.fbPage ? `<br><span style="font-size:9px;color:#1877f2;font-weight:600;">🌐 ${s.fbPage}</span>` : ''}<br><span style="font-size:9px;color:var(--text-muted);">${brName}</span></td>
        <td>${s.role}</td>
        <td>${attendanceHtml}</td>
        <td style="font-weight:750;">${window.POS_HELPERS.formatUSD(s.baseSalary)}</td>
        <td style="text-align:center;">${rate}%</td>
        <td style="font-weight:750; color:var(--secondary);">${window.POS_HELPERS.formatUSD(sales)}</td>
        <td style="font-weight:750; color:var(--primary);">${window.POS_HELPERS.formatUSD(commEarned)}</td>
        <td>
          <button class="btn btn-outline btn-sm btn-edit-st" data-idx="${idx}" style="padding:2px 6px;">✏️</button>
          <button class="btn btn-danger btn-sm btn-del-st" data-idx="${idx}" style="padding:2px 6px;">🗑️</button>
        </td>
      `;

      tr.querySelector('.btn-edit-st').addEventListener('click', () => openEditStaffModal(idx));
      tr.querySelector('.btn-del-st').addEventListener('click', () => deleteStaff(idx));

      tbody.appendChild(tr);
    });
  }

  function openEditStaffModal(idx) {
    if (!guardAction('edit')) return;
    const s = state.staff[idx];

    document.getElementById('staff-modal-title').innerText = window.POS_TRANSLATIONS[state.lang].editStaff;
    document.getElementById('staff-edit-id').value = s.id;
    document.getElementById('staff-form-branch').value = s.branchId || "BR-001";
    document.getElementById('staff-name').value = s.name;
    document.getElementById('staff-role').value = s.role;
    document.getElementById('staff-salary').value = s.baseSalary;
    document.getElementById('staff-commission').value = s.commissionRate;
    document.getElementById('staff-fb-page').value = s.fbPage || "";
    
    populateStaffEmployeeSelect(s.employeeId || '');

    document.getElementById('modal-staff').classList.add('active-modal');
  }

  function deleteStaff(idx) {
    if (!guardAction('delete')) return;
    if (confirm(window.POS_TRANSLATIONS[state.lang].confirmDelete)) {
      state.staff.splice(idx, 1);
      saveStateToLocalStorage();
      renderStaff();
      populatePOSSelects();
    }
  }

  // 10. DETAILED REPORTS GENERATOR
  function setupReportTabs() {
    const tabs = document.querySelectorAll('#reports-tabs .category-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.activeReportTab = tab.getAttribute('data-report');
        triggerReportRender();
      });
    });

    document.getElementById('btn-filter-reports').addEventListener('click', () => {
      state.reportStartDate = document.getElementById('report-start-date').value;
      state.reportEndDate = document.getElementById('report-end-date').value;
      triggerReportRender();
    });

    // Active Print action
    document.getElementById('btn-print-active-report').addEventListener('click', () => {
      window.print();
    });

    // Active CSV Exporter
    document.getElementById('btn-export-active-report').addEventListener('click', () => {
      if (!guardAction('export')) return;
      exportReportToCSV();
    });
  }

  function renderReports() {
    triggerReportRender();
  }

  function triggerReportRender() {
    const container = document.getElementById('report-content-area');
    const start = new Date(state.reportStartDate + 'T00:00:00Z');
    const end = new Date(state.reportEndDate + 'T23:59:59Z');

    const genericButtonsWrapper = document.getElementById('btn-print-active-report')?.parentElement;
    if (genericButtonsWrapper) {
      if (state.activeReportTab === 'prodReport') {
        genericButtonsWrapper.style.display = 'none';
      } else {
        genericButtonsWrapper.style.display = 'flex';
      }
    }

    switch(state.activeReportTab) {
      case 'prodReport':
        renderProductReport(container);
        break;
      case 'stockLogReport':
        renderStockLogReport(container, start, end);
        break;
      case 'dailySalesReport':
        renderDailySalesReport(container, start, end);
        break;
      case 'prodSalesReport':
        renderProductSalesReport(container, start, end);
        break;
      case 'salesDetailsReport':
        renderSalesDetailsReport(container, start, end);
        break;
      case 'custPayReport':
        renderCustomerPaymentsReport(container, start, end);
        break;
      case 'commReport':
        renderStaffCommissionReport(container);
        break;
      case 'debtReport':
        renderCustomerDebtReport(container);
        break;
      case 'expenseReport':
        renderExpenseReport(container, start, end);
        break;
      case 'profitLossReport':
        renderProfitLossReport(container, start, end);
        break;
      case 'regReport':
        renderRegistrationReport(container, start, end);
        break;
      case 'voidReport':
        renderVoidReport(container, start, end);
        break;
    }
  }

  // Reports generators details
  function printReportDOM() {
    const reportArea = document.getElementById('report-content-area');
    if (!reportArea) return;

    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
      alert('Please allow popups to print/save reports.');
      return;
    }

    const isKhmer = state.lang === 'km';
    const fontStyle = isKhmer ? `font-family: 'Khmer OS Battambang', 'Segoe UI', sans-serif;` : `font-family: 'Segoe UI', sans-serif;`;

    printWindow.document.write(`
      <html>
        <head>
          <title>${isKhmer ? 'របាយការណ៍ទំនិញក្នុងស្តុក' : 'Inventory Stock Report'}</title>
          <style>
            body {
              background: #fff !important;
              color: #000 !important;
              padding: 20px !important;
              ${fontStyle}
              margin: 0;
            }
            .no-print {
              display: none !important;
            }
            .glass-card {
              border: none !important;
              box-shadow: none !important;
              padding: 0 !important;
              background: transparent !important;
            }
            .pos-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
            }
            .pos-table th {
              background: #f0f0f0 !important;
              color: #000 !important;
              border: 1px solid #ccc !important;
              padding: 8px 6px;
              font-size: 12px;
              font-weight: bold;
            }
            .pos-table td {
              border: 1px solid #ccc !important;
              padding: 8px 6px;
              font-size: 11px;
              color: #000 !important;
            }
            @media print {
              .no-print {
                display: none !important;
              }
              body {
                padding: 0 !important;
              }
            }
            @page {
              size: A4 landscape;
              margin: 10mm;
            }
          </style>
        </head>
        <body>
          <div style="width: 100%;">
            ${reportArea.innerHTML}
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(() => { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  function exportStockReportToExcel() {
    const isKhmer = state.lang === 'km';
    const title = isKhmer ? 'របាយការណ៍ទំនិញក្នុងស្តុក' : 'Inventory Stock Report';
    const headersList = isKhmer 
      ? ["ល.រ", "បាកូដទំនិញ", "ឈ្មោះទំនិញ", "ប្រភេទទំនិញ", "ចំនួន", "បរិមាណត្រូវជូនដំណឹង", "តម្លៃដើម", "តម្លៃលក់ចេញ", "សរុបតម្លៃដើម", "សរុបតម្លៃលក់ចេញ"]
      : ["No.", "Barcode/SKU", "Product Name", "Category", "Qty", "Alert Qty", "Cost Price", "Selling Price", "Total Cost", "Total Selling"];

    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += `"${title}"\n`;
    csvContent += `"${isKhmer ? 'របាយការណ៍គិតត្រឹមថ្ងៃ៖' : 'Report Date:'} ${new Date().toLocaleDateString('en-GB')}"\n\n`;
    csvContent += headersList.map(h => `"${h}"`).join(',') + '\n';

    let sumCostPrice = 0;
    let sumSellingPrice = 0;
    let sumTotalCost = 0;
    let sumTotalSelling = 0;
    const filterBranch = getActiveBranchFilter();
    const productsToExport = state.lastFilteredProducts || state.products;

    productsToExport.forEach((p, idx) => {
      const qtyVal = filterBranch ? (p.warehouseStock[filterBranch] || 0) : p.stockQty;
      const totalCostVal = qtyVal * p.costPrice;
      const totalSellingVal = qtyVal * p.sellingPrice;

      sumCostPrice += p.costPrice;
      sumSellingPrice += p.sellingPrice;
      sumTotalCost += totalCostVal;
      sumTotalSelling += totalSellingVal;

      const name = isKhmer ? p.nameKh : p.nameEn;

      const row = [
        idx + 1,
        `"${p.sku}"`,
        `"${name.replace(/"/g, '""')}"`,
        `"${p.category.replace(/"/g, '""')}"`,
        qtyVal,
        p.minStock || 0,
        p.costPrice.toFixed(2),
        p.sellingPrice.toFixed(2),
        totalCostVal.toFixed(2),
        totalSellingVal.toFixed(2)
      ];
      csvContent += row.join(',') + '\n';
    });

    const summaryRow = [
      `"${isKhmer ? 'សរុប' : 'Total'}"`,
      "", "", "", "", "",
      sumCostPrice.toFixed(2),
      sumSellingPrice.toFixed(2),
      sumTotalCost.toFixed(2),
      sumTotalSelling.toFixed(2)
    ];
    csvContent += summaryRow.join(',') + '\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `ABC_Inventory_Report_${new Date().toLocaleDateString('en-CA')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function renderProductReport(container) {
    const isKhmer = state.lang === 'km';
    const filterBranch = getActiveBranchFilter();
    
    // Initial translations & labels
    const tSearch = window.POS_TRANSLATIONS[state.lang].searchPlaceholder || "Search by name or SKU...";
    const tAllCats = window.POS_TRANSLATIONS[state.lang].allCategories || "All Categories";
    const tAllProds = window.POS_TRANSLATIONS[state.lang].allProducts || "All Products";
    const tLowStockOnly = window.POS_TRANSLATIONS[state.lang].lowStockOnly || "Low Stock Only";
    
    const headers = isKhmer ? {
      no: "ល.រ",
      barcode: "បាកូដទំនិញ",
      name: "ឈ្មោះទំនិញ",
      category: "ប្រភេទទំនិញ",
      qty: "ចំនួន",
      alertQty: "បរិមាណត្រូវជូនដំណឹង",
      costPrice: "តម្លៃដើម",
      sellingPrice: "តម្លៃលក់ចេញ",
      totalCost: "សរុបតម្លៃដើម",
      totalSelling: "សរុបតម្លៃលក់ចេញ",
      total: "សរុប",
      subtitle: "របាយការណ៍គិតត្រឹមថ្ងៃ៖",
      title: "របាយការណ៍ទំនិញក្នុងស្តុក",
      signature: "ប្រតិបត្តិការនៅ សែនសុខ ភ្នំពេញ ថ្ងៃទី..........ខែ...........ឆ្នាំ ២០២...."
    } : {
      no: "No.",
      barcode: "Barcode/SKU",
      name: "Product Name",
      category: "Category",
      qty: "Qty",
      alertQty: "Alert Qty",
      costPrice: "Cost Price",
      sellingPrice: "Selling Price",
      totalCost: "Total Cost",
      totalSelling: "Total Selling",
      total: "Total",
      subtitle: "Report as of date:",
      title: "Inventory Stock Report",
      signature: "Operation at Sen Sok, Phnom Penh, Date:..............................."
    };

    const dateOpts = { day: 'numeric', month: 'short', year: 'numeric' };
    const formattedToday = new Date().toLocaleDateString('en-GB', dateOpts).replace(/ /g, '-');

    container.innerHTML = `
      <!-- 1. Print & Export Action Buttons -->
      <div class="no-print" style="display:flex; justify-content:flex-end; gap:10px; margin-bottom:15px;">
        <button class="btn btn-secondary btn-sm" id="btn-print-stock-report" style="display:flex; align-items:center; gap:6px;">
          🖨️ ${isKhmer ? 'បោះពុម្ព / Save PDF' : 'Print / Save PDF'}
        </button>
        <button class="btn btn-primary btn-sm" id="btn-export-stock-excel" style="display:flex; align-items:center; gap:6px;">
          📥 ${isKhmer ? 'ទាញយកជា Excel (CSV)' : 'Export Excel (CSV)'}
        </button>
      </div>

      <!-- 2. KPI Summary Cards Grid -->
      <div class="kpi-grid no-print" style="margin-bottom:20px;">
        <!-- Total Products Card -->
        <div class="glass-card" style="padding:16px; display:flex; align-items:center; gap:14px; position:relative; overflow:hidden;">
          <div style="width:40px; height:40px; border-radius:50%; background:rgba(99, 102, 241, 0.15); display:flex; align-items:center; justify-content:center; font-size:20px; color:var(--primary);">
            📦
          </div>
          <div>
            <div style="font-size:11px; color:var(--text-secondary); font-weight:600;" data-translate="totalProducts">${window.POS_TRANSLATIONS[state.lang].totalProducts || 'Total Products'}</div>
            <div id="kpi-total-products" style="font-size:20px; font-weight:800; color:var(--text-primary); margin-top:2px;">0</div>
          </div>
        </div>

        <!-- Total Stock Qty Card -->
        <div class="glass-card" style="padding:16px; display:flex; align-items:center; gap:14px; position:relative; overflow:hidden;">
          <div style="width:40px; height:40px; border-radius:50%; background:rgba(16, 185, 129, 0.15); display:flex; align-items:center; justify-content:center; font-size:20px; color:var(--success);">
            🔢
          </div>
          <div>
            <div style="font-size:11px; color:var(--text-secondary); font-weight:600;" data-translate="totalStockQty">${window.POS_TRANSLATIONS[state.lang].totalStockQty || 'Total Stock Quantity'}</div>
            <div id="kpi-total-qty" style="font-size:20px; font-weight:800; color:var(--text-primary); margin-top:2px;">0</div>
          </div>
        </div>

        <!-- Total Cost Value Card -->
        <div class="glass-card" style="padding:16px; display:flex; align-items:center; gap:14px; position:relative; overflow:hidden;">
          <div style="width:40px; height:40px; border-radius:50%; background:rgba(245, 158, 11, 0.15); display:flex; align-items:center; justify-content:center; font-size:20px; color:#f59e0b;">
            💲
          </div>
          <div>
            <div style="font-size:11px; color:var(--text-secondary); font-weight:600;" data-translate="totalCostVal">${window.POS_TRANSLATIONS[state.lang].totalCostVal || 'Total Stock Cost Value'}</div>
            <div id="kpi-total-cost" style="font-size:20px; font-weight:800; color:#f59e0b; margin-top:2px;">$0.00</div>
          </div>
        </div>

        <!-- Total Retail Value Card -->
        <div class="glass-card" style="padding:16px; display:flex; align-items:center; gap:14px; position:relative; overflow:hidden;">
          <div style="width:40px; height:40px; border-radius:50%; background:rgba(59, 130, 246, 0.15); display:flex; align-items:center; justify-content:center; font-size:20px; color:var(--secondary);">
            📈
          </div>
          <div>
            <div style="font-size:11px; color:var(--text-secondary); font-weight:600;" data-translate="totalRetailVal">${window.POS_TRANSLATIONS[state.lang].totalRetailVal || 'Total Stock Retail Value'}</div>
            <div id="kpi-total-retail" style="font-size:20px; font-weight:800; color:var(--secondary); margin-top:2px;">$0.00</div>
          </div>
        </div>

        <!-- Low Stock Alert Card -->
        <div class="glass-card" style="padding:16px; display:flex; align-items:center; gap:14px; position:relative; overflow:hidden;">
          <div style="width:40px; height:40px; border-radius:50%; background:rgba(239, 68, 68, 0.15); display:flex; align-items:center; justify-content:center; font-size:20px; color:var(--danger);">
            ⚠️
          </div>
          <div>
            <div style="font-size:11px; color:var(--text-secondary); font-weight:600;" data-translate="lowStockAlerts">${window.POS_TRANSLATIONS[state.lang].lowStockAlerts || 'Low Stock Alerts'}</div>
            <div id="kpi-low-alerts" style="font-size:20px; font-weight:800; color:var(--danger); margin-top:2px;">0</div>
          </div>
        </div>
      </div>

      <!-- 3. Interactive Search & Filters Bar -->
      <div class="no-print glass-card" style="padding:14px; margin-bottom:20px; display:flex; flex-wrap:wrap; gap:12px; align-items:center;">
        <!-- Search field -->
        <div style="flex:1; min-width:200px; position:relative;">
          <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:14px; color:var(--text-secondary);">🔍</span>
          <input type="text" id="stock-report-search" class="form-control" style="padding-left:34px; font-size:12.5px; height:38px; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:rgba(0,0,0,0.15); color:#fff;" placeholder="${tSearch}">
        </div>
        
        <!-- Category Filter -->
        <div style="width:180px;">
          <select id="stock-report-category" class="form-control" style="font-size:12.5px; height:38px; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:rgba(0,0,0,0.15); color:#fff; cursor:pointer;">
            <option value="">${tAllCats}</option>
            ${state.categories.map(c => `<option value="${c.id}">${isKhmer ? c.nameKh : c.nameEn}</option>`).join('')}
          </select>
        </div>

        <!-- Status Filter -->
        <div style="width:180px;">
          <select id="stock-report-status" class="form-control" style="font-size:12.5px; height:38px; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:rgba(0,0,0,0.15); color:#fff; cursor:pointer;">
            <option value="">${tAllProds}</option>
            <option value="low">${tLowStockOnly}</option>
          </select>
        </div>
      </div>

      <!-- 4. Main Report Card -->
      <div id="report-content-area" class="glass-card" style="padding: 24px; position:relative;">
        <div style="text-align: center; margin-bottom: 25px; padding-bottom:15px; border-bottom: 1px dashed var(--border-color);">
          <h2 style="font-size: 18px; color:var(--text-primary); margin: 0 0 4px 0; font-weight:700;">
            របាយការណ៍ទំនិញក្នុងស្តុក
          </h2>
          <h3 style="font-size: 13.5px; color:var(--text-secondary); margin: 0 0 10px 0; font-weight:600; font-family: 'Segoe UI', sans-serif; letter-spacing: 0.5px;">
            Inventory Stock Report
          </h3>
          <span style="font-size: 12px; color: var(--text-muted); font-weight:500;">
            ${isKhmer ? 'របាយការណ៍គិតត្រឹមថ្ងៃ៖' : 'Report Date:'} ${formattedToday}
          </span>
        </div>

        <div class="table-responsive">
          <table class="pos-table" style="width:100%; border-collapse:collapse; font-size:12.5px;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-color);">
                <th style="padding:10px 6px; text-align:center; width:50px;">${headers.no}</th>
                <th style="padding:10px 6px; text-align:left;">${headers.barcode}</th>
                <th style="padding:10px 6px; text-align:left;">${headers.name}</th>
                <th style="padding:10px 6px; text-align:left; width:120px;">${headers.category}</th>
                <th style="padding:10px 6px; text-align:center; width:80px;">${headers.qty}</th>
                <th style="padding:10px 6px; text-align:center; width:85px;">${headers.alertQty}</th>
                <th style="padding:10px 6px; text-align:right; width:90px;">${headers.costPrice}</th>
                <th style="padding:10px 6px; text-align:right; width:90px;">${headers.sellingPrice}</th>
                <th style="padding:10px 6px; text-align:right; width:110px;">${headers.totalCost}</th>
                <th style="padding:10px 6px; text-align:right; width:110px;">${headers.totalSelling}</th>
              </tr>
            </thead>
            <tbody id="stock-report-table-body">
              <!-- Dynamically populated -->
            </tbody>
          </table>
        </div>

        <!-- Official Signature Footer -->
        <div style="margin-top: 40px; display: flex; justify-content: flex-end; text-align: right; font-size: 12px; font-family: 'Khmer OS Battambang', 'Segoe UI', sans-serif; color:var(--text-primary);">
          <div>
            <p style="margin: 0 0 5px 0; color:var(--text-secondary);">${headers.signature}</p>
            <p style="margin: 0; font-weight: bold; padding-right: 80px;">ហត្ថលេខា</p>
          </div>
        </div>
      </div>
    `;

    // Hook events
    document.getElementById('btn-print-stock-report').addEventListener('click', () => {
      printReportDOM();
    });

    document.getElementById('btn-export-stock-excel').addEventListener('click', () => {
      exportStockReportToExcel();
    });

    const searchInput = document.getElementById('stock-report-search');
    const categoryFilter = document.getElementById('stock-report-category');
    const statusFilter = document.getElementById('stock-report-status');

    const filterAndRenderStockTable = () => {
      const searchVal = searchInput.value.toLowerCase().trim();
      const catVal = categoryFilter.value;
      const statusVal = statusFilter.value;

      let filtered = state.products.filter(p => {
        const nameEn = p.nameEn ? p.nameEn.toLowerCase() : '';
        const nameKh = p.nameKh ? p.nameKh.toLowerCase() : '';
        const sku = p.sku ? p.sku.toLowerCase() : '';
        const matchesSearch = sku.includes(searchVal) || nameEn.includes(searchVal) || nameKh.includes(searchVal);
        
        const matchesCategory = !catVal || p.category === catVal;
        
        const qtyVal = filterBranch ? (p.warehouseStock[filterBranch] || 0) : p.stockQty;
        const isLow = qtyVal <= (p.minStock || 0);
        const matchesStatus = !statusVal || (statusVal === 'low' && isLow);

        return matchesSearch && matchesCategory && matchesStatus;
      });

      // Save for excel export
      state.lastFilteredProducts = filtered;

      // Render rows
      let rowsHtml = '';
      let sumCostPrice = 0;
      let sumSellingPrice = 0;
      let sumTotalCost = 0;
      let sumTotalSelling = 0;
      let totalStockUnits = 0;
      let lowAlertCount = 0;

      filtered.forEach((p, idx) => {
        const qtyVal = filterBranch ? (p.warehouseStock[filterBranch] || 0) : p.stockQty;
        const totalCostVal = qtyVal * p.costPrice;
        const totalSellingVal = qtyVal * p.sellingPrice;

        sumCostPrice += p.costPrice;
        sumSellingPrice += p.sellingPrice;
        sumTotalCost += totalCostVal;
        sumTotalSelling += totalSellingVal;
        totalStockUnits += qtyVal;

        const isLow = qtyVal <= (p.minStock || 0);
        if (isLow) lowAlertCount++;

        const qtyStyle = isLow ? 'color:var(--danger); font-weight:800; background:rgba(239,68,68,0.1); border-radius:4px; padding:2px 6px; display:inline-block;' : 'font-weight:700;';
        const lowBadge = isLow ? ` <span class="badge badge-danger" style="font-size:9px; padding:2px 4px; vertical-align:middle;">${isKhmer ? 'ខ្វះ' : 'Low'}</span>` : '';

        const catObj = state.categories.find(c => c.id === p.category);
        const catName = catObj ? (isKhmer ? catObj.nameKh : catObj.nameEn) : p.category;

        rowsHtml += `
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="text-align:center; padding:10px 6px;">${idx + 1}</td>
            <td style="padding:10px 6px;"><strong style="font-family:monospace; color:var(--secondary);">${p.sku}</strong></td>
            <td style="padding:10px 6px;">
              <strong style="color:var(--text-primary);">${isKhmer ? p.nameKh : p.nameEn}</strong>
              ${lowBadge}
            </td>
            <td style="padding:10px 6px; color:var(--text-secondary);">${catName}</td>
            <td style="text-align:center; padding:10px 6px;"><span style="${qtyStyle}">${qtyVal}</span></td>
            <td style="text-align:center; padding:10px 6px; color:var(--text-muted);">${p.minStock || 0}</td>
            <td style="font-weight:600; text-align:right; padding:10px 6px;">$${p.costPrice.toFixed(2)}</td>
            <td style="font-weight:600; text-align:right; padding:10px 6px;">$${p.sellingPrice.toFixed(2)}</td>
            <td style="font-weight:700; color:#f59e0b; text-align:right; padding:10px 6px;">$${totalCostVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="font-weight:700; color:var(--secondary); text-align:right; padding:10px 6px;">$${totalSellingVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        `;
      });

      const tableBody = document.getElementById('stock-report-table-body');
      if (filtered.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:24px; color:var(--text-muted); font-style:italic;">${isKhmer ? 'គ្មានទិន្នន័យទំនិញស្របតាមការជ្រើសរើសទេ' : 'No matching products found.'}</td></tr>`;
      } else {
        tableBody.innerHTML = rowsHtml + `
          <tr style="font-weight:bold; border-top:2px solid var(--border-color); background:rgba(255,255,255,0.02);">
            <td colspan="6" style="padding:12px 8px; text-align:right; font-weight:800; border-right: 1px solid var(--border-color);">
              ${headers.total}
            </td>
            <td style="padding:12px 8px; text-align:right; font-weight:800;">$${sumCostPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="padding:12px 8px; text-align:right; font-weight:800;">$${sumSellingPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="padding:12px 8px; text-align:right; font-weight:800; color:#f59e0b;">$${sumTotalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="padding:12px 8px; text-align:right; font-weight:800; color:var(--secondary);">$${sumTotalSelling.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        `;
      }

      // Update KPI widgets
      document.getElementById('kpi-total-products').innerText = filtered.length;
      document.getElementById('kpi-total-qty').innerText = totalStockUnits;
      document.getElementById('kpi-total-cost').innerText = '$' + sumTotalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      document.getElementById('kpi-total-retail').innerText = '$' + sumTotalSelling.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      document.getElementById('kpi-low-alerts').innerText = lowAlertCount;
    };

    // Listeners for inputs
    searchInput.addEventListener('input', filterAndRenderStockTable);
    categoryFilter.addEventListener('change', filterAndRenderStockTable);
    statusFilter.addEventListener('change', filterAndRenderStockTable);

    // Initial render
    filterAndRenderStockTable();
  }

  function renderStockLogReport(container, start, end) {
    let rowsHtml = '';
    const filtered = getFilteredStockLogs().filter(l => {
      const d = new Date(l.date);
      return d >= start && d <= end;
    }).sort((a,b) => new Date(b.date) - new Date(a.date));

    filtered.forEach(log => {
      const p = state.products.find(prod => prod.sku === log.sku);
      const name = p ? (state.lang === 'km' ? p.nameKh : p.nameEn) : 'Deleted Product';
      const br = state.branches.find(b => b.id === log.warehouseId);
      const brText = br ? (state.lang === 'km' ? br.nameKh : br.name) : 'HQ';

      let typeBadge = '';
      if (log.type === 'replenishment') typeBadge = '<span class="badge badge-success">Replenish</span>';
      else if (log.type === 'sale') typeBadge = '<span class="badge badge-danger">Sale deduction</span>';
      else typeBadge = '<span class="badge badge-warning">Transfer</span>';

      rowsHtml += `
        <tr>
          <td style="font-size:10px;">${window.POS_HELPERS.formatDate(log.date, state.lang)}</td>
          <td><span class="badge badge-primary">${brText}</span></td>
          <td><strong style="font-family:monospace;">${log.sku}</strong><br><span style="font-size:10px; color:var(--text-secondary);">${name}</span></td>
          <td>${typeBadge}</td>
          <td style="text-align:center; font-weight:800; color:${log.qty > 0 ? 'var(--primary)' : 'var(--danger)'};">${log.qty > 0 ? '+' + log.qty : log.qty}</td>
          <td style="font-size:11px; color:var(--text-secondary);">${log.description}</td>
        </tr>
      `;
    });

    container.innerHTML = `
      <table class="pos-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Branch</th>
            <th>Product</th>
            <th>Type</th>
            <th style="text-align:center;">Qty Shift</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">${window.POS_TRANSLATIONS[state.lang].noData}</td></tr>`}
        </tbody>
      </table>
    `;
  }

  function renderDailySalesReport(container, start, end) {
    const daily = {};
    getFilteredTransactions().forEach(t => {
      const d = new Date(t.date);
      if (d >= start && d <= end) {
        const dateStr = t.date.split('T')[0];
        daily[dateStr] = (daily[dateStr] || 0) + t.total;
      }
    });

    const days = Object.keys(daily).sort();
    let rowsHtml = '';
    let grandTotal = 0;

    days.forEach(d => {
      grandTotal += daily[d];
      rowsHtml += `
        <tr>
          <td><strong>${window.POS_HELPERS.formatDate(d, state.lang).split(' ')[0]}</strong></td>
          <td style="font-weight:800; color:var(--primary);">${window.POS_HELPERS.formatUSD(daily[d])}</td>
          <td>${window.POS_HELPERS.formatKHR(daily[d])}</td>
        </tr>
      `;
    });

    container.innerHTML = `
      <div style="padding: 12px; background:rgba(16,185,129,0.05); border-radius:6px; margin-bottom:12px; font-weight:800; font-size:12px; color:var(--primary);">
        Total Period Sales Volume: ${window.POS_HELPERS.formatUSD(grandTotal)} (${window.POS_HELPERS.formatKHR(grandTotal)})
      </div>
      <table class="pos-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Sales Value</th>
            <th>Sales KHR</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">${window.POS_TRANSLATIONS[state.lang].noData}</td></tr>`}
        </tbody>
      </table>
    `;
  }

  function renderProductSalesReport(container, start, end) {
    const fBranch = state.reportFilterBranch || 'all';
    const fStaff = state.reportFilterStaff || 'all';
    const fCategory = state.reportFilterCategory || 'all';

    let branchOpts = '<option value="all">All Branches</option>';
    state.branches.forEach(b => {
      branchOpts += `<option value="${b.id}" ${fBranch === b.id ? 'selected' : ''}>${state.lang === 'km' ? b.nameKh : b.name}</option>`;
    });

    let staffOpts = '<option value="all">All Employees</option>';
    state.staff.forEach(s => {
      staffOpts += `<option value="${s.id}" ${fStaff === s.id ? 'selected' : ''}>${s.name}</option>`;
    });

    let catOpts = '<option value="all">All Categories</option>';
    state.categories.forEach(c => {
      catOpts += `<option value="${c.id}" ${fCategory === c.id ? 'selected' : ''}>${state.lang === 'km' ? c.nameKh : c.nameEn}</option>`;
    });

    const filterRowHtml = `
      <div class="inner-report-filters" style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:12px; padding:10px; background:rgba(255,255,255,0.02); border:1px solid var(--border-color); border-radius:6px; align-items:center;">
        <span style="font-size:11px; font-weight:700; color:var(--text-secondary);">Filter Report:</span>
        <select id="rep-filter-branch" class="form-control" style="width:150px; padding:4px 8px; font-size:11px; height:auto;">${branchOpts}</select>
        <select id="rep-filter-staff" class="form-control" style="width:150px; padding:4px 8px; font-size:11px; height:auto;">${staffOpts}</select>
        <select id="rep-filter-category" class="form-control" style="width:150px; padding:4px 8px; font-size:11px; height:auto;">${catOpts}</select>
      </div>
    `;

    const prodSales = {};
    const prodRevenue = {};

    getFilteredTransactions().forEach(t => {
      const d = new Date(t.date);
      if (d >= start && d <= end) {
        if (fBranch !== 'all' && t.branchId !== fBranch) return;
        if (fStaff !== 'all' && t.staffId !== fStaff) return;

        t.items.forEach(item => {
          const p = state.products.find(pr => pr.sku === item.sku);
          if (fCategory !== 'all' && (!p || p.category !== fCategory)) return;

          prodSales[item.sku] = (prodSales[item.sku] || 0) + item.qty;
          prodRevenue[item.sku] = (prodRevenue[item.sku] || 0) + item.total;
        });
      }
    });

    let rowsHtml = '';
    Object.keys(prodSales).forEach(sku => {
      const p = state.products.find(pr => pr.sku === sku);
      const name = p ? (state.lang === 'km' ? p.nameKh : p.nameEn) : 'Deleted Product';
      
      rowsHtml += `
        <tr>
          <td><strong style="font-family:monospace;">${sku}</strong></td>
          <td><strong>${name}</strong></td>
          <td style="text-align:center; font-weight:800; color:var(--secondary);">${prodSales[sku]}</td>
          <td style="font-weight:800; color:var(--primary);">${window.POS_HELPERS.formatUSD(prodRevenue[sku])}</td>
        </tr>
      `;
    });

    container.innerHTML = `
      ${filterRowHtml}
      <table class="pos-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Product</th>
            <th style="text-align:center;">Units Sold</th>
            <th>Revenue Generated</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">${window.POS_TRANSLATIONS[state.lang].noData}</td></tr>`}
        </tbody>
      </table>
    `;

    document.getElementById('rep-filter-branch').addEventListener('change', (e) => {
      state.reportFilterBranch = e.target.value;
      triggerReportRender();
    });
    document.getElementById('rep-filter-staff').addEventListener('change', (e) => {
      state.reportFilterStaff = e.target.value;
      triggerReportRender();
    });
    document.getElementById('rep-filter-category').addEventListener('change', (e) => {
      state.reportFilterCategory = e.target.value;
      triggerReportRender();
    });
  }

  function renderSalesDetailsReport(container, start, end) {
    const fBranch = state.reportFilterBranch || 'all';
    const fStaff = state.reportFilterStaff || 'all';
    const fCategory = state.reportFilterCategory || 'all';

    let branchOpts = '<option value="all">All Branches</option>';
    state.branches.forEach(b => {
      branchOpts += `<option value="${b.id}" ${fBranch === b.id ? 'selected' : ''}>${state.lang === 'km' ? b.nameKh : b.name}</option>`;
    });

    let staffOpts = '<option value="all">All Employees</option>';
    state.staff.forEach(s => {
      staffOpts += `<option value="${s.id}" ${fStaff === s.id ? 'selected' : ''}>${s.name}</option>`;
    });

    let catOpts = '<option value="all">All Categories</option>';
    state.categories.forEach(c => {
      catOpts += `<option value="${c.id}" ${fCategory === c.id ? 'selected' : ''}>${state.lang === 'km' ? c.nameKh : c.nameEn}</option>`;
    });

    const filterRowHtml = `
      <div class="inner-report-filters" style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:12px; padding:10px; background:rgba(255,255,255,0.02); border:1px solid var(--border-color); border-radius:6px; align-items:center;">
        <span style="font-size:11px; font-weight:700; color:var(--text-secondary);">Filter Report:</span>
        <select id="rep-filter-branch" class="form-control" style="width:150px; padding:4px 8px; font-size:11px; height:auto;">${branchOpts}</select>
        <select id="rep-filter-staff" class="form-control" style="width:150px; padding:4px 8px; font-size:11px; height:auto;">${staffOpts}</select>
        <select id="rep-filter-category" class="form-control" style="width:150px; padding:4px 8px; font-size:11px; height:auto;">${catOpts}</select>
      </div>
    `;

    let transactions = getFilteredTransactions().filter(t => {
      const d = new Date(t.date);
      return d >= start && d <= end;
    });

    if (fBranch !== 'all') {
      transactions = transactions.filter(t => t.branchId === fBranch);
    }
    if (fStaff !== 'all') {
      transactions = transactions.filter(t => t.staffId === fStaff);
    }
    if (fCategory !== 'all') {
      transactions = transactions.filter(t => {
        return t.items.some(item => {
          const p = state.products.find(prod => prod.sku === item.sku);
          return p && p.category === fCategory;
        });
      });
    }

    let rowsHtml = '';
    const sorted = transactions.sort((a,b) => new Date(b.date) - new Date(a.date));

    sorted.forEach(tx => {
      const br = state.branches.find(b => b.id === tx.branchId);
      const brText = br ? (state.lang === 'km' ? br.nameKh : br.name) : 'HQ';
      const itemsText = tx.items.map(it => `${state.lang === 'km' ? it.nameKh : it.nameEn} x${it.qty}`).join(', ');
      const methodTranslate = window.POS_TRANSLATIONS[state.lang][tx.paymentMethod] || tx.paymentMethod;

      rowsHtml += `
        <tr>
          <td><strong style="color:var(--secondary); font-family:monospace;">${tx.invoiceNo || tx.id}</strong><br><span style="font-size:9px;color:var(--text-muted);">${brText}</span></td>
          <td style="font-size:10px;">${window.POS_HELPERS.formatDate(tx.date, state.lang)}</td>
          <td><strong>${tx.customerName}</strong><br><span style="font-size:9px;color:var(--text-muted);">Rep: ${tx.staffName}</span></td>
          <td style="font-size:10px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${itemsHtmlEntities(itemsText)}">${itemsText}</td>
          <td style="font-weight:750; color:var(--primary);">${window.POS_HELPERS.formatUSD(tx.total)}</td>
          <td><span style="font-size:10px; text-transform:uppercase;">${methodTranslate}</span></td>
          <td>
            <button class="btn btn-danger btn-sm btn-void-tx" data-id="${tx.id}" style="padding:2px 6px;">🗑️ Void</button>
          </td>
        </tr>
      `;
    });

    container.innerHTML = `
      ${filterRowHtml}
      <table class="pos-table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Date</th>
            <th>Customer / Staff</th>
            <th>Items</th>
            <th>Total Due</th>
            <th>Payment</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">${window.POS_TRANSLATIONS[state.lang].noData}</td></tr>`}
        </tbody>
      </table>
    `;

    document.getElementById('rep-filter-branch').addEventListener('change', (e) => {
      state.reportFilterBranch = e.target.value;
      triggerReportRender();
    });
    document.getElementById('rep-filter-staff').addEventListener('change', (e) => {
      state.reportFilterStaff = e.target.value;
      triggerReportRender();
    });
    document.getElementById('rep-filter-category').addEventListener('change', (e) => {
      state.reportFilterCategory = e.target.value;
      triggerReportRender();
    });

    container.querySelectorAll('.btn-void-tx').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!guardAction('delete')) return;
        const txId = btn.getAttribute('data-id');
        const reason = prompt(state.lang === 'km' ? 'សូមបញ្ចូលមូលហេតុនៃការលុបវិក្កយបត្រនេះ៖' : 'Enter reason for voiding this transaction:');
        if (reason) {
          voidTransaction(txId, reason);
        }
      });
    });
  }

  function itemsHtmlEntities(str) {
    return str.replace(/[\u00A0-\u9999<>\&]/g, function(i) {
       return '&#'+i.charCodeAt(0)+';';
    });
  }

  function voidTransaction(txId, reason) {
    const idx = state.transactions.findIndex(t => t.id === txId);
    if (idx === -1) return;
    const tx = state.transactions[idx];

    // Restore warehouse stock
    tx.items.forEach(item => {
      const p = state.products.find(prod => prod.sku === item.sku);
      if (p) {
        const brId = tx.branchId || "BR-001";
        p.warehouseStock[brId] = (p.warehouseStock[brId] || 0) + item.qty;
        
        let sum = 0;
        for (const b in p.warehouseStock) sum += parseInt(p.warehouseStock[b]) || 0;
        p.stockQty = sum;

        // Log restoration
        state.stockLogs.push({
          id: 'SLG-' + (1000 + state.stockLogs.length + 1),
          date: new Date().toISOString(),
          sku: item.sku,
          type: 'replenishment',
          qty: item.qty,
          warehouseId: brId,
          description: `Restored stock from voided transaction ${tx.invoiceNo || tx.id}`
        });
      }
    });

    // Rollback customer debt
    if (tx.outstandingDebt > 0 && tx.customerId) {
      const customer = state.customers.find(c => c.id === tx.customerId);
      if (customer) {
        customer.outstandingDebt = Math.max(0, (customer.outstandingDebt || 0) - tx.outstandingDebt);
      }
    }

    // Save void log
    state.voidedTransactions.push({
      ...tx,
      voidedAt: new Date().toISOString(),
      voidedBy: state.currentUser.name || state.currentUser.username,
      voidReason: reason
    });

    // Remove transaction
    state.transactions.splice(idx, 1);

    saveStateToLocalStorage();
    updateLowStockAlertCount();
    triggerReportRender();
    populatePOSSelects();
    alert(window.POS_TRANSLATIONS[state.lang].voidSuccess);
  }

  function renderCustomerPaymentsReport(container, start, end) {
    let rowsHtml = '';
    const filtered = getFilteredPaymentLogs().filter(p => {
      const d = new Date(p.date);
      return d >= start && d <= end;
    }).sort((a,b) => new Date(b.date) - new Date(a.date));

    filtered.forEach(log => {
      const methodTranslate = window.POS_TRANSLATIONS[state.lang][log.paymentMethod] || log.paymentMethod;
      rowsHtml += `
        <tr>
          <td style="font-size:10px;">${window.POS_HELPERS.formatDate(log.date, state.lang)}</td>
          <td><strong>${log.customerName}</strong></td>
          <td style="font-weight:800; color:var(--primary);">${window.POS_HELPERS.formatUSD(log.amount)}</td>
          <td style="text-transform:uppercase; font-size:10px;">${methodTranslate}</td>
          <td>${log.notes || '-'}</td>
        </tr>
      `;
    });

    container.innerHTML = `
      <table class="pos-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Customer</th>
            <th>Amount Paid</th>
            <th>Method</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">${window.POS_TRANSLATIONS[state.lang].noData}</td></tr>`}
        </tbody>
      </table>
    `;
  }

  function renderStaffCommissionReport(container) {
    let rowsHtml = '';
    
    // Calculates
    const salesVolume = {};
    const unitsVolume = {};
    getFilteredTransactions().forEach(t => {
      salesVolume[t.staffId] = (salesVolume[t.staffId] || 0) + t.total;
      let units = 0;
      t.items.forEach(it => units += it.qty);
      unitsVolume[t.staffId] = (unitsVolume[t.staffId] || 0) + units;
    });

    getFilteredStaff().forEach(s => {
      const units = unitsVolume[s.id] || 0;
      const sales = salesVolume[s.id] || 0;

      let rate = s.commissionRate;
      state.commissionRules.tiers.forEach(t => {
        if (units >= t.minUnits && units <= t.maxUnits) {
          rate = t.ratePercent;
        }
      });
      const commAmount = sales * (rate / 100);

      rowsHtml += `
        <tr>
          <td><strong>${s.name}</strong></td>
          <td>${s.role}</td>
          <td style="text-align:center; font-weight:800; color:var(--secondary);">${units}</td>
          <td style="font-weight:750;">${window.POS_HELPERS.formatUSD(sales)}</td>
          <td style="text-align:center; font-weight:750; color:var(--warning);">${rate}%</td>
          <td style="font-weight:800; color:var(--primary);">${window.POS_HELPERS.formatUSD(commAmount)}</td>
        </tr>
      `;
    });

    container.innerHTML = `
      <table class="pos-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Position</th>
            <th style="text-align:center;">Units Sold</th>
            <th>Sales Volume</th>
            <th style="text-align:center;">Commission Rate</th>
            <th>Commission Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">${window.POS_TRANSLATIONS[state.lang].noData}</td></tr>`}
        </tbody>
      </table>
    `;
  }

  function renderCustomerDebtReport(container) {
    let rowsHtml = '';
    let totalDebt = 0;

    getFilteredCustomers().forEach(c => {
      if (c.outstandingDebt > 0) {
        totalDebt += c.outstandingDebt;
        rowsHtml += `
          <tr>
            <td><strong style="color:var(--secondary); font-family:monospace;">${c.id}</strong></td>
            <td><strong>${c.name}</strong></td>
            <td>${c.phone}</td>
            <td><span class="badge badge-warning" style="text-transform:none;">${c.rank}</span></td>
            <td style="font-weight:800; color:var(--danger); text-align:right;">${window.POS_HELPERS.formatUSD(c.outstandingDebt)}</td>
          </tr>
        `;
      }
    });

    container.innerHTML = `
      <div style="padding: 12px; background:rgba(239,68,68,0.05); border-radius:6px; margin-bottom:12px; font-weight:800; font-size:12px; color:var(--danger); display:flex; justify-content:space-between;">
        <span>Outstanding Debt Customer Accounts</span>
        <span>Total Debts Ledger: ${window.POS_HELPERS.formatUSD(totalDebt)}</span>
      </div>
      <table class="pos-table">
        <thead>
          <tr>
            <th>Customer ID</th>
            <th>Customer Name</th>
            <th>Phone</th>
            <th>Tier</th>
            <th style="text-align:right;">Outstanding Debt</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">${window.POS_TRANSLATIONS[state.lang].noData}</td></tr>`}
        </tbody>
      </table>
    `;
  }

  function renderExpenseReport(container, start, end) {
    let rowsHtml = '';
    let totalAmount = 0;

    const filtered = getFilteredExpenses().filter(e => {
      const d = new Date(e.date);
      return d >= start && d <= end;
    }).sort((a,b) => new Date(b.date) - new Date(a.date));

    filtered.forEach(exp => {
      totalAmount += exp.amount;
      const catName = window.POS_TRANSLATIONS[state.lang][exp.category] || exp.category;
      const br = state.branches.find(b => b.id === exp.branchId);
      const brText = br ? (state.lang === 'km' ? br.nameKh : br.name) : 'HQ';

      rowsHtml += `
        <tr>
          <td style="font-size:10px;">${window.POS_HELPERS.formatDate(exp.date, state.lang)}</td>
          <td><span class="badge badge-warning" style="text-transform:none;">${catName}</span><br><span style="font-size:8px;color:var(--text-muted);">${brText}</span></td>
          <td>${exp.description}</td>
          <td style="font-weight:750; color:var(--danger);">${window.POS_HELPERS.formatUSD(exp.amount)}</td>
        </tr>
      `;
    });

    container.innerHTML = `
      <div style="padding: 12px; background:rgba(239,68,68,0.05); border-radius:6px; margin-bottom:12px; font-weight:800; font-size:12px; color:var(--danger);">
        Total Period Expenses: ${window.POS_HELPERS.formatUSD(totalAmount)}
      </div>
      <table class="pos-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Category / Branch</th>
            <th>Description</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">${window.POS_TRANSLATIONS[state.lang].noData}</td></tr>`}
        </tbody>
      </table>
    `;
  }

  function renderProfitLossReport(container, start, end) {
    let totalRevenue = 0;
    let totalCOGS = 0;

    getFilteredTransactions().forEach(t => {
      const d = new Date(t.date);
      if (d >= start && d <= end) {
        totalRevenue += t.total;
        t.items.forEach(item => {
          const p = state.products.find(prod => prod.sku === item.sku);
          const cost = p ? p.costPrice : 0;
          totalCOGS += item.qty * cost;
        });
      }
    });

    const grossProfit = totalRevenue - totalCOGS;

    // Expenses breakdown
    let rentExp = 0;
    let electricityExp = 0;
    let waterExp = 0;
    let marketingExp = 0;
    let materialsExp = 0;
    let salariesPaid = 0;
    let transportationExp = 0;
    let otherExp = 0;

    getFilteredExpenses().forEach(e => {
      const d = new Date(e.date);
      if (d >= start && d <= end) {
        if (e.category === 'rent') rentExp += e.amount;
        else if (e.category === 'electricity') electricityExp += e.amount;
        else if (e.category === 'water') waterExp += e.amount;
        else if (e.category === 'marketing') marketingExp += e.amount;
        else if (e.category === 'rawMaterials') materialsExp += e.amount;
        else if (e.category === 'salaries') salariesPaid += e.amount;
        else if (e.category === 'transportation') transportationExp += e.amount;
        else otherExp += e.amount;
      }
    });

    const totalOpEx = rentExp + electricityExp + waterExp + marketingExp + materialsExp + salariesPaid + transportationExp + otherExp;
    const netProfit = grossProfit - totalOpEx;

    container.innerHTML = `
      <div style="padding: 24px; color:var(--text-primary);">
        <div style="border-bottom:1px solid var(--border-color); padding-bottom:8px; margin-bottom:8px;">
          <h4 style="color:var(--primary); font-weight:800; font-size:14px;">1. Operating Income</h4>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:12px;">
          <span>Gross Sales Revenue (ចំណូលលក់សរុប)</span>
          <strong style="color:var(--primary);">${window.POS_HELPERS.formatUSD(totalRevenue)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:12px; color:var(--text-secondary);">
          <span>Cost of Goods Sold - COGS (ថ្លៃដើមទំនិញលក់)</span>
          <strong>-${window.POS_HELPERS.formatUSD(totalCOGS)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:20px; font-size:13px; font-weight:750; border-top:1px dashed var(--border-color); padding-top:8px;">
          <span>Gross Profit (ប្រាក់ចំណេញដុល)</span>
          <span style="color:var(--primary);">${window.POS_HELPERS.formatUSD(grossProfit)}</span>
        </div>

        <div style="border-bottom:1px solid var(--border-color); padding-bottom:8px; margin-bottom:8px; margin-top:20px;">
          <h4 style="color:var(--warning); font-weight:800; font-size:14px;">2. Operational Expenses (OpEx)</h4>
        </div>
        <div style="display:grid; gap:8px; font-size:12px; padding-left:10px;">
          <div style="display:flex; justify-content:space-between;">
            <span>Staff Payroll / Salaries Paid (ប្រាក់ខែបុគ្គលិក)</span>
            <span>${window.POS_HELPERS.formatUSD(salariesPaid)}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>Rental Spaces (ជួលទីតាំង)</span>
            <span>${window.POS_HELPERS.formatUSD(rentExp)}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>EDC Electricity Utility (អគ្គិសនី)</span>
            <span>${window.POS_HELPERS.formatUSD(electricityExp)}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>PPWSA Water Utility (ទឹកស្អាត)</span>
            <span>${window.POS_HELPERS.formatUSD(waterExp)}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>Advertising & Marketing (ផ្សព្វផ្សាយ)</span>
            <span>${window.POS_HELPERS.formatUSD(marketingExp)}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>Procurements / Stock refills (ថ្លៃទិញទំនិញចូល)</span>
            <span>${window.POS_HELPERS.formatUSD(materialsExp)}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>Transportation & Fuel (ដឹកជញ្ជូន)</span>
            <span>${window.POS_HELPERS.formatUSD(transportationExp)}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>Miscellaneous Expenses (ផ្សេងៗ)</span>
            <span>${window.POS_HELPERS.formatUSD(otherExp)}</span>
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:24px; font-size:13px; font-weight:750; border-top:1px dashed var(--border-color); padding-top:8px; margin-top:8px;">
          <span>Total Expenses (ចំណាយសរុប)</span>
          <span style="color:var(--danger);">${window.POS_HELPERS.formatUSD(totalOpEx)}</span>
        </div>

        <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-color); border-radius:8px; padding:16px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="font-weight:800; font-size:14px; color:var(--text-primary);">NET PROFIT / LOSS STATEMENT</h3>
            <p style="font-size:10px; color:var(--text-secondary); margin-top:2px;">Calculated dynamically within selected range</p>
          </div>
          <div style="text-align:right;">
            <h2 style="font-size:20px; font-weight:900; color:${netProfit >= 0 ? 'var(--primary)' : 'var(--danger)'};">${window.POS_HELPERS.formatUSD(netProfit)}</h2>
            <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">${window.POS_HELPERS.formatKHR(netProfit)}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderRegistrationReport(container, start, end) {
    let rowsHtml = '';

    // Track registrations (mock data timestamp logs of customers, staff, users)
    const logs = [];
    getFilteredCustomers().forEach(c => {
      logs.push({ date: c.createdAt || new Date().toISOString(), type: 'Customer', name: c.name, desc: `ID: ${c.id}, Phone: ${c.phone}, Source: ${c.source}` });
    });
    getFilteredStaff().forEach(s => {
      logs.push({ date: s.createdAt || new Date().toISOString(), type: 'Employee Staff', name: s.name, desc: `ID: ${s.id}, Base Salary: $${s.baseSalary}` });
    });
    getFilteredUsers().forEach(u => {
      logs.push({ date: u.createdAt || new Date().toISOString(), type: 'User Login', name: u.username, desc: `Role: ${u.role}, Access Code: ${u.branchId}` });
    });

    const filtered = logs.filter(l => {
      const d = new Date(l.date);
      return d >= start && d <= end;
    }).sort((a,b) => new Date(b.date) - new Date(a.date));

    filtered.forEach(log => {
      rowsHtml += `
        <tr>
          <td style="font-size:10px;">${window.POS_HELPERS.formatDate(log.date, state.lang)}</td>
          <td><span class="badge badge-success">${log.type}</span></td>
          <td><strong>${log.name}</strong></td>
          <td style="font-size:11px; color:var(--text-secondary);">${log.desc}</td>
        </tr>
      `;
    });

    container.innerHTML = `
      <table class="pos-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Type</th>
            <th>Entity Name</th>
            <th>Details Log</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">${window.POS_TRANSLATIONS[state.lang].noData}</td></tr>`}
        </tbody>
      </table>
    `;
  }

  function renderVoidReport(container, start, end) {
    let rowsHtml = '';
    const filtered = getFilteredVoidedTransactions().filter(v => {
      const d = new Date(v.voidedAt);
      return d >= start && d <= end;
    }).sort((a,b) => new Date(b.voidedAt) - new Date(a.voidedAt));

    filtered.forEach(log => {
      rowsHtml += `
        <tr>
          <td style="font-size:10px;">${window.POS_HELPERS.formatDate(log.voidedAt, state.lang)}</td>
          <td><strong style="color:var(--secondary); font-family:monospace;">${log.invoiceNo || log.id}</strong></td>
          <td><strong>${log.customerName}</strong></td>
          <td style="font-weight:750; color:var(--danger);">${window.POS_HELPERS.formatUSD(log.total)}</td>
          <td><strong style="color:var(--warning); font-size:11px;">${log.voidedBy}</strong></td>
          <td style="font-size:11px; color:var(--text-secondary); font-style:italic;">"${log.voidReason}"</td>
        </tr>
      `;
    });

    container.innerHTML = `
      <table class="pos-table">
        <thead>
          <tr>
            <th>Voided Date</th>
            <th>Invoice</th>
            <th>Customer</th>
            <th>Amount Refunded</th>
            <th>Voided By</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">${window.POS_TRANSLATIONS[state.lang].noData}</td></tr>`}
        </tbody>
      </table>
    `;
  }

  // Active Report Exporter CSV Helper
  function exportReportToCSV() {
    const table = document.querySelector('#report-content-area table');
    if (!table) {
      alert('No query data available to export!');
      return;
    }

    let csvContent = '\uFEFF'; // UTF-8 BOM for Khmer fonts
    const rows = table.querySelectorAll('tr');
    
    rows.forEach(row => {
      const cols = row.querySelectorAll('th, td');
      const rowData = [];
      cols.forEach(col => {
        // Strip tags and quotes
        let text = col.innerText.replace(/(\r\n|\n|\r)/gm, " ").trim();
        text = text.replace(/"/g, '""');
        rowData.push('"' + text + '"');
      });
      csvContent += rowData.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `ABC_${state.activeReportTab}_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // 11. SETTINGS & DEVELOPER DOCUMENTATION SCHEMAS
  function initFirebaseSync() {
    // Hardcoded production Firebase configuration for automatic sync
    const defaultFirebaseConfig = {
      apiKey: "AIzaSyCGVfZo-Hpc-wdQv21he4Js0K3RuyZ3VQ",
      authDomain: "abc-system-2c0e4.firebaseapp.com",
      projectId: "abc-system-2c0e4",
      storageBucket: "abc-system-2c0e4.firebasestorage.app",
      messagingSenderId: "1078178677076",
      appId: "1:1078178677076:web:b2953a455bd930460848c1",
      measurementId: "G-QXTYZTKC6T"
    };

    // Force enable Firebase Cloud Sync to ensure all devices/browsers are automatically synchronized
    let enabled = true;
    state.companySettings.firebaseEnabled = true; 

    let configStr = state.companySettings.firebaseConfig;
    let config;

    if (configStr) {
      try { 
        config = JSON.parse(configStr); 
      } catch(e) {}
    }

    if (!config) {
      config = defaultFirebaseConfig;
      configStr = JSON.stringify(defaultFirebaseConfig);
      enabled = true; // Force enable now
      
      // Auto-save configuration to company settings to populate Settings UI
      state.companySettings.firebaseEnabled = true;
      state.companySettings.firebaseConfig = configStr;
      safeSetItem('abc_company_settings', JSON.stringify(state.companySettings));
    }

    if (!enabled || !config) {
      console.log("Firebase Cloud Sync is disabled.");
      return;
    }

    try {
      // Initialize Firebase Compat
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      
      const db = firebase.firestore();
      state.firebaseDb = db;
      firebaseActive = true;
      console.log("Firebase Cloud Sync successfully initialized!");

      const startListeners = (dbInstance) => {
        const setupListener = (colName, stateKey, idKey, renderFns) => {
          dbInstance.collection(colName).onSnapshot(snapshot => {
            if (snapshot.metadata.hasPendingWrites) return;

            const list = [];
            snapshot.forEach(doc => {
              const data = doc.data();
              if (idKey && !data[idKey]) {
                data[idKey] = doc.id;
              }
              list.push(data);
            });

            state[stateKey] = list;
            lastSyncedState[stateKey] = JSON.parse(JSON.stringify(list));
            
            // Save local cache
            safeSetItem('abc_' + (colName === 'stock_logs' ? 'stock_logs' : colName === 'payment_logs' ? 'payment_logs' : colName), JSON.stringify(list));

            // Re-render UI views
            if (renderFns) {
              renderFns.forEach(fn => {
                try {
                  fn();
                } catch(e) {
                  console.error("Render error in " + (fn.name || "anonymous") + ":", e);
                }
              });
            }
          }, err => {
            console.error(`Firestore listener error on ${colName}:`, err);
          });
        };

        setupListener('users', 'users', 'id', []);
        setupListener('branches', 'branches', 'id', [populatePOSSelects]);
        setupListener('customers', 'customers', 'id', [renderCustomers, populatePOSSelects]);
        setupListener('products', 'products', 'sku', [renderPOS, renderInventory]);
        setupListener('staff', 'staff', 'id', [populatePOSSelects]);
        setupListener('transactions', 'transactions', 'id', [renderDashboard, renderPOS, populatePOSSelects]);
        setupListener('expenses', 'expenses', 'id', [renderFinance]);
        setupListener('stock_logs', 'stockLogs', 'id', []);
        setupListener('payment_logs', 'paymentLogs', 'id', []);
        setupListener('followups', 'followups', 'id', [renderFollowups]);
        setupListener('employees', 'employees', 'id', [renderEmployeeList, renderHRDashboard]);
        setupListener('attendance', 'attendance', 'id', [cleanupOldSelfies, renderAttendanceLogs, renderHRDashboard]);
        setupListener('leave_requests', 'leaveRequests', 'id', [renderLeaveRequests, renderHRDashboard]);
        setupListener('companies', 'companies', 'id', [renderHROrg, populateEmployeeFormDropdowns]);
        setupListener('departments', 'departments', 'id', [renderHROrg]);
        setupListener('teams', 'teams', 'id', [renderHROrg]);
        setupListener('positions', 'positions', 'id', [renderHROrg]);
        setupListener('payroll_items', 'payrollItems', 'id', [renderHRPayroll]);
        setupListener('kpis', 'kpis', 'id', [renderHRPerformance]);

        // Company settings listener
        let isFirstSettingsSnapshot = true;
        dbInstance.collection('company_settings').doc('global').onSnapshot(doc => {
          if (doc.metadata.hasPendingWrites) return;

          if (isFirstSettingsSnapshot) {
            isFirstSettingsSnapshot = false;
            const hasLocalSettings = state.companySettings && Object.keys(state.companySettings).length > 0;
            const isDocEmpty = !doc.exists || !doc.data() || Object.keys(doc.data()).length === 0;

            if (isDocEmpty && hasLocalSettings) {
              console.log("Firestore company settings document is empty or missing. Initializing with local settings...");
              dbInstance.collection('company_settings').doc('global').set(state.companySettings)
                .catch(e => console.error("Error initializing company settings in Firestore:", e));
              return;
            }
          }

          if (doc.exists && doc.data() && Object.keys(doc.data()).length > 0) {
            const settings = doc.data();
            state.companySettings = settings;
            safeSetItem('abc_company_settings', JSON.stringify(settings));
            updateUserCardHeader();
            updateCompanyLogoUI();
            populateExpenseCategories();
            if (state.activeView === 'view-settings') {
              renderSettings();
            }
          }
        });

        // Commission rules listener
        let isFirstCommSnapshot = true;
        dbInstance.collection('company_settings').doc('commission_rules').onSnapshot(doc => {
          if (doc.metadata.hasPendingWrites) return;

          if (isFirstCommSnapshot) {
            isFirstCommSnapshot = false;
            const hasLocalRules = state.commissionRules && Object.keys(state.commissionRules).length > 0;
            const isDocEmpty = !doc.exists || !doc.data() || Object.keys(doc.data()).length === 0;

            if (isDocEmpty && hasLocalRules) {
              console.log("Firestore commission rules document is empty or missing. Initializing with local rules...");
              dbInstance.collection('company_settings').doc('commission_rules').set(state.commissionRules)
                .catch(e => console.error("Error initializing commission rules in Firestore:", e));
              return;
            }
          }

          if (doc.exists && doc.data() && Object.keys(doc.data()).length > 0) {
            const rules = doc.data();
            state.commissionRules = rules;
            safeSetItem('abc_commission_rules', JSON.stringify(rules));
            if (state.activeView === 'view-settings') {
              renderPerformance();
            }
          }
        });
      };


      // 1. One-time Migration check
      db.collection('users').limit(1).get().then(snap => {
        if (snap.empty) {
          console.log("Firestore database is empty. Running initial migration...");
          
          const promises = [];
          const migrateCollection = (colName, items, idKey) => {
            items.forEach(item => {
              const id = item[idKey];
              if (id) {
                const p = db.collection(colName).doc(id).set(item).catch(e => console.error(e));
                promises.push(p);
              }
            });
          };

          migrateCollection('users', state.users, 'id');
          migrateCollection('branches', state.branches, 'id');
          migrateCollection('customers', state.customers, 'id');
          migrateCollection('products', state.products, 'sku');
          migrateCollection('staff', state.staff, 'id');
          migrateCollection('transactions', state.transactions, 'id');
          migrateCollection('expenses', state.expenses, 'id');
          migrateCollection('stock_logs', state.stockLogs, 'id');
          migrateCollection('payment_logs', state.paymentLogs, 'id');
          migrateCollection('followups', state.followups, 'id');
          migrateCollection('employees', state.employees, 'id');
          migrateCollection('attendance', state.attendance, 'id');
          migrateCollection('leave_requests', state.leaveRequests, 'id');
          migrateCollection('companies', state.companies, 'id');
          migrateCollection('departments', state.departments, 'id');
          migrateCollection('teams', state.teams, 'id');
          migrateCollection('positions', state.positions, 'id');
          migrateCollection('payroll_items', state.payrollItems, 'id');
          migrateCollection('kpis', state.kpis, 'id');
          
          const pSettings = db.collection('company_settings').doc('global').set(state.companySettings).catch(e => console.error(e));
          promises.push(pSettings);
          const pCommRules = db.collection('company_settings').doc('commission_rules').set(state.commissionRules).catch(e => console.error(e));
          promises.push(pCommRules);


          Promise.all(promises).then(() => {
            console.log("Initial migration complete. Starting listeners...");
            startListeners(db);
          }).catch(err => {
            console.error("Migration promise all error:", err);
            startListeners(db);
          });
        } else {
          console.log("Firestore database already initialized. Starting listeners...");
          startListeners(db);
        }
      }).catch(err => {
        console.error("Firestore migration check error:", err);
        startListeners(db);
      });

    } catch (e) {
      console.error("Error initializing Firebase Sync:", e);
    }
  }

  function setupSettingsTabs() {
    const tabs = document.querySelectorAll('#settings-tabs .category-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.activeSettingTab = tab.getAttribute('data-setting');
        renderSettings();
      });
    });
  }

  function renderSettings() {
    try {
      const container = document.getElementById('settings-tab-content');
      if (!container) {
        console.error("settings-tab-content container element not found in DOM!");
        return;
      }
      container.innerHTML = '';

      const tab = state.activeSettingTab;
      console.log("Rendering settings for tab:", tab);

      if (tab === 'company') {
      // 1. Company details configuration form
      container.innerHTML = `
        <div class="settings-split-grid">
          
          <div class="glass-card">
            <div class="table-header">
              <h3 data-translate="company">Company Info</h3>
            </div>
            <form id="company-profile-form" style="padding: 16px;">
              <div class="form-group">
                <label>Company Name</label>
                <input type="text" class="form-control" id="c-name" required value="${state.companySettings.companyName || ''}">
              </div>
              <div class="checkout-method-grid" style="margin-bottom:0;">
                <div class="form-group">
                  <label>Business Email</label>
                  <input type="email" class="form-control" id="c-email" required value="${state.companySettings.email || ''}">
                </div>
                <div class="form-group">
                  <label>Business Phone</label>
                  <input type="text" class="form-control" id="c-phone" required value="${state.companySettings.phone || ''}">
                </div>
              </div>
              <div class="form-group">
                <label>Office Address</label>
                <input type="text" class="form-control" id="c-address" required value="${state.companySettings.address || ''}">
              </div>
              
              <div class="checkout-method-grid" style="margin-bottom:0; margin-top:20px;">
                <div class="form-group">
                  <label>Default VAT Rate (%)</label>
                  <input type="number" class="form-control" id="c-vat" required value="${state.companySettings.defaultVatRate !== undefined ? state.companySettings.defaultVatRate : 10}">
                </div>
                <div class="form-group">
                  <label>Invoice Prefix</label>
                  <input type="text" class="form-control" id="c-prefix" required value="${state.companySettings.invoicePrefix || 'INV-2026-'}">
                </div>
                <div class="form-group">
                  <label>Currency</label>
                  <select class="form-control" id="c-currency">
                    <option value="USD" ${state.companySettings.currency === 'USD' ? 'selected' : ''}>USD ($)</option>
                    <option value="KHR" ${state.companySettings.currency === 'KHR' ? 'selected' : ''}>KHR (៛)</option>
                  </select>
                </div>
              </div>

              <div class="form-group" style="margin-top:20px;">
                <label>Starting Capital ($)</label>
                <input type="number" class="form-control" id="c-starting-capital" required min="0" step="any" value="${state.companySettings.startingCapital !== undefined ? state.companySettings.startingCapital : 10000}">
              </div>

              <hr style="margin: 20px 0; border: 0; border-top: 1px solid rgba(255,255,255,0.15);">
              <h4 style="margin-bottom: 12px; font-weight: 600; color: var(--primary-light);" data-translate="telegramSettings">Telegram Bot Notification Settings</h4>
              
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 15px;">
                <div class="form-group" style="margin-bottom: 0;">
                  <label data-translate="telegramToken">Telegram Bot Token</label>
                  <input type="text" class="form-control" id="c-tg-token" placeholder="e.g. 123456:ABC-DEF..." value="${state.companySettings.telegramToken || ''}">
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label data-translate="telegramChatId">Telegram Chat ID</label>
                  <input type="text" class="form-control" id="c-tg-chatid" placeholder="e.g. -10012345678" value="${state.companySettings.telegramChatId || ''}">
                </div>
              </div>

              <button type="submit" class="btn btn-primary" style="width:100%; justify-content:center; padding:10px; font-weight:700; margin-top:10px;">Save Profile Settings</button>
            </form>
          </div>

          <div style="display:flex; flex-direction:column; gap:20px;">
            <div class="glass-card" style="padding:16px;">
              <div class="table-header" style="padding:0 0 14px 0; margin-bottom:14px;">
                <h3>Business Logo Upload</h3>
              </div>
              <div class="image-upload-zone" id="company-logo-zone" style="height: 140px;">
                <input type="file" id="c-logo-input" accept="image/*" style="display:none;">
                <div class="upload-placeholder" id="c-logo-placeholder" style="${state.companySettings.logoBase64 ? 'display:none;' : ''}">
                  <span>📸</span>
                  <span>Click to upload corporate logo image</span>
                </div>
                <img id="c-logo-preview" src="${state.companySettings.logoBase64 || ''}" style="${state.companySettings.logoBase64 ? 'display:block;' : 'display:none;'} max-height:100%; max-width:100%;">
              </div>
              ${state.companySettings.logoBase64 ? `<button class="btn btn-danger btn-sm" id="btn-remove-c-logo" style="width:100%; justify-content:center; margin-top:10px;">Remove Logo</button>` : ''}
            </div>

            <div class="glass-card" style="padding:16px;">
              <div class="table-header" style="padding:0 0 14px 0; margin-bottom:14px;">
                <h3 data-translate="paymentQrUpload">Upload Payment QR (ABA/KHQR)</h3>
              </div>
              <div class="image-upload-zone" id="company-khqr-zone" style="height: 140px;">
                <input type="file" id="c-khqr-input" accept="image/*" style="display:none;">
                <div class="upload-placeholder" id="c-khqr-placeholder" style="${state.companySettings.khqrBase64 ? 'display:none;' : ''}">
                  <span>📸</span>
                  <span data-translate="clickToUploadQr">Click to upload your custom KHQR</span>
                </div>
                <img id="c-khqr-preview" src="${state.companySettings.khqrBase64 || ''}" style="${state.companySettings.khqrBase64 ? 'display:block;' : 'display:none;'} max-height:100%; max-width:100%;">
              </div>
              ${state.companySettings.khqrBase64 ? `<button class="btn btn-danger btn-sm" id="btn-remove-c-khqr" style="width:100%; justify-content:center; margin-top:10px;" data-translate="removeQr">Remove QR</button>` : ''}
              <div style="font-size: 11px; color: var(--text-secondary); margin-top: 10px; line-height: 1.4;" data-translate="paymentQrHelp">
                If uploaded, this custom QR will be shown during checkout scanning instead of the simulated dynamic QR.
              </div>
            </div>
          </div>

        </div>
      `;

      // Set listener
      document.getElementById('company-profile-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if (!guardAction('edit')) return;
        state.companySettings.companyName = document.getElementById('c-name').value.trim();
        state.companySettings.email = document.getElementById('c-email').value.trim();
        state.companySettings.phone = document.getElementById('c-phone').value.trim();
        state.companySettings.address = document.getElementById('c-address').value.trim();
        const vatVal = document.getElementById('c-vat').value.trim();
        state.companySettings.defaultVatRate = vatVal !== '' ? parseInt(vatVal) : 10;
        state.companySettings.invoicePrefix = document.getElementById('c-prefix').value.trim();
        state.companySettings.currency = document.getElementById('c-currency').value;
        const capVal = document.getElementById('c-starting-capital').value.trim();
        state.companySettings.startingCapital = capVal !== '' ? parseFloat(capVal) : 10000;
        state.companySettings.telegramToken = document.getElementById('c-tg-token').value.trim();
        state.companySettings.telegramChatId = document.getElementById('c-tg-chatid').value.trim();

        saveStateToLocalStorage();
        alert('Company settings saved successfully!');
        updateUserCardHeader();
        updateCompanyLogoUI();
        renderDashboard();
        renderFinance();
      });

      const zone = document.getElementById('company-logo-zone');
      const input = document.getElementById('c-logo-input');
      const preview = document.getElementById('c-logo-preview');
      const placeholder = document.getElementById('c-logo-placeholder');

      zone.addEventListener('click', () => input.click());
      input.addEventListener('change', () => {
        const file = input.files[0];
        if (file) {
          compressProductImage(file, (base64) => {
            state.companySettings.logoBase64 = base64;
            preview.src = base64;
            preview.style.display = 'block';
            placeholder.style.display = 'none';
            saveStateToLocalStorage();
            updateCompanyLogoUI();
            renderSettings(); // redraw to show remove button
          });
        }
      });

      const removeBtn = document.getElementById('btn-remove-c-logo');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          state.companySettings.logoBase64 = '';
          saveStateToLocalStorage();
          updateCompanyLogoUI();
          renderSettings();
        });
      }

      // Company KHQR Upload Listeners
      const khqrZone = document.getElementById('company-khqr-zone');
      const khqrInput = document.getElementById('c-khqr-input');
      const khqrPreview = document.getElementById('c-khqr-preview');
      const khqrPlaceholder = document.getElementById('c-khqr-placeholder');

      if (khqrZone) {
        khqrZone.addEventListener('click', () => khqrInput.click());
      }
      if (khqrInput) {
        khqrInput.addEventListener('change', () => {
          const file = khqrInput.files[0];
          if (file) {
            compressProductImage(file, (base64) => {
              state.companySettings.khqrBase64 = base64;
              if (khqrPreview) {
                khqrPreview.src = base64;
                khqrPreview.style.display = 'block';
              }
              if (khqrPlaceholder) {
                khqrPlaceholder.style.display = 'none';
              }
              saveStateToLocalStorage();
              renderSettings(); // redraw to show remove button
            });
          }
        });
      }

      const removeKhqrBtn = document.getElementById('btn-remove-c-khqr');
      if (removeKhqrBtn) {
        removeKhqrBtn.addEventListener('click', () => {
          state.companySettings.khqrBase64 = '';
          saveStateToLocalStorage();
          renderSettings();
        });
      }

    } else if (tab === 'hr-bot') {
      container.innerHTML = `
        <div class="glass-card" style="padding: 24px; max-width: 600px; margin: 0 auto;">
          <div class="table-header" style="margin-bottom: 20px;">
            <h3 data-translate="hrSettings">HR & Telegram Bot Settings</h3>
          </div>
          <form id="hr-settings-form-master">
            <div class="form-group">
              <label data-translate="telegramToken">Telegram Bot Token</label>
              <input type="text" class="form-control" id="hr-settings-token-master" placeholder="Enter Bot Token from BotFather" value="${state.companySettings.hrTelegramBotToken || ''}">
              <small style="color: var(--text-muted); font-size: 11px;" data-translate="botTokenHelp">Used to receive location & selfie uploads and notify employees.</small>
            </div>
            <div class="form-group">
              <label data-translate="botUsername">Telegram Bot Username</label>
              <input type="text" class="form-control" id="hr-settings-username-master" placeholder="e.g. abc_attendance_bot" value="${state.companySettings.hrTelegramBotUsername || ''}">
            </div>
            <div class="form-group">
              <label data-translate="telegramGroupId">Telegram Group/Channel ID (for Admin Reports)</label>
              <input type="text" class="form-control" id="hr-settings-group-id-master" placeholder="e.g. -100123456789" value="${state.companySettings.hrTelegramGroupId || ''}">
              <small style="color: var(--text-muted); font-size: 11px;" data-translate="groupIdHelp">Add Bot as Admin to the group, get Chat ID starting with minus (-), e.g. -100123456789</small>
            </div>
            
            <div class="form-group" style="margin-top: 15px; margin-bottom: 15px;">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; cursor: pointer;">
                <input type="checkbox" id="hr-settings-location-check-master" ${state.companySettings.hrLocationCheckEnabled !== false ? 'checked' : ''}>
                <span data-translate="enableGpsCheck">Enable GPS Location Check</span>
              </label>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div class="form-group">
                <label data-translate="latitude">Office Latitude</label>
                <input type="number" step="any" class="form-control" id="hr-settings-lat-master" placeholder="e.g. 11.5564" value="${state.companySettings.hrOfficeLatitude || ''}">
              </div>
              <div class="form-group">
                <label data-translate="longitude">Office Longitude</label>
                <input type="number" step="any" class="form-control" id="hr-settings-lng-master" placeholder="e.g. 104.9282" value="${state.companySettings.hrOfficeLongitude || ''}">
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div class="form-group">
                <label data-translate="allowedRadius">Allowed Radius (meters)</label>
                <input type="number" class="form-control" id="hr-settings-radius-master" value="${state.companySettings.hrOfficeRadius || '100'}">
              </div>
              <div class="form-group">
                <label data-translate="workHours">Work Shift Hours</label>
                <div style="display: flex; gap: 8px; align-items: center;">
                  <input type="time" class="form-control" id="hr-settings-start-master" value="${state.companySettings.hrWorkStart || '08:00'}" style="padding: 6px;">
                  <span style="color:var(--text-muted); font-weight:bold;">-</span>
                  <input type="time" class="form-control" id="hr-settings-end-master" value="${state.companySettings.hrWorkEnd || '17:00'}" style="padding: 6px;">
                </div>
              </div>
            </div>

            <!-- Telegram Webhook Registration Help -->
            <div class="form-group" style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); margin-top: 10px;">
              <label style="margin-bottom:4px; font-weight:700;" data-translate="botUrl">Webhook URL</label>
              <div style="display: flex; gap: 8px;">
                <input type="text" class="form-control" id="hr-settings-webhook-url-master" readonly style="background: rgba(0,0,0,0.2);" value="${window.location.origin + '/api/bot'}">
                <button type="button" class="btn btn-outline" id="btn-copy-webhook-master" style="min-height:auto; padding: 6px 12px; font-size:12px;">Copy</button>
                <button type="button" class="btn btn-primary" id="btn-register-webhook-master" style="min-height:auto; padding: 6px 12px; font-size:12px;" data-translate="registerWebhook">Set Webhook</button>
              </div>
              <small style="color: var(--text-muted); font-size: 11px; display:block; margin-top:6px;">
                Copy this Webhook URL and register it to your Telegram Bot by visiting:<br>
                <code style="color: var(--primary); font-family: monospace; font-size:10px; word-break: break-all;">https://api.telegram.org/bot&lt;Token&gt;/setWebhook?url=&lt;URL&gt;</code>
              </small>
            </div>

            <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
              <button type="submit" class="btn btn-primary" data-translate="save">Save Settings</button>
            </div>
          </form>
        </div>
      `;

      document.getElementById('hr-settings-form-master').addEventListener('submit', (e) => {
        e.preventDefault();
        if (!guardAction('edit')) return;
        const token = document.getElementById('hr-settings-token-master').value.trim();
        const username = document.getElementById('hr-settings-username-master').value.trim();
        const groupId = document.getElementById('hr-settings-group-id-master').value.trim();
        const locationCheckEnabled = document.getElementById('hr-settings-location-check-master').checked;
        const lat = parseFloat(document.getElementById('hr-settings-lat-master').value) || 0;
        const lng = parseFloat(document.getElementById('hr-settings-lng-master').value) || 0;
        const radius = parseInt(document.getElementById('hr-settings-radius-master').value) || 100;
        const start = document.getElementById('hr-settings-start-master').value;
        const end = document.getElementById('hr-settings-end-master').value;

        state.companySettings.hrTelegramBotToken = token;
        state.companySettings.hrTelegramBotUsername = username;
        state.companySettings.hrTelegramGroupId = groupId;
        state.companySettings.hrLocationCheckEnabled = locationCheckEnabled;
        state.companySettings.hrOfficeLatitude = lat;
        state.companySettings.hrOfficeLongitude = lng;
        state.companySettings.hrOfficeRadius = radius;
        state.companySettings.hrWorkStart = start;
        state.companySettings.hrWorkEnd = end;

        saveStateToLocalStorage();
        alert("HR and Bot configurations saved successfully!");
      });

      document.getElementById('btn-copy-webhook-master').addEventListener('click', () => {
        const urlInput = document.getElementById('hr-settings-webhook-url-master');
        if (urlInput) {
          urlInput.select();
          document.execCommand('copy');
          alert('Webhook URL copied to clipboard!');
        }
      });

      document.getElementById('btn-register-webhook-master').addEventListener('click', () => {
        const token = document.getElementById('hr-settings-token-master').value.trim();
        const webhookUrl = document.getElementById('hr-settings-webhook-url-master').value.trim();
        if (!token) {
          alert(state.lang === 'km' ? 'សូមបញ្ចូល Telegram Bot Token ជាមុនសិន!' : 'Please enter the Telegram Bot Token first!');
          return;
        }
        
        const registerUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
        window.open(registerUrl, '_blank');
      });

      translateApp();

    } else if (tab === 'users') {
      // 2. Users CRUD List
      let userRows = '';
      state.users.forEach((u, idx) => {
        const br = state.branches.find(b => b.id === u.branchId);
        const brName = br ? (state.lang === 'km' ? br.nameKh : br.name) : (u.branchId === 'all' ? 'All Branches' : 'HQ');
        const roleTranslate = window.POS_TRANSLATIONS[state.lang][u.role] || u.role;
        const statusClass = u.status === 'active' ? 'badge-success' : 'badge-danger';
        const statusTranslate = u.status === 'active' ? (state.lang === 'km' ? 'ដំណើរការ' : 'Active') : (state.lang === 'km' ? 'ផ្អាក' : 'Suspended');

        userRows += `
          <tr>
            <td><strong>${u.id}</strong></td>
            <td><strong>${u.username}</strong></td>
            <td>${u.name}</td>
            <td><span class="badge badge-success">${roleTranslate}</span></td>
            <td><span class="badge badge-warning">${brName}</span></td>
            <td>${u.position || '-'}</td>
            <td><span class="badge ${statusClass}">${statusTranslate}</span></td>
            <td>
              <button class="btn btn-outline btn-sm btn-edit-user" data-idx="${idx}" style="padding:2px 6px;">✏️</button>
              <button class="btn btn-danger btn-sm btn-del-user" data-idx="${idx}" style="padding:2px 6px;">🗑️</button>
            </td>
          </tr>
        `;
      });

      let brOpts = '<option value="all">All Branches</option>';
      state.branches.forEach(b => {
        brOpts += `<option value="${b.id}">${state.lang === 'km' ? b.nameKh : b.name}</option>`;
      });

      container.innerHTML = `
        <div class="settings-split-grid">
          
          <div class="glass-card">
            <div class="table-header">
              <h3 data-translate="usersList">Users List</h3>
            </div>
            <div class="table-responsive">
              <table class="pos-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Username</th>
                    <th>Fullname</th>
                    <th>Role</th>
                    <th>Branch</th>
                    <th>Position</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${userRows || `<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">${window.POS_TRANSLATIONS[state.lang].noData}</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>

          <div class="glass-card">
            <div class="table-header">
              <h3 id="user-card-title">Add New User</h3>
            </div>
            <form id="user-form" style="padding: 16px;">
              <input type="hidden" id="user-edit-idx">
              <div class="form-group">
                <label>Full Name</label>
                <input type="text" class="form-control" id="u-name" required placeholder="User Fullname">
              </div>
              <div class="form-group">
                <label>Branch Assignment</label>
                <select class="form-control" id="u-branch">${brOpts}</select>
              </div>
              <div class="checkout-method-grid" style="margin-bottom:0;">
                <div class="form-group">
                  <label>Username</label>
                  <input type="text" class="form-control" id="u-user" required placeholder="Username">
                </div>
                <div class="form-group">
                  <label>Password</label>
                  <input type="password" class="form-control" id="u-pass" required placeholder="Password">
                </div>
              </div>
              <div class="checkout-method-grid" style="margin-bottom:0; margin-top:14px;">
                <div class="form-group">
                  <label>Position</label>
                  <input type="text" class="form-control" id="u-position" required placeholder="e.g. Cashier, Manager">
                </div>
                <div class="form-group">
                  <label>Status</label>
                  <select class="form-control" id="u-status">
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>
              <div class="form-group" style="margin-top:14px;">
                <label>System Role</label>
                <select class="form-control" id="u-role">
                  <option value="super_admin">Super Admin</option>
                  <option value="branch_admin">Branch Admin</option>
                  <option value="sales_staff">Sales Staff</option>
                  <option value="warehouse_staff">Warehouse Staff</option>
                  <option value="accountant">Accountant</option>
                </select>
              </div>
              <button type="submit" class="btn btn-primary" style="width:100%; justify-content:center; padding:10px; font-weight:700; margin-top:10px;">Save User</button>
            </form>
          </div>

        </div>
      `;

      // Handlers
      container.querySelectorAll('.btn-edit-user').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!guardAction('edit')) return;
          const idx = btn.getAttribute('data-idx');
          const u = state.users[idx];

          document.getElementById('user-card-title').innerText = 'Edit User';
          document.getElementById('user-edit-idx').value = idx;
          document.getElementById('u-name').value = u.name;
          document.getElementById('u-branch').value = u.branchId;
          document.getElementById('u-user').value = u.username;
          document.getElementById('u-pass').value = u.password;
          document.getElementById('u-role').value = u.role;
          document.getElementById('u-position').value = u.position || '';
          document.getElementById('u-status').value = u.status || 'active';
        });
      });

      container.querySelectorAll('.btn-del-user').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!guardAction('delete')) return;
          const idx = btn.getAttribute('data-idx');
          const u = state.users[idx];
          if (u.id === 'USR-001') {
            alert('Cannot delete primary Executive super admin account!');
            return;
          }
          if (confirm(window.POS_TRANSLATIONS[state.lang].confirmDelete)) {
            state.users.splice(idx, 1);
            saveStateToLocalStorage();
            renderSettings();
          }
        });
      });

      container.querySelector('#user-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const idx = document.getElementById('user-edit-idx').value;
        const name = document.getElementById('u-name').value.trim();
        const branchId = document.getElementById('u-branch').value;
        const username = document.getElementById('u-user').value.trim();
        const password = document.getElementById('u-pass').value;
        const role = document.getElementById('u-role').value;
        const position = document.getElementById('u-position').value.trim();
        const status = document.getElementById('u-status').value;

        // Custom permissions mapping based on roles
        const perms = { view: true, add: true, edit: false, delete: false, export: false, approve: false };
        if (role === 'super_admin') {
          perms.edit = true; perms.delete = true; perms.export = true; perms.approve = true;
        } else if (role === 'branch_admin' || role === 'accountant') {
          perms.edit = true; perms.export = true; perms.approve = true;
        } else if (role === 'warehouse_staff') {
          perms.edit = true; perms.export = true;
        }

        if (idx !== '') {
          if (!guardAction('edit')) return;
          state.users[idx].name = name;
          state.users[idx].branchId = branchId;
          state.users[idx].username = username;
          state.users[idx].password = password;
          state.users[idx].role = role;
          state.users[idx].permissions = perms;
          state.users[idx].position = position;
          state.users[idx].status = status;
        } else {
          if (!guardAction('add')) return;
          const newId = 'USR-' + String(state.users.length + 1).padStart(3, '0');
          state.users.push({ id: newId, name, branchId, username, password, role, permissions: perms, position, status });
        }

        saveStateToLocalStorage();
        renderSettings();
      });

    } else if (tab === 'features') {
      const features = state.companySettings.featuresEnabled || {};
      const modules = [
        { key: 'pos', name: 'Billing POS (ផ្នែកលក់)' },
        { key: 'inventory', name: 'Inventory & Products (ទំនិញ/ស្តុក)' },
        { key: 'branches', name: 'Multi-Branch (គ្រប់គ្រងសាខា)' },
        { key: 'customers', name: 'Customer CRM (អតិថិជន)' },
        { key: 'followups', name: 'Auto Follow-Ups (តាមដាន)' },
        { key: 'performance', name: 'Sales Performance (សមិទ្ធផលលក់)' },
        { key: 'finance', name: 'Financial Ledger (ហិរញ្ញវត្ថុ)' },
        { key: 'staff', name: 'Staff & Payroll (បុគ្គលិក/ប្រាក់ខែ)' },
        { key: 'reports', name: 'Reports & Analytics (របាយការណ៍)' },
        { key: 'capital', name: 'Capital Tracking & Balance (ដើមទុនដំបូង & សមតុល្យ)' }
      ];

      let checkboxesHtml = '';
      modules.forEach(m => {
        const checked = features[m.key] !== false ? 'checked' : '';
        checkboxesHtml += `
          <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; font-size:12px; cursor:pointer;">
            <input type="checkbox" class="feature-toggle-checkbox" data-feature="${m.key}" ${checked}>
            <span>${m.name}</span>
          </label>
        `;
      });

      const roles = ['branch_admin', 'sales_staff', 'warehouse_staff', 'accountant'];
      const roleNames = {
        branch_admin: 'Branch Admin',
        sales_staff: 'Sales Staff',
        warehouse_staff: 'Warehouse Staff',
        accountant: 'Accountant'
      };
      const actions = ['view', 'add', 'edit', 'delete', 'export', 'approve'];

      let matrixRows = '';
      roles.forEach(role => {
        let cells = '';
        const rolePerms = state.companySettings.rolePermissions?.[role] || { view: true, add: true, edit: false, delete: false, export: false, approve: false };
        
        actions.forEach(act => {
          const checked = rolePerms[act] ? 'checked' : '';
          cells += `
            <td style="text-align:center;">
              <input type="checkbox" class="perm-matrix-checkbox" data-role="${role}" data-action="${act}" ${checked}>
            </td>
          `;
        });

        matrixRows += `
          <tr>
            <td><strong>${roleNames[role]}</strong></td>
            ${cells}
          </tr>
        `;
      });

      container.innerHTML = `
        <div class="settings-split-grid">
          
          <div class="glass-card" style="padding:16px;">
            <div class="table-header" style="padding:0 0 12px 0; margin-bottom:12px;">
              <h3>Enable/Disable System Modules</h3>
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${checkboxesHtml}
            </div>
            <button class="btn btn-primary" id="btn-save-features" style="width:100%; justify-content:center; margin-top:16px; padding:10px; font-weight:700;">Save Active Modules</button>
          </div>

          <div class="glass-card" style="padding:16px;">
            <div class="table-header" style="padding:0 0 12px 0; margin-bottom:12px;">
              <h3>Custom Role Permissions Matrix</h3>
            </div>
            <div class="table-responsive">
              <table class="pos-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th style="text-align:center;">View</th>
                    <th style="text-align:center;">Add</th>
                    <th style="text-align:center;">Edit</th>
                    <th style="text-align:center;">Delete</th>
                    <th style="text-align:center;">Export</th>
                    <th style="text-align:center;">Approve</th>
                  </tr>
                </thead>
                <tbody>
                  ${matrixRows}
                </tbody>
              </table>
            </div>
            <button class="btn btn-secondary" id="btn-save-permissions" style="width:100%; justify-content:center; margin-top:16px; padding:10px; font-weight:700;">Save Permissions Matrix</button>
          </div>

        </div>
      `;

      document.getElementById('btn-save-features').addEventListener('click', () => {
        if (!state.companySettings.featuresEnabled) state.companySettings.featuresEnabled = {};
        container.querySelectorAll('.feature-toggle-checkbox').forEach(cb => {
          const feat = cb.getAttribute('data-feature');
          state.companySettings.featuresEnabled[feat] = cb.checked;
        });
        saveStateToLocalStorage();
        applyFeatureToggles();
        logAuditEvent('toggleFeature', `Administrator updated system modules list`);
        alert('Active modules configuration updated successfully!');
      });

      document.getElementById('btn-save-permissions').addEventListener('click', () => {
        if (!state.companySettings.rolePermissions) state.companySettings.rolePermissions = {};
        
        container.querySelectorAll('.perm-matrix-checkbox').forEach(cb => {
          const role = cb.getAttribute('data-role');
          const act = cb.getAttribute('data-action');
          if (!state.companySettings.rolePermissions[role]) {
            state.companySettings.rolePermissions[role] = {};
          }
          state.companySettings.rolePermissions[role][act] = cb.checked;
        });

        saveStateToLocalStorage();
        applyFeatureToggles();
        logAuditEvent('userPermissionChange', `Administrator modified role permissions matrix`);
        alert('Custom role permissions matrix saved successfully!');
      });

    } else if (tab === 'audit') {
      container.innerHTML = `
        <div class="glass-card" style="padding:16px;">
          <div class="table-header" style="padding:0 0 12px 0; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <h3>Security Audit Trail Ledger</h3>
            <input type="text" id="audit-log-search" class="form-control" placeholder="Search by Username, Event, or Details..." style="max-width:300px; padding:6px 12px;">
          </div>
          <div class="table-responsive" style="max-height: 460px; overflow-y:auto;">
            <table class="pos-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Username</th>
                  <th>Event Type</th>
                  <th>Activity Details</th>
                </tr>
              </thead>
              <tbody id="audit-logs-table-body">
                <!-- Loaded dynamically -->
              </tbody>
            </table>
          </div>
        </div>
      `;

      const renderAuditRows = (query = '') => {
        const tbody = document.getElementById('audit-logs-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const q = query.toLowerCase().trim();
        const filtered = state.auditLogs.filter(log => {
          return !q || 
                 log.username.toLowerCase().includes(q) ||
                 log.actionType.toLowerCase().includes(q) ||
                 log.activityDetails.toLowerCase().includes(q) ||
                 log.timestamp.includes(q);
        }).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (filtered.length === 0) {
          tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No matching audit logs found.</td></tr>`;
          return;
        }

        filtered.forEach(log => {
          let badgeClass = 'badge-login';
          if (log.actionType.includes('sale') || log.actionType.includes('checkout') || log.actionType.includes('debt')) badgeClass = 'badge-sale';
          else if (log.actionType.includes('stock') || log.actionType.includes('replenish') || log.actionType.includes('transfer')) badgeClass = 'badge-stock';
          else if (log.actionType.includes('vat') || log.actionType.includes('Vat')) badgeClass = 'badge-vat';
          else if (log.actionType.includes('feature')) badgeClass = 'badge-feature';
          else if (log.actionType.includes('permission') || log.actionType.includes('User')) badgeClass = 'badge-permission';
          else if (log.actionType.includes('closing') || log.actionType.includes('close')) badgeClass = 'badge-closing';

          tbody.innerHTML += `
            <tr>
              <td style="font-size:10px; font-family:monospace; white-space:nowrap;">${window.POS_HELPERS.formatDate(log.timestamp, state.lang)}</td>
              <td><strong>${log.username}</strong></td>
              <td><span class="audit-log-badge ${badgeClass}">${log.actionType}</span></td>
              <td style="font-size:11px; color:var(--text-secondary);">${log.activityDetails}</td>
            </tr>
          `;
        });
      };

      renderAuditRows();

      const searchInput = document.getElementById('audit-log-search');
      searchInput.addEventListener('input', () => {
        renderAuditRows(searchInput.value);
      });

    } else if (tab === 'product-config') {
      // 3. Combined Categories, Brands & Units CRUD
      
      // 3a. Render Categories rows
      let catRows = '';
      state.categories.forEach((c, idx) => {
        catRows += `
          <tr>
            <td><strong>${c.id}</strong></td>
            <td><strong>${c.nameEn}</strong></td>
            <td>${c.nameKh}</td>
            <td>
              <button class="btn btn-outline btn-sm btn-edit-cat" data-idx="${idx}" style="padding:2px 6px;">✏️</button>
              <button class="btn btn-danger btn-sm btn-del-cat" data-idx="${idx}" style="padding:2px 6px;">🗑️</button>
            </td>
          </tr>
        `;
      });

      // 3b. Render Brands rows
      let brandRows = '';
      state.brands.forEach((b, idx) => {
        brandRows += `
          <tr>
            <td><strong>${b.id}</strong></td>
            <td><strong>${b.name}</strong></td>
            <td>
              <button class="btn btn-outline btn-sm btn-edit-brand" data-idx="${idx}" style="padding:2px 6px;">✏️</button>
              <button class="btn btn-danger btn-sm btn-del-brand" data-idx="${idx}" style="padding:2px 6px;">🗑️</button>
            </td>
          </tr>
        `;
      });

      // 3c. Render Units rows
      let unitRows = '';
      state.units.forEach((u, idx) => {
        unitRows += `
          <tr>
            <td><strong>${u.id}</strong></td>
            <td><strong>${u.name}</strong></td>
            <td>${u.nameKh}</td>
            <td>
              <button class="btn btn-outline btn-sm btn-edit-unit" data-idx="${idx}" style="padding:2px 6px;">✏️</button>
              <button class="btn btn-danger btn-sm btn-del-unit" data-idx="${idx}" style="padding:2px 6px;">🗑️</button>
            </td>
          </tr>
        `;
      });

      container.innerHTML = `
        <!-- CATEGORIES SECTION -->
        <div class="glass-card" style="padding:16px; margin-bottom:24px;">
          <div class="table-header" style="padding:0 0 12px 0; margin-bottom:16px; border-bottom:1px solid var(--border-color);">
            <h3 style="font-weight:800; color:var(--primary);">🗂️ Categories Management (គ្រប់គ្រងប្រភេទទំនិញ)</h3>
          </div>
          <div class="settings-split-grid">
            <div class="glass-card" style="margin-bottom:0;">
              <div class="table-header"><h3>Categories List</h3></div>
              <div class="table-responsive"><table class="pos-table"><thead><tr><th>ID</th><th>English Name</th><th>Khmer Name</th><th>Action</th></tr></thead><tbody>${catRows || `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">${window.POS_TRANSLATIONS[state.lang].noData}</td></tr>`}</tbody></table></div>
            </div>
            <div class="glass-card" style="margin-bottom:0;">
              <div class="table-header"><h3 id="cat-card-title">Add Category</h3></div>
              <form id="cat-form" style="padding: 16px;">
                <input type="hidden" id="cat-edit-idx">
                <div class="form-group">
                  <label>Category Code / ID</label>
                  <input type="text" class="form-control" id="cat-id" required placeholder="e.g. beverages">
                </div>
                <div class="form-group">
                  <label>Name (English)</label>
                  <input type="text" class="form-control" id="cat-en" required placeholder="e.g. Beverages">
                </div>
                <div class="form-group">
                  <label>Name (Khmer)</label>
                  <input type="text" class="form-control" id="cat-kh" required placeholder="ឧ. ភេសជ្ជៈ">
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%; justify-content:center; padding:10px; font-weight:700;">Save Category</button>
              </form>
            </div>
          </div>
        </div>

        <!-- BRANDS SECTION -->
        <div class="glass-card" style="padding:16px; margin-bottom:24px;">
          <div class="table-header" style="padding:0 0 12px 0; margin-bottom:16px; border-bottom:1px solid var(--border-color);">
            <h3 style="font-weight:800; color:var(--primary);">🏷️ Brands Management (គ្រប់គ្រងម៉ាកសញ្ញា)</h3>
          </div>
          <div class="settings-split-grid">
            <div class="glass-card" style="margin-bottom:0;">
              <div class="table-header"><h3>Brands List</h3></div>
              <div class="table-responsive"><table class="pos-table"><thead><tr><th>ID</th><th>Brand Name</th><th>Action</th></tr></thead><tbody>${brandRows || `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">${window.POS_TRANSLATIONS[state.lang].noData}</td></tr>`}</tbody></table></div>
            </div>
            <div class="glass-card" style="margin-bottom:0;">
              <div class="table-header"><h3 id="brand-card-title">Add Brand</h3></div>
              <form id="brand-form" style="padding: 16px;">
                <input type="hidden" id="brand-edit-idx">
                <div class="form-group">
                  <label>Brand Name</label>
                  <input type="text" class="form-control" id="brand-name" required placeholder="e.g. Coca-Cola">
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%; justify-content:center; padding:10px; font-weight:700;">Save Brand</button>
              </form>
            </div>
          </div>
        </div>

        <!-- UNITS SECTION -->
        <div class="glass-card" style="padding:16px; margin-bottom:10px;">
          <div class="table-header" style="padding:0 0 12px 0; margin-bottom:16px; border-bottom:1px solid var(--border-color);">
            <h3 style="font-weight:800; color:var(--primary);">📏 Units Management (គ្រប់គ្រងខ្នាតទំនិញ)</h3>
          </div>
          <div class="settings-split-grid">
            <div class="glass-card" style="margin-bottom:0;">
              <div class="table-header"><h3>Units List</h3></div>
              <div class="table-responsive"><table class="pos-table"><thead><tr><th>ID</th><th>Unit (En)</th><th>Unit (Kh)</th><th>Action</th></tr></thead><tbody>${unitRows || `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">${window.POS_TRANSLATIONS[state.lang].noData}</td></tr>`}</tbody></table></div>
            </div>
            <div class="glass-card" style="margin-bottom:0;">
              <div class="table-header"><h3 id="unit-card-title">Add Unit</h3></div>
              <form id="unit-form" style="padding: 16px;">
                <input type="hidden" id="unit-edit-idx">
                <div class="form-group">
                  <label>Unit Name (English)</label>
                  <input type="text" class="form-control" id="unit-name-en" required placeholder="e.g. Box">
                </div>
                <div class="form-group">
                  <label>Unit Name (Khmer)</label>
                  <input type="text" class="form-control" id="unit-name-kh" required placeholder="ឧ. កេស">
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%; justify-content:center; padding:10px; font-weight:700;">Save Unit</button>
              </form>
            </div>
          </div>
        </div>
      `;

      // 3d. Set Handlers for Categories
      container.querySelectorAll('.btn-edit-cat').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!guardAction('edit')) return;
          const idx = btn.getAttribute('data-idx');
          const c = state.categories[idx];
          document.getElementById('cat-card-title').innerText = 'Edit Category';
          document.getElementById('cat-edit-idx').value = idx;
          document.getElementById('cat-id').value = c.id;
          document.getElementById('cat-id').disabled = true;
          document.getElementById('cat-en').value = c.nameEn;
          document.getElementById('cat-kh').value = c.nameKh;
        });
      });

      container.querySelectorAll('.btn-del-cat').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!guardAction('delete')) return;
          const idx = btn.getAttribute('data-idx');
          if (confirm(window.POS_TRANSLATIONS[state.lang].confirmDelete)) {
            state.categories.splice(idx, 1);
            saveStateToLocalStorage();
            renderSettings();
          }
        });
      });

      container.querySelector('#cat-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const idx = document.getElementById('cat-edit-idx').value;
        const id = document.getElementById('cat-id').value.trim();
        const nameEn = document.getElementById('cat-en').value.trim();
        const nameKh = document.getElementById('cat-kh').value.trim();

        if (idx !== '') {
          if (!guardAction('edit')) return;
          state.categories[idx].nameEn = nameEn;
          state.categories[idx].nameKh = nameKh;
        } else {
          if (!guardAction('add')) return;
          if (state.categories.some(c => c.id === id)) {
            alert('Category Code/ID already exists!');
            return;
          }
          state.categories.push({ id, nameEn, nameKh });
        }

        saveStateToLocalStorage();
        renderSettings();
        populateProductDropdowns();
        renderPOS();
      });

      // 3e. Set Handlers for Brands
      container.querySelectorAll('.btn-edit-brand').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!guardAction('edit')) return;
          const idx = btn.getAttribute('data-idx');
          const b = state.brands[idx];
          document.getElementById('brand-card-title').innerText = 'Edit Brand';
          document.getElementById('brand-edit-idx').value = idx;
          document.getElementById('brand-name').value = b.name;
        });
      });

      container.querySelectorAll('.btn-del-brand').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!guardAction('delete')) return;
          const idx = btn.getAttribute('data-idx');
          if (confirm(window.POS_TRANSLATIONS[state.lang].confirmDelete)) {
            state.brands.splice(idx, 1);
            saveStateToLocalStorage();
            renderSettings();
          }
        });
      });

      container.querySelector('#brand-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const idx = document.getElementById('brand-edit-idx').value;
        const name = document.getElementById('brand-name').value.trim();

        if (idx !== '') {
          if (!guardAction('edit')) return;
          state.brands[idx].name = name;
        } else {
          if (!guardAction('add')) return;
          const newId = 'BR-' + String(state.brands.length + 1).padStart(3, '0');
          state.brands.push({ id: newId, name });
        }

        saveStateToLocalStorage();
        renderSettings();
        populateProductDropdowns();
      });

      // 3f. Set Handlers for Units
      container.querySelectorAll('.btn-edit-unit').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!guardAction('edit')) return;
          const idx = btn.getAttribute('data-idx');
          const u = state.units[idx];
          document.getElementById('unit-card-title').innerText = 'Edit Unit';
          document.getElementById('unit-edit-idx').value = idx;
          document.getElementById('unit-name-en').value = u.name;
          document.getElementById('unit-name-kh').value = u.nameKh;
        });
      });

      container.querySelectorAll('.btn-del-unit').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!guardAction('delete')) return;
          const idx = btn.getAttribute('data-idx');
          if (confirm(window.POS_TRANSLATIONS[state.lang].confirmDelete)) {
            state.units.splice(idx, 1);
            saveStateToLocalStorage();
            renderSettings();
          }
        });
      });

      container.querySelector('#unit-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const idx = document.getElementById('unit-edit-idx').value;
        const name = document.getElementById('unit-name-en').value.trim();
        const nameKh = document.getElementById('unit-name-kh').value.trim();

        if (idx !== '') {
          if (!guardAction('edit')) return;
          state.units[idx].name = name;
          state.units[idx].nameKh = nameKh;
        } else {
          if (!guardAction('add')) return;
          const newId = 'UN-' + String(state.units.length + 1).padStart(3, '0');
          state.units.push({ id: newId, name, nameKh });
        }

        saveStateToLocalStorage();
        renderSettings();
        populateProductDropdowns();
      });

    } else if (tab === 'backup') {
      // 6. Database backup and restore JSON
      container.innerHTML = `
        <div class="settings-split-grid">
          
          <div class="glass-card" style="padding:16px;">
            <div class="table-header" style="padding:0 0 14px 0; margin-bottom:14px;">
              <h3 data-translate="backupRestore">Backup & Restore DB</h3>
            </div>
            <p style="font-size:12px; color:var(--text-secondary); line-height:1.5; margin-bottom:20px;">
              Export all system settings, databases (products, sales log, customers history, employee records, warehouses) into a single secure local JSON file backup, or upload an existing backup to restore database instantly.
            </p>
            <button class="btn btn-primary" id="btn-export-db" style="width:100%; justify-content:center; padding:12px; font-weight:700; margin-bottom:14px;" data-translate="backupBtn">Export Database Backup (JSON)</button>
          </div>

          <div class="glass-card" style="padding:16px;">
            <div class="table-header" style="padding:0 0 14px 0; margin-bottom:14px;">
              <h3 data-translate="restoreBtn">Import Database Restore (JSON)</h3>
            </div>
            <div style="border: 2px dashed var(--border-color); border-radius:var(--radius-md); padding:24px; text-align:center; cursor:pointer; background:var(--input-bg);" id="db-restore-upload-zone">
              <input type="file" id="db-restore-input" accept="application/json" style="display:none;">
              <span style="font-size:32px;">📥</span>
              <p style="font-size:11px; color:var(--text-secondary); margin-top:8px;" data-translate="restoreBtn">Import Database Restore (JSON)</p>
            </div>
          </div>

          <div class="glass-card" style="padding:16px; border: 1px solid rgba(16, 185, 129, 0.2); background: rgba(16, 185, 129, 0.02);">
            <div class="table-header" style="padding:0 0 14px 0; margin-bottom:14px; border-bottom:1px solid rgba(16, 185, 129, 0.15);">
              <h3 style="color: var(--success);" data-translate="seedDemoTitle">Seed Demo & HR Data</h3>
            </div>
            <p style="font-size:12px; color:var(--text-secondary); line-height:1.5; margin-bottom:20px;" data-translate="seedDemoDesc">
              Instantly populate the system with a complete set of mock products, sales transactions, employees, departments, and attendance logs for demonstration and testing.
            </p>
            <button class="btn btn-success" id="btn-seed-demo-data" style="width:100%; justify-content:center; padding:12px; font-weight:700;" data-translate="seedDemoBtn">
              Load Demo & HR Data
            </button>
          </div>

          <div class="glass-card" style="padding:16px; border: 1px solid rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.02);">
            <div class="table-header" style="padding:0 0 14px 0; margin-bottom:14px; border-bottom:1px solid rgba(239, 68, 68, 0.15);">
              <h3 style="color: var(--danger);" data-translate="cleanSystemTitle">Clean & Initialize Production DB</h3>
            </div>
            <p style="font-size:12px; color:var(--text-secondary); line-height:1.5; margin-bottom:20px;">
              Permanently delete all sample test data (products, sales transactions, expense logs, staff, customers) to start using the system officially. Your Company Settings and Telegram config will be preserved.
            </p>
            <button class="btn btn-danger" id="btn-reset-prod" style="width:100%; justify-content:center; padding:12px; font-weight:700;">
              Initialize Clean System
            </button>
          </div>

        </div>
      `;

      // Set handlers
      document.getElementById('btn-seed-demo-data').addEventListener('click', async () => {
        if (!guardAction('add')) return;
        const confirmMsg = state.lang === 'km' 
          ? 'តើអ្នកពិតជាចង់បញ្ចូលទិន្នន័យគំរូ និងធនធានមនុស្សមែនទេ? ទិន្នន័យចាស់ទាំងអស់នឹងត្រូវបានជំនួស!' 
          : 'Are you sure you want to load the demo database? All existing data will be overwritten!';
        if (!confirm(confirmMsg)) return;

        const btn = document.getElementById('btn-seed-demo-data');
        const originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = state.lang === 'km' ? 'កំពុងបញ្ចូលទិន្នន័យ... សូមរង់ចាំ' : 'Seeding database... Please wait';

        try {
          // 1. Core POS & Config Seeding
          state.users = JSON.parse(JSON.stringify(window.POS_DUMMY_DATA.users));
          state.branches = JSON.parse(JSON.stringify(window.POS_DUMMY_DATA.branches));
          state.customers = JSON.parse(JSON.stringify(window.POS_DUMMY_DATA.customers));
          state.brands = JSON.parse(JSON.stringify(window.POS_DUMMY_DATA.brands));
          state.units = JSON.parse(JSON.stringify(window.POS_DUMMY_DATA.units));
          state.categories = JSON.parse(JSON.stringify(window.POS_DUMMY_DATA.categories));
          state.products = JSON.parse(JSON.stringify(window.POS_DUMMY_DATA.products));
          state.staff = JSON.parse(JSON.stringify(window.POS_DUMMY_DATA.staff));
          state.transactions = JSON.parse(JSON.stringify(window.POS_DUMMY_DATA.transactions));
          state.expenses = JSON.parse(JSON.stringify(window.POS_DUMMY_DATA.expenses));
          state.stockLogs = JSON.parse(JSON.stringify(window.POS_DUMMY_DATA.stockLogs));
          state.paymentLogs = JSON.parse(JSON.stringify(window.POS_DUMMY_DATA.paymentLogs));
          state.followups = JSON.parse(JSON.stringify(window.POS_DUMMY_DATA.followups));
          state.commissionRules = JSON.parse(JSON.stringify(window.POS_DUMMY_DATA.commissionRules));
          
          // Preserving settings but merging features/logo if empty
          state.companySettings.companyName = state.companySettings.companyName || "ABC System";
          state.companySettings.currency = state.companySettings.currency || "USD";
          state.companySettings.defaultVatRate = state.companySettings.defaultVatRate !== undefined ? state.companySettings.defaultVatRate : 10;
          state.companySettings.invoicePrefix = state.companySettings.invoicePrefix || "INV-2026-";
          state.companySettings.startingCapital = state.companySettings.startingCapital || 15000;
          state.companySettings.featuresEnabled = JSON.parse(JSON.stringify(window.POS_DUMMY_DATA.companySettings.featuresEnabled));

          // 2. Default HR Data Seeding
          state.companies = [
            { id: "COM-001", name: "ABC System", phone: "+855 (0) 23 999 555", email: "info@aroma-business.com.kh", address: "St. 310, BKK1, Phnom Penh, Cambodia", status: "active" }
          ];
          state.departments = [
            { id: "DEP-001", companyId: "COM-001", name: "Sales & Marketing", code: "SALES", manager: "Phnom Penh Manager" },
            { id: "DEP-002", companyId: "COM-001", name: "Operations & Inventory", code: "OPS", manager: "Kosal Stocks Keeper" },
            { id: "DEP-003", companyId: "COM-001", name: "Finance & Accounting", code: "FIN", manager: "Sreypich Lead Accountant" }
          ];
          state.teams = [
            { id: "TEM-001", departmentId: "DEP-001", name: "POS Sales Team A", leader: "Chantra POS Cashier" },
            { id: "TEM-002", departmentId: "DEP-002", name: "HQ Warehouse Team", leader: "Kosal Stocks Keeper" }
          ];
          state.positions = [
            { id: "POS-001", departmentId: "DEP-001", name: "Senior Cashier", rank: "Junior" },
            { id: "POS-002", departmentId: "DEP-002", name: "Inventory Controller", rank: "Senior" },
            { id: "POS-003", departmentId: "DEP-003", name: "Lead Accountant", rank: "Manager" }
          ];
          
          state.employees = [
            { id: "EMP-001", name: "Sokhom Phalla", gender: "Male", phone: "012-777-111", email: "phalla@abc.com", status: "active", positionId: "POS-001", teamId: "TEM-001", departmentId: "DEP-001", companyId: "COM-001", hireDate: "2026-01-15", baseSalary: 280, payType: "monthly", telegramUserId: "" },
            { id: "EMP-002", name: "Chanthou Pich", gender: "Female", phone: "099-333-222", email: "chanthou@abc.com", status: "active", positionId: "POS-001", teamId: "TEM-001", departmentId: "DEP-001", companyId: "COM-001", hireDate: "2026-02-10", baseSalary: 200, payType: "monthly", telegramUserId: "" },
            { id: "EMP-003", name: "Kosal Stocks", gender: "Male", phone: "088-555-333", email: "kosal@abc.com", status: "active", positionId: "POS-002", teamId: "TEM-002", departmentId: "DEP-002", companyId: "COM-001", hireDate: "2026-01-20", baseSalary: 350, payType: "monthly", telegramUserId: "" }
          ];

          state.attendance = [
            {
              id: "ATT-1001",
              employeeId: "EMP-001",
              employeeName: "Sokhom Phalla",
              date: "2026-06-15",
              checkIn: {
                time: "08:02:15",
                latitude: 11.5564,
                longitude: 104.9282,
                status: "on-time",
                selfieUrl: ""
              },
              checkOut: {
                time: "17:05:30",
                latitude: 11.5564,
                longitude: 104.9282,
                selfieUrl: ""
              },
              workingHours: 9.05,
              otHours: 1.05,
              status: "present"
            },
            {
              id: "ATT-1002",
              employeeId: "EMP-002",
              employeeName: "Chanthou Pich",
              date: "2026-06-15",
              checkIn: {
                time: "08:15:00",
                latitude: 11.5564,
                longitude: 104.9282,
                status: "late",
                selfieUrl: ""
              },
              checkOut: {
                time: "17:01:00",
                latitude: 11.5564,
                longitude: 104.9282,
                selfieUrl: ""
              },
              workingHours: 8.76,
              otHours: 0.76,
              status: "present"
            }
          ];

          state.leaveRequests = [
            { id: "LV-001", employeeId: "EMP-001", employeeName: "Sokhom Phalla", leaveType: "sick", startDate: "2026-06-18", endDate: "2026-06-19", durationDays: 2, reason: "Dental checkup and recovery", status: "approved", approvedBy: "admin", approvedDate: "2026-06-16" }
          ];

          state.payrollItems = [];
          state.kpis = [
            { id: "KPI-001", employeeId: "EMP-001", employeeName: "Sokhom Phalla", period: "2026-05", score: 85, evaluator: "admin", reviewDate: "2026-06-01", comments: "Great sales contribution and punctual attendance." }
          ];

          // 3. Save to local storage
          saveStateToLocalStorage();

          // 4. Push all to Firestore if active
          if (state.firebaseDb) {
            const db = state.firebaseDb;
            const uploadPromises = [];
            
            const pushCollection = (colName, list, idKey) => {
              list.forEach(item => {
                const id = item[idKey];
                if (id) {
                  const p = db.collection(colName).doc(id).set(item).catch(e => console.error(e));
                  uploadPromises.push(p);
                }
              });
            };

            pushCollection('users', state.users, 'id');
            pushCollection('branches', state.branches, 'id');
            pushCollection('customers', state.customers, 'id');
            pushCollection('brands', state.brands, 'id');
            pushCollection('units', state.units, 'id');
            pushCollection('categories', state.categories, 'id');
            pushCollection('products', state.products, 'sku');
            pushCollection('staff', state.staff, 'id');
            pushCollection('transactions', state.transactions, 'id');
            pushCollection('expenses', state.expenses, 'id');
            pushCollection('stock_logs', state.stockLogs, 'id');
            pushCollection('payment_logs', state.paymentLogs, 'id');
            pushCollection('followups', state.followups, 'id');
            pushCollection('employees', state.employees, 'id');
            pushCollection('attendance', state.attendance, 'id');
            pushCollection('leave_requests', state.leaveRequests, 'id');
            pushCollection('companies', state.companies, 'id');
            pushCollection('departments', state.departments, 'id');
            pushCollection('teams', state.teams, 'id');
            pushCollection('positions', state.positions, 'id');
            pushCollection('payroll_items', state.payrollItems, 'id');
            pushCollection('kpis', state.kpis, 'id');
            
            const pSettings = db.collection('company_settings').doc('global').set(state.companySettings).catch(e => console.error(e));
            uploadPromises.push(pSettings);
            const pCommRules = db.collection('company_settings').doc('commission_rules').set(state.commissionRules).catch(e => console.error(e));
            uploadPromises.push(pCommRules);


            await Promise.all(uploadPromises);
          }

          alert(window.POS_TRANSLATIONS[state.lang].seedSuccess || "Database seeded successfully!");
          window.location.reload();

        } catch (error) {
          console.error("Error seeding database:", error);
          alert("Error seeding database: " + error.message);
          btn.disabled = false;
          btn.innerText = originalText;
        }
      });

      document.getElementById('btn-export-db').addEventListener('click', () => {
        if (!guardAction('export')) return;
        const backupData = {};
        const keys = ['abc_users', 'abc_branches', 'abc_customers', 'abc_brands', 'abc_units', 'abc_categories', 'abc_products', 'abc_staff', 'abc_transactions', 'abc_expenses', 'abc_stock_logs', 'abc_payment_logs', 'abc_followups', 'abc_commission_rules', 'abc_company_settings', 'abc_voided_transactions'];
        
        keys.forEach(k => {
          backupData[k] = safeGetItem(k);
        });

        const blob = new Blob([JSON.stringify(backupData)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `ABC_DB_Backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });

      const zone = document.getElementById('db-restore-upload-zone');
      const input = document.getElementById('db-restore-input');
      
      zone.addEventListener('click', () => input.click());
      input.addEventListener('change', () => {
        if (!guardAction('add')) return;
        const file = input.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function(e) {
            try {
              const data = JSON.parse(e.target.result);
              for (const k in data) {
                if (k.startsWith('abc_')) {
                  safeSetItem(k, data[k]);
                }
              }
              alert(window.POS_TRANSLATIONS[state.lang].restoreSuccess);
              window.location.reload();
            } catch(err) {
              alert(window.POS_TRANSLATIONS[state.lang].restoreError);
            }
          };
          reader.readAsText(file);
        }
      });

      document.getElementById('btn-reset-prod').addEventListener('click', async () => {
        if (!guardAction('delete')) return;
        
        const confirmMsg = window.POS_TRANSLATIONS[state.lang].cleanSystemConfirm;
        if (!confirm(confirmMsg)) return;

        const btn = document.getElementById('btn-reset-prod');
        const originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = state.lang === 'km' ? 'កំពុងសម្អាតប្រព័ន្ធ... សូមរង់ចាំ' : 'Cleaning system... Please wait';

        try {
          // Preserve current settings
          const savedSettings = JSON.parse(JSON.stringify(state.companySettings));

          // Reset system state data
          state.transactions = [];
          state.expenses = [];
          state.stockLogs = [];
          state.paymentLogs = [];
          state.followups = [];
          state.staff = [];
          state.products = [];
          state.brands = [];
          state.voidedTransactions = [];
          state.closingLogs = [];
          state.auditLogs = [];

          // Reset HR states
          state.employees = [];
          state.attendance = [];
          state.leaveRequests = [];
          state.companies = [];
          state.departments = [];
          state.teams = [];
          state.positions = [];
          state.payrollItems = [];
          state.kpis = [];

          // Retain only General Customer (CST-001)
          state.customers = [
            { id: "CST-001", name: "General Customer", phone: "-", address: "-", source: "Walk-In", outstandingDebt: 0.00, status: "active", notes: "Default walking client", rank: "Bronze" }
          ];

          // Retain only Super Admin user
          state.users = [
            { id: "USR-001", username: "admin", password: "admin", role: "super_admin", name: "ABC Executive Super Admin", branchId: "BR-001", position: "Chief Executive Officer", status: "active", permissions: { view: true, add: true, edit: true, delete: true, export: true, approve: true } }
          ];

          // Retain only PP HQ branch
          state.branches = [
            { id: "BR-001", code: "B-PP", name: "Phnom Penh HQ", nameKh: "ទីស្នាក់ការកណ្តាល ភ្នំពេញ", address: "Veng Sreng Blvd, Phnom Penh", phone: "023-888-111", manager: "Super Admin", status: "active", startingCapital: savedSettings.startingCapital || 10000 }
          ];

          // Restore saved settings
          state.companySettings = savedSettings;

          // Save fresh state locally
          saveStateToLocalStorage();

          // Delete from Firebase if active and wait for completion before reload
          if (state.firebaseDb) {
            const db = state.firebaseDb;
            const collectionsToClean = [
              { name: 'users', keepId: 'USR-001' },
              { name: 'branches', keepId: 'BR-001' },
              { name: 'customers', keepId: 'CST-001' },
              { name: 'products' },
              { name: 'staff' },
              { name: 'transactions' },
              { name: 'expenses' },
              { name: 'stock_logs' },
              { name: 'payment_logs' },
              { name: 'followups' },
              { name: 'employees' },
              { name: 'attendance' },
              { name: 'leave_requests' },
              { name: 'companies' },
              { name: 'departments' },
              { name: 'teams' },
              { name: 'positions' },
              { name: 'payroll_items' },
              { name: 'kpis' }
            ];

            const deletePromises = collectionsToClean.map(async col => {
              const snap = await db.collection(col.name).get();
              const batch = db.batch();
              let count = 0;
              snap.forEach(doc => {
                if (col.keepId && doc.id === col.keepId) {
                  return;
                }
                batch.delete(doc.ref);
                count++;
              });
              if (count > 0) {
                await batch.commit();
              }
            });

            // Force update settings to global config on Firebase
            const settingsPromise = db.collection('company_settings').doc('global').set(state.companySettings);
            
            // Force write the kept records to Firestore to guarantee they exist and avoid empty collections triggering migration on other browsers
            const keepUsersPromise = db.collection('users').doc('USR-001').set(state.users[0]);
            const keepBranchesPromise = db.collection('branches').doc('BR-001').set(state.branches[0]);
            const keepCustomersPromise = db.collection('customers').doc('CST-001').set(state.customers[0]);
            
            await Promise.all([...deletePromises, settingsPromise, keepUsersPromise, keepBranchesPromise, keepCustomersPromise]);
          }

          alert(window.POS_TRANSLATIONS[state.lang].cleanSystemSuccess);
          window.location.reload();
        } catch (error) {
          console.error("Error cleaning production database:", error);
          alert("Error cleaning database: " + error.message);
          btn.disabled = false;
          btn.innerText = originalText;
        }
      });

    } else if (tab === 'firebase') {
      // Firebase Cloud Sync panel settings tab
      const isSyncActive = !!state.companySettings.firebaseEnabled;
      const statusText = isSyncActive 
        ? `<span style="color:#10b981; font-weight:700;">🟢 ${window.POS_TRANSLATIONS[state.lang].cloudConnected}</span>`
        : `<span style="color:var(--text-muted); font-weight:700;">🔴 ${window.POS_TRANSLATIONS[state.lang].cloudDisconnected}</span>`;

      container.innerHTML = `
        <div class="settings-split-grid">
          <div class="glass-card" style="padding:16px;">
            <div class="table-header" style="padding:0 0 14px 0; margin-bottom:14px;">
              <h3 data-translate="cloudSync">Cloud Database Sync (Firebase)</h3>
            </div>
            
            <form id="firebase-sync-form" style="display:flex; flex-direction:column; gap:16px;">
              <div class="form-group" style="display:flex; align-items:center; gap:10px; margin-bottom:0;">
                <input type="checkbox" id="fb-enabled" style="width:20px; height:20px; cursor:pointer;" ${isSyncActive ? 'checked' : ''}>
                <label for="fb-enabled" style="font-weight:700; cursor:pointer; margin-bottom:0;" data-translate="enableCloudSync">Enable Cloud Database Synchronization</label>
              </div>

              <div class="form-group" style="margin-bottom:0;">
                <label data-translate="firebaseConfig" style="font-weight:600;">Firebase Config JSON</label>
                <textarea class="form-control" id="fb-config" style="height: 180px; font-family: monospace; font-size: 12px; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); color:#fff; padding:10px;" placeholder='{\n  "apiKey": "...",\n  "authDomain": "...",\n  "projectId": "...",\n  "storageBucket": "...",\n  "messagingSenderId": "...",\n  "appId": "..."\n}' required>${state.companySettings.firebaseConfig || ''}</textarea>
                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 8px; line-height: 1.4;" data-translate="firebaseHelp">
                  Paste the web app configuration object JSON from your Firebase Console.
                </div>
              </div>

              <div style="margin: 10px 0; padding: 10px; border-radius: var(--radius-sm); background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); font-size:12px;">
                <span data-translate="cloudSyncStatus">Cloud Sync Status</span>: ${statusText}
              </div>

              <button type="submit" class="btn btn-primary" style="width:100%; justify-content:center; padding:12px; font-weight:700;">Save Sync Settings</button>
            </form>

            ${isSyncActive ? `
            <hr style="border:0; border-top:1px solid var(--border-color); margin:16px 0;">
            <div style="padding: 12px; background: rgba(59, 130, 246, 0.05); border: 1px dashed var(--secondary); border-radius: var(--radius-sm);">
              <h4 style="margin:0 0 6px 0; font-size:12.5px; font-weight:700; color:var(--secondary);" data-translate="manualMigrateTitle">${window.POS_TRANSLATIONS[state.lang].manualMigrateTitle || 'Push Local Data to Cloud'}</h4>
              <p style="margin:0 0 10px 0; font-size:11px; color:var(--text-secondary); line-height:1.4;" data-translate="manualMigrateHelp">${window.POS_TRANSLATIONS[state.lang].manualMigrateHelp || 'If you have existing products, transactions, or employee records on this device and want to upload them to Firestore for the first time, click the button below.'}</p>
              <button type="button" id="btn-migrate-local-to-cloud" class="btn btn-outline" style="width:100%; justify-content:center; padding:10px; font-weight:700; font-size:12px; border-color:var(--secondary); color:var(--secondary);">
                📤 Upload Local Data to Cloud
              </button>
            </div>
            ` : ''}
          </div>

          <div class="glass-card" style="padding:16px;">
            <div class="table-header" style="padding:0 0 14px 0; margin-bottom:14px;">
              <h3>Firebase Setup Instructions</h3>
            </div>
            <div style="font-size:12.5px; color:var(--text-secondary); line-height:1.6; display:flex; flex-direction:column; gap:10px;">
              <p>To enable real-time synchronization between multiple devices (mobile phones, tablets, or other computers):</p>
              <ol style="margin-left: 20px; display:flex; flex-direction:column; gap:6px;">
                <li>Go to the <a href="https://console.firebase.google.com/" target="_blank" style="color:var(--secondary); font-weight:700;">Firebase Console</a> and create a new project.</li>
                <li>Create a <b>Cloud Firestore</b> database in your project (choose <i>Test Mode</i> or production rules).</li>
                <li>Under project settings, register a new <b>Web App</b>.</li>
                <li>Copy the <code>firebaseConfig</code> config object JSON (everything inside the curly brackets <code>{ ... }</code>) and paste it into the input box on the left.</li>
                <li>Check the "Enable" box and click <b>Save Sync Settings</b>. The system will sync all data and reload.</li>
              </ol>
            </div>
          </div>
        </div>
      `;

      document.getElementById('firebase-sync-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if (!guardAction('edit')) return;

        const configStr = document.getElementById('fb-config').value.trim();
        const enabled = document.getElementById('fb-enabled').checked;

        // Simple validation of JSON config
        try {
          if (enabled && configStr) {
            JSON.parse(configStr);
          }
        } catch(err) {
          alert(state.lang === 'km' 
            ? 'ការកំណត់កូដ Firebase JSON មិនត្រឹមត្រូវទេ! សូមពិនិត្យមើលទ្រង់ទ្រាយ JSON ឡើងវិញ។' 
            : 'Invalid Firebase Config JSON format! Please check the structure and try again.');
          return;
        }

        state.companySettings.firebaseEnabled = enabled;
        state.companySettings.firebaseConfig = configStr;

        saveStateToLocalStorage();
        alert(state.lang === 'km' 
          ? 'បានរក្សាទុកការកំណត់ជោគជ័យ! ប្រព័ន្ធនឹង reload ឡើងវិញ។' 
          : 'Sync settings saved successfully! The app will now reload.');
        window.location.reload();
      });

      if (isSyncActive) {
        document.getElementById('btn-migrate-local-to-cloud').addEventListener('click', async () => {
          if (!guardAction('edit')) return;
          const confirmMsg = window.POS_TRANSLATIONS[state.lang].manualMigrateConfirm || "Are you sure you want to upload all local records from this browser to Firestore? This will merge/overwrite cloud records with the same IDs.";
          if (!confirm(confirmMsg)) return;

          const btn = document.getElementById('btn-migrate-local-to-cloud');
          const originalText = btn.innerHTML;
          btn.disabled = true;
          btn.innerText = state.lang === 'km' ? 'កំពុងបញ្ជូនទិន្នន័យ... សូមរង់ចាំ' : 'Uploading data... Please wait';

          try {
            const db = state.firebaseDb;
            if (!db) throw new Error("Firebase is not initialized");

            const collectionsToUpload = [
              { name: 'users', key: 'users', idKey: 'id' },
              { name: 'branches', key: 'branches', idKey: 'id' },
              { name: 'customers', key: 'customers', idKey: 'id' },
              { name: 'products', key: 'products', idKey: 'sku' },
              { name: 'staff', key: 'staff', idKey: 'id' },
              { name: 'transactions', key: 'transactions', idKey: 'id' },
              { name: 'expenses', key: 'expenses', idKey: 'id' },
              { name: 'stock_logs', key: 'stockLogs', idKey: 'id' },
              { name: 'payment_logs', key: 'paymentLogs', idKey: 'id' },
              { name: 'followups', key: 'followups', idKey: 'id' },
              { name: 'employees', key: 'employees', idKey: 'id' },
              { name: 'attendance', key: 'attendance', idKey: 'id' },
              { name: 'leave_requests', key: 'leaveRequests', idKey: 'id' },
              { name: 'companies', key: 'companies', idKey: 'id' },
              { name: 'departments', key: 'departments', idKey: 'id' },
              { name: 'teams', key: 'teams', idKey: 'id' },
              { name: 'positions', key: 'positions', idKey: 'id' },
              { name: 'payroll_items', key: 'payrollItems', idKey: 'id' },
              { name: 'kpis', key: 'kpis', idKey: 'id' }
            ];

            for (const col of collectionsToUpload) {
              const list = state[col.key];
              if (list && list.length > 0) {
                const chunks = [];
                for (let i = 0; i < list.length; i += 200) {
                  chunks.push(list.slice(i, i + 200));
                }
                for (const chunk of chunks) {
                  const batch = db.batch();
                  chunk.forEach(item => {
                    const id = item[col.idKey];
                    if (id) {
                      const docRef = db.collection(col.name).doc(id);
                      batch.set(docRef, item);
                    }
                  });
                  await batch.commit();
                }
              }
            }

            // Also set settings
            await db.collection('company_settings').doc('global').set(state.companySettings);
            await db.collection('company_settings').doc('commission_rules').set(state.commissionRules);


            alert(window.POS_TRANSLATIONS[state.lang].manualMigrateSuccess || "Successfully uploaded all local data collections to Firestore cloud sync database!");
            window.location.reload();
          } catch (error) {
            console.error("Migration error:", error);
            alert("Upload failed: " + error.message);
            btn.disabled = false;
            btn.innerHTML = originalText;
          }
        });
      }

    } else if (tab === 'docs') {
      // 7. Developer documentation schemas HTML representation
      container.innerHTML = `
        <div class="dev-doc-wrapper" style="color:var(--text-primary);">
          
          <h3 data-translate="docs" style="font-weight:800; font-size:16px;">ABC Developer Schema & REST API Reference</h3>
          <p style="font-size:12px; color:var(--text-secondary); margin-top:4px;">Enterprise-grade structures for backend database migrations.</p>

          <h4 data-translate="dbSchema">Database Entity Tables</h4>
          
          <div class="api-card">
            <h5 style="color:var(--secondary); font-size:12px;">Table 1: branches (សាខាសហគ្រាស)</h5>
            <pre>
CREATE TABLE branches (
  id VARCHAR(50) PRIMARY KEY, /* e.g. 'BR-001' */
  code VARCHAR(10) UNIQUE,     /* e.g. 'B-PP' */
  name VARCHAR(100),
  name_kh VARCHAR(100),
  address TEXT,
  phone VARCHAR(20),
  manager VARCHAR(100),
  status VARCHAR(20) DEFAULT 'active'
);
            </pre>
          </div>

          <div class="api-card">
            <h5 style="color:var(--secondary); font-size:12px;">Table 2: users (គណនីប្រើប្រាស់)</h5>
            <pre>
CREATE TABLE users (
  id VARCHAR(50) PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  role VARCHAR(50), /* super_admin, branch_admin, sales_staff, accountant */
  branch_id VARCHAR(50) REFERENCES branches(id),
  permissions JSON
);
            </pre>
          </div>

          <div class="api-card">
            <h5 style="color:var(--secondary); font-size:12px;">Table 3: products (ផលិតផលស្តុក)</h5>
            <pre>
CREATE TABLE products (
  sku VARCHAR(50) PRIMARY KEY,
  barcode VARCHAR(50) UNIQUE,
  name_en VARCHAR(150),
  name_kh VARCHAR(150),
  category VARCHAR(50),
  brand VARCHAR(50),
  unit VARCHAR(20),
  cost_price DECIMAL(10,2),
  selling_price DECIMAL(10,2),
  min_stock INT,
  image_base64 LONGTEXT,
  description TEXT,
  status VARCHAR(20) DEFAULT 'active'
);

CREATE TABLE branch_stock (
  product_sku VARCHAR(50) REFERENCES products(sku),
  branch_id VARCHAR(50) REFERENCES branches(id),
  quantity INT,
  PRIMARY KEY (product_sku, branch_id)
);
            </pre>
          </div>

          <div class="api-card">
            <h5 style="color:var(--secondary); font-size:12px;">Table 4: customers (អតិថិជន & CRM)</h5>
            <pre>
CREATE TABLE customers (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  source VARCHAR(50), /* Facebook Page, Walk-In, Website */
  outstanding_debt DECIMAL(10,2) DEFAULT 0.00,
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT,
  rank VARCHAR(20) DEFAULT 'Bronze' /* Bronze, Silver, Gold, Platinum */
);
            </pre>
          </div>

          <div class="api-card">
            <h5 style="color:var(--secondary); font-size:12px;">Table 5: sales (ប្រតិបត្តិការលក់)</h5>
            <pre>
CREATE TABLE sales (
  id VARCHAR(50) PRIMARY KEY,
  invoice_no VARCHAR(50) UNIQUE,
  date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  staff_id VARCHAR(50),
  customer_id VARCHAR(50) REFERENCES customers(id),
  branch_id VARCHAR(50) REFERENCES branches(id),
  subtotal DECIMAL(10,2),
  discount_percent DECIMAL(5,2),
  discount_fixed DECIMAL(10,2),
  shipping_fee DECIMAL(10,2),
  tax_rate DECIMAL(5,2),
  tax_amount DECIMAL(10,2),
  total DECIMAL(10,2),
  payment_method VARCHAR(20), /* cash, khqr, bank, card */
  cash_received DECIMAL(10,2),
  change_due DECIMAL(10,2),
  outstanding_debt DECIMAL(10,2),
  status VARCHAR(20) DEFAULT 'completed'
);

CREATE TABLE sale_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id VARCHAR(50) REFERENCES sales(id),
  product_sku VARCHAR(50) REFERENCES products(sku),
  price DECIMAL(10,2),
  qty INT,
  total DECIMAL(10,2)
);
            </pre>
          </div>

          <h4 data-translate="apiStructure">JSON REST API Structure</h4>

          <div class="api-card">
            <h5 style="color:var(--primary); font-size:12px;">POST /api/auth/login</h5>
            <p style="font-size:10px; color:var(--text-secondary); margin-top:2px;">Request Payload:</p>
            <pre>
{
  "username": "admin",
  "password": "password"
}
            </pre>
            <p style="font-size:10px; color:var(--text-secondary); margin-top:4px;">Response Response (200 OK):</p>
            <pre>
{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIsIn...",
  "user": {
    "id": "USR-001",
    "name": "Super Admin",
    "role": "super_admin",
    "branchId": "all"
  }
}
            </pre>
          </div>

          <div class="api-card">
            <h5 style="color:var(--primary); font-size:12px;">POST /api/sales/checkout</h5>
            <p style="font-size:10px; color:var(--text-secondary); margin-top:2px;">Request Payload:</p>
            <pre>
{
  "branchId": "BR-001",
  "staffId": "STF-001",
  "customerId": "CST-002",
  "items": [
    { "sku": "BEV-001", "qty": 5 },
    { "sku": "FOOD-002", "qty": 10 }
  ],
  "discountPercent": 5,
  "discountFixed": 0,
  "shippingFee": 1.5,
  "paymentMethod": "khqr",
  "cashReceived": 20.0
}
            </pre>
            <p style="font-size:10px; color:var(--text-secondary); margin-top:4px;">Response Response (201 Created):</p>
            <pre>
{
  "status": "success",
  "invoiceNo": "INV-2026-1004",
  "totalDue": 19.55,
  "outstandingDebt": 0.00,
  "followUpsCreated": true
}
            </pre>
          </div>

        </div>
      `;
    }

    translateApp();
  } catch (error) {
      console.error("Error rendering settings:", error);
      const container = document.getElementById('settings-tab-content');
      if (container) {
        container.innerHTML = `
          <div style="padding: 24px; color: #ef4444; background: rgba(239, 68, 68, 0.05); border: 1px dashed #ef4444; border-radius: var(--radius-md); margin: 20px 0; font-family: sans-serif;">
            <h4 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 700;">Error Loading Settings Page</h4>
            <p style="margin: 0 0 16px 0; font-size: 13px; color: var(--text-secondary); line-height: 1.5;">
              The system encountered an error while trying to render this settings panel: <strong>${error.message}</strong>
            </p>
             <button class="btn btn-danger" onclick="try { localStorage.clear(); sessionStorage.clear(); } catch(e) {} window.location.reload();" style="font-weight: 700; padding: 10px 16px; cursor: pointer;">
              Reset Database & Fix Storage
            </button>
          </div>
        `;
      }
    }
  }

  // 12. MASTER DIALOG FORMS EVENT LISTENERS
  function setupEventListeners() {
    // Toggle Follow-Up Retention Roadmap
    const btnToggleRoadmap = document.getElementById('btn-toggle-roadmap');
    if (btnToggleRoadmap) {
      btnToggleRoadmap.addEventListener('click', () => {
        state.hideFollowupRoadmap = !state.hideFollowupRoadmap;
        safeSetItem('abc_hide_followup_roadmap', state.hideFollowupRoadmap);
        updateRoadmapVisibility();
      });
    }
    // Toggle Password Visibility
    const btnTogglePassword = document.getElementById('btn-toggle-login-password');
    const loginPasswordInput = document.getElementById('login-password');
    if (btnTogglePassword && loginPasswordInput) {
      btnTogglePassword.addEventListener('click', () => {
        const type = loginPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        loginPasswordInput.setAttribute('type', type);
        
        // Toggle opacity and color of toggle button for active/inactive state feedback
        if (type === 'text') {
          btnTogglePassword.style.opacity = '1';
          btnTogglePassword.style.color = 'var(--primary)';
        } else {
          btnTogglePassword.style.opacity = '0.6';
          btnTogglePassword.style.color = 'var(--text-secondary)';
        }
      });
    }

    // Modal openers
    document.getElementById('btn-add-product-modal').addEventListener('click', () => {
      if (!guardAction('add')) return;
      document.getElementById('product-modal-title').innerText = window.POS_TRANSLATIONS[state.lang].addProduct;
      document.getElementById('product-form').reset();
      document.getElementById('product-edit-index').value = '';
      
      const preview = document.getElementById('prod-image-preview');
      const placeholder = document.getElementById('prod-image-placeholder');
      const removeBtn = document.getElementById('btn-remove-prod-image');
      preview.src = '';
      preview.style.display = 'none';
      placeholder.style.display = 'flex';
      removeBtn.style.display = 'none';
      state.selectedProductImageBase64 = null;

      populateProductDropdowns();

      document.getElementById('modal-product').classList.add('active-modal');
    });

    // Quick Add Category from product modal
    document.getElementById('btn-quick-add-category').addEventListener('click', () => {
      const nameEn = prompt(state.lang === 'km' ? "បញ្ចូលឈ្មោះក្រុមទំនិញ (ភាសាអង់គ្លេស) ៖" : "Enter Category Name (English):");
      if (!nameEn) return;
      const nameKh = prompt(state.lang === 'km' ? "បញ្ចូលឈ្មោះក្រុមទំនិញ (ភាសាខ្មែរ) ៖" : "Enter Category Name (Khmer):", nameEn);
      if (!nameKh) return;
      
      const id = nameEn.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
      if (state.categories.some(c => c.id === id)) {
        alert(state.lang === 'km' ? 'ក្រុមទំនិញនេះមានរួចហើយ!' : 'Category already exists!');
        return;
      }
      
      state.categories.push({ id, nameEn, nameKh });
      saveStateToLocalStorage();
      populateProductDropdowns();
      document.getElementById('prod-category').value = id;
      renderPOS(); // Refresh category tabs in POS
    });

    // Quick Add Brand from product modal
    document.getElementById('btn-quick-add-brand').addEventListener('click', () => {
      const name = prompt(state.lang === 'km' ? "បញ្ចូលឈ្មោះម៉ាកសញ្ញា ៖" : "Enter Brand Name:");
      if (!name) return;
      
      if (state.brands.some(b => b.name.toLowerCase() === name.toLowerCase())) {
        alert(state.lang === 'km' ? 'ម៉ាកសញ្ញានេះមានរួចហើយ!' : 'Brand already exists!');
        return;
      }
      
      const id = 'BR-' + String(state.brands.length + 1).padStart(3, '0');
      state.brands.push({ id, name });
      saveStateToLocalStorage();
      populateProductDropdowns();
      document.getElementById('prod-brand').value = name;
    });

    // Quick Add Unit from product modal
    document.getElementById('btn-quick-add-unit').addEventListener('click', () => {
      const name = prompt(state.lang === 'km' ? "បញ្ចូលឈ្មោះខ្នាត (ភាសាអង់គ្លេស) ៖" : "Enter Unit Name (English):");
      if (!name) return;
      const nameKh = prompt(state.lang === 'km' ? "បញ្ចូលឈ្មោះខ្នាត (ភាសាខ្មែរ) ៖" : "Enter Unit Name (Khmer):", name);
      if (!nameKh) return;
      
      if (state.units.some(u => u.name.toLowerCase() === name.toLowerCase())) {
        alert(state.lang === 'km' ? 'ខ្នាតនេះមានរួចហើយ!' : 'Unit already exists!');
        return;
      }
      
      const id = 'UN-' + String(state.units.length + 1).padStart(3, '0');
      state.units.push({ id, name, nameKh });
      saveStateToLocalStorage();
      populateProductDropdowns();
      document.getElementById('prod-unit').value = name;
    });

    document.getElementById('btn-scan-barcode-modal').addEventListener('click', () => {
      document.getElementById('barcode-form').reset();
      document.getElementById('barcode-error-msg').style.display = 'none';
      document.getElementById('modal-barcode').classList.add('active-modal');
    });

    document.getElementById('btn-quick-add-customer').addEventListener('click', () => {
      openCustomerModal();
    });

    const cartCustSearch = document.getElementById('cart-customer-search');
    if (cartCustSearch) {
      cartCustSearch.addEventListener('input', () => {
        const query = cartCustSearch.value.toLowerCase().trim();
        const custSelect = document.getElementById('cart-customer-select');
        if (!custSelect) return;
        
        custSelect.innerHTML = '';
        const filterBranch = getActiveBranchFilter();
        
        const customerStats = {};
        state.customers.forEach(c => {
          customerStats[c.id] = { orderCount: 0, lastOrderTime: 0 };
        });
        state.transactions.forEach(t => {
          const cId = t.customerId || 'CST-001';
          if (customerStats[cId]) {
            customerStats[cId].orderCount++;
            const tTime = new Date(t.date).getTime();
            if (tTime > customerStats[cId].lastOrderTime) {
              customerStats[cId].lastOrderTime = tTime;
            }
          }
        });

        const filtered = state.customers.filter(c => {
          if (filterBranch && c.branchId !== filterBranch && c.id !== 'CST-001') return false;
          if (!query) return true;
          
          const phone = (c.phone || '').toLowerCase();
          const name = (c.name || '').toLowerCase();
          const id = c.id.toLowerCase();
          return name.includes(query) || phone.includes(query) || id.includes(query);
        });

        filtered.sort((a, b) => {
          if (a.id === 'CST-001') return -1;
          if (b.id === 'CST-001') return 1;
          const statsA = customerStats[a.id] || { lastOrderTime: 0, orderCount: 0 };
          const statsB = customerStats[b.id] || { lastOrderTime: 0, orderCount: 0 };
          if (statsA.lastOrderTime !== statsB.lastOrderTime) return statsB.lastOrderTime - statsA.lastOrderTime;
          if (statsA.orderCount !== statsB.orderCount) return statsB.orderCount - statsA.orderCount;
          return a.name.localeCompare(b.name);
        });

        filtered.forEach(c => {
          const stats = customerStats[c.id] || { orderCount: 0 };
          const debtText = c.outstandingDebt > 0 ? ` [Debt: $${c.outstandingDebt.toFixed(2)}]` : '';
          const vipText = c.isVip ? '★ [VIP] ' : '';
          const orderText = stats.orderCount > 0 ? ` [Orders: ${stats.orderCount}]` : '';
          custSelect.innerHTML += `<option value="${c.id}">${vipText}${c.name} (${c.phone})${orderText}${debtText}</option>`;
        });
      });
    }

    document.getElementById('btn-add-customer-modal').addEventListener('click', () => {
      openCustomerModal();
    });

    const filterCustomerStaff = document.getElementById('filter-customer-staff');
    if (filterCustomerStaff) {
      filterCustomerStaff.addEventListener('change', () => {
        renderCustomers();
      });
    }

    document.getElementById('btn-add-expense-modal').addEventListener('click', () => {
      if (!guardAction('add')) return;
      document.getElementById('expense-form').reset();
      document.getElementById('modal-expense').classList.add('active-modal');
    });

    const btnManageExpCats = document.getElementById('btn-manage-exp-cats');
    if (btnManageExpCats) {
      btnManageExpCats.addEventListener('click', () => {
        const input = document.getElementById('new-exp-cat-input');
        if (input) input.value = '';
        renderCustomExpenseCategoriesList();
        document.getElementById('modal-expense-cats').classList.add('active-modal');
      });
    }

    const btnAddExpCat = document.getElementById('btn-add-exp-cat');
    if (btnAddExpCat) {
      btnAddExpCat.addEventListener('click', () => {
        const input = document.getElementById('new-exp-cat-input');
        if (!input) return;
        const value = input.value.trim();
        
        if (!value) {
          alert(window.POS_TRANSLATIONS[state.lang].pleaseEnterCategory || 'Please enter a category name!');
          return;
        }
        
        const standardCats = ['rent', 'electricity', 'water', 'marketing', 'rawMaterials', 'salaries', 'transportation', 'otherExpenses'];
        const isStandard = standardCats.some(c => {
          const transEn = (window.POS_TRANSLATIONS['en'][c] || '').toLowerCase();
          const transKm = (window.POS_TRANSLATIONS['km'][c] || '').toLowerCase();
          return c.toLowerCase() === value.toLowerCase() || 
                 transEn === value.toLowerCase() || 
                 transKm === value.toLowerCase();
        });
        
        if (!state.companySettings.customExpenseCategories) {
          state.companySettings.customExpenseCategories = [];
        }
        const isCustom = state.companySettings.customExpenseCategories.some(c => c.toLowerCase() === value.toLowerCase());
        
        if (isStandard || isCustom) {
          alert(window.POS_TRANSLATIONS[state.lang].categoryExists || 'Category already exists!');
          return;
        }
        
        state.companySettings.customExpenseCategories.push(value);
        saveStateToLocalStorage();
        renderCustomExpenseCategoriesList();
        populateExpenseCategories();
        input.value = '';
      });
    }

    document.getElementById('btn-add-staff-modal').addEventListener('click', () => {
      if (!guardAction('add')) return;
      document.getElementById('staff-form').reset();
      document.getElementById('staff-edit-id').value = '';
      populateStaffEmployeeSelect('');
      document.getElementById('modal-staff').classList.add('active-modal');
    });

    document.getElementById('btn-stock-adj-modal').addEventListener('click', () => {
      if (!guardAction('edit')) return;
      document.getElementById('stock-adj-form').reset();
      document.getElementById('modal-stock-adj').classList.add('active-modal');
    });

    document.getElementById('btn-wh-transfer-modal').addEventListener('click', () => {
      if (!guardAction('edit')) return;
      document.getElementById('wh-transfer-form').reset();
      document.getElementById('modal-wh-transfer').classList.add('active-modal');
    });

    // Close buttons logic
    const closeBtns = [
      { btn: 'btn-close-checkout', modal: 'modal-checkout' },
      { btn: 'btn-cancel-checkout', modal: 'modal-checkout' },
      { btn: 'btn-close-receipt', modal: 'modal-receipt' },
      { btn: 'btn-close-receipt-foot', modal: 'modal-receipt' },
      { btn: 'btn-close-product', modal: 'modal-product' },
      { btn: 'btn-cancel-product', modal: 'modal-product' },
      { btn: 'btn-close-customer', modal: 'modal-customer' },
      { btn: 'btn-cancel-customer', modal: 'modal-customer' },
      { btn: 'btn-close-expense', modal: 'modal-expense' },
      { btn: 'btn-cancel-expense', modal: 'modal-expense' },
      { btn: 'btn-close-expense-cats', modal: 'modal-expense-cats' },
      { btn: 'btn-done-expense-cats', modal: 'modal-expense-cats' },
      { btn: 'btn-close-staff', modal: 'modal-staff' },
      { btn: 'btn-cancel-staff', modal: 'modal-staff' },
      { btn: 'btn-close-pay-debt', modal: 'modal-pay-debt' },
      { btn: 'btn-cancel-pay-debt', modal: 'modal-pay-debt' },
      { btn: 'btn-close-barcode', modal: 'modal-barcode' },
      { btn: 'btn-cancel-barcode', modal: 'modal-barcode' },
      { btn: 'btn-close-stock-adj', modal: 'modal-stock-adj' },
      { btn: 'btn-cancel-stock-adj', modal: 'modal-stock-adj' },
      { btn: 'btn-close-wh-transfer', modal: 'modal-wh-transfer' },
      { btn: 'btn-cancel-wh-transfer', modal: 'modal-wh-transfer' },
      { btn: 'btn-close-followup', modal: 'modal-followup' },
      { btn: 'btn-cancel-followup', modal: 'modal-followup' },
      { btn: 'btn-close-customer-history', modal: 'modal-customer-history' },
      { btn: 'btn-close-customer-history-footer', modal: 'modal-customer-history' }
    ];

    closeBtns.forEach(c => {
      const el = document.getElementById(c.btn);
      if (el) {
        el.addEventListener('click', () => {
          document.getElementById(c.modal).classList.remove('active-modal');
        });
      }
    });

    // CRM Notifications toggle and closing behaviour
    const bellBtn = document.getElementById('btn-crm-notifications');
    const notiDropdown = document.getElementById('crm-notifications-dropdown');
    if (bellBtn && notiDropdown) {
      bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notiDropdown.classList.toggle('active');
        if (notiDropdown.classList.contains('active')) {
          checkCRMNotifications();
          playSound('alert');
        }
      });
      document.addEventListener('click', () => {
        notiDropdown.classList.remove('active');
      });
      notiDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // POS sidebar change detections
    document.getElementById('pos-search-input').addEventListener('input', () => {
      renderPOSProductGrid();
    });

    document.getElementById('cart-branch-select').addEventListener('change', () => {
      renderPOSProductGrid();
      // Filter staff specific to selected branch
      const brId = document.getElementById('cart-branch-select').value;
      const staffSelect = document.getElementById('cart-staff-select');
      staffSelect.innerHTML = '';
      state.staff.forEach(s => {
        if (s.branchId === brId) {
          staffSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`;
        }
      });
      if (state.staff.length > 0) {
        state.currentPOSStaffId = staffSelect.value;
      }

      // Update global active branch display in header banner & sidebar user details
      const br = state.branches.find(b => b.id === brId);
      const branchName = br ? (state.lang === 'km' ? br.nameKh : br.name) : (brId === 'all' ? 'All Branches' : 'HQ - Phnom Penh');
      
      const branchEl = document.getElementById('display-user-branch');
      const branchBannerEl = document.getElementById('active-branch-name-txt');
      if (branchEl) branchEl.innerText = branchName;
      if (branchBannerEl) branchBannerEl.innerText = branchName;
    });

    document.getElementById('cart-discount-percent').addEventListener('input', () => renderCart());
    document.getElementById('cart-discount-fixed').addEventListener('input', () => renderCart());
    document.getElementById('cart-shipping-fee').addEventListener('input', () => renderCart());

    // Wire up preset discount buttons
    document.querySelectorAll('.discount-preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const val = parseFloat(e.currentTarget.getAttribute('data-value')) || 0;
        document.getElementById('cart-discount-percent').value = val;
        document.getElementById('cart-discount-fixed').value = 0;
        renderCart();
      });
    });

    // Wire up clear discount button
    const clearDiscountBtn = document.getElementById('btn-clear-discount');
    if (clearDiscountBtn) {
      clearDiscountBtn.addEventListener('click', () => {
        document.getElementById('cart-discount-percent').value = 0;
        document.getElementById('cart-discount-fixed').value = 0;
        renderCart();
      });
    }

    document.getElementById('btn-cart-checkout').addEventListener('click', () => {
      openCheckout();
    });

    // POS checkout modal actions
    document.getElementById('pay-card-cash').addEventListener('click', () => {
      switchCheckoutMethod('cash', getCartTotal());
    });
    document.getElementById('pay-card-khqr').addEventListener('click', () => {
      switchCheckoutMethod('khqr', getCartTotal());
    });
    document.getElementById('pay-card-bank').addEventListener('click', () => {
      switchCheckoutMethod('bank', getCartTotal());
    });
    document.getElementById('pay-card-card').addEventListener('click', () => {
      switchCheckoutMethod('card', getCartTotal());
    });

    document.getElementById('checkout-cash-input').addEventListener('input', () => {
      updateCheckoutChange(getCartTotal());
    });

    document.getElementById('btn-complete-checkout').addEventListener('click', () => {
      completeCheckout();
    });

    document.getElementById('btn-print-receipt-trigger').addEventListener('click', () => {
      window.print();
    });

    document.getElementById('btn-edit-invoice-settings').addEventListener('click', () => {
      if (!state.currentUser || state.currentUser.role !== 'super_admin') {
        alert(window.POS_TRANSLATIONS[state.lang].permissionError || 'You do not have permission to access settings!');
        return;
      }

      // Close receipt modal
      document.getElementById('modal-receipt').classList.remove('active-modal');

      // Update active settings tab to company info
      state.activeSettingTab = 'company';

      // Update active nav item
      const navItems = document.querySelectorAll('.nav-menu .nav-item, .pos-cta-btn');
      navItems.forEach(nav => nav.classList.remove('active'));
      const settingsNavItem = document.getElementById('nav-item-settings');
      if (settingsNavItem) {
        settingsNavItem.classList.add('active');
      }

      // Navigate to Settings view
      navigateToView('view-settings');

      // Scroll & focus to Company Name input
      setTimeout(() => {
        const cNameInput = document.getElementById('c-name');
        if (cNameInput) {
          cNameInput.focus();
          cNameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    });

    // Product Images Upload handling
    const imageZone = document.getElementById('prod-image-zone');
    const imageInput = document.getElementById('prod-image-input');
    const imagePreview = document.getElementById('prod-image-preview');
    const imagePlaceholder = document.getElementById('prod-image-placeholder');
    const imageRemove = document.getElementById('btn-remove-prod-image');

    imageZone.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', () => {
      const file = imageInput.files[0];
      if (file) {
        compressProductImage(file, (base64) => {
          state.selectedProductImageBase64 = base64;
          imagePreview.src = base64;
          imagePreview.style.display = 'block';
          imagePlaceholder.style.display = 'none';
          imageRemove.style.display = 'block';
        });
      }
    });

    imageRemove.addEventListener('click', (e) => {
      e.stopPropagation(); // prevent triggering input click
      state.selectedProductImageBase64 = null;
      imagePreview.src = '';
      imagePreview.style.display = 'none';
      imagePlaceholder.style.display = 'flex';
      imageRemove.style.display = 'none';
    });

    // Product Add/Edit submission
    document.getElementById('product-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const idx = document.getElementById('product-edit-index').value;
      const sku = document.getElementById('prod-sku').value.trim();
      const barcode = document.getElementById('prod-barcode').value.trim();
      const nameKh = document.getElementById('prod-name-kh').value.trim();
      const nameEn = document.getElementById('prod-name-en').value.trim();
      const category = document.getElementById('prod-category').value;
      const brand = document.getElementById('prod-brand').value;
      const unit = document.getElementById('prod-unit').value;
      const costPrice = parseFloat(document.getElementById('prod-cost').value) || 0;
      const sellingPrice = parseFloat(document.getElementById('prod-price').value) || 0;
      const minStock = parseInt(document.getElementById('prod-min-stock').value) || 10;
      const description = document.getElementById('prod-desc').value.trim();

      const newProduct = {
        sku, barcode, nameEn, nameKh, category, brand, unit, costPrice, sellingPrice, minStock, description,
        image: state.selectedProductImageBase64,
        status: "active",
        warehouseStock: {}
      };

      if (idx !== '') {
        if (!guardAction('edit')) return;
        newProduct.warehouseStock = state.products[idx].warehouseStock;
        newProduct.status = state.products[idx].status;
        newProduct.stockQty = state.products[idx].stockQty;
        state.products[idx] = newProduct;
      } else {
        if (!guardAction('add')) return;
        // Check duplicates
        if (state.products.some(p => p.sku === sku)) {
          alert('SKU code already exists!');
          return;
        }
        // Initialize branch stock qty to 0
        state.branches.forEach(b => {
          newProduct.warehouseStock[b.id] = 0;
        });
        newProduct.stockQty = 0;
        state.products.push(newProduct);
      }

      saveStateToLocalStorage();
      updateLowStockAlertCount();
      document.getElementById('modal-product').classList.remove('active-modal');
      renderInventory();
      alert(window.POS_TRANSLATIONS[state.lang].productSaved);
    });

    // Barcode Scanning Submission Simulation
    document.getElementById('barcode-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const inputVal = document.getElementById('barcode-input').value.trim();
      const error = document.getElementById('barcode-error-msg');
      
      const product = state.products.find(p => p.sku === inputVal || p.barcode === inputVal);
      if (product) {
        const branchId = document.getElementById('cart-branch-select').value;
        const branchQty = product.warehouseStock[branchId] || 0;
        if (branchQty <= 0) {
          error.innerText = state.lang === 'km' ? 'ផលិតផលនេះគ្មានស្តុកសល់ក្នុងសាខានេះទេ!' : 'Out of stock in selected branch!';
          error.style.display = 'block';
          return;
        }
        addToCart(product.sku);
        document.getElementById('modal-barcode').classList.remove('active-modal');
      } else {
        error.innerText = window.POS_TRANSLATIONS[state.lang].invalidBarcode;
        error.style.display = 'block';
      }
    });

    // Customer CRUD Profile submission
    document.getElementById('customer-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const idx = document.getElementById('customer-edit-index').value;
      const name = document.getElementById('cust-name').value.trim();
      const phone = document.getElementById('cust-phone').value.trim();
      const address = document.getElementById('cust-address').value.trim();
      const source = document.getElementById('cust-source').value;
      const status = document.getElementById('cust-status').value;
      const notes = document.getElementById('cust-notes').value.trim();
      const staffId = document.getElementById('cust-staff').value;
      const facebookLink = document.getElementById('cust-facebook').value.trim();
      const birthday = document.getElementById('cust-birthday').value;

      if (idx !== '') {
        if (!guardAction('edit')) return;
        state.customers[idx].name = name;
        state.customers[idx].phone = phone;
        state.customers[idx].facebookLink = facebookLink;
        state.customers[idx].address = address;
        state.customers[idx].source = source;
        state.customers[idx].status = status;
        state.customers[idx].notes = notes;
        state.customers[idx].staffId = staffId;
        state.customers[idx].birthday = birthday;
        state.customers[idx].updatedBy = state.currentUser ? state.currentUser.username : 'system';
        state.customers[idx].timestamp = new Date().toISOString();
        
        // Also update names in active followups
        const cId = state.customers[idx].id;
        state.followups.forEach(f => {
          if (f.customerId === cId) {
            f.customerName = name;
            f.salesStaffId = staffId;
            const sObj = state.staff.find(st => st.id === staffId);
            if (sObj) f.salesStaffName = sObj.name;
          }
        });
      } else {
        if (!guardAction('add')) return;
        const newId = 'CST-' + String(state.customers.length + 1).padStart(3, '0');
        const prodSku = document.getElementById('cust-product-purchased').value;
        const qty = parseInt(document.getElementById('cust-qty').value) || 1;
        const purchaseDate = document.getElementById('cust-purchase-date').value || new Date().toISOString().split('T')[0];

        const productObj = state.products.find(p => p.sku === prodSku);
        const productName = productObj ? (state.lang === 'km' ? productObj.nameKh : productObj.nameEn) : prodSku;

        const staffObj = state.staff.find(s => s.id === staffId);
        const staffName = staffObj ? staffObj.name : 'System';

        const orders = [];
        const timeline = [];
        if (prodSku) {
          orders.push({
            date: purchaseDate,
            product: productName,
            qty: qty,
            staffName: staffName
          });
          timeline.push({
            date: purchaseDate,
            status: 'Purchase',
            staffName: staffName,
            feedback: 'Initial purchase recorded',
            notes: `Purchased ${productName} x ${qty}`
          });
        }

        const newCust = {
          id: newId,
          name,
          phone,
          facebookLink,
          address,
          source,
          status,
          notes,
          staffId,
          birthday,
          outstandingDebt: 0.00,
          rank: "Bronze",
          purchaseCount: prodSku ? 1 : 0,
          branchId: state.currentUser ? state.currentUser.branchId : 'BR-001',
          createdBy: state.currentUser ? state.currentUser.username : 'system',
          updatedBy: state.currentUser ? state.currentUser.username : 'system',
          timestamp: new Date().toISOString(),
          orders: orders,
          timeline: timeline
        };

        state.customers.push(newCust);

        // Generate followup schedule automatically if a product was purchased
        if (prodSku) {
          const flpId = 'FLP-' + String(state.followups.length + 1).padStart(3, '0');
          const schedules = [];
          const followUpDays = [3, 5, 7, 22, 37, 52, 82, 112, 142];
          const types = ['satisfaction', 'feedback', 'satisfaction', 'promo', 'engagement', 'engagement', 'engagement', 'promo', 'engagement'];
          
          followUpDays.forEach((day, idx) => {
            const d = new Date(purchaseDate);
            d.setDate(d.getDate() + day);
            schedules.push({
              day: day,
              date: d.toISOString(),
              type: types[idx],
              status: 'pending',
              notes: ''
            });
          });

          state.followups.push({
            id: flpId,
            saleId: 'MANUAL',
            customerId: newId,
            customerName: name,
            salesStaffId: staffId,
            salesStaffName: staffName,
            branchId: state.currentUser ? state.currentUser.branchId : 'BR-001',
            schedules: schedules
          });
        }
      }

      saveStateToLocalStorage();
      document.getElementById('modal-customer').classList.remove('active-modal');
      renderCustomers();
      populatePOSSelects();
      if (state.activeView === 'view-followups') {
        renderFollowups();
      }
      checkCRMNotifications();
    });

    // Pay Debt payoff submission
    document.getElementById('pay-debt-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!guardAction('edit')) return;
      const cId = document.getElementById('pay-debt-customer-id').value;
      const amount = parseFloat(document.getElementById('pay-debt-amount').value) || 0;
      const method = document.getElementById('pay-debt-method').value;

      const customer = state.customers.find(c => c.id === cId);
      if (customer) {
        customer.outstandingDebt = Math.max(0, customer.outstandingDebt - amount);
        
        const activeBranch = state.currentUser?.branchId === 'all' ? 'BR-001' : (state.currentUser?.branchId || 'BR-001');
        // Log payoff collection
        state.paymentLogs.push({
          id: 'PAY-' + (1000 + state.paymentLogs.length + 1),
          date: new Date().toISOString(),
          customerId: customer.id,
          customerName: customer.name,
          amount: amount,
          paymentMethod: method,
          notes: `Debt payoff logged via modal`,
          branchId: activeBranch,
          createdBy: state.currentUser ? state.currentUser.username : 'system',
          updatedBy: state.currentUser ? state.currentUser.username : 'system',
          timestamp: new Date().toISOString()
        });


        saveStateToLocalStorage();
        document.getElementById('modal-pay-debt').classList.remove('active-modal');
        renderCustomers();
        populatePOSSelects();
        alert(window.POS_TRANSLATIONS[state.lang].debtPaidSuccess);
      }
    });

    // Expense log submission
    document.getElementById('expense-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!guardAction('add')) return;
      const branchId = document.getElementById('exp-branch-id').value;
      const category = document.getElementById('exp-category').value;
      const amount = parseFloat(document.getElementById('exp-amount').value) || 0;
      const description = document.getElementById('exp-desc').value.trim();

      const newExp = {
        id: 'EXP-' + (1000 + state.expenses.length + 1),
        date: new Date().toISOString(),
        category, amount, description, branchId,
        createdBy: state.currentUser ? state.currentUser.username : 'system',
        updatedBy: state.currentUser ? state.currentUser.username : 'system',
        timestamp: new Date().toISOString()
      };

      state.expenses.push(newExp);
      saveStateToLocalStorage();
      document.getElementById('modal-expense').classList.remove('active-modal');
      renderFinance();
    });

    // Staff Edit/Add Submission
    document.getElementById('staff-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = document.getElementById('staff-edit-id').value;
      const branchId = document.getElementById('staff-form-branch').value;
      const name = document.getElementById('staff-name').value.trim();
      const role = document.getElementById('staff-role').value.trim();
      const baseSalary = parseFloat(document.getElementById('staff-salary').value) || 0;
      const commissionRate = parseFloat(document.getElementById('staff-commission').value) || 0;
      const fbPage = document.getElementById('staff-fb-page').value.trim();
      const employeeId = document.getElementById('staff-employee-id').value;

      if (id !== '') {
        if (!guardAction('edit')) return;
        const s = state.staff.find(st => st.id === id);
        if (s) {
          s.branchId = branchId; s.name = name; s.role = role; s.baseSalary = baseSalary; s.commissionRate = commissionRate; s.fbPage = fbPage;
          s.employeeId = employeeId;
          s.updatedBy = state.currentUser ? state.currentUser.username : 'system';
          s.timestamp = new Date().toISOString();
        }
      } else {
        if (!guardAction('add')) return;
        const newId = 'STF-' + String(state.staff.length + 1).padStart(3, '0');
        state.staff.push({
          id: newId, name, role, baseSalary, commissionRate, branchId, fbPage, employeeId,
          createdBy: state.currentUser ? state.currentUser.username : 'system',
          updatedBy: state.currentUser ? state.currentUser.username : 'system',
          timestamp: new Date().toISOString()
        });
      }

      saveStateToLocalStorage();
      document.getElementById('modal-staff').classList.remove('active-modal');
      renderStaff();
      populatePOSSelects();
    });

    // Stock Adjustments Form submission
    document.getElementById('stock-adj-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!guardAction('edit')) return;
      const brId = document.getElementById('adj-branch-id').value;
      const sku = document.getElementById('adj-product-sku').value;
      const type = document.getElementById('adj-type').value;
      const qty = parseInt(document.getElementById('adj-qty').value) || 0;
      const reason = document.getElementById('adj-reason').value.trim();

      const product = state.products.find(p => p.sku === sku);
      if (!product) return;

      const currentQty = product.warehouseStock[brId] || 0;
      let shift = qty;
      
      if (type === 'increase') {
        product.warehouseStock[brId] = currentQty + qty;
      } else {
        if (qty > currentQty) {
          alert('Cannot adjust stock below 0 units!');
          return;
        }
        product.warehouseStock[brId] = currentQty - qty;
        shift = -qty;
      }

      // Re-sum total stock qty
      let sum = 0;
      for (const b in product.warehouseStock) sum += parseInt(product.warehouseStock[b]) || 0;
      product.stockQty = sum;

      // Log Stock movement
      state.stockLogs.push({
        id: 'SLG-' + (1000 + state.stockLogs.length + 1),
        date: new Date().toISOString(),
        sku: sku,
        type: 'replenishment',
        qty: shift,
        warehouseId: brId,
        description: `Manual adjustment: ${reason}`,
        branchId: brId,
        createdBy: state.currentUser ? state.currentUser.username : 'system',
        updatedBy: state.currentUser ? state.currentUser.username : 'system',
        timestamp: new Date().toISOString()
      });

      saveStateToLocalStorage();
      updateLowStockAlertCount();
      document.getElementById('modal-stock-adj').classList.remove('active-modal');
      renderInventory();
      alert('Stock adjustment saved successfully!');
    });

    // Stock Transfer Form Submission
    document.getElementById('wh-transfer-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!guardAction('edit')) return;
      const sku = document.getElementById('tf-product-sku').value;
      const qty = parseInt(document.getElementById('tf-qty-input').value) || 0;
      const src = document.getElementById('tf-source-branch').value;
      const tar = document.getElementById('tf-target-branch').value;

      if (src === tar) {
        alert(state.lang === 'km' ? 'សាខាប្រភព និងគោលដៅត្រូវតែខុសគ្នា!' : 'Source and target branches must be different!');
        return;
      }

      const product = state.products.find(p => p.sku === sku);
      if (!product) return;

      const srcStock = product.warehouseStock[src] || 0;
      if (qty > srcStock) {
        alert(window.POS_TRANSLATIONS[state.lang].notEnoughStock);
        return;
      }

      // Transfer stock
      product.warehouseStock[src] = srcStock - qty;
      product.warehouseStock[tar] = (product.warehouseStock[tar] || 0) + qty;

      // Logs
      state.stockLogs.push({
        id: 'SLG-' + (1000 + state.stockLogs.length + 1),
        date: new Date().toISOString(),
        sku: sku,
        type: 'transfer',
        qty: -qty,
        warehouseId: src,
        description: `Transferred ${qty} units to branch ${tar}`,
        branchId: src,
        createdBy: state.currentUser ? state.currentUser.username : 'system',
        updatedBy: state.currentUser ? state.currentUser.username : 'system',
        timestamp: new Date().toISOString()
      });
      state.stockLogs.push({
        id: 'SLG-' + (1000 + state.stockLogs.length + 1),
        date: new Date().toISOString(),
        sku: sku,
        type: 'transfer',
        qty: qty,
        warehouseId: tar,
        description: `Received ${qty} units from branch ${src}`,
        branchId: tar,
        createdBy: state.currentUser ? state.currentUser.username : 'system',
        updatedBy: state.currentUser ? state.currentUser.username : 'system',
        timestamp: new Date().toISOString()
      });

      saveStateToLocalStorage();
      document.getElementById('modal-wh-transfer').classList.remove('active-modal');
      renderInventory();
      alert(window.POS_TRANSLATIONS[state.lang].transferSuccess);
    });

    // Follow-Up details submission
    document.getElementById('followup-details-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!guardAction('edit')) return;
      const fId = document.getElementById('f-form-id').value;
      const day = parseInt(document.getElementById('f-form-day').value);
      const staffId = document.getElementById('f-form-staff').value;
      const status = document.getElementById('f-form-status').value;
      const notes = document.getElementById('f-form-notes').value.trim();

      const f = state.followups.find(fl => fl.id === fId);
      if (f) {
        f.salesStaffId = staffId;
        const staffObj = state.staff.find(s => s.id === staffId);
        const staffName = staffObj ? staffObj.name : f.salesStaffName;
        f.salesStaffName = staffName;
        
        const sch = f.schedules.find(s => s.day === day);
        if (sch) {
          sch.status = status;
          sch.notes = notes;

          // Add to customer timeline if completed
          if (status === 'completed') {
            const c = state.customers.find(cust => cust.id === f.customerId);
            if (c) {
              if (!c.timeline) c.timeline = [];
              const dayLabel = window.POS_TRANSLATIONS[state.lang]['day' + day] || `Day ${day} Contact`;
              c.timeline.push({
                date: new Date().toISOString(),
                status: dayLabel,
                staffName: staffName,
                feedback: notes,
                notes: 'Completed follow-up contact'
              });
            }
          }
        }

        saveStateToLocalStorage();
        document.getElementById('modal-followup').classList.remove('active-modal');
        renderFollowups();
        checkCRMNotifications();
        alert(window.POS_TRANSLATIONS[state.lang].followUpSaved);
      }
    });

    // Targets settings rules builder submission (Admin only)
    const ruleForm = document.getElementById('target-rules-form');
    if (ruleForm) {
      ruleForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (state.currentUser.role !== 'super_admin') {
          alert('Only Super Admin can update performance target rules!');
          return;
        }

        state.commissionRules.monthlyTargetUnits = parseInt(document.getElementById('perf-target-units').value) || 300;
        state.commissionRules.tiers.forEach((t, idx) => {
          t.ratePercent = parseFloat(document.getElementById('tier-rate-' + idx).value) || 0;
        });

        saveStateToLocalStorage();
        renderPerformance();
        alert('Monthly targets rules updated successfully!');
      });
    }

    // Settings Sub-Tabs transitions
    setupSettingsTabs();

    // Reports Tabs Transitions
    setupReportTabs();

    // Theme Mode Clicker
    setupThemeToggle();

    // Multi-branch CRUD submissions
    document.getElementById('branch-profile-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = document.getElementById('branch-edit-id').value;
      const code = document.getElementById('br-form-code').value.trim();
      const name = document.getElementById('br-form-name').value.trim();
      const nameKh = document.getElementById('br-form-name-kh').value.trim();
      const address = document.getElementById('br-form-address').value.trim();
      const phone = document.getElementById('br-form-phone').value.trim();
      const manager = document.getElementById('br-form-manager').value.trim();
      const status = document.getElementById('br-form-status').value;

      if (id !== '') {
        if (!guardAction('edit')) return;
        const b = state.branches.find(br => br.id === id);
        if (b) {
          b.code = code; b.name = name; b.nameKh = nameKh; b.address = address; b.phone = phone; b.manager = manager; b.status = status;
        }
      } else {
        if (!guardAction('add')) return;
        // Check duplicate code
        if (state.branches.some(br => br.code === code)) {
          alert('Branch Code already exists!');
          return;
        }
        const newId = 'BR-' + String(state.branches.length + 1).padStart(3, '0');
        state.branches.push({ id: newId, code, name, nameKh, address, phone, manager, status });
        
        // Add new branch stock map to all products
        state.products.forEach(p => {
          p.warehouseStock[newId] = 0;
        });
      }

      saveStateToLocalStorage();
      document.getElementById('branch-profile-form').reset();
      document.getElementById('branch-edit-id').value = '';
      document.getElementById('branch-card-title').innerText = 'Register New Branch';
      
      renderBranches();
      populatePOSSelects();
      alert('Branch database record saved successfully!');
    });

    // Finance Tab Switching (Advanced Update Requirement 1)
    const finTabs = document.querySelectorAll('#finance-tabs .category-tab');
    if (finTabs.length > 0) {
      finTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          finTabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          const activeTab = tab.getAttribute('data-finance-tab');
          
          document.querySelectorAll('.finance-tab-content').forEach(content => {
            content.style.display = 'none';
          });
          
          if (activeTab === 'ledger') {
            document.getElementById('finance-tab-ledger').style.display = 'block';
          } else if (activeTab === 'closing') {
            document.getElementById('finance-tab-closing').style.display = 'block';
            renderSalesClosingView();
          }
        });
      });
    }

    // Daily Sales Closing Submit Action (Advanced Update Requirement 1)
    const closeBtn = document.getElementById('btn-submit-daily-closing');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        processDailyClosing();
      });
    }

    // Monthly / Yearly aggregated close report triggers (Advanced Update Requirement 1)
    const monthlyBtn = document.getElementById('btn-generate-monthly-report');
    if (monthlyBtn) {
      monthlyBtn.addEventListener('click', () => {
        generateMonthlyYearlyClosing('monthly');
      });
    }

    const yearlyBtn = document.getElementById('btn-generate-yearly-report');
    if (yearlyBtn) {
      yearlyBtn.addEventListener('click', () => {
        generateMonthlyYearlyClosing('yearly');
      });
    }

    // Employee Performance Filter listeners
    const perfEmpSelect = document.getElementById('perf-filter-employee');
    if (perfEmpSelect) {
      perfEmpSelect.addEventListener('change', () => {
        state.perfFilterEmployee = perfEmpSelect.value;
        renderPerformance();
      });
    }

    const perfRangeSelect = document.getElementById('perf-filter-range');
    if (perfRangeSelect) {
      perfRangeSelect.addEventListener('change', () => {
        state.perfFilterRange = perfRangeSelect.value;
        renderPerformance();
      });
    }

    const perfStartInput = document.getElementById('perf-filter-start');
    if (perfStartInput) {
      perfStartInput.addEventListener('change', () => {
        state.perfFilterStart = perfStartInput.value;
        renderPerformance();
      });
    }

    const perfEndInput = document.getElementById('perf-filter-end');
    if (perfEndInput) {
      perfEndInput.addEventListener('change', () => {
        state.perfFilterEnd = perfEndInput.value;
        renderPerformance();
      });
    }

    setupHREventListeners();
  }

  function getCartTotal() {
    let subtotal = 0;
    state.cart.forEach(item => {
      const p = state.products.find(prod => prod.sku === item.sku);
      if (p) subtotal += p.sellingPrice * item.qty;
    });

    const discPercent = parseFloat(document.getElementById('cart-discount-percent').value) || 0;
    const discFixed = parseFloat(document.getElementById('cart-discount-fixed').value) || 0;
    const shipping = parseFloat(document.getElementById('cart-shipping-fee').value) || 0;
    
    const discFromPercent = subtotal * (discPercent / 100);
    const totalDiscount = discFromPercent + discFixed;
    
    const taxable = Math.max(0, subtotal - totalDiscount);
    const vatEnabled = state.companySettings.vatEnabled !== false;
    const vatRate = vatEnabled ? (state.companySettings.defaultVatRate !== undefined ? state.companySettings.defaultVatRate : 10) : 0;
    const tax = taxable * (vatRate / 100);
    return taxable + tax + shipping;
  }

  function populateProductDropdowns() {
    const catSelect = document.getElementById('prod-category');
    catSelect.innerHTML = '';
    state.categories.forEach(c => {
      catSelect.innerHTML += `<option value="${c.id}">${state.lang === 'km' ? c.nameKh : c.nameEn}</option>`;
    });

    const brandSelect = document.getElementById('prod-brand');
    brandSelect.innerHTML = '';
    state.brands.forEach(b => {
      brandSelect.innerHTML += `<option value="${b.name}">${b.name}</option>`;
    });

    const unitSelect = document.getElementById('prod-unit');
    unitSelect.innerHTML = '';
    state.units.forEach(u => {
      unitSelect.innerHTML += `<option value="${u.name}">${state.lang === 'km' ? u.nameKh : u.name}</option>`;
    });
  }

  // 1. Sales Closing View rendering (Advanced Update Requirement 1)
  function renderSalesClosingView() {
    const filterBranch = getActiveBranchFilter() || "BR-001";
    
    // Gather all active (unclosed) completed transactions for the active branch
    const activeTX = state.transactions.filter(t => t.branchId === filterBranch && !t.closedId && t.status === 'completed');
    
    let totalSales = 0;
    let totalDiscounts = 0;
    let totalVat = 0;
    let totalProfit = 0;
    let numOrders = activeTX.length;
    
    activeTX.forEach(t => {
      totalSales += t.total;
      
      const sub = t.subtotal || 0;
      const discPercentVal = t.discountPercent || 0;
      const discFixedVal = t.discountFixed || 0;
      const totalDisc = (sub * (discPercentVal / 100)) + discFixedVal;
      totalDiscounts += totalDisc;
      
      totalVat += t.taxAmount || 0;
      
      let cost = 0;
      t.items.forEach(item => {
        const p = state.products.find(prod => prod.sku === item.sku);
        cost += (p ? p.costPrice : 0) * item.qty;
      });
      const orderProfit = t.total - cost - (t.shippingFee || 0);
      totalProfit += orderProfit;
    });
    
    document.getElementById('closing-active-revenue').innerText = window.POS_HELPERS.formatUSD(totalSales);
    document.getElementById('closing-active-discount').innerText = window.POS_HELPERS.formatUSD(totalDiscounts);
    document.getElementById('closing-active-vat').innerText = window.POS_HELPERS.formatUSD(totalVat);
    document.getElementById('closing-active-profit').innerText = window.POS_HELPERS.formatUSD(totalProfit);
    document.getElementById('closing-active-orders').innerText = numOrders;
    
    // Render past closing records in closing logs
    const logsBody = document.getElementById('closing-logs-table-body');
    if (logsBody) {
      logsBody.innerHTML = '';
      
      const displayLogs = state.currentUser?.role === 'super_admin' 
        ? state.closingLogs 
        : state.closingLogs.filter(l => l.branchId === filterBranch);
        
      if (displayLogs.length === 0) {
        logsBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">${window.POS_TRANSLATIONS[state.lang].noData}</td></tr>`;
      } else {
        displayLogs.forEach(l => {
          const br = state.branches.find(b => b.id === l.branchId);
          const brName = br ? (state.lang === 'km' ? br.nameKh : br.name) : 'HQ';
          logsBody.innerHTML += `
            <tr>
              <td><strong>${l.closedDate}</strong></td>
              <td><span class="badge badge-warning">${brName}</span></td>
              <td style="text-align:center;">${l.numOrders}</td>
              <td style="font-weight:750; color:var(--primary);">${window.POS_HELPERS.formatUSD(l.totalSales)}</td>
              <td style="font-weight:750; color:${l.totalProfit < 0 ? 'var(--danger)' : 'var(--primary)'};">${window.POS_HELPERS.formatUSD(l.totalProfit)}</td>
              <td>${l.closedBy}</td>
            </tr>
          `;
        });
      }
    }
  }

  // Daily sales closure logic
  function processDailyClosing() {
    if (!checkPermission('approve')) {
      alert(window.POS_TRANSLATIONS[state.lang].permissionError);
      return;
    }
    
    const filterBranch = getActiveBranchFilter() || "BR-001";
    const activeTX = state.transactions.filter(t => t.branchId === filterBranch && !t.closedId && t.status === 'completed');
    
    if (activeTX.length === 0) {
      alert(state.lang === 'km' ? 'មិនមានការលក់ថ្មីដើម្បីបិទឡើយ!' : 'No active transactions to close!');
      return;
    }
    
    if (!confirm(state.lang === 'km' ? 'តើអ្នកចង់បិទការលក់ប្រចាំថ្ងៃមែនទេ? សកម្មភាពនេះមិនអាចត្រឡប់ថយក្រោយបានឡើយ។' : 'Are you sure you want to close daily sales? This action cannot be undone.')) {
      return;
    }
    
    let totalSales = 0;
    let totalDiscounts = 0;
    let totalVat = 0;
    let totalProfit = 0;
    let numOrders = activeTX.length;
    const transactionIds = [];
    
    activeTX.forEach(t => {
      totalSales += t.total;
      
      const sub = t.subtotal || 0;
      const discPercentVal = t.discountPercent || 0;
      const discFixedVal = t.discountFixed || 0;
      const totalDisc = (sub * (discPercentVal / 100)) + discFixedVal;
      totalDiscounts += totalDisc;
      
      totalVat += t.taxAmount || 0;
      
      let cost = 0;
      t.items.forEach(item => {
        const p = state.products.find(prod => prod.sku === item.sku);
        cost += (p ? p.costPrice : 0) * item.qty;
      });
      const orderProfit = t.total - cost - (t.shippingFee || 0);
      totalProfit += orderProfit;
      
      transactionIds.push(t.id);
    });
    
    const clId = 'CL-' + String(state.closingLogs.length + 1).padStart(4, '0');
    const todayStr = new Date().toISOString().split('T')[0];
    
    const newClosing = {
      id: clId,
      branchId: filterBranch,
      closedDate: todayStr,
      closedAt: new Date().toISOString(),
      closedBy: state.currentUser ? state.currentUser.username : 'system',
      type: 'daily',
      totalSales: totalSales,
      totalDiscounts: totalDiscounts,
      totalVat: totalVat,
      totalProfit: totalProfit,
      numOrders: numOrders,
      transactionIds: transactionIds
    };
    
    // Tag transactions as closed
    state.transactions.forEach(t => {
      if (transactionIds.includes(t.id)) {
        t.closedId = clId;
      }
    });
    
    state.closingLogs.push(newClosing);
    saveStateToLocalStorage();
    logAuditEvent('closing', `Daily Sales Closed for Branch ${filterBranch}. Orders: ${numOrders}, Revenue: $${totalSales.toFixed(2)}, Profit: $${totalProfit.toFixed(2)}`);
    
    renderSalesClosingView();
    alert(window.POS_TRANSLATIONS[state.lang].closeSuccess || 'Sales closed successfully!');
  }

  // Monthly and Yearly closing aggregation reports
  function generateMonthlyYearlyClosing(type) {
    if (!checkPermission('approve')) {
      alert(window.POS_TRANSLATIONS[state.lang].permissionError);
      return;
    }
    
    const filterBranch = getActiveBranchFilter() || "BR-001";
    const panel = document.getElementById('closing-aggregate-result-panel');
    
    let totalSales = 0;
    let totalDiscounts = 0;
    let totalVat = 0;
    let totalProfit = 0;
    let numOrders = 0;
    let closingsCount = 0;
    
    if (type === 'monthly') {
      const monthStr = document.getElementById('closing-month-input').value; // YYYY-MM
      if (!monthStr) {
        alert('Please select a month!');
        return;
      }
      
      const matchedClosings = state.closingLogs.filter(c => c.branchId === filterBranch && c.closedDate.startsWith(monthStr) && c.type === 'daily');
      
      matchedClosings.forEach(c => {
        totalSales += c.totalSales;
        totalDiscounts += c.totalDiscounts;
        totalVat += c.totalVat;
        totalProfit += c.totalProfit;
        numOrders += c.numOrders;
        closingsCount++;
      });
      
      const parts = monthStr.split('-');
      const prevYear = parseInt(parts[0]);
      const prevMonth = parseInt(parts[1]) - 1;
      const prevMonthStr = prevMonth === 0 
        ? `${prevYear - 1}-12` 
        : `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
        
      const prevClosings = state.closingLogs.filter(c => c.branchId === filterBranch && c.closedDate.startsWith(prevMonthStr) && c.type === 'daily');
      let prevSales = 0;
      prevClosings.forEach(c => prevSales += c.totalSales);
      
      const growth = prevSales > 0 ? ((totalSales - prevSales) / prevSales * 100).toFixed(1) : 'N/A';
      const growthClass = parseFloat(growth) >= 0 ? 'text-primary' : 'text-danger';
      const growthSign = parseFloat(growth) >= 0 ? '+' : '';
      
      panel.innerHTML = `
        <div class="closing-report-card" style="border-color:var(--primary); background:rgba(37,99,235,0.03);">
          <h4 style="font-weight:700; color:var(--primary);">Monthly Close Report: ${monthStr}</h4>
          <p style="font-size:11px; color:var(--text-secondary); margin-bottom:12px;">Aggregated from ${closingsCount} daily closes.</p>
          <div class="closing-metric-grid">
            <div class="closing-metric">
              <h5>Total Sales</h5>
              <div>${window.POS_HELPERS.formatUSD(totalSales)}</div>
            </div>
            <div class="closing-metric">
              <h5>Total Profit</h5>
              <div>${window.POS_HELPERS.formatUSD(totalProfit)}</div>
            </div>
            <div class="closing-metric">
              <h5>Total VAT</h5>
              <div>${window.POS_HELPERS.formatUSD(totalVat)}</div>
            </div>
            <div class="closing-metric">
              <h5>Total Discounts</h5>
              <div>${window.POS_HELPERS.formatUSD(totalDiscounts)}</div>
            </div>
            <div class="closing-metric">
              <h5>Total Orders</h5>
              <div>${numOrders}</div>
            </div>
          </div>
          <div style="margin-top:14px; font-size:12px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:10px;">
            <span>Compared to Previous Month (${prevMonthStr} Sales: $${prevSales.toFixed(2)}):</span>
            <strong class="${growthClass}" style="font-size:13px; color:${parseFloat(growth) >= 0 ? 'var(--primary)' : 'var(--danger)'};">${growth !== 'N/A' ? growthSign + growth + '%' : 'N/A'}</strong>
          </div>
        </div>
      `;
      logAuditEvent('closing', `Generated Monthly Closing Report for ${monthStr}. Sales: $${totalSales.toFixed(2)}`);
      
    } else {
      const yearStr = document.getElementById('closing-year-input').value; // YYYY
      if (!yearStr) {
        alert('Please specify a year!');
        return;
      }
      
      const matchedClosings = state.closingLogs.filter(c => c.branchId === filterBranch && c.closedDate.startsWith(yearStr) && c.type === 'daily');
      
      matchedClosings.forEach(c => {
        totalSales += c.totalSales;
        totalDiscounts += c.totalDiscounts;
        totalVat += c.totalVat;
        totalProfit += c.totalProfit;
        numOrders += c.numOrders;
        closingsCount++;
      });
      
      const prevYearStr = String(parseInt(yearStr) - 1);
      const prevClosings = state.closingLogs.filter(c => c.branchId === filterBranch && c.closedDate.startsWith(prevYearStr) && c.type === 'daily');
      let prevSales = 0;
      prevClosings.forEach(c => prevSales += c.totalSales);
      
      const growth = prevSales > 0 ? ((totalSales - prevSales) / prevSales * 100).toFixed(1) : 'N/A';
      const growthClass = parseFloat(growth) >= 0 ? 'text-primary' : 'text-danger';
      const growthSign = parseFloat(growth) >= 0 ? '+' : '';
      
      panel.innerHTML = `
        <div class="closing-report-card" style="border-color:var(--warning); background:rgba(245,158,11,0.03);">
          <h4 style="font-weight:700; color:var(--warning);">Annual Close Report: Year ${yearStr}</h4>
          <p style="font-size:11px; color:var(--text-secondary); margin-bottom:12px;">Aggregated from ${closingsCount} daily closes.</p>
          <div class="closing-metric-grid">
            <div class="closing-metric">
              <h5>Total Sales</h5>
              <div>${window.POS_HELPERS.formatUSD(totalSales)}</div>
            </div>
            <div class="closing-metric">
              <h5>Total Profit</h5>
              <div>${window.POS_HELPERS.formatUSD(totalProfit)}</div>
            </div>
            <div class="closing-metric">
              <h5>Total VAT</h5>
              <div>${window.POS_HELPERS.formatUSD(totalVat)}</div>
            </div>
            <div class="closing-metric">
              <h5>Total Discounts</h5>
              <div>${window.POS_HELPERS.formatUSD(totalDiscounts)}</div>
            </div>
            <div class="closing-metric">
              <h5>Total Orders</h5>
              <div>${numOrders}</div>
            </div>
          </div>
          <div style="margin-top:14px; font-size:12px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:10px;">
            <span>Compared to Previous Year (${prevYearStr} Sales: $${prevSales.toFixed(2)}):</span>
            <strong class="${growthClass}" style="font-size:13px; color:${parseFloat(growth) >= 0 ? 'var(--primary)' : 'var(--danger)'};">${growth !== 'N/A' ? growthSign + growth + '%' : 'N/A'}</strong>
          </div>
        </div>
      `;
      logAuditEvent('closing', `Generated Annual Closing Report for ${yearStr}. Sales: $${totalSales.toFixed(2)}`);
    }
  }

  function checkCRMNotifications() {
    const listContainer = document.getElementById('crm-notifications-list');
    const badgeCount = document.getElementById('crm-notification-count');
    const headerCount = document.getElementById('crm-notification-header-count');

    if (!listContainer || !badgeCount) return;

    listContainer.innerHTML = '';
    const notifications = [];
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const todayMMDD = todayStr.substring(5, 10); // MM-DD

    // 1. Check birthdays
    state.customers.forEach(c => {
      if (c.birthday) {
        const cMMDD = c.birthday.substring(5, 10);
        if (cMMDD === todayMMDD) {
          notifications.push({
            type: 'birthday',
            title: `🎂 Birthday: ${c.name}`,
            desc: state.lang === 'km' ? `ថ្ងៃនេះជាថ្ងៃកំណើតរបស់គាត់! ផ្ញើសារជូនពរ។` : `Today is their birthday! Send them wishes.`,
            customerId: c.id,
            icon: '🎉'
          });
        }
      }
    });

    // 2. Check follow-ups (due today or overdue)
    state.followups.forEach(f => {
      if (f.schedules) {
        f.schedules.forEach(sch => {
          if (sch.status !== 'pending') return;

          const d = new Date(sch.date);
          const dStr = sch.date.split('T')[0];

          const isToday = dStr === todayStr;
          const isOverdue = d < today && !isToday;

          const dayLabel = window.POS_TRANSLATIONS[state.lang]['day' + sch.day] || `Day ${sch.day} Contact`;

          if (isToday) {
            notifications.push({
              type: 'due_today',
              title: `📅 Follow-up Due: ${f.customerName}`,
              desc: `${dayLabel} is due today (Staff: ${f.salesStaffName || 'System'})`,
              customerId: f.customerId,
              followupId: f.id,
              day: sch.day,
              icon: '⏳'
            });
          } else if (isOverdue) {
            const diffDays = Math.ceil((today - d) / (1000 * 60 * 60 * 24));
            notifications.push({
              type: 'overdue',
              title: `🚨 OVERDUE: ${f.customerName}`,
              desc: `${dayLabel} was missed by ${diffDays} days! (Staff: ${f.salesStaffName || 'System'})`,
              customerId: f.customerId,
              followupId: f.id,
              day: sch.day,
              icon: '⚠️'
            });
          }
        });
      }
    });

    // Populate drawer UI
    badgeCount.innerText = notifications.length;
    if (headerCount) {
      headerCount.innerText = state.lang === 'km' ? `${notifications.length} ថ្មី` : `${notifications.length} New`;
    }

    if (notifications.length === 0) {
      listContainer.innerHTML = `<div class="noti-empty"><span style="font-size:20px;">🔔</span><p>${state.lang === 'km' ? 'គ្មានការជូនដំណឹង CRM ទេ' : 'No CRM alerts today'}</p></div>`;
    } else {
      // Trigger HTML5 browser notification for important alerts
      if (state.companySettings && state.companySettings.notificationEnabled) {
        const dueOrOverdue = notifications.filter(n => n.type === 'due_today' || n.type === 'overdue' || n.type === 'birthday');
        if (dueOrOverdue.length > 0 && !state.hasTriggeredLaunchNotis) {
          sendBrowserNotification(
            `CRM Alerts (${dueOrOverdue.length})`, 
            `You have follow-ups due/overdue or customer birthdays today!`
          );
          playSound('alert');
          state.hasTriggeredLaunchNotis = true; // prevent spamming on every draw
        }
      }

      notifications.forEach(n => {
        const item = document.createElement('div');
        item.className = `noti-item type-${n.type}`;
        item.innerHTML = `
          <div class="noti-item-icon" style="font-size:16px; display:flex; align-items:center; justify-content:center;">${n.icon}</div>
          <div class="noti-item-details" style="flex-grow:1;">
            <div class="noti-item-title" style="font-weight:700; color:var(--text-primary);">${n.title}</div>
            <div class="noti-item-desc" style="color:var(--text-secondary); font-size:11px; margin-top:2px;">${n.desc}</div>
          </div>
        `;
        item.addEventListener('click', () => {
          playSound('click');
          if (n.followupId && n.day) {
            openFollowupDetailsModal(n.followupId, n.day);
          } else if (n.customerId) {
            openCustomerHistoryModal(n.customerId);
          }
          // Hide dropdown
          const dropdown = document.getElementById('crm-notifications-dropdown');
          if (dropdown) dropdown.classList.remove('active');
        });
        listContainer.appendChild(item);
      });
    }
  }

  function sendBrowserNotification(title, body) {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          new Notification(title, { body });
        }
      });
    }
  }

  function updateRoadmapVisibility() {
    const content = document.getElementById('followup-roadmap-content');
    const textEl = document.getElementById('toggle-roadmap-text');
    if (!content || !textEl) return;

    if (state.hideFollowupRoadmap) {
      content.style.maxHeight = '0px';
      content.style.marginTop = '0px';
      content.style.opacity = '0';
      textEl.setAttribute('data-translate', 'showRoadmapBtn');
    } else {
      content.style.maxHeight = '1000px';
      content.style.marginTop = '14px';
      content.style.opacity = '1';
      textEl.setAttribute('data-translate', 'hideRoadmapBtn');
    }
    translateApp();
  }

  // ==================== HR & ATTENDANCE SYSTEM LOGIC ====================

  window.viewSelfiePhoto = function(dataUrl) {
    if (!dataUrl || dataUrl === '—') return;
    const win = window.open();
    if (win) {
      win.document.write(`
        <html>
          <head>
            <title>Selfie Preview</title>
            <style>
              body { margin: 0; background: #0b0f19; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; color: white; }
              img { max-width: 90%; max-height: 90vh; border-radius: 12px; border: 2px solid rgba(255,255,255,0.1); box-shadow: 0 20px 50px rgba(0,0,0,0.8); }
            </style>
          </head>
          <body>
            <img src="${dataUrl}">
          </body>
        </html>
      `);
      win.document.close();
    } else {
      alert("Popup blocker blocked the window. Please allow popups.");
    }
  };

  function renderHRMain() {
    const activeTabBtn = document.querySelector('.hr-tab-btn.active');
    const targetTab = activeTabBtn ? activeTabBtn.getAttribute('data-tab') : 'hr-dashboard';
    
    if (targetTab === 'hr-dashboard') {
      renderHRDashboard();
    } else if (targetTab === 'hr-org') {
      renderHROrg();
    } else if (targetTab === 'hr-employees') {
      renderEmployeeList();
    } else if (targetTab === 'hr-attendance') {
      renderAttendanceLogs();
    } else if (targetTab === 'hr-leaves') {
      renderLeaveRequests();
    } else if (targetTab === 'hr-payroll') {
      renderHRPayroll();
    } else if (targetTab === 'hr-performance') {
      renderHRPerformance();
    } else if (targetTab === 'hr-security') {
      renderHRAdminSecurity();
    } else if (targetTab === 'hr-settings') {
      populateHRSettingsForm();
    }
  }

  function setupHREventListeners() {
    // 1. HR Main Sub-tabs switching
    const hrTabBtns = document.querySelectorAll('.hr-tab-btn');
    hrTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        hrTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const targetTab = btn.getAttribute('data-tab');
        
        document.querySelectorAll('.hr-view-panel').forEach(panel => {
          panel.classList.remove('active-panel');
        });
        
        const activePanel = document.getElementById(targetTab);
        if (activePanel) {
          activePanel.classList.add('active-panel');
        }
        
        // Render target sub-tab
        if (targetTab === 'hr-dashboard') {
          renderHRDashboard();
        } else if (targetTab === 'hr-org') {
          renderHROrg();
        } else if (targetTab === 'hr-employees') {
          renderEmployeeList();
        } else if (targetTab === 'hr-attendance') {
          renderAttendanceLogs();
        } else if (targetTab === 'hr-leaves') {
          renderLeaveRequests();
        } else if (targetTab === 'hr-payroll') {
          renderHRPayroll();
        } else if (targetTab === 'hr-performance') {
          renderHRPerformance();
        } else if (targetTab === 'hr-security') {
          renderHRAdminSecurity();
        } else if (targetTab === 'hr-settings') {
          populateHRSettingsForm();
        }
      });
    });

    // 2. Toggle POS Staff vs HR Employees in Employee Database Tab
    const btnToggleHr = document.getElementById('btn-toggle-hr-employees');
    const btnTogglePos = document.getElementById('btn-toggle-pos-staff');
    const panelHr = document.getElementById('panel-hr-employees');
    const panelPos = document.getElementById('panel-pos-staff');
    const hrActions = document.getElementById('hr-employee-actions');
    const posActions = document.getElementById('pos-staff-actions');

    if (btnToggleHr && btnTogglePos) {
      btnToggleHr.addEventListener('click', () => {
        btnToggleHr.style.background = 'var(--primary)';
        btnToggleHr.style.color = 'white';
        btnTogglePos.style.background = 'transparent';
        btnTogglePos.style.color = 'var(--text-secondary)';
        panelHr.style.display = 'block';
        panelPos.style.display = 'none';
        hrActions.style.display = 'flex';
        posActions.style.display = 'none';
      });

      btnTogglePos.addEventListener('click', () => {
        btnTogglePos.style.background = 'var(--primary)';
        btnTogglePos.style.color = 'white';
        btnToggleHr.style.background = 'transparent';
        btnToggleHr.style.color = 'var(--text-secondary)';
        panelHr.style.display = 'none';
        panelPos.style.display = 'block';
        hrActions.style.display = 'none';
        posActions.style.display = 'flex';
      });
    }

    // 3. Employee Modal Actions
    const btnAddEmp = document.getElementById('btn-add-employee-modal');
    if (btnAddEmp) {
      btnAddEmp.addEventListener('click', () => {
        openEmployeeModal(null);
      });
    }

    const btnCloseEmp = document.getElementById('btn-close-employee');
    if (btnCloseEmp) {
      btnCloseEmp.addEventListener('click', () => {
        document.getElementById('modal-employee').classList.remove('active-modal');
      });
    }

    const btnCancelEmp = document.getElementById('btn-cancel-employee');
    if (btnCancelEmp) {
      btnCancelEmp.addEventListener('click', () => {
        document.getElementById('modal-employee').classList.remove('active-modal');
      });
    }

    // 4. Employee Form Submission
    const empForm = document.getElementById('employee-form');
    if (empForm) {
      empForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveEmployee();
      });
    }

    // 5. HR Settings Form Submission
    const hrSettingsForm = document.getElementById('hr-settings-form');
    if (hrSettingsForm) {
      hrSettingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveHRSettings();
      });
    }

    // 6. Copy Webhook URL
    const btnCopyWebhook = document.getElementById('btn-copy-webhook');
    if (btnCopyWebhook) {
      btnCopyWebhook.addEventListener('click', () => {
        const urlInput = document.getElementById('hr-settings-webhook-url');
        if (urlInput) {
          urlInput.select();
          document.execCommand('copy');
          alert('Webhook URL copied to clipboard!');
        }
      });
    }

    // 7. Search Employees Input
    const empSearch = document.getElementById('hr-employee-search');
    if (empSearch) {
      empSearch.addEventListener('input', () => {
        renderEmployeeList();
      });
    }

    // 8. Attendance Date Filter
    const attDateFilter = document.getElementById('hr-attendance-date-filter');
    if (attDateFilter) {
      attDateFilter.addEventListener('change', () => {
        renderAttendanceLogs();
      });
    }

    const btnClearAtt = document.getElementById('btn-clear-attendance-filter');
    if (btnClearAtt) {
      btnClearAtt.addEventListener('click', () => {
        attDateFilter.value = '';
        renderAttendanceLogs();
      });
    }

    const btnSendReport = document.getElementById('btn-send-daily-report');
    if (btnSendReport) {
      btnSendReport.addEventListener('click', () => {
        sendDailySummaryReport();
      });
    }

    // 9. Edit Attendance Modal Event Listeners
    const btnCloseEditAtt = document.getElementById('btn-close-edit-attendance');
    if (btnCloseEditAtt) {
      btnCloseEditAtt.addEventListener('click', () => {
        document.getElementById('modal-edit-attendance').classList.remove('active-modal');
      });
    }

    const btnCancelEditAtt = document.getElementById('btn-cancel-edit-attendance');
    if (btnCancelEditAtt) {
      btnCancelEditAtt.addEventListener('click', () => {
        document.getElementById('modal-edit-attendance').classList.remove('active-modal');
      });
    }

    const editAttForm = document.getElementById('attendance-edit-form');
    if (editAttForm) {
      editAttForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveAttendanceEdit();
      });
    }

    // Auto-calculate Working Hours and Overtime when times change
    const checkInInput = document.getElementById('attendance-edit-checkin-time');
    const checkOutInput = document.getElementById('attendance-edit-checkout-time');
    const workingHoursInput = document.getElementById('attendance-edit-working-hours');
    const otHoursInput = document.getElementById('attendance-edit-ot-hours');

    function recomputeHours() {
      const inVal = checkInInput.value;
      const outVal = checkOutInput.value;
      if (inVal && outVal) {
        const [inH, inM] = inVal.split(':').map(Number);
        const [outH, outM] = outVal.split(':').map(Number);
        
        let diffSec = (outH * 3600 + outM * 60) - (inH * 3600 + inM * 60);
        if (diffSec < 0) {
          // Assume crossed midnight
          diffSec += 24 * 3600;
        }
        
        const hrs = parseFloat((diffSec / 3600).toFixed(2));
        workingHoursInput.value = hrs;
        
        const ot = hrs > 8 ? parseFloat((hrs - 8).toFixed(2)) : 0;
        otHoursInput.value = ot;
      }
    }

    if (checkInInput && checkOutInput) {
      checkInInput.addEventListener('change', recomputeHours);
      checkOutInput.addEventListener('change', recomputeHours);
    }
  }

  function openEditAttendanceModal(logId) {
    if (!guardAction('edit')) return;
    const log = state.attendance.find(x => x.id === logId);
    if (!log) {
      alert("Attendance record not found.");
      return;
    }

    const emp = state.employees.find(e => e.id === log.employeeId) || {};
    const empName = emp.fullName || log.employeeName || 'Unknown';

    document.getElementById('attendance-edit-log-id').value = log.id;
    document.getElementById('attendance-edit-emp-name').value = empName;
    document.getElementById('attendance-edit-date').value = log.date;
    
    document.getElementById('attendance-edit-checkin-time').value = log.checkIn ? log.checkIn.time : '';
    document.getElementById('attendance-edit-checkout-time').value = log.checkOut ? log.checkOut.time : '';
    
    // Retrieve working hours and OT hours, check both root level and checkout level
    const wHours = (log.workingHours !== undefined) ? log.workingHours : (log.checkOut ? log.checkOut.workingHours : '');
    const otHours = (log.overtime !== undefined) ? log.overtime : (log.checkOut ? log.checkOut.overtime : '');
    
    document.getElementById('attendance-edit-working-hours').value = wHours;
    document.getElementById('attendance-edit-ot-hours').value = otHours;

    document.getElementById('modal-edit-attendance').classList.add('active-modal');
  }

  function saveAttendanceEdit() {
    if (!guardAction('edit')) return;
    const logId = document.getElementById('attendance-edit-log-id').value;
    const log = state.attendance.find(x => x.id === logId);
    if (!log) {
      alert("Attendance record not found.");
      return;
    }

    const inTime = document.getElementById('attendance-edit-checkin-time').value;
    const outTime = document.getElementById('attendance-edit-checkout-time').value;
    
    let workingHoursVal = parseFloat(document.getElementById('attendance-edit-working-hours').value);
    let otHoursVal = parseFloat(document.getElementById('attendance-edit-ot-hours').value);

    if (isNaN(workingHoursVal)) workingHoursVal = 0;
    if (isNaN(otHoursVal)) otHoursVal = 0;

    // Update checkIn
    if (inTime) {
      if (!log.checkIn) {
        log.checkIn = { latitude: 0, longitude: 0, selfieUrl: '' };
      }
      log.checkIn.time = inTime;
      
      // Determine if Late
      let checkInStatus = 'On Time';
      const settings = state.companySettings || {};
      const emp = state.employees.find(e => e.id === log.employeeId) || {};
      const workStart = emp.workStart || settings.hrWorkStart || '08:00';
      if (workStart) {
        const [sh, sm] = workStart.split(':').map(Number);
        const [ih, im] = inTime.split(':').map(Number);
        if (ih > sh || (ih === sh && im > sm)) {
          checkInStatus = 'Late';
        }
      }
      log.checkIn.status = checkInStatus;

    } else {
      delete log.checkIn;
    }

    // Update checkOut
    if (outTime) {
      if (!log.checkOut) {
        log.checkOut = { latitude: 0, longitude: 0, selfieUrl: '' };
      }
      log.checkOut.time = outTime;
    } else {
      delete log.checkOut;
    }

    // Write hours to both root level and checkout object
    log.workingHours = workingHoursVal;
    if (log.checkOut) log.checkOut.workingHours = workingHoursVal;

    log.overtime = otHoursVal;
    if (log.checkOut) log.checkOut.overtime = otHoursVal;

    saveStateToLocalStorage();
    document.getElementById('modal-edit-attendance').classList.remove('active-modal');
    renderAttendanceLogs();
    renderHRDashboard();
    
    alert("Attendance record updated successfully!");
  }

  window.openEditAttendanceModal = openEditAttendanceModal;

  function deleteAttendanceLog(logId) {
    if (!guardAction('delete')) return;
    const log = state.attendance.find(x => x.id === logId);
    if (!log) {
      alert("Attendance record not found.");
      return;
    }

    const emp = state.employees.find(e => e.id === log.employeeId) || {};
    const empName = emp.fullName || log.employeeName || 'Unknown';
    
    const confirmMsg = state.lang === 'km' 
      ? `តើលោកអ្នកពិតជាចង់លុបកំណត់ត្រាវត្តមានរបស់ ${empName} សម្រាប់ថ្ងៃទី ${log.date} មែនទេ?`
      : `Are you sure you want to delete the attendance log for ${empName} on ${log.date}?`;

    if (confirm(confirmMsg)) {
      const idx = state.attendance.findIndex(x => x.id === logId);
      if (idx !== -1) {
        state.attendance.splice(idx, 1);
        saveStateToLocalStorage();
        renderAttendanceLogs();
        renderHRDashboard();
        alert(state.lang === 'km' ? "បានលុបកំណត់ត្រាវត្តមានដោយជោគជ័យ!" : "Attendance record deleted successfully!");
      }
    }
  }

  window.deleteAttendanceLog = deleteAttendanceLog;

  function populateEmployeeFormDropdowns() {
    const compSelect = document.getElementById('employee-company-id');
    const deptCompSelect = document.getElementById('dept-company-id');
    if (compSelect) {
      compSelect.innerHTML = state.companies.map(c => `<option value="${c.id}">${c.name}</option>`).join('') || '<option value="">None</option>';
    }
    if (deptCompSelect) {
      deptCompSelect.innerHTML = state.companies.map(c => `<option value="${c.id}">${c.name}</option>`).join('') || '<option value="">None</option>';
    }

    const teamDeptSelect = document.getElementById('team-dept-id');
    const posDeptSelect = document.getElementById('pos-dept-id');
    if (teamDeptSelect) {
      teamDeptSelect.innerHTML = state.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('') || '<option value="">None</option>';
    }
    if (posDeptSelect) {
      posDeptSelect.innerHTML = state.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('') || '<option value="">None</option>';
    }
  }

  function openEmployeeModal(empId) {
    if (!guardAction('edit')) return;
    populateEmployeeFormDropdowns();
    const form = document.getElementById('employee-form');
    form.reset();
    
    const titleEl = document.getElementById('employee-modal-title');
    const docIdInput = document.getElementById('employee-edit-doc-id');
    const idInput = document.getElementById('employee-id');
    
    if (empId) {
      const emp = state.employees.find(e => e.id === empId);
      if (emp) {
        titleEl.innerText = state.lang === 'km' ? 'កែសម្រួលព័ត៌មានបុគ្គលិក' : 'Edit Employee Details';
        docIdInput.value = emp.id;
        idInput.value = emp.id;
        idInput.disabled = true;
        
        document.getElementById('employee-fullname').value = emp.fullName || '';
        document.getElementById('employee-gender').value = emp.gender || 'Male';
        document.getElementById('employee-dob').value = emp.dob || '';
        document.getElementById('employee-phone').value = emp.phone || '';
        document.getElementById('employee-telegram-id').value = emp.telegramId || '';
        document.getElementById('employee-email').value = emp.email || '';
        document.getElementById('employee-address').value = emp.address || '';
        document.getElementById('employee-department').value = emp.department || '';
        document.getElementById('employee-position').value = emp.position || '';
        document.getElementById('employee-salary').value = emp.salary || '';
        document.getElementById('employee-join-date').value = emp.joinDate || '';
        document.getElementById('employee-status').value = emp.status || 'Active';
        
        document.getElementById('employee-work-start').value = emp.workStart || '';
        document.getElementById('employee-work-end').value = emp.workEnd || '';

        document.getElementById('employee-contract-type').value = emp.contractType || 'Probation';
        document.getElementById('employee-allowance-position').value = emp.allowances?.position || emp.allowancePosition || '';
        document.getElementById('employee-allowance-phone').value = emp.allowances?.phone || emp.allowancePhone || '';
        document.getElementById('employee-allowance-fuel').value = emp.allowances?.fuel || emp.allowanceFuel || '';
        document.getElementById('employee-allowance-meal').value = emp.allowances?.meal || emp.allowanceMeal || '';
        document.getElementById('employee-company-id').value = emp.companyId || '';
        document.getElementById('employee-bank-name').value = emp.bankInfo?.bankName || emp.bankName || '';
        document.getElementById('employee-bank-acc-name').value = emp.bankInfo?.accountName || emp.bankAccName || '';
        document.getElementById('employee-bank-acc-num').value = emp.bankInfo?.accountNumber || emp.bankAccNum || '';
        document.getElementById('employee-nssf-num').value = emp.nssfInfo?.nssfCardNumber || emp.nssfNum || '';
        document.getElementById('employee-nssf-health').checked = emp.nssfInfo ? !!emp.nssfInfo.healthInsurance : true;
        document.getElementById('employee-nssf-risk').checked = emp.nssfInfo ? !!emp.nssfInfo.occupationalRisk : true;
        document.getElementById('employee-nssf-pension').checked = emp.nssfInfo ? !!emp.nssfInfo.pensionScheme : true;
        document.getElementById('employee-emergency-name').value = emp.emergencyContact?.name || emp.emergencyName || '';
        document.getElementById('employee-emergency-relation').value = emp.emergencyContact?.relation || emp.emergencyRelation || '';
        document.getElementById('employee-emergency-phone').value = emp.emergencyContact?.phone || emp.emergencyPhone || '';
      }
    } else {
      titleEl.innerText = state.lang === 'km' ? 'បន្ថែមបុគ្គលិកថ្មី' : 'Add New Employee';
      docIdInput.value = '';
      idInput.disabled = false;
      
      document.getElementById('employee-work-start').value = '';
      document.getElementById('employee-work-end').value = '';
      
      const nextIdNum = state.employees.length + 1;
      idInput.value = 'EMP' + String(nextIdNum).padStart(3, '0');
    }
    
    document.getElementById('modal-employee').classList.add('active-modal');

  }

  function saveEmployee() {
    const docId = document.getElementById('employee-edit-doc-id').value;
    const id = document.getElementById('employee-id').value.trim().toUpperCase();
    const fullName = document.getElementById('employee-fullname').value.trim();
    const gender = document.getElementById('employee-gender').value;
    const dob = document.getElementById('employee-dob').value;
    const phone = document.getElementById('employee-phone').value.trim();
    const telegramId = document.getElementById('employee-telegram-id').value.trim();
    const email = document.getElementById('employee-email').value.trim();
    const address = document.getElementById('employee-address').value.trim();
    const department = document.getElementById('employee-department').value.trim();
    const position = document.getElementById('employee-position').value.trim();
    const salary = parseFloat(document.getElementById('employee-salary').value) || 0;
    const joinDate = document.getElementById('employee-join-date').value;
    const status = document.getElementById('employee-status').value;
    const workStart = document.getElementById('employee-work-start').value;
    const workEnd = document.getElementById('employee-work-end').value;

    const contractType = document.getElementById('employee-contract-type').value;
    const allowancePosition = parseFloat(document.getElementById('employee-allowance-position').value) || 0;
    const allowancePhone = parseFloat(document.getElementById('employee-allowance-phone').value) || 0;
    const allowanceFuel = parseFloat(document.getElementById('employee-allowance-fuel').value) || 0;
    const allowanceMeal = parseFloat(document.getElementById('employee-allowance-meal').value) || 0;
    const companyId = document.getElementById('employee-company-id').value;
    const bankName = document.getElementById('employee-bank-name').value.trim();
    const bankAccName = document.getElementById('employee-bank-acc-name').value.trim();
    const bankAccNum = document.getElementById('employee-bank-acc-num').value.trim();
    const nssfNum = document.getElementById('employee-nssf-num').value.trim();
    const nssfHealth = document.getElementById('employee-nssf-health').checked;
    const nssfRisk = document.getElementById('employee-nssf-risk').checked;
    const nssfPension = document.getElementById('employee-nssf-pension').checked;
    const emergencyName = document.getElementById('employee-emergency-name').value.trim();
    const emergencyRelation = document.getElementById('employee-emergency-relation').value.trim();
    const emergencyPhone = document.getElementById('employee-emergency-phone').value.trim();

    if (!id || !fullName || !phone) {
      alert("Please fill in ID, Full Name, and Phone number.");
      return;
    }

    const employeeData = {
      id, fullName, gender, dob, phone, telegramId, email, address,
      department, position, salary, joinDate, status,
      workStart, workEnd,
      contractType,

      allowances: {
        position: allowancePosition,
        phone: allowancePhone,
        fuel: allowanceFuel,
        meal: allowanceMeal
      },
      companyId,
      bankInfo: {
        bankName,
        accountName: bankAccName,
        accountNumber: bankAccNum
      },
      nssfInfo: {
        nssfCardNumber: nssfNum,
        healthInsurance: nssfHealth,
        occupationalRisk: nssfRisk,
        pensionScheme: nssfPension
      },
      emergencyContact: {
        name: emergencyName,
        relation: emergencyRelation,
        phone: emergencyPhone
      },
      updatedBy: state.currentUser ? state.currentUser.username : 'system',
      timestamp: new Date().toISOString()
    };

    if (docId !== '') {
      const idx = state.employees.findIndex(e => e.id === docId);
      if (idx !== -1) {
        state.employees[idx] = { ...state.employees[idx], ...employeeData };
      }
    } else {
      if (state.employees.some(e => e.id === id)) {
        alert("Employee ID already exists!");
        return;
      }
      employeeData.createdBy = state.currentUser ? state.currentUser.username : 'system';
      state.employees.push(employeeData);
    }

    saveStateToLocalStorage();
    document.getElementById('modal-employee').classList.remove('active-modal');
    renderEmployeeList();
    renderHRDashboard();
    alert("Employee record saved successfully!");
  }

  function deleteEmployee(empId) {
    if (!guardAction('delete')) return;
    if (confirm(window.POS_TRANSLATIONS[state.lang].confirmDelete)) {
      const idx = state.employees.findIndex(e => e.id === empId);
      if (idx !== -1) {
        state.employees.splice(idx, 1);
        saveStateToLocalStorage();
        renderEmployeeList();
        renderHRDashboard();
      }
    }
  }

  function renderEmployeeList() {
    const tbody = document.getElementById('hr-employees-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const searchQuery = document.getElementById('hr-employee-search').value.toLowerCase().trim();

    state.employees.forEach(emp => {
      if (searchQuery) {
        const match = emp.id.toLowerCase().includes(searchQuery) ||
                      (emp.fullName && emp.fullName.toLowerCase().includes(searchQuery)) ||
                      (emp.phone && emp.phone.includes(searchQuery)) ||
                      (emp.position && emp.position.toLowerCase().includes(searchQuery));
        if (!match) return;
      }

      const tr = document.createElement('tr');
      
      const statusBadgeClass = emp.status === 'Active' ? 'badge-ontime' : 'badge-late';
      const telegramDisplay = emp.telegramId ? `<span style="color:#0088cc; font-weight:600;">🔵 Connected (${emp.telegramId})</span>` : '<span style="color:var(--text-muted);">Not Linked</span>';

      tr.innerHTML = `
        <td><strong style="color:var(--secondary); font-family:monospace;">${emp.id}</strong></td>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <div>
              <strong>${emp.fullName}</strong><br>
              <span style="font-size:10px; color:var(--text-muted);">${emp.email || ''}</span>
            </div>
          </div>
        </td>
        <td>${emp.gender || '—'}</td>
        <td><strong>${emp.position || '—'}</strong><br><span style="font-size:10px; color:var(--text-muted);">${emp.department || ''}</span></td>
        <td>${emp.phone}</td>
        <td>${telegramDisplay}</td>
        <td><span class="badge ${statusBadgeClass}">${emp.status}</span></td>
        <td>
          <button class="btn btn-outline btn-sm btn-edit-emp" data-id="${emp.id}" style="padding:2px 6px;">✏️</button>
          <button class="btn btn-danger btn-sm btn-del-emp" data-id="${emp.id}" style="padding:2px 6px;">🗑️</button>
        </td>
      `;

      tr.querySelector('.btn-edit-emp').addEventListener('click', () => openEmployeeModal(emp.id));
      tr.querySelector('.btn-del-emp').addEventListener('click', () => deleteEmployee(emp.id));

      tbody.appendChild(tr);
    });

    if (tbody.children.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted);" data-translate="noData">No records found</td></tr>`;
      translateApp();
    }
  }

  function renderAttendanceLogs() {
    const tbody = document.getElementById('hr-attendance-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const dateFilter = document.getElementById('hr-attendance-date-filter').value;

    const logs = [...state.attendance].sort((a, b) => {
      const dateA = a.date + ' ' + (a.checkIn ? a.checkIn.time : '00:00:00');
      const dateB = b.date + ' ' + (b.checkIn ? b.checkIn.time : '00:00:00');
      return new Date(dateB) - new Date(dateA);
    });

    logs.forEach(log => {
      if (dateFilter && log.date !== dateFilter) return;

      const emp = state.employees.find(e => e.id === log.employeeId) || {};
      const empName = emp.fullName || log.employeeName || 'Unknown';

      const checkInTime = log.checkIn ? log.checkIn.time : '—';
      const checkInStatus = log.checkIn ? log.checkIn.status : '';
      const checkInBadgeClass = checkInStatus === 'On Time' ? 'badge-ontime' : checkInStatus === 'Late' ? 'badge-late' : '';
      
      const checkOutTime = log.checkOut ? log.checkOut.time : '—';
      const wHoursVal = (log.workingHours !== undefined) ? log.workingHours : (log.checkOut ? log.checkOut.workingHours : undefined);
      const otHoursVal = (log.overtime !== undefined) ? log.overtime : (log.checkOut ? log.checkOut.overtime : undefined);
      const workingHours = typeof wHoursVal === 'number' ? wHoursVal.toFixed(1) + ' hrs' : '—';
      const overtime = typeof otHoursVal === 'number' ? otHoursVal.toFixed(1) + ' hrs' : '—';

      let gpsLink = '—';
      if (log.checkIn && log.checkIn.latitude && log.checkIn.longitude) {
        gpsLink = `<a href="https://www.google.com/maps?q=${log.checkIn.latitude},${log.checkIn.longitude}" target="_blank" class="gps-map-link">📍 Map</a>`;
      }

      let selfieHtml = '';
      if (log.checkIn && log.checkIn.selfieUrl) {
        selfieHtml += `
          <div style="text-align: center; margin: 0 4px;">
            <span style="font-size: 8px; color: var(--text-secondary); display: block; line-height: 1; margin-bottom: 2px;">IN</span>
            <img src="${log.checkIn.selfieUrl}" class="selfie-thumb" alt="In Selfie" onclick="window.viewSelfiePhoto('${log.checkIn.selfieUrl}')">
          </div>
        `;
      }
      if (log.checkOut && log.checkOut.selfieUrl) {
        selfieHtml += `
          <div style="text-align: center; margin: 0 4px;">
            <span style="font-size: 8px; color: var(--text-secondary); display: block; line-height: 1; margin-bottom: 2px;">OUT</span>
            <img src="${log.checkOut.selfieUrl}" class="selfie-thumb" alt="Out Selfie" onclick="window.viewSelfiePhoto('${log.checkOut.selfieUrl}')">
          </div>
        `;
      }
      if (!selfieHtml) {
        selfieHtml = '—';
      } else {
        selfieHtml = `<div style="display: flex; align-items: center; justify-content: center;">${selfieHtml}</div>`;
      }

      const editBtnText = state.lang === 'km' ? 'កែសម្រួល' : 'Edit';
      const deleteBtnText = state.lang === 'km' ? 'លុប' : 'Delete';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family:monospace; font-weight:700;">${log.date}</td>
        <td><strong style="color:var(--secondary); font-family:monospace;">${log.employeeId}</strong></td>
        <td><strong>${empName}</strong></td>
        <td>${checkInTime} ${checkInStatus ? `<span class="badge ${checkInBadgeClass}">${checkInStatus}</span>` : ''}</td>
        <td>${checkOutTime}</td>
        <td>${workingHours}</td>
        <td style="color:var(--primary); font-weight:700;">${overtime}</td>
        <td>${gpsLink}</td>
        <td>${selfieHtml}</td>
        <td>
          <div style="display: flex; gap: 4px; justify-content: center;">
            <button class="btn btn-secondary btn-sm" onclick="window.openEditAttendanceModal('${log.id}')" style="padding:2px 8px; font-size:11px;">
              📝 ${editBtnText}
            </button>
            <button class="btn btn-danger btn-sm" onclick="window.deleteAttendanceLog('${log.id}')" style="padding:2px 8px; font-size:11px; background-color: var(--danger); border: none;">
              🗑️ ${deleteBtnText}
            </button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });

    if (tbody.children.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted);" data-translate="noData">No records found</td></tr>`;
      translateApp();
    }
  }

  function renderLeaveRequests() {
    const tbody = document.getElementById('hr-leaves-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const leaves = [...state.leaveRequests].sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

    leaves.forEach(req => {
      const emp = state.employees.find(e => e.id === req.employeeId) || {};
      const empName = emp.fullName || req.employeeName || 'Unknown';

      const statusBadgeClass = req.status === 'Pending' ? 'badge-pending' : req.status === 'Approved' ? 'badge-approved' : 'badge-rejected';
      const statusText = window.POS_TRANSLATIONS[state.lang][req.status.toLowerCase()] || req.status;

      let actionHtml = '';
      if (req.status === 'Pending') {
        const approveText = window.POS_TRANSLATIONS[state.lang].approve || 'Approve';
        const rejectText = window.POS_TRANSLATIONS[state.lang].reject || 'Reject';
        actionHtml = `
          <button class="btn btn-secondary btn-sm btn-approve-leave" data-id="${req.id}" style="padding:2px 8px; font-size:11px; margin-right:4px;" data-translate="approve">${approveText}</button>
          <button class="btn btn-danger btn-sm btn-reject-leave" data-id="${req.id}" style="padding:2px 8px; font-size:11px; margin-right:4px;" data-translate="reject">${rejectText}</button>
        `;
      }
      const deleteText = window.POS_TRANSLATIONS[state.lang].delete || 'Delete';
      actionHtml += `
        <button class="btn btn-danger btn-sm btn-delete-leave" data-id="${req.id}" style="padding:2px 8px; font-size:11px; background-color:#dc3545; border-color:#dc3545; color:#fff;" data-translate="delete">${deleteText}</button>
      `;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color:var(--secondary); font-family:monospace;">${req.employeeId}</strong></td>
        <td><strong>${empName}</strong></td>
        <td><strong>${req.leaveType}</strong></td>
        <td>${req.startDate}</td>
        <td>${req.endDate}</td>
        <td style="font-size:11px; color:var(--text-secondary); max-width:200px; white-space:normal; line-height:1.3;">${req.reason || ''}</td>
        <td><span class="badge ${statusBadgeClass}">${statusText}</span></td>
        <td>${actionHtml}</td>
      `;

      if (req.status === 'Pending') {
        tr.querySelector('.btn-approve-leave').addEventListener('click', () => processLeaveRequest(req.id, 'Approved'));
        tr.querySelector('.btn-reject-leave').addEventListener('click', () => processLeaveRequest(req.id, 'Rejected'));
      }
      tr.querySelector('.btn-delete-leave').addEventListener('click', () => deleteLeaveRequest(req.id));

      tbody.appendChild(tr);
    });

    if (tbody.children.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted);" data-translate="noData">No records found</td></tr>`;
      translateApp();
    }
  }

  function processLeaveRequest(reqId, newStatus) {
    if (!guardAction('edit')) return;
    const req = state.leaveRequests.find(r => r.id === reqId);
    if (req) {
      req.status = newStatus;
      req.updatedBy = state.currentUser ? state.currentUser.username : 'system';
      req.timestamp = new Date().toISOString();

      saveStateToLocalStorage();
      renderLeaveRequests();
      renderHRDashboard();

      const emp = state.employees.find(e => e.id === req.employeeId);
      if (emp && emp.telegramId) {
        const statusText = newStatus === 'Approved' ? '✅ ត្រូវបានអនុម័ត (APPROVED)' : '❌ ត្រូវបានបដិសេធ (REJECTED)';
        const msg = `🔔 ព័ត៌មានលិខិតសុំច្បាប់៖\n\nលិខិតសុំច្បាប់របស់អ្នកសម្រាប់ថ្ងៃទី៖ ${req.startDate} ដល់ ${req.endDate} (${req.leaveType}) ${statusText} ដោយអ្នកគ្រប់គ្រង។`;
        notifyEmployeeTelegram(emp.telegramId, msg);
      }

      alert(`Leave request has been ${newStatus.toLowerCase()}!`);
    }
  }

  function deleteLeaveRequest(reqId) {
    if (!guardAction('delete')) return;
    const confirmMsg = window.POS_TRANSLATIONS[state.lang].confirmDelete || 'Are you sure you want to delete this record?';
    if (!confirm(confirmMsg)) return;

    const idx = state.leaveRequests.findIndex(r => r.id === reqId);
    if (idx !== -1) {
      state.leaveRequests.splice(idx, 1);
      saveStateToLocalStorage();
      renderLeaveRequests();
      renderHRDashboard();
      
      const successMsg = state.lang === 'km' ? 'លិខិតសុំច្បាប់ត្រូវបានលុបដោយជោគជ័យ!' : 'Leave request deleted successfully!';
      alert(successMsg);
    }
  }

  function renderHRDashboard() {
    const total = state.employees.length;
    const today = new Date().toLocaleDateString('en-CA');
    const todayAtt = state.attendance.filter(a => a.date === today);
    const present = todayAtt.filter(a => a.checkIn).length;
    const late = todayAtt.filter(a => a.checkIn && a.checkIn.status === 'Late').length;
    
    const onLeave = state.leaveRequests.filter(req => {
      if (req.status !== 'Approved') return false;
      const start = new Date(req.startDate);
      const end = new Date(req.endDate);
      const cur = new Date(today);
      return cur >= start && cur <= end;
    }).length;

    const absent = Math.max(0, total - present - onLeave);

    const kpiTotal = document.getElementById('hr-kpi-total');
    const kpiPresent = document.getElementById('hr-kpi-present');
    const kpiAbsent = document.getElementById('hr-kpi-absent');
    const kpiLate = document.getElementById('hr-kpi-late');
    const kpiLeave = document.getElementById('hr-kpi-leave');

    if (kpiTotal) kpiTotal.innerText = total;
    if (kpiPresent) kpiPresent.innerText = present;
    if (kpiAbsent) kpiAbsent.innerText = absent;
    if (kpiLate) kpiLate.innerText = late;
    if (kpiLeave) kpiLeave.innerText = onLeave;

    const tbody = document.getElementById('hr-dashboard-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    state.employees.forEach(emp => {
      if (emp.status !== 'Active') return;
      
      const log = todayAtt.find(a => a.employeeId === emp.id);
      
      let checkInTime = '—';
      let checkInStatus = '';
      let checkInBadgeClass = '';
      let selfieHtml = '';
      
      if (log && log.checkIn) {
        checkInTime = log.checkIn.time;
        checkInStatus = log.checkIn.status;
        checkInBadgeClass = checkInStatus === 'On Time' ? 'badge-ontime' : checkInStatus === 'Late' ? 'badge-late' : '';
        if (log.checkIn.selfieUrl) {
          selfieHtml += `
            <div style="text-align: center; margin: 0 4px; display: inline-block;">
              <span style="font-size: 8px; color: var(--text-secondary); display: block; line-height: 1; margin-bottom: 2px;">IN</span>
              <img src="${log.checkIn.selfieUrl}" class="selfie-thumb" alt="In Selfie" onclick="window.viewSelfiePhoto('${log.checkIn.selfieUrl}')">
            </div>
          `;
        }
      }

      if (log && log.checkOut && log.checkOut.selfieUrl) {
        selfieHtml += `
          <div style="text-align: center; margin: 0 4px; display: inline-block;">
            <span style="font-size: 8px; color: var(--text-secondary); display: block; line-height: 1; margin-bottom: 2px;">OUT</span>
            <img src="${log.checkOut.selfieUrl}" class="selfie-thumb" alt="Out Selfie" onclick="window.viewSelfiePhoto('${log.checkOut.selfieUrl}')">
          </div>
        `;
      }

      if (!selfieHtml) {
        selfieHtml = '—';
      } else {
        selfieHtml = `<div style="display: flex; align-items: center; justify-content: center;">${selfieHtml}</div>`;
      }

      const checkOutTime = log && log.checkOut ? log.checkOut.time : '—';
      
      let empStatusHtml = '';
      if (log) {
        empStatusHtml = `<span class="badge badge-ontime">Present</span>`;
      } else {
        const leaveActive = state.leaveRequests.some(req => {
          if (req.employeeId !== emp.id || req.status !== 'Approved') return false;
          const start = new Date(req.startDate);
          const end = new Date(req.endDate);
          const cur = new Date(today);
          return cur >= start && cur <= end;
        });
        
        if (leaveActive) {
          empStatusHtml = `<span class="badge badge-pending">On Leave</span>`;
        } else {
          empStatusHtml = `<span class="badge badge-late">Absent</span>`;
        }
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color:var(--secondary); font-family:monospace;">${emp.id}</strong></td>
        <td><strong>${emp.fullName}</strong><br><span style="font-size:9.5px; color:var(--text-muted);">${emp.position || ''}</span></td>
        <td>${checkInTime} ${checkInStatus ? `<span class="badge ${checkInBadgeClass}">${checkInStatus}</span>` : ''}</td>
        <td>${checkOutTime}</td>
        <td>${empStatusHtml}</td>
        <td>${selfieHtml}</td>
      `;

      tbody.appendChild(tr);
    });

    if (tbody.children.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);" data-translate="noData">No records found</td></tr>`;
      translateApp();
    }
  }



  function populateHRSettingsForm() {
    const settings = state.companySettings || {};
    
    document.getElementById('hr-settings-token').value = settings.hrTelegramBotToken || '';
    document.getElementById('hr-settings-username').value = settings.hrTelegramBotUsername || '';
    const grpIdEl = document.getElementById('hr-settings-group-id');
    if (grpIdEl) grpIdEl.value = settings.hrTelegramGroupId || '';
    document.getElementById('hr-settings-lat').value = settings.hrOfficeLatitude || '';
    document.getElementById('hr-settings-lng').value = settings.hrOfficeLongitude || '';
    document.getElementById('hr-settings-radius').value = settings.hrOfficeRadius || '100';
    document.getElementById('hr-settings-start').value = settings.hrWorkStart || '08:00';
    document.getElementById('hr-settings-end').value = settings.hrWorkEnd || '17:00';

    const webhookUrlInput = document.getElementById('hr-settings-webhook-url');
    if (webhookUrlInput) {
      webhookUrlInput.value = window.location.origin + '/api/bot';
    }
  }

  function saveHRSettings() {
    if (!guardAction('edit')) return;
    const token = document.getElementById('hr-settings-token').value.trim();
    const username = document.getElementById('hr-settings-username').value.trim();
    const grpIdEl = document.getElementById('hr-settings-group-id');
    const groupId = grpIdEl ? grpIdEl.value.trim() : '';
    const lat = parseFloat(document.getElementById('hr-settings-lat').value) || 0;
    const lng = parseFloat(document.getElementById('hr-settings-lng').value) || 0;
    const radius = parseInt(document.getElementById('hr-settings-radius').value) || 100;
    const start = document.getElementById('hr-settings-start').value;
    const end = document.getElementById('hr-settings-end').value;

    state.companySettings.hrTelegramBotToken = token;
    state.companySettings.hrTelegramBotUsername = username;
    state.companySettings.hrTelegramGroupId = groupId;
    state.companySettings.hrOfficeLatitude = lat;
    state.companySettings.hrOfficeLongitude = lng;
    state.companySettings.hrOfficeRadius = radius;
    state.companySettings.hrWorkStart = start;
    state.companySettings.hrWorkEnd = end;

    saveStateToLocalStorage();
    alert("HR and Bot configurations saved successfully!");
  }

  function cleanupOldSelfies() {
    if (!state.attendance || state.attendance.length === 0) return;

    // Calculate cutoff date: current local date minus 45 days (1 month 15 days)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 45);
    
    // Get date string in YYYY-MM-DD format based on local time
    const year = cutoffDate.getFullYear();
    const month = String(cutoffDate.getMonth() + 1).padStart(2, '0');
    const day = String(cutoffDate.getDate()).padStart(2, '0');
    const cutoffDateStr = `${year}-${month}-${day}`;

    let changed = false;
    state.attendance.forEach(log => {
      if (log.date && log.date < cutoffDateStr) {
        let docChanged = false;
        const updatePayload = {};

        if (log.checkIn && log.checkIn.selfieUrl) {
          log.checkIn.selfieUrl = "";
          updatePayload["checkIn.selfieUrl"] = "";
          changed = true;
          docChanged = true;
        }
        if (log.checkOut && log.checkOut.selfieUrl) {
          log.checkOut.selfieUrl = "";
          updatePayload["checkOut.selfieUrl"] = "";
          changed = true;
          docChanged = true;
        }

        if (docChanged && state.firebaseDb && log.id) {
          state.firebaseDb.collection('attendance').doc(log.id).update(updatePayload)
            .catch(e => console.error(`Error updating direct selfie cleanup for ${log.id}:`, e));
        }
      }
    });

    if (changed) {
      console.log(`Auto-cleared old selfies (older than 45 days, cutoff: ${cutoffDateStr}). Saving updates to local cache...`);
      saveStateToLocalStorage();
    }
  }

  function sendDailySummaryReport() {
    const token = state.companySettings.hrTelegramBotToken;
    const groupId = state.companySettings.hrTelegramGroupId;

    if (!token) {
      alert(state.lang === 'en' ? "Please configure Telegram Bot Token in Settings first!" : "សូមកំណត់លេខកូដសម្ងាត់ Telegram Bot (Token) ក្នុង Settings ជាមុនសិន!");
      return;
    }
    if (!groupId) {
      alert(state.lang === 'en' ? "Please configure Telegram Group ID in Settings first!" : "សូមកំណត់ ID គ្រុប Telegram ក្នុង Settings ជាមុនសិន!");
      return;
    }

    // Get selected filter date, fallback to today
    let dateStr = document.getElementById('hr-attendance-date-filter').value;
    if (!dateStr) {
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const d = String(today.getDate()).padStart(2, '0');
      dateStr = `${y}-${m}-${d}`;
    }

    // Find logs for this date
    const dayLogs = state.attendance.filter(log => log.date === dateStr);
    const totalEmployees = state.employees.filter(e => e.status !== 'Resigned' && e.status !== 'Suspended').length;
    
    let presentCount = 0;
    let lateCount = 0;
    let checkInList = [];
    let leaveList = [];

    dayLogs.forEach(log => {
      const emp = state.employees.find(e => e.id === log.employeeId) || {};
      const empName = emp.fullName || log.employeeName || 'Unknown';
      if (log.checkIn) {
        presentCount++;
        const statusStr = log.checkIn.status === 'Late' ? '🔴 (Late)' : '🟢 (On Time)';
        if (log.checkIn.status === 'Late') lateCount++;
        checkInList.push(`- ${empName} (${log.employeeId}): ចូលម៉ោង ${log.checkIn.time} ${statusStr}`);
      }
    });

    // Find approved leaves for this date
    state.leaveRequests.forEach(req => {
      if (req.status === 'Approved' && dateStr >= req.startDate && dateStr <= req.endDate) {
        const emp = state.employees.find(e => e.id === req.employeeId) || {};
        const empName = emp.fullName || req.employeeName || 'Unknown';
        leaveList.push(`- ${empName} (${req.employeeId}): ច្បាប់ ${req.leaveType}`);
      }
    });

    const absentCount = Math.max(0, totalEmployees - presentCount - leaveList.length);

    // Build Khmer/English message text
    let messageText = `📊 **របាយការណ៍វត្តមានប្រចាំថ្ងៃ (Daily Attendance Report)**\n`;
    messageText += `📅 កាលបរិច្ឆេទ៖ ${dateStr}\n`;
    messageText += `━━━━━━━━━━━━━━━━━━━\n`;
    messageText += `👥 បុគ្គលិកសរុប៖ ${totalEmployees} នាក់\n`;
    messageText += `✅ វត្តមាន (Present)៖ ${presentCount} នាក់ (🔴 យឺត ${lateCount})\n`;
    messageText += `📝 ច្បាប់ (On Leave)៖ ${leaveList.length} នាក់\n`;
    messageText += `❌ អវត្តមាន (Absent)៖ ${absentCount} នាក់\n\n`;

    if (checkInList.length > 0) {
      messageText += `📥 **បញ្ជីឈ្មោះវត្តមាន (Present List):**\n`;
      messageText += checkInList.join('\n') + `\n\n`;
    }

    if (leaveList.length > 0) {
      messageText += `📝 **បញ្ជីឈ្មោះសុំច្បាប់ (Leave List):**\n`;
      messageText += leaveList.join('\n') + `\n\n`;
    }

    messageText += `📢 *របាយការណ៍ផ្ញើចេញដោយស្វ័យប្រវត្តពីប្រព័ន្ធ ABC System*`;

    // Send via fetch
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: groupId,
        text: messageText,
        parse_mode: 'Markdown'
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.ok) {
        alert(state.lang === 'en' ? "Daily summary report sent successfully to Telegram Group!" : "បានផ្ញើរបាយការណ៍សង្ខេបប្រចាំថ្ងៃទៅកាន់គ្រុប Telegram រួចរាល់!");
      } else {
        console.error("Telegram send summary error:", data);
        alert((state.lang === 'en' ? "Failed to send summary report to Telegram: " : "ការផ្ញើរបាយការណ៍សង្ខេបទៅ Telegram បានបរាជ័យ៖ ") + data.description);
      }
    })
    .catch(err => {
      console.error(err);
      alert(state.lang === 'en' ? "Failed to send summary report to Telegram. Please check settings." : "ការផ្ញើរបាយការណ៍សង្ខេបទៅ Telegram បានបរាជ័យ។ សូមពិនិត្យមើលការកំណត់ឡើងវិញ។");
    });
  }

  function notifyEmployeeTelegram(telegramId, text) {
    const token = state.companySettings.hrTelegramBotToken;
    if (!token || !telegramId) return;
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text: text
      })
    }).catch(err => console.error("Telegram notify error:", err));
  }

  // ==================== NEW ENTERPRISE HRMS UPGRADE LOGIC ====================

  let activeOrgSubTab = 'companies';
  function switchOrgSubTab(subTab) {
    activeOrgSubTab = subTab;
    const btns = ['companies', 'departments', 'teams', 'positions'];
    btns.forEach(b => {
      const btn = document.getElementById('btn-org-' + b);
      const panel = document.getElementById('org-' + b + '-panel');
      if (btn) btn.classList.toggle('active', b === subTab);
      if (panel) panel.style.display = b === subTab ? 'block' : 'none';
    });
    renderHROrg();
  }
  window.switchOrgSubTab = switchOrgSubTab;

  function renderHROrg() {
    populateEmployeeFormDropdowns();

    // Render Companies
    const compBody = document.getElementById('org-companies-list');
    if (compBody) {
      compBody.innerHTML = state.companies.map(c => `
        <tr>
          <td><strong>${c.name}</strong></td>
          <td>${c.taxId || 'N/A'}</td>
          <td>${c.address || 'N/A'}</td>
          <td>${c.phone || 'N/A'}</td>
          <td><button class="btn btn-sm btn-outline" onclick="deleteOrgItem('companies', '${c.id}')">🗑️</button></td>
        </tr>
      `).join('') || `<tr><td colspan="5" style="text-align:center;">No companies defined yet.</td></tr>`;
    }

    // Render Departments
    const deptBody = document.getElementById('org-depts-list');
    if (deptBody) {
      deptBody.innerHTML = state.departments.map(d => {
        const company = state.companies.find(c => c.id === d.companyId)?.name || 'N/A';
        return `
          <tr>
            <td><strong>${d.name}</strong></td>
            <td>${company}</td>
            <td>${d.manager || 'N/A'}</td>
            <td><button class="btn btn-sm btn-outline" onclick="deleteOrgItem('departments', '${d.id}')">🗑️</button></td>
          </tr>
        `;
      }).join('') || `<tr><td colspan="4" style="text-align:center;">No departments defined yet.</td></tr>`;
    }

    // Render Teams
    const teamBody = document.getElementById('org-teams-list');
    if (teamBody) {
      teamBody.innerHTML = state.teams.map(t => {
        const dept = state.departments.find(d => d.id === t.departmentId)?.name || 'N/A';
        return `
          <tr>
            <td><strong>${t.name}</strong></td>
            <td>${dept}</td>
            <td>${t.leader || 'N/A'}</td>
            <td><button class="btn btn-sm btn-outline" onclick="deleteOrgItem('teams', '${t.id}')">🗑️</button></td>
          </tr>
        `;
      }).join('') || `<tr><td colspan="4" style="text-align:center;">No teams defined yet.</td></tr>`;
    }

    // Render Positions
    const posBody = document.getElementById('org-positions-list');
    if (posBody) {
      posBody.innerHTML = state.positions.map(p => {
        const dept = state.departments.find(d => d.id === p.departmentId)?.name || 'N/A';
        return `
          <tr>
            <td><strong>${p.title}</strong></td>
            <td>${dept}</td>
            <td>$${p.baseSalary?.toFixed(2)}</td>
            <td><button class="btn btn-sm btn-outline" onclick="deleteOrgItem('positions', '${p.id}')">🗑️</button></td>
          </tr>
        `;
      }).join('') || `<tr><td colspan="4" style="text-align:center;">No positions defined yet.</td></tr>`;
    }
  }

  function deleteOrgItem(type, id) {
    if (!guardAction('delete')) return;
    if (confirm("Are you sure you want to delete this organizational unit?")) {
      const idx = state[type].findIndex(item => item.id === id);
      if (idx !== -1) {
        state[type].splice(idx, 1);
        saveStateToLocalStorage();
        renderHROrg();
      }
    }
  }
  window.deleteOrgItem = deleteOrgItem;

  function setupOrgEventListeners() {
    // Tab buttons
    ['companies', 'departments', 'teams', 'positions'].forEach(tab => {
      const btn = document.getElementById('btn-org-' + tab);
      if (btn) {
        btn.addEventListener('click', () => switchOrgSubTab(tab));
      }
    });

    const orgCompanyForm = document.getElementById('org-company-form');
    if (orgCompanyForm) {
      orgCompanyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('company-name').value.trim();
        const taxId = document.getElementById('company-tax-id').value.trim();
        const address = document.getElementById('company-address').value.trim();
        const phone = document.getElementById('company-phone').value.trim();
        const id = 'COMP' + String(state.companies.length + 1).padStart(3, '0');
        state.companies.push({ id, name, taxId, address, phone });
        saveStateToLocalStorage();
        orgCompanyForm.reset();
        renderHROrg();
        alert("Company saved successfully!");
      });
    }

    const orgDeptForm = document.getElementById('org-dept-form');
    if (orgDeptForm) {
      orgDeptForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('dept-name').value.trim();
        const companyId = document.getElementById('dept-company-id').value;
        const manager = document.getElementById('dept-manager').value.trim();
        const id = 'DEPT' + String(state.departments.length + 1).padStart(3, '0');
        state.departments.push({ id, name, companyId, manager });
        saveStateToLocalStorage();
        orgDeptForm.reset();
        renderHROrg();
        alert("Department saved successfully!");
      });
    }

    const orgTeamForm = document.getElementById('org-team-form');
    if (orgTeamForm) {
      orgTeamForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('team-name').value.trim();
        const departmentId = document.getElementById('team-dept-id').value;
        const leader = document.getElementById('team-leader').value.trim();
        const id = 'TEAM' + String(state.teams.length + 1).padStart(3, '0');
        state.teams.push({ id, name, departmentId, leader });
        saveStateToLocalStorage();
        orgTeamForm.reset();
        renderHROrg();
        alert("Team saved successfully!");
      });
    }

    const orgPositionForm = document.getElementById('org-position-form');
    if (orgPositionForm) {
      orgPositionForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = document.getElementById('pos-title').value.trim();
        const departmentId = document.getElementById('pos-dept-id').value;
        const baseSalary = parseFloat(document.getElementById('pos-base-salary').value) || 0;
        const id = 'POS' + String(state.positions.length + 1).padStart(3, '0');
        state.positions.push({ id, title, departmentId, baseSalary });
        saveStateToLocalStorage();
        orgPositionForm.reset();
        renderHROrg();
        alert("Position saved successfully!");
      });
    }
  }

  function renderHRPayroll() {
    const monthVal = document.getElementById('payroll-month-input')?.value || '';
    const tbody = document.getElementById('hr-payroll-table-body');
    if (!tbody) return;

    const items = state.payrollItems.filter(item => item.payrollId === `payroll_${monthVal}`);
    let totalNet = 0;

    tbody.innerHTML = items.map(item => {
      totalNet += item.netSalary || 0;
      const allowancesTotal = Object.values(item.allowances || {}).reduce((a, b) => a + b, 0);
      const deductionsTotal = Object.values(item.deductions || {}).reduce((a, b) => a + b, 0);
      
      return `
        <tr>
          <td><strong>${item.employeeId}</strong></td>
          <td>${item.employeeName}</td>
          <td>$${item.basicSalary?.toFixed(2)}</td>
          <td>$${allowancesTotal.toFixed(2)}</td>
          <td>$${item.overtimeAmount?.toFixed(2)}</td>
          <td>$${deductionsTotal.toFixed(2)}</td>
          <td><strong style="color: var(--primary);">$${item.netSalary?.toFixed(2)}</strong></td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="openPayslipModal('${item.id}')">📄 Payslip</button>
          </td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="8" style="text-align:center;">No payroll calculated for this month. Click "Run Payroll Calculation".</td></tr>`;

    const totalEl = document.getElementById('payroll-total-net-payout');
    if (totalEl) {
      totalEl.innerText = `$${totalNet.toFixed(2)}`;
    }
  }

  function runPayroll() {
    if (!guardAction('approve')) return;
    const monthVal = document.getElementById('payroll-month-input')?.value;
    if (!monthVal) {
      alert("Please select a month first!");
      return;
    }

    if (!confirm(`Are you sure you want to run payroll calculation for ${monthVal}?`)) {
      return;
    }

    state.employees.forEach(emp => {
      if (emp.status !== 'Active') return;

      const basicSalary = emp.salary || 0;
      const allowances = {
        position: emp.allowances?.position || 0,
        phone: emp.allowances?.phone || 0,
        fuel: emp.allowances?.fuel || 0,
        meal: emp.allowances?.meal || 0
      };
      const totalAllowances = allowances.position + allowances.phone + allowances.fuel + allowances.meal;

      const empLogs = state.attendance.filter(log => log.employeeId === emp.id && log.date?.startsWith(monthVal));
      let otHours = 0;
      let lateDaysCount = 0;
      let presentDaysCount = 0;

      empLogs.forEach(log => {
        presentDaysCount++;
        otHours += parseFloat(log.overtime) || 0;
        if (log.checkIn && log.checkIn.status === 'Late') {
          lateDaysCount++;
        }
      });

      const hourlyRate = basicSalary / 208;
      const overtimeAmount = hourlyRate * 1.5 * otHours;

      const lateDeductions = lateDaysCount * 2.0; 
      const expectedDays = 26;
      let absentDays = expectedDays - presentDaysCount;
      if (absentDays < 0) absentDays = 0;
      const absentDeductions = basicSalary * (absentDays / expectedDays);

      let nssfDeduction = 0;
      if (emp.nssfInfo && emp.nssfInfo.nssfCardNumber) {
        if (emp.nssfInfo.healthInsurance) nssfDeduction += 5.0;
        if (emp.nssfInfo.occupationalRisk) nssfDeduction += 2.0;
        if (emp.nssfInfo.pensionScheme) nssfDeduction += 5.0;
      }

      const grossSalary = basicSalary + totalAllowances + overtimeAmount - (lateDeductions + absentDeductions);

      let taxDeduction = 0;
      if (grossSalary > 375) {
        if (grossSalary <= 500) {
          taxDeduction = (grossSalary - 375) * 0.05;
        } else if (grossSalary <= 2125) {
          taxDeduction = (500 - 375) * 0.05 + (grossSalary - 500) * 0.10;
        } else {
          taxDeduction = (500 - 375) * 0.05 + (2125 - 500) * 0.10 + (grossSalary - 2125) * 0.20;
        }
      }

      const netSalary = grossSalary - taxDeduction - nssfDeduction;

      const payrollItemId = `payitem_${emp.id}_${monthVal}`;
      const payrollItem = {
        id: payrollItemId,
        payrollId: `payroll_${monthVal}`,
        employeeId: emp.id,
        employeeName: emp.fullName,
        basicSalary,
        allowances,
        overtimeHours: otHours,
        overtimeAmount,
        deductions: {
          late: lateDeductions,
          absent: absentDeductions,
          nssf: nssfDeduction,
          tax: taxDeduction
        },
        netSalary,
        status: 'Approved',
        timestamp: new Date().toISOString()
      };

      const existingIdx = state.payrollItems.findIndex(item => item.id === payrollItemId);
      if (existingIdx !== -1) {
        state.payrollItems[existingIdx] = payrollItem;
      } else {
        state.payrollItems.push(payrollItem);
      }
    });

    saveStateToLocalStorage();
    renderHRPayroll();
    alert("Payroll calculated successfully for " + monthVal + "!");
  }

  function exportPayrollCSV() {
    const monthVal = document.getElementById('payroll-month-input')?.value;
    if (!monthVal) {
      alert("Please select a month first!");
      return;
    }
    const items = state.payrollItems.filter(item => item.payrollId === `payroll_${monthVal}`);
    if (items.length === 0) {
      alert("No calculated payroll items for this month.");
      return;
    }

    let csv = "Employee ID,Name,Basic Salary,Position Allowance,Phone Allowance,Fuel Allowance,Meal Allowance,OT Hours,OT Amount,Late Deductions,Absent Deductions,NSSF,Tax,Net Salary\n";
    items.forEach(i => {
      csv += `"${i.employeeId}","${i.employeeName}",${i.basicSalary},${i.allowances?.position || 0},${i.allowances?.phone || 0},${i.allowances?.fuel || 0},${i.allowances?.meal || 0},${i.overtimeHours || 0},${i.overtimeAmount.toFixed(2)},${i.deductions?.late || 0},${i.deductions?.absent.toFixed(2)},${i.deductions?.nssf || 0},${i.deductions?.tax.toFixed(2)},${i.netSalary.toFixed(2)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `payroll_summary_${monthVal}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  let activePayslipId = '';
  function openPayslipModal(payrollItemId) {
    const item = state.payrollItems.find(x => x.id === payrollItemId);
    if (!item) return;

    activePayslipId = payrollItemId;
    const emp = state.employees.find(e => e.id === item.employeeId);
    const companyName = state.companies.find(c => c.id === emp?.companyId)?.name || 'ABC Enterprise Co., Ltd.';

    const allowancesTotal = Object.values(item.allowances || {}).reduce((a, b) => a + b, 0);
    const deductionsTotal = Object.values(item.deductions || {}).reduce((a, b) => a + b, 0);

    const payslipHtml = `
      <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #333;">${companyName}</h2>
        <p style="margin: 5px 0; color: #666; font-size: 13px;">Salary Pay Slip</p>
        <strong style="color: #333;">Month: ${item.payrollId.replace('payroll_', '')}</strong>
      </div>
      
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
        <tr>
          <td style="padding: 4px 0; font-weight: bold;">Employee ID:</td>
          <td style="padding: 4px 0;">${item.employeeId}</td>
          <td style="padding: 4px 0; font-weight: bold;">Bank Name:</td>
          <td style="padding: 4px 0;">${emp?.bankInfo?.bankName || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; font-weight: bold;">Full Name:</td>
          <td style="padding: 4px 0;">${item.employeeName}</td>
          <td style="padding: 4px 0; font-weight: bold;">Account Name:</td>
          <td style="padding: 4px 0;">${emp?.bankInfo?.accountName || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; font-weight: bold;">Position:</td>
          <td style="padding: 4px 0;">${emp?.position || 'N/A'}</td>
          <td style="padding: 4px 0; font-weight: bold;">Account No:</td>
          <td style="padding: 4px 0;">${emp?.bankInfo?.accountNumber || 'N/A'}</td>
        </tr>
      </table>

      <h4 style="margin: 10px 0 5px 0; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 4px;">Earnings</h4>
      <table style="width: 100%; font-size: 14px; margin-bottom: 15px;">
        <tr>
          <td>Basic Salary</td>
          <td style="text-align: right; font-weight: bold;">$${item.basicSalary.toFixed(2)}</td>
        </tr>
        <tr>
          <td>Position Allowance</td>
          <td style="text-align: right;">$${(item.allowances?.position || 0).toFixed(2)}</td>
        </tr>
        <tr>
          <td>Phone Allowance</td>
          <td style="text-align: right;">$${(item.allowances?.phone || 0).toFixed(2)}</td>
        </tr>
        <tr>
          <td>Fuel Allowance</td>
          <td style="text-align: right;">$${(item.allowances?.fuel || 0).toFixed(2)}</td>
        </tr>
        <tr>
          <td>Meal Allowance</td>
          <td style="text-align: right;">$${(item.allowances?.meal || 0).toFixed(2)}</td>
        </tr>
        <tr>
          <td>Overtime (${item.overtimeHours || 0} hrs)</td>
          <td style="text-align: right;">$${item.overtimeAmount.toFixed(2)}</td>
        </tr>
        <tr style="font-weight: bold; border-top: 1px dashed #ccc;">
          <td>Total Earnings</td>
          <td style="text-align: right;">$${(item.basicSalary + allowancesTotal + item.overtimeAmount).toFixed(2)}</td>
        </tr>
      </table>

      <h4 style="margin: 10px 0 5px 0; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 4px;">Deductions</h4>
      <table style="width: 100%; font-size: 14px; margin-bottom: 15px;">
        <tr>
          <td>Late Deductions</td>
          <td style="text-align: right; color: #c00;">$${(item.deductions?.late || 0).toFixed(2)}</td>
        </tr>
        <tr>
          <td>Absent Deductions</td>
          <td style="text-align: right; color: #c00;">$${(item.deductions?.absent || 0).toFixed(2)}</td>
        </tr>
        <tr>
          <td>NSSF Contribution</td>
          <td style="text-align: right; color: #c00;">$${(item.deductions?.nssf || 0).toFixed(2)}</td>
        </tr>
        <tr>
          <td>Salary Tax</td>
          <td style="text-align: right; color: #c00;">$${(item.deductions?.tax || 0).toFixed(2)}</td>
        </tr>
        <tr style="font-weight: bold; border-top: 1px dashed #ccc;">
          <td>Total Deductions</td>
          <td style="text-align: right; color: #c00;">$${deductionsTotal.toFixed(2)}</td>
        </tr>
      </table>

      <div style="border-top: 2px solid #333; padding-top: 10px; margin-top: 20px; display: flex; justify-content: space-between; font-size: 16px; font-weight: bold;">
        <span>Net Salary Payout:</span>
        <span style="color: #4f46e5;">$${item.netSalary.toFixed(2)}</span>
      </div>
    `;

    const printArea = document.getElementById('payslip-print-area');
    if (printArea) {
      printArea.innerHTML = payslipHtml;
    }

    document.getElementById('modal-payslip-details').classList.add('active-modal');
  }
  window.openPayslipModal = openPayslipModal;

  function printPayslip() {
    const printContent = document.getElementById('payslip-print-area').innerHTML;
    const win = window.open('', '_blank');
    win.document.write('<html><head><title>Payslip Print</title></head><body onload="window.print();window.close();">');
    win.document.write(printContent);
    win.document.write('</body></html>');
    win.document.close();
  }

  function sendPayslipToTelegram() {
    const item = state.payrollItems.find(x => x.id === activePayslipId);
    if (!item) return;

    const emp = state.employees.find(e => e.id === item.employeeId);
    if (!emp || !emp.telegramId) {
      alert("This employee does not have a linked Telegram account!");
      return;
    }

    const token = state.companySettings.hrTelegramBotToken || state.companySettings.telegramToken;
    if (!token) {
      alert("Telegram Bot Token is not configured!");
      return;
    }

    const allowancesTotal = Object.values(item.allowances || {}).reduce((a, b) => a + b, 0);
    const deductionsTotal = Object.values(item.deductions || {}).reduce((a, b) => a + b, 0);

    const payslipMsg = `📄 **ប័ណ្ណបើកប្រាក់បៀវត្សរ៍ (Pay Slip)**\n\n` +
      `👤 ឈ្មោះ៖ ${item.employeeName} (${item.employeeId})\n` +
      `📅 សម្រាប់ខែ៖ ${item.payrollId.replace('payroll_', '')}\n` +
      `------------------------\n` +
      `💵 ប្រាក់ខែគោល៖ $${item.basicSalary.toFixed(2)}\n` +
      `➕ ប្រាក់ឧបត្ថម្ភសរុប៖ $${allowancesTotal.toFixed(2)}\n` +
      `➕ ម៉ោងបន្ថែម OT (${item.overtimeHours || 0}h)៖ $${item.overtimeAmount.toFixed(2)}\n` +
      `➖ ការកាត់កាត់យឺត/អវត្តមាន៖ $${((item.deductions?.late || 0) + (item.deductions?.absent || 0)).toFixed(2)}\n` +
      `➖ ការកាត់ ប.ស.ស (NSSF)៖ $${(item.deductions?.nssf || 0).toFixed(2)}\n` +
      `➖ ពន្ធលើប្រាក់បៀវត្សរ៍៖ $${(item.deductions?.tax || 0).toFixed(2)}\n` +
      `------------------------\n` +
      `💰 **ប្រាក់ខែទទួលបានពិតប្រាកដ (Net)៖ $${item.netSalary.toFixed(2)}**`;

    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: emp.telegramId,
        text: payslipMsg
      })
    }).then(res => res.json()).then(data => {
      if (data.ok) {
        alert("Payslip successfully sent to employee via Telegram Bot!");
      } else {
        alert("Failed to send payslip to Telegram: " + data.description);
      }
    }).catch(err => {
      alert("Error sending payslip: " + err.message);
    });
  }

  function setupPayrollEventListeners() {
    const btnRun = document.getElementById('btn-run-payroll');
    if (btnRun) btnRun.addEventListener('click', runPayroll);

    const btnExport = document.getElementById('btn-export-payroll-csv');
    if (btnExport) btnExport.addEventListener('click', exportPayrollCSV);

    const btnClose1 = document.getElementById('btn-close-payslip-details');
    if (btnClose1) {
      btnClose1.addEventListener('click', () => {
        document.getElementById('modal-payslip-details').classList.remove('active-modal');
      });
    }
    const btnClose2 = document.getElementById('btn-close-payslip-modal-btn');
    if (btnClose2) {
      btnClose2.addEventListener('click', () => {
        document.getElementById('modal-payslip-details').classList.remove('active-modal');
      });
    }

    const btnPrint = document.getElementById('btn-print-payslip');
    if (btnPrint) btnPrint.addEventListener('click', printPayslip);

    const btnSend = document.getElementById('btn-send-payslip-telegram');
    if (btnSend) btnSend.addEventListener('click', sendPayslipToTelegram);

    // Pre-fill month
    const monthInput = document.getElementById('payroll-month-input');
    if (monthInput && !monthInput.value) {
      const d = new Date();
      monthInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  function renderHRPerformance() {
    const tbody = document.getElementById('hr-performance-table-body');
    if (!tbody) return;

    const currentMonth = new Date().toISOString().slice(0, 7);

    tbody.innerHTML = state.employees.map(emp => {
      const empKpis = state.kpis.filter(k => k.employeeId === emp.id);
      const currentEval = empKpis.find(k => k.month === currentMonth);
      const lastEval = empKpis.length > 0 ? empKpis[empKpis.length - 1] : null;

      let scoreStr = 'Not Evaluated';
      let gradeStr = 'N/A';
      if (currentEval) {
        scoreStr = `${currentEval.score}%`;
        gradeStr = getKpiGrade(currentEval.score);
      }

      let lastEvalStr = 'None';
      if (lastEval) {
        lastEvalStr = `${lastEval.month} (Score: ${lastEval.score}%)`;
      }

      return `
        <tr>
          <td><strong>${emp.id}</strong></td>
          <td>${emp.fullName}</td>
          <td>${emp.position || 'N/A'}</td>
          <td>${currentMonth}</td>
          <td><strong style="color: ${currentEval ? 'var(--primary)' : 'var(--text-secondary)'};">${scoreStr}</strong></td>
          <td><span class="status-badge" style="background: ${getKpiGradeColor(gradeStr)}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px;">${gradeStr}</span></td>
          <td>${lastEvalStr}</td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="openKpiEvalModal('${emp.id}')">✍️ Evaluate</button>
          </td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="8" style="text-align:center;">No employees in the database.</td></tr>`;
  }

  function getKpiGrade(score) {
    if (score >= 90) return 'Grade A (Outstanding)';
    if (score >= 80) return 'Grade B (Excellent)';
    if (score >= 70) return 'Grade C (Good)';
    if (score >= 50) return 'Grade D (Satisfactory)';
    return 'Grade F (Fail)';
  }

  function getKpiGradeColor(grade) {
    if (grade.includes('Grade A')) return 'linear-gradient(135deg, #10b981, #059669)';
    if (grade.includes('Grade B')) return 'linear-gradient(135deg, #3b82f6, #2563eb)';
    if (grade.includes('Grade C')) return 'linear-gradient(135deg, #f59e0b, #d97706)';
    if (grade.includes('Grade D')) return 'linear-gradient(135deg, #8b5cf6, #7c3aed)';
    return 'linear-gradient(135deg, #ef4444, #dc2626)';
  }

  function openKpiEvalModal(empId) {
    if (!guardAction('edit')) return;
    const emp = state.employees.find(e => e.id === empId);
    if (!emp) return;

    document.getElementById('kpi-eval-employee-id').value = emp.id;
    document.getElementById('kpi-eval-employee-name').value = emp.fullName;
    
    const d = new Date();
    document.getElementById('kpi-eval-month').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('kpi-eval-goal-score').value = '';
    document.getElementById('kpi-eval-competency-score').value = '';
    document.getElementById('kpi-eval-comment').value = '';

    document.getElementById('modal-kpi-evaluation').classList.add('active-modal');
  }
  window.openKpiEvalModal = openKpiEvalModal;

  function saveKpiEvaluation() {
    const empId = document.getElementById('kpi-eval-employee-id').value;
    const month = document.getElementById('kpi-eval-month').value;
    const goalScore = parseFloat(document.getElementById('kpi-eval-goal-score').value) || 0;
    const competencyScore = parseFloat(document.getElementById('kpi-eval-competency-score').value) || 0;
    const comment = document.getElementById('kpi-eval-comment').value.trim();

    if (!month) {
      alert("Please select evaluation month.");
      return;
    }

    const overallScore = Math.round((goalScore + competencyScore) / 2);
    const kpiId = `kpi_${empId}_${month}`;

    const newKpi = {
      id: kpiId,
      employeeId: empId,
      month,
      goals: [
        { title: "Goal Achievement", score: goalScore },
        { title: "Core Competency", score: competencyScore }
      ],
      score: overallScore,
      managerScore: overallScore,
      managerComment: comment,
      status: 'Completed',
      timestamp: new Date().toISOString()
    };

    const existingIdx = state.kpis.findIndex(k => k.id === kpiId);
    if (existingIdx !== -1) {
      state.kpis[existingIdx] = newKpi;
    } else {
      state.kpis.push(newKpi);
    }

    saveStateToLocalStorage();
    document.getElementById('modal-kpi-evaluation').classList.remove('active-modal');
    renderHRPerformance();
    alert("KPI evaluation saved successfully!");
  }

  function setupKpiEventListeners() {
    const btnClose = document.getElementById('btn-close-kpi-eval');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        document.getElementById('modal-kpi-evaluation').classList.remove('active-modal');
      });
    }
    const btnCancel = document.getElementById('btn-cancel-kpi-eval');
    if (btnCancel) {
      btnCancel.addEventListener('click', () => {
        document.getElementById('modal-kpi-evaluation').classList.remove('active-modal');
      });
    }

    const form = document.getElementById('kpi-evaluation-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveKpiEvaluation();
      });
    }
  }

  function renderHRAdminSecurity() {
    const perms = state.companySettings.rolePermissions || {};
    const roles = ['branch_admin', 'sales_staff', 'warehouse_staff', 'accountant'];
    const actions = ['view', 'add', 'edit', 'delete', 'approve', 'settings'];

    roles.forEach(role => {
      actions.forEach(action => {
        const checkbox = document.querySelector(`.rbac-checkbox[data-role="${role}"][data-action="${action}"]`);
        if (checkbox) {
          checkbox.checked = perms[role] ? !!perms[role][action] : false;
        }
      });
    });
  }

  function saveSecurityPermissions() {
    if (!guardAction('settings')) return;
    const perms = state.companySettings.rolePermissions || {};
    const roles = ['branch_admin', 'sales_staff', 'warehouse_staff', 'accountant'];
    const actions = ['view', 'add', 'edit', 'delete', 'approve', 'settings'];

    roles.forEach(role => {
      if (!perms[role]) perms[role] = {};
      actions.forEach(action => {
        const checkbox = document.querySelector(`.rbac-checkbox[data-role="${role}"][data-action="${action}"]`);
        perms[role][action] = checkbox ? checkbox.checked : false;
      });
    });

    state.companySettings.rolePermissions = perms;
    saveStateToLocalStorage();
    alert("Security RBAC Permissions Matrix saved successfully!");
  }

  function setupSecurityEventListeners() {
    const btnSave = document.getElementById('btn-save-rbac');
    if (btnSave) btnSave.addEventListener('click', saveSecurityPermissions);
  }

  // ==================== END HRMS UPGRADE LOGIC ====================

  // Bind main DOM event
  document.addEventListener('DOMContentLoaded', () => {
    console.log("=== STARTUP DATABASE DIAGNOSTICS ===");
    console.log("abc_transactions in storage:", safeGetItem('abc_transactions'));
    console.log("abc_products in storage:", safeGetItem('abc_products'));
    console.log("Firebase enabled:", state.companySettings ? state.companySettings.firebaseEnabled : "no settings");
    console.log("=====================================");
    initLocalStorageData();
    initFirebaseSync();
    setupRouting();
    setupLanguageSelector();
    setupClock();
    setupEventListeners();
    setupLoginHandler();
    setupOrgEventListeners();
    setupPayrollEventListeners();
    setupKpiEventListeners();
    setupSecurityEventListeners();
    
    translateApp();
    renderCurrentView();
    updateLowStockAlertCount();
    populatePOSSelects();
    updateRoadmapVisibility();
    checkCRMNotifications();
  });

})();
