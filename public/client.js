/* =========================================================================
   BEACH BUGGY ONLINE — upgraded client (v2 "200%")
   - PBR materials + PMREM environment reflections, ACES tone mapping
   - Soft shadows, gradient sky, sun glow, drifting clouds, animated sea
   - Detailed buggy with helmeted humanoid driver, roll cage, exhaust, lights
   - Exhaust GAS smoke, tire dust, drift smoke, skid marks, boost flames
   - Analog controls: gas throttle, brake, steer (keys / buttons / tilt / tap)
   - Auto-align to track, speed-sensitive steering, up to ~200 km/h
   - Power-ups: rocket, bomb, shield dome, speed, warp + bonus mine
   - Real-time multiplayer (WebSocket): lobby, dual (2P) + championship (6P)
   - Local bots fill empty slots; WebAudio engine + sfx
   ========================================================================= */
'use strict';
const T = THREE;
const $ = id => document.getElementById(id);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const lerp = (a,b,t)=>a+(b-a)*t;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const rand = (a,b)=>a+Math.random()*(b-a);
const mulberry32 = a => () => { a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296; };

/* ---------------- constants ---------------- */
const LAPS = 3;
const WL = 18;                 // track half-width
const N = 640;                 // centerline samples
const MAXKMH = 200;
const PLAYER_VMAX = 55.5;      // m/s ~ 200 km/h
const BOT_VMAX = 49;
const SLOT_COLORS = ['#ff5a1f','#2f7dff','#1fae5a','#ffd23f','#9a2fd6','#ff2f6d'];
const SLOT_SKINS  = [0xc68642,0x8d5524,0xe0ac69,0xf1c27d,0xffdbac,0x6b4226];
const BOT_NAMES = ['Mako','Dune','Surge','Coco','Viper','Blaze','Reef','Tide'];
const ITEMS = ['rocket','rocket','bomb','dome','speed','warp','mine'];
const ITEM_NAME = {rocket:'🚀 Rocket',bomb:'💣 Bomb',dome:'🛡 Shield',speed:'⚡ Nitro',warp:'🌀 Warp',mine:'💥 Mine'};

/* ---------------- renderer / scene / camera ---------------- */
const renderer = new T.WebGLRenderer({canvas:$('c'),antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,innerWidth<760?1.35:1.7));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.outputEncoding = T.sRGBEncoding;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = .78;

const scene = new T.Scene();
scene.fog = new T.Fog(0xbfe3f0, 160, 620);

const camera = new T.PerspectiveCamera(62,1,0.1,2000);
const ANISO = renderer.capabilities.getMaxAnisotropy();

function tex(w,h,fn,rx=1,ry=1){
  const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);
  const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(rx,ry);
  t.anisotropy=ANISO;t.encoding=T.sRGBEncoding;return t;
}

/* ---------------- texture helpers ---------------- */
function buildEnvMap(){
  const c=document.createElement('canvas');c.width=512;c.height=256;
  const g=c.getContext('2d');
  const q=g.createLinearGradient(0,0,0,256);
  q.addColorStop(0,'#8fc4ff');q.addColorStop(0.5,'#cfeaf6');q.addColorStop(0.55,'#e7d6b0');q.addColorStop(1,'#caa877');
  g.fillStyle=q;g.fillRect(0,0,512,256);
  // soft sun spot
  const s=g.createRadialGradient(380,70,4,380,70,70);
  s.addColorStop(0,'rgba(255,250,225,1)');s.addColorStop(1,'rgba(255,250,225,0)');
  g.fillStyle=s;g.fillRect(300,0,160,140);
  const t=new T.CanvasTexture(c);t.mapping=T.EquirectangularReflectionMapping;t.encoding=T.sRGBEncoding;
  const pm=new T.PMREMGenerator(renderer);pm.compileEquirectangularShader();
  const env=pm.fromEquirectangular(t).texture;pm.dispose();t.dispose();
  scene.environment=env;
}
buildEnvMap();

/* ---------------- lights ---------------- */
const hemi = new T.HemisphereLight(0xdaf0ff,0xd9b97a,0.95);
scene.add(hemi);
const sun = new T.DirectionalLight(0xfff1d6,2.0);
sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:1,far:220});
sun.shadow.bias=-0.0004;sun.shadow.normalBias=0.04;
scene.add(sun,sun.target);
const fill = new T.DirectionalLight(0xbfe0ff,0.35);fill.position.set(-30,40,-20);scene.add(fill);

/* ---------------- sky + clouds + sun glow ---------------- */
const sky = new T.Mesh(new T.SphereGeometry(1000,32,16), new T.MeshBasicMaterial({
  side:T.BackSide,fog:false,toneMapped:false,map:tex(2,256,(g,w,h)=>{
    const q=g.createLinearGradient(0,0,0,h);
    q.addColorStop(0,'#3f8fd6');q.addColorStop(.45,'#9fd0ec');q.addColorStop(.7,'#dff0f7');q.addColorStop(1,'#f3e6c9');
    g.fillStyle=q;g.fillRect(0,0,w,h);
  })
}));
scene.add(sky);

const cloudTex = tex(256,128,g=>{for(let i=0;i<10;i++){const x=30+Math.random()*196,y=40+Math.random()*45,r=28+Math.random()*30;
  const q=g.createRadialGradient(x,y,2,x,y,r);q.addColorStop(0,'rgba(255,255,255,.9)');q.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=q;g.fillRect(0,0,256,128)}});
const clouds=[];
for(let i=0;i<24;i++){const s=new T.Sprite(new T.SpriteMaterial({map:cloudTex,transparent:true,fog:false,depthWrite:false,opacity:.92}));
  const a=Math.random()*6.28,r=380+Math.random()*420;s.userData.o=new T.Vector3(Math.cos(a)*r,110+Math.random()*120,Math.sin(a)*r);
  s.scale.set(240,120,1);scene.add(s);clouds.push(s);}

const sunGlow = new T.Sprite(new T.SpriteMaterial({map:tex(128,128,g=>{const q=g.createRadialGradient(64,64,4,64,64,62);
  q.addColorStop(0,'rgba(255,250,220,1)');q.addColorStop(.25,'rgba(255,225,150,.55)');q.addColorStop(1,'rgba(255,200,100,0)');
  g.fillStyle=q;g.fillRect(0,0,128,128)}),fog:false,transparent:true,blending:T.AdditiveBlending,depthWrite:false}));
sunGlow.scale.set(185,185,1);sunGlow.material.opacity=.52;scene.add(sunGlow);

/* ---------------- sea + island ---------------- */
const sandTex = tex(512,512,(g,w,h)=>{g.fillStyle='#e6cf98';g.fillRect(0,0,w,h);
  for(let i=0;i<55;i++){g.strokeStyle=i%2?'rgba(255,240,200,.2)':'rgba(150,115,60,.16)';g.lineWidth=2+Math.random()*3;
    g.beginPath();const y=Math.random()*h;g.moveTo(0,y);for(let x=0;x<=w;x+=16)g.lineTo(x,y+Math.sin(x*Math.PI*8/w+i)*6);g.stroke()}},70,70);
const island = new T.Mesh(new T.CircleGeometry(300,128),
  new T.MeshStandardMaterial({map:sandTex,bumpMap:sandTex,bumpScale:.6,roughness:.95,metalness:0}));
island.rotation.x=-Math.PI/2;island.position.set(0,0,-115);island.receiveShadow=true;scene.add(island);

const seaTex = tex(256,256,(g,w,h)=>{g.fillStyle='#1bb6bd';g.fillRect(0,0,w,h);g.lineWidth=3;
  g.strokeStyle='rgba(255,255,255,.18)';for(let i=0;i<26;i++){g.beginPath();const y=i*h/26;
  for(let x=0;x<=w;x+=8)g.lineTo(x,y+Math.sin(x*Math.PI*6/w+i)*3);g.stroke()}},40,40);
const sea = new T.Mesh(new T.PlaneGeometry(4000,4000),
  new T.MeshStandardMaterial({map:seaTex,color:0x2fc7cc,roughness:.18,metalness:.35,envMapIntensity:.6}));
sea.rotation.x=-Math.PI/2;sea.position.y=-.7;sea.receiveShadow=true;scene.add(sea);

const foam = new T.Mesh(new T.RingGeometry(288,300,128),new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.5,fog:true}));
foam.rotation.x=-Math.PI/2;foam.position.set(0,-.4,-115);scene.add(foam);

/* ---------------- track ---------------- */
const P=[[0,0],[60,-10],[110,-50],[120,-110],[80,-150],[20,-130],[-10,-170],[-70,-190],[-120,-150],[-110,-90],[-60,-60],[-70,-20],[-40,10]]
  .map(([x,z])=>new T.Vector3(x*1.25,0,z*1.25));
const curve = new T.CatmullRomCurve3(P,true,'centripetal');
const L = curve.getLength();
const pts = curve.getSpacedPoints(N).slice(0,N);
const tg = pts.map((_,i)=>curve.getTangentAt(i/N).setY(0).normalize());
const nm = tg.map(f=>new T.Vector3(-f.z,0,f.x));

function ribbon(a,b,m,y0,y1,vs){
  vs=Math.max(1,Math.round(L*vs))/L;const p=[],u=[],ix=[];
  for(let i=0;i<=N;i++){const k=i%N,c=pts[k],n=nm[k],v=i*(L/N)*vs;
    p.push(c.x+n.x*a,y0,c.z+n.z*a,c.x+n.x*b,y1,c.z+n.z*b);u.push(0,v,1,v);
    if(i<N){const j=i*2;ix.push(j,j+1,j+2,j+1,j+3,j+2)}}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(u,2));g.setIndex(ix);g.computeVertexNormals();
  const o=new T.Mesh(g,m);o.receiveShadow=true;scene.add(o);return o;
}
const roadTex = tex(256,512,(g,w,h)=>{g.fillStyle='#3a3d44';g.fillRect(0,0,w,h);
  // asphalt speckle
  for(let i=0;i<1400;i++){g.fillStyle=Math.random()<.5?'rgba(0,0,0,.18)':'rgba(255,255,255,.05)';
    g.fillRect(Math.random()*w,Math.random()*h,2,2);}
  // centre + edge lines
  g.fillStyle='#f4f1e8';g.fillRect(6,0,8,h);g.fillRect(w-14,0,8,h);g.fillStyle='#ffd23f';g.fillRect(w/2-3,0,6,h/2);
  // subtle wet sheen streaks
  g.strokeStyle='rgba(255,255,255,.06)';g.lineWidth=6;for(let i=0;i<6;i++){g.beginPath();const x=20+Math.random()*(w-40);
    for(let y=0;y<=h;y+=10)g.lineTo(x+Math.sin(y*.05)*8,y);g.stroke();}},1/14,1/1.2);
const roadMat = new T.MeshStandardMaterial({roughness:.62,metalness:.12,map:roadTex,envMapIntensity:.5});
const kerbTex = tex(32,64,(g,w,h)=>{for(let y=0;y<8;y++)for(let x=0;x<2;x++){g.fillStyle=(x+y)%2?'#e22':'#fff';g.fillRect(x*16,y*8,16,8)}});
const kerbMat = new T.MeshStandardMaterial({roughness:.6,side:T.DoubleSide,map:kerbTex,metalness:.05});

ribbon(-7.2,7.2,roadMat,.06,.06,1/14);
ribbon(7.2,8.6,kerbMat,.08,.08,1/2.4);
ribbon(-8.6,-7.2,kerbMat,.08,.08,1/2.4);
ribbon(-WL,-WL,kerbMat,0,.9,1/2.4);
ribbon(WL,WL,kerbMat,0,.9,1/2.4);

// start/finish line
{const f=tg[0],gr=new T.Group();
  const checker=tex(16,64,(g,w,h)=>{for(let y=0;y<8;y++)for(let x=0;x<2;x++){g.fillStyle=(x+y)%2?'#111':'#fff';g.fillRect(x*8,y*8,8,8);}});
  const m=new T.Mesh(new T.PlaneGeometry(2.2,15),new T.MeshStandardMaterial({map:checker}));
  m.rotation.x=-Math.PI/2;m.receiveShadow=true;gr.add(m);gr.position.set(pts[0].x,.12,pts[0].z);
  gr.rotation.y=Math.atan2(-f.z,f.x);scene.add(gr);}

/* ---------------- scenery (deterministic) ---------------- */
function buildScenery(seed){
  const rng = mulberry32(seed>>>0 || 20240607);
  const palmN=70;
  const trunk=new T.InstancedMesh(new T.CylinderGeometry(.18,.32,7,16,6),
    new T.MeshStandardMaterial({color:0x7a5a3a,roughness:.9}),palmN);
  const frond=new T.InstancedMesh(new T.SphereGeometry(1,20,10),
    new T.MeshStandardMaterial({color:0x2f8a3c,roughness:.7,side:T.DoubleSide}),palmN*7);
  const dm=new T.Object3D();let pc=0,fc=0;
  for(let t=0;t<600&&pc<palmN;t++){const i=Math.floor(rng()*N),o=(rng()<.5?-1:1)*(WL+4+rng()*55);
    const x=pts[i].x+nm[i].x*o,z=pts[i].z+nm[i].z*o;if(Math.hypot(x,z+115)>290)continue;
    let ok=1;for(let j=0;j<N;j+=6)if((pts[j].x-x)**2+(pts[j].z-z)**2<600){ok=0;break}if(!ok)continue;
    const sc=.8+rng()*.5,r0=rng()*6;dm.rotation.set(0,0,0);dm.scale.set(sc,sc,sc);dm.position.set(x,3.5*sc,z);dm.updateMatrix();
    trunk.setMatrixAt(pc++,dm.matrix);
    for(let k=0;k<7;k++){const a=r0+k*Math.PI*2/7;dm.position.set(x+Math.cos(a)*1.8*sc,7*sc-.1,z-Math.sin(a)*1.8*sc);
      dm.rotation.set(0,a,-.35);dm.scale.set(2.4*sc,.1*sc,.7*sc);dm.updateMatrix();frond.setMatrixAt(fc++,dm.matrix)}}
  trunk.count=pc;frond.count=fc;[trunk,frond].forEach(m=>{m.castShadow=true;m.frustumCulled=false;m.instanceMatrix.needsUpdate=true;scene.add(m)});

  const rk=new T.InstancedMesh(new T.IcosahedronGeometry(1,2),
    new T.MeshStandardMaterial({color:0x8a7f72,roughness:.95}),60);
  let n=0;for(let t=0;t<700&&n<60;t++){const i=Math.floor(rng()*N),o=(rng()<.5?-1:1)*(WL+2+rng()*70);
    const x=pts[i].x+nm[i].x*o,z=pts[i].z+nm[i].z*o;if(Math.hypot(x,z+115)>292)continue;
    let ok=1;for(let j=0;j<N;j+=6)if((pts[j].x-x)**2+(pts[j].z-z)**2<420){ok=0;break}if(!ok)continue;
    const s=.8+rng()*2.4;dm.position.set(x,s*.32,z);dm.rotation.set(rng()*3,rng()*6,rng()*3);dm.scale.set(s,s*.65,s*.85);dm.updateMatrix();
    rk.setMatrixAt(n++,dm.matrix)}rk.count=n;rk.castShadow=rk.receiveShadow=true;rk.frustumCulled=false;scene.add(rk);
}

/* ---------------- skid-mark pool ---------------- */
const SKID_N=500;const skidPool=[];const skidIdx={v:0};
{const mat=new T.MeshBasicMaterial({color:0x14110d,transparent:true,opacity:0,depthWrite:false});
  const geo=new T.PlaneGeometry(.34,1.1);
  for(let i=0;i<SKID_N;i++){const m=new T.Mesh(geo,mat.clone());m.rotation.x=-Math.PI/2;m.position.y=0.04;m.visible=false;
    m.renderOrder=1;scene.add(m);skidPool.push({m,life:0,max:6});}
}
function skid(x,z,h){const s=skidPool[skidIdx.v++%SKID_N];s.m.visible=true;s.m.position.set(x,0.045,z);s.m.rotation.z=-h;s.life=s.max;}
function updSkid(dt){for(const s of skidPool){if(s.life<=0)continue;s.life-=dt;if(s.life<=0){s.m.visible=false;continue}s.m.material.opacity=clamp(s.life/s.max,0,1)*0.5;}}

/* ---------------- particles ---------------- */
const puffTex = tex(64,64,g=>{const q=g.createRadialGradient(32,32,2,32,32,30);
  q.addColorStop(0,'rgba(255,255,255,1)');q.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=q;g.fillRect(0,0,64,64)});
const PP=[];let pi=0;
for(let i=0;i<220;i++){const s=new T.Sprite(new T.SpriteMaterial({map:puffTex,transparent:true,depthWrite:false}));
  s.visible=false;scene.add(s);PP.push({s,l:0,m:1,v:new T.Vector3(),z:1,a:1});}
function puff(x,y,z,vx,vy,vz,z0,col,life,a){const p=PP[pi++%PP.length];p.s.visible=true;p.s.position.set(x,y,z);
  p.v.set(vx,vy,vz);p.z=z0;p.l=p.m=life;p.a=a;p.s.material.color.set(col);p.s.scale.setScalar(z0);}
function puffs(dt){for(const p of PP){if(p.l<=0)continue;p.l-=dt;if(p.l<=0){p.s.visible=false;continue;}
  p.s.position.addScaledVector(p.v,dt);const k=1-p.l/p.m;p.s.scale.setScalar(p.z*(1+k*2.0));p.s.material.opacity=p.a*(1-k);}}
function burst(x,z,col=0xff8a1f,n=22){for(let i=0;i<n;i++)puff(x,.8,z,(Math.random()-.5)*16,Math.random()*7,(Math.random()-.5)*16,2+Math.random()*2,i%3?col:0x333333,.9,.9);}

/* ---------------- car factory ---------------- */
function limb(a,b,r,m){const v=new T.Vector3().subVectors(b,a),g=new T.Mesh(new T.CylinderGeometry(r,r,v.length(),16),m);
  g.position.copy(a).addScaledVector(v,.5);g.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.clone().normalize());return g;}
function tireGeo(){const g=new T.TorusGeometry(.34,.17,28,80),p=g.attributes.position,nn=g.attributes.normal;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),r=Math.hypot(x,y);
    if((nn.getX(i)*x+nn.getY(i)*y)/r>.5){const k=Math.pow(Math.max(0,Math.sin(Math.atan2(y,x)*20)),.6)*.06;p.setXY(i,x*(1+k/r),y*(1+k/r))}}
  g.computeVertexNormals();return g;}
const TG=tireGeo();

function makeCar(col,skin,isPlayer){
  const root=new T.Group(),tilt=new T.Group();root.add(tilt);
  const paint=new T.MeshPhysicalMaterial({color:col,metalness:.06,roughness:.4,clearcoat:.58,clearcoatRoughness:.2,envMapIntensity:.24,emissive:col,emissiveIntensity:.08});
  const steel=new T.MeshStandardMaterial({color:0x22252b,metalness:.85,roughness:.35,envMapIntensity:1});
  const rubber=new T.MeshStandardMaterial({color:0x161718,roughness:.9,metalness:0});
  const alloy=new T.MeshStandardMaterial({color:0xdfe3e8,metalness:1,roughness:.18,envMapIntensity:1.3});
  const cloth=new T.MeshStandardMaterial({color:0x222831,roughness:.7});
  const skinM=new T.MeshStandardMaterial({color:skin,roughness:.6});
  const glass=new T.MeshPhysicalMaterial({color:0x0b1220,metalness:.9,roughness:.05,clearcoat:1,transparent:true,opacity:.85});

  // body
  const s=new T.Shape();s.moveTo(-1.45,.35);s.lineTo(-1.5,.75);s.quadraticCurveTo(-1.45,.95,-1.1,.95);
  s.lineTo(-.55,.95);s.lineTo(-.45,.7);s.lineTo(.5,.7);s.lineTo(.7,.95);s.quadraticCurveTo(1.2,1,1.55,.62);
  s.quadraticCurveTo(1.65,.45,1.5,.35);s.lineTo(-1.45,.35);
  const bg=new T.ExtrudeGeometry(s,{depth:.9,bevelEnabled:true,bevelThickness:.16,bevelSize:.16,bevelSegments:10,curveSegments:40});
  bg.translate(0,0,-.45);const body=new T.Mesh(bg,paint);body.castShadow=true;body.receiveShadow=true;tilt.add(body);
  const livery=new T.MeshStandardMaterial({color:0x17232a,metalness:.18,roughness:.42});
  [-.18,.18].forEach(z=>{const stripe=new T.Mesh(new T.BoxGeometry(.72,.035,.12),livery);stripe.position.set(1.02,.862,z);tilt.add(stripe);});
  const grille=new T.Mesh(new T.BoxGeometry(.09,.23,.5),new T.MeshStandardMaterial({color:0x101519,metalness:.25,roughness:.55}));grille.position.set(1.54,.52,0);tilt.add(grille);

  // roll cage
  const tube=pp=>tilt.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pp.map(a=>new T.Vector3(...a))),48,.055,12),steel));
  tube([[-.55,.7,-.6],[-.55,2.0,-.5],[-.55,2.2,0],[-.55,2.0,.5],[-.55,.7,.6]]);
  tube([[.8,.7,-.6],[.8,1.55,-.5],[.8,1.75,0],[.8,1.55,.5],[.8,.7,.6]]);
  tube([[-.55,2.2,0],[.1,2.0,0],[.8,1.75,0]]);
  tube([[-.55,2.2,-.5],[.1,2.35,0],[.8,1.75,.5]]);
  tube([[-.55,2.2,.5],[.1,2.35,0],[.8,1.75,-.5]]);
  tube([[1.52,.38,-.55],[1.76,.31,0],[1.52,.38,.55]]);

  // headlights + taillights
  [-1,1].forEach(z=>{const h=new T.Mesh(new T.SphereGeometry(.12,20,14),
      new T.MeshStandardMaterial({color:0xffffff,emissive:0xfff2c0,emissiveIntensity:1.4,roughness:.3}));
      h.scale.set(.6,1,1.2);h.position.set(1.72,.62,z*.4);tilt.add(h);
      const t=new T.Mesh(new T.BoxGeometry(.1,.14,.3),new T.MeshStandardMaterial({color:0x440000,emissive:0xff1500,emissiveIntensity:1.1}));
      t.position.set(-1.55,.6,z*.4);tilt.add(t);});
  // headlight beams (additive cones)
  const beamMat=new T.SpriteMaterial({map:tex(64,64,g=>{const q=g.createRadialGradient(32,32,2,32,32,30);
    q.addColorStop(0,'rgba(255,245,200,.5)');q.addColorStop(1,'rgba(255,245,200,0)');g.fillStyle=q;g.fillRect(0,0,64,64)}),
    transparent:true,blending:T.AdditiveBlending,depthWrite:false,fog:false});
  const beams=[];[-.4,.4].forEach(z=>{const b=new T.Sprite(beamMat);b.scale.set(7,3,1);b.position.set(4.5,.7,z);
    b.center.set(0,.5);tilt.add(b);beams.push(b);});

  // exhaust pipe
  const ex=new T.Mesh(new T.CylinderGeometry(.08,.08,1.0,12),steel);ex.rotation.x=Math.PI/2;ex.position.set(-1.7,.4,0);tilt.add(ex);

  // wheels
  const wh=[];const WP=[[1.05,1],[1.05,-1],[-1.05,1],[-1.05,-1]];
  WP.forEach(([x,z])=>{const st=new T.Group(),sp=new T.Group(),t=new T.Mesh(TG,rubber),hub=new T.Mesh(new T.CylinderGeometry(.24,.24,.3,24),alloy);
    t.scale.z=1.25;hub.rotation.x=Math.PI/2;sp.add(t,hub);st.add(sp);st.position.set(x,.51,z*.98);root.add(st);
    wh.push({st,sp,front:x>0});});
  [1.05,-1.05].forEach(x=>{const a=new T.Mesh(new T.CylinderGeometry(.05,.05,1.9,12),steel);a.rotation.x=Math.PI/2;a.position.set(x,.51,0);root.add(a);});

  // steering wheel
  const steerWheel=new T.Group();steerWheel.position.set(.55,1.15,0);steerWheel.rotation.x=-.5;
  const swRim=new T.Mesh(new T.TorusGeometry(.22,.03,12,32),steel);steerWheel.add(swRim);
  const swSpoke=new T.Mesh(new T.BoxGeometry(.4,.04,.04),steel);steerWheel.add(swSpoke);tilt.add(steerWheel);

  // humanoid driver
  const hips=new T.Group();hips.position.set(-.1,.74,0);hips.rotation.z=-.12;tilt.add(hips);
  const torso=new T.Mesh(new T.SphereGeometry(.34,32,24),cloth);torso.scale.set(.78,1.18,1.05);torso.position.y=.4;hips.add(torso);
  const neck=new T.Group();neck.position.y=.86;hips.add(neck);
  const head=new T.Mesh(new T.SphereGeometry(.2,40,28),skinM);head.position.y=.2;
  const hel=new T.Mesh(new T.SphereGeometry(.235,40,28,0,Math.PI*2,0,Math.PI*.6),paint);hel.position.y=.22;
  const vis=new T.Mesh(new T.SphereGeometry(.245,28,16,Math.PI-.95,1.9,Math.PI*.33,Math.PI*.18),glass);vis.position.y=.22;
  neck.add(head,hel,vis);
  // arms to wheel
  const armM=new T.MeshStandardMaterial({color:skin,roughness:.6});
  const armL=limb(new T.Vector3(-.05,1.05,-.28),new T.Vector3(.5,1.18,-.18),.075,armM);
  const armR=limb(new T.Vector3(-.05,1.05,.28),new T.Vector3(.5,1.18,.18),.075,armM);tilt.add(armL,armR);
  // legs + boots
  const legM=cloth;const bootM=new T.MeshStandardMaterial({color:0x111111,roughness:.5});
  [[-.18,.32],[-.18,-.32]].forEach(([_,zz])=>{const hip=new T.Vector3(-.05,.95,zz),knee=new T.Vector3(.35,.62,zz*.8),foot=new T.Vector3(.7,.78,zz*.7);
    tilt.add(limb(hip,knee,.1,legM),limb(knee,foot,.085,legM));
    const boot=new T.Mesh(new T.BoxGeometry(.34,.16,.2),bootM);boot.position.set(.78,.72,zz*.7);tilt.add(boot);});

  // shield dome
  const shield=new T.Mesh(new T.SphereGeometry(2.7,40,28),new T.MeshPhysicalMaterial({color:0x66e0ff,transparent:true,
    opacity:.22,emissive:0x1b6fa0,emissiveIntensity:.6,roughness:.1,side:T.DoubleSide,depthWrite:false}));
  shield.position.y=1.2;shield.visible=false;root.add(shield);

  root.traverse(m=>{if(m.isMesh){m.castShadow=true;}});
  scene.add(root);
  return {root,tilt,wh,steerWheel,shield,beams,exhaust:new T.Vector3(-1.7,.5,0),neck};
}
function tris(o){let n=0;o.traverse(m=>{if(m.isMesh){const g=m.geometry;n+=(g.index?g.index.count:g.attributes.position.count)/3}});return Math.round(n);}

/* ---------------- physics ---------------- */
function mkCar(slot){
  return {slot,kind:'bot',name:BOT_NAMES[slot%BOT_NAMES.length],color:SLOT_COLORS[slot],
    x:0,z:0,h:0,vx:0,vz:0,vf:0,vr:0,s:0,on:1,idx:0,k:0,prog:0,fin:0,lane:0,
    vmax:BOT_VMAX,bt:0,stun:0,dome:0,item:null,boostE:2,uk:0,aiW:0,lastShoot:0,
    model:null,peer:null,shots:[]};
}
const lat=c=>{const p=pts[c.idx],n=nm[c.idx];return (c.x-p.x)*n.x+(c.z-p.z)*n.z;};
function nearest(c){let b=c.idx,bd=1e9;for(let o=-14;o<=14;o++){const i=(c.idx+o+N)%N,p=pts[i],d=(p.x-c.x)**2+(p.z-c.z)**2;
  if(d<bd){bd=d;b=i;}}
  if(c.idx>N*.8&&b<N*.2){c.k++;if(c.k>LAPS&&!c.fin)c.fin=raceClock;if(c.k>LAPS+1)c.k=LAPS+1;}
  else if(c.idx<N*.2&&b>N*.8)c.k--;c.idx=b;c.prog=c.k*N+b;}
function place(c,back,lane){const b=Math.round(back/(L/N)),i=(N-b)%N,p=pts[i],n=nm[i];
  Object.assign(c,{x:p.x+n.x*lane,z:p.z+n.z*lane,h:Math.atan2(-tg[i].z,tg[i].x),vx:0,vz:0,vf:0,vr:0,s:0,idx:i,k:0,prog:N-b,fin:0,lane});}

function drive(c,dt,inp){
  const d=lat(c),on=Math.abs(d)<8.4;
  const bo=c.bt>0&&c.stun<=0;
  const vm=c.vmax*(on?1:.62)*(c.bt>0?1.12:1);
  const fx=Math.cos(c.h),fz=-Math.sin(c.h);
  let vf=c.vx*fx+c.vz*fz,vr=c.vx*-fz+c.vz*fx;
  if(c.stun>0){c.stun-=dt;inp={th:0,br:1,st:inp.st*.3,boost:false}}
  let th=inp.th;
  vf+=(bo?64:27)*(bo?1:th)*(1-vf/(vm*1.03))*dt;
  if(inp.br>0)vf-=(vf>1?40:11)*inp.br*dt;if(vf<-9)vf=-9;
  vf*=1-(on?.025:.78)*dt;vr*=Math.exp(-(on?5.5:3)*dt);
  let st=clamp(inp.st,-1,1);st=Math.sign(st)*Math.pow(Math.abs(st),1.25);
  c.s+=(st*.5/(1+Math.abs(vf)*.09)-c.s)*Math.min(1,dt*10);
  // auto-align to track when not steering hard
  if(on&&Math.abs(st)<.25)c.h+=wrap(Math.atan2(-tg[c.idx].z,tg[c.idx].x)-c.h)*(1-Math.abs(st))*Math.min(1,Math.abs(vf)/22)*1.4*dt;
  c.h-=vf*Math.tan(c.s)/2.4*dt;
  const gx=Math.cos(c.h),gz=-Math.sin(c.h);c.vx=gx*vf-gz*vr;c.vz=gz*vf+gx*vr;c.x+=c.vx*dt;c.z+=c.vz*dt;
  nearest(c);const e=lat(c);
  if(Math.abs(e)>WL){const sg=Math.sign(e),n=nm[c.idx],o=Math.abs(e)-WL;c.x-=n.x*sg*o;c.z-=n.z*sg*o;
    const vn=(c.vx*n.x+c.vz*n.z)*sg;if(vn>0){c.vx-=n.x*sg*vn*1.4;c.vz-=n.z*sg*vn*1.4;c.vx*=.92;c.vz*=.92;}}
  c.vf=c.vx*gx+c.vz*gz;c.vr=c.vx*-gz+c.vz*gx;c.on=on;return on;
}
function bump(a,b){const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);
  if(d<2.9&&d>1e-3){const nx=dx/d,nz=dz/d,o=(2.9-d)/2;a.x-=nx*o;a.z-=nz*o;b.x+=nx*o;b.z+=nz*o;
    const rv=(b.vx-a.vx)*nx+(b.vz-a.vz)*nz;if(rv<0){const j=-rv*.6;a.vx-=nx*j;a.vz-=nz*j;b.vx+=nx*j;b.vz+=nz*j;}}}

function ai(c){
  const j=(c.idx+Math.round(10+Math.max(0,c.vf)*.9))%N,t=pts[j],tx=t.x+nm[j].x*c.lane,tz=t.z+nm[j].z*c.lane;
  const diff=wrap(Math.atan2(-(tz-c.z),tx-c.x)-c.h);
  const a1=tg[c.idx],a2=tg[(c.idx+45)%N];
  const ang=Math.abs(Math.atan2(a1.x*a2.z-a1.z*a2.x,a1.x*a2.x+a1.z*a2.z));
  const tv=c.vmax*(1-Math.min(ang*.85,.5));
  return {st:clamp(-diff*2.2,-1,1),th:clamp((tv-c.vf)*.4,0,1),br:clamp((c.vf-tv)*.25,0,1),boost:false};
}

/* ---------------- power-ups ---------------- */
const gifts=[];
function buildGifts(){for(let i=0;i<14;i++){const idx=Math.round(i*N/14+25)%N,o=((i%3)-1)*4.4;
  const m=new T.Mesh(new T.BoxGeometry(1.5,1.5,1.5,3,3,3),new T.MeshStandardMaterial({color:0xffc400,
    emissive:0xff8a00,emissiveIntensity:.8,metalness:.5,roughness:.25}));
  m.castShadow=true;scene.add(m);gifts.push({m,x:pts[idx].x+nm[idx].x*o,z:pts[idx].z+nm[idx].z*o,t:0});}}
function take(c){if(!c.item){c.item=ITEMS[Math.floor(Math.random()*ITEMS.length)];if(c.kind==='me')toast('Got '+ITEM_NAME[c.item]);}
  else {c.boostE=Math.min(3,c.boostE+1);if(c.kind==='me')toast('Boost +1');}}

function mkShot(c,type){const dir=type==='r';const m=new T.Mesh(dir?new T.CylinderGeometry(.13,.13,1.2,14):new T.SphereGeometry(.5,20,14),
  new T.MeshStandardMaterial({color:dir?0xdddddd:0x151515,emissive:dir?0xff6a00:0xff2200,emissiveIntensity:dir?1.2:.8,metalness:.5,roughness:.3}));
  if(dir)m.geometry.rotateZ(Math.PI/2);scene.add(m);
  return {type,owner:c.slot,m,x:c.x+Math.cos(c.h)*3,z:c.z-Math.sin(c.h)*3,h:c.h,v:Math.max(c.vf,0)+(dir?58:30),life:dir?4:22,age:0};}
function warp(c){const ni=c.idx+Math.round(150/(L/N)),ln=clamp(lat(c),-5,5);burst(c.x,c.z,0x9a2fd6,26);
  if(ni>=N){c.k++;if(c.k>LAPS&&!c.fin)c.fin=raceClock;if(c.k>LAPS+1)c.k=LAPS+1;}
  const i=ni%N,p=pts[i],n=nm[i];c.idx=i;c.x=p.x+n.x*ln;c.z=p.z+n.z*ln;c.h=Math.atan2(-tg[i].z,tg[i].x);
  const sp=Math.max(c.vf,16);c.vx=Math.cos(c.h)*sp;c.vz=-Math.sin(c.h)*sp;burst(c.x,c.z,0x9a2fd6,26);}
function useItem(c){const it=c.item;if(!it)return;c.item=null;
  if(it==='rocket'||it==='bomb'){const s=mkShot(c,it[0]);localShots.push(s);if(c.kind==='me')myShots.push(s);}
  else if(it==='dome')c.dome=7.5;
  else if(it==='speed')c.bt=Math.max(c.bt,3.5);
  else if(it==='mine'){const s=mkShot(c,'m');s.v=0;s.life=30;s.m.position.set(c.x,0.4,c.z);localShots.push(s);if(c.kind==='me')myShots.push(s);}
  else if(it==='warp')warp(c);
  if(c.kind==='me')toast(ITEM_NAME[it]);}
function hitCar(c,x,z,col){burst(x,z,col,20);if(c.dome>0){c.dome=0;if(c.kind==='me')toast('Shield blocked it!');}
  else {c.vx*=.25;c.vz*=.25;c.s=0;c.stun=1.4;if(c.kind==='me')toast('You were hit!');}}

/* ============================ GAME STATE ============================ */
let mode='dual',mySlot=0,myId=0,roomMax=2,roomCode='',seed=20240607;
let cars=[];          // slot-indexed
let localShots=[];    // simulated locally (me + bots)
let myShots=[];       // owned by me (for sync)
let raceState='lobby';// lobby|countdown|racing|finished
let raceClock=0,countdownEnd=0;
let connected=false,ws=null;
const K={};           // input flags
let throttle=0,steerTilt=0,tapSteer=0,lastItem=0,lastShootKey=0;
let camH=0,shake=0,flashT=0,NOW=0,sceneryBuilt=false;
const settings={steer:1,throttle:1,invert:false,audio:true,shake:true};

/* ---------------- audio ---------------- */
let actx=null,masterGain=null,engOsc=null,engGain=null,engFilter=null,noiseBuf=null;
function initAudio(){if(actx)return;try{actx=new (window.AudioContext||window.webkitAudioContext)();
  masterGain=actx.createGain();masterGain.gain.value=settings.audio?0.5:0;masterGain.connect(actx.destination);
  engOsc=actx.createOscillator();engOsc.type='sawtooth';engGain=actx.createGain();engGain.gain.value=0;
  engFilter=actx.createBiquadFilter();engFilter.type='lowpass';engFilter.frequency.value=600;
  engOsc.connect(engFilter);engFilter.connect(engGain);engGain.connect(masterGain);engOsc.start();
  noiseBuf=actx.createBuffer(1,actx.sampleRate*1,actx.sampleRate);const d=noiseBuf.getChannelData(0);
  for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}catch(e){actx=null;}
  if(actx&&actx.state==='suspended')actx.resume();}
function engUpdate(speed,boost,thr){if(!actx)return;const f=70+speed*9+(boost?120:0);
  engOsc.frequency.setTargetAtTime(f,actx.currentTime,.05);
  engFilter.frequency.setTargetAtTime(500+speed*22+(boost?1500:0),actx.currentTime,.05);
  engGain.gain.setTargetAtTime(0.04+thr*0.12+(boost?0.12:0),actx.currentTime,.08);}
function sfx(type){if(!actx||!settings.audio)return;const t=actx.currentTime;
  if(type==='pickup'){const o=actx.createOscillator(),g=actx.createGain();o.type='triangle';
    o.frequency.setValueAtTime(660,t);o.frequency.exponentialRampToValueAtTime(1320,t+.12);
    g.gain.setValueAtTime(.3,t);g.gain.exponentialRampToValueAtTime(.001,t+.25);o.connect(g);g.connect(masterGain);o.start(t);o.stop(t+.26);}
  else if(type==='explode'){const src=actx.createBufferSource();src.buffer=noiseBuf;src.loop=true;
    const g=actx.createGain();g.gain.setValueAtTime(.5,t);g.gain.exponentialRampToValueAtTime(.001,t+.5);
    const f=actx.createBiquadFilter();f.type='lowpass';f.frequency.value=400;src.connect(f);f.connect(g);g.connect(masterGain);src.start(t);src.stop(t+.5);}
  else if(type==='boost'){const src=actx.createBufferSource();src.buffer=noiseBuf;src.loop=true;
    const g=actx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.25,t+.05);g.gain.exponentialRampToValueAtTime(.001,t+.4);
    const f=actx.createBiquadFilter();f.type='bandpass';f.frequency.value=1200;src.connect(f);f.connect(g);g.connect(masterGain);src.start(t);src.stop(t+.4);}
  else if(type==='hit'){const o=actx.createOscillator(),g=actx.createGain();o.type='square';
    o.frequency.setValueAtTime(200,t);o.frequency.exponentialRampToValueAtTime(60,t+.2);
    g.gain.setValueAtTime(.3,t);g.gain.exponentialRampToValueAtTime(.001,t+.3);o.connect(g);g.connect(masterGain);o.start(t);o.stop(t+.3);}}

/* ---------------- HUD helpers ---------------- */
let toastT=0;
function toast(m){const e=$('toast');e.textContent=m;e.style.opacity=1;clearTimeout(toastT);toastT=setTimeout(()=>e.style.opacity=0,1100);}
function flash(){flashT=1;$('flash').style.opacity='.8';}

/* ---------------- input wiring ---------------- */
addEventListener('keydown',e=>{K[e.code]=1;if(e.code.startsWith('Arrow')||e.code==='Space')e.preventDefault();});
addEventListener('keyup',e=>K[e.code]=0);
document.querySelectorAll('#pad [data-k]').forEach(b=>{const k=b.dataset.k;
  const on=e=>{e.preventDefault();K[k]=1;b.classList.add('on');initAudio();};
  const off=()=>{K[k]=0;b.classList.remove('on');};
  b.addEventListener('pointerdown',on);['pointerup','pointercancel','pointerleave'].forEach(t=>b.addEventListener(t,off));});

// tap-to-steer zone (left/right halves)
const zone={};let zoneSteer=0;
const zn=document.createElement('div');zn.style.cssText='position:fixed;inset:0;touch-action:none;z-index:4';
document.body.insertBefore(zn,$('hud'));
zn.addEventListener('pointerdown',e=>{zone[e.pointerId]=e.clientX<innerWidth/2?-1:1;});
['pointerup','pointercancel','pointermove'].forEach(t=>zn.addEventListener(t,e=>{
  if(t==='pointermove'&&!zone[e.pointerId])return;
  if(!zone[e.pointerId])return;zone[e.pointerId]=e.clientX<innerWidth/2?-1:1;}));
['pointerup','pointercancel'].forEach(t=>zn.addEventListener(t,e=>{delete zone[e.pointerId];}));

// tilt
let tiltOn=false;
$('tiltBtn').onclick=async()=>{if(!tiltOn&&window.DeviceOrientationEvent&&DeviceOrientationEvent.requestPermission){
  try{if(await DeviceOrientationEvent.requestPermission()!=='granted')return;}catch(e){return;}}
  tiltOn=!tiltOn;steerTilt=0;$('tiltBtn').textContent='Tilt: '+(tiltOn?'on':'off');};
addEventListener('deviceorientation',e=>{if(!tiltOn)return;const a=(screen.orientation&&screen.orientation.angle)||0;
  let g=(a===90?-e.beta:a===270||a===-90?e.beta:e.gamma)||0;if(settings.invert)g=-g;
  steerTilt=Math.abs(g)<3?0:clamp((g-Math.sign(g)*3)/22,-1,1);});

function getSteer(){let st=(K.ArrowRight||K.KeyD?1:0)-(K.ArrowLeft||K.KeyA?1:0);
  st+=(K.right?1:0)-(K.left?1:0);st+=steerTilt;
  let ts=0;for(const k in zone)ts+=zone[k];st+=ts*0.9;
  return clamp(st,-1,1)*settings.steer;}

/* ---------------- multiplayer networking ---------------- */
function connect(){
  const url=(location.protocol==='https:'?'wss':'ws')+'://'+location.host;
  try{ws=new WebSocket(url);}catch(e){return;}
  ws.onopen=()=>{connected=true;$('lobbyMsg').textContent='';};
  ws.onclose=()=>{connected=false;setTimeout(connect,1500);};
  ws.onmessage=ev=>{let m;try{m=JSON.parse(ev.data);}catch(e){return;}onMsg(m);};
}
function onMsg(m){
  if(m.type==='created'){roomCode=m.code;roomMax=m.max;mySlot=m.slot;myId=m.you;seed=m.seed;updateLobby(m);}
  else if(m.type==='joined'){roomCode=m.code;roomMax=m.max;mySlot=m.slot;myId=m.you;seed=m.seed;updateLobby(m);}
  else if(m.type==='lobby'){roomMax=m.max;updateLobby(m);}
  else if(m.type==='error'){$('lobbyMsg').textContent=m.msg;}
  else if(m.type==='start'){startRace(m);}
  else if(m.type==='peer'){const c=cars[m.slot];if(c&&c.kind==='remote'){
      const s=m.s;if(!c.peer)c.peer={rx:c.x,rz:c.z,rh:c.h,x:c.x,z:c.z,h:c.h,recv:performance.now()};
      c.peer.x=s.x;c.peer.z=s.z;c.peer.h=s.h;c.peer.recv=performance.now();
      c.peer.s=s;c.p.prog=s.pg;c.p.k=s.kp;c.p.fin=s.fn;c.p.vf=s.vf;c.p.dome=s.dm;c.p.bt=s.bt;c.p.stun=s.st;c.p.item=s.it;c.p.on=s.on;
      updateRemoteShots(c,s.sh||[]);}}
  else if(m.type==='left'){const c=cars[m.slot];if(c){c.kind='bot';c.name=BOT_NAMES[m.slot%BOT_NAMES.length];c.color=SLOT_COLORS[m.slot];c.item=null;c.peer=null;clearRemoteShots(c);}}
  else if(m.type==='host'){/* host changed; only relevant for start button visibility */}
  else if(m.type==='hit'){const c=cars[m.target];if(c&&(c.kind==='me'||c.kind==='bot')){hitCar(c,m.x,m.z,m.t===0?0xff8a1f:0xff2200);sfx('hit');shake=Math.max(shake,.6);}}
  else if(m.type==='results'){showResults(m.order);}
  else if(m.type==='pong'){}
}

let remoteShots=[]; // {owner, m, sync}
function clearRemoteShots(c){if(!c.peer)return;for(const r of c.peer.remoteShots||[]){scene.remove(r.m);}if(c.peer)c.peer.remoteShots=[];}
function updateRemoteShots(c,arr){if(!c.peer)c.peer={remoteShots:[]};if(!c.peer.remoteShots)c.peer.remoteShots=[];
  const rs=c.peer.remoteShots;while(rs.length<arr.length){const m=new T.Mesh(new T.SphereGeometry(.5,16,12),
    new T.MeshStandardMaterial({color:0xffaa33,emissive:0xff5500,emissiveIntensity:1}));scene.add(m);rs.push({m});}
  while(rs.length>arr.length){const r=rs.pop();scene.remove(r.m);}
  arr.forEach((s,i)=>{const r=rs[i];r.m.visible=true;r.m.position.set(s.x,.6,s.z);});}

function sendState(){
  if(!connected||!ws||ws.readyState!==1||raceState!=='racing')return;
  const c=cars[mySlot];if(!c)return;
  ws.send(JSON.stringify({type:'sync',s:{
    x:c.x,z:c.z,h:c.h,vf:c.vf,vr:c.vr,ti:c.s,bt:c.bt>0?1:0,dm:c.dome>0?1:0,st:c.stun>0?1:0,on:c.on?1:0,
    it:c.item||'',pg:c.prog,kp:c.k,fn:c.fin||0,
    sh:myShots.filter(s=>s.age<6).map(s=>({x:s.x,z:s.z,h:s.h,v:s.v,t:s.type==='r'?0:(s.type==='m'?2:1)}))
  }}));
}
let syncAcc=0;

/* ---------------- lobby UI ---------------- */
const SWATCH=['#ff5a1f','#2f7dff','#1fae5a','#ffd23f','#9a2fd6','#ff2f6d','#00bcd4','#ff7043'];
let myColor=SWATCH[0];
function buildSwatches(){const el=$('swatches');el.innerHTML='';SWATCH.forEach((c,i)=>{const s=document.createElement('i');
  s.style.background=c;if(i===0)s.classList.add('sel');s.onclick=()=>{myColor=c;[...el.children].forEach(x=>x.classList.remove('sel'));s.classList.add('sel');};el.appendChild(s);});}
buildSwatches();
$('modeSeg').querySelectorAll('button').forEach(b=>b.onclick=()=>{
  $('modeSeg').querySelectorAll('button').forEach(x=>x.classList.remove('sel'));b.classList.add('sel');mode=b.dataset.mode;});
function updateLobby(m){const host=m.host;
  // players list
  const el=$('players');el.innerHTML='';
  (m.players||[]).forEach(p=>{const d=document.createElement('div');d.className='pl';
    d.innerHTML=`<span class="dot" style="background:${p.color}"></span><span class="nm">${p.name}${p.id===myId?' (You)':''}</span>${p.host?'<span class="tag">HOST</span>':''}`;el.appendChild(d);});
  // fill empty slots as bots preview
  for(let i=(m.players||[]).length;i<m.max;i++){const d=document.createElement('div');d.className='pl bot';
    d.innerHTML=`<span class="dot" style="background:${SLOT_COLORS[i]}"></span><span class="nm">Bot ${i+1}</span>`;el.appendChild(d);}
  const isHost = host===myId;
  $('createBtn').textContent = isHost&&connected ? 'Start Race' : (connected?'Waiting for host…':'Create Room');
  $('createBtn').disabled = !isHost;
}
$('createBtn').onclick=()=>{initAudio();if(!connected){toast('Connecting…');return;}
  if(roomCode&&myId){ws.send(JSON.stringify({type:'start'}));return;}
  ws.send(JSON.stringify({type:'create',mode, name:$('name').value||'Player', color:myColor}));};
$('joinBtn').onclick=()=>{initAudio();if(!connected){toast('Connecting…');return;}
  const code=($('code').value||'').toUpperCase().trim();if(!code){$('lobbyMsg').textContent='Enter a room code';return;}
  ws.send(JSON.stringify({type:'join',code, name:$('name').value||'Player', color:myColor}));};
$('offlineBtn').onclick=()=>{initAudio();mode=mode||'dual';startOffline();};

/* ---------------- settings UI ---------------- */
$('gearBtn').onclick=()=>{$('settings').classList.remove('hidden');};
$('setClose').onclick=()=>{$('settings').classList.add('hidden');};
$('setSteer').oninput=e=>settings.steer=+e.target.value;
$('setThrottle').oninput=e=>settings.throttle=+e.target.value;
$('setInvert').onchange=e=>settings.invert=e.target.checked;
$('setAudio').onchange=e=>{settings.audio=e.target.checked;if(masterGain)masterGain.gain.value=settings.audio?0.5:0;};
$('setShake').onchange=e=>settings.shake=e.target.checked;

/* ---------------- race setup ---------------- */
function startRace(m){
  seed=m.seed||seed;roomMax=m.max||(m.mode==='championship'?6:2);
  const humanSlots=new Set(m.players.map(p=>p.slot));
  const names={},colors={};m.players.forEach(p=>{names[p.slot]=p.name;colors[p.slot]=p.color;});
  // clear old
  localShots.forEach(s=>scene.remove(s.m));
  cars.forEach(c=>{if(c.model)scene.remove(c.model.root);if(c.peer)clearRemoteShots(c);});
  cars=[];localShots=[];myShots=[];remoteShots=[];
  for(let i=0;i<roomMax;i++){
    const c=mkCar(i);
    if(i===mySlot){c.kind='me';c.name=names[i]||'You';c.color=colors[i]||myColor;}
    else if(humanSlots.has(i)){c.kind='remote';c.name=names[i]||('P'+(i+1));c.color=colors[i]||SLOT_COLORS[i];c.peer=null;}
    else {c.kind='bot';c.name=BOT_NAMES[i%BOT_NAMES.length];c.color=SLOT_COLORS[i];}
    c.model=makeCar(new T.Color(c.color).getHex(),SLOT_SKINS[i%SLOT_SKINS.length],c.kind==='me');
    cars.push(c);
  }
  buildWorld(seed);
  // grid placement
  cars.forEach((c,i)=>{const back=12+i*7;place(c,back,(i%2?3:-3));c.lane=(i%2?3:-3);});
  raceState='countdown';countdownEnd=m.startTime;
  $('lobby').classList.add('hidden');$('results').classList.add('hidden');$('hud').classList.remove('hidden');
  camH=cars[mySlot].h;camera.position.set(cars[mySlot].x-8,4,cars[mySlot].z);
}
function startOffline(){
  mode=mode==='championship'?'championship':'dual';roomMax=mode==='championship'?6:2;seed=20240607;
  cars=[];localShots=[];myShots=[];mySlot=0;
  for(let i=0;i<roomMax;i++){const c=mkCar(i);c.kind=i===0?'me':'bot';c.name=i===0?'You':BOT_NAMES[i%BOT_NAMES.length];
    c.color=SLOT_COLORS[i];c.model=makeCar(new T.Color(c.color).getHex(),SLOT_SKINS[i%SLOT_SKINS.length],i===0);cars.push(c);}
  buildWorld(seed);cars.forEach((c,i)=>{place(c,12+i*7,(i%2?3:-3));c.lane=(i%2?3:-3);});
  raceState='countdown';countdownEnd=Date.now()+3500;
  $('lobby').classList.add('hidden');$('results').classList.add('hidden');$('hud').classList.remove('hidden');
  camH=cars[0].h;camera.position.set(cars[0].x-8,4,cars[0].z);
}
function buildWorld(s){if(!sceneryBuilt){if(window.CoastalArt)window.CoastalArt.build(s);else buildScenery(s);sceneryBuilt=true;}if(gifts.length===0){if(window.CoastalArt)window.CoastalArt.buildMysteryCrates();else buildGifts();}}

/* ---------------- results UI ---------------- */
function showResults(order){
  raceState='finished';
  $('results').classList.remove('hidden');$('hud').classList.add('hidden');
  const me=order.find(o=>o.slot===mySlot);
  $('resTitle').textContent = me&&me.rank===1?'🏆 YOU WIN!':'RESULTS';
  $('resSub').textContent = mode==='championship'?'Championship · '+roomMax+' players':'Dual race';
  const el=$('resList');el.innerHTML='';
  order.forEach(o=>{const d=document.createElement('div');d.className='line'+(o.slot===mySlot?' you':'');
    d.innerHTML=`<span class="pos">${o.rank}</span><span class="dot" style="background:${o.color}"></span><span class="nm">${o.name}</span><span class="tm">${o.finished?fmt(o.time):'DNF'}</span>`;el.appendChild(d);});
}
$('againBtn').onclick=()=>{if(connected){raceState='lobby';$('results').classList.add('hidden');$('lobby').classList.remove('hidden');
  // re-create a fresh room for simplicity
  ws.send(JSON.stringify({type:'create',mode, name:$('name').value||'Player', color:myColor}));}
  else startOffline();};
$('lobbyBtn').onclick=()=>{raceState='lobby';$('results').classList.add('hidden');$('lobby').classList.remove('hidden');};

function fmt(t){if(!t)return'—';return Math.floor(t/60)+':'+(t%60).toFixed(1).padStart(4,'0');}

/* ---------------- main loop ---------------- */
function buildWorldGuard(){}
let last=performance.now(),qualityAt=last,qualityFrames=0,qualityMs=0;
let renderScale=Math.min(devicePixelRatio||1,innerWidth<760?1.35:1.7);
let qualityCap=renderScale,qualityFloor=Math.min(.88,qualityCap);
function frame(now){
  requestAnimationFrame(frame);
  NOW=now;
  const rawDt=(now-last)/1000,dt=Math.min(rawDt,.05);last=now;
  qualityFrames++;qualityMs+=Math.min(rawDt,.08)*1000;
  if(now-qualityAt>4000&&qualityFrames>60){
    const avg=qualityMs/qualityFrames,old=renderScale;
    if(avg>22&&renderScale>qualityFloor+.04)renderScale=Math.max(qualityFloor,renderScale*.88);
    else if(avg<14&&renderScale<qualityCap-.04)renderScale=Math.min(qualityCap,renderScale*1.05);
    if(Math.abs(old-renderScale)>.015){renderer.setPixelRatio(renderScale);renderer.setSize(innerWidth,innerHeight,false);}
    qualityAt=now;qualityFrames=0;qualityMs=0;
  }

  // countdown / clock
  if(raceState==='countdown'){const rem=(countdownEnd-Date.now())/1000;
    if(rem>0){$('cd').classList.remove('hidden');$('cd').textContent=Math.ceil(rem);}
    else {$('cd').textContent='GO!';setTimeout(()=>$('cd').classList.add('hidden'),800);raceState='racing';raceClock=0;}}
  else if(raceState==='racing'||raceState==='finished'){if(raceState==='racing')raceClock+=dt;}

  if(raceState==='racing'||raceState==='finished'||raceState==='countdown'){
    simulate(dt);
    renderCars(dt);
  }
  // atmosphere always
  updateAtmosphere(dt,now);
  puffs(dt);updSkid(dt);

  if(raceState!=='lobby'){updateHUD();updateCamera(dt);}
  renderer.render(scene,camera);
}

function simulate(dt){
  const me=cars[mySlot];
  const racing=raceState==='racing';
  // input for player (locked until GO)
  let thTarget=(racing&&(K.gas||K.ArrowUp||K.KeyW))?1:0;
  throttle+=(thTarget? (3.0*settings.throttle):-(4.0*settings.throttle))*dt;
  throttle=clamp(throttle,0,1);
  const brake=(racing&&(K.brake||K.ArrowDown||K.KeyS))?1:0;
  const st=racing?getSteer():0;
  const boosting=racing&&(K.boost||K.Space||K.ShiftLeft)&&me.boostE>0&&me.stun<=0;
  if(boosting){me.bt=Math.max(me.bt,.15);me.boostE-=dt;sfxIdleBoost(dt);}else me.boostE=Math.min(3,me.boostE+dt*.3);
  // item use edge
  const itemKey=racing&&(K.item||K.KeyE||K.Enter);
  if(itemKey&&!lastItem){if(me.item)useItem(me);}lastItem=itemKey;

  // player sim
  drive(me,dt,{th:throttle,br:brake,st,boost:boosting});
  // bots + remotes
  for(const c of cars){if(c.slot===mySlot)continue;
    if(c.kind==='me')continue;
    if(c.kind==='bot'){if(racing){const a=ai(c);
      c.boostE=Math.min(3,c.boostE+dt*.3);
      if(c.boostE>1.6&&a.th>.9&&c.vf>34&&c.bt<=0){c.bt=1.2;c.boostE-=1.2;}
      if(c.item){c.aiW+=dt;if(c.aiW>2.2){const df=me.prog-c.prog;const it=c.item;
        if((it==='rocket'&&df>0&&df<75)||(it==='bomb'&&df<0&&df>-65)||it==='dome'||it==='speed'||it==='warp'||it==='mine'){useItem(c);c.aiW=0;}}}
      drive(c,dt,{th:a.th,br:a.br,st:a.st,boost:c.bt>0});}
      else drive(c,dt,{th:0,br:0,st:0,boost:false});}
    else if(c.kind==='remote'){interpRemote(c,dt);}
  }
  // substeps for stability
  // car-car collisions (me vs others using known positions)
  for(const c of cars){if(c.slot===mySlot)continue;
    const ox=c.kind==='remote'&&c.peer?c.peer.x:c.x, oz=c.kind==='remote'&&c.peer?c.peer.z:c.z;
    const dx=ox-me.x,dz=oz-me.z,d=Math.hypot(dx,dz);
    if(d<2.9&&d>1e-3){const nx=dx/d,nz=dz/d,o=(2.9-d)/2;me.x-=nx*o;me.z-=nz*o;
      if(c.kind==='bot'){c.x+=nx*o;c.z+=nz*o;const rv=(c.vx-me.vx)*nx+(c.vz-me.vz)*nz;if(rv<0){const j=-rv*.6;me.vx-=nx*j;me.vz-=nz*j;c.vx+=nx*j;c.vz+=nz*j;}}}}
  // timers
  for(const c of cars){c.bt=Math.max(0,c.bt-dt);c.dome=Math.max(0,c.dome-dt);if(c.stun>0)c.stun-=dt;}

  // gifts
  gifts.forEach((g,i)=>{if(g.t>0){g.t-=dt;if(g.t<=0)g.m.visible=true;}if(!g.m.visible)return;
    g.m.rotation.y+=dt*2;g.m.rotation.x+=dt;g.m.position.set(g.x,1.4+Math.sin(NOW*0.003+i)*.25,g.z);
    for(const c of cars){if(c.kind==='me'||c.kind==='bot'){if(g.m.visible&&Math.hypot(c.x-g.x,c.z-g.z)<2.8){take(c);g.t=7;g.m.visible=false;if(c.kind==='me')sfx('pickup');}}}});

  // projectiles
  updateShots(dt);

  // finish check for local
  if(me.fin>0&&raceState==='racing'){/* keep racing until results */}

  // sync up
  syncAcc+=dt;if(syncAcc>0.05){syncAcc=0;sendState();}
}
let boostSfxT=0;
function sfxIdleBoost(dt){boostSfxT+=dt;if(boostSfxT>0.25){boostSfxT=0;sfx('boost');}}

function updateShots(dt){
  localShots=localShots.filter(s=>{
    s.age+=dt;s.life-=dt;const dead=s.life<=0;
    if(s.type==='r'){s.h+=clamp(wrap(Math.atan2(-(cars[0].z-s.z),cars[0].x-s.x)-s.h),-2.4*dt,2.4*dt);
      // home toward nearest opponent ahead/behind
      let best=null,bd=1e9;for(const c of cars){if(c.slot===s.owner)continue;const dx=c.x-s.x,dz=c.z-s.z,dd=dx*dx+dz*dz;if(dd<bd){bd=dd;best=c;}}
      if(best){s.h+=clamp(wrap(Math.atan2(-(best.z-s.z),best.x-s.x)-s.h),-1.6*dt,1.6*dt);}
      s.x+=Math.cos(s.h)*s.v*dt;s.z-=Math.sin(s.h)*s.v*dt;s.m.position.set(s.x,.9,s.z);s.m.rotation.y=s.h;
      puff(s.x,.9,s.z,rand(-1,1),.5,rand(-1,1),.9,0xffa040,.5,.8);
      for(const c of cars){if(c.slot!==s.owner&&Math.hypot(c.x-s.x,c.z-s.z)<2.8){onShotHit(s,c);return false;}}}
    else if(s.type==='b'){s.m.position.set(s.x,.5,s.z);s.m.material.emissiveIntensity=.4+.5*Math.abs(Math.sin(NOW*0.01));
      for(const c of cars){if(c.slot!==s.owner&&Math.hypot(c.x-s.x,c.z-s.z)<3.4&&s.age>1){onShotHit(s,c);return false;}}
      if(s.age>1.2&&Math.hypot(cars[s.owner].x-s.x,cars[s.owner].z-s.z)<3.4){onShotHit(s,cars[s.owner]);return false;}}
    else if(s.type==='m'){s.m.position.set(s.x,.4,s.z);
      for(const c of cars){if(c.slot!==s.owner&&Math.hypot(c.x-s.x,c.z-s.z)<2.6){onShotHit(s,c);return false;}}}
    if(dead)scene.remove(s.m);return !dead;
  });
  myShots=myShots.filter(s=>localShots.includes(s));
}
function onShotHit(s,victim){
  const col=s.type==='r'?0xff8a1f:0xff2200;
  burst(s.x,s.z,col,20);sfx('explode');shake=Math.max(shake,.5);scene.remove(s.m);
  if(victim.kind==='me'||victim.kind==='bot'){hitCar(victim,s.x,s.z,col);}
  // if victim is remote human and we own the shot, notify server
  if(victim.kind==='remote'&&s.owner===mySlot&&connected&&ws&&ws.readyState===1){
    ws.send(JSON.stringify({type:'hit',target:victim.slot,x:s.x,z:s.z,t:s.type==='r'?0:1}));
  }
}

function interpRemote(c,dt){if(!c.peer)return;const p=c.peer;
  p.rx=lerp(p.rx,p.x,Math.min(1,dt*12));p.rz=lerp(p.rz,p.z,Math.min(1,dt*12));p.rh=lerp(p.rh,p.h,Math.min(1,dt*12));
  // update model handled in renderCars via peer values
}

/* ---------------- render cars ---------------- */
function renderCars(dt){
  for(const c of cars){
    const m=c.model;let x,z,h,vf,ti,bt,dm,on;
    if(c.kind==='remote'&&c.peer){x=c.peer.rx;z=c.peer.rz;h=c.peer.rh;vf=c.p.vf;ti=0;bt=c.p.bt;dm=c.p.dome;on=c.p.on;c.x=x;c.z=z;c.h=h;}
    else {x=c.x;z=c.z;h=c.h;vf=c.vf;ti=c.s;bt=c.bt;dm=c.dome;on=c.on;}
    m.root.position.set(x,0,z);m.root.rotation.y=h;
    m.tilt.rotation.x=-ti*clamp(vf,0,50)*.02;
    m.tilt.position.y=on?0:Math.sin(NOW*0.07+(c.slot))*0.02*Math.abs(vf)/50;
    m.wh.forEach(w=>{w.sp.rotation.z-=vf*dt/.51;if(w.front)w.st.rotation.y=-ti*1.6;});
    m.steerWheel.rotation.z=-ti*1.4;
    m.neck.rotation.y=-ti*1.2;
    m.shield.visible=dm>0&&(dm>1.5||Math.sin(NOW*0.04)>0);
    m.beams.forEach(b=>b.material.opacity=clamp(0.25+vf*0.01,0,0.6));
    // effects
    if(raceState==='racing'||raceState==='finished'||raceState==='countdown'){
      const sp=Math.abs(vf);const fx=Math.cos(h),fz=-Math.sin(h),rx=-fz,rz=fx;
      // exhaust gas smoke
      if(sp>2){const exW=m.exhaust.clone().applyAxisAngle(new T.Vector3(0,1,0),h);
        puff(x+exW.x-fx*0.2,0.55,z+exW.z-fz*0.2,-fx*2+rand(-.5,.5),.7,-fz*2+rand(-.5,.5),bt?0.7:0.45,bt?0xff9a3c:0xb8b8b8,bt?.35:.9,bt?.9:.4);}
      // boost flames
      if(bt>0){for(let i=0;i<2;i++)puff(x-fx*1.9+rand(-.2,.2),.5,z-fz*1.9+rand(-.2,.2),-fx*6+rand(-1,1),rand(.3,1),-fz*6+rand(-1,1),1.1,0xff7a1f,.4,.95);}
      // dust when off-road
      if(!on&&sp>6){[-1,1].forEach(zz=>puff(x-fx*1.05+rx*zz*.8,.2,z-fz*1.05+rz*zz*.8,rand(-1,1),1.5,rand(-1,1),1.3,0xd9bf86,1.1,.45));}
      // drift smoke
      if(on&&Math.abs(c.vr)>3.5){[-1,1].forEach(zz=>puff(x-fx*1.05+rx*zz*.8,.2,z-fz*1.05+rz*zz*.8,rand(-1,1),.8,rand(-1,1),1.1,0xffffff,.8,.4));
        // skid marks
        const wx=x-fx*1.05+rx*zz*.8, wz=z-fz*1.05+rz*zz*.8;skid(wx,wz,h);}
    }
  }
}

/* ---------------- atmosphere ---------------- */
function updateAtmosphere(dt,now){
  sun.position.set((cars[mySlot]?cars[mySlot].x:0)+30,70,(cars[mySlot]?cars[mySlot].z:0)+25);
  sun.target.position.set(cars[mySlot]?cars[mySlot].x:0,0,cars[mySlot]?cars[mySlot].z:0);
  sky.position.copy(camera.position);
  const sp=camera.position;const a=Math.atan2(sun.position.z-sp.z,sun.position.x-sp.x);
  sunGlow.position.set(sp.x+Math.cos(a)*500, 94, sp.z+Math.sin(a)*500);
  clouds.forEach(s=>{const o=s.userData.o;o.x+=dt*4;if(o.x>800)o.x=-800;s.position.set(camera.position.x+o.x,o.y,camera.position.z+o.z);});
  seaTex.offset.set((now*0.000004)%1,(now*0.000002)%1);
  foam.material.opacity=0.4+0.15*Math.sin(now*0.001);
  if(window.CoastalArt)window.CoastalArt.update(dt,now);
}

/* ---------------- camera + HUD ---------------- */
function updateCamera(dt){
  const me=cars[mySlot];if(!me)return;
  camH+=wrap(me.h-camH)*Math.min(1,dt*5);
  const dist=7.5+Math.abs(me.vf)*.07+(me.bt>0?1.8:0);
  const cx=Math.cos(camH),cz=-Math.sin(camH);
  let shakeX=0,shakeY=0;if(settings.shake&&shake>0){shake*=0.9;shakeX=rand(-1,1)*shake*0.4;shakeY=rand(-1,1)*shake*0.3;}
  const target=new T.Vector3(me.x-cx*dist+shakeX,3.4+shakeY,me.z-cz*dist);
  camera.position.lerp(target,Math.min(1,dt*12));
  camera.lookAt(me.x+cx*5,1.2,me.z+cz*5);
  const targetFov=(innerWidth<innerHeight?74:62)+Math.abs(me.vf)*.18+(me.bt>0?8:0);
  camera.fov+=(targetFov-camera.fov)*Math.min(1,dt*4);camera.updateProjectionMatrix();
  // speed lines + flash
  $('speedlines').style.opacity=clamp((Math.abs(me.vf)-30)/40,0,0.9)*(me.bt>0?1.3:1);
  if(flashT>0){flashT-=dt*3;$('flash').style.opacity=String(Math.max(0,flashT*0.8));}
  // engine audio
  engUpdate(Math.abs(me.vf),me.bt>0,throttle);
}

const mmx=pts.map(p=>p.x),mmz=pts.map(p=>p.z),X0=Math.min(...mmx),Z0=Math.min(...mmz);
const MS=210/Math.max(Math.max(...mmx)-X0,Math.max(...mmz)-Z0);
const mc=$('map').getContext('2d'),mp=(x,z)=>[14+(x-X0)*MS,14+(z-Z0)*MS];
function updateHUD(){
  const me=cars[mySlot];if(!me)return;
  // ranking
  const ranked=cars.slice().sort((a,b)=>{
    const pa=a.kind==='remote'&&a.peer?a.peer.s.pg:a.prog;
    const pb=b.kind==='remote'&&b.peer?b.peer.s.pg:b.prog;return pb-pa;});
  const myRank=ranked.indexOf(me)+1;
  $('pos').textContent=['1st','2nd','3rd','4th','5th','6th'][myRank-1]||(myRank+'th');
  $('lap').textContent=`Lap ${clamp(me.k,1,LAPS)}/${LAPS}`;
  $('spd').innerHTML=`${Math.round(Math.abs(me.vf)*3.6)} <small>km/h</small>`;
  $('time').textContent=fmt(raceClock);
  $('bar').firstElementChild.style.width=(me.boostE/3*100)+'%';
  $('bar').classList.toggle('full',me.boostE>=2.99);
  $('itm').textContent=me.item?ITEM_NAME[me.item]:'No item';
  // rank list
  const rl=$('rank');rl.innerHTML=ranked.slice(0,Math.min(6,ranked.length)).map((c,i)=>
    `<div class="r" style="${c.slot===mySlot?'color:#ffd23f':''}"><b>${i+1}</b><span style="flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.name}</span></div>`).join('');
  // minimap
  mc.clearRect(0,0,236,236);mc.lineWidth=10;mc.lineJoin='round';mc.strokeStyle='rgba(255,255,255,.85)';
  mc.beginPath();pts.forEach((p,i)=>{const[a,b]=mp(p.x,p.z);i?mc.lineTo(a,b):mc.moveTo(a,b);});mc.closePath();mc.stroke();
  cars.forEach(c=>{const x=c.kind==='remote'&&c.peer?c.peer.x:c.x,z=c.kind==='remote'&&c.peer?c.peer.z:c.z;
    const[a,b]=mp(x,z);mc.fillStyle=c.color;mc.beginPath();mc.arc(a,b,c.slot===mySlot?9:7,0,7);mc.fill();
    mc.lineWidth=2.5;mc.strokeStyle='#fff';mc.stroke();});
}

/* ---------------- resize ---------------- */
function fit(){qualityCap=Math.min(devicePixelRatio||1,innerWidth<760?1.35:1.7);qualityFloor=Math.min(.88,qualityCap);renderScale=Math.min(renderScale||qualityCap,qualityCap);renderer.setPixelRatio(renderScale);renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
addEventListener('resize',fit);fit();
camera.position.set(0,38,-118);camera.lookAt(0,0,-115);

/* ---------------- boot ---------------- */
if(window.CoastalArt)window.CoastalArt.install();
$('load').classList.add('hidden');
connect();
// offline fallback if server never connects
setTimeout(()=>{if(!connected&&raceState==='lobby'){
  $('lobbyMsg').textContent='Offline mode available — or start the server for multiplayer.';}},2500);
requestAnimationFrame(frame);
