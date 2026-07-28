(function(){
  "use strict";

  var sourceMap={
    "complete-picture":"modules/complete-picture/complete-picture.html",
    "coloring-studio":"modules/coloring-studio/coloring-studio.html",
    "tracing-studio":"modules/tracing-studio/tracing-studio.html",
    "matching-studio":"modules/matching-studio/matching-studio.html",
    "alphabet-studio":"modules/alphabet-studio/alphabet-studio.html",
    "math-studio":"modules/math-studio/math-studio.html",
    "dot-to-dot-studio":"modules/dot-to-dot-studio/dot-to-dot-studio.html",
    "hidden-objects-studio":"modules/hidden-objects-studio/hidden-objects-studio.html",
    "logic-studio":"modules/logic-studio/logic-studio.html",
    "word-search-studio":"modules/word-search-studio/word-search-studio.html",
    "maze-studio":"mbg.html?view=mbg#workflow-maze"
  };

  function $(id){return document.getElementById(id);}
  function editable(page){return !!(page&&page.editorState&&sourceMap[page.sourceModule]);}
  function label(page){return page.sourceLabel||page.sourceModule||"Inny moduł";}
  function date(value){var d=new Date(value||0);return isNaN(d.getTime())?"brak daty":d.toLocaleString("pl-PL");}
  function imageUrl(page){if(page.dataUrl)return page.dataUrl;if(page.blob)return URL.createObjectURL(page.blob);return "";}
  function blobToDataUrl(blob){return new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(String(reader.result||""));};reader.onerror=function(){reject(reader.error||new Error("Nie udało się odczytać obrazu strony."));};reader.readAsDataURL(blob);});}
  function pageToDataUrl(page){if(page.dataUrl)return Promise.resolve(page.dataUrl);if(page.blob)return blobToDataUrl(page.blob);return Promise.reject(new Error("Strona nie zawiera obrazu PNG: "+(page.title||page.fileName||page.id||"bez nazwy")));}
  function cloneValue(value){if(value==null)return value;try{return structuredClone(value);}catch(_){try{return JSON.parse(JSON.stringify(value));}catch(__){return value;}}}
  function createId(prefix){if(window.crypto&&typeof window.crypto.randomUUID==="function")return window.crypto.randomUUID();return prefix+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,9);}

  function loadJsPdf(){
    if(window.jspdf&&window.jspdf.jsPDF)return Promise.resolve(window.jspdf.jsPDF);
    return new Promise(function(resolve,reject){
      var existing=document.querySelector('script[data-fenix-jspdf="true"]');
      if(existing){existing.addEventListener("load",function(){if(window.jspdf&&window.jspdf.jsPDF)resolve(window.jspdf.jsPDF);else reject(new Error("Biblioteka PDF nie została poprawnie załadowana."));},{once:true});existing.addEventListener("error",function(){reject(new Error("Nie udało się załadować biblioteki PDF."));},{once:true});return;}
      var script=document.createElement("script");script.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";script.async=true;script.dataset.fenixJspdf="true";script.onload=function(){if(window.jspdf&&window.jspdf.jsPDF)resolve(window.jspdf.jsPDF);else reject(new Error("Biblioteka PDF nie została poprawnie załadowana."));};script.onerror=function(){reject(new Error("Nie udało się załadować biblioteki PDF. Sprawdź połączenie z internetem."));};document.head.appendChild(script);
    });
  }

  function save(page){page.updatedAt=new Date().toISOString();return window.FenixBasket.putPage(page).then(load);}
  function swap(pages,index,dir){var next=index+dir;if(next<0||next>=pages.length)return;var a=pages[index],b=pages[next],ao=a.order,bo=b.order;a.order=Number.isFinite(Number(bo))?Number(bo):next+1;b.order=Number.isFinite(Number(ao))?Number(ao):index+1;return Promise.all([window.FenixBasket.putPage(a),window.FenixBasket.putPage(b)]).then(load);}
  function duplicatePage(page,pages,index){
    var now=new Date().toISOString();
    var copy=Object.assign({},page,{id:createId("fenix-basket"),title:(page.title||page.fileName||"Strona Feniksa")+" — kopia",fileName:(page.fileName||"fenix-page.png").replace(/(\.[^.]+)?$/,"-copy$1"),createdAt:now,updatedAt:now,order:Number(page.order||index+1)+0.5,editorState:cloneValue(page.editorState)});
    if(page.blob)copy.blob=page.blob.slice(0,page.blob.size,page.blob.type||"image/png");
    return window.FenixBasket.putPage(copy).then(function(){
      return window.FenixBasket.getAllPages();
    }).then(function(all){
      return Promise.all(all.map(function(item,i){item.order=i+1;return window.FenixBasket.putPage(item);}));
    }).then(load);
  }
  function openPreview(page){var url=imageUrl(page);if(!url)return;$("basketPreviewImage").src=url;$("basketPreview").showModal();}
  function openEditor(page){var base=sourceMap[page.sourceModule];if(!base)return;var separator=base.indexOf("?")>=0?"&":"?";window.location.href=base+separator+"basketPageId="+encodeURIComponent(page.id);}

  async function openPdfGenerator(){
    var button=$("basketGeneratePdf"),status=$("basketExportStatus");
    try{
      var pages=(await window.FenixBasket.getAllPages()).filter(function(page){return page.includeInBook!==false;});
      if(!pages.length){alert("Koszyk nie zawiera żadnej strony włączonej do książki. Zaznacz przynajmniej jedną stronę przed generowaniem PDF.");return;}
      button.disabled=true;button.textContent="GENERUJĘ PDF…";status.textContent="Przygotowuję "+pages.length+" stron bezpośrednio z Koszyka Feniksa…";
      var jsPDF=await loadJsPdf();var pdf=new jsPDF({orientation:"portrait",unit:"in",format:[8.5,11],compress:true});
      for(var i=0;i<pages.length;i+=1){if(i>0)pdf.addPage([8.5,11],"portrait");status.textContent="Dodaję stronę "+(i+1)+" z "+pages.length+" do PDF…";var dataUrl=await pageToDataUrl(pages[i]);pdf.addImage(dataUrl,"PNG",0,0,8.5,11,undefined,"FAST");}
      var now=new Date(),stamp=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0");pdf.save("fenix-koszyk-"+stamp+".pdf");status.textContent="Gotowe — wygenerowano PDF z "+pages.length+" stron Koszyka Feniksa.";
    }catch(error){console.error(error);status.textContent="Nie udało się wygenerować PDF: "+(error&&error.message?error.message:"nieznany błąd");alert(status.textContent);}finally{button.disabled=false;button.textContent="GENERUJ PDF Z KOSZYKA →";}
  }

  function card(page,index,pages){
    var item=document.createElement("article");item.className="basket-card"+(page.includeInBook===false?" is-disabled":"");
    var thumb=document.createElement("button");thumb.type="button";thumb.className="basket-thumb";var img=document.createElement("img");img.src=imageUrl(page);img.alt=page.title||page.fileName||"Strona";thumb.appendChild(img);thumb.addEventListener("click",function(){openPreview(page);});
    var body=document.createElement("div");body.className="basket-card-body";var top=document.createElement("div");top.className="basket-card-top";var title=document.createElement("input");title.value=page.title||page.fileName||"Strona Feniksa";title.setAttribute("aria-label","Nazwa strony");var badge=document.createElement("span");badge.className="basket-badge";badge.textContent=editable(page)?"Do poprawy w module":"Gotowy PNG";top.append(title,badge);
    var meta=document.createElement("div");meta.className="basket-meta";meta.innerHTML="<span><b>Źródło:</b> "+label(page)+"</span><span><b>Typ:</b> "+(page.pageType||"brak")+"</span><span><b>Dodano:</b> "+date(page.createdAt)+"</span><span><b>Pozycja:</b> "+(index+1)+"</span>";
    var controls=document.createElement("div");controls.className="basket-controls";var include=document.createElement("label");include.className="basket-include";var check=document.createElement("input");check.type="checkbox";check.checked=page.includeInBook!==false;check.addEventListener("change",function(){page.includeInBook=check.checked;save(page);});include.append(check,document.createTextNode(" Uwzględnij w książce"));
    var saveName=document.createElement("button");saveName.type="button";saveName.textContent="Zapisz nazwę";saveName.addEventListener("click",function(){page.title=title.value.trim()||page.fileName||"Strona Feniksa";save(page);});
    var preview=document.createElement("button");preview.type="button";preview.textContent="Podgląd";preview.addEventListener("click",function(){openPreview(page);});
    var duplicate=document.createElement("button");duplicate.type="button";duplicate.textContent="Duplikuj";duplicate.addEventListener("click",function(){duplicate.disabled=true;duplicatePage(page,pages,index).catch(function(error){console.error(error);alert("Nie udało się zduplikować strony.");duplicate.disabled=false;});});
    var up=document.createElement("button");up.type="button";up.textContent="↑ Wyżej";up.disabled=index===0;up.addEventListener("click",function(){swap(pages,index,-1);});
    var down=document.createElement("button");down.type="button";down.textContent="↓ Niżej";down.disabled=index===pages.length-1;down.addEventListener("click",function(){swap(pages,index,1);});
    controls.append(include,saveName,preview,duplicate,up,down);
    if(editable(page)){var edit=document.createElement("button");edit.type="button";edit.className="edit";edit.textContent="Edytuj w module";edit.addEventListener("click",function(){openEditor(page);});controls.appendChild(edit);}
    var remove=document.createElement("button");remove.type="button";remove.className="danger";remove.textContent="Usuń z koszyka";remove.addEventListener("click",function(){if(confirm("Usunąć tę stronę z Koszyka Feniksa?"))window.FenixBasket.deletePage(page.id).then(load);});controls.appendChild(remove);
    body.append(top,meta,controls);item.append(thumb,body);return item;
  }

  function render(pages){var includedCount=pages.filter(function(p){return p.includeInBook!==false;}).length;$("basketTotal").textContent=pages.length;$("basketIncluded").textContent=includedCount;$("basketEditable").textContent=pages.filter(editable).length;$("basketEmpty").hidden=pages.length>0;$("basketExportStatus").textContent=pages.length?includedCount+" z "+pages.length+" stron zostanie zapisanych bezpośrednio do PDF.":"Koszyk jest pusty — dodaj strony przed generowaniem PDF.";$("basketGeneratePdf").disabled=includedCount===0;var list=$("basketList");list.replaceChildren();pages.forEach(function(page,index){list.appendChild(card(page,index,pages));});}
  function load(){return window.FenixBasket.getAllPages().then(render).catch(function(err){console.error(err);alert("Nie udało się odczytać Koszyka Feniksa.");});}
  document.addEventListener("DOMContentLoaded",function(){$("basketRefresh").addEventListener("click",load);$("basketClear").addEventListener("click",function(){if(confirm("Wyczyścić cały Koszyk Feniksa?"))window.FenixBasket.clearPages().then(load);});$("basketGeneratePdf").addEventListener("click",openPdfGenerator);$("basketPreviewClose").addEventListener("click",function(){$("basketPreview").close();});load();});
})();