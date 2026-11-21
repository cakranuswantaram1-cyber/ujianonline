// Service worker Ujian Online Kelas.
// Tidak perlu naik versi manual: file milik sendiri (index.html, manifest.json) SELALU diambil
// dari jaringan lebih dulu, jadi perubahan langsung terbaca. Cache hanya cadangan saat offline.
const CACHE_NAME = 'ujian-online-cache';
const CORE = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png'];
const TIMEOUT_MS = 4000; // jaringan lambat -> pakai cadangan

// Layanan data (Apps Script / Firebase) TIDAK boleh di-cache.
const BYPASS = ['script.google.com', 'script.googleusercontent.com', 'firestore.googleapis.com',
                'identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'firebaseinstallations.googleapis.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => {})))));
  self.skipWaiting(); // versi baru langsung aktif
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

function simpan(req, res) {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
}

// Jaringan dulu (dengan batas waktu), cache sebagai cadangan.
function jaringanDulu(req, kunciCache) {
  const simpanKe = kunciCache || req;
  return new Promise((resolve) => {
    let selesai = false;
    const pakaiCache = () => caches.match(simpanKe, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'));
    const timer = setTimeout(() => {
      pakaiCache().then((r) => { if (r && !selesai) { selesai = true; resolve(r); } });
    }, TIMEOUT_MS);
    fetch(req, { cache: 'no-cache' }).then((res) => {
      clearTimeout(timer);
      if (!selesai) { selesai = true; resolve(simpan(simpanKe, res)); } else { simpan(simpanKe, res); }
    }).catch(() => {
      clearTimeout(timer);
      if (!selesai) { selesai = true; pakaiCache().then((r) => resolve(r || Response.error())); }
    });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (BYPASS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))) return;

  // Halaman utama (termasuk tautan ?kode=...): selalu versi terbaru.
  if (req.mode === 'navigate') {
    event.respondWith(jaringanDulu(req, './index.html'));
    return;
  }

  // File milik sendiri (manifest, ikon, dll): jaringan dulu.
  if (url.origin === self.location.origin) {
    event.respondWith(jaringanDulu(req));
    return;
  }

  // Pustaka luar (Tailwind, font, SweetAlert, SheetJS, Firebase SDK): cache dulu, perbarui diam-diam.
  event.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((res) => simpan(req, res)).catch(() => cached);
      return cached || net;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
