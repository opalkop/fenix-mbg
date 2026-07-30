(function(){
  "use strict";

  const DB_NAME="fenixBookBasketDb";
  const STORE_NAME="pages";
  const DB_VERSION=1;
  let busy=false;

  function el(id){return document.getElementById(id)}
  function sleep(ms){return new Promise(function(resolve){setTimeout(resolve,ms)})}
  function createPairId(){return "word-search-pair-"+(window.crypto&&crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(16).slice(2))}
  function openDb(){return new Promise(function(resolve,reject){const request=indexedDB.open(DB_NAME,DB_VERSION);request.onupgradeneeded=function(){const db=request.result;if(!db.objectStoreNames.contains(STORE_NAME))db.createObjectStore(STORE_NAME,{keyPath:"id"})};request.onsuccess=function(){resolve(request.result)};request.onerror=function(){reject(request.error||new Error("Nie udało się otworzyć Koszyka Feniksa."))}})}
  async function getAllPages(){const db=await openDb();try{return await new Promise(function(resolve,reject){const tx=db.transaction(STORE_NAME,"readonly");const req=tx.objectStore(STORE_NAME).getAll();req.onsuccess=function(){resolve(req.result||[])};req.onerror=function(){reject(req.error)}})}finally{db.close()}}
  async function writePages(pages,deleteIds){const db=await openDb();try{await new Promise(function(resolve,reject){const tx=db.transaction(STORE_NAME,"readwrite");const store=tx.objectStore(STORE_NAME);(deleteIds||[]).forEach(function(id){store.delete(id)});(pages||[]).forEach(function(page){store.put(page)});tx.oncomplete=resolve;tx.onerror=function(){reject(tx.error||new Error("Błąd zapisu pary Word Search."))}})}finally{db.close()}}
  function setStatus(message){const node=el("wordSearchStatusText");if(node)node.textContent=message}
  function waitForStatus(pattern,timeout){const node=el("wordSearchStatusText");const started=Date.now();return new Promise(function(resolve,reject){function check(){const text=node?node.textContent:"";if(pattern.test(text)){resolve(text);return}if(Date.now()-started>(timeout||30000)){reject(new Error("Przekroczono czas zapisu strony Word Search."));return}setTimeout(check,120)}check()})}
  async function clickAndWait(buttonId,pattern){const button=el(buttonId);if(!button)throw new Error("Brak przycisku: "+buttonId);button.click();await waitForStatus(pattern,30000)}
  function setBusy(value){busy=value;["wordSearchAddPairToBasket","wordSearchUpdatePairInBasket"].forEach(function(id){const node=el(id);if(node)node.disabled=value})}
  function getNewPages(before,after){const ids=new Set(before.map(function(page){return page.id}));return after.filter(function(page){return !ids.has(page.id)})}
  function linkPair(puzzle,solution,pairId){puzzle.wordSearchPairId=pairId;puzzle.wordSearchPairRole="puzzle";puzzle.wordSearchPartnerId=solution.id;puzzle.bookSection="activities";puzzle.isSolution=false;solution.wordSearchPairId=pairId;solution.wordSearchPairRole="solution";solution.wordSearchPartnerId=puzzle.id;solution.bookSection="solutions";solution.isSolution=true}

  async function addPair(){
    if(busy)return;
    setBusy(true);
    try{
      const before=await getAllPages();
      el("wordSearchPreviewPuzzle").click();await sleep(150);
      await clickAndWait("wordSearchAddPuzzleToBasket",/Dodano zadanie/i);
      el("wordSearchPreviewSolution").click();await sleep(150);
      await clickAndWait("wordSearchAddSolutionToBasket",/Dodano rozwiązanie/i);
      const after=await getAllPages();
      const added=getNewPages(before,after);
      const puzzle=added.find(function(page){return page.pageType==="word_search"});
      const solution=added.find(function(page){return page.pageType==="word_search_solution"});
      if(!puzzle||!solution)throw new Error("Nie udało się rozpoznać obu stron pary.");
      linkPair(puzzle,solution,createPairId());
      await writePages([puzzle,solution],[]);
      el("wordSearchPreviewPuzzle").click();
      setStatus("Dodano parę 1:1: zadanie i dokładnie odpowiadające mu rozwiązanie.");
      if(window.FenixBasketStatus&&window.FenixBasketStatus.refresh)window.FenixBasketStatus.refresh();
    }catch(error){console.error(error);setStatus(error&&error.message?error.message:"Błąd dodawania pary 1:1.")}
    finally{setBusy(false)}
  }

  async function updatePair(){
    if(busy)return;
    const editedId=new URLSearchParams(location.search).get("editBasketPage");
    if(!editedId){setStatus("Najpierw otwórz zadanie Word Search z Koszyka przez Edytuj w module.");return}
    setBusy(true);
    try{
      const before=await getAllPages();
      const current=before.find(function(page){return page.id===editedId});
      if(!current||current.pageType!=="word_search")throw new Error("Aktualizacja pary 1:1 jest dostępna po otwarciu strony zadania, nie strony rozwiązania.");
      const pairId=current.wordSearchPairId||createPairId();
      const oldPartner=before.find(function(page){return page.wordSearchPairId===pairId&&page.pageType==="word_search_solution"});

      el("wordSearchPreviewPuzzle").click();await sleep(150);
      await clickAndWait("wordSearchUpdateBasketPage",/Zaktualizowano stronę/i);

      const idsBeforeSolution=new Set((await getAllPages()).map(function(page){return page.id}));
      el("wordSearchPreviewSolution").click();await sleep(150);
      await clickAndWait("wordSearchAddSolutionToBasket",/Dodano rozwiązanie/i);

      const after=await getAllPages();
      const updatedPuzzle=after.find(function(page){return page.id===editedId});
      const tempSolution=after.find(function(page){return !idsBeforeSolution.has(page.id)&&page.pageType==="word_search_solution"});
      if(!updatedPuzzle||!tempSolution)throw new Error("Nie udało się utworzyć nowego rozwiązania dla edytowanego zadania.");

      let finalSolution=tempSolution;
      const deleteIds=[];
      if(oldPartner){
        finalSolution=Object.assign({},oldPartner,tempSolution,{id:oldPartner.id,order:oldPartner.order,basketOrder:oldPartner.basketOrder,createdAt:oldPartner.createdAt||tempSolution.createdAt});
        deleteIds.push(tempSolution.id);
      }
      linkPair(updatedPuzzle,finalSolution,pairId);
      await writePages([updatedPuzzle,finalSolution],deleteIds);
      el("wordSearchPreviewPuzzle").click();
      setStatus(oldPartner?"Zaktualizowano parę 1:1 bez tworzenia duplikatu rozwiązania.":"Zaktualizowano zadanie i dodano brakujące rozwiązanie 1:1.");
      if(window.FenixBasketStatus&&window.FenixBasketStatus.refresh)window.FenixBasketStatus.refresh();
    }catch(error){console.error(error);setStatus(error&&error.message?error.message:"Błąd aktualizacji pary 1:1.")}
    finally{setBusy(false)}
  }

  async function install(){
    const add=el("wordSearchAddPairToBasket");if(add)add.addEventListener("click",addPair);
    const update=el("wordSearchUpdatePairInBasket");if(update)update.addEventListener("click",updatePair);
    const editedId=new URLSearchParams(location.search).get("editBasketPage");
    if(editedId&&update){
      try{const pages=await getAllPages();const page=pages.find(function(item){return item.id===editedId});update.hidden=!(page&&page.pageType==="word_search");}catch(error){console.error(error)}
    }
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
})();
