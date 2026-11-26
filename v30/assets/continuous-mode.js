(function(host){
  'use strict';
  // The chapter-reviewed groups (including personal edits) are ordered by
  // relevance. Show one sense group and retain its short equivalents, since
  // a later equivalent can contain the chapter's key term (e.g. 战术).
  // This only changes playback presentation, never the saved full record.
  function coreGlosses(value){
    const text=typeof value==='string'?value.trim():'';
    const result=[];
    let depth=0,start=0;
    for(let i=0;i<text.length;i++){
      if('（([【'.includes(text[i]))depth++;
      else if('）)]】'.includes(text[i]))depth=Math.max(0,depth-1);
      else if(!depth&&'；;'.includes(text[i])){result.push(text.slice(start,i).trim());start=i+1}
    }
    result.push(text.slice(start).trim());
    return result.filter(Boolean);
  }
  function selectCoreMeaning(groups,fallback=''){
    for(const group of Array.isArray(groups)?groups:[]){
      const meanings=[];
      for(const gloss of Array.isArray(group?.glosses)?group.glosses:[]){
        meanings.push(...coreGlosses(typeof gloss==='string'?gloss:gloss?.text));
      }
      if(meanings.length)return {pos:typeof group.pos==='string'?group.pos.trim():'',meaning:[...new Set(meanings)].join('；')};
    }
    return {pos:'',meaning:coreGlosses(fallback).slice(0,2).join('；')};
  }
  let editorBack=null;
  // Register before React mounts its window-level navigation listeners. Window
  // popstate is at-target, so capture alone does not supersede earlier listeners.
  host.addEventListener?.('popstate',event=>editorBack?.(event),true);
  function guardEditorBack(requestClose){
    const playerState=host.history.state;
    // Keep the current card mounted until the editor has handled unsaved edits.
    // A browser Back consumes the player entry; restore it before asking to close.
    function onBack(event){
      event.stopImmediatePropagation();
      host.history.pushState(playerState,'');
      requestClose();
    }
    editorBack=onBack;
    return()=>{if(editorBack===onBack)editorBack=null};
  }
  function createCardPresenter(env){
    let visibleId='',pending=null;
    function clearFrame(entry){
      entry.paintToken++;
      if(entry.frame!==null){env.cancelAnimationFrame(entry.frame);entry.frame=null}
    }
    function finish(entry,ready){
      if(pending!==entry)return;
      pending=null;clearFrame(entry);
      entry.signal?.removeEventListener('abort',entry.abort);
      entry.resolve(ready);
    }
    function schedule(){
      const entry=pending;
      if(!entry||entry.frame!==null||entry.id!==visibleId)return;
      const token=++entry.paintToken;
      // React has committed the complete card. Cross a paint boundary before
      // starting its audio; a single rAF runs before that frame is painted.
      entry.frame=env.requestAnimationFrame(()=>{
        if(pending!==entry||entry.paintToken!==token)return;
        entry.frame=null;
        if(pending!==entry||entry.id!==visibleId)return;
        entry.frame=env.requestAnimationFrame(()=>{
          if(pending!==entry||entry.paintToken!==token)return;
          entry.frame=null;
          if(pending===entry&&entry.id===visibleId)finish(entry,true);
        });
      });
    }
    function wait(id,signal){
      if(pending)finish(pending,false);
      if(signal?.aborted)return Promise.resolve(false);
      return new Promise(resolve=>{
        const entry={id,signal,resolve,frame:null,paintToken:0,abort:null};
        entry.abort=()=>finish(entry,false);pending=entry;
        signal?.addEventListener('abort',entry.abort,{once:true});
        schedule();
      });
    }
    function show(id){
      visibleId=id||'';
      if(pending&&pending.id!==visibleId)clearFrame(pending);
      schedule();
    }
    function reset(){if(pending)finish(pending,false);visibleId=''}
    return {wait,show,reset};
  }
  function create(React,jsx,Dialog){
    const {jsx:h,jsxs:hs}=jsx;
    const {useState,useRef,useEffect,useLayoutEffect,useMemo}=React;
    const core=()=>host.CijianContinuousCore;
    const meanings=()=>host.CijianSimpleMeaningsStore;
    function MeaningLine({group}){
      const text=group.text||'中文释义待补充';
      return hs('p',{className:'cc-meaning-sense',children:[
        h('span',{className:'cc-pos',children:group.pos||''}),
        h('span',{className:'cc-meaning-copy',children:text})
      ]});
    }
    function MeaningBlock({groups}){
      return h('div',{className:'cc-meaning',children:groups.map((group,index)=>h(MeaningLine,{group},index))});
    }
    function WordPicture({word,images,showEnglish}){
      const holderRef=useRef(null);
      const [status,setStatus]=useState(images.peek(word.imageUrl)?'ready':word.imageUrl?'loading':'empty');
      useLayoutEffect(()=>{
        let active=true;
        const holder=holderRef.current;
        function show(){
          if(!active)return;
          const image=images.peek(word.imageUrl);
          if(image){
            // Mount the already decoded node instead of starting another img
            // request after the matching audio has begun.
            image.alt=showEnglish?word.word+' 插画':'单词插画';image.draggable=false;
            holder.replaceChildren(image);setStatus('ready');
          }else setStatus(word.imageUrl?'error':'empty');
        }
        const ready=images.get(word.imageUrl);
        if(images.peek(word.imageUrl))show();else ready.then(show);
        return()=>{active=false;holder.replaceChildren()};
      },[word.id,word.imageUrl,images,showEnglish]);
      return hs('div',{className:'cc-picture','data-word-id':word.id,'data-image-status':status,children:[
        h('div',{className:'cc-picture-host',ref:holderRef}),
        status!=='ready'&&hs('div',{className:'cc-picture-empty cc-picture-placeholder',role:'status',children:[h(Icon,{name:'image',size:44}),h('span',{children:status==='loading'?'正在加载图片…':'暂无插画'})]})
      ]});
    }
    function NumberControl({id,label,displayLabel=label,inline=false,value,min,max,unit,step=.01,onChange}){
      const [draft,setDraft]=useState(String(value));
      const skipCommit=useRef(false);
      useEffect(()=>setDraft(String(value)),[value]);
      function edit(raw){
        setDraft(raw);
        const number=Number(raw);
        if(raw.trim()&&Number.isFinite(number)&&number>=min&&number<=max&&(step!==1||Number.isInteger(number)))onChange(number);
      }
      function commit(){
        if(skipCommit.current){skipCommit.current=false;return}
        const number=Number(draft);
        const next=draft.trim()&&Number.isFinite(number)?Math.min(max,Math.max(min,step===1?Math.round(number):number)):value;
        setDraft(String(next));
        if(next!==value)onChange(next);
      }
      return hs('div',{className:'cc-option-row cc-number-row'+(inline?' cc-number-inline':''),children:[
        hs('div',{className:'cc-number-heading',children:[
          h('label',{htmlFor:id,children:displayLabel}),
          hs('div',{className:'cc-number-value',children:[h('input',{id,type:'number',inputMode:step===1?'numeric':'decimal',min,max,step:step===1?1:'any',value:draft,'aria-label':label,'aria-describedby':id+'-bounds',onChange:e=>edit(e.target.value),onBlur:commit,onKeyDown:e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();e.currentTarget.blur()}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();skipCommit.current=true;setDraft(String(value));e.currentTarget.blur()}}}),h('span',{'aria-hidden':true,children:unit})]})
        ]}),
        h('input',{type:'range',className:'cc-number-slider',min,max,step,value,'aria-label':label+'滑块','aria-valuetext':value+unit,onChange:e=>onChange(Number(e.target.value)),style:{'--cc-fill':((value-min)/(max-min)*100)+'%'}}),
        hs('div',{className:'cc-number-bounds',id:id+'-bounds',children:[h('span',{children:min+unit}),h('span',{children:max+unit})]})
      ]});
    }
    const commonPartsOfSpeech=['n.','v.','vt.','vi.','adj.','adv.','prep.','conj.','pron.','num.','art.','interj.','phr.'];
    function MeaningEditor({word,defaultMeaning:originalMeaning,close,requestCloseRef}){
      const defaultMeaning=meanings().courseDefault?.(word,originalMeaning)||originalMeaning;
      const initial=useRef(null);
      if(!initial.current)initial.current=meanings().getGroups(word)||[{pos:defaultMeaning.pos||'',text:meanings().get(word)??defaultMeaning.meaning}];
      const [rows,setRows]=useState(()=>initial.current.map((row,index)=>({...row,key:index}))),[reset,setReset]=useState(false);
      const nextKey=useRef(initial.current.length),saving=useRef(false),focusNewRow=useRef(null);
      const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
      const groups=rows.map(({pos,text})=>({pos,text}));
      const dirty=reset||JSON.stringify(groups)!==JSON.stringify(initial.current);
      function editRow(key,field,value){setRows(old=>old.map(row=>row.key===key?{...row,[field]:value}:row));setReset(false);setMessage('')}
      function addGroup(){
        const key=nextKey.current++;
        focusNewRow.current=key;
        setRows(old=>[...old,{pos:'',text:'',key}]);
        setReset(false);
      }
      async function save(){
        if(saving.current)return;
        if(!dirty){close();return}
        saving.current=true;setBusy(true);setMessage('');
        try{
          if(reset)await meanings().reset(word);
          else await meanings().saveGroups(word,groups.filter(row=>row.pos.trim()||row.text.trim()));
          close();
        }catch(error){saving.current=false;setMessage(error.message||'保存失败，请重试。');setBusy(false)}
      }
      requestCloseRef.current=save;
      return h(Dialog,{title:'编辑释义',close:save,className:'cm-editor cc-meaning-editor',children:[
        hs('div',{className:'cc-editor-fields',children:[
          h('p',{className:'cc-edit-word',children:word.word}),
          h('div',{className:'cc-meaning-groups',children:rows.map((row,index)=>hs('section',{className:'cc-meaning-group','aria-label':'第 '+(index+1)+' 组词义',children:[
            hs('div',{className:'cc-pos-heading',children:[
              h('label',{htmlFor:'cc-pos-'+row.key,children:'词性'}),
              hs('div',{className:'cc-pos-chip',children:[
                h('input',{id:'cc-pos-'+row.key,type:'text',maxLength:40,size:Math.min(14,Math.max(3,row.pos.length)),value:row.pos,disabled:busy,'aria-label':'第 '+(index+1)+' 组词性',placeholder:'词性',onChange:e=>editRow(row.key,'pos',e.target.value),
                  ref:node=>{if(node&&focusNewRow.current===row.key){focusNewRow.current=null;node.focus()}}}),
                h('select',{'aria-label':'选择第 '+(index+1)+' 组常用词性',value:commonPartsOfSpeech.includes(row.pos)?row.pos:'',disabled:busy,onChange:e=>editRow(row.key,'pos',e.target.value),children:[
                  h('option',{value:'',disabled:true,children:'常用词性'},''),
                  ...commonPartsOfSpeech.map(pos=>h('option',{value:pos,children:pos},pos))
                ]})
              ]}),
              rows.length>1&&h('button',{type:'button',className:'cc-remove-group',disabled:busy,'aria-label':'移除第 '+(index+1)+' 组词义',onClick:()=>{setRows(old=>old.filter(item=>item.key!==row.key));setReset(false);setMessage('')},children:h(Icon,{name:'close',size:17})})
            ]}),
            hs('label',{className:'cc-meaning-field',children:[h('span',{children:'中文释义'}),h('textarea',{'aria-label':'第 '+(index+1)+' 组中文释义',rows:2,maxLength:1000,value:row.text,disabled:busy,onChange:e=>editRow(row.key,'text',e.target.value)})]})
          ]},row.key))}),
          h('button',{type:'button',className:'cc-add-group',disabled:busy||rows.length>=meanings().MAX_GROUPS,onClick:addGroup,children:'+ 添加词性'})
        ]},'fields'),
        message&&h('p',{className:'cm-error',role:'alert',children:message},'error'),
        hs('footer',{className:'cm-actions',children:[
          h('button',{type:'button',disabled:busy,onClick:()=>{setRows([{pos:defaultMeaning.pos||'',text:defaultMeaning.meaning,key:nextKey.current++}]);setReset(true);setMessage('')},children:'恢复默认'}),
          h('span',{className:'cc-autosave-note',children:'关闭时自动保存'}),
          h('button',{type:'button',className:'cm-primary',disabled:busy,onClick:save,children:busy?'保存中…':'完成'})
        ]},'actions')
      ]});
    }
    function Icon({name,size=22}){
      const paths={list:'M8 6h12M8 12h12M8 18h12M3.5 6h.5M3.5 12h.5M3.5 18h.5',back:'m14 6-6 6 6 6',close:'m6 6 12 12M6 18 18 6',next:'m9 5 7 7-7 7',previous:'m15 5-7 7 7 7',search:'m21 21-4.6-4.6M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',repeat:'m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3',image:'M3 3h18v18H3zM3 16l5-5 5 5 3-3 5 5M8 7h.01',check:'m5 12 4 4L19 6',arrow:'m9 5 7 7-7 7'};
      if(name==='display')return hs('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,children:[h('path',{d:'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z'}),h('circle',{cx:12,cy:12,r:3})]});
      if(name==='play')return h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'currentColor','aria-hidden':true,children:h('path',{d:'M8 4.8a1 1 0 0 1 1.5-.86l10.8 6.2a2.1 2.1 0 0 1 0 3.72l-10.8 6.2A1 1 0 0 1 8 19.2Z'})});
      if(name==='pause')return hs('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'currentColor','aria-hidden':true,children:[h('rect',{x:6,y:4,width:4,height:16,rx:1}),h('rect',{x:14,y:4,width:4,height:16,rx:1})]});
      return h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,children:h('path',{d:paths[name]||paths.arrow})});
    }
    function defaultSettings(words,currentWordId){
      const current=words.find(w=>w.id===currentWordId)||words[0];
      const chapter=words.filter(w=>w.chapter===current?.chapter);
      return {...core().DEFAULTS,startId:chapter[0]?.id||'',endId:chapter[chapter.length-1]?.id||'',chapterId:current?.chapter||'',chapterIds:current?[current.chapter]:[]};
    }
    function displayedMeaningGroups(word,content){
      const original=content.coreMeaning||selectCoreMeaning([],content.meaning);
      const fallback=meanings().courseDefault?.(word,original)||original;
      return (word&&meanings().getGroups(word))||[{pos:fallback.pos||'',text:(word&&meanings().get(word))??fallback.meaning}];
    }
    function displayedMeaningLabel(word,getContent){
      return displayedMeaningGroups(word,getContent(word))
        .map(group=>(group.pos?group.pos+' ':'')+group.text).join('；');
    }
    function PlaybackDirectory({words,currentIndex,description,getContent,meaningRevision,close,choose,inline=false}){
      const [query,setQuery]=useState('');
      const listRef=useRef(null),titleRef=useRef(null);
      const [viewport,setViewport]=useState({top:0,height:600});
      const rowHeight=inline?56:76;
      const items=useMemo(()=>words.map((word,index)=>({
        word,index,meaning:displayedMeaningLabel(word,getContent)
      })),[words,getContent,meaningRevision]);
      const results=useMemo(()=>{
        const needle=query.trim().toLocaleLowerCase();
        return needle?items.filter(item=>item.word.word.toLocaleLowerCase().includes(needle)||item.meaning.toLocaleLowerCase().includes(needle)||String(item.index+1)===needle):items;
      },[items,query]);
      function measure(){const list=listRef.current;if(list)setViewport({top:list.scrollTop,height:list.clientHeight})}
      useLayoutEffect(()=>{
        const list=listRef.current;
        if(!list)return;
        list.scrollTop=query.trim()?0:Math.max(0,currentIndex*rowHeight-(list.clientHeight-rowHeight)/2);
        measure();
      },[query,currentIndex]);
      useEffect(()=>{
        titleRef.current?.focus();
        if(!host.ResizeObserver)return;
        const observer=new host.ResizeObserver(measure);observer.observe(listRef.current);
        return()=>observer.disconnect();
      },[]);
      const start=Math.min(Math.max(0,results.length-1),Math.max(0,Math.floor(viewport.top/rowHeight)-6));
      const end=Math.min(results.length,Math.ceil((viewport.top+viewport.height)/rowHeight)+6);
      // Keep long custom ranges light while retaining their original sequence numbers.
      return hs('section',{className:inline?'cc-inline-directory':'cc-directory-shell','aria-label':inline?description+'单词目录':undefined,'aria-labelledby':inline?undefined:'cc-directory-title',children:[
        !inline&&hs('header',{className:'cc-topbar cc-directory-topbar',children:[
          h('button',{type:'button',className:'cc-icon-button cc-back-button','aria-label':'返回单词播放',onClick:close,children:h(Icon,{name:'back',size:20})}),
          h('h1',{id:'cc-directory-title',ref:titleRef,tabIndex:-1,children:'单词目录'}),
          h('span',{className:'cc-directory-total',children:words.length+' 词'})
        ]}),
        hs('div',{className:'cc-directory-tools',children:[
          !inline&&h('p',{className:'cc-directory-scope',children:description}),
          hs('label',{className:'cc-directory-search',children:[h(Icon,{name:'search',size:18}),h('input',{type:'search',value:query,'aria-label':'搜索目录中的单词',placeholder:'搜索英文、中文或序号',onChange:event=>setQuery(event.target.value)})]}),
          (!inline||query.trim())&&h('p',{className:'cc-directory-count',role:'status',children:query.trim()?'找到 '+results.length+' 个单词':'当前第 '+(currentIndex+1)+' 词 · 点击单词跳转'})
        ]}),
        hs('div',{className:'cc-directory-list',ref:listRef,onScroll:measure,role:'list','aria-label':'当前播放范围的单词目录',tabIndex:0,children:[
          h('div',{'aria-hidden':true,style:{height:start*rowHeight}}),
          ...results.slice(start,end).map((item,offset)=>h('div',{role:'listitem','aria-posinset':start+offset+1,'aria-setsize':results.length,className:'cc-directory-item',children:hs('button',{
            type:'button',className:'cc-directory-word'+(item.index===currentIndex?' cc-directory-current':''),'aria-label':'跳转到第 '+(item.index+1)+' 词 '+item.word.word,'aria-current':item.index===currentIndex?'true':undefined,onClick:()=>choose(item.index),children:[
              h('span',{className:'cc-directory-number',children:item.index+1}),
              hs('span',{className:'cc-directory-copy',children:[h('strong',{children:item.word.word}),h('small',{children:item.meaning})]}),
              item.index===currentIndex?h('span',{className:'cc-directory-badge',children:'当前'}):h(Icon,{name:'arrow',size:15})
            ]
          })},item.word.id)),
          h('div',{'aria-hidden':true,style:{height:Math.max(0,results.length-end)*rowHeight}}),
          !results.length&&h('p',{className:'cc-directory-empty',children:'当前范围内没有匹配的单词'})
        ]})
      ]});
    }
    function ChapterWords({words,description,getContent,meaningRevision,choose}){
      const items=useMemo(()=>words.map((word,index)=>({word,index,meaning:displayedMeaningLabel(word,getContent)})),[words,getContent,meaningRevision]);
      return h('ol',{className:'cc-chapter-words cc-chapter-word-list','aria-label':description+'单词目录',children:items.map(item=>h('li',{value:item.index+1,children:hs('button',{
        type:'button',className:'cc-chapter-word','aria-label':'从第 '+(item.index+1)+' 词 '+item.word.word+' 开始播放',onClick:()=>choose(item.index),children:[
          h('span',{className:'cc-chapter-word-number','aria-hidden':true,children:item.index+1}),
          hs('span',{className:'cc-chapter-word-copy',children:[h('strong',{children:item.word.word}),h('small',{children:item.meaning})]}),
          h(Icon,{name:'play',size:13})
        ]
      })},item.word.id))});
    }
    function ChapterHeader({chapter,selected,expanded,panelId,buttonRef,select,expand,downloadButton}){
      return hs('div',{className:'cc-chapter-row','data-selected':selected,'data-expanded':expanded,children:[
        hs('label',{className:'cc-chapter-select',children:[
          h('input',{type:'checkbox',className:'cc-chapter-checkbox','aria-label':'选择'+chapter.label,checked:selected,onChange:event=>select(event.target.checked)}),
          h('span',{className:'cc-chapter-selection','aria-hidden':true,children:selected?h(Icon,{name:'check',size:12}):null})
        ]}),
        hs('button',{type:'button',className:'cc-chapter-field',ref:buttonRef,'aria-label':chapter.label+'，'+chapter.words.length+' 词','aria-controls':panelId,'aria-expanded':expanded,onClick:expand,children:[
          h('span',{className:'cc-chapter-title',children:chapter.label}),
          h('span',{className:'cc-chapter-count',children:chapter.words.length+' 词'}),
          h(Icon,{name:'arrow',size:16})
        ]}),
        downloadButton
      ]});
    }
    const setupTabs=[{id:'range',label:'播放范围'},{id:'reading',label:'朗读'},{id:'rhythm',label:'播放与显示'}];
    function Page({words,chapters,currentWordId,getContent,exit}){
      const initial=useRef(null);
      if(!initial.current){
        try{initial.current={settings:core().loadSettings(host.localStorage,words,currentWordId),error:'',blocked:false}}
        catch(e){initial.current={settings:defaultSettings(words,currentWordId),error:'暂时无法读取简洁模式设置，本次仍可使用。',blocked:true}}
      }
      const [settings,setSettings]=useState(initial.current.settings);
      const [screen,setScreen]=useState('setup');
      const [setupTab,setSetupTab]=useState('range');
      const settingsMainRef=useRef(null);
      useLayoutEffect(()=>{if(settingsMainRef.current)settingsMainRef.current.scrollTop=0},[setupTab]);
      const [warning,setWarning]=useState(initial.current.error);
      const [sessionWords,setSessionWords]=useState([]);
      const [state,setState]=useState({status:'idle',index:0,displayIndex:0,repetition:0,error:''});
      const [picker,setPicker]=useState(null),[query,setQuery]=useState(''),[chapter,setChapter]=useState('all'),[limit,setLimit]=useState(60);
      const [expandedChapter,setExpandedChapter]=useState(null);
      const [offlineStatus,setOfflineStatus]=useState({});
      useEffect(()=>{
        let visible=true;
        const unsubscribe=host.CijianOffline.subscribe((id,status)=>{
          if(visible)setOfflineStatus(old=>({...old,[id]:status}));
        });
        host.CijianOffline.allStatuses().then(current=>{
          if(visible)setOfflineStatus(old=>({...current,...old}));
        }).catch(()=>{});
        return()=>{visible=false;unsubscribe()};
      },[]);
      function downloadButton(chapter){
        const status=offlineStatus[chapter.id]||{state:'idle'};
        const {state,percent,bytes}=status;
        const label={idle:'下载',loading:percent+'%',done:'已下载',error:'重试'}[state];
        const size=bytes?'（'+(bytes/1048576).toFixed(1)+' MB）':'';
        return h('button',{type:'button',className:'cc-chapter-download','data-state':state,
          'aria-label':chapter.label+' '+label,
          disabled:state==='loading'||state==='done',title:label+size,
          onClick:()=>host.CijianOffline.download(chapter.id),children:label});
      }
      const [editingWord,setEditingWord]=useState(null);
      const [displayOpen,setDisplayOpen]=useState(false);
      const displayMenuRef=useRef(null),displayTriggerRef=useRef(null);
      const editorCloseRef=useRef(null),editorBackRef=useRef(null),editTriggerRef=useRef(null);
      const [meaningRevision,setMeaningRevision]=useState(0);
      useEffect(()=>meanings().subscribe(()=>setMeaningRevision(value=>value+1)),[]);
      useEffect(()=>{
        if(!displayOpen)return;
        function outside(event){if(!displayMenuRef.current?.contains(event.target))setDisplayOpen(false)}
        document.addEventListener('pointerdown',outside);
        return()=>document.removeEventListener('pointerdown',outside);
      },[displayOpen]);
      const expandedButtonRef=useRef(null);
      const resultsRef=useRef(null),sentinelRef=useRef(null),loadRequestRef=useRef(null);
      const customRangeRef=useRef(initial.current.settings.selectionMode==='custom'?{startId:initial.current.settings.startId,endId:initial.current.settings.endId}:null);
      const playerRef=useRef(null),pickerRef=useRef(null),searchRef=useRef(null),setupTitleRef=useRef(null),pickerTriggerRef=useRef(null);
      const navigationRef=useRef(null),navigationChangeRef=useRef(null);
      const directoryReturnRef=useRef(null),directoryTriggerRef=useRef(null);
      const images=useMemo(()=>host.CijianContinuousImages.create(),[]);
      const chineseAudio=useMemo(()=>host.CijianChineseAudio?.create(),[]);
      const contentReaderRef=useRef(getContent);contentReaderRef.current=getContent;
      function chineseText(word){
        const content=contentReaderRef.current(word);
        const groups=displayedMeaningGroups(word,content);
        return groups.map(group=>group.text.trim()).filter(Boolean).join('；');
      }
      const presenter=useMemo(()=>createCardPresenter({requestAnimationFrame:fn=>host.requestAnimationFrame(fn),cancelAnimationFrame:id=>host.cancelAnimationFrame(id)}),[]);
      const imageDisposeRef=useRef(null);
      useEffect(()=>()=>editorBackRef.current?.(),[]);
      function ensurePlayer(){
        if(!playerRef.current)playerRef.current=core().createPlayer({createAudio:url=>new Audio(url),...host.CijianOffline.audioAdapter(),setTimeout:(fn,ms)=>host.setTimeout(fn,ms),clearTimeout:id=>host.clearTimeout(id),onState:setState,beforePlay:word=>images.prepare(word.imageUrl),present:(word,index,{signal})=>presenter.wait(word.id,signal),getEnglishAudio:word=>chineseAudio?.englishUrl(word)||word.audioUrl,hasChinese:word=>!!chineseAudio?.hasChinese(word),getChineseAudio:word=>chineseAudio?.prepare(word,chineseText(word))});
        return playerRef.current;
      }
      useEffect(()=>{
        // StrictMode replays effects synchronously; retain the same decoded
        // cache during that replay and dispose it only on an actual departure.
        if(imageDisposeRef.current!==null){host.clearTimeout(imageDisposeRef.current);imageDisposeRef.current=null}
        ensurePlayer();
        function visibility(){if(document.hidden)playerRef.current?.pause()}
        document.addEventListener('visibilitychange',visibility);
        return()=>{document.removeEventListener('visibilitychange',visibility);playerRef.current?.destroy();playerRef.current=null;presenter.reset();imageDisposeRef.current=host.setTimeout(()=>{images.destroy();chineseAudio?.destroy()},0)};
      },[]);
      function ensureNavigation(){
        if(!navigationRef.current)navigationRef.current=core().createNavigation({
          onChange:(view,source)=>navigationChangeRef.current?.(view,source),
          onLeave:()=>playerRef.current?.stop(),onExit:exit
        });
        return navigationRef.current;
      }
      useEffect(()=>{
        const navigation=ensureNavigation();navigation.sync();
        return()=>{navigation.destroy();navigationRef.current=null};
      },[]);
      useEffect(()=>{
        if(picker)searchRef.current?.focus();
        else pickerTriggerRef.current?.focus();
      },[picker]);
      useLayoutEffect(()=>{
        if(expandedChapter&&screen==='setup'&&setupTab==='range')expandedButtonRef.current?.scrollIntoView({block:'start'});
      },[expandedChapter,screen,setupTab]);
      const selected=useMemo(()=>{
        try{return {range:core().resolveSelection(words,settings),error:''}}
        catch(e){return {range:[],error:e.message||'请选择有效的起止单词。'}}
      },[words,settings.startId,settings.endId,settings.selectionMode,settings.chapterId,settings.chapterIds]);
      useEffect(()=>{
        images.warm(screen==='player'?sessionWords:selected.range,screen==='player'?state.index:0);
      },[screen,sessionWords,state.index,selected.range]);
      const byId=useMemo(()=>new Map(words.map((w,i)=>[w.id,{word:w,number:i+1}])),[words]);
      const chapterNames=useMemo(()=>new Map(chapters.map(c=>[c.id,c.name])),[chapters]);
      const chapterChoices=useMemo(()=>chapters.map((c,i)=>({...c,label:'Chapter'+(i+1),words:words.filter(w=>!w.archived&&w.chapter===c.id)})).filter(c=>c.words.length),[chapters,words]);
      const chapterSelection=core().selectedChapterIds(settings);
      const selectedChapters=chapterChoices.filter(c=>chapterSelection.includes(c.id));
      const pickerMeaning=useMemo(()=>{
        const labels=new Map();
        return word=>{
          if(!labels.has(word))labels.set(word,displayedMeaningLabel(word,getContent));
          return labels.get(word);
        };
      },[getContent,meaningRevision]);
      const results=useMemo(()=>{
        if(!picker)return [];
        const needle=query.trim().toLocaleLowerCase();
        return words.map((w,i)=>({word:w,number:i+1})).filter(item=>{
          if(chapter!=='all'&&item.word.chapter!==chapter)return false;
          if(!needle)return true;
          if(item.word.word.toLocaleLowerCase().includes(needle)||String(item.number)===needle)return true;
          return pickerMeaning(item.word).toLocaleLowerCase().includes(needle);
        });
      },[picker,query,chapter,words,pickerMeaning]);
      function loadMore(){
        if(limit>=results.length||loadRequestRef.current===limit)return;
        loadRequestRef.current=limit;
        setLimit(n=>Math.min(n+60,results.length));
      }
      function loadNearEnd(){
        const list=resultsRef.current;
        if(list&&list.scrollHeight-list.scrollTop-list.clientHeight<=200)loadMore();
      }
      useEffect(()=>{
        loadRequestRef.current=null;
        if(resultsRef.current)resultsRef.current.scrollTop=0;
      },[picker,query,chapter]);
      useEffect(()=>{
        if(!picker||limit>=results.length)return;
        // Also fill a viewport taller than the first batch without requiring a
        // scroll event. The observer follows the appended last item on each batch.
        loadNearEnd();
        if(!host.IntersectionObserver||!sentinelRef.current||!resultsRef.current)return;
        const observer=new host.IntersectionObserver(entries=>{
          if(entries.some(entry=>entry.isIntersecting))loadMore();
        },{root:resultsRef.current,rootMargin:'0px 0px 200px 0px',threshold:0});
        observer.observe(sentinelRef.current);
        return()=>observer.disconnect();
      },[picker,query,chapter,limit,results.length]);
      const running=['playing','waiting','preparing','buffering'].includes(state.status);
      const completed=state.status==='completed';
      const current=sessionWords[state.displayIndex]||sessionWords[0];
      useEffect(()=>{
        if(screen==='player'&&settings.readChinese)chineseAudio?.warm(sessionWords,state.displayIndex,chineseText);
      },[screen,sessionWords,state.displayIndex,settings.readChinese,meaningRevision]);
      useLayoutEffect(()=>{presenter.show(screen==='player'?current?.id:'')});
      const content=useMemo(()=>current?getContent(current):{english:'',meaning:''},[current,getContent]);
      const defaultMeaning=content.coreMeaning||selectCoreMeaning([],content.meaning);
      const meaningGroups=displayedMeaningGroups(current,content);
      const first=byId.get(settings.startId),last=byId.get(settings.endId);
      navigationChangeRef.current=(view,source)=>{
        setDisplayOpen(false);
        const returning=screen==='directory'&&view.screen==='player';
        if(view.screen==='directory'){
          if(!directoryReturnRef.current)directoryReturnRef.current={index:ensurePlayer().getState().displayIndex,resume:false,selected:false};
          ensurePlayer().pause();
        }
        else if(!returning)ensurePlayer().stop();
        if(view.screen!=='setup'&&!sessionWords.length){
          const range=selected.range.slice();
          ensurePlayer().configure(range,settings);setSessionWords(range);
        }
        setScreen(view.screen);setPicker(view.overlay==='start'||view.overlay==='end'?view.overlay:null);
        if(view.overlay==='chapter'){setSetupTab('range');setExpandedChapter(settings.chapterId)}
        if(returning){
          const request=directoryReturnRef.current;directoryReturnRef.current=null;
          if(request?.index!==undefined)ensurePlayer().seek(request.index);
          if(request?.selected&&request.resume&&source==='pop')ensurePlayer().play();
          host.setTimeout(()=>directoryTriggerRef.current?.focus(),0);
        }else if(view.screen!=='directory')directoryReturnRef.current=null;
        if(source!=='push'&&(view.overlay==='start'||view.overlay==='end')){setQuery('');setChapter('all');setLimit(60)}
        if(view.screen==='setup'&&!view.overlay&&(screen==='player'||source==='sync'))setTimeout(()=>setupTitleRef.current?.focus(),0);
      };
      function applySettings(next){
        setSettings(next);
        if(!initial.current.blocked){
          try{core().saveSettings(next,host.localStorage);setWarning('')}
          catch(_){setWarning('播放设置未能保存，本次仍可使用。')}
        }
      }
      function update(name,value){applySettings({...settings,[name]:value})}
      function setAutomatic(value){update('autoAdvance',value)}
      function changeSelectionMode(mode){
        if(mode===settings.selectionMode)return;
        if(mode==='custom'){
          const fallback=defaultSettings(words,currentWordId);
          const range=customRangeRef.current||{startId:settings.startId||fallback.startId,endId:settings.endId||fallback.endId};
          applySettings({...settings,...range,selectionMode:'custom'});
        }else{
          customRangeRef.current={startId:settings.startId,endId:settings.endId};
          applySettings(core().selectChapters(settings,words,chapterSelection));
        }
      }
      function closeLayer(){ensureNavigation().back()}
      function toggleChapter(id){
        setExpandedChapter(open=>open===id?null:id);
      }
      function selectChapter(id,checked){
        const ids=checked?[...chapterSelection,id]:chapterSelection.filter(value=>value!==id);
        applySettings(core().selectChapters(settings,words,ids));
      }
      function openPicker(which,event){pickerTriggerRef.current=event.currentTarget;setQuery('');setChapter('all');setLimit(60);ensureNavigation().showOverlay(which)}
      function choose(id){setSettings(old=>({...old,selectionMode:'custom',[picker==='start'?'startId':'endId']:id}));closeLayer()}
      function begin(index=0,options=settings){
        const range=core().resolveSelection(words,options);
        if(!range.length)return;
        if(options!==settings)setSettings(options);
        if(!initial.current.blocked){
          try{core().saveSettings(options,host.localStorage);setWarning('')}
          catch(e){setWarning('简洁模式设置未能保存，本次仍可播放。')}
        }
        images.warm(range,index);
        const player=ensurePlayer();
        ensureNavigation().showPlayer();
        player.configure(range,options);setSessionWords(range);
        if(index>0)player.seek(index);
        if(options.autoAdvance)player.play();
      }
      function beginAtWord(word){
        if(!word)return;
        const options=core().selectChapters(settings,words,[...chapterSelection,word.chapter]);
        const index=core().resolveSelection(words,options).findIndex(item=>item.id===word.id);
        if(index>=0)begin(index,options);
      }
      function adjust(){ensurePlayer().stop();ensureNavigation().back()}
      function leave(){ensurePlayer().stop();ensureNavigation().back()}
      function toggle(){const player=ensurePlayer();if(running)player.pause();else player.play()}
      function openDirectory(){
        if(!sessionWords.length)return;
        directoryReturnRef.current={index:ensurePlayer().getState().displayIndex,resume:running,selected:false};
        ensurePlayer().pause();setDisplayOpen(false);
        ensureNavigation().showDirectory();
      }
      function chooseDirectoryWord(index){
        if(!Number.isInteger(index)||index<0||index>=sessionWords.length)return;
        directoryReturnRef.current={...directoryReturnRef.current,index,selected:true};
        ensureNavigation().back();
      }
      function editMeaning(){
        if(!current||editingWord)return;
        ensurePlayer().pause();
        setEditingWord({word:current,defaultMeaning});
        editorBackRef.current=guardEditorBack(()=>editorCloseRef.current?.());
      }
      function closeMeaningEditor(){
        editorBackRef.current?.();editorBackRef.current=null;
        setEditingWord(null);
        host.setTimeout(()=>editTriggerRef.current?.focus(),0);
      }
      function keyboard(e){
        if(editingWord)return;
        if(screen==='directory'){
          if(e.key==='Escape'){e.preventDefault();e.stopPropagation();ensureNavigation().back()}
          return;
        }
        if(displayOpen&&e.key==='Escape'){e.preventDefault();e.stopPropagation();setDisplayOpen(false);displayTriggerRef.current?.focus();return}
        if(e.key==='Escape'&&!picker&&!e.defaultPrevented){e.preventDefault();screen==='player'?adjust():leave();return}
        if(screen!=='player'||picker||e.altKey||e.ctrlKey||e.metaKey||e.repeat)return;
        if(e.target.closest('input,textarea,select,button,a'))return;
        if(e.code==='Space'){e.preventDefault();toggle()}
        if(e.key==='ArrowRight'){e.preventDefault();ensurePlayer().next()}
        if(e.key==='ArrowLeft'){e.preventDefault();ensurePlayer().previous()}
      }
      function dialogKeyboard(e,dialog,close){
        if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return}
        if(e.key!=='Tab')return;
        const focusable=Array.from(dialog.current.querySelectorAll('button:not(:disabled),input,[tabindex="0"]'));
        const firstNode=focusable[0],lastNode=focusable[focusable.length-1];
        if(e.shiftKey&&document.activeElement===firstNode){e.preventDefault();lastNode?.focus()}
        else if(!e.shiftKey&&document.activeElement===lastNode){e.preventDefault();firstNode?.focus()}
      }
      function rangeField(which,label,item){
        return hs('button',{className:'cc-range-field',type:'button','aria-label':'选择'+label,onClick:e=>openPicker(which,e),children:[
          h('span',{className:'cc-range-label',children:which==='start'?'起始':'结束'}),
          hs('span',{className:'cc-range-value',children:[h('strong',{children:item?.word.word||'选择单词'}),h('small',{children:item?'第 '+item.number+' 词 · '+(chapterNames.get(item.word.chapter)||''):''})]}),
          h(Icon,{name:'arrow',size:16})
        ]});
      }
      function pictureSizeControl(){
        const {min,max,step}=core().PICTURE_SIZE;
        const value=settings.pictureSize;
        return hs('label',{className:'cc-picture-size',children:[
          h('span',{children:'插图大小'}),h('span',{className:'cc-picture-percent',children:value+'%'}),
          h('input',{type:'range',className:'cc-number-slider',min,max,step,value,
            'aria-label':'插图大小','aria-valuetext':value+'%',onChange:e=>update('pictureSize',Number(e.target.value)),
            style:{'--cc-fill':((value-min)/(max-min)*100)+'%'}}),
          hs('span',{className:'cc-number-bounds','aria-hidden':true,children:[h('span',{children:min+'%'}),h('span',{children:max+'%'})]})
        ]});
      }
      function displayControls(){
        return h('div',{className:'cc-language-toggles',role:'group','aria-label':'显示语言',children:[
          {key:'showChinese',label:'中文',symbol:'中'},{key:'showEnglish',label:'英文',symbol:'En'}
        ].map(item=>hs('button',{
          type:'button',className:'cc-language-toggle',role:'switch','aria-label':'显示'+item.label,'aria-checked':settings[item.key],
          title:(settings[item.key]?'隐藏':'显示')+item.label,onClick:()=>update(item.key,!settings[item.key]),children:[
            h('span',{className:'cc-language-symbol','aria-hidden':true,children:item.symbol}),
            h('span',{children:item.label}),h('span',{className:'cc-language-check','aria-hidden':true,children:settings[item.key]?h(Icon,{name:'check',size:13}):'−'})
          ]
        },item.key))});
      }
      const pickerUI=picker&&h('div',{className:'cc-picker-shade',children:hs('section',{className:'cc-picker',role:'dialog','aria-modal':true,'aria-labelledby':'cc-picker-title',ref:pickerRef,onKeyDown:e=>dialogKeyboard(e,pickerRef,closeLayer),children:[hs('header',{className:'cc-picker-header',children:[h('h2',{id:'cc-picker-title',children:picker==='start'?'选择起始单词':'选择结束单词'}),h('button',{type:'button',className:'cc-icon-button','aria-label':'关闭单词选择',onClick:closeLayer,children:h(Icon,{name:'close'})})]}),hs('div',{className:'cc-picker-tools',children:[hs('label',{className:'cc-search',children:[h(Icon,{name:'search',size:19}),h('input',{ref:searchRef,type:'search',value:query,'aria-label':'搜索'+(picker==='start'?'起始':'结束')+'单词',placeholder:'搜索英文、中文或词序号',onChange:e=>{setQuery(e.target.value);setLimit(60)}})]}),h('div',{className:'cc-chapter-filter',role:'group','aria-label':'筛选章节',children:[{id:'all',name:'全部章节'},...chapters].map(c=>h('button',{type:'button',className:'cc-chapter-chip','aria-pressed':chapter===c.id,onClick:()=>{setChapter(c.id);setLimit(60)},children:c.name},c.id))}),h('p',{className:'cc-result-count',children:'共 '+results.length+' 个单词'})]}),hs('div',{className:'cc-picker-results',role:'region',tabIndex:0,'aria-label':'可选单词',ref:resultsRef,onScroll:loadNearEnd,children:[...results.slice(0,limit).map(item=>{
        const active=item.word.id===(picker==='start'?settings.startId:settings.endId);
        return hs('button',{type:'button',className:'cc-word-result'+(active?' cc-selected':''),'aria-label':'选择第 '+item.number+' 词 '+item.word.word,'aria-pressed':active,onClick:()=>choose(item.word.id),children:[h('span',{className:'cc-word-number',children:item.number}),hs('span',{className:'cc-word-result-copy',children:[h('strong',{children:item.word.word}),h('small',{children:pickerMeaning(item.word)})]}),active&&h(Icon,{name:'check',size:19})]},item.word.id);
      }),!results.length&&h('p',{className:'cc-no-results',children:'没有找到匹配的单词，试试其他关键词。'}),results.length>limit&&h('div',{className:'cc-load-sentinel',ref:sentinelRef,'aria-hidden':true})]})]})});
      function tabKeyDown(event,index){
        const last=setupTabs.length-1;
        const next={ArrowRight:(index+1)%setupTabs.length,ArrowLeft:(index+last)%setupTabs.length,Home:0,End:last}[event.key];
        if(next===undefined)return;
        event.preventDefault();
        setSetupTab(setupTabs[next].id);
        event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus();
      }
      function panel(id){
        return {id:'cc-panel-'+id,role:'tabpanel',hidden:setupTab!==id,'aria-labelledby':'cc-tab-'+id,tabIndex:0};
      }
      const setupUI=hs('div',{className:'cc-setup-shell cc-setup-native',children:[
        hs('header',{className:'cc-topbar cc-setup-topbar',children:[
          h('button',{type:'button',className:'cc-icon-button cc-back-button','aria-label':'退出简洁模式',onClick:leave,children:h(Icon,{name:'back',size:20})}),
          h('h1',{ref:setupTitleRef,tabIndex:-1,children:'简洁模式'})
        ]}),
        h('div',{className:'cc-setup-tabs',role:'tablist','aria-label':'简洁模式设置',children:setupTabs.map(({id,label},index)=>
          h('button',{type:'button',role:'tab',id:'cc-tab-'+id,'aria-controls':'cc-panel-'+id,'aria-selected':setupTab===id,tabIndex:setupTab===id?0:-1,onClick:()=>setSetupTab(id),onKeyDown:e=>tabKeyDown(e,index),children:label},id)
        )}),
        hs('main',{className:'cc-setup-main',ref:settingsMainRef,children:[
          hs('section',{className:'cc-setup-section cc-range-section',...panel('range'),children:[
            hs('div',{className:'cc-segment cc-range-mode',role:'group','aria-label':'播放范围方式',children:[
              h('button',{type:'button','aria-label':'按章节播放','aria-pressed':settings.selectionMode==='chapter',onClick:()=>changeSelectionMode('chapter'),children:'按章节'}),
              h('button',{type:'button','aria-label':'自定义播放范围','aria-pressed':settings.selectionMode==='custom',onClick:()=>changeSelectionMode('custom'),children:'自定义'})
            ]}),
            settings.selectionMode==='chapter'?h('div',{className:'cc-chapter-accordion',children:chapterChoices.map(c=>{
              const expanded=expandedChapter===c.id,selected=chapterSelection.includes(c.id);
              const panelId='cc-chapter-words-'+c.id;
              return hs('div',{className:'cc-chapter-entry',children:[
                h(ChapterHeader,{chapter:c,selected,expanded,panelId,buttonRef:expanded?expandedButtonRef:undefined,select:checked=>selectChapter(c.id,checked),expand:()=>toggleChapter(c.id),downloadButton:downloadButton(c)}),
                offlineStatus[c.id]?.error&&h('p',{className:'cc-offline-message',role:'alert',children:offlineStatus[c.id].error}),
                h('div',{id:panelId,hidden:!expanded,children:expanded&&screen==='setup'&&setupTab==='range'&&h(ChapterWords,{
                  description:c.label,words:c.words,getContent,meaningRevision,choose:index=>beginAtWord(c.words[index])
                },c.id)})
              ]},c.id);
            })}):hs('div',{className:'cc-range-card',children:[rangeField('start','起始单词',first),rangeField('end','结束单词',last)]}),
            settings.selectionMode==='custom'&&h('p',{className:'cc-range-count',children:'已选 '+selected.range.length+' 词'}),
            selected.error&&h('p',{className:'cc-error',role:'alert',children:selected.error})
          ]}),
          hs('section',{className:'cc-setup-section cc-reading-section',...panel('reading'),children:[
            hs('div',{className:'cc-audio-group','aria-label':'英文朗读设置',children:[
              hs('label',{className:'cc-option-row cc-audio-heading',children:[h('span',{children:'英文'}),h('input',{type:'checkbox',role:'switch','aria-label':'英文朗读',className:'cc-switch',checked:settings.readEnglish,onChange:e=>update('readEnglish',e.target.checked)})]}),
              settings.readEnglish&&h(NumberControl,{id:'cc-speed',label:'英文语速',displayLabel:'语速',inline:true,value:settings.speed,min:.5,max:3,unit:'×',onChange:value=>update('speed',value)}),
              settings.readEnglish&&h(NumberControl,{id:'cc-en-volume',label:'英文音量',displayLabel:'音量',inline:true,value:settings.englishVolume,min:0,max:200,step:1,unit:'%',onChange:value=>update('englishVolume',value)}),
              settings.readEnglish&&hs('div',{className:'cc-option-row cc-repeat-row',children:[h('span',{children:'每词朗读'}),h('div',{className:'cc-segment cc-repeat-selector',role:'group','aria-label':'英文朗读次数',children:[1,2,3].map(n=>h('button',{type:'button','aria-label':'每词朗读 '+n+' 次','aria-pressed':settings.repeats===n,onClick:()=>update('repeats',n),children:h('span',{children:n+' 次'})},n))})]})
            ]}),
            hs('div',{className:'cc-audio-group','aria-label':'中文朗读设置',children:[
              hs('label',{className:'cc-option-row cc-audio-heading',children:[h('span',{children:'中文'}),h('input',{type:'checkbox',role:'switch','aria-label':'中文朗读',className:'cc-switch',checked:settings.readChinese,onChange:e=>update('readChinese',e.target.checked)})]}),
              settings.readChinese&&h(NumberControl,{id:'cc-chinese-speed',label:'中文语速',displayLabel:'语速',inline:true,value:settings.chineseSpeed,min:.5,max:3,unit:'×',onChange:value=>update('chineseSpeed',value)}),
              settings.readChinese&&h(NumberControl,{id:'cc-zh-volume',label:'中文音量',displayLabel:'音量',inline:true,value:settings.chineseVolume,min:0,max:200,step:1,unit:'%',onChange:value=>update('chineseVolume',value)})
            ]})
          ]}),
          hs('section',{className:'cc-setup-section cc-rhythm-section',...panel('rhythm'),children:[
            hs('div',{className:'cc-options-card',children:[
              hs('label',{className:'cc-option-row',children:[h('span',{children:'自动播放'}),h('input',{type:'checkbox',role:'switch','aria-label':'自动播放',className:'cc-switch',checked:settings.autoAdvance,onChange:e=>setAutomatic(e.target.checked)})]}),
              hs('label',{className:'cc-option-row',children:[h('span',{children:'先读中文'}),h('input',{type:'checkbox',role:'switch','aria-label':'先读中文',className:'cc-switch',checked:settings.chineseFirst,onChange:e=>update('chineseFirst',e.target.checked)})]}),
              h(NumberControl,{id:'cc-gap',label:'读完后停留',value:settings.gapSeconds,...core().WORD_GAP_SECONDS,unit:'s',onChange:value=>update('gapSeconds',value)}),
              hs('div',{className:'cc-option-row cc-display-row',children:[h('span',{children:'显示内容'}),displayControls()]}),
              pictureSizeControl()
            ]})
          ]}),
          warning&&h('p',{className:'cc-warning',role:'status',children:warning})
        ]}),
        hs('footer',{className:'cc-setup-actions',children:[
          hs('p',{className:'cc-selection-summary','aria-live':'polite',children:[
            h('span',{children:'已选'}),h('strong',{children:settings.selectionMode==='chapter'?(selectedChapters.length===1?selectedChapters[0].label:selectedChapters.length+' 个章节'):'自定义范围'}),
            h('span',{className:'cc-selection-total',children:selected.range.length+' 词'})
          ]}),
          hs('button',{type:'button',className:'cc-start',disabled:!selected.range.length,onClick:()=>begin(),children:[h(Icon,{name:settings.autoAdvance?'play':'arrow',size:16}),h('span',{children:settings.autoAdvance?'开始连播':'进入单词卡'})]})
        ]})
      ]});
      const playerUI=current&&hs('div',{className:'cc-player-shell',children:[
        hs('header',{className:'cc-topbar cc-player-topbar',children:[
          h('button',{type:'button',className:'cc-icon-button cc-back-button','aria-label':'返回播放设置',onClick:adjust,children:h(Icon,{name:'back',size:20})}),
          hs('button',{type:'button',className:'cc-player-position cc-directory-trigger',ref:directoryTriggerRef,'aria-label':'打开单词目录，当前第 '+(state.displayIndex+1)+' 词，共 '+sessionWords.length+' 词',title:'打开单词目录',onClick:openDirectory,children:[
            h(Icon,{name:'list',size:17}),h('span',{children:'目录'}),
            h('span',{className:'cc-directory-position',children:(state.displayIndex+1)+' / '+sessionWords.length})
          ]}),
          hs('div',{className:'cc-display-menu',ref:displayMenuRef,children:[
            h('button',{type:'button',className:'cc-icon-button cc-display-trigger',ref:displayTriggerRef,'aria-label':'显示设置',title:'显示设置','aria-expanded':displayOpen,'aria-controls':displayOpen?'cc-display-popover':undefined,onClick:()=>setDisplayOpen(value=>!value),children:h(Icon,{name:'display',size:21})}),
            displayOpen&&hs('div',{className:'cc-display-popover',id:'cc-display-popover',children:[h('p',{children:'显示内容'}),displayControls(),pictureSizeControl()]})
          ]})
        ]}),
        hs('main',{className:'cc-player-body',style:{'--cc-picture-scale':settings.pictureSize/100},'data-chapter':current.chapter,'data-word-id':current.id,tabIndex:0,'aria-label':settings.showEnglish?current.word+' 连播词卡':'连播词卡',children:[
          h(WordPicture,{word:current,images,showEnglish:settings.showEnglish},current.id+'|'+current.imageUrl),
          hs('div',{className:'cc-word-block'+(settings.showEnglish?'':' cc-content-hidden'),'aria-hidden':!settings.showEnglish,children:[h('h1',{className:current.word.length>18?'cc-long-word':undefined,children:current.word}),h('p',{className:'cc-ipa',children:current.ipa||'\u00a0'})]}),
          h('p',{className:'cc-english'+(settings.showEnglish?'':' cc-content-hidden'),'aria-hidden':!settings.showEnglish,lang:'en',children:content.english||'\u00a0'}),
          hs('div',{className:'cc-meaning-row'+(settings.showChinese?'':' cc-content-hidden'),'aria-hidden':!settings.showChinese,children:[
            h(MeaningBlock,{groups:meaningGroups}),
            h('button',{type:'button',className:'cc-edit-meaning',ref:editTriggerRef,'aria-label':'编辑中文释义',title:'编辑中文释义',onClick:editMeaning,children:h('svg',{width:17,height:17,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,children:h('path',{d:'m16 3 5 5M4 15 16.5 2.5a2.1 2.1 0 0 1 3 3L7 18l-4 1 1-4ZM3 22h18'})})})
          ]}),
          settings.readChinese&&state.chineseUnavailable&&h('p',{className:'cc-start-hint',role:'status',children:'暂无中文录音'})
        ]}),
        hs('footer',{className:'cc-player-footer',children:[
          state.error&&h('p',{className:'cc-error cc-play-error',role:'alert',children:state.error}),
          warning&&h('p',{className:'cc-warning cc-play-warning',children:warning}),
          hs('nav',{className:'cc-controls','aria-label':'连播控制',children:[
            h('button',{type:'button',className:'cc-skip','aria-label':'连播上一个单词',disabled:state.index===0,onClick:()=>ensurePlayer().previous(),children:h(Icon,{name:'previous',size:24})}),
            hs('button',{type:'button',className:'cc-play-toggle','aria-label':completed?'再播一遍':running?'暂停连播':state.status==='error'?'重试播放':'继续播放',onClick:completed?()=>ensurePlayer().restart():toggle,children:[h(Icon,{name:completed?'repeat':running?'pause':'play',size:19}),h('span',{children:completed?'再播一遍':running?'暂停':state.status==='error'?'重试':'播放'})]}),
            h('button',{type:'button',className:'cc-skip','aria-label':'连播下一个单词',disabled:state.index>=sessionWords.length-1,onClick:()=>ensurePlayer().next(),children:h(Icon,{name:'next',size:24})})
          ]})
        ]})
      ]});
      const directoryDescription=settings.selectionMode==='chapter'?selectedChapters.map(chapter=>chapter.label).join(' → '):
        '自定义范围 · '+(sessionWords[0]?.word||'')+' — '+(sessionWords[sessionWords.length-1]?.word||'');
      return hs('div',{className:'cc-page'+(screen==='player'?' cc-playing-page':screen==='setup'?' cc-settings-page':''),'data-playback-status':screen!=='setup'?state.status:undefined,'data-playback-language':screen==='player'?state.language:undefined,onKeyDown:keyboard,children:[h('div',{'aria-hidden':picker?'true':undefined,children:screen==='setup'?setupUI:screen==='directory'?h(PlaybackDirectory,{words:sessionWords,currentIndex:state.displayIndex,description:directoryDescription,getContent,meaningRevision,close:closeLayer,choose:chooseDirectoryWord}):playerUI}),pickerUI,editingWord&&h(MeaningEditor,{...editingWord,close:closeMeaningEditor,requestCloseRef:editorCloseRef},editingWord.word.id)]});
    }
    return {Page};
  }
  host.CijianContinuous=Object.freeze({create,selectCoreMeaning,guardEditorBack,createCardPresenter});
})(window);
