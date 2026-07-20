/* ============================================================
   firebase-sync.js — Cliente Firestore (tempo real)
   Escuta a collection "numeros" e atualiza a grade automaticamente
   quando alguém compra em qualquer lugar do mundo.
   ============================================================ */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import {
  getFirestore, collection, onSnapshot, doc, query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

const CONFIG = window.FIREBASE_CONFIG || {};

/* Só liga se config foi preenchida (modo produção). Sem config, o site fica em modo demo. */
if (!CONFIG.projectId || CONFIG.projectId === 'seu-projeto') {
  console.info('[IBSS] Firebase não configurado — rodando em modo demo. Preencha window.FIREBASE_CONFIG no index.html.');
} else {
  try {
    const app = initializeApp(CONFIG);
    const db = getFirestore(app);

    /* 1. Escuta permanente da grade de números */
    onSnapshot(collection(db, 'numeros'), (snap) => {
      const vendidos = [];
      const reservados = [];
      const compradores = {};
      const agora = Date.now();
      snap.forEach(d => {
        const n = parseInt(d.id, 10);
        const data = d.data();
        if (data.status === 'vendido') {
          vendidos.push(n);
          if (data.cliente) compradores[n] = { nome: data.cliente.nome, wpp: data.cliente.wpp };
        } else if (data.status === 'reservado') {
          const ate = data.reservadoAte?.toMillis?.() || 0;
          if (ate > agora) reservados.push(n);
        }
      });
      window.ibss?.updateGrid?.(vendidos, reservados, compradores);
    }, (err) => console.error('[IBSS] Erro no listener de números:', err));

    /* 2. Escuta do resultado oficial do sorteio */
    onSnapshot(doc(db, 'sorteio', 'oficial'), (snap) => {
      const data = snap.exists() ? snap.data() : null;
      window.ibss?.updateSorteio?.(data);
    }, (err) => console.error('[IBSS] Erro no listener de sorteio:', err));

    /* 3. Escuta da galeria de imagens do carrossel */
    onSnapshot(query(collection(db, 'galeria'), orderBy('ordem', 'asc')), (snap) => {
      const fotos = [];
      snap.forEach(d => {
        const data = d.data();
        if(data.url) fotos.push({ id: d.id, url: data.url, titulo: data.titulo || '', legenda: data.legenda || '', nome: data.nome || '' });
      });
      window.ibss?.updateGaleria?.(fotos);
      window.ibss?.renderGaleriaAdmin?.(fotos);
    }, (err) => console.error('[IBSS] Erro no listener de galeria:', err));

    /* 4. API pública pro index.html escutar UMA compra específica */
    window.ibss = window.ibss || {};
    window.ibss.escutarCompra = (compraId, cb) => {
      if (!compraId) return () => {};
      const ref = doc(db, 'compras', compraId);
      const unsub = onSnapshot(ref, (snap) => {
        const data = snap.data();
        if (data?.status) cb(data.status);
      });
      return unsub;
    };

    console.info('[IBSS] Firebase conectado. Grade em tempo real ativa.');
  } catch (e) {
    console.error('[IBSS] Falha ao inicializar Firebase:', e);
  }
}
