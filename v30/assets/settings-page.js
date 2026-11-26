(function(host){
  'use strict';
  function create(React,jsx){
    const {jsx:h,jsxs:hs}=jsx;
    const {useEffect,useRef}=React;
    function Page({title='学习设置',children,close,variant='settings'}){
      const titleRef=useRef(null);
      useEffect(function(){titleRef.current?.focus({preventScroll:true})},[]);
      useEffect(function(){
        function onKey(event){
          if(event.key!=='Escape'||event.defaultPrevented||document.querySelector('dialog[open]')||event.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
          event.preventDefault();
          close();
        }
        window.addEventListener('keydown',onKey);
        return function(){window.removeEventListener('keydown',onKey)};
      },[close]);
      return hs('div',{className:'stp-page collection-settings'+(variant==='data'?' stp-data-page':''),children:[
        host.CijianContinuous.siteNav(jsx,variant==='data'?'library':'study'),
        hs('main',{className:'stp-layout','aria-labelledby':'stp-page-title',children:[
          hs('header',{className:'stp-header collection-heading',children:[
            h('button',{type:'button',className:'stp-back','aria-label':'返回上一页',title:'返回上一页',onClick:close,children:h('svg',{width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,focusable:'false',children:h('path',{d:'m14.5 5-7 7 7 7'})})}),
            h('h1',{className:'stp-title',id:'stp-page-title',ref:titleRef,tabIndex:-1,children:title})
          ]}),
          h('div',{className:'stp-content',children})
        ]})
      ]});
    }
    return {Page};
  }
  host.CijianSettings=Object.freeze({create});
})(window);
