import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

function offlinePocket() {
  return {
    name: 'offline-pocket',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter(name => name !== 'index.html')
      const version = assets.join('|').replace(/[^a-zA-Z0-9]/g, '')
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = 'wonder-pocket-${version}';
const FILES = ${JSON.stringify(['./', './favicon.svg', ...assets.map(name => './' + name)])};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('wonder-pocket-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(new URL('./', self.registration.scope))));
    return;
  }
  // Only public precached assets can match. Vite/CDNs may vary them by Origin,
  // while module requests send different Origin headers from precache requests.
  event.respondWith(caches.match(event.request, { ignoreVary: true }).then(saved => saved || fetch(event.request)));
});
` })
    },
  }
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [vue(), offlinePocket()],
})
