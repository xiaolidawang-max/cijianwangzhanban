(function(host){
  'use strict';
  function create(React,jsx){
    const {jsx:h,jsxs:hs}=jsx;
    const {useState,useRef,useLayoutEffect}=React;
    function Icon({name,size=20}){
      const paths={back:'m14 6-6 6 6 6',arrow:'m9 5 7 7-7 7',list:'M8 6h12M8 12h12M8 18h12M3 6h.1M3 12h.1M3 18h.1',settings:'M10 2h4l.6 2.6 2.1 1.2 2.5-.8 2 3.5-1.9 1.8v2.4l1.9 1.8-2 3.5-2.5-.8-2.1 1.2L14 22h-4l-.6-2.6-2.1-1.2-2.5.8-2-3.5 1.9-1.8v-2.4L2.8 9.5l2-3.5 2.5.8 2.1-1.2L10 2Z'};
      return hs('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,children:[h('path',{d:paths[name]}),name==='settings'&&h('circle',{cx:12,cy:12,r:3})]});
    }
    function Page({chapters,hasStarted,chapterNumber,currentWordId,notice,onModes,onDirectory,onWord,onSettings,getMeaning}){
      const [expandedChapter,setExpandedChapter]=useState(null);
      const mainRef=useRef(null),currentRef=useRef(null),chapterRefs=useRef(new Map()),toggledRef=useRef(null);
      useLayoutEffect(()=>{
        const main=mainRef.current,row=currentRef.current;
        if(!main||!row)return;
        const box=main.getBoundingClientRect(),item=row.getBoundingClientRect();
        if(item.bottom>box.bottom||item.top<box.top)main.scrollTop+=item.top-box.top-16;
      },[chapterNumber,hasStarted]);
      useLayoutEffect(()=>{
        const main=mainRef.current,row=chapterRefs.current.get(toggledRef.current);
        if(!main||!row)return;
        main.scrollTop+=row.getBoundingClientRect().top-main.getBoundingClientRect().top;
      },[expandedChapter]);
      function toggleChapter(id){
        toggledRef.current=id;
        setExpandedChapter(open=>open===id?null:id);
      }
      return hs('div',{className:'sc-page',children:[
        hs('header',{className:'sc-header',children:[
          h('button',{type:'button',className:'sc-icon','aria-label':'返回模式选择',onClick:onModes,children:h(Icon,{name:'back'})}),
          h('h1',{children:'学习模式'}),
          h('button',{type:'button',className:'sc-icon','aria-label':'学习设置',title:'学习设置',onClick:onSettings,children:h(Icon,{name:'settings'})})
        ]}),
        hs('div',{className:'sc-toolbar',children:[
          hs('div',{className:'sc-toolbar-title',children:[h('h2',{id:'sc-directory-title',children:'章节目录'}),h('span',{children:chapters.length+' 章'})]}),
          hs('button',{type:'button',className:'sc-all-words',onClick:onDirectory,children:[h(Icon,{name:'list',size:16}),h('span',{children:'全部单词'})]})
        ]}),
        hs('main',{className:'sc-content',ref:mainRef,'aria-labelledby':'sc-directory-title',children:[
          notice&&h('p',{className:'sc-notice',role:'status',children:notice}),
          h('ol',{className:'sc-list',children:chapters.map((chapter,index)=>{
            const current=hasStarted&&index+1===chapterNumber,label='Chapter'+(index+1),expanded=expandedChapter===chapter.id;
            const panelId='sc-words-'+chapter.id,buttonId='sc-chapter-'+chapter.id;
            return hs('li',{className:'sc-entry',children:[hs('button',{
              type:'button',id:buttonId,className:'sc-chapter'+(current?' sc-current':''),ref:node=>{if(node)chapterRefs.current.set(chapter.id,node);else chapterRefs.current.delete(chapter.id);if(current)currentRef.current=node},disabled:!chapter.count,
              'aria-current':current?'true':undefined,'aria-label':label+'，'+chapter.count+' 词','aria-expanded':expanded,'aria-controls':panelId,onClick:()=>toggleChapter(chapter.id),children:[
                h('strong',{children:label}),current&&h('span',{className:'sc-position',children:'上次学到'}),
                h('span',{className:'sc-count',children:chapter.count+' 词'}),h(Icon,{name:'arrow',size:15})
              ]
            }),h('div',{id:panelId,hidden:!expanded,children:expanded&&h('ol',{className:'sc-words','aria-label':label+'单词目录',children:(chapter.words||[]).map((word,wordIndex)=>{
              const active=hasStarted&&word.id===currentWordId;
              return h('li',{children:hs('button',{type:'button',className:'sc-word'+(active?' sc-word-current':''),'aria-current':active?'true':undefined,'aria-label':'学习第 '+(wordIndex+1)+' 词 '+word.word,onClick:()=>onWord(word.id),children:[
                h('span',{className:'sc-word-number','aria-hidden':true,children:wordIndex+1}),
                hs('span',{className:'sc-word-copy',children:[h('strong',{children:word.word}),h('small',{children:getMeaning?getMeaning(word):word.meaningZh})]}),
                active?h('span',{className:'sc-word-badge',children:'当前'}):h(Icon,{name:'arrow',size:14})
              ]})},word.id);
            })})})]},chapter.id);
          })})
        ]})
      ]});
    }
    return {Page};
  }
  host.CijianStudyChapters=Object.freeze({create});
})(window);
