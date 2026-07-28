(function(){
  "use strict";

  function addStylesheet(href,key){
    if(document.querySelector('link[data-fenix-style="'+key+'"]')) return;
    var link=document.createElement('link');
    link.rel='stylesheet';link.href=href;link.dataset.fenixStyle=key;
    document.head.appendChild(link);
  }
  function loadTheme(){
    addStylesheet('shared/fenix-theme.css','theme');
    if(window.FenixTheme) return Promise.resolve(window.FenixTheme);
    return new Promise(function(resolve){
      var script=document.createElement('script');
      script.src='shared/fenix-theme.js';script.async=false;
      script.onload=function(){resolve(window.FenixTheme||null);};
      script.onerror=function(){resolve(null);};
      document.head.appendChild(script);
    });
  }
  function findSection(id){return document.getElementById(id);}
  function scrollToSection(id){
    var section=findSection(id);if(!section)return;
    if(section.tagName==='DETAILS') section.open=true;
    section.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function makeTile(item,lane){
    var link=document.createElement('a');
    link.href='#'+item.id;link.className='fenix-workspace-tile';link.dataset.lane=lane;
    link.innerHTML='<span class="fenix-workspace-tile-icon">'+item.icon+'</span><span><strong>'+item.label+'</strong><small>'+item.description+'</small></span><span class="fenix-workspace-tile-arrow">→</span>';
    link.addEventListener('click',function(event){event.preventDefault();scrollToSection(item.id);if(history&&history.replaceState)history.replaceState(null,'','#'+item.id);});
    return link;
  }
  function markSection(section,lane,label){
    if(!section)return;section.dataset.fenixWorkspace=lane;
    if(section.querySelector(':scope > .fenix-workspace-section-label'))return;
    var badge=document.createElement('span');badge.className='fenix-workspace-section-label';badge.textContent=label;section.insertBefore(badge,section.firstChild);
  }
  function buildLane(config){
    var lane=document.createElement('section');lane.className='fenix-workspace-lane fenix-workspace-lane--'+config.key;lane.id='workspace-'+config.key;
    var head=document.createElement('div');head.className='fenix-workspace-lane-head';
    head.innerHTML='<div><p class="fenix-workspace-lane-kicker">'+config.kicker+'</p><h2>'+config.title+'</h2><p>'+config.description+'</p></div><span class="fenix-workspace-lane-badge">'+config.badge+'</span>';
    var tiles=document.createElement('div');tiles.className='fenix-workspace-tiles';
    config.links.forEach(function(item){if(findSection(item.id))tiles.appendChild(makeTile(item,config.key));});
    lane.append(head,tiles);return lane;
  }
  function buildShell(){
    if(document.querySelector('.fenix-workspace-shell'))return;
    var header=document.querySelector('body > header');if(!header)return;
    var shell=document.createElement('section');shell.className='fenix-workspace-shell';shell.setAttribute('aria-label','Kafelkowy pulpit projektu Fenix');
    var topbar=document.createElement('div');topbar.className='fenix-workspace-topbar';
    var brand=document.createElement('div');brand.className='fenix-workspace-brand';brand.innerHTML='<span class="fenix-workspace-brand-mark">F</span><div><strong>FENIX Activity Book Studio</strong><span>Jeden projekt • wszystkie funkcje zachowane • kafelkowa organizacja pracy</span></div>';
    var right=document.createElement('div');right.className='fenix-workspace-topbar-right';
    var actions=document.createElement('nav');actions.className='fenix-workspace-actions';actions.innerHTML='<a class="fenix-workspace-action is-home" href="index.html">⌂ Centrum</a><a class="fenix-workspace-action" href="#workspace-mbg">MBG</a><a class="fenix-workspace-action" href="#workspace-builder">Book Builder</a>';
    actions.querySelectorAll('a[href^="#workspace-"]').forEach(function(link){link.addEventListener('click',function(event){event.preventDefault();var target=document.querySelector(link.getAttribute('href'));if(target)target.scrollIntoView({behavior:'smooth',block:'start'});});});
    right.append(actions);if(window.FenixTheme)right.append(window.FenixTheme.createControl());
    topbar.append(brand,right);
    var intro=document.createElement('div');intro.className='fenix-workspace-intro';intro.innerHTML='<div><span class="fenix-workspace-eyebrow">PULPIT ROBOCZY</span><h2>Wybierz obszar i przejdź bezpośrednio do właściwego etapu</h2><p>Nie usunięto żadnej funkcji. Kafelki są wyłącznie nową warstwą nawigacji nad istniejącą logiką MBG i Book Buildera.</p></div>';
    var map=document.createElement('div');map.className='fenix-workspace-map';
    map.append(
      buildLane({key:'mbg',kicker:'GENERATOR STRON',title:'MBG — Maze Book Generator',badge:'MODUŁ MBG',description:'Tworzenie labiryntów, masek, assetów, dekoracji, rozwiązań i gotowych stron.',links:[
        {icon:'⌘',label:'Ustawienia labiryntu',description:'Trudność, siatka i logika ścieżki',id:'workflow-maze'},
        {icon:'◇',label:'Assety, maski i dekoracje',description:'START, CEL, checkpointy i oprawa',id:'workflow-assets'},
        {icon:'◉',label:'Podgląd stron',description:'Kontrola wyglądu i rozwiązań',id:'workflow-preview'}]}),
      buildLane({key:'builder',kicker:'SKŁADANIE KSIĄŻKI',title:'Book Builder',badge:'GŁÓWNY SKŁADACZ',description:'Projekt, teksty, Koszyk Feniksa, dodatkowe strony, kolejność i finalny PDF.',links:[
        {icon:'▤',label:'Projekt i teksty',description:'Dane książki, intro i instrukcje',id:'workflow-setup'},
        {icon:'▦',label:'Strony i Koszyk',description:'Materiały z wszystkich modułów',id:'workflow-pages'},
        {icon:'⇩',label:'Eksport książki',description:'Podgląd, kolejność i finalny PDF',id:'workflow-output'}]})
    );
    shell.append(topbar,intro,map);header.insertAdjacentElement('afterend',shell);
    markSection(findSection('workflow-maze'),'mbg','MBG');markSection(findSection('workflow-assets'),'mbg','MBG');markSection(findSection('workflow-preview'),'mbg','MBG');
    markSection(findSection('workflow-setup'),'builder','BOOK BUILDER');markSection(findSection('workflow-pages'),'builder','BOOK BUILDER');markSection(findSection('workflow-output'),'builder','BOOK BUILDER');
  }
  addStylesheet('shared/mbg-unified-shell.css','workspace');
  loadTheme().then(function(){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',buildShell,{once:true});else buildShell();});
})();
