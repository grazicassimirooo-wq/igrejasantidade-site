/* ============================================================
   POST /api/reservar
   Body: { numeros:[3,7,12], nome, wpp, email, cidade, tipo:'pix'|'cartao' }
   Retorna: { compraId, pixQrImageBase64, pixCopyPaste, invoiceUrl }
   ============================================================ */
import admin from 'firebase-admin';

/* Inicializa Firebase Admin uma única vez (reaproveita entre invocações) */
function initFirebase() {
  if (admin.apps.length) return admin.app();
  const key = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: key
    })
  });
}

const ASAAS_URL = process.env.ASAAS_ENV === 'prod'
  ? 'https://api.asaas.com/v3'
  : 'https://api-sandbox.asaas.com/v3';

async function asaas(path, method = 'GET', body) {
  const r = await fetch(ASAAS_URL + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'access_token': process.env.ASAAS_API_KEY,
      'User-Agent': 'IBSS-Sorteio/1.0'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await r.json();
  if (!r.ok) throw new Error('Asaas: ' + (data.errors?.[0]?.description || r.statusText));
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Method not allowed' });

  try {
    const { numeros, nome, wpp, email, cidade, tipo } = req.body || {};
    if (!Array.isArray(numeros) || !numeros.length) return res.status(400).json({ erro: 'Números inválidos' });
    if (!nome || !wpp) return res.status(400).json({ erro: 'Nome e WhatsApp são obrigatórios' });
    if (!['pix', 'cartao'].includes(tipo)) return res.status(400).json({ erro: 'Tipo de pagamento inválido' });

    const PRECO_POR_NUM = Number(process.env.PRECO_POR_NUM || 100);
    const total = numeros.length * PRECO_POR_NUM;

    initFirebase();
    const db = admin.firestore();

    /* Transação atômica: verifica que TODOS os números estão livres e reserva */
    const agora = admin.firestore.Timestamp.now();
    const reservadoAte = admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);
    const compraRef = db.collection('compras').doc();
    const compraId = compraRef.id;

    await db.runTransaction(async (tx) => {
      const refs = numeros.map(n => db.collection('numeros').doc(String(n).padStart(2, '0')));
      const snaps = await Promise.all(refs.map(r => tx.get(r)));
      for (let i = 0; i < snaps.length; i++) {
        const d = snaps[i].data() || { status: 'livre' };
        const expirado = d.status === 'reservado' && d.reservadoAte?.toMillis?.() <= Date.now();
        if (d.status === 'vendido' || (d.status === 'reservado' && !expirado)) {
          throw new Error(`Número ${numeros[i]} não está mais disponível`);
        }
      }
      refs.forEach((r, i) => tx.set(r, {
        status: 'reservado',
        compraId,
        reservadoAte,
        atualizadoEm: agora
      }, { merge: true }));
      tx.set(compraRef, {
        numeros, nome, wpp, email: email || null, cidade: cidade || null,
        total, tipo, status: 'pendente', criadoEm: agora
      });
    });

    /* Cria/localiza cliente no Asaas */
    const wppDigits = wpp.replace(/\D/g, '');
    let customer;
    try {
      const found = await asaas(`/customers?phone=${wppDigits}&limit=1`);
      customer = found.data?.[0];
    } catch (_) {}
    if (!customer) {
      customer = await asaas('/customers', 'POST', {
        name: nome, mobilePhone: wppDigits,
        email: email || undefined, externalReference: compraId
      });
    }

    /* Cria a cobrança */
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const payment = await asaas('/payments', 'POST', {
      customer: customer.id,
      billingType: tipo === 'pix' ? 'PIX' : 'CREDIT_CARD',
      value: total,
      dueDate,
      description: `IBSS · Sorteio da Moto · Nº ${numeros.map(n => String(n).padStart(2, '0')).join(', ')}`,
      externalReference: compraId
    });

    /* Se Pix: busca o QR Code */
    let pixQrImageBase64, pixCopyPaste;
    if (tipo === 'pix') {
      const qr = await asaas(`/payments/${payment.id}/pixQrCode`);
      pixQrImageBase64 = qr.encodedImage;
      pixCopyPaste = qr.payload;
    }

    /* Guarda referências do Asaas na compra */
    await compraRef.update({
      asaasPaymentId: payment.id,
      asaasInvoiceUrl: payment.invoiceUrl || null,
      pixCopyPaste: pixCopyPaste || null
    });

    return res.status(200).json({
      compraId,
      pixQrImageBase64,
      pixCopyPaste,
      invoiceUrl: payment.invoiceUrl
    });

  } catch (e) {
    console.error('[reservar] erro:', e);
    return res.status(400).json({ erro: e.message || 'Erro interno' });
  }
}
