const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    })
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  const { uid, amount, tx } = req.query;

  if (!uid || !amount || !tx) return res.status(400).json({ error: 'Missing Data' });

  // Rate pehle hi TimeWall me 50 set hai, to direct amount use karenge
  const points = parseFloat(amount); 

  try {
    const txRef = db.collection('transactions').doc(tx);
    const txDoc = await txRef.get();

    if (txDoc.exists) return res.status(200).send('1');

    await db.runTransaction(async (t) => {
      const userRef = db.collection('users').doc(uid);
      const userDoc = await t.get(userRef);
      
      if (!userDoc.exists) throw "User not found";

      const newBal = (userDoc.data().balance || 0) + points;
      t.update(userRef, { balance: newBal });
      t.set(txRef, { uid, amount: points, source: 'TimeWall', date: new Date() });
    });

    return res.status(200).send('1');
  } catch (error) {
    console.error(error);
    return res.status(500).send("Error");
  }
}
