const { initializeApp } = require("firebase/app");
const { getFirestore, doc, getDoc } = require("firebase/firestore");

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
  const fId = "FLP-1094-YDC";
  const docSnap = await getDoc(doc(db, "followups", fId));
  if (docSnap.exists()) {
    console.log(JSON.stringify(docSnap.data(), null, 2));
  } else {
    console.log("Followup not found");
  }
}

run().catch(console.error);
