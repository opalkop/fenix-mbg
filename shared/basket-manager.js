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
    "maze-studio":"mbg.html?view=mbg#workflow-maze"
  };

  function $(id){return document.getElementById(id);}
  function editable(page){return !!(page&&page.editorState&&sourceMap[page.sourceModule]);}
  function label(page){return page.sourceLabel||page.sourceModule||"Inny moduł";}
  function date(value){var d=new Date(value||0);return isNaN(d.getTime())?"brak daty":d.toLocaleString("pl-PL");}
  function imageUrl(page){
    if(page.dataUrl)return page.dataUrl;
    if(page.blob)return URL.createObjectURL(page.blob);
    return "";
  }
  function save(page){return window.FenixBasket.putPage(page).then(load);}
  function swap(pages,index,dir){
    var next=index+dir;if(next<0||next>=pages.length)return;
    var a=pages[index],b=pages[next],ao=a.order,bo=b.order;
    a.order=Number.isFinite(Number(bo))?Number(bo):next+1;
    b.order=Number.isFinite(Number(ao))?Number(ao):index+1;
    return Promise.all([window.FenixBasket.putPage(a),window.FenixBasket.putPage(b)]).then(load);
  }
  function openPreview(page){
    var url=imageUrl(page);if(!url)return;
    $("basketPreviewImage").src=url;
    $("basketPreview").showModal();
  }
  function openEditor(page){
    var base=sourceMap[page.sourceModule];if(!base)return;
    var separator=base.indexOf("?")>=0?"&":"?";
    window.location.href=base+separator+"basketPageId="+encodeURIComponent(page.id);
  }
  function openPdfGenerator(){
    var included=Number($("basketIncluded").textContent||0);
    if(!included){
      alert("Koszyk nie zawiera żadnej strony włączonej do książki. Zaznacz przynajmniej jedną stronę przed generowaniem PDF.");
      return;
    }
    window.location.href="mbg.html?view=builder#workflow-output";
  }

  function card(page,index,pages){
    var item=document.createElement("article");item.className="basket-card"+(page.includeInBook===false?" is-disabled":"");
    var thumb=document.createElement("button");thumb.type="button";thumb.className="basket-thumb";
    var img=document.createElement("img");img.src=imageUrl(page);img.alt=page.title||page.fileName||"Strona";thumb.appendChild(img);thumb.addEventListener("click",function(){openPreview(page);});

    var body=document.createElement("div");body.className="basket-card-body";
    var top=document.createElement("div");top.className="basket-card-top";
    var title=document.createElement("input");title.value=page.title||page.fileName||"Strona Feniksa";title.setAttribute("aria-label","Nazwa strony");
    var badge=document.createElement("span");badge.className="basket-badge";badge.textContent=editable(page)?"Do poprawy w module":"Gotowy PNG";
    top.append(title,badge);
    var meta=document.createElement("div");meta.className="basket-meta";meta.innerHTML="<span><b>Źródło:</b> "+label(page)+"</span><span><b>Typ:</b> "+(page.pageType||"brak")+"</span><span><b>Dodano:</b> "+date(page.createdAt)+"</span><span><b>Pozycja:</b> "+(index+1)+"</span>";
    var controls=document.createElement("div");controls.className="basket-controls";
    var include=document.createElement("label");include.className="basket-include";
    var check=document.createElement("input");check.type="checkbox";check.checked=page.includeInBook!==false;
    check.addEventListener("change",function(){page.includeInBook=check.checked;save(page);});
    include.append(check,document.createTextNode(" Uwzględnij w książce"));

    var saveName=document.createElement("button");saveName.type="button";saveName.textContent="Zapisz nazwę";saveName.addEventListener("click",function(){page.title=title.value.trim()||page.fileName||"Strona Feniksa";save(page);});
    var preview=document.createElement("button");preview.type="button";preview.textContent="Podgląd";preview.addEventListener("click",function(){openPreview(page);});
    var up=document.createElement("button");up.type="button";up.textContent="↑ Wyżej";up.disabled=index===0;up.addEventListener("click",function(){swap(pages,index,-1);});
    var down=document.createElement("button");down.type="button";down.textContent="↓ Niżej";down.disabled=index===pages.length-1;down.addEventListener("click",function(){swap(pages,index,1);});
    controls.append(include,saveName,preview,up,down);
    if(editable(page)){
      var edit=document.createElement("button");edit.type="button";edit.className="edit";edit.textContent="Popraw w module";edit.addEventListener("click",function(){openEditor(page);});controls.appendChild(edit);
    }
    var remove=document.createElement("button");remove.type="button";remove.className="danger";remove.textContent="Usuń z koszyka";remove.addEventListener("click",function(){if(confirm("Usunąć tę stronę z Koszyka Feniksa?"))window.FenixBasket.deletePage(page.id).then(load);});controls.appendChild(remove);
    body.append(top,meta,controls);item.append(thumb,body);return item;
  }

  function render(pages){
    var includedCount=pages.filter(function(p){return p.includeInBook!==false;}).length;
    $("basketTotal").textContent=pages.length;
    $("basketIncluded").textContent=includedCount;
    $("basketEditable").textContent=pages.filter(editable).length;
    $("basketEmpty").hidden=pages.length>0;
    $("basketExportStatus").textContent=pages.length?includedCount+" z "+pages.length+" stron zostanie przekazanych do generatora PDF.":"Koszyk jest pusty — dodaj strony przed generowaniem PDF.";
    $("basketGeneratePdf").disabled=includedCount===0;
    var list=$("basketList");list.replaceChildren();
    pages.forEach(function(page,index){list.appendChild(card(page,index,pages));});
  }
  function load(){return window.FenixBasket.getAllPages().then(render).catch(function(err){console.error(err);alert("Nie udało się odczytać Koszyka Feniksa.");});}

  document.addEventListener("DOMContentLoaded",function(){
    $("basketRefresh").addEventListener("click",load);
    $("basketClear").addEventListener("click",function(){if(confirm("Wyczyścić cały Koszyk Feniksa?"))window.FenixBasket.clearPages().then(load);});
    $("basketGeneratePdf").addEventListener("click",openPdfGenerator);
    $("basketPreviewClose").addEventListener("click",function(){$("basketPreview").close();});
    load();
  });
})();