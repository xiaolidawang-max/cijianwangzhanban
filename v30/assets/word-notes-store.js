(function (host) {
  'use strict';
  const KEY = 'wordspace.word-notes.v1';
  const EVENT = 'wordspace-word-notes-change';
  const FORMAT = 'cijian-word-notes';
  const MAX_LENGTH = 5000;
  const catalog = Object.create(null);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  for (const [id, row] of Object.entries(host.cijianChapterReview || {})) {
    if (isObject(row) && typeof row.word === 'string') catalog[id] = row.word;
  }
  let cachedRaw, cachedState, lastError = null;
  const now = () => new Date().toISOString();
  function known(id) {
    if (typeof id !== 'string' || !own(catalog, id)) throw new Error('这个词条不在当前词库中，无法保存笔记。');
    return catalog[id];
  }
  function normalizeText(value) {
    if (typeof value !== 'string' || value.length > MAX_LENGTH) throw new Error('笔记最多可填写 5000 字。');
    const text = value.replace(/\r\n?/g, '\n');
    return text.trim() ? text : '';
  }
  function envelope(entries) { return { format: FORMAT, version: 1, exportedAt: now(), entries }; }
  function validateBackup(value) {
    if (!isObject(value) || value.format !== FORMAT || value.version !== 1 || !isObject(value.entries)) throw new Error('笔记备份格式不正确。');
    if (typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))) throw new Error('笔记备份时间无效。');
    if (Object.keys(value.entries).length > Object.keys(catalog).length) throw new Error('笔记记录过多。');
    const entries = Object.create(null);
    for (const [id, entry] of Object.entries(value.entries)) {
      const word = known(id);
      if (!isObject(entry) || entry.word !== word || typeof entry.updatedAt !== 'string' || !Number.isFinite(Date.parse(entry.updatedAt))) throw new Error('笔记与词条不匹配：' + id);
      const text = normalizeText(entry.text);
      if (text) entries[id] = { word, text, updatedAt: entry.updatedAt };
    }
    return { format: FORMAT, version: 1, exportedAt: value.exportedAt, entries };
  }
  function readStrict() {
    let raw;
    try { raw = host.localStorage.getItem(KEY); }
    catch (_) { throw new Error('无法读取本地笔记，请检查设备存储权限。'); }
    if (raw === cachedRaw && cachedState) return cachedState;
    let value;
    try { value = raw === null ? envelope(Object.create(null)) : validateBackup(JSON.parse(raw)); }
    catch (_) { throw new Error('已有笔记记录格式异常，原记录未被覆盖。请先恢复有效备份。'); }
    cachedRaw = raw; cachedState = value; lastError = null;
    return value;
  }
  function readSafe() {
    try { return readStrict(); }
    catch (error) { lastError = error.message; return envelope(Object.create(null)); }
  }
  function get(id) {
    if (!own(catalog, id)) return '';
    return readSafe().entries[id]?.text || '';
  }
  function notifyChange() {
    host.dispatchEvent(new host.Event(EVENT));
    host.dispatchEvent(new host.Event('wordspace-study-change'));
  }
  function withLock(operation) {
    if (host.navigator?.locks?.request) return host.navigator.locks.request('wordspace.study.v1', { mode: 'exclusive' }, operation);
    return Promise.resolve().then(operation);
  }
  async function save(id, value) {
    const word = known(id), text = normalizeText(value);
    return withLock(() => {
      const entries = Object.assign(Object.create(null), readStrict().entries);
      if (text) entries[id] = { word, text, updatedAt: now() };
      else delete entries[id];
      const updated = envelope(entries), raw = JSON.stringify(updated);
      try { host.localStorage.setItem(KEY, raw); }
      catch (_) { throw new Error('笔记保存失败，原笔记未被更改。请检查设备存储空间后重试。'); }
      cachedRaw = raw; cachedState = updated; lastError = null;
      notifyChange();
      return text;
    });
  }
  function subscribe(listener) {
    const external = event => { if (event.key === null || event.key === KEY) listener(); };
    host.addEventListener(EVENT, listener); host.addEventListener('storage', external);
    return () => { host.removeEventListener(EVENT, listener); host.removeEventListener('storage', external); };
  }
  host.CijianNotesStore = Object.freeze({
    KEY, EVENT, MAX_LENGTH, get, save, subscribe, validateBackup, notifyChange,
    exportData: () => envelope(clone(readStrict().entries)),
    getLastError: () => { readSafe(); return lastError; }
  });
})(window);
