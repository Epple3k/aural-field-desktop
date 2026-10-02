(() => {
  const $ = (s) => document.querySelector(s);
  const TAU = Math.PI * 2;

  const instrument = $("#instrument");
  const canvas = $("#formCanvas");
  const g = canvas.getContext("2d");
  const playBtn = $("#play");
  const regen = $("#regen");
  const modeGrid = $("#modeGrid");
  const density = $("#density");
  const space = $("#space");
  const motion = $("#motion");
  const densityValue = $("#densityValue");
  const spaceValue = $("#spaceValue");
  const motionValue = $("#motionValue");
  const material = $("#material");
  const matDot = $("#matDot");
  const fnReadout = $("#fnReadout");
  const rootReadout = $("#rootReadout");
  const seedReadout = $("#seedReadout");
  const freqReadout = $("#freqReadout");
  const ampReadout = $("#ampReadout");
  const phaseReadout = $("#phaseReadout");
  const contextName = $("#contextName");
  const stateEl = $("#state");
  const chordEl = $("#chord");

  let W = 0, H = 0, dpr = 1;
  let mx = .44, my = .35, drag = false;
  let seed = Math.floor(Math.random() * 9999), rand = mulberry32(seed);
  let root = 0, modeIndex = 0, chordIndex = 0, progression = [0,3,4,1];

  let audio = null, master = null, dry = null, wet = null, delay = null, feedback = null, analyser = null, outputGain = null;
  let playing = false, scheduler = null, nextEvent = 0, nextChord = 0;
  let bursts = [], particles = [], energy = 0;

  const NAMES = ["C","Câ™¯","D","Eâ™­","E","F","Fâ™¯","G","Aâ™­","A","Bâ™­","B"];
  const ROOTS = [0,2,3,5,7,9,10];
  const MODES = [
    {name:"lydian",label:"Lydian / bloom",short:"LYD",scale:[0,2,4,6,7,9,11],fn:"bloom"},
    {name:"dorian",label:"Dorian / fold",short:"DOR",scale:[0,2,3,5,7,9,10],fn:"fold"},
    {name:"ionian",label:"Ionian / halo",short:"ION",scale:[0,2,4,5,7,9,11],fn:"halo"},
    {name:"aeolian",label:"Aeolian / drift",short:"AEO",scale:[0,2,3,5,7,8,10],fn:"drift"},
    {name:"mixolydian",label:"Mixolydian / orbit",short:"MIX",scale:[0,2,4,5,7,9,10],fn:"orbit"},
    {name:"pentatonic",label:"Pentatonic / knot",short:"PEN",scale:[0,2,4,7,9],fn:"knot"}
  ];

  function mulberry32(a){
    return function(){
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function clamp(v,a=0,b=1){ return Math.max(a,Math.min(b,v)); }
  function pick(a){ return a[Math.floor(rand()*a.length)]; }
  function midi(m){ return 440*Math.pow(2,(m-69)/12); }
  function noteName(n){ return NAMES[((n%12)+12)%12]; }
  function D(){ return Number(density.value)/100; }
  function S(){ return Number(space.value)/100; }
  function M(){ return Number(motion.value)/100; }
  function mode(){ return MODES[modeIndex]; }
  function formFrequency(){ return 2.2 + D()*12.8; }
  function formAmplitude(){ return .055 + S()*.34; }
  function phaseSpeed(){ return .05 + M()*1.55; }

  function chord(){
    const s = mode().scale;
    const degree = progression[chordIndex % progression.length];
    const base = 48 + root + s[degree % s.length];
    const extensions = D() > .74 ? [0,2,4,6,8,10] : D() > .42 ? [0,2,4,6,8] : [0,2,4,6];
    return extensions.map(step => {
      const di = degree + step;
      const oct = Math.floor(di/s.length)*12;
      return base + (s[di%s.length]-s[degree%s.length]) + oct;
    });
  }

  function syncUI(){
    fnReadout.textContent = mode().label;
    contextName.textContent = mode().label.toLowerCase();
    rootReadout.textContent = NAMES[root];
    seedReadout.textContent = String(seed).padStart(4,"0");
    chordEl.textContent = `${noteName(chord()[0])} / ${mode().name}`;
    freqReadout.textContent = formFrequency().toFixed(1);
    ampReadout.textContent = formAmplitude().toFixed(2);
    phaseReadout.textContent = phaseSpeed().toFixed(2);
    densityValue.textContent = density.value;
    spaceValue.textContent = space.value;
    motionValue.textContent = motion.value;
    matDot.style.left = `${mx*100}%`;
    matDot.style.top = `${my*100}%`;
  }

  function serializeState(){
    return {density:Number(density.value),space:Number(space.value),motion:Number(motion.value),mx,my,seed,root,modeIndex,progression:[...progression]};
  }

  let saveTimer = null;
  function saveState(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => localStorage.setItem("auralFieldState", JSON.stringify(serializeState())),120);
  }

  async function restoreState(){
    try{
      const raw = localStorage.getItem("auralFieldState");
      const s = raw ? JSON.parse(raw) : null;
      if(!s) return false;
      density.value = clamp(Number(s.density ?? 42),0,100);
      space.value = clamp(Number(s.space ?? 64),0,100);
      motion.value = clamp(Number(s.motion ?? 34),0,100);
      mx = clamp(Number(s.mx ?? .44));
      my = clamp(Number(s.my ?? .35));
      seed = Number.isFinite(Number(s.seed)) ? Number(s.seed) : seed;
      root = Number.isFinite(Number(s.root)) ? Number(s.root) : root;
      modeIndex = clamp(Number(s.modeIndex ?? 0),0,MODES.length-1);
      progression = Array.isArray(s.progression) && s.progression.length ? s.progression : progression;
      rand = mulberry32(seed);
      return true;
    }catch(e){
      console.warn("Could not restore state", e);
      return false;
    }
  }

  function newWorld(){
    seed = Math.floor(Math.random()*9999);
    rand = mulberry32(seed);
    root = pick(ROOTS);
    progression = pick([[0,3,4,1],[0,4,5,3],[0,2,5,4],[0,5,3,4],[0,1,3,5],[0,4,2,1]]);
    chordIndex = 0;
    syncUI();
    saveState();
  }

  function pathForIcon(idx){
    const pts=[];
    for(let i=0;i<=72;i++){
      const t=i/72*TAU;
      let x=0,y=0;
      if(idx===0){const r=.28+.1*Math.sin(5*t);x=.5+Math.cos(t)*r;y=.5+Math.sin(t)*r}
      if(idx===1){const r=.27+.08*Math.sin(3*t)+.04*Math.sin(7*t);x=.5+Math.cos(t)*r;y=.5+Math.sin(t)*r}
      if(idx===2){const r=.25+.11*Math.pow(Math.abs(Math.cos(4*t)),4);x=.5+Math.cos(t)*r;y=.5+Math.sin(t)*r}
      if(idx===3){x=.5+.28*Math.cos(t);y=.5+.18*Math.sin(t)+.06*Math.sin(5*t)}
      if(idx===4){const r=.26+.05*Math.cos(3*t);x=.5+Math.cos(t)*r;y=.5+Math.sin(t)*r}
      if(idx===5){x=.5+.26*Math.sin(2*t+.5);y=.5+.24*Math.sin(3*t)}
      pts.push((i?"L":"M")+(x*100).toFixed(1)+" "+(y*100).toFixed(1));
    }
    return pts.join(" ");
  }

  function renderModes(){
    modeGrid.innerHTML = MODES.map((m,i)=>`<button class="mode-btn ${i===modeIndex?"active":""}" data-i="${i}" aria-label="${m.label}"><svg viewBox="0 0 100 100"><path d="${pathForIcon(i)}"/></svg><em>${m.short}</em></button>`).join("");
    modeGrid.querySelectorAll(".mode-btn").forEach(b => b.addEventListener("click", () => {
      modeIndex = Number(b.dataset.i);
      chordIndex = 0;
      renderModes();
      syncUI();
      saveState();
      if(playing && audio){nextChord = audio.currentTime + .05;swellChord(audio.currentTime + .03);}
    }));
  }

  function impulse(sec=7,decay=2.8){
    const b=audio.createBuffer(2,audio.sampleRate*sec,audio.sampleRate);
    for(let c=0;c<2;c++){
      const d=b.getChannelData(c);
      for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,decay);
    }
    return b;
  }
  function noiseBuffer(sec=.8){
    const b=audio.createBuffer(1,audio.sampleRate*sec,audio.sampleRate),d=b.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    return b;
  }
  function makeWave(){
    const harmonicCount=4+Math.round(D()*18);
    const real=new Float32Array(harmonicCount+1),imag=new Float32Array(harmonicCount+1);
    const brightness=.8+mx*3.8,oddBias=.35+my*.95;
    for(let h=1;h<=harmonicCount;h++{const rolloff=1/Math.pow(h,.8+brightness*.38);const parity=(h%2?1:1-oddBias*.42);imag[h]=rolloff*parity*(.75+rand()*.5);}
    return audio.createPeriodicWave(real,imag,{disableNormalization:false});
  }
  function panNode(width=1){const p=audio.createStereoPanner();p.pan.value=(rand()*2-1)*width*S();return p;}
  function env(g,t,a,h,r,pk){g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,pk),t+a);g.gain.setValueAtTime(Math.max(.0002,pk*.82),t+a+h);g.gain.exponentialRampToValueAtTime(.0001,t+a+h+r);}
  function lfoParam(target,t,duration,depth,rate){const l=audio.createOscillator(),lg=audio.createGain();l.type="sine";l.frequency.value=rate;lg.gain.value=depth;l.connect(lg).connect(target);l.start(t);l.stop(t+duration+.1);}

  async function initAudio(){
    if(audio) return;
    audio=new (window.AudioContext||window.webkitAudioContext)();
    master=audio.createGain();master.gain.value=.54;
    const compressor=audio.createDynamicsCompressor();compressor.threshold.value=-19;compressor.knee.value=18;compressor.ratio.value=2.3;compressor.attack.value=.04;compressor.release.value=.5;
    dry=audio.createGain();wet=audio.createGain();const conv=audio.createConvolver();conv.buffer=impulse();delay=audio.createDelay(2);feedback=audio.createGain();delay.connect(feedback).connect(delay);analyser=audio.createAnalyser();analyser.fftSize=512;analyser.smoothingTimeConstant=.86;
    outputGain=audio.createGain();outputGain.gain.value=0;
    master.connect(dry).connect(compressor);master.connect(conv).connect(wet).connect(compressor);master.connect(delay).connect(compressor);compressor.connect(analyser).connect(outputGain).connect(audio.destination);
    const ns=audio.createBufferSource();ns.buffer=noiseBuffer(2);ns.loop=true;const bp=audio.createBiquadFilter();bp.type="bandpass";bp.frequency.value=700+mx*1700;bp.Q.value=.5+my*1.2;const ng=audio.createGain();ng.gain.value=.004+my*.012;ns.connect(bp).connect(ng).connect(master);ns.start();
    updateAudioMacros();
  }

  function updateAudioMacros(){syncUI();saveState();if(!audio)return;const sS=S(),d=D();wet.gain.setTargetAtTime(.06+sS*.88,audio.currentTime,.08);dry.gain.setTargetAtTime(.98-sS*.38,audio.currentTime,.08);delay.delayTime.setTargetAtTime(.09+sS*.72,audio.currentTime,.08);feedback.gain.setTargetAtTime(.04+sS*.38,audio.currentTime,.08);master.gain.setTargetAtTime(.46+d*.12,audio.currentTime,.08);}

  function harmonicVoice(n,t,amp=1){const osc=audio.createOscillator(),f=audio.createBiquadFilter(),gg=audio.createGain(),p=panNode(1);osc.setPeriodicWave(makeWave());osc.frequency.value=midi(n);osc.detune.value=(rand()*2-1)*(2+M()*16);f.type="lowpass";f.frequency.value=5002mx*5600;f.Q.value=.3+D()*4.6;const duration=4.5+S()*8;const attack=.18+(1-mx)*2.2;env(gg,t,attack,Math.max(.2,duration-attack-2.2),2.2+S()*2.8,.024*amp);lfoParam(osc.detune,t,duration,2+M()*26,.03+M()*1.7);lfoParam(f.frequency,t,duration,60+M()*1000,.025+M()*.75);osc.connect(f).connect(gg).connect(p).connect(master);osc.start(t);osc.stop(t+duration+.2);burst(.55+mx*.35);}
  function subVoice(n,t,amp=1){const o=audio.createOscillator(),f=audio.createBiquadFilter(),gg=audio.createGain();o.type="sine";o.frequency.value=midi(n-12-(S()>.72?12:0));f.type="lowpass";f.frequency.value=130+mx*220;f.Q.value=.5;env(gg,t,.45,3+S()*3,3.2+S()*2,.028*amp*(1-my*.35));lfoParam(o.detune,t,9,1+M()*8,.05+M()*.3);o.connect(f).connect(gg).connect(master);o.start(t);o.stop(t+10);burst(.45);}
  function glassVoice(n,t,amp=1){const car=audio.createOscillator(),mod=audio.createOscillator(),mg=audio.createGain(),hp=audio.createBiquadFilter(),gg=audio.createGain(),p=panNode(1),hz=midi(n+(S()>.6?12:0));car.type="sine";mod.type="sine";car.frequency.value=hz;mod.frequency.value=hz*(1.45+mx*2.5);mg.gain.value=hz*(.08+mx*.55+my*.35);mod.connect(mg).connect(car.frequency);hp.type="highpass";hp.frequency.value=300+mx*1000;env(gg,t,.008,.02,1.6+S()*4,.014*amp*(.6+myà¤¤í…È¹½¹¹•Ð¡¡À¤¹½¹¹•Ð¡œ¤¹½¹¹•Ð¡À¤¹½¹¹•Ð¡µ…ÍÑ•È¤í…È¹ÍÑ…ÉÐ¡Ð¤íµ½¹ÍÑ…ÉÐ¡Ð¤í…È¹ÍÑ½À¡Ð¬Ø¤íµ½¹ÍÑ½À¡Ð¬Ø¤í‰ÕÉÍÐ ¸ä¤íô(€™Õ¹Ñ¥½¸‘ÕÍÑY½¥”¡¸±Ð±…µÀôÄ¥í½¹ÍÐÍÉŒõ…Õ‘¥¼¹É•…Ñ•	Õ™™•ÉM½ÕÉ” ¤±‰Àõ…Õ‘¥¼¹É•…Ñ•	¥ÅÕ…‘¥±Ñ•È ¤±œõ…Õ‘¥¼¹É•…Ñ•…¥¸ ¤±ÀõÁ…¹9½‘” Ä¤íÍÉŒ¹‰Õ™™•Èõ¹½¥Í•	Õ™™•È ¸ÔÔ­µä¨¸ØÔ¤í‰À¹ÑåÁ”ô‰‰…¹‘Á…ÍÌˆí‰À¹™É•ÅÕ•¹ä¹Ù…±Õ”õµ¥‘¤¡¸¬ÄÈ¤¨ Ä­É…¹ ¤¨¸ÀÈÔ¤í‰À¹D¹Ù…±Õ”ôÔ­µä¨ÈÈí•¹Ø¡œ±Ð°¸ÀÀà°¸ÀÄ°¸ÌÔ­L ¤¨Ä¸Ü°¸ÀÄÀ©¥±ä¨Ä¸Ô¤íÍÉŒ¹½¹¹•Ð¡‰À¤¹½¹¹•Ð¡œ¤¹½¹¹•Ð¡À¤¹½¹¹•Ð¡µ…ÍÑ•È¤íÍÉŒ¹ÍÑ…ÉÐ¡Ð¤íÍÉŒ¹ÍÑ½À¡Ð¬È¸Ô¤í‰ÕÉÍÐ ¸ØÔ­µä¨¸ÈÔ¤íô(€™Õ¹Ñ¥½¸ÁÕ±Í•Y½¥”¡¸±Ð±…µÀôÄ¥í½¹ÍÐ¼õ…Õ‘¥¼¹É•…Ñ•=Í¥±±…Ñ½È ¤±˜õ…Õ‘¥¼¹É•…Ñ•	¥ÅÕ…‘¥±Ñ•È ¤±œõ…Õ‘¥¼¹É•…Ñ•…¥¸ ¤±ÀõÁ…¹9½‘” Ä¤í¼¹ÑåÁ”õµàø¸ØÔü‰Í…ÝÑ½½Ñ ˆè‰ÑÉ¥…¹±”ˆí¼¹™É•ÅÕ•¹ä¹Ù…±Õ”õµ¥‘¤¡¸¬ÄÈ¤í˜¹ÑåÁ”ô‰±½ÝÁ…ÍÌˆí˜¹™É•ÅÕ•¹ä¹Ù…±Õ”ôÜÀÀ­µà¨ÐÈÀÀí˜¹D¹Ù…±Õ”ô¸Ø­ ¤¨Ôí•¹Ø¡œ±Ð°¸ÀÀØ°¸ÀÄÔ°¸ÄÈ­4 ¤¨¸Ì°¸ÀÀä©…µÀ¤í¼¹½¹¹•Ð¡˜¤¹½¹¹•Ð¡œ¤¹½¹¹•Ð¡À¤¹½¹¹•Ð¡µ…ÍÑ•È¤í¼¹ÍÑ…ÉÐ¡Ð¤í¼¹ÍÑ½À¡Ð¬¸ØÔ¤í‰ÕÉÍÐ ¸Ø¤ì(€ô(€™Õ¹Ñ¥½¸½É¡•ÍÑÉ…Ñ”¡¸±Ð¥í½¹ÍÐõ ¤±ÌõL ¤±´õ4 ¤í¡…Éµ½¹¥Y½¥”¡¸±Ð°¸Ü­¨¸à¤í¥˜¡É…¹ ¤ð¸Äà­¨¸ÔÈ¥±…ÍÍY½¥”¡¸±Ð¬¸ÀÈ°¸ÔÔ­Ì¨¸ÌÔ¤í¥˜¡É…¹ ¤ð¸Àà­µä¨¸ÔÈ¥‘ÕÍÑY½¥”¡¸±Ð¬¸ÀÌ°¸Ô­µä¨¸ØÔ¤í¥˜¡É…¹ ¤ð¸ÄÈ¬ Äµµä¤¨¸ÐÈ¥ÍÕ‰Y½¥”¡¸±Ð°¸ÐÔ­Ì¨¸Ì¤í¥˜¡É…¹ ¤ð¸ÀØ­´¨¸Ðà­¨¸Äà¥ÁÕ±Í•Y½¥”¡¸±Ð¬¸ÀÄ°¸ÔÔ­´¨¸ÌÔ¤í¥˜¡ø¸ÜÈ˜™É…¹ ¤ð¸Ì¥¡…Éµ½¹¥Y½¥”¡¸¬ÄÈ±Ð¬¸Àà°¸ÐÈ¤íô(€™Õ¹Ñ¥½¸ÍÝ•±±¡½É¡Ð¥í½¹ÍÐŒõ¡½É ¤±õ ¤±ÌõL ¤±Ù½¥•ÌôÈ­5…Ñ ¹É½Õ¹¡¨Ð¤í™½È¡±•Ð¤ôÀí¤ñÙ½¥•Ìí¤¬¬¥í½¹ÍÐ¸õm¤•Œ¹±•¹Ñ¡t¬¡Ìø¸ÜÈ˜™¤øÈüÄÈèÀ¤´¡¤ôôôÀüÄÈèÀ¤í¡…Éµ½¹¥Y½¥”¡¸±Ð­É…¹ ¤¨ ¸ÄÔ­Ì¨¸ØÔ¤°¸ÌØ¬¸ÐÈ©¤í¥˜¡¤ôôôÀ˜™É…¹ ¤ð¸à¥ÍÕ‰Y½¥”¡¸±Ð°¸ÔÔ¤íõô(€™Õ¹Ñ¥½¸Í¡•‘Õ±” ¥í¥˜ …Á±…å¥¹ñð……Õ‘¥¼¥É•ÑÕÉ¸í½¹ÍÐ¹½Üõ…Õ‘¥¼¹ÕÉÉ•¹ÑQ¥µ”±õ ¤±´õ4 ¤íÝ¡¥±”¡¹•áÑÙ•¹Ðñ¹½Ü¬¸ÔÔ¥í¥˜¡É…¹ ¤ð¸Èà­¨¸Øà¥í½¹ÍÐŒõ¡½É ¤±¸õÁ¥¬¡Œ¤¬¡É…¹ ¤ð ¸ÀØ­L ¤¨¸ÈÈ¤üÄÈèÀ¤í½É¡•ÍÑÉ…Ñ”¡¸±¹•áÑÙ•¹Ð¤íõ¥˜¡ø¸Ôà˜™É…¹ ¤ð¸Àà­´¨¸ÈØ¥ÁÕ±Í•Y½¥”¡Á¥¬¡¡½É ¤¤¬ÄÈ±¹•áÑÙ•¹Ð¬¸Àä°¸Ô¤í¹•áÑÙ•¹Ð¬õ5…Ñ ¹µ…à ¸Èà°È¸äµ¨Ä¸äÔµ´¨¸ØÈ­É…¹ ¤¨Ä¸ÌÔ¤íõ¥˜¡¹½Üù¹•áÑ¡½É¥í¡½É‘%¹‘•àô¡¡½É‘%¹‘•à¬Ä¤•ÁÉ½É•ÍÍ¥½¸¹±•¹Ñ íÍå¹U$ ¤íÍÝ•±±¡½É¡¹½Ü¬¸ÀÐ¤í¹•áÑ¡½Éõ¹½Ü¬ ÄÀ¸Ôµ´¨Ô¸àµ¨Ä¸È¤­É…¹ ¤¨Ì¸Ðíõô(€…Íå¹Œ™Õ¹Ñ¥½¸Õ¹±½­Õ‘¥¼ ¥ì(€€€…Ý…¥Ð¥¹¥ÑÕ‘¥¼ ¤ì(€€€¥˜¡…Õ‘¥¼¹ÍÑ…Ñ”€ôôô€‰ÍÕÍÁ•¹‘•ˆ¤…Ý…¥Ð…Õ‘¥¼¹É•ÍÕµ” ¤ì(€€€É•ÑÕÉ¸…Õ‘¥¼¹ÍÑ…Ñ”€ôôô€‰ÉÕ¹¹¥¹œˆì(€ô((€…Íå¹Œ™Õ¹Ñ¥½¸Ñ½±” ¥ì(€€€ÑÉåì(€€€€€½¹ÍÐÉ•…‘ä€ô…Ý…¥ÐÕ¹±½­Õ‘¥¼ ¤ì(€€€€€¥˜ …É•…‘ä¤Ñ¡É½Ü¹•ÜÉÉ½È¡Õ‘¥½½¹Ñ•áÐ¥Ì€‘í…Õ‘¥¼¹ÍÑ…Ñ•õ€¤ì((€€€€€Á±…å¥¹œ€ô€…Á±…å¥¹œì(€€€€€¥¹ÍÑÉÕµ•¹Ð¹±…ÍÍ1¥ÍÐ¹Ñ½±” ‰Á±…å¥¹œˆ±Á±…å¥¹œ¤ì(€€€€€ÍÑ…Ñ•°¹Ñ•áÑ½¹Ñ•¹Ð€ôÁ±…å¥¹œ€ü€‰•¹•É…Ñ¥¹œˆ€è€‰Á…ÕÍ•ˆì((€€€€€¥˜¡Á±…å¥¹œ¥ì(€€€€€€€±•…É%¹Ñ•ÉÙ…°¡Í¡•‘Õ±•È¤ì(€€€€€€€½ÕÑÁÕÑ…¥¸¹…¥¸¹…¹•±M¡•‘Õ±•‘Y…±Õ•Ì¡…Õ‘¥¼¹ÕÉÉ•¹ÑQ¥µ”¤ì(€€€€€€€½ÕÑÁÕÑ…¥¸¹…¥¸¹Í•ÑY…±Õ•ÑQ¥µ”¡½ÕÑÁÕÑ…¥¸¹…¥¸¹Ù…±Õ”±…Õ‘¥¼¹ÕÉÉ•¹ÑQ¥µ”¤ì(€€€€€€€½ÕÑÁÕÑ…¥¸¹…¥¸¹±¥¹•…ÉI…µÁQ½Y…±Õ•ÑQ¥µ” Ä±…Õ‘¥¼¹ÕÉÉ•¹ÑQ¥µ”¬¸Àà¤ì(€€€€€€€¹•áÑÙ•¹Ðõ…Õ‘¥¼¹ÕÉÉ•¹ÑQ¥µ”¬¸ÄÈì(€€€€€€€¹•áÑ¡½Éõ…Õ‘¥¼¹ÕÉÉ•¹ÑQ¥µ”¬¸Èì(€€€€€€€ÍÝ•±±¡½É¡…Õ‘¥¼¹ÕÉÉ•¹ÑQ¥µ”¬¸ÀÌ¤ì(€€€€€€€Í¡•‘Õ±•ÈõÍ•Ñ%¹Ñ•ÉÙ…°¡Í¡•‘Õ±”°ÄÀÀ¤ì(€€€€€õ•±Í•ì(€€€€€€€±•…É%¹Ñ•ÉÙ…°¡Í¡•‘Õ±•È¤ì(€€€€€€€Í¡•‘Õ±•Èõ¹Õ±°ì(€€€€€€€½ÕÑÁÕÑ…¥¸¹…¥¸¹…¹•±M¡•‘Õ±•‘Y…±Õ•Ì¡…Õ‘¥¼¹ÕÉÉ•¹ÑQ¥µ”¤ì(€€€€€€€½ÕÑÁÕÑ…¥¸¹…¥¸¹Í•ÑY…±Õ•ÑQ¥µ”¡½ÕÑÁÕÑ…¥¸¹…¥¸¹Ù…±Õ”±…Õ‘¥¼¹ÕÉÉ•¹ÑQ¥µ”¤ì(€€€€€€€½ÕÑÁÕÑ…¥¸¹…¥¸¹±¥¹•…ÉI…µÁQ½Y…±Õ•ÑQ¥µ” À±…Õ‘¥¼¹ÕÉÉ•¹ÑQ¥µ”¬¸ÀØ¤ì(€€€€€ô(€€€õ…Ñ ¡•ÉÈ¥ì(€€€€€½¹Í½±”¹•ÉÉ½È ‰ÕÉ…°¥•±½Õ±¹½ÐÍÑ…ÉÐ…Õ‘¥¼ˆ±•ÉÈ¤ì(€€€€€ÍÑ…Ñ•°¹Ñ•áÑ½¹Ñ•¹Ðô‰…Õ‘¥¼‰±½­•ˆì(€€€€€¥¹ÍÑÉÕµ•¹Ð¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‰Á±…å¥¹œˆ¤ì(€€€€€Á±…å¥¹œõ™…±Í”ì(€€€ô(€ô((€™Õ¹Ñ¥½¸Á…É•¹ÑA½¥¹Ð¡­¥¹±Ð±™É•Ä±…µÀ±Á¡…Í”¥í±•ÐàôÀ±äôÀí¥˜¡­¥¹ôôô‰‰±½½´ˆ¥í½¹ÍÐÈô¸ØÈ­…µÀ©5…Ñ ¹Í¥¸¡™É•Ä©Ð­Á¡…Í”¤¨ ¸ÔÔ¬¸ÐÔ©5…Ñ ¹½Ì È©Ð¤¤íàõ5…Ñ ¹½Ì¡Ð¤©Èíäõ5…Ñ ¹Í¥¸¡Ð¤©Èíõ•±Í”¥˜¡­¥¹ôôô‰™½±ˆ¥í½¹ÍÐÈô¸ØÌ­…µÀ¨ ¸ØÔ©5…Ñ ¹Í¥¸¡™É•Ä©Ð­Á¡…Í”¤¬¸ÌÔ©5…Ñ ¹Í¥¸ ¡™É•Ä¨¸Ô¬È¤©ÐµÁ¡…Í”¤¤íàõ5…Ñ ¹½Ì¡Ð¤©È¨ Ä¬¸ÄÈ©5…Ñ ¹Í¥¸ È©Ð¤¤íäõ5…Ñ ¹Í¥¸¡Ð¤©Èíõ•±Í”¥˜¡­¥¹ôôô‰¡…±¼ˆ¥í½¹ÍÐÈô¸ØÀ­…µÀ©5…Ñ ¹Á½Ü¡5…Ñ ¹…‰Ì¡5…Ñ ¹½Ì¡™É•Ä©Ð¨¸Ô­Á¡…Í”¤¤°È¸Ø¤íàõ5…Ñ ¹½Ì¡Ð¤©Èíäõ5…Ñ ¹Í¥¸¡Ð¤©Èíõ•±Í”¥˜¡­¥¹ôôô‰‘É¥™Ðˆ¥íàô¸Øà©5…Ñ ¹½Ì¡Ð¤íäô¸ÔÀ©5…Ñ ¹Í¥¸¡Ð¤­…µÀ¨¸Ü©5…Ñ ¹Í¥¸¡™É•Ä©Ð­Á¡…Í”¤íõ•±Í”¥˜¡­¥¹ôôô‰½É‰¥Ðˆ¥í½¹ÍÐÈô¸ØÈ­…µÀ¨¸ÔÈ©5…Ñ ¹½Ì¡™É•Ä©Ð­Á¡…Í”¤íàõ5…Ñ ¹½Ì¡Ð¤©È­…µÀ¨¸ÈÐ©5…Ñ ¹½Ì Ì©Ð­Á¡…Í”¤íäõ5…Ñ ¹Í¥¸¡Ð¤©È­…µÀ¨¸Äà©5…Ñ ¹Í¥¸ È©ÐµÁ¡…Í”¤íõ•±Í•íàô¸Ôà©5…Ñ ¹Í¥¸ È©Ð­Á¡…Í”¤­…µÀ¨¸ÌÐ©5…Ñ ¹Í¥¸¡™É•Ä©Ð¨¸ÐÔ¤íäô¸ÔÐ©5…Ñ ¹Í¥¸ Ì©Ð¤­…µÀ¨¸ÈØ©5…Ñ ¹½Ì ¡™É•Ä¨¸Ô¬Ä¤©ÐµÁ¡…Í”¤íõÉ•ÑÕÉ¹mà±åtíô(€™Õ¹Ñ¥½¸‰ÕÉÍÐ¡¥¹Ñ•¹Í¥Ñäô¸Ü¥í‰ÕÉÍÑÌ¹ÁÕÍ ¡í„éÉ…¹ ¤©QT±±¥™”èÄ±ÍÁ••è¸Ä­É…¹ ¤¨¸Äà±¥¹Ñ•¹Í¥Ñåô¤í™½È¡±•Ð¤ôÀí¤ðÄ­5…Ñ ¹™±½½È¡¥¹Ñ•¹Í¥Ñä¨Ì¤í¤¬¬¥Á…ÉÑ¥±•Ì¹ÁÕÍ ¡í„éÉ…¹ ¤©QT±Èè¸Ì­É…¹ ¤¨¸Ô±±¥™”è¸Ð­É…¹ ¤¨¸Ø±‘Èè¡É…¹ ¤´¸Ð¤¨¸ÀÀÐ±‘„è¡É…¹ ¤´¸Ô¤¨¸ÀÀáô¤íô((€™Õ¹Ñ¥½¸É•Í¥é•…¹Ù…Ì ¥í½¹ÍÐÈõ¥¹ÍÑÉÕµ•¹Ð¹•Ñ	½Õ¹‘¥¹±¥•¹ÑI•Ð ¤í¥˜¡È¹Ý¥‘Ñ ðÉññÈ¹¡•¥¡ÐðÈ¥É•ÑÕÉ¸í‘ÁÈõ5…Ñ ¹µ¥¸ ¡¥¹ÍÑÉÕµ•¹Ð¹½Ý¹•É½Õµ•¹Ð¹‘•™…Õ±ÑY¥•Ü¹‘•Ù¥•A¥á•±I…Ñ¥½ñðÄ¤°È¤í\õÈ¹Ý¥‘Ñ í õÈ¹¡•¥¡Ðí…¹Ù…Ì¹Ý¥‘Ñ õ5…Ñ ¹É½Õ¹¡\©‘ÁÈ¤í…¹Ù…Ì¹¡•¥¡Ðõ5…Ñ ¹É½Õ¹¡ ©‘ÁÈ¤í…¹Ù…Ì¹ÍÑå±”¹Ý¥‘Ñ õ\¬‰Áàˆí…¹Ù…Ì¹ÍÑå±”¹¡•¥¡Ðõ ¬‰Áàˆíœ¹Í•ÑQÉ…¹Í™½É´¡‘ÁÈ°À°À±‘ÁÈ°À°À¤íô(€¹•ÜI•Í¥é•=‰Í•ÉÙ•È¡É•Í¥é•…¹Ù…Ì¤¹½‰Í•ÉÙ”¡¥¹ÍÑÉÕµ•¹Ð¤ì(€Ý¥¹‘½Ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰É•Í¥é”ˆ±É•Í¥é•…¹Ù…Ì¤ì((€™Õ¹Ñ¥½¸‘É…Ü ¥íÉ•ÅÕ•ÍÑ¹¥µ…Ñ¥½¹É…µ”¡‘É…Ü¤í±•Ð”ôÀí¥˜¡…¹…±åÍ•È˜™Á±…å¥¹œ¥í½¹ÍÐõ¹•ÜU¥¹ÐáÉÉ…ä¡…¹…±åÍ•È¹™É•ÅÕ•¹å	¥¹½Õ¹Ð¤í…¹…±åÍ•È¹•Ñ	åÑ•É•ÅÕ•¹å…Ñ„¡¤í±•ÐÍÕ´ôÀí™½È¡±•Ð¤ôÀí¤ðÜÈí¤¬¬¥ÍÕ´¬õ‘m¥tí”ô¡ÍÕ´¼ÜÈ¤¼ÈÔÔíõ•¹•Éäõ•¹•Éä¨¸äÈ­”¨¸Ààí¥˜¡\ðÉññ ðÈ¥É•ÑÕÉ¸í½¹ÍÐÐõÁ•É™½Éµ…¹”¹¹½Ü ¤¼ÄÀÀÀíœ¹±•…ÉI•Ð À°À±\± ¤í½¹ÍÐ¥ÍA¥ÀõÑÉÕ”í¥˜ …¥ÍA¥À¥íœ¹ÍÑÉ½­•MÑå±”ô‰É‰„ ÈÄ°ÈÄ°Äà°¸ÀÌÔ¤ˆíœ¹±¥¹•]¥‘Ñ ôÄíœ¹‰•¥¹A…Ñ  ¤íœ¹µ½Ù•Q¼¡\¨¸Ô°ÜÈ¤íœ¹±¥¹•Q¼¡\¨¸Ô± ´äØ¤íœ¹ÍÑÉ½­” ¤íœ¹‰•¥¹A…Ñ  ¤íœ¹µ½Ù•Q¼ àÐ± ¨¸ÐÜ¤íœ¹±¥¹•Q¼¡\´àÐ± ¨¸ÐÜ¤íœ¹ÍÑÉ½­” ¤íõ½¹ÍÐàõ\¨¸ÔÀ±äõ¥ÍA¥Àý ¨¸ÐÌé ¨¸ÐØ±‰…Í”õ5…Ñ ¹µ¥¸¡\± ¤¨¡¥ÍA¥Àü¸ÌÐè¡\ðØÜÀü¸Èàè¸ÌÄ¤¤±™É•Äõ™½ÉµÉ•ÅÕ•¹ä ¤±…µÀõ™½ÉµµÁ±¥ÑÕ‘” ¤±ÍÁ••õÁ¡…Í•MÁ•• ¤±Á¡…Í”õÐ©ÍÁ••±µ½ÉÁ¡`ô¡µà´¸Ô¤¨¸Äà±µ½ÉÁ¡dô¡µä´¸Ô¤¨¸ÄØí½¹ÍÐ¡½ÍÑ½Õ¹Ðõ¥ÍA¥ÀüÄ­5…Ñ ¹™±½½È¡ ¤¨Ì¤èÈ­5…Ñ ¹™±½½È¡ ¤¨Ô¤í™½È¡±•Ð õ¡½ÍÑ½Õ¹Ðí øôÄí ´´¥í½¹ÍÐÍ…±”ôÄ­ ¨ ¸ÀÄÈ¬¸ÀÄ©L ¤¤íœ¹‰•¥¹A…Ñ  ¤í™½È¡±•Ð¤ôÀí¤ðôÈÈÀí¤¬¬¥í½¹ÍÐÑÐõ¤¼ÈÈÀ©QT±ÀõÁ…É•¹ÑA½¥¹Ð¡µ½‘” ¤¹™¸±ÑÐ±™É•Ä­ ¨¸ÄÄ±…µÀ¨ Äµ ¨¸ÀÈÔ¤±Á¡…Í”µ ¨¸Àà¤±àõà¬¡ÁlÁt­µ½ÉÁ¡`©5…Ñ ¹Í¥¸¡ÑÐ¨È¤¤©‰…Í”©Í…±”±äõä¬¡ÁlÅt­µ½ÉÁ¡d©5…Ñ ¹½Ì¡ÑÐ¨Ì¤¤©‰…Í”©Í…±”í¥˜¡¤ôôôÀ¥œ¹µ½Ù•Q¼¡à±ä¤í•±Í”œ¹±¥¹•Q¼¡à±ä¤íõœ¹±½Í•A…Ñ  ¤íœ¹ÍÑÉ½­•MÑå±”õÉ‰„ ÈÄ°ÈÄ°Äà°‘ì¸ÀÄà­ ¨¸ÀÄÉô¥€íœ¹±¥¹•]¥‘Ñ ô¸Üíœ¹ÍÑÉ½­” ¤íõœ¹‰•¥¹A…Ñ  ¤í™½È¡±•Ð¤ôÀí¤ðôÌÀÀí¤¬¬¥í½¹ÍÐÑÐõ¤¼ÌÀÀ©QT±ÀõÁ…É•¹ÑA½¥¹Ð¡µ½‘” ¤¹™¸±ÑÐ±™É•Ä±…µÀ¨ Ä­•¹•Éä¨¸ÄÈ¤±Á¡…Í”¤±ÍÁ•ÑÉ…°ô¸ÀÄà©µä©5…Ñ ¹Í¥¸¡ÑÐ¨ Ì­5…Ñ ¹™±½½È¡ ¤¨à¤¤­Á¡…Í”¨Ä¸à¤±àõà¬¡ÁlÁt­µ½ÉÁ¡`©5…Ñ ¹Í¥¸¡ÑÐ¨È¤­ÍÁ•ÑÉ…°¤©‰…Í”±äõä¬¡ÁlÅt­µ½ÉÁ¡d©5…Ñ ¹½Ì¡ÑÐ¨Ì¤µÍÁ•ÑÉ…°¨¸Ü¤©‰…Í”í¥˜¡¤ôôôÀ¥œ¹µ½Ù•Q¼¡à±ä¤í•±Í”œ¹±¥¹•Q¼¡à±ä¤íõœ¹±½Í•A…Ñ  ¤íœ¹ÍÑÉ½­•MÑå±”ô‰É‰„ ÈÄ°ÈÄ°Äà°¸äÈ¤ˆíœ¹±¥¹•]¥‘Ñ ôÄ¸ÄÔ­•¹•Éä¨¸àíœ¹ÍÑÉ½­” ¤í½¹ÍÐµ…É­½Õ¹ÐôÌ­5…Ñ ¹™±½½È¡ ¤¨ÄÀ¤í™½È¡±•Ð¤ôÀí¤ñµ…É­½Õ¹Ðí¤¬¬¥í½¹ÍÐ„õ¤½µ…É­½Õ¹Ð©QT­Á¡…Í”¨¸ÀÜ±ÀõÁ…É•¹ÑA½¥¹Ð¡µ½‘” ¤¹™¸±„±™É•Ä±…µÀ±Á¡…Í”¤±àõà¬¡ÁlÁt­µ½ÉÁ¡`©5…Ñ ¹Í¥¸¡„¨È¤¤©‰…Í”±äõä¬¡ÁlÅt­µ½ÉÁ¡d©5…Ñ ¹½Ì¡„¨Ì¤¤©‰…Í”íœ¹‰•¥¹A…Ñ  ¤íœ¹…ÉŒ¡à±ä°Ä¸ÄÔ­•¹•Éä¨Ä¸Ð°À±QT¤íœ¹™¥±±MÑå±”õ¤ôôôÀüˆ™˜ÕÌÔˆè‰É‰„ ÈÄ°ÈÄ°Äà°¸ÐÈ¤ˆíœ¹™¥±° ¤íõ‰ÕÉÍÑÌõ‰ÕÉÍÑÌ¹™¥±Ñ•È¡ˆôùˆ¹±¥™”øÀ¤í‰ÕÉÍÑÌ¹™½É… ¡ˆôùíˆ¹±¥™”´ô¸ÀÄÈíˆ¹„¬õˆ¹ÍÁ••¨¸ÀÄ¨ Ä­4 ¤¨È¤í½¹ÍÐÀõÁ…É•¹ÑA½¥¹Ð¡µ½‘” ¤¹™¸±ˆ¹„±™É•Ä±…µÀ±Á¡…Í”¤±àõà¬¡ÁlÁt­µ½ÉÁ¡`©5…Ñ ¹Í¥¸¡ˆ¹„¨È¤¤©‰…Í”±äõä¬¡ÁlÅt­µ½ÉÁ¡d©5…Ñ ¹½Ì¡ˆ¹„¨Ì¤¤©‰…Í”±ÉÈô Äµˆ¹±¥™”¤¨ÈÐ¨ ¸Ô­L ¤¤íœ¹‰•¥¹A…Ñ  ¤íœ¹…ÉŒ¡à±ä±ÉÈ°À±QT¤íœ¹ÍÑÉ½­•MÑå±”õÉ‰„ ÈÔÔ°äÌ°ÔÌ°‘íˆ¹±¥™”¨¸ÈÉô¥€íœ¹±¥¹•]¥‘Ñ ô¸àíœ¹ÍÑÉ½­” ¤íô¤íÁ…ÉÑ¥±•ÌõÁ…ÉÑ¥±•Ì¹™¥±Ñ•È¡ÀôùÀ¹±¥™”øÀ¤íÁ…ÉÑ¥±•Ì¹™½É… ¡ÀôùíÀ¹±¥™”´ô¸ÀÀàíÀ¹È¬õÀ¹‘ÈíÀ¹„¬õÀ¹‘„¨ Ä­4 ¤¨È¤í½¹ÍÐàõà­5…Ñ ¹½Ì¡À¹„¤©‰…Í”©À¹È±äõä­5…Ñ ¹Í¥¸¡À¹„¤©‰…Í”©À¹È¨¸àíœ¹™¥±±MÑå±”õÉ‰„ ÈÄ°ÈÄ°Äà°‘íÀ¹±¥™”¨¸Éô¥€íœ¹™¥±±I•Ð¡à±ä°Ä¸È°Ä¸È¤íô¤íô(€‘É…Ü ¤ì((€™Õ¹Ñ¥½¸Í•Ñ5…Ñ•É¥…°¡”¥í½¹ÍÐÈõµ…Ñ•É¥…°¹•Ñ	½Õ¹‘¥¹±¥•¹ÑI•Ð ¤íµàõ±…µÀ ¡”¹±¥•¹Ñ`µÈ¹±•™Ð¤½È¹Ý¥‘Ñ ¤íµäõ±…µÀ ¡”¹±¥•¹ÑdµÈ¹Ñ½À¤½È¹¡•¥¡Ð¤íÍå¹U$ ¤íÍ…Ù•MÑ…Ñ” ¤íô(€µ…Ñ•É¥…°¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰Á½¥¹Ñ•É‘½Ý¸ˆ±”ôùí‘É…œõÑÉÕ”íµ…Ñ•É¥…°¹Í•ÑA½¥¹Ñ•É…ÁÑÕÉ”¡”¹Á½¥¹Ñ•É%¤íÍ•Ñ5…Ñ•É¥…°¡”¤íô¤ì(€µ…Ñ•É¥…°¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰Á½¥¹Ñ•Éµ½Ù”ˆ±”ôùí¥˜¡‘É…œ¥Í•Ñ5…Ñ•É¥…°¡”¤íô¤ì(€µ…Ñ•É¥…°¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰Á½¥¹Ñ•ÉÕÀˆ±”ôùí‘É…œõ™…±Í”íµ…Ñ•É¥…°¹É•±•…Í•A½¥¹Ñ•É…ÁÑÕÉ”¡”¹Á½¥¹Ñ•É%¤íô¤ì(€m‘•¹Í¥Ñä±ÍÁ…”±µ½Ñ¥½¹t¹™½É… ¡•°ôù•°¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰¥¹ÁÕÐˆ±ÕÁ‘…Ñ•Õ‘¥½5…É½Ì¤¤ì(€Á±…å	Ñ¸¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ±Ñ½±”¤ì(€É••¸¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ° ¤ôùí¹•Ý]½É± ¤í‰ÕÉÍÑÌõmtíÁ…ÉÑ¥±•Ìõmtí¥˜¡Á±…å¥¹œ˜™…Õ‘¥¼¥í¹•áÑ¡½Éõ…Õ‘¥¼¹ÕÉÉ•¹ÑQ¥µ”¬¸ÀÐíÍÝ•±±¡½É¡…Õ‘¥¼¹ÕÉÉ•¹ÑQ¥µ”¬¸ÀÌ¤íõô¤ì((€€¡…Íå¹Œ™Õ¹Ñ¥½¸‰½½Ð ¥ì(€€€…Ý…¥ÐÉ•ÍÑ½É•MÑ…Ñ” ¤ì(€€€É…¹õµÕ±‰•ÉÉäÌÈ¡Í••¤ì(€€€É•¹‘•É5½‘•Ì ¤ì(€€€Íå¹U$ ¤ì(€€€É•Í¥é•…¹Ù…Ì ¤ì(€ô¤ ¤ì)ô¤ ¤ì