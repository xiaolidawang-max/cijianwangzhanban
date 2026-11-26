(function (host) {
  'use strict';
  const KEY = 'wordspace.custom-meanings.v1';
  const EVENT = 'wordspace-custom-meanings-change';
  const BASELINE = '2283fef56d7f9c6a02af29c203cae53be259f870bbccdabc343495a165026d89';
  const FORMAT = 'cijian-custom-meanings';
  const MAX_TEXT = 8_000_000;
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const clone = value => JSON.parse(JSON.stringify(value));
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const catalog = Object.create(null);
  for (const [id, value] of Object.entries(host.cijianChapterReview || {})) {
    if (isObject(value) && typeof value.word === 'string' && Array.isArray(value.groups)) {
      catalog[id] = { word: value.word, groups: clone(value.groups) };
    }
  }
  let cachedRaw;
  let cachedState;
  let lastError = null;
  const now = () => new Date().toISOString();
  function error(message) { return new Error(message); }
  function known(id) {
    if (typeof id !== 'string' || !own(catalog, id)) throw error('这个词条不在当前词库中，无法修改。');
    return catalog[id];
  }
  function normalizeGroups(groups) {
    if (!Array.isArray(groups) || groups.length < 1 || groups.length > 30) throw error('请保留至少一组中文词义，最多 30 组。');
    return groups.map(group => {
      if (!isObject(group) || typeof group.pos !== 'string' || !group.pos.trim() || group.pos.length > 32) throw error('请填写有效的词性，例如 n.、v. 或 adj.。');
      if (!Array.isArray(group.glosses) || !group.glosses.length || group.glosses.length > 30) throw error('每个词性至少需要一个中文意思，最多 30 个。');
      const glosses = group.glosses.map(gloss => {
        if (typeof gloss !== 'string' || !gloss.trim() || gloss.length > 1000) throw error('中文意思不能为空，每个义项不能超过 1000 字。');
        return gloss.trim();
      });
      return { pos: group.pos.trim(), glosses };
    });
  }
  function normalizeEntry(id, value) {
    const word = known(id).word;
    if (!isObject(value) || value.word !== word) throw error('词条与单词不匹配：' + id);
    if (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) throw error('修改记录的时间无效：' + word);
    return { word, groups: normalizeGroups(value.groups), updatedAt: value.updatedAt };
  }
  function envelope(entries) {
    return { format: FORMAT, version: 1, baselineSha256: BASELINE, exportedAt: now(), entries };
  }
  function validateBackup(value) {
    if (!isObject(value) || value.format !== FORMAT || value.version !== 1 || value.baselineSha256 !== BASELINE || !isObject(value.entries)) throw error('自定义词义记录的格式或词库基准不匹配。');
    if (typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))) throw error('自定义词义备份时间无效。');
    if (Object.keys(value.entries).length > Object.keys(catalog).length) throw error('自定义词义记录过多。');
    const entries = Object.create(null);
    for (const [id, entry] of Object.entries(value.entries)) entries[id] = normalizeEntry(id, entry);
    return { format: FORMAT, version: 1, baselineSha256: BASELINE, exportedAt: value.exportedAt, entries };
  }
  function readStrict() {
    let raw;
    try { raw = host.localStorage.getItem(KEY); }
    catch (_) { throw error('无法读取手机本地存储。请检查存储权限后重试。'); }
    if (raw === cachedRaw && cachedState) return cachedState;
    let value;
    try { value = raw === null ? envelope(Object.create(null)) : validateBackup(JSON.parse(raw)); }
    catch (_) { throw error('已有自定义词义记录格式异常，原记录未被覆盖。请先导出或恢复有效备份。'); }
    cachedRaw = raw; cachedState = value; lastError = null;
    return value;
  }
  function readSafe() {
    try { return readStrict(); }
    catch (failure) { lastError = failure.message; return envelope(Object.create(null)); }
  }
  function get(id) {
    const value = readSafe().entries[id];
    return value ? clone(value) : null;
  }
  function getGroups(id, fallback) { return get(id)?.groups || clone(fallback || known(id).groups); }
  function notifyChange() {
    host.dispatchEvent(new host.Event(EVENT));
    host.dispatchEvent(new host.Event('wordspace-study-change'));
  }
  function withLock(operation) {
    // The APK is single-window. Browser tabs share the study lock where supported.
    // Without Web Locks, keep the read/modify/write in one synchronous task.
    if (host.navigator?.locks?.request) return host.navigator.locks.request('wordspace.study.v1', { mode: 'exclusive' }, operation);
    return Promise.resolve().then(operation);
  }
  function persist(entries) {
    const value = envelope(entries);
    const raw = JSON.stringify(value);
    try { host.localStorage.setItem(KEY, raw); }
    catch (_) { throw error('保存失败，原词义未被更改。请检查手机存储空间或先导出备份。'); }
    cachedRaw = raw; cachedState = value; lastError = null;
    notifyChange();
  }
  function sameGroups(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  async function save(id, groups) {
    const base = known(id), clean = normalizeGroups(groups);
    return withLock(() => {
      const entries = clone(readStrict().entries);
      if (sameGroups(clean, base.groups)) delete entries[id];
      else entries[id] = { word: base.word, groups: clean, updatedAt: now() };
      persist(entries);
      return get(id);
    });
  }
  async function reset(id) {
    known(id);
    return withLock(() => {
      const entries = clone(readStrict().entries);
      delete entries[id]; persist(entries);
      return null;
    });
  }
  function parseInput(input) {
    if (typeof input === 'string') {
      if (input.length > MAX_TEXT) throw error('导入文件过大，最多支持 8 MB 文本。');
      try { return JSON.parse(input); } catch (_) { throw error('文件不是有效的 JSON。'); }
    }
    return input;
  }
  function collectImport(input) {
    const value = parseInput(input), candidates = Object.create(null);
    let skippedUnconfirmed = 0, unchanged = 0, total = 0;
    if (!isObject(value)) throw error('导入文件格式不正确。');
    if (value.format === FORMAT || value.format === 'wordspace-study-backup') {
      if (value.format === 'wordspace-study-backup' && !value.customMeanings) throw error('这份学习备份不包含自定义词义。');
      const source = validateBackup(value.format === FORMAT ? value : value.customMeanings);
      for (const [id, entry] of Object.entries(source.entries)) candidates[id] = entry;
      total = Object.keys(candidates).length;
    } else {
      if (value.schemaVersion !== 1 || value.baselineSha256 !== BASELINE || !isObject(value.entries)) throw error('这不是与当前 V8 词库对应的审校记录。');
      if (Object.keys(value.entries).length > Object.keys(catalog).length) throw error('审校记录过多。');
      const changeRows = new Map();
      if (value.changes !== undefined) {
        if (!Array.isArray(value.changes)) throw error('审校记录的词条清单无效。');
        for (const row of value.changes) {
          if (!isObject(row) || typeof row.id !== 'string' || changeRows.has(row.id)) throw error('审校词条清单存在重复或无效条目。');
          changeRows.set(row.id, row);
        }
      }
      for (const [id, entry] of Object.entries(value.entries)) {
        const base = known(id); total++;
        if (!isObject(entry) || !['pending', 'question', 'confirmed'].includes(entry.status) || !isObject(entry.after)) throw error('审校状态或词义格式无效：' + base.word);
        const groups = normalizeGroups(entry.after.groups);
        if (changeRows.has(id) && changeRows.get(id).word !== base.word) throw error('审校记录与单词不匹配：' + id);
        if (entry.status !== 'confirmed') { skippedUnconfirmed++; continue; }
        if (sameGroups(groups, base.groups)) { unchanged++; continue; }
        candidates[id] = normalizeEntry(id, { word: base.word, groups, updatedAt: entry.updatedAt });
      }
    }
    return { candidates, skippedUnconfirmed, unchanged, total };
  }
  function planImport(input, current) {
    const parsed = collectImport(input), applicable = Object.create(null);
    let conflicts = 0, unchanged = parsed.unchanged;
    for (const [id, entry] of Object.entries(parsed.candidates)) {
      const previous = current.entries[id];
      if (sameGroups(entry.groups, previous?.groups || known(id).groups)) { unchanged++; continue; }
      if (previous) conflicts++;
      applicable[id] = entry;
    }
    return { applicable, summary: { confirmedChineseChanges: Object.keys(applicable).length, skippedUnconfirmed: parsed.skippedUnconfirmed, conflicts, unchanged, total: parsed.total } };
  }
  function previewImport(input) { return planImport(input, readStrict()).summary; }
  async function importData(input, options = {}) {
    // Parse before acquiring the lock; read and plan again inside it to account
    // for another tab's edits made while the import dialog was open.
    collectImport(input);
    return withLock(() => {
      const current = readStrict(), plan = planImport(input, current), entries = clone(current.entries);
      let imported = 0, skippedConflicts = 0;
      for (const [id, entry] of Object.entries(plan.applicable)) {
        if (entries[id] && options.overwrite !== true) { skippedConflicts++; continue; }
        if (sameGroups(entry.groups, known(id).groups)) delete entries[id];
        else entries[id] = { ...clone(entry), updatedAt: now() };
        imported++;
      }
      if (imported) persist(entries);
      return { ...plan.summary, imported, skippedConflicts };
    });
  }
  function subscribe(listener) {
    const external = event => { if (event.key === null || event.key === KEY) listener(); };
    host.addEventListener(EVENT, listener); host.addEventListener('storage', external);
    return () => { host.removeEventListener(EVENT, listener); host.removeEventListener('storage', external); };
  }
  host.CijianMeaningStore = Object.freeze({
    KEY, EVENT, BASELINE, get, getGroups, save, reset, normalizeGroups,
    getDefaultGroups: id => clone(known(id).groups),
    exportData: () => envelope(clone(readStrict().entries)),
    validateBackup, previewImport, importData, subscribe, notifyChange,
    getLastError: () => { readSafe(); return lastError; },
    count: () => Object.keys(readSafe().entries).length
  });
})(window);
