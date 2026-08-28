import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getFirestore, doc, getDoc, updateDoc, increment, setDoc,
  collection, query, where, getDocs, limit, orderBy
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

// Helper to call Google Gemini API
async function callGemini(apiKey, systemInstruction, contents, tools) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents,
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    }
  };
  if (tools) {
    payload.tools = tools;
  }
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return response.json();
}

// Tool definitions for Gemini
const aiTools = [
  {
    functionDeclarations: [
      {
        name: "checkStock",
        description: "Check the current stock of a product by its name or SKU, optionally at a specific branch.",
        parameters: {
          type: "OBJECT",
          properties: {
            productNameOrSku: {
              type: "STRING",
              description: "The SKU code or name (English or Khmer) of the product."
            },
            branchName: {
              type: "STRING",
              description: "Optional branch name (e.g. 'Chhouk Meas' or 'HQ'). Defaults to listing all branches if not specified."
            }
          },
          required: ["productNameOrSku"]
        }
      },
      {
        name: "adjustStock",
        description: "Adjust (increase/add or decrease/remove) the stock of a product. Requires 'adjust_stock' permission.",
        parameters: {
          type: "OBJECT",
          properties: {
            productNameOrSku: {
              type: "STRING",
              description: "The SKU code or name of the product."
            },
            quantity: {
              type: "NUMBER",
              description: "The quantity count to adjust (e.g. 5, 10)."
            },
            adjustmentType: {
              type: "STRING",
              enum: ["increase", "decrease"],
              description: "Whether to increase/add or decrease/remove the stock."
            },
            branchName: {
              type: "STRING",
              description: "The branch name where the stock is adjusted (e.g. 'Chhouk Meas' or 'HQ')."
            },
            reason: {
              type: "STRING",
              description: "Brief reason for this stock adjustment."
            }
          },
          required: ["productNameOrSku", "quantity", "adjustmentType", "branchName"]
        }
      },
      {
        name: "getSalesReport",
        description: "Retrieve a sales report total for a specific time period. Requires 'sales_report' permission.",
        parameters: {
          type: "OBJECT",
          properties: {
            timePeriod: {
              type: "STRING",
              enum: ["today", "yesterday", "this_week", "this_month"],
              description: "The timeframe of the sales report."
            }
          },
          required: ["timePeriod"]
        }
      },
      {
        name: "lookupCustomer",
        description: "Search for a customer's phone number, address, and outstanding debt. Requires 'customer_lookup' permission.",
        parameters: {
          type: "OBJECT",
          properties: {
            nameOrPhone: {
              type: "STRING",
              description: "The customer's name or phone number."
            }
          },
          required: ["nameOrPhone"]
        }
      }
    ]
  }
];

// Tool Execution Logic
async function executeTool(name, args, permissions, senderUsername, db) {
  // Check permission helper
  const hasPerm = (perm) => permissions.includes(perm);

  if (name === "checkStock") {
    if (!hasPerm("check_stock")) {
      return { error: "អ្នកមិនមានសិទ្ធិឆែកស្តុកទំនិញទេ (No permission to check stock)" };
    }

    const { productNameOrSku, branchName } = args;
    const prodQuery = productNameOrSku.toLowerCase().trim();

    // Load products and branches
    const productsSnap = await getDocs(collection(db, "products"));
    const branchesSnap = await getDocs(collection(db, "branches"));
    
    const products = [];
    productsSnap.forEach(d => products.push(d.data()));
    const branches = [];
    branchesSnap.forEach(d => branches.push(d.data()));

    // Match products
    const matchedProducts = products.filter(p => 
      p.sku.toLowerCase() === prodQuery ||
      p.barcode?.toLowerCase() === prodQuery ||
      p.nameEn.toLowerCase().includes(prodQuery) ||
      p.nameKh?.toLowerCase().includes(prodQuery)
    );

    if (matchedProducts.length === 0) {
      return { success: false, message: `រកមិនឃើញផលិតផលដែលមានឈ្មោះ ឬ SKU '${productNameOrSku}' ទេ` };
    }

    // Resolve branch
    let targetBranchId = null;
    let targetBranchName = "";
    if (branchName) {
      const bQuery = branchName.toLowerCase().trim();
      const matchedBranch = branches.find(b => 
        b.name.toLowerCase().includes(bQuery) || 
        b.nameKh?.toLowerCase().includes(bQuery) ||
        b.id.toLowerCase() === bQuery
      );
      if (matchedBranch) {
        targetBranchId = matchedBranch.id;
        targetBranchName = matchedBranch.nameKh || matchedBranch.name;
      }
    }

    const results = matchedProducts.map(p => {
      const stockInfo = {};
      if (targetBranchId) {
        stockInfo[targetBranchName] = p.warehouseStock?.[targetBranchId] || 0;
      } else {
        branches.forEach(b => {
          stockInfo[b.nameKh || b.name] = p.warehouseStock?.[b.id] || 0;
        });
      }
      return {
        sku: p.sku,
        nameEn: p.nameEn,
        nameKh: p.nameKh || "",
        sellingPrice: p.sellingPrice || 0,
        stock: stockInfo
      };
    });

    return { success: true, products: results };
  }

  if (name === "adjustStock") {
    if (!hasPerm("adjust_stock")) {
      return { error: "អ្នកមិនមានសិទ្ធិកែប្រែ ឬបញ្ចូលស្តុកទេ (No permission to adjust stock)" };
    }

    const { productNameOrSku, quantity, adjustmentType, branchName, reason } = args;
    const prodQuery = productNameOrSku.toLowerCase().trim();

    // Load products and branches
    const productsSnap = await getDocs(collection(db, "products"));
    const branchesSnap = await getDocs(collection(db, "branches"));
    
    const products = [];
    productsSnap.forEach(d => products.push(d.data()));
    const branches = [];
    branchesSnap.forEach(d => branches.push(d.data()));

    // Find best product match
    const product = products.find(p => 
      p.sku.toLowerCase() === prodQuery ||
      p.barcode?.toLowerCase() === prodQuery ||
      p.nameEn.toLowerCase().includes(prodQuery) ||
      p.nameKh?.toLowerCase().includes(prodQuery)
    );

    if (!product) {
      return { error: `រកមិនឃើញផលិតផល '${productNameOrSku}' ទេ` };
    }

    // Find best branch match
    const bQuery = branchName.toLowerCase().trim();
    const branch = branches.find(b => 
      b.name.toLowerCase().includes(bQuery) || 
      b.nameKh?.toLowerCase().includes(bQuery) ||
      b.id.toLowerCase() === bQuery
    );

    if (!branch) {
      return { error: `រកមិនឃើញសាខា '${branchName}' ទេ` };
    }

    const incVal = adjustmentType === 'increase' ? quantity : -quantity;
    
    // Atomically increment stock in Firestore
    const productRef = doc(db, "products", product.sku);
    await updateDoc(productRef, {
      [`warehouseStock.${branch.id}`]: increment(incVal)
    });

    // Write audit log
    const logId = `AUD-BOT-${Date.now()}`;
    const newLog = {
      id: logId,
      timestamp: new Date().toISOString(),
      username: `telegram_${senderUsername}`,
      actionType: 'Stock Adjustment (AI Bot)',
      activityDetails: `Adjusted stock for ${product.nameEn} (SKU: ${product.sku}) at ${branch.nameKh || branch.name}: ${incVal > 0 ? '+' : ''}${incVal} units. Reason: ${reason || 'Telegram command'}`
    };
    await setDoc(doc(db, "audit_logs", logId), newLog);

    return {
      success: true,
      productName: product.nameEn,
      sku: product.sku,
      branchName: branch.nameKh || branch.name,
      adjustment: incVal,
      newQtyEstimate: (product.warehouseStock?.[branch.id] || 0) + incVal
    };
  }

  if (name === "getSalesReport") {
    if (!hasPerm("sales_report")) {
      return { error: "អ្នកមិនមានសិទ្ធិមើលរបាយការណ៍លក់ទេ (No permission to see sales report)" };
    }

    const { timePeriod } = args;
    
    // Set time period filters
    let startDate = new Date();
    startDate.setHours(0,0,0,0);
    
    if (timePeriod === "yesterday") {
      startDate.setDate(startDate.getDate() - 1);
    } else if (timePeriod === "this_week") {
      startDate.setDate(startDate.getDate() - 7);
    } else if (timePeriod === "this_month") {
      startDate.setDate(startDate.getDate() - 30);
    }

    const startDateISO = startDate.toISOString();
    const endDateISO = timePeriod === "yesterday" 
      ? new Date(new Date().setHours(0,0,0,0)).toISOString() 
      : new Date().toISOString();

    // Query transactions
    const q = query(
      collection(db, "transactions"), 
      where("date", ">=", startDateISO),
      where("date", "<=", endDateISO)
    );
    const snap = await getDocs(q);

    let totalRevenue = 0;
    let totalProfit = 0;
    let totalDiscount = 0;
    let transactionCount = 0;

    snap.forEach(d => {
      const tx = d.data();
      totalRevenue += tx.total || 0;
      totalProfit += tx.profit || 0;
      totalDiscount += tx.discount || 0;
      transactionCount++;
    });

    return {
      success: true,
      timePeriod,
      transactionCount,
      totalRevenue,
      totalProfit,
      totalDiscount
    };
  }

  if (name === "lookupCustomer") {
    if (!hasPerm("customer_lookup")) {
      return { error: "អ្នកមិនមានសិទ្ធិមើលព័ត៌មានអតិថិជនទេ (No permission to lookup customer)" };
    }

    const { nameOrPhone } = args;
    const queryStr = nameOrPhone.toLowerCase().trim();

    const customersSnap = await getDocs(collection(db, "customers"));
    const customers = [];
    customersSnap.forEach(d => customers.push(d.data()));

    const matched = customers.filter(c => 
      c.phone?.toLowerCase().includes(queryStr) ||
      c.name.toLowerCase().includes(queryStr)
    );

    if (matched.length === 0) {
      return { success: false, message: `រកមិនឃើញអតិថិជនឈ្មោះ ឬលេខទូរស័ព្ទ '${nameOrPhone}' ទេ` };
    }

    const results = matched.map(c => ({
      name: c.name,
      phone: c.phone || "",
      address: c.address || "",
      outstandingDebt: c.outstandingDebt || 0,
      totalPaid: c.totalPaid || 0
    }));

    return { success: true, customers: results };
  }

  return { error: "Unknown function call" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1. Get global settings
    const settingsSnap = await getDoc(doc(db, "company_settings", "global"));
    const settings = settingsSnap.exists() ? settingsSnap.data() : {};

    // Check if AI Bot is active
    if (!settings.telegramAiBotEnabled) {
      return res.status(200).send("AI Bot disabled in settings");
    }

    // 2. Validate Telegram token from query parameter
    const queryToken = req.query.token;
    if (!queryToken || queryToken !== settings.telegramAiBotToken) {
      return res.status(403).json({ error: "Unauthorized webhook token" });
    }

    // 3. Parse message from Telegram body
    const body = req.body;
    if (!body || !body.message) {
      return res.status(200).send("No message field found in body");
    }

    const message = body.message;
    const chatId = message.chat.id;
    const messageId = message.message_id;
    const text = message.text;

    if (!text) {
      return res.status(200).send("Message has no text");
    }

    // 4. Trigger Check: Only respond to DMs, replies to the bot, or if name is mentioned
    const isPrivateChat = message.chat.type === "private";
    const cleanText = text.toLowerCase();
    const mentionsName = cleanText.includes("ceaca") || cleanText.includes("ស៊ីការ");

    let isReplyToBot = false;
    if (message.reply_to_message) {
      const replyFrom = message.reply_to_message.from || {};
      const botUsername = (settings.telegramAiBotUsername || "").replace('@', '').toLowerCase();
      const botTokenId = settings.telegramAiBotToken ? settings.telegramAiBotToken.split(':')[0] : '';
      if (replyFrom.is_bot && (replyFrom.username?.toLowerCase() === botUsername || String(replyFrom.id) === botTokenId)) {
        isReplyToBot = true;
      }
    }

    if (!isPrivateChat && !mentionsName && !isReplyToBot) {
      return res.status(200).send("Ignored: name not called in group");
    }

    // Extract user info
    const senderUser = message.from || {};
    const senderUsername = senderUser.username || "";
    const senderId = String(senderUser.id);

    // 5. Authenticate sender username or Telegram ID in allowed users list
    const allowedUsers = settings.telegramAiBotAllowedUsers || [];
    const normalizedSenderUsername = senderUsername.replace('@', '').toLowerCase();
    
    const authUser = allowedUsers.find(u => {
      const cleanConfigUser = u.username.replace('@', '').toLowerCase().trim();
      return cleanConfigUser === normalizedSenderUsername || cleanConfigUser === senderId;
    });

    if (!authUser) {
      // Send unauthorized message and return
      const replyText = `🛑 សុំទោស! គណនី Telegram របស់អ្នក (@${senderUsername || senderId}) មិនទាន់ត្រូវបានអនុញ្ញាតឱ្យប្រើប្រាស់ AI Bot ជំនួយការនេះឡើយបាទ។ សូមទាក់ទង Admin ដើម្បីកំណត់សិទ្ធិ។`;
      await sendTelegram(settings.telegramAiBotToken, "sendMessage", {
        chat_id: chatId,
        text: replyText,
        reply_to_message_id: messageId
      });
      return res.status(200).send("Unauthorized sender");
    }

    const userPermissions = authUser.permissions || [];

    // 6. Initialize Gemini conversation with instructions
    const systemPrompt = settings.telegramAiBotInstructions || 
      "Your name is ស៊ីការ (Ceaca). You are a loyal and highly intelligent AI Sales & Inventory assistant for ABC System, created to serve your Boss (ម្ចាស់ហាង/ប្រធាន) named បងដានី (Dany). Answer politely in Khmer or English. Always refer to yourself as ស៊ីការ (Ceaca). Address your boss respectfully as 'បងដានី' (Brother Dany) or 'លោកប្រធាន'. Treat him and staff with high respect. You can search stock, lookup customer files, view sales ledger totals, and adjust stock counts atomically using the provided tools.";

    const geminiApiKey = settings.telegramAiBotApiKey || process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      await sendTelegram(settings.telegramAiBotToken, "sendMessage", {
        chat_id: chatId,
        text: "🚨 ប្រព័ន្ធខ្វះខាត Gemini API Key នៅក្នុងការកំណត់ Settings! សូមបញ្ចូលលេខកូដសម្ងាត់ API Key ដើម្បីឱ្យ AI ដំណើរការបាទ។",
        reply_to_message_id: messageId
      });
      return res.status(200).send("Gemini API Key missing");
    }

    // Call Gemini with user input and tool definitions
    let currentContents = [
      {
        role: "user",
        parts: [{ text: text }]
      }
    ];

    let geminiResponse = await callGemini(geminiApiKey, systemPrompt, currentContents, aiTools);
    
    // Check if model returned a tool call request
    let parts = geminiResponse.candidates?.[0]?.content?.parts;
    
    if (parts?.[0]?.functionCall) {
      const call = parts[0].functionCall;
      const functionName = call.name;
      const functionArgs = call.args;
      const callId = call.id;
      const thoughtSignature = parts[0].thoughtSignature || parts[0].thought_signature;

      // Add the model's functionCall turn to the content history
      const modelPart = {
        functionCall: {
          name: functionName,
          args: functionArgs
        }
      };
      if (callId) {
        modelPart.functionCall.id = callId;
      }
      if (thoughtSignature) {
        modelPart.thoughtSignature = thoughtSignature;
        modelPart.thought_signature = thoughtSignature;
      }

      currentContents.push({
        role: "model",
        parts: [modelPart]
      });

      // Execute the database query
      let result;
      try {
        result = await executeTool(functionName, functionArgs, userPermissions, senderUsername || senderId, db);
      } catch (err) {
        result = { error: err.message };
      }

      // Add the function execution output turn to the history
      const clientPart = {
        functionResponse: {
          name: functionName,
          response: { name: functionName, content: result }
        }
      };
      if (callId) {
        clientPart.functionResponse.id = callId;
      }
      if (thoughtSignature) {
        clientPart.thoughtSignature = thoughtSignature;
        clientPart.thought_signature = thoughtSignature;
      }

      currentContents.push({
        role: "user",
        parts: [clientPart]
      });

      // Call Gemini again to format the final friendly text response
      geminiResponse = await callGemini(geminiApiKey, systemPrompt, currentContents, aiTools);
    }

    // Extract text reply or output detailed error for debugging
    let textReply = "";
    if (geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text) {
      textReply = geminiResponse.candidates[0].content.parts[0].text;
    } else if (geminiResponse.error) {
      textReply = `🛑 Error from Gemini API: ${geminiResponse.error.message} (Code: ${geminiResponse.error.code})\n\nសូមពិនិត្យមើលថាតើ Gemini API Key របស់បងត្រឹមត្រូវ និងទើបបង្កើតថ្មីដែរឬទេបាទ!`;
    } else {
      textReply = `បាទបង! ខ្ញុំបានទទួលសារហើយ ប៉ុន្តែមិនអាចឆ្លើយតបបានទេនៅពេលនេះ។\n(Debug: ${JSON.stringify(geminiResponse)})`;
    }

    // 6. Reply to user in Telegram Group
    await sendTelegram(settings.telegramAiBotToken, "sendMessage", {
      chat_id: chatId,
      text: textReply,
      reply_to_message_id: messageId
    });

    return res.status(200).send("Success");
  } catch (error) {
    console.error("AI Bot error:", error);
    return res.status(200).send(`Error: ${error.message}`);
  }
}
