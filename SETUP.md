# SETUP · Backend automático (Firebase + Asaas + Vercel)

Guia pra ativar o sistema automático depois do primeiro deploy.

## Arquitetura

```
[Cliente escolhe números] 
        ↓
[POST /api/reservar]  →  reserva no Firestore (15min) + cria cobrança Asaas
        ↓
[Frontend mostra QR do Pix real]
        ↓
[Pessoa paga]
        ↓
[Asaas → POST /api/webhook-asaas]  →  Firestore marca como "vendido"
        ↓
[Firestore Realtime]  →  grade se atualiza em TODO MUNDO
```

## 1. Criar projeto no Firebase

1. Acessa https://console.firebase.google.com e cria um projeto novo (ex.: `ibss-sorteio`).
2. No projeto, ativa o **Firestore Database** → modo produção → região `southamerica-east1` (São Paulo).
3. Cola o conteúdo de `firestore.rules` na aba **Rules** e publica.
4. Em ⚙️ Configurações do projeto → **Seus apps** → adiciona um app **Web** → copia o objeto `firebaseConfig`.
5. Cola esse objeto no `index.html`, dentro de `window.FIREBASE_CONFIG` (as chaves aqui são públicas por design, tudo bem ficar visível — a segurança vem das rules).

## 2. Service account (Firebase Admin pro backend)

1. Firebase Console → ⚙️ → **Contas de serviço** → **Gerar nova chave privada**.
2. Baixa o JSON. Você vai precisar de 3 campos dele: `project_id`, `client_email`, `private_key`.

## 3. Conta e chave do Asaas

1. Entra em https://www.asaas.com com o CNPJ da igreja.
2. Menu do perfil → **Integrações** → **Integração via API** → gera uma chave de produção.
3. Em **Notificações via webhook**, cadastra a URL: `https://SEU-DOMINIO.vercel.app/api/webhook-asaas`
   - Marca todos os eventos de **Cobrança**
   - Define um **token de autenticação** (uma senha aleatória) — anota, vai virar env var
4. Taxas atuais: Pix ~1,49% · Cartão de crédito ~3,99% + R$0,49 por transação.

## 4. Deploy na Vercel

1. Sobe o repositório pro GitHub.
2. Na Vercel: **Add New Project** → importa o repo → framework `Other`.
3. Antes de fazer o primeiro deploy, cadastra as **Environment Variables** (Settings → Environment Variables):

   | Variável | Valor |
   |---|---|
   | `FIREBASE_PROJECT_ID` | `ibss-sorteio` |
   | `FIREBASE_CLIENT_EMAIL` | do JSON (campo `client_email`) |
   | `FIREBASE_PRIVATE_KEY` | do JSON (campo `private_key`) — cola inteiro, com os `\n` |
   | `ASAAS_API_KEY` | chave gerada no Asaas |
   | `ASAAS_ENV` | `prod` (ou `sandbox` pra testes) |
   | `ASAAS_WEBHOOK_TOKEN` | o token que você definiu no cadastro do webhook |
   | `PRECO_POR_NUM` | `100` (ou o valor por número) |
   | `TOTAL_NUMEROS` | `100` |
   | `INIT_SECRET` | uma senha aleatória forte pra rodar o `/api/init` uma vez |
   | `CRON_SECRET` | uma senha aleatória forte pro cron de limpeza |
   | `SORTEIO_SECRET` | **deve ter o mesmo valor de `SENHA_ADMIN` do index.html** — é a senha que libera o sorteio no servidor |

4. Deploy.

## 5. Inicializar os números (rodar UMA VEZ)

Depois do primeiro deploy, chama o endpoint que cria os 100 documentos no Firestore:

```bash
curl -X POST "https://SEU-DOMINIO.vercel.app/api/init?secret=SUA_INIT_SECRET"
```

Retorno esperado: `{"criados": 100}`. Se tudo deu certo, abre o site — a grade aparece com 100 números disponíveis e atualiza em tempo real.

## 6. Testar

1. Abre o site em duas abas.
2. Numa aba, seleciona um número, preenche os dados e clica em pagar.
3. Na outra aba, o número deve virar "reservado" automaticamente. ✨
4. Paga o Pix num valor mínimo (R$1 em sandbox).
5. O Asaas dispara o webhook → o número vira "vendido" → aparece na aba do sorteio (senha admin).

## 7. Configurar dia do sorteio

Na hora oficial do sorteio: entra na área restrita (link "Área de sorteio" no rodapé, senha configurada em `SENHA_ADMIN` no `index.html`), clica em "Sortear agora". O painel puxa a lista de números vendidos em tempo real do Firestore e sorteia entre eles.

---

## Custos estimados

- **Firebase**: free tier cobre até 50k leituras/dia, 20k escritas/dia — sobra pra sorteio dessa dimensão.
- **Vercel**: free tier cobre 100 GB-h de execução de funções por mês.
- **Asaas**: só cobra sobre transação (Pix ~1,49%, cartão ~3,99% + R$0,49).

Em resumo: os R$ 5.000 do sorteio pagam a taxa do Asaas (~R$ 75-200 no total dependendo do mix Pix/cartão) e o resto fica todo pra igreja.

## Problemas comuns

- **"FIREBASE_PRIVATE_KEY inválido"**: cola o valor com aspas duplas nas env vars da Vercel, mantendo os `\n`.
- **Webhook não dispara**: verifica se o URL cadastrado no Asaas termina em `/api/webhook-asaas` (sem barra final) e se o token bate.
- **Grade não atualiza**: abre o console do navegador. Se aparecer "Firebase não configurado", verifica o `window.FIREBASE_CONFIG` no `index.html`.
