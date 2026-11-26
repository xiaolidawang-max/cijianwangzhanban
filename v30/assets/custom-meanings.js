(function (global) {
  'use strict';
  const store = () => global.CijianMeaningStore;
  let nativePending = false;
  function review(word, original) {
    const custom = store().get(word.id);
    return custom && custom.word === word.word && original
      ? { ...original, groups: custom.groups }
      : original;
  }
  async function exportJSON(payload, filename) {
    const text = JSON.stringify(payload, null, 2);
    if (global.CijianBackup && typeof global.CijianBackup.save === 'function') {
      if (nativePending) throw new Error('正在保存另一份文件，请先完成或取消。');
      nativePending = true;
      return new Promise((resolve, reject) => {
        const finish = event => {
          global.removeEventListener('cijian-native-backup', finish);
          nativePending = false;
          const result = typeof event.detail === 'string' ? event.detail : event.detail?.status;
          if (result === 'saved') resolve('saved');
          else if (result === 'cancelled') resolve('cancelled');
          else reject(new Error(result === 'too-large' ? '记录超过可保存的大小。' : result === 'busy' ? '正在保存另一份文件，请稍后重试。' : '保存文件失败，请重试。'));
        };
        global.addEventListener('cijian-native-backup', finish);
        try { global.CijianBackup.save(text); }
        catch (error) { global.removeEventListener('cijian-native-backup', finish); nativePending = false; reject(new Error('无法打开保存窗口，请重试。')); }
      });
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
    global.setTimeout(() => URL.revokeObjectURL(url), 30000);
    return 'download';
  }
  function create(React, jsx, Dialog) {
    const { jsx: h, jsxs: hs } = jsx;
    const { useState, useEffect, useRef } = React;
    function useRevision() {
      const [revision, setRevision] = useState(0);
      useEffect(() => store().subscribe(() => setRevision(value => value + 1)), []);
      return revision;
    }
    const draftOf = groups => groups.map(group => ({ pos: group.pos, text: group.glosses.join('；') }));
    function Editor({ word, close }) {
      const original = store().getDefaultGroups(word.id);
      const current = store().get(word.id)?.groups || original;
      const [groups, setGroups] = useState(() => draftOf(current));
      const [reset, setReset] = useState(false);
      const [busy, setBusy] = useState(false);
      const [message, setMessage] = useState('');
      const [askClose, setAskClose] = useState(false);
      const initial = useRef(JSON.stringify(draftOf(current)));
      const dirty = reset || JSON.stringify(groups) !== initial.current;
      function cancel() { if (busy) return; if (dirty) setAskClose(true); else close(); }
      function update(index, patch) { setGroups(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row)); setReset(false); setMessage(''); }
      async function save() {
        if (busy) return;
        setBusy(true); setMessage('');
        try {
          const next = groups.map(group => ({ pos: group.pos.trim(), glosses: group.text.split(/[；;\n]/).map(value => value.trim()).filter(Boolean) }));
          if (reset) await store().reset(word.id); else await store().save(word.id, next);
          close();
        } catch (error) { setMessage(error.message || '未能保存修改，请重试。'); setBusy(false); }
      }
      return h(Dialog, { title: '编辑中文 · ' + word.word, close: cancel, className: 'cm-editor', children: hs('div', { className: 'cm-body', children: [
        h('p', { className: 'cm-help', children: '修改会保存在这台设备，下次打开继续使用。' }),
        hs('details', { className: 'cm-default', children: [h('summary', { children: '查看默认词义' }), ...original.map((group, index) => hs('p', { children: [h('em', { children: group.pos }), ' ', group.glosses.join('；')] }, index))] }),
        h('p', { className: 'cm-help', children: '每行一组词义，多个意思用“；”分隔。' }),
        hs('div', { className: 'cm-fields', children: groups.map((group, index) => hs('div', { className: 'cm-group', children: [
          hs('label', { children: [h('span', { children: '词性' }), h('input', { value: group.pos, disabled: busy, maxLength: 24, placeholder: 'n. / v.', 'aria-label': '第 ' + (index + 1) + ' 组词性', onChange: event => update(index, { pos: event.target.value }) })] }),
          hs('label', { children: [h('span', { children: '中文意思' }), h('textarea', { value: group.text, disabled: busy, rows: 2, maxLength: 2000, placeholder: '中文意思；其他意思', 'aria-label': '第 ' + (index + 1) + ' 组中文意思', onChange: event => update(index, { text: event.target.value }) })] }),
          h('button', { type: 'button', className: 'cm-remove', disabled: groups.length === 1 || busy, 'aria-label': '删除第 ' + (index + 1) + ' 组', onClick: () => { setGroups(rows => rows.filter((_, i) => i !== index)); setReset(false); }, children: '×' })
        ] }, index)) }),
        h('button', { type: 'button', className: 'cm-add', disabled: busy || groups.length >= 12, onClick: () => { setGroups(rows => [...rows, { pos: 'n.', text: '' }]); setReset(false); }, children: '＋ 添加一组词义' }),
        message && h('p', { className: 'cm-message cm-error', role: 'alert', children: message }),
        askClose && hs('div', { className: 'cm-confirm', role: 'alert', children: [h('p', { children: '这条修改还未保存。' }), hs('div', { className: 'cm-actions', children: [h('button', { type: 'button', onClick: () => setAskClose(false), children: '继续编辑' }), h('button', { type: 'button', onClick: close, children: '放弃修改' })] })] }),
        hs('div', { className: 'cm-actions cm-footer', children: [h('button', { type: 'button', className: 'cm-reset', disabled: busy, onClick: () => { setGroups(draftOf(original)); setReset(true); setAskClose(false); setMessage('已恢复默认内容，点“保存”后生效。'); }, children: '恢复默认' }), h('button', { type: 'button', disabled: busy, onClick: cancel, children: '取消' }), h('button', { type: 'button', className: 'cm-primary', disabled: busy, onClick: save, children: busy ? '正在保存…' : '保存' })] }),
        h(TransferPanel, { disabled: dirty || busy, onApplied: () => { const fresh = draftOf(store().get(word.id)?.groups || original); setGroups(fresh); initial.current = JSON.stringify(fresh); setReset(false); setAskClose(false); } })
      ] }) });
    }
    function TransferPanel({ disabled = false, onApplied } = {}) {
      const input = useRef(null);
      const [text, setText] = useState('');
      const [preview, setPreview] = useState(null);
      const [overwrite, setOverwrite] = useState(false);
      const [busy, setBusy] = useState(false);
      const [message, setMessage] = useState('');
      async function choose(file) {
        setPreview(null); setText(''); setMessage(''); setOverwrite(false);
        if (!file) return;
        try {
          if (file.size > 10 * 1024 * 1024) throw new Error('文件过大，请选择导出的 JSON 修改记录。');
          const value = await file.text(); const plan = store().previewImport(value);
          setText(value); setPreview(plan);
        } catch (error) { setMessage(error.message || '无法读取文件。'); }
        if (input.current) input.current.value = '';
      }
      async function importFile() {
        if (busy || !preview) return;
        setBusy(true); setMessage('');
        try {
          const result = await store().importData(text, { overwrite });
          setPreview(null); setText('');
          setMessage('已导入 ' + result.imported + ' 条修改。' + (result.skippedConflicts ? '保留了 ' + result.skippedConflicts + ' 条有冲突的本机修改。' : ''));
          if (onApplied) onApplied();
        } catch (error) { setMessage(error.message || '未能导入，请重试。'); }
        setBusy(false);
      }
      async function exportFile() {
        if (busy) return;
        setBusy(true); setMessage('请选择保存位置…');
        try {
          const result = await exportJSON(store().exportData(), '词间自定义词义-' + new Date().toISOString().slice(0, 10) + '.json');
          setMessage(result === 'saved' ? '自定义词义已保存。' : result === 'cancelled' ? '已取消保存。' : '已开始下载自定义词义记录。');
        } catch (error) { setMessage(error.message || '导出失败，请重试。'); }
        setBusy(false);
      }
      return hs('details', { className: 'st-backup cm-transfer', children: [h('summary', { children: '自定义中文词义' }), hs('div', { className: 'st-backup-body', children: [
        h('p', { children: '可以导入审校表的已确认修改，也可以导出备份、转移到其他设备。' }),
        disabled && h('p', { className: 'cm-help', children: '先保存当前编辑，再导入或导出记录。' }),
        hs('div', { className: 'cm-actions', children: [h('button', { type: 'button', disabled: busy || disabled, onClick: exportFile, children: '导出词义修改' }), h('button', { type: 'button', disabled: busy || disabled, onClick: () => input.current?.click(), children: '导入词义 / 审校记录' }), h('input', { ref: input, type: 'file', accept: '.json,application/json', hidden: true, onChange: event => choose(event.target.files?.[0]) })] }),
        preview && hs('div', { className: 'cm-confirm', children: [h('p', { children: '可导入 ' + preview.confirmedChineseChanges + ' 条中文修改；跳过 ' + preview.skippedUnconfirmed + ' 条未确认记录。' }), h('p', { children: preview.conflicts ? '其中 ' + preview.conflicts + ' 条与本机已有修改不同。默认保留本机修改。' : '没有与本机修改冲突的条目。' }), preview.conflicts > 0 && hs('label', { className: 'cm-overwrite', children: [h('input', { type: 'checkbox', disabled: busy || disabled, checked: overwrite, onChange: event => setOverwrite(event.target.checked) }), '使用导入文件替换冲突的词义'] }), hs('div', { className: 'cm-actions', children: [h('button', { className: 'cm-primary', disabled: busy || disabled, onClick: importFile, children: busy ? '正在导入…' : '确认导入' }), h('button', { disabled: busy, onClick: () => { setPreview(null); setText(''); }, children: '取消' })] })] }),
        message && h('p', { className: 'cm-message', role: 'status', children: message })
      ] })] });
    }
    return { useRevision, Editor, TransferPanel };
  }
  global.CijianCustomMeanings = Object.freeze({ review, create, exportJSON });
})(window);
