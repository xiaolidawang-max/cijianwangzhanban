(function(host){
  'use strict';
  const KEY='wordspace.continuous.v1';
  const WORD_GAP_SECONDS=Object.freeze({min:0,max:3});
  const PICTURE_SIZE=Object.freeze({min:80,max:120,step:5});
  const DEFAULTS=Object.freeze({startId:'',endId:'',repeats:1,gapSeconds:.2,speed:1,englishVolume:100,readEnglish:true,chineseSpeed:1.1,chineseVolume:80,readChinese:true,chineseFirst:false,autoAdvance:true,showEnglish:true,showChinese:true,pictureSize:105,selectionMode:'chapter',chapterId:'',chapterIds:Object.freeze([])});
  function selectedChapterIds(value){
    const ids=Array.isArray(value?.chapterIds)?value.chapterIds:[value?.chapterId];
    return [...new Set(ids.filter(id=>typeof id==='string'&&id.length>0))];
  }
  function volumePercent(value,fallback){
    return Number.isFinite(value)&&value>=0&&value<=200?Math.round(value):fallback;
  }

  function normalize(value){
    const v=value&&typeof value==='object'?value:{};
    return {
      startId:typeof v.startId==='string'?v.startId:'',
      endId:typeof v.endId==='string'?v.endId:'',
      repeats:Number.isInteger(v.repeats)&&v.repeats>=1&&v.repeats<=3?v.repeats:1,
      gapSeconds:typeof v.gapSeconds==='number'&&Number.isFinite(v.gapSeconds)&&v.gapSeconds>=WORD_GAP_SECONDS.min&&v.gapSeconds<=WORD_GAP_SECONDS.max?v.gapSeconds:DEFAULTS.gapSeconds,
      speed:typeof v.speed==='number'&&Number.isFinite(v.speed)&&v.speed>=.5&&v.speed<=3?v.speed:DEFAULTS.speed,
      englishVolume:volumePercent(v.englishVolume,DEFAULTS.englishVolume),
      chineseVolume:volumePercent(v.chineseVolume,DEFAULTS.chineseVolume),
      readEnglish:typeof v.readEnglish==='boolean'?v.readEnglish:DEFAULTS.readEnglish,
      chineseSpeed:typeof v.chineseSpeed==='number'&&Number.isFinite(v.chineseSpeed)&&v.chineseSpeed>=.5&&v.chineseSpeed<=3?v.chineseSpeed:DEFAULTS.chineseSpeed,
      readChinese:typeof v.readChinese==='boolean'?v.readChinese:DEFAULTS.readChinese,
      chineseFirst:typeof v.chineseFirst==='boolean'?v.chineseFirst:DEFAULTS.chineseFirst,
      autoAdvance:typeof v.autoAdvance==='boolean'?v.autoAdvance:true,
      showEnglish:typeof v.showEnglish==='boolean'?v.showEnglish:DEFAULTS.showEnglish,
      showChinese:typeof v.showChinese==='boolean'?v.showChinese:DEFAULTS.showChinese,
      pictureSize:Number.isFinite(v.pictureSize)
        ?Math.max(PICTURE_SIZE.min,Math.min(PICTURE_SIZE.max,Math.round(v.pictureSize/PICTURE_SIZE.step)*PICTURE_SIZE.step))
        :DEFAULTS.pictureSize,
      selectionMode:v.selectionMode==='chapter'||v.selectionMode==='custom'?v.selectionMode:'',
      chapterId:typeof v.chapterId==='string'?v.chapterId:'',
      chapterIds:selectedChapterIds(v)
    };
  }
  function activeWords(words){return Array.isArray(words)?words.filter(w=>w&&typeof w.id==='string'&&!w.archived):[]}
  function resolveRange(words,startId,endId){
    const active=activeWords(words);
    const start=active.findIndex(w=>w.id===startId),end=active.findIndex(w=>w.id===endId);
    if(start<0||end<0)throw new Error('请选择有效的起始单词和结束单词。');
    if(end<start)throw new Error('结束单词不能排在起始单词之前。');
    return active.slice(start,end+1);
  }
  function resolveChapter(words,chapterId){
    const chapter=activeWords(words).filter(w=>w.chapter===chapterId);
    if(!chapter.length)throw new Error('请选择有效的播放章节。');
    return chapter;
  }
  function selectChapter(settings,words,chapterId){
    return selectChapters(settings,words,[chapterId]);
  }
  function resolveChapters(words,chapterIds){
    const ids=selectedChapterIds({chapterIds}),active=activeWords(words);
    const order=[...new Set(active.map(word=>word.chapter))].filter(id=>ids.includes(id));
    if(order.length!==ids.length)throw new Error('请选择有效的播放章节。');
    return order.flatMap(id=>active.filter(word=>word.chapter===id));
  }
  function selectChapters(settings,words,chapterIds){
    const range=resolveChapters(words,chapterIds),ids=[...new Set(range.map(word=>word.chapter))];
    return {...normalize(settings),selectionMode:'chapter',chapterId:ids[0]||'',chapterIds:ids,startId:range[0]?.id||'',endId:range[range.length-1]?.id||''};
  }
  function resolveSelection(words,settings){
    return settings?.selectionMode==='chapter'?resolveChapters(words,selectedChapterIds(settings)):resolveRange(words,settings?.startId,settings?.endId);
  }
  function loadSettings(storage,words,currentWordId){
    const active=activeWords(words),current=active.find(w=>w.id===currentWordId)||active[0];
    const chapter=current?active.filter(w=>w.chapter===current.chapter):[];
    const fallback={...DEFAULTS,startId:chapter[0]?.id||'',endId:chapter[chapter.length-1]?.id||'',chapterId:current?.chapter||'',chapterIds:current?[current.chapter]:[]};
    let settings=fallback;
    try{
      const target=storage===undefined?host.localStorage:storage;
      const saved=JSON.parse(target?.getItem(KEY)||'null');
      if(saved&&(saved.version===1||saved.version===2)){
        const gapSeconds=saved.version===1?DEFAULTS.gapSeconds:saved.gapSeconds;
        settings=normalize({...saved,gapSeconds});
      }
    }catch(_){}
    if(active.length){
      if(settings.selectionMode==='chapter'){
        const requested=selectedChapterIds(settings),available=new Set(active.map(word=>word.chapter));
        const ids=requested.filter(id=>available.has(id));
        // Preserve an explicitly empty selection; drop retired chapters while
        // retaining the remaining choices. Legacy single-chapter saves migrate here.
        if(ids.length||!requested.length)return selectChapters(settings,active,ids);
        return selectChapter(settings,active,fallback.chapterId);
      }
      let range;
      try{range=resolveRange(active,settings.startId,settings.endId)}
      catch(_){return selectChapter(settings,active,fallback.chapterId)}
      // Old version-1 records did not store a selection mode. Recognize only
      // a complete chapter, keeping every other saved range custom and intact.
      if(settings.selectionMode!=='custom'){
        const fullChapter=active.filter(w=>w.chapter===range[0].chapter);
        const isWholeChapter=range.length===fullChapter.length&&range.every((word,i)=>word.id===fullChapter[i].id);
        settings={...settings,selectionMode:isWholeChapter?'chapter':'custom',chapterId:isWholeChapter?range[0].chapter:'',chapterIds:isWholeChapter?[range[0].chapter]:[]};
      }
    }
    return {...settings};
  }
  function saveSettings(settings,storage){
    const normalized=normalize(settings);
    try{
      const target=storage===undefined?host.localStorage:storage;
      if(!target||typeof target.setItem!=='function')throw new Error('Storage unavailable');
      target.setItem(KEY,JSON.stringify({version:2,...normalized}));
    }catch(_){throw new Error('无法保存连播设置，请检查设备存储后重试。')}
    return {...normalized};
  }

  function exportSettings(storage=host.localStorage){
    const raw=storage.getItem(KEY);
    if(raw===null)return null;
    try{
      const saved=JSON.parse(raw);
      if(saved?.version!==1&&saved?.version!==2)return undefined;
      const gapSeconds=saved.version===1?DEFAULTS.gapSeconds:saved.gapSeconds;
      return {version:2,...normalize({...saved,gapSeconds})};
    }catch(_){return undefined}
  }

  function validateSettingsBackup(saved){
    if(saved===null)return null;
    const invalid=()=>new Error('备份中的简洁模式播放设置无效。');
    if(!saved||typeof saved!=='object'||Array.isArray(saved)||saved.version!==2)throw invalid();
    const settings=normalize(saved);
    for(const [key,value] of Object.entries(settings)){
      const original=saved[key];
      const equal=Array.isArray(value)
        ? Array.isArray(original)&&original.length===value.length&&value.every((item,index)=>item===original[index])
        : value===original;
      if(!equal)throw invalid();
    }
    return {version:2,...settings};
  }

  function createPlayer(env){
    const e=env||{};
    const createAudio=e.createAudio||((url)=>new host.Audio(url));
    const schedule=e.setTimeout||((fn,delay)=>host.setTimeout(fn,delay));
    const cancel=e.clearTimeout||((id)=>host.clearTimeout(id));
    const now=e.now||(()=>host.performance?.now()??Date.now());
    let context=null,gain=null,sourceNode=null;
    function prepareBoost(){
      if(!context){
        const AudioContext=host.AudioContext||host.webkitAudioContext;
        context=new AudioContext();
      }
      if(!gain){
        gain=context.createGain();
        gain.connect(context.destination);
      }
      // Resume inside the play gesture, before images or Chinese audio are loaded.
      if(context.state!=='running')return context.resume();
    }
    function applyVolume(audio,percent){
      const level=percent/100;
      if(!e.sharedAudio && percent<=100 && sourceNode?.mediaElement!==audio){
        audio.volume=level;
        return;
      }
      if(sourceNode?.mediaElement!==audio){
        sourceNode=context.createMediaElementSource(audio);
        sourceNode.connect(gain);
      }
      gain.gain.value=level;
      audio.volume=1;
    }
    let words=[],options=normalize(),current=null,retained=null,timer=null,preparation=null,generation=0,playbackAttempt=0,destroyed=false;
    let state={status:'idle',index:0,displayIndex:0,repetition:0,language:'english',error:'',chineseUnavailable:false};
    function snapshot(){return {...state}}
    function notify(patch){
      const changedCard=patch.displayIndex!==undefined&&patch.displayIndex!==state.displayIndex;
      state={...state,...(changedCard?{chineseUnavailable:false}:{}),...patch};
      if(!destroyed&&typeof e.onState==='function')e.onState(snapshot());
      return snapshot();
    }
    function detachAudio(audio){
      audio.onplaying=null;audio.onended=null;audio.onerror=null;
    }
    function disposeAudio(audio){
      detachAudio(audio);
      try{audio.pause()}catch(_){}
      if(sourceNode?.mediaElement===audio && audio!==e.sharedAudio){
        sourceNode.disconnect();
        sourceNode=null;
      }
      try{audio.removeAttribute?.('src')}catch(_){}
      try{audio.load?.()}catch(_){}
    }
    function cancelPending(){
      generation++;
      if(preparation){
        const controller=preparation;preparation=null;
        controller.abort();
      }
      if(timer!==null){const task=timer;timer=null;task.pending=false;cancel(task.id)}
      if(current){
        const audio=current;current=null;disposeAudio(audio);
      }
      if(retained){const entry=retained;retained=null;disposeAudio(entry.audio)}
    }
    function valid(ticket,audio){return !destroyed&&ticket===generation&&(!audio||audio===current)}
    function fail(ticket,audio,message){
      if(!valid(ticket,audio))return;
      cancelPending();
      notify({status:'error',error:message||'读音未能播放，请重试或切换到下一个单词。'});
    }
    function later(ticket,delay,fn){
      if(!valid(ticket))return;
      if(timer!==null){const old=timer;timer=null;old.pending=false;cancel(old.id)}
      const task={id:null,pending:true};timer=task;
      task.id=schedule(()=>{
        if(!task.pending||timer!==task||!valid(ticket))return;
        task.pending=false;timer=null;fn();
      },delay);
    }
    function read(ticket,repeatEnglish=false){
      if(!valid(ticket))return;
      const index=state.index,word=words[index];
      if(!word){fail(ticket,null,'播放范围内没有可播放的单词。');return}
      if(options.readEnglish&&!word.audioUrl){fail(ticket,null,'这个单词暂无读音，可以切换到下一个单词。');return}
      if(typeof e.beforePlay!=='function'&&typeof e.present!=='function'){
        notify({displayIndex:index,...(repeatEnglish?{}:{chineseUnavailable:false})});
        startWordAudio(ticket,word,index,repeatEnglish);return;
      }
      const Abort=e.AbortController||host.AbortController;
      const controller=typeof Abort==='function'?new Abort():{signal:{aborted:false},abort(){this.signal.aborted=true}};
      preparation=controller;
      notify({status:'preparing',error:''});
      const pending=()=>valid(ticket)&&preparation===controller&&!controller.signal.aborted;
      if(!pending())return;
      function failed(){
        if(!pending())return;
        preparation=null;
        fail(ticket,null,'词卡未能准备好，请重试或切换到下一个单词。');
      }
      function start(){
        if(!pending())return;
        preparation=null;startWordAudio(ticket,word,index,repeatEnglish);
      }
      function present(){
        if(!pending())return;
        // Preparation stays offscreen. Only after it finishes may the next
        // complete card replace the old one; audio waits for the UI's commit.
        notify({displayIndex:index,...(repeatEnglish?{}:{chineseUnavailable:false})});
        if(!pending())return;
        try{
          if(typeof e.present==='function')Promise.resolve(e.present({...word},index,{signal:controller.signal})).then(start,failed);
          else start();
        }catch(_){failed()}
      }
      try{
        if(typeof e.beforePlay==='function')Promise.resolve(e.beforePlay({...word},index,{signal:controller.signal})).then(present,failed);
        else present();
      }catch(_){failed()}
    }
    function finishWord(ticket){
      if(!valid(ticket))return;
      if(state.index===words.length-1)notify({status:'completed'});
      else if(!options.autoAdvance)notify({status:'paused'});
      else{
        notify({status:'waiting'});
        later(ticket,options.gapSeconds*1000,()=>{
          notify({index:state.index+1,repetition:1,language:'english'});read(ticket);
        });
      }
    }
    function wantsChinese(word){return options.readChinese&&typeof e.getChineseAudio==='function'&&(!e.hasChinese||e.hasChinese(word))}
    function startWordAudio(ticket,word,index,repeatEnglish=false){
      if(!valid(ticket))return;
      if(repeatEnglish)startAudio(ticket,word,index);
      else if(options.chineseFirst&&wantsChinese(word))readChinese(ticket,word,index,0);
      else if(options.readEnglish)startAudio(ticket,word,index);
      else if(wantsChinese(word))readChinese(ticket,word,index,0);
      else{notify({language:'silent'});finishWord(ticket)}
    }
    function finishChinese(ticket,word,index,delay=300){
      if(!valid(ticket))return;
      if(options.chineseFirst&&options.readEnglish){
        notify({status:'waiting'});
        later(ticket,delay,()=>startAudio(ticket,word,index));
      }else finishWord(ticket);
    }
    function skipChinese(ticket,word,index){
      if(!valid(ticket))return;
      notify({chineseUnavailable:true,language:'silent'});
      finishChinese(ticket,word,index,0);
    }
    function readChinese(ticket,word,index,delay=300){
      if(!valid(ticket))return;
      const startsAt=now()+delay;
      const Abort=e.AbortController||host.AbortController;
      const controller=typeof Abort==='function'?new Abort():{signal:{aborted:false},abort(){this.signal.aborted=true}};
      preparation=controller;
      notify({status:'preparing',language:'chinese'});
      const pending=()=>valid(ticket)&&preparation===controller&&!controller.signal.aborted;
      Promise.resolve().then(()=>pending()?e.getChineseAudio({...word},{signal:controller.signal}):null).then(url=>{
        if(!pending())return;
        preparation=null;
        if(!url){skipChinese(ticket,word,index);return}
        const remaining=startsAt-now();
        if(remaining<=0){startAudio(ticket,word,index,'chinese',url);return}
        notify({status:'waiting'});
        later(ticket,remaining,()=>startAudio(ticket,word,index,'chinese',url));
      },()=>{
        if(!pending())return;
        preparation=null;
        skipChinese(ticket,word,index);
      });
    }
    function startAudio(ticket,word,index,language='english',url){
      if(!valid(ticket))return;
      let audio,started=false,finished=false;
      const attempt=++playbackAttempt;
      const active=()=>attempt===playbackAttempt&&valid(ticket,audio);
      // A late callback from an earlier replay must not pause the same element
      // after it has already started a newer replay.
      function silence(){if(audio!==current||attempt===playbackAttempt){try{audio?.pause()}catch(_){}}}
      function failed(){
        if(finished||!active())return;
        finished=true;
        if(language==='english'){fail(ticket,audio);return}
        if(audio){current=null;disposeAudio(audio)}
        skipChinese(ticket,word,index);
      }
      try{
        const source=url||(e.getEnglishAudio?.(word)||word.audioUrl);
        if(retained?.url===source){
          audio=retained.audio;retained=null;current=audio;
          audio.currentTime=0;
        }else{
          if(retained){const entry=retained;retained=null;disposeAudio(entry.audio)}
          audio=createAudio(source);current=audio;audio.preload='auto';
        }
        applyVolume(audio,language==='chinese'?options.chineseVolume:options.englishVolume);
        audio.preservesPitch=true;audio.playbackRate=language==='chinese'?options.chineseSpeed:options.speed;
        audio.onplaying=()=>{
          if(!active()){silence();return}
          if(started)return;
          started=true;
          notify({status:'playing',error:''});
        };
        audio.onended=()=>{
          if(finished||!active())return;
          finished=true;current=null;detachAudio(audio);
          // Keep the loaded clip across repeats and avoid resetting the media
          // pipeline inside its ended callback. Only one finished clip is held.
          retained={audio,url:source};
          if(language==='english'&&state.repetition<options.repeats){
            notify({status:'waiting'});
            later(ticket,300,()=>{notify({repetition:state.repetition+1});read(ticket,true)});
          }else if(language==='english'&&!options.chineseFirst&&wantsChinese(word))readChinese(ticket,word,index);
          else if(language==='chinese')finishChinese(ticket,word,index);
          else finishWord(ticket);
        };
        audio.onerror=failed;
        notify({status:'buffering',language,error:''});
        if(!valid(ticket,audio))return;
        Promise.resolve(audio.play()).then(()=>{
          // Some media implementations finish an earlier play request after a
          // pause. Silence it again as well as refusing its stale state update.
          if(!active())silence();
        },failed);
      }catch(_){failed()}
    }
    function play(){
      if(destroyed||['preparing','buffering','playing','waiting'].includes(state.status))return snapshot();
      cancelPending();
      // Completed ranges only restart when explicitly requested by the user.
      if(state.status==='completed')notify({index:0});
      notify({repetition:1,language:'english',error:''});
      const ticket=generation;
      if(e.preparePlayback || (options.readEnglish&&options.englishVolume>100) || (options.readChinese&&options.chineseVolume>100&&words.some(wantsChinese))){
        const failed=()=>fail(ticket,null,e.preparePlayback?'未能启动播放，请重新点击播放。':'无法启动音量增强，请重新点击播放或将音量调至 100%。');
        try{
          const pending=Promise.all([e.preparePlayback?.(),prepareBoost()]);
          if(pending){
            notify({status:'preparing'});
            pending.then(()=>read(ticket),failed);
            return snapshot();
          }
        }catch(_){failed();return snapshot()}
      }
      read(ticket);
      return snapshot();
    }
    function pause(){
      if(destroyed||!['preparing','buffering','playing','waiting'].includes(state.status))return snapshot();
      cancelPending();
      return notify({status:'paused',index:state.displayIndex});
    }
    function move(delta){
      if(destroyed)return snapshot();
      const target=state.index+delta;
      if(target<0||target>=words.length)return snapshot();
      const running=['preparing','buffering','playing','waiting'].includes(state.status);
      cancelPending();
      notify({status:'paused',index:target,...(running?{}:{displayIndex:target}),repetition:0,error:''});
      if(running)play();
      return snapshot();
    }
    function seek(index){
      if(destroyed||!Number.isInteger(index)||index<0||index>=words.length)return snapshot();
      cancelPending();
      return notify({status:'paused',index,displayIndex:index,repetition:0,error:'',chineseUnavailable:false});
    }
    function stop(){
      if(destroyed)return snapshot();
      cancelPending();
      return notify({status:'idle',index:state.displayIndex,repetition:0,error:'',chineseUnavailable:false});
    }
    function configure(list,settings){
      if(destroyed)return snapshot();
      cancelPending();
      words=activeWords(list).map(w=>({...w}));
      options=normalize(settings);
      return notify({status:'idle',index:0,displayIndex:0,repetition:0,error:'',chineseUnavailable:false});
    }
    function restart(){
      if(destroyed)return snapshot();
      cancelPending();
      notify({status:'idle',index:0,displayIndex:0,repetition:0,error:'',chineseUnavailable:false});
      return play();
    }
    function destroy(){
      if(destroyed)return;
      cancelPending();destroyed=true;
      sourceNode?.disconnect();
      gain?.disconnect();
      if(context && context.state!=='closed')context.close().catch(()=>{});
      state={...state,status:'idle',index:state.displayIndex,repetition:0,error:'',chineseUnavailable:false};
    }
    return Object.freeze({configure,play,pause,seek,next:()=>move(1),previous:()=>move(-1),restart,stop,destroy,getState:snapshot});
  }
  function createNavigation(env){
    const e=env||{},history=e.history||host.history;
    const subscribe=e.subscribe||(listener=>{host.addEventListener('popstate',listener);return()=>host.removeEventListener('popstate',listener)});
    const overlays=['start','end','speed','chapter'];
    let pending=false,destroyed=false;
    function read(state){
      const saved=state?.cijianContinuous;
      const screen=['player','directory'].includes(saved?.screen)?saved.screen:'setup';
      return {screen,overlay:screen==='setup'&&overlays.includes(saved?.overlay)?saved.overlay:null};
    }
    let view=read(history.state);
    function snapshot(){return {...view}}
    function apply(state,source){
      if(destroyed)return;
      pending=false;
      if(state?.cijianPage?.page!=='continuous'){e.onLeave?.();return}
      view=read(state);
      e.onChange?.(snapshot(),source);
    }
    const unsubscribe=subscribe(event=>apply(event.state,'pop'));
    function open(screen,overlay=null){
      if(destroyed||pending||(view.screen===screen&&view.overlay===overlay))return false;
      const next={screen,overlay};
      history.pushState({...history.state,cijianPage:{page:'continuous',basePage:'continuous'},cijianContinuous:next,cijianSettings:false,cijianDirectory:false},'');
      view=next;e.onChange?.(snapshot(),'push');
      return true;
    }
    function back(){
      if(destroyed||pending)return false;
      pending=true;
      if(view.screen!=='setup'||view.overlay)history.back();
      else e.onExit?.();
      return true;
    }
    function destroy(){if(destroyed)return;destroyed=true;unsubscribe?.()}
    return Object.freeze({showPlayer:()=>open('player'),showDirectory:()=>view.screen==='player'?open('directory'):false,showOverlay:kind=>overlays.includes(kind)?open('setup',kind):false,back,sync:()=>apply(history.state,'sync'),getState:snapshot,destroy});
  }
  host.CijianContinuousCore=Object.freeze({KEY,DEFAULTS,WORD_GAP_SECONDS,PICTURE_SIZE,loadSettings,saveSettings,exportSettings,validateSettingsBackup,resolveRange,resolveChapter,selectChapter,resolveChapters,selectChapters,selectedChapterIds,resolveSelection,createPlayer,createNavigation});
})(typeof window!=='undefined'?window:globalThis);
