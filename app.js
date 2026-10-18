(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const audio = $("audio");
  const fileInput = $("fileInput");
  const playlistEl = $("playlist");
  const tracks = [];
  let currentIndex = -1, objectUrl = null, audioCtx = null, analyser = null, sourceNode = null;
  let freqData = null, timeData = null, rafId = null, lastBeat = 0, lastEnergy = 0, smoothEnergy = 0, demoTimer = null, demoStep = 0;
  let isShuffle = false, repeatOne = false;
  const wave = $("wave");
  for (let i=0;i<38;i++){const bar=document.createElement("i");wave.appendChild(bar);}
  const waveBars = [...wave.children];

  function faNum(value){return String(value).replace(/\d/g,d=>"۰۱۲۳۴۵۶۷۸۹"[Number(d)]);}
  function fmtTime(seconds){
    if(!Number.isFinite(seconds)||seconds<0)return "۰:۰۰";
    const m=Math.floor(seconds/60),s=Math.floor(seconds%60);
    return faNum(m+":"+(s<10?"0":"")+s);
  }
  function moodFrom(energy, beat){
    if(energy<0.10 && beat<0.17)return {id:"calm",name:"آرام و متعادل",sub:"نفس عمیق؛ همه‌چیز آرام است",emoji:"◌",color:"#62e5ff"};
    if(energy>0.48 && beat>0.28)return {id:"power",name:"پرقدرت و پرتحرک",sub:"ضرب‌ها روشنم کرده‌اند!",emoji:"ϟ",color:"#ffad6e"};
    if(energy>0.28)return {id:"happy",name:"شاد و پرانرژی",sub:"بیا با ریتم حرکت کنیم!",emoji:"✦",color:"#ff79ca"};
    if(beat>0.12)return {id:"dreamy",name:"رویایی و شناور",sub:"دارم در ملودی غرق می‌شوم",emoji:"☾",color:"#b49aff"};
    return {id:"calm",name:"آرام و متعادل",sub:"دارم به صدا گوش می‌دهم",emoji:"◌",color:"#62e5ff"};
  }
  function setMood(mood){
    $("robotStage").dataset.mood=mood.id;
    $("moodName").textContent=mood.name;
    $("moodSub").textContent=mood.sub;
    $("analysisMood").textContent=mood.name;
    $("moodEmoji").textContent=mood.emoji;
    document.documentElement.style.setProperty("--mood-color",mood.color);
    $("moodDot")?.style.setProperty("background",mood.color);
  }
  function updateAnalysis(energy, beat){
    const e=Math.max(0,Math.min(1,energy)), b=Math.max(0,Math.min(1,beat));
    $("energyValue").textContent=faNum(Math.round(e*100))+"٪";
    $("beatValue").textContent=faNum(Math.round(b*100))+"٪";
    $("energyMeter").style.width=(e*100)+"%";
    $("beatMeter").style.width=(b*100)+"%";
    const mood=moodFrom(e,b);
    setMood(mood);
    waveBars.forEach((bar,i)=>{
      const base=audio.paused?0.10:0.12;
      const wobble=audio.paused?0.08:Math.abs(Math.sin((performance.now()/130)+(i*.65)))*(.25+e*.75);
      const h=Math.max(5,Math.min(100,(base+wobble)*100));
      bar.style.height=h+"%";
      bar.style.opacity=audio.paused?".35":String(.4+e*.6);
    });
  }
  async function setupAnalyser(){
    if(!audioCtx){
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC){$("playerStatus").textContent="تحلیل صدا پشتیبانی نمی‌شود";return false;}
      audioCtx=new AC();
      analyser=audioCtx.createAnalyser();
      analyser.fftSize=256;analyser.smoothingTimeConstant=.78;
      sourceNode=audioCtx.createMediaElementSource(audio);
      sourceNode.connect(analyser);analyser.connect(audioCtx.destination);
      freqData=new Uint8Array(analyser.frequencyBinCount);
      timeData=new Uint8Array(analyser.fftSize);
    }
    if(audioCtx.state==="suspended") await audioCtx.resume();
    if(!rafId) analyzeFrame();
    return true;
  }
  function analyzeFrame(){
    rafId=requestAnimationFrame(analyzeFrame);
    if(!analyser||audio.paused){smoothEnergy*=.92;updateAnalysis(smoothEnergy,0);return;}
    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);
    let sum=0, low=0;
    for(let i=0;i<freqData.length;i++){const v=freqData[i]/255;sum+=v*v;if(i<12)low+=v;}
    const rms=Math.sqrt(sum/freqData.length);
    smoothEnergy=smoothEnergy*.82+rms*.18;
    const now=performance.now();
    const beat= Math.min(1,Math.max(0,(low/12)*1.45));
    if(beat>.48 && lastEnergy<.42 && now-lastBeat>240){lastBeat=now;}
    lastEnergy=beat;
    const beatPulse=Math.max(0,1-(now-lastBeat)/500);
    updateAnalysis(smoothEnergy,Math.max(beat*.35,beatPulse*.8));
  }
  function displayTrack(index){
    const t=tracks[index];if(!t)return;
    $("trackTitle").textContent=t.name;
    $("trackArtist").textContent="فایل محلی · "+(t.file.size?formatSize(t.file.size):"موسیقی");
    $("trackCount").textContent=faNum(tracks.length)+" آهنگ";
    $("albumArt").style.background=`linear-gradient(140deg,${t.color},#8155b6,#43cce4)`;
    renderPlaylist();
  }
  function formatSize(bytes){return bytes<1024*1024?faNum(Math.round(bytes/1024))+" کیلوبایت":faNum((bytes/1024/1024).toFixed(1))+" مگابایت";}
  function renderPlaylist(){
    $("trackCount").textContent=faNum(tracks.length)+" آهنگ";
    if(!tracks.length){playlistEl.innerHTML='<div class="empty-state"><span>♫</span><b>فهرستت اینجا ساخته می‌شود</b><small>با انتخاب چند آهنگ، صف پخش آماده می‌شود.</small></div>';return;}
    playlistEl.replaceChildren();
    tracks.forEach((t,i)=>{
      const row=document.createElement("div");row.className="track-item"+(i===currentIndex?" current":"");row.tabIndex=0;row.setAttribute("role","button");row.setAttribute("aria-label","پخش "+t.name);
      const index=document.createElement("span");index.className="track-index";index.textContent=i===currentIndex&&!audio.paused?"♫":faNum(i+1);
      const info=document.createElement("span");info.className="track-info";
      const name=document.createElement("b");name.textContent=t.name;
      const sub=document.createElement("small");sub.textContent=i===currentIndex?"در حال انتخاب":"فایل صوتی";
      info.append(name,sub);
      const len=document.createElement("span");len.className="track-length";len.textContent=t.duration?fmtTime(t.duration):"—:—";
      row.append(index,info,len);
      row.addEventListener("click",()=>loadTrack(i,true));
      row.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();loadTrack(i,true);}});
      playlistEl.appendChild(row);
    });
  }
  async function loadTrack(index,autoplay=false){
    if(!tracks.length)return;
    currentIndex=(index+tracks.length)%tracks.length;
    const t=tracks[currentIndex];
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
    objectUrl=URL.createObjectURL(t.file);
    audio.src=objectUrl;
    displayTrack(currentIndex);
    $("seekBar").value=0;$("currentTime").textContent="۰:۰۰";$("duration").textContent="۰:۰۰";
    $("playerStatus").textContent=autoplay?"در حال آماده‌سازی":"آماده پخش";
    $("playIcon").textContent="▶";
    if(autoplay){
      try{await audio.play();await setupAnalyser();$("playerStatus").textContent="در حال پخش";$("playIcon").textContent="Ⅱ";}
      catch(err){$("playerStatus").textContent="برای پخش دوباره بزن";}
    }
  }
  async function togglePlay(){
    if(currentIndex<0){if(tracks.length)await loadTrack(0,true);else fileInput.click();return;}
    stopDemo();
    if(audio.paused){
      try{await audio.play();await setupAnalyser();$("playerStatus").textContent="در حال پخش";$("playIcon").textContent="Ⅱ";}
      catch(e){$("playerStatus").textContent="پخش ناموفق بود";}
    }else{audio.pause();$("playerStatus").textContent="متوقف شده";$("playIcon").textContent="▶";}
    renderPlaylist();
  }
  function nextTrack(){
    if(!tracks.length)return;
    const next=isShuffle&&tracks.length>1?(()=>{let n;do{n=Math.floor(Math.random()*tracks.length)}while(n===currentIndex);return n;})():currentIndex+1;
    loadTrack(next%tracks.length,true);
  }
  fileInput.addEventListener("change",()=>{
    const files=[...fileInput.files].filter(f=>f.type.startsWith("audio/"));
    const colors=["#3e6ee8","#a35bd1","#168fa9","#ca638e","#5a70c9"];
    files.forEach((file,i)=>tracks.push({file,name:file.name.replace(/\.[^.]+$/,"")||"آهنگ بدون نام",duration:0,color:colors[(tracks.length+i)%colors.length]}));
    renderPlaylist();
    if(currentIndex<0&&tracks.length)loadTrack(0,false);
    fileInput.value="";
  });
  audio.addEventListener("loadedmetadata",()=>{if(tracks[currentIndex])tracks[currentIndex].duration=audio.duration; $("duration").textContent=fmtTime(audio.duration);renderPlaylist();});
  audio.addEventListener("timeupdate",()=>{
    $("currentTime").textContent=fmtTime(audio.currentTime);
    const ratio=audio.duration?audio.currentTime/audio.duration:0;
    $("seekBar").value=Math.round(ratio*1000);
    $("seekBar").style.background=`linear-gradient(90deg,#73e6ff ${ratio*100}%,#ffffff18 ${ratio*100}%)`;
  });
  audio.addEventListener("play",()=>{$("playIcon").textContent="Ⅱ";$("playerStatus").textContent="در حال پخش";});
  audio.addEventListener("pause",()=>{if(!audio.ended){$("playIcon").textContent="▶";if(currentIndex>=0)$("playerStatus").textContent="متوقف شده";}});
  audio.addEventListener("ended",()=>{if(repeatOne){audio.currentTime=0;audio.play();}else if(currentIndex<tracks.length-1||isShuffle)nextTrack();else{$("playerStatus").textContent="پخش تمام شد";$("playIcon").textContent="▶";}});
  $("playBtn").addEventListener("click",togglePlay);
  $("prevBtn").addEventListener("click",()=>{if(audio.currentTime>3)audio.currentTime=0;else if(tracks.length)loadTrack(currentIndex-1,true);});
  $("nextBtn").addEventListener("click",nextTrack);
  $("seekBar").addEventListener("input",()=>{if(audio.duration)audio.currentTime=(Number($("seekBar").value)/1000)*audio.duration;});
  $("volumeBar").addEventListener("input",()=>audio.volume=Number($("volumeBar").value));
  audio.volume=.8;
  $("shuffleBtn").addEventListener("click",()=>{isShuffle=!isShuffle;$("shuffleBtn").classList.toggle("active",isShuffle);});
  $("repeatBtn").addEventListener("click",()=>{repeatOne=!repeatOne;$("repeatBtn").classList.toggle("active",repeatOne);$("repeatBtn").title=repeatOne?"تکرار همین آهنگ روشن":"تکرار خاموش";});
  $("likeBtn").addEventListener("click",()=>{$("likeBtn").classList.toggle("liked");$("likeBtn").textContent=$("likeBtn").classList.contains("liked")?"♥":"♡";});
  $("clearBtn").addEventListener("click",()=>{
    audio.pause();tracks.splice(0,tracks.length);currentIndex=-1;
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
    audio.removeAttribute("src");audio.load();$("trackTitle").textContent="هنوز آهنگی انتخاب نشده";$("trackArtist").textContent="یک فایل صوتی انتخاب کن تا شروع کنیم";$("playerStatus").textContent="آماده پخش";$("playIcon").textContent="▶";$("seekBar").value=0;renderPlaylist();updateAnalysis(0,0);
  });
  function stopDemo(){if(demoTimer){clearInterval(demoTimer);demoTimer=null;}if(audio.paused===false)audio.pause();$("demoBtn").textContent="اجرای نمایشی";}
  $("demoBtn").addEventListener("click",()=>{
    if(demoTimer){stopDemo();$("playerStatus").textContent="دمو متوقف شد";return;}
    demoStep=0;const demos=[{e:.06,b:.05},{e:.24,b:.2},{e:.57,b:.38},{e:.76,b:.68},{e:.32,b:.13},{e:.12,b:.06}];
    $("demoBtn").textContent="توقف دمو";$("playerStatus").textContent="نمایش واکنش ربات";
    const tick=()=>{const d=demos[demoStep%demos.length];updateAnalysis(d.e,d.b);demoStep++;};
    tick();demoTimer=setInterval(tick,1400);
  });
  $("themeBtn").addEventListener("click",()=>{
    const light=document.body.classList.toggle("light-mode");
    if(light){
      document.body.style.background="radial-gradient(ellipse at 15% 0%,#dbe5ff 0,transparent 34%),#eef2ff";
      document.body.style.color="#17213d";
      document.querySelectorAll(".glass").forEach(el=>{el.style.background="rgba(255,255,255,.72)";el.style.borderColor="#bac7ed";});
      document.querySelectorAll(".track-meta p,.analysis-footnote,.mood-list small,.tip-box p").forEach(el=>el.style.color="#657394");
    }else{
      document.body.style.background="";
      document.body.style.color="";
      document.querySelectorAll(".glass").forEach(el=>{el.style.background="";el.style.borderColor="";});
      document.querySelectorAll(".track-meta p,.analysis-footnote,.mood-list small,.tip-box p").forEach(el=>el.style.color="");
    }
  });
  if("serviceWorker" in navigator && location.protocol!=="file:"){
    window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
  }
  updateAnalysis(0,0);
})();