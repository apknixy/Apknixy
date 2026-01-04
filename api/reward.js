// api/reward.js
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
    });
}

const db = admin.firestore();

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { uid, taskId, securityToken } = req.body;

    // 1. Security Check (Basic)
    if (!uid || !taskId) return res.status(400).json({ error: "Missing Data" });

    try {
        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();

        if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

        const userData = userDoc.data();
        const lastTaskTime = userData.lastTaskTime ? userData.lastTaskTime.toDate() : new Date(0);
        const now = new Date();

        // 2. Anti-Cheat: Time Check (Kam se kam 50 seconds ka gap hona chahiye)
        const timeDiff = (now - lastTaskTime) / 1000;
        if (timeDiff < 50) {
            return res.status(429).json({ error: "Too fast! Wait 1 minute." });
        }

        // 3. Daily Limit Check (1000 Tasks)
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        let dailyCount = userData.dailyCount || 0;
        let lastDate = userData.lastTaskDate || "";

        if (lastDate !== today) {
            dailyCount = 0; // Reset for new day
        }

        if (dailyCount >= 1000) {
            return res.status(403).json({ error: "Daily limit reached (1000 tasks)." });
        }

        // 4. Update Balance & History
        await db.runTransaction(async (t) => {
            t.update(userRef, {
                balance: admin.firestore.FieldValue.increment(1), // ₹1 Add
                lastTaskTime: now,
                lastTaskDate: today,
                dailyCount: dailyCount + 1,
                completedTasks: admin.firestore.FieldValue.arrayUnion(taskId)
            });
        });

        return res.status(200).json({ success: true, newBalance: (userData.balance || 0) + 1 });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Server Error" });
    }
}
