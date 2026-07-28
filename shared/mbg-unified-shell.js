(function(){
  "use strict";

  function addStylesheet(){
    if(document.querySelector('link[data-fenix-workspace-shell]')) return;
    var link=document.createElement('link');
    link.rel='stylesheet';
    link.href='shared/mbg-unified-shell.css';
    link.dataset.fenixWorkspaceShell='true';
    document.head.appendChild(link);
  }

  function findSection(id, fallbackClass){
    return document.getElementById(id) || document.querySelector(fallbackClass || '');
  }

  function scrollToSection(id){
    var section=findSection(id);
    if(!section) return;
    if(section.tagName==='DETAILS') section.open=true;
    var top=section.getBoundingClientRect().top+window.pageYOffset-120;
    window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
  }

  function makeLink(label,targetId,lane){
    var link=document.createElement('a');
    link.href='#'+targetId;
    link.className='fenix-workspace-link';
    link.dataset.targetId=targetId;
    link.dataset.lane=lane;
    link.textContent=label;
    link.addEventListener('click',function(event){
      event.preventDefault();
      scrollToSection(targetId);
      if(history && history.replaceState) history.replaceState(null,'','#'+targetId);
    });
    return link;
  }

  function markSection(section,lane,label){
    if(!section) return;
    section.dataset.fenixWorkspace=lane;
    if(section.querySelector(':scope > .fenix-workspace-section-label')) return;
    var badge=document.createElement('span');
    badge.className='fenix-workspace-section-label';
    badge.textContent=label;
    section.insertBefore(badge,section.firstChild);
  }

  function buildLane(config){
    var lane=document.createElement('section');
    lane.className='fenix-workspace-lane fenix-workspace-lane--'+config.key;
    lane.id='workspace-'+config.key;

    var head=document.createElement('div');
    head.className='fenix-workspace-lane-head';
    var copy=document.createElement('div');
    var kicker=document.createElement('p');
    kicker.className='fenix-workspace-lane-kicker';
    kicker.textContent=config.kicker;
    var title=document.createElement('h2');
    title.textContent=config.title;
    var description=document.createElement('p');
    description.textContent=config.description;
    copy.append(kicker,title,description);

    var badge=document.createElement('span');
    badge.className='fenix-workspace-lane-badge';
    badge.textContent=config.badge;
    head.append(copy,badge);

    var links=document.createElement('div');
    links.className='fenix-workspace-links';
    config.links.forEach(function(item){
      if(findSection(item.id)) links.appendChild(makeLink(item.label,item.id,config.key));
    });

    lane.append(head,links);
    return lane;
  }

  function buildShell(){
    if(document.querySelector('.fenix-workspace-shell')) return;
    var header=document.querySelector('body > header');
    if(!header) return;

    var shell=document.createElement('section');
    shell.className='fenix-workspace-shell';
    shell.setAttribute('aria-label','Nawigacja projektu Fenix');

    var topbar=document.createElement('div');
    topbar.className='fenix-workspace-topbar';
    var brand=document.createElement('div');
    brand.className='fenix-workspace-brand';
    brand.innerHTML='<span class="fenix-workspace-brand-mark">F</span><div><strong>FENIX Activity Book Studio</strong><span>Jeden projekt • dwa główne obszary pracy • wszystkie funkcje zachowane</span></div>';

    var actions=document.createElement('nav');
    actions.className='fenix-workspace-actions';
    actions.setAttribute('aria-label','Główna nawigacja Feniksa');
    actions.innerHTML='<a class="fenix-workspace-action is-home" href="index.html">⌂ Centrum Feniksa</a><a class="fenix-workspace-action" href="#workspace-mbg">MBG</a><a class="fenix-workspace-action" href="#workspace-builder">Book Builder</a>';
    actions.querySelectorAll('a[href^="#workspace-"]').forEach(function(link){
      link.addEventListener('click',function(event){
        event.preventDefault();
        var target=document.querySelector(link.getAttribute('href'));
        if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
      });
    });
    topbar.append(brand,actions);

    var map=document.createElement('div');
    map.className='fenix-workspace-map';
    map.append(
      buildLane({
        key:'mbg',kicker:'GENERATOR STRON',title:'MBG — Maze Book Generator',badge:'MODUŁ MBG',
        description:'Tworzenie labiryntów, ustawienia trudności, maski, assety, dekoracje, podgląd i rozwiązania.',
        links:[
          {label:'Ustawienia labiryntu',id:'workflow-maze'},
          {label:'Assety i maski',id:'workflow-assets'},
          {label:'Podgląd stron',id:'workflow-preview'}
        ]
      }),
      buildLane({
        key:'builder',kicker:'SKŁADANIE KSIĄŻKI',title:'Book Builder',badge:'GŁÓWNY SKŁADACZ',
        description:'Koszyk Feniksa, teksty książki, dodatkowe strony, kolejność, projekt i finalny eksport PDF.',
        links:[
          {label:'Projekt i teksty',id:'workflow-setup'},
          {label:'Strony i Koszyk',id:'workflow-pages'},
          {label:'Eksport książki',id:'workflow-output'}
        ]
      })
    );

    shell.append(topbar,map);
    header.insertAdjacentElement('afterend',shell);

    markSection(findSection('workflow-maze'),'mbg','MBG');
    markSection(findSection('workflow-assets'),'mbg','MBG');
    markSection(findSection('workflow-preview'),'mbg','MBG');
    markSection(findSection('workflow-setup'),'builder','BOOK BUILDER');
    markSection(findSection('workflow-pages'),'builder','BOOK BUILDER');
    markSection(findSection('workflow-output'),'builder','BOOK BUILDER');

    var hash=(location.hash||'').replace('#','');
    if(hash==='workspace-mbg' || hash==='workspace-builder'){
      window.setTimeout(function(){
        var target=document.getElementById(hash);
        if(target) target.scrollIntoView({block:'start'});
      },80);
    }
  }

  addStylesheet();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',buildShell);
  else buildShell();
})();
