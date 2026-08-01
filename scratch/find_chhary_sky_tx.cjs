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
  console.log("Searching transactions...");
  const txSnap = await getDocs(collection(db, "transactions"));
  const matches = [];
  txSnap.forEach(d => {
    const data = d.data();
    const custName = data.customerName || '';
    if (custName.toLowerCase().includes("chhary") || custName.toLowerCase().includes("sky")) {
      matches.push({ id: d.id, ...data });
    }
  });

  console.log("Matches found:", matches.length);
  matches.forEach(m => {
    console.log("-----------------------------------------");
    console.log(`Doc ID: ${m.id}`);
    console.log(`Date: ${m.date || m.timestamp}`);
    console.log(`Customer: ${m.customerName} (ID: ${m.customerId})`);
    console.log(`Staff ID: ${m.staffId}`);
    console.log(`Staff Name: ${m.staffName}`);
    console.log(`Created By: ${m.createdBy}`);
    console.log(`Updated By: ${m.updatedBy}`);
    console.log(`Status: ${m.status}`);
    console.log(`Total: ${m.total}`);
  });
}

run().catch(console.error);
