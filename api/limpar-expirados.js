/* ============================================================
   GET /api/limpar-expirados
   Rodado pelo Vercel Cron (a cada 10min) — libera números
   cujas reservas passaram do prazo de 15 minutos.
   ============================================================ */
import admin from 'firebase-admin';

function initFirebase() {
  if (admin.apps.length) return;
  const key = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: key
    })
  });
}

export default async function handler(req, res) {
  /* Cron do Vercel manda header próprio — evita chamadas externas */
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).send('Unauthorized');
  }

  try {
    initFirebase();
    const db = admin.firestore();
    const agora = admin.firestore.Timestamp.now();

    const snap = await db.collection('numeros')
      .where('status', '==', 'reservado')
      .where('reservadoAte', '<=', agora)
      .get();

    if (snap.empty) return res.status(200).json({ liberados: 0 });

    const batch = db.batch();
    const compraIds = new Set();
    snap.forEach(d => {
      batch.set(d.ref, { status: 'livre', compraId: null, reservadoAte: null }, { merge: true });
      if (d.data().compraId) compraIds.add(d.data().compraId);
    });
    /* Marca as compras associadas como expiradas */
    compraIds.forEach(id => {
      batch.update(db.collection('compras').doc(id), { status: 'expirado' });
    });
    await batch.commit();

    return res.status(200).json({ liberados: snap.size, compras: compraIds.size });
  } catch (e) {
    console.error('[limpar] erro:', e);
    return res.status(500).json({ erro: e.message });
  }
}
