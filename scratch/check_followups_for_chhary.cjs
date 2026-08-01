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
  console.log("Searching followups...");
  const snap = await getDocs(collection(db, "followups"));
  const matches = [];
  snap.forEach(d => {
    const data = d.data();
    if (data.customerId === "CST-1158") {
      matches.push({ id: d.id, ...data });
    }
  });

  console.log("Matches found in followups:", matches.length);
  matches.forEach(m => {
    console.log("-----------------------------------------");
    console.log(`Doc ID: ${m.id}`);
    console.log(`Date/Timestamp: ${m.timestamp || m.date}`);
    console.log(`Customer: ${m.customerName} (ID: ${m.customerId})`);
    console.log(`Staff ID: ${m.staffId}`);
    console.log(`Staff Name: ${m.staffName}`);
    console.log(`Created By: ${m.createdBy}`);
    console.log(`Notes: ${m.notes || m.comment}`);
  });
}

run().catch(console.error);
