/* RPG Nexus — dados globais compartilhados */
(function(){
  "use strict";
  const UNIVERSES = {
    dragonball:{id:"dragonball",name:"Dragon Ball",icon:"⚡",color:"#ff9f43",secondary:"#ffd166",sky:"#2b1d12",terrain:"#3a2b1b"},
    sololeveling:{id:"sololeveling",name:"Solo Leveling",icon:"◆",color:"#8d5cff",secondary:"#c9b3ff",sky:"#17102b",terrain:"#29203f"},
    demonslayer:{id:"demonslayer",name:"Demon Slayer",icon:"☯",color:"#4aa3a2",secondary:"#b5f2e8",sky:"#142d31",terrain:"#284b3e"},
    onepiece:{id:"onepiece",name:"One Piece",icon:"☠",color:"#39a9db",secondary:"#a8e6ff",sky:"#102a45",terrain:"#315a72"},
    jjk:{id:"jjk",name:"Jujutsu Kaisen",icon:"紫",color:"#a855f7",secondary:"#d8b4fe",sky:"#1b1230",terrain:"#312047"},
    undertale:{id:"undertale",name:"Undertale",icon:"♥",color:"#ef476f",secondary:"#ffb3c1",sky:"#25101a",terrain:"#3c202e"},
    naruto:{id:"naruto",name:"Naruto",icon:"🍃",color:"#f97316",secondary:"#fed7aa",sky:"#2b1a12",terrain:"#4a3223"},
    mha:{id:"mha",name:"Boku no Hero",icon:"✦",color:"#22c55e",secondary:"#bbf7d0",sky:"#102719",terrain:"#254b32"},
    berserk:{id:"berserk",name:"Berserk",icon:"⚔",color:"#94a3b8",secondary:"#e2e8f0",sky:"#10131a",terrain:"#282d38"}
  };
  const BIOMES = {
    city:{label:"Cidade",sky:0x8cb9d6,g:0x596c65}, village:{label:"Vila",sky:0x9ec8e1,g:0x63835a},
    forest:{label:"Floresta",sky:0x6a9a9e,g:0x31583d}, mountain:{label:"Montanhas",sky:0x9eb4c8,g:0x727b85},
    ruins:{label:"Ruínas",sky:0x77768c,g:0x5c5861}, port:{label:"Porto",sky:0x8fc4dc,g:0x477c83},
    desert:{label:"Deserto",sky:0xd8b77e,g:0xc6a45f}, snow:{label:"Neve",sky:0xb7d5e7,g:0xdce7ee},
    volcano:{label:"Vulcão",sky:0x5a3534,g:0x302522}, swamp:{label:"Pântano",sky:0x708779,g:0x3a5747},
    castle:{label:"Castelo",sky:0x85849c,g:0x555568}
  };
  const CITIES = [
    {id:"west-city",name:"West City",universe:"dragonball",type:"city",x:240,y:180},
    {id:"konoha",name:"Konoha",universe:"naruto",type:"village",x:560,y:290},
    {id:"musutafu",name:"Musutafu",universe:"mha",type:"city",x:840,y:170},
    {id:"water-7",name:"Water 7",universe:"onepiece",type:"port",x:1170,y:320},
    {id:"snowdin",name:"Snowdin",universe:"undertale",type:"snow",x:1460,y:180},
    {id:"seoul",name:"Seul",universe:"sololeveling",type:"city",x:430,y:650},
    {id:"midland",name:"Midland",universe:"berserk",type:"castle",x:820,y:620},
    {id:"shibuya",name:"Shibuya",universe:"jjk",type:"city",x:1200,y:650},
    {id:"butterfly-mansion",name:"Mansão Borboleta",universe:"demonslayer",type:"forest",x:1600,y:610},
    {id:"ruins",name:"Ruínas Antigas",universe:"undertale",type:"ruins",x:1850,y:360},
    {id:"volcano",name:"Cratera Carmesim",universe:"dragonball",type:"volcano",x:1900,y:740},
    {id:"desert",name:"Deserto de Vidro",universe:"sololeveling",type:"desert",x:250,y:850}
  ];
  window.UNIVERSES=UNIVERSES; window.BIOMES=BIOMES; window.CITIES=CITIES;
  window.getStore=function(key,fallback=[]){try{const raw=localStorage.getItem(key);return raw===null?fallback:JSON.parse(raw)}catch(e){console.warn("getStore",key,e);return fallback}};
  window.setStore=function(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch(e){console.warn("setStore",key,e);if(typeof window.toast==="function")window.toast("Armazenamento cheio ou indisponível.");return false}};
  window.uid=window.uid||(()=>`nx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`);
  window.escapeHTML=window.escapeHTML||((v)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])));
  window.safeImg=window.safeImg||((v)=>typeof v==="string"&&/^data:image\//i.test(v)?v:"");
  window.resizeImage=window.resizeImage||function(file,maxWidth=480,quality=.8){
    return new Promise((resolve,reject)=>{
      if(!file||!String(file.type||"").startsWith("image/")){reject(new Error("Selecione um arquivo de imagem válido."));return;}
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error("Não foi possível ler a imagem."));
      reader.onload=()=>{
        const image=new Image();
        image.onerror=()=>reject(new Error("O arquivo de imagem está inválido."));
        image.onload=()=>{
          const scale=Math.min(1,maxWidth/Math.max(image.width,image.height));
          const canvas=document.createElement("canvas");
          canvas.width=Math.max(1,Math.round(image.width*scale));
          canvas.height=Math.max(1,Math.round(image.height*scale));
          const ctx=canvas.getContext("2d");
          if(!ctx){reject(new Error("Não foi possível processar a imagem."));return;}
          ctx.drawImage(image,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL("image/jpeg",quality));
        };
        image.src=reader.result;
      };
      reader.readAsDataURL(file);
    });
  };
  window.loadThreeShared = function(){
    if(window.THREE) return Promise.resolve(window.THREE);
    if(window.__NEXUS_THREE_PROMISE__) return window.__NEXUS_THREE_PROMISE__;
    window.__NEXUS_THREE_PROMISE__ = new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js";
      script.onload=()=>resolve(window.THREE);
      script.onerror=()=>{window.__NEXUS_THREE_PROMISE__=null;reject(new Error("Não foi possível carregar o motor 3D. Verifique sua conexão."));};
      document.head.appendChild(script);
    });
    return window.__NEXUS_THREE_PROMISE__;
  };
  window.saveActivity=window.saveActivity||((message)=>{const logs=window.getStore("rpg_logs",[]);logs.unshift({text:String(message),time:new Date().toLocaleString("pt-BR")});window.setStore("rpg_logs",logs.slice(0,60));if(typeof window.renderActivity==="function")window.renderActivity()});
})();
