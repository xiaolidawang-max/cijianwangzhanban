(function(host){
  'use strict';
  const VERSION='yunyang-lufs20-v1';
  const normalizeText=value=>typeof value==='string'?value.normalize('NFC').trim().replace(/\s+/g,' '):'';
  // Parentheses are display punctuation; keep their contents in continuous speech.
  const speechText=value=>normalizeText(normalizeText(value).replace(/[()（）]/g,''));
  function create(env={}){
    const manifest=env.manifest||host.CijianChineseAudioManifest||{};
    const fetcher=env.fetch||host.fetch?.bind(host);
    const chapters=new Set(manifest.chapters||[]);
    const bundled=new Map((manifest.clips||[]).map(clip=>[speechText(clip.text),clip.url]));
    const memory=new Map(),inflight=new Map(),warming=new Set(),controllers=new Set();
    let dbPromise,destroyed=false;
    // Installed/offline builds use their bundled clips and saved custom clips.
    // A hosted deployment may supply its own HTTPS endpoint in this config.
    const endpoint=env.endpoint!==undefined?env.endpoint:(host.CijianChineseAudioConfig?.endpoint??
      (['127.0.0.1','localhost'].includes(host.location?.hostname)?'http://127.0.0.1:8783/api/chinese-audio':''));
    function database(){
      if(!dbPromise)dbPromise=new Promise(resolve=>{
        if(!host.indexedDB){resolve(null);return}
        try{
          const request=host.indexedDB.open('cijian-chinese-audio',1);
          request.onupgradeneeded=()=>request.result.createObjectStore('clips');
          request.onsuccess=()=>resolve(request.result);
          request.onerror=()=>resolve(null);request.onblocked=()=>resolve(null);
        }catch(_){resolve(null)}
      });
      return dbPromise;
    }
    async function cached(text){
      const db=await database();if(!db)return null;
      return new Promise(resolve=>{
        try{
          const request=db.transaction('clips').objectStore('clips').get(VERSION+'\n'+text);
          request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>resolve(null);
        }catch(_){resolve(null)}
      });
    }
    async function remember(text,blob){
      const db=await database();if(!db)return;
      await new Promise(resolve=>{
        try{
          const tx=db.transaction('clips','readwrite');tx.objectStore('clips').put(blob,VERSION+'\n'+text);
          tx.oncomplete=resolve;tx.onerror=resolve;tx.onabort=resolve;
        }catch(_){resolve()}
      });
    }
    function hasChinese(word){return chapters.has(word?.chapter)}
    function englishUrl(word){return manifest.english?.[word.id]||word.audioUrl}
    function prepare(word,value){
      if(destroyed)return Promise.reject(new Error('Chinese audio session closed'));
      if(!hasChinese(word))return Promise.resolve(null);
      const text=speechText(value);
      if(!text)return Promise.reject(new Error('当前中文释义为空，请先补充释义。'));
      if(bundled.has(text))return Promise.resolve(bundled.get(text));
      if(memory.has(text))return Promise.resolve(memory.get(text));
      if(inflight.has(text))return inflight.get(text);
      const pending=(async()=>{
        let blob=await cached(text);
        if(!blob){
          if(!endpoint||!fetcher)throw new Error('这条释义的云扬音频尚未生成，请联网生成后重试，或暂时关闭中文朗读。');
          if(destroyed)throw new Error('Chinese audio session closed');
          const controller=new host.AbortController(),timeout=host.setTimeout(()=>controller.abort(),60000);
          controllers.add(controller);
          try{
            const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({wordId:word.id,text,voice:'zh-CN-YunyangNeural'}),signal:controller.signal});
            if(!response.ok)throw new Error('Generation failed');
            blob=await response.blob();
            if(blob.size<1000||!blob.type.startsWith('audio/'))throw new Error('Invalid audio');
          }catch(_){throw new Error('新释义的中文音频暂未生成，请检查网络后重试，或暂时关闭中文朗读。')}
          finally{host.clearTimeout(timeout);controllers.delete(controller)}
          await remember(text,blob);
        }
        if(destroyed)throw new Error('Chinese audio session closed');
        const url=host.URL.createObjectURL(blob);memory.set(text,url);return url;
      })();
      inflight.set(text,pending);
      pending.finally(()=>inflight.delete(text)).catch(()=>{});
      return pending;
    }
    function warm(words,index,getText){
      if(destroyed)return;
      for(const word of words.slice(index,index+4)){
        if(!hasChinese(word))continue;
        const text=speechText(getText(word));
        if(warming.has(text))continue;
        warming.add(text);
        prepare(word,text).then(async url=>{
          if(url&&!url.startsWith('blob:')&&fetcher){const response=await fetcher(url,{cache:'force-cache'});if(!response.ok)throw Error('Preload failed');await response.arrayBuffer()}
        }).catch(()=>warming.delete(text));
      }
    }
    function destroy(){
      destroyed=true;
      for(const controller of controllers)controller.abort();controllers.clear();
      for(const url of memory.values())host.URL.revokeObjectURL?.(url);
      memory.clear();warming.clear();dbPromise?.then(db=>db?.close());
    }
    return Object.freeze({hasChinese,englishUrl,prepare,warm,destroy});
  }
  host.CijianChineseAudio=Object.freeze({create,normalizeText,speechText});
})(typeof window!=='undefined'?window:globalThis);
