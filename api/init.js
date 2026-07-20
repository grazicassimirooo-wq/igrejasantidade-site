/* ============================================================
   POST /api/init?secret=xxx
   Cria os 100 documentos de números no Firestore.
   Rodar UMA VEZ após configurar o Firebase.
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
  const secret = req.query.secret || req.body?.secret;
  if (secret !== process.env.INIT_SECRET) return res.status(401).send('Unauthorized');

  const total = Number(req.query.total || process.env.TOTAL_NUMEROS || 100);
  const digitos = String(total - 1).length;

  try {
    initFirebase();
    const db = admin.firestore();
    const batch = db.batch();
    for (let i = 0; i < total; i++) {
      const id = String(i).padStart(digitos, '0');
      batch.set(db.collection('numeros').doc(id), {
        numero: i, status: 'livre', compraId: null, cliente: null, reservadoAte: null
      });
    }
    await batch.commit();
    return res.status(200).json({ criados: total });
  } catch (e) {
    console.error('[init] erro:', e);
    return res.status(500).json({ erro: e.message });
  }
}
