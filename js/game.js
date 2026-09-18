import * as THREE from 'three';

/* ============================================================
   CAÇADOR DE RELÍQUIAS: O Relógio de Arquimedes
   Ação e aventura 3D estilo Indiana Jones — Three.js puro
   1969: Indy x Jürgen Voller pelo Relógio que viaja no tempo.
   Banido para uma caverna na Amazônia, Brasil, Indy cruza a
   caverna para tomar a Âncora Temporal e voltar para casa.
   ============================================================ */

const $ = (id) => document.getElementById(id);
const hud=$('hud'), msgEl=$('message'), levelNameEl=$('level-name'), objEl=$('objective');
const healthFill=$('health-fill'), staminaFill=$('stamina-fill'), healthNum=$('health-num');
const seEl=$('status-effects');let lastSe='__init__';
const missionsSide=$('missions-side');let lastMissions='__init__';
const relicCountEl=$('relic-count'), relicTotalEl=$('relic-total'), timeEl=$('time-value'), scoreEl=$('score-value');
const killCountEl=$('kill-count'), secondCountEl=$('second-count');
const bossWrap=$('boss-bar-wrap'), bossFill=$('boss-fill'), bossName=$('boss-name');
const dmgVin=$('damage-vignette');
const lassoHud=$('lasso-hud'), lassoFill=$('lasso-fill');

// ---------- SAVE ----------
const SAVE_KEY='relicHunterAkum_v1';
let save={unlocked:0,totalRelics:0,bestTime:0,maxHealth:200};
try{const s=JSON.parse(localStorage.getItem(SAVE_KEY));if(s)save={...save,...s};}catch{}
function persist(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));}catch{}}

// ---------- AUDIO (procedural WebAudio) ----------
const AudioSys={
  ctx:null,enabled:false,
  init(){if(this.ctx)return;try{this.ctx=new (window.AudioContext||window.webkitAudioContext)();this.enabled=true;}catch{}},
  tone(f=440,d=.15,type='square',v=.12,slide=0,delay=0){
    if(!this.enabled)return;const t=this.ctx.currentTime+delay;
    const o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type=type;o.frequency.setValueAtTime(f,t);
    if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide),t+d);
    g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);
    o.connect(g);g.connect(this.ctx.destination);o.start(t);o.stop(t+d+.02);
  },
  noise(d=.2,v=.15,delay=0){ // chicote / pedra
    if(!this.enabled)return;const t=this.ctx.currentTime+delay;
    const buf=this.ctx.createBuffer(1,this.ctx.sampleRate*d,this.ctx.sampleRate);
    const ch=buf.getChannelData(0);for(let i=0;i<ch.length;i++)ch[i]=(Math.random()*2-1)*(1-i/ch.length);
    const s=this.ctx.createBufferSource();s.buffer=buf;
    const g=this.ctx.createGain();g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);
    const f=this.ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=1800;
    s.connect(f);f.connect(g);g.connect(this.ctx.destination);s.start(t);
  },
  jump(){this.tone(300,.18,'square',.08,300)},
  whip(){this.noise(.25,.25);this.tone(900,.12,'sawtooth',.06,-700)},
  pickup(){[660,880,1320].forEach((f,i)=>this.tone(f,.12,'square',.09,0,i*.07))},
  relicBig(){[523,659,784,1046,1318].forEach((f,i)=>this.tone(f,.2,'triangle',.12,0,i*.09))},
  hurt(){this.tone(160,.25,'sawtooth',.16,-80)},
  lever(){this.tone(200,.1,'square',.12);this.tone(500,.15,'square',.1,0,.1)},
  door(){this.tone(90,.6,'sawtooth',.14,60);this.noise(.5,.08)},
  dart(){this.tone(1200,.08,'sawtooth',.05,-600)},
  splash(){this.noise(.3,.12)},
  roar(){this.tone(70,.9,'sawtooth',.2,-20);this.tone(55,1.1,'square',.15,10,.1)},
  win(){[523,659,784,1046].forEach((f,i)=>this.tone(f,.25,'triangle',.13,0,i*.13))},
  lose(){[400,300,200,120].forEach((f,i)=>this.tone(f,.3,'sawtooth',.12,-30,i*.18))},
  step(){this.noise(.05,.03)},
  swing(){this.noise(.4,.12);this.tone(400,.35,'sine',.06,300)},
};

// ---------- INPUT ----------
const keys={};
let yaw=0,pitch=-0.25, pointerLocked=false, jumpQueued=false;
const touch={mx:0,mz:0,run:false,jump:false,whip:false,act:false,lookDX:0,lookDY:0};

addEventListener('keydown',e=>{
  keys[e.code]=true;
  if(['Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();
  if(e.repeat)return;
  if(e.code==='Space')jumpQueued=true;
  if(e.code==='KeyF')tryWhip=true;
  if(e.code==='KeyV')trySwing=true;
  if(e.code==='KeyE')tryInteract=true;
  if(e.code==='KeyG')tryLasso=true;
  if(e.code==='Escape'&&state==='playing')pauseGame();
  if(e.code==='KeyP'&&state==='playing')pauseGame();
});
addEventListener('keyup',e=>keys[e.code]=false);

const container=$('game-container');
document.addEventListener('mousemove',e=>{
  if(state!=='playing'||!pointerLocked)return;
  yaw-=e.movementX*0.0026; pitch-=e.movementY*0.0022;
  pitch=Math.max(-1.1,Math.min(0.5,pitch));
});
document.addEventListener('pointerlockchange',()=>{
  pointerLocked=document.pointerLockElement===renderer.domElement;
  // se o player apertou ESC / o navegador saiu do lock no meio do jogo → pausa automática
  if(!pointerLocked&&state==='playing'&&!isMobile())pauseGame();
});
container.addEventListener('click',()=>{if(state==='playing'&&!isMobile()&&!pointerLocked)renderer.domElement.requestPointerLock?.();});
function isMobile(){return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)||('ontouchstart'in window&&innerWidth<900);}

// touch joystick
(()=>{const joy=$('joystick'),stick=$('stick');let id=null;
function setStick(dx,dy){stick.style.left=(37+dx)+'px';stick.style.top=(37+dy)+'px';}
joy.addEventListener('touchstart',e=>{id=e.changedTouches[0].identifier;},{passive:true});
addEventListener('touchmove',e=>{
  for(const t of e.changedTouches){
    if(t.identifier===id){const r=joy.getBoundingClientRect();
      let dx=t.clientX-(r.left+65),dy=t.clientY-(r.top+65);
      const m=Math.hypot(dx,dy);if(m>45){dx*=45/m;dy*=45/m;}
      setStick(dx,dy);touch.mx=dx/45;touch.mz=-dy/45;}
    else if(lookTouchId===t.identifier){touch.lookDX+=t.clientX-lastLX;touch.lookDY+=t.clientY-lastLY;lastLX=t.clientX;lastLY=t.clientY;}
  }},{passive:true});
addEventListener('touchend',e=>{for(const t of e.changedTouches){if(t.identifier===id){id=null;touch.mx=0;touch.mz=0;setStick(0,0);}if(t.identifier===lookTouchId)lookTouchId=null;}},{passive:true});
let lookTouchId=null,lastLX=0,lastLY=0;
container.addEventListener('touchstart',e=>{for(const t of e.changedTouches){if(lookTouchId===null&&t.clientX>innerWidth*0.4){lookTouchId=t.identifier;lastLX=t.clientX;lastLY=t.clientY;}}},{passive:true});
const bind=(id,down,up)=>{const b=$(id);b.addEventListener('touchstart',e=>{e.preventDefault();down();},{passive:false});b.addEventListener('touchend',e=>{e.preventDefault();up?.();},{passive:false});};
bind('btn-jump',()=>touch.jump=true,()=>touch.jump=false);
bind('btn-whip',()=>{tryWhip=true;});
bind('btn-lasso',()=>{tryLasso=true;});
bind('btn-run',()=>touch.run=true,()=>touch.run=false);
bind('btn-act',()=>{tryInteract=true;});
})();

// ---------- THREE SETUP ----------
const isMobileDevice=isMobile();
const renderer=new THREE.WebGLRenderer({antialias:!isMobileDevice,powerPreference:'high-performance'});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio||1,isMobileDevice?1:1.5));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping; // cinema: luz suave, cores ricas
renderer.toneMappingExposure=1.12;
container.appendChild(renderer.domElement);

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x87b5d6);
scene.fog=new THREE.Fog(0x87b5d6,40,160);
const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.1,500);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

const hemi=new THREE.HemisphereLight(0xfff2cc,0x2a3d1e,.85);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff0d0,1.6);
sun.position.set(30,50,20);sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.left=-70;sun.shadow.camera.right=70;sun.shadow.camera.top=70;sun.shadow.camera.bottom=-70;sun.shadow.camera.far=160;
scene.add(sun);scene.add(sun.target);

// ---------- MAT CACHE ----------
const matCache={};
function MAT(color,opts={}){const k=color+JSON.stringify(opts);if(!matCache[k])matCache[k]=new THREE.MeshStandardMaterial({color,roughness:.85,metalness:.05,...opts});return matCache[k];}
const boxGeo=new THREE.BoxGeometry(1,1,1);

// ---------- GAME STATE ----------
let state='menu'; // menu|story|playing|paused|dead|victory
let levelIndex=0, colliders=[], dynamics=[], enemies=[], pickups=[], levers=[], doors=[], hazards=[], projectiles=[], platforms=[], grapples=[], torches=[], boulders=[], rollers=[], exitGate=null, idolPedestal=null;
let player, whipMesh, playerLight;
const whipSegs=[]; // elos do chicote segmentado
let pvx=0, pvz=0; // velocidade suavizada (peso na movimentação)
let tryWhip=false, tryInteract=false, tryLasso=false, trySwing=false;
let LASSO_MAX=30; // recarga da habilidade do laço (segundos)
let lassoCD=0;
let health=100, stamina=100, relics=0, relicsTotal=0, score=0, levelTime=0, totalScore=0, totalTime=0;
let onGround=false, vy=0, coyote=0, iframes=0, whipCD=0, whipAnim=0, stepT=0;
let poisonT=0, poisonTick=0, poisonImm=0; // veneno: 30s de efeito, só reaplica a cada 40s
let paraT=0, paraImm=0;      // paralisia: 3s travado (SÓ morcego, de perto), só reaplica a cada 20s
let bleedT=0, bleedTick=0;   // sangramento: 2 de dano a cada 2s por 8s (lança do sentinela!)
let maxHealth=200;           // vida inicial 200 (pílula vital aumenta +20, teto 340)
let kills=0, secondChances=0; // a cada 10 abates: 1 CURA TUDO (revive onde morreu)
let runHold=0; // tempo segurando correr (gasto progressivo do fôlego)
let skillLevel=0; // nível de habilidade (0-5 upgrades)
const SKILL_DROP_CHANCE=0.2; // 20% de chance do inimigo dropar poção de habilidade
const SKILL_UPGRADE_CHANCE=0.15; // 15% de chance de upgrade ao pegar poção
let WHIP_DMG=34, WHIP_CD=0.5, WHIP_REACH=2.2; // atributos evoluíveis do chicote
// ---------- ANIMAÇÃO FLUIDA (locomoção realista + swing cinematográfico + lanças cravadas) ----------
let landCrouch=0; // timer de agachamento ao pousar (squash & stretch)
let airTime=0; // tempo no ar (pulo / queda)
let idleTime=0; // tempo parado (respiração)
let animBlend=0; // 0=andar 1=correr (blend suave)
let swingPhase=''; // fase do voo de chicote: anticipation|fly|land
const stuckSpears=[]; // lanças cravadas no player (visual + tremor)
let spearSlow=0; // lentidão enquanto cravado
let camPos=new THREE.Vector3(0,5,8);
let escaping=false, escapeBoulder=null, boss=null, msgTimer=null;
let interactTarget=null;
let previewShown=false; // prévia da próxima fase já exibida neste nível?

const STORIES=[
 {k:'FASE 1 — 1969',t:'Despertar na Amazônia',x:'Nova York, 1969. Na luta contra Jürgen Voller pelo Relógio de Arquimedes — que leva quem o portar a qualquer lugar no tempo — o vilão ficou com o mostrador e jogou você para longe de casa: uma caverna no coração da Amazônia, Brasil. Atravesse a ravina de chicote, junte 3 fragmentos do mecanismo ⚙️ e entre na caverna. A Âncora Temporal, que teletransporta para onde você quiser, espera no fim... e é a sua volta para casa.'},
  {k:'FASE 2 — PROFUNDEZAS',t:'Caverna do Tempo',x:'Dentro da caverna o tempo parece quebrado: lanças, lâminas e uma pedrona ancestral guardam os salões, e Voller deixou sentinelas para trás. Puxe as 2 alavancas, junte 4 fragmentos ⚙️ e avance — cada passo é um passo de volta para 1969, antes que Voller reescreva a história.'},
 {k:'FASE 3 — O ACERTO FINAL',t:'Âncora Temporal',x:'A Sentinela do Tempo guarda a Âncora Temporal, o artefato que leva seu portador a qualquer lugar. Derrote-a com o chicote, tome a Âncora... e CORRA. A caverna vai desabar — e essa é a sua carona de volta para impedir Jürgen Voller de uma vez por todas.'},
];

// ---------- WORLD HELPERS ----------
function clearLevel(){
  for(let i=scene.children.length-1;i>=0;i--){const o=scene.children[i];if(o!==camera&&o!==hemi&&o!==sun&&o!==sun.target)scene.remove(o);}
  colliders=[];dynamics=[];enemies=[];pickups=[];levers=[];doors=[];hazards=[];projectiles=[];platforms=[];grapples=[];torches=[];boulders=[];rollers=[];exitGate=null;idolPedestal=null;boss=null;escaping=false;escapeBoulder=null;
  for(const w of waves)scene.remove(w.m);waves.length=0;
  for(const s of sparks)scene.remove(s.m);sparks.length=0;
  swinging=null;interactTarget=null;shake=0;vy=0;coyote=0;whipCD=0;whipAnim=0;iframes=0;
  landingMarker=null; // recriado no loadLevel (a cena é limpa aqui)
  previewShown=false;try{$('phase-preview').classList.add('hidden');}catch{}
  jumpQueued=false;tryWhip=false;tryInteract=false;tryLasso=false;trySwing=false;pvx=0;pvz=0;spdVis=0;runHold=0;
  landCrouch=0;airTime=0;idleTime=0;animBlend=0;swingPhase='';spearSlow=0;
  for(const s of stuckSpears){try{player?.userData?.rig?.remove(s.mesh);}catch{}}stuckSpears.length=0;
  poisonT=0;poisonTick=0;poisonImm=0;paraT=0;paraImm=0;bleedT=0;bleedTick=0;container.classList.remove('paralyzed');
  swayers.length=0;fireflies.length=0;fxNodes.length=0;
  if(player){player.rotation.set(0,0,0);}
}
function addBox(x,y,z,w,h,d,color,opts={}){
  const m=new THREE.Mesh(boxGeo,MAT(color,opts.mat||{}));
  m.position.set(x,y,z);m.scale.set(w,h,d);
  m.castShadow=opts.cast??true;m.receiveShadow=true;
  scene.add(m);
  const half=new THREE.Vector3(w/2,h/2,d/2);
  const box=new THREE.Box3(new THREE.Vector3(x-half.x,y-half.y,z-half.z),new THREE.Vector3(x+half.x,y+half.y,z+half.z));
  const solid=opts.solid??true;
  if(solid)colliders.push({box,mesh:m,platform:opts.platform||null,falling:opts.falling||null});
  return {mesh:m,box,solid};
}
function addDecor(mesh,x,y,z){mesh.position.set(x,y,z);mesh.castShadow=true;scene.add(mesh);return mesh;}
function makeTree(x,z,s=1){
  // árvore realista: tronco afunilado inclinado + copa em camadas + cipó
  const g=new THREE.Group();
  const lean=(Math.random()-.5)*.14;
  const trunkH=4.2*s;
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.2*s,.44*s,trunkH,7),MAT(Math.random()<.5?0x6b4a2b:0x5d3f24));
  trunk.position.y=trunkH/2;trunk.rotation.z=lean;trunk.castShadow=true;g.add(trunk);
  // raízes expostas
  for(let i=0;i<3;i++){const r=new THREE.Mesh(new THREE.ConeGeometry(.14*s,.8*s,5),MAT(0x5d3f24));
    const a=Math.random()*Math.PI*2;r.position.set(Math.cos(a)*.45*s,.25*s,Math.sin(a)*.45*s);r.rotation.z=Math.cos(a)*.5;r.rotation.x=-Math.sin(a)*.5;g.add(r);}
  const canopy=new THREE.Group();canopy.position.y=trunkH;canopy.rotation.y=Math.random()*6;g.add(canopy);
  const greens=[0x2f7a2f,0x3da33d,0x25702a,0x4caf50,0x1e6b26];
  const blobs=4+((Math.random()*2)|0);
  for(let i=0;i<blobs;i++){
    const r=(1.1+Math.random()*1)*s;
    const c=new THREE.Mesh(new THREE.SphereGeometry(r,7,5),MAT(greens[(Math.random()*greens.length)|0]));
    const a=(i/blobs)*Math.PI*2+Math.random()*.6, rr=Math.random()*1.3*s;
    c.position.set(Math.cos(a)*rr,.2+i*.62*s+Math.random()*.3,Math.sin(a)*rr);
    c.scale.y=.72;canopy.add(c);
  }
  if(Math.random()<.45){const v=new THREE.Mesh(new THREE.CylinderGeometry(.04,.05,2+Math.random()*1.5,5),MAT(0x3d7a33));v.position.set((Math.random()-.5)*2.4,-1.2,(Math.random()-.5)*2.4);canopy.add(v);}
  g.position.set(x,0,z);g.rotation.y=Math.random()*6;scene.add(g);
  swayers.push({canopy,phase:Math.random()*6,amp:.018+Math.random()*.02});
  return g;
}
function addTreeCollider(x,z,s=1){
  // tronco SÓLIDO: não dá p/ atravessar!
  colliders.push({box:new THREE.Box3(new THREE.Vector3(x-.5*s,0,z-.5*s),new THREE.Vector3(x+.5*s,4.4*s,z+.5*s)),mesh:null,platform:null});
}
const swayers=[];   // copas que balançam no vento
const fireflies=[]; // vaga-lumes da selva
const fxNodes=[];   // ambiente vivo por fase: nuvens, brasas, poeira, borboletas, pulsos
function updateVegetation(dt=0.016){
  const t=performance.now()*.001;
  // vento com RAJADAS: a força varia em ondas lentas (0.25..1.2) — a selva "respira"
  const gust=Math.max(.25,.55+.45*Math.sin(t*.23)+.25*Math.sin(t*.71+1.7));
  for(const s of swayers){const k=s.amp*(0.5+gust);s.canopy.rotation.z=Math.sin(t*.9+s.phase)*k;s.canopy.rotation.x=Math.cos(t*.7+s.phase)*k*.7;}
  for(const f of fireflies){f.t+=dt;f.m.position.set(f.x+Math.sin(f.t*.7+f.p)*2,f.y+Math.sin(f.t*1.1+f.p)*.6,f.z+Math.cos(f.t*.5+f.p)*2);}
}
function spawnFireflies(n,x0,x1,z0,z1){
  for(let i=0;i<n;i++){
    const m=new THREE.Mesh(new THREE.SphereGeometry(.06,6,5),new THREE.MeshBasicMaterial({color:0xd6ff7a}));
    const f={m,x:x0+Math.random()*(x1-x0),y:1+Math.random()*2.2,z:z0+Math.random()*(z1-z0),t:Math.random()*10,p:Math.random()*6};
    m.position.set(f.x,f.y,f.z);scene.add(m);fireflies.push(f);
  }
}
function makePalm(x,z){
  // palmeira realista: tronco curvo CONECTADO (base→meio→copa) + coroa de folhas + cocos
  const g=new THREE.Group();
  const tm=MAT(0x7a5a33),tm2=MAT(0x84643a);
  const t1=new THREE.Mesh(new THREE.CylinderGeometry(.24,.32,3.4,7),tm);
  t1.position.set(-.1,1.7,0);t1.rotation.z=.06;t1.castShadow=true;g.add(t1);
  const t2=new THREE.Mesh(new THREE.CylinderGeometry(.18,.24,2.6,7),tm2);
  t2.position.set(-.45,4.3,0);t2.rotation.z=.2;t2.castShadow=true;g.add(t2);
  // anéis do tronco (textura)
  for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(.27-i*.02,.035,6,12),MAT(0x5d4426));
    ring.rotation.x=Math.PI/2;ring.position.set(-.12-i*.09,.9+i*.85,0);g.add(ring);}
  // copa NO TOPO do tronco (conectada!)
  const crown=new THREE.Group();crown.position.set(-.71,5.57,0);g.add(crown);
  for(let i=0;i<8;i++){
    const a=i/8*Math.PI*2;
    const f=new THREE.Group();f.rotation.y=a;crown.add(f);
    const leaf=new THREE.Mesh(new THREE.BoxGeometry(3.1,.06,.6),MAT(i%2?0x3fa34d:0x2f8a3d));
    leaf.position.set(1.45,-.5,0);leaf.rotation.z=-.3;f.add(leaf); // folha caindo
    const up=new THREE.Mesh(new THREE.BoxGeometry(1.6,.06,.4),MAT(0x37b34a));
    up.position.set(.7,.3,0);up.rotation.z=.5;f.add(up); // broto p/ cima
  }
  for(let i=0;i<3;i++){const c=new THREE.Mesh(new THREE.SphereGeometry(.17,7,6),MAT(0x6b4a2b));
    const a=i*2.1;c.position.set(Math.cos(a)*.3,-.3,Math.sin(a)*.3);crown.add(c);}
  g.position.set(x,0,z);g.rotation.y=Math.random()*6;scene.add(g);
  swayers.push({canopy:crown,phase:Math.random()*6,amp:.03});
  return g;
}
function makeFarTree(x,z,s=1){
  // árvore barata p/ o fundo (fora do alcance): tronco + 3 copas, sem colisão
  const g=new THREE.Group();
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.22*s,.4*s,4*s,6),MAT(0x5d3f24));
  trunk.position.y=2*s;g.add(trunk);
  const greens=[0x2f7a2f,0x3da33d,0x25702a];
  for(let i=0;i<3;i++){
    const c=new THREE.Mesh(new THREE.SphereGeometry((1.3-i*.2)*s,7,5),MAT(greens[i%3]));
    c.position.set((Math.random()-.5)*s,(3.6+i*.9)*s,(Math.random()-.5)*s);c.scale.y=.75;g.add(c);
  }
  g.position.set(x,0,z);scene.add(g);
  swayers.push({canopy:g,phase:Math.random()*6,amp:.008}); // balanço sutil da árvore toda
  return g;
}
function makeKapok(x,z,s=1.6){
  // SAMAÚMA gigante: tronco reto e alto + raízes tabulares + copa emergente enorme
  const g=new THREE.Group();
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.5*s,.8*s,9*s,8),MAT(0x8a7358));
  trunk.position.y=4.5*s;trunk.castShadow=true;g.add(trunk);
  for(let i=0;i<5;i++){ // raízes tabulares (sapopemas)
    const a=i/5*Math.PI*2+Math.random()*.4;
    const root=new THREE.Mesh(boxGeo,MAT(0x77644c));
    root.scale.set(.22*s,2.4*s,1.4*s);
    root.position.set(Math.cos(a)*.85*s,1.1*s,Math.sin(a)*.85*s);
    root.rotation.y=-a;g.add(root);
  }
  const canopy=new THREE.Group();canopy.position.y=9*s;canopy.rotation.y=Math.random()*6;g.add(canopy);
  const greens=[0x2f7a2f,0x3da33d,0x4caf50,0x25702a];
  for(let i=0;i<6;i++){
    const r=(1.6+Math.random()*1)*s;
    const c=new THREE.Mesh(new THREE.SphereGeometry(r,7,5),MAT(greens[i%4]));
    const a=i/6*Math.PI*2+Math.random()*.5, rr=Math.random()*2.2*s;
    c.position.set(Math.cos(a)*rr,(Math.random()-.5)*1.2*s,Math.sin(a)*rr);
    c.scale.y=.6;canopy.add(c);
  }
  for(const fx of [-1,1]){ // cipós pendentes da copa
    const v=new THREE.Mesh(new THREE.CylinderGeometry(.04,.05,3+Math.random()*2,5),MAT(0x3d7a33));
    v.position.set(fx*1.2*s,-2.4*s,(Math.random()-.5)*2*s);canopy.add(v);
  }
  g.position.set(x,0,z);g.rotation.y=Math.random()*6;scene.add(g);
  swayers.push({canopy,phase:Math.random()*6,amp:.012});
  return g;
}
function makeAcai(x,z,s=1){
  // AÇAÍ: touceira de estipes finos e altos com pequenas copas (sombra só no principal)
  const g=new THREE.Group();
  const canopy=new THREE.Group();g.add(canopy);
  const n=4+((Math.random()*2)|0);
  for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2+Math.random()*.5, rr=.25+Math.random()*.35;
    const h=(4.5+Math.random()*1.5)*s;
    const st=new THREE.Mesh(new THREE.CylinderGeometry(.07*s,.11*s,h,6),MAT(0x8a8468));
    st.position.set(Math.cos(a)*rr,h/2,Math.sin(a)*rr);
    st.rotation.z=Math.cos(a)*.09;st.rotation.x=-Math.sin(a)*.09;g.add(st);
    const top=new THREE.Group();top.position.set(Math.cos(a)*(rr+.3),h,Math.sin(a)*(rr+.3));canopy.add(top);
    for(let j=0;j<3;j++){
      const leaf=new THREE.Mesh(new THREE.BoxGeometry(1.5*s,.05,.28*s),MAT(j%2?0x3da33d:0x2f8a3d));
      const la=j/3*Math.PI*2;leaf.rotation.y=la;leaf.position.set(Math.cos(la)*.6*s,-.15-j*.12,Math.sin(la)*.6*s);leaf.rotation.z=-.35;top.add(leaf);
    }
  }
  g.position.set(x,0,z);g.rotation.y=Math.random()*6;scene.add(g);
  swayers.push({canopy,phase:Math.random()*6,amp:.035});
  return g;
}
function makeBamboo(x,z,s=1){
  // BAMBUZAL: touceira de colmos finos com folhas leves (sem sombra: barato e liso)
  const g=new THREE.Group();
  const canopy=new THREE.Group();canopy.position.y=1;g.add(canopy);
  const n=5;
  for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2+Math.random()*.5, rr=Math.random()*.5*s;
    const h=(3.5+Math.random()*2)*s;
    const culm=new THREE.Mesh(new THREE.CylinderGeometry(.05*s,.07*s,h,5),MAT(i%2?0x7aa53c:0x5d8a30));
    culm.position.set(Math.cos(a)*rr,h/2,Math.sin(a)*rr);
    culm.rotation.z=Math.cos(a)*.07;culm.rotation.x=-Math.sin(a)*.07;g.add(culm);
    const leaf=new THREE.Mesh(new THREE.BoxGeometry(1.1*s,.04,.2*s),MAT(0x6faf42));
    leaf.position.set(Math.cos(a)*(rr+.4),h-.3,Math.sin(a)*(rr+.4));
    leaf.rotation.y=-a;leaf.rotation.z=-.3;canopy.add(leaf);
  }
  g.position.set(x,0,z);g.rotation.y=Math.random()*6;scene.add(g);
  swayers.push({canopy:g,phase:Math.random()*6,amp:.02});
  return g;
}
function makeIpe(x,z,s=1,flower=0xff8ac2){
  // IPÊ FLORIDO: copa verde + pompons de flor (rosa/amarelo/branco) — ponto de cor na selva
  const g=new THREE.Group();
  const trunkH=3.6*s;
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.18*s,.34*s,trunkH,7),MAT(0x5d4a33));
  trunk.position.y=trunkH/2;trunk.castShadow=true;g.add(trunk);
  const canopy=new THREE.Group();canopy.position.y=trunkH;canopy.rotation.y=Math.random()*6;g.add(canopy);
  for(let i=0;i<4;i++){
    const r=(1+Math.random()*.7)*s;
    const c=new THREE.Mesh(new THREE.SphereGeometry(r,7,5),MAT(0x2f7a2f));
    const a=i/4*Math.PI*2+Math.random()*.5;
    c.position.set(Math.cos(a)*1.1*s,.3+i*.55*s,Math.sin(a)*1.1*s);
    c.scale.y=.7;canopy.add(c);
  }
  const fm=new THREE.MeshBasicMaterial({color:flower});
  for(let i=0;i<8;i++){ // flores sem luz (baratas) e vibrantes
    const f=new THREE.Mesh(new THREE.SphereGeometry(.17*s,6,5),fm);
    const a=Math.random()*Math.PI*2;
    f.position.set(Math.cos(a)*(0.6+Math.random()*1.4)*s,.2+Math.random()*2.2*s,Math.sin(a)*(0.6+Math.random()*1.4)*s);
    canopy.add(f);
  }
  g.position.set(x,0,z);g.rotation.y=Math.random()*6;scene.add(g);
  swayers.push({canopy,phase:Math.random()*6,amp:.022});
  return g;
}
function makeFern(x,z,s=1){
  // SAMAMBAIA: roseta de folhas arqueadas — sub-bosque vivo (sem sombra, sem colisão)
  const g=new THREE.Group();
  for(let i=0;i<6;i++){
    const a=i/6*Math.PI*2+Math.random()*.4;
    const leaf=new THREE.Mesh(new THREE.ConeGeometry(.13*s,1.2*s,5),MAT(i%2?0x3f9a3f:0x2c6e2c));
    leaf.position.set(Math.cos(a)*.35*s,.32*s,Math.sin(a)*.35*s);
    leaf.rotation.set(Math.sin(a)*1.05,0,-Math.cos(a)*1.05);
    g.add(leaf);
  }
  g.position.set(x,0,z);g.rotation.y=Math.random()*6;scene.add(g);
  swayers.push({canopy:g,phase:Math.random()*6,amp:.03});
  return g;
}
function addFallingLeaves(n,x0,x1,z0,z1){
  // FOLHAS CAINDO: espiralam da copa ao chão em loop (baratas: sem luz, sem sombra)
  const cols=[0x7ac74f,0xa8d83c,0x5db84a,0xd8c83c];
  for(let i=0;i<n;i++){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(.22,.16),
      new THREE.MeshBasicMaterial({color:cols[(Math.random()*cols.length)|0],side:THREE.DoubleSide,transparent:true,opacity:.95}));
    const x=x0+Math.random()*(x1-x0), z=z0+Math.random()*(z1-z0), y0=5+Math.random()*4;
    m.position.set(x,Math.random()*y0,z);m.rotation.set(Math.random()*3,Math.random()*3,0);
    scene.add(m);
    fxNodes.push({kind:'leaf',m,x,z,y0,sp:.6+Math.random()*.8,t:Math.random()*6,ph:Math.random()*6});
  }
}
function makePillar(x,y,z,h=6){const p=new THREE.Mesh(new THREE.CylinderGeometry(.9,1.1,h,8),MAT(0x9a8a6a));p.position.set(x,y+h/2,z);p.castShadow=p.receiveShadow=true;scene.add(p);
  const top=new THREE.Mesh(boxGeo,MAT(0x7a6a4d));top.scale.set(2.6,.6,2.6);top.position.set(x,y+h+.3,z);top.castShadow=true;scene.add(top);return p;}
function addTorch(x,y,z,withLight=true){
  const s=new THREE.Mesh(new THREE.CylinderGeometry(.08,.1,1.2,6),MAT(0x4a3320));s.position.set(x,y+.6,z);scene.add(s);
  const f=new THREE.Mesh(new THREE.SphereGeometry(.22,8,7),new THREE.MeshBasicMaterial({color:0xffa726}));f.position.set(x,y+1.3,z);scene.add(f);
  let l=null;
  if(withLight){l=new THREE.PointLight(0xff9a2a,12,14,2);l.position.set(x,y+1.5,z);scene.add(l);}
  torches.push({flame:f,light:l,seed:Math.random()*10});
}
function showMsg(t,ms=2600){msgEl.textContent=t;msgEl.classList.add('show');clearTimeout(msgTimer);msgTimer=setTimeout(()=>msgEl.classList.remove('show'),ms);}
function damage(n,src){
  if(iframes>0||state!=='playing')return;
  if(typeof n!=='number'||!isFinite(n))n=10;
  health-=n;iframes=.7;AudioSys.hurt();
  dmgVin.classList.add('hit');setTimeout(()=>dmgVin.classList.remove('hit'),250);
  if(player){
    const px=player.position.x,py=player.position.y,pz=player.position.z;
    const cx=camera.position.x,cy=camera.position.y,cz=camera.position.z;
    if([px,py,pz,cx,cy,cz].every(v=>typeof v==='number'&&isFinite(v))){
      const d=new THREE.Vector3().subVectors(player.position,camera.position);
      if(d.lengthSq()>1e-6&&isFinite(d.x+d.y+d.z)){d.normalize();player.position.addScaledVector(d,.4);}
    }
  }
  if(health<=0){health=0;die(src);}
}
function die(src){
  if(state!=='playing')return;
  resetRollers(); // os rolos voltam ao início: vão passar de novo!
  if(secondChances>0){
    // 💖 CURA TUDO: segunda chance no MESMO ponto onde morreu!
    secondChances--;health=maxHealth;
    poisonT=0;poisonTick=0;paraT=0;paraImm=2;bleedT=0;bleedTick=0;iframes=3;
    container.classList.remove('paralyzed');
    showMsg('💖 CURA TUDO! De pé, no mesmo lugar! ('+secondChances+' restantes)',3500);
    AudioSys.relicBig();updateHUD();
    return;
  }
  state='dead';AudioSys.lose();
  document.exitPointerLock?.();
  $('death-text').textContent=src||'O tempo cobra seu preço...';
  setTimeout(()=>{$('gameover').classList.remove('hidden');hud.classList.add('hidden');},600);
}
function heal(n){health=Math.min(maxHealth,health+n);}
function applyPoison(){
  showMsg('☠️ ENVENENADO! Veneno por 30s!');
  poisonT=30;poisonTick=0;poisonImm=40;AudioSys.noise(.4,.14);
}
function applyParalyze(){
  showMsg('🦇 MORDIDA PARALISANTE! 3s imóvel!');
  paraT=3;paraImm=20;AudioSys.tone(880,.4,'sawtooth',.12,-660);
  container.classList.add('paralyzed');
}
function applyBleed(){
  showMsg('🩸 SANGRAMENTO! 2 de dano a cada 2s!');
  bleedT=8;bleedTick=0;AudioSys.noise(.3,.12);
}
function trapHit(n,src){
  // ARMADILHA: perde vida E volta ao início da fase!
  // (respeita iframes: sem dano = sem teleporte)
  if(iframes>0||state!=='playing')return;
  damage(n,src);
  if(state!=='playing'||health<=0)return;
  player.position.copy(currentInfo.spawn);vy=0;pvx=0;pvz=0;swinging=null;
  resetRollers(); // voltou ao início: os rolos armam de novo!
  showMsg(src+' ↩ Voltou ao início da fase!');
}

// ---------- PLAYER ----------
function buildPlayer(){
  const g=new THREE.Group();
  const rig=new THREE.Group();g.add(rig); // rig balança/inclina sem mexer na física
  // pele humana fosca e realista (sem brilho: metalness 0, roughness máximo)
  const skin=new THREE.MeshStandardMaterial({color:0xbb7e58,roughness:.96,metalness:0});
  const skinShade=new THREE.MeshStandardMaterial({color:0xa66f4b,roughness:1,metalness:0});
  const scarM=new THREE.MeshStandardMaterial({color:0xd09a76,roughness:1,metalness:0});
  const jacket=MAT(0x6b4226),shirtM=MAT(0xcfc09a),
        pantsM=MAT(0x8a7a52),hatM=MAT(0x4a3018),bootM=MAT(0x2e1f12),beltM=MAT(0x3a2412);
  // PERNAS humanas ARTICULADAS: quadril → coxa → joelho → canela → bota
  // (bota DENTRO da perna p/ acompanhar o balanço — sem flutuar!)
  const legL=new THREE.Group();legL.position.set(-.14,.92,0);rig.add(legL);
  const legR=new THREE.Group();legR.position.set(.14,.92,0);rig.add(legR);
  let kneeL, kneeR, bootL, bootR;
  for(const [leg,isL] of [[legL,true],[legR,false]]){
    const thigh=new THREE.Mesh(new THREE.CylinderGeometry(.10,.13,.42,10),pantsM);
    thigh.position.y=-.21;thigh.castShadow=true;leg.add(thigh);
    const kneeJ=new THREE.Group();kneeJ.position.y=-.42;leg.add(kneeJ);
    const knee=new THREE.Mesh(new THREE.SphereGeometry(.105,8,6),pantsM);
    knee.scale.set(1,.7,1);kneeJ.add(knee);
    const shin=new THREE.Mesh(new THREE.CylinderGeometry(.075,.095,.36,9),pantsM);
    shin.position.y=-.20;shin.castShadow=true;kneeJ.add(shin);
    const boot=new THREE.Mesh(boxGeo,bootM);boot.scale.set(.24,.22,.38);boot.position.set(0,-.40,.06);kneeJ.add(boot);
    const toe=new THREE.Mesh(boxGeo,bootM);toe.scale.set(.22,.12,.18);toe.position.set(0,-.47,.22);kneeJ.add(toe);
    if(isL){kneeL=kneeJ;bootL=boot;}else{kneeR=kneeJ;bootR=boot;}
  }
  // TRONCO humano: ombros largos afunilando p/ a cintura (achatado frente-trás)
  const torso=new THREE.Mesh(new THREE.CylinderGeometry(.30,.24,.72,12),jacket);
  torso.position.y=1.12;torso.scale.z=.62;rig.add(torso);
  // camisa clara + colarinho aberto
  const chest=new THREE.Mesh(boxGeo,shirtM);chest.scale.set(.18,.32,.03);chest.position.set(0,1.28,.20);rig.add(chest);
  for(const sx of [-1,1]){const col=new THREE.Mesh(boxGeo,jacket);col.scale.set(.12,.12,.03);col.position.set(sx*.12,1.46,.20);col.rotation.z=sx*.5;rig.add(col);}
  // cinto com fivela dourada + alça transversal da sacola
  const belt=new THREE.Mesh(boxGeo,beltM);belt.scale.set(.66,.09,.38);belt.position.y=.8;rig.add(belt);
  const buckle=new THREE.Mesh(boxGeo,MAT(0xc9a227,{metalness:.6,roughness:.35}));buckle.scale.set(.13,.07,.02);buckle.position.set(0,.8,.2);rig.add(buckle);
  const strap=new THREE.Mesh(boxGeo,beltM);strap.scale.set(.11,.85,.03);strap.position.set(.02,1.16,.19);strap.rotation.z=.5;rig.add(strap);
  // BRAÇOS humanos ARTICULADOS: ombro → braço → cotovelo → antebraço → mão
  // (cotovelo dobra de verdade: andar balança esticado, correr dobra 90°!)
  const armL=new THREE.Group();armL.position.set(-.38,1.42,0);rig.add(armL);
  const armR=new THREE.Group();armR.position.set(.38,1.42,0);rig.add(armR);
  let elbowL, elbowR;
  for(const [arm,isL] of [[armL,true],[armR,false]]){
    const upper=new THREE.Mesh(new THREE.CylinderGeometry(.075,.09,.32,10),jacket);
    upper.position.y=-.16;upper.castShadow=true;arm.add(upper);
    const elb=new THREE.Group();elb.position.y=-.32;arm.add(elb);
    const fore=new THREE.Mesh(new THREE.CylinderGeometry(.06,.075,.28,9),isL?jacket:skin);
    fore.position.y=-.14;fore.castShadow=true;elb.add(fore);
    const hand=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),skin);
    hand.position.y=-.32;hand.scale.set(.9,1.15,.9);elb.add(hand);
    if(isL)elbowL=elb;else elbowR=elb;
  }
  // === ROSTO humano: pescoço + cabeça oval (mais alta que larga) + queixo marcado ===
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.09,.10,.14,8),skinShade);
  neck.position.y=1.55;rig.add(neck);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.27,18,14),skin);head.position.y=1.78;head.scale.set(.92,1.08,.95);rig.add(head);
  const chin=new THREE.Mesh(new THREE.SphereGeometry(.11,8,6),skin);
  chin.position.set(0,1.60,.14);chin.scale.set(1.1,.7,.8);rig.add(chin);
  for(const sx of [-1,1]){
    const white=new THREE.Mesh(new THREE.SphereGeometry(.055,8,6),MAT(0xf5f0e0));white.position.set(sx*.10,1.82,.225);rig.add(white);
    const iris=new THREE.Mesh(new THREE.SphereGeometry(.028,8,6),new THREE.MeshBasicMaterial({color:0x2a6fb0}));iris.position.set(sx*.10,1.815,.272);rig.add(iris);
    const pup=new THREE.Mesh(new THREE.SphereGeometry(.013,6,6),new THREE.MeshBasicMaterial({color:0x0a0a0a}));pup.position.set(sx*.10,1.815,.296);rig.add(pup);
    const brow=new THREE.Mesh(boxGeo,MAT(0x3a2412));brow.scale.set(.11,.032,.03);brow.position.set(sx*.10,1.912,.245);brow.rotation.z=sx*-.14;rig.add(brow);
  }
  const nose=new THREE.Mesh(boxGeo,skin);nose.scale.set(.07,.11,.09);nose.position.set(0,1.75,.265);rig.add(nose);
  const noseTip=new THREE.Mesh(new THREE.SphereGeometry(.035,6,5),skinShade);noseTip.position.set(0,1.70,.295);rig.add(noseTip);
  const mouth=new THREE.Mesh(boxGeo,MAT(0x7a3a2a));mouth.scale.set(.13,.026,.02);mouth.position.set(0,1.635,.25);rig.add(mouth);
  const beard=new THREE.Mesh(boxGeo,MAT(0x7a5230));beard.scale.set(.24,.045,.05);beard.position.set(0,1.565,.20);rig.add(beard);
  for(const sx of [-1,1]){const side=new THREE.Mesh(boxGeo,MAT(0x6b4a2b));side.scale.set(.045,.15,.055);side.position.set(sx*.235,1.72,.08);rig.add(side);}
  const scar=new THREE.Mesh(boxGeo,scarM);scar.scale.set(.018,.085,.012);scar.position.set(.07,1.59,.238);scar.rotation.z=.08;rig.add(scar);
  for(const sx of [-1,1]){const ear=new THREE.Mesh(new THREE.SphereGeometry(.06,8,6),skin);ear.position.set(sx*.25,1.76,-.01);ear.scale.set(.5,1,.7);rig.add(ear);}
  // FEDORA ENCAIXADO: aba assentada no topo da cabeça e copa abraçando o crânio (sem flutuar!)
  const hatG=new THREE.Group();hatG.position.set(0,2.03,0);hatG.rotation.x=-.06;hatG.rotation.z=.03;rig.add(hatG);
  const brim=new THREE.Mesh(new THREE.CylinderGeometry(.44,.46,.05,18),hatM);brim.name='fedora';hatG.add(brim);
  const brimEdge=new THREE.Mesh(new THREE.TorusGeometry(.44,.022,6,22),MAT(0x2e1c0e));brimEdge.rotation.x=Math.PI/2;brimEdge.position.y=-.015;hatG.add(brimEdge);
  const crownBase=new THREE.Mesh(new THREE.CylinderGeometry(.26,.27,.10,16),hatM);crownBase.position.y=.05;hatG.add(crownBase);
  const band=new THREE.Mesh(new THREE.CylinderGeometry(.265,.275,.09,16),MAT(0x1a1210));band.position.y=.09;hatG.add(band);
  const buckleH=new THREE.Mesh(boxGeo,MAT(0xc9a227,{metalness:.7,roughness:.3}));buckleH.scale.set(.07,.05,.02);buckleH.position.set(0,.09,.27);hatG.add(buckleH);
  const top=new THREE.Mesh(new THREE.CylinderGeometry(.20,.25,.30,16),hatM);top.position.y=.26;hatG.add(top);
  const dent=new THREE.Mesh(boxGeo,MAT(0x3a2412));dent.scale.set(.10,.05,.27);dent.position.set(0,.40,-.02);hatG.add(dent);
  // bolsos da jaqueta + ombreiras arredondadas + botões
  for(const sx of [-1,1]){
    const pocket=new THREE.Mesh(boxGeo,MAT(0x5a3620));pocket.scale.set(.16,.14,.03);pocket.position.set(sx*.15,1.02,.17);rig.add(pocket);
    const flap=new THREE.Mesh(boxGeo,MAT(0x4a2c18));flap.scale.set(.17,.05,.032);flap.position.set(sx*.15,1.10,.17);rig.add(flap);
    const epau=new THREE.Mesh(new THREE.SphereGeometry(.11,8,6),MAT(0x5a3620));epau.scale.set(1.15,.6,1);epau.position.set(sx*.36,1.44,0);rig.add(epau);
  }
  // BOLSA lateral do aventureiro (tiracolo, bem visível no quadril!): couro + tampa + botão dourado
  const bagG=new THREE.Group();bagG.position.set(-0.5,0.95,0.02);rig.add(bagG);
  const bag=new THREE.Mesh(boxGeo,beltM);bag.name='bolsa';bag.scale.set(.24,.34,.3);bagG.add(bag);
  const bagFlap=new THREE.Mesh(boxGeo,MAT(0x2e1c0e));bagFlap.scale.set(.26,.1,.32);bagFlap.position.y=.2;bagG.add(bagFlap);
  const bagBtn=new THREE.Mesh(new THREE.SphereGeometry(.045,8,6),MAT(0xc9a227,{metalness:.7,roughness:.3}));bagBtn.position.set(0,.1,.17);bagG.add(bagBtn);
  const bagPocket=new THREE.Mesh(boxGeo,MAT(0x5a3a1e));bagPocket.scale.set(.18,.16,.03);bagPocket.position.set(0,-.04,.16);bagG.add(bagPocket);
  const holster=new THREE.Mesh(boxGeo,MAT(0x241812));holster.scale.set(.16,.32,.16);holster.position.set(.42,.82,-.04);rig.add(holster);
  const coil=new THREE.Mesh(new THREE.TorusGeometry(.15,.05,8,16),MAT(0x3a2512));coil.position.set(-.38,.92,0);coil.rotation.y=Math.PI/2;rig.add(coil);
  const coil2=new THREE.Mesh(new THREE.TorusGeometry(.11,.035,6,14),MAT(0x5a3a1e));coil2.position.set(-.38,.92,0);coil2.rotation.y=Math.PI/2;rig.add(coil2);
  rig.traverse(o=>{if(o.isMesh){o.castShadow=true;}});
  // LAÇO / CHICOTE remodelado: cabo de madeira + punho trançado + 10 elos afunilados bicolores + ponta metálica brilhante
  const gripG=new THREE.Group();gripG.position.set(.40,.86,.1);gripG.rotation.x=.3;rig.add(gripG);
  const handleWood=new THREE.Mesh(new THREE.CylinderGeometry(.035,.04,.34,8),MAT(0x6b4a2b));gripG.add(handleWood);
  const gripWrap=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.2,8),MAT(0x2b1c0e));gripWrap.position.y=-.04;gripG.add(gripWrap);
  const guard=new THREE.Mesh(new THREE.TorusGeometry(.06,.015,6,12),MAT(0xc9a227,{metalness:.7,roughness:.3}));guard.rotation.x=Math.PI/2;guard.position.y=.17;gripG.add(guard);
  whipMesh=new THREE.Group();rig.add(whipMesh);
  whipSegs.length=0;
  const braidA=MAT(0x3a2512), braidB=MAT(0x6b4a2b);
  for(let i=0;i<10;i++){
    const thick=1-i*.065; // afunila até a ponta
    const sGeo=new THREE.BoxGeometry(.075*thick,.075*thick,.42);
    const s=new THREE.Mesh(sGeo,i%2?braidB:braidA);
    s.scale.set(1,1,1);s.castShadow=false;
    s.userData.thick=thick;
    whipMesh.add(s);whipSegs.push(s);
  }
  const whipTip=new THREE.Mesh(new THREE.ConeGeometry(.06,.22,8),MAT(0xd8dee6,{metalness:.85,roughness:.25}));whipTip.name='whipTip';whipTip.rotation.x=Math.PI/2;whipMesh.add(whipTip);
  const tipGlow=new THREE.Mesh(new THREE.SphereGeometry(.05,8,6),new THREE.MeshBasicMaterial({color:0xffe27a}));tipGlow.name='tipGlow';whipMesh.add(tipGlow);
  playerLight=new THREE.PointLight(0xffe0b8,2.2,8,2);playerLight.position.set(0,2.2,0);g.add(playerLight);
  g.userData={legL,legR,armL,armR,kneeL,kneeR,elbowL,elbowR,bootL,bootR,torso,head,whipTip,tipGlow,rig,hat:hatG,gripG,bag:bagG};
  scene.add(g);return g;
}

// ---------- ENEMIES ----------
function spawnEnemy(type,x,y,z){
  const g=new THREE.Group();let hp=30,speed=3,range=14,dmg=10,atkR=1.7,hitR=2.2,bodyH=1.9,name=type;
  if(type==='cobra'){
    hp=80;speed=4.6;dmg=12;atkR=1.6;hitR=2.7;bodyH=1.2; // corpo longo e baixo: chicote pega de longe, mordida só colada
    const green1=MAT(0x1f8a3d),green2=MAT(0x37c65e),belly=MAT(0xd8e6b0);
    const segs=[];
    // corpo segmentado (5 elos que deslizam em S)
    const sizes=[.24,.27,.25,.2,.14];
    for(let i=0;i<5;i++){
      const s=new THREE.Mesh(new THREE.SphereGeometry(sizes[i],10,8),i%2?green2:green1);
      s.scale.set(1,.72,1.25);s.position.set(0,.2,-.75+i*.38);s.castShadow=true;g.add(s);segs.push(s);
      const b=new THREE.Mesh(new THREE.SphereGeometry(sizes[i]*.8,8,6),belly);
      b.scale.set(.8,.4,.9);b.position.set(0,.1,-.75+i*.38);g.add(b);
    }
    // capelo (hood) de naja
    const hood=new THREE.Mesh(new THREE.SphereGeometry(.3,10,8),green1);
    hood.scale.set(1.25,1.5,.55);hood.position.set(0,.55,.75);hood.castShadow=true;g.add(hood);
    const spot1=new THREE.Mesh(new THREE.SphereGeometry(.06,6,6),MAT(0xf5eeda));spot1.position.set(-.12,.62,1.0);g.add(spot1);
    const spot2=spot1.clone();spot2.position.x=.12;g.add(spot2);
    // cabeça erguida
    const hd=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),green2);hd.position.set(0,.78,.86);hd.castShadow=true;g.add(hd);
    // olhos com pupila
    for(const sx of [-1,1]){
      const eye=new THREE.Mesh(new THREE.SphereGeometry(.05,6,6),new THREE.MeshBasicMaterial({color:0xffffff}));
      eye.position.set(sx*.11,.84,1.0);g.add(eye);
      const pup=new THREE.Mesh(new THREE.SphereGeometry(.025,6,6),new THREE.MeshBasicMaterial({color:0x000000}));
      pup.position.set(sx*.11,.84,1.045);g.add(pup);
    }
    // língua bifurcada (pisca)
    const tongue=new THREE.Group();
    for(const sx of [-1,1]){const t=new THREE.Mesh(new THREE.ConeGeometry(.02,.3,5),MAT(0xff3b3b));t.rotation.x=Math.PI/2.3;t.position.set(sx*.03,0,.12);tongue.add(t);}
    tongue.position.set(0,.72,1.05);g.add(tongue);
    // chocalho do rabo + crista dorsal + joia do capelo (naja real)
    const tail=new THREE.Mesh(new THREE.ConeGeometry(.07,.25,6),MAT(0xc9a227));tail.rotation.x=-Math.PI/2.2;tail.position.set(0,.18,-1.15);g.add(tail);
    for(let i=0;i<4;i++){const sp=new THREE.Mesh(new THREE.ConeGeometry(.05,.16,5),MAT(0x0f5a26));sp.position.set(0,.32+Math.sin(i*.8)*.03,-.5+i*.32);g.add(sp);}
    const jewel=new THREE.Mesh(new THREE.OctahedronGeometry(.07),MAT(0xc9a227,{metalness:.7,roughness:.25,emissive:0x332200}));jewel.position.set(0,.62,.98);g.add(jewel);
    g.userData.segs=segs;g.userData.head=hd;g.userData.tongue=tongue;g.userData.jewel=jewel;
  }else if(type==='guard'){
    hp=60;speed=3.8;dmg=20;atkR=2.0;hitR=2.3;bodyH=2.1; // sentinela: tapa de 20 a cada 3s + lança à distância
    const armor=MAT(0x8a2f1f),bronze=MAT(0xb08d2e,{metalness:.55,roughness:.4}),
          skinG=MAT(0xa06a3c),dark=MAT(0x241812),feather=MAT(0x1f7a3d);
    // botas + PERNAS com pivô no quadril (marcha fluida, sem deslizar)
    for(const sx of [-1,1]){const boot=new THREE.Mesh(boxGeo,dark);boot.scale.set(.22,.18,.32);boot.position.set(sx*.15,.09,.04);g.add(boot);}
    const legL=new THREE.Group();legL.position.set(-.15,.86,0);g.add(legL);
    const legR=new THREE.Group();legR.position.set(.15,.86,0);g.add(legR);
    for(const leg of [legL,legR]){
      const thigh=new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,.68,8),skinG);
      thigh.position.y=-.34;thigh.castShadow=true;leg.add(thigh);
      const knee=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),dark);
      knee.position.y=-.36;knee.scale.set(1,.7,1);leg.add(knee);
    }
    // saia de guerra + cinturão de bronze
    const skirt=new THREE.Mesh(new THREE.CylinderGeometry(.32,.44,.36,8),dark);skirt.position.y=.95;g.add(skirt);
    const beltG=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.1,8),bronze);beltG.position.y=1.1;g.add(beltG);
    // torso atlético afunilado + peitoral de bronze
    const torsoG=new THREE.Mesh(new THREE.CylinderGeometry(.30,.24,.62,10),armor);
    torsoG.position.y=1.42;torsoG.scale.z=.62;g.add(torsoG);
    const plate=new THREE.Mesh(boxGeo,bronze);plate.scale.set(.44,.38,.06);plate.position.set(0,1.44,.20);g.add(plate);
    for(const sx of [-1,1]){const pad=new THREE.Mesh(new THREE.SphereGeometry(.16,8,6),bronze);pad.position.set(sx*.40,1.68,0);pad.scale.set(1,.8,1);g.add(pad);}
    // pescoço + braços com pivô no ombro (golpe de lança animado)
    const gneck=new THREE.Mesh(new THREE.CylinderGeometry(.09,.10,.12,8),skinG);gneck.position.y=1.78;g.add(gneck);
    const armL=new THREE.Group();armL.position.set(-.40,1.62,0);g.add(armL);
    const armLm=new THREE.Mesh(new THREE.CylinderGeometry(.07,.085,.6,8),armor);armLm.position.y=-.3;armL.add(armLm);
    const armR=new THREE.Group();armR.position.set(.40,1.62,0);g.add(armR);
    const armRm=new THREE.Mesh(new THREE.CylinderGeometry(.07,.085,.6,8),armor);armRm.position.y=-.3;armR.add(armRm);
    const handR=new THREE.Mesh(new THREE.SphereGeometry(.085,8,6),skinG);handR.position.y=-.62;armR.add(handR);
    const handL=handR.clone();armL.add(handL);
    // LANÇA longa na mão direita
    const spear=new THREE.Group();spear.position.set(0,-.62,.12);armR.add(spear);
    const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,2.1,7),MAT(0x6b4a2b));shaft.rotation.x=Math.PI/2;shaft.position.z=.55;spear.add(shaft);
    const tip=new THREE.Mesh(new THREE.ConeGeometry(.08,.32,7),MAT(0xb9c0c8,{metalness:.8,roughness:.3}));tip.rotation.x=Math.PI/2;tip.position.z=1.7;spear.add(tip);
    // cabeça + MÁSCARA de onça dourada (crânio arredondado e realista)
    const hg=new THREE.Mesh(new THREE.SphereGeometry(.26,12,10),skinG);hg.position.y=2.0;hg.scale.set(.92,1.05,.95);g.add(hg);
    const mask=new THREE.Mesh(boxGeo,bronze);mask.scale.set(.4,.3,.14);mask.position.set(0,2.0,.22);g.add(mask);
    const snout=new THREE.Mesh(boxGeo,bronze);snout.scale.set(.22,.15,.2);snout.position.set(0,1.92,.34);g.add(snout);
    for(const sx of [-1,1]){const ear=new THREE.Mesh(new THREE.ConeGeometry(.08,.22,6),bronze);ear.position.set(sx*.17,2.26,-.02);g.add(ear);}
    const eyes=[];
    for(const sx of [-1,1]){const e=new THREE.Mesh(boxGeo,new THREE.MeshBasicMaterial({color:0xff2222}));e.scale.set(.07,.05,.03);e.position.set(sx*.11,2.04,.30);g.add(e);eyes.push(e.material);}
    // penacho de penas verde-vermelho + ESCUDO redondo no braço esquerdo + borla na lança
    for(let i=-1;i<=1;i++){const f=new THREE.Mesh(boxGeo,i===0?MAT(0xc22f2f):feather);f.scale.set(.09,.55,.03);f.position.set(i*.14,2.52,-.12);f.rotation.x=-.35;f.rotation.z=i*-.25;g.add(f);}
    const shield=new THREE.Group();shield.position.set(-.44,1.0,.12);g.add(shield);
    const shDisc=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.07,14),bronze);shDisc.rotation.x=Math.PI/2;shield.add(shDisc);
    const shBoss=new THREE.Mesh(new THREE.SphereGeometry(.1,8,6),MAT(0x8a2f1f));shBoss.position.z=.08;shield.add(shBoss);
    const tassel=new THREE.Mesh(new THREE.ConeGeometry(.06,.2,6),MAT(0xc22f2f));tassel.position.set(0,-.62,.9);tassel.rotation.x=Math.PI;armR.add(tassel);
    g.userData.fighter={legL,legR,armL,armR,eyes,walkP:Math.random()*6,shield,spear,torso:torsoG,head:hg};
  }else if(type==='ogre'){
    hp=90;speed=3.2;dmg=18;atkR=2.4;range=30;hitR=2.6;bodyH=2.3; // OGRO SENTINELA: brutamontes da caverna
    const flesh=MAT(0x7a8a4d),fleshD=MAT(0x5d6e3a),bone=MAT(0xe8e0cc),
          dark=MAT(0x2b2018),rockM=MAT(0x5a4a3c);
    // pés + PERNAS musculosas com pivô no quadril
    for(const sx of [-1,1]){const foot=new THREE.Mesh(boxGeo,dark);foot.scale.set(.26,.16,.4);foot.position.set(sx*.2,.08,.05);g.add(foot);}
    const legL=new THREE.Group();legL.position.set(-.2,1.0,0);g.add(legL);
    const legR=new THREE.Group();legR.position.set(.2,1.0,0);g.add(legR);
    for(const leg of [legL,legR]){
      const thigh=new THREE.Mesh(new THREE.CylinderGeometry(.14,.18,.8,9),flesh);
      thigh.position.y=-.4;thigh.castShadow=true;leg.add(thigh);
      const knee=new THREE.Mesh(new THREE.SphereGeometry(.13,8,6),fleshD);
      knee.position.y=-.44;knee.scale.set(1,.7,1);leg.add(knee);
    }
    // tanga de couro + tronco atlético (ombros largos, cintura afunilada)
    const cloth=new THREE.Mesh(new THREE.CylinderGeometry(.32,.44,.4,9),dark);cloth.position.y=.92;g.add(cloth);
    const torso=new THREE.Mesh(new THREE.CylinderGeometry(.42,.30,.9,10),flesh);
    torso.position.y=1.5;torso.scale.z=.7;torso.castShadow=true;g.add(torso);
    const strap=new THREE.Mesh(boxGeo,dark);strap.scale.set(.14,.95,.72);strap.position.set(-.05,1.5,0);strap.rotation.z=.45;g.add(strap);
    for(const sx of [-1,1]){const pad=new THREE.Mesh(new THREE.DodecahedronGeometry(.24,0),rockM);pad.position.set(sx*.5,1.88,0);g.add(pad);} // ombreiras de rocha
    // BRAÇOS brutais com pivô no ombro + punhos + clava na direita
    const armL=new THREE.Group();armL.position.set(-.52,1.82,0);g.add(armL);
    const armR=new THREE.Group();armR.position.set(.52,1.82,0);g.add(armR);
    for(const arm of [armL,armR]){
      const limb=new THREE.Mesh(new THREE.CylinderGeometry(.11,.14,.7,9),flesh);
      limb.position.y=-.35;limb.castShadow=true;arm.add(limb);
      const fist=new THREE.Mesh(new THREE.SphereGeometry(.15,8,6),fleshD);
      fist.position.y=-.74;arm.add(fist);
    }
    const club=new THREE.Group();club.position.set(0,-.74,.15);armR.add(club);
    const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.05,.065,1.1,7),MAT(0x4a3018));shaft.rotation.x=.35;club.add(shaft);
    const knob=new THREE.Mesh(new THREE.DodecahedronGeometry(.22,0),rockM);knob.position.set(0,.5,.2);club.add(knob);
    for(let i=0;i<3;i++){const a=i/3*Math.PI*2;const sp=new THREE.Mesh(new THREE.ConeGeometry(.05,.18,5),bone);
      sp.position.set(Math.cos(a)*.2,.5+Math.sin(a)*.2,.2);sp.rotation.z=-a;club.add(sp);}
    // CABEÇA: crânio arredondado + sobrancelha pesada + presas + moicano
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(.13,.15,.16,8),fleshD);neck.position.y=2.0;g.add(neck);
    const hd=new THREE.Mesh(new THREE.SphereGeometry(.3,12,10),flesh);hd.position.y=2.22;hd.scale.set(.95,1,.9);hd.castShadow=true;g.add(hd);
    const brow=new THREE.Mesh(boxGeo,fleshD);brow.scale.set(.42,.12,.16);brow.position.set(0,2.3,.24);g.add(brow);
    const jaw=new THREE.Mesh(boxGeo,flesh);jaw.scale.set(.32,.18,.2);jaw.position.set(0,2.02,.2);g.add(jaw);
    for(const sx of [-1,1]){
      const tusk=new THREE.Mesh(new THREE.ConeGeometry(.045,.2,6),bone);tusk.position.set(sx*.12,2.12,.3);g.add(tusk);
      const ear=new THREE.Mesh(new THREE.ConeGeometry(.08,.24,6),flesh);ear.position.set(sx*.31,2.2,0);ear.rotation.z=sx*-1.25;g.add(ear);
    }
    for(let i=0;i<3;i++){const mo=new THREE.Mesh(boxGeo,dark);mo.scale.set(.08,.2,.3);mo.position.set(0,2.5,-.02-i*.09);g.add(mo);} // moicano
    const eyes=[];
    for(const sx of [-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(.05,7,6),new THREE.MeshBasicMaterial({color:0xff7a00}));e.position.set(sx*.11,2.2,.27);g.add(e);eyes.push(e.material);}
    g.userData.ogre={legL,legR,armL,armR,club,eyes,walkP:Math.random()*6};
  }else if(type==='bat'){
    hp=30;speed=6;dmg=9;range=22;atkR=1.5;hitR=2.1;bodyH=1.4; // pequeno e aéreo: só acerta/ataca de perto e baixo
    const fur=MAT(0x4a3428),wingM=MAT(0x5a3a5a);
    const body=new THREE.Mesh(new THREE.SphereGeometry(.26,10,8),fur);
    body.scale.set(.85,.8,1.35);body.castShadow=true;g.add(body);
    const hd=new THREE.Mesh(new THREE.SphereGeometry(.18,10,8),fur);hd.position.set(0,.14,.36);hd.castShadow=true;g.add(hd);
    // orelhas pontudas
    for(const sx of [-1,1]){const ear=new THREE.Mesh(new THREE.ConeGeometry(.07,.22,6),fur);ear.position.set(sx*.11,.34,.3);g.add(ear);}
    // olhos vermelhos brilhantes + presas
    for(const sx of [-1,1]){
      const eye=new THREE.Mesh(new THREE.SphereGeometry(.045,6,6),new THREE.MeshBasicMaterial({color:0xff2222}));
      eye.position.set(sx*.09,.18,.5);g.add(eye);
      const fang=new THREE.Mesh(new THREE.ConeGeometry(.02,.09,5),MAT(0xf5eeda));fang.rotation.x=Math.PI;fang.position.set(sx*.06,.0,.48);g.add(fang);
    }
    // asas em 3 partes (ombro + meio + ponta) p/ bater e planar com fluidez
    const wings=[];
    for(const sx of [-1,1]){
      const sh=new THREE.Group();sh.position.set(sx*.2,.1,0);g.add(sh);
      const inner=new THREE.Mesh(boxGeo,wingM);inner.scale.set(.6,.05,.5);inner.position.set(sx*.35,0,-.05);sh.add(inner);
      const midG=new THREE.Group();midG.position.set(sx*.65,0,-.1);sh.add(midG);
      const mid=new THREE.Mesh(boxGeo,wingM);mid.scale.set(.6,.04,.44);mid.position.set(sx*.3,0,-.05);midG.add(mid);
      const tip=new THREE.Mesh(boxGeo,wingM);tip.scale.set(.7,.035,.34);tip.position.set(sx*.85,0,-.16);tip.rotation.y=sx*-.25;midG.add(tip);
      // membrana fina entre os dedos (visual mais bonito)
      const mem=new THREE.Mesh(new THREE.PlaneGeometry(.9,.4),new THREE.MeshStandardMaterial({color:0x6a4a6a,roughness:.9,side:THREE.DoubleSide,transparent:true,opacity:.92}));
      mem.rotation.x=-Math.PI/2;mem.position.set(sx*.6,-.01,-.12);sh.add(mem);
      sh.traverse(o=>{if(o.isMesh)o.castShadow=true;});
      wings.push({sh,midG});
    }
    const tail=new THREE.Mesh(new THREE.ConeGeometry(.06,.3,6),fur);tail.rotation.x=-Math.PI/2.3;tail.position.set(0,.02,-.45);g.add(tail);
    const tuft=new THREE.Mesh(new THREE.ConeGeometry(.05,.14,5),fur);tuft.position.set(0,.42,.28);g.add(tuft);
    g.userData.wings=wings;
  }else if(type==='golem'){
    hp=400;speed=2.6;dmg=25;atkR=3;range=60;hitR=3.6;bodyH=3.6;name='golem'; // gigante: hitbox grande mas ataque só colado (3m)
    const b=new THREE.Mesh(boxGeo,MAT(0x6a6a72));b.scale.set(1.8,2.2,1.2);b.position.y=1.6;g.add(b);
    const h=new THREE.Mesh(boxGeo,MAT(0x4a4a52));h.scale.set(.9,.7,.8);h.position.y=3;g.add(h);
    const e1=new THREE.Mesh(new THREE.SphereGeometry(.12,6,6),new THREE.MeshBasicMaterial({color:0xff2200}));e1.position.set(-.2,3.05,.42);g.add(e1);
    const e2=e1.clone();e2.position.x=.2;g.add(e2);
    const a1=new THREE.Mesh(boxGeo,MAT(0x55555e));a1.scale.set(.6,1.8,.6);a1.position.set(-1.3,1.5,0);g.add(a1);
    const a2=a1.clone();a2.position.x=1.3;g.add(a2);
    // coroa de pedra + núcleo de lava no peito + ombreiras de rocha
    const core=new THREE.Mesh(new THREE.OctahedronGeometry(.3),new THREE.MeshBasicMaterial({color:0xff5a00}));core.position.set(0,1.9,.65);g.add(core);
    for(const sx of [-1,1]){const pad=new THREE.Mesh(new THREE.DodecahedronGeometry(.42,0),MAT(0x7a7a82));pad.position.set(sx*1.25,2.5,0);g.add(pad);}
    for(let i=-1;i<=1;i++){const spike=new THREE.Mesh(new THREE.ConeGeometry(.14,.5,5),MAT(0x4a4a52));spike.position.set(i*.3,3.55,-.1);g.add(spike);}
    for(const sx of [-1,1]){const moss=new THREE.Mesh(boxGeo,MAT(0x2f7a2f));moss.scale.set(.5,.12,.9);moss.position.set(sx*1.25,2.85,0);g.add(moss);}
    g.userData.arms=[a1,a2];g.userData.core=core;bossName.textContent='🗿 SENTINELA DO TEMPO';
  }
  g.position.set(x,y,z);g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  scene.add(g);
  const e={type,mesh:g,hp,max:hp,speed,range,dmg,atkR,hitR,bodyH,cd:0,dead:false,t:Math.random()*5,baseY:y,fly:type==='bat',
    atk:0,atkT:0,struck:false,thrown:false,throwCd:0,strafeDir:Math.random()<.5?1:-1,vel:null,walkP:0};
  enemies.push(e);return e;
}

// ---------- PICKUPS / INTERACTABLES ----------
function spawnRelic(x,y,z,big=false,hide=0){
  // ARTEFATOS ANTIGOS variados (ídolo, máscara, urna, tablete, caveira) + pedestal de pedra.
  // hide 0=fase1 aberta / 1=fase2 semi-oculta / 2=fase3 bem escondida (halo fraco + camuflagem).
  const g=new THREE.Group();
  const gold=MAT(0xd4a72c,{metalness:.8,roughness:.3,emissive:0x2a1a00});
  const bronze=MAT(0x8a5f1e,{metalness:.75,roughness:.35});
  const stoneM=MAT(0x8a8a7a,{roughness:.9});
  const kind=big?99:(pickups.filter(p=>!p.heart&&!p.big).length%5);
  const add=(m)=>{m.castShadow=true;g.add(m);return m;};
  // pedestal de pedra (todas têm — parece altar antigo)
  const ped=new THREE.Mesh(new THREE.CylinderGeometry(.34,.42,.22,8),stoneM);ped.position.y=-.28;add(ped);
  if(big){
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.35,.25,.7,8),MAT(0xffd700,{metalness:.85,roughness:.2,emissive:0x553300}));body.position.y=.15;add(body);
    const hd=new THREE.Mesh(new THREE.SphereGeometry(.22,10,8),MAT(0xffd700,{metalness:.85,roughness:.2}));hd.position.y=.65;add(hd);
    for(const sx of [-1,1]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.045,6,6),new THREE.MeshBasicMaterial({color:0xaa0000}));eye.position.set(sx*.09,.68,.18);g.add(eye);}
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.5,.7,3.2,10,1,true),new THREE.MeshBasicMaterial({color:0xffd76a,transparent:true,opacity:.16,side:THREE.DoubleSide}));beam.position.y=1.4;g.add(beam);
  }else if(kind===0){ // mini-ídolo
    const b=new THREE.Mesh(new THREE.CylinderGeometry(.22,.16,.44,7),gold);b.position.y=.12;add(b);
    const h=new THREE.Mesh(new THREE.SphereGeometry(.14,8,6),gold);h.position.y=.44;add(h);
  }else if(kind===1){ // máscara funerária
    const f=new THREE.Mesh(boxGeo,gold);f.scale.set(.4,.5,.14);f.position.y=.18;add(f);
    for(const sx of [-1,1]){const e=new THREE.Mesh(boxGeo,new THREE.MeshBasicMaterial({color:0x111111}));e.scale.set(.08,.06,.02);e.position.set(sx*.1,.26,.08);g.add(e);}
    const mo=new THREE.Mesh(boxGeo,MAT(0x3a1a1a));mo.scale.set(.16,.04,.02);mo.position.set(0,.05,.08);g.add(mo);
    const crown=new THREE.Mesh(new THREE.CylinderGeometry(.2,.22,.1,7),bronze);crown.position.y=.48;add(crown);
  }else if(kind===2){ // urna com tampa e alças
    const u=new THREE.Mesh(new THREE.CylinderGeometry(.24,.18,.44,9),bronze);u.position.y=.12;add(u);
    const lid=new THREE.Mesh(new THREE.SphereGeometry(.2,8,5,0,Math.PI*2,0,1.2),gold);lid.position.y=.34;add(lid);
    for(const sx of [-1,1]){const hnd=new THREE.Mesh(new THREE.TorusGeometry(.09,.025,6,10),gold);hnd.position.set(sx*.26,.16,0);g.add(hnd);}
  }else if(kind===3){ // tablete de pedra com runas douradas
    const t=new THREE.Mesh(boxGeo,stoneM);t.scale.set(.44,.56,.14);t.position.y=.18;add(t);
    for(let i=0;i<3;i++){const r=new THREE.Mesh(boxGeo,MAT(0xc9a227,{metalness:.6,roughness:.35}));r.scale.set(.3,.045,.02);r.position.set(0,.32-i*.14,.08);g.add(r);}
  }else{ // caveira de cristal
    const s=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),MAT(0xcfd8dc,{metalness:.2,roughness:.15}));s.position.y=.22;s.scale.set(1,.95,1.05);add(s);
    const jaw=new THREE.Mesh(boxGeo,MAT(0xb0bec5));jaw.scale.set(.24,.12,.2);jaw.position.set(0,.04,.12);add(jaw);
    for(const sx of [-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(.05,6,6),new THREE.MeshBasicMaterial({color:0x220022}));e.position.set(sx*.08,.24,.17);g.add(e);}
  }
  // halo-guia: forte no início, quase apagado no fim (mais escondidas com o passar das fases)
  const haloOp=big?.95:(hide>=2?.3:(hide>=1?.5:.9));
  const haloS=big?1:(hide>=2?.7:(hide>=1?.85:1));
  const halo=new THREE.Mesh(new THREE.TorusGeometry(.55*haloS,.04,8,20),new THREE.MeshBasicMaterial({color:0xffe27a,transparent:true,opacity:haloOp}));halo.rotation.x=Math.PI/2.3;g.add(halo);
  g.position.set(x,y,z);scene.add(g);
  // camuflagem física ao redor (não bloqueia a coleta: fica a 1.2m de distância)
  if(!big&&hide>=1){
    addBush(x+1.3,0,z+.6,.8);addRock(x-1.2,0,z-.7,.55);
    if(hide>=2){addBush(x-.9,0,z+1.1,.9);addRock(x+1.1,0,z-1,.7);}
  }
  pickups.push({mesh:g,big,halo,t:Math.random()*5,taken:false,hide});
}
const LIFE_DROP_CHANCE=0.5; // 50% de chance do inimigo dropar kit de vida
const LIFE_HEAL=30;
function spawnHeart(x,y,z){
  // KIT DE VIDA: maleta branca com cruz vermelha nos dois lados + anel verde
  const g=new THREE.Group();
  const kase=new THREE.Mesh(boxGeo,MAT(0xf2f2ee));kase.scale.set(.5,.38,.3);kase.castShadow=true;g.add(kase);
  const lid=new THREE.Mesh(boxGeo,MAT(0xcfcfc8));lid.scale.set(.52,.09,.32);lid.position.y=.22;g.add(lid);
  const handle=new THREE.Mesh(boxGeo,MAT(0x8a8a84));handle.scale.set(.24,.06,.08);handle.position.y=.3;g.add(handle);
  const crossM=new THREE.MeshBasicMaterial({color:0xe02020});
  for(const sz of [1,-1]){
    const cv=new THREE.Mesh(boxGeo,crossM);cv.scale.set(.12,.28,.02);cv.position.set(0,.02,sz*.16);g.add(cv);
    const ch=new THREE.Mesh(boxGeo,crossM);ch.scale.set(.28,.12,.02);ch.position.set(0,.02,sz*.16);g.add(ch);
  }
  const halo=new THREE.Mesh(new THREE.TorusGeometry(.48,.045,8,20),new THREE.MeshBasicMaterial({color:0x51ff7a}));
  halo.rotation.x=Math.PI/2.3;g.add(halo);
  g.position.set(x,y,z);scene.add(g);
  pickups.push({mesh:g,heart:true,t:0,taken:false,halo});
}
function spawnSkillPotion(x,y,z){
  const g=new THREE.Group();
  const bottle=new THREE.Mesh(new THREE.CylinderGeometry(.12,.18,.35,8),new THREE.MeshStandardMaterial({color:0x4444ff,emissive:0x2222aa,transparent:true,opacity:.85}));
  bottle.position.y=.175;g.add(bottle);
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.06,.1,.12,6),new THREE.MeshStandardMaterial({color:0x6666cc,metalness:.3}));
  neck.position.y=.41;g.add(neck);
  const cork=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.06,6),MAT(0x8a6a3a));
  cork.position.y=.49;g.add(cork);
  const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(.08),new THREE.MeshBasicMaterial({color:0x8888ff}));
  crystal.position.y=.35;g.add(crystal);
  const halo=new THREE.Mesh(new THREE.TorusGeometry(.35,.04,8,16),new THREE.MeshBasicMaterial({color:0x6666ff,transparent:true,opacity:.6}));
  halo.rotation.x=Math.PI/2;g.add(halo);
  g.position.set(x,y,z);scene.add(g);
  pickups.push({mesh:g,skill:true,t:0,taken:false,halo});
}
function addLever(x,y,z,id){
  const g=new THREE.Group();
  const base=new THREE.Mesh(boxGeo,MAT(0x555555));base.scale.set(.6,.3,.6);base.position.y=.15;g.add(base);
  const stick=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,1,6),MAT(0x8a2a2a));stick.position.y=.8;g.add(stick);
  const knob=new THREE.Mesh(new THREE.SphereGeometry(.14,8,8),MAT(0xffd76a,{emissive:0x553300}));knob.position.y=1.3;g.add(knob);
  g.position.set(x,y,z);g.traverse(o=>{if(o.isMesh)o.castShadow=true;});scene.add(g);
  levers.push({mesh:g,stick,on:false,id,pos:new THREE.Vector3(x,y,z)});
  addBox(x,y-.1,z,1,.2,1,0x333333,{cast:false});
}
function addDoor(x,y,z,w,h,d,id){
  const {mesh,box}=addBox(x,y,z,w,h,d,0x7a5a2e);
  // detalhe dourado
  const trim=new THREE.Mesh(boxGeo,MAT(0xc9a227,{metalness:.6,roughness:.3}));trim.scale.set(w+.2,.3,d+.2);trim.position.set(x,y+h/2-.2,z);scene.add(trim);
  const dobj={mesh,box,trim,id,open:false,baseY:y,targetY:y,boxRef:null};
  dobj.boxRef=colliders[colliders.length-1];
  doors.push(dobj);return dobj;
}
function openDoor(id){
  let opened=false;
  for(const d of doors)if(d.id===id&&!d.open){d.open=true;d.targetY=d.baseY+4.2;opened=true;}
  if(opened){AudioSys.door();showMsg('🔓 Uma porta de pedra range e se abre...');}
}
function previewNextPhase(){
  // 🔮 PRÉVIA DA PRÓXIMA FASE: ao completar os fragmentos, o portal mostra o destino
  // (nome + história da fase seguinte) e o portal fica dourado e pulsante.
  // Entrar no portal avança normalmente (nextLevel).
  if(levelIndex>=2||previewShown||state!=='playing')return;
  const n=STORIES[levelIndex+1];
  if(!n)return;
  previewShown=true;
  $('pp-kicker').textContent='🔮 VISÃO DO DESTINO • '+n.k;
  $('pp-title').textContent='➜ '+n.t;
  $('pp-text').textContent=n.x;
  $('phase-preview').classList.remove('hidden');
  if(exitGate){exitGate.preview=true;exitGate.portal.material.color.set(0xffd76a);}
  showMsg('🔮 O portal mostra a próxima fase: '+n.t+'! Entre no portal!',6000);
  AudioSys.relicBig();
  setTimeout(()=>$('phase-preview').classList.add('hidden'),9000);
}
function addGrapple(x,y,z){
  // LAÇO dourado remodelado: aro duplo ouro + bronze, elos trançados, manilha forjada,
  // cipós entrelaçados ANCORADOS no topo + gema-guia + fitas que esvoaçam
  const grp=new THREE.Group();
  const ringMat=new THREE.MeshStandardMaterial({color:0xd4a72c,metalness:.85,roughness:.25,emissive:0x221100});
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.72,.13,12,28),ringMat);
  ring.rotation.y=.25;grp.add(ring);
  const inner=new THREE.Mesh(new THREE.TorusGeometry(.72,.045,8,28),MAT(0x8a5f1e,{metalness:.8,roughness:.3}));
  inner.rotation.y=.25;inner.position.z=-.08;grp.add(inner); // filete interno
  for(let i=0;i<8;i++){ // rebites dourados ao redor do aro
    const a=i/8*Math.PI*2;
    const riv=new THREE.Mesh(new THREE.SphereGeometry(.05,8,6),MAT(0xffe27a,{metalness:.8,roughness:.2}));
    riv.position.set(Math.cos(a)*.72,Math.sin(a)*.72,.1);riv.rotation.y=.25;grp.add(riv);
  }
  const band=new THREE.Mesh(new THREE.TorusGeometry(.72,.05,6,22),MAT(0x5a3d1e));
  band.rotation.y=.25;band.position.z=.12;grp.add(band); // cinta de couro no aro
  const shackle=new THREE.Mesh(boxGeo,new THREE.MeshStandardMaterial({color:0x3a3a42,metalness:.7,roughness:.4}));
  shackle.scale.set(.28,.36,.28);shackle.position.y=.92;grp.add(shackle);
  const shacklePin=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.4,8),MAT(0xc9a227,{metalness:.8,roughness:.25}));
  shacklePin.rotation.z=Math.PI/2;shacklePin.position.y=.92;grp.add(shacklePin);
  // cipós ANCORADOS no topo da montanha (a argola pende sobre a ravina)
  const vine=new THREE.Mesh(new THREE.CylinderGeometry(.06,.09,2.4,6),MAT(0x2f7a2f));vine.position.y=-1.2;grp.add(vine);
  const vine2=new THREE.Mesh(new THREE.CylinderGeometry(.035,.05,2.2,5),MAT(0x3da33d));vine2.position.set(.15,-1.1,.1);vine2.rotation.z=.06;grp.add(vine2);
  const vine3=new THREE.Mesh(new THREE.CylinderGeometry(.025,.04,2.0,5),MAT(0x57b34a));vine3.position.set(-.16,-1.05,-.08);vine3.rotation.z=-.07;grp.add(vine3);
  for(const fx of [-1,1]){ // folhas no cipó
    const leaf=new THREE.Mesh(boxGeo,MAT(0x37b34a));leaf.scale.set(.22,.04,.12);leaf.position.set(fx*.12,-1.5-fx*.2,.05);leaf.rotation.z=fx*.5;grp.add(leaf);
  }
  const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.13),new THREE.MeshBasicMaterial({color:0xffe27a}));
  gem.position.y=-.82;grp.add(gem);
  const halo=new THREE.Mesh(new THREE.TorusGeometry(.95,.03,6,28),new THREE.MeshBasicMaterial({color:0xffe27a,transparent:true,opacity:.65}));
  halo.position.y=-.2;halo.rotation.x=Math.PI/2.2;grp.add(halo);
  grp.position.set(x,y,z);
  grp.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  scene.add(grp);
  grapples.push({pos:new THREE.Vector3(x,y,z),mesh:ring,grp,gem,halo,ringMat,phase:Math.random()*6,kick:0});
}
function updateGrapples(dt){
  const t=performance.now()*.001;
  for(const gr of grapples){
    gr.kick=Math.max(0,gr.kick-dt*1.4);
    // balanço suave + solavanco quando o chicote gruda
    gr.grp.rotation.z=Math.sin(t*.9+gr.phase)*.07+Math.sin(t*7+gr.phase)*.05*gr.kick;
    gr.grp.rotation.x=Math.cos(t*.7+gr.phase)*.05;
    // gema-guia + halo pulsam forte quando o player está ao alcance
    const dx=gr.pos.x-player.position.x,dz=gr.pos.z-player.position.z;
    const near=Math.hypot(dx,dz)<9;
    gr.gem.scale.setScalar((near?1.6:1)+Math.sin(t*5)*.18);
    gr.gem.rotation.y+=dt*(near?4:1.5);
    if(gr.halo){gr.halo.scale.setScalar(1+Math.sin(t*3+gr.phase)*.07);gr.halo.material.opacity=near?.9:.5;}
    gr.ringMat.emissive.setHex(near?0x7a5200:0x221100);
  }
}
function addSpikes(x,y,z,w=3,d=3,dmg=18){
  const g=new THREE.Group();
  const base=new THREE.Mesh(boxGeo,MAT(0x3a3a3a));base.scale.set(w,.2,d);base.position.set(x,y+.1,z);base.receiveShadow=true;scene.add(base);
  for(let i=0;i<w*d*1.2;i++){const s=new THREE.Mesh(new THREE.ConeGeometry(.16,.8,5),MAT(0x9aa0a8,{metalness:.6,roughness:.4}));s.position.set(x+(Math.random()-.5)*(w-.5),y+.5,z+(Math.random()-.5)*(d-.5));s.castShadow=false;scene.add(s);}
  hazards.push({type:'spikes',pos:new THREE.Vector3(x,y,z),r:Math.max(w,d)/1.3,dmg,cd:0}); // área MAIOR!
}
// ---------- ROLOS ONE-SHOT: tronco ou pedra que atravessa o caminho UMA vez ----------
// Disparam quando o player se aproxima, rolam de um lado ao outro (sem ir e voltar)
// e só voltam a armar quando o player morre ou volta ao início (resetRollers).
function addRoller(x,y,z,axis='x',opts={}){
  const kind=opts.kind||'log';
  const r=opts.r||1;
  const g=new THREE.Group();
  if(kind==='log'){
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.55*r,.55*r,3.2*r,10),MAT(0x5a3d22));
    if(axis==='x')trunk.rotation.x=Math.PI/2;else trunk.rotation.z=Math.PI/2;
    trunk.castShadow=true;g.add(trunk);
    for(let i=0;i<5;i++){
      const sp=new THREE.Mesh(new THREE.ConeGeometry(.10*r,.45*r,6),MAT(0x7a5a33));
      if(axis==='x')sp.position.set(0,.65*r,-1.2*r+i*.6*r);
      else sp.position.set(-1.2*r+i*.6*r,.65*r,0);
      g.add(sp);
    }
    for(const b of [-1,1]){
      const band=new THREE.Mesh(new THREE.TorusGeometry(.56*r,.05*r,6,14),MAT(0x3a2512));
      if(axis==='x')band.position.set(0,0,b*1*r);
      else{band.rotation.y=Math.PI/2;band.position.set(b*1*r,0,0);}
      g.add(band);
    }
  }else{
    const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.9*r,0),MAT(0x6a5a48));
    rock.castShadow=true;g.add(rock);
    const stripe=new THREE.Mesh(new THREE.TorusGeometry(.92*r,.07*r,6,12),MAT(0x4a3d30));
    stripe.rotation.x=Math.PI/2.3;g.add(stripe);
  }
  const range=opts.range||8, speed=opts.speed||9, dir=opts.dir||1;
  const start=new THREE.Vector3(x,y,z), end=new THREE.Vector3(x,y,z);
  if(axis==='x'){start.x=x-dir*range;end.x=x+dir*range;}
  else{start.z=z-dir*range;end.z=z+dir*range;}
  g.position.copy(start);
  g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  // lisura: só o corpo principal projeta sombra (galhos/cintas não)
  for(const ch of g.children){if(ch.isMesh&&ch.geometry&&(ch.geometry.type==='ConeGeometry'||ch.geometry.type==='TorusGeometry'))ch.castShadow=false;}
  scene.add(g);
  // anel de aviso amarelo marcando a linha de passagem
  const warn=new THREE.Mesh(new THREE.RingGeometry(1.1,1.4,20),new THREE.MeshBasicMaterial({color:0xffd23b,transparent:true,opacity:.45,side:THREE.DoubleSide}));
  warn.rotation.x=-Math.PI/2;warn.position.set(x,.06,z);scene.add(warn);
  rollers.push({mesh:g,warn,kind,axis,range,speed,dir,start,end,state:'armed',prog:0,dmg:opts.dmg||50,r:(kind==='log'?.85:.95)*r,phase:Math.random()*6});
}
function resetRollers(){
  // rearma todos os rolos: voltam ao ponto de partida (ao morrer / voltar ao início)
  for(const r of rollers){r.state='armed';r.prog=0;r.mesh.position.copy(r.start);r.mesh.rotation.set(0,0,0);}
}
function updateRollers(dt){
  const t=performance.now()*.001;
  for(const r of rollers){
    r.warn.material.opacity=.35+Math.sin(t*4+r.phase)*.15;
    if(r.state==='armed'){
      // treme de aviso quando o player chega perto
      const d=Math.hypot(player.position.x-r.mesh.position.x,player.position.z-r.mesh.position.z);
      r.mesh.position.y=r.start.y+(d<7?Math.abs(Math.sin(t*10))*.06:0);
      // dispara quando o player pisa na linha de passagem
      const cx=(r.start.x+r.end.x)/2, cz=(r.start.z+r.end.z)/2;
      const nearLine=r.axis==='x'
        ? (Math.abs(player.position.z-cz)<2.2&&Math.abs(player.position.x-cx)<r.range+1.5)
        : (Math.abs(player.position.x-cx)<2.2&&Math.abs(player.position.z-cz)<r.range+1.5);
      if(nearLine&&Math.abs(player.position.y-r.start.y)<2.5){
        r.state='rolling';AudioSys.noise(.5,.2);AudioSys.tone(90,.5,'sawtooth',.14,40);
        showMsg(r.kind==='log'?'🪵 TRONCO ROLANDO! CORRE!':'🪨 PEDRA ROLANDO! CORRE!',1500);
        shake=Math.max(shake,.3);
      }
    }else if(r.state==='rolling'){
      r.prog+=dt*r.speed;
      const k=Math.min(1,r.prog/(r.range*2));
      r.mesh.position.lerpVectors(r.start,r.end,k);
      if(r.axis==='x')r.mesh.rotation.z-=dt*r.speed/Math.max(.3,r.r);
      else r.mesh.rotation.x+=dt*r.speed/Math.max(.3,r.r);
      if(Math.random()<.4)spawnSpark(r.mesh.position.clone().add(new THREE.Vector3(0,.3,0)));
      const dh=Math.hypot(player.position.x-r.mesh.position.x,player.position.z-r.mesh.position.z);
      const dy=player.position.y-r.mesh.position.y;
      if(dh<r.r+.55&&dy>-0.8&&dy<1.6)damage(r.dmg,r.kind==='log'?'🪵 Atingido pelo tronco rolante!':'🪨 Atingido pela pedra rolante!');
      if(k>=1)r.state='spent';
    }
    // 'spent': fica parado no fim até resetRollers()
  }
}
function addLava(x,y,z,w,d){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({color:0xff4400}));
  m.rotation.x=-Math.PI/2;m.position.set(x,y+.05,z);scene.add(m);
  const m2=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({color:0xffcc00,transparent:true,opacity:.5}));
  m2.rotation.x=-Math.PI/2;m2.position.set(x,y+.09,z);scene.add(m2);
  hazards.push({type:'lava',pos:new THREE.Vector3(x,y,z),w,d,dmg:30,mesh:m2,cd:0});
  // borda de pedra (visual, sem colisão p/ não prender o player)
  addBox(x,y-.4,z,w+.6,.8,d+.6,0x2b2b30,{cast:false,solid:false});
}
function addLaser(x1,y1,z1,x2,y2,z2,opts={}){
  // feixe SEMPRE LIGADO: núcleo branco + halo vermelho, emissores nas pontas
  const a=new THREE.Vector3(x1,y1,z1), b=new THREE.Vector3(x2,y2,z2);
  const grp=new THREE.Group();scene.add(grp);
  const core=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,1,8),new THREE.MeshBasicMaterial({color:0xfff2b0}));
  const glow=new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,1,8),new THREE.MeshBasicMaterial({color:0xff2222,transparent:true,opacity:.4}));
  grp.add(core);grp.add(glow);
  const capM=MAT(0x2b2b30);
  for(const s of [-1,1]){
    const cap=new THREE.Mesh(boxGeo,capM);cap.scale.set(.5,.5,.5);cap.position.y=s*.5;grp.add(cap);
    const lens=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),new THREE.MeshBasicMaterial({color:0xff3333}));lens.position.y=s*.5;grp.add(lens);
  }
  const h={type:'laser',a,b,core,glow,grp,dmg:opts.dmg||12,cd:0,maxCd:opts.cd||.8,r:opts.r||.3,
    sweep:opts.sweep||null,phase:Math.random()*6,
    center:new THREE.Vector3((x1+x2)/2,(y1+y2)/2,(z1+z2)/2),half:0};
  if(h.sweep)h.half=new THREE.Vector3(x2-x1,y2-y1,z2-z1).length()/2;
  layoutLaser(h);
  hazards.push(h);
  return h;
}
const _pa=new THREE.Vector3(), _ab=new THREE.Vector3(), _YUP=new THREE.Vector3(0,1,0);
function layoutLaser(h){
  _ab.subVectors(h.b,h.a);
  const len=Math.max(.001,_ab.length());
  h.grp.position.copy(h.a).add(h.b).multiplyScalar(.5);
  h.grp.quaternion.setFromUnitVectors(_YUP,_ab.normalize());
  h.core.scale.set(1,len,1);h.glow.scale.set(1,len,1);
}
function distPointSeg(p,a,b){
  _ab.subVectors(b,a);
  _pa.subVectors(p,a);
  const t=THREE.MathUtils.clamp(_pa.dot(_ab)/Math.max(1e-6,_ab.lengthSq()),0,1);
  _pa.addScaledVector(_ab,-t); // vetor do ponto mais próximo do segmento até p
  return _pa.length();
}
function addDartShooter(x,y,z,dir,interval=2.2){
  const d=dir&&dir.isVector3?dir.clone():new THREE.Vector3(dir?.x||0,dir?.y||0,dir?.z||0);
  const b=new THREE.Mesh(boxGeo,MAT(0x5a5a5a));b.scale.set(.6,.6,.6);b.position.set(x,y,z);b.castShadow=true;scene.add(b);
  const hole=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.3,8),new THREE.MeshBasicMaterial({color:0x000000}));hole.position.set(x+d.x*.35,y,z+d.z*.35);hole.rotation.z=Math.PI/2;scene.add(hole);
  dynamics.push({type:'shooter',pos:new THREE.Vector3(x,y,z),dir:d,t:Math.random()*interval,interval});
}
function fireDart(pos,dir){
  const m=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.7,6),MAT(0x2fa14d,{emissive:0x003300}));
  m.position.copy(pos);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);scene.add(m);
  projectiles.push({mesh:m,vel:dir.clone().multiplyScalar(14),life:4});
  AudioSys.dart();
}
function addSpearTrap(x,y,z,dir,opts={}){
  // TOTEM LANÇA-LANÇAS: bloco de pedra com furos + máscara; cospe lanças de verdade (desviáveis/ puláveis)
  const d=dir&&dir.isVector3?dir.clone():new THREE.Vector3(dir?.x||0,dir?.y||0,dir?.z||0);
  if(d.lengthSq()<1e-6)d.set(1,0,0);
  d.normalize();
  const g=new THREE.Group();
  const stone=MAT(0x5a4f42), darkM=MAT(0x2b2b30);
  const pillar=new THREE.Mesh(boxGeo,stone);pillar.scale.set(.9,2.2,.9);pillar.position.set(x,y+1.1,z);pillar.castShadow=true;g.add(pillar);
  const cap=new THREE.Mesh(boxGeo,MAT(0xc9a227,{metalness:.5,roughness:.5}));cap.scale.set(1.0,.18,1.0);cap.position.set(x,y+2.25,z);g.add(cap);
  const mask=new THREE.Mesh(boxGeo,darkM);mask.scale.set(.5,.7,.2);mask.position.set(x+d.x*.45,y+1.2,z+d.z*.45);
  mask.rotation.y=Math.atan2(d.x,d.z);g.add(mask);
  for(const oy of [-0.18,0.1]){
    const hole=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.3,8),new THREE.MeshBasicMaterial({color:0x000000}));
    hole.position.set(x+d.x*.55,y+1.2+oy,z+d.z*.55);
    hole.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d);g.add(hole);
  }
  scene.add(g);
  dynamics.push({type:'spearTrap',pos:new THREE.Vector3(x,y+1.2,z),dir:d,mesh:g,
    t:(opts.delay||0)+Math.random()*(opts.interval||2.4),interval:opts.interval||2.4,
    y:opts.y!=null?opts.y:(y+1.2),sweep:opts.sweep||null,phase:Math.random()*6,dmg:opts.dmg||14});
}
function fireSpear(pos,dir,dmg=14){
  // LANÇA voadora: haste longa + ponta metálica + penas — dá p/ ver, pular e desviar
  const g=new THREE.Group();
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,1.7,7),MAT(0x6b4a2b));shaft.castShadow=true;g.add(shaft);
  const tip=new THREE.Mesh(new THREE.ConeGeometry(.1,.36,7),MAT(0xb9c0c8,{metalness:.85,roughness:.25}));tip.position.y=.95;g.add(tip);
  for(let i=0;i<3;i++){const a=i/3*Math.PI*2;const f=new THREE.Mesh(boxGeo,MAT(0xc22f2f));f.scale.set(.02,.3,.14);f.position.set(Math.cos(a)*.07,-.8,Math.sin(a)*.07);f.rotation.y=-a;g.add(f);}
  g.position.copy(pos);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());
  scene.add(g);
  projectiles.push({mesh:g,vel:dir.clone().normalize().multiplyScalar(15),life:3.2,spear:true,dmg,r:.95});
  AudioSys.dart();AudioSys.noise(.12,.07);
}
// ---------- LANÇA CRAVADA NO PLAYER (fase 2: sentinela arremessa e fica fincada!) ----------
function stickSpearToPlayer(dir){
  // cria mini-lança fincada no torso do herói: balança, sangra e pesa por 6s!
  try{
    const rig=player?.userData?.rig;
    if(!rig)return;
    if(stuckSpears.length>=3){ // máximo 3: a mais antiga cai
      const old=stuckSpears.shift();
      try{rig.remove(old.mesh);}catch{}
    }
    const g=new THREE.Group();
    const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,1.3,7),MAT(0x6b4a2b));
    shaft.castShadow=false;g.add(shaft);
    const tip=new THREE.Mesh(new THREE.ConeGeometry(.08,.28,7),MAT(0xb9c0c8,{metalness:.85,roughness:.25}));
    tip.position.y=.75;g.add(tip);
    const blood=new THREE.Mesh(new THREE.SphereGeometry(.09,7,6),new THREE.MeshBasicMaterial({color:0xcc1414}));
    blood.position.y=-.55;g.add(blood);
    // posição aleatória no torso/ombro (frente = +Z local)
    const side=(Math.random()-.5)*0.5, up=0.9+Math.random()*0.5;
    g.position.set(side,up,0.22);
    // inclinação: veio de frente (dir) → crava inclinada p/ trás
    g.rotation.x=0.7+Math.random()*0.4;
    g.rotation.z=(Math.random()-.5)*0.7;
    g.rotation.y=(Math.random()-.5)*0.5;
    rig.add(g);
    stuckSpears.push({mesh:g,blood,t:6,phase:Math.random()*6});
    spearSlow=6; // pernas pesam enquanto sangra!
    AudioSys.noise(.3,.18);AudioSys.tone(200,.3,'sawtooth',.12,-120);
    showMsg('🗡 Lança CRAVADA! Puxe... quer dizer, CORRA! 🩸',2200);
    for(let i=0;i<5;i++)spawnSpark(player.position.clone().add(new THREE.Vector3(0,1.2,0)));
  }catch{}
}
function updateStuckSpears(dt){
  if(spearSlow>0)spearSlow-=dt;
  for(let i=stuckSpears.length-1;i>=0;i--){
    const s=stuckSpears[i];
    s.t-=dt;
    // treme fincada + sangue pingando
    s.mesh.rotation.x+=Math.sin(performance.now()*.012+s.phase)*dt*1.2;
    s.mesh.rotation.z+=Math.cos(performance.now()*.011+s.phase)*dt*1.0;
    s.mesh.position.y+=Math.sin(performance.now()*.02+s.phase)*dt*0.05;
    if(s.blood)s.blood.scale.setScalar(1+Math.sin(performance.now()*.015+s.phase)*0.25);
    if(Math.random()<dt*3)spawnSpark(player.position.clone().add(new THREE.Vector3((Math.random()-.5)*.5,1.1,(Math.random()-.5)*.5)));
    if(s.t<=0){
      try{player?.userData?.rig?.remove(s.mesh);}catch{}
      stuckSpears.splice(i,1);
      showMsg('💪 Você arrancou a lança!',1500);
    }
  }
}
function addBoulder(x,y,z,axis='z',range=20,speed=8,dmg=35,r=1.4){
  const m=new THREE.Mesh(new THREE.SphereGeometry(r,14,12),MAT(0x6a5a48));
  m.position.set(x,y,z);m.castShadow=true;scene.add(m);
  // sulcos
  const stripe=new THREE.Mesh(new THREE.TorusGeometry(r+.02,.08,6,16),MAT(0x4a3d30));stripe.position.copy(m.position);scene.add(stripe);
  boulders.push({mesh:m,stripe,center:new THREE.Vector3(x,y,z),axis,range,speed,t:Math.random()*5,dmg,r});
}
function addPit(x,z,w,d,sx,sy,sz,msg){
  hazards.push({type:'pit',pos:new THREE.Vector3(x,0,z),w,d,dmg:12,cd:0,safe:new THREE.Vector3(sx,sy,sz),msg:msg||'🕳 Você caiu no abismo!'});
}
function addLavaPit(x,z,w,d,sx,sy,sz,msg){
  // ravina de lava: visual de lava + quem cai queima e volta p/ ponto seguro
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({color:0xff4400}));
  m.rotation.x=-Math.PI/2;m.position.set(x,-1.25,z);scene.add(m);
  const m2=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({color:0xffcc00,transparent:true,opacity:.5}));
  m2.rotation.x=-Math.PI/2;m2.position.set(x,-1.21,z);scene.add(m2);
  hazards.push({type:'lavapit',pos:new THREE.Vector3(x,0,z),w,d,dmg:20,cd:0,mesh:m2,safe:new THREE.Vector3(sx,sy,sz),msg:msg||'🔥 LAVA! Use o CHICOTE nos anéis dourados!'});
}
function addBlade(x,y,z,opts={}){
  const pivot=new THREE.Group();pivot.position.set(x,y+5,z);scene.add(pivot);
  const rope=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,5,6),MAT(opts.rope||0x333333));rope.position.y=-2.5;pivot.add(rope);
  let head;
  if(opts.log){ // tronco com espinhos (selva) em vez de lâmina de metal
    head=new THREE.Group();
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,2.4,8),MAT(0x5a3d22));trunk.rotation.z=Math.PI/2;trunk.castShadow=true;head.add(trunk);
    for(let i=0;i<6;i++){const sp=new THREE.Mesh(new THREE.ConeGeometry(.12,.5,6),MAT(0x8a7a5a));sp.position.set(-1+i*.4,.6,0);head.add(sp);}
    head.position.y=-5;
    if(opts.w)head.scale.x=opts.w/2.4; // tronco largo cobre mais área
  }else{
    head=new THREE.Mesh(new THREE.ConeGeometry(.7,2,4),MAT(0xb9c0c8,{metalness:.8,roughness:.3}));head.position.y=-5;head.rotation.x=Math.PI;
  }
  pivot.add(head);
  hazards.push({type:'blade',pos:new THREE.Vector3(x,y,z),pivot,dmg:opts.dmg||22,r:opts.r||1.6,cd:0,t:Math.random()*5});
}
function addMovingPlatform(x,y,z,w,d,axis='x',range=6,speed=1.6){
  const {mesh,box}=addBox(x,y,z,w,.6,d,0x8a7a5a);
  const c=colliders[colliders.length-1];
  const p={mesh,box,c,center:new THREE.Vector3(x,y,z),axis,range,speed,t:Math.random()*5,prev:new THREE.Vector3(x,y,z),w,d};
  c.platform=p;
  platforms.push(p);
}
function addFallingPlatform(x,y,z){
  const {mesh}=addBox(x,y,z,3,.5,3,0xa08a5a);
  const c=colliders[colliders.length-1];
  const p={mesh,box:c.box,c,center:new THREE.Vector3(x,y,z),falling:true,state:0,t:0,prev:mesh.position.clone()};
  c.platform=null;
  platforms.push(p);
}
function setExit(x,y,z){
  const g=new THREE.Group();
  const f1=new THREE.Mesh(boxGeo,MAT(0x8a7a5a));f1.scale.set(1,5,1);f1.position.set(-2,2.5,0);g.add(f1);
  const f2=f1.clone();f2.position.x=2;g.add(f2);
  const top=new THREE.Mesh(boxGeo,MAT(0xc9a227,{metalness:.5,roughness:.4}));top.scale.set(5.4,.8,1.2);top.position.y=5.2;g.add(top);
  const portal=new THREE.Mesh(new THREE.PlaneGeometry(3.2,4.4),new THREE.MeshBasicMaterial({color:0x7dffd4,transparent:true,opacity:.75,side:THREE.DoubleSide}));
  portal.position.y=2.3;g.add(portal);
  g.position.set(x,y,z);g.traverse(o=>{if(o.isMesh)o.castShadow=true;});scene.add(g);
  exitGate={pos:new THREE.Vector3(x,y,z),mesh:g,portal};
}

// ---------- DECOR REALISTA (leve: sem sombra p/ não pesar) ----------
function addRock(x,y,z,s=1){
  const r=new THREE.Mesh(new THREE.DodecahedronGeometry(s,0),MAT(0x7a7a72));
  r.position.set(x,y+s*.45,z);r.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);
  r.castShadow=true;r.receiveShadow=true;scene.add(r);return r;
}
function addBush(x,y,z,s=1){
  const b=new THREE.Mesh(new THREE.SphereGeometry(s,7,6),MAT(0x2f7a2f));
  b.scale.y=.62;b.position.set(x,y+s*.35,z);scene.add(b);return b;
}
function addParkourRoute(x,z,dx,dz,stepH=0.55,n=3,w=1.7){
  // ROTA DE PARKOUR: degraus de pedra ascendentes (sólidos: dá p/ subir pulando)
  // + laje inclinada decorativa + PONTA BRANCA em cada degrau marcando o caminho 🎯
  for(let i=0;i<n;i++){
    const h=stepH*(i+1);
    const sx=x+dx*i, sz=z+dz*i;
    addBox(sx,h/2,sz,w,h,w,0x7a7a72);
    addRock(sx+(Math.random()-.5)*.4,h,sz,.3); // pedrinhas (só visual)
    const tip=new THREE.Mesh(boxGeo,MAT(0xf5f5f0,{roughness:.6}));
    tip.scale.set(w*.6,.07,w*.6);tip.position.set(sx,h+.035,sz);tip.castShadow=true;scene.add(tip);
  }
  const tx=x+dx*(n-1), tz=z+dz*(n-1), th=stepH*n;
  // laje-rampa decorativa encostada na lateral (formato de rampa)
  const slab=new THREE.Mesh(boxGeo,MAT(0x8a8a82));
  const run=Math.hypot(dx*(n-1),dz*(n-1))+1.2;
  slab.scale.set(.5,Math.hypot(run,th),w*.9);
  slab.position.set(x+dx*(n-1)/2+w*.85,th/2,z+dz*(n-1)/2);
  slab.rotation.z=dx!==0?-Math.atan2(th,run):0;
  slab.rotation.x=dz!==0?Math.atan2(th,run):0;
  slab.castShadow=true;scene.add(slab);
  // 🎯 TINTA BRANCA na ponta = "parkour aqui!"
  const tip=new THREE.Mesh(boxGeo,MAT(0xf5f5f0,{roughness:.6}));
  tip.scale.set(w*.7,.12,w*.7);tip.position.set(tx,th+.06,tz);tip.castShadow=true;scene.add(tip);
  return {topX:tx,topY:th,topZ:tz};
}
function addJaguarStatue(x,y,z,ry=0){
  const g=new THREE.Group();const st=MAT(0x8a8a7a);
  const base=new THREE.Mesh(boxGeo,st);base.scale.set(1.6,.5,1.6);base.position.y=.25;g.add(base);
  const body=new THREE.Mesh(boxGeo,st);body.scale.set(.9,.8,1.6);body.position.y=.9;g.add(body);
  const chest=new THREE.Mesh(boxGeo,st);chest.scale.set(.9,1.1,.7);chest.position.set(0,1.2,.8);g.add(chest);
  const hd=new THREE.Mesh(boxGeo,st);hd.scale.set(.7,.6,.6);hd.position.set(0,1.9,.9);g.add(hd);
  for(const sx of [-1,1]){const ear=new THREE.Mesh(new THREE.ConeGeometry(.12,.3,5),st);ear.position.set(sx*.22,2.3,.9);g.add(ear);}
  const tail=new THREE.Mesh(new THREE.CylinderGeometry(.08,.12,1.4,6),st);tail.position.set(0,1.2,-1);tail.rotation.x=.5;g.add(tail);
  g.position.set(x,y,z);g.rotation.y=ry;
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(g);return g;
}
function addBanner(x,y,z,w,h,color,ry=0){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({color,roughness:.9,side:THREE.DoubleSide}));
  m.position.set(x,y,z);m.rotation.y=ry;scene.add(m);return m;
}
function addStalactite(x,y,z,s=1){
  const c=new THREE.Mesh(new THREE.ConeGeometry(.5*s,2.2*s,7),MAT(0x3a2f2b));
  c.rotation.x=Math.PI;c.position.set(x,y-s*.6,z);scene.add(c);return c;
}
function addGlowCrack(x,y,z,w,d){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({color:0xff6a00}));
  m.rotation.x=-Math.PI/2;m.position.set(x,y,z);scene.add(m);return m;
}
// ---------- DETALHES VISUAIS (sem colisão física, salvo indicado) ----------
function addCloud(x,y,z,s=1){
  const g=new THREE.Group();
  const m=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.88});
  for(const [ox,oy,oz,r] of [[-1.6,0,0,1.4],[0,.3,.2,1.9],[1.6,0,-.1,1.3],[.4,-.3,.4,1.0]]){
    const b=new THREE.Mesh(new THREE.SphereGeometry(r*s,8,6),m);b.position.set(ox*s,oy*s,oz*s);b.scale.y=.55;g.add(b);
  }
  g.position.set(x,y,z);scene.add(g);
  fxNodes.push({kind:'cloud',m:g,x,z,sp:.25+Math.random()*.3});
  return g;
}
function addDistantPeak(x,z,h,r){
  const g=new THREE.Group();
  const rock=new THREE.Mesh(new THREE.ConeGeometry(r,h,7),MAT(0x5f7f9c,{roughness:1,metalness:0}));rock.position.y=h/2;g.add(rock);
  const snow=new THREE.Mesh(new THREE.ConeGeometry(r*.38,h*.3,7),MAT(0xe8f2f8,{roughness:.9,metalness:0}));snow.position.y=h-h*.15;g.add(snow);
  g.position.set(x,0,z);scene.add(g);return g;
}
function addGrassTuft(x,z,s=1){
  const g=new THREE.Group();
  const c1=MAT(0x3f9a3f),c2=MAT(0x2c6e2c);
  for(let i=0;i<3;i++){
    const b=new THREE.Mesh(new THREE.ConeGeometry(.09*s,.55*s,5),i%2?c1:c2);
    const a=Math.random()*Math.PI*2;
    b.position.set(Math.cos(a)*.12*s,.26*s,Math.sin(a)*.12*s);
    b.rotation.set((Math.random()-.5)*.35,0,(Math.random()-.5)*.35);
    g.add(b);
  }
  g.position.set(x,0,z);g.rotation.y=Math.random()*6;scene.add(g);return g;
}
function addFlower(x,z,col=0xff5a5a){
  const g=new THREE.Group();
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.02,.025,.4,5),MAT(0x2f7a2f));stem.position.y=.2;g.add(stem);
  const hd=new THREE.Mesh(new THREE.SphereGeometry(.08,7,6),new THREE.MeshBasicMaterial({color:col}));hd.position.y=.44;g.add(hd);
  g.position.set(x,0,z);scene.add(g);return g;
}
function addTrailStone(x,z,s=1){
  const r=new THREE.Mesh(new THREE.DodecahedronGeometry(.2*s,0),MAT(0x8a8a80,{roughness:1,metalness:0}));
  r.position.set(x,.08,z);r.rotation.set(Math.random()*3,Math.random()*3,0);scene.add(r);return r;
}
function addLily(x,z,s=1){
  const p=new THREE.Mesh(new THREE.CircleGeometry(.3*s,10),MAT(0x2f8a3d,{roughness:1,metalness:0}));
  p.rotation.x=-Math.PI/2;p.position.set(x,.035,z);scene.add(p);return p;
}
function addHangingVine(x,y,z,len=1.6){
  const v=new THREE.Mesh(new THREE.CylinderGeometry(.045,.06,len,5),MAT(0x2f7a2f));
  v.position.set(x,y-len/2,z);scene.add(v);
  const tip=new THREE.Mesh(new THREE.SphereGeometry(.09,6,5),MAT(0x3fa34d));tip.position.set(x,y-len,z);scene.add(tip);
  swayers.push({canopy:v,phase:Math.random()*6,amp:.05});
}
function addMossPatch(x,z,w,d){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),MAT(0x3a7a33,{roughness:1,metalness:0}));
  m.rotation.x=-Math.PI/2;m.rotation.z=Math.random()*3;m.position.set(x,.06,z);scene.add(m);return m;
}
function addDirtStrip(x,z,w=2.6){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,3.4),MAT(0x7a5f3d,{roughness:1,metalness:0}));
  m.rotation.x=-Math.PI/2;m.position.set(x,.06,z);scene.add(m);return m;
}
function addLightShaft(x,z,h=7,w=3){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:0xffe0a8,transparent:true,opacity:.07,side:THREE.DoubleSide,depthWrite:false}));
  m.position.set(x,h/2,z);m.rotation.y=Math.random()*Math.PI;m.rotation.z=.12;scene.add(m);return m;
}
function addUrn(x,z){
  addBox(x,.25,z,.95,.5,.95,0x6a6054); // base sólida (colide de verdade)
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.34,.26,.8,9),MAT(0x9a6a3d));body.position.y=.9;g.add(body);
  const lid=new THREE.Mesh(new THREE.SphereGeometry(.3,8,5,0,Math.PI*2,0,1.3),MAT(0x7a5228));lid.position.y=1.3;g.add(lid);
  const bandU=new THREE.Mesh(new THREE.TorusGeometry(.32,.04,6,12),MAT(0xc9a227,{metalness:.6,roughness:.35}));bandU.rotation.x=Math.PI/2;bandU.position.y=1.0;g.add(bandU);
  g.position.set(x,0,z);scene.add(g);return g;
}
function addChain(x,z){
  const g=new THREE.Group();
  const c=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,2.6,6),MAT(0x3a3a42,{metalness:.7,roughness:.4}));c.position.y=5.7;g.add(c);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.16,.04,6,10),MAT(0x55555e,{metalness:.7,roughness:.4}));ring.position.y=4.35;g.add(ring);
  const hook=new THREE.Mesh(new THREE.ConeGeometry(.09,.3,6),MAT(0x55555e,{metalness:.7,roughness:.4}));hook.rotation.x=Math.PI;hook.position.y=4.1;g.add(hook);
  g.position.set(x,0,z);scene.add(g);return g;
}
function addMosaicStrip(x,z,len){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(.5,len),MAT(0xc9a227,{metalness:.55,roughness:.4}));
  m.rotation.x=-Math.PI/2;m.position.set(x,.03,z);scene.add(m);return m;
}
function addMedallion(x,z){
  const m=new THREE.Mesh(new THREE.CircleGeometry(.9,16),MAT(0x8a1f1f,{roughness:.9,metalness:0}));
  m.rotation.x=-Math.PI/2;m.position.set(x,.025,z);scene.add(m);
  const r=new THREE.Mesh(new THREE.RingGeometry(.6,.8,20),MAT(0xc9a227,{metalness:.6,roughness:.35}));
  r.rotation.x=-Math.PI/2;r.position.set(x,.03,z);scene.add(r);return m;
}
function addObsidian(x,z,s=1){
  addBox(x,.5*s,z,1.5*s,1*s,1.5*s,0x1a1a20); // base sólida
  const g=new THREE.Group();
  const n=2+((Math.random()*2)|0);
  for(let i=0;i<n;i++){
    const h=(1.2+Math.random()*1.2)*s;
    const c=new THREE.Mesh(new THREE.ConeGeometry(.3*s,h,5),MAT(0x23232e,{roughness:.35,metalness:.3}));
    const a=Math.random()*Math.PI*2;
    c.position.set(Math.cos(a)*.4*s,1*s+h/2-.2,Math.sin(a)*.4*s);
    c.rotation.set((Math.random()-.5)*.25,0,(Math.random()-.5)*.25);
    g.add(c);
  }
  g.position.set(x,0,z);scene.add(g);return g;
}
function addEmbers(n,x0,x1,y0,z0,z1,top=7){
  for(let i=0;i<n;i++){
    const s=.5+Math.random()*.8;
    const m=new THREE.Mesh(new THREE.SphereGeometry(.07,6,5),new THREE.MeshBasicMaterial({color:Math.random()<.5?0xff6a00:0xffcc44}));
    const x=x0+Math.random()*(x1-x0), y=y0+Math.random()*2, z=z0+Math.random()*(z1-z0);
    m.position.set(x,y,z);scene.add(m);
    fxNodes.push({kind:'ember',m,x,z,y0:y,top,sp:.5+Math.random(),s,t:Math.random()*4,p:Math.random()*6});
  }
}
function addDust(n,x0,x1,y0,y1,z0,z1){
  for(let i=0;i<n;i++){
    const m=new THREE.Mesh(new THREE.SphereGeometry(.045,6,5),new THREE.MeshBasicMaterial({color:0xd8c8a8,transparent:true,opacity:.6}));
    const x=x0+Math.random()*(x1-x0), y=y0+Math.random()*(y1-y0), z=z0+Math.random()*(z1-z0);
    m.position.set(x,y,z);scene.add(m);
    fxNodes.push({kind:'dust',m,x,y,z,t:Math.random()*10,p:Math.random()*6});
  }
}
function addButterflies(n,x0,x1,z0,z1){
  const cols=[0xff9a3c,0xfff2b0,0xff6a8a,0x9be7ff];
  for(let i=0;i<n;i++){
    const grp=new THREE.Group();
    const wm=new THREE.MeshBasicMaterial({color:cols[(Math.random()*cols.length)|0],side:THREE.DoubleSide});
    const wlG=new THREE.Group(), wrG=new THREE.Group();grp.add(wlG);grp.add(wrG);
    const wl=new THREE.Mesh(new THREE.PlaneGeometry(.24,.18),wm);wl.position.x=-.13;wlG.add(wl);
    const wr=new THREE.Mesh(new THREE.PlaneGeometry(.24,.18),wm);wr.position.x=.13;wrG.add(wr);
    const bd=new THREE.Mesh(boxGeo,MAT(0x2b2018));bd.scale.set(.05,.05,.2);grp.add(bd);
    const x=x0+Math.random()*(x1-x0), z=z0+Math.random()*(z1-z0);
    grp.position.set(x,1.2+Math.random(),z);scene.add(grp);
    fxNodes.push({kind:'butterfly',grp,wl:wlG,wr:wrG,x,y:1.4,z,r:1.5+Math.random()*2,sp:.7+Math.random()*.6,t:Math.random()*6,p:Math.random()*6});
  }
}
function addPulse(m,sp=2){fxNodes.push({kind:'pulse',m,base:m.scale.x||1,sp,p:Math.random()*6});}
function addBones(x,z){
  for(let i=0;i<3;i++){
    const b=new THREE.Mesh(boxGeo,MAT(0xe8e0cc,{roughness:1,metalness:0}));
    b.scale.set(.3+Math.random()*.2,.08,.1);b.position.set(x+(Math.random()-.5)*1.4,.05,z+(Math.random()-.5)*1.4);
    b.rotation.y=Math.random()*3;scene.add(b);
  }
}
function addExitBeacon(x,y,z){
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.5,.8,7,10,1,true),new THREE.MeshBasicMaterial({color:0x51ff7a,transparent:true,opacity:.22,side:THREE.DoubleSide,depthWrite:false}));
  beam.position.set(x,y+3.5,z);scene.add(beam);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.1,.07,8,24),new THREE.MeshBasicMaterial({color:0x51ff7a,transparent:true,opacity:.8}));
  ring.rotation.x=Math.PI/2;ring.position.set(x,y+.15,z);scene.add(ring);
  fxNodes.push({kind:'pulse',m:ring,base:1,sp:2.4,p:0});
}
function updateFx(dt){
  const t=performance.now()*.001;
  for(const f of fxNodes){
    if(f.kind==='ember'){
      f.t+=dt*(f.rise||1);
      f.m.position.y+=dt*(1.2+f.sp);
      f.m.position.x=f.x+Math.sin(f.t*2+f.p)*.5;
      f.m.position.z=f.z+Math.cos(f.t*1.6+f.p)*.5;
      f.m.scale.setScalar(Math.max(.05,(.7+Math.sin(f.t*9+f.p)*.25)*f.s));
      if(f.m.position.y>f.top){f.m.position.y=f.y0;f.t=0;}
    }else if(f.kind==='dust'){
      f.t+=dt;
      f.m.position.set(f.x+Math.sin(f.t*.4+f.p)*1.6,f.y+Math.sin(f.t*.55+f.p*2)*.8,f.z+Math.cos(f.t*.3+f.p)*1.6);
    }else if(f.kind==='butterfly'){
      f.t+=dt*f.sp;
      const a=f.t*.5+f.p;
      f.grp.position.set(f.x+Math.cos(a)*f.r,f.y+Math.sin(f.t*1.3)*.5,f.z+Math.sin(a)*f.r);
      f.grp.rotation.y=-a;
      const flap=Math.sin(f.t*14)*.9;
      f.wl.rotation.y=flap;f.wr.rotation.y=-flap;
    }else if(f.kind==='leaf'){
      // folha caindo em espiral; ao tocar o chão, volta p/ a copa
      f.t+=dt*f.sp;
      f.m.position.y-=dt*(0.7+f.sp*.35);
      f.m.position.x=f.x+Math.sin(f.t*1.7+f.ph)*1.1;
      f.m.position.z=f.z+Math.cos(f.t*1.3+f.ph)*1.1;
      f.m.rotation.x+=dt*2;f.m.rotation.z+=dt*1.4;
      if(f.m.position.y<.15){f.m.position.y=f.y0;f.t=0;}
    }else if(f.kind==='pulse'){
      f.m.scale.setScalar(f.base*(1+Math.sin(t*f.sp+f.p)*.12));
    }else if(f.kind==='cloud'){
      f.m.position.x+=dt*f.sp;
      if(f.m.position.x>75)f.m.position.x=-75;
    }
  }
}

// ================= LEVELS =================
// Atmosfera por fase: céu, neblina, sol e hemisfério próprios de cada ambiente.
function baseLights(sky,fogC,groundC,sunC=0xfff0d0,sunI=1.6,hemiSky=0xfff2cc,hemiGround=0x2a3d1e,hemiI=.85,fogNear=35,fogFar=170){
  scene.background=new THREE.Color(sky);scene.fog=new THREE.Fog(fogC,fogNear,fogFar);
  sun.color.setHex(sunC);sun.intensity=sunI;
  hemi.color.setHex(hemiSky);hemi.groundColor.setHex(hemiGround);hemi.intensity=hemiI;
}
function groundPlane(w,d,color){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),MAT(color));m.rotation.x=-Math.PI/2;m.receiveShadow=true;scene.add(m);
}

function buildLevel1(){
  baseLights(0x8ecfee,0xa8d8b8,0x3d7a3d, 0xffe9c4,1.75, 0xfff6d8,0x2f4a24,1.0, 30,150); // manhã dourada na selva
  groundPlane(240,240,0x3d7a3d);
  addBox(0,-1,0,240,2,240,0x3d7a3d,{cast:false});
  const spawn=new THREE.Vector3(0,0.2,46);
  // trilha sinuosa de pedra (falhas sobre os fossos p/ pular correndo)
  for(let z=44;z>-60;z-=4){if(z===36||z===12)continue;addBox((Math.sin(z*.3)*1.5),-0.1,z,4,.3,3.6,0x9a8f7a,{cast:false});}
  // riacho raso no início (só visual + pedras)
  const stream=new THREE.Mesh(new THREE.PlaneGeometry(16,2.6),new THREE.MeshBasicMaterial({color:0x3a9ad9,transparent:true,opacity:.8}));
  stream.rotation.x=-Math.PI/2;stream.position.set(0,.02,42.5);scene.add(stream);
  addBox(-1.2,.05,42.5,1,.3,1,0x9a8f7a,{cast:false});addBox(1.2,.05,42.5,1,.3,1,0x9a8f7a,{cast:false});
  // manchas de grama escura (textura do chão)
  for(let i=0;i<10;i++)addBox((Math.random()-.5)*24,-0.04,38-i*7,3+Math.random()*3,.04,2+Math.random()*2,0x2f5a2f,{cast:false,solid:false});
  // terra batida sobre a trilha + pedras de borda + grama, flores e borboletas (visual)
  for(let z=44;z>-8;z-=4){if(z===36||z===12)continue;if(z<=8&&z>=-6)continue;addDirtStrip(Math.sin(z*.3)*1.5,z);}
  for(let i=0;i<24;i++){const z=44-Math.random()*50,px=Math.sin(z*.3)*1.5;addTrailStone(px+(Math.random()<.5?-1:1)*(2.2+Math.random()*1.2),z,.7+Math.random()*.7);}
  for(let i=0;i<40;i++){const z=44-Math.random()*52,px=Math.sin(z*.3)*1.5;addGrassTuft(px+(Math.random()<.5?-1:1)*(2.6+Math.random()*2.4),z,.8+Math.random()*.6);}
  {const fcols=[0xff5a5a,0xffd23b,0xffffff,0xff8ac2,0xff9a3c,0x9be7ff];for(let i=0;i<18;i++){const z=42-Math.random()*44,px=Math.sin(z*.3)*1.5;addFlower(px+(Math.random()<.5?-1:1)*(3+Math.random()*2),z,fcols[i%6]);}}
  addButterflies(9,-8,8,-6,30);
  // chicane de pedras: ENCOSTA nos muros laterais (sem passar pelos lados!) — ziguezague pelo vão do meio!
  addBox(-10.5,1,39,21,2.5,1,0x6a6a62);addBox(10.5,1,31,21,2.5,1,0x6a6a62);
  addRock(1.5,0,39,1.2);addRock(-1.5,0,31,1.2);
  // muros de selva (limites) + fundo atrás do spawn + paredão atrás da saída (todos COM colisão)
  addBox(-22,5,0,2,12,130,0x2b5a2b);addBox(22,5,0,2,12,130,0x2b5a2b);
addBox(0,5,56,46,12,2,0x3d5a3d); // barranco atrás do spawn
addBox(0,5,-50,46,12,2,0x4a4038); // paredão de pedra atrás da saída
  // FLORESTA DENSA E VARIADA: árvore, palmeira, açaí, bambu, ipê — clareiras só na trilha,
  // armadilhas, fragmentos, ravina e pátio
  const clearSpots=[[-7.5,35],[5,22],[-7.5,8],[7,-10],[0,-28],[3,-18],[-3,26],[4,10],[0,-14]];
  const ipeCols=[0xff8ac2,0xffd23b,0xffffff];
  let planted=0,guard=0;
  while(planted<64&&guard++<900){
    const x=(Math.random()-.5)*80, z=48-Math.random()*110;
    const px=Math.sin(z*.3)*1.5; // centro da trilha
    if(Math.hypot(x,z-46)<3)continue; // quase nada bloqueia a base (bosque dedicado abaixo)
    if(Math.abs(x-px)<4.2&&z>-46&&z<46)continue; // trilha livre
    if(z>-3&&z<7)continue; // corredor do voo de chicote
    if(z<-8&&z>-46&&Math.abs(x)<17)continue; // pátio do templo
    if(z>20&&z<28&&Math.abs(x)<9)continue; // ladeira da pedrona
    if(z>=28&&z<=36&&Math.abs(x)<11)continue; // muro de pedra + parkour (livre p/ escalar)
    if(z>13&&z<21&&Math.abs(x)<6)continue; // tronco pendular
    if(clearSpots.some(([cx,cz])=>Math.hypot(x-cx,z-cz)<2))continue; // fragmentos/inimigos
    const s=.9+Math.random()*.9;
    const roll=Math.random();
    if(roll<.50){makeTree(x,z,s);addTreeCollider(x,z,s);}
    else if(roll<.62){makePalm(x,z);addTreeCollider(x,z,1);}
    else if(roll<.72){makeAcai(x,z,s);addTreeCollider(x,z,1.6);}
    else if(roll<.80){makeBamboo(x,z,s);addTreeCollider(x,z,1.3);}
    else if(roll<.90){makeIpe(x,z,s,ipeCols[(Math.random()*3)|0]);addTreeCollider(x,z,s);}
    else{makeTree(x,z,s);addTreeCollider(x,z,s);}
    planted++;
  }
  // BOSQUE DA BASE: verde ao redor do início (sem tampar a trilha)
  const grove=[[-7,49],[7,49],[-11,46],[11,46],[-6,52],[6,52],[-13,51],[13,51]];
  for(const [gx,gz] of grove){const s=1+Math.random()*.5;makeTree(gx,gz,s);addTreeCollider(gx,gz,s);}
  for(const [gx,gz] of [[-4,44],[4.5,44.5]]){makePalm(gx,gz);addTreeCollider(gx,gz,1);}
  // FUNDO DO MAPA: árvores baratas além das paredes + atrás do templo
  for(let i=0;i<26;i++){
    const side=Math.random()<.5?-1:1;
    makeFarTree(side*(25+Math.random()*14),50-Math.random()*112,.9+Math.random()*1.1);
  }
  for(let i=0;i<8;i++)makeFarTree((Math.random()-.5)*60,-48-Math.random()*14,1+Math.random());
  for(let i=0;i<10;i++){
    const x=(Math.random()-.5)*40,z=30+Math.random()*15;
    if(Math.abs(x-Math.sin(z*.3)*1.5)<3.5)continue;
    makePalm(x,z);addTreeCollider(x,z,1);
  }
  spawnFireflies(18,-12,12,-30,40); // vaga-lumes vivos na trilha
  addFallingLeaves(22,-14,14,-30,40); // folhas caindo em espiral 🍃
  for(let i=0;i<5;i++)addCloud((Math.random()-.5)*100,26+Math.random()*8,-40+Math.random()*70,2+Math.random()*2); // nuvens
  // SAMAÚMAS marcantes (longe da trilha — pontos de referência gigantes)
  makeKapok(-16,18,1.7);addTreeCollider(-16,18,3.6);
  makeKapok(17,-6,1.5);addTreeCollider(17,-6,3.2);
  makeKapok(-18,-30,1.8);addTreeCollider(-18,-30,3.8);
  // SAMAMBAIAS no sub-bosque, nas bordas da trilha (sem colisão: só vida!)
  for(let i=0;i<24;i++){const z=44-Math.random()*80,px=Math.sin(z*.3)*1.5;
    if(z>-3&&z<7)continue;
    makeFern(px+(Math.random()<.5?-1:1)*(2.5+Math.random()*2.5),z,.8+Math.random()*.7);}
  for(let i=0;i<18;i++){const bx=(Math.random()<.5?-1:1)*(5+Math.random()*14);addBush(bx,0,42-Math.random()*70,.7+Math.random()*.9);}
  for(let i=0;i<10;i++){const rx=(Math.random()<.5?-1:1)*(4+Math.random()*15);addRock(rx,0,40-Math.random()*65,.5+Math.random()*.9);}
  // ruínas com cipós pendurados
  makePillar(-6,0,30);makePillar(6,0,30);makePillar(-8,0,10);makePillar(8,0,10);
  addBox(0,3.4,30,13,.8,2,0x9a8a6a);
  for(const vx of [-4,-1.5,1.5,4]){const v=new THREE.Mesh(new THREE.CylinderGeometry(.05,.07,2.6,5),MAT(0x2f7a2f));v.position.set(vx,2,30);scene.add(v);}
  // FOSSO A de espinhos (pule CORRENDO!)
  addBox(-6,-0.1,35,6,.3,3.5,0x9a8f7a,{cast:false});
  addBox(6,-0.1,35,6,.3,3.5,0x9a8f7a,{cast:false});
  addBox(0,-1.2,35,4.5,.3,3,0x222222,{cast:false,solid:false});
  addSpikes(0,-1,35,4,3);
  // TRONCOS E PEDRAS ROLANTES (passam UMA vez quando você chega perto — morrendo, passam de novo!)
  addRoller(0,.6,24,'x',{kind:'log',range:8,dir:1});
  addRoller(0,.95,21,'x',{kind:'rock',range:8,dir:-1});
  addGrapple(8,4.5,27); // argola p/ atravessar de chicote o campo de rolos 🌀
  addRock(-9,0,24,1.2);addRock(9,0,24,1.2);
  addBush(-3.5,0,23,.9);addBush(3.5,0,23,.9);
  showMsgOnce('🪵 Tronco e pedra rolantes! Passe na hora certa — ou use a argola de chicote!');
  // MURO DE PEDRA no caminho (topo 2.4, ENCOSTA nos muros laterais!): passe pela ARGOLA de cima 🌀 OU faça PARKOUR pelas pedras!
  addBox(0,1.2,32.5,42,2.4,1,0x6a6a62); // muro com colisão, de muro a muro!
  addGrapple(8,4.5,33); // argola sobre o muro (lateral: não rouba o chicote da briga!)
  addParkourRoute(-7.5,34.3,2.2,0,.8,2,1.3); // parkorzinho: 2 pedras com vãos (topos .8/1.6) → pule p/ o muro!
  showMsgOnce('🧗 Muro de pedra! Pela ARGOLA de chicote 🌀 ou PARKOUR na ponta branca!');
  // LADEIRA DA PEDRONA: pedrona desce a trilha (r 1.6, dano 30 — cronometre ou desvie!)
  addBoulder(0,1.6,24,'z',5,7,30,1.6);
  showMsgOnce('🪨 A pedrona desce a ladeira! Passe na hora certa!');
  // TRONCO PENDULAR LARGO (tronco com espinhos, r 2.6, dano 30 — passe quando abrir!)
  addBlade(0,0,15.5,{log:true,w:5.5,dmg:30,r:2.6});
  // TORA BAIXA p/ pular (de muro a muro: é só correr e pular com Espaço!)
  addBox(0,0.3,17,42,.6,1,0x6b4a2b);
  addBush(-4,0,17,.8);addBush(4,0,17,.8);
  showMsgOnce('🪵 Tora baixa! Corra e PULE (Espaço)!');
  // FOSSO B de espinhos (pule CORRENDO!)
  addBox(-6,-0.1,12,6,.3,4,0x9a8f7a,{cast:false});
  addBox(6,-0.1,12,6,.3,4,0x9a8f7a,{cast:false});
  addBox(0,-1.2,12,4.5,.3,3.5,0x222222,{cast:false,solid:false});
  addSpikes(0,-1,12,4,3);
  // ravina de LAVA em largura total (não dá p/ contornar): atravessa de chicote 🌀
  addBox(0,-1.5,2,44,.3,8,0x1a0d08,{cast:false,solid:false}); // fundo do abismo
  // MONTANHA bloqueando a ravina: impossível a pé — SÓ de chicote POR CIMA! 🗻
  addBox(0,-.5,0,44,6,4,0x4a4038); // maciço de rocha (topo 2.5: não dá p/ escalar)
  addBox(0,2.55,0,44.6,.4,4.6,0x6a5f52,{cast:false,solid:false}); // cornija clara
  addRock(-25,0,2,3.2);addRock(25,0,2,3.2);addRock(-24,0,-6,2.4);addRock(24,0,-6,2.4); // picos ao fundo
  addGlowCrack(-14,-1.19,2,6,3);addGlowCrack(14,-1.19,2,6,3); // lava escorrendo na base
  addBox(0,-0.1,8,44,.3,2.5,0x9a8f7a,{cast:false});
  addBox(0,-0.1,-4,44,.3,2.5,0x9a8f7a,{cast:false});
  addLavaPit(0,2,44,9, 0,0.5,8, '🔥 LAVA! Use o CHICOTE (Clique/F) nos anéis dourados!');
  for(const lx of [-11,11]){const rl=new THREE.PointLight(0xff6a00,20,17,2);rl.position.set(lx,.8,2);scene.add(rl);} // brilho da lava
  addGrapple(-12,4.5,2);addGrapple(0,4.5,2);addGrapple(12,4.5,2); // anéis p/ balançar
  showMsgOnce('🌀 Use o CHICOTE (Clique/F) perto do anel dourado para atravessar!');
  // pátio do templo com estátuas de onça e estandartes
  addBox(0,-0.1,-24,30,.3,30,0x8a7f68,{cast:false});
  for(let i=0;i<6;i++)makePillar(-12+i*4.8,0,-36,7);
  addBox(0,7,-40,32,8,3,0x9a8a6a); // frontão
  addJaguarStatue(-5,0,-33,0);addJaguarStatue(5,0,-33,0);
  // PÁTIO PÓS-MONTANHA: tronco e pedra rolantes no caminho! (espinhos aliviados)
  addRoller(0,.6,-12,'x',{kind:'log',range:9,dir:-1});
  addRoller(0,.95,-22,'x',{kind:'rock',range:9,dir:1});
  addGrapple(0,4.5,-24); // argola p/ atravessar de chicote o pátio 🌀
  showMsgOnce('🪵 Pátio perigoso! Rolos atravessando à frente!');
  addBanner(-8,2.5,-39.3,2,3.5,0x8a1f1f);addBanner(8,2.5,-39.3,2,3.5,0x8a1f1f);
  addBanner(-13,2.5,-39.3,2,3.5,0xc9a227);addBanner(13,2.5,-39.3,2,3.5,0xc9a227);
  // porta do templo (requer 3 relíquias) + muros laterais p/ não dar a volta
  const door=addDoor(0,1.6,-38,6,3.6,1,'temple1');
  addBox(-12,5,-38,18,12,1.5,0x8a7a5a);addBox(12,5,-38,18,12,1.5,0x8a7a5a); // ENCOSTAM nos muros: só passa pela porta!
  addTorch(-4,0,-36);addTorch(4,0,-36);
  setExit(0,0,-44);
  // relíquias (uma arriscada na beira do fosso A!)
  spawnRelic(-7.5,.6,35);spawnRelic(5,.6,22);spawnRelic(-7.5,.6,8);spawnRelic(7,.6,-10);spawnRelic(0,.6,-28);
  spawnHeart(3,.6,-18);
  // emboscadas na trilha
  spawnEnemy('cobra',-3,0,26);spawnEnemy('cobra',4,0,10);spawnEnemy('cobra',0,0,-14);spawnEnemy('bat',0,4,0);spawnEnemy('bat',-6,4,-24);
  addSpikes(-8,-0.1+0.3,-16,3,3);
  addTorch(0,0,44);
  addTorch(-5,0,8,false);addTorch(5,0,8,false);addTorch(-5,0,-8,false);addTorch(5,0,-8,false);
  return {spawn,needRelics:3,doorId:'temple1',name:'FASE 1 — AMAZÔNIA, BRASIL',obj:'Junte 3 fragmentos ⚙️ e entre na caverna'};
}
function buildLevel2(){
  baseLights(0x2b241c,0x35302a,0x4a4238, 0xffe0b8,1.15, 0xffe8c8,0x3a2c1c,1.05, 30,150); // interior claro à luz de tochas
  groundPlane(200,200,0x2b2620);
  addBox(0,-1,0,120,2,120,0x4a4238,{cast:false});
  const spawn=new THREE.Vector3(0,.2,50);
  // salão fechado
  addBox(0,5,50,24,.8,4,0x5a4f42);
  addBox(-12,3,10,2,7,90,0x5a4f42);addBox(12,3,10,2,7,90,0x5a4f42);
  addBox(0,7,10,26,.8,90,0x3a342c);
  // PAREDES COM COLISÃO: fundo da sala de saída + teto e laterais da saída (sem buracos p/ o vazio!)
  addBox(0,3,-52,26,7,2,0x5a4f42); // muro do fundo
  addBox(0,7,-44,22,.8,16,0x3a342c); // teto da sala de saída
  addBox(-12,3,-44,2,7,16,0x5a4f42);addBox(12,3,-44,2,7,16,0x5a4f42); // laterais da saída
  // tochas alternadas com/sem luz real (performance: poucas PointLights)
  {let i=0;for(let z=46;z>-30;z-=8){addTorch(i%2? -11:11,0,z,true);addTorch(i%2? 11:-11,0,z,false);i++;}}
  for(let z=40;z>-28;z-=12){makePillar(-8,0,z,6);makePillar(8,0,z,6);}
  // tapete central
  addBox(0,-0.05,10,5,.12,80,0x7a1f1f,{cast:false,solid:false});
  // CORREDOR DE LANÇAS (totens que ARREMESSAM lanças de verdade!):
  // altas p/ cronometrar pelos lados, baixas p/ PULAR e um varredor giratório
  addSpearTrap(-11,0,38,new THREE.Vector3(1,0,0),{y:1.2,interval:2.1});  // atravessa (desvia pro lado)
  addSpearTrap(11,0,35,new THREE.Vector3(-1,0,0),{y:.5,interval:2.3});   // baixa (PULA!)
  addSpearTrap(-11,0,32,new THREE.Vector3(1,0,0),{y:1.2,interval:2.0});  // atravessa
  addSpearTrap(-11,0,27,new THREE.Vector3(1,0,0),{y:1.2,interval:2.2});  // atravessa
  addSpearTrap(11,0,24,new THREE.Vector3(-1,0,0),{y:.5,interval:2.4});   // baixa (PULA!)
  addSpearTrap(0,0,14,new THREE.Vector3(0,0,1),{y:1.0,interval:1.9,sweep:{speed:.6,amp:1.0},dmg:14}); // varredor giratório
  addBox(0,.7,19,1,1.4,1,0x5a4f42);      // pilar central do varredor (esconde atrás!)
  showMsgOnce('🗡 LANÇAS! Desvie pelos lados, PULE as baixas!');
  addSpikes(0,0,28,4,3);
  // LÂMINA logo na entrada (cronometre a passada!)
  addBlade(0,0,43);
  showMsgOnce('⚔ Lâminas pendulares! Passe quando abrir!');
  // CORREDOR LIVRE (sem lasers): só lanças e lâminas guardam a passagem!
  showMsgOnce('🗡 Sem lasers por aqui — só lanças e lâminas!');
  // espinhos guardando a relíquia do meio (pegue pelo lado esquerdo!)
  addSpikes(3.2,0,18,2.5,2.5);
  // lajotas que desabam ao lado da pedrona (cuidado onde pisa!)
  addFallingPlatform(-3.5,.3,-10);addFallingPlatform(3.5,.3,-10);
  // LÂMINA na saída do beco (respirou? continua!)
  addBlade(0,0,-24);
  // decoração do templo: relevos dourados, estandartes, vigas, brasas
  for(let z=40;z>=-20;z-=10){
    for(const sx of [-1,1]){
      const rel=new THREE.Mesh(boxGeo,MAT(0xc9a227,{metalness:.5,roughness:.5}));rel.scale.set(.15,1.6,.9);rel.position.set(sx*10.9,3,z);scene.add(rel);
      addBanner(sx*10.8,4.2,z+5,1.6,2.6,0x8a1f1f,sx>0?-Math.PI/2:Math.PI/2);
    }
  }
  for(let z=44;z>=-28;z-=12)addBox(0,6.4,z,24,.5,1.2,0x3a2c1c,{cast:false});
  for(let i=0;i<10;i++)addBox((i%2?3.2:-3.2),0,42-i*7,2.4,.04,2.4,i%2?0x3a342c:0x4a4238,{cast:false,solid:false});
  addRock(-10,0,-32,1);addRock(10.2,0,6,.8);addRock(-10.3,0,-8,1.1);
  addTorch(-3,0,-33,false);addTorch(3,0,-33,false);
  // fosso lava com plataformas móveis (vão em Z, levando de um lado ao outro; altas p/ não queimar)
  addLava(0,-0.2,8,20,10);
  addBox(0,-0.1,14.5,22,.3,3,0x5a4f42,{cast:false});
  addBox(0,-0.1,1.5,22,.3,3,0x5a4f42,{cast:false});
  addMovingPlatform(-4,.5,8,3,3,'z',4,1.6);addMovingPlatform(4,.5,8,3,3,'z',4,2.0);
  addGrapple(0,4.5,15); // argola: alternativa de chicote sobre a lava 🌀
  showMsgOnce('🌀 Argola dourada! Chicote (Clique/F) p/ voar sobre a lava!');
  // beco da pedrona
  addBox(0,-0.1,-12,10,.3,22,0x6a6054,{cast:false});
  addBoulder(0,1.6,-12,'z',9,7,30,1.6);
  showMsgOnce('🪨 CORRA! A pedrona ancestral despertou!');
  // puzzle alavancas
  addLever(-9,0,-26,'L1');addLever(9,0,-26,'L2');
  addBox(0,0,-30,24,.3,8,0x5a4f42,{cast:false});
  addBox(-8.5,2.5,-36,7,5,1.5,0x5a4f42);addBox(8.5,2.5,-36,7,5,1.5,0x5a4f42);
  const d=addDoor(0,1.8,-36,10,4,1,'main2');
  addGrapple(-6,4.5,-12); // argola lateral: atalho de chicote pelo beco da pedrona 🌀
  setExit(0,0,-44);
  addBox(0,0,-44,20,.3,14,0x5a4f42,{cast:false});
  addTorch(-4,0,-42);addTorch(4,0,-42);
  spawnRelic(-9,.7,34, false, 1);spawnRelic(9,.7,34, false, 1);spawnRelic(0,.7,18, false, 1);spawnRelic(-9,.7,-20, false, 1);spawnRelic(9,.7,-20, false, 1);spawnHeart(0,.7,-28);
  spawnEnemy('guard',-5,0,20);spawnEnemy('guard',5,0,14);spawnEnemy('cobra',0,0,-4);spawnEnemy('guard',0,0,-28);spawnEnemy('bat',0,4,-10);
  addSpikes(4,0,-6,3,3);
  return {spawn,needRelics:4,doorId:'main2',needLevers:['L1','L2'],name:'FASE 2 — CAVERNA DO TEMPO',obj:'Puxe as 2 alavancas, junte 4 fragmentos e fuja da pedrona'};
}
function buildLevel3(){
  baseLights(0x3a1a1a,0x4a2424,0x3a2a2a, 0xffb080,1.2, 0xff9a70,0x3a1a12,.95, 30,160); // câmara vulcânica avermelhada (clara)
  groundPlane(220,220,0x2b1d1d);
  addBox(0,-1,20,90,2,90,0x4a3832,{cast:false});
  const spawn=new THREE.Vector3(0,.2,52);
  addTorch(-6,0,50);addTorch(6,0,50);
  // ponte inicial sobre lava (alta: segura contra a lava)
  addLava(0,-0.5,36,40,18);
  addBox(0,0.3,44,10,.4,4,0x6a5a48,{cast:false});
  addMovingPlatform(0,.5,36,3.4,3.4,'z',3,1.5);
  addGrapple(0,4.5,40); // argola: voe de chicote até a arena 🌀
  addFallingPlatform(-5,.6,32);addFallingPlatform(0,.6,32);addFallingPlatform(5,.6,32);
  addBox(0,0.3,26,24,.4,6,0x6a5a48,{cast:false});
  // arena do boss
  addBox(0,0,0,44,.4,44,0x5a4a3e,{cast:false});
  const wallM=0x4a3a30;
  addBox(-22,3,0,2,7,44,wallM);addBox(22,3,0,2,7,44,wallM);addBox(0,3,-22,44,7,2,wallM);addBox(0,6,0,46,1,46,0x2b1d1d);
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2;addTorch(Math.cos(a)*19,0,Math.sin(a)*19,i%2===0);}
  for(const lx of [-10,10]){const ll=new THREE.PointLight(0xff5a00,25,22,2);ll.position.set(lx,1.5,-2);scene.add(ll);} // brilho da lava
  makePillar(-14,0,-14,8);makePillar(14,0,-14,8);makePillar(-14,0,14,8);makePillar(14,0,14,8);
  // estalactites no teto + rachaduras de lava no chão
  for(let i=0;i<12;i++)addStalactite((Math.random()-.5)*38,5.8,(Math.random()-.5)*38,.8+Math.random()*.8);
  for(let i=0;i<6;i++)addGlowCrack((Math.random()-.5)*36,.21,(Math.random()-.5)*36,2+Math.random()*3,.5);
  addBlade(0,0,8);addBlade(-8,0,-2);addBlade(8,0,-2);addBlade(-10,0,-10);
  addSpikes(-16,0.2,6,3,3);addSpikes(16,0.2,6,3,3);
  // espinhos na rota de fuga (pule correndo na hora de fugir!)
  addSpikes(6,0.2,18,3,3);addSpikes(-6,0.2,18,3,3);
  // pedestal do ídolo com círculo de runas + braseiros
  const ped=addBox(0,.8,-14,2.4,1.6,2.4,0x8a7a5a);
  const rune=new THREE.Mesh(new THREE.TorusGeometry(3,.09,8,32),new THREE.MeshBasicMaterial({color:0xff3020}));
  rune.rotation.x=-Math.PI/2;rune.position.set(0,.26,-14);scene.add(rune);
  addTorch(-4,0,-11,false);addTorch(4,0,-11,false);addTorch(-4,0,-17,false);addTorch(4,0,-17,false);
  spawnRelic(0,2.2,-14,true);
  idolPedestal=new THREE.Vector3(0,1,-14);
  spawnEnemy('golem',0,0,-4);
  spawnEnemy('ogre',-10,0,10);spawnEnemy('ogre',10,0,10);spawnEnemy('ogre',8,0,20); // sentinelas da caverna 👹
  // pilhas de caveiras (aviso aos curiosos!)
  for(const sx of [-1,1])for(let i=0;i<3;i++){const sk=new THREE.Mesh(new THREE.SphereGeometry(.15,7,6),MAT(0xe8e0cc));sk.position.set(sx*18+(Math.random()-.5),.15,-18+i*.5);scene.add(sk);}
  spawnRelic(-18,.7,18, false, 2);spawnRelic(18,.7,18, false, 2);spawnRelic(-18,.7,-18, false, 2);spawnRelic(18,.7,-18, false, 2);
  spawnHeart(-20,.7,0);spawnHeart(20,.7,0);
  // túnel de fuga (abre após ídolo)
  addBox(-14,2.5,22.5,16,5,1.5,wallM);addBox(14,2.5,22.5,16,5,1.5,wallM);
  const d=addDoor(0,1.8,22.5,12,4,1.5,'escape3');
  d.open=false;
  addGrapple(0,4.5,30); // argola na boca do túnel: ajuda na fuga final 🌀
  setExit(0,0,60); // fora da arena? na verdade saída ao norte... reposiciona:
  exitGate.pos.set(0,0,58);exitGate.mesh.position.set(0,0,58);
  addBox(0,0.3,42,10,.4,30,0x6a5a48,{cast:false});
  addBox(-6,2,42,2,5,30,wallM);addBox(6,2,42,2,5,30,wallM);
  // PAREDES COM COLISÃO: muro sul atrás da saída + teto do túnel (caverna fechada!)
  addBox(0,2.5,60,16,5,2,wallM); // muro sul
  addBox(0,5,42,14,.8,32,0x2b1d1d,{cast:false}); // teto do túnel
  {const cl=new THREE.PointLight(0xff9a60,30,45,2);cl.position.set(0,4.5,10);scene.add(cl);} // clarão central da câmara
  // faixa de espinhos no meio do túnel + rachaduras brilhantes (fuga com obstáculo!)
  addSpikes(0,.55,40,3,2);
  addGlowCrack(-2,.51,35,2,4);addGlowCrack(2,.51,47,2,4);
  return {spawn,needRelics:0,boss:true,name:'FASE 3 — ÂNCORA TEMPORAL',obj:'Derrote a Sentinela, tome a ÂNCORA e FUJA!'};
}
const msgQueue=[];let msgBusy=false;
function showMsgOnce(t,ms=4200){
  msgQueue.push({t,ms});
  if(!msgBusy)nextQueuedMsg();
}
function nextQueuedMsg(){
  const m=msgQueue.shift();
  if(!m){msgBusy=false;return;}
  msgBusy=true;showMsg(m.t,m.ms);
  setTimeout(nextQueuedMsg,m.ms+500);
}

// ---------- LOAD LEVEL ----------
function loadLevel(i){
  clearLevel();msgQueue.length=0;msgBusy=false;
  levelIndex=i;health=maxHealth;stamina=100;relics=0;levelTime=0;whipCD=0;iframes=0;vy=0;
  if(!player)player=buildPlayer();else scene.add(player);
  let info;
  if(i===0)info=buildLevel1();else if(i===1)info=buildLevel2();else info=buildLevel3();
  player.position.copy(info.spawn);yaw=0; // yaw 0 = olhando para -Z (templo)
  pitch=-0.18;camPos.copy(player.position).add(new THREE.Vector3(0,4,7));
  relicsTotal=pickups.filter(p=>!p.heart).length;
  levelNameEl.textContent=info.name;objEl.textContent=info.obj;
  relicTotalEl.textContent=info.needRelics||relicsTotal;
  bossWrap.classList.add('hidden');
  currentInfo=info;
  // 🎯 marcador de pouso do chicote (mostra onde a mira vai cair quando há argola por perto)
  landingMarker=new THREE.Mesh(new THREE.TorusGeometry(.9,.09,10,24),
    new THREE.MeshBasicMaterial({color:0xffe27a,transparent:true,opacity:.85}));
  landingMarker.rotation.x=-Math.PI/2;landingMarker.visible=false;scene.add(landingMarker);
  lassoCD=0; // laço começa pronto!
  updateHUD();
  showMsg('🪢 Laço pronto! Aperte G para esmagar um inimigo!',2500);
}
let currentInfo=null;

// ---------- HUD ----------
function fmt(t){const m=Math.floor(t/60),s=Math.floor(t%60);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
function updateHUD(){
  healthFill.style.width=Math.max(0,health/maxHealth*100)+'%';
  healthNum.textContent=Math.max(0,Math.ceil(health))+'/'+maxHealth;
  staminaFill.style.width=stamina+'%';
  relicCountEl.textContent=relics;
  timeEl.textContent=fmt(levelTime+totalTime);
  scoreEl.textContent=totalScore+score;
  killCountEl.textContent=kills;secondCountEl.textContent=secondChances;
  dmgVin.classList.toggle('poison',poisonT>0);
  container.classList.toggle('paralyzed',paraT>0);
  let se='';
  if(poisonT>0)se+=`<div class="se poison">☠️ VENENO ${Math.ceil(poisonT)}s<div class="se-bar"><div style="width:${poisonT/30*100}%"></div></div></div>`;
  if(paraT>0)se+=`<div class="se para">⚡ PARALISADO ${Math.ceil(paraT)}s<div class="se-bar"><div style="width:${paraT/3*100}%"></div></div></div>`;
  if(bleedT>0)se+=`<div class="se bleed">🩸 SANGRAMENTO ${Math.ceil(bleedT)}s<div class="se-bar"><div style="width:${bleedT/8*100}%"></div></div></div>`;
  if(secondChances>0)se+=`<div class="se" style="border-color:#ff6ec7;color:#ffd6ec">💖 CURA TUDO x${secondChances}</div>`;
  if(se!==lastSe){seEl.innerHTML=se;lastSe=se;}
  // 📜 HUB DE MISSÕES: principal (fixa) + secundárias (itens das portas da fase atual)
  let ms='';
  const need=currentInfo?.needRelics||0;
  const door=currentInfo?.doorId?doors.find(d=>d.id===currentInfo.doorId):null;
  const mark=(done)=>done?'msn-done':'msn-todo';
  const tick=(done)=>done?'✔':'○';
  if(levelIndex===0){
    ms+=`<div class="${mark(relics>=need)}">${tick(relics>=need)} ⚙️ Fragmentos ${Math.min(relics,need)}/${need}</div>`;
    ms+=`<div class="${mark(door?.open)}">${tick(door?.open)} 🚪 Portão da caverna</div>`;
  }else if(levelIndex===1){
    const on=levers.filter(l=>l.on).length;
    ms+=`<div class="${mark(relics>=need)}">${tick(relics>=need)} ⚙️ Fragmentos ${Math.min(relics,need)}/${need}</div>`;
    ms+=`<div class="${mark(on>=2)}">${tick(on>=2)} ⚙ Alavancas ${Math.min(on,2)}/2</div>`;
    ms+=`<div class="${mark(door?.open)}">${tick(door?.open)} 🚪 Portão do salão</div>`;
  }else if(levelIndex===2){
    const idol=pickups.find(p=>p.big);
    ms+=`<div class="${mark(boss?.dead)}">${tick(boss?.dead)} 🗿 Sentinela do Tempo</div>`;
    ms+=`<div class="${mark(idol?.taken)}">${tick(idol?.taken)} 🏆 Âncora Temporal</div>`;
    ms+=`<div class="${mark(escaping)}">${tick(escaping)} 🏃 Fugir da caverna</div>`;
  }
  if(ms!==lastMissions){missionsSide.innerHTML=ms;lastMissions=ms;}
  // 🪢 ícone da habilidade: barra de recarga + brilho quando pronta
  if(lassoHud){
    lassoFill.style.width=((1-Math.max(0,lassoCD)/LASSO_MAX)*100)+'%';
    lassoHud.classList.toggle('ready',lassoCD<=0);
  }
  if(boss&&!boss.dead){bossWrap.classList.remove('hidden');bossFill.style.width=(boss.hp/boss.max*100)+'%';}
  else bossWrap.classList.add('hidden');
}

// ---------- WHIP ----------
function nearestGrapple(){
  // argola dourada mais próxima (o chicote gruda num raio de 9m)
  let best=null,bestD=9;
  for(const g of grapples){
    const dx=g.pos.x-player.position.x, dz=g.pos.z-player.position.z;
    const hd=Math.hypot(dx,dz);
    if(hd<bestD){bestD=hd;best=g;}
  }
  return best?{g:best,d:bestD}:null;
}
function swingFallback(){
  // voo clássico: 18m à frente (usado mirando p/ o céu ou sem chão à vista)
  const fwd=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  const to=player.position.clone().add(new THREE.Vector3(fwd.x*18,0,fwd.z*18));
  to.y=Math.max(to.y,0.5);
  return to;
}
function aimLanding(maxR=20){
  // 🎯 POUSO PELA MIRA: projeta o raio da câmera (crosshair) no plano do chão.
  // Mire p/ perto = pouso curto; p/ longe = pouso longo (até 20m). Sem chão = null.
  const dir=new THREE.Vector3();
  camera.getWorldDirection(dir);
  const o=camera.position, planeY=0.5;
  if(Math.abs(dir.y)<1e-4)return null;
  const t=(planeY-o.y)/dir.y;
  if(t<0||t>60)return null;
  tmpV.set(o.x+dir.x*t-player.position.x,0,o.z+dir.z*t-player.position.z);
  let d=tmpV.length();
  if(d<1e-3){tmpV.set(-Math.sin(yaw),0,-Math.cos(yaw));d=0;}
  tmpV.normalize();
  const cd=Math.min(maxR,Math.max(6,d));
  return new THREE.Vector3(player.position.x+tmpV.x*cd,Math.max(planeY,player.position.y),player.position.z+tmpV.z*cd);
}
function doWhip(){
  if(whipCD>0||state!=='playing')return;
  whipCD=WHIP_CD;whipAnim=.35;AudioSys.whip();
  // efeito visual: estende ponta
  const fwd=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  // 1º INIMIGO NA FRENTE? Ataca em vez de voar! (combate tem prioridade sobre swing)
  let hitAny=false;
  for(const e of enemies){
    if(e.dead)continue;
    const dyW=e.mesh.position.y-player.position.y;
    if(Math.abs(dyW)>(e.bodyH||1.9)+1.3)continue; // pulou por cima / morcego alto demais: chicote não alcança
    const to=new THREE.Vector3().subVectors(e.mesh.position,player.position);to.y=0;
    const dist=to.length();
    const reach=e.hitR||2.2;
    const effReach=reach*(WHIP_REACH/2.2);
    if(dist<effReach){
      const ang=to.normalize().angleTo(fwd);
      if(ang<1.1||dist<1.4){
        e.hp-=e.type==='golem'?Math.max(10,WHIP_DMG-16):WHIP_DMG;
        e.cd=.5;hitAny=true;
        // knockback proporcional ao porte (golem quase não sai do lugar)
        e.mesh.position.addScaledVector(to,e.type==='golem'?.15:.6);
        // faísca na altura do peito do inimigo
        spawnSpark(e.mesh.position.clone().add(new THREE.Vector3(0,(e.bodyH||1.9)*.55,0)));
        if(e.hp<=0)killEnemy(e);
        else AudioSys.tone(220,.1,'square',.08);
      }
    }
  }
  // alavanca à distância (muito Indy!)
  for(const l of levers){
    if(!l.on&&l.pos.distanceTo(player.position)<4.5){toggleLever(l);hitAny=true;break;}
  }
  if(hitAny)return; // acertou algo: NÃO voa!
  // 2º ARGOLA? anel próximo? (usa o MAIS PRÓXIMO num raio de 9m)
  const ng=nearestGrapple();
  if(ng){
    const best=ng.g;
    // chicote GRUDA na argola: faísca + solavanco + voo em arco até ONDE A MIRA aponta 🎯
    AudioSys.swing();
    showMsg('🌀 WHIP-SWING! Segure o chapéu! (V = só argolas)');
    best.kick=1;
    spawnSpark(best.pos.clone());
    const to=aimLanding()||swingFallback();
    swinging={t:0,from:player.position.clone(),to,ring:best.pos.clone(),gr:best,dustDone:false,safe:player.position.clone()};
    if(landingMarker)landingMarker.visible=false;
    return;
  }
}
// ---------- TECLA V: SÓ ARGOLAS! (força o swing mesmo com inimigo colado) ----------
function doSwing(){
  if(state!=='playing')return;
  if(swinging)return;
  if(paraT>0){showMsg('⚡ Paralisado! Não dá pra voar!',1200);return;}
  const ng=nearestGrapple();
  if(!ng){showMsg('🌀 Sem argola por perto! Chegue mais perto do anel dourado e aperte V!',1800);AudioSys.tone(200,.15,'square',.08,-50);return;}
  if(whipCD>0)return;
  whipCD=WHIP_CD;whipAnim=.35;AudioSys.whip();AudioSys.swing();
  const best=ng.g;
  showMsg('🌀 V! WHIP-SWING! Segure o chapéu!');
  best.kick=1;
  spawnSpark(best.pos.clone());
  const to=aimLanding()||swingFallback();
  swinging={t:0,from:player.position.clone(),to,ring:best.pos.clone(),gr:best,dustDone:false,safe:player.position.clone()};
  if(landingMarker)landingMarker.visible=false;
}
function doLasso(){
  // 🪢 HABILIDADE ÚNICA: laça o inimigo mais próximo (12m) e o ESPREME até derrotar!
  if(state!=='playing'||lassoCD>0)return;
  let best=null,bestD=12;
  for(const e of enemies){
    if(e.dead||e.type==='golem')continue; // o Guardião é forte demais p/ o laço!
    const d=Math.hypot(e.mesh.position.x-player.position.x,e.mesh.position.z-player.position.z);
    if(d<bestD){bestD=d;best=e;}
  }
  if(!best){
    if(enemies.some(e=>!e.dead&&e.type==='golem'))showMsg('🪢 O Guardião é forte demais para o laço!',2000);
    else showMsg('🪢 Nenhum inimigo ao alcance do laço!',1500);
    return;
  }
  lassoCD=LASSO_MAX;
  best.squeezed=0.8;
  AudioSys.whip();AudioSys.noise(.3,.15);
  spawnSpark(best.mesh.position.clone().add(new THREE.Vector3(0,1.2,0)));
  shockwave(best.mesh.position.clone());
  shake=Math.max(shake,.4);
  showMsg('🪢 LAÇADA! Esganando o inimigo!',1500);
}
let swinging=null;
let landingMarker=null; // 🎯 anel que mostra onde o voo de chicote vai pousar
const sparks=[];
function spawnSpark(p){
  const m=new THREE.Mesh(new THREE.SphereGeometry(.12,6,6),new THREE.MeshBasicMaterial({color:0xffe27a}));
  m.position.copy(p);scene.add(m);sparks.push({m,t:.3});
}
function killEnemy(e){
  e.dead=true;AudioSys.pickup();
  score+=e.type==='golem'?1000:e.type==='guard'?150:e.type==='ogre'?200:100;
  showMsg(e.type==='golem'?'🗿 SENTINELA DESTRUÍDA! Pegue a ÂNCORA!':e.type==='ogre'?'👹 OGRO SENTINELA derrotado! +200':'+'+(e.type==='guard'?'150':'100')+' — inimigo derrotado!');
  // some afundando
  if(e.type==='golem'){AudioSys.roar();shake=.8;}
  // 🪢 morte por laço NÃO dropa coração (evita cura grátis colada no player + teste determinístico!)
  if(e.lassoKilled){
    if(Math.random()<SKILL_DROP_CHANCE)spawnSkillPotion(e.mesh.position.x,e.mesh.position.y+.5,e.mesh.position.z);
  }
  else if(Math.random()<LIFE_DROP_CHANCE){spawnHeart(e.mesh.position.x,e.mesh.position.y+.5,e.mesh.position.z);}
  else if(Math.random()<SKILL_DROP_CHANCE){spawnSkillPotion(e.mesh.position.x,e.mesh.position.y+.5,e.mesh.position.z);}
  // a cada 10 abates: 1 CURA TUDO (segunda chance onde morrer)
  kills++;
  if(kills%10===0){secondChances++;showMsg('💖 CURA TUDO! '+kills+' abates — revive onde cair!');AudioSys.relicBig();}
  updateHUD();
}
function onIdolGrab(){
  // O resto da fuga (abrir túnel + pedrona) é tratado em updateBossEscape.
  // Aqui só garantimos feedback imediato e que a porta abra mesmo se o boss já morreu.
  if(levelIndex===2){openDoor('escape3');}
}
function toggleLever(l){  l.on=!l.on;AudioSys.lever();
  l.stick.rotation.x=l.on?.6:-.0;
  showMsg(l.on?'⚙ Alavanca puxada! Algo range ao longe...':'⚙ Alavanca desativada');
  checkPuzzle();
}
function checkPuzzle(){
  if(levelIndex===1){
    const on=levers.filter(l=>l.on).map(l=>l.id);
    if(on.includes('L1')&&on.includes('L2'))openDoor('main2');
    objEl.textContent=`Alavancas ${on.length}/2 • Fragmentos ${relics}/${currentInfo.needRelics}`;
  }
  if(levelIndex===0&&relics>=currentInfo.needRelics){openDoor('temple1');previewNextPhase();}
  if(levelIndex===1&&relics>=currentInfo.needRelics){
    const on=levers.filter(l=>l.on).length;
    if(on>=2){openDoor('main2');previewNextPhase();}
    else{previewNextPhase();showMsg(`Faltam as alavancas! (${on}/2)`,2200);}
  }
}

// ---------- LOOP ----------
const clock=new THREE.Clock();
let shake=0;
const tmpV=new THREE.Vector3(), tmpV2=new THREE.Vector3(), fwdV=new THREE.Vector3();
const FWD_Z=new THREE.Vector3(0,0,1);
let spdVis=0; // velocidade p/ animação do chicote/roupa

function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.05);
  if(state==='playing')tick(dt);
  else{
    // menu / pause / telas: tochas tremeluzem; no menu a câmera orbita o diorama
    for(const o of torches){o.flame.scale.setScalar(1+Math.sin(performance.now()*.008+o.seed)*.15);}
    if(state==='menu'){
      const t=performance.now()*.0004;
      camera.position.set(Math.sin(t)*9,3.5,Math.cos(t)*9-2);
      camera.lookAt(0,1.5,-2);
      for(const p of pickups)p.mesh.rotation.y+=dt*1.5;
      updateVegetation(dt);updateFx(dt);
    }
  }
  renderer.render(scene,camera);
}

// ---------- ANIMAÇÃO PROCEDURAL REALISTA DO HERÓI ----------
function animatePlayer(dt,mx,mz,spd,running){
  const u=player.userData;
  if(!u||!u.rig)return;
  const tNow=performance.now()*.001;
  // blend andar→correr suave + cadência natural (passos por segundo)
  const targetBlend=(running&&spd>4.5)?1:0;
  animBlend+=(targetBlend-animBlend)*Math.min(1,dt*4.5);
  const runK=animBlend;
  // frequência: andar ~8-10, correr ~12-15 (passos rápidos mas fluidos)
  const freq=spd<0.4?0:(6.5+spd*0.85+runK*3.2);
  const prevStep=stepT;
  stepT+=dt*freq;
  // amplitudes BEM VISÍVEIS: andar marcado, correr amplo e enérgico!
  const ampHip=spd<0.4?0:(0.72+runK*0.5+Math.min(.15,spd*0.015));
  const ampArm=(0.6+runK*0.5)*(spd<0.4?0:1);
  const ampKneeBase=0.5+runK*0.9;
  // detecta pouso p/ agachar (transição ar→chão)
  if(onGround){if(airTime>0.25)landCrouch=0.32;airTime=0;}else{airTime+=dt;}
  if(landCrouch>0)landCrouch-=dt;
  const landK=Math.max(0,landCrouch/0.32); // 1→0
  if(spd<0.4&&onGround&&!swinging)idleTime+=dt;else idleTime=0;
  const breathe=Math.sin(tNow*2.1)*0.5+Math.sin(tNow*3.7)*0.2;
  // alvos das juntas
  let tLegL=0,tLegR=0,tKneeL=0.08,tKneeR=0.08,tArmL=0,tArmR=0,tElbL=-0.25,tElbR=-0.25;
  let rigY=0,rigRX=0,rigRZ=0,torsoRX=0,headRX=0,headRY=0;
  if(swinging){
    // ===== VOO DE CHICOTE: impulso + Tarzan no ar =====
    const st=swinging.t;
    if(swingPhase==='anticipation'||st<0.18){
      const k=Math.sin(Math.min(1,st/0.18)*Math.PI);
      tLegL=-0.55*k;tLegR=0.25*k;tKneeL=1.1*k;tKneeR=0.7*k;
      tArmL=-0.6*k;tArmR=-2.7*k;tElbL=-0.4;tElbR=-0.15;
      rigY=-0.22*k;rigRX=-0.12*k;torsoRX=-0.1*k;headRX=-0.25*k;
    }else{
      const ft=Math.min(1,(st-0.18)/0.82);
      const tuck=Math.sin(ft*Math.PI); // encolhe no meio, estica p/ pousar
      // perna da frente esticada, de trás dobrada — pose de Superman/Tarzan!
      tLegL=-0.75+tuck*0.55;tLegR=0.55-tuck*0.85;
      tKneeL=0.25+tuck*0.9;tKneeR=0.35+tuck*1.1;
      tArmR=-2.75+Math.sin(ft*4)*0.06; // braço direito GRUDADO no alto segurando!
      tArmL=0.5-tuck*0.9; // esquerdo varre p/ trás p/ equilibrar
      tElbL=-0.25;tElbR=-0.12;
      rigY=0.06+tuck*0.08;rigRX=-0.28+tuck*0.1;torsoRX=-0.18;headRX=-0.3;
      // pernas balançam suave no vento
      tLegL+=Math.sin(tNow*6)*0.06;tLegR+=Math.cos(tNow*5)*0.06;
    }
  }else if(!onGround){
    // ===== AR: subida encolhe / queda abre (paraquedista) =====
    if(vy>1.5){
      tLegL=-0.55;tLegR=0.32;tKneeL=1.15;tKneeR=0.65;
      tArmL=-2.1;tArmR=(whipAnim>0?-1.9:-2.0);tElbL=-0.5;tElbR=-0.4;
      rigRX=-0.08;torsoRX=-0.08;headRX=-0.15;rigY=0.05;
    }else{
      tLegL=0.42;tLegR=-0.32;tKneeL=0.45;tKneeR=0.35;
      tArmL=-0.9;tArmR=(whipAnim>0?-1.9:-0.9);tElbL=-0.3;tElbR=-0.3;
      u.armL.rotation.z=0.55;u.armR.rotation.z=(whipAnim>0?0:-0.55);
      rigRX=0.14;torsoRX=0.1;headRX=0.12;
    }
    if(swingPhase==='land')swingPhase='';
  }else if(spd>0.4){
    // ===== ANDAR / CORRER: ciclo duplo-harmônico (sem robô!) =====
    const s1=Math.sin(stepT), c1=Math.cos(stepT);
    const s2=Math.sin(stepT*2+0.6)*0.12; // 2º harmônico = passo humano de verdade
    tLegL=(s1*ampHip+s2*(0.5+runK*0.5));
    tLegR=(-s1*ampHip+s2*(0.5+runK*0.5));
    // joelho: dobra quando a perna vai p/ frente + estica atrás (nunca hiper-estica!)
    tKneeL=Math.max(0.05,(-Math.cos(stepT-0.5))*ampKneeBase+0.25+landK*0.9);
    tKneeR=Math.max(0.05,(-Math.cos(stepT+Math.PI-0.5))*ampKneeBase+0.25+landK*0.9);
    // braços contra-balançam as pernas; correndo dobram 90°!
    tArmL=(-s1*ampArm+s2*0.3);
    tArmR=(whipAnim>0?tArmR:(s1*ampArm+s2*0.3));
    tElbL=-0.25-runK*1.05-Math.max(0,s1)*runK*0.3;
    tElbR=(whipAnim>0?-0.3:-0.25-runK*1.05-Math.max(0,-s1)*runK*0.3);
    // tronco: andar marcado, correr BEM inclinado p/ frente com torção!
    rigRX=0.1+runK*0.24+landK*0.22;
    torsoRX=runK*0.1;
    u.rig.rotation.y=Math.sin(stepT)*0.1*(1+runK); // ombros giram (visível!)
    rigY=Math.abs(c1)*(0.08+runK*0.11)-landK*0.2;
    rigRZ=THREE.MathUtils.clamp(-mx*0.07,-0.1,0.1)+Math.sin(stepT)*0.02*(1+runK);
    headRX=-0.06-runK*0.06;headRY=Math.sin(stepT*0.5)*0.08;
    // chapéu inclina no vento da corrida + balanço lateral
    if(u.hat){u.hat.rotation.x=-0.06-runK*0.14+Math.sin(stepT*2)*0.015;u.hat.rotation.z=0.03+Math.sin(stepT)*0.02;}
    // passos sonoros no contato do pé + poeirinha correndo
    const stepRate=(2+spd*1.7);
    if(onGround&&(stepT%1<dt*freq)&&spd>1.5)AudioSys.step();
    if(running&&spd>5&&Math.random()<0.12)spawnSpark(player.position.clone().add(new THREE.Vector3((Math.random()-.5)*0.8,0.12,(Math.random()-.5)*0.8)));
    // reset z dos braços no chão + BOLSA balança no quadril!
    u.armL.rotation.z+=((0.12+runK*0.08)-u.armL.rotation.z)*Math.min(1,dt*8);
    if(whipAnim<=0)u.armR.rotation.z+=((-0.12-runK*0.08)-u.armR.rotation.z)*Math.min(1,dt*8);
    if(u.bag){u.bag.rotation.x=Math.sin(stepT)*0.18*(1+runK);u.bag.rotation.z=Math.cos(stepT)*0.12*(1+runK);}
  }else{
    // ===== IDLE: respira, pisca o peso, olha ao redor =====
    tLegL=0.02*Math.sin(tNow*0.7);tLegR=-0.02*Math.sin(tNow*0.7);
    tKneeL=0.08+landK*0.9;tKneeR=0.08+landK*0.9;
    tArmL=Math.sin(tNow*1.8)*0.04;tArmR=(whipAnim>0?tArmR:Math.cos(tNow*1.6)*0.04);
    tElbL=-0.22+Math.sin(tNow*2.1)*0.04;tElbR=(whipAnim>0?-0.3:-0.22+Math.cos(tNow*2.1)*0.04);
    rigY=Math.sin(tNow*2.1)*0.022-landK*0.2;
    rigRX=landK*0.22;torsoRX=breathe*0.012;
    rigRZ*=0.9;headRY=Math.sin(tNow*0.45)*0.22;headRX=Math.sin(tNow*0.6)*0.05-0.02;
    if(u.hat){u.hat.rotation.x=-0.06+Math.sin(tNow*2.1)*0.008;u.hat.rotation.z=0.03;}
    u.armL.rotation.z+=((0.08)-u.armL.rotation.z)*Math.min(1,dt*5);
    if(whipAnim<=0)u.armR.rotation.z+=((-0.08)-u.armR.rotation.z)*Math.min(1,dt*5);
  }
  // pouso agachado soma em tudo
  if(landK>0&&!swinging){tKneeL+=landK*0.7;tKneeR+=landK*0.7;}
  // paralisado treme
  const tremor=paraT>0?(Math.random()-.5)*0.09:0;
  // aplica com suavização (lerp = FLUIDEZ, sem teleporte de junta!)
  const kF=Math.min(1,dt*(spd>0.4?14:8));
  const kS=Math.min(1,dt*10);
  u.legL.rotation.x+=(tLegL-u.legL.rotation.x)*kF;
  u.legR.rotation.x+=(tLegR-u.legR.rotation.x)*kF;
  if(u.kneeL)u.kneeL.rotation.x+=(tKneeL-u.kneeL.rotation.x)*kF;
  if(u.kneeR)u.kneeR.rotation.x+=(tKneeR-u.kneeR.rotation.x)*kF;
  if(whipAnim<=0||swinging){u.armL.rotation.x+=(tArmL-u.armL.rotation.x)*kS;}
  if(whipAnim<=0&&!swinging){u.armR.rotation.x+=(tArmR-u.armR.rotation.x)*kS;}
  else if(swinging){u.armR.rotation.x+=(tArmR-u.armR.rotation.x)*Math.min(1,dt*12);u.armL.rotation.x+=(tArmL-u.armL.rotation.x)*Math.min(1,dt*12);}
  if(u.elbowL)u.elbowL.rotation.x+=(tElbL-u.elbowL.rotation.x)*kS;
  if(u.elbowR&&whipAnim<=0)u.elbowR.rotation.x+=(tElbR-u.elbowR.rotation.x)*kS;
  u.rig.position.y+=(rigY-u.rig.position.y)*Math.min(1,dt*12);
  u.rig.rotation.x+=(rigRX-u.rig.rotation.x)*Math.min(1,dt*8);
  if(!(!onGround&&vy<-1.5))u.rig.rotation.z+=(rigRZ-u.rig.rotation.z)*Math.min(1,dt*8);
  else u.rig.rotation.z*=0.9;
  if(!spd||spd<0.4){if(u.bag){u.bag.rotation.x+=(Math.sin(tNow*1.4)*0.05-u.bag.rotation.x)*Math.min(1,dt*5);u.bag.rotation.z+=(Math.cos(tNow*1.1)*0.05-u.bag.rotation.z)*Math.min(1,dt*5);}}
  if(swinging&&u.bag){u.bag.rotation.x=-0.5;u.bag.rotation.z=0.25;} // bolsa voa p/ trás no swing!
  if(torsoRX!==undefined&&u.torso)u.torso.rotation.x+=(torsoRX-u.torso.rotation.x)*Math.min(1,dt*8);
  if(u.head){u.head.rotation.x+=(headRX-(u.head.rotation.x||0))*Math.min(1,dt*6);u.head.rotation.y+=(headRY-(u.head.rotation.y||0))*Math.min(1,dt*6);}
  if(tremor){u.rig.rotation.z+=tremor;u.rig.position.x+=(Math.random()-.5)*0.02;}
  else u.rig.position.x*=0.9;
}
function tick(dt){
  levelTime+=dt;
  // --- input move ---
  let mx=0,mz=0;
  if(keys['KeyW']||keys['ArrowUp'])mz+=1;
  if(keys['KeyS']||keys['ArrowDown'])mz-=1;
  if(keys['KeyA']||keys['ArrowLeft'])mx-=1;
  if(keys['KeyD']||keys['ArrowRight'])mx+=1;
  mx+=touch.mx;mz+=touch.mz;
  const mLen=Math.hypot(mx,mz);if(mLen>1){mx/=mLen;mz/=mLen;}
  if(paraT>0){mx=0;mz=0;} // ⚡ paralisado: não anda (o chicote ainda funciona!)
  const running=(keys['ShiftLeft']||keys['ShiftRight']||touch.run)&&mz>0.1&&stamina>1;
  // 🗡 cravado pesa: -18% velocidade por lança (máx -40%) até arrancar!
  const slowK=stuckSpears.length>0?Math.max(0.6,1-stuckSpears.length*0.18):1;
  const speed=(running?8:5)*slowK;
  if(running){runHold+=dt;const drain=Math.min(46,22+runHold*11);stamina=Math.max(0,stamina-drain*dt);}else{runHold=0;stamina=Math.min(100,stamina+16*dt);}
  // Q gira a câmera (alternativa sem mouse) + touch
  if(keys['KeyQ'])yaw+=dt*2.4;
  if(keys['KeyR'])yaw-=dt*2.4;
  if(touch.lookDX||touch.lookDY){yaw-=touch.lookDX*.005;pitch-=touch.lookDY*.004;pitch=Math.max(-1.1,Math.min(.5,pitch));touch.lookDX=0;touch.lookDY=0;}
  // direção relativa à câmera (forward = (-sin,-cos))
  const fx=-Math.sin(yaw),fz=-Math.cos(yaw);
  const rx=Math.cos(yaw),rz=-Math.sin(yaw);
  let vx=(rx*mx+fx*mz)*speed, vz=(rz*mx+fz*mz)*speed;

  // swing do chicote CINEMATOGRÁFICO: impulso agachado → voo em arco → pouso com rolamento
  if(swinging){
    swinging.t+=dt*0.95;
    const t=Math.min(1,swinging.t);
    if(t<0.18){
      // FASE 1 — IMPULSO: agacha, joga o peso p/ trás e estica o braço até o anel!
      swingPhase='anticipation';
      player.position.copy(swinging.from);
      player.position.y=Math.max(0,swinging.from.y-Math.sin(t/0.18*Math.PI)*0.35);
      const dirT=Math.atan2(swinging.to.x-swinging.from.x,swinging.to.z-swinging.from.z);
      let dd=dirT-player.rotation.y;while(dd>Math.PI)dd-=2*Math.PI;while(dd<-Math.PI)dd+=2*Math.PI;
      player.rotation.y+=dd*Math.min(1,dt*8);
      vy=0;onGround=true;
      if(!swinging.dustDone&&t>0.05){swinging.dustDone=true;for(let i=0;i<6;i++)spawnSpark(swinging.from.clone().add(new THREE.Vector3((Math.random()-.5)*1,0.2,(Math.random()-.5)*1)));AudioSys.noise(.2,.1);}
    }else{
      // FASE 2 — VOO PÊNDULO: sobe até AGARRAR a argola (passa por BAIXO dela!) e solta p/ o pouso!
      // (com COLISÃO: se encostar numa parede, BATE DE FRENTE e cai — sem atravessar!)
      swingPhase='fly';
      const ft=(t-0.18)/0.82;
      const gx=swinging.ring.x, gy=swinging.ring.y-1.4, gz=swinging.ring.z; // ponto de agarre: logo ABAIXO do anel!
      const ease=(k)=>k*k*(3-2*k);
      if(ft<0.45){
        // SUBIDA: do chão até as mãos no anel
        const k=ease(Math.max(0,ft/0.45));
        tmpV.set(
          swinging.from.x+(gx-swinging.from.x)*k,
          swinging.from.y+(gy-swinging.from.y)*k+Math.sin(k*Math.PI)*0.8,
          swinging.from.z+(gz-swinging.from.z)*k
        );
      }else{
        // BALANÇO+SOLTURA: do anel até o pouso, por cima da montanha!
        const k=ease((ft-0.45)/0.55);
        tmpV.set(
          gx+(swinging.to.x-gx)*k,
          gy+(swinging.to.y-gy)*k+Math.sin(k*Math.PI)*2.4,
          gz+(swinging.to.z-gz)*k
        );
      }
      const hit=swingCollides(tmpV);
      if(hit){swingBonk(hit);}
      else{
        player.position.copy(tmpV);
        if(swinging)swinging.safe.copy(player.position);
        const dirT=Math.atan2(swinging.to.x-swinging.from.x,swinging.to.z-swinging.from.z);
        let dd=dirT-player.rotation.y;while(dd>Math.PI)dd-=2*Math.PI;while(dd<-Math.PI)dd+=2*Math.PI;
        player.rotation.y+=dd*Math.min(1,dt*5);
        vy=0;onGround=false;
        if(Math.random()<.25)spawnSpark(player.position.clone().add(new THREE.Vector3((Math.random()-.5)*.6,1.5,(Math.random()-.5)*.6)));
      }
    }
    if(t>=1&&swinging){
      swinging=null;swingPhase='land';vy=2;landCrouch=0.38;airTime=0;
      for(let i=0;i<8;i++)spawnSpark(player.position.clone().add(new THREE.Vector3((Math.random()-.5)*1.2,0.15,(Math.random()-.5)*1.2)));
      shake=Math.max(shake,.18);
      showMsg('🤠 Aterrissagem perfeita!');AudioSys.tone(500,.15,'triangle',.1,200);
    }
  }else{
    // aceleração suavizada: o corpo ganha peso (rápido no chão, lerdo no ar)
    const acc=onGround?10:3.5;
    pvx+=(vx-pvx)*Math.min(1,dt*acc);
    pvz+=(vz-pvz)*Math.min(1,dt*acc);
    player.position.x+=pvx*dt;player.position.z+=pvz*dt;
    // gravidade / pulo (com coyote-time: pode pular logo após sair da borda)
  const wantJump=jumpQueued||touch.jump;jumpQueued=false;
  if(onGround)coyote=.12;else coyote-=dt;
  if(wantJump&&paraT<=0&&(onGround||coyote>0)){vy=8;onGround=false;coyote=0;AudioSys.jump();touch.jump=false;}
    vy-=22*dt;vy=Math.max(vy,-30);
    player.position.y+=vy*dt;
    // colisão com plataformas/caixas
    resolveCollisions();
  }
  // queda no void
  if(player.position.y<-8){
    if(levelIndex===0&&Math.abs(player.position.x)<6&&player.position.z> -2&&player.position.z<6){damage(20,'🕳 Você caiu na ravina! Use o chicote no anel dourado.');player.position.set(0,.5,8);vy=0;}
    else{damage(25,'🕳 Você caiu no abismo!');respawnSafe();}
  }
  // limites
  player.position.x=Math.max(-60,Math.min(60,player.position.x));
  player.position.z=Math.max(-70,Math.min(70,player.position.z));

  // rotação do player p/ direção do movimento real
  const spd=Math.hypot(pvx,pvz);spdVis+=(spd-spdVis)*Math.min(1,dt*8);
  if(spd>.4&&!swinging){const target=Math.atan2(pvx,pvz);let d=target-player.rotation.y;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;player.rotation.y+=d*Math.min(1,dt*12);}
  // LOCOMOÇÃO REALISTA FLUIDA: andar / correr / idle / pulo / queda / swing
  animatePlayer(dt,mx,mz,spd,running);

  // chicote (F/clique = ataca, V = SÓ argolas!)
  whipCD-=dt;whipAnim-=dt;
  if(tryWhip){tryWhip=false;if(paraT<=0)doWhip();} // ⚡ paralisado NÃO usa chicote!
  if(trySwing){trySwing=false;doSwing();}
  updateWhipVisual();
  if(tryInteract){tryInteract=false;if(paraT<=0)doInteract();} // nem interagir!
  // 🪢 laço: recarga de 30s + disparo + marcador de pouso da mira
  if(lassoCD>0){lassoCD-=dt;if(lassoCD<=0){lassoCD=0;showMsg('🪢 Habilidade PRONTA! Aperte G!',2000);AudioSys.tone(880,.2,'triangle',.12,440);}}
  if(tryLasso){tryLasso=false;if(paraT<=0)doLasso();}
  if(landingMarker){
    const ng2=nearestGrapple();
    if(ng2&&!swinging){
      const lp=aimLanding()||swingFallback();
      landingMarker.visible=true;
      landingMarker.position.set(lp.x,lp.y+.15,lp.z);
      landingMarker.scale.setScalar(1+Math.sin(performance.now()*.008)*.12);
    }else landingMarker.visible=false;
  }

  updateEnemies(dt);
  updateTraps(dt);
  updateRollers(dt);
  updateGrapples(dt);
  updatePickups(dt);
  updateDoors(dt);
  updateProjectiles(dt);
  updateStuckSpears(dt);
  updateSparks(dt);
  updateTorches(dt);
  updateVegetation(dt);updateFx(dt);
  updateBossEscape(dt);
  updateCamera(dt);
  updateHUD();
  // objetivo dinâmico
  if(levelIndex===0)objEl.textContent=`Fragmentos ${relics}/${currentInfo.needRelics} • Atravesse a ravina 🌀 • Entre na caverna`;
  if(levelIndex===2&&boss&&boss.dead&&!escaping)objEl.textContent='Tome a ÂNCORA no pedestal! 🏆';

  if(iframes>0)iframes-=dt;
  if(paraImm>0)paraImm-=dt;
  if(poisonImm>0)poisonImm-=dt;
  if(paraT>0){
    paraT=Math.max(0,paraT-dt);
    if(paraT<=0)container.classList.remove('paralyzed');
    else if(Math.random()<.12)spawnSpark(player.position.clone().add(new THREE.Vector3(0,1.2,0)));
  }
  if(poisonT>0){
    poisonT-=dt;poisonTick+=dt;
    if(poisonTick>=2){poisonTick-=2;health-=0.5;if(health<=0){health=0;die('☠️ O veneno da cobra te consumiu...');}}
  }
  if(bleedT>0){
    bleedT-=dt;bleedTick+=dt;
    if(bleedTick>=2){bleedTick-=2;health-=2;if(health<=0){health=0;die('🩸 Você sangrou até cair...');}}
  }
}

function respawnSafe(){
  player.position.copy(currentInfo.spawn);vy=0;
}

// ---------- SWING x PAREDE: segurando a argola NÃO atravessa parede! ----------
function swingCollides(p){
  // testa a cápsula do herói (R=.45, H=1.9) contra as caixas sólidas;
  // ignora o CHÃO (dá p/ pousar em cima), só barra PAREDE/TETO de frente!
  const R=.45,H=1.9, feet=p.y, head=feet+H;
  for(const c of colliders){
    if(!c.mesh)continue; // cipó/atravessa a mata: tronco fino de árvore NÃO barra o voo (só PAREDE!)
    const b=c.box;
    if(p.x+R<b.min.x||p.x-R>b.max.x||p.z+R<b.min.z||p.z-R>b.max.z)continue;
    const top=b.max.y, bottom=b.min.y;
    if(feet>=top-0.4&&feet<=top+0.8)continue; // ia pousar em cima: ok, não é parede
    if(feet<top-.3&&head>bottom+.2)return c; // parede/teto de frente: BATEU!
  }
  return null;
}
function swingBonk(hit){
  // BATEU DE FRENTE NA PAREDE segurando a argola: solta, treme, faísca e perde vida!
  const wasSwinging=swinging;
  swinging=null;swingPhase='';vy=0;pvx=0;pvz=0;
  if(wasSwinging&&wasSwinging.safe)player.position.copy(wasSwinging.safe);
  landCrouch=0.3;
  shake=Math.max(shake,.5);
  AudioSys.noise(.35,.22);AudioSys.hurt();
  for(let i=0;i<10;i++)spawnSpark(player.position.clone().add(new THREE.Vector3((Math.random()-.5)*1,1.4,(Math.random()-.5)*1)));
  showMsg('🧱 BATEU DE CARA NA PAREDE!',1800);
  damage(8,'🧱 Você bateu de cara na parede segurando a argola!');
}
function resolveCollisions(){
  const R=.45,H=1.9;
  const feet=player.position.y, head=feet+H;
  onGround=false;
  for(const c of colliders){
    const b=c.box;
    // expande XZ
    if(player.position.x+R<b.min.x||player.position.x-R>b.max.x||player.position.z+R<b.min.z||player.position.z-R>b.max.z)continue;
    const top=b.max.y, bottom=b.min.y;
    // pouso
    if(vy<=0&&feet>=top-0.6&&feet<=top+0.6){
      // carrega plataforma móvel
      if(c.platform){player.position.x+=c.platform.mesh.position.x-c.platform.prev.x;player.position.z+=c.platform.mesh.position.z-c.platform.prev.z;player.position.y=top;c.platform.prev.copy(c.platform.mesh.position);}
      else player.position.y=top;
      vy=0;onGround=true;continue;
    }
    // cabeça bate
    if(vy>0&&head>=bottom-.2&&head<=bottom+.4&&feet<bottom){vy=0;continue;}
    // parede: empurra
    if(feet<top-.3&&head>bottom+.2){
      const dx1=(player.position.x+R)-b.min.x, dx2=b.max.x-(player.position.x-R);
      const dz1=(player.position.z+R)-b.min.z, dz2=b.max.z-(player.position.z-R);
      const m=Math.min(dx1,dx2,dz1,dz2);
      if(m===dx1)player.position.x=b.min.x-R;
      else if(m===dx2)player.position.x=b.max.x+R;
      else if(m===dz1)player.position.z=b.min.z-R;
      else player.position.z=b.max.z+R;
    }
  }
}

function updateWhipVisual(){
  // Laço/chicote premium: 10 elos trançados afunilados + ponta metálica com brilho.
  // Espaço local do rig: frente = +Z, mão direita em x≈0.42, y≈1.0.
  const u=player.userData;
  const N=whipSegs.length;
  const placeTip=(x,y,z,dir)=>{
    if(u.whipTip){
      u.whipTip.position.set(x,y,z);
      if(dir&&dir.lengthSq()>1e-6)u.whipTip.quaternion.setFromUnitVectors(FWD_Z,dir.clone().normalize());
    }
    if(u.tipGlow)u.tipGlow.position.set(x,y,z);
  };
  // GRUDADO NA ARGOLA durante o swing: elos esticados da mão até o anel
  if(swinging&&swinging.ring&&u.rig){
    tmpV.copy(swinging.ring);
    u.rig.worldToLocal(tmpV); // anel em espaço local
    const hx=.42,hy=1.0,hz=.15;
    let px=hx,py=hy,pz=hz;
    for(let i=0;i<N;i++){
      const t=(i+1)/N;
      const sag=Math.sin(t*Math.PI)*.3; // corda esticada quase reta
      const nx=hx+(tmpV.x-hx)*t, ny=hy+(tmpV.y-hy)*t-sag, nz=hz+(tmpV.z-hz)*t;
      const s=whipSegs[i];
      s.position.set((px+nx)/2,(py+ny)/2,(pz+nz)/2);
      tmpV2.set(nx-px,ny-py,nz-pz);
      if(tmpV2.lengthSq()>1e-6)s.quaternion.setFromUnitVectors(FWD_Z,tmpV2.normalize());
      px=nx;py=ny;pz=nz;
    }
    tmpV2.set(tmpV.x-px,tmpV.y-py,tmpV.z-pz);
    placeTip(tmpV.x,tmpV.y,tmpV.z,tmpV2);
    if(u.whipTip)u.whipTip.scale.setScalar(1.4); // ponta enrolada no aro
    if(u.tipGlow)u.tipGlow.scale.setScalar(1.8);
    u.armR.rotation.x=-2.4; // braço erguido segurando
    return;
  }
  const k=whipAnim>0?1-whipAnim/.35:1; // 0→1 durante o estalo
  const ext=k<1?(.6+2.8*(1-Math.pow(1-k,3))):.9; // alcance: cresce rápido até 3.4m
  const wob=spdVis*0.12; // balanço pelo movimento
  let px=.42,py=1.0,pz=.15;
  for(let i=0;i<N;i++){
    const t=(i+1)/N;
    let nx,ny,nz;
    if(k<1){
      const wave=Math.sin(t*7-k*11)*.34*t; // onda viajando até a ponta
      nx=.42+wave;
      ny=1.02+Math.sin(t*4.2)*.08*t-t*.12;
      nz=.15+t*ext;
    }else{
      // pendurado ao lado da perna, balançando com a corrida
      nx=.46+t*.22+Math.sin(stepT*.5)*wob*t;
      ny=1.0-t*t*1.15;
      nz=.3+t*.55;
    }
    const s=whipSegs[i];
    s.position.set((px+nx)/2,(py+ny)/2,(pz+nz)/2);
    tmpV.set(nx-px,ny-py,nz-pz);
    if(tmpV.lengthSq()>1e-6){s.quaternion.setFromUnitVectors(FWD_Z,tmpV.normalize());}
    px=nx;py=ny;pz=nz;
  }
  if(u&&u.whipTip){
    tmpV.set(.1,.05,.6); // direção da ponta p/ frente
    placeTip(px,py,pz,tmpV);
    const crack=(k<1&&k>.55)?1.9:1; // ponta "acende" no estalo
    u.whipTip.scale.setScalar(crack);
    if(u.tipGlow)u.tipGlow.scale.setScalar(crack*(k<1?1.9:1));
  }
  u.armR.rotation.x=whipAnim>0?-1.9:u.armR.rotation.x;
}

function updateEnemies(dt){
  fwdV.set(-Math.sin(yaw),0,-Math.cos(yaw));
  for(const e of enemies){
    if(e.squeezed>0&&!e.dead){
      // 🪢 esganado pelo laço: encolhe girando e é derrotado (não anda nem ataca!)
      e.squeezed-=dt;
      const k=1-0.3*(1-Math.max(0,e.squeezed)/0.8);
      e.mesh.scale.setScalar(Math.max(.4,k));
      e.mesh.rotation.y+=dt*12;
      if(Math.random()<.3)spawnSpark(e.mesh.position.clone().add(new THREE.Vector3(0,1,0)));
      if(e.squeezed<=0){e.mesh.scale.setScalar(1);e.lassoKilled=true;killEnemy(e);}
      continue;
    }
    if(e.dead){e.mesh.rotation.x=Math.min(Math.PI/2,e.mesh.rotation.x+dt*3);e.mesh.position.y=Math.max(-1,e.mesh.position.y-dt);continue;}
    e.t+=dt;e.cd-=dt;
    tmpV.subVectors(player.position,e.mesh.position);tmpV.y=0;
    const dist=tmpV.length();
    // MORCEGO: voo suave — patrulha circular no poleiro, mergulha no player,
    // planeia em cruzeiro e inclina (bank) nas curvas
    if(e.type==='bat'){
      if(!e.anchor)e.anchor=e.mesh.position.clone();
      if(!e.vel)e.vel=new THREE.Vector3();
      // mergulho (atk 2) é balístico: não patrulha!
      const diving=e.atk===2;
      e.phase=(e.phase||0)+dt*(dist<11?(dist<3.2?1.4:2.1):.7);
      if(diving){
        // mantém direção do mergulho, só aplica gravidade leve
        e.mesh.position.addScaledVector(e.vel,dt*0.3);
      }else{
      let tx,ty,tz,ws;
      if(dist<11){
        const orb=dist<3.2?1.0:1.6; // de perto paira (sem girar frenético); de longe circula
        tx=player.position.x+Math.sin(e.phase*1.3)*orb;
        tz=player.position.z+Math.cos(e.phase*1.1)*orb;
        ty=player.position.y+1.3+Math.sin(e.phase*2.4)*.7;
        ws=e.speed*(dist<3.2?.8:1);
      }else{
        tx=e.anchor.x+Math.sin(e.phase)*6;
        tz=e.anchor.z+Math.cos(e.phase*.8)*6;
        ty=e.anchor.y+Math.sin(e.phase*1.7)*1.2;
        ws=e.speed*.55;
      }
      tmpV2.set(tx,ty,tz).sub(e.mesh.position);
      if(tmpV2.lengthSq()>.01){
        tmpV2.normalize();
        e.vel.lerp(tmpV2.multiplyScalar(ws),Math.min(1,dt*2.4));
        e.mesh.position.addScaledVector(e.vel,dt);
        const yawT=Math.atan2(e.vel.x,e.vel.z);
        let dy2=yawT-e.mesh.rotation.y;while(dy2>Math.PI)dy2-=2*Math.PI;while(dy2<-Math.PI)dy2+=2*Math.PI;
        e.mesh.rotation.y+=dy2*Math.min(1,dt*5);
        e.bank=(e.bank||0)+(THREE.MathUtils.clamp(-dy2*2,-.6,.6)-(e.bank||0))*Math.min(1,dt*4);
        e.mesh.rotation.z=e.bank;
        e.mesh.rotation.x=THREE.MathUtils.clamp(-e.vel.y*.07,-.4,.4);
      }
      // asas FLUIDAS: batem forte subindo/atacando, planeiam em cruzeiro, DOBRAM no mergulho!
      if(e.atk!==2){
        const screaming=e.atk===1?2.2:1;
        const climb=Math.abs(e.vel.y);
        const flapF=(6+climb*4)*screaming, flapA=(climb>1.5?.8:.3)*(e.atk===1?1.6:1);
        const flap=Math.sin(e.t*(flapF+4))*.15+Math.sin(e.t*flapF)*flapA+.18;
        // corpo balança com a batida + guincho treme!
        const screamShake=e.atk===1?Math.sin(e.t*30)*0.05:0;
        e.mesh.position.y+=screamShake*dt*2;
        const W=e.mesh.userData.wings;
        if(W){
          const w0=W[0], w1=W[1];
          const sh0=w0.sh||w0, sh1=w1.sh||w1;
          sh0.rotation.z=flap;sh1.rotation.z=-flap;
          sh0.rotation.x=e.atk===1?-0.15:0;sh1.rotation.x=e.atk===1?-0.15:0;
          if(w0.midG)w0.midG.rotation.z=flap*.6+Math.sin(e.t*flapF*.5)*.08;
          if(w1.midG)w1.midG.rotation.z=-(flap*.6+Math.cos(e.t*flapF*.5)*.08);
          // membrana estica na batida
          for(const w of W){for(const ch of (w.sh||w).children){if(ch.geometry&&ch.geometry.type==='PlaneGeometry')ch.scale.y=1+Math.abs(Math.sin(e.t*flapF))*.15;}}
        }
      }
      } // fim do else patrulha / fim do mergulho
    }
    if(e.type==='golem'){
      const enraged=e.hp<e.max*.4?1.5:1;
      // MARCHA SÍSMICA: braços alternados pesados + núcleo pulsante + poeira + balanço
      if(e.atk!==1&&e.atk!==2){
        e.mesh.userData.arms?.forEach((a,i)=>a.rotation.x=Math.sin(e.t*2*enraged+i*Math.PI)*(.4+enraged*0.1));
      }
      if(e.mesh.userData.core){
        const pulse=e.atk===1?1.6+Math.sin(e.t*12)*0.3:1+Math.sin(e.t*4)*.15;
        e.mesh.userData.core.scale.setScalar(pulse);
        e.mesh.userData.core.material.color.setHex(e.hp<e.max*.4?0xff2200:(e.atk===1?0xffff00:0xff5a00));
      }
      e.mesh.position.y+=Math.abs(Math.sin(e.t*3))*.02;
      e.mesh.rotation.z+=(Math.sin(e.t*1.5)*.02-e.mesh.rotation.z)*Math.min(1,dt*4);
      if(Math.random()<dt*(1+enraged))spawnSpark(e.mesh.position.clone().add(new THREE.Vector3((Math.random()-.5)*2,0.15,(Math.random()-.5)*2)));
    }
    if(dist<e.range){
      tmpV.normalize();
      if(e.type==='guard'){guardAI(e,dt,dist,tmpV);}
      else if(e.type==='ogre'){ogreAI(e,dt,dist,tmpV);}
      else{
      // olha pro player (morcego já se orienta pelo voo; só ajusta a mira)
      if(e.type!=='bat'){
        const yawT=Math.atan2(tmpV.x,tmpV.z);
        let dyW=yawT-e.mesh.rotation.y;while(dyW>Math.PI)dyW-=2*Math.PI;while(dyW<-Math.PI)dyW+=2*Math.PI;
        const turnMax=e.type==='cobra'?2.6*dt:4*dt; // cobra vira com peso (sem teleporte de direção)
        e.mesh.rotation.y+=THREE.MathUtils.clamp(dyW,-turnMax,turnMax);
      }
      // ===== COBRA: bote com rear-up + estocada! =====
      if(e.type==='cobra'){
        if(e.atk===1){
          e.atkT-=dt;
          // empina, capelo abre, sibila — DESVIE!
          e.mesh.position.y+=dt*0.8;
          const hood=e.mesh.children.find(c=>c.geometry&&c.geometry.type==='SphereGeometry'&&c.scale.x>1.2);
          if(hood)hood.scale.set(1.45,1.7,.6);
          if(e.mesh.userData.head){e.mesh.userData.head.position.y+=dt*1.2;e.mesh.userData.head.position.z+=dt*0.6;}
          if(e.mesh.userData.tongue)e.mesh.userData.tongue.visible=true;
          if(Math.random()<.3)spawnSpark(e.mesh.position.clone().add(new THREE.Vector3(0,0.9,0)));
          if(e.atkT<=0){e.atk=2;e.atkT=.22;e.struck=false;AudioSys.noise(.2,.15);AudioSys.tone(1800,.12,'sawtooth',.06,-900);}
        }else if(e.atk===2){
          e.atkT-=dt;
          // ESTOCADA: mergulha p/ frente rapidíssimo!
          e.mesh.position.addScaledVector(tmpV,dt*9);
          if(e.mesh.userData.head){e.mesh.userData.head.position.z+=dt*3;}
          if(!e.struck&&e.atkT<=.12){
            e.struck=true;
            const dyA2=player.position.y-e.mesh.position.y;
            tmpV2.subVectors(player.position,e.mesh.position);tmpV2.y=0;
            if(tmpV2.length()<e.atkR+.7&&dyA2<1.7&&dyA2>-1.2){
              const dd2=Math.min(15,e.dmg+((Math.random()*4)|0));
              damage(dd2,'🐍 Picada de cobra!');
              if(poisonImm<=0)applyPoison();
              spawnSpark(e.mesh.position.clone().add(new THREE.Vector3(0,0.8,0)));
            }else AudioSys.noise(.1,.06);
          }
          if(e.atkT<=0){e.atk=0;e.cd=1.1;}
        }else if(dist>e.atkR){
          if(!e.vel)e.vel=new THREE.Vector3();
          tmpV2.copy(tmpV).multiplyScalar(e.speed);
          e.vel.lerp(tmpV2,Math.min(1,dt*2.2));
          e.mesh.position.x+=e.vel.x*dt;e.mesh.position.z+=e.vel.z*dt;
          const side=Math.sin(e.t*7)*.9*dt;
          e.mesh.position.x+=-tmpV.z*side;e.mesh.position.z+=tmpV.x*side;
          e.mesh.position.y+=((groundY(e.mesh.position.x,e.mesh.position.z))-e.mesh.position.y)*Math.min(1,dt*5);
          const dyA0=player.position.y-e.mesh.position.y;
          if(e.cd<=0&&dist<e.atkR+0.3&&dyA0<1.7&&dyA0>-1.2){e.atk=1;e.atkT=.42;AudioSys.tone(2200,.2,'sine',.05,-800);}
        }else if(e.cd<=0){
          const dyA=player.position.y-e.mesh.position.y;
          if(dist>e.atkR||dyA>1.7||dyA<-1.2){e.cd=.25;}
          else{e.atk=1;e.atkT=.42;AudioSys.tone(2200,.2,'sine',.05,-800);}
        }
      // ===== GOLEM BOSS: ergue os braços e ESMAGA! =====
      }else if(e.type==='golem'){
        const enraged2=e.hp<e.max*.4?1.5:1;
        if(e.atk===1){
          e.atkT-=dt;
          e.mesh.userData.arms?.forEach((a,i)=>{a.rotation.x+=((-2.4)-a.rotation.x)*Math.min(1,dt*7);});
          e.mesh.rotation.x+=((-0.1)-e.mesh.rotation.x)*Math.min(1,dt*6);
          shake=Math.max(shake,.08);
          if(Math.random()<.3)spawnSpark(e.mesh.position.clone().add(new THREE.Vector3((Math.random()-.5)*2,2.5,(Math.random()-.5)*2)));
          if(e.atkT<=0){e.atk=2;e.atkT=.3;e.struck=false;AudioSys.roar();}
        }else if(e.atk===2){
          e.atkT-=dt;
          e.mesh.userData.arms?.forEach((a)=>{a.rotation.x+=((1.2)-a.rotation.x)*Math.min(1,dt*20);});
          e.mesh.rotation.x+=((0.25)-e.mesh.rotation.x)*Math.min(1,dt*18);
          if(!e.struck&&e.atkT<=.18){
            e.struck=true;
            tmpV2.subVectors(player.position,e.mesh.position);tmpV2.y=0;
            if(tmpV2.length()<e.atkR+1.0){
              damage(e.dmg,'🗿 Pancada do Guardião!');
              AudioSys.roar();shake=.7;shockwave(e.mesh.position);shockwave(player.position.clone());
              for(let i=0;i<8;i++)spawnSpark(player.position.clone().add(new THREE.Vector3((Math.random()-.5)*2,0.3,(Math.random()-.5)*2)));
            }else{AudioSys.noise(.2,.12);shake=Math.max(shake,.3);shockwave(e.mesh.position);}
          }
          if(e.atkT<=0){e.atk=0;e.cd=1.6/enraged2;}
        }else if(dist>e.atkR){
          if(!e.vel)e.vel=new THREE.Vector3();
          tmpV2.copy(tmpV).multiplyScalar(e.speed*enraged2);
          e.vel.lerp(tmpV2,Math.min(1,dt*2.8));
          e.mesh.position.x+=e.vel.x*dt;e.mesh.position.z+=e.vel.z*dt;
          e.mesh.position.y+=((groundY(e.mesh.position.x,e.mesh.position.z))-e.mesh.position.y)*Math.min(1,dt*5);
          // pisadas tremem a tela de perto!
          if(dist<8&&Math.random()<dt*3)shake=Math.max(shake,.1);
          if(e.cd<=0&&dist<e.atkR+0.5){e.atk=1;e.atkT=.7/enraged2;AudioSys.roar();AudioSys.tone(60,.4,'sawtooth',.15,20);}
        }else if(e.cd<=0){
          e.atk=1;e.atkT=.7/enraged2;AudioSys.roar();
        }
      // ===== MORCEGO: guincho + mergulho! =====
      }else if(e.type==='bat'){
        const dyB=player.position.y-e.mesh.position.y;
        if(e.atk===1){
          e.atkT-=dt;
          // paira guinchando, asas a mil — vai mergulhar!
          e.mesh.position.y+=Math.sin(e.t*20)*dt*1.5;
          AudioSys.tone(2400,.08,'sine',.04,-600);
          if(e.atkT<=0){e.atk=2;e.atkT=.32;e.struck=false;e.diveDir=tmpV.clone();
            if(e.diveDir.lengthSq()<1e-4)e.diveDir.set(0,0,1);}
        }else if(e.atk===2){
          e.atkT-=dt;
          // MERGULHO: dobra as asas e despenca no pescoço!
          const dd3=e.diveDir||tmpV;
          e.mesh.position.addScaledVector(dd3,dt*9);
          e.mesh.position.y-=dt*2.5;
          const W2=e.mesh.userData.wings;
          if(W2){for(const w of W2){const sh=w.sh||w;sh.rotation.z*=0.9;if(w.midG)w.midG.rotation.z*=0.9;}}
          e.mesh.rotation.x=0.5;
          if(!e.struck&&e.atkT<=.18){
            e.struck=true;
            tmpV2.subVectors(player.position,e.mesh.position);tmpV2.y=0;
            if(tmpV2.length()<e.atkR+0.7&&Math.abs(e.mesh.position.y-(player.position.y+1))<2.4){
              damage(e.dmg,'🦇 Mordida!');
              if(paraT<=0&&paraImm<=0)applyParalyze();
              spawnSpark(e.mesh.position.clone());
            }else AudioSys.noise(.08,.05);
          }
          if(e.atkT<=0){e.atk=0;e.cd=1.1;e.mesh.rotation.x=0;}
        }else if(e.cd<=0&&dist<e.atkR+0.6&&Math.abs(e.mesh.position.y-(player.position.y+1))<2.4){
          e.atk=1;e.atkT=.35;AudioSys.tone(2000,.25,'sine',.06,800);
        }else if(e.cd<=0&&dist<=e.atkR+0.6){
          e.cd=.3;
        }
      }
      } // fim do else (não-guarda)
    }
    // cobra: desliza em S rente ao chão + empina atacando + capelo pulsa + joia brilha
    if(e.type==='cobra'){
      const attacking=e.atk===1||e.atk===2;
      const gy=groundY(e.mesh.position.x,e.mesh.position.z);
      const targetY=attacking?gy+0.22:gy+.06+Math.sin(e.t*8)*.03;
      e.mesh.position.y+=(targetY-e.mesh.position.y)*Math.min(1,dt*(attacking?6:8));
      const segs=e.mesh.userData.segs;
      const slideAmp=attacking?0.05:0.12;
      const slideF=attacking?14:9;
      if(segs)for(let i=0;i<segs.length;i++){
        segs[i].position.x=Math.sin(e.t*slideF-i*.9)*slideAmp*(i+1)/segs.length;
        segs[i].position.y=.2+Math.abs(Math.sin(e.t*slideF*0.5-i*.5))*.04;
        segs[i].scale.y=.72+Math.sin(e.t*6+i)*.05;
      }
      if(e.mesh.userData.head&&e.atk!==1&&e.atk!==2)e.mesh.userData.head.position.y=.78+Math.sin(e.t*5)*.05;
      if(e.mesh.userData.tongue&&e.atk!==1)e.mesh.userData.tongue.visible=Math.sin(e.t*7)>0;
      if(e.mesh.userData.jewel){
        e.mesh.userData.jewel.rotation.y+=dt*(attacking?6:2);
        e.mesh.userData.jewel.scale.setScalar(1+Math.sin(e.t*(attacking?10:4))*.15);
      }
      // capelo infla perto do player (ameaça!)
      const hoodM=e.mesh.children.find(c=>c.geometry&&c.geometry.type==='SphereGeometry'&&c.scale.x>1.1);
      if(hoodM&&e.atk!==1){
        const nearK=THREE.MathUtils.clamp(1.5-dist*0.1,0,1);
        hoodM.scale.set(1.25+nearK*0.12,1.5+nearK*0.15,.55);
      }
    }
  }
  // golem é o boss
  if(!boss)boss=enemies.find(e=>e.type==='golem');
}
function groundY(x,z){
  // acha topo mais alto abaixo de y+2
  let best=-50;
  for(const c of colliders){const b=c.box;if(x>b.min.x&&x<b.max.x&&z>b.min.z&&z<b.max.z){if(b.max.y>best&&b.max.y<player.position.y+2.5)best=b.max.y;}}
  return best===-50?0:best;
}
const waves=[];
function shockwave(p){
  const m=new THREE.Mesh(new THREE.TorusGeometry(.5,.15,8,24),new THREE.MeshBasicMaterial({color:0xff5533,transparent:true,opacity:.9}));
  m.rotation.x=-Math.PI/2;m.position.set(p.x,.3,p.z);scene.add(m);waves.push({m,t:0});
  // puramente visual — o dano do ataque já foi aplicado por quem chamou
}
function setGuardEyes(e,hex){
  const f=e.mesh.userData.fighter;
  if(f&&f.eyes)for(const m of f.eyes)m.color.setHex(hex);
}
function guardAI(e,dt,dist,dir){
  // Guarda do templo: anda com peso, orbita antes de golpear, avisa e estoca.
  const u=e.mesh.userData.fighter;
  if(!u)return;
  // giro suave com velocidade limitada
  const yawT=Math.atan2(dir.x,dir.z);
  let dy=yawT-e.mesh.rotation.y;while(dy>Math.PI)dy-=2*Math.PI;while(dy<-Math.PI)dy+=2*Math.PI;
  e.mesh.rotation.y+=THREE.MathUtils.clamp(dy,-3*dt,3*dt);
  const facing=Math.abs(dy)<.7;
  if(!e.vel)e.vel=new THREE.Vector3();
  tmpV2.set(0,0,0);
  e.strafeT=(e.strafeT||0)-dt;
  if(e.strafeT<=0){e.strafeT=2+Math.random()*2;if(Math.random()<.5)e.strafeDir*=-1;} // troca o lado da órbita p/ parecer vivo
  if(e.atk===1){
    e.mesh.position.x+=(Math.random()-.5)*.03; // treme segurando o golpe
  }else if(dist>e.atkR){
    tmpV2.copy(dir);
    if(dist<5.5){ // orbita de leve antes de entrar — parece vivo
      tmpV2.x+=-dir.z*e.strafeDir*.8;tmpV2.z+=dir.x*e.strafeDir*.8;
      tmpV2.normalize();
    }
    // ARREMESSO À DISTÂNCIA (de longe: lança de 15 + sangramento + cravada!)
    // tolerância ampla de mira (1.0 rad) p/ arremessar de forma confiável!
    const facingThrow=Math.abs(dy)<1.0;
    if(e.cd<=0&&e.throwCd<=0&&dist>6&&dist<e.range&&facingThrow){e.atk=3;e.atkT=.5;e.thrown=false;e.warned=false;e.throwCd=4;AudioSys.tone(140,.2,'sawtooth',.1,60);}
    for(const o of enemies){ // guardas não se empilham
      if(o!==e&&!o.dead&&o.type==='guard'){
        const sx=e.mesh.position.x-o.mesh.position.x,sz=e.mesh.position.z-o.mesh.position.z;
        const dd=Math.hypot(sx,sz);
        if(dd>.01&&dd<1.7){tmpV2.x+=sx/dd*(1.7-dd)*.9;tmpV2.z+=sz/dd*(1.7-dd)*.9;}
      }
    }
  }else if(e.atk===2){
    tmpV2.copy(dir).multiplyScalar(2.4); // investida do golpe
  }
  e.vel.lerp(tmpV2.multiplyScalar(e.speed*(facing||e.atk===2?1:.25)),Math.min(1,dt*(e.atk===1?9:4.5)));
  e.mesh.position.x+=e.vel.x*dt;e.mesh.position.z+=e.vel.z*dt;
  e.mesh.position.y+=((groundY(e.mesh.position.x,e.mesh.position.z))-e.mesh.position.y)*Math.min(1,dt*6);
  const spd=Math.hypot(e.vel.x,e.vel.z);
  // MARCHA COM PESO: duplo-harmônico + balanço do quadril + inclinação p/ frente
  e.walkP+=dt*(2.5+spd*2.4);
  const a=Math.min(.65,.1+spd*.18);
  const w1=Math.sin(e.walkP), w2=Math.sin(e.walkP*2+0.5)*0.1;
  u.legL.rotation.x=w1*a+w2;u.legR.rotation.x=-w1*a+w2;
  e.mesh.position.y+=Math.abs(Math.cos(e.walkP))*.045*Math.min(1,spd/3);
  e.mesh.rotation.z+=(Math.sin(e.walkP)*.035-e.mesh.rotation.z)*Math.min(1,dt*6);
  if(e.atk!==1&&e.atk!==2&&e.atk!==3)e.mesh.rotation.x+=((spd>0.5?0.07:0)-e.mesh.rotation.x)*Math.min(1,dt*6); // inclina p/ frente andando
  if(u.shield){ // escudo avança quando chega perto (postura de combate) + balança andando
    u.shield.position.z+=(((dist<4)?.35:.12)-u.shield.position.z)*Math.min(1,dt*5);
    u.shield.position.y=1.0+Math.sin(e.walkP*2)*0.04;
    u.shield.rotation.x=Math.sin(e.walkP)*0.08;
  }
  if(u.spear){ // lança balança na marcha, some após arremessar!
    if(e.atk!==3)u.spear.rotation.x=Math.sin(e.walkP)*0.06;
    if(e.throwCd>0&&e.atk!==3&&u.spear.visible===false&&e.throwCd<3.2)u.spear.visible=true; // lança nova brota na mão!
  }
  if(e.atk===1){
    // WINDUP ESTOCADA: agacha, recua a lança, olhos acesos — DESVIE!
    e.atkT-=dt;
    u.armR.rotation.x+=((-2.3)-u.armR.rotation.x)*Math.min(1,dt*10);
    u.armL.rotation.x+=((-.7)-u.armL.rotation.x)*Math.min(1,dt*10);
    e.mesh.position.y-=dt*0.35; // agacha acumulando força
    e.mesh.rotation.x+=((-0.12)-e.mesh.rotation.x)*Math.min(1,dt*8);
    setGuardEyes(e,0xffe27a);
    if(Math.random()<.2)spawnSpark(e.mesh.position.clone().add(new THREE.Vector3(0,1.6,0)));
    if(e.atkT<=0){e.atk=2;e.atkT=.2;AudioSys.tone(180,.12,'square',.1,-60);}
  }else if(e.atk===2){
    // ESTOCADA de 20!
    e.atkT-=dt;
    u.armR.rotation.x+=((1.0)-u.armR.rotation.x)*Math.min(1,dt*24);
    if(!e.struck&&e.atkT<=.12){
      e.struck=true;
      tmpV2.subVectors(player.position,e.mesh.position);tmpV2.y=0;
      if(tmpV2.length()<e.atkR+.9){damage(e.dmg,'🗡 Lança do sentinela!');spawnSpark(e.mesh.position.clone().add(new THREE.Vector3(0,1.4,0)));}
      else AudioSys.noise(.12,.06); // errou — dá p/ desviar saindo da frente!
    }
    if(e.atkT<=0){e.atk=0;e.cd=3;setGuardEyes(e,0xff2222);} // tapa a cada 3s!
  }else if(e.atk===3){
    // ARREMESSO TEATRAL À DISTÂNCIA: gira o tronco, ergue alto, passo à frente e SOLTA! (15 + SANGRAMENTO + CRAVADA!)
    e.atkT-=dt;
    const windK=1-Math.max(0,e.atkT)/0.5; // 0→1
    u.armR.rotation.x+=((-2.9+Math.sin(windK*6)*0.15)-u.armR.rotation.x)*Math.min(1,dt*12);
    u.armL.rotation.x+=((-.9)-u.armL.rotation.x)*Math.min(1,dt*10);
    // corpo inteiro participa: torce, agacha e avança!
    e.mesh.rotation.y+=Math.sin(windK*Math.PI)*dt*1.2*e.strafeDir;
    e.mesh.rotation.x+=((-0.18+windK*0.1)-e.mesh.rotation.x)*Math.min(1,dt*8);
    e.mesh.position.y-=dt*0.25*(1-windK);
    u.legL.rotation.x=Math.sin(e.walkP)*0.2-0.35*windK;
    u.legR.rotation.x=-Math.sin(e.walkP)*0.2+0.3*windK;
    setGuardEyes(e,0xffd76a);
    if(!e.warned){e.warned=true;AudioSys.tone(140,.25,'sawtooth',.12,80);}
    if(Math.random()<.25)spawnSpark(e.mesh.position.clone().add(new THREE.Vector3(0,1.8,0)));
    if(!e.thrown&&e.atkT<=.22){
      e.thrown=true;
      tmpV2.subVectors(player.position,e.mesh.position);tmpV2.y=0;
      if(tmpV2.lengthSq()>.01){
        tmpV2.normalize();
        const from=e.mesh.position.clone();from.y+=1.5;
        fireSpear(from,new THREE.Vector3(tmpV2.x,0.02,tmpV2.z).normalize(),15);
        projectiles[projectiles.length-1].guardSpear=true;
        showMsg('🗡 Lança arremessada! Desvie ou PULE!',1500);
        AudioSys.noise(.25,.2);AudioSys.tone(700,.15,'sawtooth',.1,-400);
        if(u.spear)u.spear.visible=false; // jogou a da mão! (volta em ~1s)
        shake=Math.max(shake,.12);
      }
    }
    if(e.atkT<=0){e.atk=0;e.thrown=false;e.warned=false;e.cd=Math.max(e.cd,.8);setGuardEyes(e,0xff2222);}
  }else{
    u.armL.rotation.x=-Math.sin(e.walkP)*a*.7;
    u.armR.rotation.x+=(Math.sin(e.walkP)*a*.7-u.armR.rotation.x)*Math.min(1,dt*6);
    e.mesh.rotation.x+=((spd>0.5?0.07:0)-e.mesh.rotation.x)*Math.min(1,dt*5);
    if(e.throwCd>0)e.throwCd-=dt;
    if(e.cd<=0&&dist<e.atkR&&facing){e.atk=1;e.atkT=.45;e.struck=false;e.thrown=false;AudioSys.tone(95,.25,'sawtooth',.12,40);}
  }
}
function setOgreEyes(e,hex){
  const o=e.mesh.userData.ogre;
  if(o&&o.eyes)for(const m of o.eyes)m.color.setHex(hex);
}
function ogreAI(e,dt,dist,dir){
  // OGRO SENTINELA: marcha pesada e fluida, orbita a presa, ergue a clava e ESMAGA.
  const u=e.mesh.userData.ogre;
  if(!u)return;
  if(!e.spotted&&dist<14){e.spotted=true;AudioSys.tone(70,.5,'sawtooth',.15,30);} // rugido ao avistar
  const yawT=Math.atan2(dir.x,dir.z);
  let dy=yawT-e.mesh.rotation.y;while(dy>Math.PI)dy-=2*Math.PI;while(dy<-Math.PI)dy+=2*Math.PI;
  e.mesh.rotation.y+=THREE.MathUtils.clamp(dy,-2.6*dt,2.6*dt);
  const facing=Math.abs(dy)<.8;
  if(!e.vel)e.vel=new THREE.Vector3();
  tmpV2.set(0,0,0);
  e.strafeT=(e.strafeT||0)-dt;
  if(e.strafeT<=0){e.strafeT=2.5+Math.random()*2;if(Math.random()<.5)e.strafeDir*=-1;}
  if(e.atk===1){
    e.mesh.position.x+=(Math.random()-.5)*.04; // treme erguendo a clava
  }else if(dist>e.atkR){
    tmpV2.copy(dir);
    if(dist<7){ // orbita de lado antes de entrar — parece vivo
      tmpV2.x+=-dir.z*e.strafeDir*.7;tmpV2.z+=dir.x*e.strafeDir*.7;
      tmpV2.normalize();
    }
    for(const o of enemies){ // ogros não se empilham (nem no chefão)
      if(o!==e&&!o.dead&&(o.type==='ogre'||o.type==='golem')){
        const sx=e.mesh.position.x-o.mesh.position.x,sz=e.mesh.position.z-o.mesh.position.z;
        const dd=Math.hypot(sx,sz);
        if(dd>.01&&dd<2.2){tmpV2.x+=sx/dd*(2.2-dd)*.9;tmpV2.z+=sz/dd*(2.2-dd)*.9;}
      }
    }
  }else if(e.atk===2){
    tmpV2.copy(dir).multiplyScalar(2.0); // investida da esmagada
  }
  e.vel.lerp(tmpV2.multiplyScalar(e.speed*(facing||e.atk===2?1:.3)),Math.min(1,dt*(e.atk===1?9:4)));
  e.mesh.position.x+=e.vel.x*dt;e.mesh.position.z+=e.vel.z*dt;
  e.mesh.position.y+=((groundY(e.mesh.position.x,e.mesh.position.z))-e.mesh.position.y)*Math.min(1,dt*6);
  // MARCHA BRUTAL FLUIDA: passadão pesado + ombros balançando + poeira!
  const spd=Math.hypot(e.vel.x,e.vel.z);
  e.walkP+=dt*(2.2+spd*2.2);
  const a=Math.min(.68,.12+spd*.16);
  const ow1=Math.sin(e.walkP), ow2=Math.sin(e.walkP*2+0.4)*0.08;
  u.legL.rotation.x=ow1*a+ow2;u.legR.rotation.x=-ow1*a+ow2;
  e.mesh.position.y+=Math.abs(Math.cos(e.walkP))*.055*Math.min(1,spd/2.5);
  e.mesh.rotation.z+=(Math.sin(e.walkP)*.045-e.mesh.rotation.z)*Math.min(1,dt*6);
  if(e.atk!==1&&e.atk!==2)e.mesh.rotation.x+=((spd>0.5?0.1:0)-e.mesh.rotation.x)*Math.min(1,dt*5);
  if(u.club&&e.atk!==1&&e.atk!==2)u.club.rotation.x=Math.sin(e.walkP)*0.12;
  if(spd>1.5&&Math.random()<dt*4)spawnSpark(e.mesh.position.clone().add(new THREE.Vector3((Math.random()-.5)*1,0.1,(Math.random()-.5)*1)));
  if(e.atk===1){
    // WINDUP BRUTAL: agacha, recua a clava nas costas, olhos em brasa — CORRE!
    e.atkT-=dt;
    u.armR.rotation.x+=((-2.6)-u.armR.rotation.x)*Math.min(1,dt*9);
    u.armL.rotation.x+=((-1.1)-u.armL.rotation.x)*Math.min(1,dt*8);
    e.mesh.position.y-=dt*0.4;
    e.mesh.rotation.x+=((-0.15)-e.mesh.rotation.x)*Math.min(1,dt*8);
    if(u.club)u.club.rotation.x+=((-0.4)-u.club.rotation.x)*Math.min(1,dt*8);
    setOgreEyes(e,0xffe27a);
    if(Math.random()<.25)spawnSpark(e.mesh.position.clone().add(new THREE.Vector3(0,2,0)));
    if(e.atkT<=0){e.atk=2;e.atkT=.25;AudioSys.tone(150,.12,'square',.1,-50);shake=Math.max(shake,.15);}
  }else if(e.atk===2){
    // ESMAGADA SÍSMICA!
    e.atkT-=dt;
    u.armR.rotation.x+=((1.3)-u.armR.rotation.x)*Math.min(1,dt*26);
    u.armL.rotation.x+=((0.6)-u.armL.rotation.x)*Math.min(1,dt*20);
    e.mesh.rotation.x+=((0.22)-e.mesh.rotation.x)*Math.min(1,dt*22);
    if(!e.struck&&e.atkT<=.15){
      e.struck=true;
      tmpV2.subVectors(player.position,e.mesh.position);tmpV2.y=0;
      if(tmpV2.length()<e.atkR+.9){
        damage(e.dmg,'👹 Clava do ogro!');
        spawnSpark(e.mesh.position.clone().add(new THREE.Vector3(0,1.6,0)));
        shockwave(player.position.clone());
        shake=Math.max(shake,.45);
        for(let i=0;i<6;i++)spawnSpark(player.position.clone().add(new THREE.Vector3((Math.random()-.5)*2,0.2,(Math.random()-.5)*2)));
      }
      else{AudioSys.noise(.12,.06);shockwave(e.mesh.position.clone());shake=Math.max(shake,.2);} // errou mas TREME o chão!
    }
    if(e.atkT<=0){e.atk=0;e.cd=2.2;setOgreEyes(e,0xff7a00);}
  }else{
    u.armL.rotation.x=-Math.sin(e.walkP)*a*.8;
    u.armR.rotation.x+=(Math.sin(e.walkP)*a*.8-u.armR.rotation.x)*Math.min(1,dt*6);
    if(e.cd<=0&&dist<e.atkR&&facing){e.atk=1;e.atkT=.55;e.struck=false;AudioSys.tone(90,.25,'sawtooth',.12,50);}
  }
}
function updateTraps(dt){
  // shooters (dardos) + totens de lanças (fase 2)
  for(const d of dynamics){
    if(d.type==='shooter'){d.t-=dt;if(d.t<=0){d.t=d.interval;fireDart(d.pos.clone().add(new THREE.Vector3(0,0,0)),d.dir);}}
    else if(d.type==='spearTrap'){
      d.t-=dt;
      let dir=d.dir;
      if(d.sweep){ // varredor: gira o ângulo de tiro p/ passar na hora certa
        d.phase+=dt*(d.sweep.speed||.55);
        const base=Math.atan2(d.dir.x,d.dir.z), amp=d.sweep.amp||.9;
        const a=base+Math.sin(d.phase)*amp;
        dir=tmpV.set(Math.sin(a),0,Math.cos(a)).clone();
        if(d.mesh)d.mesh.rotation.y=Math.sin(d.phase)*.18;
      }
      if(d.t<=0){
        d.t=d.interval*(0.85+Math.random()*0.3);
        const from=d.pos.clone();from.y=d.y!=null?d.y:from.y;
        // só atira se o player estiver no mesmo corredor (economiza + dá ritmo)
        if(Math.abs(player.position.z-from.z)<26)fireSpear(from.clone().addScaledVector(dir,.7),dir,d.dmg||14);
        else d.t=Math.min(d.t,.5);
      }
    }
  }
  // boulders
  for(const b of boulders){
    b.t+=dt*b.speed*.4;
    const off=Math.sin(b.t)*b.range;
    if(b.axis==='z')b.mesh.position.set(b.center.x,b.center.y,b.center.z+off);
    else b.mesh.position.set(b.center.x+off,b.center.y,b.center.z);
    b.mesh.rotation.x+=dt*b.speed*.5;b.mesh.rotation.z+=dt*.3;
    b.stripe.position.copy(b.mesh.position);b.stripe.rotation.x+=dt*b.speed*.5;
    if(b.mesh.position.distanceTo(tmpV2.set(player.position.x,b.mesh.position.y,player.position.z))<b.r+.5){
      trapHit(b.dmg,'🪨 ESMAGADO pela pedrona!');AudioSys.noise(.4,.2);
    }
  }
  // hazards spikes/lava/blade
  for(const h of hazards){
    h.cd-=dt;
    if(h.type==='spikes'){
      // só fere quem está BAIXO (no fosso) ou no mesmo nível — não através de ponte/chão acima
      const dy=player.position.y-h.pos.y;
      if(dy<1.0&&dy>-0.6&&tmpV.set(player.position.x,0,player.position.z).distanceTo(tmpV2.set(h.pos.x,0,h.pos.z))<h.r&&h.cd<=0){h.cd=1;trapHit(h.dmg,'🦔 Espinhos enferrujados!');}
    }else if(h.type==='lava'){
      // queima quem está com os pés perto do nível da lava (em plataformas altas está seguro)
      const dy=player.position.y-h.pos.y;
      if(dy<0.9&&Math.abs(player.position.x-h.pos.x)<h.w/2&&Math.abs(player.position.z-h.pos.z)<h.d/2&&h.cd<=0){h.cd=1;trapHit(h.dmg,'🔥 LAVA!');AudioSys.splash();}
      h.mesh.material.opacity=.4+Math.sin(performance.now()*.004)*.2;
    }else if(h.type==='lavapit'){
      // ravina de lava: ferve (anima) + quem cai queima e volta p/ borda segura
      h.mesh.material.opacity=.4+Math.sin(performance.now()*.004)*.2;
      if(!swinging&&Math.abs(player.position.x-h.pos.x)<h.w/2&&Math.abs(player.position.z-h.pos.z)<h.d/2&&player.position.y<1&&h.cd<=0){
        h.cd=1.2;trapHit(h.dmg,h.msg);
      }
    }else if(h.type==='laser'){
      // SEMPRE LIGADO: tremeluz + varredor gira; encostou, queimou
      const now=performance.now()*.02;
      h.glow.material.opacity=.34+Math.sin(now+h.phase)*.12;
      h.core.scale.x=h.core.scale.z=1+Math.sin(now*1.7+h.phase)*.15;
      if(h.sweep){
        h.phase+=dt*h.sweep.speed;
        const hx=Math.cos(h.phase)*h.half, hz=Math.sin(h.phase)*h.half;
        h.a.set(h.center.x-hx,h.center.y,h.center.z-hz);
        h.b.set(h.center.x+hx,h.center.y,h.center.z+hz);
        layoutLaser(h);
      }
      tmpV.set(player.position.x,player.position.y+.9,player.position.z);
      if(distPointSeg(tmpV,h.a,h.b)<h.r+.45&&h.cd<=0){
        h.cd=h.maxCd;trapHit(h.dmg,'🔆 Laser ancestral!');
        spawnSpark(tmpV.clone());AudioSys.tone(1500,.12,'sawtooth',.09,-900);
      }
    }else if(h.type==='blade'){
      h.t+=dt*1.6;h.pivot.rotation.z=Math.sin(h.t)*1.1;
      tmpV2.set(h.pos.x+Math.sin(h.pivot.rotation.z)*5,h.pos.y,h.pos.z);
      if(player.position.distanceTo(tmpV2)<h.r&&h.cd<=0){h.cd=1;trapHit(h.dmg,'⚔ Lâmina pendular!');}
    }else if(h.type==='pit'){
      // buraco: volta ao início da fase
      if(!swinging&&Math.abs(player.position.x-h.pos.x)<h.w/2&&Math.abs(player.position.z-h.pos.z)<h.d/2&&player.position.y<1&&h.cd<=0){
        h.cd=1.2;trapHit(h.dmg,h.msg);
      }
    }
  }
  // plataformas
  for(const p of platforms){
    if(p.falling){
      // detecta player em cima
      const onP=Math.abs(player.position.x-p.mesh.position.x)<1.8&&Math.abs(player.position.z-p.mesh.position.z)<1.8&&Math.abs(player.position.y-(p.mesh.position.y+.3))<.6;
      if(onP&&p.state===0){p.state=1;p.t=0;}
      if(p.state===1){p.t+=dt;p.mesh.position.x+=Math.sin(p.t*40)*.02;if(p.t>.7){p.state=2;p.t=0;AudioSys.noise(.3,.1);}}
      if(p.state===2){p.t+=dt;p.mesh.position.y-=dt*6;p.box.min.y-=dt*6;p.box.max.y-=dt*6;if(p.t>2){p.state=3;p.t=0;}}
      if(p.state===3){p.t+=dt;if(p.t>2.5){p.state=0;p.mesh.position.copy(p.center);p.box.min.set(p.center.x-1.5,p.center.y-.3,p.center.z-1.5);p.box.max.set(p.center.x+1.5,p.center.y+.3,p.center.z+1.5);}}
      continue;
    }
    p.t+=dt*p.speed*.5;
    p.prev.copy(p.mesh.position);
    const off=Math.sin(p.t)*p.range;
    if(p.axis==='x')p.mesh.position.set(p.center.x+off,p.center.y,p.center.z);
    else p.mesh.position.set(p.center.x,p.center.y,p.center.z+off);
    const w=p.mesh.scale.x,d=p.mesh.scale.z;
    p.box.min.set(p.mesh.position.x-w/2,p.mesh.position.y-.3,p.mesh.position.z-d/2);
    p.box.max.set(p.mesh.position.x+w/2,p.mesh.position.y+.3,p.mesh.position.z+d/2);
    // cola collider ref
    if(p.c)p.c.box=p.box;
  }
  // ondas
  for(let i=waves.length-1;i>=0;i--){const w=waves[i];w.t+=dt;w.m.scale.setScalar(1+w.t*8);w.m.material.opacity=.9-w.t*1.2;if(w.t>.7){scene.remove(w.m);waves.splice(i,1);}}
}
function updatePickups(dt){
  for(const p of pickups){
    if(p.taken)continue;p.t+=dt;
    p.mesh.rotation.y+=dt*(p.big?1.5:2.5);
    if(p.halo)p.halo.scale.setScalar(1+Math.sin(p.t*5)*.12); // anel do kit pulsa
    p.mesh.position.y+=Math.sin(p.t*3)*dt*.4;
    if(p.mesh.position.distanceTo(tmpV.set(player.position.x,player.position.y+1,player.position.z))<1.3){
      p.taken=true;scene.remove(p.mesh);
      if(p.heart){
        heal(LIFE_HEAL);AudioSys.tone(520,.15,'sine',.1,200);
        if(Math.random()<0.25&&maxHealth<340){
          maxHealth+=20;save.maxHealth=maxHealth;persist();heal(20);
          showMsg('💊 PÍLULA VITAL! Vida máxima agora '+maxHealth+'!');AudioSys.relicBig();
        }
        else showMsg('💊 Kit de vida! +'+LIFE_HEAL+' vida!');
      }
      else if(p.skill){
        AudioSys.tone(660,.2,'triangle',.15,330);
        if(skillLevel<5&&Math.random()<SKILL_UPGRADE_CHANCE){
          skillLevel++;
          const bonuses=[
            'Chicote +5 dano! Recarga -10%!',
            'Laço recarrega 20% mais rápido!',
            'Alcance do chicote +15%!',
            'Dano do chicote +10! Resistência +1!',
            'TODAS as habilidades OTIMIZADAS! Recarga -30%!'
          ];
          if(skillLevel===1){WHIP_DMG+=5;WHIP_CD*=.9;WHIP_REACH*=1.05;}
          else if(skillLevel===2){LASSO_MAX*=.8;}
          else if(skillLevel===3){WHIP_REACH*=1.15;}
          else if(skillLevel===4){WHIP_DMG+=10;}
          else if(skillLevel===5){WHIP_DMG+=15;WHIP_CD*=.7;WHIP_REACH*=1.15;LASSO_MAX*=.7;}
          showMsg('⚡ HABILIDADE UPADA! Nível '+skillLevel+'/5 — '+bonuses[skillLevel-1]);AudioSys.relicBig();
        }else showMsg('⚡ Poção de habilidade! +15 XP de experiência!');
      }
      else{
        relics++;score+=p.big?500:100;
        if(p.big){AudioSys.relicBig();onIdolGrab();}
        else AudioSys.pickup();
        showMsg(p.big?'🏆 A ÂNCORA TEMPORAL É SUA! FUJA!!!':'⚙️ Fragmento! ('+relics+'/'+(currentInfo.needRelics||relicsTotal)+')');
        checkPuzzle();
      }
      updateHUD();
    }
  }
  // saída
  if(exitGate){
    exitGate.portal.material.opacity=.6+Math.sin(performance.now()*.005)*.2;
    exitGate.mesh.rotation.y=Math.sin(performance.now()*.001)*.05;
    if(exitGate.preview){const s=1+Math.sin(performance.now()*.006)*.08;exitGate.portal.scale.set(s,s,1);}
    if(player.position.distanceTo(exitGate.pos)<2.6){
      const need=currentInfo.needRelics||0;
      // porta precisa estar aberta?
      const door=doors.find(d=>d.id===currentInfo.doorId);
      const doorBlocked=door&&!door.open;
      if(levelIndex===2&&boss&&!boss.dead){showMsg('🗿 Derrote a SENTINELA primeiro!',2000);}
      else if(doorBlocked){
        if(need&&relics<need)showMsg(`🔒 O portão exige ${need} fragmentos! Você tem ${relics}.`,2500);
        else showMsg('🔒 Porta selada! Encontre as alavancas.',2500);
      }
      else if(need&&relics<need){showMsg(`🔒 Junte ${need} fragmentos! Faltam ${need-relics}.`,2500);}
      else nextLevel();
    }
  }
  // alavancas proximidade
  interactTarget=null;
  for(const l of levers){if(!l.on&&l.pos.distanceTo(player.position)<2.6)interactTarget=l;}
  if(idolPedestal&&levelIndex===2&&boss&&boss.dead&&!escaping){
    // ídolo já é pickup big; nada extra
  }
}
function doInteract(){
  if(interactTarget){toggleLever(interactTarget);return;}
  for(const l of levers){if(l.pos.distanceTo(player.position)<2.6){toggleLever(l);return;}}
}
function updateDoors(dt){
  for(const d of doors){
    if(d.open&&d.mesh.position.y<d.targetY){
      d.mesh.position.y=Math.min(d.targetY,d.mesh.position.y+dt*2);
      d.trim.position.y=d.mesh.position.y+d.mesh.scale.y/2-.2;
      d.box.min.y+=dt*2;d.box.max.y+=dt*2;
      if(d.mesh.position.y>=d.targetY-.1){
        // remove colisão: joga pra cima
        d.box.min.y=999;d.box.max.y=1000;
      }
    }
  }
}
function updateProjectiles(dt){
  for(let i=projectiles.length-1;i>=0;i--){
    const p=projectiles[i];p.life-=dt;
    p.mesh.position.addScaledVector(p.vel,dt);
    // a lança mantém a orientação do disparo (ponta sempre à frente, sem tombar)
    let kill=p.life<=0;
    if(!kill){
      const dyS=p.mesh.position.y-(player.position.y+1);
      const dhS=Math.hypot(p.mesh.position.x-player.position.x,p.mesh.position.z-player.position.z);
      const rr=p.r||.7;
      // lança tem corpo longo: acerta tronco (dh) + altura (dy); pulando alto desvia
      if(dhS<rr&&Math.abs(dyS)<(p.spear?.95:.7)){
        if(p.guardSpear){
          damage(p.dmg||15,'🗡 Lança do sentinela!');applyBleed();spawnSpark(p.mesh.position.clone());
          // FINCA NO PLAYER: a lança fica cravada balançando por 6s!
          try{
            const dirH=p.vel.clone().normalize();
            stickSpearToPlayer(dirH);
          }catch{}
        }
        else trapHit(p.dmg||10,p.spear?'🗡 Lança arremessada!':'🎯 Dardo envenenado!');
        kill=true;
      }
    }
    // colide parede? (salão fase 2: |x|>12 / fora do corredor)
    if(Math.abs(p.mesh.position.x)>13||p.mesh.position.z<-32||p.mesh.position.z>52||p.life<=0)kill=true;
    if(kill){scene.remove(p.mesh);projectiles.splice(i,1);}
  }
}
function updateSparks(dt){for(let i=sparks.length-1;i>=0;i--){const s=sparks[i];s.t-=dt;s.m.scale.setScalar(1+(0.3-s.t)*4);s.m.material.transparent=true;s.m.material.opacity=s.t*3;if(s.t<=0){scene.remove(s.m);sparks.splice(i,1);}}}
function updateTorches(){
  const t=performance.now()*.008;
  for(const o of torches){o.flame.scale.setScalar(1+Math.sin(t+o.seed)*.18);if(o.light)o.light.intensity=10+Math.sin(t*1.3+o.seed)*3;}
}
function updateBossEscape(dt){
  if(levelIndex===2&&boss&&boss.dead&&!escaping){
    // verifica se pegou ídolo (pickup big sumiu)
    const idol=pickups.find(p=>p.big);
    if(idol&&idol.taken&&!escaping){
      escaping=true;AudioSys.roar();AudioSys.door();
      showMsg('🪨 A CAVERNA DESABA! CORRA PARA O TÚNEL VERDE!',5000);
      openDoor('escape3');
      // boulder persegue player (nasce DENTRO da arena, atrás do player)
      const m=new THREE.Mesh(new THREE.SphereGeometry(2.2,16,14),MAT(0x5a4a3c));
      m.position.set(player.position.x,2,Math.max(player.position.z-7,-20));m.castShadow=true;scene.add(m);
      escapeBoulder={mesh:m,speed:5.2};
      shake=1;
    }
  }
  if(escaping&&escapeBoulder){
    tmpV.subVectors(player.position,escapeBoulder.mesh.position);tmpV.y=0;
    const d=tmpV.length();tmpV.normalize();
    escapeBoulder.mesh.position.addScaledVector(tmpV,escapeBoulder.speed*dt);
    escapeBoulder.mesh.rotation.x+=dt*4;
    escapeBoulder.speed+=dt*.25; // acelera!
    shake=Math.max(shake,.15);
    if(d<2.6){damage(30,'🪨 A PEDRONA TE ESMAGOU!');escapeBoulder.mesh.position.addScaledVector(tmpV,-3);}
    // poeira
    if(Math.random()<.3)spawnSpark(escapeBoulder.mesh.position.clone());
  }
  if(shake>0){shake-=dt;if(shake<0)shake=0;}
}
function updateCamera(dt){
  // robustez: se alguma posição virou NaN (ex. chamada externa com array), reseta p/ spawn
  const pp=player.position;
  if(typeof pp.x!=='number'||typeof pp.y!=='number'||typeof pp.z!=='number'||!isFinite(pp.x+pp.y+pp.z)){
    const s=currentInfo?.spawn||{x:0,y:.5,z:8};
    pp.set(s.x,s.y,s.z);vy=0;pvx=0;pvz=0;swinging=null;
  }
  if(typeof camPos.x!=='number'||typeof camPos.y!=='number'||typeof camPos.z!=='number'||!isFinite(camPos.x+camPos.y+camPos.z)){
    camPos.set(pp.x,pp.y+4,pp.z+7);
  }
  const head=tmpV.set(pp.x,pp.y+2.1,pp.z);
  const dist=6, h=1.6+ pitch*3;
  const cx=head.x+Math.sin(yaw)*dist*Math.cos(pitch), cz=head.z+Math.cos(yaw)*dist*Math.cos(pitch);
  const cy=head.y - pitch*dist + h*.4;
  const gy=groundY(cx,cz);
  tmpV2.set(cx,Math.max(cy,(isFinite(gy)?gy:0)+.6),cz);
  if(!isFinite(tmpV2.x+tmpV2.y+tmpV2.z))tmpV2.set(pp.x,pp.y+4,pp.z+7);
  camPos.lerp(tmpV2,Math.min(1,dt*6));
  camera.position.copy(camPos);
  if(shake>0){camera.position.x+=(Math.random()-.5)*shake*.6;camera.position.y+=(Math.random()-.5)*shake*.6;}
  camera.lookAt(head.x,head.y-.2,head.z);
  sun.target.position.copy(player.position);sun.position.set(player.position.x+30,50,player.position.z+20);
}

// ---------- FLOW ----------
function nextLevel(){
  AudioSys.win();
  score+=500+Math.max(0,300-Math.floor(levelTime)*2);
  totalScore+=score;score=0;totalTime+=levelTime;
  save.unlocked=Math.max(save.unlocked,Math.min(2,levelIndex+1));save.totalRelics+=relics;persist();
  if(levelIndex>=2){winGame();return;}
  state='story';document.exitPointerLock?.();
  const n=levelIndex+1;
  $('story-kicker').textContent=STORIES[n].k;
  $('story-title').textContent=STORIES[n].t;
  $('story-text').textContent=STORIES[n].x;
  $('story').classList.remove('hidden');hud.classList.add('hidden');
}
function winGame(){
  state='victory';document.exitPointerLock?.();
  AudioSys.win();setTimeout(()=>AudioSys.win(),600);
  save.bestTime=save.bestTime?Math.min(save.bestTime,totalTime):totalTime;persist();
  $('victory-stats').textContent=`Tempo total ${fmt(totalTime)} • Pontos ${totalScore} • Com a Âncora Temporal você voltou a 1969 para impedir Voller de reescrever a história!`;
  $('victory').classList.remove('hidden');hud.classList.add('hidden');
}
function startGame(from=0){
  AudioSys.init();AudioSys.ctx?.resume?.();
  ['menu','story','pause','gameover','victory'].forEach(id=>$(id).classList.add('hidden'));
  hud.classList.remove('hidden');
  if(isMobile())$('touch-controls').classList.remove('hidden');
  totalScore=0;totalTime=0;score=0;
  loadLevel(from);state='playing';
  if(!isMobile())setTimeout(()=>renderer.domElement.requestPointerLock?.(),100);
}
function pauseGame(){if(state!=='playing')return;state='paused';document.exitPointerLock?.();$('pause').classList.remove('hidden');}
function resumeGame(){if(state!=='paused')return;$('pause').classList.add('hidden');state='playing';if(!isMobile())renderer.domElement.requestPointerLock?.();}

// UI wiring
$('btn-start').onclick=()=>{AudioSys.init();state='story';$('menu').classList.add('hidden');
  $('story-kicker').textContent=STORIES[0].k;$('story-title').textContent=STORIES[0].t;$('story-text').textContent=STORIES[0].x;
  $('story').classList.remove('hidden');};
$('btn-next').onclick=()=>{$('story').classList.add('hidden');const idx=STORIES.findIndex(s=>s.t===$('story-title').textContent);startGameWithStory(idx);};
function startGameWithStory(idx){['menu','story'].forEach(id=>$(id).classList.add('hidden'));hud.classList.remove('hidden');if(isMobile())$('touch-controls').classList.remove('hidden');if(idx!==levelIndex||state!=='playing'){if(totalScore===0&&idx===0){totalScore=0;totalTime=0;kills=0;secondChances=0;}loadLevel(idx);}state='playing';if(!isMobile())setTimeout(()=>renderer.domElement.requestPointerLock?.(),100);}
$('btn-resume').onclick=resumeGame;
$('btn-restart').onclick=()=>{$('pause').classList.add('hidden');score=0;loadLevel(levelIndex);state='playing';};
$('btn-quit').onclick=()=>{location.reload();};
$('btn-retry').onclick=()=>{$('gameover').classList.add('hidden');hud.classList.remove('hidden');score=0;loadLevel(levelIndex);state='playing';if(!isMobile())renderer.domElement.requestPointerLock?.();};
$('btn-go-menu').onclick=()=>location.reload();
$('btn-again').onclick=()=>location.reload();
$('btn-help').onclick=()=>$('help-text').classList.toggle('hidden');
if(save.unlocked>0||save.totalRelics>0){const b=$('btn-continue');b.classList.remove('hidden');b.textContent=`↻ CONTINUAR DA FASE ${Math.min(3,save.unlocked+1)}`;b.onclick=()=>{AudioSys.init();$('menu').classList.add('hidden');totalScore=0;totalTime=0;$('story-kicker').textContent=STORIES[save.unlocked].k;$('story-title').textContent=STORIES[save.unlocked].t;$('story-text').textContent=STORIES[save.unlocked].x;$('story').classList.remove('hidden');state='story';};}

// clica no canvas = chicote (além de lock)
renderer.domElement.addEventListener('mousedown',e=>{if(state==='playing'&&(pointerLocked||isMobile())){if(e.button===0)tryWhip=true;}});

// splash crédito inicial: GRANDE e RÁPIDO antes do jogo (some sozinho!)
try{
  setTimeout(()=>{try{$('splash-dev').classList.add('hidden');}catch{}},2300);
  setTimeout(()=>{try{$('splash-dev')?.remove?.();}catch{}},3000);
}catch{}
// boot: diorama de fundo p/ o menu (renderizado pelo loop único animate())
maxHealth=save.maxHealth||200;
player=buildPlayer();player.position.set(0,0,0);
{
  groundPlane(120,120,0x3d7a3d);addBox(0,-1,0,120,2,120,0x3d7a3d,{cast:false});
  for(let i=0;i<12;i++)makeTree((Math.random()-.5)*60,(Math.random()-.5)*60-10,1);
  makePillar(-4,0,-6,6);makePillar(4,0,-6,6);addBox(0,4,-6,11,.8,2,0x9a8a6a);
  addTorch(-3,0,-4);addTorch(3,0,-4);spawnRelic(0,1,-2,true);
  camera.position.set(0,3,8);camera.lookAt(0,1.5,-2);
}

animate();
console.log('⌛ Caçador de Relíquias: O Relógio de Arquimedes carregado! Three.js',THREE.REVISION);
