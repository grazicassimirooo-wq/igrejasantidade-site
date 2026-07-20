/* ============================================================
   POST /api/webhook-asaas
   Chamado pelo Asaas quando um pagamento muda de status.
   Doc: https://docs.asaas.com/docs/webhooks
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

const EVENTOS_PAGO = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_APPROVED_BY_RISK_ANALYSIS'];
const EVENTOS_CANCELADO = ['PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_OVERDUE'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  /* Validação do token — Asaas envia o valor que você configurou no cadastro do webhook */
  const token = req.headers['asaas-access-token'];
  if (process.env.ASAAS_WEBHOOK_TOKEN && token !== process.env.ASAAS_WEBHOOK_TOKEN) {
    return res.status(401).send('Token inválido');
  }

  try {
    const { event, payment } = req.body || {};
    if (!event || !payment) return res.status(400).send('Payload inválido');

    const compraId = payment.externalReference;
    if (!compraId) return res.status(200).send('Sem referência');

    initFirebase();
    const db = admin.firestore();
    const compraRef = db.collection('compras').doc(compraId);
    const snap = await compraRef.get();
    if (!snap.exists) return res.status(200).send('Compra não encontrada');
    const compra = snap.data();

    if (EVENTOS_PAGO.includes(event)) {
      /* Marca compra como paga + números como vendidos */
      const batch = db.batch();
      const agora = admin.firestore.Timestamp.now();
      batch.update(compraRef, { status: 'pago', pagoEm: agora });
      compra.numeros.forEach(n => {
        batch.set(db.collection('numeros').doc(String(n).padStart(2, '0')), {
          status: 'vendido',
          compraId,
          cliente: { nome: compra.nome, wpp: compra.wpp },
          reservadoAte: null,
          vendidoEm: agora
        }, { merge: true });
      });
      await batch.commit();
      console.log(`[webhook] ${event} → compra ${compraId} paga (${compra.numeros.length} nº)`);
    }
    else if (EVENTOS_CANCELADO.includes(event)) {
      /* Libera os números de volta pra livre */
      const batch = db.batch();
      batch.update(compraRef, { status: 'cancelado' });
      compra.numeros.forEach(n => {
        batch.set(db.collection('numeros').doc(String(n).padStart(2, '0')), {
          status: 'livre', compraId: null, cliente: null, reservadoAte: null
        }, { merge: true });
      });
      await batch.commit();
      console.log(`[webhook] ${event} → compra ${compraId} cancelada`);
    }

    return res.status(200).send('OK');
  } catch (e) {
    console.error('[webhook] erro:', e);
    return res.status(500).send('Erro interno');
  }
}
