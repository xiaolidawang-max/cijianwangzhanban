(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const dataset = window.CIJIAN_VOCABULARY;
  const directory = byId('chapter-directory');
  const directoryList = byId('chapter-list');
  const directoryToggle = byId('toggle-directory');
  const narrowScreen = window.matchMedia('(max-width: 760px)');
  const search = byId('search');
  const words = byId('words');
  const chapterButton = byId('play-chapter');
  const status = byId('audio-status');
  const tableScroller = document.querySelector('.table-scroller');
  const editDialog = byId('word-editor');
  const detailDialog = byId('word-detail');
  const detailAudio = byId('detail-audio');
  const detailBody = detailDialog.querySelector('.detail-body');
  const detailActions = detailDialog.querySelector('.detail-actions');
  const detailActionButtons = Array.from(detailActions.querySelectorAll('button'));
  const hideDetailWord = byId('hide-detail-word');
  const hideDetailMeaning = byId('hide-detail-meaning');
  const autoplay = byId('detail-autoplay');
  const repeatInput = byId('detail-repeat');
  const rateInput = byId('detail-rate');
  const pencilTemplate = byId('cell-edit-button');
  const hoverless = window.matchMedia('(hover: none)');

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  if (!dataset?.chapters.length || !dataset.words.length) {
    const empty = node('td', 'empty', '词库未能载入，请刷新页面。');
    empty.colSpan = 5;
    words.append(node('tr'));
    words.firstChild.append(empty);
    return;
  }

  const storageKey = 'cijian-vocabulary-chapter';
  const playbackKey = 'cijian-vocabulary-detail-playback';
  const pageParameters = new URLSearchParams(window.location.search);
  const playback = { auto: false, repeat: 1, rate: 1 };
  const noteKey = id => 'cijian-vocabulary-note:' + id;
  const sensesKey = id => 'cijian-vocabulary-senses:' + id;
  const audio = new Audio();
  audio.preload = 'none';
  const chapterWords = new Map(dataset.chapters.map(entry => [entry.id, []]));
  const chapterItems = new Map();
  const rowAudio = new Map();
  const hiddenFields = { word: false, meaning: false, note: false };
  const columnToggles = [
    { field: 'word', label: '英文单词', button: byId('toggle-word-column'), selector: '.headword', redraw: renderWord },
    { field: 'meaning', label: '中文意思', button: byId('toggle-meaning-column'), selector: '.sense-cell', redraw: renderSenses },
    { field: 'note', label: '笔记', button: byId('toggle-note-column'), selector: '.note', redraw: renderNote }
  ];
  let visible = [];
  let current = null;
  let sequence = null;
  let detailReading = null;
  let playGeneration = 0;
  let detailEntry = null;
  let detailEntries = [];
  let detailOrigin = null;
  let detailScroll = null;
  let cancelDetailEditor = null;
  let activeChapter = dataset.chapters[0].id;
  let desktopDirectoryOpen = true;
  let mobileDirectoryOpen = pageParameters.get('view') === 'chapters';

  for (const entry of dataset.words) {
    const entries = chapterWords.get(entry.chapter);
    if (!entries) continue;
    entries.push({ ...entry, number: entries.length + 1 });
  }

  byId('site-total').textContent = dataset.chapters.length + ' 章　'
    + dataset.words.length.toLocaleString('zh-CN') + ' 词';
  byId('directory-total').textContent = dataset.chapters.length + ' 章';

  const linkedChapter = pageParameters.get('chapter');
  if (chapterWords.has(linkedChapter)) {
    activeChapter = linkedChapter;
  } else {
    try {
      const lastChapter = localStorage.getItem(storageKey);
      if (chapterWords.has(lastChapter)) activeChapter = lastChapter;
    } catch {
      // Chapter selection still works when storage is unavailable.
    }
  }

  try {
    const saved = JSON.parse(localStorage.getItem(playbackKey));
    playback.auto = saved?.auto === true;
    if (Number.isSafeInteger(saved?.repeat) && saved.repeat > 0) playback.repeat = saved.repeat;
    if (Number.isFinite(saved?.rate) && saved.rate >= Number(rateInput.min) && saved.rate <= Number(rateInput.max)) {
      playback.rate = saved.rate;
    }
  } catch {
    // The default playback settings are available without storage.
  }
  autoplay.checked = playback.auto;
  repeatInput.value = String(playback.repeat);
  rateInput.value = String(playback.rate);
  updatePlaybackRate();

  for (const [index, entry] of dataset.chapters.entries()) {
    const button = node('button', 'chapter-item');
    button.type = 'button';
    const number = String(index + 1).padStart(2, '0');
    button.append(
      node('span', 'chapter-number', number),
      node('span', 'chapter-name', entry.name),
      node('span', 'chapter-word-count', chapterWords.get(entry.id).length + ' 词')
    );
    button.addEventListener('click', () => selectChapter(entry.id));
    chapterItems.set(entry.id, button);
    directoryList.append(button);
  }
  chapterItems.get(activeChapter).setAttribute('aria-current', 'true');

  const normalize = value => value.normalize('NFKC').trim().replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ').toLowerCase();
  const wordLabel = entry => hiddenFields.word
    ? '第 ' + entry.number + ' 词'
    : entry.word;

  function setRowAudio(entry, playing) {
    if (detailEntry?.id === entry.id) {
      detailAudio.setAttribute('aria-pressed', String(playing));
      const label = hideDetailWord.checked ? '当前单词' : entry.word;
      detailAudio.setAttribute('aria-label', (playing ? '停止 ' : '播放 ') + label + ' 的读音');
    }
    const button = rowAudio.get(entry.id);
    if (!button) return;
    button.closest('tr').classList.toggle('playing', playing);
    button.setAttribute('aria-pressed', String(playing));
    button.setAttribute('aria-label', (playing ? '停止 ' : '播放 ') + wordLabel(entry) + ' 的读音');
  }

  function setChapterPlaying(playing) {
    chapterButton.setAttribute('aria-pressed', String(playing));
    chapterButton.querySelector('use').setAttribute('href', playing ? '#icon-stop' : '#icon-play');
    chapterButton.lastElementChild.textContent = playing ? '停止朗读' : '全章朗读';
  }

  function stopAudio() {
    playGeneration += 1;
    audio.pause();
    if (current) setRowAudio(current, false);
    current = null;
    sequence = null;
    detailReading = null;
    setChapterPlaying(false);
  }

  function audioFailure(generation) {
    if (generation !== playGeneration) return;
    stopAudio();
    status.classList.remove('sr-only');
    status.textContent = '这条音频未能播放，请重试。';
    if (detailDialog.open) byId('detail-audio-status').textContent = status.textContent;
  }

  function play(entry) {
    const generation = ++playGeneration;
    if (current) setRowAudio(current, false);
    current = entry;
    setRowAudio(entry, true);
    status.classList.add('sr-only');
    status.textContent = '正在播放' + wordLabel(entry);
    byId('detail-audio-status').textContent = '';
    audio.src = entry.audio;
    audio.playbackRate = detailReading ? playback.rate : 1;
    audio.play().catch(() => audioFailure(generation));
  }

  function toggleAudio(entry) {
    const wasPlaying = current?.id === entry.id;
    stopAudio();
    if (!wasPlaying) play(entry);
  }

  function playDetailWord() {
    detailReading = { started: 1 };
    play(detailEntry);
  }

  function storePlayback() {
    try {
      localStorage.setItem(playbackKey, JSON.stringify(playback));
    } catch {
      // Playback controls still work for the current session.
    }
  }

  function updatePlaybackRate() {
    playback.rate = rateInput.valueAsNumber;
    byId('detail-rate-value').textContent = playback.rate.toFixed(1) + '×';
    if (detailReading) audio.playbackRate = playback.rate;
  }

  audio.addEventListener('ended', () => {
    if (!audio.ended || !current) return;
    if (detailReading && detailReading.started < playback.repeat) {
      detailReading.started += 1;
      play(current);
      return;
    }
    const next = sequence?.entries[++sequence.index];
    if (next) play(next);
    else {
      stopAudio();
      status.textContent = '朗读结束';
    }
  });

  chapterButton.addEventListener('click', () => {
    const wasPlaying = Boolean(sequence);
    stopAudio();
    const entries = chapterWords.get(activeChapter);
    if (wasPlaying || !entries.length) return;
    sequence = { entries, index: 0 };
    setChapterPlaying(true);
    play(entries[0]);
  });

  function getSenses(entry) {
    try {
      const saved = JSON.parse(localStorage.getItem(sensesKey(entry.id)));
      if (Array.isArray(saved) && saved.every(sense => typeof sense?.pos === 'string' && typeof sense.meaning === 'string')) {
        return saved;
      }
    } catch {
      // Use the book's definitions if saved edits cannot be read.
    }
    return dataset.edits?.[entry.id]?.senses ?? entry.senses ?? [];
  }

  function editorForm(className, fields, saveValue, closeEditor, extraActions = []) {
    const form = node('form', 'cell-editor ' + className);
    const controls = node('div', 'cell-editor-controls');
    const save = node('button', '', '保存');
    save.type = 'submit';
    const cancel = node('button', '', '取消');
    cancel.type = 'button';
    const error = node('span', 'cell-editor-error');
    error.setAttribute('role', 'status');

    form.addEventListener('input', () => { error.textContent = ''; });
    form.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeEditor(false);
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    cancel.addEventListener('click', () => closeEditor(false));
    form.addEventListener('submit', event => {
      event.preventDefault();
      try {
        saveValue();
      } catch {
        error.textContent = '保存失败，请检查浏览器存储后重试。';
        return;
      }
      closeEditor(true);
    });
    controls.append(...extraActions, save, cancel);
    form.append(...fields, error, controls);
    return form;
  }

  function draftInput(label, draft, field, lang) {
    const input = node('input');
    input.type = 'text';
    input.lang = lang;
    input.value = draft[field] ?? '';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => { draft[field] = input.value; });
    return input;
  }

  function pencil(entry, label, open, cell) {
    const button = pencilTemplate.content.firstElementChild.cloneNode(true);
    button.title = label;
    button.setAttribute('aria-label', label + '（第 ' + entry.number + ' 词）');
    if (detailDialog.contains(cell)) {
      button.removeAttribute('aria-haspopup');
      button.setAttribute('aria-controls', cell.id);
    }
    button.addEventListener('click', open);
    return button;
  }

  function textWithPencil(content, button) {
    const line = node('span', 'pencil-line');
    line.append(content, button);
    return line;
  }

  function showCellEditor(title, entry, cell, redraw, makeForm) {
    if (detailDialog.contains(cell)) {
      if (cancelDetailEditor) return;
      const otherSection = Array.from(detailBody.children).find(section => !section.contains(cell));
      const close = saved => {
        cancelDetailEditor = null;
        detailBody.classList.remove('editing-detail');
        otherSection.hidden = false;
        redraw(cell, entry);
        cell.scrollTop = 0;
        if (saved) {
          const selector = redraw === renderNote ? '.note' : '.sense-cell';
          const tableCell = rowAudio.get(entry.id)?.closest('tr').querySelector(selector);
          if (tableCell) redraw(tableCell, entry);
        }
        syncDetailControls();
        cell.querySelector('.cell-edit-trigger')?.focus({ preventScroll: true });
      };
      const form = makeForm(close);
      form.setAttribute('aria-label', title);
      cancelDetailEditor = () => close(false);
      cell.replaceChildren(form);
      otherSection.hidden = true;
      detailBody.classList.add('editing-detail');
      syncDetailControls();
      form.querySelector('input, textarea')?.focus({ preventScroll: true });
      return;
    }
    const heading = node('h2', '', title);
    heading.id = 'word-editor-title';
    const word = node('p', 'word-editor-term', wordLabel(entry));
    const form = makeForm(saved => {
      editDialog.close();
      if (saved) redraw(cell, entry);
      cell.querySelector('.cell-edit-trigger')?.focus({ preventScroll: true });
    });
    editDialog.replaceChildren(heading, word, form);
    editDialog.showModal();
  }

  function readNote(id) {
    const backedUpNote = dataset.edits?.[id]?.note ?? '';
    try {
      return localStorage.getItem(noteKey(id)) ?? backedUpNote;
    } catch {
      return backedUpNote;
    }
  }

  function renderNote(cell, entry) {
    const note = readNote(entry.id);
    if (hiddenFields.note && cell.classList.contains('note')) {
      const content = node('span', 'note-text', note || '还没有笔记');
      cell.replaceChildren(coveredAnswer('note-cover', content, '第 ' + entry.number + ' 词的笔记'));
      return;
    }
    const edit = pencil(entry, note ? '编辑笔记' : '添加笔记', () => openNoteEditor(cell, entry), cell);
    const content = note ? node('span', 'note-text', note) :
      detailDialog.contains(cell) ? node('span', 'detail-empty', '还没有笔记') : null;
    cell.replaceChildren(content ? textWithPencil(content, edit) : edit);
  }

  function openNoteEditor(cell, entry) {
    const input = node('textarea');
    input.rows = 3;
    input.maxLength = 5000;
    input.value = readNote(entry.id);
    input.setAttribute('aria-label', '笔记');
    showCellEditor('编辑笔记', entry, cell, renderNote, close =>
      editorForm('note-editor', [input], () => {
        localStorage.setItem(noteKey(entry.id), input.value.trim() ? input.value : '');
      }, close));
  }

  function coveredAnswer(className, content, label, spokenAnswer = content.textContent) {
    const button = node('button', className + ' covered-answer');
    button.type = 'button';
    content.classList.add('answer-value');
    button.append(content);
    function setRevealed(revealed) {
      button.setAttribute('aria-pressed', String(revealed));
      button.setAttribute('aria-label', revealed ? '遮盖' + label + '，' + spokenAnswer : '显示' + label);
    }
    setRevealed(false);
    button.addEventListener('click', () => setRevealed(button.getAttribute('aria-pressed') === 'false'));
    return button;
  }

  function renderSenses(cell, entry) {
    const senses = getSenses(entry);
    const masked = cell.classList.contains('sense-cell') ? hiddenFields.meaning : hideDetailMeaning.checked;
    const list = node('span', 'sense-groups');
    const groups = new Map();
    for (const { pos, meaning } of senses.length ? senses : [{}]) {
      const label = pos || '';
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(meaning || '–');
    }

    const edit = masked ? null : pencil(entry, senses.length ? '编辑中文释义' : '添加中文释义', () => openSenseEditor(cell, entry), cell);
    for (const [groupIndex, [pos, meanings]] of [...groups].entries()) {
      const definition = node('span', 'meaning');
      for (const [index, meaning] of meanings.entries()) {
        const item = node('span', 'sense-item');
        if (pos) item.append(node('span', 'pos', pos));
        const text = node('span', 'sense-text', meaning);
        const hasEdit = edit && groupIndex === 0 && index === meanings.length - 1;
        item.append(hasEdit ? textWithPencil(text, edit) : text);
        definition.append(item);
      }
      list.append(definition);
    }
    if (masked) {
      const spokenAnswer = senses.map(({ pos, meaning }) => [pos, meaning].filter(Boolean).join(' ')).join('，');
      cell.replaceChildren(coveredAnswer('meaning-cover', list, '第 ' + entry.number + ' 词的中文意思', spokenAnswer || '暂无中文意思'));
    } else {
      cell.replaceChildren(list);
    }
  }

  function openSenseEditor(cell, entry) {
    const draft = getSenses(entry).map(sense => ({ pos: sense.pos ?? '', meaning: sense.meaning ?? '' }));
    if (!draft.length) draft.push({ pos: '', meaning: '' });
    const fields = node('div', 'sense-editor-fields');
    function renderFields(focusIndex) {
      fields.replaceChildren();
      for (const [index, sense] of draft.entries()) {
        const row = node('div', 'sense-editor-row');
        const pos = draftInput('第 ' + (index + 1) + ' 条词性', sense, 'pos', 'en');
        pos.placeholder = '词性';
        const meaning = draftInput('第 ' + (index + 1) + ' 条中文释义', sense, 'meaning', 'zh-CN');
        meaning.placeholder = '中文释义';
        const remove = node('button', 'sense-remove', '×');
        remove.type = 'button';
        remove.title = '移除该义项';
        remove.setAttribute('aria-label', '移除第 ' + (index + 1) + ' 条义项');
        remove.addEventListener('click', () => {
          draft.splice(index, 1);
          renderFields(Math.min(index, draft.length - 1));
        });
        row.append(pos, meaning, remove);
        fields.append(row);
      }
      if (focusIndex >= 0) fields.querySelectorAll('input[lang="zh-CN"]')[focusIndex]?.focus();
      else if (focusIndex === -1) add.focus();
    }

    const add = node('button', 'add-sense', '添加义项');
    add.type = 'button';
    add.addEventListener('click', () => {
      draft.push({ pos: '', meaning: '' });
      renderFields(draft.length - 1);
    });
    renderFields();
    showCellEditor('编辑中文释义', entry, cell, renderSenses, close =>
      editorForm('sense-editor', [fields], () => {
        const saved = draft.map(sense => ({ pos: sense.pos.trim(), meaning: sense.meaning.trim() }))
          .filter(sense => sense.meaning);
        localStorage.setItem(sensesKey(entry.id), JSON.stringify(saved));
      }, close, [add]));
  }

  function renderWord(cell, entry) {
    if (hiddenFields.word) {
      const value = node('span', '', entry.word);
      value.lang = 'en-US';
      cell.replaceChildren(coveredAnswer('word-text', value, '第 ' + entry.number + ' 词的英文'));
      return;
    }

    const button = node('button', 'word-text', entry.word);
    button.type = 'button';
    button.lang = 'en-US';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'word-detail');
    if (entry.ipa) button.title = entry.ipa;
    button.addEventListener('click', () => openDetail(entry, button));
    cell.replaceChildren(button);
  }

  function syncDetailControls() {
    const index = detailEntries.findIndex(entry => entry.id === detailEntry?.id);
    byId('detail-previous').disabled = Boolean(cancelDetailEditor) || index <= 0;
    byId('detail-next').disabled = Boolean(cancelDetailEditor) || index >= detailEntries.length - 1;
    byId('detail-position').textContent = (index + 1) + ' / ' + detailEntries.length;
    for (const button of detailDialog.querySelectorAll('.cell-edit-trigger')) {
      button.disabled = Boolean(cancelDetailEditor);
    }
    for (const button of detailActionButtons) button.disabled = Boolean(cancelDetailEditor);
    if (cancelDetailEditor) setDetailMenu(null);
  }

  function setDetailMenu(activeButton) {
    for (const button of detailActionButtons) {
      const open = button === activeButton;
      byId(button.getAttribute('aria-controls')).hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    }
  }

  function renderDetailHeading(entry) {
    const title = byId('detail-word');
    title.lang = hideDetailWord.checked ? 'zh-CN' : 'en-US';
    if (hideDetailWord.checked) {
      const value = node('span', '', entry.word);
      value.lang = 'en-US';
      title.replaceChildren(coveredAnswer('detail-word-cover', value, '英文和音标', [entry.word, entry.ipa].filter(Boolean).join('，')));
    } else {
      title.textContent = entry.word;
    }
  }

  function renderDetail(entry) {
    detailEntry = entry;
    renderDetailHeading(entry);
    byId('detail-ipa').textContent = entry.ipa || '';
    byId('detail-ipa').hidden = !entry.ipa;
    byId('detail-audio-status').textContent = '';
    renderSenses(byId('detail-senses'), entry);
    renderNote(byId('detail-note'), entry);
    syncDetailControls();
    setRowAudio(entry, current?.id === entry.id);
    byId('detail-senses').scrollTop = 0;
    byId('detail-note').scrollTop = 0;
  }

  function openDetail(entry, trigger) {
    stopAudio();
    detailEntries = [...visible];
    detailOrigin = trigger;
    detailScroll = { x: window.scrollX, y: window.scrollY };
    renderDetail(entry);
    document.documentElement.classList.add('word-detail-open');
    detailDialog.showModal();
    if (playback.auto) playDetailWord();
  }

  function moveDetail(direction) {
    if (cancelDetailEditor) return;
    const index = detailEntries.findIndex(entry => entry.id === detailEntry?.id);
    const entry = detailEntries[index + direction];
    if (!entry) return;
    stopAudio();
    renderDetail(entry);
    if (playback.auto) playDetailWord();
  }

  function closeDetail() {
    cancelDetailEditor?.();
    detailDialog.close();
  }

  function renderRow(entry) {
    const row = node('tr');
    row.append(node('td', 'number', entry.number));

    const sound = node('td', 'audio');
    const button = node('button');
    button.type = 'button';
    button.append(detailAudio.firstElementChild.cloneNode(true));
    button.addEventListener('click', () => toggleAudio(entry));
    rowAudio.set(entry.id, button);
    sound.append(button);
    row.append(sound);

    const headword = node('th', 'headword');
    headword.scope = 'row';
    renderWord(headword, entry);
    row.append(headword);

    const meaning = node('td', 'sense-cell');
    renderSenses(meaning, entry);
    row.append(meaning);
    const note = node('td', 'note');
    renderNote(note, entry);
    row.append(note);
    return row;
  }

  function render() {
    const entries = chapterWords.get(activeChapter);
    const keyword = normalize(search.value);
    visible = keyword ? entries.filter(entry => normalize(entry.word).includes(keyword)
      || getSenses(entry).some(sense => normalize(sense.meaning || '').includes(keyword))) : entries;
    byId('chapter-status').textContent = keyword
      ? '搜索结果 ' + visible.length + ' 词'
      : chapterItems.get(activeChapter).querySelector('.chapter-name').textContent + '，' + entries.length + ' 词';
    chapterButton.disabled = !entries.length;
    rowAudio.clear();
    const fragment = document.createDocumentFragment();
    if (visible.length) {
      for (const entry of visible) fragment.append(renderRow(entry));
    } else {
      const row = node('tr');
      const empty = node('td', 'empty', '本章没有匹配的单词');
      empty.colSpan = 5;
      row.append(empty);
      fragment.append(row);
    }
    words.replaceChildren(fragment);
    for (const entry of visible) setRowAudio(entry, current?.id === entry.id);
  }

  function syncDirectory() {
    const open = narrowScreen.matches ? mobileDirectoryOpen : desktopDirectoryOpen;
    const hadFocus = directory.contains(document.activeElement);
    directory.hidden = !open;
    directoryToggle.setAttribute('aria-expanded', String(open));
    directoryToggle.setAttribute('aria-label', open ? '收起章节目录' : '展开章节目录');
    if (!open) {
      if (hadFocus) directoryToggle.focus({ preventScroll: true });
      return;
    }
    const selected = chapterItems.get(activeChapter).getBoundingClientRect();
    const list = directoryList.getBoundingClientRect();
    if (selected.top < list.top) directoryList.scrollTop += selected.top - list.top;
    if (selected.bottom > list.bottom) directoryList.scrollTop += selected.bottom - list.bottom;
  }

  function setDirectoryOpen(open) {
    if (narrowScreen.matches) mobileDirectoryOpen = open;
    else desktopDirectoryOpen = open;
    syncDirectory();
    if (open) chapterItems.get(activeChapter).focus({ preventScroll: true });
    else directoryToggle.focus({ preventScroll: true });
  }

  function selectChapter(chapterId) {
    if (chapterId === activeChapter) {
      if (narrowScreen.matches) setDirectoryOpen(false);
      return;
    }
    chapterItems.get(activeChapter).removeAttribute('aria-current');
    activeChapter = chapterId;
    chapterItems.get(activeChapter).setAttribute('aria-current', 'true');
    try {
      localStorage.setItem(storageKey, activeChapter);
    } catch {
      // Chapter selection still works when storage is unavailable.
    }
    stopAudio();
    search.value = '';
    tableScroller.scrollLeft = 0;
    render();
    if (narrowScreen.matches) setDirectoryOpen(false);
    window.scrollTo(0, 0);
  }

  directoryToggle.addEventListener('click', () => setDirectoryOpen(directory.hidden));
  byId('close-directory').addEventListener('click', () => setDirectoryOpen(false));
  directory.addEventListener('keydown', event => {
    if (event.key === 'Escape') setDirectoryOpen(false);
  });
  narrowScreen.addEventListener('change', syncDirectory);
  syncDirectory();
  search.addEventListener('input', render);
  document.addEventListener('click', event => {
    if (event.pointerType !== 'touch' && !hoverless.matches) return;
    const row = event.composedPath().find(target => target instanceof HTMLTableRowElement && target.parentElement === words) ?? null;
    const revealed = words.querySelector('.pencils-revealed');
    if (row === revealed) return;
    revealed?.classList.remove('pencils-revealed');
    row?.classList.add('pencils-revealed');
  });
  editDialog.addEventListener('close', () => {
    if (!editDialog.open) editDialog.replaceChildren();
  });
  byId('detail-close').addEventListener('click', closeDetail);
  byId('detail-previous').addEventListener('click', () => moveDetail(-1));
  byId('detail-next').addEventListener('click', () => moveDetail(1));
  detailAudio.addEventListener('click', () => {
    if (detailReading) stopAudio();
    else playDetailWord();
  });
  for (const button of detailActionButtons) {
    button.addEventListener('click', () => setDetailMenu(button.getAttribute('aria-expanded') === 'true' ? null : button));
  }
  hideDetailWord.addEventListener('change', () => {
    renderDetailHeading(detailEntry);
    setRowAudio(detailEntry, current?.id === detailEntry.id);
  });
  hideDetailMeaning.addEventListener('change', () => {
    const senses = byId('detail-senses');
    renderSenses(senses, detailEntry);
    senses.scrollTop = 0;
  });
  autoplay.addEventListener('change', () => {
    playback.auto = autoplay.checked;
    storePlayback();
    if (playback.auto && !current) playDetailWord();
  });
  repeatInput.addEventListener('change', () => {
    const count = repeatInput.valueAsNumber;
    if (Number.isSafeInteger(count) && count > 0) playback.repeat = count;
    repeatInput.value = String(playback.repeat);
    storePlayback();
  });
  rateInput.addEventListener('input', updatePlaybackRate);
  rateInput.addEventListener('change', storePlayback);
  let detailBackdropPressed = false;
  function outsideDetail(event) {
    const box = detailDialog.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right
      || event.clientY < box.top || event.clientY > box.bottom;
  }
  detailDialog.addEventListener('pointerdown', event => {
    detailBackdropPressed = event.target === detailDialog && outsideDetail(event);
  });
  detailDialog.addEventListener('click', event => {
    if (detailBackdropPressed && event.target === detailDialog && outsideDetail(event)) closeDetail();
    if (!detailActions.contains(event.target)) setDetailMenu(null);
    detailBackdropPressed = false;
  });
  detailDialog.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey
      || event.shiftKey || cancelDetailEditor || detailActions.contains(event.target)) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      moveDetail(event.key === 'ArrowLeft' ? -1 : 1);
    }
  });
  detailDialog.addEventListener('cancel', event => {
    const openMenu = detailActionButtons.find(button => button.getAttribute('aria-expanded') === 'true');
    if (openMenu) {
      event.preventDefault();
      setDetailMenu(null);
      openMenu.focus();
    } else if (cancelDetailEditor) {
      event.preventDefault();
      cancelDetailEditor();
    }
  });
  detailDialog.addEventListener('close', () => {
    setDetailMenu(null);
    stopAudio();
    cancelDetailEditor = null;
    detailEntry = null;
    detailEntries = [];
    document.documentElement.classList.remove('word-detail-open');
    detailOrigin?.focus({ preventScroll: true });
    if (detailScroll) window.scrollTo(detailScroll.x, detailScroll.y);
    detailOrigin = null;
    detailScroll = null;
  });
  for (const { field, label, button, selector, redraw } of columnToggles) {
    button.addEventListener('click', () => {
      const hidden = hiddenFields[field] = !hiddenFields[field];
      const action = hidden ? '显示全部' : '隐藏';
      button.setAttribute('aria-pressed', String(hidden));
      button.setAttribute('aria-label', action + label);
      button.title = action + label;
      button.querySelector('use').setAttribute('href', hidden ? '#icon-eye-off' : '#icon-eye');
      for (const entry of visible) {
        const row = rowAudio.get(entry.id).closest('tr');
        redraw(row.querySelector(selector), entry);
        if (field === 'word') setRowAudio(entry, current?.id === entry.id);
      }
      if (field === 'word' && current) status.textContent = '正在播放' + wordLabel(current);
    });
  }
  setChapterPlaying(false);
  render();
})();
