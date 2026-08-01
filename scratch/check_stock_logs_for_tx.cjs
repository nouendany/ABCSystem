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
  console.log("Searching stock_logs...");
  const logsSnap = await getDocs(collection(db, "stock_logs"));
  const matches = [];
  logsSnap.forEach(d => {
    const data = d.data();
    const desc = data.description || '';
    if (desc.toUpperCase().includes("TX-1313-7KF") || desc.toUpperCase().includes("INV-2026-1313-7KF")) {
      matches.push({ id: d.id, ...data });
    }
  });

  console.log("Matches found in stock_logs:", matches.length);
  matches.forEach(m => {
    console.log("-----------------------------------------");
    console.log(`Doc ID: ${m.id}`);
    console.log(`Date: ${m.date}`);
    console.log(`SKU: ${m.sku}`);
    console.log(`Qty: ${m.qty}`);
    console.log(`Type: ${m.type}`);
    console.log(`Description: ${m.description}`);
    console.log(`UserId/CreatedBy (if any): ${m.userId || m.createdBy || m.staffId || m.staffName}`);
  });
}

run().catch(console.error);
