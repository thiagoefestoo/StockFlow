const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function write(file, content) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content, 'utf8');
}

write('frontend/public/pwa/icon-192.svg', `
<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="36" fill="#071428"/>
  <text x="96" y="84" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#3f7cff">SUPER</text>
  <text x="96" y="118" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff">INFRA</text>
</svg>
`.trim());

write('frontend/public/pwa/icon-512.svg', `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#071428"/>
  <text x="256" y="230" text-anchor="middle" font-family="Arial, sans-serif" font-size="92" font-weight="700" fill="#3f7cff">SUPER</text>
  <text x="256" y="318" text-anchor="middle" font-family="Arial, sans-serif" font-size="58" font-weight="700" fill="#ffffff">INFRA</text>
</svg>
`.trim());

write('frontend/public/manifest.json', JSON.stringify({
  short_name: 'Super Infra',
  name: 'Super Infra Estoque',
  description: 'Sistema de controle de estoque, técnicos, materiais, seriais e operações da Super Infra.',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#071428',
  theme_color: '#071428',
  icons: [
    {
      src: '/pwa/icon-192.svg',
      sizes: '192x192',
      type: 'image/svg+xml',
      purpose: 'any maskable'
    },
    {
      src: '/pwa/icon-512.svg',
      sizes: '512x512',
      type: 'image/svg+xml',
      purpose: 'any maskable'
    }
  ]
}, null, 2));

write('frontend/public/offline.html', `
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Super Infra Estoque offline</title>
  <style>
    body{margin:0;font-family:Arial,sans-serif;background:#071428;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px}
    .card{max-width:420px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);border-radius:24px;padding:28px}
    h1{margin:0 0 12px;font-size:26px}
    p{color:#dbe7ff;line-height:1.5}
  </style>
</head>
<body>
  <div class="card">
    <h1>Super Infra Estoque</h1>
    <p>Você está sem conexão no momento. Reconecte a internet e atualize a página para continuar usando o sistema.</p>
  </div>
</body>
</html>
`.trim());

write('frontend/public/service-worker.js', `
const CACHE_NAME = 'super-infra-estoque-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL]))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    );
  }
});
`.trim());

write('frontend/src/pwa/registerServiceWorker.js', `
export function registerServiceWorker() {
  if (process.env.NODE_ENV !== 'production') return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .catch((error) => {
        console.warn('Service worker não registrado:', error);
      });
  });
}
`.trim());

const indexHtmlPath = 'frontend/public/index.html';
if (fs.existsSync(indexHtmlPath)) {
  let html = fs.readFileSync(indexHtmlPath, 'utf8');

  if (!html.includes('manifest.json')) {
    html = html.replace(
      /<head>/i,
      `<head>
    <link rel="manifest" href="%PUBLIC_URL%/manifest.json" />
    <meta name="theme-color" content="#071428" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="Super Infra" />`
    );
  }

  fs.writeFileSync(indexHtmlPath, html, 'utf8');
}

const indexJsPath = 'frontend/src/index.js';
if (fs.existsSync(indexJsPath)) {
  let js = fs.readFileSync(indexJsPath, 'utf8');

  if (!js.includes("registerServiceWorker")) {
    const lines = js.split(/\r?\n/);
    let lastImport = -1;

    for (let i = 0; i < lines.length; i++) {
      if (/^\s*import\s+/.test(lines[i])) lastImport = i;
    }

    lines.splice(lastImport + 1, 0, "import { registerServiceWorker } from './pwa/registerServiceWorker';");
    js = lines.join('\n');

    js += `\n\nregisterServiceWorker();\n`;
  }

  fs.writeFileSync(indexJsPath, js, 'utf8');
}

write('docs/UPGRADE-APP-MOBILE-PWA.md', `
# App mobile instalável PWA

Este ajuste transforma o frontend do Super Infra Estoque em um aplicativo instalável no celular via navegador.

Inclui:
- manifest.json
- service-worker.js
- página offline
- ícones PWA
- registro do service worker no frontend

Após deploy na Vercel, o usuário poderá instalar pelo navegador usando "Instalar app" ou "Adicionar à tela inicial".
`.trim());

console.log('OK: app mobile PWA aplicado.');
