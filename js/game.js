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
const spinHud=$('spin-hud'), spinFill=$('spin-fill'), aimHud=$('aim-hud');
const aimTag=$('aim-tag'), aimTagName=$('aim-tag-name'), crosshairEl=$('crosshair');

// ---------- SAVE ----------
const SAVE_KEY='relicHunterAkum_v1';
// difficulty começa VAZIA de propósito: o jogador é obrigado a escolher uma
let save={unlocked:0,totalRelics:0,bestTime:0,hpPills:0,difficulty:null};
try{const s=JSON.parse(localStorage.getItem(SAVE_KEY));if(s)save={...save,...s};}catch{}
function persist(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));}catch{}}

// ══════════ DIFICULDADE ══════════
// Escolhida no menu principal e salva. Todos os multiplicadores entram de uma vez:
// dano recebido, vida, velocidade/dano dos inimigos, drops, invulnerabilidade,
// vida do chefe, duração do atordoamento e recarga do laço.
const DIFFS={
  facil:{
    id:'facil',name:'FÁCIL',icon:'🟢',
    desc:'Para iniciantes que querem apreciar a aventura e ver a história de Indiana Jones. Poucos inimigos e armadilhas reduzidas.',
    hp:1.5, dmg:.5, spd:.78, drop:1.7, iframe:1.7, bossHp:.8, stun:1.5, whip:.85, lassoCd:.8,
    enemies:2, traps:false,
  },
  medio:{
    id:'medio',name:'MÉDIO',icon:'🟡',
    desc:'Jogo mediano para quem quer um pouco de dificuldade, mas com certo nível de facilidade.',
    hp:1, dmg:1, spd:1, drop:1, iframe:1, bossHp:1, stun:1, whip:1, lassoCd:1,
    enemies:3, traps:true,
  },
  dificil:{
    id:'dificil',name:'DIFÍCIL',icon:'🔴',
    desc:'Para quem já está familiarizado com o jogo e quer um nível alto de dificuldade.',
    hp:.75, dmg:1.6, spd:1.28, drop:.6, iframe:.65, bossHp:1.3, stun:.65, whip:1.15, lassoCd:1.25,
    enemies:5, traps:true,
  },
};
let DIFF=DIFFS[save.difficulty]||DIFFS.medio;
let diffChosen=!!save.difficulty;      // ⛔ obrigatório escolher antes de começar
function reflectDiffUI(){
  // sem escolha, NENHUM botão fica marcado (o jogador precisa clicar em um)
  for(const b of document.querySelectorAll('.diff-btn'))b.classList.toggle('sel',diffChosen&&b.dataset.diff===DIFF.id);
  const d=$('diff-desc');
  if(d)d.textContent=diffChosen?DIFF.desc
    :'Escolha 🟢 🟡 ou 🔴 — o jogo muda de verdade: quantidade de inimigos, armadilhas, vida, dano e a Sentinela.';
  const st=$('diff-status'),btn=$('btn-start');
  if(st)st.textContent=diffChosen
    ?('Dificuldade escolhida: '+DIFF.icon+' '+DIFF.name+' — '+DIFF.enemies+' inimigos de cada tipo')
    :'⚠ Escolha uma dificuldade para começar';
  if(st)st.classList.toggle('warn',!diffChosen);
  if(btn)btn.textContent=diffChosen
    ?('▶ COMEÇAR AVENTURA ('+DIFF.icon+' '+DIFF.name+')')
    :'▶ ESCOLHA UMA DIFICULDADE';
}
function setDifficulty(id){
  DIFF=DIFFS[id]||DIFFS.medio;
  save.difficulty=DIFF.id;diffChosen=true;persist();
  applyDiffMaxHealth();applyDiffWhip();
  reflectDiffUI();
}
// ── INIMIGOS POR DIFICULDADE ──
// A QUANTIDADE vem da dificuldade (2 / 3 / 5 de cada tipo); as POSIÇÕES são fixas
// e escolhidas no level design (bons spots, longe de armadilhas). O chefe é sempre 1.
function spawnLevelEnemies(slots,bossAt){
  const n=DIFF.enemies;
  let made=0;
  for(const type in slots){
    const list=slots[type]||[];
    for(let i=0;i<n&&i<list.length;i++){spawnEnemy(type,list[i][0],list[i][1],list[i][2]);made++;}
  }
  if(bossAt)spawnEnemy('golem',bossAt[0],bossAt[1],bossAt[2]);
  showMsgOnce('⚔ '+made+(made===1?' inimigo':' inimigos')+' nesta fase ('+DIFF.name+').');
}
// armadilhas OPCIONAIS: no FÁCIL elas simplesmente não são construídas
function keepTrap(id,list){return DIFF.traps||!list.includes(id);}
let hpPills=0;            // +20 de vida por pílula vital (independente da dificuldade)
function applyDiffMaxHealth(){
  maxHealth=Math.min(400,Math.round((200+hpPills)*DIFF.hp));
  if(health>maxHealth)health=maxHealth;
}

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
  if(['Space','ArrowUp','ArrowDown','ControlLeft','ControlRight'].includes(e.code))e.preventDefault();
  if(e.repeat)return;
  if(e.code==='Space')jumpQueued=true;
  if(e.code==='KeyF')tryWhip=true;
  if(e.code==='KeyH')trySpin=true;      // 🌀 GIRO DO CHICOTE (área)
  if(e.code==='KeyZ')tryAim=true;        // 🎯 TRAVAR A MIRA num inimigo
  if(e.code==='KeyV')trySwing=true;
  if(e.code==='KeyE')tryInteract=true;
  if(e.code==='KeyG')tryLasso=true;
  // 🌀 ESQUIVA: C / Ctrl OU dois toques rápidos na mesma direção (double-tap)
  if(e.code==='KeyC'||e.code==='ControlLeft'||e.code==='ControlRight')tryDodge=true;
  if(e.code==='KeyA'||e.code==='ArrowLeft'||e.code==='KeyD'||e.code==='ArrowRight'){
    const dir=(e.code==='KeyA'||e.code==='ArrowLeft')?-1:1;
    const now=performance.now();
    if(dir===lastTapDir&&now-lastTapT<280)tryDodge=true;
    lastTapDir=dir;lastTapT=now;
  }
  if(e.code==='Escape'&&state==='playing')pauseGame();
  if(e.code==='KeyP'&&state==='playing')pauseGame();
});
addEventListener('keyup',e=>keys[e.code]=false);

const container=$('game-container');
document.addEventListener('mousemove',e=>{
  if(state!=='playing'||!pointerLocked)return;
  if(aimLock)return;                       // 🎯 travada: só o alvo decide a câmera
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
bind('btn-spin',()=>{trySpin=true;});   // 🌀 giro de área
bind('btn-aim',()=>{tryAim=true;});     // 🎯 trava a mira
bind('btn-swing',()=>{trySwing=true;});
bind('btn-lasso',()=>{tryLasso=true;});
bind('btn-run',()=>touch.run=true,()=>touch.run=false);
bind('btn-act',()=>{tryInteract=true;});
bind('btn-dodge',()=>{tryDodge=true;});
})();

// ---------- THREE SETUP ----------
const isMobileDevice=isMobile();
// ---------- RENDER: sombras, luz e cor cinematográficas ----------
const renderer=new THREE.WebGLRenderer({antialias:!isMobileDevice,powerPreference:'high-performance'});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio||1,isMobileDevice?1:1.75));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;      // bordas de sombra macias
renderer.shadowMap.autoUpdate=true;
renderer.toneMapping=THREE.ACESFilmicToneMapping;    // cinema: luz suave, cores ricas
renderer.toneMappingExposure=1.12;
renderer.outputColorSpace=THREE.SRGBColorSpace;     // cores no espaço certo (mais Vivo)
container.appendChild(renderer.domElement);

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x87b5d6);
scene.fog=new THREE.Fog(0x87b5d6,40,160);
const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.1,500);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

const hemi=new THREE.HemisphereLight(0xfff2cc,0x2a3d1e,.85);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff0d0,1.6);
sun.position.set(30,50,20);sun.castShadow=true;
const SHADOW_RES=isMobileDevice?1024:2048;          // sombras nítidas no PC
sun.shadow.mapSize.set(SHADOW_RES,SHADOW_RES);
sun.shadow.camera.left=-70;sun.shadow.camera.right=70;sun.shadow.camera.top=70;sun.shadow.camera.bottom=-70;sun.shadow.camera.far=160;
// 🎬 penumbra e meio-tom suaves (o "vital" das sombras cinematográficas)
sun.shadow.radius=isMobileDevice?2:4;
sun.shadow.bias=-.0006;         // evita acne (manchas) nas sombras
sun.shadow.normalBias=.035;     // evita sombra "solta" nas quinas
scene.add(sun);scene.add(sun.target);
// luz de preenchimento fria vinda do lado oposto: separa a silhueta do fundo
const fillLight=new THREE.DirectionalLight(0x9fc4e8,.35);
fillLight.position.set(-40,25,-30);scene.add(fillLight);
// ambiente PBR: reflexos e oclusão nuances em tudo que é metálico/pedra
const pmrem=new THREE.PMREMGenerator(renderer);
const envRT=pmrem.fromScene(new THREE.Scene(),.04);
scene.environment=envRT.texture;
scene.environmentIntensity=.45;

// ---------- MAT CACHE ----------
const matCache={};
function MAT(color,opts={}){
  if(color&&color.isMaterial)return color; // já é um material pronto (ex.: MATX) — não reconstrói
  // chave manual: JSON.stringify(chama toJSON() da Texture e DERRUBA o uuid do cache
  let k=String(color);
  for(const p in opts){const v=opts[p];k+='|'+p+'='+(v&&v.uuid!==undefined?v.uuid:(v&&typeof v==='object'?'[obj]':v));}
  if(!matCache[k])matCache[k]=new THREE.MeshStandardMaterial({color,roughness:.85,metalness:.05,...opts});return matCache[k];}
const boxGeo=new THREE.BoxGeometry(1,1,1);

// ══════════ ORÇAMENTO DE LUZES — a correção nº1 do lag ══════════
// O renderizador é FORWARD: cada PointLight entra na conta de TODOS os pixels.
// A fase 3 criava ~30 tochas/luzes ao mesmo tempo → o shader inchava e o jogo
// engasgava. Aqui TODA luz do cenário passa por um "orçamento": só as N mais
// importantes (por prioridade + proximidade da câmera) ficam realmente na cena,
// e as demás voltam para o pool quando o jogador se afasta.
const LIGHT_BUDGET=isMobileDevice?4:7;
const lightPool=[];
function POINT(color,intensity,distance,decay,x,y,z,priority=0){
  const l=new THREE.PointLight(color,intensity,distance,decay);
  l.position.set(x,y,z);
  const e={l,x,y,z,prio:priority,on:true};
  lightPool.push(e);
  scene.add(l); // entra já no jogo (p/ o 1º frame não ficar escuro)
  refreshLights();
  return l;
}
let lightTimer=0;
// move uma luz do pool junto com o objeto que a carrega (ex.: núcleo do chefe)
function movePoint(l,x,y,z){
  if(!l)return;
  l.position.set(x,y,z);
  const e=lightPool.find(v=>v.l===l);
  if(e){e.x=x;e.y=y;e.z=z;}
}
function refreshLights(){
  const cx=camera.position.x,cy=camera.position.y,cz=camera.position.z;
  const scored=lightPool.map(e=>[e.prio*100-Math.hypot(e.x-cx,e.y-cy,e.z-cz),e]);
  scored.sort((a,b)=>b[0]-a[0]);
  const keep=new Set();
  for(let i=0;i<Math.min(LIGHT_BUDGET,scored.length);i++)keep.add(scored[i][1]);
  for(const e of lightPool){
    const want=keep.has(e);
    if(want&&!e.on){scene.add(e.l);e.on=true;}
    else if(!want&&e.on){scene.remove(e.l);e.on=false;}
  }
}
// conta as luzes realmente na cena (usado pelo teste de performance)
function liveLights(){
  let n=0;
  scene.traverse(o=>{if(o.isPointLight)n++;});
  return n;
}

// ---------- GAME STATE ----------
let state='menu'; // menu|story|playing|paused|dead|victory
let levelIndex=0, colliders=[], dynamics=[], enemies=[], pickups=[], levers=[], doors=[], hazards=[], projectiles=[], platforms=[], grapples=[], torches=[], boulders=[], rollers=[], exitGate=null, idolPedestal=null;
let player, whipMesh, playerLight;
const whipSegs=[]; // elos do chicote segmentado
let pvx=0, pvz=0; // velocidade suavizada (peso na movimentação)
let tryWhip=false, tryInteract=false, tryLasso=false, trySwing=false, trySpin=false, tryAim=false;
let LASSO_MAX=30; // recarga da habilidade do laço (segundos)
let lassoCD=0;
// ---------- SWING NA ARGOLA: SÓ no V + cooldown anti-spam ----------
const SWING_CD_MAX=6; // segundos entre um swing e outro na argola
// 🌀 GIRO DO CHICOTE (H): ataque em ÁREA — o corpo dá 360° e o chicote varre
// tudo em volta. Gasta fôlego, dá um instante de invulnerabilidade e acerta
// TODOS os inimigos dentro do raio (uma vez cada por giro).
const SPIN_CD_MAX=20;         // ⟵ recarga do giro (20 s entre um e outro)
const SPIN_DUR=.62;           // duração do giro (1 volta completa)
const SPIN_R=4.3;             // raio de alcance
const SPIN_COST=18;           // fôlego gasto
const SPIN_DMG=15;            // ⟵ DANO FIXO: 15 em cada inimigo acertado
let spinCD=0, spinT=0, spinYaw0=0, spinHits=new Set();
// 🎯 MIRA TRAVADA (Z): prende a câmera num inimigo e a acompanha. Errou? Aperta
// Z de novo. O alvo morre ou fica longe demais → a mira solta sozinha.
const AIM_CONE=.85;      // ~48° de cone ao redor da mira
const AIM_MAX=52;        // alcance máximo da trava (m)
let aimLock=null, aimLockT=0, aimReticle=null;
const ALVO_NOME={cobra:'🐍 Cobra',bat:'🦇 Morcego',guard:'🗡 Guarda',ogre:'👹 Ogre',
  golem:'🗿 Sentinela',shooter:'🌀 Atirador'};
let swingCD=0;
let health=100, stamina=100, relics=0, relicsTotal=0, score=0, levelTime=0, totalScore=0, totalTime=0;
let onGround=false, vy=0, coyote=0, iframes=0, whipCD=0, whipAnim=0, stepT=0;
let poisonT=0, poisonTick=0, poisonImm=0; // ☠️ VENENO: 6s de debuff, 1 de dano a cada 2s
let burnT=0, burnTick=0;              // 🔥 QUEIMADURA: 5s de debuff, 4 de dano a cada 1s
let safeSpot=new THREE.Vector3(0,0,46), safeTick=0;   // último chão seguro (evita voltar ao início da fase)
let paraT=0, paraImm=0;      // paralisia: 3s travado (SÓ morcego, de perto), só reaplica a cada 20s
let bleedT=0, bleedTick=0;   // sangramento: 2 de dano a cada 2s por 8s (lança do sentinela!)
let maxHealth=200;           // vida inicial 200 (pílula vital aumenta +20, teto 340)
let kills=0, secondChances=0; // a cada 10 abates: 1 CURA TUDO (revive onde morreu)
let runHold=0; // tempo segurando correr (gasto progressivo do fôlego)
let skillLevel=0; // nível de habilidade (0-5 upgrades)
const SKILL_DROP_CHANCE=0.2; // 20% de chance do inimigo dropar poção de habilidade
const SKILL_UPGRADE_CHANCE=0.15; // 15% de chance de upgrade ao pegar poção
let WHIP_DMG0=34;                                 // base do chicote (34 = médio)
let WHIP_DMG=WHIP_DMG0, WHIP_CD=0.5, WHIP_REACH=2.2; // atributos evoluíveis
function applyDiffWhip(){WHIP_DMG=Math.round(WHIP_DMG0*DIFF.whip);}
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
let arena3=null; // limites da arena do boss (fase 3): a sentinela bate na parede e para
let interactTarget=null;
// ---------- 🌀 ESQUIVA / FOCO (os jeitos de DESVIAR dos ataques do chefe) ----------
const DODGE_CD_MAX=1.15, DODGE_DUR=.40, DODGE_SPEED=16;
const SLOWMO_SCALE=.32, SLOWMO_MAX=1.2;
let dodgeT=0, dodgeCD=0, dodgeDirX=0, dodgeDirZ=0, tryDodge=false, slowmoT=0, dodgePerfects=0;
let lastTapT=0, lastTapDir=0, previewShown=false; // prévia da próxima fase já exibida neste nível?

// ══════════════ HISTÓRIA (no clima dos filmes de aventura/arqueologia) ══════════════
// O índice 0..2 continua sendo FASE 1..3 (o jogo usa STORIES[levelIndex]).
// As cutscenes usam as entradas extras logo abaixo.
// 🎬 PRÓLOGO: os quadros PELAM o mapa real da Fase 1 (a câmera passeia da queda
// até o templo) e o último quadro usa `face` — a câmera se posiciona sozinha
// na frente do herói, virada para ele.
const OPENING={k:'PRÓLOGO — NOVA YORK, 1969',t:'O Relógio de Arquimedes',
  x:'O Relógio de Arquimedes reaparece após milênios enterrado — e o doutor Jürgen Voller o toma antes de você. Voller e a conspiração abrem uma fenda no meio da Amazônia: você cai lá dentro, soterrado na chuva da floresta.',
  cam:[0,20,74, 0,2,34]};
const PROLOGUE=[
  OPENING,
  {k:'A QUEDA',t:'A floresta te engole',
   x:'A chuva apaga o rastro da fenda. Lá embaixo, entre a trilha, a ravina e o fosso de lava, o Relógio continua girando — e com ele, a única saída de volta para 1969.',
   cam:[12,5.5,54, 0,1.4,40]},
  {k:'O CAMINHO',t:'Atravesse a mata',
   x:'Siga a trilha, cruze a ravina de chicote nas argolas douradas 🪢 e suba até o pátio do templo escondido. Junte os 3 fragmentos do mecanismo ⚙️: cada um guarda um pedaço do caminho de volta.',
   cam:[15,8,12, 0,1,0]},
  {k:'O TEMPLO',t:'A Sentinela do Tempo',
   x:'No fim do pátio, atrás da porta de pedra, uma colossal de bronze dorme em cima do Cálice da Âncora. Vença a Sentinela, tome a Âncora — e é a sua volta para casa... e a última chance de deter Voller.',
   cam:[9,11,-12, 0,6,-42]},
  {k:'AVENTURA',t:'Você acorda na floresta',
   x:'Chicote enrolado na mão, fedora na cabeça e a selva à frente. Voller já começou a reescrever a história — e só você pode impedir.',
   face:true},
];
// Telas de história das 3 fases (o jogo usa STORIES[levelIndex] e STORIES[levelIndex+1])
const STORIES=[
 {k:'FASE 1 — 1969',t:'Despertar na Amazônia',
  x:'Nova York, 1969. Na luta contra Jürgen Voller pelo Relógio de Arquimedes — que leva quem o portar a qualquer lugar no tempo — o vilão ficou com o mostrador e jogou você para longe de casa: uma caverna no coração da Amazônia, Brasil. Atravesse a ravina de chicote, junte 3 fragmentos do mecanismo ⚙️ e entre na caverna. A Âncora Temporal, que teletransporta para onde você quiser, espera no fim... e é a sua volta para casa.'},
 {k:'FASE 2 — PROFUNDEZAS',t:'Caverna do Tempo',
  x:'Dentro da caverna o tempo parece quebrado: lanças e lâminas guardam os salões, e Voller deixou sentinelas para trás. Puxe as 2 alavancas, junte 4 fragmentos ⚙️ e avance — cada passo é um passo de volta para 1969, antes que Voller reescreva a história.'},
 {k:'FASE 3 — O ACERTO FINAL',t:'A Câmara do Cálice',
  x:'A Sentinela do Tempo guarda o CÁLICE DA ÂNCORA, o artefato que leva seu portador a qualquer lugar do tempo. A arena é limpa: nenhuma armadilha, só você e a pedra que marcará no chão onde cada golpe vai cair — saia da marca, pule a onda ou role para desviar. Derrote-a, pegue o Cálice... e CORRA. A caverna vai desabar — e essa é a sua carona de volta para impedir Jürgen Voller de uma vez por todas.'},
];


// ---------- WORLD HELPERS ----------
function clearLevel(){
  for(let i=scene.children.length-1;i>=0;i--){const o=scene.children[i];if(o!==camera&&o!==hemi&&o!==sun&&o!==sun.target&&!o.userData.keepAlive)scene.remove(o);}
  colliders=[];dynamics=[];enemies=[];pickups=[];levers=[];doors=[];hazards=[];projectiles=[];platforms=[];grapples=[];torches=[];boulders=[];rollers=[];exitGate=null;idolPedestal=null;boss=null;escaping=false;escapeBoulder=null;
  altars.length=0;quizState=null;try{$('quiz').classList.add('hidden');}catch{}
  for(const w of waves)scene.remove(w.m||w.ringG);waves.length=0;
  for(const s of sparks){s.live=false;s.t=0;s.m.visible=false;}   // o pool de faíscas é reaproveitado (nunca destruído)
  lightPool.length=0;   // as luzes do orçamento são recriadas pela fase
  for(const t of telegraphs)scene.remove(t.m);telegraphs.length=0;
  for(const p of pickups)p.lassoed=false;
  lassoPick=null;
  if(pressPrompt)pressPrompt.grp.visible=false;
  pressPrompt=null;
  swinging=null;interactTarget=null;shake=0;vy=0;coyote=0;whipCD=0;whipAnim=0;iframes=0;swingCD=0;
  spinCD=0;spinT=0;spinHits.clear();aimLock=null;aimLockT=0;tryAim=false;
  dodgeT=0;dodgeCD=0;slowmoT=0;downT=0;downMsg='';
  clearLassoRope();arena3=null;
  landingMarker=null; // recriado no loadLevel (a cena é limpa aqui)
  escapeCut=false;finaleStarted=false;escapeUnlocked=false;hideMission();
  previewShown=false;try{$('phase-preview').classList.add('hidden');}catch{}
  jumpQueued=false;tryWhip=false;tryInteract=false;tryLasso=false;trySwing=false;trySpin=false;tryAim=false;pvx=0;pvz=0;spdVis=0;runHold=0;
  landCrouch=0;airTime=0;idleTime=0;animBlend=0;swingPhase='';spearSlow=0;
  for(const s of stuckSpears){try{player?.userData?.rig?.remove(s.mesh);}catch{}}stuckSpears.length=0;
  poisonT=0;poisonTick=0;poisonImm=0;paraT=0;paraImm=0;bleedT=0;bleedTick=0;burnT=0;burnTick=0;
  container.classList.remove('paralyzed');
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
function makePillar(x,y,z,h=6){
  // COLUNA CLÁSSICA REBAJADA: base, fuste com estrias, capitel e ruínas — bem mais bonita
  // que um cilindro, e com relevo de pedra.
  const g=new THREE.Group();
  const st=MATX(0x9a8a6a,{surf:'stone',repeat:3});
  const stD=MATX(0x7d6f55,{surf:'stone',repeat:2});
  const base=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.7,.4,12),stD);base.position.y=.2;g.add(base);
  const base2=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.45,.3,12),st);base2.position.y=.55;g.add(base2);
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.85,1.05,h-.9,14),st);
  shaft.position.y=.7+(h-.9)/2;g.add(shaft);
  for(let i=0;i<12;i++){ // estrias (fluting) no fuste
    const a=(i/12)*Math.PI*2;
    const fl=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,h-.9,5),stD);
    fl.position.set(Math.cos(a)*.95,.7+(h-.9)/2,Math.sin(a)*.95);g.add(fl);
  }
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(1.35,1.0,.35,12),st);cap.position.y=h-.15;g.add(cap);
  const abac=new THREE.Mesh(boxGeo,stD);abac.scale.set(3.1,.3,3.1);abac.position.y=h-.4;g.add(abac);
  // detalhe: anel de ouro + lasca (sugere ruína antiga)
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.06,.06,6,16),MAT(0xc9a227,{metalness:.8,roughness:.35}));
  ring.rotation.x=Math.PI/2;ring.position.y=h*.55;g.add(ring);
  const chip=new THREE.Mesh(new THREE.DodecahedronGeometry(.3,0),stD);
  chip.position.set(.7,h*.3,.6);chip.rotation.set(1,2,3);g.add(chip);
  g.position.set(x,y,z);
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  scene.add(g);return g;
  const top=new THREE.Mesh(boxGeo,MAT(0x7a6a4d));top.scale.set(2.6,.6,2.6);top.position.set(x,y+h+.3,z);top.castShadow=true;scene.add(top);return p;}
function addTorch(x,y,z,withLight=true){
  const s=new THREE.Mesh(new THREE.CylinderGeometry(.08,.1,1.2,6),MAT(0x4a3320));s.position.set(x,y+.6,z);scene.add(s);
  const f=new THREE.Mesh(new THREE.SphereGeometry(.22,8,7),new THREE.MeshBasicMaterial({color:0xffa726}));f.position.set(x,y+1.3,z);scene.add(f);
  let l=null;
  // luz mais forte e com mais alcance (visibilidade nas cavernas).
  // Prioridade baixa: só entra na cena se estiver entre as mais importantes.
  if(withLight){l=POINT(0xffb45e,22,22,1.6,x,y+1.8,z,0);}
  torches.push({flame:f,light:l,seed:Math.random()*10,baseI:l?l.intensity:0});
}
function showMsg(t,ms=2600){msgEl.textContent=t;msgEl.classList.add('show');clearTimeout(msgTimer);msgTimer=setTimeout(()=>msgEl.classList.remove('show'),ms);}
function damage(n,src){
  if(iframes>0||state!=='playing')return;
  if(typeof n!=='number'||!isFinite(n))n=10;
  n*=DIFF.dmg;                                   // 😐/🔴difficult: o dano muda
  health-=n;iframes=.7*DIFF.iframe;AudioSys.hurt();
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
      poisonT=0;poisonTick=0;paraT=0;paraImm=2;bleedT=0;bleedTick=0;burnT=0;burnTick=0;iframes=3;
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
const POISON_TIME=6;   // ⏱️ debuff de veneno: 6 segundos
function applyPoison(){
  showMsg('☠️ ENVENENADO! Veneno por '+POISON_TIME+'s — 1 de dano a cada 2s!');
  poisonT=POISON_TIME;poisonTick=0;poisonImm=40;AudioSys.noise(.4,.14);
}
// 🔥 QUEIMADURA: a lava deixa o herói queimando — 5s, 4 de dano a cada segundo
const BURN_TIME=5, BURN_DPS=4;
function applyBurn(){
  burnT=BURN_TIME;burnTick=0;               // renova os 5s se encostar de novo
  showMsg('🔥 QUEIMANDO! '+BURN_TIME+'s — '+BURN_DPS+' de dano por segundo!',2600);
  AudioSys.splash();AudioSys.hurt();
  for(let i=0;i<6;i++)spawnSpark(player.position.clone().add(new THREE.Vector3((Math.random()-.5)*.8,.6,(Math.random()-.5)*.8)));
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
// 🧍 ONDE REAPARECER: o último chão seguro, NÃO o começo da fase. Bateu numa
// armadilha → você se levanta ali mesmo e continua, sem perder o progresso.
function rememberSafeSpot(){
  const p=player.position;
  if(p.y<-.6||state!=='playing')return;
  for(const h of hazards){   // ignora se estiver em cima/perto de alguma armadilha
    if(h.type==='lava'||h.type==='lavapit'||h.type==='pit'){
      if(Math.abs(p.x-h.pos.x)<h.w/2+1.5&&Math.abs(p.z-h.pos.z)<h.d/2+1.5)return;
    }
    if(h.type==='spikes'){ // base retangular real (w×d) + folga, em vez do círculo inflado
      const pad=h.pad??.28;
      if(Math.abs(p.x-h.pos.x)<=h.w/2+pad&&Math.abs(p.z-h.pos.z)<=h.d/2+pad)return;
    }
  }
  safeSpot.set(p.x,p.y,p.z);
}
// ══════════ 💥 ARMADILHA DE CONTATO: TOMBAR NO CHÃO + DANO ALTO ══════════
// Espinhos, lava, laser, lâmina, abismo, pedrona e rolos derrubam o herói:
// ele perde o embalo, rola no chão, leva DANO ALTO e só levanta no último
// chão seguro. As FLECHAS (dardo/lança) NÃO entram aqui — continuam com o
// dano normal, sem tombar (são o único contra-tempo "leve" do jogo).
const TRAP_BOOST=1.6;   // dano da armadilha × este valor (piso de 30)
const DOWN_DUR=1.25;    // duração da queda + levantar (s)
let downT=0, downMsg='';
function trapDamage(h){return Math.max(30,Math.round((h.dmg||18)*TRAP_BOOST));}
function knockDown(n,src,burn=false){
  if(iframes>0||state!=='playing')return;
  damage(n,src);
  if(burn)applyBurn();                     // lava deixa queimando 🔥
  if(state!=='playing'||health<=0)return;
  downT=DOWN_DUR;downMsg=src;swinging=null;dodgeT=0;jumpQueued=false;tryWhip=false;spinT=0;
  iframes=Math.max(iframes,DOWN_DUR+.15);  // tomba sem levar cascata de golpes
  // ele se joga no ÚLTIMO CHÃO SEGURO e é ROLADO lá (não fica preso no espinho)
  if(safeSpot.distanceTo(player.position)>90)player.position.copy(currentInfo.spawn);
  else player.position.copy(safeSpot);
  vy=0;pvx=0;pvz=0;
  shake=Math.max(shake,.5);
  for(let i=0;i<7;i++)spawnSpark(player.position.clone().add(new THREE.Vector3((Math.random()-.5)*.9,Math.random()*.4,(Math.random()-.5)*.9)));
  AudioSys.noise(.45,.22);AudioSys.hurt();
}
function trapHit(n,src,burn=false){
  // ARMADILHA: perde vida e volta pro ÚLTIMO CHÃO SEGURO (nunca pro início da fase)
  // (respeita iframes: sem dano = sem reposicionamento)
  if(iframes>0||state!=='playing')return;
  damage(n,src);
  if(burn)applyBurn();                     // lava deixa queimando 🔥
  if(state!=='playing'||health<=0)return;
  if(safeSpot.distanceTo(player.position)>90)player.position.copy(currentInfo.spawn);
  else player.position.copy(safeSpot);
  vy=0;pvx=0;pvz=0;swinging=null;
  showMsg(src+' ↩ Você se levantou aqui mesmo e continua.');
}

// ---------- PLAYER ----------
// ---------- ANATOMIA HUMANA (sem "bolinha") ----------
// Cápsula = cilindro com PONTEIRA esférica real: dá aunion/cotovelo/joelho
// arredondado sem virar esfera. Proporções de 7,5 cabeças (~1,80 m) com cintura,
// quadril e ombros estreitos — nada de cubo ou esfera chapada.
// Perfil torneado (LatheGeometry): tronco liso, sem nenhum relevo de músculo
function latheGeo(pts,seg=18){
  return new THREE.LatheGeometry(pts.map(p=>new THREE.Vector2(Math.max(.0008,p[0]),p[1])),seg);
}
function buildPlayer(){
  const g=new THREE.Group();
  const rig=new THREE.Group();g.add(rig); // rig balança/inclina sem mexer na física
  // 🟤 PROPORÇÃO: estatura normal (≈1,79 m sem o chapéu) e corpo de pessoa comum
  // (não "palito"): engrossado para ficar natural, sem virar ogro.
  rig.scale.set(.94,.98,.94);
  // Herói de aventura: estilizado (≈6,7 cabeças de altura) e SEM MÚSCULOS:
  // silhueta lisa, sem peitoral saliente, sem quadríceps, sem panturrilha,
  // sem trapézio e sem abdominais. Materiais foscos para não virar plástico.
  const skin=new THREE.MeshStandardMaterial({color:0xc98a5c,roughness:.9,metalness:0});
  const skinShade=new THREE.MeshStandardMaterial({color:0xb0723f,roughness:1,metalness:0});
  const jacket=MAT(0x6b4226),shirtM=MAT(0xd6c8a2),
        pantsM=MAT(0x8a7a52),hatM=MAT(0x4a3018),bootM=MAT(0x2e1f12),beltM=MAT(0x3a2412);
  const hairM=MAT(0x241610,{roughness:1});
  const M=(m,x,y,z,sx=1,sy=sx,sz=sx)=>{m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;return m;};

  // ═══ PÉLVIS: quadril de pessoa normal (sem alargamento de manequim) ═══
  const pelvis=new THREE.Mesh(latheGeo([[.005,-.11],[.195,-.11],[.255,-.05],[.274,.03],[.255,.11],[.195,.14],[.005,.14]]),pantsM);
  M(pelvis,0,.93,0,1.15,1,.92);rig.add(pelvis);
  for(const sx of [-1,1]){ // ilíaco marcado sob o tecido
    const il=new THREE.Mesh(new THREE.SphereGeometry(.082,10,8),pantsM);
    M(il,sx*.145,.965,.03,1.25,.8,.95);rig.add(il);
  }
  const glute=new THREE.Mesh(new THREE.SphereGeometry(.162,12,10),pantsM);
  M(glute,0,.90,-.095,1.4,1.05,1.15);rig.add(glute);

  // ═══ PERNAS: coxa simples → joelho → canela lisa → bota (sem músculo) ═══
  // A bota fica DENTRO do grupo do joelho: acompanha o balanço, nunca flutua.
  const legL=new THREE.Group();legL.position.set(-.155,.93,0);rig.add(legL);
  const legR=new THREE.Group();legR.position.set(.155,.93,0);rig.add(legR);
  const thighGeo=new THREE.CapsuleGeometry(.138,.235,5,16);
  const calfGeo=new THREE.CapsuleGeometry(.108,.215,5,16);
  let kneeL, kneeR, bootL, bootR;
  for(const [leg,isL] of [[legL,true],[legR,false]]){
    const thigh=new THREE.Mesh(thighGeo,pantsM);M(thigh,0,-.17,0);leg.add(thigh);
    // JOELHO: patela + platô redondos (nada de bola solta)
    const kneeJ=new THREE.Group();kneeJ.position.y=-.42;leg.add(kneeJ);
    const patela=new THREE.Mesh(new THREE.SphereGeometry(.13,12,10),pantsM);
    M(patela,0,-.005,.05,1.05,.9,1);kneeJ.add(patela);
    const condyle=new THREE.Mesh(new THREE.SphereGeometry(.118,12,10),pantsM);
    M(condyle,0,-.05,-.01,1.25,.8,1.2);kneeJ.add(condyle);
    // canela lisa, sem panturrilha saliente
    const shin=new THREE.Mesh(calfGeo,pantsM);M(shin,0,-.20,0);kneeJ.add(shin);
    const cuff=new THREE.Mesh(new THREE.CylinderGeometry(.132,.124,.11,14),pantsM);
    M(cuff,0,-.322,0);kneeJ.add(cuff);
    // BOTA de cano curto e bem cheia: cabedal + bico arredondado + solado
    const boot=new THREE.Mesh(new THREE.CylinderGeometry(.13,.148,.17,14),bootM);
    boot.name='bota';M(boot,0,-.392,0);kneeJ.add(boot);
    const instep=new THREE.Mesh(new THREE.SphereGeometry(.124,12,10),bootM);
    M(instep,0,-.44,.035,1.1,.72,1.35);kneeJ.add(instep);
    const toe=new THREE.Mesh(new THREE.SphereGeometry(.113,12,10),bootM);
    M(toe,0,-.455,.11,1.05,.8,1.4);kneeJ.add(toe);
    const sole=new THREE.Mesh(new THREE.CylinderGeometry(.138,.132,.042,14),MAT(0x1a120b));
    M(sole,0,-.478,.045,1.08,.95,1.6);kneeJ.add(sole);
    const heel=new THREE.Mesh(new THREE.CylinderGeometry(.113,.094,.058,12),bootM);
    M(heel,0,-.448,-.065);kneeJ.add(heel);
    if(isL){kneeL=kneeJ;bootL=boot;}else{kneeR=kneeJ;bootR=boot;}
  }
  // ═══ TRONCO: perfil torneado liso — quadril, cintura e peito do casaco ═══
  // PROPORÇÃO: casaco largo o suficiente para parecer pessoa normal (não palito),
  // com profundidade de peito/costas que não achata o corpo de lado.
  const torso=new THREE.Mesh(latheGeo([
    [.005,0],[.228,0],[.256,.045],[.25,.13],[.225,.235],[.223,.315],[.25,.40],
    [.298,.475],[.318,.535],[.294,.578],[.222,.605],[.126,.62],[.005,.625]]),jacket);
  torso.name='torso';M(torso,0,1.12,0,1.12,.80,.78);rig.add(torso);
  // SEM MÚSCULOS: sem peitoral, sem trapézio, sem costas volumosas e sem
  // abdominais — a forma vem só desse perfil liso do casaco
  // camisa clara do colarinho + abertura do casaco
  const shirt=new THREE.Mesh(new THREE.CylinderGeometry(.135,.155,.18,14,1,true),shirtM);
  shirt.name='shirt';M(shirt,0,1.58,.075,1.1,1,.8);shirt.material.side=THREE.DoubleSide;rig.add(shirt);
  const placket=new THREE.Mesh(boxGeo,shirtM);placket.name='placket';placket.scale.set(.066,.32,.026);placket.position.set(0,1.39,.20);rig.add(placket);
  for(let i=0;i<3;i++){const bt=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.014,10),MAT(0xc9a227,{metalness:.6,roughness:.35}));
    bt.name='botao';bt.rotation.x=Math.PI/2;M(bt,0,1.45-i*.075,.22);rig.add(bt);}
  for(const sx of [-1,1]){ // lapelas (gola do casaco aberta)
    const lap=new THREE.Mesh(boxGeo,jacket);lap.name='lapela';lap.scale.set(.105,.21,.03);
    lap.position.set(sx*.088,1.475,.215);lap.rotation.z=sx*.32;lap.rotation.x=-.14;rig.add(lap);
  }
  // cinto largo com fivela dourada + alça da sacola
  const belt=new THREE.Mesh(latheGeo([[.245,0],[.268,.022],[.268,.075],[.245,.098]],18),beltM);
  M(belt,0,.985,0,1.3,1,1);rig.add(belt);
  const buckle=new THREE.Mesh(boxGeo,MAT(0xc9a227,{metalness:.65,roughness:.32}));buckle.name='fivela';buckle.scale.set(.09,.07,.024);buckle.position.set(0,.992,.18);rig.add(buckle);
  const strap=new THREE.Mesh(boxGeo,beltM);strap.name='alca';strap.scale.set(.095,.64,.026);strap.position.set(.035,1.27,.19);strap.rotation.z=.46;rig.add(strap);
  // ═══ BRAÇOS: ombro/braço em peça única → cotovelo → antebraço → mão ═══
  // Ombros na largura certa do casaco, braço com espessura de pessoa normal.
  const armL=new THREE.Group();armL.position.set(-.315,1.475,0);rig.add(armL);
  const armR=new THREE.Group();armR.position.set(.315,1.475,0);rig.add(armR);
  const upperGeo=new THREE.CapsuleGeometry(.098,.17,5,16); // sobe até o ombro
  let elbowL, elbowR;
  for(const [arm,isL] of [[armL,true],[armR,false]]){
    const upper=new THREE.Mesh(upperGeo,jacket);M(upper,0,-.075,0,1,1,1);arm.add(upper); // ombro liso, sem deltoide
    const elb=new THREE.Group();elb.position.y=-.245;arm.add(elb);
    const ole=new THREE.Mesh(new THREE.SphereGeometry(.096,12,10),isL?jacket:skinShade);
    M(ole,0,.005,0);elb.add(ole);
    const fore=new THREE.Mesh(new THREE.CapsuleGeometry(.078,.13,5,14),isL?jacket:skin);
    M(fore,0,-.105,0,1,1,1);elb.add(fore);
    const wrist=new THREE.Mesh(new THREE.CylinderGeometry(.068,.062,.036,12),skinShade);
    M(wrist,0,-.20,0);elb.add(wrist);
    // MÃO de aventureiro (palorama + polegar + 4 dedos)
    const palm=new THREE.Mesh(new THREE.SphereGeometry(.072,14,10),skin);
    palm.name='mao';M(palm,0,-.252,.004,.95,1.05,.68);elb.add(palm);
    const knuck=new THREE.Mesh(new THREE.SphereGeometry(.06,12,10),skin);
    M(knuck,0,-.302,.004,1.5,.85,.8);elb.add(knuck);
    const thumb=new THREE.Mesh(new THREE.CapsuleGeometry(.025,.046,4,10),skin);
    M(thumb,.058,-.24,.02,.95,1,1);thumb.rotation.z=-.75;thumb.rotation.x=-.35;elb.add(thumb);
    for(let i=0;i<4;i++){
      const f=new THREE.Mesh(new THREE.CapsuleGeometry(.022,.042,4,10),skin);
      M(f,-.038+i*.026,-.312,.006,.95,1,1);f.rotation.x=-.35;elb.add(f);
    }
    if(isL)elbowL=elb;else elbowR=elb;
  }
  // ═══ PESCOÇO liso e fino (cabeça reduzida: pescoço grosso = "tartaruga") ═══
  const neck=new THREE.Mesh(latheGeo([[.005,-.02],[.077,-.02],[.083,.03],[.071,.09],[.08,.135],[.005,.15]],14),skinShade);
  M(neck,0,1.565,.008,1,.94,1);rig.add(neck);
  // ═══ CABEÇA: grupo próprio com escala reduzida (≈6,7 cabeças de altura) ═══
  // O grupo encolhe ROSTO e chapéu juntos com o pivô no encontro do queixo com
  // o pescoço — assim o pescoço não encolhe e a cabeça não descola do corpo.
  const HEAD_S=.70, HEAD_PIVOT=1.65;
  const headG=new THREE.Group();
  headG.position.y=HEAD_PIVOT*(1-HEAD_S);headG.scale.setScalar(HEAD_S);rig.add(headG);
  const headStart=rig.children.length;  // daqui em diante só entra peça da cabeça
  const head=new THREE.Mesh(new THREE.SphereGeometry(.172,24,18),skin);
  // crânio recuado p/ trás: o rosto (olhos, nariz, boca, barba) fica NA FRENTE
  // da bola de pele — sem isso tudo ficava enterrado dentro dela e o herói
  // aparecia com a cara lisa de bola de sinuca.
  head.name='cabeca';head.position.set(0,1.78,-.04);head.scale.set(.98,1.08,1.02);head.castShadow=true;rig.add(head);
  const cranium=new THREE.Mesh(new THREE.SphereGeometry(.158,20,16),skin);
  M(cranium,0,1.822,-.06,1,.94,1.03);rig.add(cranium);
  const nape=new THREE.Mesh(new THREE.SphereGeometry(.09,14,12),skin);
  M(nape,0,1.742,-.092,.95,.85,.8);rig.add(nape);
  // maxilar arredondado + queixo cheio
  const jaw=new THREE.Mesh(new THREE.SphereGeometry(.118,16,12),skin);
  M(jaw,0,1.676,.012,1.18,.92,.98);rig.add(jaw);
  const chin=new THREE.Mesh(new THREE.SphereGeometry(.081,14,10),skin);
  M(chin,0,1.653,.038,1.22,.92,1.05);rig.add(chin);
  const cheek=new THREE.Mesh(new THREE.SphereGeometry(.062,12,10),skin);
  M(cheek,0,1.722,.076,1.5,.9,.75);rig.add(cheek);
  for(const sx of [-1,1]){
    const ck=new THREE.Mesh(new THREE.SphereGeometry(.055,12,10),skin);   // maçã do rosto cheia
    M(ck,sx*.088,1.742,.058,1.1,1,.85);rig.add(ck);
    const temple=new THREE.Mesh(new THREE.SphereGeometry(.052,12,10),skin);
    M(temple,sx*.113,1.802,.05,1,.95,.8);rig.add(temple);
  }
  // testa larga com arcada de sobrancelha
  const browRidge=new THREE.Mesh(new THREE.SphereGeometry(.078,16,12),skin);
  M(browRidge,0,1.786,.082,2.05,.42,.6);rig.add(browRidge);
  // nariz grande e arredondado (bem desenhado, sem bico)
  const nasion=new THREE.Mesh(new THREE.SphereGeometry(.032,12,10),skin);
  M(nasion,0,1.782,.108,.85,.9,.85);rig.add(nasion);
  const noseBridge=new THREE.Mesh(new THREE.CylinderGeometry(.026,.036,.062,10),skin);
  M(noseBridge,0,1.748,.116,.95,1,.9);noseBridge.rotation.x=-.12;rig.add(noseBridge);
  const noseTip=new THREE.Mesh(new THREE.SphereGeometry(.038,14,11),skin);
  M(noseTip,0,1.722,.128,1.5,.9,1.05);rig.add(noseTip);
  for(const sx of [-1,1]){const nr=new THREE.Mesh(new THREE.SphereGeometry(.018,10,8),skinShade);
    M(nr,sx*.028,1.706,.122,1,.85,1);rig.add(nr);}
  // olhos grandes e expressivos (olhar de herói)
  for(const sx of [-1,1]){
    const socket=new THREE.Mesh(new THREE.SphereGeometry(.05,14,10),skinShade);
    M(socket,sx*.068,1.786,.08,1.15,.9,.65);rig.add(socket);
    const ball=new THREE.Mesh(new THREE.SphereGeometry(.037,14,12),MAT(0xf8f4e6));
    M(ball,sx*.068,1.787,.096);rig.add(ball);
    const iris=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.008,14),MAT(0x3a2a18,{roughness:.35}));
    iris.rotation.x=Math.PI/2;M(iris,sx*.068,1.787,.122);rig.add(iris);
    const pup=new THREE.Mesh(new THREE.SphereGeometry(.009,8,6),new THREE.MeshBasicMaterial({color:0x08080a}));
    M(pup,sx*.068,1.787,.129);rig.add(pup);
    const lid=new THREE.Mesh(new THREE.SphereGeometry(.044,14,10),skin);
    M(lid,sx*.068,1.806,.1,1.2,.55,.95);rig.add(lid);
    const brow=new THREE.Mesh(new THREE.BoxGeometry(.082,.02,.026),hairM);
    M(brow,sx*.07,1.824,.106);brow.rotation.z=sx*-.19;rig.add(brow);
  }
  // boca: lábio cheio + boca entreaberta
  const lipU=new THREE.Mesh(new THREE.CylinderGeometry(.034,.04,.02,12,1),MAT(0x9a5140,{roughness:.7}));
  lipU.rotation.z=Math.PI/2;lipU.rotation.x=.4;M(lipU,0,1.678,.106,1,1,1);rig.add(lipU);
  const lipL=new THREE.Mesh(new THREE.SphereGeometry(.034,14,10),MAT(0xa85c49,{roughness:.7}));
  M(lipL,0,1.662,.102,1.5,.6,.75);rig.add(lipL);
  const mouthLine=new THREE.Mesh(new THREE.BoxGeometry(.07,.008,.014),MAT(0x5c2b22));
  M(mouthLine,0,1.671,.114);rig.add(mouthLine);
  // barba cheia de aventureiro (bochecha + mento + bigode)
  const beard=new THREE.Mesh(new THREE.SphereGeometry(.112,16,12),MAT(0x6b4a2b,{roughness:1}));
  M(beard,0,1.642,.028,1.22,.88,.95);rig.add(beard);
  const goatee=new THREE.Mesh(new THREE.SphereGeometry(.052,12,10),MAT(0x5f4227));
  M(goatee,0,1.64,.086,1.1,1.15,.7);rig.add(goatee);
  const stache=new THREE.Mesh(new THREE.BoxGeometry(.082,.018,.026),MAT(0x5f4227));
  M(stache,0,1.692,.115);rig.add(stache);
  // orelhas: FORA da bola do crânio (raio .169), senão ficavam dentro dela
  for(const sx of [-1,1]){
    const ear=new THREE.Mesh(new THREE.SphereGeometry(.056,14,10),skin);
    M(ear,sx*.172,1.762,-.004,.4,1.05,.8);rig.add(ear);
    const helix=new THREE.Mesh(new THREE.TorusGeometry(.034,.01,8,14),skinShade);
    M(helix,sx*.178,1.764,-.004,.5,1.25,.9);helix.rotation.y=Math.PI/2;rig.add(helix);
    const lobe=new THREE.Mesh(new THREE.SphereGeometry(.022,10,8),skin);
    M(lobe,sx*.172,1.718,-.004,.7,.9,.8);rig.add(lobe);
  }
  // cabelo aparecendo na nuca/lateral
  const hair=new THREE.Mesh(new THREE.SphereGeometry(.155,18,14),hairM);
  M(hair,0,1.812,-.028,.99,.9,.88);rig.add(hair);
  // ═══ FEDORA: aba na largura certa (≈1,8× a cabeça, não 3,4× = sombrero) ═══
  const hatG=new THREE.Group();hatG.position.set(0,1.945,0);hatG.rotation.x=-.08;hatG.rotation.z=.035;rig.add(hatG);
  const brimGeo=new THREE.LatheGeometry([[.175,0],[.22,-.022],[.27,-.034],[.30,-.026],[.30,.014],[.22,.03],[.175,.036]].map(p=>new THREE.Vector2(p[0],p[1])),32);
  const brim=new THREE.Mesh(brimGeo,hatM);brim.name='fedora';brim.castShadow=true;hatG.add(brim);
  const brimEdge=new THREE.Mesh(new THREE.TorusGeometry(.292,.016,6,36),MAT(0x2e1c0e));brimEdge.rotation.x=Math.PI/2;brimEdge.position.y=-.02;hatG.add(brimEdge);
  // copa com vinco ( pinched crown) — silhueta de chapéu, não de cilindro
  const crown=new THREE.Mesh(latheGeo([
    [.178,0],[.184,.05],[.182,.12],[.172,.20],[.145,.265],[.100,.315],[.036,.338],[.005,.342]],26),hatM);
  crown.name='copa';hatG.add(crown);
  const dent=new THREE.Mesh(new THREE.SphereGeometry(.06,12,10),MAT(0x3a2412));
  dent.scale.set(.55,1.5,2.6);M(dent,0,.235,-.014);hatG.add(dent);
  const band=new THREE.Mesh(latheGeo([[.183,.034],[.188,.062],[.183,.092]],22),MAT(0x1a1210));hatG.add(band);
  const buckleH=new THREE.Mesh(boxGeo,MAT(0xc9a227,{metalness:.7,roughness:.3}));buckleH.scale.set(.058,.04,.016);buckleH.position.set(0,.062,.186);hatG.add(buckleH);
  // move tudo que foi adicionado até aqui (rosto + chapéu) para o grupo da cabeça
  for(const o of rig.children.slice(headStart))headG.add(o);
  // ═══ ACESSÓRIOS: bolsos, cinto, coldre, bolsa, rolo de corda ═══
  for(const sx of [-1,1]){
    const pocket=new THREE.Mesh(new THREE.CapsuleGeometry(.062,.07,4,12),MAT(0x5a3620));
    pocket.name='bolso';M(pocket,sx*.215,1.155,.18,.95,1.05,.42);rig.add(pocket);
    const flap=new THREE.Mesh(new THREE.CapsuleGeometry(.062,.018,4,12),MAT(0x4a2c18));
    flap.name='bolso';M(flap,sx*.215,1.228,.18,1.05,.5,.5);rig.add(flap);
    const seam=new THREE.Mesh(boxGeo,MAT(0x3a2010));seam.scale.set(.125,.01,.008);seam.position.set(sx*.205,1.09,.20);rig.add(seam);
  }
  // BOLSA lateral (tiracolo, bem visível no quadril!): couro + tampa + fivela + alça de mão
  const bagG=new THREE.Group();bagG.position.set(-.42,.93,.01);rig.add(bagG);
  const bag=new THREE.Mesh(new THREE.BoxGeometry(.23,.29,.19),beltM);bag.name='bolsa';bag.castShadow=true;bagG.add(bag);
  const bagFlap=new THREE.Mesh(new THREE.BoxGeometry(.245,.08,.205),MAT(0x2e1c0e));M(bagFlap,0,.155,0);bagG.add(bagFlap);
  const bagBtn=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.014,12),MAT(0xc9a227,{metalness:.7,roughness:.3}));
  bagBtn.rotation.x=Math.PI/2;M(bagBtn,0,.075,.09);bagG.add(bagBtn);
  const bagPocket=new THREE.Mesh(new THREE.BoxGeometry(.15,.125,.024),MAT(0x5a3a1e));M(bagPocket,0,-.04,.09);bagG.add(bagPocket);
  const bagStrap=new THREE.Mesh(new THREE.TorusGeometry(.12,.017,8,16,Math.PI),beltM);
  M(bagStrap,.02,.175,-.02,1,1,.7);bagStrap.rotation.y=Math.PI/2;bagStrap.rotation.z=.2;bagG.add(bagStrap);
  // coldre + coronha do chicote
  const holster=new THREE.Mesh(new THREE.CylinderGeometry(.07,.076,.22,12),MAT(0x241812));
  M(holster,.27,.845,-.04,.9,1,.8);holster.rotation.z=-.14;rig.add(holster);
  const butt=new THREE.Mesh(new THREE.CylinderGeometry(.038,.048,.15,10),MAT(0x3a2010));
  M(butt,.23,.985,-.035,.8,1,.8);butt.rotation.z=-.34;rig.add(butt);
  // rolo de corda no quadril
  const coil=new THREE.Mesh(new THREE.TorusGeometry(.105,.036,9,20),MAT(0x3a2512));
  coil.rotation.y=Math.PI/2;M(coil,-.32,.875,0);rig.add(coil);
  const coil2=new THREE.Mesh(new THREE.TorusGeometry(.08,.029,8,18),MAT(0x5a3a1e));
  coil2.rotation.y=Math.PI/2;coil2.rotation.x=.3;M(coil2,-.32,.875,0);rig.add(coil2);
  rig.traverse(o=>{if(o.isMesh){o.castShadow=true;}});
  // LAÇO / CHICOTE remodelado: cabo de madeira + punho trançado + 10 elos afunilados bicolores + ponta metálica brilhante
  // (segurado na MÃO direita, na altura do punho humano)
  const gripG=new THREE.Group();gripG.position.set(.32,1.055,.04);gripG.rotation.x=.25;gripG.rotation.z=-.16;rig.add(gripG);
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
    // 🗿 SENTINELA DO TEMPO — sentinela-relógio colossal (~5,2 m), TODA ARTICULADA:
    // pernas com joelho, dois braços longos com MÃOS de punho, peito de mostrador
    // com ponteiros que giram no ritmo do tempo, pêndulo interno e rachaduras de lava.
    hp=900;speed=2.4;dmg=30;atkR=4.2;range=70;hitR=4.2;bodyH=5.2;name='golem';
    const stone=MAT(0x5f5f6b,{roughness:.92,metalness:.06});
    const stoneD=MAT(0x43434f,{roughness:.95,metalness:.05});
    const bronze=MAT(0xa87c33,{metalness:.92,roughness:.32});
    const bronzeD=MAT(0x6d4d1d,{metalness:.85,roughness:.45});
    const glowLava=new THREE.MeshBasicMaterial({color:0xff5a00});
    const glowRed=new THREE.MeshBasicMaterial({color:0xff1800});

    // ---------- PERNAS: quadril -> coxa -> joelho -> canela -> pé (marcha pesada) ----------
    const legL=new THREE.Group();legL.position.set(-.52,2.05,0);g.add(legL);
    const legR=new THREE.Group();legR.position.set(.52,2.05,0);g.add(legR);
    for(const leg of [legL,legR]){
      const thigh=new THREE.Mesh(new THREE.CylinderGeometry(.30,.38,1.15,9),stone);
      thigh.position.y=-.58;leg.add(thigh);
      const knee=new THREE.Mesh(new THREE.SphereGeometry(.27,10,8),stoneD);
      knee.position.y=-1.15;knee.scale.set(1,.82,1);leg.add(knee);
      const shin=new THREE.Mesh(new THREE.CylinderGeometry(.24,.30,1.05,9),stone);
      shin.position.y=-1.72;leg.add(shin);
      // grelha de bronze na canela
      const grelha=new THREE.Mesh(new THREE.CylinderGeometry(.27,.30,.2,9),bronzeD);
      grelha.position.y=-1.5;leg.add(grelha);
      const foot=new THREE.Mesh(boxGeo,stoneD);foot.scale.set(.72,.34,1.16);foot.position.set(0,-2.4,.16);leg.add(foot);
      for(let i=-1;i<=1;i++){const toe=new THREE.Mesh(boxGeo,bronzeD);toe.scale.set(.2,.2,.3);toe.position.set(i*.24,-2.46,.66);leg.add(toe);}
      leg.traverse(o=>{if(o.isMesh)o.castShadow=true;});
    }
    // ---------- QUADRIL + saia de placas ----------
    const hips=new THREE.Mesh(new THREE.CylinderGeometry(.62,.74,.55,10),stoneD);
    hips.position.y=2.28;hips.scale.z=.82;g.add(hips);
    const belt=new THREE.Mesh(new THREE.CylinderGeometry(.68,.68,.16,12),bronze);
    belt.position.y=2.56;belt.scale.z=.85;g.add(belt);
    for(let i=0;i<7;i++){ // saia de placas de pedra
      const a=(i/7)*Math.PI*2;
      const pl=new THREE.Mesh(boxGeo,stoneD);
      pl.scale.set(.46,.85,.16);
      pl.position.set(Math.sin(a)*.66,1.86,Math.cos(a)*.56);
      pl.rotation.y=a;g.add(pl);
    }
    // ---------- TORAX: caixa peitoral larga, afunila p/ a cintura ----------
    const chest=new THREE.Mesh(new THREE.CylinderGeometry(1.02,.66,1.62,12),stone);
    chest.position.y=3.44;chest.scale.z=.68;chest.castShadow=true;g.add(chest);
    // placa peitoral de bronze com o MOSTRADOR do Relógio de Arquimedes
    const faceRing=new THREE.Mesh(new THREE.CylinderGeometry(.56,.56,.12,20),bronze);
    faceRing.rotation.x=Math.PI/2;faceRing.position.set(0,3.56,.62);g.add(faceRing);
    const faceDisc=new THREE.Mesh(new THREE.CylinderGeometry(.46,.46,.14,20),MAT(0xf0e6cc,{roughness:.5}));
    faceDisc.rotation.x=Math.PI/2;faceDisc.position.set(0,3.56,.63);g.add(faceDisc);
    for(let i=0;i<12;i++){ // marcas de hora em bronze
      const a=(i/12)*Math.PI*2;
      const tick=new THREE.Mesh(boxGeo,bronzeD);tick.scale.set(.05,.05,.06);
      tick.position.set(Math.sin(a)*.39,3.56+Math.cos(a)*.39,.70);g.add(tick);
    }
    // ponteiros do mostrador (giram = o "tempo" do boss)
    const handH=new THREE.Mesh(boxGeo,stoneD);handH.scale.set(.045,.28,.04);handH.position.set(0,3.70,.71);g.add(handH);
    const handM=new THREE.Mesh(boxGeo,bronzeD);handM.scale.set(.035,.4,.04);handM.position.set(0,3.66,.73);g.add(handM);
    const hourH=new THREE.Group();hourH.position.set(0,3.56,.73);g.add(hourH);
    const hourHand=new THREE.Mesh(boxGeo,stoneD);hourHand.scale.set(.04,.2,.04);hourHand.position.y=.1;hourH.add(hourHand);
    // núcleo de lava pulsante no ventre + rachaduras
    const core=new THREE.Mesh(new THREE.OctahedronGeometry(.34,1),glowLava);
    core.position.set(0,2.94,.60);g.add(core);
    for(let i=0;i<7;i++){ // rachaduras incandescentes na pedra
      const a=(i/7)*Math.PI*2;
      const crk=new THREE.Mesh(boxGeo,new THREE.MeshBasicMaterial({color:0xff7a20}));
      crk.scale.set(.05,.5+Math.random()*.5,.05);
      crk.position.set(Math.sin(a)*.62,2.6+Math.random()*.9,Math.cos(a)*.5);
      crk.rotation.z=(Math.random()-.5)*.5;g.add(crk);
    }
    // pêndulo interno (balança com o andar)
    const pend=new THREE.Group();pend.position.set(0,3.9,.42);g.add(pend);
    const rod=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.85,6),bronzeD);
    rod.position.y=-.42;pend.add(rod);
    const bob=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),bronze);
    bob.position.y=-.88;pend.add(bob);
    // ---------- OMBROS + BRAÇOS LONGOS com MÃOS ----------
    const armL=new THREE.Group();armL.position.set(-1.02,4.06,0);g.add(armL);
    const armR=new THREE.Group();armR.position.set(1.02,4.06,0);g.add(armR);
    const hands=[];
    for(const arm of [armL,armR]){
      const pad=new THREE.Mesh(new THREE.DodecahedronGeometry(.5,0),stone);
      arm.add(pad);
      const trim=new THREE.Mesh(new THREE.TorusGeometry(.44,.09,7,14),bronze);
      trim.rotation.x=Math.PI/2;arm.add(trim);
      const upper=new THREE.Mesh(new THREE.CylinderGeometry(.24,.3,1.25,9),stone);
      upper.position.y=-.66;arm.add(upper);
      const elbow=new THREE.Mesh(new THREE.SphereGeometry(.25,10,8),stoneD);
      elbow.position.y=-1.28;arm.add(elbow);
      const fore=new THREE.Mesh(new THREE.CylinderGeometry(.22,.27,1.2,9),stone);
      fore.position.y=-1.92;arm.add(fore);
      for(let i=0;i<3;i++){ // anéis de bronze no antebraço
        const ring=new THREE.Mesh(new THREE.TorusGeometry(.26,.05,6,12),bronzeD);
        ring.rotation.x=Math.PI/2;ring.position.y=-1.55-i*.22;arm.add(ring);
      }
      // MÃO: punho de pedra com 4 dedos grossos + polegar (fecha p/ esmagar)
      const hand=new THREE.Group();hand.position.y=-2.6;arm.add(hand);
      const palm=new THREE.Mesh(new THREE.BoxGeometry(.52,.5,.56),stoneD);
      hand.add(palm);
      const fingers=[];
      for(let i=0;i<4;i++){
        const fg=new THREE.Group();fg.position.set(-.21+i*.14,-.28,.28);hand.add(fg);
        const f1=new THREE.Mesh(new THREE.CylinderGeometry(.075,.085,.36,6),stone);f1.position.y=-.18;fg.add(f1);
        const f2=new THREE.Group();f2.position.y=-.36;fg.add(f2);
        const f2m=new THREE.Mesh(new THREE.CylinderGeometry(.07,.08,.3,6),stone);f2m.position.y=-.15;f2.add(f2m);
        const claw=new THREE.Mesh(new THREE.ConeGeometry(.08,.2,6),bronzeD);claw.position.y=-.36;claw.rotation.x=Math.PI;f2.add(claw);
        fingers.push({fg,f2});
      }
      const thumb=new THREE.Mesh(new THREE.CylinderGeometry(.08,.09,.32,6),stone);
      thumb.position.set(.3,-.16,.1);thumb.rotation.z=-.7;hand.add(thumb);
      hands.push({hand,fingers});
      arm.traverse(o=>{if(o.isMesh)o.castShadow=true;});
    }
    // ---------- CABEÇA: elmo de pedra com coroa de agulhas e olhos de brasa ----------
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(.3,.36,.24,10),stoneD);
    neck.position.y=4.3;g.add(neck);
    const hd=new THREE.Mesh(new THREE.SphereGeometry(.52,14,12),stone);
    hd.position.y=4.82;hd.scale.set(.94,1.08,.96);hd.castShadow=true;g.add(hd);
    const brow=new THREE.Mesh(boxGeo,stoneD);brow.scale.set(.94,.22,.3);brow.position.set(0,4.98,.42);g.add(brow);
    const jaw=new THREE.Mesh(boxGeo,stone);jaw.scale.set(.66,.3,.42);jaw.position.set(0,4.5,.4);g.add(jaw);
    // mandíbula de bronze com dentes
    for(let i=-2;i<=2;i++){
      const tooth=new THREE.Mesh(boxGeo,bronzeD);tooth.scale.set(.09,.16,.1);
      tooth.position.set(i*.13,4.44,.58);g.add(tooth);
    }
    const eyes=[];
    for(const sx of [-1,1]){
      const socket=new THREE.Mesh(new THREE.SphereGeometry(.15,9,7),stoneD);
      socket.position.set(sx*.2,4.86,.44);g.add(socket);
      const e=new THREE.Mesh(new THREE.SphereGeometry(.1,9,7),glowRed);
      e.position.set(sx*.2,4.86,.52);g.add(e);eyes.push(e.material);
    }
    // coroa de agulhas de pedra + rotação
    const crown=new THREE.Group();crown.position.y=5.18;g.add(crown);
    for(let i=0;i<7;i++){
      const a=(i/7)*Math.PI*2;
      const sp=new THREE.Mesh(new THREE.ConeGeometry(.12,.62,6),i%2?bronzeD:stoneD);
      sp.position.set(Math.sin(a)*.36,.22,Math.cos(a)*.36);
      sp.rotation.set(Math.cos(a)*-.34,0,Math.sin(a)*.34);
      crown.add(sp);
    }
    const crownGem=new THREE.Mesh(new THREE.OctahedronGeometry(.17),glowLava);
    crownGem.position.y=.55;crown.add(crownGem);
    // luz própria do núcleo (o boss ilumina o salão)
    const coreLight=POINT(0xff7a2a,26,26,1.7,0,3.4,1.1,5);
    g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
    g.userData.sentinel={armL,armR,hands,legs:[legL,legR],core,coreLight,crown,crownGem,
      pend,hourH,handH,handM,eyes,head:hd,brow,faceDisc,faceRing,chest,hips,walkP:Math.random()*6};
    g.userData.arms=[armL,armR];g.userData.core=core;
    bossName.textContent='🗿 SENTINELA DO TEMPO';
  }
  g.position.set(x,y,z);g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  scene.add(g);
  // limites do salão (onde a sentinela pode andar): o boss NÃO atravessa parede nenhuma.
  // A fase 3 define os limites REAIS (que coincidem com a pedra); o valor abaixo
  // é só um fallback para caso o chefe apareça fora de uma arena montada.
  if(type==='golem'&&!arena3){arena3={minX:-19,minZ:-19,maxX:19,maxZ:19,roof:6.2};}
  // 😐/🔴 DIFICULDADE: inimigos mais rápidos/danosos e chefe mais resistente
  hp=Math.round(hp*(type==='golem'?DIFF.bossHp:1));
  speed*=DIFF.spd; dmg*=DIFF.dmg;
  const e={type,mesh:g,hp,max:hp,speed,range,dmg,atkR,hitR,bodyH,cd:0,dead:false,t:Math.random()*5,baseY:y,fly:type==='bat',
    atk:0,atkT:0,struck:false,thrown:false,throwCd:0,strafeDir:Math.random()<.5?1:-1,vel:null,walkP:0,
    stun:0,stunCd:0,wall:0,slamCd:3.5,whirl:0};
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
    // 🏆 O CÁLICE DA ÂNCORA — o prêmio final da Sentinela.
    // Torneado de verdade (LatheGeometry): um único perfil de revolución gera
    // pé, haste, nó, colo, taça e lábio com curvas contínuas (nada de cubo).
    const gold=new THREE.MeshStandardMaterial({color:0xffd24a,metalness:.95,roughness:.17,
      emissive:0x3a2200,emissiveIntensity:.8});
    const goldDark=MAT(0xc08a1e,{metalness:.9,roughness:.28,emissive:0x2a1600});
    const jewel=new THREE.MeshBasicMaterial({color:0x7adfff});
    const wine=new THREE.MeshStandardMaterial({color:0xff8a1e,emissive:0xff5a00,
      emissiveIntensity:1.5,roughness:.3,metalness:.2,transparent:true,opacity:.92});
    const prof=[
      [.001,0],[.42,0],[.46,.05],[.44,.10],[.30,.15],[.17,.19],[.115,.26],   // pé → haste
      [.095,.40],[.135,.47],[.105,.53],[.17,.60],[.30,.72],[.42,.86],        // nó → colo
      [.52,1.02],[.57,1.18],[.575,1.30],[.535,1.345],                          // taça/lábio
      [.505,1.29],[.495,1.17],[.45,1.04],[.36,.94],[.001,.90]];                // parede interna
    const cup=new THREE.Mesh(latheGeo(prof,40),gold);
    cup.position.y=-.02;cup.castShadow=true;g.add(cup);
    // aro reforçado no lábio + anel gravado na haste
    const lip=new THREE.Mesh(new THREE.TorusGeometry(.556,.028,10,44),goldDark);
    lip.rotation.x=Math.PI/2;lip.position.y=1.565;g.add(lip);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.132,.02,8,28),goldDark);
    ring.rotation.x=Math.PI/2;ring.position.y=.70;g.add(ring);
    const ring2=new THREE.Mesh(new THREE.TorusGeometry(.30,.018,8,30),goldDark);
    ring2.rotation.x=Math.PI/2;ring2.position.y=.36;g.add(ring2);
    // gema engastada no nó + lapidação na taça
    const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.075,0),jewel);
    gem.position.set(0,.50,.115);g.add(gem);
    for(let i=0;i<6;i++){
      const a=(i/6)*Math.PI*2;
      const j=new THREE.Mesh(new THREE.OctahedronGeometry(.038,0),jewel);
      j.position.set(Math.sin(a)*.44,1.10,Math.cos(a)*.40);g.add(j);
    }
    // o "vinho do tempo" brilhando dentro da taça
    const liquid=new THREE.Mesh(new THREE.CylinderGeometry(.42,.30,.02,28),wine);
    liquid.position.y=1.30;g.add(liquid);
    const haloLiq=new THREE.Mesh(new THREE.TorusGeometry(.40,.022,8,30),
      new THREE.MeshBasicMaterial({color:0xffd76a,transparent:true,opacity:.55}));
    haloLiq.rotation.x=Math.PI/2;haloLiq.position.y=1.315;g.add(haloLiq);
    // feixe de luz subindo do cálice
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.5,.85,3.4,14,1,true),
      new THREE.MeshBasicMaterial({color:0xffd76a,transparent:true,opacity:.14,side:THREE.DoubleSide}));
    beam.position.y=1.7;g.add(beam);
    const beam2=new THREE.Mesh(new THREE.CylinderGeometry(.22,.4,2.2,12,1,true),
      new THREE.MeshBasicMaterial({color:0xfff4c0,transparent:true,opacity:.16,side:THREE.DoubleSide}));
    beam2.position.y=1.3;g.add(beam2);
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
  const haloS=big?1.7:(hide>=2?.7:(hide>=1?.85:1));
  const halo=new THREE.Mesh(new THREE.TorusGeometry(.55*haloS,.04,8,20),new THREE.MeshBasicMaterial({color:0xffe27a,transparent:true,opacity:haloOp}));halo.rotation.x=Math.PI/2.3;g.add(halo);
  g.position.set(x,y,z);scene.add(g);
  // camuflagem física ao redor (não bloqueia a coleta: fica a 1.2m de distância)
  if(!big&&hide>=1){
    addBush(x+1.3,0,z+.6,.8);addRock(x-1.2,0,z-.7,.55);
    if(hide>=2){addBush(x-.9,0,z+1.1,.9);addRock(x+1.1,0,z-1,.7);}
  }
  pickups.push({mesh:g,big,halo,t:Math.random()*5,baseY:y,taken:false,hide});
}
let LIFE_DROP_CHANCE=0.5; // % de chance do inimigo deixar um kit (muda com a dificuldade)
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
  pickups.push({mesh:g,heart:true,t:0,baseY:y,taken:false,halo});
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
  pickups.push({mesh:g,skill:true,t:0,baseY:y,taken:false,halo});
}
function addLever(x,y,z,id){
  const g=new THREE.Group();
  const base=new THREE.Mesh(boxGeo,MAT(0x555555));base.scale.set(.6,.3,.6);base.position.y=.15;g.add(base);
  const stick=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,1,6),MAT(0x8a2a2a));stick.position.y=.8;g.add(stick);
  const knob=new THREE.Mesh(new THREE.SphereGeometry(.14,8,8),MAT(0xffd76a,{emissive:0x553300}));knob.position.y=1.3;g.add(knob);
  g.position.set(x,y,z);g.traverse(o=>{if(o.isMesh)o.castShadow=true;});scene.add(g);
  levers.push({mesh:g,stick,on:false,id,pos:new THREE.Vector3(x,y,z),hint:'puxar a alavanca'});
  addBox(x,y-.1,z,1,.2,1,0x333333,{cast:false});
}
// ══════════════════════════════════════════════════════════════════════════
//  📖 ALTAR + LIVRO ANCESTRAL → QUIZ → PORTA DE PEDRA
//  No fim de TODAS as fases, assim que você tem os requisitos para abrir a
//  porta, um ALTAR DE PEDRA emerge do chão com um livro ancestral. Aproxime-se
//  e aperte E: o livro sortea NO MÁXIMO 2 PERGUNTAS ALEATÓRIAS de MATEMÁTICA,
//  PORTUGUÊS, CIÊNCIAS ou HISTÓRIA — nível até o 5º ano. Acertando, a porta
//  abre; errando, o livro morde (um toque de vida) e pergunta de novo.
// ══════════════════════════════════════════════════════════════════════════
const QUIZ_PER=2;                 // ⟵ NO MÁXIMO 2 perguntas por rodada
const QUIZ_PASS=1;                // acertos necessários para o livro abrir
const QUIZ_CATS=['MATEMÁTICA','PORTUGUÊS','CIÊNCIAS','HISTÓRIA'];
const QUIZ_HIT=8;                 // vida perdida por resposta errada
const QUIZ_BANK=[
  // ─────────── MATEMÁTICA ───────────
  {c:'MATEMÁTICA',q:'Quanto é 7 + 5?',a:['10','11','12','13'],k:1,e:'7 + 5 dá 12.'},
  {c:'MATEMÁTICA',q:'Quanto é 9 − 4?',a:['3','4','5','6'],k:2,e:'9 menos 4 dá 5.'},
  {c:'MATEMÁTICA',q:'Quanto é 6 × 7?',a:['36','42','48','56'],k:1,e:'A tabuada do 7: 6×7=42.'},
  {c:'MATEMÁTICA',q:'Quanto é 20 ÷ 4?',a:['4','5','6','10'],k:1,e:'20 dividido por 4 dá 5.'},
  {c:'MATEMÁTICA',q:'Qual número vem logo depois de 299?',a:['300','301','310','290'],k:0,e:'299 → 300.'},
  {c:'MATEMÁTICA',q:'Qual destes números é PAR?',a:['7','9','12','15'],k:2,e:'12 é par: termina em 2 e dá para dividir por 2.'},
  {c:'MATEMÁTICA',q:'Uma dúzia tem quantas unidades?',a:['10','12','14','20'],k:1,e:'Uma dúzia = 12.'},
  {c:'MATEMÁTICA',q:'Ana tinha 8 lápis e ganhou 5. Quantos ela tem?',a:['3','12','13','15'],k:2,e:'8 + 5 = 13.'},
  {c:'MATEMÁTICA',q:'Em 1 hora, quantos minutos existem?',a:['24','30','60','100'],k:2,e:'1 hora = 60 minutos.'},
  {c:'MATEMÁTICA',q:'Qual destas frações é MAIOR?',a:['1/4','1/2','São iguais','Não dá para saber'],k:1,e:'1/2 é a metade: vale mais que 1/4.'},
  {c:'MATEMÁTICA',q:'10 + 5 + 2 = ?',a:['15','16','17','18'],k:2,e:'10 + 5 = 15, e 15 + 2 = 17.'},
  {c:'MATEMÁTICA',q:'Quanto é 5 × 4 − 8?',a:['12','14','16','20'],k:0,e:'5×4 = 20, e 20 − 8 = 12.'},
  {c:'MATEMÁTICA',q:'Um carro faz 60 km em 1 hora. Em 2 horas ele faz:',a:['120 km','62 km','30 km','200 km'],k:0,e:'60 × 2 = 120 km.'},
  {c:'MATEMÁTICA',q:'Qual destas medidas é de PESO?',a:['1 kg','1 litro','1 metro','1 segundo'],k:0,e:'Quilo (kg) mede peso.'},
  {c:'MATEMÁTICA',q:'De 20 balas, João comeu 7. Quantas sobraram?',a:['11','12','13','27'],k:2,e:'20 − 7 = 13.'},
  // ─────────── HISTÓRIA ───────────
  {c:'HISTÓRIA',q:'Quem chegou ao Brasil em 1500?',a:['Pedro Álvares Cabral','Dom Pedro II','Cristóvão Colombo','Vasco da Gama'],k:0,e:'Foi Pedro Álvares Cabral.'},
  {c:'HISTÓRIA',q:'Em que ano o Brasil ficou independente?',a:['1500','1822','1889','1960'],k:1,e:'A Independência foi em 7 de setembro de 1822.'},
  {c:'HISTÓRIA',q:'Qual é a capital do Brasil?',a:['Rio de Janeiro','São Paulo','Brasília','Salvador'],k:2,e:'Brasília foi inaugurada em 1960.'},
  {c:'HISTÓRIA',q:'Quem foi o primeiro presidente do Brasil?',a:['Getúlio Vargas','Deodoro da Fonseca','Juscelino Kubitschek','Pedro II'],k:1,e:'Deodoro da Fonseca, em 1889.'},
  {c:'HISTÓRIA',q:'O Brasil fica em qual continente?',a:['África','América do Sul','Europa','Ásia'],k:1,e:'O Brasil fica na América do Sul.'},
  {c:'HISTÓRIA',q:'Quando um país deixa de ser colônia de outro, isso se chama:',a:['Independência','Ditadura','Monarquia','República'],k:0,e:'É a independência.'},
  {c:'HISTÓRIA',q:'Qual estado brasileiro tem a maior população?',a:['São Paulo','Minas Gerais','Rio de Janeiro','Bahia'],k:0,e:'São Paulo é o estado mais populoso.'},
  {c:'HISTÓRIA',q:'Em qual estado fica a cidade de São Paulo?',a:['Rio de Janeiro','São Paulo','Minas Gerais','Paraná'],k:1,e:'A cidade de São Paulo fica no estado de São Paulo.'},
  {c:'HISTÓRIA',q:'Quem escreveu o livro "Dom Casmurro"?',a:['Machado de Assis','Monteiro Lobato','José de Alencar','Carlos Drummond de Andrade'],k:0,e:'Foi Machado de Assis.'},
  {c:'HISTÓRIA',q:'Cristóvão Colombo nasceu em qual país?',a:['Portugal','Espanha','Itália','Grécia'],k:1,e:'Ele nasceu na Espanha.'},
  {c:'HISTÓRIA',q:'O que é a Constituição?',a:['A lei mais importante do país','Um mapa','Uma festa','Um remédio'],k:0,e:'A Constituição reúne as regras principais do país.'},
  // ─────────── PORTUGUÊS ───────────
  {c:'PORTUGUÊS',q:'Quantas vogais existem em português?',a:['3','4','5','6'],k:2,e:'São cinco: a, e, i, o, u.'},
  {c:'PORTUGUÊS',q:'Qual palavra está escrita corretamente?',a:['casa','kasa','caza','cassá'],k:0,e:'Casa se escreve com c e s.'},
  {c:'PORTUGUÊS',q:'Quantas vogais tem a palavra "cavalo"?',a:['2','3','4','5'],k:1,e:'cavalo = ca-va-lo: três vogais.'},
  {c:'PORTUGUÊS',q:'Qual é o plural de "livro"?',a:['livros','livro','livos','livrens'],k:0,e:'No plural acrescentamos o S: livros.'},
  {c:'PORTUGUÊS',q:'Em "O gato dormiu", a palavra "dormiu" é:',a:['um verbo','um adjetivo','um substantivo','um advérbio'],k:0,e:'Indica uma ação: é o verbo.'},
  {c:'PORTUGUÊS',q:'Qual é o ANTÓNIMO de "alto"?',a:['baixo','grande','longo','forte'],k:0,e:'Antônimo é o contrário: baixo.'},
  {c:'PORTUGUÊS',q:'Como se separa a sílaba de "bola"?',a:['bo-la','b-o-la','bo-la-','b'],k:0,e:'bola = bo-la.'},
  {c:'PORTUGUÊS',q:'Qual destas palavras tem ACENTO?',a:['casa','memória','mesa','livro'],k:1,e:'memória tem acento em "ó".'},
  {c:'PORTUGUÊS',q:'"Árvore" começa com a letra:',a:['A','E','O','U'],k:0,e:'Começa com A.'},
  {c:'PORTUGUÊS',q:'Na frase "O sol está quente", a palavra "quente" é um:',a:['adjetivo','substantivo','verbo','numeral'],k:0,e:'Caracteriza o sol: é um adjetivo.'},
  {c:'PORTUGUÊS',q:'Quantas sílabas tem "borboleta"?',a:['2','3','4','5'],k:2,e:'bor-bo-le-ta: quatro sílabas.'},
  {c:'PORTUGUÊS',q:'Qual frase está CORRETA?',a:['Eu gosto de ler livros.','Eu gosta de ler livros.','Eu gostei lendo.','Eu gostar de ler.'],k:0,e:'"Eu gosto de ler livros" — sujeito e verbo combinam.'},
  // ─────────── 📗 PORTUGUÊS — 5º ANO ───────────
  {c:'PORTUGUÊS',q:'Qual é o SINÔNIMO de "bonito"?',a:['belo','ruim','alto','frio'],k:0,e:'Sinônimo tem o mesmo sentido: belo.'},
  {c:'PORTUGUÊS',q:'O plural de "feliz" é:',a:['felizes','felizesz','felizs','felices'],k:0,e:'Os finais -az mudam para -izes: felizes.'},
  {c:'PORTUGUÊS',q:'Em "A casa é bonita", o sujeito é:',a:['A casa','é','bonita','A'],k:0,e:'É de quem se fala: a casa.'},
  {c:'PORTUGUÊS',q:'Qual destas palavras é um ADVÉRBIO?',a:['rapidamente','correr','feliz','mesa'],k:0,e:'Indica de que forma: rapidamente.'},
  {c:'PORTUGUÊS',q:'Como se separa a palavra "escola"?',a:['es-co-la','es-c-o-la','esco-la','e-sco-la'],k:0,e:'es-co-la: as sílabas têm duas letras cada.'},
  {c:'PORTUGUÊS',q:'Qual frase está no IMPERATIVO?',a:['Feche a porta.','A porta foi fechada.','Eu fecho a porta.','Fechar a porta.'],k:0,e:'Imperativo é pedido ou ordem: "Feche!"'},
  {c:'PORTUGUÊS',q:'A palavra "mas" liga duas orações mostrando:',a:['oposição','causa','conclusão','tempo'],k:0,e:'É a conjunção adversativa: mas = porém.'},
  {c:'PORTUGUÊS',q:'O verbo "correu" está no:',a:['pretérito perfeito do indicativo','presente','futuro','infinitivo'],k:0,e:'"Correu" indica uma ação já concluída.'},
  {c:'PORTUGUÊS',q:'Quantas sílabas tem "abacaxi"?',a:['2','3','4','5'],k:2,e:'a-ba-ca-xi: quatro sílabas.'},
  {c:'PORTUGUÊS',q:'Qual é o plural de "pé"?',a:['pés','pês','péss','pe'],k:0,e:'Some o acento: pés.'},
  {c:'PORTUGUÊS',q:'Em "Ele chegou TARDIO à aula", "tardio" é um:',a:['adjetivo','advérbio','verbo','conjunção'],k:0,e:'Caracteriza como ele chegou: adjetivo.'},
  {c:'PORTUGUÊS',q:'Qual destas frases NÃO tem sujeito?',a:['Choveu ontem.','O menino correu.','A lua brilha.','Eu estudei.'],k:0,e:'Verbos que dizem o clima não têm sujeito.'},
  // ─────────── 📘 CIÊNCIAS ───────────
  {c:'CIÊNCIAS',q:'Quantos planetas existem no Sistema Solar?',a:['7','8','9','10'],k:1,e:'São 8: Mercúrio, Vênus, Terra, Marte, Júpiter, Saturno, Urano e Netuno.'},
  {c:'CIÊNCIAS',q:'Qual é o planeta mais próximo do Sol?',a:['Vênus','Mercúrio','Terra','Marte'],k:1,e:'Mercúrio é o primeiro na fila.'},
  {c:'CIÊNCIAS',q:'Qual órgão bombeia o sangue pelo corpo?',a:['O pulmão','O coração','O estômago','O fígado'],k:1,e:'O coração é a bomba do corpo.'},
  {c:'CIÊNCIAS',q:'As plantas fazem fotossíntese pegando a luz do:',a:['Sol','Mar','Lua','vento'],k:0,e:'Da luz do Sol, com água e gás carbônico.'},
  {c:'CIÊNCIAS',q:'Qual parte da planta absorve a água da terra?',a:['as raízes','as flores','as folhas','o caule'],k:0,e:'As raízes bebem a água do solo.'},
  {c:'CIÊNCIAS',q:'Em que estado da água encontramos o gelo?',a:['Sólido','Líquido','Gasoso','Vaporoso'],k:0,e:'Gelo é a água no estado sólido.'},
  {c:'CIÊNCIAS',q:'Qual gás existe em maior quantidade no ar?',a:['Oxigênio','Nitrogênio','Gás carbônico','Hidrogênio'],k:1,e:'O ar tem cerca de 78% de nitrogênio.'},
  {c:'CIÊNCIAS',q:'Qual destes animais é um MAMÍFERO?',a:['Golfinho','Tubarão','Jacaré','Sapo'],k:0,e:'Mamífero tem pelo e amamanta as crias.'},
  {c:'CIÊNCIAS',q:'A água ferve, ao nível do mar, a quantos graus Celsius?',a:['90 °C','100 °C','120 °C','150 °C'],k:1,e:'O ponto de ebulição da água é 100 °C.'},
  {c:'CIÊNCIAS',q:'Qual é o maior oceano da Terra?',a:['Atlântico','Índico','Pacífico','Ártico'],k:2,e:'O Pacífico é o maior de todos.'},
  {c:'CIÊNCIAS',q:'O que provoca as marés dos oceanos?',a:['A gravidade da Lua','O vento','O Sol batendo na água','Os rios'],k:0,e:'A atração da Lua puxa a água do mar.'},
  {c:'CIÊNCIAS',q:'A Terra leva quanto tempo para dar uma volta completa em torno do Sol?',a:['24 horas','30 dias','365 dias','10 anos'],k:2,e:'365 dias — isso é 1 ano.'},
  {c:'CIÊNCIAS',q:'A camada do interior da Terra que fica entre o centro e a crosta chama-se:',a:['o manto','a crosta','o núcleo','a atmosfera'],k:0,e:'O manto fica entre o núcleo e a crosta.'},
  {c:'CIÊNCIAS',q:'A camada da atmosfera que nos protege dos raios ultravioleta é a de:',a:['ozônio','gás carbônico','hélio','vapor d\'água'],k:0,e:'A camada de ozônio filtra os raios UV.'},
  {c:'CIÊNCIAS',q:'Quantos ossos tem o crânio de uma pessoa adulta?',a:['12','22','32','42'],k:1,e:'O crânio do adulto tem 22 ossos.'},
  {c:'CIÊNCIAS',q:'Como se chama a mudança da água de líquido para gás?',a:['Evaporação','Congelamento','Condensação','Sublimação'],k:0,e:'É a evaporação: a água vira vapor.'},
  {c:'CIÊNCIAS',q:'O Som precisa de um meio para se propagar. Ele NÃO se propaga no:',a:['ar','água','vidro','vazio absoluto'],k:3,e:'Sem meio material não há som.'},
  // ─────────── 📐 MATEMÁTICA — 5º ANO ───────────
  {c:'MATEMÁTICA',q:'Qual é o MMC (mínimo múltiplo comum) de 4 e 6?',a:['10','12','24','30'],k:1,e:'12 é divisível por 4 e também por 6.'},
  {c:'MATEMÁTICA',q:'Qual é o MDC (máximo divisor comum) de 12 e 18?',a:['6','3','12','18'],k:0,e:'6 é o maior número que divide os dois.'},
  {c:'MATEMÁTICA',q:'Quanto é 3/4 + 1/4?',a:['4/4','3/8','1/2','1/3'],k:0,e:'Somam-se os numeradores: 4/4.'},
  {c:'MATEMÁTICA',q:'Quantos graus têm os ângulos internos de um triângulo?',a:['90°','180°','270°','360°'],k:1,e:'Somam 180°, qualquer que seja o triângulo.'},
  {c:'MATEMÁTICA',q:'Quanto é 2³ (2 elevado a 3)?',a:['6','8','9','12'],k:1,e:'2 × 2 × 2 = 8.'},
  {c:'MATEMÁTICA',q:'Um terreno quadrado tem 12 m de lado. Qual é a área dele?',a:['24 m²','120 m²','144 m²','24 m'],k:2,e:'Área do quadrado: 12 × 12 = 144 m².'},
  {c:'MATEMÁTICA',q:'Um trem percorre 240 km em 4 horas. Qual foi sua velocidade?',a:['40 km/h','60 km/h','80 km/h','960 km/h'],k:1,e:'240 ÷ 4 = 60 km/h.'},
  {c:'MATEMÁTICA',q:'Quanto é 84 ÷ 7?',a:['11','12','13','14'],k:1,e:'84 ÷ 7 = 12.'},
  {c:'MATEMÁTICA',q:'Cada ovelha tem 4 patas. Quantas patas têm 3 ovelhas?',a:['7','10','12','14'],k:2,e:'3 × 4 = 12 patas.'},
  {c:'MATEMÁTICA',q:'Quantos segundos tem 1 minuto?',a:['30','45','60','100'],k:2,e:'1 minuto = 60 segundos.'},
  {c:'MATEMÁTICA',q:'Uma figura de 12 lados chama-se:',a:['Dodecágono','Hexágono','Pentágono','Octógono'],k:0,e:'Dodecágono: dodeca = 12.'},
  {c:'MATEMÁTICA',q:'Em 200, quanto é 15%?',a:['15','20','30','150'],k:2,e:'10% de 200 é 20; 15% são 30.'},
  // ─────────── 📜 HISTÓRIA — 5º ANO ───────────
  {c:'HISTÓRIA',q:'Em que ano a escravatura foi abolida no Brasil (Lei Áurea)?',a:['1800','1822','1888','1889'],k:2,e:'Foi com a Lei Áurea, em 13 de maio de 1888.'},
  {c:'HISTÓRIA',q:'Quem proclamou a República do Brasil?',a:['D. Pedro I','Deodoro da Fonseca','Getúlio Vargas','Juscelino Kubitschek'],k:1,e:'Foi em 15 de novembro de 1889.'},
  {c:'HISTÓRIA',q:'Em que cidade foi assinada a Independência do Brasil?',a:['São Paulo','Rio de Janeiro','Salvador','Brasília'],k:1,e:'Foi no Campo de Santana, no Rio de Janeiro.'},
  {c:'HISTÓRIA',q:'O que foi a Lei Áurea?',a:['A lei que aboliu a escravatura','A lei do incêndio','A lei do petróleo','A lei da imprensa'],k:0,e:'Ela acabou com a escravatura no Brasil.'},
  {c:'HISTÓRIA',q:'Quem venceu a Guerra dos Canudos?',a:['Os paulistas','O governo brasileiro','Os espanhóis','Ninguém'],k:1,e:'O governo da República derrotou Canudos em 1897.'},
  {c:'HISTÓRIA',q:'Qual povo INDÍGENA construiu a cidade de Machu Picchu?',a:['Os maias','Os incas','Os egípcios','Os vikings'],k:1,e:'Foram os incas, no Peru.'},
  {c:'HISTÓRIA',q:'Os senhores de engenho e a produção de açúcar no Brasil Colonial:',a:['Sustentaram a primeira grande economia do país','Não existiram','Foram proibidos pela Coroa','Serviam só ao lazer'],k:0,e:'O açúcar do Nordeste sustentava a economia da colônia.'},
  {c:'HISTÓRIA',q:'Qual documento rege as regras principais do Brasil hoje?',a:['A Constituição Federal','O Diário Oficial','A carta de 1500','O Código de Hamurabi'],k:0,e:'A Constituição Federal de 1988.'},
  {c:'HISTÓRIA',q:'Como se chama um conjunto de países de um mesmo continente?',a:['Continente','Estreito','Estilo','Bloco'],k:0,e:'O Brasil fica na América do Sul, um continente.'},
  {c:'HISTÓRIA',q:'O período em que Portugal e Espanha dividiram as terras do Brasil chamava-se:',a:['Pactos de Tordes','Guerra de Canudos','Descobrimento','Independência'],k:0,e:'Foram os Pactos de Tordes, de 1494.'},
  {c:'HISTÓRIA',q:'Quem foi o ÚLTIMO IMPERADOR do Brasil?',a:['Pedro I','Dom Pedro II','Getúlio Vargas','Deodoro da Fonseca'],k:1,e:'D. Pedro II, que governou de 1840 a 1889.'},
];
const altars=[];
let quizState=null,quizFast=false;   // quizFast = modo teste (avança sem esperar a animação)
// ── ALTAR DE PEDRA com LIVRO ANCESTRAL ──
function addAltar(x,y,z,id,opts={}){
  const g=new THREE.Group();g.position.set(x,y,z);scene.add(g);
  const burrow=opts.need?2.6:0;            // ⛩️ começa afundado na terra
  if(burrow)g.position.y=y-burrow;
  const stone=MATX(0x9a8a6a,{surf:'stone',repeat:[2,1]});
  // dois degraus + tampo
  const st1=new THREE.Mesh(boxGeo,stone);st1.scale.set(3,1,2.2);st1.position.y=.5;g.add(st1);
  const st2=new THREE.Mesh(boxGeo,stone);st2.scale.set(2.5,.3,1.8);st2.position.y=1.15;g.add(st2);
  const top=new THREE.Mesh(boxGeo,MATX(0xb0a084,{surf:'stone',repeat:[2,1]}));top.scale.set(2.9,.26,2.1);top.position.y=1.42;g.add(top);
  // colunas nos cantos
  for(const sx of [-1,1]){const col=new THREE.Mesh(new THREE.CylinderGeometry(.13,.16,.7,8),MAT(0x7a6a52));
    col.position.set(sx*1.15,1.9,0);g.add(col);}
  // círculo gravado (brilho quando o livro destranca)
  const rune=new THREE.Mesh(new THREE.TorusGeometry(.62,.045,6,26),new THREE.MeshStandardMaterial({color:0x6b5a30,roughness:.6,metalness:.3,emissive:0x000000}));
  rune.rotation.x=-Math.PI/2;rune.position.y=1.56;g.add(rune);
  // 📕 LIVRO: capa + páginas + duas folhas que abrem
  const book=new THREE.Group();book.position.y=1.62;g.add(book);
  const cover=new THREE.Mesh(boxGeo,MAT(0x7a1f1f,{roughness:.75}));cover.scale.set(1.25,.13,.9);book.add(cover);
  const gold=new THREE.Mesh(boxGeo,MAT(0xc9a227,{metalness:.75,roughness:.3}));gold.scale.set(.34,.15,.94);book.add(gold);
  const pages=new THREE.Mesh(boxGeo,MAT(0xf2e6c8,{roughness:.95}));pages.scale.set(1.12,.12,.8);pages.position.y=.08;book.add(pages);
  const wingMat=MAT(0xf7efdc,{roughness:.95});
  const wingL=new THREE.Mesh(boxGeo,wingMat);wingL.scale.set(.54,.05,.78);wingL.position.set(-.27,.15,0);wingL.geometry.translate(-.27,0,0);wingL.position.set(0,.15,0);book.add(wingL);
  const wingR=new THREE.Mesh(boxGeo,wingMat);wingR.scale.set(.54,.05,.78);wingR.geometry.translate(.27,0,0);wingR.position.set(0,.15,0);book.add(wingR);
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  const altar={id,g,book,wings:[wingL,wingR],rune,pages,pos:new THREE.Vector3(x,y+1.2,z),
    doorId:opts.doorId||id,need:opts.need||null,needLevers:opts.needLevers||null,onPass:opts.onPass||null,
    lockMsg:opts.lockMsg||'',ready:false,done:false,rose:!burrow,riseT:burrow?0:1,riseFrom:y-burrow,baseY:y,
    t:Math.random()*6,
    hint:'abrir o livro ancestral'};
  altars.push(altar);
  if(!burrow)addBox(x,y-.1,z,3,.2,2.2,0x6a6054,{cast:false});   // base sólida (não entra dentro)
  if(burrow){g.visible=false;altar.riseFrom=y-burrow;}
  return altar;
}
// ⛩️ O ALTAR EMERGE: quando os requisitos da porta são cumpridos, a pedra sobe
// do chão com um baque, faíscas e um brilho no runa. É o sinal de "chegue perto e aperte E".
function riseAltar(a){
  if(a.rose||a.done)return;
  a.rose=true;a.riseT=0;a.g.visible=true;
  AudioSys.relicBig();shake=.5;
  for(let i=0;i<26;i++)spawnSpark(a.pos.clone().add(new THREE.Vector3((Math.random()-.5)*3.2,Math.random()*.4,(Math.random()-.5)*2.6)));
  if(a.need==='fuga')showMsg('⛩️ O ALTAR DO SELO emergiu do chão! Aproxime-se e aperte E para romper o selo do Cálice 🏆.',5200);
  else showMsg('⛩️ Um ALTAR DE PEDRA emergiu do chão! Aproxime-se e aperte E no livro 📖.',5200);
}
function altarReady(a){
  if(a.need==='fuga')return escapeUnlocked;          // fase 3: só depois de escapar
  const need=currentInfo?.needRelics||0;
  if(relics<need)return false;
  if(a.needLevers){
    const on=levers.filter(l=>a.needLevers.includes(l.id)&&l.on).length;
    if(on<a.needLevers.length)return false;
  }
  return true;
}
function updateAltars(dt){
  for(const a of altars){
    a.t+=dt;
    a.ready=!a.done&&altarReady(a);
    if(a.ready&&!a.rose)riseAltar(a);                 // ⛩️ emerge ao cumprir os requisitos
    if(!a.rose)continue;
    if(a.riseT<1){                                   // animação de subida
      a.riseT=Math.min(1,a.riseT+dt*.8);
      const e=1-Math.pow(1-a.riseT,3);               // suaviza a chegada
      a.g.position.y=a.riseFrom+(a.riseFrom===undefined?0:0)+(a.baseY-a.riseFrom)*0+(0)*0;
      a.g.position.y=(a.riseFrom||0)+((a.pos.y-1.2)-a.riseFrom)*e;
      a.g.rotation.z=Math.sin(a.riseT*Math.PI)*.05;
      a.g.scale.setScalar(.82+.18*e);
      if(a.riseT>=1)a.g.scale.setScalar(1);
      if(Math.random()<.35)spawnSpark(new THREE.Vector3(a.pos.x+(Math.random()-.5)*3,a.pos.y-1.1,a.pos.z+(Math.random()-.5)*2.4));
      if(a.riseT>=1){a.g.rotation.z=0;addBox(a.pos.x,a.pos.y-1.3,a.pos.z,3,.2,2.2,0x6a6054,{cast:false});}
    }
    const s=1+Math.sin(a.t*(a.done?1.2:2.4))*.06;
    a.book.position.y=1.62+Math.sin(a.t*1.5)*.035;
    a.book.rotation.y=Math.sin(a.t*.6)*.12;
    a.book.scale.setScalar(a.ready?1.06:1);
    const glow=a.done?0xffd76a:(a.ready?0xffc23a:0x3a3018);
    a.rune.material.emissive.setHex(glow);
    a.rune.material.emissiveIntensity=a.done?1.6:(a.ready?.75+Math.sin(a.t*3)*.35:.05);
    a.rune.scale.setScalar(a.done?s*1.15:s);
    // as páginas abrem quando o livro destranca
    const open=a.done?1:(a.ready?.55:0);
    a.wings[0].rotation.z=open*1.15;
    a.wings[1].rotation.z=-open*1.15;
    a.wings[0].position.x=-open*.27;a.wings[1].position.x=open*.27;
  }
}
// ── QUIZ ──
let quizSeen=[];        // histórico: fechar/reabrir ou errar nunca repete pergunta
function pickQuestions(n){
  n=Math.min(n,QUIZ_PER);                         // ⟵ no máximo 2, sempre
  // 🎲 primeiro: uma de cada MATÉRIA sorteada, sem repetir matéria nem pergunta
  const cats=QUIZ_CATS.filter(c=>QUIZ_BANK.some(q=>q.c===c&&!quizSeen.includes(q)));
  for(let i=cats.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;const t=cats[i];cats[i]=cats[j];cats[j]=t;}
  const out=[];
  for(const c of cats){
    if(out.length>=n)break;
    const bank=QUIZ_BANK.filter(q=>q.c===c&&!quizSeen.includes(q)&&!out.includes(q));
    if(bank.length)out.push(bank[(Math.random()*bank.length)|0]);
  }
  // rede de segurança: se alguma matéria ficou sem pergunta, completa com as outras
  const pool=QUIZ_BANK.filter(q=>!out.includes(q)&&!out.some(o=>o.c===q.c)&&!quizSeen.includes(q));
  while(out.length<n&&pool.length)out.push(pool.splice((Math.random()*pool.length)|0,1)[0]);
  quizSeen=out.concat(quizSeen).slice(0,10);      // guarda as últimas 5 rodadas
  return out;
}
// 📖 ERROU: o livro fecha sozinho e REABRE com perguntas novas
function restartQuiz(){
  if(!quizState)return;
  const a=quizState.altar;
  quizState={altar:a,qs:pickQuestions(QUIZ_PER),i:0,right:0,locked:false,retry:(quizState.retry||0)+1};
  renderQuiz();
}
function startQuiz(a){
  if(quizState||state!=='playing')return;
  quizState={altar:a,qs:pickQuestions(QUIZ_PER),i:0,right:0,locked:false};
  state='quiz';document.exitPointerLock?.();
  hud.classList.add('hidden');$('quiz').classList.remove('hidden');
  renderQuiz();
}
function renderQuiz(){
  if(!quizState)return;
  const q=quizState.qs[quizState.i];
  $('quiz-kicker').textContent='📖 LIVRO ANCESTRAL • '+q.c;
  $('quiz-title').textContent='PERGUNTA '+(quizState.i+1)+' DE '+quizState.qs.length;
  $('quiz-question').textContent=q.q;
  $('quiz-feedback').textContent='';$('quiz-feedback').className='';
  $('quiz-dica').innerHTML='';
  const box=$('quiz-opts');box.innerHTML='';
  q.a.forEach((txt,k)=>{
    const b=document.createElement('button');
    b.className='quiz-opt';b.type='button';b.textContent=txt;b.dataset.l='ABCD'[k];
    b.onclick=()=>answerQuiz(k);
    box.appendChild(b);
  });
}
function answerQuiz(k){
  if(!quizState||quizState.locked)return;
  const q=quizState.qs[quizState.i];
  quizState.locked=true;
  const opts=$('quiz-opts').children;
  for(let n=0;n<opts.length;n++){opts[n].disabled=true;if(n===q.k)opts[n].classList.add('ok');else if(n===k)opts[n].classList.add('bad');}
  if(k===q.k){
    quizState.right++;
    $('quiz-feedback').className='ok';
    $('quiz-feedback').textContent='✅ Isso! O livro acende mais uma letra dourada.';
    AudioSys.relicBig();
  }else{
    // ❌ RECUSA: sem conhecimento suficiente → o livro fecha e recomeça
    $('quiz-feedback').className='bad';
    $('quiz-feedback').textContent='❌ Você não teve o conhecimento necessário. Faz de novo!';
    const dica=$('quiz-dica');if(dica)dica.innerHTML='A resposta era: <b>'+q.a[q.k]+'</b> — '+q.e;
    health=Math.max(1,health-QUIZ_HIT);
    AudioSys.hurt();shake=.6;
    showMsg('📖 O livro sacode a cabeça: você não teve o conhecimento necessário. Faça de novo!',4600);
    setTimeout(()=>{if(quizState)restartQuiz();},quizFast?0:2300);
    return;
  }
  setTimeout(()=>{
    if(!quizState)return;
    quizState.locked=false;
    if(quizState.i+1<quizState.qs.length){quizState.i++;renderQuiz();}
    else finishQuiz();
  },quizFast?0:1250);
}
function breakSeal(a){
  if(!a||a.done)return;
  a.done=true;
  for(let i=0;i<28;i++)spawnSpark(a.pos.clone().add(new THREE.Vector3((Math.random()-.5)*2.4,(Math.random()-.5)*1.6,(Math.random()-.5)*2.4)));
  AudioSys.relicBig();shake=.6;
  showMsg('🏆 O SELO DO CÁLICE SE ROMPE — O portal da saída se abre!',5200);
  updateHUD();
  setTimeout(()=>{
    if(finaleStarted)return;
    if(state==='paused')$('pause').classList.add('hidden');
    if(state==='playing'||state==='paused'){finaleStarted=true;playFinale();}
  },1400);
}
function finishQuiz(){
  const a=quizState.altar;
  const ok=quizState.right>=QUIZ_PASS;
  const right=quizState.right,n=quizState.qs.length;
  quizState=null;quizFast=false;
  $('quiz').classList.add('hidden');$('quiz-meta').innerHTML='';
  if(state==='quiz')state='playing';
  hud.classList.remove('hidden');
  if(ok){
    if(a.need==='fuga'){breakSeal(a);return;}       // fase 3: sem quiz (fallback)
    a.done=true;
    openDoor(a.doorId);previewNextPhase();
    showMsg('📖 '+right+' de '+n+' — o livro se abre e a PORTA DE PEDRA se abre!',5000);
    for(let i=0;i<16;i++)spawnSpark(a.pos.clone().add(new THREE.Vector3((Math.random()-.5)*1.6,Math.random()*.8,(Math.random()-.5)*1.6)));
  }else{
    showMsg('📖 '+right+' de '+n+' — faltou! Acerte '+QUIZ_PASS+' de '+n+' para o livro abrir. Tente de novo!',4200);
  }
  updateHUD();
}
function useAltar(a){
  if(quizState||state!=='playing')return;
  if(!a.rose){showMsg('⛩️ A pedra ainda não emergiu — cumpra os requisitos da porta primeiro!',2800);return;}
  if(a.done){showMsg('📖 O livro já revelou o seu destino.',2400);return;}
  const need=currentInfo?.needRelics||0;
  if(relics<need){showMsg('📖 O livro está selado: junte os '+need+' fragmentos ⚙️ (você tem '+relics+').',3000);return;}
  if(a.need==='fuga'){breakSeal(a);return;}          // fase 3: o altar rompe o selo direto
  if(a.needLevers&&levers.filter(l=>a.needLevers.includes(l.id)&&l.on).length<a.needLevers.length){
    showMsg('📖 O livro só destranca com as 2 alavancas!',2800);return;
  }
  startQuiz(a);
}
function addDoor(x,y,z,w,h,d,id,opts={}){
  const {mesh,box}=addBox(x,y,z,w,h,d,0x7a5a2e);
  // detalhe dourado
  const trim=new THREE.Mesh(boxGeo,MAT(0xc9a227,{metalness:.6,roughness:.3}));trim.scale.set(w+.2,.3,d+.2);trim.position.set(x,y+h/2-.2,z);scene.add(trim);
  const dobj={mesh,box,trim,id,open:false,baseY:y,targetY:y,boxRef:null};
  dobj.boxRef=colliders[colliders.length-1];
  // 🚪 VERGA/PÓRTICO: a laje sobe 4,2 m — a verga tem que cobrir a laje INTEIRA
  // nessa posição, senão ela fica FLUTUANDO no vão (o bug que o usuário viu na
  // Fase 3 e que a verga antiga ainda deixava nas fases 1 e 2: sobravam 1,2–1,8 m
  // de laje pendurada abaixo da pedra). Base da verga = 15 cm abaixo do topo da
  // porta fechada (sem folga no batente e sem face coplanar) e topo = 30 cm acima
  // do topo da porta aberta. lh fixa em 4,65 engole qualquer laje de h ≤ 4,35.
  if(!opts.skipLintel){
    const lb=y+h/2-.15, lh=4.65, lw=w+2.4;
    const lm=new THREE.Mesh(boxGeo,MAT(opts.lintelColor??0x8a7a5a));
    lm.scale.set(lw,lh,d+1.2);lm.position.set(x,lb+lh/2,z);
    lm.castShadow=false;lm.receiveShadow=true;scene.add(lm);
    dobj.lintel=lm;                                     // p/ testes: verga da porta
    //ystone + frisos: a verga não é um cubo pelado
    const key=new THREE.Mesh(boxGeo,MAT(0x6f6250));
    key.scale.set(.6,.9,d+1.4);key.position.set(x,lb+.15,z);scene.add(key);
    for(const sy of [-1,1]){const fr=new THREE.Mesh(boxGeo,MAT(0x6f6250));
      fr.scale.set(lw+.3,.22,d+1.5);fr.position.set(x,lb+sy*(lh/2-.1),z);scene.add(fr);}
  }
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
  // hitbox = a BASE REAL (w×d) + 28 cm de folga (antes era um círculo enorme, maior que o visual)
  hazards.push({type:'spikes',pos:new THREE.Vector3(x,y,z),w,d,pad:.28,r:Math.max(w,d)/1.3,dmg,cd:0});
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
      // 🎯 raio fiel ao visual: o tronco tem 0.55·r de raio + o corpo do herói (0.45)
      const dh=Math.hypot(player.position.x-r.mesh.position.x,player.position.z-r.mesh.position.z);
      const dy=player.position.y-r.mesh.position.y;
      if(dh<.55*r.r+.45&&dy>-.8&&dy<1.6)knockDown(trapDamage(r),r.kind==='log'?'🪵 Atingido pelo tronco rolante!':'🪨 Atingido pela pedra rolante!');
      if(k>=1)r.state='spent';
    }
    // 'spent': fica parado no fim até resetRollers()
  }
}
// ══════════ 🔥 LAVA DE VERDADE ══════════
// Antes eram DOIS PLANOS chapados (vermelho + amarelo) — parecia tinta.
// Agora: crosta de basalto escuro FENDIDA por veios incandescentes, uma camada
// de material fundido por baixo que escorrega em outra velocidade (dá o fluxo),
// ilhas de crosta flutuando, bolhas que sobem e estouram, e brilho quente na borda.
let _lavaTex=null;
function lavaSurfaceTexture(){
  if(_lavaTex)return _lavaTex;
  const S=256;
  const c=document.createElement('canvas');c.width=S;c.height=S;
  const g=c.getContext('2d');
  const img=g.createImageData?g.createImageData(S,S):{data:new Uint8ClampedArray(S*S*4)};
  const d=img.data;
  const N=8,grid=[];
  for(let i=0;i<(N+1)*(N+1);i++)grid.push(Math.random());
  const g2=(a,b)=>grid[(((a%N)+N)%N)*(N+1)+(((b%N)+N)%N)];
  const smp=(u,v)=>{                     // ruído de valor que FECHA (tileável)
    const x=u*N,y=v*N,x0=Math.floor(x),y0=Math.floor(y);
    const fx=x-x0,fy=y-y0,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
    const a=g2(x0,y0),b=g2(x0+1,y0),cc=g2(x0,y0+1),dd=g2(x0+1,y0+1);
    const t=a+(b-a)*sx;
    return t+((cc+(dd-cc)*sx)-t)*sy;
  };
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    const u=x/S,v=y/S;
    const n=smp(u,v)*.58+smp(u*3,v*3)*.28+smp(u*7,v*7)*.14;
    // veios: onde o ruído vira "cume" (ridged) passa de um limiar
    const ridge=1-Math.abs(n*2-1);
    let hot=Math.max(0,(ridge-.66)/.34);
    hot=hot*hot*(3-2*hot);
    // crosta: basalto escuro, mais quente perto das rachaduras
    const cr=[34+n*30,23+n*20,18+n*15];
    const i=(y*S+x)*4;
    d[i]=Math.min(255,cr[0]+hot*228);
    d[i+1]=Math.min(255,cr[1]+hot*152);
    d[i+2]=Math.min(255,cr[2]+hot*44);
    d[i+3]=255;
  }
  if(g.putImageData)g.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  try{t.colorSpace=THREE.SRGBColorSpace;}catch{}
  _lavaTex=t;return t;
}
// monta a poça de lava (usada pela lava comum e pela ravina)
function buildLavaPool(x,y,z,w,d,dmg,hType){
  const rep=[Math.max(1,w/9),Math.max(1,d/9)];
  // 1) CROSTA: basalto escuro com veios incandescentes
  const crustTex=lavaSurfaceTexture().clone();crustTex.needsUpdate=true;
  crustTex.wrapS=crustTex.wrapT=THREE.RepeatWrapping;crustTex.repeat.set(rep[0],rep[1]);
  const crust=new THREE.Mesh(new THREE.PlaneGeometry(w,d),
    new THREE.MeshBasicMaterial({map:crustTex,color:0xd8b090}));
  crust.rotation.x=-Math.PI/2;crust.position.set(x,y,z);scene.add(crust);
  // 2) FUNDO DERRETIDO: rola mais rápido e em sentido contrário → ilusão de fluxo
  const glowTex=lavaSurfaceTexture().clone();glowTex.needsUpdate=true;
  glowTex.wrapS=glowTex.wrapT=THREE.RepeatWrapping;glowTex.repeat.set(rep[0]*1.4,rep[1]*1.4);
  const glow=new THREE.Mesh(new THREE.PlaneGeometry(w,d),
    new THREE.MeshBasicMaterial({map:glowTex,color:0xff9a30,transparent:true,opacity:.55,
      blending:THREE.AdditiveBlending,depthWrite:false}));
  glow.rotation.x=-Math.PI/2;glow.position.set(x,y+.04,z);glow.renderOrder=1;scene.add(glow);
  // 3) ILHAS DE CROSTA: pedaços de pedra escura flutuando na correnteza
  const chunks=[];
  const nChunk=Math.min(9,Math.max(3,Math.round((w*d)/90)));
  const rockM=MAT(0x241a16,{roughness:1,metalness:0});
  for(let i=0;i<nChunk;i++){
    const sz=.5+Math.random()*.9;
    const ch=new THREE.Mesh(new THREE.DodecahedronGeometry(sz,0),rockM);
    ch.scale.set(1,.34,1);
    ch.position.set(x+(Math.random()-.5)*(w-sz*2),y+.05,z+(Math.random()-.5)*(d-sz*2));
    ch.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);
    ch.castShadow=false;ch.receiveShadow=true;scene.add(ch);
    chunks.push({m:ch,ph:Math.random()*6,x0:ch.position.x,z0:ch.position.z,sp:.12+Math.random()*.2,dx:(Math.random()<.5?-1:1)*.5});
  }
  // 4) BOLHAS: pontos incandescentes que sobem da crosta
  const bubbles=[];
  const bubM=new THREE.MeshBasicMaterial({color:0xffd070});
  for(let i=0;i<Math.min(7,Math.max(3,Math.round((w*d)/140)));i++){
    const b=new THREE.Mesh(new THREE.SphereGeometry(.16+Math.random()*.2,8,6),bubM);
    b.position.set(x+(Math.random()-.5)*(w-1),y,z+(Math.random()-.5)*(d-1));
    b.castShadow=false;scene.add(b);
    bubbles.push({m:b,t:Math.random()*2,sp:.5+Math.random()*.6});
  }
  const h={type:hType,pos:new THREE.Vector3(x,hType==='lava'?y:0,z),w,d,dmg,cd:0,mesh:glow,
            crust,glow,chunks,bubbles,t:Math.random()*6};
  hazards.push(h);
  return h;
}
// animação da lava (chamada todo frame)
function updateLavaVisual(h,dt){
  h.t+=dt;
  h.crust.material.map.offset.x+=dt*.014;
  h.crust.material.map.offset.y+=dt*.026;
  h.glow.material.map.offset.x-=dt*.030;
  h.glow.material.map.offset.y-=dt*.048;
  h.glow.material.opacity=.46+Math.sin(h.t*1.7)*.12;    // "respira" como lava de verdade
  h.crust.material.color.setHSL(.055,.42,.72+Math.sin(h.t*1.1)*.05);
  for(const c of h.chunks){
    c.m.position.x+=c.dx*dt*c.sp;                 // deriva com a correnteza
    if(Math.abs(c.m.position.x-c.x0)>2.6)c.dx*=-1;
    c.m.position.y=c.m.userData.y0??(c.m.userData.y0=c.m.position.y);
    c.m.position.y=c.m.userData.y0+Math.sin(h.t*c.sp*2+c.ph)*.035;
    c.m.rotation.y+=dt*c.sp*.35;
    c.m.rotation.x+=dt*c.sp*.12;
  }
  for(const b of h.bubbles){
    b.t+=dt*b.sp;
    if(b.t>2.4){b.t=0;b.m.position.x=h.pos.x+(Math.random()-.5)*(h.w-1);b.m.position.z=h.pos.z+(Math.random()-.5)*(h.d-1);
      b.m.position.y=h.pos.y; b.m.scale.setScalar(.5);}
    b.m.position.y+=dt*.9;
    const k=b.t/2.4;
    b.m.scale.setScalar(.5+k*.9);
    b.m.material.opacity=1;   // material compartilhado: sem fade por bolha
    if(b.t>2.1)b.m.scale.multiplyScalar(Math.max(.2,1-(b.t-2.1)/.3));
  }
}
function addLava(x,y,z,w,d){
  const h=buildLavaPool(x,y+.05,z,w,d,30,'lava');
  // borda de pedra vulcânica (visual, sem colisão p/ não prender o player)
  addBox(x,y-.4,z,w+.6,.8,d+.6,MATX(0x2a2422,{surf:'stone',repeat:[8,8]}),{cast:false,solid:false});
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
    t:(opts.delay||0)+Math.random()*(opts.interval||3.5),interval:opts.interval||3.5,
    y:opts.y!=null?opts.y:(y+1.2),sweep:opts.sweep||null,phase:Math.random()*6,dmg:opts.dmg||10});
}
function fireSpear(pos,dir,dmg=10){
  // LANÇA voadora (NERFADA: mais lenta p/ dar tempo de desviar/pular)
  const g=new THREE.Group();
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,1.7,7),MAT(0x6b4a2b));shaft.castShadow=true;g.add(shaft);
  const tip=new THREE.Mesh(new THREE.ConeGeometry(.1,.36,7),MAT(0xb9c0c8,{metalness:.85,roughness:.25}));tip.position.y=.95;g.add(tip);
  for(let i=0;i<3;i++){const a=i/3*Math.PI*2;const f=new THREE.Mesh(boxGeo,MAT(0xc22f2f));f.scale.set(.02,.3,.14);f.position.set(Math.cos(a)*.07,-.8,Math.sin(a)*.07);f.rotation.y=-a;g.add(f);}
  g.position.copy(pos);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());
  scene.add(g);
  projectiles.push({mesh:g,vel:dir.clone().normalize().multiplyScalar(11.5),life:3.2,spear:true,dmg,r:.95});
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
  // ravina de lava: poça realistic + quem cai queima e volta pro chão seguro
  const h=buildLavaPool(x,-1.25,z,w,d,20,'lavapit');
  h.safe=new THREE.Vector3(sx,sy,sz);
  h.msg=msg||'🔥 LAVA! Aperte V nos anéis dourados!';
  // parede de basalto do fundo do abismo (texturizada, dá profundidade)
  addBox(x,-2.4,z,w+2,1.6,d+2,MATX(0x241c19,{surf:'stone',repeat:[10,4]}),{cast:false,solid:false});
  // veios incandescentes subindo pelas paredes da ravina
  for(let i=0;i<Math.min(10,Math.round(w/5));i++){
    const cx=x+(Math.random()-.5)*(w-3);
    const cz=z+(Math.random()<.5?-1:1)*(d/2+.6);
    addGlowCrack(cx,-1.05,cz,1.2+Math.random()*1.8,.5+Math.random()*.7);
  }
  return h;
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
// w/d = tamanho · delay = segundos entre PISAR e a plataforma CAIR (0 = cai na hora)
function addFallingPlatform(x,y,z,delay=0,w=3,d=3){
  const {mesh}=addBox(x,y,z,w,.5,d,MATX(0xa08a5a,{surf:'stone',repeat:[2,2]}));
  const c=colliders[colliders.length-1];
  const p={mesh,box:c.box,c,center:new THREE.Vector3(x,y,z),falling:true,state:0,t:0,
           prev:mesh.position.clone(),delay,w,d,halfW:w/2,halfD:d/2};
  c.platform=null;
  // aro de pedra + runa de aviso: dá pra ver que a laje é frágil
  const rim=new THREE.Mesh(new THREE.BoxGeometry(w+.14,.08,d+.14),MAT(0x6b5a44));
  rim.position.y=-.22;mesh.add(rim);
  const rune=new THREE.Mesh(new THREE.PlaneGeometry(w*.72,d*.72),
    new THREE.MeshBasicMaterial({color:0xff7a20,transparent:true,opacity:.5,side:THREE.DoubleSide}));
  rune.rotation.x=-Math.PI/2;rune.position.y=.26;mesh.add(rune);
  p.rune=rune;
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
function addWallText(text,x,y,z,w=14,h=2.4,ry=0,bg='#241c10',fg='#ffd76a'){
  // PLACA 3D na parede via CanvasTexture (sem fontes externas — funciona offline!)
  const c=document.createElement('canvas');c.width=1024;c.height=192;
  const g=c.getContext('2d');
  g.fillStyle=bg;g.fillRect(0,0,c.width,c.height);
  g.strokeStyle='#c9a227';g.lineWidth=10;g.strokeRect(10,10,c.width-20,c.height-20);
  g.fillStyle=fg;g.font='900 92px "Trebuchet MS",Verdana,sans-serif';
  g.textAlign='center';g.textBaseline='middle';
  // sombra preta p/ leitura mesmo no sol forte
  g.shadowColor='#000';g.shadowBlur=12;g.shadowOffsetY=5;
  g.fillText(text,c.width/2,c.height/2+4);
  const tex=new THREE.CanvasTexture(c);
  try{if(THREE.SRGBColorSpace!==undefined)tex.colorSpace=THREE.SRGBColorSpace;}catch{}
  tex.anisotropy=4;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),
    new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));
  m.position.set(x,y,z);m.rotation.y=ry;scene.add(m);return m;
}
// ---------- GEOMETRIA DE DETALHE (texturas procedurais em canvas, sem arquivos) ----------
// Ruído/granulado gerado em canvas: dá superfície de pedra, terra e metal em vez
// de cor chapada. Aplicado como bumpMap/roughnessMap — é o que tira o visual "plástico".
const noiseCanvases={};
function noiseCanvas(kind){
  if(noiseCanvases[kind])return noiseCanvases[kind];
  const S=256;
  const c=document.createElement('canvas');c.width=S;c.height=S;
  const g=c.getContext('2d');
  const img=g.createImageData?g.createImageData(S,S):{data:new Uint8ClampedArray(S*S*4)};
  const d=img.data;
  // ruído de valor com varias oitavas (liso + granulado = pedra natural)
  const oct=[{f:4,a:.55},{f:9,a:.28},{f:23,a:.12},{f:61,a:.05}];
  const grid={};
  for(const o of oct){
    grid[o.f]=[];
    for(let i=0;i<(o.f+1)*(o.f+1);i++)grid[o.f].push(Math.random());
  }
  const sample=(f,u,v)=>{ // interpolação suave do grid
    const gr=grid[f],n=f;
    const x=u*n,y=v*n,x0=Math.floor(x),y0=Math.floor(y);
    const fx=x-x0,fy=y-y0;
    const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
    const g2=(a,b)=>gr[(a%(n+1))*(n+1)+(b%(n+1))];
    const a=g2(x0,y0),b=g2(x0+1,y0),c=g2(x0,y0+1),dd=g2(x0+1,y0+1);
    return (a+(b-a)*sx)+((c+(dd-c)*sx)-(a+(b-a)*sx))*sy;
  };
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    const u=x/S,v=y/S;
    let n=0;for(const o of oct)n+=sample(o.f,u,v)*o.a;
    n=Math.max(0,Math.min(1,n));
    // veios / rachaduras: uma faixa escura senoidal em algumas texturas
    let val=kind==='stone'||kind==='metal'?140+n*115:120+n*120;
    if(kind==='rock')val=178+n*70; // pedra suave: mancha discreta, SEM veios escuros (p/ cor de parede)
    if(kind==='stone'||kind==='dirt'){
      const vein=Math.abs(Math.sin((u*3.1+v*1.7+Math.sin(v*8+u*2)*.35)*Math.PI));
      if(vein>.93)val*=0.62;
    }
    if(kind==='metal'){ // riscados verticais (latão batido)
      const scratch=Math.abs(Math.sin(u*Math.PI*90))>.985?.55:1;
      val*=scratch;
    }
    const i=(y*S+x)*4;
    d[i]=d[i+1]=d[i+2]=val;d[i+3]=255;
  }
  if(g.putImageData)g.putImageData(img,0,0);
  noiseCanvases[kind]=c;
  return c;
}
const surfaceTexCache={};
function SURFACE(kind,repeat=4,srgb=false){
  const rx=Array.isArray(repeat)?repeat[0]:repeat, ry=Array.isArray(repeat)?repeat[1]:repeat;
  const k=kind+'@'+rx+'x'+ry+(srgb?'#srgb':'');
  if(surfaceTexCache[k])return surfaceTexCache[k];
  const t=new THREE.CanvasTexture(noiseCanvas(kind));
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(rx,ry);
  t.anisotropy=4;
  if(srgb){try{t.colorSpace=THREE.SRGBColorSpace;}catch{}}
  surfaceTexCache[k]=t;
  return t;
}
// versão "envelhecida" da MAT(): mantém a mesma cor mas com relevo + variação
// opt.tex=true → também usa a textura como COR (pedra manchada, não chapada)
function MATX(color,opts={}){
  const kind=opts.surf||'stone';
  const {surf,repeat,rough,metal,emissive,emissiveIntensity,flat,tex,...rest}=opts;
  const base=MAT(color,{
    ...rest,
    roughness:rough??(kind==='metal'?.42:.88),
    metalness:metal??(kind==='metal'?.75:.06),
    ...(tex?{map:SURFACE(typeof tex==='string'?tex:kind,repeat??4,true)}:{}),
    bumpMap:SURFACE(kind,repeat??4),bumpScale:flat?0:(kind==='metal'?.012:.045),
    ...(emissive!==undefined?{emissive}:{}),
    ...(emissiveIntensity!==undefined?{emissiveIntensity}:{}),
  });
  return base;
}
function addStalactite(x,y,z,s=1){
  const g=new THREE.Group();
  // estalactite = cone + goteira de calcário + saliência na ponta
  const c=new THREE.Mesh(new THREE.ConeGeometry(.5*s,2.2*s,7),MATX(0x3a2f2b,{surf:'stone',repeat:2}));
  c.rotation.x=Math.PI;g.add(c);
  const d=new THREE.Mesh(new THREE.ConeGeometry(.2*s,1.1*s,6),MATX(0x4a3d36,{surf:'stone',repeat:2}));
  d.rotation.x=Math.PI;d.position.y=-1.4*s;g.add(d);
  const drip=new THREE.Mesh(new THREE.SphereGeometry(.14*s,8,6),MATX(0x554840,{surf:'stone',repeat:2}));
  drip.position.y=-2*s;drip.scale.y=1.5;g.add(drip);
  g.position.set(x,y-s*.6,z);
  g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  scene.add(g);return g;
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
      const pu=Math.sin(t*f.sp+f.p);
      f.m.scale.setScalar(f.base*(1+pu*.12));
      // halo de calor: pulsa a OPACIDADE junto com a escala
      if(f.halo)f.m.material.opacity=Math.max(.02,(f.op??.09)*(1+pu*.65));
    }else if(f.kind==='cloud'){
      f.m.position.x+=dt*f.sp;
      if(f.m.position.x>75)f.m.position.x=-75;
    }
  }
}

// ══════════ 🎯 CARTÃO DE MISSÃO (usado na fuga da Fase 3) ══════════
function showMission(kicker,title,hint,urgent){
  $('mis-kicker').textContent=kicker;
  $('mis-title').textContent=title;
  $('mis-hint').innerHTML=hint;
  $('mission').classList.remove('hidden');
  $('mission').classList.toggle('urgent',!!urgent);
}
function hideMission(){$('mission').classList.add('hidden');$('mission').classList.remove('urgent');}

// ================= TUTORIAL DA FASE 1 =================
// Guia simples e linear: cada passo mostra o que fazer, desenha um MARCADOR no
// chão apontando o alvo e avança sozinho quando o jogador executa a ação.
// Some no fim (ou se o jogador pular) e nunca trava o jogo.
const TUT_SKIP='relicTutSkipped_v1';
let tutStep=-1, tutOn=false, tutDone=false;
let tutWhipDummy=false, tutDropGot=false, tutSwingUsed=false, tutMoved=0, tutTick=0;
let tutAimLocked=false, tutSpinUsed=false;
let TUT_DUMMY=null, tutMark=null, tutMarkPos=new THREE.Vector3();
const tutPanel=$('tutorial');
const TUT_TOTAL=6;
// chão livre logo depois do spawn (clareira do riacho) para a briga de treino
const TUT_DUMMY_POS=new THREE.Vector3(3.4,0,43.2);

function tutNearestEnemy(){
  let best=null,bd=1e9;
  for(const e of enemies){
    if(e.dead)continue;
    const d=e.mesh.position.distanceTo(player.position);
    if(d<bd){bd=d;best=e;}
  }
  return best;
}
function tutNearest(pick){
  // objeto de pickup (ou qualquer {mesh}) mais próximo e ainda não pego
  let best=null,bd=1e9;
  for(const p of pick){
    if(p.taken)continue;
    const d=p.mesh.position.distanceTo(player.position);
    if(d<bd){bd=d;best=p;}
  }
  return best;
}
// ---------- passos ----------
const TUT_LESSONS=[
  {id:'andar',
   title:'1/8 · ANDAR',
   text:'<b>W A S D</b> (ou as setas) para andar. Segure <b>SHIFT</b> para CORRER e <b>ESPAÇO</b> para PULAR.',
   mark:()=>new THREE.Vector3(0,0,37),
   ok:()=>tutMoved>7},
  {id:'mira',
   title:'2/8 · TRAVAR A MIRA 🎯 (Z)',
   text:'Apontando para um inimigo, aperte <b>Z</b>: a <b>mira trava</b> nele (aparece um retículo laranja) e a câmera <b>segue</b> o alvo. O chicote então acerta quem estiver travado, de qualquer ângulo. Aperte <b>Z</b> de novo para soltar — ou espere ele morrer.',
   mark:()=>{const e=tutNearestEnemy();return e?e.mesh.position:(TUT_DUMMY?TUT_DUMMY.mesh.position:null);},
   ok:()=>tutAimLocked},
  {id:'atacar',
   title:'3/8 · ATACAR COM O CHICOTE',
   text:'Chegue perto do <b>boneco de treino</b> e aperte <b>CLIQUE</b> ou <b>F</b> para chicotear. O chicote só ataca — ele nunca faz você voar.',
   mark:()=>TUT_DUMMY&&!TUT_DUMMY.dead?TUT_DUMMY.mesh.position:null,
   ok:()=>tutWhipDummy},
  {id:'giro',
   title:'4/8 · GIRO DO CHICOTE 🌀 (H)',
   text:'O chicote sozinho acerta só quem está <b>à frente</b>. Perto de vários inimigos, aperte <b>H</b>: você dá uma <b>volta completa de 360°</b> e o chicote varre <b>todos em volta</b> de uma vez. Gasta um pouco de <b>fôlego</b> (a barra azul) — e ainda dá uma <b>pequena esquiva</b> no começo do giro!',
   mark:()=>{const e=tutNearestEnemy();return e?e.mesh.position:null;},
   ok:()=>tutSpinUsed},
  {id:'drop',
   title:'5/8 · PEGAR O ITEM QUE CAIU',
   text:'O boneco deixou um <b>item</b> no chão. <b>Ande em cima dele</b> para pegar: 💚 cura a vida, 💧 dá habilidade.',
   mark:()=>{const it=tutNearest(pickups.filter(p=>p.heart||p.skill));return it?it.mesh.position:(TUT_DUMMY?TUT_DUMMY.mesh.position:null);},
   ok:()=>tutDropGot},
  {id:'fragmentos',
   title:'6/8 · FRAGMENTOS ⚙️',
   text:'Junte <b>3 fragmentos</b> do Relógio (os idols dourados). Cada um é pego encostando nele. Eles abrem o portão do templo.',
   mark:()=>{const r=tutNearest(pickups.filter(p=>!p.heart&&!p.skill&&!p.big));return r?r.mesh.position:null;},
   ok:()=>relics>=3},
  {id:'argola',
   title:'7/8 · PENDURAR NA ARGOLA 🌀 (V)',
   text:'A ravina de lava não tem passagem a pé. Chegue perto do <b>anel dourado</b> e aperte <b>V</b> (ou 🌀 no celular): o chicote <b>prende no anel e você se pendura</b>, balançando e depois <b>voando por cima</b> da lava. Use a <b>cruz</b> para mirar onde quer cair.',
   mark:()=>{const g=nearestGrapple();return g?g.g.pos:null;},
   ok:()=>tutSwingUsed},
  {id:'porta',
   title:'8/8 · RESPONDER AO LIVRO E SEGUIR',
   text:'Vá até o <b>altar com o livro</b> (perto do portão do templo) e aperte <b>E</b>: o livro sortea perguntas. Acertando, a <b>porta de pedra se abre</b>! Depois ande para o norte e entre no <b>portal</b> no centro do pátio para a próxima fase.',
   mark:()=>exitGate?exitGate.pos:null,
   // a porta agora abre pelo LIVRO (quiz): vale a porta aberta OU o livro já destrancado
   ok:()=>!!((doors.find(d=>d.id==='temple1')&&doors.find(d=>d.id==='temple1').open)||altars.some(a=>a.done))},
];
function tutLesson(){return (tutStep>=0&&tutStep<TUT_LESSONS.length)?TUT_LESSONS[tutStep]:null;}
function tutEvent(what){
  if(!tutOn)return;
  if(what==='whipDummy')tutWhipDummy=true;
  else if(what==='drop')tutDropGot=true;
  else if(what==='swing')tutSwingUsed=true;
  else if(what==='aim')tutAimLocked=true;      // 🎯 travou a mira
  else if(what==='spin')tutSpinUsed=true;     // 🌀 usou o giro
}
function tutBuildMark(){
  if(tutMark)return;
  const g=new THREE.Group();
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.05,.085,8,34),
    new THREE.MeshBasicMaterial({color:0xffe27a,transparent:true,opacity:.92}));
  ring.rotation.x=Math.PI/2;g.add(ring);
  const ring2=new THREE.Mesh(new THREE.TorusGeometry(.62,.045,8,26),
    new THREE.MeshBasicMaterial({color:0x7dff9b,transparent:true,opacity:.8}));
  ring2.rotation.x=Math.PI/2;g.add(ring2);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.2,.34,7.5,12,1,true),
    new THREE.MeshBasicMaterial({color:0xffe27a,transparent:true,opacity:.13,side:THREE.DoubleSide}));
  beam.position.y=3.75;g.add(beam);
  const arrow=new THREE.Mesh(new THREE.ConeGeometry(.3,.55,10),
    new THREE.MeshBasicMaterial({color:0xffe27a}));
  arrow.position.y=1.5;g.add(arrow);
  g.visible=false;scene.add(g);
  tutMark={g,ring,ring2,beam,arrow};
}
function tutPaintStep(){
  const L=tutLesson();if(!L)return;
  $('tut-title').textContent=L.title;
  $('tut-text').innerHTML=L.text;
  let dots='';
  for(let i=0;i<TUT_TOTAL;i++)dots+=`<i class="${i<tutStep?'done':(i===tutStep?'on':'')}"></i>`;
  $('tut-dots').innerHTML=dots;
}
function startTutorial(){
  tutPanel.classList.remove('hidden');
  tutOn=true;tutStep=0;tutTick=0;tutDone=false;
  tutWhipDummy=false;tutDropGot=false;tutSwingUsed=false;tutMoved=0;
  tutBuildMark();tutPaintStep();
  AudioSys.tone(660,.14,'triangle',.09,880);
}
function stopTutorial(skipped){
  tutOn=false;tutStep=-1;
  if(!skipped)tutDone=true;          // concluído de verdade: nunca mais aparece
  if(tutMark)tutMark.g.visible=false;
  tutPanel.classList.add('hidden');
  if(skipped){try{localStorage.setItem(TUT_SKIP,'1');}catch{}}
  showMsg(skipped?'📖 Tutorial pulado. Boa aventura, aventureiro! 🗺':'✅ Tutorial completo! Você já sabe tudo o que precisa. 🗺',3600);
}
function updateTutorial(dt){
  if(!tutOn)return;
  tutTick+=dt;
  const L=tutLesson();
  if(!L){stopTutorial(false);return;}
  // marcador no chão apontando o alvo do passo
  tutBuildMark();
  const tgt=L.mark&&L.mark();
  if(tgt){
    tutMark.g.visible=true;
    tutMarkPos.set(tgt.x,groundY(tgt.x,tgt.z)+.04,tgt.z);
    tutMark.g.position.copy(tutMarkPos);
    const bob=Math.sin(performance.now()*.005)*.09;
    tutMark.g.children.forEach(c=>{if(c!==tutMark.beam)c.position.y=c===tutMark.arrow?1.5+bob:(c.position.y===0?bob:c.position.y);});
    tutMark.ring.rotation.z+=dt*.9;
    tutMark.ring2.rotation.z-=dt*1.4;
    tutMark.ring.material.opacity=.72+Math.sin(performance.now()*.006)*.2;
    // pisca quando o jogador chega perto
    const near=player.position.distanceTo(tutMarkPos)<4.5;
    tutPanel.classList.toggle('near',near);
    tutMark.g.scale.setScalar(near?1.08+Math.sin(performance.now()*.012)*.06:1);
  }else tutMark.g.visible=false;
  // o passo foi concluído? (0,35 s de carência p/ o jogador ver a confirmação)
  if(L.ok()&&tutTick>.35){
    tutTick=0;tutStep++;
    AudioSys.tone(880,.13,'triangle',.1,1320);
    if(tutStep>=TUT_LESSONS.length){stopTutorial(false);return;}
    tutPaintStep();
    showMsg('✔ '+tutLesson().title+' — certo!',1800);
  }
}

// ================= LEVELS =================
// Atmosfera por fase: céu, neblina, sol e hemisfério próprios de cada ambiente.
function baseLights(sky,fogC,groundC,sunC=0xfff0d0,sunI=1.6,hemiSky=0xfff2cc,hemiGround=0x2a3d1e,hemiI=.85,fogNear=35,fogFar=170){
  scene.background=new THREE.Color(sky);scene.fog=new THREE.Fog(fogC,fogNear,fogFar);
  sun.color.setHex(sunC);sun.intensity=sunI;
  hemi.color.setHex(hemiSky);hemi.groundColor.setHex(hemiGround);hemi.intensity=hemiI;
  // a luz de preenchimento toma a cor do céu de cada fase (profundidade visual)
  fillLight.color.setHex(sunC).lerp(new THREE.Color(0x8ab4e0),.55);
  scene.environmentIntensity=.45;
}
function groundPlane(w,d,color){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),MAT(color));m.rotation.x=-Math.PI/2;m.receiveShadow=true;scene.add(m);
}

function buildLevel1(){
  baseLights(0x8ecfee,0xa8d8b8,0x3d7a3d, 0xffe9c4,1.75, 0xfff6d8,0x2f4a24,1.0, 30,150); // manhã dourada na selva
  renderer.toneMappingExposure=1.12;
  if(playerLight){playerLight.intensity=2.2;playerLight.distance=8;}
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
  addBox(-10.5,1,39,21,2.5,1,MATX(0x7a7a70,{surf:'stone',repeat:[8,1],tex:'rock'}));addBox(10.5,1,31,21,2.5,1,MATX(0x7a7a70,{surf:'stone',repeat:[8,1],tex:'rock'}));
  addRock(1.5,0,39,1.2);addRock(-1.5,0,31,1.2);
  // muros de selva (limites) + fundo atrás do spawn + paredão atrás da saída (todos COM colisão)
  // 🧱 paredes com pedra texturizada de verdade (nada de laje de cor chapada) + mato no topo
  const MATA=MATX(0x3c7a3c,{surf:'rock',repeat:[22,3],tex:'rock'});
  const BARRANCO=MATX(0x5e8a5c,{surf:'rock',repeat:[10,3],tex:'rock'});
  const PAREDAO=MATX(0x6b7264,{surf:'rock',repeat:[10,3],tex:'rock'});
  addBox(-22,5,0,2,12,130,MATA);addBox(22,5,0,2,12,130,MATA);
  addBox(0,5,56,46,12,2,BARRANCO); // barranco atrás do spawn
  addBox(0,5,-50,46,12,2,PAREDAO); // paredão de pedra atrás da saída
  // 🌿 COROA DE FOLHA no topo dos muros: mata fecha a silhueta (antes era um topo reto de laje)
  for(let z=-58;z<=58;z+=4.6){const s=.7+Math.random()*.6;
    addBush(-21.4,10.6,z,s);addBush(21.4,10.6,z+(Math.random()<.5?-1.6:1.6),s);}
  for(let x=-20;x<=20;x+=4.2){addBush(x,10.6,55.4,.8+Math.random()*.5);addBush(x+1.4,10.6,-49.4,.8+Math.random()*.5);}
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
  // FOSSO A de espinhos (pule CORRENDO!) — 🟢 FÁCIL: o fosso some
  if(keepTrap('fossoA',['fossoA'])){
    addBox(-6,-0.1,35,6,.3,3.5,0x9a8f7a,{cast:false});
    addBox(6,-0.1,35,6,.3,3.5,0x9a8f7a,{cast:false});
    addBox(0,-1.2,35,4.5,.3,3,0x222222,{cast:false,solid:false});
    addSpikes(0,-1,35,4,3);
  }
  // TRONCOS E PEDRAS ROLANTES (passam UMA vez quando você chega perto — morrendo, passam de novo!)
  addRoller(0,.6,24,'x',{kind:'log',range:8,dir:1});
  if(keepTrap('roloPedra',['roloPedra']))addRoller(0,.95,21,'x',{kind:'rock',range:8,dir:-1});
  addGrapple(8,4.5,27); // argola p/ atravessar de chicote o campo de rolos 🌀
  addRock(-9,0,24,1.2);addRock(9,0,24,1.2);
  addBush(-3.5,0,23,.9);addBush(3.5,0,23,.9);
  showMsgOnce('🪵 Tronco e pedra rolantes! Passe na hora certa — ou aperte V na argola! (só V voa)');
  // MURO DE PEDRA no caminho (topo 2.4, ENCOSTA nos muros laterais!): passe pela ARGOLA de cima 🌀 OU faça PARKOUR pelas pedras!
  addBox(0,1.2,32.5,42,2.4,1,MATX(0x7a7a70,{surf:'stone',repeat:[14,1],tex:'rock'})); // muro com colisão, de muro a muro!
  addGrapple(8,4.5,33); // argola sobre o muro (lateral: não rouba o chicote da briga!)
  addParkourRoute(-7.5,34.3,2.2,0,.8,2,1.3); // parkorzinho: 2 pedras com vãos (topos .8/1.6) → pule p/ o muro!
  showMsgOnce('🧗 Muro de pedra! Aperte V na ARGOLA 🌀 ou PARKOUR na ponta branca!');
  // LADEIRA DA PEDRONA: pedrona desce a trilha (r 1.6, dano 30 — cronometre ou desvie!)
  addBoulder(0,1.6,24,'z',5,DIFF.traps?7:5,DIFF.traps?30:18,1.6);   // 🟢 mais lenta e fraca
  showMsgOnce('🪨 A pedrona desce a ladeira! Passe na hora certa!');
  // TRONCO PENDULAR LARGO (tronco com espinhos, r 2.6, dano 30 — passe quando abrir!)
  if(keepTrap('tronco',['tronco']))addBlade(0,0,15.5,{log:true,w:5.5,dmg:30,r:2.6});
  // TORA BAIXA p/ pular (de muro a muro: é só correr e pular com Espaço!)
  addBox(0,0.3,17,42,.6,1,0x6b4a2b);
  addBush(-4,0,17,.8);addBush(4,0,17,.8);
  showMsgOnce('🪵 Tora baixa! Corra e PULE (Espaço)!');
  // FOSSO B de espinhos (pule CORRENDO!) — 🟢 FÁCIL: o fosso some
  if(keepTrap('fossoB',['fossoB'])){
    addBox(-6,-0.1,12,6,.3,4,0x9a8f7a,{cast:false});
    addBox(6,-0.1,12,6,.3,4,0x9a8f7a,{cast:false});
    addBox(0,-1.2,12,4.5,.3,3.5,0x222222,{cast:false,solid:false});
    addSpikes(0,-1,12,4,3);
  }
  // ═══ RAVINA DE LAVA em largura total (não dá p/ contornar) 🌀
  // Paredes de basalto ANAIS (a lava "lambe" a rocha), fundo texturizado e brasa
  // subindo: a ravina agora tem profundidade de verdade em vez de um vão preto.
  const ravMat=MATX(0x3a2e28,{surf:'stone',repeat:[10,3]});
  const ravDark=MATX(0x241c19,{surf:'stone',repeat:[12,2]});
  addBox(0,-1.5,2,44,.3,8,0x1a0d08,{cast:false,solid:false});        // fundo do abismo
  addBox(0,-3.4,2,46,2.2,10,ravDark,{cast:false,solid:false});      // leito de basalto
  // paredes do cânion (dos dois lados do vão), com zigue-zague p/ não parecer caixa
  for(let i=0;i<22;i++){
    const x=-21+i*2;
    const j=(Math.random()-.5)*.5;
    addBox(x,-.5,6.6+j,2.2,4.6,1.4+j,ravMat,{cast:false,solid:false});   // parede norte
    addBox(x,-.5,-2.6-j,2.2,4.6,1.4+j,ravMat,{cast:false,solid:false});  // parede sul
  }
  // veios incandescentes nas paredes do cânion
  for(let i=0;i<16;i++){
    const x=-19+Math.random()*38;
    addGlowCrack(x,-.55,6.4,1.1+Math.random()*1.4,.4+Math.random()*.5);
    if(i%2===0)addGlowCrack(x,-.55,-2.4,1.1+Math.random()*1.4,.4+Math.random()*.5);
  }
  // MONTANHA bloqueando a ravina: impossível a pé — SÓ de chicote POR CIMA! 🗻
  addBox(0,-.5,0,44,6,4,ravMat);                                     // maciço de rocha (topo 2.5)
  addBox(0,2.55,0,44.6,.4,4.6,MATX(0x7a6c5c,{surf:'stone',repeat:[14,2]}),{cast:false,solid:false}); // cornija clara
  // 💡 halo quente nas bordas: a lava "ilumina" a rocha em volta
  for(const zz of [5.2,-1.2]){
    const halo=new THREE.Mesh(new THREE.PlaneGeometry(44,2.2),
      new THREE.MeshBasicMaterial({color:0xff6a20,transparent:true,opacity:.30,
        blending:THREE.AdditiveBlending,depthWrite:false}));
    halo.rotation.x=-Math.PI/2;halo.position.set(0,-.82,zz);halo.renderOrder=1;scene.add(halo);
    fxNodes.push({kind:'pulse',m:halo,base:1,sp:2.4,p:Math.random()*6,halo:true,op:.30});
  }
  // 🌡️ calor subindo (colunas de ar quente) + 🔥 brasas subindo do vão
  for(let i=0;i<7;i++){
    const x=-18+i*6;
    const hz=new THREE.Mesh(new THREE.PlaneGeometry(3.2,9),
      new THREE.MeshBasicMaterial({color:0xff8a30,transparent:true,opacity:.07,
        blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
    hz.position.set(x,-2.6,2);hz.rotation.y=Math.random()*.5;hz.renderOrder=3;
    scene.add(hz);
    fxNodes.push({kind:'pulse',m:hz,base:1,sp:1.2+Math.random()*.9,p:Math.random()*6,halo:true,op:.08});
  }
  addEmbers(34,-20,20,-1,0,5,6);
  addRock(-25,0,2,3.2);addRock(25,0,2,3.2);addRock(-24,0,-6,2.4);addRock(24,0,-6,2.4); // picos ao fundo
  addGlowCrack(-14,-1.19,2,6,3);addGlowCrack(14,-1.19,2,6,3); // lava escorrendo na base
  addBox(0,-0.1,8,44,.3,2.5,MATX(0x9a8f7a,{surf:'stone',repeat:[14,1]}),{cast:false});
  addBox(0,-0.1,-4,44,.3,2.5,MATX(0x9a8f7a,{surf:'stone',repeat:[14,1]}),{cast:false});
  addLavaPit(0,2,44,9, 0,0.5,8, '🔥 LAVA! Aperte V nos anéis dourados! (só V usa argola)');
  for(const lx of [-11,11]){POINT(0xff8a30,34,28,1.6,lx,1.2,2,2);} // brilho forte da lava
  addGrapple(-12,4.5,2);addGrapple(0,4.5,2);addGrapple(12,4.5,2); // anéis p/ balançar (SÓ no V!)
  showMsgOnce('🌀 Aperte V perto do anel dourado para atravessar! (clique/F NÃO voa)');
  // pátio do templo com estátuas de onça e estandartes
  addBox(0,-0.1,-24,30,.3,30,0x8a7f68,{cast:false});
  for(let i=0;i<6;i++)makePillar(-12+i*4.8,0,-36,7);
  // ═══ FACHADA DO TEMPLO (fachada classically indiana: simétrica, detalhada) ═══
  addBox(0,7,-40,32,8,3,MATX(0xb0a084,{surf:'stone',repeat:[10,3],tex:'rock'})); // frontão
  // degraus da escadaria de acesso
  for(let i=0;i<4;i++)addBox(0,.1*(3-i)-.1,-36.2-i*.75,10-i*1.2,.22,.8,0x8a7f68,{cast:false});
  // arcos do pórtico: 3 vãos com colunatas e capitéis
  for(const ax of [-8,0,8]){
    addBox(ax,2.4,-38.6,1.1,4.8,1.4,MATX(0xb0a084,{surf:'stone',repeat:2}));      // pilar do arco
    const arch=new THREE.Mesh(new THREE.TorusGeometry(1.5,.28,8,18,Math.PI),MATX(0xb0a084,{surf:'stone',repeat:2}));
    arch.position.set(ax,4.6,-38.6);arch.castShadow=true;scene.add(arch);
    const key=new THREE.Mesh(boxGeo,MAT(0xc9a227,{metalness:.6,roughness:.4}));     // fecho-dourado do arco
    key.scale.set(.4,.4,.4);key.position.set(ax,6.2,-38.6);key.rotation.z=Math.PI/4;scene.add(key);
  }
  // frontão esculpido: frisos, medalhões e(mask de jaguar) central
  addBox(0,7.4,-38.4,26,.5,1,MATX(0x8a7a5a,{surf:'stone',repeat:3}),{cast:false});
  addBox(0,8.6,-38.4,20,.4,1,MATX(0x8a7a5a,{surf:'stone',repeat:2}),{cast:false});
  for(let i=0;i<8;i++){ // dentículos (dentes) da borda
    const dnt=new THREE.Mesh(boxGeo,MATX(0xb0a084,{surf:'stone',repeat:1}));
    dnt.scale.set(.5,.7,.9);dnt.position.set(-11.2+i*3.2,9.4,-38.4);scene.add(dnt);
  }
  addJaguarStatue(0,8.2,-38.2,0);   // mask de onça esculpida no alto do frontão
  for(const sx of [-1,1]){ // medalhões de sol e lua
    const med=new THREE.Mesh(new THREE.TorusGeometry(.8,.2,7,16),MAT(0xc9a227,{metalness:.8,roughness:.3}));
    med.position.set(sx*11,6.4,-38.2);med.castShadow=true;scene.add(med);
    for(let i=0;i<8;i++){ // raios
      const ray=new THREE.Mesh(boxGeo,MAT(0xc9a227,{metalness:.8,roughness:.3}));
      ray.scale.set(.12,.5,.12);const a=(i/8)*Math.PI*2;
      ray.position.set(sx*11+Math.cos(a)*1.2,6.4+Math.sin(a)*1.2,-38.2);ray.rotation.z=a-Math.PI/2;scene.add(ray);
    }
  }
  // contrafortes (torres de canto) com telhado piramidal
  for(const sx of [-1,1]){
    addBox(sx*15,4.5,-39,3.4,9,3.4,MATX(0xb0a084,{surf:'stone',repeat:[2,3],tex:'rock'}));
    addBox(sx*15,9.6,-39,4.2,.5,4.2,0x7a6a50,{cast:false});
    const pyr=new THREE.Mesh(new THREE.ConeGeometry(2.9,3.2,4),MAT(0x8a3a2a,{roughness:.85}));
    pyr.position.set(sx*15,11.4,-39);pyr.rotation.y=Math.PI/4;pyr.castShadow=true;scene.add(pyr);
    const finial=new THREE.Mesh(new THREE.SphereGeometry(.35,10,8),MAT(0xc9a227,{metalness:.85,roughness:.25}));
    finial.position.set(sx*15,13.2,-39);finial.castShadow=true;scene.add(finial);
  }
  // lanternas de pedra penduradas na fachada (acendem quando o farol abre)
  for(const lx of [-4,4]){
    addBox(lx,5.4,-37.6,.7,.9,.7,MATX(0xb0a084,{surf:'stone',repeat:1}));
    POINT(0xffc070,14,9,1.7,lx,5.2,-37,1);
    const flame=new THREE.Mesh(new THREE.SphereGeometry(.18,8,6),new THREE.MeshBasicMaterial({color:0xffd070}));
    flame.position.set(lx,5.2,-37);scene.add(flame);
    addPulse(flame,3);
  }
  // 🏷️ CRÉDITO NA PAREDE: "FEITO PELO 2 DS" bem visível no frontão do templo!
  addWallText('FEITO PELO 2 DS',0,7,-38.35,20,2.6,0);
  addJaguarStatue(-5,0,-33,0);addJaguarStatue(5,0,-33,0);
  // PÁTIO PÓS-MONTANHA: tronco e pedra rolantes no caminho! (espinhos aliviados)
  addRoller(0,.6,-12,'x',{kind:'log',range:9,dir:-1});
  addRoller(0,.95,-22,'x',{kind:'rock',range:9,dir:1});
  addGrapple(0,4.5,-24); // argola p/ atravessar de chicote o pátio 🌀
  showMsgOnce('🪵 Pátio perigoso! Rolos atravessando à frente!');
  addBanner(-8,2.5,-39.3,2,3.5,0x8a1f1f);addBanner(8,2.5,-39.3,2,3.5,0x8a1f1f);
  addBanner(-13,2.5,-39.3,2,3.5,0xc9a227);addBanner(13,2.5,-39.3,2,3.5,0xc9a227);
  // porta do templo (requer 3 relíquias) + muros laterais p/ não dar a volta
  // (8 cm de folga de cada lado: face encostada na parede = z-fighting/pisca)
  const door=addDoor(0,1.6,-38,5.84,3.6,1,'temple1');
  addAltar(0,.1,-33,'altar1',{doorId:'temple1',need:'porta'});   // 📖 altar + livro (quiz)
  addBox(-12,5,-38,18,12,1.5,MATX(0xa08f78,{surf:'stone',repeat:[7,3],tex:'rock'}));addBox(12,5,-38,18,12,1.5,MATX(0xa08f78,{surf:'stone',repeat:[7,3],tex:'rock'})); // ENCOSTAM nos muros: só passa pela porta!
  addTorch(-4,0,-36);addTorch(4,0,-36);
  setExit(0,0,-44);
  // relíquias (uma arriscada na beira do fosso A!)
  spawnRelic(-7.5,.6,35);spawnRelic(5,.6,22);spawnRelic(-7.5,.6,8);spawnRelic(7,.6,-10);spawnRelic(0,.6,-28);
  spawnHeart(3,.6,-18);
  // emboscadas na trilha
  // ⚔ INIMIGOS: 2 (fácil) / 3 (médio) / 5 (difícil) de CADA tipo, em posições fixas
  spawnLevelEnemies({
    cobra:[[-3,0,26],[4,0,10],[0,0,-14],[-6,0,-30],[5,0,-34],[-7,0,-20]],
    bat:  [[0,4,0],[-6,4,-24],[8,4,-16],[-8,4,-32],[6,4,-8]],
  });
  // 🧪 BÔNECO DE TREINO do tutorial: fica na clareira do riacho, logo depois do
  // spawn. Não persegue, não envenena e SEMPRE derruba um item ao ser derrubado.
  TUT_DUMMY=spawnEnemy('cobra',TUT_DUMMY_POS.x,0,TUT_DUMMY_POS.z);
  TUT_DUMMY.tutHome=TUT_DUMMY_POS.clone();
  TUT_DUMMY.hp=TUT_DUMMY.max=Math.min(TUT_DUMMY.hp,60);
  TUT_DUMMY.speed=2.0;
  addSpikes(-8,-0.1+0.3,-16,3,3);
  addTorch(0,0,44);
  addTorch(-5,0,8,false);addTorch(5,0,8,false);addTorch(-5,0,-8,false);addTorch(5,0,-8,false);
  return {spawn,needRelics:3,doorId:'temple1',name:'FASE 1 — AMAZÔNIA, BRASIL',obj:'Junte 3 fragmentos ⚙️ e entre na caverna'};
}
function buildLevel2(){
  // FASE 2 CLARA: caverna bem iluminada p/ enxergar tudo (sol+hemi fortes, neblina clara e longe)
  baseLights(0x9a8a72,0x9a8a72,0x4a4238, 0xfff2d8,2.4, 0xfff6e0,0x8a7a60,2.0, 40,230);
  renderer.toneMappingExposure=1.5;
  if(playerLight){playerLight.intensity=7;playerLight.distance=24;}
  groundPlane(200,200,MATX(0x3a342c,{surf:'dirt',repeat:[44,44],tex:'rock'}));
  addBox(0,-1,0,120,2,120,MATX(0x61574a,{surf:'dirt',repeat:[30,30],tex:'rock'}),{cast:false});
  const spawn=new THREE.Vector3(0,.2,50);
  // salão fechado
  // ═══ SALÃO DA CAVERNA: pedra texturizada de verdade (mancha + relevo, sem cor chapada) ═══
  addBox(0,5,50,24,.8,4,MATX(0x77685a,{surf:'stone',repeat:[6,1],tex:'rock'}));
  // 🧱 paredes laterais sobem ATÉ o teto (y -0.5..7.1): antes paravam em 6.5 e
  // deixavam uma fresta de 10 cm por onde a câmera escapava da caverna.
  addBox(-12,3.3,10,2,7.6,90,MATX(0x77685a,{surf:'stone',repeat:[12,1],tex:'rock'}));addBox(12,3.3,10,2,7.6,90,MATX(0x77685a,{surf:'stone',repeat:[12,1],tex:'rock'}));
  addBox(0,7,10,26,.8,90,MATX(0x4c443a,{surf:'stone',repeat:[4,15],tex:'rock'}));
  // PAREDES COM COLISÃO: fundo da sala de saída + teto e laterais da saída (sem buracos p/ o vazio!)
  addBox(0,3.3,-52,26,7.6,2,MATX(0x77685a,{surf:'stone',repeat:[4,1],tex:'rock'})); // muro do fundo (até o teto)
  addBox(0,7,-44,26,.8,16,MATX(0x4c443a,{surf:'stone',repeat:[3,2],tex:'rock'})); // teto da sala de saída (26 = largura da sala!)
  addBox(-12,3.3,-44,2,7.6,16,MATX(0x77685a,{surf:'stone',repeat:[2,1],tex:'rock'}));addBox(12,3.3,-44,2,7.6,16,MATX(0x77685a,{surf:'stone',repeat:[2,1],tex:'rock'})); // laterais da saída
  // 🧱 detailamento: fiadas de blocos salientes + arco de sustentação a cada 12m
  for(let z=46;z>-32;z-=6){
    for(const sx of [-1,1]){
      const blk=new THREE.Mesh(boxGeo,MATX(0x6a5c4c,{surf:'stone',repeat:2}));
      blk.scale.set(.5,.9,3.2);blk.position.set(sx*10.9,1.1,z);blk.castShadow=blk.receiveShadow=true;scene.add(blk);
      const blk2=new THREE.Mesh(boxGeo,MATX(0x6a5c4c,{surf:'stone',repeat:2}));
      blk2.scale.set(.45,.8,2.2);blk2.position.set(sx*10.9,4.6,z);blk2.castShadow=blk2.receiveShadow=true;scene.add(blk2);
    }
    // arco de pedra atravessando o salão (aparência de galeria ancient)
    const rib=new THREE.Mesh(new THREE.TorusGeometry(5.2,.42,7,20,Math.PI),MATX(0x6a5c4c,{surf:'stone',repeat:3}));
    rib.position.set(0,4.2,z);rib.castShadow=true;scene.add(rib);
    const key=new THREE.Mesh(boxGeo,MATX(0x8a7a60,{surf:'stone',repeat:1}));
    key.scale.set(.8,.8,.8);key.position.set(0,6.6,z);scene.add(key);
    // estalactites + estalagmites (a caverna é viva)
    if(Math.random()<.7)addStalactite((Math.random()-.5)*16,6.9,z+.4,.5+Math.random()*.5);
    if(Math.random()<.5)addStalactite((Math.random()-.5)*16,6.9,z-1.6,.4+Math.random()*.4);
    if(Math.random()<.6){ // estalagmite do chão (não bloqueia: só visual)
      const stal=new THREE.Mesh(new THREE.ConeGeometry(.45,1.6+Math.random(),6),MATX(0x4a4038,{surf:'stone',repeat:2}));
      stal.position.set((Math.random()<.5?-1:1)*(6+Math.random()*4),.8,z);
      stal.castShadow=stal.receiveShadow=true;scene.add(stal);
    }
  }
  // musgo e goteiras nas bases das paredes (quebra a monotonia)
  for(let z=44;z>-30;z-=4){
    for(const sx of [-1,1]){
      if(Math.random()<.6)addMossPatch(sx*10.6,z,2.4,1.6);
    }
  }
  // tochas: TODAS com luz real agora (visibilidade total) + clarões no teto
  {let i=0;for(let z=46;z>-30;z-=8){addTorch(-11,0,z,true);addTorch(11,0,z,true);i++;}}
  for(const lz of [34,18,2,-14,-28]){
    POINT(0xffe8c0,40,50,1.6,0,6,lz,3);
  }
  for(let z=40;z>-28;z-=12){makePillar(-8,0,z,6);makePillar(8,0,z,6);}
  // tapete central
  addBox(0,-0.05,10,5,.12,80,0x7a1f1f,{cast:false,solid:false});
  // CORREDOR DE LANÇAS (NERFADO p/ fase 2 mais fácil: atira BEM menos e mais fraco!)
  // altas p/ cronometrar pelos lados, baixas p/ PULAR e um varredor giratório
  addSpearTrap(-11,0,38,new THREE.Vector3(1,0,0),{y:1.2,interval:3.6,dmg:10});  // atravessa (desvia pro lado)
  if(keepTrap('lanca1',['lanca1','lanca2']))addSpearTrap(11,0,35,new THREE.Vector3(-1,0,0),{y:.5,interval:3.8,dmg:10});   // baixa (PULA!)
  if(keepTrap('lanca2',['lanca1','lanca2']))addSpearTrap(-11,0,32,new THREE.Vector3(1,0,0),{y:1.2,interval:3.4,dmg:10});  // atravessa
  addSpearTrap(-11,0,27,new THREE.Vector3(1,0,0),{y:1.2,interval:3.7,dmg:10});  // atravessa
  addSpearTrap(11,0,24,new THREE.Vector3(-1,0,0),{y:.5,interval:3.9,dmg:10});   // baixa (PULA!)
  addSpearTrap(0,0,14,new THREE.Vector3(0,0,1),{y:1.0,interval:3.2,sweep:{speed:.45,amp:.8},dmg:10}); // varredor giratório (mais lento)
  addBox(0,.7,19,1,1.4,1,MATX(0x6a5c4c,{surf:'stone',repeat:[1,1],tex:'rock'}));      // pilar central do varredor (esconde atrás!)
  showMsgOnce('🗡 LANÇAS! Desvie pelos lados, PULE as baixas!');
  addSpikes(0,0,28,4,3);
  // LÂMINA logo na entrada (cronometre a passada!)
  addBlade(0,0,43);
  showMsgOnce('⚔ Lâminas pendulares! Passe quando abrir!');
  // CORREDOR LIVRE (sem lasers): só lanças e lâminas guardam a passagem!
  showMsgOnce('🗡 Sem lasers por aqui — só lanças e lâminas!');
  // espinhos guardando a relíquia do meio (pegue pelo lado esquerdo!) — 🟢 some
  if(keepTrap('espinhosMeio',['espinhosMeio']))addSpikes(3.2,0,18,2.5,2.5);
  // (plataformas/lajes removidas da Fase 2 a pedido — o salão tem chão firme)
  // LÂMINA na saída do beco (respirou? continua!) — 🟢 FÁCIL: a lâmina some
  if(keepTrap('laminaBeco',['laminaBeco']))addBlade(0,0,-24);
  // decoração do templo: relevos dourados e estandartes ENCOSTADOS na parede (zero folga)
  for(let z=40;z>=-20;z-=10){
    for(const sx of [-1,1]){
      const rel=new THREE.Mesh(boxGeo,MAT(0xc9a227,{metalness:.5,roughness:.5}));rel.scale.set(.16,1.6,.9);rel.position.set(sx*10.96,3,z);scene.add(rel);
      addBanner(sx*10.97,4.2,z+5,1.6,2.6,0x8a1f1f,sx>0?-Math.PI/2:Math.PI/2);
    }
  }
  for(let z=44;z>=-28;z-=12)addBox(0,6.4,z,24,.5,1.2,0x3a2c1c,{cast:false});
  // ladrilhos simétricos ladeando o tapete (alinhados a cada 7 m: piso regular e liso)
  for(let z=42;z>-28;z-=7){for(const sx of [-1,1])addBox(sx*4.2,0,z,2.4,.04,2.4,MATX(0x605649,{surf:'stone',repeat:[1,1],tex:'rock'}),{cast:false,solid:false});}
  addTorch(-3,0,-33,true);addTorch(3,0,-33,true);
  // (fosso de lava + plataformas móveis removidos da Fase 2 a pedido — chão firme)
  addBox(0,-0.1,8,22,.3,14,MATX(0x77685a,{surf:'stone',repeat:[10,4],tex:'rock'}),{cast:false});
  addGrapple(0,4.5,15); // argola dourada: atalho aéreo opcional 🌀 (SÓ no V!)
  showMsgOnce('🌀 Argola dourada! Aperte V p/ voar até ela! (6s de recarga)');
  // beco (sem pedrona: passagem livre)
  addBox(0,-0.1,-12,10,.3,22,MATX(0x8a7e70,{surf:'dirt',repeat:[3,7],tex:'rock'}),{cast:false});
  // puzzle alavancas
  addLever(-9,0,-26,'L1');addLever(9,0,-26,'L2');
  showMsgOnce('⚙ Chegue perto de uma alavanca e aperte E para puxá-la (no celular, o botão E).');
  addBox(0,0,-30,24,.3,8,MATX(0x77685a,{surf:'stone',repeat:[10,3],tex:'rock'}),{cast:false});
  addBox(-8.5,2.5,-36,7,5,1.5,MATX(0x77685a,{surf:'stone',repeat:[3,2],tex:'rock'}));addBox(8.5,2.5,-36,7,5,1.5,MATX(0x77685a,{surf:'stone',repeat:[3,2],tex:'rock'}));
  const d=addDoor(0,1.8,-36,9.84,4,1,'main2');   // 8 cm de folga p/ cada lado (sem z-fighting)
  addAltar(0,0,-32.6,'altar2',{doorId:'main2',needLevers:['L1','L2'],need:'porta'});   // 📖 altar + livro (precisa das 2 alavancas)
  addGrapple(-6,4.5,-12); // argola lateral: atalho de chicote pelo beco 🌀
  // ═══ FIM DA FASE 2: corredor firme até o portal ═══
  // Antes havia uma ponte de 5 lajes frágeis logo depois da porta e um bloco
  // de plataformas na poça de lava — tudo removido a pedido: o caminho inteiro
  // (salão → beco → alavancas → altar → portal) é CHÃO SÓLIDO.
  addBox(0,-.1,-45,20,.3,14,MATX(0x77685a,{surf:'stone',repeat:[9,4],tex:'rock'}),{cast:false}); // piso após a porta
  addTorch(-7,0,-39,true);addTorch(7,0,-39,true);
  addTorch(-6,0,-47);addTorch(6,0,-47);
  setExit(0,0,-50);
  addTorch(-4,0,-42);addTorch(4,0,-42);
  spawnRelic(-9,.7,34, false, 1);spawnRelic(9,.7,34, false, 1);spawnRelic(0,.7,18, false, 1);spawnRelic(-9,.7,-20, false, 1);spawnRelic(9,.7,-20, false, 1);spawnHeart(0,.7,-28);
  // ⚔ INIMIGOS DA FASE 2: só os SENTINELAS DE PEDRA (guardas). Sem cobra e sem
  // morcego aqui — cada fase tem só os inimigos que "moram" nela.
  // 2 (fácil) / 3 (médio) / 5 (difícil) guardas, em posições fixas.
  spawnLevelEnemies({
    guard:[[-5,0,20],[5,0,14],[0,0,-28],[7,0,-20],[-6,0,34],[8,0,-16]],
  });
  addSpikes(4,0,-6,3,3);
  return {spawn,needRelics:4,doorId:'main2',needLevers:['L1','L2'],name:'FASE 2 — CAVERNA DO TEMPO',obj:'Puxe as 2 alavancas e junte 4 fragmentos'};
}
function buildLevel3(){
  // ══════════════════════════════════════════════════════════════════════════
  //  FASE 3 — A CÂMARA DO CÁLICE  (câmara vulcânica sob a Amazônia)
  // ══════════════════════════════════════════════════════════════════════════
  //  PLANTA (o jogador sempre anda de z+ → z-). Tudo numa malha ÚNICA: as
  //  paredes laterais são UM ÚNICO bloco reto de z -23 até z 52 (antes elas se
  //  cruzavam, deixavam degraus e abriam frestas por onde a câmera e o chefe
  //  "atravessavam" a pedra). Todo piso tem o mesmo topo (y=0).
  //    TÚNEL   z  63…52   interior x -6..6   (saída p/ 1969)
  //    PORTA   z   52      vão x -3.5..3.5   (só abre com o CÁLICE)
  //    TERRAÇO z  52…42   interior x ±18
  //    VÃO     z  42…24   lava x -8..8 · passarelas x ±8..±18
  //    ARENA   z  24…-21  interior x ±18    (câmara da Sentinela, pé-direito 9m)
  const WT=2, WH=9;                     // espessura / pé-direito das paredes
  const AX=18;                          // MEIA-LARGURA DO INTERIOR (arena+vão+terraço)
  const AZ0=-21, AZ1=24;                // interior da arena em z
  const PZ0=24, PZ1=42;                 // o vão de lava em z (encosta na arena)
  const TZ0=52, TZ1=63, TX=6;           // túnel de fuga
  const floorT=-.225, floorH=.45;        // laje MAGRA: topo em y=0, base em y=-0.45
  const wallM=0x4a352c, wallD=0x3a2822, floorM=0x54443a;
  // 🧱 MATERIAIS COM RELEVO (bump procedural): a pedra deixa de ser um cubo liso
  const WALL=new THREE.MeshStandardMaterial({color:wallM,roughness:.92,metalness:.03,
    bumpMap:SURFACE('stone',6),bumpScale:.05});
  const WALL_D=new THREE.MeshStandardMaterial({color:wallD,roughness:.95,metalness:.03,
    bumpMap:SURFACE('stone',8),bumpScale:.04});
  const FLOOR=new THREE.MeshStandardMaterial({color:floorM,roughness:.9,metalness:.04,
    bumpMap:SURFACE('stone',5),bumpScale:.035});
  // addBox aceita material pronto — sem criar um material novo por parede
  const wall=(x,y,z,w,h,d,m)=>{const b=addBox(x,y,z,w,h,d,0xffffff,{cast:false,mat:m});return b;};
  const slab=(x,z,w,d)=>addBox(x,floorT,z,w,floorH,d,0xffffff,{cast:false,mat:FLOOR});

  baseLights(0x7a4a3c,0x8a5240,0x2b1a16, 0xffd8b0,1.5, 0xffd0a8,0x6a3a28,.9, 26,180);
  renderer.toneMappingExposure=1.25;
  if(playerLight){playerLight.intensity=8;playerLight.distance=26;}
  groundPlane(300,300,0x241512);
  // chão de base da caverna: em.flush com a laje (topo em y=-0.45), sem sobra
  addBox(0,-1.55,10,120,2.2,140,0x3a2822,{cast:false});

  const spawn=new THREE.Vector3(0,.2,48);

  // ─────────── 4) TERRAÇO INICIAL (z 42…52) ───────────
  slab(0,(PZ1+TZ0)/2,AX*2+WT*2,TZ0-PZ1);                  // piso do terraço
  // TETO começa acima do topo das paredes (nada de fresta entre elas)
  addBox(0,WH+.45,(PZ1+TZ0)/2,AX*2+WT*2,.9,TZ0-PZ1,0xffffff,{cast:false,mat:WALL_D});
  addTorch(-15.5,0,50,false);addTorch(15.5,0,50,false);
  addTorch(-15.5,0,43.5,false);addTorch(15.5,0,43.5,false);
  POINT(0xffc080,44,28,1.7,-12,4.5,48,2);
  POINT(0xffc080,44,28,1.7, 12,4.5,48,2);

  // ─────────── 5) VÃO DE LAVA (z 24…42) ───────────
  // Lava no MEIO (x -8..8) e duas passarelas de pedra nas bordas (x ±8..±18).
  // Beirada = lento e seguro. Meio = lajes que caem. Argola (V) = por cima.
  // A poça encosta EXATAMENTE no piso da arena (z=24): sem fresta, sem degrau.
  // 🌋 A LAVA OCUPA A LARGURA INTEIRA (x -18..18): não existe mais atalho pela
  // beira. A única travessia é pela PONTE DE LAJES no meio (elas despencam),
  // pelas plataformas ou voando na argola (V).
  addLava(0,-.2,(PZ0+PZ1)/2,36,PZ1-PZ0);                    // poça gigante
  // 🧱 GUARDA-CORPOS laterais: fecham a sala e guiam o olhar para a ponte
  addBox(-18.5,1.35,(PZ0+PZ1)/2,1.5,2.7,PZ1-PZ0,0xffffff,{cast:false,mat:WALL_D});
  addBox( 18.5,1.35,(PZ0+PZ1)/2,1.5,2.7,PZ1-PZ0,0xffffff,{cast:false,mat:WALL_D});
  // 🌉 PONTE DE LAJES: encostou, a runa acende e a laje despenca em 2,2 s
  for(let i=0;i<6;i++)addFallingPlatform(0,.72,39.9-i*3.1,2.2,6.4,3.1);   // topo em ~1,0: acima da queimadura
  showMsgOnce('🌉 Só dá p/ passar pelas lajes — e elas CAEM quando você pisa. Não pare!');
  addGrapple(0,5.4,36.5);   // 🌀 argola no alto do vão: voo de chicote (V) por cima da lava
  addGrapple(0,4.8,20);     // 🌀 segunda argola, já dentro da arena (volta da fuga)
  showMsgOnce('🌀 Argolas douradas! Use V (🌀) p/ voar por cima da lava!');
  showMsgOnce('⚠ As lajes caem quando você pisa — não fique parado!');
  showMsgOnce('🦶 Dica: as passarelas de pedra nas bordas são mais seguras que o meio do vão.');
  POINT(0xff6a20,60,30,1.7,-6,1.2,33,3);
  POINT(0xff6a20,60,30,1.7, 6,1.2,33,3);
  addEmbers(24,-8,8,1,PZ0,PZ1,5);
  // abóbada do vão (a lava fica numa câmara, não num buraco aberto)
  addBox(0,WH+.45,(PZ0+PZ1)/2,AX*2+WT*2,.9,PZ1-PZ0,0xffffff,{cast:false,mat:WALL_D});

  // ─────────── 6) PAREDES DA CÂMARA (o bloco reto z -23…52) ───────────
  // Uma única parede de cada lado, do fundo da arena até a porta da fuga.
  const WZ0=AZ0-WT, WZ1=TZ0+WT;
  wall(-AX-1,WH/2,(WZ0+WZ1)/2,WT,WH,WZ1-WZ0,WALL);        // muralha oeste (reta)
  wall( AX+1,WH/2,(WZ0+WZ1)/2,WT,WH,WZ1-WZ0,WALL);        // muralha leste (reta)

  // ─────────── 7) ARENA DA SENTINELA (z -21…24, interior x ±18) ───────────
  slab(0,(AZ0+AZ1)/2,AX*2+WT*2,AZ1-AZ0+WT);                // piso da arena (topo y=0)
  wall(0,WH/2,AZ0-1,AX*2+WT*2,WH,WT,WALL);                 // norte (fundo, atrás do cálice)
  addBox(0,WH+.45,(AZ0+AZ1)/2,AX*2+WT*2,.9,AZ1-AZ0+WT,0xffffff,{cast:false,mat:WALL_D}); // teto
  // limites EXATOS da IA da Sentinela = a pedra de verdade (x ±18, z -21)
  arena3={minX:-AX,maxX:AX,minZ:AZ0,maxZ:AZ1-3,roof:WH-.5};
  // paredes com relevo: pilastras embutidas + friso (bonito e legível no jogo)
  for(let i=0;i<7;i++){
    const pz=AZ0+2.5+i*6.2;
    addBox(-AX+.55,WH/2,pz,1.1,WH-.6,1.7,0xffffff,{cast:false,mat:WALL_D});
    addBox( AX-.55,WH/2,pz,1.1,WH-.6,1.7,0xffffff,{cast:false,mat:WALL_D});
  }
  addBox(0,WH-.5,(AZ0+AZ1)/2,AX*2,.9,1.4,0xffffff,{cast:false,mat:WALL_D}); // friso do teto
  // 4 cantos com tochas (luz quente, sombras dramáticas)
  for(const [cx,cz] of [[-16,21],[16,21],[-16,-18],[16,-18]])addTorch(cx,0,cz,true);
  POINT(0xffe0b8,60,54,1.6,0,7,(AZ0+AZ1)/2,4);            // clarão central (o boss sempre visível)
  for(const [cx,cz] of [[-12,12],[12,12],[-12,-8],[12,-8]])POINT(0xffd0a0,38,32,1.7,cx,6.5,cz,1);
  makePillar(-15.5,0,16,7.5);makePillar(15.5,0,16,7.5);
  makePillar(-15.5,0,-15,7.5);makePillar(15.5,0,-15,7.5);
  // teto: estalactites espaçadas (menos draw calls) + correntes + brasas flutuantes
  for(let i=0;i<9;i++)addStalactite((Math.random()-.5)*32,WH-.1,(AZ0+AZ1)/2+(Math.random()-.5)*40,.8+Math.random()*.9);
  addEmbers(22,-16,16,2,AZ0,AZ1,WH-.5);
  // rachaduras de lava no chão da arena
  for(let i=0;i<6;i++)addGlowCrack((Math.random()-.5)*32,.06,(Math.random()-.5)*38,2+Math.random()*3,.5);
  addChain(-9,14);addChain(9,-6);
  addBones(-13);addBones(12,-16);
  // ✂ SEM ARMADILHAS NA ARENA DO CHEFE: o duelo é só você × Sentinela.
  //    O que existe são as MARCAS vermelhas que avisam onde cada golpe vai cair.
  showMsgOnce('🗿 A SENTINELA DO TEMPO acordou! 900 de vida, mãos de pedra.');

  // ─────────── 8) PEDESTAL DO CÁLICE (fundo da arena) ───────────
  // pedestal torneado (2 peças) — o cálice fica pousado no capitel
  const pedMat=MATX(0x8a7a5a,{surf:'stone',repeat:2});
  const pedBase=new THREE.Mesh(latheGeo([[.001,0],[1.55,0],[1.62,.10],[1.52,.26],[1.42,.32],[.001,.34]],26),MATX(0x6a5c4a,{surf:'stone',repeat:2}));
  pedBase.position.set(0,0,AZ0+4.5);pedBase.receiveShadow=true;scene.add(pedBase);
  const pedM=new THREE.Mesh(latheGeo([[.001,0],[.92,0],[1.0,.12],[.92,.26],[.80,.32],[.001,.32]],26),pedMat);
  pedM.position.set(0,.34,AZ0+4.5);pedM.castShadow=true;pedM.receiveShadow=true;scene.add(pedM);
  addBox(0,.17,AZ0+4.5,3.1,.34,3.1,0x8a7a5a,{cast:false,solid:false}).mesh.material=pedMat;
  const CH_TOP=1.94;   // altura do topo do pedestal: onde o cálice se apoia
  // círculo duplo de runas (o cálice "acende" quando a Sentinela cai)
  const rune=new THREE.Mesh(new THREE.TorusGeometry(3.2,.1,8,44),new THREE.MeshBasicMaterial({color:0xff3020}));
  rune.rotation.x=-Math.PI/2;rune.position.set(0,.05,AZ0+4.5);scene.add(rune);
  for(let i=0;i<2;i++){const r2=new THREE.Mesh(new THREE.TorusGeometry(3.9+i*.5,.045,6,38),
    new THREE.MeshBasicMaterial({color:0xff6a30,transparent:true,opacity:.6}));
    r2.rotation.x=-Math.PI/2;r2.position.set(0,.04,AZ0+4.5);scene.add(r2);}
  addTorch(-4.5,0,AZ0+7,false);addTorch(4.5,0,AZ0+7,false);
  addTorch(-4.5,0,AZ0+1,false);addTorch(4.5,0,AZ0+1,false);
  POINT(0xffb070,44,26,1.7,0,4,AZ0+4.5,3);                // luz do pedestal
  spawnRelic(0,CH_TOP+.02,AZ0+4.5,true);
  idolPedestal=new THREE.Vector3(0,CH_TOP-.4,AZ0+4.5);

  // 🚪 PORTA DA FUGA (z = TZ0 = 52): separa o terraço do túnel e SÓ ABRE com o
  // CÁLICE. Dois consertos do "pisca e fecha":
  //  • a porta era DO MESMO TAMANHO do vão — face lateral encostada na face da
  //    parede = z-fighting (a laje piscava subindo). Agora ela é 8 cm mais
  //    estreita e bem mais fina que o vão: folga real, sem face coplanar.
  //  • a verga fina lá em cima (y 7,8) NÃO engolia a porta: ela subia e ficava
  //    FLUTUANDO gigante no ar. A verga agora desce até y=2,0 e engole a laje.
  wall(-11.75,WH/2,TZ0,16.5,WH,WT,WALL);wall(11.75,WH/2,TZ0,16.5,WH,WT,WALL);
  addBox(0,(2+WH)/2,TZ0,12,WH-2,1.7,0xffffff,{cast:false,mat:WALL_D}); // verga: y 2…9, recuada
  const d=addDoor(0,0,TZ0,6.84,4.2,1.4,'escape3',{lintelColor:wallD,skipLintel:true});
  d.open=false;

  // ─────────── 9) INIMIGOS ───────────
  // ⚔ INIMIGOS: 2 / 3 / 5 de CADA tipo + o CHEFE (sempre 1)
  spawnLevelEnemies({
    ogre:[[-13,0,16],[13,0,16],[13,0,0],[-13,0,-6],[-8,0,6]],
  },[0,0,4]);                                             // 🗿 A SENTINELA DO TEMPO
  spawnRelic(-15.5,1.1,20,false,2);spawnRelic(15.5,1.1,20,false,2);
  spawnRelic(-15.5,1.1,-15,false,2);spawnRelic(15.5,1.1,-15,false,2);
  spawnHeart(-16,1.1,2);spawnHeart(16,1.1,2);
  // caveiras dos que a Sentinela já esmagou
  for(const sx of [-1,1])for(let i=0;i<3;i++){
    const sk=new THREE.Mesh(new THREE.SphereGeometry(.16,7,6),MAT(0xe8e0cc));
    sk.position.set(sx*16.2+(Math.random()-.5),.45,AZ0+2+i*.55);sk.castShadow=true;scene.add(sk);
  }
  showMsgOnce('💡 DICA: empurre a Sentinela contra a PAREDE — ela martela e ATORDOA (⚡)!');
  showMsgOnce('🪢 DICA: o laço (G) NÃO quebra a pedra, mas a faz cair ATORDOADA (dano x2)!');
  showMsgOnce('🌀 COMO DESVIAR: o chão avisa onde vai cair o golpe (vermelho). Saia da marca, pule por cima da onda ou role com C (2 toques na direção). Rolar no tempo certo = ESQUIVA PERFEITA e tempo lento!');
  showMsgOnce('⚡ PARRY: bata com o chicote NA ANTECIPAÇÃO da Sentinela e você cancela o golpe!');
  // ─────────── 9) TÚNEL DE FUGA (z 52…63): só abre com o CÁLICE ───────────
  slab(0,(TZ0+TZ1)/2,TX*2+WT*2,TZ1-TZ0+WT*2);              // piso do túnel
  wall(-TX-1,WH/2,(TZ0+TZ1)/2,WT,WH,TZ1-TZ0+WT*2,WALL);    // muralha oeste
  wall( TX+1,WH/2,(TZ0+TZ1)/2,WT,WH,TZ1-TZ0+WT*2,WALL);    // muralha leste
  wall(0,WH/2,TZ1+1,TX*2+WT*2,WH,WT,WALL);                 // muro do fundo
  addBox(0,WH+.45,(TZ0+TZ1)/2,TX*2+WT*2,.9,TZ1-TZ0+WT*2,0xffffff,{cast:false,mat:WALL_D});
  setExit(0,0,59);
  // ⛩️ ALTAR DO SELO: emerge no túnel assim que a fuga termina — é ele que
  // rompe o selo do Cálice e libera o final. (sem ele, o portal não te deixa sair)
  addAltar(0,0,56.5,'altar3',{need:'fuga'});
  for(let z=TZ0+2;z<TZ1;z+=3.5)addTorch(z%7?-TX+1.6:TX-1.6,0,z,z%7?false:true);
  addGlowCrack(-2.6,.25,56,2.4,4);addGlowCrack(2.6,.25,60,2.4,4);
  POINT(0xffe0b0,44,22,1.6,0,4.5,57,4);
  return {spawn,needRelics:0,boss:true,name:'FASE 3 — CÂMARA DO CÁLICE',obj:'Derrote a Sentinela, pegue o CÁLICE e FUJA!'};
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
  levelIndex=i;health=maxHealth;stamina=100;relics=0;levelTime=0;whipCD=0;swingCD=0;iframes=0;vy=0;
  if(!player)player=buildPlayer();else scene.add(player);
  let info;
  if(i===0)info=buildLevel1();else if(i===1)info=buildLevel2();else info=buildLevel3();
  player.position.copy(info.spawn);safeSpot.copy(info.spawn);   // 🧍 ponto seguro começa no spawn
  yaw=0; // yaw 0 = olhando para -Z (templo)
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
  // 📖 tutorial SÓ na fase 1 e só se o jogador nunca pulou antes
  tutOn=false;tutStep=-1;tutMark=null;             // (o marcador é recriado pela fase)
  tutPanel.classList.add('hidden');
  if(i===0&&!tutDone)setTimeout(()=>{
    // o timer atrasado só pode PÔR o tutorial a andar: ele nunca reinicia um
    // tutorial que já está em andamento nem volta um que já foi concluído/pulado
    if(state!=='playing'||tutOn||tutDone)return;
    let skip=false;try{skip=localStorage.getItem(TUT_SKIP)==='1';}catch{}
    if(skip)return;
    startTutorial();
  },400);
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
  container.classList.toggle('focus',slowmoT>0);   // 🕰️ foco: vinheta azulada + tempo lento
  let se='';
  if(poisonT>0)se+=`<div class="se poison">☠️ VENENO ${Math.ceil(poisonT)}s<div class="se-bar"><div style="width:${poisonT/POISON_TIME*100}%"></div></div></div>`;
  if(burnT>0)se+=`<div class="se burn">🔥 QUEIMANDO ${burnT.toFixed(1)}s — ${BURN_DPS}/s<div class="se-bar"><div style="width:${burnT/BURN_TIME*100}%"></div></div></div>`;
  if(paraT>0)se+=`<div class="se para">⚡ PARALISADO ${Math.ceil(paraT)}s<div class="se-bar"><div style="width:${paraT/3*100}%"></div></div></div>`;
  if(bleedT>0)se+=`<div class="se bleed">🩸 SANGRAMENTO ${Math.ceil(bleedT)}s<div class="se-bar"><div style="width:${bleedT/8*100}%"></div></div></div>`;
  // ⚡ ATORDOADO: inimigo tonto (Sentinela martelou a parede, laço, etc.)
  if(boss&&!boss.dead&&boss.stun>0)se+=`<div class="se" style="border-color:#8ad7ff;color:#d9f2ff">⚡ SENTINELA ATORDOADA ${boss.stun.toFixed(1)}s — ATAQUE! (dano x2)</div>`;
  if(boss&&!boss.dead&&boss.hp<boss.max*.4)se+=`<div class="se" style="border-color:#ff5a3c;color:#ffd0c4">🔥 SENTINELA ENFURECIDA</div>`;
  if(swingCD>0)se+=`<div class="se" style="border-color:#ffe27a;color:#ffe27a">🌀 ARGOLA ${Math.ceil(swingCD)}s<div class="se-bar"><div style="width:${(1-swingCD/SWING_CD_MAX)*100}%;background:linear-gradient(90deg,#c9a227,#ffe27a)"></div></div></div>`;
  else se+=`<div class="se" style="border-color:#7dff9b;color:#c8ffd6">🌀 ARGOLA PRONTA (V)</div>`;
  if(secondChances>0)se+=`<div class="se" style="border-color:#ff6ec7;color:#ffd6ec">💖 CURA TUDO x${secondChances}</div>`;
  // 🌀 ESQUIVA: pronta / recarregando — o jeito de desviar do chefe
  if(dodgeCD>0)se+=`<div class="se" style="border-color:#8ad7ff;color:#d9f2ff">🌀 ESQUIVA ${dodgeCD.toFixed(1)}s<div class="se-bar"><div style="width:${(1-dodgeCD/DODGE_CD_MAX)*100}%"></div></div></div>`;
  else se+=`<div class="se" style="border-color:#8ad7ff;color:#d9f2ff">🌀 ESQUIVA PRONTA (C / 2 toques)</div>`;
  // 🎯 MIRA TRAVADA (Z)
  if(aimLock)se+=`<div class="se blink" style="border-color:#ff6a3c;color:#ffd8c4">🎯 MIRA TRAVADA: ${ALVO_NOME[aimLock.type]||aimLock.type} — Z solta</div>`;
  if(slowmoT>0)se+=`<div class="se" style="border-color:#ffe27a;color:#fff3c4">⏱ TEMPO LENTO ${slowmoT.toFixed(1)}s — bata!</div>`;
  // ✋ prompt de interação: sempre visível + piscando quando dá pra usar
  if(interactTarget&&!interactTarget.on)
    se+=`<div class="se blink" style="border-color:#ffd76a;color:#fff3c4">✋ aperte <b>E</b> — ${interactTarget.hint||'puxar alavanca'}</div>`;
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
    ms+=`<div class="${mark(idol?.taken)}">${tick(idol?.taken)} 🏆 Cálice da Âncora</div>`;
    ms+=`<div class="${mark(escaping)}">${tick(escaping)} 🏃 Fugir da caverna</div>`;
  }
  if(ms!==lastMissions){missionsSide.innerHTML=ms;lastMissions=ms;}
  // 🪢 ícone da habilidade: barra de recarga + brilho quando pronta
  // ⛓ G · H · Z lado a lado: barras de recarga e o estado da mira travada
  if(spinHud){
    spinFill.style.width=((1-Math.max(0,spinCD)/SPIN_CD_MAX)*100)+'%';
    spinHud.classList.toggle('ready',spinCD<=0&&stamina>=SPIN_COST);
  }
  if(aimHud)aimHud.classList.toggle('locked',!!aimLock);
  if(crosshairEl)crosshairEl.classList.toggle('locked',!!aimLock);
  if(aimTag){
    if(aimLock){
      aimTagName.textContent=ALVO_NOME[aimLock.type]||aimLock.type;
      aimTag.classList.remove('hidden');
    }else aimTag.classList.add('hidden');
  }
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
// ══════════════════════════════════════════════════════════════════════════
//  🌀 GIRO DO CHICOTE (H) — ATAQUE EM ÁREA
//  O herói dá uma volta completa de 360° e o chicote varre TODO o entorno,
//  acertando todo inimigo dentro do raio uma vez por giro. Custa fôlego,
//  tem recarga própria e dá um breve instante de invulnerabilidade (o corpo
//  girando "passa" por dentro do golpe). É a resposta para inimigo cercado.
// ══════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
//  🎯 MIRA TRAVADA (Z) — PRENDE A CÂMERA NUM INIMIGO
//  Aperte Z apontando para um inimigo: a câmera trava nele e acompanha até ele
//  sumir. Serve para não errar a mira em bicho pequeno ou pulando — e o
//  chicote acerta o alvo travado de qualquer ângulo. Z de novo solta. A mira
//  solta sozinha se o alvo morrer ou passar de 52 m.
// ══════════════════════════════════════════════════════════════════════════
function aimTargetPos(e,out){
  return out.set(e.mesh.position.x,e.mesh.position.y+(e.bodyH||1.9)*.55,e.mesh.position.z);
}
function doAimLock(){
  if(state!=='playing')return;
  if(aimLock){releaseAim('🎯 Mira solta.');return;}
  // 🎯 escolhe o mais ALINHADO com a mira (desempata pelo mais perto)
  tmpV.set(-Math.sin(yaw),0,-Math.cos(yaw));               // frente da câmera
  const fx=tmpV.x,fz=tmpV.z;
  let best=null,bestScore=1e9;
  for(const e of enemies){
    if(e.dead)continue;
    const dx=e.mesh.position.x-player.position.x,dz=e.mesh.position.z-player.position.z;
    const d=Math.hypot(dx,dz);
    if(d>AIM_MAX||d<.4)continue;
    const dot=(dx/d)*fx+(dz/d)*fz;                        // 1 = perfeitamente na frente
    if(dot<AIM_CONE/(Math.PI/2))continue;                 // fora do cone da mira
    const ang=Math.acos(Math.max(-1,Math.min(1,dot)));
    if(ang>AIM_CONE)continue;
    const score=ang*2.4+d*.015;                           // alinhamento pesa mais
    if(score<bestScore){bestScore=score;best=e;}
  }
  if(!best){
    showMsg('🎯 Nenhum inimigo na mira! Aponte para um e aperte Z.',2200);
    AudioSys.tone(160,.1,'square',.06);return;
  }
  aimLock=best;aimLockT=0;
  AudioSys.tone(1320,.13,'triangle',.1,1760);
  showMsg('🎯 MIRA TRAVADA: '+(ALVO_NOME[best.type]||best.type)+' — Z de novo solta',2600);
  tutEvent('aim');
  ensureAimReticle();
}
function releaseAim(msg){
  if(!aimLock)return;
  aimLock=null;aimLockT=0;
  if(aimReticle)aimReticle.visible=false;
  if(msg)showMsg(msg,1500);
  AudioSys.tone(520,.09,'triangle',.06,760);
}
function ensureAimReticle(){
  if(aimReticle)return;
  const g=new THREE.Group();
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.62,.035,6,26),
    new THREE.MeshBasicMaterial({color:0xff6a3c,transparent:true,opacity:.95,depthTest:false}));
  g.add(ring);
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2+Math.PI/4;
    const t=new THREE.Mesh(new THREE.BoxGeometry(.055,.28,.02),
      new THREE.MeshBasicMaterial({color:0xffd76a,transparent:true,opacity:.95,depthTest:false}));
    t.position.set(Math.cos(a)*.78,Math.sin(a)*.78,0);t.rotation.z=a-Math.PI/2;g.add(t);
  }
  g.renderOrder=999;scene.add(g);
  aimReticle=g;
}
function updateAimLock(dt){
  if(tryAim){tryAim=false;doAimLock();}
  if(!aimLock)return;
  aimLockT+=dt;
  const e=aimLock;
  if(e.dead){releaseAim('💀 Alvo abatido — mira solta.');return;}
  const d=e.mesh.position.distanceTo(player.position);
  if(d>AIM_MAX){releaseAim('🎯 Alvo longe demais — mira solta.');return;}
  // a câmera vira para o alvo (yaw = direção; pitch = altura do peito)
  const dx=e.mesh.position.x-player.position.x,dz=e.mesh.position.z-player.position.z;
  const horiz=Math.hypot(dx,dz)||.001;
  const dy=(e.mesh.position.y+(e.bodyH||1.9)*.55)-(player.position.y+2.1);
  let ty=Math.atan2(-dx,-dz);
  let dyaw=ty-yaw;while(dyaw>Math.PI)dyaw-=Math.PI*2;while(dyaw<-Math.PI)dyaw+=Math.PI*2;
  const k=Math.min(1,dt*11);                               // acompanha suave
  yaw+=dyaw*k;
  pitch+=(Math.atan2(dy,horiz)-pitch)*k;
  pitch=Math.max(-1.1,Math.min(.5,pitch));
  // retículo fica no peito do alvo, sempre de frente para a câmera
  ensureAimReticle();
  aimReticle.visible=true;
  aimReticle.position.copy(e.mesh.position).y+= (e.bodyH||1.9)*.55;
  aimReticle.quaternion.copy(camera.quaternion);
  const t=performance.now()*.006;
  aimReticle.scale.setScalar(1+Math.sin(t*2.4)*.06);
  aimReticle.children[0].material.opacity=.75+Math.sin(t*3)*.2;
}
function doSpin(){
  if(state!=='playing'||spinCD>0||spinT>0)return;
  if(swinging){showMsg('🌀 Não dá p/ girar no ar — está voando!',1500);return;}
  if(paraT>0)return;                                   // ⚡ paralisado NÃO gira
  if(stamina<SPIN_COST){
    showMsg('😮‍💨 Fôlego insuficiente para o giro! Espere o respirar.',1600);
    AudioSys.tone(90,.12,'sawtooth',.09);return;
  }
  stamina-=SPIN_COST;
  spinCD=SPIN_CD_MAX;spinT=SPIN_DUR;spinYaw0=player.rotation.y;spinHits.clear();
  whipAnim=SPIN_DUR;                                   // o braço ergue (pose do chicote)
  iframes=Math.max(iframes,.26);                      // o giro é também uma esquiva curta
  AudioSys.whip();AudioSys.noise(.34,.17);shake=Math.max(shake,.4);
  spawnShockRing(player.position.clone(),SPIN_R,.42);
  for(let i=0;i<20;i++)spawnSpark(player.position.clone().add(new THREE.Vector3((Math.random()-.5)*SPIN_R,.3+Math.random()*.9,(Math.random()-.5)*SPIN_R)));
  showMsg('🌀 GIRO DO CHICOTE!',1200);
  tutEvent('spin');
}
function updateSpin(dt){
  if(spinCD>0)spinCD-=dt;
  if(spinT<=0)return;
  spinT-=dt;
  const p=1-Math.max(0,spinT)/SPIN_DUR;                 // 0→1 da volta
  // 🌀 acelera e desacelera: o corpo "enrola" e "solta" a chicotada (smoothstep)
  const e=p*p*(3-2*p);
  player.rotation.y=spinYaw0+e*Math.PI*2;
  let n=0;
  for(const e of enemies){
    if(e.dead||spinHits.has(e))continue;
    const dyW=e.mesh.position.y-player.position.y;
    if(Math.abs(dyW)>(e.bodyH||1.9)+1.4)continue;       // voou alto demais: o chicote passa por baixo
    const to=new THREE.Vector3().subVectors(e.mesh.position,player.position);to.y=0;
    const dist=to.length();
    const reach=(e.hitR||2.2)+SPIN_R*.62;               // o giro "varre" mais longe que o chicote
    if(dist>reach)continue;
    to.normalize();
    spinHits.add(e);n++;
    // 🌀 DANO FIXO: o giro tira 30 de cada inimigo que ele varre — sempre,
    // sem depender da arma nem da dificuldade (a Sentinela também leva 30).
    let base=SPIN_DMG;
    // ⚡ PARRY: girar durante a antecipação da Sentinela também cancela o golpe
    if(e.type==='golem'&&tryParrySentinel(e))base*=2;
    // ⚡ ATORDOADO leva DANO DOBRADO
    e.hp-=e.stun>0?base*2:base;
    e.cd=Math.max(e.cd||0,.42);
    // 🌀 EMPURRÃO: varre TODO MUNDO pra longe — o inimigo DESLIZA para trás
    // (velocidade que freia no chão), sem teleportar. O golem pesa e resiste.
    e.kb=(e.kb||new THREE.Vector3()).addScaledVector(to,e.type==='golem'?9:24);
    for(let i=0;i<5;i++)spawnSpark(e.mesh.position.clone().add(new THREE.Vector3((Math.random()-.5)*.9,(e.bodyH||1.9)*(.4+Math.random()*.4),(Math.random()-.5)*.9)));
    if(e.stun>0)spawnShockRing(e.mesh.position.clone(),3,.3);
    else spawnShockRing(e.mesh.position.clone(),2.2,.26);   // 💨 anel do impacto do empurrão
    if(e.hp<=0)killEnemy(e);
    else AudioSys.tone(200,.09,'square',.07);
  }
  if(n)shake=Math.max(shake,.45);
  if(spinT<=0){spinT=0;spinHits.clear();}
}
function doWhip(){
  // CHICOTE (Clique / F): SÓ ATACA — nunca usa argola!
  // (o swing na argola é EXCLUSIVO da tecla V via doSwing)
  if(whipCD>0||state!=='playing')return;
  whipCD=WHIP_CD;whipAnim=.35;AudioSys.whip();
  // efeito visual: estende ponta
  const fwd=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  // INIMIGO NA FRENTE? Ataca!
  let hitAny=false;
  for(const e of enemies){
    if(e.dead)continue;
    const dyW=e.mesh.position.y-player.position.y;
    if(Math.abs(dyW)>(e.bodyH||1.9)+1.3)continue; // pulou por cima / morcego alto demais: chicote não alcança
    const to=new THREE.Vector3().subVectors(e.mesh.position,player.position);to.y=0;
    const dist=to.length();
    const reach=e.hitR||2.2;
    const effReach=reach*(WHIP_REACH/2.2);
    if(dist<effReach&&e===TUT_DUMMY)tutEvent('whipDummy');
    if(dist<effReach){
      const ang=to.normalize().angleTo(fwd);
      // 🎯 MIRA TRAVADA: o alvo apontado é acertado de qualquer ângulo
      if(ang<1.1||dist<1.4||e===aimLock){
        // ⚡ ATORDOADO leva DANO DOBRADO — a janela de ataque da Sentinela
        let base=e.type==='golem'?Math.max(10,WHIP_DMG-16):WHIP_DMG;
        // ⚡ PARRY: bater durante a antecipação cancela o golpe e expõe a Sentinela
        if(e.type==='golem'&&tryParrySentinel(e))base*=2;
        e.hp-=e.stun>0?base*2:base;
        e.cd=.5;hitAny=true;
        if(e.stun>0)spawnSpark(e.mesh.position.clone().add(new THREE.Vector3(0,(e.bodyH||2)*.5,0)));
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
  // Clique/F NUNCA usa argola: se não acertou nada, só o estalo no ar.
  if(!hitAny){
    // dica rápida se houver argola por perto (ensina que é só no V)
    const ngHint=nearestGrapple();
    if(ngHint)showMsg('🌀 Argola só no V! (clique/F é só ataque)',1600);
  }
}
// ---------- TECLA V: ÚNICO jeito de usar a ARGOLA! (com cooldown anti-spam) ----------
function doSwing(){
  if(state!=='playing')return;
  if(swinging)return;
  if(paraT>0){showMsg('⚡ Paralisado! Não dá pra voar!',1200);return;}
  if(swingCD>0){showMsg('🌀 Argola recarregando... aguarde '+Math.ceil(swingCD)+'s!',1400);AudioSys.tone(220,.12,'square',.07,-40);return;}
  const ng=nearestGrapple();
  if(!ng){showMsg('🌀 Sem argola por perto! Chegue mais perto do anel dourado e aperte V!',1800);AudioSys.tone(200,.15,'square',.08,-50);return;}
  if(whipCD>0)return;
  whipCD=WHIP_CD;swingCD=SWING_CD_MAX;whipAnim=.35;AudioSys.whip();AudioSys.swing();
  const best=ng.g;
  showMsg('🌀 V! WHIP-SWING! Segure o chapéu! (próximo em '+SWING_CD_MAX+'s)',2000);
  best.kick=1;
  spawnSpark(best.pos.clone());
  const to=aimLanding()||swingFallback();
  swinging={t:0,from:player.position.clone(),to,ring:best.pos.clone(),gr:best,dustDone:false,safe:player.position.clone()};
  tutEvent('swing');
  if(landingMarker)landingMarker.visible=false;
}
function doLasso(){
  // 🪢 HABILIDADE (G): laça o inimigo mais próximo (14m), ARRANCA do chão,
  // gira no ar e BATE NO CHÃO com força. Inimigo comum morre; a SENTINELA é
  // só ATORDOADA (a laça não tem força de quebrar a pedra do tempo).
  if(state!=='playing'||lassoCD>0)return;
  let best=null,bestD=14;
  for(const e of enemies){
    if(e.dead||e.lassoed||e.tutHome)continue;   // o boneco de treino não é laçado
    const d=Math.hypot(e.mesh.position.x-player.position.x,e.mesh.position.z-player.position.z);
    const dy=Math.abs((e.mesh.position.y-player.position.y));
    if(dy>3.2)continue;                    // não pega morcego lá no alto
    const w=e.type==='golem'?2.4:1;        // a sentinela é a presa mais "longe"
    if(d<bestD*w){bestD=d;best=e;}
  }
  // 🧲 ITEM NO CHÃO TAMBÉM É LAÇÁVEL: se um drop estiver mais perto que o inimigo,
  // o laço puxa o item direto pra mão (com animação de voar até o herói).
  let bestP=null,bestPD=14;
  for(const p of pickups){
    if(p.taken||p.lassoed)continue;
    const d=Math.hypot(p.mesh.position.x-player.position.x,p.mesh.position.z-player.position.z);
    if(Math.abs(p.mesh.position.y-player.position.y)>3.2)continue;
    if(d<bestPD){bestPD=d;bestP=p;}
  }
  if(bestP&&(!best||bestPD<bestD)){
    lassoCD=LASSO_MAX*DIFF.lassoCd;
    lassoPick={p:bestP,t:0,dur:.52,from:bestP.mesh.position.clone()};
    bestP.lassoed=true;bestP.t=0;
    whipAnim=.35;
    AudioSys.whip();AudioSys.noise(.28,.14);
    spawnSpark(bestP.mesh.position.clone().add(new THREE.Vector3(0,.25,0)));
    showMsg(bestP.heart?'🧲 LAÇOU O KIT DE VIDA!':bestP.skill?'🧲 LAÇOU A POÇÃO!':'🧲 LAÇOU O FRAGMENTO!',1500);
    if(lassoRope)lassoRope.visible=true;
    return null;
  }
  if(!best){showMsg('🪢 Nenhum inimigo ou item ao alcance do laço!',1500);return;}
  lassoCD=LASSO_MAX*DIFF.lassoCd;
  const isBoss=best.type==='golem';
  // estado do laço: a presa voa até o herói, sobe, gira e cai no chão
  best.lassoed={t:0,dur:isBoss?1.5:1.05,from:best.mesh.position.clone(),
    phase:'pull',spin:0,hit:false,spinDir:Math.random()<.5?1:-1};
  best.squeezed=0;                            // cancela o "esganar" antigo
  best.atk=0;best.atkT=0;best.struck=false;   // não ataca enquanto está pendurado
  best.vel=new THREE.Vector3();
  whipAnim=.35;
  AudioSys.whip();AudioSys.noise(.35,.18);
  spawnSpark(best.mesh.position.clone().add(new THREE.Vector3(0,best.bodyH*.5,0)));
  showMsg(isBoss?'🪢 LAÇADA! Você puxou a SENTINELA — segure firme!':'🪢 LAÇADA! Puxando o inimigo!',1600);
  if(lassoRope)lassoRope.visible=true;
  return best;
}
// 🧲 ITEM LAÇADO: voa girando até a MÃO do herói e só então é coletado
function updateLassoPick(dt){
  if(!lassoPick)return;
  const L=lassoPick,p=L.p;
  if(!p||p.taken){lassoPick=null;clearLassoRope();return;}
  L.t+=dt;
  const k=Math.min(1,L.t/L.dur);
  const hand=tmpV.set(0,0,0);
  hand.set(.365,1.02,.12);
  if(player.userData?.rig)player.userData.rig.localToWorld(hand);
  // arco: sobe um pouco no meio do caminho (igualzinho o laço no inimigo)
  p.mesh.position.x+=(hand.x-p.mesh.position.x)*Math.min(1,dt*11);
  p.mesh.position.z+=(hand.z-p.mesh.position.z)*Math.min(1,dt*11);
  p.mesh.position.y+=(hand.y-p.mesh.position.y+Math.sin(k*Math.PI)*1.15-p.mesh.position.y)*Math.min(1,dt*11);
  p.mesh.rotation.x+=dt*11;                       // gira no ar enquanto voa
  p.mesh.rotation.y+=dt*9;
  if(p.halo)p.halo.scale.setScalar(1+k*.5);
  if(k>=1){
    lassoPick=null;
    collectPickup(p);        // chegou na mão: vale a mesma animação de coleta
    clearLassoRope();
  }
}
// 🪢 atualiza a animação do laço: puxa → ergue → gira → ESMAGA no chão
function updateLassoTargets(dt){
  for(const e of enemies){
    const L=e.lassoed;
    if(!L||e.dead)continue;
    L.t+=dt;
    const k=Math.min(1,L.t/L.dur);
    const headY=player.position.y+1.35;
    if(L.phase==='pull'){            // voa na direção do herói (laço esticado)
      e.mesh.position.lerp(tmpV.set(player.position.x,headY,player.position.z),Math.min(1,dt*9));
      e.mesh.rotation.y+=dt*6;
      if(k>=.45||e.mesh.position.distanceTo(player.position)<2.4){L.phase='lift';L.t=0;AudioSys.noise(.2,.1);}
    }else if(L.phase==='lift'){      // sobe girando acima da cabeça (onda circular)
      const a=L.t*11*L.spinDir;
      e.mesh.position.x+=(player.position.x+Math.cos(a)*1.7-e.mesh.position.x)*Math.min(1,dt*11);
      e.mesh.position.z+=(player.position.z+Math.sin(a)*1.7-e.mesh.position.z)*Math.min(1,dt*11);
      e.mesh.position.y+=((headY+1.5+(e.type==='golem'?2.4:.7)*Math.sin(Math.min(1,L.t/.42)*Math.PI))-e.mesh.position.y)*Math.min(1,dt*12);
      e.mesh.rotation.y+=dt*16*L.spinDir;
      if(Math.random()<dt*10)spawnSpark(e.mesh.position.clone().add(new THREE.Vector3(0,e.bodyH*.4,0)));
      if(L.t>=.42){L.phase='drop';L.t=0;L.dropFrom=e.mesh.position.clone();L.hit=false;}
    }else if(L.phase==='drop'){      // CAI E BATÊ NO CHÃO
      const f=Math.min(1,L.t/.22);
      e.mesh.position.y=L.dropFrom.y*(1-f*f);
      e.mesh.rotation.x+=(Math.PI/2-e.mesh.rotation.x)*Math.min(1,dt*16);
      if(!L.hit&&f>=.98){
        L.hit=true;
        const gy=groundY(e.mesh.position.x,e.mesh.position.z);
        e.mesh.position.set(e.mesh.position.x,gy+.1,e.mesh.position.z);
        e.mesh.rotation.set(0,0,0);e.mesh.scale.setScalar(1);
        e.lassoed=null;
        AudioSys.noise(.55,.3);shake=Math.max(shake,e.type==='golem'?.75:.45);
        spawnShockRing(e.mesh.position.clone(),e.type==='golem'?7:3.4,.45);
        for(let i=0;i<10;i++)spawnSpark(e.mesh.position.clone().add(new THREE.Vector3((Math.random()-.5)*1.6,.2,(Math.random()-.5)*1.6)));
        if(e.type==='golem'){
          // a SENTINELA não quebra: fica atordoada (janela de dano dobrado)
          e.hp-=Math.max(30,WHIP_DMG);   // a laço fere, mas NÃO mata
          if(e.hp<=0){e.hp=0;killEnemy(e);return;}
          applyStun(e,3.2,'⚡ A SENTINELA CAIU! Atordoada — bata agora (dano x2)!');
        }else{
          killEnemy(e);                   // esmaga no chão: inimigo normal morre
          return;
        }
      }
    }
  }
}
let swinging=null;
let landingMarker=null; // 🎯 anel que mostra onde o voo de chicote vai pousar
// ---------- POOL DE FAÍSCAS ----------
// Antes: cada faísca criava geometria + material novos (centenas por segundo de
// boss = GC e upload de buffer). Agora: 48 faíscas reaproveitadas em rodízio.
const SPARK_N=48;
const sparks=[];
let sparkGeo=null,sparkCursor=0;
function ensureSparks(){
  if(sparkGeo)return;
  sparkGeo=new THREE.SphereGeometry(.12,6,6);
  for(let i=0;i<SPARK_N;i++){
    const m=new THREE.Mesh(sparkGeo,new THREE.MeshBasicMaterial({color:0xffe27a,transparent:true}));
    m.visible=false;m.castShadow=false;m.userData.keepAlive=true;scene.add(m);
    sparks.push({m,t:0,live:false});
  }
}
function spawnSpark(p){
  ensureSparks();
  let s=null;
  for(let i=0;i<SPARK_N;i++){const c=sparks[(sparkCursor+i)%SPARK_N];if(!c.live){s=c;sparkCursor=(sparkCursor+i+1)%SPARK_N;break;}}
  if(!s)s=sparks[sparkCursor=(sparkCursor+1)%SPARK_N];   // tudo ocupado: recicla a mais antiga
  s.t=.3;s.live=true;s.m.visible=true;s.m.position.copy(p);s.m.scale.setScalar(1);
  s.m.material.opacity=1;
  return s.m;
}
// ══════════════════════════════════════════════════════════════════════════
//  🗿 SENTINELA DERROTADA — ela NÃO MORRE: cai de JOELHOS
//  Quando o Relógio quebra, a colossal não desaba morta. Ela se tomba, amassa
//  um joelho no chão, segura o peso numa mão e fica ali, de joelhos, partida.
//  Só então o pedestal acende e o Cálice pode ser tomado.
// ══════════════════════════════════════════════════════════════════════════
function defeatSentinel(e){
  if(e.defeated)return;
  e.dead=true;e.defeated=true;e.kneelT=0;e.atk=0;
  AudioSys.pickup();AudioSys.roar();
  score+=1000;kills++;
  showMsg('🗿 A SENTINELA CAIU DE JOELHOS! O pedestal acendeu — pegue a ÂNCORA!',5200);
  const p=e.mesh.position.clone();
  shake=1.1;
  for(let i=0;i<40;i++)spawnSpark(p.clone().add(new THREE.Vector3((Math.random()-.5)*3.4,Math.random()*4.6,(Math.random()-.5)*3.4)));
  spawnShockRing(p.clone(),7,.7);
  // 🎬 CUTSCENE: o relógio para e ela se rende
  state='cutscene';
  document.exitPointerLock?.();
  cutCam.fov=50;
  setOgreEyes(e,0x101010);
  cutscenes.start([
    {k:'O RELÓGIO PARA',t:'O mostrador do peito estala',
     x:'O ponteiro do meio para. As rachaduras de lava no peito apagam uma a uma, e o <b>Relógio</b> — que te caçou por mil anos — simplesmente <b>para de funcionar</b>.',
     cam:[p.x+7,p.y+3.2,p.z+7,p.x,p.y+3,p.z]},
    {k:'A PESO',t:'Ela não cai',
     x:'A Sentinela não desaba morta. Ela <b>amassa o joelho</b> no chão, segura o próprio peso com as duas mãos de punho e fica de pé, vazia — como uma catedral sem campanário.',
     cam:[p.x-6,p.y+2.4,p.z+6,p.x,p.y+2.2,p.z]},
    {k:'O CÁLICE',t:'O pedestal acende',
     x:'O pedestal no fundo da câmara se ilumina e o <b>Cálice da Âncora</b> aparece. Ela não morreu — apenas <b>perdeu</b>. E a fuga ainda não acabou.',
     cam:[0,3.4,p.z+9,0,2.6,p.z+2]},
  ],0,()=>{
    cutCam.fov=62;camera.updateProjectionMatrix();
    state='playing';
    showMsg('🏆 Pegue o CÁLICE no pedestal — e CORRA!',4600);
  });
}
// a pose de joelhos: um joelho no chão, o outro plantado, tronco curvado,
// cabeça baixa, punhos apoiados. Fica assim para sempre — derrotada, não morta.
function sentinelKneel(e,dt){
  const S=e.mesh.userData.sentinel;
  if(!S)return;
  if(e.kneelFloor===undefined)e.kneelFloor=e.mesh.position.y;
  e.kneelT=Math.min(1.5,(e.kneelT||0)+dt);
  const k=e.kneelT/1.5;
  const eo=1-Math.pow(1-k,3);                       // suaviza a queda
  // 🦵 um joelho no chão (perna de trás dobrada), o outro pé plantado à frente
  if(S.legs){
    S.legs[0].rotation.x=1.85*eo;
    S.legs[1].rotation.x=-.95*eo;
    S.legs[0].position.y=2.05-.5*eo;
    S.legs[1].position.y=2.05;
  }
  // o corpo cede SÓ um pouco (o peso mora no joelho dobrado) e inclina para a
  // FRENTE — nunca tomba de lado nem de costas, nunca afunda no chão
  e.mesh.position.y=e.kneelFloor-.5*eo;
  e.mesh.rotation.x=-.32*eo;
  e.mesh.rotation.z=0;
  // cabeça e coroa pendem para a frente
  if(S.head)S.head.rotation.x=.72*eo;
  if(S.brow)S.brow.rotation.x=.4*eo;
  // os dois punhos ficam apoiados no chão à frente
  if(S.armL){S.armL.rotation.x=-1.2*eo;S.armL.rotation.z=.3*eo;}
  if(S.armR){S.armR.rotation.x=-1.1*eo;S.armR.rotation.z=-.3*eo;}
  // o núcleo apaga, os olhos morrem, o pêndulo quase para
  if(S.core){S.core.scale.setScalar(1-.45*eo);S.core.material.color.setHex(0x2a1206);}
  if(S.eyes)for(const m of S.eyes)m.color.setHex(0x101010);
  if(S.coreLight)S.coreLight.intensity=16*(1-.7*eo);
  if(S.pend)S.pend.rotation.z=Math.sin(e.t*.6)*.12*eo;
}
function killEnemy(e){
  if(e.type==='golem'){defeatSentinel(e);return;}
  e.dead=true;AudioSys.pickup();
  score+=e.type==='golem'?1000:e.type==='guard'?150:e.type==='ogre'?200:100;
  showMsg(e.type==='golem'?'🗿 SENTINELA DESTRUÍDA! Pegue a ÂNCORA!':e.type==='ogre'?'👹 OGRO SENTINELA derrotado! +200':'+'+(e.type==='guard'?'150':'100')+' — inimigo derrotado!');
  // some afundando
  if(e.type==='golem'){AudioSys.roar();shake=.8;}
  // 🪢 morte por laço NÃO dropa coração (evita cura grátis colada no player + teste determinístico!)
  if(e.tutHome){   // 🧪 o boneco de treino SEMPRE deixa um item (passo 3 do tutorial)
    spawnHeart(e.mesh.position.x,e.mesh.position.y+.5,e.mesh.position.z);
  }
  else if(e.lassoKilled){
    if(Math.random()<SKILL_DROP_CHANCE)spawnSkillPotion(e.mesh.position.x,e.mesh.position.y+.5,e.mesh.position.z);
  }
  else if(Math.random()<Math.min(1,LIFE_DROP_CHANCE*DIFF.drop)){spawnHeart(e.mesh.position.x,e.mesh.position.y+.5,e.mesh.position.z);}
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
    objEl.textContent=`Alavancas ${on.length}/2 • Fragmentos ${relics}/${currentInfo.needRelics}`;
  }
  // ⛩️ Com os requisitos fechados, o ALTAR emerge e a porta SÓ abre pelo livro dele
  if(levelIndex===0&&relics>=currentInfo.needRelics)objEl.textContent='⛩️ Vá até o altar que emergiu e aperte E no livro 📖';
  if(levelIndex===1&&relics>=currentInfo.needRelics){
    const on=levers.filter(l=>l.on).length;
    if(on>=2)objEl.textContent='⛩️ Vá até o altar que emergiu e aperte E no livro 📖';
    else showMsg(`⛩️ O altar espera as alavancas também! (${on}/2)`,2600);
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
  const raw=Math.min(clock.getDelta(),.05);
  // 🕰️ FOCO (bullet time): na ESQUIVA PERFEITA o mundo inteiro desacelera
  const inFocus=slowmoT>0;
  if(inFocus)slowmoT=Math.max(0,slowmoT-raw);
  const dt=raw*(inFocus?SLOWMO_SCALE:1);
  if(state==='cutscene'){
    // 🎬 cutscene: só a câmera e o ambiente se mexem (a legenda é HTML)
    updateCutscene(dt);
    updateVegetation(dt);updateFx(dt);
    for(const o of torches){o.flame.scale.setScalar(1+Math.sin(performance.now()*.008+o.seed)*.15);}
  }
  else if(state==='playing'){tick(dt);renderer.render(scene,camera);return;}
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
  // 💥 ARMADILHA: o corpo inteiro tomba, desliza no chão e se levanta (prioridade sobre tudo)
  if(downT>0){
    const k=1-downT/DOWN_DUR;
    const tuck=Math.sin(Math.min(1,k*1.15)*Math.PI);
    u.rig.rotation.x=-k*Math.PI*2;            // rodada para trás
    u.rig.rotation.z=Math.sin(k*Math.PI)*.26;
    u.rig.position.y=-Math.sin(k*Math.PI)*.5;
    const kb=Math.min(1,dt*20);
    u.legL.rotation.x+=(-.55-u.legL.rotation.x)*kb;
    u.legR.rotation.x+=(-.45-u.legR.rotation.x)*kb;
    if(u.kneeL)u.kneeL.rotation.x+=(1.7*tuck-u.kneeL.rotation.x)*kb;
    if(u.kneeR)u.kneeR.rotation.x+=(1.6*tuck-u.kneeR.rotation.x)*kb;
    u.armL.rotation.x+=(-1.2-u.armL.rotation.x)*kb;
    u.armR.rotation.x+=(-1.15-u.armR.rotation.x)*kb;
    if(u.elbowL)u.elbowL.rotation.x+=(-1.7-u.elbowL.rotation.x)*kb;
    if(u.elbowR)u.elbowR.rotation.x+=(-1.6-u.elbowR.rotation.x)*kb;
    if(u.head){u.head.rotation.x+=(-.3-u.head.rotation.x)*kb;u.head.rotation.y*=Math.max(0,1-dt*6);}
    if(u.bag){u.bag.rotation.x=-.42;u.bag.rotation.z=.22;}
    return;
  }
  // 🌀 ESQUIVA: rodada completa de 360° no eixo do corpo (a pose vem da física, não do rig)
  if(dodgeT>0){
    const k=1-dodgeT/DODGE_DUR;
    const tuck=Math.sin(Math.min(1,k*1.2)*Math.PI);
    u.rig.rotation.x=k*Math.PI*2;
    u.rig.rotation.z*=.86;
    u.rig.position.y=-Math.sin(k*Math.PI)*.42;
    const kb=Math.min(1,dt*24);
    u.legL.rotation.x+=(-1.3*tuck-u.legL.rotation.x)*kb;
    u.legR.rotation.x+=(-1.2*tuck-u.legR.rotation.x)*kb;
    if(u.kneeL)u.kneeL.rotation.x+=(2.05*tuck-u.kneeL.rotation.x)*kb;
    if(u.kneeR)u.kneeR.rotation.x+=(1.9*tuck-u.kneeR.rotation.x)*kb;
    u.armL.rotation.x+=(-1.5*tuck-u.armL.rotation.x)*kb;
    u.armR.rotation.x+=(-1.45*tuck-u.armR.rotation.x)*kb;
    if(u.elbowL)u.elbowL.rotation.x+=(-1.95*tuck-u.elbowL.rotation.x)*kb;
    if(u.elbowR)u.elbowR.rotation.x+=(-1.85*tuck-u.elbowR.rotation.x)*kb;
    if(u.head){u.head.rotation.x+=(-.45-u.head.rotation.x)*kb;u.head.rotation.y*=Math.max(0,1-dt*6);}
    if(u.bag){u.bag.rotation.x=-.42;u.bag.rotation.z=.22;}
    const yawD=Math.atan2(dodgeDirX,dodgeDirZ);
    let d=yawD-player.rotation.y;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
    player.rotation.y+=d*Math.min(1,dt*16);
    return;
  }
  // ao sair da rolagem, o corpo volta a assentar
  u.rig.rotation.x*=Math.max(0,1-dt*9);
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
  if(onGround){if(airTime>0.25)landCrouch=0.20;airTime=0;}else{airTime+=dt;}
  if(landCrouch>0)landCrouch-=dt;
  const landK=Math.max(0,landCrouch/0.20); // 1→0 (aterrissagem curta e leve)
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
  const kF=Math.min(1,dt*(spd>0.4?24:13));   // pernas seguem o corpo sem atraso
  const kS=Math.min(1,dt*16);                 // braços/cotovelo bem mais ágeis
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
// ---------- EFEITO QUEBRAR (frasco de habilidade / estilhaços) ----------
// Pool de cacos reaproveitados: quando o frasco quebra, voam pedaços de vidro
// que giram, caem e apagam. Nada de alocar geometria a cada coleta.
const SHARD_N=40;
const shards=[];
let shardGeo=null, shardCursor=0;
function ensureShards(){
  if(shardGeo)return;
  shardGeo=new THREE.TetrahedronGeometry(.085,0);
  for(let i=0;i<SHARD_N;i++){
    const m=new THREE.Mesh(shardGeo,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true}));
    m.visible=false;m.castShadow=false;m.userData.keepAlive=true;scene.add(m);
    shards.push({m,t:0,life:1,vx:0,vy:0,vz:0,live:false});
  }
}
// pos: onde quebra · col: cor · n: quantos cacos · pw: força · flat: caco "chapado"
function shatter(pos,col,n=14,pw=1,flat=false){
  ensureShards();
  for(let i=0;i<n;i++){
    let sh=null;
    for(let k=0;k<SHARD_N;k++){const c=shards[(shardCursor+k)%SHARD_N];if(!c.live){sh=c;shardCursor=(shardCursor+k+1)%SHARD_N;break;}}
    if(!sh)sh=shards[shardCursor=(shardCursor+1)%SHARD_N];
    const a=Math.random()*Math.PI*2, e=Math.random()*.95+.15;
    sh.live=true;sh.t=0;sh.life=.55+Math.random()*.45;
    sh.m.visible=true;sh.m.material.color.setHex(col);
    sh.m.material.opacity=1;
    sh.m.position.copy(pos);
    sh.m.position.x+=(Math.random()-.5)*.22;
    sh.m.position.y+=(Math.random()-.5)*.22;
    sh.m.position.z+=(Math.random()-.5)*.22;
    sh.m.rotation.set(Math.random()*6,Math.random()*6,Math.random()*6);
    const sp=(2.4+Math.random()*3.4)*pw;
    sh.vx=Math.cos(a)*Math.cos(e)*sp*.55;
    sh.vz=Math.sin(a)*Math.cos(e)*sp*.55;
    sh.vy=(1.6+Math.random()*3)*pw;
    sh.m.scale.set(1,flat?.28:1,flat?.7:1);
    sh.m.userData.spin=6+Math.random()*10;
  }
}
function updateShards(dt){
  for(const s of shards){
    if(!s.live)continue;
    s.t+=dt;
    if(s.t>=s.life){s.live=false;s.m.visible=false;continue;}
    s.vy-=16*dt;                       // cai de volta
    s.m.position.x+=s.vx*dt;
    s.m.position.y+=s.vy*dt;
    s.m.position.z+=s.vz*dt;
    if(s.m.position.y<.06){s.m.position.y=.06;s.vy*=-.28;s.vx*=.6;s.vz*=.6;}
    s.m.rotation.x+=dt*s.m.userData.spin;
    s.m.rotation.z+=dt*s.m.userData.spin*.7;
    const k=1-s.t/s.life;
    s.m.material.opacity=Math.min(1,k*1.6);
    s.m.scale.setScalar(Math.max(.15,k*.6+.4));
  }
}
// 💥 "pop" do item: anel fino que se abre e some
const popRings=[];
let popGeo=null;
function shockRingPop(pos,col){
  if(!popGeo)popGeo=new THREE.RingGeometry(.55,.72,26);
  let r=popRings.find(x=>!x.live);
  if(!r){
    if(popRings.length>=4)return;
    const m=new THREE.Mesh(popGeo,new THREE.MeshBasicMaterial({color:col,transparent:true,side:THREE.DoubleSide}));
    m.rotation.x=-Math.PI/2;m.renderOrder=3;scene.add(m);
    r={m,t:0,live:false};popRings.push(r);
  }
  r.live=true;r.t=0;r.m.visible=true;r.m.material.color.setHex(col);
  r.m.material.opacity=.9;r.m.position.set(pos.x,pos.y+.12,pos.z);r.m.scale.setScalar(.5);
}
function updatePopRings(dt){
  for(const r of popRings){
    if(!r.live){if(r.m.visible)r.m.visible=false;continue;}
    r.t+=dt;
    const k=Math.min(1,r.t/.42);
    if(k>=1){r.live=false;r.m.visible=false;continue;}
    r.m.scale.setScalar(.5+k*2.2);
    r.m.material.opacity=(1-k)*.9;
  }
}

// ══════════ PROMPT "APERTE E" ══════════
// Chegou perto de uma alavanca e não tinha NADA indicando o que fazer.
// Agora aparece uma tecla E dourada flutuando e virada pra câmera, e o HUD
// também avisa. Sem isso o jogador chega na alavanca e trava.
const promptTex={};
function pressKeyTexture(key){
  if(promptTex[key])return promptTex[key];
  const c=document.createElement('canvas');c.width=128;c.height=128;
  const g=c.getContext('2d');
  // "tecla" com fundo escuro e borda dourada
  g.fillStyle='#15100a';
  g.beginPath();
  if(g.roundRect)g.roundRect(8,8,112,112,20);else g.rect(8,8,112,112);
  g.fill();
  g.lineWidth=9;g.strokeStyle='#ffd76a';g.stroke();
  g.fillStyle='#ffe9a8';g.font='bold 76px sans-serif';g.textAlign='center';g.textBaseline='middle';
  g.fillText(key,64,68);
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace;
  promptTex[key]=t;return t;
}
let pressPrompt=null;
function ensurePressPrompt(){
  if(pressPrompt)return;
  const grp=new THREE.Group();
  const glow=new THREE.Mesh(new THREE.PlaneGeometry(1.15,1.15),
    new THREE.MeshBasicMaterial({color:0xffd76a,transparent:true,opacity:.20,depthTest:false,blending:THREE.AdditiveBlending}));
  glow.renderOrder=19;grp.add(glow);
  const cap=new THREE.Mesh(new THREE.PlaneGeometry(.72,.72),
    new THREE.MeshBasicMaterial({map:pressKeyTexture('E'),transparent:true,depthTest:false}));
  cap.renderOrder=20;grp.add(cap);
  const tip=new THREE.Mesh(new THREE.PlaneGeometry(1.0,.28),
    new THREE.MeshBasicMaterial({map:pressKeyTexture('E'),transparent:true,opacity:.5,depthTest:false}));
  tip.renderOrder=18;grp.add(tip);
  grp.visible=false;scene.add(grp);
  pressPrompt={grp,glow,cap,tip};
}
function updatePressPrompt(){
  ensurePressPrompt();
  const it=interactTarget;
  if(!it||it.on){pressPrompt.grp.visible=false;return;}
  const p=it.pos||it.mesh.position;
  pressPrompt.grp.visible=true;
  pressPrompt.grp.position.set(p.x,(p.y||0)+(it.py||1.85),p.z);
  pressPrompt.grp.quaternion.copy(camera.quaternion);   // sempre virada p/ a câmera
  const t=performance.now()*.006;
  pressPrompt.cap.position.y=Math.sin(t)*.07;
  pressPrompt.cap.scale.setScalar(1+Math.sin(t*.8)*.07);
  pressPrompt.glow.scale.setScalar(1.1+Math.sin(t*.7)*.12);
  pressPrompt.glow.material.opacity=.16+Math.sin(t*.9)*.07;
  pressPrompt.tip.rotation.z=Math.PI;                      // seta pra baixo, embaixo da tecla
  pressPrompt.tip.position.y=-.52;
}

// ---------- TELEMETRIA DE ATAQUE: as marcas no chão dizem ONDE o chefe vai bater ----------
// Sem isso o boss parece " injusto": agora o vermelho no chão é um convite a sair.
const telegraphs=[];
const TELE_N=4;
const teleGeo=new THREE.RingGeometry(.74,1,52);
function showTelegraph(x,z,rad,dur,kind){
  let t=telegraphs.find(o=>!o.live);
  if(!t){
    if(telegraphs.length>=TELE_N)return null;
    const m=new THREE.Mesh(teleGeo,new THREE.MeshBasicMaterial({color:0xff3a10,transparent:true,opacity:.4,
      side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
    m.rotation.x=-Math.PI/2;m.renderOrder=2;scene.add(m);
    t={m,live:false};telegraphs.push(t);
  }
  t.live=true;t.t=0;t.dur=Math.max(.12,dur);t.kind=kind;t.rad=rad;
  t.m.position.set(x,.05,z);t.m.scale.setScalar(rad);t.m.material.opacity=.45;t.m.visible=true;
  return t;
}
function updateTelegraphs(dt){
  for(const t of telegraphs){
    if(!t.live){if(t.m.visible)t.m.visible=false;continue;}
    t.t+=dt;
    const k=t.t/t.dur;
    if(k>=1){t.live=false;t.m.visible=false;continue;}
    // amarelo → vermelho e pulsa mais rápido quanto mais perto do golpe
    t.m.material.color.setHSL(THREE.MathUtils.lerp(.14,.005,k),1,.55);
    t.m.material.opacity=(k<.8?.34:.62)*(0.72+0.28*Math.sin(t.t*(k<.8?11:34)));
    t.m.scale.setScalar(t.rad*(k<.8?1:.9+.14*k));
  }
}
// ---------- ESQUIVA ----------
function startDodge(mx,mz){
  if(state!=='playing'||dodgeCD>0||swinging||dodgeT>0||paraT>0)return false;
  // direção: a que o jogador está segurando; sem direção → para trás
  let dx=mx,dz=mz;
  if(Math.abs(dx)<.01&&Math.abs(dz)<.01){
    dx=-Math.sin(player.rotation.y);dz=-Math.cos(player.rotation.y);
  }else{
    const fx=-Math.sin(yaw),fz=-Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);
    dx=rx*dx+fx*dz;dz=rz*dx+fz*dz;
    const l=Math.hypot(dx,dz);if(l>1e-4){dx/=l;dz/=l;}
  }
  dodgeDirX=dx;dodgeDirZ=dz;dodgeT=DODGE_DUR;dodgeCD=DODGE_CD_MAX;
  iframes=Math.max(iframes,DODGE_DUR+.05);   // rolar = invulnerável de verdade
  stamina=Math.max(0,stamina-9);
  vy=Math.min(vy,1.6);                       // pulo cancelado: rola rente ao chão
  AudioSys.noise(.22,.1);
  for(let i=0;i<4;i++)spawnSpark(player.position.clone().add(new THREE.Vector3((Math.random()-.5)*.6,.12,(Math.random()-.5)*.6)));
  return true;
}
// ESQUIVA PERFEITA: o golpe passaria em você e NÃO pegou → tempo lento + chefe cambaleia
function perfectDodge(e,src){
  dodgePerfects++;score+=150;
  slowmoT=SLOWMO_MAX;
  AudioSys.tone(1320,.18,'triangle',.14,660);AudioSys.noise(.3,.12);
  showMsg('⚡ ESQUIVA PERFEITA! O tempo desacelera — bata agora!',1900);
  for(let i=0;i<10;i++)spawnSpark(player.position.clone().add(new THREE.Vector3((Math.random()-.5)*1.2,1.1,(Math.random()-.5)*1.2)));
  // o chefe que errou o golpe fica aberto: cancela a antecipação e dá janela de dano
  if(e&&e.type==='golem'&&!e.dead&&!e.perfectDodged){
    e.perfectDodged=true;
    if(e.atk){e.atk=0;e.atkT=0;e.cd=1.5;}
    applyStun(e,1.7,'⚡ ESQUIVA PERFEITA! A Sentinela desequiliblou — ATAQUE!');
  }
}
// dano de um ataque do chefe: se o herói está ESQUIVANDO, vira esquiva perfeita
function bossHit(e,dmg,src){
  if(dodgeT>0){perfectDodge(e,src);return false;}
  damage(dmg,src);return true;
}
function tick(dt){
  levelTime+=dt;
  // 💥 CAIR POR ARMADILHA: sem comando, sem chicote — só o tombo e o levantar
  if(downT>0){
    downT-=dt;
    if(downT<=0){
      downT=0;
      vy=0;pvx=0;pvz=0;   // ⚠️ NÃO cancela chicote/argola: se o jogador já voou de novo, o voo continua
      showMsg((downMsg||'💥 Armadilha!')+' ↩ Você se levantou e continua.');
    }
  }
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
  const speed=(running?8.6:5.4)*slowK;
  if(running){runHold+=dt;const drain=Math.min(46,22+runHold*11);stamina=Math.max(0,stamina-drain*dt);}else{runHold=0;stamina=Math.min(100,stamina+16*dt);}
  // Q gira a câmera (alternativa sem mouse) + touch
  if(!aimLock&&keys['KeyQ'])yaw+=dt*2.4;      // 🎯 travada: Q/R não gira a câmera
  if(!aimLock&&keys['KeyR'])yaw-=dt*2.4;
  if(touch.lookDX||touch.lookDY){yaw-=touch.lookDX*.005;pitch-=touch.lookDY*.004;pitch=Math.max(-1.1,Math.min(.5,pitch));touch.lookDX=0;touch.lookDY=0;}
  // direção relativa à câmera (forward = (-sin,-cos))
  const fx=-Math.sin(yaw),fz=-Math.cos(yaw);
  const rx=Math.cos(yaw),rz=-Math.sin(yaw);
  let vx=(rx*mx+fx*mz)*speed, vz=(rz*mx+fz*mz)*speed;
  if(downT>0){vx=0;vz=0;}   // 💥 no chão: não anda nem escorrega com o comando

  // 🌀 ESQUIVA (C / Ctrl / dois toques na direção): rolamento com invulnerabilidade
  if(dodgeCD>0)dodgeCD-=dt;
  if(tryDodge){tryDodge=false;startDodge(mx,mz);}
  if(dodgeT>0&&(dodgeT-=dt)<=0){dodgeT=0;pvx=dodgeDirX*5.5;pvz=dodgeDirZ*5.5;}

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
  }else if(dodgeT>0){
    // 🌀 ROLAMENTO: burst de velocidade (rápido no meio, some nas pontas) + puff de poeira
    const k=dodgeT/DODGE_DUR;
    const sp=DODGE_SPEED*(.42+.58*Math.sin(k*Math.PI));
    player.position.x+=dodgeDirX*sp*dt;
    player.position.z+=dodgeDirZ*sp*dt;
    // no chão: rola COLADO (sem gravidade — evita atravessar o piso com Ctrl/C);
    // no ar: queda normal durante o rolamento
    if(onGround)vy=0;
    else{vy-=22*dt;vy=Math.max(vy,-14);}
    player.position.y+=vy*dt;
    resolveCollisions();
    if(Math.random()<.5)spawnSpark(player.position.clone().add(new THREE.Vector3((Math.random()-.5)*.7,.1,(Math.random()-.5)*.7)));
  }else{
    // ⚡ RESPOSTA IMPULSIONADA: aceleração, frenagem e troca de direção têm
    // curvas PRÓPRIAS. Antes tudo usava a mesma suavização e o herói "deslizava"
    // como se tivesse peso (dava a sensação de lento/travado).
    const cur=Math.hypot(pvx,pvz);
    const reversing=cur>.6&&(pvx*vx+pvz*vz)<0;      // virou do nada do nada = giro brusco
    const wants=(vx!==0||vz!==0);
    let k;
    if(!onGround)      k=reversing?7.5:5.5;         // no ar: controle bom, mas inércia
    else if(!wants)   k=22;                        // sem tecla: FREIA forte (não patina)
    else if(reversing)k=26;                        // virou: resposta instantânea
    else               k=17;                        // acelerando normal
    const f=Math.min(1,dt*k);
    pvx+=(vx-pvx)*f;
    pvz+=(vz-pvz)*f;
    // atrito extra no chão quando não há tecla (para de verdade, sem escorregar)
    if(!wants&&onGround){pvx*=Math.max(0,1-dt*10);pvz*=Math.max(0,1-dt*10);}
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
    if(levelIndex===0&&Math.abs(player.position.x)<6&&player.position.z> -2&&player.position.z<6){damage(20,'🕳 Você caiu na ravina! Aperte V no anel dourado.');player.position.set(0,.5,8);vy=0;}
    else{damage(25,'🕳 Você caiu no abismo!');respawnSafe();}
  }
  // limites
  player.position.x=Math.max(-60,Math.min(60,player.position.x));
  player.position.z=Math.max(-70,Math.min(70,player.position.z));

  // rotação do player p/ direção do movimento real
  const spd=Math.hypot(pvx,pvz);spdVis+=(spd-spdVis)*Math.min(1,dt*8);
  if(spd>.4&&!swinging&&spinT<=0){const target=Math.atan2(pvx,pvz);let d=target-player.rotation.y;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;player.rotation.y+=d*Math.min(1,dt*12);}
  // LOCOMOÇÃO REALISTA FLUIDA: andar / correr / idle / pulo / queda / swing
  animatePlayer(dt,mx,mz,spd,running);

  // chicote (F/clique = SÓ ataca, V = SÓ argolas com cooldown!)
  whipCD-=dt;whipAnim-=dt;
  updateSpin(dt);                                   // 🌀 giro do chicote (roda o corpo + acerta a área)
  updateAimLock(dt);                                // 🎯 mira travada (Z)
  if(swingCD>0){
    swingCD-=dt;
    if(swingCD<=0){swingCD=0;showMsg('🌀 Argola PRONTA! Aperte V perto do anel dourado!',1800);AudioSys.tone(880,.18,'triangle',.1,440);}
  }
  if(tryWhip){tryWhip=false;if(paraT<=0)doWhip();} // ⚡ paralisado NÃO usa chicote!
  if(trySpin){trySpin=false;doSpin();}               // 🌀 giro de área (o próprio doSpin bloqueia se paralisado)
  if(trySwing){trySwing=false;doSwing();}
  updateWhipVisual();
  if(tryInteract){tryInteract=false;if(paraT<=0)doInteract();} // nem interagir!
  // 🪢 laço: recarga de 30s + disparo + marcador de pouso da mira
  if(lassoCD>0){lassoCD-=dt;if(lassoCD<=0){lassoCD=0;showMsg('🪢 Habilidade PRONTA! Aperte G!',2000);AudioSys.tone(880,.2,'triangle',.12,440);}}
  if(tryLasso){tryLasso=false;if(paraT<=0)doLasso();}
  lassoT+=dt;
  updateLassoPick(dt); // 🧲 item laçado voando até a mão
  updateLassoRope();   // 🪢 corda do laço desenhada enquanto a presa/item está preso
  if(landingMarker){
    const ng2=nearestGrapple();
    // marcador só aparece quando o swing está PRONTO (cooldown zerado)
    if(ng2&&!swinging&&swingCD<=0){
      const lp=aimLanding()||swingFallback();
      landingMarker.visible=true;
      landingMarker.position.set(lp.x,lp.y+.15,lp.z);
      landingMarker.scale.setScalar(1+Math.sin(performance.now()*.008)*.12);
    }else landingMarker.visible=false;
  }

  // 🧍 grava o último chão seguro (armadilha não joga pro começo da fase)
  if(onGround){safeTick-=dt;if(safeTick<=0){safeTick=.35;rememberSafeSpot();}}
  // 📖 TUTORIAL: mede o passo "andar" e avança os passos concluídos
  if(tutOn&&tutLesson()&&tutLesson().id==='andar')tutMoved+=Math.hypot(pvx,pvz)*dt;
  updateTutorial(dt);
updateEnemies(dt);
  updateTraps(dt);
  updateRollers(dt);
  updateGrapples(dt);
  updatePickups(dt);
  updateDoors(dt);
  updateAltars(dt);
  updateProjectiles(dt);
  updateStuckSpears(dt);
updateSparks(dt);
  updateShards(dt);      // 💧 cacos do frasco quebrado
  updatePopRings(dt);    // 💥 "pop" dos itens coletados
updateTelegraphs(dt);
  updateTorches();
  updateVegetation(dt);updateFx(dt);
  updateBossEscape(dt);
  // 🎯 orçamento de luzes: a cada ~0,2s escolhe as mais importantes p/ a câmera
  lightTimer-=dt;if(lightTimer<=0){lightTimer=.2;refreshLights();}
  updateCamera(dt);
  updatePressPrompt();   // ✋ tecla "E" flutuando sobre a alavanca
  updateHUD();
  // objetivo dinâmico
  if(levelIndex===0)objEl.textContent=`Fragmentos ${relics}/${currentInfo.needRelics} • Aperte V na ravina 🌀 • Entre na caverna`;
  if(levelIndex===2&&boss&&boss.dead&&!escaping)objEl.textContent='Tome o CÁLICE no pedestal! 🏆';

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
  // 🔥 QUEIMADURA: 5s, 4 de dano por segundo (ignora iframes — é debuff, não golpe)
  if(burnT>0){
    burnT-=dt;burnTick+=dt;
    if(burnTick>=1){
      burnTick-=1;
      health-=BURN_DPS*DIFF.dmg;
      AudioSys.splash();
      for(let i=0;i<3;i++)spawnSpark(player.position.clone().add(new THREE.Vector3((Math.random()-.5)*.7,.5+Math.random(),(Math.random()-.5)*.7)));
      if(health<=0){health=0;die('🔥 Você queimou até cair...');}
    }
  }
}

function respawnSafe(){
  // só usa o início se o ponto seguro estiver absurdo (ou ainda não existir)
  player.position.copy(Math.abs(safeSpot.x)<90&&Math.abs(safeSpot.z)<90?safeSpot:currentInfo.spawn);
  vy=0;
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

// 🪢 CORDA DO LAÇO: arco de elos ligando a mão do herói até a presa.
// Só aparece enquanto a habilidade está em uso.
let lassoRope=null, lassoRopeSegs=[], lassoRopeMat=null, lassoPick=null;   // lassoPick = item voando até a mão
function ensureLassoRope(){
  if(lassoRope)return;
  lassoRope=new THREE.Group();lassoRope.visible=false;scene.add(lassoRope);
  lassoRopeMat=new THREE.MeshStandardMaterial({color:0x6b4a2b,roughness:.85,emissive:0x1a0e00});
  lassoRopeSegs.length=0;
  for(let i=0;i<12;i++){
    const s=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.3,5),lassoRopeMat);
    s.castShadow=false;lassoRope.add(s);lassoRopeSegs.push(s);
  }
  const loopM=new THREE.Mesh(new THREE.TorusGeometry(.22,.05,6,12),MAT(0xc9a227,{metalness:.6,roughness:.4}));
  loopM.name='lassoLoop';lassoRope.add(loopM);
  lassoRope.userData.loop=loopM;
}
function clearLassoRope(){ if(lassoRope){lassoRope.visible=false;if(lassoRope.userData.loop)lassoRope.userData.loop.visible=false;} }
function updateLassoRope(){
  ensureLassoRope();
  const prey=enemies.find(e=>e.lassoed&&!e.dead);
  const item=lassoPick&&lassoPick.p&&!lassoPick.p.taken?lassoPick.p:null;
  if(!prey&&!item){clearLassoRope();return;}
  lassoRope.visible=true;
  // âncora: mão direita do herói, em espaço de mundo
  const hand=new THREE.Vector3(0.365,1.02,0.12);
  if(player.userData?.rig)player.userData.rig.localToWorld(hand);
  const target=prey
    ?prey.mesh.position.clone().add(new THREE.Vector3(0,(prey.bodyH||2)*.5,0))
    :item.mesh.position.clone().add(new THREE.Vector3(0,.28,0));
  tmpV.subVectors(target,hand);
  const dist=tmpV.length();
  const N=lassoRopeSegs.length;
  let px=hand.x,py=hand.y,pz=hand.z;
  for(let i=0;i<N;i++){
    const t=(i+1)/N;
    const sag=Math.sin(t*Math.PI)*.45;          // a corda cede no meio
    const nx=hand.x+tmpV.x*t, ny=hand.y+tmpV.y*t-sag, nz=hand.z+tmpV.z*t;
    const s=lassoRopeSegs[i];
    s.position.set((px+nx)/2,(py+ny)/2,(pz+nz)/2);
    tmpV2.set(nx-px,ny-py,nz-pz);
    if(tmpV2.lengthSq()>1e-6)s.quaternion.setFromUnitVectors(_YUP,tmpV2.normalize());
    px=nx;py=ny;pz=nz;
  }
  // laço na ponta da corda, voltado p/ a presa
  const lp=lassoRope.userData.loop;
  lp.visible=true;lp.position.copy(target);
  lp.lookAt(prey?prey.mesh.position.x:target.x,
            prey?prey.mesh.position.y+(prey.bodyH||2)*.2:target.y-.2,
            prey?prey.mesh.position.z:target.z);
  lp.rotation.z+=.05;lp.scale.setScalar(1+Math.sin(lassoT*10)*.08);
  lassoRopeMat.emissive.setHex(lassoT<1?.4+Math.sin(lassoT*30)*.25:.05);
}
let lassoT=0;
function updateWhipVisual(){
  // Laço/chicote premium: 10 elos trançados afunilados + ponta metálica com brilho.
  // Espaço local do rig: frente = +Z, punho da mão direita em x≈0.32, y≈1.055.
  const u=player.userData;
  const N=whipSegs.length;
  const placeTip=(x,y,z,dir)=>{
    if(u.whipTip){
      u.whipTip.position.set(x,y,z);
      if(dir&&dir.lengthSq()>1e-6)u.whipTip.quaternion.setFromUnitVectors(FWD_Z,dir.clone().normalize());
    }
    if(u.tipGlow)u.tipGlow.position.set(x,y,z);
  };
  // 🔗 elo esticado: posiciona no meio e ESCALA no eixo do comprimento até o
  // próximo ponto. Sem isso os elos ficam com .42 fixo e abrem buracos na corda.
  const stretchSeg=(s,ax,ay,az,bx,by,bz)=>{
    const dx=bx-ax,dy=by-ay,dz=bz-az;
    const len=Math.sqrt(dx*dx+dy*dy+dz*dz);
    s.position.set((ax+bx)/2,(ay+by)/2,(az+bz)/2);
    if(len>1e-6)s.quaternion.setFromUnitVectors(FWD_Z,tmpV2.set(dx/len,dy/len,dz/len));
    s.scale.z=Math.max(.34,len/.42);
  };
  // GRUDADO NA ARGOLA durante o swing: elos esticados da mão até o anel
  if(swinging&&swinging.ring&&u.rig){
    tmpV.copy(swinging.ring);
    u.rig.worldToLocal(tmpV); // anel em espaço local
    const hx=.32,hy=1.055,hz=.05;
    let px=hx,py=hy,pz=hz;
    for(let i=0;i<N;i++){
      const t=(i+1)/N;
      const sag=Math.sin(t*Math.PI)*.3; // corda esticada quase reta
      const nx=hx+(tmpV.x-hx)*t, ny=hy+(tmpV.y-hy)*t-sag, nz=hz+(tmpV.z-hz)*t;
      stretchSeg(whipSegs[i],px,py,pz,nx,ny,nz);
      px=nx;py=ny;pz=nz;
    }
    tmpV2.set(tmpV.x-px,tmpV.y-py,tmpV.z-pz);
    placeTip(tmpV.x,tmpV.y,tmpV.z,tmpV2);
    if(u.whipTip)u.whipTip.scale.setScalar(1.4); // ponta enrolada no aro
    if(u.tipGlow)u.tipGlow.scale.setScalar(1.8);
    u.armR.rotation.x=-2.4; // braço erguido segurando
    return;
  }
  // 🌀 GIRO DO CHICOTE: espiral VIVA que varre com o corpo — abre no meio da
  // volta, ondula e se recolhe no fim. O atraso (lag) dá o efeito de chicotada.
  if(spinT>0){
    const p=1-Math.max(0,spinT)/SPIN_DUR;           // 0→1
    const swing=Math.sin(p*Math.PI);                // 0→1→0
    const sweep=p*Math.PI*2;                        // acompanha a volta do corpo
    const lag=-1.15*Math.sin(p*Math.PI);            // chicote atrasa o corpo
    const R=.55+2.35*swing;                         // raio: encolhe → abre → recolhe
    const span=1.15+1.05*swing;                     // arco vivo (não é anel fixo)
    const a0=.14+lag+p*.55;                         // saída na altura da mão
    const cy=1.02;
    let px=.32,py=1.055,pz=.05;                    // nasce na mão direita
    for(let i=0;i<N;i++){
      const t=(i+1)/N;
      const a=a0-sweep-t*span;
      const rr=R*Math.pow(t,.9);
      const wave=Math.sin(t*Math.PI)*swing;
      const nx=Math.cos(a)*rr;
      const ny=cy-.22*t+Math.sin(t*Math.PI)*.5*swing+Math.sin(t*9-p*13)*.06*wave;
      const nz=Math.sin(a)*rr;
      stretchSeg(whipSegs[i],px,py,pz,nx,ny,nz);
      px=nx;py=ny;pz=nz;
    }
    if(u.whipTip){
      tmpV.set(px-Math.cos(a0-sweep-span)*.12,.05,pz-Math.sin(a0-sweep-span)*.12);
      placeTip(px,py,pz,tmpV);
      const glow=1.5+swing*1.9;                     // a ponta acende no meio do giro
      u.whipTip.scale.setScalar(glow);
      if(u.tipGlow)u.tipGlow.scale.setScalar(glow*1.7);
    }
    // 🧍 corpo gira inteiro: braço direito estendido, esquerdo abre p/ equilíbrio
    u.armR.rotation.x=-.45;u.armR.rotation.z=-1.05;
    if(u.elbowR)u.elbowR.rotation.x=-.18;
    if(u.armL)u.armL.rotation.z=.75;
    if(u.whipTip){                                   // faíscas voando da ponta
      u.whipTip.getWorldPosition(tmpV2);
      spawnSpark(tmpV2);
    }
    return;
  }
  const k=whipAnim>0?1-whipAnim/.35:1; // 0→1 durante o estalo
  const ext=k<1?(.6+2.8*(1-Math.pow(1-k,3))):.9; // alcance: cresce rápido até 3.4m
  const wob=spdVis*0.12; // balanço pelo movimento
  let px=.32,py=1.055,pz=.05;
  for(let i=0;i<N;i++){
    const t=(i+1)/N;
    let nx,ny,nz;
    if(k<1){
      const wave=Math.sin(t*7-k*11)*.34*t; // onda viajando até a ponta
      nx=.32+wave;
      ny=1.07+Math.sin(t*4.2)*.08*t-t*.12;
      nz=.05+t*ext;
    }else{
      // pendurado ao lado da perna, balançando com a corrida
      nx=.345+t*.16+Math.sin(stepT*.5)*wob*t;
      ny=1.02-t*t*1.05;
      nz=.06+t*.5;
    }
    const s=whipSegs[i];
    stretchSeg(s,px,py,pz,nx,ny,nz);
    px=nx;py=ny;pz=nz;
  }
  if(u&&u.whipTip){
    tmpV.set(.1,.05,.6); // direção da ponta p/ frente
    placeTip(px,py,pz,tmpV);
    const crack=(k<1&&k>.55)?1.9:1; // ponta "acende" no estalo
    u.whipTip.scale.setScalar(crack);
    if(u.tipGlow)u.tipGlow.scale.setScalar(crack*(k<1?1.9:1));
  }
  if(whipAnim>0){u.armR.rotation.x=-1.9;u.armR.rotation.z+=(0-u.armR.rotation.z)*.2;}
  else u.armR.rotation.z+=(0-u.armR.rotation.z)*.08;   // solta o braço após o giro
}

// 🗿 inicia a PANCADA: antecipação longa + marca vermelha + rugido
function startSlam(e,enraged=1){
  e.atk=1;e.atkT=.8/enraged;e.perfectDodged=false;
  AudioSys.roar();AudioSys.tone(60,.4,'sawtooth',.15,20);
  showTelegraph(e.mesh.position.x,e.mesh.position.z,e.atkR+1.6,e.atkT+.42,'slam');
}
// ⚡ PARRY: acertar a Sentinela NA ANTECIPAÇÃO dela cancela a pancada!
function tryParrySentinel(e){
  if(e.atk!==1||e.atkT<=.12)return false;
  e.atk=0;e.atkT=0;e.struck=false;e.cd=2.4;e.perfectDodged=false;
  applyStun(e,1.9,'⚡ PARRY! Você quebrou a antecipação — Sentinela descoberta (dano x2)!');
  return true;
}
function updateEnemies(dt){
  fwdV.set(-Math.sin(yaw),0,-Math.cos(yaw));
  for(const e of enemies){
    if(e.lassoed){updateLassoTargets(dt);continue;} // 🪢 preso no laço: animação tem prioridade
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
    if(e.dead){
      // 🗿 a SENTINELA fica DE JOELHOS (derrotada); os outros tombam de costas
      if(e.type==='golem'){sentinelKneel(e,dt);continue;}
      e.mesh.rotation.x=Math.min(Math.PI/2,e.mesh.rotation.x+dt*3);e.mesh.position.y=Math.max(-1,e.mesh.position.y-dt);continue;
    }
    e.t+=dt;e.cd-=dt;
    // 🌀 empurrão do giro do chicote: desliza para trás e freia no chão (kb)
    if(e.kb&&e.kb.lengthSq()>1e-4){
      e.mesh.position.addScaledVector(e.kb,dt);
      e.kb.multiplyScalar(Math.max(0,1-dt*9));          // atrito do chão
      if(e.kb.lengthSq()<1e-4)e.kb.set(0,0,0);
    }
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
    if(e.type==='golem')sentinelAnim(e,dt);
    // ⚡ STUN genérico: inimigo tonto não anda, não ataca e leva dano dobrado
    if(e.stun>0){
      e.stun-=dt;
      e.mesh.rotation.z=Math.sin(e.t*18)*.12;
      e.mesh.position.y=e.baseY;
      if(Math.random()<dt*6)spawnSpark(e.mesh.position.clone().add(new THREE.Vector3((Math.random()-.5)*.7,1.6,(Math.random()-.5)*.7)));
      if(e.stun<=0){e.mesh.rotation.z=0;e.stunCd=5;showMsg('⚡ '+enemyLabel(e)+' saiu do atordoamento!',1400);}
      continue;
    }
    if(e.stunCd>0)e.stunCd-=dt;
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
              damage(dd2,e.tutHome?'🧪 Mordida do boneco de treino!':'🐍 Picada de cobra!');
              if(poisonImm<=0&&!e.tutHome)applyPoison();
              spawnSpark(e.mesh.position.clone().add(new THREE.Vector3(0,0.8,0)));
            }else AudioSys.noise(.1,.06);
          }
          if(e.atkT<=0){e.atk=0;e.cd=1.1;}
        }else if(dist>e.atkR){
          if(!e.vel)e.vel=new THREE.Vector3();
          tmpV2.copy(tmpV).multiplyScalar(e.speed);
          e.vel.lerp(tmpV2,Math.min(1,dt*2.2));
          e.mesh.position.x+=e.vel.x*dt;e.mesh.position.z+=e.vel.z*dt;
          // 🧪 boneco de treino: fica rondando a clareira (não persegue o jogador)
          if(e.tutHome){
            const hx=e.mesh.position.x-e.tutHome.x,hz=e.mesh.position.z-e.tutHome.z;
            const hd=Math.hypot(hx,hz);
            if(hd>2.6){e.mesh.position.x=e.tutHome.x+hx/hd*2.6;e.mesh.position.z=e.tutHome.z+hz/hd*2.6;}
          }
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
      // ===== SENTINELA DO TEMPO: 3 ataques + STUN ao martelar a parede =====
      // atk 1 = PANCADA (ergue as DUAS mãos e esmaga o chão)
      // atk 3 = ONDA DE CHOQUE (pula e solta um anel que empurra)
      // atk 4 = GIRO DO RELÓGIO (rodopia com os braços abertos)
      }else if(e.type==='golem'){
        const enraged2=e.hp<e.max*.4?1.6:1;
        const S=e.mesh.userData.sentinel||{};
        if(e.atk===1){
          e.atkT-=dt;
          // antecipação longa: as mãos sobem cada vez mais (dá tempo de sair!)
          for(const arm of (e.mesh.userData.arms||[]))arm.rotation.x+=((-2.5)-arm.rotation.x)*Math.min(1,dt*7);
          e.mesh.rotation.x+=((-0.12)-e.mesh.rotation.x)*Math.min(1,dt*6);
          e.mesh.position.y=e.baseY+Math.sin(Math.max(0,e.atkT)*14)*.05;
          shake=Math.max(shake,.06);
          if(S.coreLight)S.coreLight.intensity=26+Math.sin(e.t*22)*14;
          if(Math.random()<.35)spawnSpark(e.mesh.position.clone().add(new THREE.Vector3((Math.random()-.5)*2,4.2,(Math.random()-.5)*2)));
          if(e.atkT<=0){e.atk=2;e.atkT=.42;e.struck=false;e.hitWall=false;AudioSys.roar();}
        }else if(e.atk===2){
          e.atkT-=dt;
          // DESCE OS BRAÇOS: esmaga o chão com as duas mãos
          for(const arm of (e.mesh.userData.arms||[]))arm.rotation.x+=((1.15)-arm.rotation.x)*Math.min(1,dt*22);
          e.mesh.rotation.x+=((0.3)-e.mesh.rotation.x)*Math.min(1,dt*20);
          if(e.atkT>.18)e.mesh.position.y=e.baseY+Math.max(0,e.atkT-.18)*2.2; // salta e cai
          if(!e.struck&&e.atkT<=.2){
            e.struck=true;
            tmpV2.subVectors(player.position,e.mesh.position);tmpV2.y=0;
            if(tmpV2.length()<e.atkR+1.2){
              if(!bossHit(e,e.dmg,'🗿 Pancada da SENTINELA!'))
                for(let i=0;i<8;i++)spawnSpark(player.position.clone().add(new THREE.Vector3((Math.random()-.5)*1.2,1,(Math.random()-.5)*1.2)));
            }
            AudioSys.roar();shake=.85;
            spawnShockRing(e.mesh.position.clone(),9,.55);   // anel de choque visível
            for(let i=0;i<12;i++)spawnSpark(e.mesh.position.clone().add(new THREE.Vector3((Math.random()-.5)*3,.3,(Math.random()-.5)*3)));
            e.hitWall=armHitWall(e);   // martelou na parede? → stun
          }
          if(e.atkT<=0){
            e.atk=0;e.cd=1.7/enraged2;e.mesh.rotation.x=0;e.mesh.position.y=e.baseY;
            if(e.hitWall&&e.stunCd<=0){
              e.stun=2.6;e.stunCd=7;
              showMsg('💥 A SENTINELA MARTELOU A PAREDE! Atordoada — bata agora!',3000);
              AudioSys.noise(.5,.25);shake=Math.max(shake,1);
            }
          }
        }else if(e.atk===3){ // ===== ONDA DE CHOQUE =====
          e.atkT-=dt;
          const prog=1-e.atkT/.75;
          for(const arm of (e.mesh.userData.arms||[]))arm.rotation.z+=(Math.sin(prog*Math.PI)*.95-arm.rotation.z)*Math.min(1,dt*8);
          e.mesh.position.y=e.baseY+Math.abs(Math.sin(prog*Math.PI))*.9;
          if(!e.struck&&e.atkT<=.4){
            e.struck=true;
            spawnShockRing(e.mesh.position.clone(),11,.8);
            shockwave(e.mesh.position.clone());
            AudioSys.roar();shake=.6;
            tmpV2.subVectors(player.position,e.mesh.position);tmpV2.y=0;
            const d=tmpV2.length();
            if(d<11){ // sai andando, pula ou ESQUIVA
              const got=bossHit(e,Math.max(10,Math.round(34*(1-d/11))),'🌊 Onda de Choque da SENTINELA!');
              tmpV2.normalize();
              player.position.addScaledVector(tmpV2,(11-d)*(got?.3:.06));
            }
            e.hitWall=armHitWall(e);
          }
          if(e.atkT<=0){
            e.atk=0;e.cd=2.1/enraged2;e.mesh.position.y=e.baseY;
            for(const arm of (e.mesh.userData.arms||[]))arm.rotation.z=0;
            if(e.hitWall&&e.stunCd<=0){e.stun=2.2;e.stunCd=7;showMsg('💥 A ONDA REBATEU NA PAREDE! Atordoada!',2800);}
          }
        }else if(e.atk===4){ // ===== GIRO DO RELÓGIO =====
          e.atkT-=dt;
          e.mesh.rotation.y+=dt*Math.PI*2*1.15;   // rodopia (mas fica dentro da arena!)
          for(const arm of (e.mesh.userData.arms||[]))arm.rotation.z+=(1.35-arm.rotation.z)*Math.min(1,dt*7);
          e.mesh.position.y=e.baseY+.15;
          e.spinHit=(e.spinHit||0)+dt;
          if(e.spinHit>.3){ // dano por tique (dá p/ pular por cima)
            e.spinHit=0;
            tmpV2.subVectors(player.position,e.mesh.position);tmpV2.y=0;
            const dyP=player.position.y-e.mesh.position.y;
            if(tmpV2.length()<e.hitR+.8&&dyP<2.8&&dyP>-1.5){
              const got=bossHit(e,12,'🌀 Giro do Relógio!');
              spawnSpark(player.position.clone().add(new THREE.Vector3(0,1,0)));
              tmpV2.normalize();
              player.position.addScaledVector(tmpV2,got?1.1:.15);   // arremessado pra fora
            }
          }
          if(S.core)S.core.scale.setScalar(1.3+Math.sin(e.t*30)*.25);
          if(e.atkT<=0){
            e.atk=0;e.cd=2.6/enraged2;e.mesh.rotation.y=0;
            for(const arm of (e.mesh.userData.arms||[]))arm.rotation.z=0;
            if(S.core)S.core.scale.setScalar(1);
          }
        }else if(dist>e.atkR){
          if(!e.vel)e.vel=new THREE.Vector3();
          tmpV2.copy(tmpV).multiplyScalar(e.speed*enraged2);
          e.vel.lerp(tmpV2,Math.min(1,dt*2.8));
          // 🚧 COLISÃO REAL: a sentinela NUNCA atravessa parede
          const p=clampToArena(e,e.mesh.position.x+e.vel.x*dt,e.mesh.position.z+e.vel.z*dt,2.3);
          e.mesh.position.x=p.x;e.mesh.position.z=p.z;
          e.mesh.position.y+=((groundY(e.mesh.position.x,e.mesh.position.z))-e.mesh.position.y)*Math.min(1,dt*5);
          if(dist<8&&Math.random()<dt*3)shake=Math.max(shake,.1);
          if(e.slamCd>0)e.slamCd-=dt;
          if(e.cd<=0){
            if(dist<e.atkR+.6)startSlam(e,enraged2);
            else if(e.slamCd<=0){ // longe: onda ou giro
              e.slamCd=5.5/enraged2;
              e.atk=Math.random()<.5?3:4;e.atkT=e.atk===3?.75:.95;e.struck=false;
              e.perfectDodged=false;
              AudioSys.roar();
              // 🔴 marca vermelha no chão: é ali que o golpe vai cair (ou se espalhar)
              showTelegraph(e.mesh.position.x,e.mesh.position.z,e.atk===3?11:e.hitR+1.6,e.atkT+.12,e.atk===3?'wave':'spin');
              showMsg(e.atk===3?'🌊 ONDA DE CHOQUE! Saia do círculo vermelho ou pule!':'🌀 GIRO DO RELÓGIO! Saia do centro ou pule por cima!',1900);
            }
          }
        }else if(e.cd<=0){
          startSlam(e,enraged2);
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
// ---------- SENTINELA: COLISÃO + STUN ----------
// Limita a sentinela dentro da arena E contra qualquer collider (parede/ pilar),
// usando a mesma marcha da câmera. Devolve a posição corrigida.
const _arenaStep=new THREE.Vector3();
// um collider SÓ bloqueia a Sentinela se ele for "vertical" na altura dela:
//   - topo acima do passo (feet + step)  → parede/pilar de verdade
//   - base abaixo da cabeça               → e ela não passa por cima
function blocksSentinel(b,feet,head,step){
  if(b.max.y<=feet+step)return false;   // laje/chão: anda por cima
  if(b.min.y>=head)return false;        // teto/viga alta: passa por baixo
  return true;
}
function insideAnyBox(x,feet,head,z,r,step=.5){
  for(const c of colliders){
    const b=c.box;
    if(!blocksSentinel(b,feet,head,step))continue;
    if(x+r>b.min.x&&x-r<b.max.x&&z+r>b.min.z&&z-r<b.max.z)return b;
  }
  return null;
}
function clampToArena(e,nx,nz,r){
  const p={x:nx,z:nz};
  // 1) limites da arena do boss (paredes da câmara)
  if(arena3){
    if(p.x<arena3.minX+r){p.x=arena3.minX+r;e.wall=.35;}
    if(p.x>arena3.maxX-r){p.x=arena3.maxX-r;e.wall=.35;}
    if(p.z<arena3.minZ+r){p.z=arena3.minZ+r;e.wall=.35;}
    if(p.z>arena3.maxZ-r){p.z=arena3.maxZ-r;e.wall=.35;}
  }
  // 2) nenhum collider sólido: empurra para fora (parede, pilar, pedestal...)
  const feet=e.mesh.position.y, head=feet+(e.bodyH||2);
  for(let iter=0;iter<3;iter++){
    const b=insideAnyBox(p.x,feet,head,p.z,r,.6);
    if(!b)break;
    const dx1=p.x+r-b.min.x, dx2=b.max.x-(p.x-r);
    const dz1=p.z+r-b.min.z, dz2=b.max.z-(p.z-r);
    const m=Math.min(dx1,dx2,dz1,dz2);
    if(m===dx1)p.x=b.min.x-r;else if(m===dx2)p.x=b.max.x+r;
    else if(m===dz1)p.z=b.min.z-r;else p.z=b.max.z+r;
    e.wall=.35;
  }
  return p;
}
// as "mãos" da sentinela batem no chão: se ela estiver colada numa parede, é
// martelada contra ela e fica atordoada (stun) — a recompensa por jogar o boss na parede
function clampZ(z,min,max){ return z<min?min:(z>max?max:z); }
function armHitWall(e){
  if(!arena3)return false;
  const R=2.3;   // mesma folga usada por clampToArena: martela quando encosta de verdade
  return e.mesh.position.x-R<=arena3.minX+.3||e.mesh.position.x+R>=arena3.maxX-.3
      || e.mesh.position.z-R<=arena3.minZ+.3||e.mesh.position.z+R>=arena3.maxZ-.3;
}
function enemyLabel(e){
  return e.type==='golem'?'A SENTINELA':e.type==='ogre'?'O ogro sentinela':e.type==='guard'?'A sentinela':'O morcego';
}
function applyStun(e,sec,msg){
  if(e.dead||e.stun>0)return false;
  e.stun=sec*DIFF.stun;e.atk=0;e.atkT=0;e.struck=false;e.stunCd=6;
  if(e.vel)e.vel.set(0,0,0);
  spawnSpark(e.mesh.position.clone().add(new THREE.Vector3(0,(e.bodyH||2)*.5,0)));
  AudioSys.tone(120,.3,'square',.09,60);
  showMsg(msg,2400);
  return true;
}
// animação da Sentinela: marcha, pêndulo, mostrador, coroa, mãos, olhos
function sentinelAnim(e,dt){
  const S=e.mesh.userData.sentinel;
  if(!S)return;
  const enraged=e.hp<e.max*.4?1.5:1;
  const stunned=e.stun>0;
  const cyc=e.t*2.4*enraged;
  // pernas: marcha pesada alternada
  if(S.legs){
    const sw=Math.sin(cyc)*(.55+enraged*.15);
    S.legs[0].rotation.x=sw;S.legs[1].rotation.x=-sw;
    if(S.legs[0].position.y)S.legs[0].position.y=2.05+Math.max(0,Math.sin(cyc))*.18;
    if(S.legs[1].position.y)S.legs[1].position.y=2.05+Math.max(0,Math.sin(cyc+Math.PI))*.18;
  }
  // balanço do corpo + peso na passo
  e.mesh.rotation.z+=(Math.sin(cyc)*.035-e.mesh.rotation.z)*Math.min(1,dt*5);
  // pêndulo do relógio (sempre em movimento, amplitude cresce com a raiva)
  if(S.pend)S.pend.rotation.z=Math.sin(e.t*(2.2+enraged))*0.5*enraged;
  // ponteiros do mostrador giram (o tempo do boss)
  if(S.hourH)S.hourH.rotation.z=-e.t*.9*enraged;
  if(S.handM)S.handM.rotation.z=-e.t*.34*enraged;
  // coroa gira devagar
  if(S.crown)S.crown.rotation.y=e.t*.35;
  // núcleo: pulsa; vermelho e enorme quando enfraquecido
  const weak=e.hp<e.max*.4;
  if(S.core){
    const pulse=(e.atk===1||e.atk===3)?1.7+Math.sin(e.t*13)*.35:1+Math.sin(e.t*4)*.18;
    S.core.scale.setScalar(pulse);
    S.core.material.color.setHex(weak?0xff1800:(e.atk===1||e.atk===3?0xffff00:0xff5a00));
  }
  if(S.crownGem)S.crownGem.rotation.y+=dt*1.4;
  if(S.coreLight){
    S.coreLight.intensity=(e.atk===1||e.atk===3)?30+Math.sin(e.t*18)*12:18+Math.sin(e.t*4)*5;
    S.coreLight.color.setHex(weak?0xff2800:0xff7a2a);
    movePoint(S.coreLight,e.mesh.position.x,e.mesh.position.y+3.4,e.mesh.position.z+1.1); // a luz segue o chefe
  }
  // olhos brilham mais na antecipação do ataque
  if(S.eyes)for(const m of S.eyes)m.color.setHex(weak?0xff0000:(e.atk===1?0xffff00:0xff1800));
  // mãos: dedos se fecham no esmagamento, abrem no giro
  if(S.hands){
    const grip=(e.atk===2)?1:(e.atk===4?0:0.25+Math.sin(e.t*2)*.1);
    for(const h of S.hands){
      for(let i=0;i<h.fingers.length;i++){
        h.fingers[i].f2.rotation.x=grip*1.5;
        h.fingers[i].fg.rotation.x=grip*.35;
      }
      h.hand.rotation.x=grip*.15;
    }
  }
  // cabeça olha pro player (sempre)
  tmpV2.subVectors(player.position,e.mesh.position);
  const yawT=Math.atan2(tmpV2.x,tmpV2.z);
  let dy=yawT-e.mesh.rotation.y;while(dy>Math.PI)dy-=2*Math.PI;while(dy<-Math.PI)dy+=2*Math.PI;
  if(S.head)S.head.rotation.y=THREE.MathUtils.clamp(dy,-.5,.5);
  if(S.brow)S.brow.rotation.x=Math.sin(e.t*2)*.05;
  // faíscas/poeira dos pés
  if(Math.random()<dt*(1+enraged))spawnSpark(e.mesh.position.clone().add(new THREE.Vector3((Math.random()-.5)*2.2,.15,(Math.random()-.5)*2.2)));
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
// 🌊 ANEL DE CHOQUE da sentinela: onda circular que CRESCE no chão (dá pra ver de longe)
// e leva poeira. Puramente visual: o dano é aplicado pela IA.
function spawnShockRing(p,maxR,life){
  const g=new THREE.Group();g.position.set(p.x,.35,p.z);scene.add(g);
  const core=new THREE.Mesh(new THREE.TorusGeometry(1,.16,8,36),new THREE.MeshBasicMaterial({color:0xffd070,transparent:true,opacity:.95}));
  core.rotation.x=-Math.PI/2;g.add(core);
  const halo=new THREE.Mesh(new THREE.TorusGeometry(1,.42,8,32),new THREE.MeshBasicMaterial({color:0xff6a20,transparent:true,opacity:.42}));
  halo.rotation.x=-Math.PI/2;g.add(halo);
  const dust=[];
  for(let i=0;i<14;i++){
    const d=new THREE.Mesh(new THREE.SphereGeometry(.18+Math.random()*.2,6,5),new THREE.MeshBasicMaterial({color:0xc08050,transparent:true,opacity:.7}));
    const a=Math.random()*Math.PI*2;
    d.position.set(Math.cos(a)*1.1,.3,Math.sin(a)*1.1);
    d.userData={a,v:5+Math.random()*4};g.add(d);dust.push(d);
  }
  waves.push({ringG:g,core,halo,dust,maxR,life,t:0,lifeT:life});
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
    // ARREMESSO À DISTÂNCIA (NERFADO: a cada 7s, lança de 12 + sangramento + cravada)
    // tolerância ampla de mira (1.0 rad) p/ arremessar de forma confiável!
    const facingThrow=Math.abs(dy)<1.0;
    if(e.cd<=0&&e.throwCd<=0&&dist>6&&dist<e.range&&facingThrow){e.atk=3;e.atkT=.5;e.thrown=false;e.warned=false;e.throwCd=7;AudioSys.tone(140,.2,'sawtooth',.1,60);}
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
        fireSpear(from,new THREE.Vector3(tmpV2.x,0.02,tmpV2.z).normalize(),12);
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
        // só atira se o player estiver PERTO no corredor (menos spam de longe)
        if(Math.abs(player.position.z-from.z)<20)fireSpear(from.clone().addScaledVector(dir,.7),dir,d.dmg||10);
        else d.t=Math.min(d.t,.8);
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
      knockDown(trapDamage(b),'🪨 ESMAGADO pela pedrona!');AudioSys.noise(.4,.2);
    }
  }
  // hazards spikes/lava/blade
  for(const h of hazards){
    h.cd-=dt;
    if(h.type==='spikes'){
      // só fere quem está BAIXO (no fosso) ou no mesmo nível — não através de ponte/chão acima
      const dy=player.position.y-h.pos.y;
      // 🎯 hitbox fiel ao visual: a base retangular (w×d) + 28 cm de folga
      const pad=h.pad??.28;
      const inside=Math.abs(player.position.x-h.pos.x)<=h.w/2+pad&&Math.abs(player.position.z-h.pos.z)<=h.d/2+pad;
      if(inside&&dy<1.0&&dy>-0.6&&h.cd<=0){h.cd=1;knockDown(trapDamage(h),'🦔 Espinhos enferrujados!');}
    }else if(h.type==='lava'){
      // queima quem está com os pés perto do nível da lava (em plataformas altas está seguro)
      const dy=player.position.y-h.pos.y;
      if(dy<0.9&&Math.abs(player.position.x-h.pos.x)<h.w/2&&Math.abs(player.position.z-h.pos.z)<h.d/2&&h.cd<=0){
        h.cd=1;knockDown(trapDamage(h),'🔥 LAVA!',true);AudioSys.splash();   // lava = queimadura
      }
      updateLavaVisual(h,dt);
    }else if(h.type==='lavapit'){
      // ravina de lava: ferve (anima) + quem cai queima e volta pro chão seguro
      updateLavaVisual(h,dt);
      if(!swinging&&Math.abs(player.position.x-h.pos.x)<h.w/2&&Math.abs(player.position.z-h.pos.z)<h.d/2&&player.position.y<1&&h.cd<=0){
        h.cd=1.2;knockDown(trapDamage(h),h.msg,true);   // ravina de lava = queimadura
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
        h.cd=h.maxCd;knockDown(trapDamage(h),'🔆 Laser ancestral!');
        spawnSpark(tmpV.clone());AudioSys.tone(1500,.12,'sawtooth',.09,-900);
      }
    }else if(h.type==='blade'){
      h.t+=dt*1.6;h.pivot.rotation.z=Math.sin(h.t)*1.1;
      // 🎯 a cabeça balança num arco de 5 m: o hitbox tem que acompanhar a ALTURA,
      // senão a lâmina acerta o chão mesmo quando está lá em cima.
      const ang=h.pivot.rotation.z;
      tmpV2.set(h.pos.x+Math.sin(ang)*5,h.pos.y-Math.cos(ang)*5,h.pos.z);
      tmpV.set(player.position.x,player.position.y+.9,player.position.z);
      if(tmpV.distanceTo(tmpV2)<h.r+.35&&h.cd<=0){h.cd=1;knockDown(trapDamage(h),'⚔ Lâmina pendular!');}
    }else if(h.type==='pit'){
      // buraco: volta ao início da fase
      if(!swinging&&Math.abs(player.position.x-h.pos.x)<h.w/2&&Math.abs(player.position.z-h.pos.z)<h.d/2&&player.position.y<1&&h.cd<=0){
        h.cd=1.2;knockDown(trapDamage(h),h.msg);
      }
    }
  }
  // plataformas
  for(const p of platforms){
    if(p.falling){
      const onP=Math.abs(player.position.x-p.mesh.position.x)<p.halfW+.3
               &&Math.abs(player.position.z-p.mesh.position.z)<p.halfD+.3
               &&Math.abs(player.position.y-(p.mesh.position.y+.3))<.6;
      // 🏃 DURANTE A FUGIDA (fase 3) as lajes NÃO desabar: a perseguição já é o
      // desafio, e a ponte precisa ser atravessável de verdade.
      if(escaping&&p.state!==0){
        p.state=0;p.t=0;p.mesh.position.copy(p.center);
        p.box.min.set(p.center.x-p.halfW,p.center.y-.25,p.center.z-p.halfD);
        p.box.max.set(p.center.x+p.halfW,p.center.y+.25,p.center.z+p.halfD);
      }
      // 🕳 pisou: conta `delay` segundos (runa pisca + laje treme) ANTES de cair
      if(onP&&p.state===0&&!escaping){p.t=0;p.state=p.delay>0?4:1;}
      if(p.state===4){
        p.t+=dt;
        if(p.rune)p.rune.material.opacity=.5+Math.sin(p.t*14)*.45;
        p.mesh.position.x+=(Math.random()-.5)*dt*.06;
        if(p.t>=p.delay){
          p.state=1;p.t=0;AudioSys.noise(.45,.16);shake=Math.max(shake,.3);
          showMsg('⚠ A laje cedeu! Não pare!',1200);
        }
      }
      if(p.state===1){p.t+=dt;p.mesh.position.x+=Math.sin(p.t*40)*.02;if(p.t>.7){p.state=2;p.t=0;AudioSys.noise(.3,.1);}}
      if(p.state===2){p.t+=dt;p.mesh.position.y-=dt*6;p.box.min.y-=dt*6;p.box.max.y-=dt*6;if(p.t>2){p.state=3;p.t=0;}}
      if(p.state===3){
        p.t+=dt;
        if(p.t>2.5){
          p.state=0;p.t=0;p.mesh.position.copy(p.center);
          p.box.min.set(p.center.x-p.halfW,p.center.y-.3,p.center.z-p.halfD);
          p.box.max.set(p.center.x+p.halfW,p.center.y+.3,p.center.z+p.halfD);
          if(p.rune)p.rune.material.opacity=.5;
        }
      }
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
  for(let i=waves.length-1;i>=0;i--){
    const w=waves[i];w.t+=dt;
    if(w.ringG){ // 🌊 anel de choque da sentinela: cresce, desvanece, levanta poeira
      const k=Math.min(1,w.t/w.lifeT);
      const r=1+k*w.maxR;
      w.core.scale.set(r,r,1);w.halo.scale.set(r,r,1);
      w.core.material.opacity=.95-k*.9;w.halo.material.opacity=.42-k*.4;
      w.core.material.color.setHex(k<.5?0xfff0b0:0xff7a20);
      for(const d of w.dust){
        d.position.x+=Math.cos(d.userData.a)*d.userData.v*dt;
        d.position.z+=Math.sin(d.userData.a)*d.userData.v*dt;
        d.position.y+=(.6-d.position.y)*Math.min(1,dt*2);
        d.material.opacity=.7-k*.7;
      }
      if(w.t>w.lifeT){scene.remove(w.ringG);waves.splice(i,1);}
      continue;
    }
    // 🌊 anel simples de impacto: cresce, desvanece e some da cena
    w.m.scale.setScalar(1+w.t*8);w.m.material.opacity=.9-w.t*1.2;
    if(w.t>.7){scene.remove(w.m);waves.splice(i,1);}
  }
}
// 🧲 COLETAR ITEM: vale tanto p/ encostar nele quanto p/ o laço puxar até a mão
function collectPickup(p){
  if(p.taken)return false;
  p.taken=true;scene.remove(p.mesh);
  const at=p.mesh.position.clone();
  if(p.heart){
    tutEvent('drop');
    heal(LIFE_HEAL);AudioSys.tone(520,.15,'sine',.1,200);
    // 💚 kit: "estoura" em faíscas verdes com anel de choque
    shatter(at,0x51ff7a,10,.9);
    shockRingPop(at,0x51ff7a);
    if(Math.random()<0.25&&hpPills<140){
      hpPills+=20;save.hpPills=hpPills;save.maxHealth=200+hpPills;persist();applyDiffMaxHealth();heal(20);
      showMsg('💊 PÍLULA VITAL! Vida máxima agora '+maxHealth+'!');AudioSys.relicBig();
    }
    else showMsg('💊 Kit de vida! +'+LIFE_HEAL+' vida!');
  }
  else if(p.skill){
    tutEvent('drop');
    AudioSys.tone(660,.2,'triangle',.15,330);
    // 💧 frasco QUEBRA: cacos de vidro voam + brilho (não evapora)
    shatter(at,0x9be7ff,16,1.25,true);
    shatter(at,0x6666ff,8,.8,true);
    shockRingPop(at,0x8ad7ff);
    AudioSys.noise(.18,.14);
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
    shatter(at,p.big?0xffd24a:0xffd76a,p.big?26:14,p.big?1.6:1);
    shockRingPop(at,p.big?0xffd76a:0xffe27a);
    showMsg(p.big?'🏆 O CÁLICE DA ÂNCORA É SEU! FUJA!!!':'⚙️ Fragmento! ('+relics+'/'+(currentInfo.needRelics||relicsTotal)+')');
    checkPuzzle();
  }
  updateHUD();
  return true;
}
function updatePickups(dt){
  for(const p of pickups){
    if(p.taken||p.lassoed)continue;p.t+=dt;
    p.mesh.rotation.y+=dt*(p.big?.8:2.5);
    if(p.halo)p.halo.scale.setScalar(1+Math.sin(p.t*5)*.12); // anel do kit pulsa
    // flutua em TORNO da altura original (antes ia subindo sem parar)
    p.mesh.position.y=(p.baseY??p.mesh.position.y)+Math.sin(p.t*2.2)*.13;
    // ⏱️ o item laçado voa até a mão: a coleta acontece quando ele chega (updateLassoPick)
    if(p.lassoed)continue;
    if(p.mesh.position.distanceTo(tmpV.set(player.position.x,player.position.y+1,player.position.z))<1.3)
      collectPickup(p);
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
      else if(levelIndex===2&&!escaping){showMsg('🔒 O túnel só abre com o CÁLICE! Derrote a Sentinela e tome o cálice no pedestal.',3000);}
      else if(doorBlocked){
        if(need&&relics<need)showMsg(`🔒 O portão exige ${need} fragmentos! Você tem ${relics}.`,2500);
        else if(altars.some(a=>a.done))showMsg('📖 Responda às perguntas do livro para abrir esta porta!',3000);
        else showMsg('📖 Esta porta só abre pelo LIVRO do altar. Aperte E no livro!',3000);
      }
      // ⛩️ fase 3: o selo do Cálice só se rompe no altar do túnel
      else if(levelIndex===2&&escapeUnlocked){
        const selo=altars.find(a=>a.need==='fuga');
        if(selo&&selo.done&&!finaleStarted){finaleStarted=true;playFinale();}
        else if(selo&&!selo.done&&!selo.rose)showMsg('⛩️ O altar do selo ainda está subterrâneo…',2600);
        else if(selo&&!selo.done)showMsg('🏆 O CÁLICE ESTÁ SELADO: aperte E no altar para romper o selo ⛩️',3400);
      }
      else if(need&&relics<need){showMsg(`🔒 Junte ${need} fragmentos! Faltam ${need-relics}.`,2500);}
      else nextLevel();
    }
  }
  // alavancas proximidade (a mais próxima é a "ativa" pro E)
  interactTarget=null;
  let bestL=null,bestD=2.6;
  for(const l of levers){const d=l.pos.distanceTo(player.position);if(d<bestD){bestD=d;bestL=l;}}
  if(bestL&&!bestL.on)interactTarget=bestL;
  for(const a of altars){   // 📖 altar tem prioridade: o livro é o objetivo
    if(a.rose&&a.pos.distanceTo(player.position)<3.2){
      // ✋ ao chegar perto, a tecla E dourada aparece apontando pro livro
      interactTarget={pos:a.pos,on:!!a.done,hint:a.need==='fuga'?'romper o selo do Cálice 🏆':'abrir o livro ancestral 📖',id:a.id,py:1.0};break;}
  }
  if(idolPedestal&&levelIndex===2&&boss&&boss.dead&&!escaping){
    // ídolo já é pickup big; nada extra
  }
}
function doInteract(){
  // ⚠ recalcula a alavanca MAIS PRÓXIMA no instante do clique: usar o alvo do
  // frame anterior fazia o E puxar a alavanca errada andando entre duas.
  let altar=null,ad=2.8;
  for(const a of altars){const d=a.pos.distanceTo(player.position);if(d<ad){ad=d;altar=a;}}
  if(altar){useAltar(altar);return;}
  let best=null,bd=2.6;
  for(const l of levers){const d=l.pos.distanceTo(player.position);if(d<bd){bd=d;best=l;}}
  if(best)toggleLever(best);
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
function updateSparks(dt){
  for(const s of sparks){
    if(!s.live)continue;
    s.t-=dt;
    if(s.t<=0){s.live=false;s.m.visible=false;continue;}
    s.m.scale.setScalar(1+(0.3-s.t)*4);
    s.m.material.opacity=Math.min(1,s.t*3);
  }
}
function updateTorches(){
  const t=performance.now()*.008;
  // chama mais forte (fases 2/3 bem visíveis) + cintilação suave
  for(const o of torches){
    o.flame.scale.setScalar(1+Math.sin(t+o.seed)*.18);
    if(o.light)o.light.intensity=(o.baseI||20)*(1+Math.sin(t*1.3+o.seed)*.2);
  }
}
// 🎬 O DESABAMENTO: quando a Sentinela cai e o CÁLICE é tomado, o jogo PARA e
// mostra o que o herói ouve primeiro — o tremor e os pingos de lava. Só depois
// que a cutscene acaba a pedra aparece e a missão da fuga é anunciada.
function playCollapseCutscene(){
  state='cutscene';
  document.exitPointerLock?.();
  cutCam.fov=56;
  cutscenes.start([
    {k:'O SILÊNCIO',t:'Algo mudou',
     x:'Você tira o chapéu. A câmara deveria estar em silêncio — e por um instante está. A Sentinela parou. O Cálice gira sozinho no pedestal.',
     cam:[0,3.6,-14,0,1.8,-20]},
    {k:'OS SINAIS',t:'Você escuta tremores',
     x:'E então você escuta: um <b>tremor</b> surdo, lá embaixo, como se a caverna inteira respirasse. Não é o Relógio. É a pedra.',
     cam:[-7,2.2,-14,-1,.6,-17]},
    {k:'A CHUVA',t:'Pingos de lava',
     x:'E depois os <b>pingos</b>: pingos de lava caindo do teto no chão da câmara, um de cada vez, como um relógio contando o que vem a seguir.',
     cam:[6,5.2,6,0,.4,-6]},
    {k:'NÃO OLHE PARA TRÁS',t:'Corra!',
     x:'O teto racha. A câmara desmorona. E lá atrás de você, alguma coisa muito grande acaba de acordar.',
     cam:[0,6.5,10,0,2.2,-10]},
  ],0,()=>{
    state='playing';
    cutCam.fov=62;camera.updateProjectionMatrix();
    beginEscape();
  });
}
function beginEscape(){
  escaping=true;AudioSys.roar();AudioSys.door();
  openDoor('escape3');
  // 🪨 a pedra aparece AGORA (depois da cutscene), bem atrás do herói
  const m=new THREE.Mesh(new THREE.DodecahedronGeometry(2.3,1),MAT(0x4a382c));
  m.position.set(player.position.x,2.2,clampZ(player.position.z-9,-20,20));
  m.castShadow=true;m.receiveShadow=true;scene.add(m);
  for(let i=0;i<5;i++){   // estilhaços voando no momento em que ela racha o chão
    const ch=new THREE.Mesh(new THREE.DodecahedronGeometry(.5+Math.random()*.6,0),MAT(0x3a2c22));
    ch.position.copy(m.position).add(new THREE.Vector3((Math.random()-.5)*3,Math.random()*1.5,(Math.random()-.5)*3));
    ch.castShadow=true;scene.add(ch);
    dynamics.push({type:'rockChip',mesh:ch,t:0,life:2.2,
      vx:(Math.random()-.5)*5,vy:3+Math.random()*4,vz:(Math.random()-.5)*5});
  }
  const ring=POINT(0xff6a20,40,22,1.7,m.position.x,m.position.y-1.2,m.position.z,6);
  m.userData.ring=ring;
  escapeBoulder={mesh:m,speed:5.2};
  shake=1;
  // 🎯 MISSÃO: "CORRA PELA SUA VIDA" + o lembrete de SHIFT
  showMission('🎯 MISSÃO','CORRA PELA SUA VIDA',
    'A <b>pedra</b> vem atrás de você! Atravesse a ponte de lajes e o túnel. <b>Segure SHIFT para CORRER</b> — a fuga é longa.',true);
  objEl.textContent='🏃 CORRA PELA SUA VIDA! (SHIFT para correr)';
  showMsg('🏃 CORRA PELA SUA VIDA!',3000);
  AudioSys.tone(180,.5,'sawtooth',.18,60);
}
let escapeCut=false,finaleStarted=false,escapeUnlocked=false;
function updateBossEscape(dt){
  if(levelIndex===2&&boss&&boss.dead&&!escaping&&!escapeCut){
    // verifica se pegou o cálice (pickup big sumiu)
    const idol=pickups.find(p=>p.big);
    if(idol&&idol.taken){escapeCut=true;playCollapseCutscene();return;}
  }
  // 🚪 cruzou a porta e entrou no túnel (z>52) = FUGA VENCIDA. O altar do selo
  // emerge aqui; um único E rompe o selo e libera o final do jogo (sem quiz).
  if(escaping&&!escapeUnlocked&&player.position.z>52){
    escapeUnlocked=true;
    showMsg('🚪 A pedra esmagou a porta! Você escapou — o ALTAR DO SELO emergiu do chão.',5200);
    objEl.textContent='⛩️ Aperte E no altar para romper o selo do Cálice 🏆';
    AudioSys.win();
  }
  if(escaping&&escapeBoulder){
    tmpV.subVectors(player.position,escapeBoulder.mesh.position);tmpV.y=0;
    const d=tmpV.length();if(d<1e-4)tmpV.set(0,0,1);else tmpV.normalize();
    // avança em direção ao herói, mas NUNCA sai da arena (não atravessa parede nenhuma)
    const nb=clampToArena(escapeBoulder,escapeBoulder.mesh.position.x+tmpV.x*escapeBoulder.speed*dt,
      escapeBoulder.mesh.position.z+tmpV.z*escapeBoulder.speed*dt,2.4);
    escapeBoulder.mesh.position.x=nb.x;escapeBoulder.mesh.position.z=nb.z;
    escapeBoulder.mesh.rotation.x+=dt*4;escapeBoulder.mesh.rotation.z+=dt*2.2;
    const ebr=escapeBoulder.mesh.userData.ring;
    if(ebr){ebr.intensity=40+Math.sin(levelTime*9)*12;movePoint(ebr,nb.x,nb.y-1.2,nb.z);}
    // 🪨 a pedra acelera, mas NUNCA passa da CORRIDA do herói (SHIFT = 8,6 m/s).
    // Sem teto, ela vencia a fuga de qualquer jeito e a ponte virava decoração.
    escapeBoulder.speed=Math.min(escapeBoulder.speed+dt*.25,7.1);
    shake=Math.max(shake,.15);
    // 🪨 esmaga com CARÊNCIA: encostar não é morrer na hora, é levar a pedra
    // junto e sair jogado para trás (o dano() já tem 0,7 s de invulnerabilidade).
    if(d<3.2){damage(22,'🪨 A PEDRONA TE ATINGIU!');escapeBoulder.mesh.position.addScaledVector(tmpV,-4.2);}
    if(Math.random()<.4)spawnSpark(escapeBoulder.mesh.position.clone().add(new THREE.Vector3(0,-1.5,0)));
  }
  // 🪨 estilhaços da pedra rachando o chão
  for(let i=dynamics.length-1;i>=0;i--){
    const d=dynamics[i];
    if(d.type!=='rockChip')continue;
    d.t+=dt;
    d.vy-=18*dt;
    d.mesh.position.x+=d.vx*dt;d.mesh.position.y+=d.vy*dt;d.mesh.position.z+=d.vz*dt;
    d.mesh.rotation.x+=dt*5;d.mesh.rotation.z+=dt*3.4;
    d.mesh.scale.setScalar(Math.max(.05,1-d.t/d.life));
    if(d.mesh.position.y<.15){d.mesh.position.y=.15;d.vy*=-.3;}
    if(d.t>d.life){scene.remove(d.mesh);dynamics.splice(i,1);}
  }
  if(shake>0){shake-=dt;if(shake<0)shake=0;}
}
// ---------- CÂMERA: colisão real (nunca atravessa parede/teto) ----------
// Marcha o raio da cabeça até o ponto desejado da câmera contra todos os colliders
// e devolve o ponto LIVRE mais próximo. Barato (poucos colliders) e sem depender de
// Raycaster, então funciona igual no navegador e no harness headless.
const _camRay=new THREE.Vector3(), _camStep=new THREE.Vector3(), _camHit=new THREE.Vector3(), _camDir=new THREE.Vector3();
const CAM_SKIN=.34;     // folga da câmera perto da parede
const CAM_STEP=.22;     // resolução da marcha
function camFreeDistance(from,to,maxT){
  // distância segura (0..maxT) em `from`->`to` sem entrar em nenhum collider sólido
  _camRay.subVectors(to,from);
  const len=_camRay.length();
  if(len<1e-5)return 0;
  _camRay.multiplyScalar(1/len);
  for(const c of colliders){
    const b=c.box;
    if(b.max.y<=from.y+.2)continue;             // chão/laje abaixo da câmera: não bloqueia
    if(b.min.y>=from.y+40)continue;             // muito acima: irrelevante
    const bminX=b.min.x-CAM_SKIN,bmaxX=b.max.x+CAM_SKIN;
    const bminY=b.min.y-CAM_SKIN,bmaxY=b.max.y+CAM_SKIN;
    const bminZ=b.min.z-CAM_SKIN,bmaxZ=b.max.z+CAM_SKIN;
    for(let t=CAM_STEP;t<=maxT;t+=CAM_STEP){
      _camStep.set(from.x+_camRay.x*t,from.y+_camRay.y*t,from.z+_camRay.z*t);
      if(_camStep.x>bminX&&_camStep.x<bmaxX&&_camStep.y>bminY&&_camStep.y<bmaxY&&_camStep.z>bminZ&&_camStep.z<bmaxZ)
        return Math.max(0,t-CAM_STEP);
    }
  }
  return maxT;
}
function camClamp(p,from){
  // mesma marcha, mas a partir de um ponto JÁ livre: encurta até não tocar nada
  const total=from.distanceTo(p);
  const d=camFreeDistance(from,p,total);
  if(d>=total-1e-3)return p;
  _camDir.subVectors(p,from).normalize();
  return _camHit.copy(from).addScaledVector(_camDir,Math.max(.35,d));
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
  const want=new THREE.Vector3(cx,Math.max(cy,(isFinite(gy)?gy:0)+.6),cz);
  if(!isFinite(want.x+want.y+want.z))want.set(pp.x,pp.y+4,pp.z+7);
  // 🎥 NUNCA PENETRA PAREDE: puxa a câmera de volta pro ponto livre mais perto do herói
  const safe=camClamp(want,head);
  // entra/sai rápido, para não "escorregar" pela parede ao girar
  const k=1-Math.exp(-dt*(safe===want?15:30));   // câmera colada no herói (antes 7 = macia demais)
  camPos.lerp(safe,k);
  // segurança extra: se ainda assim ficou dentro de algo, corta na hora
  if(camFreeDistance(head,camPos,camPos.distanceTo(head))<camPos.distanceTo(head)-.02){
    camPos.copy(safe);
  }
  camera.position.copy(camPos);
  if(shake>0){camera.position.x+=(Math.random()-.5)*shake*.6;camera.position.y+=(Math.random()-.5)*shake*.6;}
  camera.lookAt(head.x,head.y-.2,head.z);
  sun.target.position.copy(player.position);sun.position.set(player.position.x+30,50,player.position.z+20);
}

// ================= CUTSCENES =================
// Quadro de cinema: barra preta, legenda, esmaecimento e câmera panorâmica real
// (a câmera passeia pelo cenário enquanto o texto conta a história).
const cutscenes={
  active:null,
  start(frames,dur,onDone){
    this.frames=frames;this.i=0;this.dur=dur;this.onDone=onDone;
    this.active=true;
    $('cutscene').classList.remove('hidden');
    hud.classList.add('hidden');
    document.exitPointerLock?.();
    document.body.classList.add('cutscene-on');
    this.showFrame(0);
  },
  showFrame(i){
    const f=this.frames[i];
    $('cs-kicker').textContent=f.k;
    $('cs-title').textContent=f.t;
    const txt=$('cs-text');
    txt.classList.remove('show');
    txt.textContent=f.x;
    void txt.offsetWidth;                 // reflow: reinicia a animação da legenda
    $('cs-text').classList.add('show');
    // reposiciona a câmera do quadro: cada quadro define um ponto de vista
    if(f.face&&player){
      // 🎥 quadro final: a câmera se posiciona sozinha NA FRENTE do herói,
      // virada para ele (o rosto entra no quadro), com deriva mínima
      const yawP=player.rotation.y,fx=Math.sin(yawP),fz=Math.cos(yawP);
      cutCam.pos.set(player.position.x+fx*3.4,player.position.y+1.55,player.position.z+fz*3.4);
      cutCam.look.set(player.position.x,player.position.y+1.25,player.position.z);
      cutCam.drift=.18;
    }else if(f.cam){cutCam.pos.set(f.cam[0],f.cam[1],f.cam[2]);cutCam.look.set(f.cam[3],f.cam[4],f.cam[5]);cutCam.drift=1;}
  },
  skip(){
    if(!this.active)return;
    const end=this.onDone;this.active=null;
    $('cutscene').classList.add('hidden');
    document.body.classList.remove('cutscene-on');
    $('cs-bar').style.transition='';$('cs-bar').style.opacity='';
    $('cs-text').classList.remove('show');
    this.onDone=null;end&&end();
  },
  advance(){
    if(!this.active)return;
    if(this.i>=this.frames.length-1){this.skip();return;}
    this.i++;
    this.showFrame(this.i);
    AudioSys.tone(520+this.i*40,.12,'triangle',.07,300);
  },
};
const cutCam={pos:new THREE.Vector3(),look:new THREE.Vector3(),fov:55,drift:1};
// enquanto a cutscene toca, o loop principal só move a câmera
function updateCutscene(dt){
  if(!cutscenes.active)return;
  cutscenes.t=(cutscenes.t||0)+dt;
  // deriva lenta e suave pela cena (panorâmica cinematográfica)
  const t=cutscenes.t, d=cutCam.drift;
  camera.position.set(
    cutCam.pos.x+Math.sin(t*.22)*2.2*d,
    cutCam.pos.y+Math.sin(t*.31+1.2)*.5*d,
    cutCam.pos.z+Math.cos(t*.19)*1.8*d);
  camera.lookAt(cutCam.look.x,cutCam.look.y,cutCam.look.z);
  // o sol acompanha o que a câmera está olhando (sombra certa em todo o passeio)
  sun.target.position.copy(cutCam.look);sun.position.set(cutCam.look.x+30,50,cutCam.look.z+20);
  // leve "respirada" de FOV: dá sensação de travelling
  if(camera.fov!==54+Math.sin(t*.4)*1.2){camera.fov=54+Math.sin(t*.4)*1.2;camera.updateProjectionMatrix();}
  renderer.render(scene,camera);
}

// ---------- FLOW ----------
function nextLevel(){
  AudioSys.win();
  score+=500+Math.max(0,300-Math.floor(levelTime)*2);
  totalScore+=score;score=0;totalTime+=levelTime;
  save.unlocked=Math.max(save.unlocked,Math.min(2,levelIndex+1));save.totalRelics+=relics;persist();
  if(levelIndex>=2){playFinale();return;}
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
  $('victory-stats').textContent=`Tempo total ${fmt(totalTime)} • Pontos ${totalScore} • Com o Cálice da Âncora você voltou a 1969 para impedir Voller de reescrever a história!`;
  $('victory').classList.remove('hidden');hud.classList.add('hidden');
}
// 🎬 CENA FINAL: o final inteiro, no espírito do Raiders.
// O herói foge com a relíquia, o governo quer estudá-la, enchem de areia e
// dão o caso por encerrado — e no último plano ele a rouba de volta e some
// na estrada. Ninguém escreve o final dele.
function playFinale(){
  document.exitPointerLock?.();
  cutCam.fov=52;
  cutscenes.start([
    {k:'A CÂMARA DESABA',t:'Você olha para trás uma vez só',
     x:'A pedra passa raspando e arranca um pedaço da câmara. O túnel se fecha atrás de você com um estrondo — e o Relógio de Arquimedes fica lá embaixo, para sempre.',
     cam:[0,3.4,52,0,1.8,58]},
    {k:'O PREÇO',t:'Nova York, dias depois',
     x:'Um prédio cinza,eringa antes de amanhecer. Homens de terno recebem o Cálice com luvas de branco e conferem cada canto. Um general oferece cigarros e promete: "<b>Vamos estudá-lo</b>. É a maior descoberta da história."',
     cam:[5,2.6,6,0,1.6,0]},
    {k:'A AREIA',t:'Nada de abrir aquilo',
     x:'O relatório sai rápido: artefato perigoso demais para ser aberto, selado para sempre. Enchem o Cálice de <b>areia</b>, lacram com fita adesiva e mandam o caixote para o porão. É o que todo mundo acha que acabou ali.',
     cam:[-4,2.2,-3,0,1.2,-4]},
    {k:'A ÚLTIMA VIAGEM',t:'Você já tinha visto antes',
     x:'Numa sala escura, sob a luz de um lampião, um homem de bigode e jaqueta ainda repete a mesma história de mil anos atrás. E desta vez não é só história: o <b>Cálice está na sua frente</b>, de verdade.',
     cam:[2.5,1.9,2.5,0,1.3,0]},
    {k:'A FUGA FINAL',t:'De novo',
     x:'Você não explica nada. E não precisa. Três horas depois, o Cálice já estava num <b>caminhão</b> atravessando o deserto, com metade de Washington atrás dele — e, na cabine, um homem de fedora mudando de rota.',
     cam:[-8,3.2,-4,0,1.6,-1]},
    {k:'O ÚLTIMO PLANO',t:'Ninguém escreve o final',
     x:'O caminhão some no horizonte. O Cálice da Âncora — que leva o seu portador a qualquer lugar do tempo — vai parar nas mãos de um aventureiro que nunca pede permissão. <b>Jürgen Voller nunca vai ter o final que ele escreveu.</b>',
     cam:[0,6,14,0,1,-10]},
    {k:'1969',t:'O chapéu',
     x:'Na calçada de uma cidade que não é esta, alguém recolhe um fedora da poeira e guarda no bolso. O chapéu ainda está morno.',
     cam:[3,1.4,5,0,1.2,0]},
  ],0,()=>{
    // fim do epílogo: devolve o jogo ao estado de vitória (tela final)
    cutCam.fov=62;camera.updateProjectionMatrix();
    hideMission();
    winGame();
  });
  state='cutscene';
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
// 🎬 PRÓLOGO: cutscene de abertura (Nova York 1969 → a fenda na Amazônia) antes da fase 1
$('btn-start').onclick=()=>{
  // ⛔ obrigatório escolher uma dificuldade antes de começar
  if(!diffChosen){
    const p=$('difficulty');
    if(p){p.scrollIntoView&&p.scrollIntoView({block:'center'});p.classList.add('shake');setTimeout(()=>p.classList.remove('shake'),600);}
    showMsg('⚠ Escolha uma dificuldade (🟢 🟡 🔴) para começar a aventura!',2600);
    AudioSys.tone(160,.22,'square',.12,-60);
    return;
  }
  AudioSys.init();
  $('menu').classList.add('hidden');
  cutCam.fov=55;
  loadLevel(0);                                 // 🗺️ a Fase 1 fica atrás da cutscene
  cutscenes.start(PROLOGUE,0,()=>{
    state='story';
    $('story-kicker').textContent=STORIES[0].k;
    $('story-title').textContent=STORIES[0].t;
    $('story-text').textContent=STORIES[0].x;
    $('story').classList.remove('hidden');
  });
  state='cutscene';
};
$('btn-next').onclick=()=>{$('story').classList.add('hidden');const idx=STORIES.findIndex(s=>s.t===$('story-title').textContent);startGameWithStory(idx);};
// Cutscenes: pular (clique/Espaço/Enter) e passar quadro (setas/clique)
addEventListener('keydown',e=>{
  if(!cutscenes.active)return;
  if(e.code==='Space'||e.code==='Enter'){e.preventDefault();cutscenes.advance();}
  if(e.code==='Escape'){e.preventDefault();cutscenes.skip();}
});
$('cutscene').addEventListener('click',()=>cutscenes.advance());
function startGameWithStory(idx){['menu','story'].forEach(id=>$(id).classList.add('hidden'));hud.classList.remove('hidden');if(isMobile())$('touch-controls').classList.remove('hidden');if(idx!==levelIndex||state!=='playing'){if(totalScore===0&&idx===0){totalScore=0;totalTime=0;kills=0;secondChances=0;}loadLevel(idx);}state='playing';if(!isMobile())setTimeout(()=>renderer.domElement.requestPointerLock?.(),100);}
$('btn-resume').onclick=resumeGame;
$('btn-restart').onclick=()=>{$('pause').classList.add('hidden');score=0;loadLevel(levelIndex);state='playing';};
$('btn-quit').onclick=()=>{location.reload();};
$('btn-retry').onclick=()=>{$('gameover').classList.add('hidden');hud.classList.remove('hidden');score=0;loadLevel(levelIndex);state='playing';if(!isMobile())renderer.domElement.requestPointerLock?.();};
$('btn-go-menu').onclick=()=>location.reload();
$('btn-again').onclick=()=>location.reload();
$('btn-help').onclick=()=>$('help-text').classList.toggle('hidden');
// ⚙ DIFICULDADE: escolhe no menu, marca o botão e salva
for(const b of document.querySelectorAll('.diff-btn'))
  b.onclick=()=>{setDifficulty(b.dataset.diff);AudioSys.tone(700,.12,'triangle',.09,900);};
// ⚙ boot: só pré-seleciona se JÁ existe escolha salva; senão o jogador tem que escolher
if(save.difficulty&&DIFFS[save.difficulty])setDifficulty(save.difficulty);
else{diffChosen=false;DIFF=DIFFS.medio;reflectDiffUI();}
$('btn-tut-skip').onclick=()=>{if(tutOn)stopTutorial(true);};
if(save.unlocked>0||save.totalRelics>0){const b=$('btn-continue');b.classList.remove('hidden');b.textContent=`↻ CONTINUAR DA FASE ${Math.min(3,save.unlocked+1)}`;b.onclick=()=>{AudioSys.init();$('menu').classList.add('hidden');totalScore=0;totalTime=0;$('story-kicker').textContent=STORIES[save.unlocked].k;$('story-title').textContent=STORIES[save.unlocked].t;$('story-text').textContent=STORIES[save.unlocked].x;$('story').classList.remove('hidden');state='story';};}

// clica no canvas = chicote (além de lock)
renderer.domElement.addEventListener('mousedown',e=>{if(state==='playing'&&(pointerLocked||isMobile())){if(e.button===0)tryWhip=true;}});

// splash crédito inicial: GRANDE e RÁPIDO antes do jogo (some sozinho!)
try{
  setTimeout(()=>{try{$('splash-dev').classList.add('hidden');}catch{}},2300);
  setTimeout(()=>{try{$('splash-dev')?.remove?.();}catch{}},3000);
}catch{}
// boot: diorama de fundo p/ o menu (renderizado pelo loop único animate())
hpPills=save.hpPills||0;maxHealth=200;applyDiffMaxHealth();applyDiffWhip();
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
// __SHOT_DEBUG__
window.__dbg={
  pro(f=0){$('btn-start').onclick();for(let i=0;i<f&&cutscenes.active;i++)cutscenes.advance();},
  finale(f=0){$('menu').classList.add('hidden');playFinale();for(let i=0;i<f&&cutscenes.active;i++)cutscenes.advance();},
  lvl(i,f=0){loadLevel(i);$('menu').classList.add('hidden');$('story').classList.add('hidden');$('cutscene').classList.add('hidden');state='playing';},
  none(){},
  noaudio(){AudioSys.init=()=>{};AudioSys.ctx=null;$('btn-start').onclick();},
  // --- debug de mapa/hitbox (dev only) ---
  tp(x,y,z){player.position.set(x,y,z);vy=0;pvx=0;pvz=0;swinging=null;},
  look(yDeg,pDeg=-14){yaw=yDeg*Math.PI/180;pitch=Math.max(-0.9,Math.min(0.6,pDeg*Math.PI/180));},
  where(){return {x:+player.position.x.toFixed(2),y:+player.position.y.toFixed(2),z:+player.position.z.toFixed(2),state,levelIndex,relics,health};},
  cam(){return {c:[camera.position.x,camera.position.y,camera.position.z].map(v=>+v.toFixed(2)),t:[camPos.x,camPos.y,camPos.z].map(v=>+v.toFixed(2)),yaw:+yaw.toFixed(3),pitch:+pitch.toFixed(3),objs:scene.children.length,mesh:renderer.info.render.triangles};},
  probe(){const b=addBox(0,999,0,1,1,1,MATX(0xb0a084,{surf:'stone',repeat:2}));const m=b.mesh.material;scene.remove(b.mesh);colliders.pop();const a=new THREE.Mesh(boxGeo,MATX(0xb0a084,{surf:'stone',repeat:2})).material;return {addBoxHex:m.color.getHexString(),addBoxBump:!!m.bumpMap,directHex:a.color.getHexString(),directBump:!!a.bumpMap,rawHex:MAT(0xb0a084).color.getHexString()};},
  traps(){return hazards.map(h=>({type:h.type,x:+h.pos.x.toFixed(1),z:+h.pos.z.toFixed(1),dmg:h.dmg,w:h.w,d:h.d,r:h.r})).concat(rollers.map(r=>({type:'roller:'+r.kind,x:+r.mesh.position.x.toFixed(1),z:+r.mesh.position.z.toFixed(1),dmg:r.dmg}))).concat(boulders.map(b=>({type:'boulder',x:+b.center.x.toFixed(1),z:+b.center.z.toFixed(1),dmg:b.dmg})));},
  walls(){return colliders.filter(c=>c.mesh).map(c=>({min:[+c.box.min.x.toFixed(1),+c.box.min.y.toFixed(1),+c.box.min.z.toFixed(1)],max:[+c.box.max.x.toFixed(1),+c.box.max.y.toFixed(1),+c.box.max.z.toFixed(1)],col:c.mesh.material?.color?.getHexString?.()||''}));},
  hudOff(){hud.classList.add('hidden');},
  down(){return {t:+downT.toFixed(2),msg:downMsg};},
  // 📖 altar/livro/quiz (dev)
  useAltar(){const a=altars[0];if(!a)return false;useAltar(a);return !!quizState;},
  quizDemo(){if(!altars[0])return false;startQuiz(altars[0]);return !!quizState;},
  get spinCD(){return spinCD}, get spinT(){return spinT}, get SPIN_R(){return SPIN_R},
  get SPIN_COST(){return SPIN_COST}, get SPIN_CD_MAX(){return SPIN_CD_MAX}, get SPIN_DMG(){return SPIN_DMG}, get SPIN_DUR(){return SPIN_DUR},
  spin(){doSpin();return spinT>0;},
  aim(){doAimLock();return !!aimLock;},
  get aimLock(){return aimLock}, get reticle(){return aimReticle?{g:aimReticle}:null},
  setSpinCD(v){spinCD=v;},
  releaseAim(){releaseAim();},
  spinShot(){ // dev: área aberta e giro já em andamento p/ screenshots
    loadLevel(0);$('menu').classList.add('hidden');$('story').classList.add('hidden');$('cutscene').classList.add('hidden');
    state='playing';health=100000;player.position.set(0,0.2,30);yaw=0;pitch=-.22;
    stamina=100;spinCD=0;spinT=0;whipAnim=0;doSpin();
  },
  quizOpen(){return quizState?{q:quizState.qs[quizState.i].q,cat:quizState.qs[quizState.i].c,i:quizState.i,n:quizState.qs.length,right:quizState.right}:false;},
  quizAll(){return quizState?quizState.qs.map(q=>q.c):[];},
  quizTexts(){return quizState?quizState.qs.map(q=>q.q):[];},
  quizWrong(){if(!quizState||quizState.locked)return false;const q=quizState.qs[quizState.i];answerQuiz((q.k+1)%q.a.length);return true;},
  quizAbort(){if(!quizState)return false;quizState=null;$('quiz').classList.add('hidden');if(state==='quiz')state='playing';hud.classList.remove('hidden');return true;},
  quizWin(){if(!quizState||quizState.locked)return false;quizFast=true;answerQuiz(quizState.qs[quizState.i].k);return true;},
  altars(){return altars.map(a=>({id:a.id,ready:a.ready,done:a.done,rose:a.rose,need:a.need,doorId:a.doorId,pos:a.pos.toArray().map(v=>+v.toFixed(1))}));},
  useAltarId(id){const a=altars.find(x=>x.id===id);if(!a)return false;useAltar(a);return !!quizState;},
  bank(){return QUIZ_BANK;},
  hudOn(){hud.classList.remove('hidden');},
};
