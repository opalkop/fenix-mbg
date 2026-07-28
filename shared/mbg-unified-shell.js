(function(){
  "use strict";

  var configs={
    mbg:{
      key:'mbg',title:'MBG — Maze Book Generator',kicker:'GENERATOR LABIRYNTÓW',badge:'MODUŁ MBG',
      description:'Tworzenie labiryntów, masek, assetów, dekoracji, rozwiązań i gotowych stron.',
      links:[
        {icon:'⌘',label:'Ustawienia labiryntu',description:'Trudność, siatka, liczba labiryntów i logika ścieżki',id:'workflow-maze'},
        {icon:'◇',label:'Assety, maski i dekoracje',description:'START, CEL, checkpointy, maski i oprawa stron',id:'workflow-assets'},
        {icon:'◉',label:'Podgląd i rozwiązania',description:'Kontrola wyglądu stron oraz rozwiązań',id:'workflow-preview'}
      ]
    },
    builder:{
      key:'builder',title:'Book Builder',kicker:'SKŁADANIE KSIĄŻKI',badge:'GŁÓWNY SKŁADACZ',
      description:'Projekt, teksty, Koszyk Feniksa, dodatkowe strony, kolejność i finalny PDF.',
      links:[
        {icon:'▤',label:'Projekt i teksty',description:'Dane książki, ustawienia, intro i instrukcje',id:'workflow-setup'},
        {icon:'▦',label:'Strony i Koszyk Feniksa',description:'Materiały z modułów, dodatki i kolejność stron',id:'workflow-pages'},
        {icon:'⇩',label:'Eksport książki',description:'Podgląd całości, ustawienia i finalny PDF',id:'workflow-output'}
      ]
    }
  };

  function addStylesheet(href,key){
    if(document.querySelector('link[data-fenix-style="'+key+'"]'))return;
    var link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset.fenixStyle=key;document.head.appendChild(link);
  }
  function loadTheme(){
    addStylesheet('shared/fenix-theme.css','theme');
    if(window.FenixTheme)return Promise.resolve(window.FenixTheme);
    return new Promise(function(resolve){var script=document.createElement('script');script.src='shared/fenix-theme.js';script.async=false;script.onload=function(){resolve(window.FenixTheme||null);};script.onerror=function(){resolve(null);};document.head.appendChild(script);});
  }
  function findSection(id){return document.getElementById(id);}
  function requestedMode(){
    var params=new URLSearchParams(location.search);
    var mode=params.get('view');
    if(mode==='builder'||mode==='mbg')return mode;
    if(location.hash.indexOf('builder')!==-1)return 'builder';
    return 'mbg';
  }
  function updateUrl(mode,sectionId){
    if(!history||!history.replaceState)return;
    var url='mbg.html?view='+mode+(sectionId?'#'+sectionId:'');
    history.replaceState(null,'',url);
  }
  function markSections(){
    ['workflow-maze','workflow-assets','workflow-preview'].forEach(function(id){var node=findSection(id);if(node)node.dataset.fenixWorkspace='mbg';});
    ['workflow-setup','workflow-pages','workflow-output'].forEach(function(id){var node=findSection(id);if(node)node.dataset.fenixWorkspace='builder';});
  }
  function showSection(mode,id){
    document.body.dataset.fenixModule=mode;
    document.querySelectorAll('.workflow-group[data-fenix-workspace]').forEach(function(node){
      var active=node.id===id&&node.dataset.fenixWorkspace===mode;
      node.classList.toggle('fenix-panel-active',active);
      if(active&&node.tagName==='DETAILS')node.open=true;
    });
    document.querySelectorAll('.fenix-workspace-tile').forEach(function(tile){tile.classList.toggle('is-active',tile.dataset.target===id);});
    if(id){window.setTimeout(function(){var section=findSection(id);if(section)section.scrollIntoView({behavior:'smooth',block:'start'});},40);}
    updateUrl(mode,id);
  }
  function makeTile(item,mode){
    var button=document.createElement('button');button.type='button';button.className='fenix-workspace-tile';button.dataset.target=item.id;
    button.innerHTML='<span class="fenix-workspace-tile-icon">'+item.icon+'</span><span><strong>'+item.label+'</strong><small>'+item.description+'</small></span><span class="fenix-workspace-tile-arrow">→</span>';
    button.addEventListener('click',function(){showSection(mode,item.id);});
    return button;
  }
  function makeModuleSwitch(mode){
    var other=mode==='mbg'?'builder':'mbg';
    var wrap=document.createElement('div');wrap.className='fenix-module-switch';
    wrap.innerHTML='<a class="fenix-module-switch-card is-current" href="mbg.html?view='+mode+'"><span>'+configs[mode].kicker+'</span><strong>'+configs[mode].title+'</strong><small>Aktualny moduł</small></a><a class="fenix-module-switch-card" href="'+(other==='builder'?'book-builder.html':'mbg.html?view=mbg')+'"><span>'+configs[other].kicker+'</span><strong>'+configs[other].title+'</strong><small>Przejdź do modułu</small></a>';
    return wrap;
  }
  function buildDashboard(mode){
    var config=configs[mode];
    var lane=document.createElement('section');lane.className='fenix-workspace-lane fenix-workspace-lane--'+mode;
    lane.innerHTML='<div class="fenix-workspace-lane-head"><div><p class="fenix-workspace-lane-kicker">'+config.kicker+'</p><h2>'+config.title+'</h2><p>'+config.description+'</p></div><span class="fenix-workspace-lane-badge">'+config.badge+'</span></div>';
    var tiles=document.createElement('div');tiles.className='fenix-workspace-tiles';config.links.forEach(function(item){if(findSection(item.id))tiles.appendChild(makeTile(item,mode));});lane.appendChild(tiles);return lane;
  }
  function buildShell(){
    if(document.querySelector('.fenix-workspace-shell'))return;
    var header=document.querySelector('body > header');if(!header)return;
    markSections();
    var mode=requestedMode();document.body.dataset.fenixModule=mode;
    var shell=document.createElement('section');shell.className='fenix-workspace-shell';shell.setAttribute('aria-label','Kafelkowy pulpit modułu Fenix');
    var topbar=document.createElement('div');topbar.className='fenix-workspace-topbar';
    var brand=document.createElement('div');brand.className='fenix-workspace-brand';brand.innerHTML='<span class="fenix-workspace-brand-mark">F</span><div><strong>FENIX Activity Book Studio</strong><span>Każdy moduł ma własny pulpit • silnik i funkcje pozostają wspólne</span></div>';
    var right=document.createElement('div');right.className='fenix-workspace-topbar-right';
    right.innerHTML='<a class="fenix-workspace-action is-home" href="index.html">⌂ Centrum Feniksa</a>';
    if(window.FenixTheme)right.append(window.FenixTheme.createControl());
    topbar.append(brand,right);
    var intro=document.createElement('div');intro.className='fenix-workspace-intro';intro.innerHTML='<span class="fenix-workspace-eyebrow">PULPIT MODUŁU</span><h2>'+configs[mode].title+'</h2><p>Wybierz kafelek etapu pracy. Otworzy się dokładnie ten sam dopracowany panel i ta sama logika, które działały wcześniej.</p>';
    shell.append(topbar,makeModuleSwitch(mode),intro,buildDashboard(mode));header.insertAdjacentElement('afterend',shell);

    var hash=(location.hash||'').replace('#','');
    var allowed=configs[mode].links.some(function(item){return item.id===hash;});
    if(allowed)showSection(mode,hash);
  }
  addStylesheet('shared/mbg-unified-shell.css','workspace');
  loadTheme().then(function(){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',buildShell,{once:true});else buildShell();});
})();