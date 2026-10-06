/* ==== PALM-FIELD:BEGIN ==== */
/* ---- palm field: one detail pool per LOD over a static whole-island field.

   Was: 3600 identical palm instances (40-tri cylinder trunk + a 66-tri crown of 11
   alpha-tested quads = 381,600 triangles a frame), all of them also rendered into the
   shadow map even though the sun's shadow camera only covers +/-60 m around the car.

   Now: every palm on the island is the generated coconut palm, at four detail levels.
   The field itself is the 80-tri ultra LOD, written once, and each of the three detail
   pools draws the nearest palms on top of it. The ultra twin is scaled to 0.93 so it
   sits inside its detail copy rather than poking through it.

     rank/within   pool     mesh      tris each   how many
     nearest,45 m  hero     hero        156,688      1
     next,within 90m  mid   mid          45,632      5
     next,within 260m low   low           6,712     16
     everything    field    ultra            80    3600

   The detail pools are rebuilt only once the car has moved 10 m, so a parked or slowly
   rolling car costs nothing per frame. Shadows: only the hero and mid pools cast (they
   are the only ones close enough to reach the +/-60 m shadow frustum); the field and
   the low pool used to pay for shadow work that could never be seen. ---- */
const palmField=(()=>{
const CAPS=[1,5,16],BAND=[45,90,260],SHRINK=.93,MAXP=3600;
const pool=(palm,cap,shadow)=>({palm,shadow,ims:palm.meshes.map(m=>{const im=new T.InstancedMesh(m.geometry,m.material,cap);
 im.count=0;im.castShadow=shadow;im.receiveShadow=true;im.frustumCulled=false;
 im.instanceMatrix.setUsage(T.DynamicDrawUsage);S.add(im);return im})});
const SRC=[createPalm(T,{detail:'hero'}),createPalm(T,{detail:'mid'}),createPalm(T,{detail:'low'})];
/* only the hero pool casts: the sun's shadow camera is fitted to +/-60 m around the car,
   and the mid pool starts at 45 m, so its shadow work is mostly outside the map (measured:
   the shadow pass was 579,238 triangles a frame with both pools casting). */
const P=[pool(SRC[0],CAPS[0],true),pool(SRC[1],CAPS[1],false),pool(SRC[2],CAPS[2],false)];
const FLD=pool(createPalm(T,{detail:'ultra'}),MAXP,false);
const PX=new Float32Array(MAXP),PY=new Float32Array(MAXP),PZ=new Float32Array(MAXP),
      SX=new Float32Array(MAXP),SY=new Float32Array(MAXP),SZ=new Float32Array(MAXP),
      RY=new Float32Array(MAXP),RZ=new Float32Array(MAXP);
/* One candidate list for the whole detail range, sorted by distance and then sliced by
   rank. Radius bands alone are fragile: palms grow 12-20 m off the road, so a band edge
   can fall in a gap and leave the nearest palm unupgraded. Ranking cannot miss.
   PD is keyed by PALM index and SELI holds palm indices, so the comparator and the
   distance test both read the same index space. (Keying one array by palm index and
   filling the other positionally sorts unrelated palms - the bug this replaced.) */
const SELI=new Int32Array(4096),PD=new Float32Array(MAXP);
const dmy=new T.Object3D();
let PN=0,lx=1e9,lz=1e9,caps=CAPS.slice();
const setI=(pl,slot,i,shrink)=>{dmy.position.set(PX[i],PY[i],PZ[i]);dmy.rotation.set(0,RY[i],RZ[i]);
 dmy.scale.set(SX[i]*shrink,SY[i]*shrink,SZ[i]*shrink);dmy.updateMatrix();
 for(const im of pl.ims)im.setMatrixAt(slot,dmy.matrix)};
function add(x,y,z,sx,sy,sz,yaw,tilt){if(PN>=MAXP)return;
 PX[PN]=x;PY[PN]=y;PZ[PN]=z;SX[PN]=sx;SY[PN]=sy;SZ[PN]=sz;RY[PN]=yaw;RZ[PN]=tilt;
 setI(FLD,PN,PN,SHRINK);PN++}
function commit(){const n=Math.max(1,Math.round(PN*qp.veg));
 for(const im of FLD.ims){im.count=n;im.instanceMatrix.needsUpdate=true}lx=1e9}
function rebuild(cx,cz){
 const far=BAND[2]*BAND[2];let m=0;
 for(let i=0;i<PN;i++){const dx=PX[i]-cx,dz=PZ[i]-cz,d=dx*dx+dz*dz;
  if(d<far&&m<SELI.length){PD[i]=d;SELI[m++]=i}}
 if(m>1)SELI.subarray(0,m).sort((a,b)=>PD[a]-PD[b]);
 let r=0;
 for(let k=0;k<3;k++){const pl=P[k],lim=BAND[k]*BAND[k],n=Math.min(caps[k],m-r);let got=0;
  for(let s=0;s<n;s++){if(PD[SELI[r+s]]>lim)break;setI(pl,got,SELI[r+s],1);got++}
  r+=got;
  for(const im of pl.ims){im.count=got;im.instanceMatrix.needsUpdate=true}}}
function tick(dt,cx,cz){for(const s of SRC)s.update(dt);FLD.palm.update(dt);
 const dx=cx-lx,dz=cz-lz;if(dx*dx+dz*dz>100){lx=cx;lz=cz;rebuild(cx,cz)}}
function applyQuality(){const v=qp.veg;caps=CAPS.map(c=>Math.max(1,Math.round(c*v)));
 const n=Math.max(1,Math.round(PN*qp.veg));
 for(const im of FLD.ims){im.count=n}
 P.concat([FLD]).forEach(pl=>pl.ims.forEach(im=>{im.castShadow=pl.shadow&&!!qp.shadow}));
 /* re-run the assignment so a quality change resizes the detail pools now, rather than
    at the next 10 m of driving (the pools used to stay at their old size until then) */
 if(lx<1e8)rebuild(lx,lz)}
return{add,commit,tick,applyQuality,placed:()=>PN,poolOf:k=>P[k],field:FLD};
})();
{const TN=3600;let n=0;
for(let q=0;q<30000&&n<TN;q++){const x=(Math.random()*2-1)*1700,z=(Math.random()*2-1)*1700,r=Math.hypot(x,z);const Rr=RR(Math.atan2(z,x)),d=Rr-r;if(d<20)continue;const h=G(x,z);if(h<1.2||h>420||Math.hypot(G(x+3,z)-G(x-3,z),G(x,z+3)-G(x,z-3))/6>.6||Math.abs(r-.9*Rr)<10||near(x,z,10))continue;if(Math.random()>(d<110?.3:.8*(1-ss(150,420,h))))continue;
 const sc=.75+Math.random()*.9;
 palmField.add(x,h-.2,z,sc,sc*(.9+hs(n,7)*.3),sc,hs(n,17)*6.283,(hs(n,3)-.5)*.12);
 ob(x,z,.45*sc+.1);n++}
palmField.commit()}
/* ==== PALM-FIELD:END ==== */
