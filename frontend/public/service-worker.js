// Simple Service Worker to satisfy PWA requirements
const CACHE_NAME = '5p-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  
  // Skip service worker for:
  // 1. API calls
  // 2. Static files (mp3, png, etc.)
  if (url.includes('/api/') || 
      url.endsWith('.mp3') || 
      url.endsWith('.png') || 
      url.endsWith('.ico') ||
      url.endsWith('.json')) {
    return; // Browser handles these directly
  }

  // Pass-through for everything else
  event.respondWith(fetch(event.request));
});
