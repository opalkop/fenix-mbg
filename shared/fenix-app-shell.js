(function(){
  'use strict';
  var frame,home,workspace,title,subtitle,openExternal;
  function syncTheme(){
    if(!frame||!frame.contentWindow)return;
    try{
      var doc=frame.contentDocument;
      if(doc&&document.documentElement.dataset.fenixTheme){
        doc.documentElement.dataset.fenixTheme=document.documentElement.dataset.fenixTheme;
      }
    }catch(error){}
  }
  function openModule(url,label,description){
    if(!frame)return;
    frame.src=url;
    title.textContent=label||'Moduł Feniksa';
    subtitle.textContent=description||'';
    openExternal.href=url;
    home.hidden=true;
    workspace.hidden=false;
    document.body.classList.add('fenix-workspace-open');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function showHome(){
    if(frame)frame.src='about:blank';
    workspace.hidden=true;
    home.hidden=false;
    document.body.classList.remove('fenix-workspace-open');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function init(){
    frame=document.getElementById('fenixWorkspaceFrame');
    home=document.getElementById('fenixHomeView');
    workspace=document.getElementById('fenixWorkspaceView');
    title=document.getElementById('fenixWorkspaceTitle');
    subtitle=document.getElementById('fenixWorkspaceSubtitle');
    openExternal=document.getElementById('fenixWorkspaceExternal');
    document.querySelectorAll('[data-fenix-module]').forEach(function(tile){
      tile.addEventListener('click',function(event){
        event.preventDefault();
        openModule(tile.getAttribute('href'),tile.dataset.label,tile.dataset.description);
        document.querySelectorAll('[data-fenix-module]').forEach(function(item){item.classList.toggle('is-active',item===tile);});
      });
    });
    document.querySelectorAll('[data-fenix-home]').forEach(function(button){button.addEventListener('click',showHome);});
    if(frame)frame.addEventListener('load',syncTheme);
    new MutationObserver(syncTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-fenix-theme']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.FenixAppShell={openModule:openModule,showHome:showHome};
})();