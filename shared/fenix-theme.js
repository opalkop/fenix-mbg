(function(){
  'use strict';
  var STORAGE_KEY='fenix.visual.theme';
  var THEMES=[
    {value:'system',label:'Systemowy'},
    {value:'light',label:'Jasny'},
    {value:'dark',label:'Ciemny'},
    {value:'fenix',label:'Fenix Dark'}
  ];
  function normalize(value){return THEMES.some(function(item){return item.value===value;})?value:'system';}
  function getTheme(){try{return normalize(localStorage.getItem(STORAGE_KEY)||'system');}catch(error){return 'system';}}
  function applyTheme(value){
    var theme=normalize(value);
    document.documentElement.dataset.fenixTheme=theme;
    try{localStorage.setItem(STORAGE_KEY,theme);}catch(error){}
    document.querySelectorAll('[data-fenix-theme-select]').forEach(function(select){select.value=theme;});
    window.dispatchEvent(new CustomEvent('fenix-theme-change',{detail:{theme:theme}}));
    return theme;
  }
  function createControl(){
    var wrap=document.createElement('div');
    wrap.className='fenix-theme-control';
    wrap.setAttribute('aria-label','Wybór motywu Feniksa');
    var label=document.createElement('label');
    label.textContent='Motyw';
    var select=document.createElement('select');
    select.dataset.fenixThemeSelect='true';
    select.setAttribute('aria-label','Motyw wizualny');
    THEMES.forEach(function(item){var option=document.createElement('option');option.value=item.value;option.textContent=item.label;select.appendChild(option);});
    select.value=getTheme();
    select.addEventListener('change',function(){applyTheme(select.value);});
    wrap.append(label,select);
    return wrap;
  }
  applyTheme(getTheme());
  window.FenixTheme={apply:applyTheme,get:getTheme,createControl:createControl,themes:THEMES.slice()};
})();
