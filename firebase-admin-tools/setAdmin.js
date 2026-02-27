const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore(); // 👈 Access Firestore

const adminUids = [
  'Grlx15oNtVPjTthbQG1Zfpc6kOl2',
  'iRZI2sWaHrPL89ehFT11qedgYzh1',
  'UvRMuOUihEax6189rZBcIC6zGdp2'
];

async function grantAdmin(uid) {
  // 1. Set Custom Claim (for Security Rules)
  await admin.auth().setCustomUserClaims(uid, { admin: true });
  
  // 2. Update Firestore Doc (for your React UI)
  await db.collection('users').doc(uid).set({
    role: 'admin'
  }, { merge: true });

  console.log(`✅ User ${uid} is now an admin in Auth AND Firestore!`);
}

// Run the update for all UIDs
Promise.all(adminUids.map(uid => grantAdmin(uid)))
  .then(() => {
    console.log('🎉 All admin updates complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });