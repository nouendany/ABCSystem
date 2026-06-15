import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getFirestore, doc, getDoc, setDoc, updateDoc, 
  collection, query, where, getDocs, addDoc, orderBy, limit 
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

    // Load HR Settings
    const settingsSnap = await getDoc(doc(db, "company_settings", "global"));
    const settings = settingsSnap.exists() ? settingsSnap.data() : {};
    const token = settings.hrTelegramBotToken || settings.telegramToken;

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

    const menuMarkup = {
      keyboard: [
        [{ text: "✅ ចូលការងារ (Check-In)" }, { text: "✅ ចេញការងារ (Check-Out)" }],
        [{ text: "📝 សុំច្បាប់ (Leave)" }, { text: "👤 ព័ត៌មានខ្ញុំ (Profile)" }],
        [{ text: "📅 ប្រវត្តិវត្តមាន" }, { text: "📢 សេចក្ដីជូនដំណឹង" }],
        [{ text: "☎️ ទាក់ទង Admin" }]
      ],
      resize_keyboard: true
    };

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
              reply_markup: menuMarkup
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
      await sendTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: `👤 **ព័ត៌មានបុគ្គលិក**\n\n🆔 អត្តលេខ៖ ${employee.id}\n📛 ឈ្មោះ៖ ${employee.fullName}\n🚻 ភេទ៖ ${employee.gender || 'N/A'}\n📞 ទូរស័ព្ទ៖ ${employee.phone || 'N/A'}\n🏢 ផ្នែក៖ ${employee.department || 'N/A'}\n📌 តួនាទី៖ ${employee.position || 'N/A'}\n📅 ថ្ងៃចូលការងារ៖ ${employee.joinDate || 'N/A'}\n🟢 ស្ថានភាព៖ ${employee.status || 'Active'}`,
        reply_markup: menuMarkup
      });
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
            [{ text: "Emergency (ច្បាប់បន្ទាន់)", callback_data: "leave_Emergency" }]
          ]
        }
      });
      return res.status(200).send("OK");
    }

    if (text === "📢 សេចក្ដីជូនដំណឹង") {
      await sendTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: `📢 **សេចក្ដីជូនដំណឹងក្រុមហ៊ុន**\n\nបច្ចុប្បន្នគ្មានសេចក្តីជូនដំណឹងថ្មីនៅឡើយទេ។`,
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
        const officeLat = parseFloat(settings.hrOfficeLatitude) || 11.5564;
        const officeLng = parseFloat(settings.hrOfficeLongitude) || 104.9282;
        const allowedRadius = parseFloat(settings.hrOfficeRadius) || 100;

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
          // Inside Radius -> Send Web App Camera Button
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
            text: `📍 **ទីតាំងត្រឹមត្រូវ! (ចម្ងាយ៖ ${Math.round(distance)} ម៉ែត្រ)**\n\n📸 សូមចុចប៊ូតុងខាងក្រោមដើម្បីថតរូប **Selfie** ផ្ទាល់ខ្លួនរបស់អ្នក ចូលទៅក្នុងប្រព័ន្ធ៖`,
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
          const startHours = settings.hrWorkStart || "08:00";
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
              latitude: session.latitude,
              longitude: session.longitude,
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
              latitude: session.latitude,
              longitude: session.longitude,
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

    // HANDLE TEXT-BASED MULTI-STEP INPUTS (LEAVE REQUEST DATES/REASON)
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
          text: `🗓️ ថ្ងៃចាប់ផ្តើម៖ *${startDateInput}*\n\n👉 សូមវាយបញ្ចូល **ថ្ងៃបញ្ចប់** ឧទាហរណ៍៖ \`2026-06-17\` ឬ \`ថ្ងៃស្អែក\`៖`
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

    const menuMarkup = {
      keyboard: [
        [{ text: "✅ ចូលការងារ (Check-In)" }, { text: "✅ ចេញការងារ (Check-Out)" }],
        [{ text: "📝 សុំច្បាប់ (Leave)" }, { text: "👤 ព័ត៌មានខ្ញុំ (Profile)" }],
        [{ text: "📅 ប្រវត្តិវត្តមាន" }, { text: "📢 សេចក្ដីជូនដំណឹង" }],
        [{ text: "☎️ ទាក់ទង Admin" }]
      ],
      resize_keyboard: true
    };

    if (action === "checkin") {
      const startHours = settings.hrWorkStart || "08:00";
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
