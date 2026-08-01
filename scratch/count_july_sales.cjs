const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs } = require("firebase/firestore");

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
  const snap = await getDocs(collection(db, "transactions"));
  const start = new Date("2026-07-01T00:00:00.000Z");
  const end = new Date("2026-07-31T23:59:59.999Z");
  
  let count = 0;
  let revenue = 0;
  const staffSales = {};
  const paymentSales = {};

  snap.forEach(d => {
    const data = d.data();
    if (!data.date) return;
    const dt = new Date(data.date);
    if (dt >= start && dt <= end) {
      count++;
      revenue += data.total || 0;
      const sName = data.staffName || "Unknown";
      staffSales[sName] = (staffSales[sName] || 0) + (data.total || 0);
      const pMethod = data.paymentMethod || "Unknown";
      paymentSales[pMethod] = (paymentSales[pMethod] || 0) + (data.total || 0);
    }
  });

  console.log("July 2026 Sales Summary:");
  console.log(`Total Sales Count: ${count}`);
  console.log(`Total Revenue: $${revenue.toFixed(2)}`);
  console.log("Sales by Staff:", staffSales);
  console.log("Sales by Payment Method:", paymentSales);
}

run().catch(console.error);
