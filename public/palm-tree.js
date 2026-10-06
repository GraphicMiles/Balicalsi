/* palm-tree.js - standalone procedural coconut palm (Cocos nucifera).
   Needs only THREE (r128+). No textures, no files, no DOM: all geometry and vertex
   colours are generated at call time from a deterministic hash (same output every run).

   USAGE
     const palm = createPalm(THREE, {detail: 'hero'});   // 1 unit = 1 metre, base at the
     palm.object.position.set(x, groundY, z);            // origin, +Y up, ~9.6 m tall
     scene.add(palm.object);
     // each frame:  palm.update(dt);                    // dt in seconds, advances wind sway
     // palm.setWind(0..2)   wind strength (default 1)
     // palm.meshes  palm.triangles  palm.height  palm.crown (Vector3)  palm.dispose()
     // palm.object.clone() gives more palms that SHARE geometry + materials (cheap):
     //   const p2 = palm.object.clone(); p2.position.set(x2, y2, z2); scene.add(p2);

   detail presets (opt.* override any single value):
     'hero' ~157k tris  trunk 240x56, 27 fronds x 105 leaflets   (nearest ~4 palms)
     'mid'  ~ 40k tris  trunk 140x32, 15 fronds x  40 leaflets
     'low'  ~  6k tris  trunk  40x12,  9 fronds x  14 leaflets   (instancing / far)

   LIGHTING / SHADOWS: meshes set castShadow + receiveShadow. The host scene needs a
   shadow-casting light (renderer.shadowMap.enabled = true). Fronds are opaque geometry
   (vertex coloured), so the default depth material is already correct for the shadow pass.

   The file is delimited by PALM-TREE:BEGIN / PALM-TREE:END. tools/inline-palm.js copies
   this exact block into public/index.html so the game and this module never diverge. */
/* ==== PALM-TREE:BEGIN ==== */
function createPalm(T,opts){opts=opts||{};const PI=Math.PI,cl=(v,a,b)=>Math.max(a,Math.min(b,v)),lp=(a,b,t)=>a+(b-a)*t;
const hs=(x,z)=>{const s=Math.sin(x*127.1+z*311.7)*43758.5453;return s-Math.floor(s)};
const vn=(x,z)=>{const i=Math.floor(x),j=Math.floor(z),u=x-i,v=z-j,a=u*u*(3-2*u),b=v*v*(3-2*v);return lp(lp(hs(i,j),hs(i+1,j),a),lp(hs(i,j+1),hs(i+1,j+1),a),b)};
const fb=(x,z)=>vn(x,z)*.5+vn(x*2.1+5,z*2.1)*.25+vn(x*4.3,z*4.3+9)*.125;
const V3=(x,y,z)=>new T.Vector3(x,y,z);
/* ---------- detail presets: every count is a named constant so variants are derived, not retyped ---------- */
const DET={
 hero:{trunkRings:240,trunkSides:56,fronds:27,rachSeg:44,leaflets:105,leafRows:5,roots:44,rootSeg:14,rootSides:8,nuts:16,nutRings:18,nutSides:26},
 mid :{trunkRings:140,trunkSides:32,fronds:15,rachSeg:32,leaflets:40, leafRows:5,roots:24,rootSeg:10,rootSides:6,nuts:8, nutRings:12,nutSides:16},
 low :{trunkRings:40, trunkSides:12,fronds:9, rachSeg:12,leaflets:14, leafRows:3,roots:12,rootSeg:6, rootSides:5,nuts:5, nutRings:10,nutSides:10}};
const DD=DET[opts.detail]||DET.hero,dv=(k)=>opts[k]!==undefined?opts[k]:DD[k];
const NR=dv('trunkRings'),NS=dv('trunkSides'),NF=dv('fronds'),N=dv('rachSeg'),NL=dv('leaflets'),RW=dv('leafRows'),
      NROOT=dv('roots'),RSEG=dv('rootSeg'),RSIDE=dv('rootSides'),NNUT=dv('nuts'),NRING=dv('nutRings'),NSID=dv('nutSides');
const root=new T.Group();
const U={t:{value:0},k:{value:1}};let tris=0;const meshes=[];
/* geometry builder: positions, colours, wind weight, wind phase */
const G=()=>({p:[],c:[],w:[],h:[],i:[],n:0}),V=(g,x,y,z,r,gg,b,w,h)=>{g.p.push(x,y,z);g.c.push(r,gg,b);g.w.push(w||0);g.h.push(h||0);return g.n++};
function mesh(g,mat,wind){const o=new T.BufferGeometry();o.setAttribute('position',new T.Float32BufferAttribute(g.p,3));o.setAttribute('color',new T.Float32BufferAttribute(g.c,3));o.setAttribute('aW',new T.Float32BufferAttribute(g.w,1));o.setAttribute('aP',new T.Float32BufferAttribute(g.h,1));o.setIndex(g.i);o.computeVertexNormals();mat.vertexColors=true;mat.side=T.DoubleSide;
 if(wind)mat.onBeforeCompile=s=>{s.uniforms.uT=U.t;s.uniforms.uK=U.k;s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nattribute float aW,aP;uniform float uT,uK;').replace('#include <begin_vertex>','#include <begin_vertex>\nfloat q=aP*1.7;transformed+=vec3(sin(uT*1.4+q+position.x*.6),sin(uT*2.3+q*2.+position.z)*.35,cos(uT*1.1+q+position.z*.6))*aW*.15*uK;')};
 const m=new T.Mesh(o,mat);m.castShadow=m.receiveShadow=true;tris+=g.i.length/3;root.add(m);meshes.push(m);return m}
/* generic tapered tube along a polyline */
function tube(g,pts,rf,ns,col,wf,ph){const b0=g.n,L=pts.length-1;pts.forEach((p,i)=>{const t=pts[Math.min(i+1,L)].clone().sub(pts[Math.max(i-1,0)]).normalize(),ref=Math.abs(t.y)>.9?V3(1,0,0):V3(0,1,0),a=new T.Vector3().crossVectors(t,ref).normalize(),b=new T.Vector3().crossVectors(t,a),r=rf(i/L);for(let k=0;k<ns;k++){const th=k/ns*2*PI,q=p.clone().addScaledVector(a,Math.cos(th)*r).addScaledVector(b,Math.sin(th)*r),s=.82+.3*hs(i,k);V(g,q.x,q.y,q.z,col[0]*s,col[1]*s,col[2]*s,wf?wf(i/L):0,ph||0)}});
 for(let i=0;i<L;i++)for(let k=0;k<ns;k++){const a=b0+i*ns+k,b=b0+i*ns+(k+1)%ns;g.i.push(a,a+ns,b,b,a+ns,b+ns)}}
/* ---------- TRUNK: leaning S-curve, flared root bulb, crescent leaf scars, vertical cracks ---------- */
const H=9.6,cen=u=>V3(Math.pow(u,1.7)*3.2+.14*Math.sin(u*9),u*H,Math.sin(u*3.2)*.55+u*u*.5);
{const g=G();
 for(let i=0;i<=NR;i++){const u=i/NR,c=cen(u),t=cen(Math.min(1,u+.004)).sub(cen(Math.max(0,u-.004))).normalize(),a=V3(0,0,1).sub(t.clone().multiplyScalar(t.z)).normalize(),b=new T.Vector3().crossVectors(t,a),y=u*H,
  base=.145+.04*(1-u)+.34*Math.exp(-y*2.3)+.05*Math.exp(-Math.pow((y-1.1)/.6,2)),f=y/.118,fr=f-Math.floor(f),gr=Math.min(fr,1-fr);
  for(let k=0;k<NS;k++){const th=k/NS*2*PI,ct=Math.cos(th),st=Math.sin(th),
   crescent=.55+.45*Math.cos(th-1.4*Math.sin(f*.9)),scar=.017*Math.exp(-Math.pow(gr/.1,2))*crescent,
   crack=Math.exp(-y*.7)*.03*Math.pow(vn(ct*3+y*.5,st*3+y*.9),3),
   rough=.007*fb(ct*5+3,st*5+y*4),r=base-scar-crack+rough;
   const sh=(.78+.5*fb(ct*2+y*.6,st*2+4))*(scar>.007?.72:1)*(1-.3*Math.exp(-y*.9)*vn(ct*4,y*6)),
   p=c.clone().addScaledVector(a,ct*r).addScaledVector(b,st*r);
   V(g,p.x,p.y,p.z,.56*sh,.5*sh,.43*sh,0,0)}}
 for(let i=0;i<NR;i++)for(let k=0;k<NS;k++){const a=i*NS+k,b=i*NS+(k+1)%NS;g.i.push(a,a+NS,b,b,a+NS,b+NS)}
 mesh(g,new T.MeshStandardMaterial({roughness:.92,metalness:0}),false)}
/* ---------- ROOT MASS ---------- */
{const g=G();for(let n=0;n<NROOT;n++){const ps=n*2.4+hs(n,1)*.8,ln=.7+hs(n,2)*1.3,pts=[];for(let i=0;i<=RSEG;i++){const s=i/RSEG,rr=.24+s*ln,y=.5*Math.pow(1-s,1.6)-.1*s;pts.push(V3(Math.cos(ps+s*.5*hs(n,3))*rr,y+.02,Math.sin(ps+s*.5*hs(n,3))*rr))}
 tube(g,pts,s=>.055*(1-s*.75)+.01,RSIDE,[.38+.1*hs(n,4),.28,.2],null)}
 mesh(g,new T.MeshStandardMaterial({roughness:1}),false)}
/* ---------- CROWN: fronds, each rachis + 2x leaflets ---------- */
const crown=cen(1).add(V3(0,.06,0));
{const g=G(),rg=G();
 for(let f=0;f<NF;f++){const a=NF>1?f/(NF-1):0,ph=f*2.39996+hs(f,1)*.5,dir=V3(Math.cos(ph),0,Math.sin(ph)),sd=V3(-Math.sin(ph),0,Math.cos(ph)),L=(4.3+hs(f,2)*.9)*(.88+.12*a),p0=lp(-.3,1.3,Math.pow(a,1.25))+(hs(f,3)-.5)*.2,bend=lp(1.7,.45,a),dry=Math.pow(1-a,3),pts=[];
  let pos=crown.clone().addScaledVector(dir,.12);const ds=L/N;
  for(let i=0;i<=N;i++){pts.push(pos.clone());const s=i/N,th=p0-bend*s*s;pos.addScaledVector(dir,Math.cos(th)*ds).addScaledVector(V3(0,1,0),Math.sin(th)*ds)}
  tube(rg,pts,s=>.05*(1-s)+.009,Math.max(4,Math.round(NS/9)),[lp(.33,.46,dry),lp(.42,.35,dry),lp(.14,.16,dry)],s=>s*.8,f);
  const at=s=>{const x=s*N,i=Math.min(N-1,x|0);return pts[i].clone().lerp(pts[i+1],x-i)},tn=s=>{const x=s*N,i=Math.min(N-1,x|0);return pts[i+1].clone().sub(pts[i]).normalize()};
  for(let j=0;j<NL;j++){const s=.21+.78*j/(NL-1),p=at(s),t=tn(s),up=new T.Vector3().crossVectors(sd,t).normalize(),tw=s*s*1.25,ct=Math.cos(tw),st=Math.sin(tw),
   sdT=sd.clone().multiplyScalar(ct).addScaledVector(up,st),upT=up.clone().multiplyScalar(ct).addScaledVector(sd,-st),prof=Math.pow(Math.sin(PI*cl((s-.16)/.88,0,1)),.7);
   for(const sg of[-1,1]){const sw=lp(.62,.3,s)+(hs(j,f+sg)-.5)*.16,d=sdT.clone().multiplyScalar(sg*Math.cos(sw)).addScaledVector(t,Math.sin(sw)).addScaledVector(upT,-.4).normalize(),ln=(.1+1.0*prof)*(.9+.2*hs(j*sg,f)),W=.03*(.85+.3*hs(j,f*3)),b0=g.n;
    for(let r=0;r<RW;r++){const rho=r/(RW-1),c=p.clone().addScaledVector(d,ln*rho).addScaledVector(V3(0,-1,0),ln*.24*rho*rho),w=Math.max(W*Math.pow(1-rho,.7)*Math.min(1,.5+rho*5),W*.05),
     dk=lp(.07,.3,rho),gc=.2+.28*rho,k0=Math.min(1,dry*(.35+.65*rho)+(rho>.85?.25:0)),jr=.85+.3*hs(j,f*7+r);
     for(let e=-1;e<=1;e++){const q=c.clone().addScaledVector(t,e*w).addScaledVector(upT,Math.abs(e)*w*.7),m=e?1:.78;
      V(g,q.x,q.y,q.z,lp(dk,.55,k0)*m*jr,lp(gc,.47,k0)*m*jr,lp(.05+.06*rho,.2,k0)*m*jr,(.2+.8*s)*(.5+.5*rho)*.9,f*.9+j*.02)}}
    for(let r=0;r<RW-1;r++)for(let e=0;e<2;e++){const q=b0+r*3+e;g.i.push(q,q+1,q+3,q+1,q+4,q+3)}}}}
 mesh(g,new T.MeshStandardMaterial({roughness:.48,emissive:0x1d3a0c,emissiveIntensity:.3}),true);mesh(rg,new T.MeshStandardMaterial({roughness:.7}),true)}
/* ---------- COCONUTS ---------- */
{const g=G();for(let n=0;n<NNUT;n++){const an=n*2.4+hs(n,5),rr=.18+.17*hs(n,6),cx=crown.x+Math.cos(an)*rr,cz=crown.z+Math.sin(an)*rr,cy=crown.y-.3-.14*hs(n,7),sz=.9+.25*hs(n,8),br=hs(n,9)>.7?1:0,b0=g.n;
 for(let i=0;i<=NRING;i++){const v=i/NRING*PI;for(let k=0;k<NSID;k++){const th=k/NSID*2*PI,rad=Math.max(Math.sin(v),.015)*(1+.07*Math.cos(3*th))*.135*sz,sh=.85+.3*hs(i,k+n);V(g,cx+Math.cos(th)*rad,cy+Math.cos(v)*.2*sz,cz+Math.sin(th)*rad,lp(.33,.42,br)*sh,lp(.42,.3,br)*sh,lp(.15,.16,br)*sh,.1,n)}}
 for(let i=0;i<NRING;i++)for(let k=0;k<NSID;k++){const a=b0+i*NSID+k,b=b0+i*NSID+(k+1)%NSID;g.i.push(a,a+NSID,b,b,a+NSID,b+NSID)}}
 mesh(g,new T.MeshStandardMaterial({roughness:.65}),true)}
root.scale.setScalar(opts.scale||1);
return{object:root,update:dt=>{U.t.value+=dt},setWind:k=>{U.k.value=k},meshes,triangles:tris,height:H,crown:crown.clone(),dispose(){meshes.forEach(m=>{m.geometry.dispose();m.material.dispose()})}}}
if(typeof module!=='undefined')module.exports={createPalm};
if(typeof window!=='undefined')window.createPalm=createPalm;
/* ==== PALM-TREE:END ==== */
