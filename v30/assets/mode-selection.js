(function(host){
  'use strict';
  function create(React,jsx){
    const {jsx:h,jsxs:hs}=jsx;
    function Arrow({back=false}){
      return h('svg',{width:back?20:25,height:back?20:25,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,children:h('path',{d:back?'m14 6-6 6 6 6':'M4 12h16m-6-6 6 6-6 6'})});
    }
    function ModeOption({simple=false,onClick}){
      const name=simple?'单词连播':'逐词学习';
      const detail=simple?'选择章节，按顺序听中英文朗读。':'逐个查看词卡、释义和例句，记下自己的笔记。';
      const detailId=simple?'mode-simple-detail':'mode-study-detail';
      return hs('button',{type:'button',className:'mode-option'+(simple?' mode-option-simple':' mode-option-study'),'aria-label':'进入'+name,'aria-describedby':detailId,onClick,children:[
        h('span',{className:'mode-symbol','aria-hidden':true,children:h('svg',{width:24,height:24,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.65,strokeLinecap:'round',strokeLinejoin:'round',children:h('path',{d:simple?'M8 5l11 7-11 7V5ZM3 7v10':'M12 6v14m0-14C9 4 6 4 3 5v14c3-1 6-1 9 1m0-14c3-2 6-2 9-1v14c-3-1-6-1-9 1'})})}),
        hs('span',{className:'mode-option-copy',children:[
          h('span',{className:'mode-option-title',children:name}),
          h('span',{className:'mode-option-detail',id:detailId,children:detail})
        ]}),
        h('span',{className:'mode-option-arrow',children:h(Arrow,{})})
      ]});
    }
    function Page({title,onBack,onStudy,onSimple}){
      return hs('div',{className:'mode-page collection-modes',children:[
        host.CijianContinuous.siteNav(jsx,'library'),
        hs('main',{className:'mode-main',children:[
          hs('header',{className:'collection-heading mode-heading',children:[
            hs('button',{type:'button',className:'collection-action mode-return',onClick:onBack,children:[h(Arrow,{back:true}),'我的词书']}),
            title&&h('p',{children:title}),
            h('h1',{children:'选择学习方式'})
          ]}),
          hs('nav',{className:'mode-options','aria-label':'选择学习方式',children:[
            h(ModeOption,{onClick:onStudy}),
            h(ModeOption,{simple:true,onClick:onSimple})
          ]})
        ]})
      ]});
    }
    return {Page};
  }
  host.CijianModes=Object.freeze({create});
})(window);
