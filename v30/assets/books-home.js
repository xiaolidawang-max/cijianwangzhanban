(function(host){
  'use strict';
  function create(React,jsx){
    const {jsx:h,jsxs:hs}=jsx;
    const {useRef}=React;
    function Icon({name,size=20}){
      const paths={
        arrow:'M4 12h16m-6-6 6 6-6 6',
        data:'M3 4h18v5H3zM5 9v11h14V9M9 13h6',
        bookmark:'M6 3h12v18l-6-4-6 4V3Z',
        settings:'M10 2h4l.6 2.6 2.1 1.2 2.5-.8 2 3.5-1.9 1.8v2.4l1.9 1.8-2 3.5-2.5-.8-2.1 1.2L14 22h-4l-.6-2.6-2.1-1.2-2.5.8-2-3.5 1.9-1.8v-2.4L2.8 9.5l2-3.5 2.5.8 2.1-1.2L10 2Z'
      };
      return hs('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.65,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,focusable:'false',children:[
        h('path',{d:paths[name]||paths.arrow}),
        name==='settings'&&h('circle',{cx:12,cy:12,r:3.2})
      ]});
    }
    function Page({title,chapterCount,wordCount,hasStarted,chapter,notice,onOpenBook,onSettings}){
      const mainRef=useRef(null);
      const lastChapter=typeof chapter==='string'?chapter.trim():typeof chapter?.name==='string'?chapter.name.trim():'';
      const wordTotal=typeof wordCount==='number'?wordCount.toLocaleString('en-US'):String(wordCount??0);
      function focusBooks(){mainRef.current?.focus({preventScroll:true})}
      return hs('div',{className:'bh-page',children:[
        h('button',{type:'button',className:'bh-skip',onClick:focusBooks,children:'跳到词书列表'}),
        hs('header',{className:'bh-header',children:[
          h('h1',{className:'bh-brand',children:'词间'}),
          h('button',{type:'button',className:'bh-settings','aria-label':'数据管理',title:'数据管理',onClick:onSettings,children:hs('span',{className:'bh-data-label',children:[h(Icon,{name:'data',size:18}),h('span',{children:'数据管理'})]})})
        ]}),
        hs('main',{className:'bh-main',ref:mainRef,tabIndex:-1,children:[
          notice&&h('p',{className:'bh-notice',role:'status',children:notice}),
          h('h2',{className:'bh-section-title',id:'bh-books-title',children:'我的词书'}),
          h('section',{className:'bh-books','aria-labelledby':'bh-books-title',children:hs('button',{
            type:'button',className:'bh-card',onClick:onOpenBook,'aria-label':'打开'+title+'的模式选择','aria-describedby':'bh-book-meta bh-last-position',children:[
              hs('span',{className:'bh-card-body',children:[
                h('span',{className:'bh-cover',children:h('img',{src:'assets/books-home-cover.png',alt:'','aria-hidden':true,draggable:false,decoding:'async'})}),
                hs('span',{className:'bh-card-copy',children:[
                  h('strong',{className:'bh-book-title',children:title}),
                  hs('span',{className:'bh-book-meta',id:'bh-book-meta',children:[h('span',{children:chapterCount+'章'}),' ',h('span',{children:wordTotal+'词'})]}),
                  hs('span',{className:'bh-book-action',children:[h('span',{children:'打开词书'}),h(Icon,{name:'arrow',size:21})]})
                ]})
              ]}),
              hs('span',{className:'bh-last-position',id:'bh-last-position',children:[
                h(Icon,{name:'bookmark',size:18}),
                hasStarted?hs('span',{className:'bh-position-copy',children:lastChapter?[h('span',{children:'上次学到'}),' ',h('span',{className:'bh-last-chapter',children:lastChapter})]:[h('span',{children:'继续上次学习'})]}):h('span',{className:'bh-position-copy',children:'选择章节，开始学习'})
              ]})
            ]
          })})
        ]})
      ]});
    }
    return {Page};
  }
  host.CijianBooks=Object.freeze({create});
})(window);
