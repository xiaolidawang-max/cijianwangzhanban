(function (host) {
  'use strict';
  const KEY = 'wordspace.simple-meanings.v1';
  const BACKUP_KEY = KEY + '.before-pos-edit';
  const EVENT = 'wordspace-simple-meanings-change';
  const FORMAT = 'cijian-simple-meanings';
  const MAX_LENGTH = 1000;
  const MAX_GROUPS = 8;
  const MAX_POS_LENGTH = 40;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const catalog = Object.create(null);
  for (const [id, row] of Object.entries(host.cijianChapterReview || {})) {
    if (isObject(row) && typeof row.word === 'string') catalog[id] = row.word;
  }
  let cachedRaw, cachedState, lastError = null;
  const now = () => new Date().toISOString();
  function known(word) {
    if (!isObject(word) || typeof word.id !== 'string' || !own(catalog, word.id) || word.word !== catalog[word.id]) {
      throw new Error('这个单词与当前词条不匹配，无法修改简洁模式释义。');
    }
    return { id: word.id, word: word.word };
  }
  function normalizeText(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > MAX_LENGTH) {
      throw new Error('请填写中文释义，最多 1000 字。');
    }
    return value.replace(/\r\n?/g, '\n').trim();
  }
  function normalizeGroups(value) {
    if (!Array.isArray(value) || !value.length || value.length > MAX_GROUPS) {
      throw new Error('请填写 1 至 8 组词性和中文释义。');
    }
    const groups = value.map(group => {
      if (!isObject(group) || typeof group.pos !== 'string' || group.pos.length > MAX_POS_LENGTH) {
        throw new Error('词性最多 40 字，可以留空。');
      }
      return { pos: group.pos.trim(), text: normalizeText(group.text) };
    });
    if (groups.map(group => group.text).join('；').length > MAX_LENGTH) {
      throw new Error('所有中文释义合计最多 1000 字。');
    }
    return groups;
  }
  function copyGroups(groups) { return groups.map(group => ({ pos: group.pos, text: group.text })); }
  function envelope(entries) { return { format: FORMAT, version: 1, updatedAt: now(), entries }; }
  function validDate(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
  function validate(value) {
    if (!isObject(value) || value.format !== FORMAT || value.version !== 1 || !validDate(value.updatedAt) || !isObject(value.entries)) {
      throw new Error('简洁模式释义记录格式不正确。');
    }
    if (Object.keys(value.entries).length > Object.keys(catalog).length) throw new Error('简洁模式释义记录过多。');
    const entries = Object.create(null);
    for (const [id, entry] of Object.entries(value.entries)) {
      if (!isObject(entry) || !own(catalog, id) || entry.word !== catalog[id] || !validDate(entry.updatedAt)) {
        throw new Error('简洁模式释义与词条不匹配。');
      }
      normalizeText(entry.text);
      if (own(entry, 'groups')) normalizeGroups(entry.groups);
      // Validate existing records without normalizing or discarding their
      // fields. Editing one word must leave every other saved word intact.
      entries[id] = { ...entry, ...(own(entry, 'groups') ? { groups: entry.groups.map(group => ({ ...group })) } : {}) };
    }
    return { format: FORMAT, version: 1, updatedAt: value.updatedAt, entries };
  }
  function readStrict() {
    let raw;
    try { raw = host.localStorage.getItem(KEY); }
    catch (_) { throw new Error('无法读取简洁模式释义，请检查设备存储权限后重试。'); }
    if (raw === cachedRaw && cachedState) { lastError = null; return cachedState; }
    let value;
    try { value = raw === null ? envelope(Object.create(null)) : validate(JSON.parse(raw)); }
    catch (_) { throw new Error('已有简洁模式释义记录格式异常，原记录未被覆盖。'); }
    cachedRaw = raw; cachedState = value; lastError = null;
    return value;
  }
  function readSafe() {
    try { return readStrict(); }
    catch (failure) { lastError = failure.message; return null; }
  }
  function get(word) {
    let entry;
    try { entry = known(word); } catch (_) { return null; }
    return readSafe()?.entries[entry.id]?.text ?? null;
  }
  function getGroups(word) {
    let entry;
    try { entry = known(word); } catch (_) { return null; }
    const groups = readSafe()?.entries[entry.id]?.groups;
    return groups ? copyGroups(groups) : null;
  }
  function notifyChange() {
    host.dispatchEvent(new host.Event(EVENT));
    host.dispatchEvent(new host.Event('wordspace-study-change'));
  }
  function withLock(operation) {
    // Reuse the same localStorage surface as the APK and the existing stores.
    // Browser tabs share the study lock; otherwise keep each update synchronous.
    if (host.navigator?.locks?.request) return host.navigator.locks.request('wordspace.study.v1', { mode: 'exclusive' }, operation);
    return Promise.resolve().then(operation);
  }
  function persist(entries) {
    const value = envelope(entries), raw = JSON.stringify(value);
    // readStrict has validated and captured the exact previous source. Keep
    // that original once before any edit/reset can replace it.
    if (cachedRaw !== null) {
      try {
        if (host.localStorage.getItem(BACKUP_KEY) === null) host.localStorage.setItem(BACKUP_KEY, cachedRaw);
      } catch (_) { throw new Error('原释义备份保存失败，本次修改未保存。请检查设备存储空间后重试。'); }
    }
    try { host.localStorage.setItem(KEY, raw); }
    catch (_) { throw new Error('简洁模式释义保存失败，原释义未被更改。请检查设备存储空间后重试。'); }
    cachedRaw = raw; cachedState = value; lastError = null;
    notifyChange();
  }
  async function save(word, value) {
    const entry = known(word), text = normalizeText(value);
    return withLock(() => {
      const entries = Object.assign(Object.create(null), readStrict().entries);
      entries[entry.id] = { word: entry.word, text, updatedAt: now() };
      persist(entries);
      return text;
    });
  }
  async function saveGroups(word, value) {
    const entry = known(word), groups = normalizeGroups(value);
    return withLock(() => {
      const entries = Object.assign(Object.create(null), readStrict().entries);
      entries[entry.id] = { word: entry.word, text: groups.map(group => group.text).join('；'), groups, updatedAt: now() };
      persist(entries);
      return copyGroups(groups);
    });
  }
  async function reset(word) {
    const entry = known(word);
    return withLock(() => {
      const entries = Object.assign(Object.create(null), readStrict().entries);
      if (own(entries, entry.id)) { delete entries[entry.id]; persist(entries); }
      return null;
    });
  }
  function subscribe(listener) {
    const external = event => { if (event.key === null || event.key === KEY) listener(); };
    host.addEventListener(EVENT, listener); host.addEventListener('storage', external);
    return () => { host.removeEventListener(EVENT, listener); host.removeEventListener('storage', external); };
  }

  // Apply the two confirmed Chapter 7 corrections to existing local edits once.
  const correctionsKey = KEY + '.chapter7-corrections-20261121';
  const chapter7Corrections = [
    ['ielts-01172', 'cathedral', '主教', '主教堂'],
    ['ielts-01191', 'guardian', '监守人', '监护人']
  ];
  function applyChapter7Corrections() {
    return withLock(() => {
      if (host.localStorage.getItem(correctionsKey)) return;
      const entries = Object.assign(Object.create(null), readStrict().entries);
      let changed = false;
      for (const [id, word, previous, corrected] of chapter7Corrections) {
        const entry = entries[id];
        if (entry?.word !== word || entry.text !== previous) continue;
        if (entry.groups && (entry.groups.length !== 1 || entry.groups[0].text !== previous)) continue;
        entries[id] = {
          ...entry, text: corrected, updatedAt: now(),
          ...(entry.groups ? {groups: [{...entry.groups[0], text: corrected}]} : {})
        };
        changed = true;
      }
      if (changed) persist(entries);
      host.localStorage.setItem(correctionsKey, '1');
    });
  }
  applyChapter7Corrections().catch(error => host.console?.warn('无法自动应用第 7 章两处释义修订', error));

  // Chapter 9–22 concise meanings reviewed against the planned lesson context.
  const approvedCourseMeanings = Object.freeze({"ielts-03339":["transplant","移植器官；移栽","移植（器官）；移栽"],"ielts-03348":["medicine","药；药物","药物"]});
  const approvalMigrationKey = KEY + '.reviewed-ch9-22-20261121';
  const reviewedCourseMeanings = Object.freeze({"ielts-01284":["leaflet","传单"],"ielts-01298":["consensus","共识"],"ielts-01309":["drama","戏剧"],"ielts-01314":["opera","歌剧"],"ielts-01315":["comedy","喜剧"],"ielts-01316":["tragedy","悲剧"],"ielts-01328":["exhibition","展览"],"ielts-01335":["painting","绘画作品"],"ielts-01365":["tournament","锦标赛"],"ielts-01373":["famous","著名的"],"ielts-01395":["volleyball","排球"],"ielts-01401":["knock","敲击"],"ielts-01442":["bend","（使）弯曲"],"ielts-01448":["artefact","人工制品"],"ielts-01451":["crude","未加工的"],"ielts-01460":["reuse","重复使用"],"ielts-01470":["tub","浴盆；大桶"],"ielts-01474":["tube","管子"],"ielts-01477":["sweep","清扫"],"ielts-01497":["strand","一缕；一股（头发、线等）"],"ielts-01510":["glue","胶水"],"ielts-01515":["edge","边缘"],"ielts-01529":["opacity","不透明度"],"ielts-01563":["iron","铁"],"ielts-01585":["lubricate","给……润滑"],"ielts-01625":["elegance","优雅"],"ielts-01649":["trousers","长裤"],"ielts-01671":["sew","缝纫"],"ielts-01677":["thread","缝纫线"],"ielts-01692":["tight","紧身的"],"ielts-01701":["fade","（使）褪色"],"ielts-01707":["food","食物"],"ielts-01715":["restaurant","餐馆"],"ielts-01721":["banquet","正式宴会"],"ielts-01722":["refreshment","茶点"],"ielts-01768":["potato","土豆"],"ielts-01769":["pea","豌豆"],"ielts-01785":["papaya","木瓜"],"ielts-01786":["peach","桃子"],"ielts-01788":["plum","李子"],"ielts-01789":["orange","橙子"],"ielts-01792":["kiwi","猕猴桃"],"ielts-01815":["cheese","奶酪"],"ielts-01840":["salt","食盐"],"ielts-01841":["sugar","糖"],"ielts-01845":["sour","酸的"],"ielts-01849":["delicious","美味的"],"ielts-01850":["yummy","好吃的"],"ielts-01851":["tasty","可口的"],"ielts-01854":["spice","调味香料"],"ielts-01864":["roast","烤"],"ielts-01866":["suck","吮吸"],"ielts-01885":["steel","钢材"],"ielts-01891":["locate","把……设在"],"ielts-01917":["staircase","楼梯"],"ielts-01919":["layer","层"],"ielts-01925":["beam","横梁"],"ielts-01927":["arch","拱形结构"],"ielts-01942":["toilet","马桶"],"ielts-01948":["supermarket","超市"],"ielts-01963":["carpenter","木匠"],"ielts-01985":["viaduct","高架桥"],"ielts-02006":["voyage","航海旅行"],"ielts-02029":["suitcase","行李箱"],"ielts-02033":["fare","交通票价"],"ielts-02035":["route","路线"],"ielts-02041":["path","小径"],"ielts-02054":["truck","卡车"],"ielts-02061":["pedicab","载客人力三轮车"],"ielts-02066":["wheel","车轮"],"ielts-02097":["turbine","涡轮机"],"ielts-02106":["railway","铁路"],"ielts-02110":["tunnel","隧道"],"ielts-02113":["arrive","到达"],"ielts-02121":["postage","邮资"],"ielts-02126":["bind","捆绑"],"ielts-02130":["transfer","换乘"],"ielts-02135":["speed","速度（快慢）"],"ielts-02136":["velocity","速度（有方向）"],"ielts-02146":["hierarchy","等级体系"],"ielts-02156":["municipal","市政的"],"ielts-02159":["arena","活动领域"],"ielts-02160":["flag","旗帜"],"ielts-02197":["global","全球的"],"ielts-02199":["federal","联邦的"],"ielts-02230":["poll","民意调查；投票"],"ielts-02244":["viewpoint","观点"],"ielts-02288":["market","市场（供求与交易）"],"ielts-02309":["swap","互换"],"ielts-02312":["tax","税款"],"ielts-02358":["input","投入（生产资源）"],"ielts-02363":["insure","投保"],"ielts-02381":["benefit","好处"],"ielts-02388":["cash","现金"],"ielts-02404":["salary","固定薪水"],"ielts-02406":["wage","工资（常按工时或工日计算）"],"ielts-02416":["profession","专业职业"],"ielts-02438":["abortion","人工流产"],"ielts-02439":["loss","亏损"],"ielts-02455":["legal","法律的"],"ielts-02464":["criteria","判断标准（复数）"],"ielts-02480":["legislate","立法"],"ielts-02484":["prejudice","偏见"],"ielts-02487":["sue","起诉"],"ielts-02507":["reasonable","合理的"],"ielts-02508":["suitable","合适的"],"ielts-02514":["arrest","逮捕"],"ielts-02532":["suicide","自杀"],"ielts-02551":["copyright","著作权"],"ielts-02564":["require","要求"],"ielts-02581":["twinkle","闪烁"],"ielts-02584":["cannon","火炮"],"ielts-02591":["deflect","使偏离原有方向"],"ielts-02598":["sword","剑"],"ielts-02602":["spear","长矛"],"ielts-02606":["prepare","准备"],"ielts-02629":["trespass","擅自闯入"],"ielts-02639":["halt","（使）停止"],"ielts-02645":["forbid","禁止"],"ielts-02666":["turbulent","动荡的"],"ielts-02686":["protest","抗议"],"ielts-02762":["statue","雕像"],"ielts-02769":["patrol","巡逻"],"ielts-02784":["generation","一代人"],"ielts-02785":["surname","姓氏"],"ielts-02799":["twin","双胞胎中的一人"],"ielts-02808":["adolescence","青春期"],"ielts-02822":["widow","寡妇"],"ielts-02833":["encounter","遇到"],"ielts-02840":["engagement","订婚"],"ielts-02841":["marry","（与……）结婚"],"ielts-02850":["each","每个"],"ielts-02860":["colleague","同事"],"ielts-02863":["friendship","友谊"],"ielts-02926":["reply","回答"],"ielts-02930":["quarrel","争吵"],"ielts-02933":["mention","提到"],"ielts-02937":["scold","训斥"],"ielts-02947":["clap","拍手"],"ielts-02971":["vibrate","（使）振动"],"ielts-02972":["whirl","飞快地旋转"],"ielts-02973":["rotate","（使）旋转"],"ielts-02975":["collide","相撞"],"ielts-02983":["tilt","（使）倾斜"],"ielts-03005":["indignity","有辱尊严的待遇"],"ielts-03006":["contempt","轻蔑"],"ielts-03013":["flee","逃离"],"ielts-03054":["strive","努力争取"],"ielts-03066":["dispose","处理；丢弃（常用 dispose of）"],"ielts-03077":["rectify","纠正"],"ielts-03090":["exaggerate","夸大"],"ielts-03095":["update","更新（资料、信息等）"],"ielts-03110":["cause","引起"],"ielts-03113":["objective","目标"],"ielts-03136":["participate","参与"],"ielts-03145":["retell","复述"],"ielts-03168":["virtue","美德"],"ielts-03170":["stature","身高"],"ielts-03173":["human","人类的"],"ielts-03174":["bone","骨头"],"ielts-03178":["brain","脑"],"ielts-03183":["forehead","额头"],"ielts-03192":["jaw","颌（上下颌）"],"ielts-03194":["beard","胡须"],"ielts-03195":["shoulder","肩膀"],"ielts-03197":["elbow","肘部"],"ielts-03198":["wrist","手腕"],"ielts-03203":["chest","胸部"],"ielts-03206":["waist","腰部"],"ielts-03211":["kidney","肾脏"],"ielts-03213":["gland","腺体"],"ielts-03215":["intestine","肠道"],"ielts-03230":["stimulus","刺激因素"],"ielts-03233":["habit","习惯"],"ielts-03240":["vague","模糊的"],"ielts-03256":["condom","安全套"],"ielts-03267":["patient","患者"],"ielts-03276":["insomnia","失眠"],"ielts-03277":["allergy","过敏"],"ielts-03278":["heart attack","心肌梗死"],"ielts-03282":["stroke","中风"],"ielts-03285":["fever","发烧"],"ielts-03294":["scar","疤痕"],"ielts-03299":["death","死亡"],"ielts-03331":["physician","医生"],"ielts-03334":["cure","治愈"],"ielts-03339":["transplant","移植（器官）；移栽"],"ielts-03342":["precaution","预防措施"],"ielts-03348":["medicine","药物"],"ielts-03353":["acupuncture","针刺疗法"],"ielts-03368":["optimistic","乐观的"],"ielts-03382":["laughter","笑声"],"ielts-03389":["agreeable","令人愉快的"],"ielts-03440":["sound","声音"],"ielts-03467":["similar","相似的"],"ielts-03492":["anger","愤怒"],"ielts-03509":["hostile","有敌意的"],"ielts-03524":["anxiety","焦虑"],"ielts-03541":["reluctant","不情愿的"],"ielts-03542":["hesitate","犹豫"],"ielts-03549":["sigh","叹气"],"ielts-03557":["ridiculous","荒唐可笑的"],"ielts-03564":["greedy","贪婪的"],"ielts-03566":["slothful","懒惰的"],"ielts-03579":["present","现在"],"ielts-03586":["dozen","一打（十二个）"],"ielts-03588":["midday","中午"],"ielts-03596":["secondly","其次"],"ielts-03599":["immediately","立即"],"ielts-03600":["instant","即时的"],"ielts-03603":["prior","在先的"],"ielts-03605":["preceding","在……之前的"],"ielts-03606":["precedent","先例"],"ielts-03608":["opening","开端"],"ielts-03609":["initially","起初"],"ielts-03614":["simultaneous","同时发生的"],"ielts-03616":["everlasting","永恒的"],"ielts-03621":["periodically","定期地"]});
  function courseDefault(word, fallback) {
    const reviewed = reviewedCourseMeanings[word?.id];
    if (reviewed?.[0] === word?.word && reviewed) return { ...fallback, meaning: reviewed[1] };
    const row = approvedCourseMeanings[word?.id];
    return row?.[0] === word?.word && row ? { ...fallback, meaning: row[2] } : fallback;
  }
  function applyApprovedCourseMeanings() {
    return withLock(() => {
      const checked = new Set(JSON.parse(host.localStorage.getItem(approvalMigrationKey) || '[]'));
      const entries = Object.assign(Object.create(null), readStrict().entries);
      let changed = false;
      let checkedMore = false;
      for (const [id, [word, previous, meaning]] of Object.entries(approvedCourseMeanings)) {
        if (checked.has(id)) continue;
        checked.add(id);
        checkedMore = true;
        const entry = entries[id];
        if (entry?.word !== word || entry.text !== previous) continue;
        const groups = entry.groups;
        if (groups && (groups.map(group => group.text.trim()).join('；') !== previous ||
                      groups.some(group => group.pos !== groups[0].pos))) continue;
        entries[id] = {
          ...entry, text: meaning, updatedAt: now(),
          ...(groups ? { groups: [{ ...groups[0], text: meaning }] } : {})
        };
        changed = true;
      }
      if (changed) persist(entries);
      if (checkedMore) host.localStorage.setItem(approvalMigrationKey, JSON.stringify([...checked]));
    });
  }
  applyApprovedCourseMeanings().catch(error => host.console?.warn('无法应用已核对的简洁释义', error));
  // End of reviewed course meanings.

  function exportData() { return validate(readStrict()); }

  // Called inside the study restore transaction. A saved local edit wins;
  // imported records may replace the untouched meanings shipped with the APK.
  function mergeBackup(value) {
    const backup = validate(value);
    const entries = Object.assign(Object.create(null), readStrict().entries);
    for (const [id, restored] of Object.entries(backup.entries)) {
      if (!own(entries, id) || host.CijianPackagedMeanings?.matches(id, entries[id])) {
        entries[id] = restored;
      }
    }
    return envelope(entries);
  }

  host.CijianSimpleMeaningsStore = Object.freeze({
    KEY, BACKUP_KEY, EVENT, courseDefault, MAX_LENGTH, MAX_GROUPS, MAX_POS_LENGTH, get, getGroups, save, saveGroups, reset, subscribe,
    exportData, validateBackup: validate, mergeBackup, notifyChange,
    getLastError: () => { readSafe(); return lastError; }
  });
})(window);
