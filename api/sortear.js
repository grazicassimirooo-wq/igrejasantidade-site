/* ============================================================
   POST /api/sortear
   Body: { secret }
   Sorteia entre os números vendidos, salva doc oficial travado
   no Firestore. Rejeita se já houver sorteio realizado.
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
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Method not allowed' });

  const { secret } = req.body || {};
  if (!process.env.SORTEIO_SECRET || secret !== process.env.SORTEIO_SECRET) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }

  try {
    initFirebase();
    const db = admin.firestore();
    const sorteioRef = db.collection('sorteio').doc('oficial');

    /* Transação atômica: impede sortear duas vezes mesmo com cliques simultâneos */
    const resultado = await db.runTransaction(async (tx) => {
      const existente = await tx.get(sorteioRef);
      if (existente.exists) {
        const e = new Error('SORTEIO_JA_REALIZADO');
        e.dados = existente.data();
        throw e;
      }

      const numerosSnap = await db.collection('numeros').where('status', '==', 'vendido').get();
      if (numerosSnap.empty) throw new Error('SEM_NUMEROS_VENDIDOS');

      const vendidos = [];
      numerosSnap.forEach(d => {
        const data = d.data();
        vendidos.push({
          numero: data.numero,
          cliente: data.cliente || { nome: '—', wpp: '—' },
          compraId: data.compraId || null
        });
      });

      /* Sorteio: crypto.getRandomValues seria mais forte, mas Math.random do Node
         é adequado pra esse volume — e ninguém consegue manipular do lado cliente */
      const idx = Math.floor(Math.random() * vendidos.length);
      const vencedor = vendidos[idx];

      const PRECO = Number(process.env.PRECO_POR_NUM || 50);
      const resultadoFinal = {
        numero: vencedor.numero,
        ganhador: vencedor.cliente,
        compraId: vencedor.compraId,
        sorteadoEm: admin.firestore.Timestamp.now(),
        totalVendidos: vendidos.length,
        totalArrecadado: vendidos.length * PRECO
      };

      tx.set(sorteioRef, resultadoFinal);
      return resultadoFinal;
    });

    return res.status(200).json({ ok: true, resultado });

  } catch (e) {
    if (e.message === 'SORTEIO_JA_REALIZADO') {
      return res.status(409).json({ erro: 'Sorteio já foi realizado', resultado: e.dados });
    }
    if (e.message === 'SEM_NUMEROS_VENDIDOS') {
      return res.status(400).json({ erro: 'Nenhum número foi vendido ainda' });
    }
    console.error('[sortear] erro:', e);
    return res.status(500).json({ erro: e.message || 'Erro interno' });
  }
}
