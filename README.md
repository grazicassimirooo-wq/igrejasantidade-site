# IBSS · Sorteio da Moto Elétrica

Landing page + PWA da Igreja Santidade ao Senhor para o sorteio beneficente da moto elétrica.

## Stack
- HTML/CSS/JS puro (sem framework)
- PWA instalável (offline first)
- Deploy: Vercel (static)
- Backend (fase 2): Vercel Serverless Functions + Supabase + Asaas

## Estrutura
```
index.html            landing + fluxo de compra + tela de sorteio
manifest.json         PWA metadata
sw.js                 service worker (cache offline)
logo.png              logo original da igreja
moto.mp4              vídeo do prêmio (loop, sem som)
moto-poster.jpg       poster do vídeo da moto
video-igreja.mp4      vídeo institucional
poster-video.jpg      poster do vídeo institucional
ic-*.png              ícones do PWA (192, 512, maskable)
```

## Editar
No topo do `<script>` em `index.html`:
- `TOTAL_NUMEROS` — total de números do sorteio
- `PRECO_POR_NUM` — preço por número
- `SENHA_ADMIN` — senha da área de sorteio
- `EVENTOS` — agenda de eventos exibida na home

## Deploy
Site estático — funciona em qualquer host (Vercel, Netlify, GitHub Pages).

## Créditos
Desenvolvido por **Cosmo Digital · Soluções Digitais** · (11) 94545-3144
