const firebaseConfig = {
  apiKey: "AIzaSyAR8YkGNP2FVbou06u9MJVCLIdMg_Hq8J8",
  authDomain: "nfel-tradefinance-portal.firebaseapp.com",
  projectId: "nfel-tradefinance-portal",
  storageBucket: "nfel-tradefinance-portal.firebasestorage.app",
  messagingSenderId: "357997752401",
  appId: "1:357997752401:web:914b868b44c87770254870",
  measurementId: "G-M0RQ2SHDQ6",
};

if (window.firebase && !window.firebase.apps.length) {
  window.firebase.initializeApp(firebaseConfig);
}

window.nfelFirebase = {
  auth: window.firebase?.auth ? window.firebase.auth() : null,
};
