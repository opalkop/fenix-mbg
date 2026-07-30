(function(){
  "use strict";

  const VERSION="2026.07.30-3";
  let attempts=0;

  function install(){
    attempts+=1;
    if(typeof window.buildBookPagePlan!=="function"){
      if(attempts<100)setTimeout(install,50);
      return;
    }
    if(window.buildBookPagePlan.__fenixWordSearchOrderPatched)return;

    const original=window.buildBookPagePlan;
    const patched=function(settings){
      const plan=original(settings)||[];
      const mazeSolutions=[];
      const moduleSolutions=[];
      const remaining=[];

      plan.forEach(function(page){
        if(page&&page.type==="solution")mazeSolutions.push(page);
        else if(page&&page.type==="fenix_basket_page"&&(page.bookSection==="solutions"||page.isSolution===true))moduleSolutions.push(page);
        else remaining.push(page);
      });

      if(!mazeSolutions.length&&!moduleSolutions.length)return plan;

      let insertAt=remaining.findIndex(function(page){
        return page&&["congrats","qr","certificate","blank"].includes(page.type);
      });
      if(insertAt<0)insertAt=remaining.length;
      remaining.splice.apply(remaining,[insertAt,0].concat(mazeSolutions,moduleSolutions));
      return remaining;
    };

    patched.__fenixWordSearchOrderPatched=true;
    window.buildBookPagePlan=patched;

    const host=document.querySelector(".hero-badges")||document.querySelector("header");
    if(host&&!document.getElementById("wordSearchOrderFixBadge")){
      const badge=document.createElement("span");
      badge.id="wordSearchOrderFixBadge";
      badge.className="mbg-fix-version-badge";
      badge.textContent="WORD SEARCH 1:1 "+VERSION;
      host.appendChild(badge);
    }

    if(typeof window.updateMbgOptionUi==="function")window.updateMbgOptionUi();
    console.info("FENIX Word Search solution order active:",VERSION);
  }

  install();
})();
