import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getFirestore, doc, getDoc, setDoc, updateDoc, 
  collection, query, where, getDocs, addDoc, orderBy, limit,
  getCountFromServer
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCGVfZo-Hpc-wdQv21he4Js0K3RuyZ3VQ",
  authDomain: "abc-system-2c0e4.firebaseapp.com",
  projectId: "abc-system-2c0e4",
  storageBucket: "abc-system-2c0e4.firebasestorage.app",
  messagingSenderId: "1078178677076",
  appId: "1:1078178677076:web:b2953a455bd930460848c1",
  measurementId: "G-QXTYZTKC6T"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

// Haversine formula to calculate distance in meters between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // in metres
}

// Helper to make API requests to Telegram
async function sendTelegram(token, method, payload) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return response.json();
}

// Download Telegram file and convert to base64
async function downloadTelegramFileAsBase64(token, fileId) {
  try {
    const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const fileInfo = await fileInfoRes.json();
    if (!fileInfo.ok || !fileInfo.result.file_path) return null;

    const fileUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.result.file_path}`;
    const fileRes = await fetch(fileUrl);
    const arrayBuffer = await fileRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.error("File download error:", error);
    return null;
  }
}

function getMenuMarkup(req, empId, chatId) {
  return {
    keyboard: [
      [{ text: "✅ ចូលការងារ (Check-In)" }, { text: "✅ ចេញការងារ (Check-Out)" }],
      [{ text: "📝 សុំច្បាប់ (Leave)" }, { text: "🕒 សុំម៉ោងបន្ថែម (OT)" }],
      [{ text: "📄 ប័ណ្ណបើកប្រាក់ខែ" }, { text: "🏢 ក្រុមហ៊ុនខ្ញុំ (Company)" }],
      [{ text: "👤 ព័ត៌មានខ្ញុំ (Profile)" }, { text: "📅 ប្រវត្តិវត្តមាន" }],
      [{ text: "📢 សេចក្ដីជូនដំណឹង" }, { text: "☎️ ទាក់ទង Admin" }]
    ],
    resize_keyboard: true
  };
}

function getSalesMenuMarkup(req, empId, chatId) {
  const host = req.headers["host"] || req.headers["x-forwarded-host"] || "khmer-pos-system.vercel.app";
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const storeAppUrl = `${protocol}://${host}/telegram-store.html?employeeId=${empId || ""}&chatId=${chatId}&bot=sales&v=1.5.2`;
  return {
    keyboard: [
      [{ text: "🛍️ ដាក់ការបញ្ជាទិញ (Order)", web_app: { url: storeAppUrl } }]
    ],
    resize_keyboard: true
  };
}

async function handleWebAppOrder(req, res, body) {
  const { employeeId, chatId, branchId, cart, customerName, customerPhone, customerAddress, discountPercent, shippingFee } = body;

  try {
    const db = getFirestore(app);

    // Load settings
    const settingsSnap = await getDoc(doc(db, "company_settings", "global"));
    const settings = settingsSnap.exists() ? settingsSnap.data() : {};
    
    const botType = body.bot || req.query.bot || 'attendance';
    const token = botType === 'sales'
      ? (settings.salesTelegramBotToken || settings.hrTelegramBotToken || settings.telegramToken)
      : (settings.hrTelegramBotToken || settings.telegramToken);

    if (!token) {
      return res.status(400).json({ error: "Missing Telegram Bot token configuration." });
    }

    // Load employee details
    const employeesRef = collection(db, "employees");
    const empQuery = query(employeesRef, where("id", "==", employeeId));
    const empSnap = await getDocs(empQuery);
    let employee = null;
    empSnap.forEach(d => {
      employee = { docId: d.id, ...d.data() };
    });

    if (!employee) {
      return res.status(400).json({ error: "Employee profile not found in system." });
    }

    // Resolve employee's company (Requirement 10)
    let companyName = "";
    if (employee.companyId) {
      try {
        const compSnap = await getDoc(doc(db, "companies", employee.companyId));
        if (compSnap.exists()) {
          companyName = compSnap.data().name || "";
        }
      } catch (err) {
        console.error("Error fetching company info for Telegram bot:", err);
      }
    }
    
    // Fallback: if no company linked but companies exist in Firestore, use the first company
    if (!companyName) {
      try {
        const compColl = collection(db, "companies");
        const compSnap = await getDocs(compColl);
        if (!compSnap.empty) {
          companyName = compSnap.docs[0].data().name || "";
        }
      } catch (err) {
        console.error("Error fetching fallback company info:", err);
      }
    }

    // Resolve branch details dynamically
    let branchName = branchId === "BR-001" ? "Phnom Penh HQ" : branchId === "BR-002" ? "Siem Reap" : "Sihanoukville";
    try {
      const branchSnap = await getDoc(doc(db, "branches", branchId));
      if (branchSnap.exists()) {
        const bData = branchSnap.data();
        branchName = bData.nameKh || bData.name || branchName;
      }
    } catch (err) {
      console.error("Error fetching branch info for Telegram bot:", err);
    }

    // Fetch all products in cart and prepare lines
    const txCountSnap = await getCountFromServer(collection(db, "transactions"));
    const nextTxNum = 1000 + txCountSnap.data().count + 1;
    const randSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();
    const txId = "TX-" + nextTxNum + "-" + randSuffix;
    const invoiceNo = (settings.invoicePrefix || "INV-2026-") + nextTxNum + "-" + randSuffix;

    let subtotal = 0;
    const items = [];
    const stockUpdates = [];

    for (const item of cart) {
      const prodRef = doc(db, "products", item.sku);
      const prodSnap = await getDoc(prodRef);
      if (!prodSnap.exists()) {
        return res.status(400).json({ error: `Product SKU ${item.sku} not found.` });
      }

      const p = prodSnap.data();
      let currentBranchQty = p.warehouseStock ? (p.warehouseStock[branchId] || 0) : 0;
      
      // Auto-Split in storefront checkout
      if (currentBranchQty < item.qty) {
        let parentSku = null;
        if (item.sku.endsWith("-SHEET")) {
          parentSku = item.sku.replace("-SHEET", "-BOX");
        } else if (item.sku === "HM-SHEET") {
          parentSku = "HM-BOX";
        }

        if (parentSku) {
          const parentRef = doc(db, "products", parentSku);
          const parentSnap = await getDoc(parentRef);
          if (parentSnap.exists()) {
            const parentData = parentSnap.data();
            const boxStock = parentData.warehouseStock ? (parentData.warehouseStock[branchId] || 0) : 0;
            const ratio = 5;
            const missingQty = item.qty - currentBranchQty;
            const boxesNeeded = Math.ceil(missingQty / ratio);

            if (boxesNeeded <= boxStock) {
              const updatedParentStock = { ...parentData.warehouseStock };
              updatedParentStock[branchId] = boxStock - boxesNeeded;
              let parentSum = 0;
              for (const b in updatedParentStock) parentSum += parseInt(updatedParentStock[b]) || 0;

              await updateDoc(parentRef, {
                warehouseStock: updatedParentStock,
                stockQty: parentSum
              });

              const slgSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();
              await setDoc(doc(db, "stock_logs", `SLG-${nextTxNum}-P-${slgSuffix}`), {
                id: `SLG-${nextTxNum}-P-${slgSuffix}`,
                date: new Date().toISOString(),
                sku: parentSku,
                type: "adjustment",
                qty: -boxesNeeded,
                warehouseId: branchId,
                description: `Auto-Split (Storefront Checkout): Deduct ${boxesNeeded} box(es) to split into ${boxesNeeded * ratio} units of ${item.sku}`,
                branchId: branchId,
                createdBy: "storefront",
                updatedBy: "storefront",
                timestamp: new Date().toISOString()
              });

              await setDoc(doc(db, "stock_logs", `SLG-${nextTxNum}-U-${slgSuffix}`), {
                id: `SLG-${nextTxNum}-U-${slgSuffix}`,
                date: new Date().toISOString(),
                sku: item.sku,
                type: "replenishment",
                qty: boxesNeeded * ratio,
                warehouseId: branchId,
                description: `Auto-Split (Storefront Checkout): Add ${boxesNeeded * ratio} units converted from ${boxesNeeded} box(es) of ${parentSku}`,
                branchId: branchId,
                createdBy: "storefront",
                updatedBy: "storefront",
                timestamp: new Date().toISOString()
              });

              if (!p.warehouseStock) p.warehouseStock = {};
              p.warehouseStock[branchId] = currentBranchQty + (boxesNeeded * ratio);
              currentBranchQty = p.warehouseStock[branchId];
            }
          }
        }
      }

      if (currentBranchQty < item.qty) {
        return res.status(400).json({ error: `Product "${p.nameKh || p.nameEn}" is out of stock in selected branch.` });
      }

      const itemTotal = p.sellingPrice * item.qty;
      subtotal += itemTotal;

      items.push({
        sku: item.sku,
        nameEn: p.nameEn,
        nameKh: p.nameKh || p.nameEn,
        price: p.sellingPrice,
        costPrice: p.costPrice || 0,
        qty: item.qty,
        total: itemTotal
      });

      // Deduct warehouse stock
      const updatedWarehouseStock = { ...p.warehouseStock };
      updatedWarehouseStock[branchId] = Math.max(0, currentBranchQty - item.qty);
      
      let sumQty = 0;
      for (const b in updatedWarehouseStock) {
        sumQty += parseInt(updatedWarehouseStock[b]) || 0;
      }

      stockUpdates.push({
        sku: item.sku,
        warehouseStock: updatedWarehouseStock,
        stockQty: sumQty
      });
    }

    // Calculate totals
    const discPercent = parseFloat(discountPercent) || 0;
    const discAmount = parseFloat((subtotal * (discPercent / 100)).toFixed(2));
    const shipping = parseFloat(shippingFee) || 0;
    
    // Tax calculation
    const vatRate = settings.vatEnabled ? (parseFloat(settings.defaultVatRate) || 0) : 0;
    const afterDiscount = subtotal - discAmount;
    const tax = parseFloat((afterDiscount * (vatRate / 100)).toFixed(2));
    const total = parseFloat((afterDiscount + tax + shipping).toFixed(2));

    const chosenPaymentMethod = body.paymentMethod || "COD (Cash on Delivery)";
    const isDebt = chosenPaymentMethod === "On Account (Debt)" || chosenPaymentMethod === "COD (Cash on Delivery)";

    // Update Product Stocks and Log Movements
    const stockLogColl = collection(db, "stock_logs");
    const stockLogCountSnap = await getCountFromServer(stockLogColl);
    let nextStockLogNum = 1000 + stockLogCountSnap.data().count + 1;

    for (let i = 0; i < stockUpdates.length; i++) {
      const update = stockUpdates[i];
      const cartItem = cart[i];
      
      // Update Firestore Product
      await updateDoc(doc(db, "products", update.sku), {
        warehouseStock: update.warehouseStock,
        stockQty: update.stockQty
      });

      // Log Stock Movement
      const logId = "SLG-" + nextStockLogNum + "-" + randSuffix;
      nextStockLogNum++;
      
      await setDoc(doc(db, "stock_logs", logId), {
        id: logId,
        date: new Date().toISOString(),
        sku: update.sku,
        type: 'sale',
        qty: -cartItem.qty,
        warehouseId: branchId,
        description: `Sold via Telegram WebApp Invoice ${invoiceNo}`,
        branchId: branchId,
        createdBy: employee.fullName,
        updatedBy: employee.fullName,
        timestamp: new Date().toISOString()
      });
    }

    // Determine customer and update/create in Firestore
    let customerId = "CST-001";
    let customerNameStr = "General Customer";
    let purchaseCountVal = 1;
    
    if (customerPhone && customerPhone !== "-") {
      const customersRef = collection(db, "customers");
      const custQuery = query(customersRef, where("phone", "==", customerPhone));
      const custSnap = await getDocs(custQuery);
      
      let existingCust = null;
      custSnap.forEach(d => {
        existingCust = { docId: d.id, ...d.data() };
      });
      
      if (existingCust) {
        customerId = existingCust.id;
        customerNameStr = existingCust.name;
        
        // Update purchase count
        const newCount = (existingCust.purchaseCount || 0) + 1;
        purchaseCountVal = newCount;
        const timeline = existingCust.timeline || [];
        timeline.push({
          date: new Date().toISOString(),
          status: 'Purchase',
          staffName: employee.fullName,
          feedback: 'Purchase placed via Telegram bot',
          notes: `Ordered via Telegram WebApp`
        });
        
        const updatePayload = {
          purchaseCount: newCount,
          timeline: timeline
        };
        if (isDebt) {
          updatePayload.outstandingDebt = (existingCust.outstandingDebt || 0) + total;
        }
        if (!existingCust.staffId) {
          updatePayload.staffId = employee.id;
        }
        if (req.body.customerFacebook && !existingCust.facebookLink) {
          updatePayload.facebookLink = req.body.customerFacebook;
        }
        if (customerAddress && customerAddress !== "-" && customerAddress !== existingCust.address) {
          updatePayload.address = customerAddress;
        }
        if (req.body.customerNotes) {
          updatePayload.notes = req.body.customerNotes;
        }
        if (req.body.customerSource && (!existingCust.source || existingCust.source === "Telegram Bot")) {
          updatePayload.source = req.body.customerSource;
        }
        
        await updateDoc(doc(db, "customers", existingCust.docId), updatePayload);
      } else {
        // Create new customer
        purchaseCountVal = 1;
        const custCountSnap = await getCountFromServer(customersRef);
        const nextCustNum = 1000 + custCountSnap.data().count + 1;
        customerId = "CST-" + nextCustNum;
        customerNameStr = customerName || "New Customer";
        
        const newCustData = {
          id: customerId,
          name: customerNameStr,
          phone: customerPhone,
          facebookLink: req.body.customerFacebook || "",
          address: customerAddress || "-",
          source: req.body.customerSource || "Facebook Page",
          outstandingDebt: isDebt ? total : 0,
          status: "active",
          notes: req.body.customerNotes || "Registered via Telegram bot sales ordering",
          rank: "Bronze",
          purchaseCount: 1,
          staffId: employee.id, // Assign the employee who created the customer!
          timeline: [
            {
              date: new Date().toISOString(),
              status: 'Register & Purchase',
              staffName: employee.fullName,
              feedback: 'Registered and ordered via Telegram Bot',
              notes: `Registered via Telegram WebApp`
            }
          ]
        };
        
        await setDoc(doc(db, "customers", customerId), newCustData);
      }
    }

    // Write Transaction Record
    const newTX = {
      id: txId,
      invoiceNo: invoiceNo,
      date: new Date().toISOString(),
      staffId: employee.id,
      staffName: employee.fullName,
      pageName: "Telegram Store",
      pageId: "TG-STORE",
      customerId: customerId,
      customerName: customerNameStr,
      branchId: branchId,
      items: items,
      subtotal: subtotal,
      discountPercent: discPercent,
      discountFixed: discAmount,
      shippingFee: shipping,
      taxRate: vatRate,
      taxAmount: tax,
      total: total,
      paymentMethod: chosenPaymentMethod,
      cashReceived: isDebt ? 0 : total,
      changeDue: 0,
      outstandingDebt: isDebt ? total : 0,
      status: "completed",
      createdBy: employee.fullName,
      updatedBy: employee.fullName,
      timestamp: new Date().toISOString()
    };

    await setDoc(doc(db, "transactions", txId), newTX);

    // Helpers for Khmer numerals, HTML escaping, and Date formatting
    const khmerNumbers = ["០", "១", "២", "៣", "៤", "៥", "៦", "៧", "៨", "៩"];
    const toKhmerNum = (num) => String(num).split('').map(char => khmerNumbers[parseInt(char)] || char).join('');
    const esc = (text) => (text || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Formatting date and time (Cambodia Time, UTC+7)
    let orderDateKh = "";
    let orderDateEn = "";
    try {
      const now = new Date();
      const options = { timeZone: "Asia/Phnom_Penh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false };
      const formatter = new Intl.DateTimeFormat("en-US", options);
      const parts = formatter.formatToParts(now);
      const partMap = {};
      parts.forEach(p => partMap[p.type] = p.value);
      
      const day = parseInt(partMap.day);
      const monthIndex = parseInt(partMap.month) - 1;
      const year = parseInt(partMap.year);
      const hours = partMap.hour;
      const minutes = partMap.minute;

      const khmerMonths = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];
      const enMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      orderDateKh = `${toKhmerNum(day)}-${khmerMonths[monthIndex]}-${toKhmerNum(year)} ${toKhmerNum(hours)}:${toKhmerNum(minutes)}`;
      orderDateEn = `${day}-${enMonths[monthIndex]}-${year} ${hours}:${minutes}`;
    } catch (err) {
      console.error("Error formatting date for Telegram:", err);
      // Fallback
      orderDateKh = new Date().toISOString();
      orderDateEn = new Date().toISOString();
    }

    const escapedCompanyName = esc(companyName);
    const escapedInvoiceNo = esc(invoiceNo);
    const escapedEmployeeName = esc(employee.fullName);
    const escapedEmployeeId = esc(employee.id);
    const escapedBranchName = esc(branchName);
    const escapedCustomerName = esc(customerNameStr);
    const escapedCustomerPhone = esc(customerPhone);
    const escapedCustomerAddress = esc(customerAddress || "-");
    const escapedFacebook = esc(req.body.customerFacebook);
    const escapedSource = esc(req.body.customerSource);
    const escapedNotes = esc(req.body.customerNotes);

    const itemsListText = items.map(it => `- <b>${esc(it.nameKh || it.nameEn)}</b> x ${it.qty} (<code>$${it.price}</code>)`).join("\n");

    // Send Telegram Group Notification
    const salesGroup = settings.salesTelegramGroupId || settings.hrTelegramGroupId;
    if (salesGroup) {
      let paymentStatusText = `✅ ទូទាត់រួច (${chosenPaymentMethod})`;
      if (chosenPaymentMethod === "COD (Cash on Delivery)") {
        paymentStatusText = "⚠️ មិនទាន់ទូទាត់ (COD)";
      } else if (chosenPaymentMethod === "On Account (Debt)") {
        paymentStatusText = "⚠️ ជំពាក់ (On Account)";
      }

      const purchaseCountKh = toKhmerNum(purchaseCountVal);
      const purchaseHeader = purchaseCountVal === 1 
        ? `🛍️ <b>ការកម្មង់ថ្មី លើកទី ${purchaseCountKh} (New Order #1)</b>`
        : `🛍️ <b>ការកម្មង់ឡើងវិញ លើកទី ${purchaseCountKh} (Repeat Order #${purchaseCountVal})</b>`;

      let orderNotifyText = `${purchaseHeader}\n` +
                            `----------------------------------------\n` +
                            (escapedCompanyName ? `🏢 ក្រុមហ៊ុន៖ <b>${escapedCompanyName}</b>\n` : '') +
                            `🧾 វិក្កយបត្រ៖ <code>${escapedInvoiceNo}</code>\n` +
                            `📅 ថ្ងៃលក់៖ <b>${orderDateKh}</b> (${orderDateEn})\n` +
                            `👤 អ្នកលក់៖ <b>${escapedEmployeeName}</b> (<code>${escapedEmployeeId}</code>)\n` +
                            `🏢 សាខា៖ <b>${escapedBranchName}</b>\n` +
                            `----------------------------------------\n` +
                            `🛒 <b>ទំនិញកម្មង់ (Ordered Items)：</b>\n${itemsListText}\n` +
                            `----------------------------------------\n` +
                            `💵 សរុប៖ <b>$${total}</b>` + (discPercent > 0 ? ` (បញ្ចុះតម្លៃ ${discPercent}%)` : '') + `\n`;
      
      if (shipping > 0) {
        orderNotifyText += `🚚 សេវាដឹកជញ្ជូន (Shipping): <b>$${shipping}</b>\n`;
      }

      orderNotifyText += `💳 ស្ថានភាពទូទាត់៖ <b>${paymentStatusText}</b>\n` +
                         `----------------------------------------\n` +
                         `👤 <b>ព័ត៌មានអតិថិជន (Customer Info)：</b>\n` +
                         `📛 ឈ្មោះ៖ <b>${escapedCustomerName}</b>\n` +
                         `📞 លេខទូរស័ព្ទ៖ <code>${escapedCustomerPhone}</code>\n` +
                         `📍 ទីតាំង៖ <b>${escapedCustomerAddress}</b>`;

      if (req.body.customerFacebook) {
        orderNotifyText += `\n🌐 Facebook: <b>${escapedFacebook}</b>`;
      }
      if (req.body.customerSource) {
        orderNotifyText += `\n📣 ប្រភព (Source): <b>${escapedSource}</b>`;
      }
      if (req.body.customerNotes) {
        orderNotifyText += `\n📝 កំណត់សម្គាល់ (Notes): <b>${escapedNotes}</b>`;
      }

      await sendTelegram(token, "sendMessage", {
        chat_id: salesGroup,
        text: orderNotifyText,
        parse_mode: "HTML"
      });
    }

    // Send direct notification to employee
    const directText = `✅ <b>ការបញ្ជាទិញត្រូវបានបង្កើតជោគជ័យ!</b>\n` +
                       `----------------------------------------\n` +
                       (escapedCompanyName ? `🏢 ក្រុមហ៊ុន៖ <b>${escapedCompanyName}</b>\n` : '') +
                       `🧾 លេខវិក្កយបត្រ៖ <code>${escapedInvoiceNo}</code>\n` +
                       `📅 ថ្ងៃលក់៖ <b>${orderDateKh}</b> (${orderDateEn})\n` +
                       `💵 ចំនួនទឹកប្រាក់៖ <b>$${total}</b>\n` +
                       (shipping > 0 ? `🚚 សេវាដឹកជញ្ជូន (Shipping): <b>$${shipping}</b>\n` : '') +
                       `💳 ទូទាត់៖ <b>${chosenPaymentMethod === 'COD (Cash on Delivery)' ? 'មិនទាន់ទូទាត់ (COD)' : chosenPaymentMethod === 'On Account (Debt)' ? 'ជំពាក់ (On Account)' : chosenPaymentMethod}</b>\n` +
                       `👤 អតិថិជន៖ <b>${escapedCustomerName}</b> (ទិញលើកទី ${toKhmerNum(purchaseCountVal)}) (<code>${escapedCustomerPhone}</code>)\n` +
                       `📍 ទីតាំង៖ <b>${escapedCustomerAddress}</b>\n` +
                       `----------------------------------------\n` +
                       `🛒 <b>ទំនិញកម្មង់៖</b>\n${itemsListText}`;

    await sendTelegram(token, "sendMessage", {
      chat_id: chatId,
      text: directText,
      parse_mode: "HTML"
    });

    return res.status(200).json({ ok: true, invoiceNo: invoiceNo });

  } catch (error) {
    console.error("WebApp Order error:", error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
}

// Main Vercel serverless request handler
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body;
    
    // Route Web App photo posts
    if (body && body.webAppPhoto) {
      return await handleWebAppPhoto(req, res, body);
    }

    // Route Web App order posts
    if (body && body.webAppOrder) {
      return await handleWebAppOrder(req, res, body);
    }

    // Route Web App invoice photo posts
    if (body && body.webAppInvoicePhoto) {
      return await handleWebAppInvoicePhoto(req, res, body);
    }

    const { message, callback_query } = body || {};
    const incomingData = message || (callback_query ? callback_query.message : null);
    if (!incomingData) {
      return res.status(200).send("No message body received");
    }

    const chatId = incomingData.chat.id;
    const text = message && message.text ? message.text.trim() : null;
    const location = message && message.location ? message.location : null;
    const photo = message && message.photo ? message.photo : null;
    const callbackData = callback_query ? callback_query.data : null;

    const settingsSnap = await getDoc(doc(db, "company_settings", "global"));
    const settings = settingsSnap.exists() ? settingsSnap.data() : {};
    
    const isSalesBot = req.query.bot === 'sales';
    const token = isSalesBot
      ? (settings.salesTelegramBotToken || settings.hrTelegramBotToken || settings.telegramToken)
      : (settings.hrTelegramBotToken || settings.telegramToken);

    if (!token) {
      return res.status(200).send("Bot Token is not configured in settings yet.");
    }

    // Check Employee Registration
    const employeesRef = collection(db, "employees");
    const empQuery = query(employeesRef, where("telegramId", "==", String(chatId)));
    const empSnap = await getDocs(empQuery);
    
    let employee = null;
    empSnap.forEach(doc => {
      employee = { docId: doc.id, ...doc.data() };
    });

    const menuMarkup = isSalesBot
      ? getSalesMenuMarkup(req, employee ? employee.id : '', chatId)
      : getMenuMarkup(req, employee ? employee.id : '', chatId);

    // Sales Bot Custom Routing
    if (isSalesBot) {
      if (!employee) {
        const isCommand = text && (text.startsWith("/") || text.toLowerCase() === "start" || text.toLowerCase() === "cancel");
        if (text && !isCommand) {
          const empIdInput = text.trim().toUpperCase();
          const checkRef = query(employeesRef, where("id", "==", empIdInput));
          const checkSnap = await getDocs(checkRef);
          
          let foundEmp = null;
          checkSnap.forEach(doc => {
            foundEmp = { docId: doc.id, ...doc.data() };
          });

          if (foundEmp) {
            await updateDoc(doc(db, "employees", foundEmp.docId), {
              telegramId: String(chatId)
            });

            await sendTelegram(token, "sendMessage", {
              chat_id: chatId,
              text: `🎉 ការចុះឈ្មោះជោគជ័យ!\n\nគណនី Telegram របស់អ្នកត្រូវបានភ្ជាប់ជាមួយ៖\n👤 ឈ្មោះ៖ ${foundEmp.fullName}\n🆔 អត្តលេខ៖ ${foundEmp.id}\n\nសូមចុចប៊ូតុង "🛍️ ដាក់ការបញ្ជាទិញ (Order)" ខាងក្រោមដើម្បីដាក់ការកម្មង់៖`,
              reply_markup: getSalesMenuMarkup(req, foundEmp.id, chatId)
            });
          } else {
            await sendTelegram(token, "sendMessage", {
              chat_id: chatId,
              text: `❌ រកមិនឃើញអត្តលេខបុគ្គលិក "${empIdInput}" ក្នុងប្រព័ន្ធឡើយ។ សូមពិនិត្យឡើងវិញ ឬទាក់ទង Admin!`
            });
          }
          return res.status(200).send("OK");
        }

        // Welcome / Start message for unregistered users
        await sendTelegram(token, "sendMessage", {
          chat_id: chatId,
          text: `👋 សូមស្វាគមន៍មកកាន់ Mini Bot សម្រាប់បញ្ជាទិញទំនិញរបស់ ABC System!\n\nដើម្បីអាចដាក់ការបញ្ជាទិញបាន សូមវាយបញ្ចូល **អត្តលេខបុគ្គលិក (Employee ID)** របស់អ្នកជាមុនសិន (ឧទាហរណ៍៖ **EMP001**)៖`
        });
        return res.status(200).send("OK");
      }

      // Welcome message for already registered user
      await sendTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: `👋 សួស្តី ${employee.fullName}! សូមចុចប៊ូតុង "🛍️ ដាក់ការបញ្ជាទិញ (Order)" ខាងក្រោមដើម្បីចាប់ផ្តើម៖`,
        reply_markup: menuMarkup
      });
      return res.status(200).send("OK");
    }

    // User is not registered
    if (!employee) {
      const isCommand = text && (text.startsWith("/") || text.toLowerCase() === "start" || text.toLowerCase() === "cancel");
      
      // Handle registration text if it's not a command
      if (text && !isCommand) {
        const empIdInput = text.trim().toUpperCase();
        const checkRef = query(employeesRef, where("id", "==", empIdInput));
        const checkSnap = await getDocs(checkRef);
        
        let foundEmp = null;
        checkSnap.forEach(doc => {
          foundEmp = { docId: doc.id, ...doc.data() };
        });

        if (foundEmp) {
          if (foundEmp.telegramId && foundEmp.telegramId !== String(chatId)) {
            await sendTelegram(token, "sendMessage", {
              chat_id: chatId,
              text: `❌ គណនី Employee ID: ${empIdInput} នេះត្រូវបានភ្ជាប់ទៅកាន់ Telegram ផ្សេងរួចហើយ។ សូមទាក់ទង Admin!`
            });
          } else {
            // Update Telegram ID
            await updateDoc(doc(db, "employees", foundEmp.docId), {
              telegramId: String(chatId)
            });

            await sendTelegram(token, "sendMessage", {
              chat_id: chatId,
              text: `🎉 ការចុះឈ្មោះជោគជ័យ!\n\nគណនី Telegram របស់អ្នកត្រូវបានភ្ជាប់ជាមួយ៖\n👤 ឈ្មោះ៖ ${foundEmp.fullName}\n🆔 អត្តលេខ៖ ${foundEmp.id}\n🏢 ផ្នែក៖ ${foundEmp.department || 'N/A'}\n\nសូមប្រើប្រាស់ Menu ខាងក្រោមដើម្បីប្រើប្រាស់ប្រព័ន្ធ៖`,
              reply_markup: getMenuMarkup(req, foundEmp.id, chatId)
            });
          }
        } else {
          await sendTelegram(token, "sendMessage", {
            chat_id: chatId,
            text: `❌ រកមិនឃើញអត្តលេខ ${empIdInput} ក្នុងប្រព័ន្ធឡើយ។ សូមពិនិត្យឡើងវិញ ឬទាក់ទង Admin!`
          });
        }
        return res.status(200).send("OK");
      }

      // If user sent a command or just started, show registration welcome message
      await sendTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: `សួស្តី! គណនី Telegram របស់អ្នកមិនទាន់បានចុះឈ្មោះក្នុងប្រព័ន្ធវត្តមាននៅឡើយទេ។\n\n👉 សូមវាយអត្តលេខបុគ្គលិករបស់អ្នក (ឧទហរណ៍៖ **ABC2026001** ឬ **EMP001**) ដើម្បីចុះឈ្មោះ៖`
      });
      return res.status(200).send("OK");
    }

    // BOT SESSION STATE MACHINE
    const sessionDocRef = doc(db, "bot_sessions", String(chatId));
    const sessionSnap = await getDoc(sessionDocRef);
    const session = sessionSnap.exists() ? sessionSnap.data() : null;

    // Handle Cancel Command
    if (text === "❌ បោះបង់" || text === "/cancel") {
      await setDoc(sessionDocRef, { action: null });
      await sendTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: `❌ សកម្មភាពត្រូវបានបោះបង់។`,
        reply_markup: menuMarkup
      });
      return res.status(200).send("OK");
    }

    // Handle Menu Navigation Buttons
    if (text === "✅ ចូលការងារ (Check-In)") {
      const locationCheckEnabled = settings.hrLocationCheckEnabled !== false;
      
      if (!locationCheckEnabled) {
        const nextAction = "waiting_selfie_checkin";
        await setDoc(sessionDocRef, {
          action: nextAction,
          latitude: 0,
          longitude: 0
        });

        const host = req.headers["host"] || req.headers["x-forwarded-host"] || "khmer-pos-system.vercel.app";
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const webAppUrl = `${protocol}://${host}/telegram-camera.html?employeeId=${employee.id}&chatId=${chatId}&action=checkin`;

        await sendTelegram(token, "sendMessage", {
          chat_id: chatId,
          text: `📸 **សូមចុចប៊ូតុងខាងក្រោមដើម្បីថតរូប Selfie ដើម្បីចូលការងារ (Check-In)៖**\n\n🔗 ឬចុចលើតំណភ្ជាប់នេះ (Or click this link if button doesn't work):\n${webAppUrl}\n\n💡 ឬលោកអ្នកអាចថតរូប Selfie រួចផ្ញើជារូបភាពចូលមកក្នុង Chat នេះផ្ទាល់ក៏បាន!`,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "📸 ថតរូប Selfie",
                  web_app: { url: webAppUrl }
                }
              ]
            ]
          }
        });
        return res.status(200).send("OK");
      }

      await setDoc(sessionDocRef, { action: "waiting_location_checkin" });
      await sendTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: `📍 សូមផ្ញើ **GPS Location (ទីតាំង)** របស់អ្នកដោយចុចប៊ូតុងខាងក្រោម៖`,
        reply_markup: {
          keyboard: [
            [{ text: "📍 ផ្ញើទីតាំងបច្ចុប្បន្ន (Send Location)", request_location: true }],
            [{ text: "❌ បោះបង់" }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
      return res.status(200).send("OK");
    }

    if (text === "✅ ចេញការងារ (Check-Out)") {
      const locationCheckEnabled = settings.hrLocationCheckEnabled !== false;
      
      if (!locationCheckEnabled) {
        const nextAction = "waiting_selfie_checkout";
        await setDoc(sessionDocRef, {
          action: nextAction,
          latitude: 0,
          longitude: 0
        });

        const host = req.headers["host"] || req.headers["x-forwarded-host"] || "khmer-pos-system.vercel.app";
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const webAppUrl = `${protocol}://${host}/telegram-camera.html?employeeId=${employee.id}&chatId=${chatId}&action=checkout`;

        await sendTelegram(token, "sendMessage", {
          chat_id: chatId,
          text: `📸 **សូមចុចប៊ូតុងខាងក្រោមដើម្បីថតរូប Selfie ដើម្បីចេញការងារ (Check-Out)៖**\n\n🔗 ឬចុចលើតំណភ្ជាប់នេះ (Or click this link if button doesn't work):\n${webAppUrl}\n\n💡 ឬលោកអ្នកអាចថតរូប Selfie រួចផ្ញើជារូបភាពចូលមកក្នុង Chat នេះផ្ទាល់ក៏បាន!`,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "📸 ថតរូប Selfie",
                  web_app: { url: webAppUrl }
                }
              ]
            ]
          }
        });
        return res.status(200).send("OK");
      }

      await setDoc(sessionDocRef, { action: "waiting_location_checkout" });
      await sendTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: `📍 សូមផ្ញើ **GPS Location (ទីតាំង)** របស់អ្នកដើម្បី Check-Out៖`,
        reply_markup: {
          keyboard: [
            [{ text: "📍 ផ្ញើទីតាំងបច្ចុប្បន្ន (Send Location)", request_location: true }],
            [{ text: "❌ បោះបង់" }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
      return res.status(200).send("OK");
    }

    if (text === "👤 ព័ត៌មានខ្ញុំ (Profile)") {
      const bankText = employee.bankInfo ? `${employee.bankInfo.bankName || 'N/A'} (${employee.bankInfo.accountNumber || 'N/A'})` : 'N/A';
      const nssfText = employee.nssfInfo?.nssfCardNumber || 'N/A';
      await sendTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: `👤 **ព័ត៌មានបុគ្គលិក**\n\n🆔 អត្តលេខ៖ ${employee.id}\n📛 ឈ្មោះ៖ ${employee.fullName}\n🚻 ភេទ៖ ${employee.gender || 'N/A'}\n📞 ទូរស័ព្ទ៖ ${employee.phone || 'N/A'}\n🏢 ផ្នែក៖ ${employee.department || 'N/A'}\n📌 តួនាទី៖ ${employee.position || 'N/A'}\n📝 ប្រភេទកិច្ចសន្យា៖ ${employee.contractType || 'Probation'}\n🏦 គណនីធនាគារ៖ ${bankText}\n💳 លេខកាត ប.ស.ស៖ ${nssfText}\n📅 ថ្ងៃចូលការងារ៖ ${employee.joinDate || 'N/A'}\n🟢 ស្ថានភាព៖ ${employee.status || 'Active'}`,
        reply_markup: menuMarkup
      });
      return res.status(200).send("OK");
    }

    if (text === "🏢 ក្រុមហ៊ុនខ្ញុំ (Company)") {
      let companyName = "ABC Enterprise Co., Ltd.";
      let companyAddress = "Sensok, Phnom Penh";
      if (employee.companyId) {
        const compSnap = await getDoc(doc(db, "companies", employee.companyId));
        if (compSnap.exists()) {
          const compData = compSnap.data();
          companyName = compData.name;
          companyAddress = compData.address || companyAddress;
        }
      }

      await sendTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: `🏢 **ព័ត៌មានក្រុមហ៊ុន & រចនាសម្ព័ន្ធ**\n\n🏢 ក្រុមហ៊ុន៖ ${companyName}\n📍 អាសយដ្ឋាន៖ ${companyAddress}\n📁 ផ្នែក/ដេប៉ាតឺម៉ង់៖ ${employee.department || 'N/A'}\n📌 តួនាទី៖ ${employee.position || 'N/A'}\n👤 អ្នកគ្រប់គ្រងផ្ទាល់៖ ${employee.managerId || 'N/A'}`,
        reply_markup: menuMarkup
      });
      return res.status(200).send("OK");
    }

    if (text === "📄 ប័ណ្ណបើកប្រាក់ខែ") {
      const payRef = collection(db, "payroll_items");
      const payQuery = query(
        payRef,
        where("employeeId", "==", employee.id),
        orderBy("timestamp", "desc"),
        limit(1)
      );
      const paySnap = await getDocs(payQuery);
      
      let payItem = null;
      paySnap.forEach(d => {
        payItem = d.data();
      });

      if (payItem) {
        const allowancesTotal = Object.values(payItem.allowances || {}).reduce((a, b) => a + b, 0);
        const deductionsTotal = Object.values(payItem.deductions || {}).reduce((a, b) => a + b, 0);

        const payslipMsg = `📄 **ប័ណ្ណបើកប្រាក់បៀវត្សរ៍ចុងក្រោយ (Pay Slip)**\n\n` +
          `👤 ឈ្មោះ៖ ${payItem.employeeName} (${payItem.employeeId})\n` +
          `📅 សម្រាប់ខែ៖ ${payItem.payrollId.replace('payroll_', '')}\n` +
          `------------------------\n` +
          `💵 ប្រាក់ខែគោល៖ $${payItem.basicSalary.toFixed(2)}\n` +
          `➕ ប្រាក់ឧបត្ថម្ភសរុប៖ $${allowancesTotal.toFixed(2)}\n` +
          `➕ ម៉ោងបន្ថែម OT (${payItem.overtimeHours || 0}h)៖ $${payItem.overtimeAmount.toFixed(2)}\n` +
          `➖ ការកាត់កាត់យឺត/អវត្តមាន៖ $${((payItem.deductions?.late || 0) + (payItem.deductions?.absent || 0)).toFixed(2)}\n` +
          `➖ ការកាត់ ប.ស.ស (NSSF)៖ $${(payItem.deductions?.nssf || 0).toFixed(2)}\n` +
          `➖ ពន្ធលើប្រាក់បៀវត្សរ៍៖ $${(payItem.deductions?.tax || 0).toFixed(2)}\n` +
          `------------------------\n` +
          `💰 **ប្រាក់ខែទទួលបានពិតប្រាកដ (Net)៖ $${payItem.netSalary.toFixed(2)}**`;

        await sendTelegram(token, "sendMessage", {
          chat_id: chatId,
          text: payslipMsg,
          reply_markup: menuMarkup
        });
      } else {
        await sendTelegram(token, "sendMessage", {
          chat_id: chatId,
          text: `🚫 មិនទាន់មានប័ណ្ណប្រាក់ខែផ្លូវការសម្រាប់អ្នកនៅឡើយទេ។`,
          reply_markup: menuMarkup
        });
      }
      return res.status(200).send("OK");
    }

    if (text === "📅 ប្រវត្តិវត្តមាន") {
      const attendRef = collection(db, "attendance");
      const attQuery = query(
        attendRef, 
        where("employeeId", "==", employee.id),
        orderBy("date", "desc"),
        limit(5)
      );
      const attSnap = await getDocs(attQuery);
      
      let historyText = `📅 **ប្រវត្តិវត្តមានចុងក្រោយ (៥ ថ្ងៃ)**\n\n`;
      let count = 0;
      attSnap.forEach(doc => {
        const d = doc.data();
        const inTime = d.checkIn ? d.checkIn.time : "N/A";
        const outTime = d.checkOut ? d.checkOut.time : "N/A";
        const status = d.checkIn ? d.checkIn.status : "";
        const hours = d.workingHours ? `(${d.workingHours}h)` : "";
        historyText += `🗓️ ${d.date}\n📥 ចូល៖ ${inTime} (${status})\n📤 ចេញ៖ ${outTime} ${hours}\n------------------------\n`;
        count++;
      });

      if (count === 0) {
        historyText += `🚫 មិនទាន់មានកំណត់ត្រាវត្តមាននៅឡើយទេ។`;
      }

      await sendTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: historyText,
        reply_markup: menuMarkup
      });
      return res.status(200).send("OK");
    }

    if (text === "📝 សុំច្បាប់ (Leave)") {
      await setDoc(sessionDocRef, { action: "waiting_leave_type" });
      await sendTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: `📝 **សូមជ្រើសរើសប្រភេទច្បាប់សុំច្បាប់៖**`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "Sick Leave (ច្បាប់ឈឺ)", callback_data: "leave_Sick Leave" }],
            [{ text: "Annual Leave (ច្បាប់សម្រាកឆ្នាំ)", callback_data: "leave_Annual Leave" }],
            [{ text: "Personal Leave (ច្បាប់ផ្ទាល់ខ្លួន)", callback_data: "leave_Personal Leave" }],
            [{ text: "Mission (បេសកកម្ម)", callback_data: "leave_Mission" }],
            [{ text: "Emergency (ច្បាប់បន្ទាន់)", callback_data: "leave_Emergency" }],
            [{ text: "Day Off (ថ្ងៃសម្រាក)", callback_data: "leave_Day Off" }]
          ]
        }
      });
      return res.status(200).send("OK");
    }

    if (text === "🕒 សុំម៉ោងបន្ថែម (OT)") {
      await setDoc(sessionDocRef, { action: "waiting_ot_date" });
      await sendTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: `🕒 **សូមវាយបញ្ចូល កាលបរិច្ឆេទសុំធ្វើការបន្ថែម (OT)** ឧទាហរណ៍៖ \`2026-06-16\` ឬ \`ថ្ងៃនេះ\` ឬ \`ថ្ងៃស្អែក\`៖`,
        reply_markup: {
          keyboard: [
            [{ text: "ថ្ងៃនេះ" }, { text: "ថ្ងៃស្អែក" }],
            [{ text: "❌ បោះបង់" }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
      return res.status(200).send("OK");
    }

    if (text === "📢 សេចក្ដីជូនដំណឹង") {
      const annRef = collection(db, "announcements");
      const annQuery = query(annRef, orderBy("timestamp", "desc"), limit(3));
      const annSnap = await getDocs(annQuery);

      let annText = `📢 **សេចក្ដីជូនដំណឹងក្រុមហ៊ុន**\n\n`;
      let count = 0;
      annSnap.forEach(d => {
        const item = d.data();
        annText += `🔔 **${item.title}** (${item.date || ''})\n📝 ${item.content}\n------------------------\n`;
        count++;
      });

      if (count === 0) {
        annText += `បច្ចុប្បន្នគ្មានសេចក្តីជូនដំណឹងថ្មីនៅឡើយទេ។`;
      }

      await sendTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: annText,
        reply_markup: menuMarkup
      });
      return res.status(200).send("OK");
    }

    if (text === "☎️ ទាក់ទង Admin") {
      await sendTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: `☎️ **ទាក់ទងផ្នែករដ្ឋបាល (Admin)**\n\n👤 ឈ្មោះ៖ NOUEN Dany (System Admin)\n📞 ទូរស័ព្ទ៖ 010 955 536\n💬 Telegram៖ @nouen_dany`,
        reply_markup: menuMarkup
      });
      return res.status(200).send("OK");
    }

    // HANDLE INCOMING LOCATION SHARING
    if (location) {
      if (session && (session.action === "waiting_location_checkin" || session.action === "waiting_location_checkout")) {
        const officeLat = parseFloat(settings.hrOfficeLatitude);
        const officeLng = parseFloat(settings.hrOfficeLongitude);
        const allowedRadius = parseFloat(settings.hrOfficeRadius) || 100;

        const bypassLocation = !officeLat && !officeLng;

        if (bypassLocation) {
          const nextAction = session.action === "waiting_location_checkin" ? "waiting_selfie_checkin" : "waiting_selfie_checkout";
          await setDoc(sessionDocRef, {
            action: nextAction,
            latitude: location.latitude || 0,
            longitude: location.longitude || 0
          });

          const host = req.headers["host"] || req.headers["x-forwarded-host"] || "khmer-pos-system.vercel.app";
          const protocol = req.headers["x-forwarded-proto"] || "https";
          const actionType = session.action === "waiting_location_checkin" ? "checkin" : "checkout";
          const webAppUrl = `${protocol}://${host}/telegram-camera.html?employeeId=${employee.id}&chatId=${chatId}&action=${actionType}`;

          await sendTelegram(token, "sendMessage", {
            chat_id: chatId,
            text: `📍 **ទីតាំងត្រូវបានទទួលយក! (Bypassed distance check)**\n\n📸 សូមចុចប៊ូតុងខាងក្រោមដើម្បីថតរូប **Selfie** ផ្ទាល់ខ្លួនរបស់អ្នក ចូលទៅក្នុងប្រព័ន្ធ៖\n\n🔗 ឬចុចលើតំណភ្ជាប់នេះ (Or click this link if button doesn't work):\n${webAppUrl}\n\n💡 ឬលោកអ្នកអាចថតរូប Selfie ដោយប្រើកាមេរ៉ាទូរស័ព្ទធម្មតា រួចផ្ញើជារូបភាពចូលមកក្នុង Chat នេះផ្ទាល់ក៏បាន!`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "📸 ថតរូប Selfie",
                    web_app: { url: webAppUrl }
                  }
                ]
              ]
            }
          });
        } else {
          const distance = calculateDistance(
            location.latitude,
            location.longitude,
            officeLat,
            officeLng
          );

          if (distance > allowedRadius) {
            await sendTelegram(token, "sendMessage", {
              chat_id: chatId,
              text: `❌ **ទីតាំងមិនត្រឹមត្រូវទេ!**\n\nទីតាំងរបស់អ្នកនៅឆ្ងាយពីការិយាល័យពេក (ចម្ងាយ៖ **${Math.round(distance)} ម៉ែត្រ**)។ ចម្ងាយអនុញ្ញាតគឺក្នុងរង្វង់ **${allowedRadius} ម៉ែត្រ** តែប៉ុណ្ណោះ។`,
              reply_markup: menuMarkup
            });
            await setDoc(sessionDocRef, { action: null });
          } else {
            const nextAction = session.action === "waiting_location_checkin" ? "waiting_selfie_checkin" : "waiting_selfie_checkout";
            await setDoc(sessionDocRef, {
              action: nextAction,
              latitude: location.latitude,
              longitude: location.longitude
            });

            const host = req.headers["host"] || req.headers["x-forwarded-host"] || "khmer-pos-system.vercel.app";
            const protocol = req.headers["x-forwarded-proto"] || "https";
            const actionType = session.action === "waiting_location_checkin" ? "checkin" : "checkout";
            const webAppUrl = `${protocol}://${host}/telegram-camera.html?employeeId=${employee.id}&chatId=${chatId}&action=${actionType}`;

            await sendTelegram(token, "sendMessage", {
              chat_id: chatId,
              text: `📍 **ទីតាំងត្រឹមត្រូវ! (ចម្ងាយ៖ ${Math.round(distance)} ម៉ែត្រ)**\n\n📸 សូមចុចប៊ូតុងខាងក្រោមដើម្បីថតរូប **Selfie** ផ្ទាល់ខ្លួនរបស់អ្នក ចូលទៅក្នុងប្រព័ន្ធ៖\n\n🔗 ឬចុចលើតំណភ្ជាប់នេះ (Or click this link if button doesn't work):\n${webAppUrl}\n\n💡 ឬលោកអ្នកអាចថតរូប Selfie ដោយប្រើកាមេរ៉ាទូរស័ព្ទធម្មតា រួចផ្ញើជារូបភាពចូលមកក្នុង Chat នេះផ្ទាល់ក៏បាន!`,
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "📸 ថតរូប Selfie",
                      web_app: { url: webAppUrl }
                    }
                  ]
                ]
              }
            });
          }
        }
        return res.status(200).send("OK");
      }
    }

    // HANDLE INCOMING SELFIE PHOTOS
    if (photo) {
      if (session && (session.action === "waiting_selfie_checkin" || session.action === "waiting_selfie_checkout")) {
        // Find largest photo resolution
        const largestPhoto = photo[photo.length - 1];
        
        await sendTelegram(token, "sendMessage", {
          chat_id: chatId,
          text: `⏳ កំពុងដំណើរការរក្សាទុកទិន្នន័យវត្តមានរបស់អ្នក...`
        });

        // Download and base64 convert the image file
        const base64Image = await downloadTelegramFileAsBase64(token, largestPhoto.file_id);
        if (!base64Image) {
          await sendTelegram(token, "sendMessage", {
            chat_id: chatId,
            text: `❌ មានបញ្ហាក្នុងការទាញយករូបថត។ សូមផ្ញើថតរូប Selfie ម្តងទៀត៖`
          });
          return res.status(200).send("OK");
        }

        const now = new Date();
        // Shift time offset to Cambodia (UTC+7)
        now.setUTCHours(now.getUTCHours() + 7);
        
        const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
        const timeStr = now.toISOString().split("T")[1].slice(0, 8); // HH:MM:SS
        const attendanceId = `attendance_${employee.id}_${dateStr}`;
        const docRef = doc(db, "attendance", attendanceId);

        if (session.action === "waiting_selfie_checkin") {
          // Check-in status
          const startHours = employee.workStart || settings.hrWorkStart || "08:00";
          const [startH, startM] = startHours.split(":").map(Number);
          const [currentH, currentM] = timeStr.split(":").map(Number);
          
          let checkInStatus = "On Time";
          if (currentH > startH || (currentH === startH && currentM > startM)) {
            checkInStatus = "Late";
          }


          const attendanceData = {
            id: attendanceId,
            employeeId: employee.id,
            employeeName: employee.fullName,
            date: dateStr,
            checkIn: {
              time: timeStr,
              latitude: session.latitude || 0,
              longitude: session.longitude || 0,
              selfieUrl: base64Image,
              status: checkInStatus
            }
          };

          await setDoc(docRef, attendanceData, { merge: true });

          await sendTelegram(token, "sendMessage", {
            chat_id: chatId,
            text: `✅ **ចូលការងារបានជោគជ័យ!**\n\n👤 ឈ្មោះ៖ ${employee.fullName}\n📅 កាលបរិច្ឆេទ៖ ${dateStr}\n⏰ ម៉ោងចូល៖ ${timeStr}\n📍 ស្ថានភាព៖ ${checkInStatus === "Late" ? "🔴 យឺតការងារ (Late)" : "🟢 ទាន់ម៉ោង (On Time)"}`,
            reply_markup: menuMarkup
          });

          if (settings.hrTelegramGroupId) {
            const checkInText = `📢 **ការជូនដំណឹងវត្តមាន (Check-In)**\n\n👤 ឈ្មោះ៖ ${employee.fullName} (${employee.id})\n📅 កាលបរិច្ឆេទ៖ ${dateStr}\n⏰ ម៉ោងចូល៖ ${timeStr}\n📍 ស្ថានភាព៖ ${checkInStatus === "Late" ? "🔴 យឺតការងារ (Late)" : "🟢 ទាន់ម៉ោង (On Time)"}`;
            await sendTelegram(token, "sendMessage", {
              chat_id: settings.hrTelegramGroupId,
              text: checkInText
            });
          }
        } else {
          // Check-out
          const attSnap = await getDoc(docRef);
          const existingAtt = attSnap.exists() ? attSnap.data() : null;

          if (!existingAtt || !existingAtt.checkIn) {
            await sendTelegram(token, "sendMessage", {
              chat_id: chatId,
              text: `⚠️ មិនអាច Check-Out បានទេ ព្រោះរកមិនឃើញការ Check-In ថ្ងៃនេះឡើយ។`,
              reply_markup: menuMarkup
            });
            await setDoc(sessionDocRef, { action: null });
            return res.status(200).send("OK");
          }

          // Calculate working hours
          const checkInTime = existingAtt.checkIn.time;
          const [inH, inM, inS] = checkInTime.split(":").map(Number);
          const [outH, outM, outS] = timeStr.split(":").map(Number);
          
          const inTotalSec = inH * 3600 + inM * 60 + inS;
          const outTotalSec = outH * 3600 + outM * 60 + outS;
          
          const workedSec = outTotalSec - inTotalSec;
          const workingHours = parseFloat((workedSec / 3600).toFixed(2));
          
          // Calculate Overtime (after 8 hours of work)
          let overtime = 0;
          if (workingHours > 8) {
            overtime = parseFloat((workingHours - 8).toFixed(2));
          }

          await setDoc(docRef, {
            checkOut: {
              time: timeStr,
              latitude: session.latitude || 0,
              longitude: session.longitude || 0,
              selfieUrl: base64Image
            },
            workingHours,
            overtime
          }, { merge: true });

          await sendTelegram(token, "sendMessage", {
            chat_id: chatId,
            text: `✅ **ចេញការងារបានជោគជ័យ!**\n\n📥 ម៉ោងចូល៖ ${checkInTime}\n📤 ម៉ោងចេញ៖ ${timeStr}\n⏱️ ម៉ោងធ្វើការ៖ ${workingHours} ម៉ោង\n⏱️ ម៉ោង OT៖ ${overtime} ម៉ោង`,
            reply_markup: menuMarkup
          });

          if (settings.hrTelegramGroupId) {
            const checkOutText = `📢 **ការជូនដំណឹងវត្តមាន (Check-Out)**\n\n👤 ឈ្មោះ៖ ${employee.fullName} (${employee.id})\n📅 កាលបរិច្ឆេទ៖ ${dateStr}\n📥 ម៉ោងចូល៖ ${checkInTime}\n📤 ម៉ោងចេញ៖ ${timeStr}\n⏱️ ម៉ោងធ្វើការ៖ ${workingHours} ម៉ោង\n⏱️ ម៉ោង OT៖ ${overtime} ម៉ោង`;
            await sendTelegram(token, "sendMessage", {
              chat_id: settings.hrTelegramGroupId,
              text: checkOutText
            });
          }
        }

        await setDoc(sessionDocRef, { action: null });
        return res.status(200).send("OK");
      }
    }

    // HANDLE INLINE CALLBACK QUEUES (LEAVE REQUESTS TYPE)
    if (callbackData && callbackData.startsWith("leave_")) {
      if (session && session.action === "waiting_leave_type") {
        const leaveType = callbackData.replace("leave_", "");
        await setDoc(sessionDocRef, {
          action: "waiting_leave_start_date",
          leaveType
        });

        await sendTelegram(token, "sendMessage", {
          chat_id: chatId,
          text: `✍️ ប្រភេទច្បាប់៖ *${leaveType}*\n\n👉 សូមវាយបញ្ចូល **ថ្ងៃចាប់ផ្តើម** ឧទាហរណ៍៖ \`2026-06-16\` ឬ \`ថ្ងៃនេះ\` ឬ \`ថ្ងៃស្អែក\`៖`
        });
      }
      return res.status(200).send("OK");
    }

    // HANDLE TEXT-BASED MULTI-STEP INPUTS (LEAVE & OT REQUESTS)
    if (text && session) {
      if (session.action === "waiting_leave_start_date") {
        let startDateInput = text;
        const today = new Date();
        today.setUTCHours(today.getUTCHours() + 7);

        if (text === "ថ្ងៃនេះ") {
          startDateInput = today.toISOString().split("T")[0];
        } else if (text === "ថ្ងៃស្អែក") {
          today.setDate(today.getDate() + 1);
          startDateInput = today.toISOString().split("T")[0];
        }

        await setDoc(sessionDocRef, {
          action: "waiting_leave_end_date",
          leaveType: session.leaveType,
          startDate: startDateInput
        });

        await sendTelegram(token, "sendMessage", {
          chat_id: chatId,
          text: `🗓️ ថ្ងៃចាប់ផ្តើម៖ *${startDateInput}*\n\n👉 សូមវាយបញ្ចូល **ថ្ងៃបញ្ចប់** ឧទហរណ៍៖ \`2026-06-17\` ឬ \`ថ្ងៃស្អែក\`៖`
        });
        return res.status(200).send("OK");
      }

      if (session.action === "waiting_leave_end_date") {
        let endDateInput = text;
        const today = new Date();
        today.setUTCHours(today.getUTCHours() + 7);

        if (text === "ថ្ងៃស្អែក") {
          today.setDate(today.getDate() + 1);
          endDateInput = today.toISOString().split("T")[0];
        }

        await setDoc(sessionDocRef, {
          action: "waiting_leave_reason",
          leaveType: session.leaveType,
          startDate: session.startDate,
          endDate: endDateInput
        });

        await sendTelegram(token, "sendMessage", {
          chat_id: chatId,
          text: `🗓️ ថ្ងៃបញ្ចប់៖ *${endDateInput}*\n\n👉 សូមបញ្ជាក់ពី **មូលហេតុនៃការសុំច្បាប់**៖`
        });
        return res.status(200).send("OK");
      }

      if (session.action === "waiting_leave_reason") {
        const newDocRef = doc(collection(db, "leave_requests"));
        const newLeave = {
          id: newDocRef.id,
          employeeId: employee.id,
          employeeName: employee.fullName,
          department: employee.department || "N/A",
          leaveType: session.leaveType,
          startDate: session.startDate,
          endDate: session.endDate,
          reason: text,
          status: "Pending",
          createdAt: new Date().toISOString()
        };

        await setDoc(newDocRef, newLeave);

        await sendTelegram(token, "sendMessage", {
          chat_id: chatId,
          text: `✅ **ការស្នើសុំច្បាប់ត្រូវបានបញ្ជូនជោគជ័យ!**\n\n👤 ឈ្មោះ៖ ${employee.fullName}\n📝 ប្រភេទ៖ ${session.leaveType}\n📅 ចាប់ផ្តើម៖ ${session.startDate}\n📅 បញ្ចប់៖ ${session.endDate}\n✍️ មូលហេតុ៖ ${text}\n\n*រង់ចាំការអនុម័តពី Admin/Manager*`,
          reply_markup: menuMarkup
        });

        if (settings.hrTelegramGroupId) {
          const leaveNotifyText = `📢 **ការស្នើសុំច្បាប់ថ្មី (New Leave Request)**\n\n👤 ឈ្មោះ៖ ${employee.fullName} (${employee.id})\n📝 ប្រភេទ៖ ${session.leaveType}\n📅 ចាប់ផ្តើម៖ ${session.startDate}\n📅 បញ្ចប់៖ ${session.endDate}\n✍️ មូលហេតុ៖ ${text}`;
          await sendTelegram(token, "sendMessage", {
            chat_id: settings.hrTelegramGroupId,
            text: leaveNotifyText
          });
        }

        await setDoc(sessionDocRef, { action: null });
        return res.status(200).send("OK");
      }

      if (session.action === "waiting_ot_date") {
        let otDateInput = text;
        const today = new Date();
        today.setUTCHours(today.getUTCHours() + 7);

        if (text === "ថ្ងៃនេះ") {
          otDateInput = today.toISOString().split("T")[0];
        } else if (text === "ថ្ងៃស្អែក") {
          today.setDate(today.getDate() + 1);
          otDateInput = today.toISOString().split("T")[0];
        }

        await setDoc(sessionDocRef, {
          action: "waiting_ot_hours",
          otDate: otDateInput
        });

        await sendTelegram(token, "sendMessage", {
          chat_id: chatId,
          text: `🗓️ កាលបរិច្ឆេទសុំ OT៖ *${otDateInput}*\n\n👉 សូមវាយបញ្ចូល **ចំនួនម៉ោងធ្វើការបន្ថែម (OT)** (ឧទាហរណ៍៖ \`2\` ឬ \`2.5\` ម៉ោង)៖`
        });
        return res.status(200).send("OK");
      }

      if (session.action === "waiting_ot_hours") {
        const hoursVal = parseFloat(text);
        if (isNaN(hoursVal) || hoursVal <= 0) {
          await sendTelegram(token, "sendMessage", {
            chat_id: chatId,
            text: `❌ សូមវាយបញ្ចូលចំនួនម៉ោងជាលេខត្រឹមត្រូវ (ធំជាង 0)៖`
          });
          return res.status(200).send("OK");
        }

        await setDoc(sessionDocRef, {
          action: "waiting_ot_reason",
          otDate: session.otDate,
          otHours: hoursVal
        });

        await sendTelegram(token, "sendMessage", {
          chat_id: chatId,
          text: `⏱️ ចំនួនម៉ោង OT៖ *${hoursVal} ម៉ោង*\n\n👉 សូមបញ្ជាក់ពី **មូលហេតុនៃការសុំ OT**៖`
        });
        return res.status(200).send("OK");
      }

      if (session.action === "waiting_ot_reason") {
        const newDocRef = doc(collection(db, "overtime_requests"));
        const newOT = {
          id: newDocRef.id,
          employeeId: employee.id,
          employeeName: employee.fullName,
          date: session.otDate,
          requestedHours: session.otHours,
          reason: text,
          managerApproval: "Pending",
          hrApproval: "Pending",
          status: "Pending",
          createdAt: new Date().toISOString()
        };

        await setDoc(newDocRef, newOT);

        await sendTelegram(token, "sendMessage", {
          chat_id: chatId,
          text: `✅ **ការស្នើសុំម៉ោងបន្ថែម (OT) ត្រូវបានបញ្ជូនជោគជ័យ!**\n\n👤 ឈ្មោះ៖ ${employee.fullName}\n📅 កាលបរិច្ឆេទ៖ ${session.otDate}\n⏱️ ចំនួនម៉ោង៖ ${session.otHours} ម៉ោង\n✍️ មូលហេតុ៖ ${text}\n\n*រង់ចាំការអនុម័តពី Manager/HR*`,
          reply_markup: menuMarkup
        });

        if (settings.hrTelegramGroupId) {
          const otNotifyText = `📢 **ការស្នើសុំម៉ោងបន្ថែមថ្មី (New OT Request)**\n\n👤 ឈ្មោះ៖ ${employee.fullName} (${employee.id})\n📅 កាលបរិច្ឆេទ៖ ${session.otDate}\n⏱️ ចំនួនម៉ោង៖ ${session.otHours} ម៉ោង\n✍️ មូលហេតុ៖ ${text}`;
          await sendTelegram(token, "sendMessage", {
            chat_id: settings.hrTelegramGroupId,
            text: otNotifyText
          });
        }

        await setDoc(sessionDocRef, { action: null });
        return res.status(200).send("OK");
      }
    }

    // Fallback default message
    await sendTelegram(token, "sendMessage", {
      chat_id: chatId,
      text: `សួស្តី ${employee.fullName}! សូមជ្រើសរើសបញ្ជាពី Menu ខាងក្រោម៖`,
      reply_markup: menuMarkup
    });

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook processing error:", error);
    return res.status(200).send(`Error processing webhook: ${error.message}`);
  }
}

async function handleWebAppPhoto(req, res, body) {
  const { employeeId, chatId, action, base64Image } = body;

  try {
    const settingsSnap = await getDoc(doc(db, "company_settings", "global"));
    const settings = settingsSnap.exists() ? settingsSnap.data() : {};
    const token = settings.hrTelegramBotToken || settings.telegramToken;

    if (!token) {
      return res.status(400).send("Missing Bot Token");
    }

    // Load employee profile
    const empSnap = await getDoc(doc(db, "employees", employeeId));
    const employee = empSnap.exists() ? empSnap.data() : null;
    if (!employee) {
      return res.status(400).send("Employee not found");
    }

    // Load session to get latitude and longitude
    const sessionDocRef = doc(db, "bot_sessions", chatId.toString());
    const sessionSnap = await getDoc(sessionDocRef);
    const session = sessionSnap.exists() ? sessionSnap.data() : {};

    const now = new Date();
    now.setUTCHours(now.getUTCHours() + 7); // Shift to Cambodia (UTC+7)
    const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const timeStr = now.toISOString().split("T")[1].slice(0, 8); // HH:MM:SS
    const attendanceId = `attendance_${employee.id}_${dateStr}`;
    const docRef = doc(db, "attendance", attendanceId);

    const menuMarkup = getMenuMarkup(req, employeeId, chatId);

    if (action === "checkin") {
      const startHours = employee.workStart || settings.hrWorkStart || "08:00";
      const [startH, startM] = startHours.split(":").map(Number);
      const [currentH, currentM] = timeStr.split(":").map(Number);

      
      let checkInStatus = "On Time";
      let statusTextTelegram = "🟢 ទាន់ម៉ោង (On Time)";
      
      const startSec = startH * 3600 + startM * 60;
      const currentSec = currentH * 3600 + currentM * 60;
      
      if (currentSec > startSec) {
        checkInStatus = "Late";
        const lateSec = currentSec - startSec;
        const lateH = Math.floor(lateSec / 3600);
        const lateM = Math.floor((lateSec % 3600) / 60);
        let lateDurStr = "";
        if (lateH > 0) lateDurStr += `${lateH}h`;
        lateDurStr += `${lateM}mn`;
        statusTextTelegram = `🔴 យឺត ${lateDurStr} (Late)`;
      }

      const attendanceData = {
        id: attendanceId,
        employeeId: employee.id,
        employeeName: employee.fullName,
        date: dateStr,
        checkIn: {
          time: timeStr,
          latitude: session.latitude || 0,
          longitude: session.longitude || 0,
          selfieUrl: base64Image,
          status: checkInStatus
        }
      };

      await setDoc(docRef, attendanceData, { merge: true });

      // Notify employee
      await sendTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: `✅ **ចូលការងារបានជោគជ័យ (តាមរយៈ Bot Camera)!**\n\n👤 ឈ្មោះ៖ ${employee.fullName}\n📅 កាលបរិច្ឆេទ៖ ${dateStr}\n⏰ ម៉ោងចូល៖ ${timeStr}\n📍 ស្ថានភាព៖ ${statusTextTelegram}`,
        reply_markup: menuMarkup
      });

      // Forward to Admin Group
      if (settings.hrTelegramGroupId) {
        const checkInText = `📢 **ការជូនដំណឹងវត្តមាន (Check-In)**\n\n👤 ឈ្មោះ៖ ${employee.fullName} (${employee.id})\n📅 កាលបរិច្ឆេទ៖ ${dateStr}\n⏰ ម៉ោងចូល៖ ${timeStr}\n📍 ស្ថានភាព៖ ${statusTextTelegram}`;
        await sendTelegram(token, "sendMessage", {
          chat_id: settings.hrTelegramGroupId,
          text: checkInText
        });
      }
    } else {
      // Check-out
      const attSnap = await getDoc(docRef);
      const existingAtt = attSnap.exists() ? attSnap.data() : null;

      if (!existingAtt || !existingAtt.checkIn) {
        return res.status(400).send("No Check-In record found for today.");
      }

      // Calculate working hours
      const checkInTime = existingAtt.checkIn.time;
      const [inH, inM, inS] = checkInTime.split(":").map(Number);
      const [outH, outM, outS] = timeStr.split(":").map(Number);
      
      const inTotalSec = inH * 3600 + inM * 60 + inS;
      const outTotalSec = outH * 3600 + outM * 60 + outS;
      
      const workedSec = outTotalSec - inTotalSec;
      const workingHours = parseFloat((workedSec / 3600).toFixed(2));
      
      let overtime = 0;
      if (workingHours > 8) {
        overtime = parseFloat((workingHours - 8).toFixed(2));
      }

      await setDoc(docRef, {
        checkOut: {
          time: timeStr,
          latitude: session.latitude || 0,
          longitude: session.longitude || 0,
          selfieUrl: base64Image
        },
        workingHours,
        overtime
      }, { merge: true });

      // Notify employee
      await sendTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: `✅ **ចេញការងារបានជោគជ័យ (តាមរយៈ Bot Camera)!**\n\n📥 ម៉ោងចូល៖ ${checkInTime}\n📤 ម៉ោងចេញ៖ ${timeStr}\n⏱️ ម៉ោងធ្វើការ៖ ${workingHours} ម៉ោង\n⏱️ ម៉ោង OT៖ ${overtime} ម៉ោង`,
        reply_markup: menuMarkup
      });

      // Forward to Admin Group
      if (settings.hrTelegramGroupId) {
        const checkOutText = `📢 **ការជូនដំណឹងវត្តមាន (Check-Out)**\n\n👤 ឈ្មោះ៖ ${employee.fullName} (${employee.id})\n📅 កាលបរិច្ឆេទ៖ ${dateStr}\n📥 ម៉ោងចូល៖ ${checkInTime}\n📤 ម៉ោងចេញ៖ ${timeStr}\n⏱️ ម៉ោងធ្វើការ៖ ${workingHours} ម៉ោង\n⏱️ ម៉ោង OT៖ ${overtime} ម៉ោង`;
        await sendTelegram(token, "sendMessage", {
          chat_id: settings.hrTelegramGroupId,
          text: checkOutText
        });
      }
    }

    // Clear session action
    await setDoc(sessionDocRef, { action: null });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("handleWebAppPhoto error:", error);
    return res.status(500).send(`Error processing photo: ${error.message}`);
  }
}

async function handleWebAppInvoicePhoto(req, res, body) {
  const { chatId, invoiceNo, photoBase64 } = body;

  try {
    const settingsSnap = await getDoc(doc(db, "company_settings", "global"));
    const settings = settingsSnap.exists() ? settingsSnap.data() : {};
    
    // Choose sales telegram bot token or fallback
    const isSalesBot = req.query.bot === 'sales';
    const token = isSalesBot
      ? (settings.salesTelegramBotToken || settings.hrTelegramBotToken || settings.telegramToken)
      : (settings.hrTelegramBotToken || settings.telegramToken);

    if (!token) {
      return res.status(400).json({ error: "Missing Bot Token" });
    }

    if (!chatId) {
      return res.status(400).json({ error: "Missing Chat ID" });
    }

    // Convert base64 data URL to Buffer
    const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Telegram sendPhoto API using FormData (native in Node.js 18+)
    const formData = new FormData();
    formData.append('chat_id', chatId.toString());
    
    // Create Blob from Buffer
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    formData.append('photo', blob, `Invoice_${invoiceNo}.jpg`);
    formData.append('caption', `🧾 វិក្កយបត្រ / Invoice៖ ${invoiceNo}`);

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: formData
    });

    const tgJson = await tgRes.json();
    if (tgJson.ok) {
      return res.status(200).json({ success: true });
    } else {
      console.error("Telegram sendPhoto failed:", tgJson);
      return res.status(500).json({ error: tgJson.description || "Failed to send photo to Telegram" });
    }
  } catch (err) {
    console.error("handleWebAppInvoicePhoto error:", err);
    return res.status(500).json({ error: err.message });
  }
}
