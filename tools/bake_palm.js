// bake_palm.js - builds palm_nanite.glb: ~770k-triangle coconut palm + baked PBR textures (albedo / normal / ORM). Needs node + `sharp`.  node bake_palm.js
const sharp=require('sharp'),fs=require('fs'),PI=Math.PI,cl=(v,a,b)=>Math.max(a,Math.min(b,v)),lp=(a,b,t)=>a+(b-a)*t;
const hs=(x,z)=>{const s=Math.sin(x*127.1+z*311.7)*43758.5453;return s-Math.floor(s)};
const pn=(x,y,px,py,sd)=>{const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,a=u*u*(3-2*u),b=v*v*(3-2*v),m=(q,p)=>((q%p)+p)%p,h=(p,q)=>hs(m(p,px)+sd*17.3,m(q,py)+sd*5.1);return lp(lp(h(i,j),h(i+1,j),a),lp(h(i,j+1),h(i+1,j+1),a),b)};
class V3{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z}clone(){return new V3(this.x,this.y,this.z)}sub(a){this.x-=a.x;this.y-=a.y;this.z-=a.z;return this}add(a){this.x+=a.x;this.y+=a.y;this.z+=a.z;return this}mul(k){this.x*=k;this.y*=k;this.z*=k;return this}asv(a,k){this.x+=a.x*k;this.y+=a.y*k;this.z+=a.z*k;return this}nrm(){const l=Math.hypot(this.x,this.y,this.z)||1;return this.mul(1/l)}cross(a,b){const x=a.y*b.z-a.z*b.y,y=a.z*b.x-a.x*b.z,z=a.x*b.y-a.y*b.x;this.x=x;this.y=y;this.z=z;return this}lerp(a,t){this.x+=(a.x-this.x)*t;this.y+=(a.y-this.y)*t;this.z+=(a.z-this.z)*t;return this}}
const v3=(x,y,z)=>new V3(x,y,z);
/* ---------- baked height fields (also used to displace the real geometry) ---------- */
const bh=(u,v)=>{const s=pn(u*48,v*5,48,5,1)*.5+pn(u*96,v*10,96,10,2)*.28+pn(u*192,v*20,192,20,3)*.14,fr=(v*8)%1,g=Math.min(fr,1-fr),sc=Math.exp(-Math.pow(g/.06,2))*(.55+.45*Math.cos(6.2832*u+2*Math.sin(v*37))),cr=Math.pow(1-Math.abs(2*pn(u*14,v*2,14,2,4)-1),8);return cl(.15+s*.75-sc*.45-cr*.3,0,1)};
const lh=(u,v)=>{const vein=.5+.5*Math.cos(6.2832*(u*20+.6*pn(u*6,v*30,6,30,5))),rib=Math.exp(-Math.pow((u-.5)/.035,2));return cl(.35+.25*vein+.4*rib-.1*pn(u*40,v*60,40,60,6),0,1)};
const nh=(u,v)=>cl(.2+.5*pn(u*80,v*10,80,10,7)+.3*pn(u*160,v*20,160,20,8),0,1);
async function bake(name,W,Hh,hf,alb,rough,nstr,jpg){const h=new Float32Array(W*Hh),A=Buffer.alloc(W*Hh*3),N=Buffer.alloc(W*Hh*3),O=Buffer.alloc(W*Hh*3);
 for(let y=0;y<Hh;y++)for(let x=0;x<W;x++)h[y*W+x]=hf(x/W,y/Hh);
 for(let y=0;y<Hh;y++)for(let x=0;x<W;x++){const i=y*W+x,u=x/W,v=y/Hh,hh=h[i],dx=h[y*W+(x+1)%W]-h[y*W+(x+W-1)%W],dy=h[((y+1)%Hh)*W+x]-h[((y+Hh-1)%Hh)*W+x],l=Math.hypot(dx*nstr,dy*nstr,1),c=alb(u,v,hh);
  for(let k=0;k<3;k++)A[i*3+k]=cl(c[k]*255,0,255);N[i*3]=(-dx*nstr/l*.5+.5)*255;N[i*3+1]=(dy*nstr/l*.5+.5)*255;N[i*3+2]=(1/l*.5+.5)*255;O[i*3]=cl(.35+.65*hh,0,1)*255;O[i*3+1]=cl(rough(u,v,hh),0,1)*255;O[i*3+2]=0}
 const o={raw:{width:W,height:Hh,channels:3}},J=b=>sharp(b,o).jpeg({quality:92,chromaSubsampling:'4:4:4'}).toBuffer();
 return{name,alb:await J(A),orm:await J(O),nrm:await sharp(N,o).png({compressionLevel:7}).toBuffer(),A,N,W,Hh}}
/* ---------- mesh builder ---------- */
const MS=()=>({P:[],UV:[],C:[],Wd:[],I:[],cn:[],n:0}),vx=(m,p,u,v,c,w,ph)=>{m.P.push(p.x,p.y,p.z);m.UV.push(u,v);m.C.push(c[0],c[1],c[2]);m.Wd.push(w||0,ph||0);return m.n++};
function grid(m,b0,rows,cols){for(let i=0;i<rows;i++)m.cn[b0+i*cols+cols-1]=b0+i*cols;for(let i=0;i<rows-1;i++)for(let k=0;k<cols-1;k++){const a=b0+i*cols+k;m.I.push(a,a+cols,a+1,a+1,a+cols,a+cols+1)}}
function normals(m){const n=m.n,N=new Float32Array(n*3),P=m.P,cn=a=>m.cn[a]!==undefined?m.cn[a]:a;for(let t=0;t<m.I.length;t+=3){const a=m.I[t],b=m.I[t+1],c=m.I[t+2],ux=P[b*3]-P[a*3],uy=P[b*3+1]-P[a*3+1],uz=P[b*3+2]-P[a*3+2],wx=P[c*3]-P[a*3],wy=P[c*3+1]-P[a*3+1],wz=P[c*3+2]-P[a*3+2],nx=uy*wz-uz*wy,ny=uz*wx-ux*wz,nz=ux*wy-uy*wx;for(const q of[a,b,c]){const d=cn(q)*3;N[d]+=nx;N[d+1]+=ny;N[d+2]+=nz}}
 for(let i=0;i<n;i++){const s=cn(i)*3,l=Math.hypot(N[s],N[s+1],N[s+2]);if(l>1e-12){N[i*3]=N[s]/l;N[i*3+1]=N[s+1]/l;N[i*3+2]=N[s+2]/l}else{N[i*3]=0;N[i*3+1]=1;N[i*3+2]=0}}return N}
function tube(m,pts,rf,ns,uvf,col,wf,ph){const L=pts.length-1,b0=m.n;pts.forEach((p,i)=>{const t=pts[Math.min(i+1,L)].clone().sub(pts[Math.max(i-1,0)]).nrm(),ref=Math.abs(t.y)>.9?v3(1,0,0):v3(0,1,0),a=v3().cross(t,ref).nrm(),b=v3().cross(t,a),r=rf(i/L);for(let k=0;k<=ns;k++){const th=k/ns*2*PI,q=p.clone().asv(a,Math.cos(th)*r).asv(b,Math.sin(th)*r),uv=uvf(k/ns,i/L),s=.9+.1*hs(i,k%ns);vx(m,q,uv[0],uv[1],[col[0]*s,col[1]*s,col[2]*s],wf?wf(i/L):0,ph)}});grid(m,b0,L+1,ns+1)}
/* ---------- the palm ---------- */
const H=9.6,cen=u=>v3(Math.pow(u,1.7)*3.2+.14*Math.sin(u*9),u*H,Math.sin(u*3.2)*.55+u*u*.5);
const trunk=MS(),roots=MS(),fr=MS(),rach=MS(),nuts=MS();
{const NR=700,NS=120;for(let i=0;i<=NR;i++){const u=i/NR,c=cen(u),t=cen(Math.min(1,u+.003)).sub(cen(Math.max(0,u-.003))).nrm(),a=v3(0,0,1).asv(t,-t.z).nrm(),b=v3().cross(t,a),y=u*H,base=.145+.04*(1-u)+.34*Math.exp(-y*2.3)+.05*Math.exp(-Math.pow((y-1.1)/.6,2));
 for(let k=0;k<=NS;k++){const th=k/NS*2*PI,r=base+(bh(k/NS,y/.944)-.4)*.03,p=c.clone().asv(a,Math.cos(th)*r).asv(b,Math.sin(th)*r),t2=.78+.22*Math.min(1,y);vx(trunk,p,k/NS,y/.944,[t2,t2,t2],0,0)}}grid(trunk,0,NR+1,NS+1)}
for(let n=0;n<44;n++){const ps=n*2.4+hs(n,1)*.8,ln=.7+hs(n,2)*1.3,pts=[];for(let i=0;i<=36;i++){const s=i/36,rr=.24+s*ln,y=.5*Math.pow(1-s,1.6)-.1*s,an=ps+s*.5*hs(n,3);pts.push(v3(Math.cos(an)*rr,y+.02,Math.sin(an)*rr))}tube(roots,pts,s=>.055*(1-s*.75)+.01,12,(u,s)=>[u*.5,s*2],[.8,.7,.6])}
const crown=cen(1).add(v3(0,.06,0)),NF=34,NS2=80,NL=200,RW=9;
for(let f=0;f<NF;f++){const a=f/(NF-1),ph=f*2.39996+hs(f,1)*.5,dir=v3(Math.cos(ph),0,Math.sin(ph)),sd=v3(-Math.sin(ph),0,Math.cos(ph)),L=(4.3+hs(f,2)*.9)*(.88+.12*a),p0=lp(-.3,1.3,Math.pow(a,1.25))+(hs(f,3)-.5)*.2,bend=lp(1.7,.45,a),dry=Math.pow(1-a,3),pts=[];let pos=crown.clone().asv(dir,.12);const ds=L/NS2;
 for(let i=0;i<=NS2;i++){pts.push(pos.clone());const s=i/NS2,th=p0-bend*s*s;pos.asv(dir,Math.cos(th)*ds).asv(v3(0,1,0),Math.sin(th)*ds)}
 tube(rach,pts,s=>.05*(1-s)+.009,8,(u,s)=>[.5,s*3],[lp(.45,.85,dry),lp(.8,.7,dry),lp(.45,.4,dry)],s=>s*.8,f);
 const at=s=>{const x=s*NS2,i=Math.min(NS2-1,x|0);return pts[i].clone().lerp(pts[i+1],x-i)},tn=s=>{const x=s*NS2,i=Math.min(NS2-1,x|0);return pts[i+1].clone().sub(pts[i]).nrm()};
 for(let j=0;j<NL;j++){const s=.21+.78*j/(NL-1),p=at(s),t=tn(s),up=v3().cross(sd,t).nrm(),tw=s*s*1.25,ct=Math.cos(tw),st=Math.sin(tw),sdT=sd.clone().mul(ct).asv(up,st),upT=up.clone().mul(ct).asv(sd,-st),prof=Math.pow(Math.sin(PI*cl((s-.16)/.88,0,1)),.7);
  for(const sg of[-1,1]){const sw=lp(.62,.3,s)+(hs(j,f+sg)-.5)*.16,d=sdT.clone().mul(sg*Math.cos(sw)).asv(t,Math.sin(sw)).asv(upT,-.4).nrm(),ln=(.1+1.0*prof)*(.9+.2*hs(j*sg,f)),W=.03*(.85+.3*hs(j,f*3)),b0=fr.n;
   for(let r=0;r<RW;r++){const rho=r/(RW-1),c=p.clone().asv(d,ln*rho).asv(v3(0,-1,0),ln*.24*rho*rho),w=W*Math.pow(1-rho,.7)*Math.min(1,.5+rho*5),k0=Math.min(1,dry*(.35+.65*rho)+(rho>.85?.25:0)),jr=.85+.3*hs(j,f*7+r);
    for(let e=-1;e<=1;e++){const q=c.clone().asv(t,e*w).asv(upT,Math.abs(e)*w*.7),m=e?1:.85;vx(fr,q,(e+1)/2,rho,[lp(.35,1,k0)*m*jr,lp(.8,.8,k0)*m*jr,lp(.55,.45,k0)*m*jr].map(x=>cl(x,0,1)),(.2+.8*s)*(.5+.5*rho)*.9,f*.9+j*.02)}}
   for(let r=0;r<RW-1;r++)for(let e=0;e<2;e++){const q=b0+r*3+e;fr.I.push(q,q+1,q+3,q+1,q+4,q+3)}}}}
for(let n=0;n<16;n++){const an=n*2.4+hs(n,5),rr=.18+.17*hs(n,6),cx=crown.x+Math.cos(an)*rr,cz=crown.z+Math.sin(an)*rr,cy=crown.y-.3-.14*hs(n,7),sz=.9+.25*hs(n,8),br=hs(n,9)>.7?1:0,RN=44,CN=60,b0=nuts.n;
 for(let i=0;i<=RN;i++){const v=i/RN*PI;for(let k=0;k<=CN;k++){const th=k/CN*2*PI,rad=Math.sin(v)*(1+.07*Math.cos(3*th))*.135*sz;vx(nuts,v3(cx+Math.cos(th)*rad,cy+Math.cos(v)*.2*sz,cz+Math.sin(th)*rad),k/CN,i/RN,br?[.85,.65,.45]:[.7,.92,.55],.1,n)}}grid(nuts,b0,RN+1,CN+1)}
/* ---------- GLB ---------- */
(async()=>{const T=[await bake('bark',2048,2048,bh,(u,v,h)=>{const t=.85+.3*pn(u*16,v*2,16,2,9);return[lp(.16,.56,h)*t,lp(.14,.5,h)*t,lp(.12,.43,h)*t]},(u,v,h)=>.97-.1*h,5),
 await bake('leaf',512,1024,lh,(u,v,h)=>[lp(.3,.62,h),lp(.5,.72,h),lp(.14,.3,h)],(u,v,h)=>.55-.2*h,3),
 await bake('husk',1024,1024,nh,(u,v,h)=>[lp(.32,.6,h),lp(.3,.55,h),lp(.18,.33,h)],(u,v,h)=>.9-.2*h,3)];
 const bin=[],bv=[],ac=[];let off=0;const put=(b,tg)=>{while(off%4){bin.push(Buffer.alloc(1));off++}bin.push(b);bv.push({buffer:0,byteOffset:off,byteLength:b.length,...(tg?{target:tg}:{})});off+=b.length;return bv.length-1};
 const f32=a=>Buffer.from(new Float32Array(a).buffer),u32=a=>Buffer.from(new Uint32Array(a).buffer);
 const images=[],textures=[],materials=[],meshes=[],nodes=[],mats={bark:0,leaf:1,husk:2};
 T.forEach((t,i)=>{images.push({bufferView:put(t.alb),mimeType:'image/jpeg'},{bufferView:put(t.nrm),mimeType:'image/png'},{bufferView:put(t.orm),mimeType:'image/jpeg'});for(let k=0;k<3;k++)textures.push({sampler:0,source:i*3+k});
  materials.push({name:t.name,doubleSided:true,pbrMetallicRoughness:{baseColorTexture:{index:i*3},metallicRoughnessTexture:{index:i*3+2},metallicFactor:0,roughnessFactor:1},normalTexture:{index:i*3+1,scale:1},occlusionTexture:{index:i*3+2}})});
 const A=(arr,type,ct,count,mm)=>{ac.push({bufferView:put(arr,34962),componentType:ct,count,type,...(mm||{})});return ac.length-1};
 const addMesh=(name,m,mat)=>{const N=normals(m),mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let i=0;i<m.n;i++)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],m.P[i*3+k]);mx[k]=Math.max(mx[k],m.P[i*3+k])}
  const at={POSITION:A(f32(m.P),'VEC3',5126,m.n,{min:mn,max:mx}),NORMAL:A(f32(N),'VEC3',5126,m.n),TEXCOORD_0:A(f32(m.UV),'VEC2',5126,m.n),COLOR_0:A(f32(m.C),'VEC3',5126,m.n),_WIND:A(f32(m.Wd),'VEC2',5126,m.n)},
  ii=put(u32(m.I),34963);ac.push({bufferView:ii,componentType:5125,count:m.I.length,type:'SCALAR'});meshes.push({name,primitives:[{attributes:at,indices:ac.length-1,material:mat,mode:4}]});nodes.push({mesh:meshes.length-1,name});return m.I.length/3};
 let tri=0;tri+=addMesh('trunk',trunk,0);tri+=addMesh('roots',roots,0);tri+=addMesh('fronds_leaflets',fr,1);tri+=addMesh('fronds_rachis',rach,1);tri+=addMesh('coconuts',nuts,2);
 const json={asset:{version:'2.0',generator:'bake_palm.js',extras:{triangles:tri,height:H}},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,materials,textures,images,samplers:[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}],accessors:ac,bufferViews:bv,buffers:[{byteLength:off}]};
 let js=Buffer.from(JSON.stringify(json));while(js.length%4)js=Buffer.concat([js,Buffer.from(' ')]);const bb=Buffer.concat(bin),pad=(4-bb.length%4)%4,B=Buffer.concat([bb,Buffer.alloc(pad)]),hd=Buffer.alloc(12);hd.write('glTF',0);hd.writeUInt32LE(2,4);hd.writeUInt32LE(12+8+js.length+8+B.length,8);
 const c1=Buffer.alloc(8);c1.writeUInt32LE(js.length,0);c1.write('JSON',4);const c2=Buffer.alloc(8);c2.writeUInt32LE(B.length,0);c2.writeUInt32LE(0x004E4942,4);
 fs.writeFileSync('palm_nanite.glb',Buffer.concat([hd,c1,js,c2,B]));
 for(const t of T){await sharp(t.A,{raw:{width:t.W,height:t.Hh,channels:3}}).resize(512).jpeg().toFile(`prev_${t.name}_albedo.jpg`);await sharp(t.N,{raw:{width:t.W,height:t.Hh,channels:3}}).resize(512).jpeg().toFile(`prev_${t.name}_normal.jpg`)}
 console.log('triangles',tri,'size MB',((12+16+js.length+B.length)/1e6).toFixed(1))})();
