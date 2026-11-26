(function(host){
  'use strict';
  function create(React,jsx){
    const {jsx:h,jsxs:hs}=jsx;
    const {useState,useRef,useEffect,useId}=React;
    function DisplayMenu({english,chinese,image,onChange}){
      const [open,setOpen]=useState(false),root=useRef(null),trigger=useRef(null),panelId=useId();
      useEffect(()=>{
        if(!open)return;
        const outside=event=>{if(!root.current?.contains(event.target))setOpen(false)};
        const escape=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus()}};
        document.addEventListener('pointerdown',outside);
        document.addEventListener('keydown',escape,true);
        return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true)};
      },[open]);
      return hs('div',{className:'st-display-menu',ref:root,onBlur:event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget))setOpen(false)},children:[
        hs('button',{type:'button',className:'st-display-trigger',ref:trigger,'aria-label':'显示选项','aria-expanded':open,'aria-controls':panelId,onClick:()=>setOpen(value=>!value),children:[
          h('span',{children:'显示'}),h('svg',{width:13,height:13,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,children:h('path',{d:'m6 9 6 6 6-6'})})
        ]}),
        open&&hs('div',{className:'st-display-popover',id:panelId,role:'group','aria-label':'显示内容',children:[
          h('p',{children:'显示内容'}),
          ...[['english','英文',english],['chinese','中文',chinese],['imageVisible','图片',image]].map(([key,label,checked])=>hs('button',{type:'button',className:'st-display-option',role:'switch','aria-label':'显示'+label,'aria-checked':checked,onClick:()=>onChange({[key]:!checked}),children:[h('span',{children:label}),h('span',{className:'st-display-switch','aria-hidden':true,children:h('i',{})})]},key))
        ]})
      ]});
    }
    return {DisplayMenu};
  }
  host.CijianStudyTools=Object.freeze({create});
})(window);
