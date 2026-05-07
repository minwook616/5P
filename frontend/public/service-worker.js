// Simple Service Worker to satisfy PWA requirements
const CACHE_NAME = '5p-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through strategy
  event.respondWith(fetch(event.request));
});
