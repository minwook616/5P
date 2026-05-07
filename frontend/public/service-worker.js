// Simple Service Worker to satisfy PWA requirements
const CACHE_NAME = '5p-cache-v1';

self.addEventListener('install', (event) => {
  console.log('SW: Install event');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('SW: Activate event');
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through strategy for API calls
  if (event.request.url.includes('/api/')) {
    return; // Let the browser handle API calls directly
  }

  // Pass-through for everything else but with error logging
  event.respondWith(
    fetch(event.request).catch(err => {
      console.error('SW: Fetch failed for:', event.request.url, err);
      // Fallback: if it's a navigation request, we might want to return the index.html but keep it simple for now
      throw err;
    })
  );
});
