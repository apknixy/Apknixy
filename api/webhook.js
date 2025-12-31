const admin = require('firebase-admin');

// 1. Firebase Admin Setup (Server Side)
if (!admin.apps.length) {
  // Hum Environment Variables se secret keys lenge
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Private key mein jo new lines hoti hain unhe fix kar rahe hain
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    })
  });
}

const db = admin.firestore();

// 2. Main Function jo Mobidea Call karega
export default async function handler(req, res) {
  // Mobidea se data le rahe hain (uid aur payout)
  const { uid, payout } = req.query;

  // Agar data nahi mila to error do
  if (!uid || !payout) {
    return res.status(400).json({ error: 'Missing UID or Payout' });
  }

  const dollars = parseFloat(payout); // Jaise $1.00
  const rate = 60; // $1 = ₹60
  
  // Kitne rupay dene hain? (Agar $0.5 hua to ₹30 milenge)
  const rupeesToAdd = Math.floor(dollars * rate);

  if (rupeesToAdd <= 0) return res.status(200).send('Amount too low, skipped.');

  try {
    const userRef = db.collection('users').doc(uid);

    // 3. Balance Update (Transaction Safe)
    await db.runTransaction(async (t) => {
      const doc = await t.get(userRef);
      if (!doc.exists) {
        throw "User not found";
      }
      
      const currentBal = doc.data().balance || 0;
      const newBal = currentBal + rupeesToAdd;

      t.update(userRef, {
        balance: newBal,
        lastEarningDate: new Date(),
        totalEarningsUSD: (doc.data().totalEarningsUSD || 0) + dollars
      });
    });

    // 4. History (Optional Log)
    await db.collection('earnings_history').add({
      userId: uid,
      amountINR: rupeesToAdd,
      amountUSD: dollars,
      source: 'Mobidea SmartLink',
      date: new Date()
    });

    // Mobidea ko bolo "OK"
    return res.status(200).send('OK: Balance Updated');

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).send("Error updating balance");
  }
}
