(function(host){
  'use strict';
  function create(React,jsx,Dialog){
    const {jsx:h,jsxs:hs}=jsx;
    const {useState,useEffect,useRef}=React;
    const store=()=>host.CijianNotesStore;
    function Pencil(){return hs('svg',{width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.9,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,children:[h('path',{d:'M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z'}),h('path',{d:'m15 5 4 4'})]})}
    function Section({word,edit}){
      const [,refresh]=useState(0);
      useEffect(()=>store().subscribe(()=>refresh(x=>x+1)),[]);
      const text=store().get(word.id);
      return hs('section',{className:'cn-section','aria-label':'笔记',children:[h('h4',{children:'笔记'}),text&&h('p',{className:'cn-text',children:text}),h('button',{type:'button',className:'cn-pencil','aria-label':'编辑当前单词的笔记',title:'编辑笔记',onClick:edit,children:h(Pencil,{})})]});
    }
    function Editor({word,close}){
      const initial=useRef(store().get(word.id));
      const [text,setText]=useState(initial.current),[busy,setBusy]=useState(false),[error,setError]=useState(''),[discard,setDiscard]=useState(false);
      const dirty=text!==initial.current;
      function cancel(){if(busy)return;if(dirty)setDiscard(true);else close()}
      async function save(){if(busy)return;setBusy(true);setError('');try{await store().save(word.id,text);close()}catch(e){setError(e.message||'保存失败，请重试。');setBusy(false)}}
      return h(Dialog,{title:'笔记 · '+word.word,close:cancel,className:'cn-editor',children:hs('div',{className:'cn-editor-body',children:[h('textarea',{'aria-label':'笔记内容',value:text,maxLength:5000,rows:7,disabled:busy,onChange:e=>{setText(e.target.value);setError('')}}),error&&h('p',{className:'cn-error',role:'alert',children:error}),discard&&hs('div',{className:'cm-confirm',children:[h('p',{children:'笔记还未保存。'}),hs('div',{className:'cm-actions',children:[h('button',{onClick:()=>setDiscard(false),children:'继续编辑'}),h('button',{onClick:close,children:'放弃修改'})]})]}),hs('div',{className:'cm-actions cn-actions',children:[h('button',{disabled:busy,onClick:cancel,children:'取消'}),h('button',{disabled:busy,className:'cm-primary',onClick:save,children:busy?'正在保存…':'保存'})]})]})});
    }
    return {Section,Editor};
  }
  host.CijianNotes=Object.freeze({create});
})(window);
