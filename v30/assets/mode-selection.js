(function(host){
  'use strict';
  function create(React,jsx){
    const {jsx:h,jsxs:hs}=jsx;
    function Arrow({back=false}){
      return h('svg',{width:back?20:25,height:back?20:25,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,children:h('path',{d:back?'m14 6-6 6 6 6':'M4 12h16m-6-6 6 6-6 6'})});
    }
    function ModeOption({simple=false,onClick}){
      const name=simple?'简洁模式':'学习模式';
      const details=simple?['看图听音','自动连播']:['释义','例句','笔记'];
      const detailId=simple?'mode-simple-detail':'mode-study-detail';
      return hs('button',{type:'button',className:'mode-option'+(simple?' mode-option-simple':' mode-option-study'),'aria-label':'进入'+name,'aria-describedby':detailId,onClick,children:[
        hs('span',{className:'mode-option-copy',children:[
          h('span',{className:'mode-option-title',children:name}),
          h('span',{className:'mode-option-detail',id:detailId,children:details.map((text,index)=>h('span',{children:(index?' ':'')+text},text))}),
          h('span',{className:'mode-option-arrow',children:h(Arrow,{})})
        ]}),
        h('img',{className:'mode-art',src:simple?'assets/mode-entry-sea.png':'assets/mode-entry-book.png',alt:'','aria-hidden':true,draggable:false,decoding:'async'})
      ]});
    }
    function Page({onBack,onStudy,onSimple}){
      return hs('div',{className:'mode-page',children:[
        hs('header',{className:'mode-header',children:[
          h('button',{type:'button',className:'mode-back','aria-label':'返回词书首页',onClick:onBack,children:h(Arrow,{back:true})}),
          h('h1',{className:'mode-brand',children:'词间'})
        ]}),
        h('main',{className:'mode-main',children:hs('nav',{className:'mode-options','aria-label':'选择学习模式',children:[
          h(ModeOption,{onClick:onStudy}),
          h(ModeOption,{simple:true,onClick:onSimple})
        ]})})
      ]});
    }
    return {Page};
  }
  host.CijianModes=Object.freeze({create});
})(window);
