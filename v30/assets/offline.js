(function (host) {
  'use strict';

  const base = new URL('../', document.currentScript.src);
  const address = (file) => new URL(file, base).href;
  const active = new Map();
  const subscribers = new Set();
  let catalog;

  async function ready() {
    if (!host.isSecureContext || !navigator.serviceWorker || !host.caches) {
      throw new Error('请在 HTTPS 地址打开词间后下载章节。');
    }
    if (!catalog) {
      catalog = (async () => {
        const registration = await navigator.serviceWorker.register(address('sw.js'), {scope: base.pathname});
        const worker = registration.installing || registration.waiting || registration.active;
        if (worker && worker.state !== 'activated') {
          await new Promise((resolve, reject) => {
            function check() {
              if (worker.state === 'activated') {
                worker.removeEventListener('statechange', check);
                resolve();
              } else if (worker.state === 'redundant') {
                worker.removeEventListener('statechange', check);
                reject(new Error('离线功能暂未准备好，请刷新重试。'));
              }
            }
            worker.addEventListener('statechange', check);
            check();
          });
        }
        const response = await fetch(address('offline-chapters/index.json'));
        if (!response.ok) throw new Error('未能读取章节下载列表。');
        const data = await response.json();
        const cache = await caches.open('cijian-media-' + data.mediaVersion);
        return {cache, chapters: new Map(data.chapters.map((chapter) => [chapter.id, chapter]))};
      })().catch((error) => {
        catalog = null;
        throw error;
      });
    }
    return catalog;
  }

  const marker = (id) => address(`offline-chapters/${encodeURIComponent(id)}.ready`);
  async function allStatuses() {
    const {cache, chapters} = await ready();
    return Object.fromEntries(await Promise.all([...chapters].map(async ([id, chapter]) => [id,
      active.get(id)?.status || {state: await cache.match(marker(id)) ? 'done' : 'idle', bytes: chapter.bytes}
    ])));
  }

  async function fetchChapter(id, update) {
    const {cache, chapters} = await ready();
    const chapter = chapters.get(id);
    if (!chapter) throw new Error('没有找到该章节。');
    if (await cache.match(marker(id))) {
      update({state: 'done', bytes: chapter.bytes});
      return;
    }
    const response = await fetch(address(`offline-chapters/${id}.json`));
    if (!response.ok) throw new Error('无法读取章节文件列表，请联网重试。');
    const files = await response.json();
    if (files.length !== chapter.fileCount) throw new Error('本章文件列表不完整，请刷新后重试。');
    let next = 0;
    let completed = 0;
    let percent = -1;
    let failure;
    const controller = new AbortController();
    async function downloadFiles() {
      try {
        while (!failure && next < files.length) {
          const url = address(files[next++]);
          if (!url.startsWith(address('uploads/'))) throw new Error('章节资源地址无效。');
          if (!await cache.match(url)) {
            const file = await fetch(url, {cache: 'no-store', signal: controller.signal});
            if (file.status !== 200) throw new Error('有资源未下载，请联网重试。');
            await cache.put(url, file);
          }
          const current = Math.floor(100 * (++completed) / files.length);
          if (current !== percent) {
            percent = current;
            update({state: 'loading', percent, bytes: chapter.bytes});
          }
        }
      } catch (error) {
        if (!failure) failure = error;
        controller.abort();
      }
    }
    await Promise.all(Array.from({length: 6}, downloadFiles));
    if (failure) throw failure;
    await cache.put(marker(id), new Response('ready'));
    update({state: 'done', bytes: chapter.bytes});
  }

  function download(id) {
    if (active.has(id)) return active.get(id).promise;
    const task = {status: {state: 'loading', percent: 0}};
    const update = (status) => {
      task.status = status;
      for (const subscriber of subscribers) subscriber(id, status);
    };
    active.set(id, task);
    update(task.status);
    const run = () => fetchChapter(id, update);
    task.promise = Promise.resolve().then(() => navigator.locks
      ? navigator.locks.request(`cijian-download-${id}`, run) : run())
      .catch((error) => {
        const message = error.name === 'QuotaExceededError' ? '可用存储空间不足。' : error.message;
        update({state: 'error', error: error instanceof TypeError ? '下载中断，请联网重试。' : message});
      }).finally(() => active.delete(id));
    return task.promise;
  }

  function audioAdapter() {
    const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!appleMobile) return {};

    const sharedAudio = new Audio();
    let unlock;
    return {
      sharedAudio,
      preparePlayback() {
        if (!unlock) {
          // WebKit authorizes playback per media element during a user gesture.
          // Reuse the same element for all audio sources after the silent clip.
          sharedAudio.src = address('assets/playback-start.wav');
          unlock = sharedAudio.play().catch((error) => {
            unlock = null;
            throw error;
          });
        }
        return unlock;
      },
      createAudio(url) {
        sharedAudio.src = url;
        return sharedAudio;
      }
    };
  }

  host.CijianOffline = Object.freeze({
    allStatuses, download, audioAdapter,
    subscribe(listener) {subscribers.add(listener); return () => subscribers.delete(listener);}
  });
  ready().catch(() => {});
})(window);
