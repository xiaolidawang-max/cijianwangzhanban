(function (host) {
  'use strict';

  function create(React, jsx, icons) {
    const { jsx: h, jsxs: hs } = jsx;
    const { useLayoutEffect, useMemo, useRef, useState } = React;
    const columns = ['#', '发音', '单词', '词性', '词义', '例句', '搭配'];
    const icon = (name, size) => h(icons[name], { size, 'aria-hidden': true });

    function bilingual(entry, showChinese) {
      return hs('span', { className: 'vd-bilingual', children: [
        h('span', { lang: 'en', children: entry.en }),
        showChinese && entry.zh && h('small', { children: entry.zh })
      ] });
    }

    function Directory({
      chapters, items, allItems, currentWordId, initialChapter, favoriteIds, query, setQuery,
      close, getContent, showEnglish, showChinese, openWord, playWord, playingWordId, audioError
    }) {
      const [pickedChapter, pickChapter] = useState(initialChapter || chapters[0]?.id);
      const [searchOpen, setSearchOpen] = useState(false);
      const scrolling = useRef(null);
      const activeRow = useRef(null);
      const searchRef = useRef(null);
      const searching = Boolean(query.trim());

      const wordsByChapter = useMemo(() => {
        const groups = new Map();
        for (const word of items) {
          if (!groups.has(word.chapter)) groups.set(word.chapter, []);
          groups.get(word.chapter).push(word);
        }
        return groups;
      }, [items]);
      const numbers = useMemo(() => {
        const counts = new Map();
        const result = new Map();
        for (const word of allItems) {
          const number = (counts.get(word.chapter) || 0) + 1;
          counts.set(word.chapter, number);
          result.set(word.id, number);
        }
        return result;
      }, [allItems]);

      const available = chapters.filter(chapter => wordsByChapter.has(chapter.id));
      const chapter = available.find(entry => entry.id === pickedChapter) || available[0];
      const words = chapter && wordsByChapter.get(chapter.id);
      const content = useMemo(() => words?.map(getContent) || [], [words, getContent]);
      const chapterLabel = entry => 'Chapter' + (chapters.indexOf(entry) + 1);

      useLayoutEffect(() => {
        const scroll = scrolling.current;
        if (!scroll) return;
        const active = activeRow.current;
        scroll.scrollLeft = 0;
        scroll.scrollTop = 0;
        if (!searching && active && chapter?.id === initialChapter) {
          scroll.scrollTop = Math.max(0, active.getBoundingClientRect().top
            - scroll.getBoundingClientRect().top - scroll.clientHeight / 3);
        }
      }, [chapter?.id, initialChapter, query, searching]);

      useLayoutEffect(() => {
        if (searchOpen) searchRef.current?.focus();
      }, [searchOpen]);

      return hs('main', { className: 'vd-page collection-directory', 'aria-labelledby': 'vd-title', children: [
        hs('header', { className: 'vd-header', children: [
          h('button', { className: 'vd-icon', type: 'button', 'aria-label': '返回上一页', onClick: close, children: icon('back', 20) }),
          h('h1', { id: 'vd-title', children: '单词目录' }),
          hs('button', {
            className: 'vd-icon vd-search-toggle', type: 'button', 'aria-label': searchOpen ? '收起搜索' : '搜索单词',
            'aria-expanded': searchOpen, 'aria-controls': 'word-directory-search',
            onClick: () => {
              setSearchOpen(!searchOpen);
              if (searchOpen) setQuery('');
            },
            children: [icon('search', 19), h('span', { children: searchOpen ? '收起搜索' : '搜索' })]
          })
        ] }),
        hs('div', { className: 'vd-toolbar', children: [
          h('h2', { children: '雅思词汇真经' }),
          hs('div', { className: 'vd-filters', children: [
            h('span', { className: 'vd-total', role: 'status', children: searching
              ? '共找到 ' + items.length.toLocaleString() + ' 词'
              : '全书 ' + allItems.length.toLocaleString() + ' 词'
            }),
            h('select', {
              'aria-label': '选择章节', value: chapter?.id || '', disabled: !chapter,
              onChange: event => pickChapter(event.target.value),
              children: chapter ? available.map(entry => h('option', {
                value: entry.id, children: chapterLabel(entry) + (searching ? '（' + wordsByChapter.get(entry.id).length + ' 词）' : '')
              }, entry.id)) : h('option', { value: '', children: '无匹配章节' })
            })
          ] })
        ] }),
        h('div', { id: 'word-directory-search', className: 'vd-search', hidden: !searchOpen && !query, children: h('input', {
          ref: searchRef, type: 'search', 'aria-label': '搜索单词、中文或搭配', placeholder: '搜索单词、中文或搭配',
          value: query, onChange: event => setQuery(event.target.value)
        }) }),
        audioError && h('p', { className: 'vd-audio-error', role: 'status', children: audioError }),
        chapter ? h('div', { className: 'vd-scroll', ref: scrolling, tabIndex: 0, role: 'region', 'aria-label': '单词表', children:
          hs('table', { className: 'vd-table', role: 'table', children: [
            hs('caption', { children: [
              h('strong', { children: chapterLabel(chapter) }),
              h('span', { children: words.length + ' 词' })
            ] }),
            h('thead', { role: 'rowgroup', children: h('tr', { role: 'row', children: columns.map(label => h('th', { role: 'columnheader', scope: 'col', children: label }, label)) }) }),
            h('tbody', { role: 'rowgroup', children: words.map((word, index) => {
              const active = currentWordId === word.id;
              const playing = playingWordId === word.id;
              const visible = !active || showEnglish;
              const label = visible ? word.word : '当前词条';
              const { senses, examples, phrases } = content[index];
              const pos = showChinese ? [...new Set(senses.map(sense => sense.pos).filter(Boolean))].join(' / ') : '';
              const meaning = showChinese ? senses.map(sense => sense.meaning).filter(Boolean).join('；') : '';
              const example = visible ? examples[0] : undefined;
              const phrase = visible ? phrases[0] : undefined;
              return hs('tr', { role: 'row', className: active ? 'vd-active' : undefined, ref: active ? activeRow : undefined, children: [
                h('td', { className: 'vd-number', role: 'cell', children: numbers.get(word.id) }),
                h('td', { className: 'vd-audio', role: 'cell', children: h('button', {
                  className: 'vd-icon', type: 'button', disabled: !word.audioUrl,
                  'aria-label': (playing ? '停止 ' : '播放 ') + label + ' 的读音',
                  'aria-pressed': playing, onClick: () => playWord(word),
                  children: icon(playing ? 'stop' : 'speaker', 17)
                }) }),
                h('th', { scope: 'row', role: 'rowheader', className: 'vd-word', children: hs('button', {
                  type: 'button', className: 'vd-word-link', lang: visible ? 'en' : undefined,
                  'aria-label': '打开单词 ' + label, 'aria-current': active ? 'true' : undefined,
                  onClick: () => openWord(word.id), children: [
                    h('span', { children: label }),
                    favoriteIds.includes(word.id) && icon('star', 13)
                  ]
                }) }),
                h('td', { className: 'vd-pos', role: 'cell', 'data-empty': !pos, children: pos || '—' }),
                h('td', { className: 'vd-meaning', role: 'cell', 'data-empty': !meaning, children: meaning || '—' }),
                hs('td', { className: 'vd-example', role: 'cell', 'data-empty': !example, children: [
                  h('span', { className: 'vd-field-label', 'aria-hidden': true, children: '例句' }),
                  example ? bilingual(example, showChinese) : '—'
                ] }),
                hs('td', { className: 'vd-extension', role: 'cell', 'data-empty': !phrase, children: [
                  h('span', { className: 'vd-field-label', 'aria-hidden': true, children: '搭配' }),
                  phrase ? bilingual(phrase, showChinese) : '—'
                ] })
              ] }, word.id);
            }) })
          ] })
        }) : h('p', { className: 'vd-empty', role: 'status', children: '没有找到匹配的词条' })
      ] });
    }

    return Directory;
  }

  host.CijianVocabularyDirectory = Object.freeze({ create });
})(window);
