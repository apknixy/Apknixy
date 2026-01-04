const admin = require('firebase-admin');

// Firebase Init
if (!admin.apps.length) {
    // Private Key formatting fix
    const privateKey = process.env.FIREBASE_PRIVATE_KEY 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : undefined;

    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
        })
    });
}

const db = admin.firestore();

// Yahan 'export default' ki jagah 'module.exports' use kar rahe hain (Crash Fix)
module.exports = async (req, res) => {
    // Sirf POST request allow karo
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const { uid, taskId } = req.body;

    if (!uid || !taskId) {
        return res.status(400).json({ error: "Missing Data" });
    }

    try {
        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: "User not found" });
        }

        const userData = userDoc.data();
        const lastTaskTime = userData.lastTaskTime ? userData.lastTaskTime.toDate() : new Date(0);
        const now = new Date();

        // 50 Seconds Security Check
        const timeDiff = (now - lastTaskTime) / 1000;
        if (timeDiff < 50) {
            return res.status(429).json({ error: "Too fast! Please wait." });
        }

        // Daily Limit Logic
        const today = new Date().toISOString().slice(0, 10);
        let dailyCount = userData.dailyCount || 0;
        let lastDate = userData.lastTaskDate || "";

        if (lastDate !== today) {
            dailyCount = 0; 
        }

        if (dailyCount >= 1000) {
            return res.status(403).json({ error: "Daily limit reached." });
        }

        // Transaction (Balance Update)
        await db.runTransaction(async (t) => {
            t.update(userRef, {
                balance: admin.firestore.FieldValue.increment(1),
                lastTaskTime: now,
                lastTaskDate: today,
                dailyCount: dailyCount + 1
            });
        });

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error("Backend Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
