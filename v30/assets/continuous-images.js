(function(host){
  'use strict';
  function create(options){
    const env=options||{},ImageClass=env.Image||host.Image;
    const schedule=env.setTimeout||((fn,ms)=>host.setTimeout(fn,ms));
    const cancel=env.clearTimeout||((id)=>host.clearTimeout(id));
    const capacity=Number.isInteger(env.maxEntries)?Math.max(3,Math.min(12,env.maxEntries)):6;
    const entries=new Map();
    let destroyed=false,currentUrl='',requestedUrl='';
    const validUrl=url=>typeof url==='string'&&url.trim()?url:'';

    function release(entry){
      entry.finish(false);
      // Drop the decoded bitmap as well as the request; the browser's ordinary
      // resource cache can still serve a later visible <img> for this URL.
      if(entry.image){try{entry.image.src=''}catch(_){}entry.image=null}
    }
    function makeRoom(){
      while(entries.size>=capacity){
        // The displayed/requested image must not lose a pending decode just
        // because neighbouring images are being prefetched.
        const candidate=[...entries.keys()].find(url=>url!==currentUrl&&url!==requestedUrl&&!entries.get(url).image?.isConnected);
        if(candidate===undefined)return false;
        const entry=entries.get(candidate);entries.delete(candidate);release(entry);
      }
      return true;
    }
    function load(url){
      url=validUrl(url);
      if(destroyed||!url||typeof ImageClass!=='function')return Promise.resolve(false);
      const previous=entries.get(url);
      if(previous){entries.delete(url);entries.set(url,previous);return previous.promise}
      if(!makeRoom())return Promise.resolve(false);
      let resolve;
      const entry={image:null,timer:null,settled:false,decoding:false,ready:false,promise:new Promise(done=>{resolve=done})};
      entry.finish=ready=>{
        if(entry.settled)return;
        entry.settled=true;
        entry.ready=!!ready;
        if(entry.timer!==null){cancel(entry.timer);entry.timer=null}
        if(entry.image){entry.image.onload=null;entry.image.onerror=null}
        resolve(ready);
      };
      entries.set(url,entry);
      function decoded(){
        if(entry.settled||entry.decoding||destroyed)return;
        const image=entry.image;
        if(!image||!image.naturalWidth||typeof image.decode!=='function'){entry.finish(false);return}
        entry.decoding=true;
        try{
          Promise.resolve(image.decode()).then(()=>entry.finish(!destroyed&&image.naturalWidth>0),()=>entry.finish(false));
        }catch(_){entry.finish(false)}
      }
      try{
        const image=new ImageClass();entry.image=image;
        image.decoding='async';
        image.onload=decoded;image.onerror=()=>entry.finish(false);
        entry.timer=schedule(()=>entry.finish(false),8000);
        image.src=url;
        if(image.complete&&image.naturalWidth>0)decoded();
      }catch(_){entry.finish(false)}
      return entry.promise;
    }
    function get(url){
      const next=validUrl(url);
      if(next)requestedUrl=next;
      return load(next);
    }
    // Prepare the upcoming image without taking the current display's pin.
    function prepare(url){return load(url)}
    function peek(url){
      if(destroyed)return null;
      const entry=entries.get(validUrl(url));
      return entry?.ready?entry.image:null;
    }
    function warm(words,index){
      if(destroyed||!Array.isArray(words)||!Number.isInteger(index)||index<0||index>=words.length)return Promise.resolve([]);
      currentUrl=validUrl(words[index]?.imageUrl);
      // Keep this bounded even for an entire book or rapid manual navigation.
      const upcoming=words.slice(index,index+3).map(word=>validUrl(word?.imageUrl));
      return Promise.all(upcoming.map(load));
    }
    function destroy(){
      if(destroyed)return;
      destroyed=true;
      for(const entry of entries.values())release(entry);
      entries.clear();currentUrl='';requestedUrl='';
    }
    return Object.freeze({get,prepare,peek,warm,destroy});
  }
  host.CijianContinuousImages=Object.freeze({create});
})(typeof window!=='undefined'?window:globalThis);
