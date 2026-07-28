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

  function getView(){
    var params=new URLSearchParams(window.location.search);
    if(params.get('view')==='builder') return 'builder';
    if(params.get('view')==='mbg') return 'mbg';
    return window.location.pathname.toLowerCase().indexOf('book-builder')>=0?'builder':'mbg';
  }

  var groups={
    mbg:['workflow-maze','workflow-assets','workflow-preview','workflow-export'],
    builder:['workflow-setup','workflow-pages','workflow-output']
  };

  function setModuleVisibility(view){
    var allowed=groups[view]||groups.mbg;
    document.documentElement.dataset.fenixModule=view;
    document.body.classList.add('fenix-module-page','fenix-module-page--'+view);
    document.querySelectorAll('.workflow-group').forEach(function(section){
      section.hidden=allowed.indexOf(section.id)===-1;
      section.open=false;
      if(!section.hidden){
        section.classList.add('fenix-module-tile');
        section.dataset.moduleView=view;
      }
    });
    var toolbar=document.querySelector('.workflow-toolbar');
    if(toolbar) toolbar.hidden=true;
    document.querySelectorAll('.hero-badges').forEach(function(node){node.hidden=true;});
  }

  function buildShell(view){
    if(document.querySelector('.fenix-module-shell')) return;
    var header=document.querySelector('body > header');
    if(!header) return;

    var isMbg=view==='mbg';
    var shell=document.createElement('section');
    shell.className='fenix-module-shell fenix-module-shell--'+view;
    shell.innerHTML='\
      <div class="fenix-module-shell-top">\
        <div class="fenix-module-shell-brand">\
          <span class="fenix-module-shell-mark">F</span>\
          <div><span class="fenix-module-shell-kicker">FENIX ACTIVITY BOOK STUDIO</span><h1>'+(isMbg?'MBG — Maze Book Generator':'Book Builder')+'</h1><p>'+(isMbg?'Tworzenie labiryntów, masek, assetów, dekoracji i rozwiązań.':'Składanie całej książki z Koszyka Feniksa, stron dodatkowych i materiałów z innych modułów.')+'</p></div>\
        </div>\
        <div class="fenix-module-shell-actions">\
          <a href="index.html">⌂ Centrum Feniksa</a>\
          <a class="'+(isMbg?'is-active':'')+'" href="mbg.html?view=mbg">MBG</a>\
          <a class="'+(!isMbg?'is-active':'')+'" href="book-builder.html">Book Builder</a>\
          <span id="fenixModuleThemeMount"></span>\
        </div>\
      </div>\
      <div class="fenix-module-shell-intro">\
        <strong>Wybierz kafelek roboczy</strong>\
        <span>Kliknięcie otwiera pełny, istniejący panel. Żadna funkcja generatora ani Book Buildera nie została usunięta.</span>\
      </div>';

    header.insertAdjacentElement('afterend',shell);
    if(window.FenixTheme){
      var mount=shell.querySelector('#fenixModuleThemeMount');
      if(mount) mount.appendChild(window.FenixTheme.createControl());
    }

    var oldTitle=header.querySelector('h1');
    if(oldTitle) oldTitle.textContent=isMbg?'MBG — Maze Book Generator':'Book Builder';
    var oldDesc=header.querySelector('p');
    if(oldDesc) oldDesc.textContent=isMbg?'Generator stron labiryntowych dla Feniksa.':'Składacz książek KDP korzystający z Koszyka Feniksa i wszystkich modułów.';
  }

  function enhanceTiles(view){
    var labels={
      'workflow-maze':['01','Labirynty','Trudność, siatka, ścieżka i liczba stron'],
      'workflow-assets':['02','Assety, maski i dekoracje','START, CEL, checkpointy, maski oraz oprawa'],
      'workflow-preview':['03','Podgląd i rozwiązania','Kontrola stron, rozwiązań i wyglądu'],
      'workflow-export':['04','Eksport i Koszyk Feniksa','Dodawanie labiryntów oraz rozwiązań do Book Buildera lub eksport PDF'],
      'workflow-setup':['01','Projekt i teksty książki','Ustawienia projektu, intro, instrukcje i zapis'],
      'workflow-pages':['02','Strony i Koszyk Feniksa','Materiały ze wszystkich modułów i strony dodatkowe'],
      'workflow-output':['03','Podgląd książki i eksport PDF','Kolejność stron, kontrola i finalny plik KDP']
    };

    (groups[view]||[]).forEach(function(id){
      var section=document.getElementById(id);
      if(!section) return;
      var summary=section.querySelector(':scope > summary');
      if(!summary) return;
      var info=labels[id];
      summary.classList.add('fenix-module-tile-summary');
      summary.innerHTML='<span class="fenix-module-tile-number">'+info[0]+'</span><span class="fenix-module-tile-copy"><strong>'+info[1]+'</strong><small>'+info[2]+'</small></span><span class="fenix-module-tile-action">Otwórz →</span>';
      section.addEventListener('toggle',function(){
        section.classList.toggle('is-open',section.open);
        var action=summary.querySelector('.fenix-module-tile-action');
        if(action) action.textContent=section.open?'Zwiń ↑':'Otwórz →';
        if(section.open){
          (groups[view]||[]).forEach(function(otherId){
            var other=document.getElementById(otherId);
            if(other&&other!==section) other.open=false;
          });
        }
      });
    });
  }

  function init(){
    var view=getView();
    setModuleVisibility(view);
    buildShell(view);
    enhanceTiles(view);
  }

  addStylesheet('shared/mbg-unified-shell.css','workspace');
  loadTheme().then(function(){
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
    else init();
  });
})();