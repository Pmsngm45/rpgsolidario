/* Cena 3D dos locais do mapa (Three.js carregado sob demanda) */
(function(){
const ZONE=12; // raio da área onde as fichas podem ser colocadas
let S=null,PLANE=null;
const loadThree=()=>typeof window.loadThreeShared==="function"?window.loadThreeShared():(window.THREE?Promise.resolve(window.THREE):Promise.reject(new Error("Carregador Three.js indisponível.")));
const hash=s=>[...s].reduce((h,c)=>(h*31+c.charCodeAt(0))|0,7);
const rng=seed=>{let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}};

const modal=document.createElement("div");modal.id="scene3d";modal.hidden=true;
modal.innerHTML=`<div class="s3-box" role="dialog" aria-modal="true" aria-labelledby="s3Name"><canvas id="s3c"></canvas><aside class="s3-side"><div class="s3-head"><div><span class="eyebrow" id="s3Type"></span><h2 id="s3Name"></h2></div><button id="s3Close" class="secondary small">Fechar</button></div><p class="muted">Clique em um personagem ou NPC para colocá-lo ou tirá-lo do local. Arraste a ficha dentro do círculo dourado. Arraste o fundo para girar e use a roda para dar zoom.</p><div id="s3List"></div></aside></div>`;
document.body.appendChild(modal);

function build(c){
  const B=BIOMES[c.type],R=rng(hash(c.id)),sc=new THREE.Scene();
  sc.background=new THREE.Color(B.sky);sc.fog=new THREE.Fog(B.sky,50,115);
  sc.add(new THREE.HemisphereLight(0xcfe0ff,0x303040,.9));
  const sun=new THREE.DirectionalLight(0xffffff,.9);sun.position.set(18,30,12);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-36,right:36,top:36,bottom:-36,far:100});sc.add(sun);
  const add=(geo,col,x,y,z,o={})=>{const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:col,roughness:.9,flatShading:true,emissive:o.e||0,emissiveIntensity:o.e?.9:0}));
    m.position.set(x,y,z);if(o.ry)m.rotation.y=o.ry;if(o.rz)m.rotation.z=o.rz;if(o.sy)m.scale.y=o.sy;m.castShadow=m.receiveShadow=true;sc.add(m);return m};
  const pick=a=>a[Math.floor(R()*a.length)];
  const ring=(n,a,b,f)=>{for(let i=0;i<n;i++){const t=R()*6.283,d=a+R()*(b-a);f(Math.cos(t)*d,Math.sin(t)*d,R())}};
  const G=THREE;
  const tree=(x,z,r,c1=0x2e6b3a)=>{const h=2+r*3;add(new G.CylinderGeometry(.2,.3,h,6),0x5a3d24,x,h/2,z);add(new G.ConeGeometry(1.3+r*.8,h*1.3,7),c1,x,h+1,z)};
  const house=(x,z,r,wall=0xb9a58a,roof=0x8a3b32)=>{const w=2+r*1.5,h=1.6+r*2,ry=Math.atan2(x,z);add(new G.BoxGeometry(w,h,w),wall,x,h/2,z,{ry});add(new G.ConeGeometry(w*.85,1.4,4),roof,x,h+.7,z,{ry:ry+Math.PI/4})};
  const rock=(x,z,r,col=0x777c82)=>{const s=.6+r*1.6;add(new G.DodecahedronGeometry(s),col,x,s*.5,z,{ry:r*6})};
  const post=(x,z,h,rad,col,o)=>add(new G.CylinderGeometry(rad,rad*1.1,h,8),col,x,h/2,z,o);
  const cone=(x,z,h,rad,col,e,y=0)=>add(new G.ConeGeometry(rad,h,8),col,x,y+h/2,z,{e});
  const box=(x,y,z,w,h,d,col,ry)=>add(new G.BoxGeometry(w,h,d),col,x,y,z,{ry});
  const pool=(x,z,rad,col,e,y=.06)=>add(new G.CylinderGeometry(rad,rad,.1,24),col,x,y,z,{e});
  const gr=c.type==="port"?22:30;
  add(new G.CylinderGeometry(gr,gr+1.5,1,64),B.g,0,-.5,0);
  ({
    city:()=>{ring(26,13,26,(x,z,r)=>house(x,z,r,pick([0xb9a58a,0x9aa3b5,0xc9b9a0]),pick([0x8a3b32,0x3b4f7a,0x5a4a3a])));ring(5,20,27,(x,z,r)=>{post(x,z,9+r*6,1.3,0x7a7f95);cone(x,z,3,1.8,0x3b4f7a,0,9+r*6)})},
    village:()=>{ring(9,13,23,(x,z,r)=>house(x,z,r*.6));ring(18,12,28,(x,z,r)=>tree(x,z,r,0x4c8a3c))},
    forest:()=>{ring(80,12,29,(x,z,r)=>tree(x,z,r,pick([0x2e6b3a,0x25552f,0x3a7a40])));ring(9,12,28,(x,z,r)=>rock(x,z,r,0x6a6f66))},
    mountain:()=>{ring(8,19,29,(x,z,r)=>{const h=14+r*12,rad=6+r*3;cone(x,z,h,rad,0x6b6f78);cone(x,z,h*.3,rad*.3,0xf0f4f8,0,h*.7)});ring(16,12,28,(x,z,r)=>rock(x,z,r))},
    ruins:()=>{ring(18,13,26,(x,z,r)=>post(x,z,1+r*6,.7,0x8a8478,{rz:(R()-.5)*.25}));ring(10,13,27,(x,z,r)=>box(x,.4,z,2+r*2,.8,1.5+r,0x7a746a,r*6));ring(7,13,28,(x,z,r)=>rock(x,z,r,0x6b667a))},
    port:()=>{pool(0,0,70,0x2a5d8a,0,-.3);ring(10,13,20,(x,z,r)=>house(x,z,r*.7,0xc9b9a0,0x7a3b32));box(0,.3,27,4,.4,16,0x6b4a2c);ring(5,32,50,(x,z,r)=>{box(x,.5,z,2.4,1,5,0x6b4a2c,r*6);cone(x,z,5,1.2,0xf2ead8,0,1)})},
    desert:()=>{ring(9,13,27,(x,z,r)=>{const h=2+r*3;post(x,z,h,.4,0x3f8a4a);post(x+.8,z,h*.5,.25,0x3f8a4a)});ring(8,17,31,(x,z,r)=>add(new G.SphereGeometry(5+r*5,16,10),0xd9bd7a,x,-1,z,{sy:.35}));ring(10,12,28,(x,z,r)=>rock(x,z,r,0xb89a62))},
    snow:()=>{ring(45,12,29,(x,z,r)=>tree(x,z,r,pick([0xdfeaf2,0x9fb8c8,0x2f5a4a])));ring(12,12,28,(x,z,r)=>add(new G.OctahedronGeometry(.8+r*1.4),0xaee3ff,x,1+r,z,{ry:r*6,e:0x3a8fbf}))},
    volcano:()=>{cone(0,-27,24,12,0x2b2220);cone(0,-27,5,5,0xff5a1f,0xff4a10,19);ring(10,13,28,(x,z,r)=>rock(x,z,r,0x2f2826));ring(7,14,28,(x,z,r)=>pool(x,z,1.5+r*2.5,0xff6a20,0xff4a10,.07))},
    swamp:()=>{ring(30,13,29,(x,z,r)=>post(x,z,3+r*4,.18,0x3a2f24,{rz:(R()-.5)*.3}));ring(9,14,28,(x,z,r)=>pool(x,z,2+r*3,0x2f6b55,0,.07));ring(14,12,28,(x,z,r)=>{post(x,z,.6,.12,0xd9d0bd);add(new G.SphereGeometry(.5+r*.3,8,6),pick([0xc94a4a,0x8a5acb]),x,.7,z,{sy:.6})})},
    castle:()=>{for(let i=0;i<24;i++){const a=i/24*6.283;if(Math.abs(a-1.57)<.35)continue;box(Math.cos(a)*18,3,Math.sin(a)*18,6,6,1.5,0x77758a,-a+Math.PI/2)}
      [.785,2.36,3.93,5.5].forEach(a=>{const x=Math.cos(a)*18,z=Math.sin(a)*18;post(x,z,10,2.2,0x6c6a78);cone(x,z,4,2.8,0x3b4f7a,0,10)});box(0,6,-26,9,12,8,0x77758a);cone(0,-26,6,7,0x3b4f7a,0,12)}
  })[c.type]();
  const zone=new G.Mesh(new G.RingGeometry(ZONE-.4,ZONE,64),new G.MeshBasicMaterial({color:0xe9a23b,side:G.DoubleSide}));zone.rotation.x=-Math.PI/2;zone.position.y=.03;sc.add(zone);
  const grid=new G.GridHelper(24,24,0xe9a23b,0xffffff);grid.position.y=.04;grid.material.transparent=true;grid.material.opacity=.14;sc.add(grid);
  return sc;
}

function tex(it,u){
  const c=document.createElement("canvas");c.width=c.height=128;const x=c.getContext("2d"),t=new THREE.CanvasTexture(c);
  const draw=im=>{x.clearRect(0,0,128,128);x.save();x.beginPath();x.arc(64,52,46,0,7);x.fillStyle=u.color;x.fill();x.clip();
    if(im){const k=Math.max(92/im.width,92/im.height),w=im.width*k,h=im.height*k;x.drawImage(im,64-w/2,52-h/2,w,h)}
    else{x.fillStyle="#fff";x.font="52px sans-serif";x.textAlign="center";x.textBaseline="middle";x.fillText(u.icon,64,54)}
    x.restore();x.lineWidth=5;x.strokeStyle="#fff";x.beginPath();x.arc(64,52,46,0,7);x.stroke();
    x.fillStyle="rgba(0,0,0,.65)";x.fillRect(4,104,120,22);x.fillStyle="#fff";x.font="bold 15px sans-serif";x.textAlign="center";x.textBaseline="alphabetic";x.fillText(String(it.name||"").slice(0,16),64,120);t.needsUpdate=true};
  draw();const src=safeImg(it.image);if(src){const im=new Image();im.onload=()=>draw(im);im.src=src}return t;
}
const item=p=>getStore(p.k==="n"?"rpg_npcs":"rpg_characters",[]).find(x=>x.id===p.ref);
function mkTok(p){
  const it=item(p);if(!it)return;const u=UNIVERSES[it.universe]||UNIVERSES.dragonball,g=new THREE.Group();
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.9,1,.35,24),new THREE.MeshStandardMaterial({color:u.color}));base.position.y=.18;base.castShadow=true;
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,1.6,6),new THREE.MeshBasicMaterial({color:0xffffff}));pole.position.y=1;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex(it,u),depthWrite:false}));sp.scale.set(3.4,3.4,1);sp.position.y=3;
  g.add(base,pole,sp);g.position.set(p.x,0,p.z);g.userData.id=p.id;S.sc.add(g);S.toks.set(p.id,g);
}
const savePl=f=>setStore("rpg_placements",f(getStore("rpg_placements",[])));
function list(){
  const here=getStore("rpg_placements",[]).filter(p=>p.place===S.c.id);
  const rows=[["c",getStore("rpg_characters",[])],["n",getStore("rpg_npcs",[])]].flatMap(([k,a])=>a.map(it=>{
    const on=here.some(p=>p.ref===it.id&&p.k===k),u=UNIVERSES[it.universe]||UNIVERSES.dragonball;
    return `<button class="s3-row${on?" on":""}" data-k="${k}" data-id="${escapeHTML(it.id)}" style="--u:${u.color}"><span>${safeImg(it.image)?`<img class="thumb" src="${safeImg(it.image)}" alt="">`:u.icon}</span><b>${escapeHTML(it.name)}</b><small>${k==="n"?"NPC":"Personagem"} · ${on?"no local (clique para tirar)":"clique para colocar"}</small></button>`;
  }));
  $("#s3List").innerHTML=rows.join("")||'<div class="empty">Crie personagens ou NPCs para colocá-los aqui.</div>';
}
function toggle(k,ref){
  const ex=getStore("rpg_placements",[]).find(p=>p.place===S.c.id&&p.ref===ref&&p.k===k);
  if(ex){const g=S.toks.get(ex.id);if(g){S.sc.remove(g);S.toks.delete(ex.id)}savePl(a=>a.filter(p=>p.id!==ex.id))}
  else{const p={id:uid(),place:S.c.id,k,ref,x:Math.round((Math.random()-.5)*8),z:Math.round((Math.random()-.5)*8)};savePl(a=>[...a,p]);mkTok(p)}
  list();
}
function ndc(e){const r=S.r.domElement.getBoundingClientRect();return new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1)}
function hit(e){const ray=new THREE.Raycaster();ray.setFromCamera(ndc(e),S.cam);const h=ray.intersectObjects([...S.toks.values()],true)[0];if(!h)return null;let o=h.object;while(o&&!o.userData.id)o=o.parent;return o}
function ground(e){const ray=new THREE.Raycaster();ray.setFromCamera(ndc(e),S.cam);const v=new THREE.Vector3();return ray.ray.intersectPlane(PLANE,v)?v:null}
function size(){if(!S)return;const cv=S.r.domElement;S.r.setSize(cv.clientWidth,cv.clientHeight,false);S.cam.aspect=cv.clientWidth/Math.max(1,cv.clientHeight);S.cam.updateProjectionMatrix()}

async function open(c){
  try{await loadThree()}catch(e){return toast(e.message)}
  PLANE=PLANE||new THREE.Plane(new THREE.Vector3(0,1,0),0);
  if(S)close();
  modal.hidden=false;document.body.style.overflow="hidden";
  const old=$("#s3c"),cv=old.cloneNode();old.replaceWith(cv);
  let r;try{r=new THREE.WebGLRenderer({canvas:cv,antialias:true})}catch(e){modal.hidden=true;document.body.style.overflow="";return toast("Seu navegador não suporta WebGL.")}
  r.shadowMap.enabled=true;
  S={c,r,sc:null,cam:new THREE.PerspectiveCamera(50,1,.1,220),th:.5,ph:1.0,d:40,toks:new Map(),raf:0,drag:null,orbit:null};
  S.sc=build(c);
  $("#s3Name").textContent=c.name;$("#s3Type").textContent=BIOMES[c.type].label.toUpperCase();
  getStore("rpg_placements",[]).filter(p=>p.place===c.id).forEach(mkTok);
  list();size();
  cv.onpointerdown=e=>{cv.setPointerCapture(e.pointerId);const h=hit(e);if(h){S.drag=h;cv.style.cursor="grabbing"}else S.orbit={x:e.clientX,y:e.clientY}};
  cv.onpointermove=e=>{
    if(S.drag){const p=ground(e);if(p){const d=Math.hypot(p.x,p.z),k=d>ZONE-.5?(ZONE-.5)/d:1;S.drag.position.set(Math.round(p.x*k*2)/2,0,Math.round(p.z*k*2)/2)}}
    else if(S.orbit){S.th-=(e.clientX-S.orbit.x)*.008;S.ph=Math.max(.25,Math.min(1.45,S.ph-(e.clientY-S.orbit.y)*.006));S.orbit={x:e.clientX,y:e.clientY}}
    else cv.style.cursor=hit(e)?"grab":"default"};
  cv.onpointerup=()=>{if(S.drag){const id=S.drag.userData.id,{x,z}=S.drag.position;savePl(a=>a.map(p=>p.id===id?{...p,x,z}:p))}S.drag=null;S.orbit=null;cv.style.cursor="default"};
  cv.onwheel=e=>{e.preventDefault();S.d=Math.max(14,Math.min(62,S.d*(e.deltaY>0?1.08:.92)))};
  const loop=()=>{if(!S)return;S.raf=requestAnimationFrame(loop);
    S.cam.position.set(Math.sin(S.th)*Math.sin(S.ph)*S.d,Math.cos(S.ph)*S.d+1,Math.cos(S.th)*Math.sin(S.ph)*S.d);S.cam.lookAt(0,1,0);S.r.render(S.sc,S.cam)};
  loop();$("#s3Close").focus();
}
function close(){
  if(!S)return;cancelAnimationFrame(S.raf);S.sc.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{if(m.map)m.map.dispose();m.dispose()})}});S.r.dispose();S=null;
  modal.hidden=true;document.body.style.overflow="";renderAll();
}
$("#s3Close").onclick=close;
$("#s3List").onclick=e=>{const b=e.target.closest("button[data-k]");if(b&&S)toggle(b.dataset.k,b.dataset.id)};
modal.addEventListener("click",e=>{if(e.target===modal)close()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&S)close()});
window.addEventListener("resize",size);
window.openScene3D=open;
window.openSceneForCity=open;
window.openScene=window.openScene||open;
})();