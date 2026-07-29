(function(){
  "use strict";

  const EXPORT_WIDTH=2550;
  const EXPORT_HEIGHT=3300;
  const PREVIEW_WIDTH=765;
  const PREVIEW_HEIGHT=990;
  const DB_NAME="fenixBookBasketDb";
  const STORE_NAME="pages";
  const DB_VERSION=1;

  const state={
    previewMode:"puzzle",
    layout:null,
    decoAssets:[],
    imageCache:new Map(),
    renderToken:0,
    editBasketPageId:null,
    editBasketPage:null
  };

  document.addEventListener("DOMContentLoaded",init);

  function init(){
    bindControls();
    applyDifficultyPreset("medium",false);
    renderDecoList();
    renderPreview();
    loadEditableBasketPageFromUrl();
  }

  function el(id){return document.getElementById(id)}
  function bindButton(id,handler){const node=el(id);if(node)node.addEventListener("click",handler)}
  function getValue(id,fallback){const node=el(id);return node&&node.value!==undefined?node.value:fallback}
  function getNumber(id,fallback){const value=Number(getValue(id,fallback));return Number.isFinite(value)?value:fallback}
  function getChecked(id,fallback){const node=el(id);return node?!!node.checked:!!fallback}
  function setValue(id,value){const node=el(id);if(node)node.value=String(value)}
  function setChecked(id,value){const node=el(id);if(node)node.checked=!!value}
  function setText(id,value){const node=el(id);if(node)node.textContent=value}
  function clamp(value,min,max){return Math.min(max,Math.max(min,value))}

  function bindControls(){
    [
      ["wordSearchGridSize","×"],
      ["wordSearchMaxWords",""],
      ["wordSearchSeed",""],
      ["wordSearchDecoCount",""],
      ["wordSearchDecoScale","%"],
      ["wordSearchLetterScale","%"],
      ["wordSearchGridLine"," px"],
      ["wordSearchVariantCount",""]
    ].forEach(function(pair){bindRange(pair[0],pair[1])});

    ["wordSearchShowTitle","wordSearchTitle","wordSearchInstruction","wordSearchShowWordList","wordSearchWords","wordSearchShowGridCells","wordSearchWordColumns","wordSearchVariantsIncludeSolutions"].forEach(function(id){
      const node=el(id);if(!node)return;node.addEventListener("input",renderPreview);node.addEventListener("change",renderPreview);
    });

    const difficulty=el("wordSearchDifficulty");
    difficulty.addEventListener("change",function(){applyDifficultyPreset(difficulty.value,true);renderPreview()});
    el("wordSearchDecoFiles").addEventListener("change",handleDecoFiles);

    bindButton("wordSearchClearDeco",clearDeco);
    bindButton("wordSearchRandomize",randomizeSeed);
    bindButton("wordSearchRefreshPreview",renderPreview);
    bindButton("wordSearchPreviewPuzzle",function(){setPreviewMode("puzzle")});
    bindButton("wordSearchPreviewSolution",function(){setPreviewMode("solution")});
    bindButton("wordSearchExportPng",exportVisiblePng);
    bindButton("wordSearchAddPuzzleToBasket",function(){addPageToBasket("puzzle")});
    bindButton("wordSearchAddSolutionToBasket",function(){addPageToBasket("solution")});
    bindButton("wordSearchAddVariantsToBasket",addVariantsToBasket);
    bindButton("wordSearchUpdateBasketPage",updateEditedBasketPage);
  }

  function bindRange(baseId,suffix){
    const range=el(baseId);const number=el(baseId+"Number");const output=el(baseId+"Value");
    function commit(raw){
      const control=range||number;if(!control)return;
      const value=clamp(Number(raw),Number(control.min),Number(control.max));
      if(range)range.value=String(value);if(number)number.value=String(value);
      if(output){output.textContent=baseId==="wordSearchGridSize"?value+"×"+value:String(value)+suffix}
      renderPreview();
    }
    if(range)range.addEventListener("input",function(){commit(range.value)});
    if(number){number.addEventListener("change",function(){commit(number.value)});number.addEventListener("blur",function(){commit(number.value)});number.addEventListener("keydown",function(event){if(event.key==="Enter"){event.preventDefault();commit(number.value);number.blur()}})}
  }

  function applyDifficultyPreset(level,announce){
    const presets={easy:{grid:12,maxWords:8},medium:{grid:14,maxWords:12},hard:{grid:16,maxWords:16}};
    const preset=presets[level]||presets.medium;
    setRangeValue("wordSearchGridSize",preset.grid,"×");
    setRangeValue("wordSearchMaxWords",preset.maxWords,"");
    if(announce)setStatus("Dopasowano siatkę i liczbę słów do poziomu trudności.");
  }

  function setRangeValue(baseId,value,suffix){
    setValue(baseId,value);setValue(baseId+"Number",value);
    const output=el(baseId+"Value");if(output)output.textContent=baseId==="wordSearchGridSize"?value+"×"+value:String(value)+suffix;
  }

  function randomizeSeed(){
    const seed=Math.floor(Math.random()*99999)+1;setRangeValue("wordSearchSeed",seed,"");renderPreview();setMessage("Wylosowano nowy układ.");
  }

  function setPreviewMode(mode){
    state.previewMode=mode;
    el("wordSearchPreviewPuzzle").classList.toggle("is-active",mode==="puzzle");
    el("wordSearchPreviewSolution").classList.toggle("is-active",mode==="solution");
    renderPreview();
  }

  function normalizeWords(text,gridSize,maxWords){
    const seen=new Set();
    return String(text||"").split(/[\n,;]+/).map(function(word){return word.toUpperCase().replace(/[^A-Z]/g,"")}).filter(function(word){
      if(word.length<2||word.length>gridSize||seen.has(word))return false;seen.add(word);return true;
    }).slice(0,maxWords);
  }

  function readSettings(overrides){
    const gridSize=getNumber("wordSearchGridSize",14);
    const settings={
      title:getValue("wordSearchTitle","Ocean Word Search").trim()||"Ocean Word Search",
      instruction:getValue("wordSearchInstruction","Find and circle all the words.").trim(),
      showTitle:getChecked("wordSearchShowTitle",true),
      showWordList:getChecked("wordSearchShowWordList",true),
      wordsText:getValue("wordSearchWords",""),
      gridSize:gridSize,
      maxWords:getNumber("wordSearchMaxWords",12),
      difficulty:getValue("wordSearchDifficulty","medium"),
      seed:getNumber("wordSearchSeed",1),
      letterScale:getNumber("wordSearchLetterScale",92),
      gridLine:getNumber("wordSearchGridLine",3),
      showGridCells:getChecked("wordSearchShowGridCells",true),
      wordColumns:getNumber("wordSearchWordColumns",2),
      decoCount:getNumber("wordSearchDecoCount",0),
      decoScale:getNumber("wordSearchDecoScale",18),
      variantCount:getNumber("wordSearchVariantCount",5),
      variantsIncludeSolutions:getChecked("wordSearchVariantsIncludeSolutions",false)
    };
    settings.words=normalizeWords(settings.wordsText,settings.gridSize,settings.maxWords);
    return Object.assign(settings,overrides||{});
  }

  function createRng(seed){let value=(Number(seed)||1)>>>0;return function(){value=(value*1664525+1013904223)>>>0;return value/4294967296}}
  function directionsFor(level){
    const forward=[[1,0],[0,1],[1,1],[1,-1]];
    if(level==="easy")return [[1,0],[0,1]];
    if(level==="hard")return forward.concat([[-1,0],[0,-1],[-1,-1],[-1,1]]);
    return forward;
  }

  function buildPuzzle(settings){
    const size=settings.gridSize;const rng=createRng(settings.seed);const grid=Array.from({length:size},function(){return Array(size).fill("")});
    const placements=[];const skipped=[];const words=settings.words.slice().sort(function(a,b){return b.length-a.length});const directions=directionsFor(settings.difficulty);
    words.forEach(function(word){
      let placed=null;
      for(let attempt=0;attempt<350&&!placed;attempt++){
        const dir=directions[Math.floor(rng()*directions.length)];
        const dx=dir[0],dy=dir[1];
        const minX=dx<0?word.length-1:0;const maxX=dx>0?size-word.length:size-1;
        const minY=dy<0?word.length-1:0;const maxY=dy>0?size-word.length:size-1;
        if(maxX<minX||maxY<minY)continue;
        const x=minX+Math.floor(rng()*(maxX-minX+1));const y=minY+Math.floor(rng()*(maxY-minY+1));
        let ok=true;
        for(let i=0;i<word.length;i++){const cell=grid[y+dy*i][x+dx*i];if(cell&&cell!==word[i]){ok=false;break}}
        if(!ok)continue;
        for(let i=0;i<word.length;i++)grid[y+dy*i][x+dx*i]=word[i];
        placed={word:word,x:x,y:y,dx:dx,dy:dy};placements.push(placed);
      }
      if(!placed)skipped.push(word);
    });
    const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!grid[y][x])grid[y][x]=alphabet[Math.floor(rng()*alphabet.length)];
    return{grid:grid,placements:placements,skipped:skipped,words:settings.words};
  }

  async function renderPreview(){
    const token=++state.renderToken;const settings=readSettings();const layout=buildPuzzle(settings);state.layout=layout;
    const canvas=el("wordSearchPreviewCanvas");await renderPage(canvas,PREVIEW_WIDTH,PREVIEW_HEIGHT,settings,layout,state.previewMode);
    if(token!==state.renderToken)return;
    const label=settings.difficulty==="easy"?"Easy":settings.difficulty==="hard"?"Hard":"Medium";
    setText("wordSearchPreviewSummary",settings.gridSize+"×"+settings.gridSize+" · "+label);
    setText("wordSearchPlacedSummary",layout.placements.length+" słów");
    if(!settings.words.length)setMessage("Dodaj co najmniej jedno słowo pasujące do rozmiaru siatki.");
    else if(layout.skipped.length)setMessage("Pominięto: "+layout.skipped.join(", ")+". Zwiększ siatkę albo zmniejsz liczbę słów.");
    else setMessage(state.previewMode==="solution"?"Podgląd rozwiązania.":"Wykreślanka jest gotowa.");
  }

  async function renderPage(canvas,width,height,settings,layout,mode){
    canvas.width=width;canvas.height=height;const ctx=canvas.getContext("2d");const scale=width/EXPORT_WIDTH;
    ctx.save();ctx.fillStyle="#ffffff";ctx.fillRect(0,0,width,height);ctx.scale(scale,scale);
    await drawDecorations(ctx,settings);
    drawHeader(ctx,settings,mode);
    drawGrid(ctx,settings,layout,mode);
    if(settings.showWordList)drawWordList(ctx,settings,layout);
    ctx.restore();
  }

  function drawHeader(ctx,settings,mode){
    ctx.save();ctx.fillStyle="#111827";ctx.textAlign="center";ctx.textBaseline="middle";
    if(settings.showTitle){ctx.font="bold 92px Arial, Helvetica, sans-serif";ctx.fillText(mode==="solution"?settings.title+" — Solution":settings.title,EXPORT_WIDTH/2,180,EXPORT_WIDTH-500)}
    if(settings.instruction){ctx.font="42px Arial, Helvetica, sans-serif";ctx.fillText(mode==="solution"?"Solution page":settings.instruction,EXPORT_WIDTH/2,300,EXPORT_WIDTH-520)}
    ctx.restore();
  }

  function getGridBox(settings){
    const top=settings.showTitle||settings.instruction?430:250;const bottom=settings.showWordList?2460:3100;const availableH=bottom-top;const size=Math.min(1900,availableH,EXPORT_WIDTH-520);return{x:(EXPORT_WIDTH-size)/2,y:top+(availableH-size)/2,w:size,h:size};
  }

  function drawGrid(ctx,settings,layout,mode){
    const box=getGridBox(settings);const size=settings.gridSize;const cell=box.w/size;
    ctx.save();
    if(mode==="solution")drawSolutionMarks(ctx,layout,box,cell);
    ctx.strokeStyle="#111827";ctx.lineWidth=settings.gridLine;
    if(settings.showGridCells){for(let i=0;i<=size;i++){const p=i*cell;ctx.beginPath();ctx.moveTo(box.x+p,box.y);ctx.lineTo(box.x+p,box.y+box.h);ctx.stroke();ctx.beginPath();ctx.moveTo(box.x,box.y+p);ctx.lineTo(box.x+box.w,box.y+p);ctx.stroke()}}
    else{ctx.lineWidth=Math.max(4,settings.gridLine);ctx.strokeRect(box.x,box.y,box.w,box.h)}
    const fontSize=cell*.58*(settings.letterScale/100);ctx.fillStyle="#111827";ctx.font="bold "+fontSize+"px Arial, Helvetica, sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";
    for(let y=0;y<size;y++)for(let x=0;x<size;x++)ctx.fillText(layout.grid[y][x],box.x+(x+.5)*cell,box.y+(y+.52)*cell);
    ctx.restore();
  }

  function drawSolutionMarks(ctx,layout,box,cell){
    ctx.save();ctx.lineCap="round";ctx.strokeStyle="rgba(17,24,39,.26)";ctx.lineWidth=cell*.62;
    layout.placements.forEach(function(p){ctx.beginPath();ctx.moveTo(box.x+(p.x+.5)*cell,box.y+(p.y+.5)*cell);ctx.lineTo(box.x+(p.x+p.dx*(p.word.length-1)+.5)*cell,box.y+(p.y+p.dy*(p.word.length-1)+.5)*cell);ctx.stroke()});ctx.restore();
  }

  function drawWordList(ctx,settings,layout){
    const words=layout.placements.map(function(p){return p.word});if(!words.length)return;
    const columns=clamp(settings.wordColumns,2,4);const startY=2520;const areaX=300;const areaW=EXPORT_WIDTH-600;const colW=areaW/columns;const rows=Math.ceil(words.length/columns);const rowH=Math.min(92,520/Math.max(1,rows));
    ctx.save();ctx.fillStyle="#111827";ctx.textAlign="left";ctx.textBaseline="middle";ctx.font="bold "+Math.min(48,rowH*.56)+"px Arial, Helvetica, sans-serif";
    words.forEach(function(word,index){const col=Math.floor(index/rows);const row=index%rows;const x=areaX+col*colW;const y=startY+row*rowH;ctx.fillText("• "+word,x,y,colW-40)});ctx.restore();
  }

  async function handleDecoFiles(event){
    const files=Array.from(event.target.files||[]);for(const file of files){try{const dataUrl=await readFileAsDataUrl(file);state.decoAssets.push({id:createId("deco"),name:file.name,type:file.type||"image/png",dataUrl:dataUrl});await loadImage(dataUrl)}catch(error){console.error(error);setStatus("Nie udało się wczytać dekoracji: "+file.name)}}event.target.value="";renderDecoList();renderPreview();
  }
  function clearDeco(){state.decoAssets=[];state.imageCache.clear();renderDecoList();renderPreview();setStatus("Wyczyszczono dekoracje.")}
  function renderDecoList(){const root=el("wordSearchDecoList");root.replaceChildren();if(!state.decoAssets.length){const p=document.createElement("p");p.textContent="Brak dekoracji.";root.appendChild(p);return}state.decoAssets.forEach(function(asset){const row=document.createElement("div");row.className="word-search-deco-item";const span=document.createElement("span");span.textContent=asset.name;const remove=document.createElement("button");remove.type="button";remove.textContent="Usuń";remove.addEventListener("click",function(){state.decoAssets=state.decoAssets.filter(function(item){return item.id!==asset.id});state.imageCache.delete(asset.dataUrl);renderDecoList();renderPreview()});row.append(span,remove);root.appendChild(row)})}
  async function drawDecorations(ctx,settings){
    const count=Math.min(settings.decoCount,state.decoAssets.length,4);if(!count)return;
    const anchors=[{x:150,y:130},{x:EXPORT_WIDTH-150,y:130},{x:150,y:EXPORT_HEIGHT-150},{x:EXPORT_WIDTH-150,y:EXPORT_HEIGHT-150}];
    for(let i=0;i<count;i++){const asset=state.decoAssets[i%state.decoAssets.length];try{const img=await loadImage(asset.dataUrl);const size=EXPORT_WIDTH*(settings.decoScale/100);const ratio=img.width/img.height;let w=size,h=size;if(ratio>1)h=w/ratio;else w=h*ratio;ctx.save();ctx.globalAlpha=.9;ctx.translate(anchors[i].x,anchors[i].y);ctx.rotate((i%2?10:-10)*Math.PI/180);ctx.drawImage(img,-w/2,-h/2,w,h);ctx.restore()}catch(error){console.error(error)}}
  }
  function loadImage(url){if(state.imageCache.has(url))return state.imageCache.get(url);const promise=new Promise(function(resolve,reject){const img=new Image();img.onload=function(){resolve(img)};img.onerror=reject;img.src=url});state.imageCache.set(url,promise);return promise}
  function readFileAsDataUrl(file){return new Promise(function(resolve,reject){const reader=new FileReader();reader.onload=function(){resolve(String(reader.result||""))};reader.onerror=function(){reject(reader.error)};reader.readAsDataURL(file)})}

  async function exportVisiblePng(){try{const settings=readSettings();const layout=buildPuzzle(settings);const canvas=document.createElement("canvas");await renderPage(canvas,EXPORT_WIDTH,EXPORT_HEIGHT,settings,layout,state.previewMode);const blob=await canvasToBlob(canvas);downloadBlob(blob,fileBase(settings,state.previewMode)+".png");setStatus("Wyeksportowano PNG.")}catch(error){console.error(error);setStatus("Błąd eksportu PNG.")}}
  function canvasToBlob(canvas){return new Promise(function(resolve,reject){canvas.toBlob(function(blob){blob?resolve(blob):reject(new Error("Nie udało się utworzyć PNG."))},"image/png")})}
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},1000)}
  function slug(value){return String(value||"word-search").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"word-search"}
  function fileBase(settings,mode){return slug(settings.title)+(mode==="solution"?"-solution":"-puzzle")}

  function openDb(){return new Promise(function(resolve,reject){const request=indexedDB.open(DB_NAME,DB_VERSION);request.onupgradeneeded=function(){const db=request.result;if(!db.objectStoreNames.contains(STORE_NAME))db.createObjectStore(STORE_NAME,{keyPath:"id"})};request.onsuccess=function(){resolve(request.result)};request.onerror=function(){reject(request.error||new Error("Błąd otwarcia Koszyka Feniksa."))}})}
  function putPage(page){return openDb().then(function(db){return new Promise(function(resolve,reject){const tx=db.transaction(STORE_NAME,"readwrite");tx.objectStore(STORE_NAME).put(page);tx.oncomplete=function(){db.close();resolve()};tx.onerror=function(){db.close();reject(tx.error)}})})}
  function getPage(id){return openDb().then(function(db){return new Promise(function(resolve,reject){const tx=db.transaction(STORE_NAME,"readonly");const req=tx.objectStore(STORE_NAME).get(id);req.onsuccess=function(){db.close();resolve(req.result||null)};req.onerror=function(){db.close();reject(req.error)}})})}
  function getAllPages(){return openDb().then(function(db){return new Promise(function(resolve,reject){const tx=db.transaction(STORE_NAME,"readonly");const req=tx.objectStore(STORE_NAME).getAll();req.onsuccess=function(){db.close();resolve(req.result||[])};req.onerror=function(){db.close();reject(req.error)}})})}
  function createId(prefix){return prefix+"-"+(window.crypto&&crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(16).slice(2))}

  function createSnapshot(settings,mode,seed,now){
    return{snapshotVersion:1,sourceModule:"word-search-studio",pageType:mode==="solution"?"word_search_solution":"word_search",renderMode:mode,settings:Object.assign({},settings,{seed:seed,words:undefined}),decoAssets:state.decoAssets.map(function(asset){return{name:asset.name,type:asset.type,dataUrl:asset.dataUrl}}),createdAt:now,updatedAt:now};
  }

  async function renderExport(settings,mode){const layout=buildPuzzle(settings);const canvas=document.createElement("canvas");await renderPage(canvas,EXPORT_WIDTH,EXPORT_HEIGHT,settings,layout,mode);return{blob:await canvasToBlob(canvas),layout:layout}}

  async function addPageToBasket(mode,overrides){
    try{
      const settings=readSettings(overrides);if(!settings.words.length)throw new Error("Brak poprawnych słów.");
      setStatus("Renderowanie strony do Koszyka...");const rendered=await renderExport(settings,mode);const now=new Date().toISOString();const pages=await getAllPages();
      const title=settings.title+(mode==="solution"?" — Solution":"");
      await putPage({id:createId("word-search"),sourceModule:"word-search-studio",pageType:mode==="solution"?"word_search_solution":"word_search",fileName:fileBase(settings,mode)+".png",title:title,width:EXPORT_WIDTH,height:EXPORT_HEIGHT,mimeType:"image/png",createdAt:now,updatedAt:now,blob:rendered.blob,order:pages.length,basketOrder:pages.length,editSnapshot:createSnapshot(settings,mode,settings.seed,now)});
      refreshBasketStatus();setStatus("Dodano "+(mode==="solution"?"rozwiązanie":"zadanie")+" do Koszyka Feniksa.");
      return true;
    }catch(error){console.error(error);setStatus(error&&error.message?error.message:"Błąd zapisu do Koszyka.");return false}
  }

  async function addVariantsToBasket(){
    const base=readSettings();const count=base.variantCount;const withSolutions=base.variantsIncludeSolutions;let added=0;setStatus("Dodawanie wariantów...");
    try{for(let i=0;i<count;i++){const seed=base.seed+i;const puzzleAdded=await addPageToBasket("puzzle",{seed:seed});if(puzzleAdded)added++;if(withSolutions){const solutionAdded=await addPageToBasket("solution",{seed:seed});if(solutionAdded)added++}}setStatus("Dodano "+added+" stron wariantów do Koszyka.")}catch(error){console.error(error);setStatus("Błąd podczas dodawania wariantów.")}
  }

  function refreshBasketStatus(){if(window.FenixBasketStatus&&window.FenixBasketStatus.refresh)window.FenixBasketStatus.refresh()}

  async function loadEditableBasketPageFromUrl(){
    const pageId=new URLSearchParams(window.location.search).get("editBasketPage");if(!pageId)return;
    try{const page=await getPage(pageId);if(!page||!page.editSnapshot||page.editSnapshot.sourceModule!=="word-search-studio")throw new Error("Nie da się odtworzyć tej pozycji do edycji.");const snapshot=page.editSnapshot;state.editBasketPageId=pageId;state.editBasketPage=page;applySnapshot(snapshot);el("wordSearchUpdateBasketPage").hidden=false;setPreviewMode(snapshot.renderMode||"puzzle");setStatus("Edytujesz stronę z Koszyka Feniksa.")}catch(error){console.error(error);setStatus(error.message||"Błąd odczytu strony z Koszyka.")}
  }

  function applySnapshot(snapshot){
    const s=snapshot.settings||{};setChecked("wordSearchShowTitle",s.showTitle);setValue("wordSearchTitle",s.title||"Word Search");setValue("wordSearchInstruction",s.instruction||"");setChecked("wordSearchShowWordList",s.showWordList);setValue("wordSearchWords",s.wordsText||"");setValue("wordSearchDifficulty",s.difficulty||"medium");
    [["wordSearchGridSize",s.gridSize,"×"],["wordSearchMaxWords",s.maxWords,""],["wordSearchSeed",s.seed,""],["wordSearchLetterScale",s.letterScale,"%"],["wordSearchGridLine",s.gridLine," px"],["wordSearchDecoCount",s.decoCount,""],["wordSearchDecoScale",s.decoScale,"%"],["wordSearchVariantCount",s.variantCount||5,""]].forEach(function(item){if(item[1]!==undefined)setRangeValue(item[0],item[1],item[2])});
    setChecked("wordSearchShowGridCells",s.showGridCells);setValue("wordSearchWordColumns",s.wordColumns||2);setChecked("wordSearchVariantsIncludeSolutions",s.variantsIncludeSolutions);
    state.decoAssets=(snapshot.decoAssets||[]).map(function(asset){return{id:createId("deco"),name:asset.name,type:asset.type,dataUrl:asset.dataUrl}});renderDecoList();renderPreview();
  }

  async function updateEditedBasketPage(){
    if(!state.editBasketPageId||!state.editBasketPage){setStatus("Brak edytowanej strony.");return}
    try{const settings=readSettings();const mode=state.previewMode;const rendered=await renderExport(settings,mode);const now=new Date().toISOString();const oldSnapshot=state.editBasketPage.editSnapshot||{};const snapshot=createSnapshot(settings,mode,settings.seed,now);snapshot.createdAt=oldSnapshot.createdAt||snapshot.createdAt;
      const updated=Object.assign({},state.editBasketPage,{sourceModule:"word-search-studio",pageType:mode==="solution"?"word_search_solution":"word_search",fileName:fileBase(settings,mode)+".png",title:settings.title+(mode==="solution"?" — Solution":""),width:EXPORT_WIDTH,height:EXPORT_HEIGHT,mimeType:"image/png",blob:rendered.blob,updatedAt:now,editSnapshot:snapshot});await putPage(updated);state.editBasketPage=updated;refreshBasketStatus();setStatus("Zaktualizowano stronę w Koszyku Feniksa.")
    }catch(error){console.error(error);setStatus("Błąd aktualizacji strony w Koszyku.")}
  }

  function setStatus(message){setText("wordSearchStatusText",message)}
  function setMessage(message){setText("wordSearchMessage",message)}
})();
