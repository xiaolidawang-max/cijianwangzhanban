const BUILD = {"shellVersion": "c2e013b58bdc", "mediaVersion": "e0f70bf0d1e1", "shell": ["app-icon.svg", "assets/books-home-cover.png", "assets/books-home.css", "assets/books-home.js", "assets/chapter-review.js", "assets/chinese-audio-manifest.js", "assets/chinese-audio.js", "assets/continuous-core.js", "assets/continuous-images.js", "assets/continuous-mode.css", "assets/continuous-mode.js", "assets/custom-meanings-store.js", "assets/custom-meanings.css", "assets/custom-meanings.js", "assets/export-personal-meanings.js", "assets/font-sync.css", "assets/fonts/arimo-OFL.txt", "assets/fonts/arimo.woff2", "assets/fonts/noto-sans-sc-OFL.txt", "assets/fonts/noto-sans-sc.woff2", "assets/icon-180.png", "assets/icon-192.png", "assets/icon-512.png", "assets/index-DO4bx85o.js", "assets/index-vpCTnmNY.css", "assets/layout-simplified.css", "assets/mobile-reading-refinement.css", "assets/mode-entry-background.png", "assets/mode-entry-book.png", "assets/mode-entry-sea.png", "assets/mode-selection.css", "assets/mode-selection.js", "assets/offline.css", "assets/offline.js", "assets/playback-start.wav", "assets/settings-page.css", "assets/settings-page.js", "assets/simple-meanings-store.js", "assets/study-card-refinement.css", "assets/study-chapters.css", "assets/study-chapters.js", "assets/study-tools.js", "assets/vocabulary-directory.css", "assets/vocabulary-directory.js", "assets/web-workspace.css", "assets/word-notes-store.js", "assets/word-notes.css", "assets/word-notes.js", "chinese-audio-manifest.json", "course.json", "favicon.svg", "index.html", "manifest.webmanifest", "offline-chapters/index.json", "uploads/course-phrases.json", "uploads/ecdict-reference.json", "uploads/rounded-photo-frames.json", "uploads/tatoeba-english-examples.json", "uploads/tatoeba-examples.json", "uploads/wiktionary-definitions.json", "uploads/word-atlas-reference.json", "uploads/wordnet-definitions.json", "uploads/wordnet-examples.json", "voice-manifest.json"]};
const shellPrefix = 'cijian-shell-';
const shellCache = shellPrefix + BUILD.shellVersion;
const mediaCache = 'cijian-media-' + BUILD.mediaVersion;
const scope = self.registration.scope;
const absolute = (file) => new URL(file, scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(shellCache);
    await cache.addAll(BUILD.shell.map((file) => new Request(absolute(file), {cache: 'reload'})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const existing = await caches.keys();
    await Promise.all(existing.filter((name) => name.startsWith(shellPrefix) && name !== shellCache)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function sliceMedia(response, range) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return response;
  const file = await response.blob();
  const start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1;
  if (start >= file.size || end < start) {
    return new Response(null, {status: 416, headers: {'Content-Range': `bytes */${file.size}`}});
  }
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Content-Range': `bytes ${start}-${end}/${file.size}`,
    'Content-Length': String(end - start + 1),
    'Content-Type': response.headers.get('Content-Type') || 'audio/mpeg'
  });
  return new Response(file.slice(start, end + 1), {status: 206, headers});
}

self.addEventListener('fetch', (event) => {
  const {request} = event;
  if (request.method !== 'GET' || !request.url.startsWith(scope)) return;
  const url = new URL(request.url);
  const relative = url.pathname.slice(new URL(scope).pathname.length);
  event.respondWith((async () => {
    const shell = await caches.open(shellCache);
    if (request.mode === 'navigate' && (!relative || relative === 'index.html')) {
      return (await shell.match(absolute('index.html'))) || fetch(request);
    }
    const packaged = await shell.match(request, {ignoreSearch: true});
    if (packaged) {
      const range = request.headers.get('Range');
      return range && relative.endsWith('.wav') ? sliceMedia(packaged, range) : packaged;
    }
    const range = request.headers.get('Range');
    if (relative.startsWith('uploads/')) {
      const audioOrImage = await (await caches.open(mediaCache)).match(request, {ignoreSearch: true});
      if (audioOrImage) return range ? sliceMedia(audioOrImage, range) : audioOrImage;
    }
    const online = await fetch(request);
    return online.status === 200 && range && /\.(mp3|wav)$/.test(relative) ? sliceMedia(online, range) : online;
  })());
});
