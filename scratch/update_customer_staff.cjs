const { initializeApp } = require("firebase/app");
const { getFirestore, doc, updateDoc, getDoc } = require("firebase/firestore");

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
  const custId = "CST-1158";
  const newStaffId = "ABC2026008"; // Phai Chanthou

  console.log(`Fetching customer ${custId}...`);
  const docRef = doc(db, "customers", custId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    console.error("Customer not found!");
    return;
  }

  const oldStaffId = docSnap.data().staffId;
  console.log(`Current assigned staff ID: ${oldStaffId}`);
  
  console.log(`Updating staff ID to ${newStaffId} (Phai Chanthou)...`);
  await updateDoc(docRef, {
    staffId: newStaffId
  });

  console.log("Customer updated successfully!");
  
  // Verify after update
  const updatedSnap = await getDoc(docRef);
  console.log("Verified assigned staff ID now:", updatedSnap.data().staffId);
}

run().catch(console.error);
