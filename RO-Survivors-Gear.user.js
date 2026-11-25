// ==UserScript==
// @name RO 練等助手 Gear 網頁控制特別版
// @namespace ro-survivors-helper
// @version 99.0
// @description 共用電腦網頁控制特別版核心；Gear 資料與網路連線轉接。
// @updateURL https://raw.githubusercontent.com/UnderPikaSui/ro-survivors-gear/main/RO-Survivors-Gear.user.js
// @downloadURL https://raw.githubusercontent.com/UnderPikaSui/ro-survivors-gear/main/RO-Survivors-Gear.user.js
// @match https://ro-survivors.com/*
// @match https://www.ro-survivors.com/*
// @match https://ro.hans-webgametw.com/*
// @run-at document-start
// @unwrap
// @noframes
// ==/UserScript==

(() => {
  if (window.top !== window) return;
  const storage = window.localStorage;
  const storagePrototype = Storage.prototype;
  const get = storagePrototype.getItem;
  const set = storagePrototype.setItem;
  const blockAutoLogin = get.call(storage,"ro-helper-game-autologin") === "off";
  const account = "ro-survivors-session";
  const guest = "ro-survivors-guest-session";
  const international = location.hostname !== "ro.hans-webgametw.com";
  if (!international) {
    const readAccount = (key, kind) => {
      try {
        const session = JSON.parse(get.call(storage,key));
        return Number.isSafeInteger(session?.id) ? kind + "." + session.id : null;
      } catch { return null; }
    };
    const identify = allowAccount => (allowAccount && readAccount(account,"account")) ||
      readAccount(guest,"guest") || "local";
    // Lock to the session this game tab starts with. Other tabs share localStorage.
    let scope = identify(!blockAutoLogin);
    window.addEventListener("ro-account", () => { scope = identify(true); }, true);
    document.addEventListener("ro-helper-read-account", () => {
      document.documentElement.dataset.roHelperAccountScope = scope;
    });
  }
  if (!blockAutoLogin) return;
  let blocked = true;
  function read(key) {
    if (this === storage && blocked && (key === account || (international && key === guest))) return null;
    return get.call(this,key);
  }
  function write(key,value) {
    const result = set.call(this,key,value);
    if (this === storage && (key === account || (international && key === guest))) {
      blocked = false;
      if (storagePrototype.getItem === read) storagePrototype.getItem = get;
      if (storagePrototype.setItem === write) storagePrototype.setItem = set;
    }
    return result;
  }
  storagePrototype.getItem = read;
  storagePrototype.setItem = write;
})();

(() => {
  if (window.top !== window || window.__roHelperLobbyBridge) return;
  window.__roHelperLobbyBridge = true;
  // Use the game's own lazy icon/item texture loader on desktop as well as mobile.
  function enableNativeLazyTextures() {
    if(location.hostname!=="ro.hans-webgametw.com" || localStorage.getItem("ro-helper-memory-saver")==="off")return;
    const enable=value=>{if(value && typeof value==="object" && typeof value.load==="function" && typeof value.wrap==="function")value.on=true;};
    const descriptor=Object.getOwnPropertyDescriptor(window,"RO_LZ");
    if(descriptor){try{enable(window.RO_LZ);}catch{}return;}
    Object.defineProperty(window,"RO_LZ",{configurable:true,enumerable:true,set(value){
      enable(value);
      Object.defineProperty(window,"RO_LZ",{value,writable:true,configurable:true,enumerable:true});
    }});
  }
  enableNativeLazyTextures();
function createRaidMechanismObserver(now=()=>Date.now()) {
  let owner=null;
  const state={rid:null,me:0,aid:0,job:"",zone:0,zi:null,skew:0,targets:new Map(),players:new Map(),trait:{set:[]},safe:null,mark:null,shield:0,down:false,ended:false,seen:0};
  const cleanTarget=t=>({id:String(t.id||""),kind:t.kind,mob:t.mob,name:t.name,at:Array.isArray(t.at)?t.at.slice(0,2):null,alive:!!t.alive,hp:t.hp,mhp:t.mhp,owner:t.owner,traits:(t.traits||[]).slice(0,12),hatch:!!t.hatch,spawn:!!t.spawn});
  const cleanTrait=t=>({set:(Array.isArray(t?.set)?t.set:[]).slice(0,16).map(x=>({on:x.on,mult:x.mult})),until:t?.until,form:t?.form,win:t?.win});
  const cleanZone=z=>z?{z:z.z,boss:!!z.boss,need:z.need,kills:z.kills,...Object.fromEntries(['objs','elites','mids'].filter(k=>Array.isArray(z[k])).map(k=>[k,z[k].slice(0,128).filter(row=>Array.isArray(row)&&row.length>=2).map(row=>[String(row[0]),!!row[1]])])),hold:z.hold?{at:Array.isArray(z.hold.at?.[0])?z.hold.at.slice(0,8).map(a=>a.slice(0,2)):z.hold.at?.slice(0,2),r:z.hold.r,secs:z.hold.secs,acc:z.hold.acc,accs:z.hold.accs?.slice(0,8),in:z.hold.in,need:z.hold.need,each:!!z.hold.each}:null}:null;
  const targets=rows=>{for(const t of (rows||[]).slice(0,128)){if(!t?.id)continue;if(state.targets.size>=128&&!state.targets.has(String(t.id)))continue;state.targets.set(String(t.id),{...state.targets.get(String(t.id)),...cleanTarget(t)});}};
  const players=rows=>{for(const a of (rows||[]).slice(0,64)){if(!Array.isArray(a)||!Number.isFinite(a[0])||![a[1],a[2]].every(Number.isFinite))continue;if(state.players.size>=64&&!state.players.has(a[0]))continue;state.players.set(a[0],{slot:a[0],x:a[1],y:a[2],flags:0});}};
  function message(s,socket){
    if(!s||typeof s.k!=="string"||!s.k.startsWith("rd.")||s.k.startsWith("rd.g."))return;
    if(s.k==="rd.seat"||(s.k==="rd.back"&&s.rid&&s.char)){
      owner=null;state.rid=s.rid;state.runId=s.sid||null;state.result=null;state.me=0;state.aid=s.char?.aid||0;state.job=s.char?.promotion||s.char?.job||"";state.zone=0;state.zi=null;state.next=null;state.targets.clear();state.players.clear();state.trait={set:[]};state.safe=null;state.mark=null;state.shield=0;state.down=false;state.ended=false;state.seen=now();return;
    }
    if(s.k==="rd.start"){
      owner=socket;state.me=s.me;state.skew=Number.isFinite(s.now)?s.now-now():0;state.zone=s.zone||0;state.zi=cleanZone(s.zoneInfo);state.next=null;state.targets.clear();state.players.clear();targets(s.targets);players(s.players);state.trait=cleanTrait(s.trait);state.down=!!s.down;state.ended=s.state==='result';state.safe=null;state.mark=null;state.shield=0;
    }else if(socket!==owner)return;
    else if(s.k==="rd.zone"){state.zone=s.z;state.zi=cleanZone(s);}
    else if(s.k==="rd.tgt")targets(s.add);
    else if(s.k==="rd.dead"){const t=state.targets.get(String(s.id));if(t)t.alive=false;}
    else if(s.k==="rd.hp"){
      for(const a of (s.h||[]).slice(0,128)){const t=state.targets.get(String(a[0]));if(t){t.hp=a[1];t.mhp=a[2];t.alive=!!a[3];}}
      if(Number.isFinite(s.sh))state.shield=s.sh>0?now()+state.skew+s.sh:0;
    }else if(s.k==="rd.trait")state.trait=cleanTrait(s);
    else if(s.k==="rd.boss"){targets(s.targets);if(s.trait)state.trait=cleanTrait(s.trait);}
    else if(s.k==="rd.join")players([s.p]);
    else if(s.k==="rd.leave")state.players.delete(s.s);
    else if(s.k==="rd.door"){
      state.zone=s.zone??state.zone;state.zi=null;
      state.next=s.next?{at:s.next.slice(0,2),zone:s.zone}:null;
    }else if(s.k==="rd.mech"){
      if(s.m==='shield'&&Number.isFinite(s.until))state.shield=s.until;
      if((s.m==='bell'||s.m==='curse')&&Number.isFinite(s.at)&&Number.isFinite(s.seed))state.safe={kind:s.m,until:s.at,seed:s.seed,n:Math.min(12,Math.max(1,s.n||3)),r:Math.min(1000,Math.max(20,s.r||150))};
      if(s.m==='mark'&&Number.isFinite(s.at))state.mark={until:s.at,who:(s.who||[]).slice(0,64),r:Math.min(1500,Math.max(20,s.r||200))};
    }else if(s.k==="rd.down")state.down=true;
    else if(s.k==="rd.revive")state.down=false;
    else if(s.k==="rd.end"||s.k==="rd.out"){state.ended=true;state.result={kind:s.k==="rd.end"?(s.why==="kill"?"success":"failure"):"interrupted",runId:state.runId||null};state.safe=null;state.mark=null;state.targets.clear();state.players.clear();owner=null;}
    state.seen=now();
  }
  function binary(data,socket){
    if(socket!==owner||state.ended)return;
    try{const v=new DataView(data);if(v.byteLength<8||v.getUint8(0)!==0x52)return;const n=Math.min(64,v.getUint16(4,true));for(let i=0,o=8;i<n&&o+8<=v.byteLength;i++,o+=8){const slot=v.getUint16(o,true),p=state.players.get(slot);if(p){p.x=v.getInt16(o+2,true);p.y=v.getInt16(o+4,true);p.flags=v.getUint8(o+7);}}}catch{}
  }
  return {message,binary,state};
}
function raidZoneLayout(game,definition) {
  const walk=game.walk;if(!walk?.mask||!walk.w||!walk.h)return null;
  const W=walk.w,H=walk.h,mask=walk.mask.slice(),labels=new Int8Array(W*H).fill(-1),cells=definition.zones.map(()=>[]);
  for(const z of definition.zones)for(const [x0,y0,x1,y1] of z.door?.cells||[])for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(x>=0&&y>=0&&x<W&&y<H)mask[y*W+x]=0;
  definition.zones.forEach((z,k)=>{const lab=z.reuse??k,q=[];for(const [sx,sy] of z.seeds||[]){const i=sy*W+sx;if(sx>=0&&sy>=0&&sx<W&&sy<H&&mask[i]&&labels[i]<0){labels[i]=lab;q.push(i);}}while(q.length){const i=q.pop(),x=i%W,y=(i/W)|0;cells[lab].push(i);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy,j=ny*W+nx;if(nx>=0&&ny>=0&&nx<W&&ny<H&&labels[j]<0&&mask[j]){labels[j]=lab;q.push(j);}}}});
  return {w:W,h:H,labels,cells};
}
function raidSafeSpots(definition,layout,seed,n,r) {
  if(!layout)return [];
  let a=seed||1;const rng=()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
  const px=c=>(c+.5)*32,bz=definition.zones.findIndex(z=>z.boss),lab=definition.zones[bz]?.reuse??bz,cx=px(definition.boss.at[0]),cy=px(definition.boss.at[1]),out=[];
  const cells=(layout.cells[lab]||[]).filter(i=>{const d=Math.hypot(px(i%layout.w)-cx,px((i/layout.w)|0)-cy);return d>150&&d<750;});
  for(let k=0;k<300&&out.length<n&&cells.length;k++){const c=cells[Math.floor(rng()*cells.length)],x=px(c%layout.w),y=px((c/layout.w)|0);if(out.every(q=>Math.hypot(q.x-x,q.y-y)>r*2.4)||k>200)out.push({x,y});}
  while(out.length<n){const a=out.length/n*6.283;out.push({x:cx+Math.cos(a)*420,y:cy+Math.sin(a)*300});}return out;
}
function raidLane(job){
  if(/^(mage|wizard|sage|warlock|sorcerer|acolyte|priest|arch_bishop|soul_linker|soul_reaper)$/.test(job))return 'magic';
  if(/^(archer|hunter|bard|dancer|ranger|minstrel|wanderer|gunslinger|rebellion)$/.test(job))return 'ranged';
  if(/^(swordsman|knight|crusader|rune_knight|royal_guard|thief|assassin|rogue|guillotine_cross|shadow_chaser|merchant|blacksmith|alchemist|mechanic|genetic|taekwon|star_gladiator|star_emperor|monk|sura)$/.test(job))return 'melee';return 'unknown';
}
function raidTraitMultiplier(traits,lane){
  if(lane==='unknown')return 1;let m=1;
  for(const t of traits||[]){if(t.on==='all'||t.on==='lane:'+lane||t.on===lane||t.on===(lane==='magic'?'magic':'physical'))m*=Number.isFinite(t.mult)?t.mult:1;}return m;
}
function planRaidObjective(s,definition,player,targets,now,spots) {
  const distance=p=>Math.hypot(p.x-player.x,p.y-player.y),point=a=>({x:(a[0]+.5)*32,y:(a[1]+.5)*32});
  const players=[...s.players.values()].filter(p=>!(p.flags&1)&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.slot!==s.me);
  const mark=s.mark&&s.mark.until>now?s.mark:null,marked=!!mark?.who.includes(s.me);
  if(s.down||s.ended)return {kind:'wait',label:s.down?'副本｜倒地等待復活':'副本｜等待結算',target:null,stay:true};
  if(s.safe&&s.safe.until>now&&spots.length){const danger=q=>(marked?players:players.filter(p=>mark?.who.includes(p.slot))).reduce((v,p)=>Math.min(v,Math.hypot(q.x-p.x,q.y-p.y)),Infinity);
    const q=[...spots].sort((a,b)=>(Number(danger(a)<(mark?.r||0)+32)-Number(danger(b)<(mark?.r||0)+32))||distance(a)-distance(b))[0];return {kind:s.safe.kind,label:s.safe.kind==='bell'?'副本｜冥界之鐘：進安全圈':'副本｜世界樹詛咒：進生命之光',target:q,radius:Math.max(10,s.safe.r-32),stay:distance(q)<=s.safe.r-32,marked,players,mark};}
  if(marked){
    const angles=Array.from({length:16},(_,i)=>i*Math.PI/8),candidates=angles.map(a=>({x:player.x+Math.cos(a)*Math.max(220,mark.r+80),y:player.y+Math.sin(a)*Math.max(220,mark.r+80)}));
    const clearance=q=>players.reduce((v,p)=>Math.min(v,Math.hypot(q.x-p.x,q.y-p.y)),Infinity);
    const target=candidates.reduce((best,q)=>clearance(q)>clearance(best)?q:best,candidates[0]);
    return {kind:'mark',label:'副本｜死神標記：遠離隊友',target,marked,players,mark,stay:clearance(player)>mark.r+40};
  }
  const zi=s.zi,zone=definition.zones[s.zone],hold=zi?.hold;
  if(hold&&!zi.boss&&zi.z===s.zone){
    const each=!!hold.each,complete=each?(hold.accs||[]).map(a=>a>=hold.secs):[hold.acc>=hold.secs];
    const raw=hold.at||zone?.hold?.at,ats=Array.isArray(raw?.[0])?raw:raw?[raw]:[];
    const points=ats.map((a,i)=>({...point(a),index:i})),unfinished=points.filter(q=>!complete[each?q.index:0]);
    if(unfinished.length){
      const ids=[s.me,...players.map(p=>p.slot)].sort((a,b)=>a-b),rank=Math.max(0,ids.indexOf(s.me));
      const r=Math.max(32,(hold.r||zone?.hold?.r||4)*32-32);
      let q=unfinished[0];
      if(each){
        // A completed seal must remain occupied when fewer unfinished seals remain
        // than the native simultaneous-occupancy requirement.
        const need=Math.min(points.length,Math.max(1,Math.trunc(hold.need)||2)),active=unfinished.slice();
        for(const p of points)if(active.length<need&&complete[p.index])active.push(p);
        const people=[{slot:s.me,x:player.x,y:player.y},...players];
        const owners=active.map(p=>people.filter(v=>Math.hypot(v.x-p.x,v.y-p.y)<=r).sort((a,b)=>a.slot-b.slot)[0]?.slot);
        const mine=owners.indexOf(s.me),claimed=new Set(owners.filter(v=>v!==undefined));
        if(mine>=0)q=active[mine];
        else{const empty=active.filter((p,i)=>owners[i]===undefined),free=ids.filter(id=>!claimed.has(id)),i=Math.max(0,free.indexOf(s.me));q=empty.length?empty[i%empty.length]:active[rank%active.length];}
      }
      return {kind:'hold',label:each?'副本｜分守封印，保留已完成站點維持同時有人':'副本｜站在據點內守點',target:q,radius:r,stay:distance(q)<=r,marked,players,mark};
    }
  }
  const alive=targets.filter(t=>t.alive);
  const available=alive;
  const priority=t=>t.kind==='src'?0:t.kind==='obj'?1:t.kind==='elite'||t.kind==='mid'?2:t.kind==='boss'?4:3;
  const taskOrder=new Map([...(zi?.objs||[]),...(zi?.elites||[]),...(zi?.mids||[])].map((row,i)=>[String(row[0]),i]));
  const sorted=available.sort((a,b)=>priority(a)-priority(b)||(s.rid==='r4'?((taskOrder.get(String(a.id))??9999)-(taskOrder.get(String(b.id))??9999)):0)||distance(a)-distance(b));
  const objectIds=Array.isArray(zi?.objs)?new Set(zi.objs.filter(row=>row[1]).map(row=>String(row[0]))):null;
  const specialIds=new Set([...(zi?.elites||[]),...(zi?.mids||[])].filter(row=>row[1]).map(row=>String(row[0])));
  const objective=sorted.find(t=>t.kind==='obj'&&(!objectIds||objectIds.has(String(t.id)))||(t.kind==='elite'||t.kind==='mid')&&specialIds.has(String(t.id)));
  if(objective)return {kind:objective.kind,label:'副本｜優先完成指定任務目標',target:objective,radius:130,stay:distance(objective)<=130,marked,players,mark};
  if(s.next?.at)return {kind:'next',label:'副本｜通過已開啟的門前往下一區',target:point(s.next.at),stay:false,marked,players,mark};
  if(zi&&!zi.boss&&zi.need>0&&zi.kills<zi.need)return {kind:'kills',label:'副本｜小怪任務：前往傳送點等待',target:null,stay:true,marked,players,mark};
  const source=sorted.find(t=>t.kind==='src');
  if(source)return {kind:'source',label:'副本｜優先處理補血源',target:source,radius:130,stay:distance(source)<=130,marked,players,mark};
  const boss=alive.find(t=>t.kind==='boss'),blocked=boss&&s.shield>now;
  const bossPhase=!!zi?.boss||!!definition.zones[s.zone]?.boss;
  const chosen=bossPhase&&boss&&!blocked?boss:sorted.find(t=>!(t.kind==='boss'&&blocked)&&!(t.kind==='obj'&&objectIds&&!objectIds.has(String(t.id))));
  if(chosen)return {kind:chosen.kind,label:chosen.kind==='obj'?'副本｜優先拆物件／蛋／蠅巢':chosen.kind==='boss'?'副本｜攻擊首領並躲招':'副本｜清除分區精英／中王',target:chosen,radius:130,stay:distance(chosen)<=130,marked,players,mark};
  if(blocked){const d=distance(boss),dx=(player.x-boss.x)/(d||1),dy=(player.y-boss.y)/(d||1);return {kind:'shield',label:'副本｜護盾期間退開躲招',target:{x:boss.x+(d?dx:1)*650,y:boss.y+(d?dy:0)*650},stay:d>=600,marked,players,mark};}
  return {kind:'wait',label:'副本｜等待分區目標與隊友',target:null,stay:true,marked,players,mark};
}

function raidKillWaitPoint(game,definition,state,layout){
  const walk=game.walk,player=game.player,zone=definition.zones[state.zone];
  if(!walk?.pathTo||!player||!layout||!zone?.next)return null;
  const {w,h,labels}=layout,label=zone.reuse??state.zone,nextLabel=definition.zones[state.zone+1]?.reuse??state.zone+1;
  const room=a=>Array.isArray(a)&&a[0]>=0&&a[1]>=0&&a[0]<w&&a[1]<h?labels[Math.floor(a[1])*w+Math.floor(a[0])]:-1;
  const portals=(walk.warpFrom||[]).filter((from,i)=>room(from)===label&&room(walk.warpTo?.[i])===nextLabel);
  if(!portals.length)for(const [x0,y0,x1,y1] of zone.door?.cells||[])portals.push([(x0+x1)/2,(y0+y1)/2]);
  const candidates=[];
  for(const portal of portals){const px=(portal[0]+.5)*32,py=(portal[1]+.5)*32;
    for(let i=0;i<16;i++){const a=i*Math.PI/8,x=px+Math.cos(a)*128,y=py+Math.sin(a)*128;
      if(room([Math.floor(x/32),Math.floor(y/32)])!==label||walk.warpAt&&walk.warpCells?.[Math.floor(y/32)*w+Math.floor(x/32)])continue;
      const path=walk.pathTo(player.x,player.y,x,y),end=path?.at(-1);
      if(end&&Math.hypot(end.x-x,end.y-y)<=48)candidates.push({x,y});
    }
  }
  return candidates.sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0]||null;
}

function raidFixedCorridorPath(game,definition,state,target,kind,cache,pathTo){
  const fixed=definition.fixedNodes,player=game.player;
  if(state.rid!=='r4'||!fixed||['bell','curse','mark','shield'].includes(kind))return {path:pathTo(target),fixed:false};
  if(['hold','obj','elite','mid','source','src'].includes(kind)){
    cache.fixedDetour=true;
    return {path:pathTo(target),fixed:false};
  }
  let name;
  if(kind==='next'){const z=state.next?.zone??state.zone;name=z===1?'cross0':z===2?'cross1':z===3?'portal2':null;
    if(name==='portal2'&&Math.hypot(player.x-target.x,player.y-target.y)<130)return {path:pathTo(target),fixed:false};
  }else name=state.zone===0?'wait0':state.zone===1?'wait1':state.zone===2?'altar2':state.zone===3?'boss3':null;
  let raw=fixed[name];if(!raw?.length)return {path:pathTo(target),fixed:false};
  // Follow the supplied painted right-hand corridor. A closed native gate clips the
  // route at the last open cell before the door, preserving the same corridor.
  if(game.walk?.mask&&game.walk.w){
    const {mask,w,h}=game.walk,open=([x,y])=>x>=0&&y>=0&&x<w&&y<h&&!!mask[y*w+x];
    const available=[];let stopped=false;
    for(let i=0;i<raw.length&&!stopped;i++){
      const b=raw[i],a=raw[Math.max(0,i-1)],n=Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]));let last=a;
      for(let k=0;k<=n;k++){
        const q=[Math.round(a[0]+(b[0]-a[0])*k/(n||1)),Math.round(a[1]+(b[1]-a[1])*k/(n||1))];
        if(!open(q)){if(open(last)&&(!available.length||available.at(-1)[0]!==last[0]||available.at(-1)[1]!==last[1]))available.push(last);stopped=true;break;}last=q;
      }
      if(!stopped)available.push(b);
    }
    raw=available;if(!raw.length)return {path:null,fixed:true};
  }
  const key=name+':'+raw.length+':'+raw.at(-1).join(',');
  cache.fixedNodeRuns??=new Map();let run=cache.fixedNodeRuns.get(key);
  const points=raw.map(([x,y])=>({x:(x+.5)*32,y:(y+.5)*32}));
  if(cache.fixedDetour){
    // Rejoin a reachable projection on the corridor, not spawn or every old node.
    let best=null;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,n=dx*dx+dy*dy;
      const t=n?Math.max(0,Math.min(1,((player.x-a.x)*dx+(player.y-a.y)*dy)/n)):0;
      const q={x:a.x+dx*t,y:a.y+dy*t};
      const direct=!game.walk?.lineClear||game.walk.lineClear(player.x,player.y,q.x,q.y),join=direct?[q]:pathTo(q),last=join?.at(-1);
      if(!last||Math.hypot(last.x-q.x,last.y-q.y)>48)continue;
      let cost=0,from=player;for(const v of join){cost+=Math.hypot(v.x-from.x,v.y-from.y);from=v;}
      if(!best||cost<best.cost-1||Math.abs(cost-best.cost)<=1&&i>best.index)best={q,index:i,cost,join};
    }
    if(!best)return {path:null,fixed:false};
    if(Math.hypot(player.x-best.q.x,player.y-best.q.y)>20)return {path:best.join,fixed:false};
    run={points,index:best.index};cache.fixedNodeRuns.set(key,run);cache.fixedDetour=false;
  }
  if(!run){
    let index=0;const previous=cache.fixedNodeRuns.get(cache.lastFixedNodeKey);
    let common=0;if(previous)while(common<Math.min(previous.points.length,points.length)&&previous.points[common].x===points[common].x&&previous.points[common].y===points[common].y)common++;
    if(previous&&common)index=Math.min(previous.index,common-1);
    else{
      const candidates=points.map((p,i)=>({p,i,d:Math.hypot(p.x-player.x,p.y-player.y)})).sort((a,b)=>a.d-b.d).slice(0,32);let best=null;
      for(const {p,i} of candidates){
        const direct=!game.walk?.lineClear||game.walk.lineClear(player.x,player.y,p.x,p.y),join=direct?[p]:pathTo(p),last=join?.at(-1);
        if(!last||Math.hypot(last.x-p.x,last.y-p.y)>48)continue;
        let cost=0,from=player;for(const q of join){cost+=Math.hypot(q.x-from.x,q.y-from.y);from=q;}
        if(!best||cost<best.cost-1||Math.abs(cost-best.cost)<=1&&i>best.i)best={i,cost};if(best.cost<=24)break;
      }
      if(!best)return {path:null,fixed:true};index=best.i;
    }
    run={points,index};if(cache.fixedNodeRuns.size>=24)cache.fixedNodeRuns.delete(cache.fixedNodeRuns.keys().next().value);cache.fixedNodeRuns.set(key,run);
  }
  cache.lastFixedNodeKey=key;
  const near=p=>Math.hypot(player.x-p.x,player.y-p.y);
  while(run.index<run.points.length-1){
    const p=run.points[run.index],before=run.points[run.index-1],after=run.points[run.index+1];
    let passed=false;
    if(before){const dx=p.x-before.x,dy=p.y-before.y,len=Math.hypot(dx,dy),turn=dx*(after.y-p.y)-dy*(after.x-p.x);
      if(len&&Math.abs(turn)<1)passed=((player.x-before.x)*dx+(player.y-before.y)*dy)/(len*len)>=1&&Math.abs((player.x-before.x)*dy-(player.y-before.y)*dx)/len<=20;
    }
    if(near(p)>20&&!passed)break;run.index++;
  }
  let aim=run.index;
  const visible=p=>!game.walk?.lineClear||game.walk.lineClear(player.x,player.y,p.x,p.y);
  while(aim+1<run.points.length){
    const p=run.points[aim],from=run.points[Math.max(0,aim-1)],next=run.points[aim+1];
    if(near(next)>192||!visible(next))break;
    if(Math.abs((p.x-from.x)*(next.y-p.y)-(p.y-from.y)*(next.x-p.x))>1)break;
    aim++;
  }
  const next=run.points[aim],distance=near(next);
  if(kind==='boss'&&run.index===run.points.length-1&&distance<130&&Math.hypot(target.x-next.x,target.y-next.y)>130)return {path:pathTo(target),fixed:false};
  const path=visible(next)?[{...next}]:pathTo(run.points[run.index]);
  return {path,fixed:true,nodeIndex:run.index+1,nodeCount:run.points.length,continuous:distance>64,segment:visible(next)&&run.index>0?[run.points[run.index-1].x,run.points[run.index-1].y,next.x,next.y]:null};
}

function installRaidMechanics(book) {
  if(location.hostname!=="ro.hans-webgametw.com"||window.__roHelperRaidMechanics)return;
  const observer=createRaidMechanismObserver(),telegraphs=new WeakMap(),games=new WeakMap();
  const NativeSocket=window.WebSocket;
  if(typeof NativeSocket==='function'){
    window.WebSocket=new Proxy(NativeSocket,{construct(target,args,newTarget){
      const socket=Reflect.construct(target,args,newTarget);
      socket.addEventListener('message',event=>{
        try{if(typeof event.data==='string'){if(event.data.length>1048576||! /"k"\s*:\s*"rd\.(?!g\.)/.test(event.data))return;const data=JSON.parse(event.data);observer.message(data,socket);}else observer.binary(event.data,socket);}catch{}
      });
      return socket;
    }});
  }
  const wrap=fn=>{
    if(typeof fn!=='function')return fn;
    return function(game,actor,shape,ms,onHit){
      const value=Reflect.apply(fn,this,arguments);
      try {
      if(!window.RO_RAID?.inRaid?.()||!game||!shape||!Number.isFinite(game.time)||!Number.isFinite(ms))return value;
      if(!['circle','ring','cone','line'].includes(shape.kind)||![shape.x,shape.y].every(Number.isFinite))return value;
      let list=telegraphs.get(game);if(!list){list=[];telegraphs.set(game,list);}
      if(list.length>=256)list.splice(0,list.length-255);
      const neutral=/^(?:\(\)\s*=>\s*\{\s*\}|function\s*\(\)\s*\{\s*\})$/.test(Function.prototype.toString.call(onHit||(()=>{})).trim());
      const norm=shape.kind==='line'?['rect',shape.x+Math.cos(shape.ang)*shape.len*.5,shape.y+Math.sin(shape.ang)*shape.len*.5,shape.len,shape.w,shape.ang,0]:[shape.kind,shape.x,shape.y,shape.r*2,shape.r*2,shape.ang||0,shape.kind==='cone'?shape.half:shape.kind==='ring'?shape.r0/shape.r:0];
      if(norm.slice(1).every(Number.isFinite))list.push({shape:norm,neutral,until:game.time*1000+Math.max(0,Math.min(ms,60000))+280,actor});
      } catch {}
      return value;
    };
  };
  const descriptor=Object.getOwnPropertyDescriptor(window,'RO_WBTT');
  if(!descriptor || descriptor.configurable){
    let current=wrap(window.RO_WBTT);
    Object.defineProperty(window,'RO_WBTT',{configurable:true,enumerable:descriptor?.enumerable??true,get:()=>current,set:value=>{current=wrap(value);}});
  }
  window.__roHelperRaidOutcome=()=>observer.state.result||{kind:"unknown",runId:observer.state.runId||null};
  window.__roHelperRaidMechanics=game=>{
    try{
      if(!game?.player||!window.RO_RAID?.inRaid?.()||document.documentElement.dataset.roHelperRaidMechanics!=='on')return null;
      const s=observer.state,rid=s.rid||/^raid_(r[1-8])$/.exec(game.stageId||'')?.[1],definition=book[rid];
      if(!definition)return {enabled:true,ready:false,label:'副本｜無法辨識副本機制，等待資料'};
      let cache=games.get(game);if(!cache||cache.rid!==rid||cache.walk!==game.walk||cache.mask!==game.walk?.mask){cache={rid,walk:game.walk,mask:game.walk?.mask,layout:raidZoneLayout(game,definition),at:0,safeKey:'',spots:[],pathAt:0,pathKey:'',path:null};games.set(game,cache);}
      if(!cache.layout&&game.walk?.mask)cache.layout=raidZoneLayout(game,definition);
      const now=Date.now(),serverNow=now+s.skew;
      if(cache.at&&now-cache.at<50)return cache.result;
      const list=telegraphs.get(game)||[];
      for(let i=list.length-1;i>=0;i--)if(list[i].until<game.time*1000||list[i].actor?.dead||list[i].actor?.removed)list.splice(i,1);
      const result={enabled:true,ready:!!s.me&&!!s.zi||!!s.next,at:now,rid,label:'副本｜等待機制狀態',hazards:list.filter(t=>!t.neutral).map(t=>t.shape),neutral:list.filter(t=>t.neutral).map(t=>t.shape),waypoint:null,stay:true};
      cache.at=now;cache.result=result;
      const repath=document.documentElement.dataset.roHelperRaidRepath||'';
      if(cache.repath!==repath){cache.repath=repath;cache.path=null;cache.pathAt=0;cache.reachable?.clear();cache.killWaitKey=null;}
      if(!s.me||!s.seen||now-s.seen>20000){result.ready=false;result.label='副本｜機制資料中斷，等待連線恢復';return result;}
      const player={x:game.player.x,y:game.player.y};
      // A door event can be followed by updated zone tasks before the player crosses.
      // Retain the transition until the native walk map confirms arrival in the new room.
      if(s.next&&s.zi?.z===s.next.zone&&cache.layout){
        const {w,h,labels}=cache.layout,cx=Math.floor(player.x/32),cy=Math.floor(player.y/32);
        const label=definition.zones[s.zone]?.reuse??s.zone;
        if(cx>=0&&cy>=0&&cx<w&&cy<h&&labels[cy*w+cx]===label)s.next=null;
      }
      const pathTo=(target,from=player)=>{
        if(!target||![target.x,target.y].every(Number.isFinite)||!game.walk?.pathTo)return null;
        const tolerance=target.kind==='obj'||target.kind==='src'?130:80;
        const end=game.walk.nearestWalkable?.(target.x,target.y)||[target.x,target.y];
        if(Math.hypot(end[0]-target.x,end[1]-target.y)>tolerance)return null;
        const direct=game.walk.pathTo(from.x,from.y,...end);
        if(direct?.length&&Math.hypot(direct.at(-1).x-target.x,direct.at(-1).y-target.y)<=tolerance)return direct.slice();
        // The native raid maps use open warp doors between disconnected rooms.
        // Follow only the first physical leg; recompute after the actual teleport.
        const legs=game.walk.route?.(from.x,from.y,...end),last=legs?.at(-1)?.at(-1);
        if(!last||Math.hypot(last.x-target.x,last.y-target.y)>tolerance||!legs[0]?.length)return null;
        return legs[0].slice();
      };
      const entityById=new Map((game.enemies||[]).filter(e=>!e.dead&&!e.removed&&!(e.hiddenUntil>game.time)&&e.roT).map(e=>[String(e.roT),e]));
      cache.reachable ??= new Map();
      const reachable=t=>{const key=t.id+':'+Math.floor(t.x/32)+','+Math.floor(t.y/32)+':'+Math.floor(player.x/96)+','+Math.floor(player.y/96),old=cache.reachable.get(key);if(old&&now-old.at<800)return old.ok;
        const ok=!!pathTo(t);if(cache.reachable.size>=48)cache.reachable.delete(cache.reachable.keys().next().value);cache.reachable.set(key,{at:now,ok});return ok;};
      const targetInZone=t=>{
        if(t.kind==='boss'&&(s.zi?.boss||definition.zones[s.zone]?.boss))return true;
        if(!s.zi||!cache.layout)return true;
        const entity=entityById.get(t.id),cx=Math.floor((entity?.x??(t.at[0]+.5)*32)/32),cy=Math.floor((entity?.y??(t.at[1]+.5)*32)/32),{w,h,labels}=cache.layout,lab=definition.zones[s.zone]?.reuse??s.zone;
        if(cx<0||cy<0||cx>=w||cy>=h)return false;const own=labels[cy*w+cx];
        if(own<0||own===lab)return true;
        // Native live task objects can be placed at room boundaries: a direct physical
        // path in this room is stronger evidence than a cached flood-fill label.
        if(entity&&(t.kind==='obj'||t.kind==='src')){
          const end=game.walk?.nearestWalkable?.(entity.x,entity.y)||[entity.x,entity.y];
          const path=game.walk?.pathTo?.(player.x,player.y,...end),last=path?.at(-1);
          return !!last&&Math.hypot(last.x-entity.x,last.y-entity.y)<=130;
        }
        return false;
      };
      const tracked=new Map(s.targets);
      for(const [id,e] of [...entityById].slice(0,128))if(!tracked.has(id)){
        const object=s.zi?.objs?.find(row=>String(row[0])===id),elite=s.zi?.elites?.find(row=>String(row[0])===id),mid=s.zi?.mids?.find(row=>String(row[0])===id),task=object||elite||mid;
        tracked.set(id,{id,alive:task?task[1]:true,kind:id==='boss'?'boss':object?'obj':elite?'elite':mid?'mid':'native',at:[e.x/32-.5,e.y/32-.5]});
      }
      const priority=t=>t.kind==='obj'?0:t.kind==='src'?1:2;
      const targets=[...tracked.values()].filter(t=>t.alive&&t.at&&targetInZone(t)).map(t=>{const e=entityById.get(t.id);return {...t,x:e?.x??(t.at[0]+.5)*32,y:e?.y??(t.at[1]+.5)*32};})
        .sort((a,b)=>priority(a)-priority(b)||Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y)).slice(0,32).filter(t=>Math.hypot(t.x-player.x,t.y-player.y)<140||reachable(t));
      const safe=s.safe&&s.safe.until>serverNow?s.safe:null,key=safe?JSON.stringify(safe):'';
      if(key!==cache.safeKey){cache.safeKey=key;cache.spots=safe?raidSafeSpots(definition,cache.layout,safe.seed,safe.n,safe.r):[];}
      const spots=cache.spots.filter(q=>Math.hypot(q.x-player.x,q.y-player.y)<(safe?.r||0)||pathTo(q));
      const plan=planRaidObjective(s,definition,player,targets,serverNow,spots);
      if(rid==='r4'&&['hold','obj','elite','mid','source','src'].includes(plan.kind))cache.fixedDetour=true;
      if(plan.kind==='kills'){
        const waitKey=s.zone+":"+(game.walk?.warpsKey||"");
        if(cache.killWaitKey!==waitKey||now-(cache.killWaitAt||0)>5000){cache.killWaitKey=waitKey;cache.killWaitAt=now;cache.killWaitPoint=raidKillWaitPoint(game,definition,s,cache.layout);}
        const fixedWait=rid==='r4'?definition.fixedNodes?.['wait'+s.zone]?.at(-1):null;
        const wait=fixedWait?{x:(fixedWait[0]+.5)*32,y:(fixedWait[1]+.5)*32}:cache.killWaitPoint;
        plan.target=wait;plan.radius=40;plan.stay=!wait||Math.hypot(wait.x-player.x,wait.y-player.y)<=40;
        plan.label=wait?(rid==='r4'&&!plan.stay?'副本｜沿固定通道前往下一區入口':'副本｜下一區入口等待清怪開門'):'副本｜小怪任務：等待傳送點位置，不追怪';
      }
      Object.assign(result,{ready:true,kind:plan.kind,label:plan.label,stay:!!plan.stay,target:plan.target?[plan.target.x,plan.target.y]:null,radius:plan.radius||0,marked:plan.marked,players:plan.players?.map(p=>[p.x,p.y])||[],markRadius:plan.mark?.r||0});
      if(safe&&!spots.length){result.stay=true;result.label='副本｜安全圈路徑無法確認，請檢查位置';result.ready=false;return result;}
      if(plan.mark){for(const slot of plan.mark.who){if(slot===s.me)continue;const p=s.players.get(slot);if(p&&!(p.flags&1))result.hazards.push(['circle',p.x,p.y,plan.mark.r*2,plan.mark.r*2,0,0]);}}
      if(safe)for(const q of cache.spots)result.neutral.push(['circle',q.x,q.y,safe.r*2,safe.r*2,0,0]);
      if(s.zi?.hold){
        const h=s.zi?.hold,raw=h?.at||definition.zones[s.zone]?.hold?.at,ats=Array.isArray(raw?.[0])?raw:raw?[raw]:[];
        const width=(h?.r||definition.zones[s.zone]?.hold?.r||4)*64;
        for(const a of ats)result.neutral.push(['circle',(a[0]+.5)*32,(a[1]+.5)*32,width,width,0,0]);
      }
      if(!result.stay&&plan.target){
        const key=plan.kind+':'+Math.round(plan.target.x/32)+','+Math.round(plan.target.y/32);
        if(cache.pathKey!==key||now-cache.pathAt>(rid==='r4'?70:300)||!cache.path?.length){cache.pathKey=key;cache.pathAt=now;const corridor=raidFixedCorridorPath(game,definition,s,plan.target,plan.kind,cache,pathTo);cache.path=corridor.path;cache.fixedRouteUsed=corridor.fixed;cache.fixedNodeIndex=corridor.nodeIndex;cache.fixedNodeCount=corridor.nodeCount;cache.fixedContinuous=corridor.continuous;cache.fixedSegment=corridor.segment;}
        if(cache.fixedRouteUsed)result.label='尼德霍格｜固定通道 · '+plan.label;
        if(cache.path?.length){
          let nearest=0;for(let i=1;i<cache.path.length;i++)if(Math.hypot(cache.path[i].x-player.x,cache.path[i].y-player.y)<Math.hypot(cache.path[nearest].x-player.x,cache.path[nearest].y-player.y)&&(!game.walk?.lineClear||game.walk.lineClear(player.x,player.y,cache.path[i].x,cache.path[i].y)))nearest=i;
          if(nearest)cache.path=cache.path.slice(nearest);
          while(cache.path.length&&Math.hypot(cache.path[0].x-player.x,cache.path[0].y-player.y)<=(rid==='r4'?8:18))cache.path.shift();
        }
        const step=cache.path?.[0];
        if(step){result.waypoint=[step.x,step.y];if(rid==='r4'){
          result.tightPath=true;
          const elapsed=now-(cache.motionAt||now),rate=elapsed>0?Math.max(.5,Math.min(4,(game.time-(cache.motionTime??game.time))*1000/elapsed)):(cache.motionRate||1);
          cache.motionAt=now;cache.motionTime=game.time;cache.motionRate=rate;
          const speed=Math.max(80,(game.classDef?.speed||180)*1.3*(game.stats?.speedMult||1)*(1+(game.buffValue?.('speed')||0))*(1-(game.buffValue?.('slow')||0)))*rate;
          const distance=Math.hypot(step.x-player.x,step.y-player.y);
          result.routeReach=cache.fixedContinuous?120:24;
          result.fixedSegment=cache.fixedSegment;
          result.pulseMs=Math.max(16,Math.min(300,distance/speed*900));
        }}else {result.stay=true;result.label+='（等待可通行路徑）';}
      }
      return result;
    }catch{return {enabled:true,ready:false,label:'副本｜機制資料暫不可用，等待更新'};}
  };
}

  installRaidMechanics({"r1":{"name":"獸人的記憶","zones":[{"name":"海岸村落","boss":false,"seeds":[[122,300]],"reuse":null,"door":{"warps":["Z1>Z2","Z2>Z1"]},"hold":null,"next":[219,252]},{"name":"村莊廣場","boss":false,"seeds":[[213,196]],"reuse":null,"door":{"warps":["Z2>Z3","Z3>Z2"]},"hold":null,"next":[120,233]},{"name":"祭壇前","boss":false,"seeds":[[113,262]],"reuse":null,"door":{"warps":["Z3>Z4","Z4>Z3"]},"hold":{"at":[113,262],"r":5,"secs":40,"frac":0.34},"next":[102,166]},{"name":"王房","boss":true,"seeds":[[155,149]],"reuse":null,"door":null,"hold":null,"next":null}],"boss":{"at":[155,140]}},"r2":{"name":"章魚洞穴","zones":[{"name":"中庭","boss":false,"seeds":[[105,187]],"reuse":null,"door":{"cells":[[116,109,144,110],[116,110,122,111],[123,110,137,111],[138,110,144,111],[116,111,144,112],[186,145,187,146],[186,146,189,153],[190,187,191,188],[190,188,193,192],[122,228,126,229],[134,228,138,229],[123,229,126,231],[134,229,137,231]]},"hold":null,"next":[128,103]},{"name":"四座殿堂","boss":false,"seeds":[[45,81],[213,220]],"reuse":null,"door":null,"hold":null,"next":[129,160]},{"name":"王房","boss":true,"seeds":[[105,187]],"reuse":1,"door":null,"hold":null,"next":null}],"boss":{"at":[129,170]}},"r3":{"name":"恐怖玩具工廠","zones":[{"name":"倉庫","boss":false,"seeds":[[61,197]],"reuse":null,"door":{"warps":["R1>R2","R2>R1"]},"hold":null,"next":[132,186]},{"name":"組裝線","boss":false,"seeds":[[183,219]],"reuse":null,"door":{"warps":["R2>R3","R3>R2"]},"hold":null,"next":[186,127]},{"name":"包裝區","boss":false,"seeds":[[183,111],[221,71]],"reuse":null,"door":{"warps":["R4>R0","R0>R4"]},"hold":null,"next":[159,39]},{"name":"王房","boss":true,"seeds":[[66,16]],"reuse":null,"door":null,"hold":null,"next":null}],"boss":{"at":[66,16]}},"r4":{"name":"尼德霍格之巢","zones":[{"name":"世界樹根","boss":false,"seeds":[[192,381]],"reuse":null,"door":{"cells":[[284,336,290,338],[284,338,291,339],[372,336,378,338],[371,338,378,339],[380,340,386,342]]},"hold":null,"next":[286,333]},{"name":"巢穴迴廊","boss":false,"seeds":[[302,297]],"reuse":null,"door":{"cells":[[236,280,242,282],[108,330,111,336],[110,336,111,337],[14,340,20,342]]},"hold":null,"next":[238,277]},{"name":"淨化祭壇","boss":false,"seeds":[[200,224]],"reuse":null,"door":{"warps":["N3>B","B>N3"]},"hold":{"at":[200,226],"r":6,"secs":45,"frac":0.34},"next":[200,142]},{"name":"王房","boss":true,"seeds":[[200,77]],"reuse":null,"door":null,"hold":null,"next":null}],"boss":{"at":[200,77]},"fixedNodes":{"wait0":[[192,381],[192,380],[232,380],[232,334],[247,334],[247,363],[266,363],[266,362],[280,362],[280,370],[287,370],[287,371],[353,371],[353,373],[352,373],[352,349],[383,349],[383,283],[381,283],[381,282],[378,282],[378,261],[333,261],[333,227],[332,227],[332,229],[263,229],[263,244],[312,244],[312,238],[328,238],[328,254],[263,254],[263,325],[239,325],[239,267],[216,267],[216,245],[248,245],[248,221],[200,221],[200,226]],"cross0":[[192,381],[192,380],[232,380],[232,334],[247,334],[247,363],[266,363],[266,362],[280,362],[280,370],[287,370],[287,371],[353,371],[353,373],[352,373],[352,349],[383,349],[383,283],[381,283],[381,282],[378,282],[378,261],[333,261],[333,227],[332,227],[332,229],[263,229],[263,244],[312,244],[312,238],[328,238],[328,254],[263,254],[263,325],[239,325],[239,267],[216,267],[216,245],[248,245],[248,221],[200,221],[200,226]],"wait1":[[192,381],[192,380],[232,380],[232,334],[247,334],[247,363],[266,363],[266,362],[280,362],[280,370],[287,370],[287,371],[353,371],[353,373],[352,373],[352,349],[383,349],[383,283],[381,283],[381,282],[378,282],[378,261],[333,261],[333,227],[332,227],[332,229],[263,229],[263,244],[312,244],[312,238],[328,238],[328,254],[263,254],[263,325],[239,325],[239,267],[216,267],[216,245],[248,245],[248,221],[200,221],[200,226]],"cross1":[[192,381],[192,380],[232,380],[232,334],[247,334],[247,363],[266,363],[266,362],[280,362],[280,370],[287,370],[287,371],[353,371],[353,373],[352,373],[352,349],[383,349],[383,283],[381,283],[381,282],[378,282],[378,261],[333,261],[333,227],[332,227],[332,229],[263,229],[263,244],[312,244],[312,238],[328,238],[328,254],[263,254],[263,325],[239,325],[239,267],[216,267],[216,245],[248,245],[248,221],[200,221],[200,226]],"altar2":[[192,381],[192,380],[232,380],[232,334],[247,334],[247,363],[266,363],[266,362],[280,362],[280,370],[287,370],[287,371],[353,371],[353,373],[352,373],[352,349],[383,349],[383,283],[381,283],[381,282],[378,282],[378,261],[333,261],[333,227],[332,227],[332,229],[263,229],[263,244],[312,244],[312,238],[328,238],[328,254],[263,254],[263,325],[239,325],[239,267],[216,267],[216,245],[248,245],[248,221],[200,221],[200,226]],"portal2":[[200,226],[200,215]],"boss3":[[200,142],[200,77]]}},"r5":{"name":"驚駭森靈之巢","zones":[{"name":"巢穴入口","boss":false,"seeds":[[298,327]],"reuse":null,"door":{"warps":["R3>R1","R1>R3"]},"hold":null,"next":[245,210]},{"name":"蛋室","boss":false,"seeds":[[268,132]],"reuse":null,"door":{"warps":["R1>R2","R2>R1"]},"hold":null,"next":[130,263]},{"name":"暗黑巢道","boss":false,"seeds":[[123,108]],"reuse":null,"door":{"warps":["R2>R0","R0>R2"]},"hold":null,"next":[85,159]},{"name":"王房","boss":true,"seeds":[[132,66]],"reuse":null,"door":null,"hold":null,"next":null}],"boss":{"at":[132,66]}},"r6":{"name":"舊格拉斯特海姆","zones":[{"name":"騎士團大廳","boss":false,"seeds":[[200,58]],"reuse":null,"door":{"warps":["R0>R3","R3>R0"]},"hold":null,"next":[43,128]},{"name":"迴廊","boss":false,"seeds":[[40,136]],"reuse":null,"door":{"warps":["R3>R4","R4>R3"]},"hold":null,"next":[74,130]},{"name":"地下牢","boss":false,"seeds":[[109,118]],"reuse":null,"door":{"warps":["R4>R2","R2>R4"]},"hold":null,"next":[143,177]},{"name":"王房","boss":true,"seeds":[[149,235]],"reuse":null,"door":null,"hold":null,"next":null}],"boss":{"at":[149,235]}},"r7":{"name":"死者之國","zones":[{"name":"亡者之街","boss":false,"seeds":[[195,252]],"reuse":null,"door":{"cells":[[124,166,145,167],[125,167,147,169],[155,178,170,179],[153,179,165,180],[166,179,170,180],[153,180,170,181],[232,180,251,181],[233,181,251,182],[233,182,252,183]]},"hold":null,"next":[232,174]},{"name":"枯樹廣場","boss":false,"seeds":[[197,129]],"reuse":null,"door":{"cells":[[227,85,235,86],[226,86,235,87],[178,87,186,89],[192,88,198,89],[178,89,187,90],[190,89,197,91],[204,90,213,91],[214,90,216,91],[205,91,216,92],[204,92,217,93],[130,95,147,97],[167,95,168,96],[167,96,170,97],[129,97,148,98],[152,97,170,98],[153,98,165,99],[166,98,170,99],[153,99,170,100],[73,109,79,111],[81,110,91,112],[73,111,80,112]]},"hold":null,"next":[160,91]},{"name":"北方墓地","boss":false,"seeds":[[211,34]],"reuse":null,"door":{"cells":[[231,27,232,28],[233,27,234,28],[231,28,234,34],[231,34,232,35],[233,34,234,35]]},"hold":null,"next":[239,28]},{"name":"冥界廣場","boss":true,"seeds":[[297,55]],"reuse":null,"door":null,"hold":null,"next":null}],"boss":{"at":[297,55]}},"r8":{"name":"封印神殿","zones":[{"name":"墓穴入口","boss":false,"seeds":[[266,113]],"reuse":null,"door":{"cells":[[207,149,218,151],[206,151,218,152]]},"hold":null,"next":[206,155]},{"name":"使徒迴廊","boss":false,"seeds":[[227,198]],"reuse":null,"door":{"cells":[[185,195,186,196],[185,196,188,200],[185,200,186,201]]},"hold":null,"next":[183,195]},{"name":"封印之間","boss":false,"seeds":[[82,177]],"reuse":null,"door":{"cells":[[82,119,90,120],[83,120,89,122]]},"hold":{"at":[[201,229],[68,110],[68,229],[145,124]],"r":4,"secs":30,"frac":0,"min":2},"next":[83,115]},{"name":"蠅巢之間","boss":false,"seeds":[[101,43]],"reuse":null,"door":{"cells":[[164,62,176,63],[164,63,169,64],[171,63,176,64],[164,64,176,65],[154,68,158,70],[153,70,159,71],[115,82,116,83],[117,82,118,83],[115,83,118,92],[123,108,124,109],[121,109,124,119],[123,119,124,120]]},"hold":null,"next":[167,68]},{"name":"王房","boss":true,"seeds":[[175,119],[248,43]],"reuse":null,"door":null,"hold":null,"next":null}],"boss":{"at":[175,119]}}});
  document.addEventListener("ro-helper-read-raid",()=>{
    try{document.documentElement.dataset.roHelperRaidActive=window.RO_RAID?.inRaid?.()?"on":"off";}catch{document.documentElement.dataset.roHelperRaidActive="off";}
    try{document.documentElement.dataset.roHelperRaidOutcome=JSON.stringify(window.__roHelperRaidOutcome?.()||null);}catch{delete document.documentElement.dataset.roHelperRaidOutcome;}
    try{
      const s=window.RO_RAIDUI?.state?.(),g=s?.g,iv=s?.invites?.[0];
      const group=g?{gid:String(g.gid??g.id??g.rid+':'+g.leader),rid:g.rid,name:g.name,leader:g.leader,min:g.min,state:g.state,open:!!g.open,
        members:(g.members||[]).slice(0,30).map(m=>({aid:m.aid,name:m.name,ready:!!m.ready,at:m.at})),
        needs:(g.needs||[]).slice(0,10).map(n=>({hard:!!n.hard,have:n.have,need:n.need}))}:null;
      document.documentElement.dataset.roHelperRaidGroup=JSON.stringify({me:s?.meAid||0,group,pool:!!s?.pool,invite:iv?{gid:iv.gid,rid:iv.rid,from:iv.from,name:iv.name}:null,infoAt:Number(s?.infoAt)||0,closed:!!s?.closed,raids:s?.info?.raids?Object.entries(s.info.raids).filter(([rid])=>/^r[1-8]$/.test(rid)).map(([rid,m])=>({rid,done:!!m?.done,why:typeof m?.why==='string'?m.why:''})):null});
    }catch{delete document.documentElement.dataset.roHelperRaidGroup;}
  });
  document.addEventListener('ro-helper-refresh-raid-checklist',()=>{
    if(document.body.classList.contains('in-lobby')&&!window.RO_RAID?.inRaid?.())try{window.RO_RAIDUI?.ask?.();}catch{}
  });
  document.addEventListener('ro-helper-finish-raid-group',()=>{
    if(document.documentElement.dataset.roHelperRaidFinishExit!=='on'||!document.body.classList.contains('in-lobby')||window.RO_RAID?.inRaid?.())return;
    const leave=document.getElementById('rg-w-leave');if(!leave||leave.disabled||leave.closest('.hidden'))return;
    const original=window.confirm;
    try{window.confirm=function(message){return /^確定要離開團嗎？/.test(String(message))?true:original.call(window,message);};leave.click();}
    finally{window.confirm=original;}
  });
  document.addEventListener("ro-helper-open-raid",()=>{
    if(location.hostname!=="ro.hans-webgametw.com" || !document.body.classList.contains("in-lobby"))return;
    try{window.RO_RAIDNPC?.open?.("raid");}catch{}
  });

  if (location.hostname === "ro.hans-webgametw.com") {
    const byAffixes = new WeakMap();
    const push = Array.prototype.push;
    let installed = false;
    window.__roHelperTrackGear = (item, ref) => {
      if (typeof item?.affixes !== "object" || item.affixes === null) return;
      const previous = byAffixes.get(item.affixes);
      if (previous === undefined) byAffixes.set(item.affixes,{item,ref});
      else if (previous && previous.item !== item) byAffixes.set(item.affixes,null);
      if (installed) return;
      installed = true;
      Array.prototype.push = function pushInventoryItem(...items) {
        const length = push.apply(this,items);
        if (items.length === 1 && typeof items[0]?.uid === "string" && Number.isInteger(items[0].itemId)) {
          const {uid,itemId,quality,affixes} = items[0];
          const tracked = byAffixes.get(affixes);
          if (tracked && tracked.item.id === itemId && (tracked.item.quality ?? 0) === (quality ?? 0)) {
            byAffixes.delete(affixes);
            document.dispatchEvent(new CustomEvent("ro-helper-gear-credited",{detail:JSON.stringify([uid,tracked.ref,itemId])}));
          }
        }
        return length;
      };
    };
  }
  // Capture only the requested inventory lookup while the game's item-info handler runs.
  function installInventoryAffixReader() {
    let original,wrapped,uid;
    const restore=()=>{if(wrapped && Array.prototype.find===wrapped)Array.prototype.find=original;wrapped=null;uid=null;};
    document.addEventListener("ro-helper-random-affixes",event=>{
      restore();
      if(typeof event.detail!=="string" || !event.detail || event.detail.length>200)return;
      uid=event.detail;original=Array.prototype.find;
      wrapped=function(...args){
        const result=original.apply(this,args);
        if(result?.uid===uid && Number.isInteger(result.itemId) && (result.affixes==null || Array.isArray(result.affixes))){
          document.documentElement.dataset.roHelperRandomAffixes=JSON.stringify({uid,itemId:result.itemId,affixes:(result.affixes||[]).map(a=>({stat:a.stat,value:a.value})),at:Date.now()});
          restore();
        }
        return result;
      };
      Array.prototype.find=wrapped;
      queueMicrotask(restore);
    });
  }
  installInventoryAffixReader();

  const root = Object.prototype;
  if (Object.getOwnPropertyDescriptor(root,"npcs")) return;
  const define = Object.defineProperty;
  let lobby, hooked = false, moveOwner, nextAttempt = 0;
  function capture(candidate) {
    if (hooked || typeof candidate?.addNpc !== "function" || typeof candidate?.moveTo !== "function") return;
    const prototype = Object.getPrototypeOf(candidate);
    const addNpc = prototype.addNpc;
    if (typeof addNpc !== "function") return;
    lobby = candidate;
    define(prototype,"addNpc",{
      configurable:true,writable:true,value:function (...args) {
        lobby = this;
        return addNpc.apply(this,args);
      }
    });
    hooked = true;
    delete root.npcs;
    if (Object.defineProperty === watchDefinition) Object.defineProperty = define;
  }
  function watchDefinition(target,key,descriptor) {
    const result = define(target,key,descriptor);
    if (!hooked && key === "npcs" && Array.isArray(descriptor.value)) capture(target);
    return result;
  }
  define(root,"npcs",{
    configurable:true,
    set(value) {
      define(this,"npcs",{value,writable:true,enumerable:true,configurable:true});
      if (Array.isArray(value)) capture(this);
    }
  });
  Object.defineProperty = watchDefinition;
  const friendInviteHooks=new WeakSet();
  document.addEventListener('ro-helper-invite-friend',event=>{
    const name=event.detail;let status='unavailable';
    try{if(typeof name!=='string'||name.length>80||!document.body.classList.contains('in-lobby'))return;
      const friends=lobby?.friends,net=lobby?.net,view=lobby?.party?.view,friend=friends?.list?.find(f=>f.name===name);
      if(!net?.online||!friends||typeof net.send!=='function')status='unavailable';
      else if(view&&view.leader!==view.me)status='notleader';
      else if(view?.members?.some(m=>m.name===name))status='member';
      else if((view?.members?.length||0)>=8)status='full';
      else if(!friend)status='missing';
      else if(!(friend.on>0)||!friend.lb)status='offline';
      else if(friend.party)status='otherparty';
      else{
        if(net.on&&typeof net.on.partyErr==='function'&&!friendInviteHooks.has(net)){
          const original=net.on.partyErr;net.on.partyErr=function(why,who,...args){
            document.documentElement.dataset.roHelperPartyInviteError=JSON.stringify({name:who||'',why,at:Date.now()});
            return original.call(this,why,who,...args);
          };friendInviteHooks.add(net);
        }
        const original=net.send;let attempted=false,sent=false;
        const observed=function(message,...args){const result=original.call(this,message,...args);if(message?.t==='partyInvite'||message?.t==='partyInviteFar'){attempted=true;sent=result===true;}return result;};
        net.send=observed;
        try{
          if(Number(friend.lb)===Number(net.lobby)&&friend.id&&typeof lobby.openMenu==='function'){
            if(document.getElementById('player-menu')){status='menuBusy';}
            else{
              lobby.openMenu({id:friend.id,name:friend.name,channel:friend.on},{x:80,y:80});
              const invite=[...document.querySelectorAll('#player-menu button,.player-menu button')].find(b=>/^(邀請入隊|Invitar al grupo|Invite to party|Convidar para o grupo)$/.test(b.textContent.trim()));
              if(invite&&!invite.disabled)invite.click();
              lobby.closeMenu?.();
            }
          }else if(typeof friends.actions?.inviteFar==='function')friends.actions.inviteFar(name);
        }finally{if(net.send===observed)net.send=original;}
        if(attempted)status=sent?'sent':'unavailable';else if(status!=='menuBusy')status='noInviteAction';
      }
    }catch{status='unavailable';}
    document.documentElement.dataset.roHelperFriendInvite=JSON.stringify({name,status});
  });
  document.addEventListener('ro-helper-read-friends',()=>{
    try{const list=lobby?.friends?.list,view=lobby?.party?.view;
      document.documentElement.dataset.roHelperFriends=JSON.stringify({ready:!!lobby?.friends&&!!lobby?.party,friends:(Array.isArray(list)?list:[]).slice(0,500).filter(f=>typeof f.name==='string').map(f=>({name:f.name,online:f.on>0,channel:f.on>0?f.on:0,lobby:f.on>0,party:!!f.party})),party:view?{leader:view.leader===view.me,members:(view.members||[]).slice(0,30).map(m=>m.name)}:null});
    }catch{delete document.documentElement.dataset.roHelperFriends;}
  });
  document.addEventListener("ro-helper-lobby-npc", event => {
    const npcId = event.detail;
    const dataset = document.documentElement.dataset;
    if (npcId === "cancel") {
      if (moveOwner && lobby && moveOwner.path === lobby.movePath && moveOwner.npc === lobby.talkTo) {
        lobby.movePath = null;
        lobby.talkTo = null;
      }
      moveOwner = undefined;
      return;
    }
    if (!["captain","festival","kstorage","vendor","rebirth","smith","cardrecycle"].includes(npcId)) return;
    if (!lobby?.player || !document.body?.classList.contains("in-lobby")) return;
    if (lobby.menuOpen?.()) return;
    const npc = lobby.npcs.find(item => item.id === npcId);
    if (!npc) { dataset.roHelperLobbyStatus = "missing"; return; }
    if (lobby.near === npc && lobby.prompt?.getClientRects().length) {
      if (Date.now() < nextAttempt) return;
      nextAttempt = Date.now()+500;
      dataset.roHelperLobbyStatus = "talking";
      lobby.prompt.click();
      return;
    }
    if (lobby.talkTo === npc && lobby.movePath?.length) {
      dataset.roHelperLobbyStatus = "moving";
      return;
    }
    if (Date.now() < nextAttempt) return;
    nextAttempt = Date.now()+1200;
    lobby.moveTo(npc.x,npc.y);
    moveOwner = {npc,path:lobby.movePath};
    dataset.roHelperLobbyStatus = lobby.movePath?.length ? "moving" : "blocked";
  });
})();

/*MIT License

Copyright (c) 2009 Kazuhiko Arase

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
//---------------------------------------------------------------------
//
// QR Code Generator for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//  http://www.opensource.org/licenses/mit-license.php
//
// The word 'QR Code' is registered trademark of
// DENSO WAVE INCORPORATED
//  http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------

var qrcode = function() {

  //---------------------------------------------------------------------
  // qrcode
  //---------------------------------------------------------------------

  /**
   * qrcode
   * @param typeNumber 1 to 40
   * @param errorCorrectionLevel 'L','M','Q','H'
   */
  var qrcode = function(typeNumber, errorCorrectionLevel) {

    var PAD0 = 0xEC;
    var PAD1 = 0x11;

    var _typeNumber = typeNumber;
    var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
    var _modules = null;
    var _moduleCount = 0;
    var _dataCache = null;
    var _dataList = [];

    var _this = {};

    var makeImpl = function(test, maskPattern) {

      _moduleCount = _typeNumber * 4 + 17;
      _modules = function(moduleCount) {
        var modules = new Array(moduleCount);
        for (var row = 0; row < moduleCount; row += 1) {
          modules[row] = new Array(moduleCount);
          for (var col = 0; col < moduleCount; col += 1) {
            modules[row][col] = null;
          }
        }
        return modules;
      }(_moduleCount);

      setupPositionProbePattern(0, 0);
      setupPositionProbePattern(_moduleCount - 7, 0);
      setupPositionProbePattern(0, _moduleCount - 7);
      setupPositionAdjustPattern();
      setupTimingPattern();
      setupTypeInfo(test, maskPattern);

      if (_typeNumber >= 7) {
        setupTypeNumber(test);
      }

      if (_dataCache == null) {
        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
      }

      mapData(_dataCache, maskPattern);
    };

    var setupPositionProbePattern = function(row, col) {

      for (var r = -1; r <= 7; r += 1) {

        if (row + r <= -1 || _moduleCount <= row + r) continue;

        for (var c = -1; c <= 7; c += 1) {

          if (col + c <= -1 || _moduleCount <= col + c) continue;

          if ( (0 <= r && r <= 6 && (c == 0 || c == 6) )
              || (0 <= c && c <= 6 && (r == 0 || r == 6) )
              || (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
            _modules[row + r][col + c] = true;
          } else {
            _modules[row + r][col + c] = false;
          }
        }
      }
    };

    var getBestMaskPattern = function() {

      var minLostPoint = 0;
      var pattern = 0;

      for (var i = 0; i < 8; i += 1) {

        makeImpl(true, i);

        var lostPoint = QRUtil.getLostPoint(_this);

        if (i == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }

      return pattern;
    };

    var setupTimingPattern = function() {

      for (var r = 8; r < _moduleCount - 8; r += 1) {
        if (_modules[r][6] != null) {
          continue;
        }
        _modules[r][6] = (r % 2 == 0);
      }

      for (var c = 8; c < _moduleCount - 8; c += 1) {
        if (_modules[6][c] != null) {
          continue;
        }
        _modules[6][c] = (c % 2 == 0);
      }
    };

    var setupPositionAdjustPattern = function() {

      var pos = QRUtil.getPatternPosition(_typeNumber);

      for (var i = 0; i < pos.length; i += 1) {

        for (var j = 0; j < pos.length; j += 1) {

          var row = pos[i];
          var col = pos[j];

          if (_modules[row][col] != null) {
            continue;
          }

          for (var r = -2; r <= 2; r += 1) {

            for (var c = -2; c <= 2; c += 1) {

              if (r == -2 || r == 2 || c == -2 || c == 2
                  || (r == 0 && c == 0) ) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    };

    var setupTypeNumber = function(test) {

      var bits = QRUtil.getBCHTypeNumber(_typeNumber);

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
      }

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    };

    var setupTypeInfo = function(test, maskPattern) {

      var data = (_errorCorrectionLevel << 3) | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);

      // vertical
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 6) {
          _modules[i][8] = mod;
        } else if (i < 8) {
          _modules[i + 1][8] = mod;
        } else {
          _modules[_moduleCount - 15 + i][8] = mod;
        }
      }

      // horizontal
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 8) {
          _modules[8][_moduleCount - i - 1] = mod;
        } else if (i < 9) {
          _modules[8][15 - i - 1 + 1] = mod;
        } else {
          _modules[8][15 - i - 1] = mod;
        }
      }

      // fixed module
      _modules[_moduleCount - 8][8] = (!test);
    };

    var mapData = function(data, maskPattern) {

      var inc = -1;
      var row = _moduleCount - 1;
      var bitIndex = 7;
      var byteIndex = 0;
      var maskFunc = QRUtil.getMaskFunction(maskPattern);

      for (var col = _moduleCount - 1; col > 0; col -= 2) {

        if (col == 6) col -= 1;

        while (true) {

          for (var c = 0; c < 2; c += 1) {

            if (_modules[row][col - c] == null) {

              var dark = false;

              if (byteIndex < data.length) {
                dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1);
              }

              var mask = maskFunc(row, col - c);

              if (mask) {
                dark = !dark;
              }

              _modules[row][col - c] = dark;
              bitIndex -= 1;

              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }

          row += inc;

          if (row < 0 || _moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    };

    var createBytes = function(buffer, rsBlocks) {

      var offset = 0;

      var maxDcCount = 0;
      var maxEcCount = 0;

      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);

      for (var r = 0; r < rsBlocks.length; r += 1) {

        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;

        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);

        dcdata[r] = new Array(dcCount);

        for (var i = 0; i < dcdata[r].length; i += 1) {
          dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
        }
        offset += dcCount;

        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);

        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var i = 0; i < ecdata[r].length; i += 1) {
          var modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = (modIndex >= 0)? modPoly.getAt(modIndex) : 0;
        }
      }

      var totalCodeCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalCodeCount += rsBlocks[i].totalCount;
      }

      var data = new Array(totalCodeCount);
      var index = 0;

      for (var i = 0; i < maxDcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < dcdata[r].length) {
            data[index] = dcdata[r][i];
            index += 1;
          }
        }
      }

      for (var i = 0; i < maxEcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < ecdata[r].length) {
            data[index] = ecdata[r][i];
            index += 1;
          }
        }
      }

      return data;
    };

    var createData = function(typeNumber, errorCorrectionLevel, dataList) {

      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);

      var buffer = qrBitBuffer();

      for (var i = 0; i < dataList.length; i += 1) {
        var data = dataList[i];
        buffer.put(data.getMode(), 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
        data.write(buffer);
      }

      // calc num max data.
      var totalDataCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalDataCount += rsBlocks[i].dataCount;
      }

      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw 'code length overflow. ('
          + buffer.getLengthInBits()
          + '>'
          + totalDataCount * 8
          + ')';
      }

      // end code
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }

      // padding
      while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
      }

      // padding
      while (true) {

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD0, 8);

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD1, 8);
      }

      return createBytes(buffer, rsBlocks);
    };

    _this.addData = function(data, mode) {

      mode = mode || 'Byte';

      var newData = null;

      switch(mode) {
      case 'Numeric' :
        newData = qrNumber(data);
        break;
      case 'Alphanumeric' :
        newData = qrAlphaNum(data);
        break;
      case 'Byte' :
        newData = qr8BitByte(data);
        break;
      case 'Kanji' :
        newData = qrKanji(data);
        break;
      default :
        throw 'mode:' + mode;
      }

      _dataList.push(newData);
      _dataCache = null;
    };

    _this.isDark = function(row, col) {
      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
        throw row + ',' + col;
      }
      return _modules[row][col];
    };

    _this.getModuleCount = function() {
      return _moduleCount;
    };

    _this.make = function() {
      if (_typeNumber < 1) {
        var typeNumber = 1;

        for (; typeNumber < 40; typeNumber++) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
          var buffer = qrBitBuffer();

          for (var i = 0; i < _dataList.length; i++) {
            var data = _dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
            data.write(buffer);
          }

          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }

          if (buffer.getLengthInBits() <= totalDataCount * 8) {
            break;
          }
        }

        _typeNumber = typeNumber;
      }

      makeImpl(false, getBestMaskPattern() );
    };

    _this.createTableTag = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var qrHtml = '';

      qrHtml += '<table style="';
      qrHtml += ' border-width: 0px; border-style: none;';
      qrHtml += ' border-collapse: collapse;';
      qrHtml += ' padding: 0px; margin: ' + margin + 'px;';
      qrHtml += '">';
      qrHtml += '<tbody>';

      for (var r = 0; r < _this.getModuleCount(); r += 1) {

        qrHtml += '<tr>';

        for (var c = 0; c < _this.getModuleCount(); c += 1) {
          qrHtml += '<td style="';
          qrHtml += ' border-width: 0px; border-style: none;';
          qrHtml += ' border-collapse: collapse;';
          qrHtml += ' padding: 0px; margin: 0px;';
          qrHtml += ' width: ' + cellSize + 'px;';
          qrHtml += ' height: ' + cellSize + 'px;';
          qrHtml += ' background-color: ';
          qrHtml += _this.isDark(r, c)? '#000000' : '#ffffff';
          qrHtml += ';';
          qrHtml += '"/>';
        }

        qrHtml += '</tr>';
      }

      qrHtml += '</tbody>';
      qrHtml += '</table>';

      return qrHtml;
    };

    _this.createSvgTag = function(cellSize, margin, alt, title) {

      var opts = {};
      if (typeof arguments[0] == 'object') {
        // Called by options.
        opts = arguments[0];
        // overwrite cellSize and margin.
        cellSize = opts.cellSize;
        margin = opts.margin;
        alt = opts.alt;
        title = opts.title;
      }

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      // Compose alt property surrogate
      alt = (typeof alt === 'string') ? {text: alt} : alt || {};
      alt.text = alt.text || null;
      alt.id = (alt.text) ? alt.id || 'qrcode-description' : null;

      // Compose title property surrogate
      title = (typeof title === 'string') ? {text: title} : title || {};
      title.text = title.text || null;
      title.id = (title.text) ? title.id || 'qrcode-title' : null;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var c, mc, r, mr, qrSvg='', rect;

      rect = 'l' + cellSize + ',0 0,' + cellSize +
        ' -' + cellSize + ',0 0,-' + cellSize + 'z ';

      qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
      qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : '';
      qrSvg += ' viewBox="0 0 ' + size + ' ' + size + '" ';
      qrSvg += ' preserveAspectRatio="xMinYMin meet"';
      qrSvg += (title.text || alt.text) ? ' role="img" aria-labelledby="' +
          escapeXml([title.id, alt.id].join(' ').trim() ) + '"' : '';
      qrSvg += '>';
      qrSvg += (title.text) ? '<title id="' + escapeXml(title.id) + '">' +
          escapeXml(title.text) + '</title>' : '';
      qrSvg += (alt.text) ? '<description id="' + escapeXml(alt.id) + '">' +
          escapeXml(alt.text) + '</description>' : '';
      qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
      qrSvg += '<path d="';

      for (r = 0; r < _this.getModuleCount(); r += 1) {
        mr = r * cellSize + margin;
        for (c = 0; c < _this.getModuleCount(); c += 1) {
          if (_this.isDark(r, c) ) {
            mc = c*cellSize+margin;
            qrSvg += 'M' + mc + ',' + mr + rect;
          }
        }
      }

      qrSvg += '" stroke="transparent" fill="black"/>';
      qrSvg += '</svg>';

      return qrSvg;
    };

    _this.createDataURL = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      return createDataURL(size, size, function(x, y) {
        if (min <= x && x < max && min <= y && y < max) {
          var c = Math.floor( (x - min) / cellSize);
          var r = Math.floor( (y - min) / cellSize);
          return _this.isDark(r, c)? 0 : 1;
        } else {
          return 1;
        }
      } );
    };

    _this.createImgTag = function(cellSize, margin, alt) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;

      var img = '';
      img += '<img';
      img += '\u0020src="';
      img += _this.createDataURL(cellSize, margin);
      img += '"';
      img += '\u0020width="';
      img += size;
      img += '"';
      img += '\u0020height="';
      img += size;
      img += '"';
      if (alt) {
        img += '\u0020alt="';
        img += escapeXml(alt);
        img += '"';
      }
      img += '/>';

      return img;
    };

    var escapeXml = function(s) {
      var escaped = '';
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charAt(i);
        switch(c) {
        case '<': escaped += '&lt;'; break;
        case '>': escaped += '&gt;'; break;
        case '&': escaped += '&amp;'; break;
        case '"': escaped += '&quot;'; break;
        default : escaped += c; break;
        }
      }
      return escaped;
    };

    var _createHalfASCII = function(margin) {
      var cellSize = 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r1, r2, p;

      var blocks = {
        '██': '█',
        '█ ': '▀',
        ' █': '▄',
        '  ': ' '
      };

      var blocksLastLineNoMargin = {
        '██': '▀',
        '█ ': '▀',
        ' █': ' ',
        '  ': ' '
      };

      var ascii = '';
      for (y = 0; y < size; y += 2) {
        r1 = Math.floor((y - min) / cellSize);
        r2 = Math.floor((y + 1 - min) / cellSize);
        for (x = 0; x < size; x += 1) {
          p = '█';

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
            p = ' ';
          }

          if (min <= x && x < max && min <= y+1 && y+1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
            p += ' ';
          }
          else {
            p += '█';
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          ascii += (margin < 1 && y+1 >= max) ? blocksLastLineNoMargin[p] : blocks[p];
        }

        ascii += '\n';
      }

      if (size % 2 && margin > 0) {
        return ascii.substring(0, ascii.length - size - 1) + Array(size+1).join('▀');
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.createASCII = function(cellSize, margin) {
      cellSize = cellSize || 1;

      if (cellSize < 2) {
        return _createHalfASCII(margin);
      }

      cellSize -= 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r, p;

      var white = Array(cellSize+1).join('██');
      var black = Array(cellSize+1).join('  ');

      var ascii = '';
      var line = '';
      for (y = 0; y < size; y += 1) {
        r = Math.floor( (y - min) / cellSize);
        line = '';
        for (x = 0; x < size; x += 1) {
          p = 1;

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
            p = 0;
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          line += p ? white : black;
        }

        for (r = 0; r < cellSize; r += 1) {
          ascii += line + '\n';
        }
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.renderTo2dContext = function(context, cellSize) {
      cellSize = cellSize || 2;
      var length = _this.getModuleCount();
      for (var row = 0; row < length; row++) {
        for (var col = 0; col < length; col++) {
          context.fillStyle = _this.isDark(row, col) ? 'black' : 'white';
          context.fillRect(row * cellSize, col * cellSize, cellSize, cellSize);
        }
      }
    }

    return _this;
  };

  //---------------------------------------------------------------------
  // qrcode.stringToBytes
  //---------------------------------------------------------------------

  qrcode.stringToBytesFuncs = {
    'default' : function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        bytes.push(c & 0xff);
      }
      return bytes;
    }
  };

  qrcode.stringToBytes = qrcode.stringToBytesFuncs['default'];

  //---------------------------------------------------------------------
  // qrcode.createStringToBytes
  //---------------------------------------------------------------------

  /**
   * @param unicodeData base64 string of byte array.
   * [16bit Unicode],[16bit Bytes], ...
   * @param numChars
   */
  qrcode.createStringToBytes = function(unicodeData, numChars) {

    // create conversion map.

    var unicodeMap = function() {

      var bin = base64DecodeInputStream(unicodeData);
      var read = function() {
        var b = bin.read();
        if (b == -1) throw 'eof';
        return b;
      };

      var count = 0;
      var unicodeMap = {};
      while (true) {
        var b0 = bin.read();
        if (b0 == -1) break;
        var b1 = read();
        var b2 = read();
        var b3 = read();
        var k = String.fromCharCode( (b0 << 8) | b1);
        var v = (b2 << 8) | b3;
        unicodeMap[k] = v;
        count += 1;
      }
      if (count != numChars) {
        throw count + ' != ' + numChars;
      }

      return unicodeMap;
    }();

    var unknownChar = '?'.charCodeAt(0);

    return function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        if (c < 128) {
          bytes.push(c);
        } else {
          var b = unicodeMap[s.charAt(i)];
          if (typeof b == 'number') {
            if ( (b & 0xff) == b) {
              // 1byte
              bytes.push(b);
            } else {
              // 2bytes
              bytes.push(b >>> 8);
              bytes.push(b & 0xff);
            }
          } else {
            bytes.push(unknownChar);
          }
        }
      }
      return bytes;
    };
  };

  //---------------------------------------------------------------------
  // QRMode
  //---------------------------------------------------------------------

  var QRMode = {
    MODE_NUMBER :    1 << 0,
    MODE_ALPHA_NUM : 1 << 1,
    MODE_8BIT_BYTE : 1 << 2,
    MODE_KANJI :     1 << 3
  };

  //---------------------------------------------------------------------
  // QRErrorCorrectionLevel
  //---------------------------------------------------------------------

  var QRErrorCorrectionLevel = {
    L : 1,
    M : 0,
    Q : 3,
    H : 2
  };

  //---------------------------------------------------------------------
  // QRMaskPattern
  //---------------------------------------------------------------------

  var QRMaskPattern = {
    PATTERN000 : 0,
    PATTERN001 : 1,
    PATTERN010 : 2,
    PATTERN011 : 3,
    PATTERN100 : 4,
    PATTERN101 : 5,
    PATTERN110 : 6,
    PATTERN111 : 7
  };

  //---------------------------------------------------------------------
  // QRUtil
  //---------------------------------------------------------------------

  var QRUtil = function() {

    var PATTERN_POSITION_TABLE = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ];
    var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

    var _this = {};

    var getBCHDigit = function(data) {
      var digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    };

    _this.getBCHTypeInfo = function(data) {
      var d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
        d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15) ) );
      }
      return ( (data << 10) | d) ^ G15_MASK;
    };

    _this.getBCHTypeNumber = function(data) {
      var d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
        d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18) ) );
      }
      return (data << 12) | d;
    };

    _this.getPatternPosition = function(typeNumber) {
      return PATTERN_POSITION_TABLE[typeNumber - 1];
    };

    _this.getMaskFunction = function(maskPattern) {

      switch (maskPattern) {

      case QRMaskPattern.PATTERN000 :
        return function(i, j) { return (i + j) % 2 == 0; };
      case QRMaskPattern.PATTERN001 :
        return function(i, j) { return i % 2 == 0; };
      case QRMaskPattern.PATTERN010 :
        return function(i, j) { return j % 3 == 0; };
      case QRMaskPattern.PATTERN011 :
        return function(i, j) { return (i + j) % 3 == 0; };
      case QRMaskPattern.PATTERN100 :
        return function(i, j) { return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0; };
      case QRMaskPattern.PATTERN101 :
        return function(i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };
      case QRMaskPattern.PATTERN110 :
        return function(i, j) { return ( (i * j) % 2 + (i * j) % 3) % 2 == 0; };
      case QRMaskPattern.PATTERN111 :
        return function(i, j) { return ( (i * j) % 3 + (i + j) % 2) % 2 == 0; };

      default :
        throw 'bad maskPattern:' + maskPattern;
      }
    };

    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
      var a = qrPolynomial([1], 0);
      for (var i = 0; i < errorCorrectLength; i += 1) {
        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0) );
      }
      return a;
    };

    _this.getLengthInBits = function(mode, type) {

      if (1 <= type && type < 10) {

        // 1 - 9

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 10;
        case QRMode.MODE_ALPHA_NUM : return 9;
        case QRMode.MODE_8BIT_BYTE : return 8;
        case QRMode.MODE_KANJI     : return 8;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 27) {

        // 10 - 26

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 12;
        case QRMode.MODE_ALPHA_NUM : return 11;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 10;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 41) {

        // 27 - 40

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 14;
        case QRMode.MODE_ALPHA_NUM : return 13;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 12;
        default :
          throw 'mode:' + mode;
        }

      } else {
        throw 'type:' + type;
      }
    };

    _this.getLostPoint = function(qrcode) {

      var moduleCount = qrcode.getModuleCount();

      var lostPoint = 0;

      // LEVEL1

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount; col += 1) {

          var sameCount = 0;
          var dark = qrcode.isDark(row, col);

          for (var r = -1; r <= 1; r += 1) {

            if (row + r < 0 || moduleCount <= row + r) {
              continue;
            }

            for (var c = -1; c <= 1; c += 1) {

              if (col + c < 0 || moduleCount <= col + c) {
                continue;
              }

              if (r == 0 && c == 0) {
                continue;
              }

              if (dark == qrcode.isDark(row + r, col + c) ) {
                sameCount += 1;
              }
            }
          }

          if (sameCount > 5) {
            lostPoint += (3 + sameCount - 5);
          }
        }
      };

      // LEVEL2

      for (var row = 0; row < moduleCount - 1; row += 1) {
        for (var col = 0; col < moduleCount - 1; col += 1) {
          var count = 0;
          if (qrcode.isDark(row, col) ) count += 1;
          if (qrcode.isDark(row + 1, col) ) count += 1;
          if (qrcode.isDark(row, col + 1) ) count += 1;
          if (qrcode.isDark(row + 1, col + 1) ) count += 1;
          if (count == 0 || count == 4) {
            lostPoint += 3;
          }
        }
      }

      // LEVEL3

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount - 6; col += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row, col + 1)
              &&  qrcode.isDark(row, col + 2)
              &&  qrcode.isDark(row, col + 3)
              &&  qrcode.isDark(row, col + 4)
              && !qrcode.isDark(row, col + 5)
              &&  qrcode.isDark(row, col + 6) ) {
            lostPoint += 40;
          }
        }
      }

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount - 6; row += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row + 1, col)
              &&  qrcode.isDark(row + 2, col)
              &&  qrcode.isDark(row + 3, col)
              &&  qrcode.isDark(row + 4, col)
              && !qrcode.isDark(row + 5, col)
              &&  qrcode.isDark(row + 6, col) ) {
            lostPoint += 40;
          }
        }
      }

      // LEVEL4

      var darkCount = 0;

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount; row += 1) {
          if (qrcode.isDark(row, col) ) {
            darkCount += 1;
          }
        }
      }

      var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;

      return lostPoint;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // QRMath
  //---------------------------------------------------------------------

  var QRMath = function() {

    var EXP_TABLE = new Array(256);
    var LOG_TABLE = new Array(256);

    // initialize tables
    for (var i = 0; i < 8; i += 1) {
      EXP_TABLE[i] = 1 << i;
    }
    for (var i = 8; i < 256; i += 1) {
      EXP_TABLE[i] = EXP_TABLE[i - 4]
        ^ EXP_TABLE[i - 5]
        ^ EXP_TABLE[i - 6]
        ^ EXP_TABLE[i - 8];
    }
    for (var i = 0; i < 255; i += 1) {
      LOG_TABLE[EXP_TABLE[i] ] = i;
    }

    var _this = {};

    _this.glog = function(n) {

      if (n < 1) {
        throw 'glog(' + n + ')';
      }

      return LOG_TABLE[n];
    };

    _this.gexp = function(n) {

      while (n < 0) {
        n += 255;
      }

      while (n >= 256) {
        n -= 255;
      }

      return EXP_TABLE[n];
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrPolynomial
  //---------------------------------------------------------------------

  function qrPolynomial(num, shift) {

    if (typeof num.length == 'undefined') {
      throw num.length + '/' + shift;
    }

    var _num = function() {
      var offset = 0;
      while (offset < num.length && num[offset] == 0) {
        offset += 1;
      }
      var _num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i += 1) {
        _num[i] = num[i + offset];
      }
      return _num;
    }();

    var _this = {};

    _this.getAt = function(index) {
      return _num[index];
    };

    _this.getLength = function() {
      return _num.length;
    };

    _this.multiply = function(e) {

      var num = new Array(_this.getLength() + e.getLength() - 1);

      for (var i = 0; i < _this.getLength(); i += 1) {
        for (var j = 0; j < e.getLength(); j += 1) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i) ) + QRMath.glog(e.getAt(j) ) );
        }
      }

      return qrPolynomial(num, 0);
    };

    _this.mod = function(e) {

      if (_this.getLength() - e.getLength() < 0) {
        return _this;
      }

      var ratio = QRMath.glog(_this.getAt(0) ) - QRMath.glog(e.getAt(0) );

      var num = new Array(_this.getLength() );
      for (var i = 0; i < _this.getLength(); i += 1) {
        num[i] = _this.getAt(i);
      }

      for (var i = 0; i < e.getLength(); i += 1) {
        num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i) ) + ratio);
      }

      // recursive call
      return qrPolynomial(num, 0).mod(e);
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // QRRSBlock
  //---------------------------------------------------------------------

  var QRRSBlock = function() {

    var RS_BLOCK_TABLE = [

      // L
      // M
      // Q
      // H

      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],

      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],

      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],

      // 4
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],

      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],

      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],

      // 7
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],

      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],

      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],

      // 10
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],

      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],

      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],

      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],

      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],

      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12, 7, 37, 13],

      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],

      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],

      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],

      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],

      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],

      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],

      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],

      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],

      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],

      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],

      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],

      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],

      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],

      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],

      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],

      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],

      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],

      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],

      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],

      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],

      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],

      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],

      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],

      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],

      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];

    var qrRSBlock = function(totalCount, dataCount) {
      var _this = {};
      _this.totalCount = totalCount;
      _this.dataCount = dataCount;
      return _this;
    };

    var _this = {};

    var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {

      switch(errorCorrectionLevel) {
      case QRErrorCorrectionLevel.L :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectionLevel.M :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectionLevel.Q :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectionLevel.H :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default :
        return undefined;
      }
    };

    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {

      var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);

      if (typeof rsBlock == 'undefined') {
        throw 'bad rs block @ typeNumber:' + typeNumber +
            '/errorCorrectionLevel:' + errorCorrectionLevel;
      }

      var length = rsBlock.length / 3;

      var list = [];

      for (var i = 0; i < length; i += 1) {

        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];

        for (var j = 0; j < count; j += 1) {
          list.push(qrRSBlock(totalCount, dataCount) );
        }
      }

      return list;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrBitBuffer
  //---------------------------------------------------------------------

  var qrBitBuffer = function() {

    var _buffer = [];
    var _length = 0;

    var _this = {};

    _this.getBuffer = function() {
      return _buffer;
    };

    _this.getAt = function(index) {
      var bufIndex = Math.floor(index / 8);
      return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
    };

    _this.put = function(num, length) {
      for (var i = 0; i < length; i += 1) {
        _this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
      }
    };

    _this.getLengthInBits = function() {
      return _length;
    };

    _this.putBit = function(bit) {

      var bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }

      if (bit) {
        _buffer[bufIndex] |= (0x80 >>> (_length % 8) );
      }

      _length += 1;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrNumber
  //---------------------------------------------------------------------

  var qrNumber = function(data) {

    var _mode = QRMode.MODE_NUMBER;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var data = _data;

      var i = 0;

      while (i + 2 < data.length) {
        buffer.put(strToNum(data.substring(i, i + 3) ), 10);
        i += 3;
      }

      if (i < data.length) {
        if (data.length - i == 1) {
          buffer.put(strToNum(data.substring(i, i + 1) ), 4);
        } else if (data.length - i == 2) {
          buffer.put(strToNum(data.substring(i, i + 2) ), 7);
        }
      }
    };

    var strToNum = function(s) {
      var num = 0;
      for (var i = 0; i < s.length; i += 1) {
        num = num * 10 + chatToNum(s.charAt(i) );
      }
      return num;
    };

    var chatToNum = function(c) {
      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      }
      throw 'illegal char :' + c;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrAlphaNum
  //---------------------------------------------------------------------

  var qrAlphaNum = function(data) {

    var _mode = QRMode.MODE_ALPHA_NUM;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var s = _data;

      var i = 0;

      while (i + 1 < s.length) {
        buffer.put(
          getCode(s.charAt(i) ) * 45 +
          getCode(s.charAt(i + 1) ), 11);
        i += 2;
      }

      if (i < s.length) {
        buffer.put(getCode(s.charAt(i) ), 6);
      }
    };

    var getCode = function(c) {

      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      } else if ('A' <= c && c <= 'Z') {
        return c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
      } else {
        switch (c) {
        case ' ' : return 36;
        case '$' : return 37;
        case '%' : return 38;
        case '*' : return 39;
        case '+' : return 40;
        case '-' : return 41;
        case '.' : return 42;
        case '/' : return 43;
        case ':' : return 44;
        default :
          throw 'illegal char :' + c;
        }
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qr8BitByte
  //---------------------------------------------------------------------

  var qr8BitByte = function(data) {

    var _mode = QRMode.MODE_8BIT_BYTE;
    var _data = data;
    var _bytes = qrcode.stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _bytes.length;
    };

    _this.write = function(buffer) {
      for (var i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrKanji
  //---------------------------------------------------------------------

  var qrKanji = function(data) {

    var _mode = QRMode.MODE_KANJI;
    var _data = data;

    var stringToBytes = qrcode.stringToBytesFuncs['SJIS'];
    if (!stringToBytes) {
      throw 'sjis not supported.';
    }
    !function(c, code) {
      // self test for sjis support.
      var test = stringToBytes(c);
      if (test.length != 2 || ( (test[0] << 8) | test[1]) != code) {
        throw 'sjis not supported.';
      }
    }('\u53cb', 0x9746);

    var _bytes = stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return ~~(_bytes.length / 2);
    };

    _this.write = function(buffer) {

      var data = _bytes;

      var i = 0;

      while (i + 1 < data.length) {

        var c = ( (0xff & data[i]) << 8) | (0xff & data[i + 1]);

        if (0x8140 <= c && c <= 0x9FFC) {
          c -= 0x8140;
        } else if (0xE040 <= c && c <= 0xEBBF) {
          c -= 0xC140;
        } else {
          throw 'illegal char at ' + (i + 1) + '/' + c;
        }

        c = ( (c >>> 8) & 0xff) * 0xC0 + (c & 0xff);

        buffer.put(c, 13);

        i += 2;
      }

      if (i < data.length) {
        throw 'illegal char at ' + (i + 1);
      }
    };

    return _this;
  };

  //=====================================================================
  // GIF Support etc.
  //

  //---------------------------------------------------------------------
  // byteArrayOutputStream
  //---------------------------------------------------------------------

  var byteArrayOutputStream = function() {

    var _bytes = [];

    var _this = {};

    _this.writeByte = function(b) {
      _bytes.push(b & 0xff);
    };

    _this.writeShort = function(i) {
      _this.writeByte(i);
      _this.writeByte(i >>> 8);
    };

    _this.writeBytes = function(b, off, len) {
      off = off || 0;
      len = len || b.length;
      for (var i = 0; i < len; i += 1) {
        _this.writeByte(b[i + off]);
      }
    };

    _this.writeString = function(s) {
      for (var i = 0; i < s.length; i += 1) {
        _this.writeByte(s.charCodeAt(i) );
      }
    };

    _this.toByteArray = function() {
      return _bytes;
    };

    _this.toString = function() {
      var s = '';
      s += '[';
      for (var i = 0; i < _bytes.length; i += 1) {
        if (i > 0) {
          s += ',';
        }
        s += _bytes[i];
      }
      s += ']';
      return s;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64EncodeOutputStream
  //---------------------------------------------------------------------

  var base64EncodeOutputStream = function() {

    var _buffer = 0;
    var _buflen = 0;
    var _length = 0;
    var _base64 = '';

    var _this = {};

    var writeEncoded = function(b) {
      _base64 += String.fromCharCode(encode(b & 0x3f) );
    };

    var encode = function(n) {
      if (n < 0) {
        // error.
      } else if (n < 26) {
        return 0x41 + n;
      } else if (n < 52) {
        return 0x61 + (n - 26);
      } else if (n < 62) {
        return 0x30 + (n - 52);
      } else if (n == 62) {
        return 0x2b;
      } else if (n == 63) {
        return 0x2f;
      }
      throw 'n:' + n;
    };

    _this.writeByte = function(n) {

      _buffer = (_buffer << 8) | (n & 0xff);
      _buflen += 8;
      _length += 1;

      while (_buflen >= 6) {
        writeEncoded(_buffer >>> (_buflen - 6) );
        _buflen -= 6;
      }
    };

    _this.flush = function() {

      if (_buflen > 0) {
        writeEncoded(_buffer << (6 - _buflen) );
        _buffer = 0;
        _buflen = 0;
      }

      if (_length % 3 != 0) {
        // padding
        var padlen = 3 - _length % 3;
        for (var i = 0; i < padlen; i += 1) {
          _base64 += '=';
        }
      }
    };

    _this.toString = function() {
      return _base64;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64DecodeInputStream
  //---------------------------------------------------------------------

  var base64DecodeInputStream = function(str) {

    var _str = str;
    var _pos = 0;
    var _buffer = 0;
    var _buflen = 0;

    var _this = {};

    _this.read = function() {

      while (_buflen < 8) {

        if (_pos >= _str.length) {
          if (_buflen == 0) {
            return -1;
          }
          throw 'unexpected end of file./' + _buflen;
        }

        var c = _str.charAt(_pos);
        _pos += 1;

        if (c == '=') {
          _buflen = 0;
          return -1;
        } else if (c.match(/^\s$/) ) {
          // ignore if whitespace.
          continue;
        }

        _buffer = (_buffer << 6) | decode(c.charCodeAt(0) );
        _buflen += 6;
      }

      var n = (_buffer >>> (_buflen - 8) ) & 0xff;
      _buflen -= 8;
      return n;
    };

    var decode = function(c) {
      if (0x41 <= c && c <= 0x5a) {
        return c - 0x41;
      } else if (0x61 <= c && c <= 0x7a) {
        return c - 0x61 + 26;
      } else if (0x30 <= c && c <= 0x39) {
        return c - 0x30 + 52;
      } else if (c == 0x2b) {
        return 62;
      } else if (c == 0x2f) {
        return 63;
      } else {
        throw 'c:' + c;
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // gifImage (B/W)
  //---------------------------------------------------------------------

  var gifImage = function(width, height) {

    var _width = width;
    var _height = height;
    var _data = new Array(width * height);

    var _this = {};

    _this.setPixel = function(x, y, pixel) {
      _data[y * _width + x] = pixel;
    };

    _this.write = function(out) {

      //---------------------------------
      // GIF Signature

      out.writeString('GIF87a');

      //---------------------------------
      // Screen Descriptor

      out.writeShort(_width);
      out.writeShort(_height);

      out.writeByte(0x80); // 2bit
      out.writeByte(0);
      out.writeByte(0);

      //---------------------------------
      // Global Color Map

      // black
      out.writeByte(0x00);
      out.writeByte(0x00);
      out.writeByte(0x00);

      // white
      out.writeByte(0xff);
      out.writeByte(0xff);
      out.writeByte(0xff);

      //---------------------------------
      // Image Descriptor

      out.writeString(',');
      out.writeShort(0);
      out.writeShort(0);
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(0);

      //---------------------------------
      // Local Color Map

      //---------------------------------
      // Raster Data

      var lzwMinCodeSize = 2;
      var raster = getLZWRaster(lzwMinCodeSize);

      out.writeByte(lzwMinCodeSize);

      var offset = 0;

      while (raster.length - offset > 255) {
        out.writeByte(255);
        out.writeBytes(raster, offset, 255);
        offset += 255;
      }

      out.writeByte(raster.length - offset);
      out.writeBytes(raster, offset, raster.length - offset);
      out.writeByte(0x00);

      //---------------------------------
      // GIF Terminator
      out.writeString(';');
    };

    var bitOutputStream = function(out) {

      var _out = out;
      var _bitLength = 0;
      var _bitBuffer = 0;

      var _this = {};

      _this.write = function(data, length) {

        if ( (data >>> length) != 0) {
          throw 'length over';
        }

        while (_bitLength + length >= 8) {
          _out.writeByte(0xff & ( (data << _bitLength) | _bitBuffer) );
          length -= (8 - _bitLength);
          data >>>= (8 - _bitLength);
          _bitBuffer = 0;
          _bitLength = 0;
        }

        _bitBuffer = (data << _bitLength) | _bitBuffer;
        _bitLength = _bitLength + length;
      };

      _this.flush = function() {
        if (_bitLength > 0) {
          _out.writeByte(_bitBuffer);
        }
      };

      return _this;
    };

    var getLZWRaster = function(lzwMinCodeSize) {

      var clearCode = 1 << lzwMinCodeSize;
      var endCode = (1 << lzwMinCodeSize) + 1;
      var bitLength = lzwMinCodeSize + 1;

      // Setup LZWTable
      var table = lzwTable();

      for (var i = 0; i < clearCode; i += 1) {
        table.add(String.fromCharCode(i) );
      }
      table.add(String.fromCharCode(clearCode) );
      table.add(String.fromCharCode(endCode) );

      var byteOut = byteArrayOutputStream();
      var bitOut = bitOutputStream(byteOut);

      // clear code
      bitOut.write(clearCode, bitLength);

      var dataIndex = 0;

      var s = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;

      while (dataIndex < _data.length) {

        var c = String.fromCharCode(_data[dataIndex]);
        dataIndex += 1;

        if (table.contains(s + c) ) {

          s = s + c;

        } else {

          bitOut.write(table.indexOf(s), bitLength);

          if (table.size() < 0xfff) {

            if (table.size() == (1 << bitLength) ) {
              bitLength += 1;
            }

            table.add(s + c);
          }

          s = c;
        }
      }

      bitOut.write(table.indexOf(s), bitLength);

      // end code
      bitOut.write(endCode, bitLength);

      bitOut.flush();

      return byteOut.toByteArray();
    };

    var lzwTable = function() {

      var _map = {};
      var _size = 0;

      var _this = {};

      _this.add = function(key) {
        if (_this.contains(key) ) {
          throw 'dup key:' + key;
        }
        _map[key] = _size;
        _size += 1;
      };

      _this.size = function() {
        return _size;
      };

      _this.indexOf = function(key) {
        return _map[key];
      };

      _this.contains = function(key) {
        return typeof _map[key] != 'undefined';
      };

      return _this;
    };

    return _this;
  };

  var createDataURL = function(width, height, getPixel) {
    var gif = gifImage(width, height);
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        gif.setPixel(x, y, getPixel(x, y) );
      }
    }

    var b = byteArrayOutputStream();
    gif.write(b);

    var base64 = base64EncodeOutputStream();
    var bytes = b.toByteArray();
    for (var i = 0; i < bytes.length; i += 1) {
      base64.writeByte(bytes[i]);
    }
    base64.flush();

    return 'data:image/gif;base64,' + base64;
  };

  //---------------------------------------------------------------------
  // returns qrcode function.

  return qrcode;
}();

// multibyte support
!function() {

  qrcode.stringToBytesFuncs['UTF-8'] = function(s) {
    // http://stackoverflow.com/questions/18729405/how-to-convert-utf8-string-to-byte-array
    function toUTF8Array(str) {
      var utf8 = [];
      for (var i=0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6),
              0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
          i++;
          // UTF-16 encodes 0x10000-0x10FFFF by
          // subtracting 0x10000 and splitting the
          // 20 bits of 0x0-0xFFFFF into two halves
          charcode = 0x10000 + (((charcode & 0x3ff)<<10)
            | (str.charCodeAt(i) & 0x3ff));
          utf8.push(0xf0 | (charcode >>18),
              0x80 | ((charcode>>12) & 0x3f),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
      }
      return utf8;
    }
    return toUTF8Array(s);
  };

}();

(function (factory) {
  if (typeof define === 'function' && define.amd) {
      define([], factory);
  } else if (typeof exports === 'object') {
      module.exports = factory();
  }
}(function () {
    return qrcode;
}));

function shareReviewedEffectGeometry(effect,world,root) {
  if(!effect || !world || root?.dataset.roHelperMemoryFarming!=="on" || root.dataset.roHelperMemorySaver==="off")return;
  const marker=Symbol.for("ro-helper-shared-effect-geometry");
  if(effect[marker] || typeof effect.dispose!=="function")return;
  const key=Symbol.for("ro-helper-effect-geometry-pool");
  const state=world[key] || (world[key]={entries:new Map(),classes:new WeakMap(),shared:0,released:0,reportAt:0});
  const C=effect.constructor;
  if(typeof C!=="function")return;
  let kind=state.classes.get(C);
  if(kind===undefined){
    const reviewed={"ij":"class ij{constructor(e){x(this,\"mesh\");x(this,\"mat\");x(this,\"age\",0);x(this,\"duration\");this.duration=e.duration;const a=2*e.outer+24,o=new cs(a,a);o.rotateX(-Math.PI/2),this.mat=new Ze({vertexShader:fA,fragmentShader:aj,uniforms:{shape:{value:e.shape===\"cone\"?1:0},quad:{value:new Ae(a,a)},outer:{value:e.outer},inner:{value:e.inner??0},halfAngle:{value:e.half??Math.PI},progress:{value:0},time:{value:Math.random()*10}},transparent:!0,depthWrite:!1,side:ra,polygonOffset:!0,polygonOffsetFactor:-4,polygonOffsetUnits:-4}),this.mesh=new qe(o,this.mat),this.mesh.rotation.y=-(e.angle??0),this.mesh.renderOrder=2,this.mesh.frustumCulled=!1}update(e){return this.age+=e*1e3,this.mat.uniforms.progress.value=Math.min(1,this.age/this.duration),this.mat.uniforms.time.value+=e,this.age>=this.duration}dispose(){this.mesh.geometry.dispose(),this.mat.dispose()}}","lj":"class lj{constructor(e){x(this,\"mesh\");x(this,\"mat\");x(this,\"age\",0);x(this,\"opts\");this.opts=e;const a=new Dn(Math.max(.5,e.top),Math.max(.5,e.bottom),Math.max(1,e.height),36,1,!0);a.translate(0,Math.max(1,e.height)/2,0);const o=a.attributes.uv;for(let n=0;n<o.count;n++)o.setY(n,1-o.getY(n));const s=e.color??[1,1,1];this.mat=new Wn({map:on(e.texture.source,!0),color:new Aa(s[0],s[1],s[2]),transparent:!0,opacity:0,blending:Ra,depthWrite:!1,side:ra}),this.mesh=new qe(a,this.mat),this.mesh.renderOrder=3,this.mesh.frustumCulled=!1,this.mesh.visible=!1}update(e,a){const o=this.opts;this.age+=e*1e3;const s=this.age-(o.delay??0);if(s<0)return!1;const n=Math.min(1,s/o.duration);if(o.follow){const d=o.follow();this.mesh.position.copy(a(d.x,d.y))}this.mesh.visible=!0;const r=o.animation??0,i=Math.min(1,n*2.2);this.mesh.scale.set(r===2?i:r===4?.5+.5*i:1,r===1?i:1,r===2?i:r===4?.5+.5*i:1),o.rotate&&(this.mesh.rotation.y+=e*2.4);const l=o.alpha??1;return this.mat.opacity=o.fade?l*(n<.15?n/.15:1-(n-.15)/.85):l*(n>.85?(1-n)/.15:1),n>=1}dispose(){this.mesh.geometry.dispose(),this.mat.dispose()}}"};
    const text=Function.prototype.toString.call(C).replace(/\s+/g,"");
    kind=Object.keys(reviewed).find(name=>reviewed[name].replace(/\s+/g,"")===text)||"";
    state.classes.set(C,kind);
  }
  if(!kind)return;
  const geometry=effect.mesh?.geometry;
  if(!geometry || typeof geometry.dispose!=="function" || !effect.mat || typeof effect.mat.dispose!=="function")return;
  const parameters=geometry.parameters;
  if(!parameters || !Object.values(parameters).every(value=>typeof value==="boolean" || typeof value==="number" && Number.isFinite(value)))return;
  const id=kind+":"+JSON.stringify(Object.keys(parameters).sort().map(name=>[name,parameters[name]]));
  let entry=state.entries.get(id);
  if(entry && entry.geometry!==geometry){
    // Audited constructors allocate a new private geometry and never change its vertices.
    // It has not been rendered yet; keep the shared geometry, release only this duplicate.
    geometry.dispose();effect.mesh.geometry=entry.geometry;state.shared++;
  }else if(!entry){
    if(state.entries.size>=128)return;
    entry={geometry,refs:0};state.entries.set(id,entry);
  }
  entry.refs++;effect[marker]=true;
  let released=false;
  // Audited native dispose methods release exactly mesh.geometry and mat.
  // Materials stay per-effect; the shared geometry is released at its final owner.
  effect.dispose=function(){
    if(released)return;released=true;
    try{if(--entry.refs===0){state.entries.delete(id);entry.geometry.dispose();state.released++;}}
    finally{this.mat.dispose();}
  };
  const now=Date.now();if(now-state.reportAt>=1000){state.reportAt=now;root.dataset.roHelperGeometryPool=JSON.stringify({shared:state.shared,groups:state.entries.size,released:state.released});}
}

function installFarmingVisualBudget(game,root) {
  if(location.hostname!=="ro.hans-webgametw.com" || !root?.dataset)return;
  const key=Symbol.for("ro-helper-farming-visual-budget");
  let state=game[key];
  const eligible=()=>root.dataset.roHelperMemoryFarming==="on" && root.dataset.roHelperMemorySaver!=="off" && !game.story && game.state!=="cutscene";
  if(!state){
    state=game[key]={depth:0,managed:new Set(),weapons:new WeakSet(),worlds:new WeakSet(),numbers:0,decorations:0,lastReport:0};
    const wrap=(target,name,factory)=>{try{const original=target?.[name];if(typeof original==="function")target[name]=factory(original);}catch{}};
    // Match the native settings' early return, before any number view is allocated.
    wrap(game,"addNumber",original=>function(...args){if(eligible()){state.numbers++;return;}return original.apply(this,args);});
    // Native low quality uses fxRoom(true)=false, a 25 optional-FX limit and no crit FX.
    wrap(game,"fxRoom",original=>function(...args){if(eligible() && (args[0]===true || (this.fx?.length||0)>=25))return false;return original.apply(this,args);});
    wrap(game,"critFx",original=>function(...args){if(!eligible())return original.apply(this,args);});
    state.wrap=wrap;
  }
  const world=game.world3d;
  if(world && !state.worlds.has(world)){
    if(state.world && state.world!==world)state.managed.clear();
    state.world=world;state.worlds.add(world);
    // Only these audited factories are void, visual-only methods. Never wrap
    // add3D/addZone/projectiles: their effect objects can carry hazard state.
    const reviewed={"addCylinder":"addCylinder(e,a,o){const s=new lj(o);s.mesh.position.set(e,this.heightAt(e,a)+2,a),this.scene.add(s.mesh),this.cylinders.push(s)}","addWave":"addWave(e,a,o){const s=this.heightAt(e,a),n=new ij(o);if(n.mesh.position.set(e,s+2,a),this.scene.add(n.mesh),this.cylinders.push(n),(o.height??70)<=0)return;const r=new rj(o);r.mesh.position.set(e,s+1,a),this.scene.add(r.mesh),this.cylinders.push(r)}","addFireWave":"addFireWave(e,a,o){this.add3D(e,a,new P4(o))}","addFirePatch":"addFirePatch(e,a,o){this.add3D(e,a,new Sv(o))}","addFireball":"addFireball(e,a,o){this.add3D(e,a,new k4(o))}"};
    for(const [name,cost]of [["addCylinder",1],["addWave",2],["addFireWave",1],["addFirePatch",1],["addFireball",1]]){
      if(typeof world[name]!=="function" || Function.prototype.toString.call(world[name]).replace(/\s+/g,"")!==reviewed[name].replace(/\s+/g,""))continue;
      state.wrap(world,name,original=>function(...args){
        if(!eligible() || !Array.isArray(this.cylinders))return original.apply(this,args);
        const playerDecoration=state.depth>0;
        if(playerDecoration && state.managed.size+cost>24){state.decorations++;return;}
        const start=this.cylinders.length,result=original.apply(this,args);
        for(let i=start;i<this.cylinders.length;i++){
          const effect=this.cylinders[i];
          try{shareReviewedEffectGeometry(effect,this,root);}catch{}
          if(!playerDecoration)continue;
          if(!effect || typeof effect.dispose!=="function" || state.managed.has(effect))continue;
          const dispose=effect.dispose;state.managed.add(effect);
          effect.dispose=function(...values){try{return dispose.apply(this,values);}finally{state.managed.delete(effect);}};
        }
        return result;
      });
    }
  }
  for(const weapon of game.weapons||[]){
    if(!weapon || state.weapons.has(weapon))continue;
    state.weapons.add(weapon);
    state.wrap(weapon,"fire",original=>function(...args){
      if(args[0]!==game || !eligible())return original.apply(this,args);
      state.depth++;try{return original.apply(this,args);}finally{state.depth--;}
    });
  }
  const now=Date.now();
  if(now-state.lastReport>=1000){state.lastReport=now;root.dataset.roHelperVisualBudget=JSON.stringify({at:now,enabled:eligible(),numbers:state.numbers,decorations:state.decorations,active:state.managed.size,limit:24});}
}

(() => {
  if (window.top !== window || window.__roGearCapture) return;
  window.__roGearCapture = true;
  const setPhase = message => {
    if (document.documentElement) document.documentElement.dataset.roHelperPhase = message;
  };
  if (Object.getOwnPropertyDescriptor(Object.prototype,"player")) {
    setPhase("戰鬥資料接入口已被占用，請重開遊戲");
    return;
  }
  setPhase("等待進入戰鬥");
  function readPartyLeader(game, now) {
  const coop = game.coop;
  if (!coop || coop.alone) return {leader: null, leaderState: "solo"};
  if (!coop.host) return {leader: null, leaderState: "connecting"};
  if (coop.host === coop.me) return {leader: null, leaderState: "host"};
  const mate = coop.mates?.get(coop.host);
  if (!mate) return {leader: null, leaderState: "missing"};
  if (mate.down) return {leader: null, leaderState: "down"};
  const avatar = mate.avatar;
  const latest = avatar?.samples?.at(-1);
  const hasPosition = point => Number.isFinite(point?.x) && Number.isFinite(point?.y);
  if (latest && now - latest.t > 2500) return {leader: null, leaderState: "stale"};
  // Network positions arrive before the remote character sprite finishes loading.
  const point = avatar?.samples?.length > 1 && hasPosition(latest) ? latest :
    hasPosition(avatar) ? avatar : coop.leaderPlayer?.();
  return hasPosition(point)
    ? {leader: [point.x, point.y], leaderState: "ready"}
    : {leader: null, leaderState: "missing"};
}

function sampleEnemyShots(game, cache) {
  if (typeof game.enemyArrow !== "function" || typeof game.addFx !== "function") return [];
  let shots = cache.get(game);
  if (!shots) {
    shots = new Map();
    cache.set(game,shots);
    const fire = game.enemyArrow;
    game.enemyArrow = function (enemy,x,y,speed,range,...rest) {
      const dx = x-enemy?.x, dy = y-enemy?.y;
      const length = Math.hypot(dx,dy);
      if (!length || !Number.isFinite(speed) || speed <= 0 || !Number.isFinite(range)) {
        return fire.call(this,enemy,x,y,speed,range,...rest);
      }
      const add = this.addFx;
      const own = Object.getOwnPropertyDescriptor(this,"addFx");
      this.addFx = function (effect,...args) {
        if (effect?.anchor && typeof effect.update === "function") {
          shots.set(effect,{x:enemy.x,y:enemy.y,vx:dx/length*speed,vy:dy/length*speed,range,speed});
        }
        return add.call(this,effect,...args);
      };
      try { return fire.call(this,enemy,x,y,speed,range,...rest); }
      finally {
        if (own) Object.defineProperty(this,"addFx",own);
        else delete this.addFx;
      }
    };
  }
  if (!shots.size) return [];
  const active = new Set(game.fx);
  const result = [];
  for (const [effect,shot] of shots) {
    if (!active.has(effect)) { shots.delete(effect); continue; }
    const {x,y} = effect.anchor;
    if (Math.hypot(x-game.player.x,y-game.player.y)>680) continue;
    const remaining = (shot.range-Math.hypot(x-shot.x,y-shot.y))/shot.speed;
    if (remaining>0) result.push([x,y,shot.vx,shot.vy,remaining]);
  }
  return result;
}

function victoryCleanup(game, dataset, now, emptySince, internationalEdition) {
  if (!(game.lootUntil >= 0) || game.enemies.some(enemy => !enemy.dead)) {
    emptySince.delete(game);
    return null;
  }
  const seasonalBalls = internationalEdition && game.stageId === "louyang";
  if (internationalEdition && game.coop && !seasonalBalls) {
    emptySince.delete(game);
    return {gear: [], canFinish: false, ready: false, deferredPartyLoot: true};
  }
  const gear = game.pickups.filter(item => !item.dead && (item.kind === "loot" || item.kind === "card" || (seasonalBalls && item.kind === "ball")));
  if (gear.length) emptySince.delete(game);
  else if (!emptySince.has(game)) emptySince.set(game, now);
  const ready = !gear.length && now - emptySince.get(game) >= 1000;
  const requestedAt = Number(dataset.roHelperFinishVictory);
  const canFinish = !internationalEdition && (!game.coop || game.coop.isHost === true);
  if (canFinish && !game.story && !game.endless && game.state === "playing" && game.closeAt >= 0 &&
      ready && now - requestedAt >= 0 && now - requestedAt < 750) {
    // Advance through the game's normal victory settlement on the next update.
    game.closeAt = game.time;
  }
  return {gear: gear.map(item => [item.kind, item.x, item.y]), canFinish, ready, waitForNaturalSettlement: internationalEdition};
}

function activeFinalBoss(game) {
  const inWorldBoss = typeof document!=="undefined" && Boolean(document.getElementById("wb-hud"));
  const worldBoss = (game.enemies || []).find(enemy=>!enemy.dead && (enemy.def?.id === "__wbBoss" || inWorldBoss && enemy.nid === 7) && Number.isFinite(enemy.x) && Number.isFinite(enemy.y));
  if (worldBoss) return worldBoss;
  if (game.endless) return null;
  const last = game.script?.bosses?.at(-1)?.id;
  if (!last) return null;
  return (game.bosses || game.enemies || []).find(enemy =>
    !enemy.dead && enemy.def?.id === last && enemy.def?.boss === "mvp" &&
    Number.isFinite(enemy.x) && Number.isFinite(enemy.y)) || null;
}

function watchLocalPickups(game, dataset, watched) {
  if (watched.has(game) || typeof game.updatePickups !== "function") return;
  const collect = game.collect;
  if (typeof collect === "function") game.collect = function (item,...args) {
    const result = collect.call(this,item,...args);
    if (item?.kind === "magnet") dataset.roHelperMagnetCollected = String((Number(dataset.roHelperMagnetCollected)||0)+1);
    return result;
  };
  const update = game.updatePickups;
  game.updatePickups = function (...args) {
    const coop = this.coop;
    const open = this.tryOpenChest;
    const take = coop?.replica ? coop.take : null;
    const threshold = Number(dataset.roHelperChestDiscovery);
    const discoveryReached = threshold > 0 && this.stats?.discovery >= threshold / 100 - 1e-9;
    const canSaveChest = Boolean(document.getElementById("sv-check"));
    const skipChest = dataset.roHelperSkipChest === "on" || (discoveryReached && !canSaveChest) || Boolean(activeFinalBoss(this));
    if (skipChest && typeof open === "function") this.tryOpenChest = () => {};
    if (typeof take === "function") coop.take = function (item, ...rest) {
      if (item?.kind === "chest" && skipChest) { item.magnet = false; return; }
      return take.call(this,item,...rest);
    };
    try { return update.apply(this,args); }
    finally {
      if (skipChest && typeof open === "function") this.tryOpenChest = open;
      if (typeof take === "function") coop.take = take;
    }
  };
  watched.add(game);
}

function readRaidWaypoint(game) {
  if(document.documentElement.dataset.roHelperRaidActive!=="on" || game.state!=="playing")return null;
  const {x,y}=game.player;
  let target=null;
  const arrow=document.getElementById("rd-arrow"),w=game.world3d;
  if(arrow && arrow.style.display!=="none" && w?.project){
    const m=arrow.style.transform.match(/translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
    if(m){
      const p=w.project(x,y,0),a=w.project(x+32,y,0),b=w.project(x,y+32,0);
      const ux=a.x-p.x,uy=a.y-p.y,vx=b.x-p.x,vy=b.y-p.y,det=ux*vy-uy*vx;
      if(Math.abs(det)>1e-6){const sx=+m[1]-p.x,sy=+m[2]-p.y,dx=(sx*vy-sy*vx)/det*32,dy=(sy*ux-sx*uy)/det*32,len=Math.hypot(dx,dy);
        if(Number.isFinite(len)&&len>1){const scale=Math.min(1,300/len);target={x:x+dx*scale,y:y+dy*scale};}}
    }
  }
  if(!target){
    const enemies=(game.enemies||[]).filter(e=>!e.dead && e.roT && Number.isFinite(e.x)&&Number.isFinite(e.y));
    const e=enemies.sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
    if(e && Math.hypot(e.x-x,e.y-y)>145)target=e;
  }
  if(!target)return null;
  const tx=Math.max(game.bounds.x0,Math.min(game.bounds.x1,target.x)),ty=Math.max(game.bounds.y0,Math.min(game.bounds.y1,target.y));
  const nearest=game.walk?.nearestWalkable?.(tx,ty)||[tx,ty];
  const path=game.walk?.pathTo?.(x,y,...nearest)||[];
  const p=path.find(p=>Math.hypot(p.x-x,p.y-y)>12);
  return p ? [p.x,p.y] : null;
}

function readGearWaypoint(game, cleanup, cache, now, magnet = false) {
  const {x,y} = game.player;
  const isGear = item => !item.dead && (magnet ? item.kind === "magnet" : item.kind === "loot" || item.kind === "card" || (cleanup && game.stageId === "louyang" && item.kind === "ball"));
  const distance = item => Math.hypot(item.x-x,item.y-y);
  const previous = cache.get(game);
  if (previous && now < previous.retryAt) {
    const {item,point} = previous;
    if (!item || (isGear(item) && game.pickups.includes(item) &&
        Math.hypot(item.x-previous.x,item.y-previous.y)<24 && Math.hypot(point.x-x,point.y-y)>12)) return point;
  }
  const choices = game.pickups.filter(isGear)
    .sort((a,b) => distance(a)-distance(b));
  if (!magnet && previous?.item && choices.includes(previous.item)) {
    choices.splice(choices.indexOf(previous.item),1);
    choices.unshift(previous.item);
  }
  for (const item of choices.slice(0,4)) {
    const walk = game.walk;
    const [tx,ty] = walk?.nearestWalkable ? walk.nearestWalkable(item.x,item.y) : [item.x,item.y];
    const path = walk?.pathTo ? walk.pathTo(x,y,tx,ty) : [{x:tx,y:ty}];
    if (magnet && (!path?.length || Math.hypot(path.at(-1).x-item.x,path.at(-1).y-item.y)>40)) continue;
    const point = path?.find(step => Math.hypot(step.x-x,step.y-y)>8);
    if (!point) continue;
    cache.set(game,{item,point,x:item.x,y:item.y,retryAt:now+(magnet ? 150 : 450)});
    return point;
  }
  cache.set(game,{point:null,retryAt:now+(magnet ? 150 : 450)});
  return null;
}


  const gameOrigin = location.origin;
function isGameScript(url) {
  try {
    const script = new URL(url);
    return script.origin === new URL(gameOrigin).origin && /\.(?:m?js)$/i.test(script.pathname);
  } catch {
    return false;
  }
}

function createLootSnapshotPublisher(snapshot,root,clock=Date.now) {
  const cache=new WeakMap();
  return game=>{
    const now=clock(),counts=[game.runLoot?.length||0,game.runCards?.length||0,game.runEggs?.length||0];
    let entry=cache.get(game);
    if(!entry || now<entry.at || now-entry.at>=2000 || counts.some((n,i)=>n!==entry.counts[i])){
      const data=snapshot(game),json=JSON.stringify(data);
      entry={at:now,counts,id:data.id,json};cache.set(game,entry);
    }
    const target=root || document.documentElement;if(target && target.dataset.roHelperLootSnapshot!==entry.json)target.dataset.roHelperLootSnapshot=entry.json;
    return entry.id;
  };
}

function readLootEffects(affixes, format) {
  if (!Array.isArray(affixes) || !affixes.length || typeof format !== "function") return [];
  try {
    return format(affixes).map(effect => typeof effect === "string" ? effect : effect?.text?.(1))
      .filter(line => typeof line === "string" && line.trim()).map(line => line.trim()).sort();
  } catch { return []; }
}

function readGameCardLoot(id, table, formatName) {
  const card = table instanceof Map ? table.get(id) : table?.[id];
  let name;
  try { name = formatName?.(id); } catch {}
  const effects = Array.isArray(card?.bonuses) ? card.bonuses.flatMap(bonus => {
    try {
      const label = bonus.text(1);
      return typeof label === "string" && label.trim() ? [label.trim()] : [];
    } catch { return []; }
  }) : [];
  return [name || "#" + id,card?.compound || "",0,"id:" + id,effects];
}

function locateBattleLoop(source) {
  const calls = [...source.matchAll(/(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*\.\s*renderWorld\s*\(\s*\)/g)];
  if (!calls.length) return null;
  const call = calls.find(match => source.slice(Math.max(0, match.index - 450), match.index)
    .includes(match[1] + ".advance(")) ?? (calls.length === 1 ? calls[0] : null);
  if (!call) throw new Error("無法辨識遊戲的戰鬥迴圈");
  const input = source.match(/\.keys\.has\(["']arrowdown["']\)\)[\s\S]{0,400}?\[([\w$]+),([\w$]+)\]\s*=\s*([\w$]+)\(\1\/[\w$]+,\2\/[\w$]+\)/);
  if (!input) throw new Error("找不到遊戲的移動方向函式");
  const movementImport = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)]
    .flatMap(([, names, path]) => names.split(",").map(name => ({parts: name.trim().split(/\s+as\s+/), path})))
    .find(({parts}) => (parts[1] || parts[0]) === input[3]);
  const dropTable = source.match(/\(\(\w+=([\w$]+)\[\w+\.id\]\)==null\?void 0:\w+\.bonuses\)\?\?\[\]/g);
  const gearAlias = source.match(/\.slots\.includes\(([\w$]+)\[\w+\.itemId\]\.slot\)/)?.[1] ??
    dropTable?.at(-1)?.match(/=([\w$]+)\[/)?.[1];
  const iconAlias = source.match(/class="icon" src="\$\{([\w$]+)\(\w+\.id\)\}" alt="">/)?.[1];
  const dropNames = source.match(/\?([\w$]+)\(\w+\.id\):\w+\?([\w$]+)\(\w+\.id,""\)/);
  const imports = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)]
    .flatMap(([,names,path]) => names.split(",").map(name => ({parts:name.trim().split(/\s+as\s+/),path})));
  const affixAlias = source.match(/,\.\.\.([\w$]+)\(\w+\.affixes\)\]\s*[,;]/)?.[1];
  const revealIndex = source.indexOf('class="dr-q"');
  const revealSource = revealIndex < 0 ? "" : source.slice(Math.max(0,revealIndex-4500),revealIndex);
  const cardAlias = revealSource.match(/\(\([\w$]+=([\w$]+)\[[\w$]+\.id\]\)==null\?void 0:[\w$]+\.bonuses\)\?\?\[\]/)?.[1];
  const lootImports = [gearAlias,dropNames?.[1],dropNames?.[2],iconAlias,affixAlias,cardAlias].map(alias => {
    if (!alias) return null;
    const entry = imports.find(({parts}) => (parts[1] || parts[0]) === alias);
    return entry ? {name:entry.parts[0],path:entry.path} : null;
  });
  const index = call.index + call[0].indexOf(call[1]);
  const lines = source.slice(0, index).split("\n");
  return {
    gameVariable: call[1],
    movement: input[3],
    lootImports,
    lootAliases: [gearAlias,dropNames?.[1],dropNames?.[2],iconAlias,affixAlias,cardAlias],
    movementImport: movementImport && {name: movementImport.parts[0], path: movementImport.path},
    callLength: call[0].length,
    location: {lineNumber: lines.length - 1, columnNumber: lines.at(-1).length}
  };
}


  const zonesByGame = new WeakMap();
        const readHazards = game => {
          let zones = zonesByGame.get(game);
          if (!zones) {
            zones = new Set();
            zonesByGame.set(game, zones);
            const zoneDecal = game.zoneDecal;
            game.zoneDecal = function(shape, argument) {
              const zone = zoneDecal.apply(this, arguments);
              const entry = {shape, argument, zone};
              zones.add(entry);
              const dispose = zone.dispose;
              zone.dispose = function() {
                zones.delete(entry);
                return dispose.apply(this, arguments);
              };
              return zone;
            };
          }
          return [...zones].flatMap(({shape, argument, zone}) => {
            const {x,y,w,h,rotation=0,alpha}=zone;
            if (!(alpha>=0) || ![x,y,w,h,rotation].every(Number.isFinite) || w<=0 || h<=0) return [];
            return [[shape,x,y,w,h,rotation,Number(argument)||0]];
          });
        };
        const bellsByGame = new WeakMap();
        const readBell = game => {
          if (!bellsByGame.has(game)) {
            const bells = [];
            bellsByGame.set(game, bells);
            const fx3d = game.fx3d;
            game.fx3d = function(x, y, effect) {
              const result = fx3d.apply(this, arguments);
              const radius = effect?.groundMat?.uniforms?.safeR?.value;
              if (Number.isFinite(radius) && radius > 0 && typeof effect.toll === "function" && typeof effect.sealed === "boolean") {
                bells.push({x, y, radius, effect});
              }
              return result;
            };
          }
          const bells = bellsByGame.get(game);
          for (let i=bells.length-1;i>=0;i--) {
            if (bells[i].effect.out >= 0 || bells[i].effect.waveAge >= 0) bells.splice(i,1);
          }
          const bell = bells.find(entry => !entry.effect.sealed);
          return bell ? [bell.x, bell.y, bell.radius] : null;
        };
  const victoryEmptySince = new WeakMap();
  const gearPaths = new WeakMap();
        const enemyShotCache = new WeakMap();
        const magnetPaths = new WeakMap();
        const pickupWatch = new WeakSet();
  const lootRunIds = new WeakMap();
  let lootRunNumber = 0;
  let affixFormatter, gameCardTable, gameCardName;
  const lootSnapshot = game => {
    if (!lootRunIds.has(game)) lootRunIds.set(game,"gear-"+Date.now()+"-"+ ++lootRunNumber);
    const row = id => ["#"+id,"",0,"id:"+id];
    return {id:lootRunIds.get(game),groups:[
      (game.runLoot || []).map((item,index) => {
        const {id,quality,affixes} = item;
        const ref = window.__roHelperTrackGear ? lootRunIds.get(game) + "." + index : undefined;
        if (ref) window.__roHelperTrackGear(item,ref);
        return ["#"+id,"",quality ?? 0,"id:"+id,readLootEffects(affixes,affixFormatter),ref];
      }),
      (game.runCards || []).map(id => readGameCardLoot(id?.id ?? id,gameCardTable,gameCardName)),
      (game.runEggs || []).map(id => row(id?.id ?? id))
    ]};
  };
  const publishLootSnapshot=createLootSnapshotPublisher(lootSnapshot,document.documentElement);
  let active, direction, loading;
  window.__roGearConnect=async()=>{await findDirection();const raw=document.documentElement?.dataset.roHelperLive;let packet;try{packet=JSON.parse(raw)}catch{};return {ok:true,pending:!(packet&&Date.now()-packet.at>=0&&Date.now()-packet.at<750),phase:document.documentElement?.dataset.roHelperPhase||"手機座標接入中，等待角色資料"};};
  async function findDirection() {
    if (direction || loading) return;
    const scripts = [...document.querySelectorAll('script[type="module"][src]')].map(script => script.src);
    const resources = performance.getEntriesByType("resource").map(entry => entry.name)
      .filter(url => /\/build\/main[^/]*\.js(?:[?#]|$)/.test(url));
    const urls = [...new Set([...scripts,...resources])];
    setPhase("已讀到戰鬥物件，正在辨識移動方向");
    if (!urls.length) return;
    loading = true;
    for (const url of urls) {
      if (!isGameScript(url)) continue;
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const battle = locateBattleLoop(await response.text());
        const movement = battle?.movementImport;
        if (!movement) continue;
        const target = new URL(movement.path,url);
        if (target.origin !== location.origin) continue;
        const module = await import(target.href);
        if (typeof module[movement.name] === "function") {
          direction = module[movement.name];
          const format = battle.lootImports[4];
          if (format) {
            const formatUrl = new URL(format.path,url);
            if (formatUrl.origin === location.origin) affixFormatter = (await import(formatUrl.href))[format.name];
          }
          for (const [index,entry] of [[0,battle.lootImports[0]],[1,battle.lootImports[1]],[5,battle.lootImports[5]]]) {
            if (!entry) continue;
            try {
              const definition = new URL(entry.path,url);
              if (definition.origin !== location.origin) continue;
              const value = (await import(definition.href))[entry.name];
              if (index === 0) {
                if (!value) continue;
                const entries = Object.create(null);
                for (const [key,item] of value instanceof Map ? value : Object.entries(value)) {
                  if (!item?.slot) continue;
                  const id = item.id ?? key;
                  entries["id:" + id] = item.slot;
            entries["fixed:" + id] = Array.isArray(item.bonuses) ? item.bonuses.length : null;
                  if (item.wtype) entries["type:" + id] = item.wtype;
                }
                document.documentElement.dataset.roHelperGearSlots = JSON.stringify(entries);
              } else if (index === 1) gameCardName = value;
              else gameCardTable = value;
            } catch {}
          }
          break;
        }
      } catch {}
    }
    loading = false;
    if (!direction) setPhase("已讀到戰鬥物件，但找不到移動方向函式");
  }
  const defineProperty = Object.defineProperty;
function publishMemoryStatus(game,root) {
  const key=Symbol.for("ro-helper-memory-status"),now=Date.now();
  const state=root[key] || (root[key]={at:0,history:[]});
  if(now-state.at<10000 && now>=state.at)return;
  state.at=now;
  const world=game.world3d,info=world?.renderer?.info?.memory;
  const pool=world?.[Symbol.for("ro-helper-effect-geometry-pool")];
  if(pool)root.dataset.roHelperGeometryPool=JSON.stringify({shared:pool.shared,groups:pool.entries.size,released:pool.released});
  const sample={at:now,stage:game.stageId||"",heap:typeof performance!=="undefined"?performance.memory?.usedJSHeapSize:null,
    enemies:game.enemies?.length||0,effects:game.fx?.length||0,projectiles:game.projectiles?.length||0,
    ground:world?.groundSprites?.length||0,cylinders:world?.cylinders?.length||0,
    lazyEnabled:typeof window!=="undefined"?!!window.RO_LZ?.on:null,lazyDeferred:typeof window!=="undefined"?(window.RO_LZ?.made??null):null,lazyLoaded:typeof window!=="undefined"?(window.RO_LZ?.loaded??null):null,
    textures:info?.textures??null,geometries:info?.geometries??null};
  state.history.push(sample);if(state.history.length>30)state.history.shift();
  root.dataset.roHelperMemoryStatus=JSON.stringify({current:sample,previous:state.history[0],samples:state.history.length});
}

function syncGpuBufferResolution(renderer,root) {
  if(!renderer)return;
  const enabled=root.dataset.roHelperGpuSaver==="on";
  try {
    if(typeof renderer.getPixelRatio==="function" && typeof renderer.setPixelRatio==="function"){
      const key=Symbol.for("ro-helper-original-pixel-ratio");
      if(enabled){
        if(renderer[key]===undefined){const ratio=renderer.getPixelRatio();if(!Number.isFinite(ratio)||ratio<=0)return;renderer[key]=ratio;}
        const target=Math.min(renderer[key],.25);
        if(renderer.getPixelRatio()!==target)renderer.setPixelRatio(target);
      }else if(renderer[key]!==undefined){const ratio=renderer[key];renderer.setPixelRatio(ratio);delete renderer[key];}
      return;
    }
    // Pixi resize takes logical screen dimensions and a separate pixel resolution.
    // Never pass physical canvas dimensions: game layout and pointer coordinates stay intact.
    if(typeof renderer.resize!=="function" || !renderer.screen)return;
    const key=Symbol.for("ro-helper-original-pixi-resolution"),ratio=renderer.resolution;
    const {width,height}=renderer.screen;
    if(![ratio,width,height].every(Number.isFinite)||ratio<=0||width<=0||height<=0)return;
    if(enabled){
      const original=renderer[key]??ratio,target=Math.min(original,.25);
      if(ratio!==target)renderer.resize(width,height,target);
      if(renderer[key]===undefined)renderer[key]=original;
    }else if(renderer[key]!==undefined){
      renderer.resize(width,height,renderer[key]);delete renderer[key];
    }
  }catch{}
}

function shouldUpdateGpuVisuals(game, root, now) {
  // renderWorld advances effect lifetimes with a native 100ms delta cap.
  // Skipping it for 200ms slows expiry and retains game-owned effects.
  // Always run native lifecycle work; installGpuRenderGate gates GPU submissions.
  delete game[Symbol.for("ro-helper-last-visual-update")];
  return true;
}

function installGpuRenderGate(renderer, root) {
  if(renderer?.render?.[Symbol.for("ro-helper-gpu-render-gate")])return true;
  const metricKey=Symbol.for("ro-helper-gpu-metrics");
  const metrics=root[metricKey] || (root[metricKey]={blocked2d:0,blockedWebgl:0,at:Date.now()});
  const flush=()=>{const now=Date.now();if(now-metrics.at<1000)return;root.dataset.roHelperGpuCounts=JSON.stringify({at:now,seconds:(now-metrics.at)/1000,blocked2d:metrics.blocked2d,blockedWebgl:metrics.blockedWebgl});metrics.blocked2d=0;metrics.blockedWebgl=0;metrics.at=now;};
  const webglKey=Symbol.for("ro-helper-webgl-gate");
  const install=(prototype)=>{
    if(!prototype)return;
    for(const name of ["drawArrays","drawElements","drawArraysInstanced","drawElementsInstanced","clear","blitFramebuffer"]){
      const original=prototype[name];if(typeof original!=="function"||original[webglKey])continue;
      function gated(...args){
        if(root.dataset.roHelperGpuSaver==="on" && this.canvas?.closest?.("#stage")){
          metrics.blockedWebgl++;flush();return;
        }
        return original.apply(this,args);
      }
      gated[webglKey]=original;prototype[name]=gated;
    }
  };
  if(typeof WebGLRenderingContext!=="undefined")install(WebGLRenderingContext.prototype);
  if(typeof WebGL2RenderingContext!=="undefined")install(WebGL2RenderingContext.prototype);
  if (!renderer || typeof renderer.render !== "function") return false;
  const key=Symbol.for("ro-helper-gpu-render-gate");
  if (renderer.render[key]) return true;
  const original=renderer.render;
  let lastMaintenance=Date.now(),lastCollection=Date.now(),savedGcAge=null;
  function renderWithGpuGate(...args) {
    const enabled=root.dataset.roHelperGpuSaver==="on";
    const gc=renderer.gc;
    const conserve=enabled && typeof localStorage!=="undefined" && localStorage.getItem("ro-helper-memory-saver")!=="off";
    if(gc && Number.isFinite(gc.maxUnusedTime) && typeof gc.run==="function"){
      if(conserve){
        if(savedGcAge===null)savedGcAge=gc.maxUnusedTime;
        gc.maxUnusedTime=Math.min(savedGcAge,15000);
      }else if(savedGcAge!==null){gc.maxUnusedTime=savedGcAge;savedGcAge=null;}
    }

    const state=enabled?"suspended":"active";
    if(root.dataset.roHelperGpuRenderState!==state)root.dataset.roHelperGpuRenderState=state;
    if(enabled){
      metrics.blocked2d++;flush();
      const now=Date.now();
      if(now-lastMaintenance<1000 && now>=lastMaintenance)return;
      lastMaintenance=now;
      // Preserve prerender/postrender, scheduler and renderer garbage collection.
      // Stage canvas draw/clear calls remain gated below this level.
      const result=original.apply(this,args);
      if(conserve && gc && typeof gc.run==="function" && now-lastCollection>=10000){
        lastCollection=now;gc.run();
      }
      return result;
    }
    flush();return original.apply(this,args);
  }
  renderWithGpuGate[key]=original;
  renderer.render=renderWithGpuGate;
  return true;
}

function maintainNativeMemory(game,root,now=Date.now()) {
  const key=Symbol.for("ro-helper-native-memory-maintenance");
  let state=game[key];
  if(localStorage.getItem("ro-helper-memory-saver")==="off")return;
  if(!state)state=game[key]={at:now,passes:0,batches:0,listResets:0,gcRuns:0};
  if(now>=state.at && now-state.at<15000)return;
  state.at=now;
  const world=game.world3d;
  // Run only after renderWorld has returned: no frame is using its render lists.
  // The game's own pruning function checks lastUsed and owns disposal/re-upload.
  if(world && !world.gone && typeof world.pruneBatches==="function"){
    const before=(world.batches?.size||0)+(world.ghostBatches?.size||0);
    try{world.pruneBatches();const after=(world.batches?.size||0)+(world.ghostBatches?.size||0);state.batches+=Math.max(0,before-after);}catch{}
  }
  const lists=world?.renderer?.renderLists;
  if(world && !world.gone && typeof lists?.dispose==="function"){
    try{lists.dispose();state.listResets++;}catch{}
  }
  const gc=game.app?.renderer?.gc;
  if(gc && Number.isFinite(gc.maxUnusedTime) && typeof gc.run==="function"){
    try{gc.run();state.gcRuns++;}catch{}
  }
  state.passes++;
  root.dataset.roHelperNativeMemory=JSON.stringify({at:now,passes:state.passes,batches:state.batches,listResets:state.listResets,gcRuns:state.gcRuns});
}

  const gpuWrappedGames = new WeakSet();
  function wrapGearRendering(game) {
    if (gpuWrappedGames.has(game)) return;
    const render = game.renderWorld;
    game.renderWorld = function(...args) {
      installGpuRenderGate(this.app?.renderer,document.documentElement);
      syncGpuBufferResolution(this.world3d?.renderer,document.documentElement);
      syncGpuBufferResolution(this.app?.renderer,document.documentElement);
      installFarmingVisualBudget(this,document.documentElement);
      publishMemoryStatus(this,document.documentElement);
      if(!shouldUpdateGpuVisuals(this,document.documentElement,performance.now()))return;
      installGpuRenderGate(this.world3d?.renderer,document.documentElement);
      const result=render.apply(this,args);
      try{maintainNativeMemory(this,document.documentElement);}catch{}
      return result;
    };
    gpuWrappedGames.add(game);
  }
  function capturePlayer(target, key) {
    if (key === "player" && typeof target.renderWorld === "function") {
      active = target;
      installFarmingVisualBudget(target,document.documentElement);
      wrapGearRendering(target);
      setPhase("已讀到戰鬥物件");
    }
  }
  Object.defineProperty = function(target, key, descriptor) {
    const result = defineProperty(target,key,descriptor);
    capturePlayer(target,key);
    if(key === "player" && !active) queueMicrotask(()=>capturePlayer(target,key));
    return result;
  };
  defineProperty(Object.prototype,"player",{
    configurable:true,
    set(value) {
      defineProperty(this,"player",{value,writable:true,enumerable:true,configurable:true});
      capturePlayer(this,"player");
      if(!active)queueMicrotask(()=>capturePlayer(this,"player"));
    }
  });
  let lastAttempt = -5000;
  setInterval(() => {
    const z = active;
    if (!document.querySelector("#hud:not(.hidden), #gameover:not(.hidden)")) return;
    if (!z?.player) {
      setPhase("進場了，但 Gear 尚未讀到戰鬥物件");
      return;
    }
    if (!direction && performance.now() - lastAttempt >= 5000) {
      lastAttempt = performance.now();
      void findDirection();
    }
    readHazards(z);
    if (!direction) return;
    try { (() => { const root = document.documentElement; if (!z?.player || performance.now() - Number(root.dataset.roHelperLast || 0) < 100) return false; const {x,y} = z.player; const raidMechanics=window.__roHelperRaidMechanics?.(z)||null; const partyLeader = readPartyLeader(z, performance.now()); const cleanup = victoryCleanup(z,root.dataset,Date.now(),victoryEmptySince,location.hostname !== "ro.hans-webgametw.com"); watchLocalPickups(z,root.dataset,pickupWatch); const finalBoss = activeFinalBoss(z); const gearWaypoint = !finalBoss && root.dataset.roHelperTimedMagnet!=='on' && root.dataset.roHelperStationaryMagnet!=='on' && readGearWaypoint(z,cleanup || root.dataset.roHelperBossCleanup==='on',gearPaths,performance.now()); const prioritizeMagnet = root.dataset.roHelperPriorityMagnet==='on'; const magnetCleanup = cleanup || root.dataset.roHelperBossCleanup==='on'; const magnetWaypoint = !finalBoss && (prioritizeMagnet || (magnetCleanup && z.pickups.some(e=>!e.dead&&(e.kind==='loot'||e.kind==='card')))) ? readGearWaypoint(z,Boolean(magnetCleanup),magnetPaths,performance.now(),true) : null; const waypoint = (prioritizeMagnet && magnetWaypoint) || gearWaypoint || magnetWaypoint; const reach = raidMechanics?.tightPath && raidMechanics.waypoint ? Math.max(6,Math.min(raidMechanics.routeReach||24,Math.hypot(raidMechanics.waypoint[0]-x,raidMechanics.waypoint[1]-y))) : waypoint ? Math.max(24,Math.min(60,Math.hypot(waypoint.x-x,waypoint.y-y))) : 60; const routes = [[1,0],[0,1],[-1,0],[0,-1],[1,-1],[1,1],[-1,1],[-1,-1]].map(([dx,dy]) => { const length=Math.hypot(dx,dy); const [vx,vy]=direction(dx/length,dy/length); const clearAt = length => [.2,.4,.6,.8,1].every(fraction=>{const step=length*fraction;const tx=x+vx*step,ty=y+vy*step;return tx>=z.bounds.x0&&tx<=z.bounds.x1&&ty>=z.bounds.y0&&ty<=z.bounds.y1&&(!z.walk||z.walk.walkable(tx,ty))});const distance = [reach,reach/2,reach/4].find(clearAt) || reach; return [x+vx*distance,y+vy*distance,clearAt(distance)] }); const nearby=e=>!e.dead&&Math.hypot(e.x-x,e.y-y)<520; root.dataset.roHelperLive=JSON.stringify({at:Date.now(),battleSeconds:z.time,stageId:z.stageId,lap:Number(z.difficulty?.lap)||1,baseLevel:z.charExp?.level,expeditionFlags:{story:Boolean(z.story),endless:Boolean(z.endless)},runBaseExp:z.endless ? null : z.charExp?.base,bossFarm:{intruderId:z.script?.intruder?.id||null,gear:root.dataset.roHelperBossCleanup==='on'?z.pickups.filter(e=>!e.dead&&(e.kind==='loot'||e.kind==='card')).map(e=>[e.kind,e.x,e.y]):null,solo:!z.coop&&!z.story&&!z.endless,playing:z.state==='playing',bosses:(z.bosses||[]).filter(e=>e.def?.boss).map(e=>[e.def.id,e.def.name]),kills:Object.fromEntries([...new Set([...(z.script?.bosses||[]).map(e=>e.id),...(z.script?.intruder?.id?[z.script.intruder.id]:[]),...(z.bosses||[]).map(e=>e.def?.id).filter(Boolean)])].map(id=>[id,z.killsBy?.get(id)||0])),maze:z.stageId==='maze'?(z.script?.bosses||[]).map(e=>[e.id,e.t]):[]},skillTargets:Object.fromEntries((z.weapons||[]).flatMap(weapon=>{if(typeof weapon.id!=='string')return [];try{const mod=weapon.mod?.(z);const bonus=(weapon.up?.targets||0)+(mod?.targets||0);const count=weapon.countUnit?.()==='objetivo'&&mod?.count>0?mod.count:bonus>0?1+bonus:weapon.targets?.(z);return Number.isSafeInteger(count)&&count>0?[[weapon.id,count]]:[]}catch{return []}})),discoveryBonus:Number.isFinite(z.stats?.discovery)?z.stats.discovery:null,lootRunId:publishLootSnapshot(z),player:[x,y],raidMechanics,raidWaypoint:raidMechanics?.enabled?raidMechanics.waypoint:readRaidWaypoint(z),finalBoss:finalBoss ? [finalBoss.x,finalBoss.y] : null,...partyLeader,cleanup,gearWaypoint,magnetWaypoint,routes,zeny:z.zeny,chestCost:z.chestCost(),hazards:readHazards(z),enemyShots:sampleEnemyShots(z,enemyShotCache),bell:readBell(z),enemies:z.enemies.filter(nearby).map(e=>[e.x,e.y]),drops:z.pickups.filter(e=>!e.dead&&(e.kind==='loot'||e.kind==='card'||e.kind==='magnet'||Math.hypot(e.x-x,e.y-y)<650)).map(e=>[e.kind,e.x,e.y])});root.dataset.roHelperLast=String(performance.now());return false })(); setPhase(""); delete document.documentElement.dataset.roHelperError; } catch (error) {
      document.documentElement.dataset.roHelperError = error.message;
    }
  },100);
})();


  // Gear uses the same assistant core; only browser-extension transport is adapted.
  const __roGearRuntime=(()=>{
    const listeners=[];
    const storage={async get(key){try{return {[key]:JSON.parse(localStorage.getItem('ro-helper-gear:'+key)||'null')}}catch{return {[key]:undefined}}},async set(values){for(const [key,value]of Object.entries(values))localStorage.setItem('ro-helper-gear:'+key,JSON.stringify(value))},async remove(key){localStorage.removeItem('ro-helper-gear:'+key)}};
    const onMessage={addListener(fn){listeners.push(fn)}};
    const chrome={storage:{local:storage},runtime:{onMessage}};
    const isGameUrl=url=>{try{return ['ro-survivors.com','www.ro-survivors.com','ro.hans-webgametw.com'].includes(new URL(url).hostname)}catch{return false}};
    chrome.runtime.onMessage.addListener((message,sender,respond) => {
  if (!["pair-ro-drops","sync-ro-drops"].includes(message?.type) || !isGameUrl(sender.url) ||
      typeof message.account !== "string" || !/^(?:local|(?:account|guest)\.\d+)$/.test(message.account)) return;
  const key = "roDropRoom:" + new URL(sender.url).hostname + ":" + message.account;
  const localAddress = "http://127.0.0.1:17864";
  const cloudAddress = "https://ro-private-drop-viewer.agsdf799.chatgpt.site";
  const readAddress = value => {
    if (!value?.trim()) return "";
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw Error("請輸入 HTTPS 網址的網域部分");
    }
    return url.origin;
  };
  async function relay() {
    let room = (await chrome.storage.local.get(key))[key];
    if (message.type === "pair-ro-drops") await chrome.storage.local.remove("roDropUploadKey");
    if (message.type === "sync-ro-drops") {
      if (!room) return {ok:false,disabled:true};
      const response = await fetch((room.cloud ? cloudAddress : localAddress)+"/api/drops",{
        credentials:"omit",
        redirect:"error",
        method:"PUT",
        headers:{Authorization:"Bearer "+room.upload,"Content-Type":"application/json"},
        body:JSON.stringify(message.data),
        signal:AbortSignal.timeout(15000)
      });
      if (response.ok) {
        const body = room.cloud ? await response.json() : null;
        return {ok:true,command:body?.command};
      }
      if(response.ok)return {ok:true};
      const messages={401:"配對金鑰失效，請重新配對",400:"掉落同步資料格式或筆數不符合網站限制",413:"掉落資料超過網站容量限制",429:"掉落同步過於頻繁，稍後自動重試"};
      return {ok:false,error:messages[response.status] || ("掉落網站回應異常（HTTP "+response.status+"），稍後自動重試")};
    }
    const {action,token} = message;
    if (action === "create" || action === "join") {
      if (action === "join" && !/^[a-f0-9]{48}$/.test(token || "")) throw Error("配對金鑰格式錯誤");
      const address = "";
      const headers = {"X-RO-Assistant":"pair-v1"};
      if (action === "join") headers.Authorization = "Bearer "+token;
      const response = await fetch(cloudAddress+"/"+action,{method:"POST",headers,credentials:"omit",redirect:"error",signal:AbortSignal.timeout(4000)})
        .catch(() => {throw Error("無法連到掉落查看網站");});
      if (!response.ok) throw Error(response.status === 401 ? "找不到這組配對金鑰" : "無法配對");
      room = {...await response.json(),address,cloud:true};
      await chrome.storage.local.set({[key]:room});
    } else if (action === "address") {
      if (!room) throw Error("請先產生或輸入金鑰");
      room.address = readAddress(message.address);
      await chrome.storage.local.set({[key]:room});
    } else if (action === "password") {
      if (!room?.cloud) throw Error("請先完成網頁配對");
      const password = message.password;
      if (typeof password !== "string" || password.length < 8 || password.length > 128 || !password.trim()) {
        throw Error("請輸入 8～128 字元的密碼");
      }
      const response = await fetch(cloudAddress+"/api/control-password",{
        method:"PUT",credentials:"omit",redirect:"error",signal:AbortSignal.timeout(5000),
        headers:{Authorization:"Bearer "+room.upload,"Content-Type":"application/json"},
        body:JSON.stringify({password})
      });
      if (!response.ok) throw Error("無法設定密碼，請檢查配對和網路");
      return {ok:true};
    } else if (action === "clear") {
      if (!room?.cloud) throw Error("請先使用雲端配對");
      if (typeof message.id !== "string" || !/^[a-f0-9-]{36}$/.test(message.id)) throw Error("找不到已同步的角色");
      const response = await fetch(cloudAddress+"/api/drops/"+message.id,{
        method:"DELETE", credentials:"omit", redirect:"error",
        headers:{Authorization:"Bearer "+room.upload}, signal:AbortSignal.timeout(4000)
      });
      if (!response.ok) throw Error("清空失敗，請確認角色已同步");
    } else if (action === "leave") {
      await chrome.storage.local.remove(key);
      room = undefined;
    } else if (action !== "read") return {ok:false};
    return room ? {ok:true,key:room.upload,address:room.address,url:(room.cloud ? cloudAddress : room.address || localAddress)+"/#"+room.view} : {ok:true};
  }
  relay().then(respond,error=>respond({ok:false,error:error.message}));
  return true;
});

    return {id:'ro-helper-gear',onMessage,async sendMessage(message){
      if(message.type==='connect-ro-coordinates'){
        const state=await window.__roGearConnect?.();return state || {ok:false,error:"手機座標接入口尚未啟動，請確認只啟用一份助手後重新整理遊戲"};
      }
      return await new Promise(resolve=>{
        let resolved=false;const timer=setTimeout(()=>{if(!resolved){resolved=true;resolve({ok:false,error:'Gear 網路回應逾時'})}},20000);
        const respond=value=>{if(resolved)return;resolved=true;clearTimeout(timer);resolve(value)};
        const accepted=listeners.some(fn=>fn(message,{url:location.href},respond)===true);
        if(!accepted)respond({ok:false,error:'Gear 尚未接入這項操作'});
      });
    }};
  })();

function shareReviewedEffectGeometry(effect,world,root) {
  if(!effect || !world || root?.dataset.roHelperMemoryFarming!=="on" || root.dataset.roHelperMemorySaver==="off")return;
  const marker=Symbol.for("ro-helper-shared-effect-geometry");
  if(effect[marker] || typeof effect.dispose!=="function")return;
  const key=Symbol.for("ro-helper-effect-geometry-pool");
  const state=world[key] || (world[key]={entries:new Map(),classes:new WeakMap(),shared:0,released:0,reportAt:0});
  const C=effect.constructor;
  if(typeof C!=="function")return;
  let kind=state.classes.get(C);
  if(kind===undefined){
    const reviewed={"ij":"class ij{constructor(e){x(this,\"mesh\");x(this,\"mat\");x(this,\"age\",0);x(this,\"duration\");this.duration=e.duration;const a=2*e.outer+24,o=new cs(a,a);o.rotateX(-Math.PI/2),this.mat=new Ze({vertexShader:fA,fragmentShader:aj,uniforms:{shape:{value:e.shape===\"cone\"?1:0},quad:{value:new Ae(a,a)},outer:{value:e.outer},inner:{value:e.inner??0},halfAngle:{value:e.half??Math.PI},progress:{value:0},time:{value:Math.random()*10}},transparent:!0,depthWrite:!1,side:ra,polygonOffset:!0,polygonOffsetFactor:-4,polygonOffsetUnits:-4}),this.mesh=new qe(o,this.mat),this.mesh.rotation.y=-(e.angle??0),this.mesh.renderOrder=2,this.mesh.frustumCulled=!1}update(e){return this.age+=e*1e3,this.mat.uniforms.progress.value=Math.min(1,this.age/this.duration),this.mat.uniforms.time.value+=e,this.age>=this.duration}dispose(){this.mesh.geometry.dispose(),this.mat.dispose()}}","lj":"class lj{constructor(e){x(this,\"mesh\");x(this,\"mat\");x(this,\"age\",0);x(this,\"opts\");this.opts=e;const a=new Dn(Math.max(.5,e.top),Math.max(.5,e.bottom),Math.max(1,e.height),36,1,!0);a.translate(0,Math.max(1,e.height)/2,0);const o=a.attributes.uv;for(let n=0;n<o.count;n++)o.setY(n,1-o.getY(n));const s=e.color??[1,1,1];this.mat=new Wn({map:on(e.texture.source,!0),color:new Aa(s[0],s[1],s[2]),transparent:!0,opacity:0,blending:Ra,depthWrite:!1,side:ra}),this.mesh=new qe(a,this.mat),this.mesh.renderOrder=3,this.mesh.frustumCulled=!1,this.mesh.visible=!1}update(e,a){const o=this.opts;this.age+=e*1e3;const s=this.age-(o.delay??0);if(s<0)return!1;const n=Math.min(1,s/o.duration);if(o.follow){const d=o.follow();this.mesh.position.copy(a(d.x,d.y))}this.mesh.visible=!0;const r=o.animation??0,i=Math.min(1,n*2.2);this.mesh.scale.set(r===2?i:r===4?.5+.5*i:1,r===1?i:1,r===2?i:r===4?.5+.5*i:1),o.rotate&&(this.mesh.rotation.y+=e*2.4);const l=o.alpha??1;return this.mat.opacity=o.fade?l*(n<.15?n/.15:1-(n-.15)/.85):l*(n>.85?(1-n)/.15:1),n>=1}dispose(){this.mesh.geometry.dispose(),this.mat.dispose()}}"};
    const text=Function.prototype.toString.call(C).replace(/\s+/g,"");
    kind=Object.keys(reviewed).find(name=>reviewed[name].replace(/\s+/g,"")===text)||"";
    state.classes.set(C,kind);
  }
  if(!kind)return;
  const geometry=effect.mesh?.geometry;
  if(!geometry || typeof geometry.dispose!=="function" || !effect.mat || typeof effect.mat.dispose!=="function")return;
  const parameters=geometry.parameters;
  if(!parameters || !Object.values(parameters).every(value=>typeof value==="boolean" || typeof value==="number" && Number.isFinite(value)))return;
  const id=kind+":"+JSON.stringify(Object.keys(parameters).sort().map(name=>[name,parameters[name]]));
  let entry=state.entries.get(id);
  if(entry && entry.geometry!==geometry){
    // Audited constructors allocate a new private geometry and never change its vertices.
    // It has not been rendered yet; keep the shared geometry, release only this duplicate.
    geometry.dispose();effect.mesh.geometry=entry.geometry;state.shared++;
  }else if(!entry){
    if(state.entries.size>=128)return;
    entry={geometry,refs:0};state.entries.set(id,entry);
  }
  entry.refs++;effect[marker]=true;
  let released=false;
  // Audited native dispose methods release exactly mesh.geometry and mat.
  // Materials stay per-effect; the shared geometry is released at its final owner.
  effect.dispose=function(){
    if(released)return;released=true;
    try{if(--entry.refs===0){state.entries.delete(id);entry.geometry.dispose();state.released++;}}
    finally{this.mat.dispose();}
  };
  const now=Date.now();if(now-state.reportAt>=1000){state.reportAt=now;root.dataset.roHelperGeometryPool=JSON.stringify({shared:state.shared,groups:state.entries.size,released:state.released});}
}

function installFarmingVisualBudget(game,root) {
  if(location.hostname!=="ro.hans-webgametw.com" || !root?.dataset)return;
  const key=Symbol.for("ro-helper-farming-visual-budget");
  let state=game[key];
  const eligible=()=>root.dataset.roHelperMemoryFarming==="on" && root.dataset.roHelperMemorySaver!=="off" && !game.story && game.state!=="cutscene";
  if(!state){
    state=game[key]={depth:0,managed:new Set(),weapons:new WeakSet(),worlds:new WeakSet(),numbers:0,decorations:0,lastReport:0};
    const wrap=(target,name,factory)=>{try{const original=target?.[name];if(typeof original==="function")target[name]=factory(original);}catch{}};
    // Match the native settings' early return, before any number view is allocated.
    wrap(game,"addNumber",original=>function(...args){if(eligible()){state.numbers++;return;}return original.apply(this,args);});
    // Native low quality uses fxRoom(true)=false, a 25 optional-FX limit and no crit FX.
    wrap(game,"fxRoom",original=>function(...args){if(eligible() && (args[0]===true || (this.fx?.length||0)>=25))return false;return original.apply(this,args);});
    wrap(game,"critFx",original=>function(...args){if(!eligible())return original.apply(this,args);});
    state.wrap=wrap;
  }
  const world=game.world3d;
  if(world && !state.worlds.has(world)){
    if(state.world && state.world!==world)state.managed.clear();
    state.world=world;state.worlds.add(world);
    // Only these audited factories are void, visual-only methods. Never wrap
    // add3D/addZone/projectiles: their effect objects can carry hazard state.
    const reviewed={"addCylinder":"addCylinder(e,a,o){const s=new lj(o);s.mesh.position.set(e,this.heightAt(e,a)+2,a),this.scene.add(s.mesh),this.cylinders.push(s)}","addWave":"addWave(e,a,o){const s=this.heightAt(e,a),n=new ij(o);if(n.mesh.position.set(e,s+2,a),this.scene.add(n.mesh),this.cylinders.push(n),(o.height??70)<=0)return;const r=new rj(o);r.mesh.position.set(e,s+1,a),this.scene.add(r.mesh),this.cylinders.push(r)}","addFireWave":"addFireWave(e,a,o){this.add3D(e,a,new P4(o))}","addFirePatch":"addFirePatch(e,a,o){this.add3D(e,a,new Sv(o))}","addFireball":"addFireball(e,a,o){this.add3D(e,a,new k4(o))}"};
    for(const [name,cost]of [["addCylinder",1],["addWave",2],["addFireWave",1],["addFirePatch",1],["addFireball",1]]){
      if(typeof world[name]!=="function" || Function.prototype.toString.call(world[name]).replace(/\s+/g,"")!==reviewed[name].replace(/\s+/g,""))continue;
      state.wrap(world,name,original=>function(...args){
        if(!eligible() || !Array.isArray(this.cylinders))return original.apply(this,args);
        const playerDecoration=state.depth>0;
        if(playerDecoration && state.managed.size+cost>24){state.decorations++;return;}
        const start=this.cylinders.length,result=original.apply(this,args);
        for(let i=start;i<this.cylinders.length;i++){
          const effect=this.cylinders[i];
          try{shareReviewedEffectGeometry(effect,this,root);}catch{}
          if(!playerDecoration)continue;
          if(!effect || typeof effect.dispose!=="function" || state.managed.has(effect))continue;
          const dispose=effect.dispose;state.managed.add(effect);
          effect.dispose=function(...values){try{return dispose.apply(this,values);}finally{state.managed.delete(effect);}};
        }
        return result;
      });
    }
  }
  for(const weapon of game.weapons||[]){
    if(!weapon || state.weapons.has(weapon))continue;
    state.weapons.add(weapon);
    state.wrap(weapon,"fire",original=>function(...args){
      if(args[0]!==game || !eligible())return original.apply(this,args);
      state.depth++;try{return original.apply(this,args);}finally{state.depth--;}
    });
  }
  const now=Date.now();
  if(now-state.lastReport>=1000){state.lastReport=now;root.dataset.roHelperVisualBudget=JSON.stringify({at:now,enabled:eligible(),numbers:state.numbers,decorations:state.decorations,active:state.managed.size,limit:24});}
}

function maintainNativeMemory(game,root,now=Date.now()) {
  const key=Symbol.for("ro-helper-native-memory-maintenance");
  let state=game[key];
  if(localStorage.getItem("ro-helper-memory-saver")==="off")return;
  if(!state)state=game[key]={at:now,passes:0,batches:0,listResets:0,gcRuns:0};
  if(now>=state.at && now-state.at<15000)return;
  state.at=now;
  const world=game.world3d;
  // Run only after renderWorld has returned: no frame is using its render lists.
  // The game's own pruning function checks lastUsed and owns disposal/re-upload.
  if(world && !world.gone && typeof world.pruneBatches==="function"){
    const before=(world.batches?.size||0)+(world.ghostBatches?.size||0);
    try{world.pruneBatches();const after=(world.batches?.size||0)+(world.ghostBatches?.size||0);state.batches+=Math.max(0,before-after);}catch{}
  }
  const lists=world?.renderer?.renderLists;
  if(world && !world.gone && typeof lists?.dispose==="function"){
    try{lists.dispose();state.listResets++;}catch{}
  }
  const gc=game.app?.renderer?.gc;
  if(gc && Number.isFinite(gc.maxUnusedTime) && typeof gc.run==="function"){
    try{gc.run();state.gcRuns++;}catch{}
  }
  state.passes++;
  root.dataset.roHelperNativeMemory=JSON.stringify({at:now,passes:state.passes,batches:state.batches,listResets:state.listResets,gcRuns:state.gcRuns});
}

function buildDifficultyAdvice(api, character, options) {
  const canonicalStageName=value=>{
    const name=String(value??"").normalize("NFKC").trim()
      .replace(/\s*[·・･]\s*改\d*\s*(?:特殊關卡)?$/u,"")
      .replace(/\s*特殊關卡$/u,"").trim();
    if(/^(?:聖誕節|聖誕|Navidad|Christmas|xmas)$/i.test(name))return "xmas";
    if(/^(?:元宵節|元宵燈會|元宵燈會節|燈籠節|Feria de faroles de Louyang|Lantern Festival|lantern)$/i.test(name))return "lantern";
    return name;
  };
  let stageIndex=api.stages.findIndex(s=>s.id===options.stage || s.name===options.stage);
  if(stageIndex<0){
    const target=canonicalStageName(options.stage);
    const matches=api.stages.map((s,index)=>({s,index})).filter(({s})=>canonicalStageName(s.name)===target || canonicalStageName(s.id)===target);
    if(matches.length===1)stageIndex=matches[0].index;
  }
  const stage=api.stages[stageIndex],lap=Number(options.lap);
  if(!stage || !stage.map || stage.storyOnly || !Number.isInteger(lap) || lap<1 || lap>api.maxLap) throw Error("請先選擇有效關卡與周目");
  const gs=api.total(character),state=api.stageState(character,stageIndex,gs,lap);
  if(!state?.unlocked || state.storyOk===false) throw Error("目前角色尚未符合此關卡的 GS 或解鎖條件");
  if(options.mode!=="solo") throw Error("目前只評估單人；組隊需要隊友素質，不能用單人數據判斷");
  const stats=api.stats(character),fields=api.difficultyFields;
  const normalize=value=>Object.fromEntries(fields.map(f=>[f.key,Math.min(f.max,Math.max(f.min,Number(value?.[f.key])||f.min))]));
  const base=normalize(Object.fromEntries(fields.map(f=>[f.key,Number(options.values?.[f.key])/(f.key==="tier"?1:100)])));
  const lapData=api.lapStats(stage.id,lap);
  const gate=lapData.gs || stage.gsMin || 1;
  const margin=options.safety==="headroom"?Math.min(1.3,Math.max(1,Math.sqrt(gs/Math.max(1,gate)))):1;
  const waves=api.scripts[stage.id]?.waves || [];
  const monsters=[...new Set([...(stage.monsters || []),...(stage.minis || []).map(b=>b.id),stage.mvp?.id,...waves.flatMap(w=>w.pool || [])].filter(Boolean))];
  const maxHit=Math.max(1,...monsters.map(id=>api.mobs[id]?.damage || 0))*(lapData.damage||1)*(api.scripts[stage.id]?.mobDmg||1);
  const mitigation=Math.max(.01,1-Math.min(.6,stats.damageReduction||0))*Math.max(.01,1-api.defReduction(stats.def||0));
  const effectiveHp=Math.max(1,stats.maxHp||1)/mitigation;
  const hitBuffer=effectiveHp/(maxHit*base.damage*base.tier);
  const spawn=d=>d.count*(1+.1455*(d.events-1));
  const caps={spawns:spawn(base)*margin,hp:base.hp*base.tier*margin,
    hit:base.damage*base.tier*Math.min(margin,Math.max(1,hitBuffer/3)),
    workload:spawn(base)*base.hp*base.tier*margin};
  const allowed=d=>d.speed===base.speed && spawn(d)<=caps.spawns+1e-8 &&
    d.hp*d.tier<=caps.hp+1e-8 && d.damage*d.tier<=caps.hit+1e-8 &&
    spawn(d)*d.hp*d.tier<=caps.workload+1e-8;
  function forecast(d) {
    const p=api.curve.P(d,stage.id), discovery=Math.max(0,stats.discovery||0);
    let weights=api.qualities.map((q,index)=>q.weight*Math.pow(1+discovery/(1+discovery),index));
    const sum=weights.reduce((n,w)=>n+w,0);
    let distribution=weights.map(w=>w/sum);
    if(stage.chapter===2) {
      const cfg=api.chapterQuality,index=lap-1,top=distribution.length-1;
      for(let roll=0;roll<(cfg.rolls||1);roll++){
        const next=distribution.map(()=>0);
        distribution.forEach((weight,q)=>{
          const chance=q===top?0:q===top-1?cfg.leg[index]:cfg.up[index];
          next[q]+=weight*(1-chance);if(q<top)next[q+1]+=weight*chance;
        });
        distribution=next;
      }
    }
    const legendary=p.q+(1-p.q)*distribution.at(-1)*p.k;
    return {legendary,loot:api.curve.M(d),equipment:api.curve.GG(d),normalCard:api.curve.G(d,false),
      bossCard:api.curve.G(d,true),uncappedEquipment:api.curve.total(d,stage.id)};
  }
  const objective=["loot","bossCard"].includes(options.objective)?options.objective:"legendary";
  const score=d=>{const p=forecast(d);return {values:{...d},...p};};
  let best=score(base),tested=0;
  const better=(a,b)=>{
    if(a[objective]>b[objective]+1e-10)return true;
    if(Math.abs(a[objective]-b[objective])>1e-10)return false;
    if(objective==="bossCard"){
      for(const cost of [d=>d.hp*d.tier,d=>d.damage*d.tier,spawn]){
        const x=cost(a.values),y=cost(b.values);
        if(x<y-1e-10)return true;if(x>y+1e-10)return false;
      }
      return false;
    }
    return objective==="legendary"?a.loot>b.loot+1e-10:a.legendary>b.legendary+1e-10;
  };
  const keys=fields.filter(f=>f.key!=="speed").map(f=>f.key);
  const byKey=Object.fromEntries(fields.map(f=>[f.key,f]));
  const round=(key,v)=>{const f=byKey[key],step=key==="tier"?1:.05;return Number(Math.min(f.max,Math.max(f.min,f.min+Math.round((v-f.min)/step)*step)).toFixed(5));};
  const grids=Object.fromEntries(keys.map(key=>[key,[...new Set([byKey[key].min,1.5,2,3,5,10,20,base[key]].map(v=>round(key,v)))]]));
  function visit(index,d) {
    if(index===keys.length){if(!allowed(d))return;tested++;const candidate=score(d);if(better(candidate,best))best=candidate;return;}
    const key=keys[index];for(const value of grids[key])visit(index+1,{...d,[key]:value});
  }
  visit(0,{...base});
  // Refine to the game's actual slider steps, while preserving the same risk bounds.
  for(let pass=0;pass<3;pass++){
    let improved=false;
    for(const key of keys){const f=byKey[key],step=key==="tier"?1:.05,start=best.values;
      for(let value=f.min;value<=f.max+1e-9;value+=step){const d={...start,[key]:round(key,value)};if(!allowed(d))continue;tested++;const candidate=score(d);if(better(candidate,best)){best=candidate;improved=true;}}
    }if(!improved)break;
  }
  const percentages=values=>Object.fromEntries(fields.map(f=>[f.key,Math.round(values[f.key]*(f.key==="tier"?1:100))]));
  return {at:Date.now(),id:character.id,name:character.name,gs,stage:stage.name,stageId:stage.id,lap,objective,
    signature:JSON.stringify([gs,stage.id,lap,base,stats.maxHp,stats.def,stats.damageReduction,stats.discovery,stats.matk,stats.atk,stats.haste]),
    stats:{hp:stats.maxHp,matk:stats.matk,atk:stats.atk,haste:stats.haste,discovery:stats.discovery},
    baseline:{...forecast(base),values:percentages(base)},recommended:{...best,values:percentages(best.values)},
    tested,margin,hitBuffer,caps,
    caveat:"搜尋範圍內的建議值；依目前設定的怪量、血量與傷害作負荷基準，配合 GS 餘裕和生命／減傷估算。尚未實測通關，不保證能打贏，也不是所有配置的全域最佳解。"};
}

function buildGsAdvice(api, character, options = {}) {
  const job = api.job(character);
  const gs = api.total(character);
  const text = bonus => { try { return bonus.text(1); } catch { return ""; } };
  const affixText = affix => api.affixes([affix]).map(text).filter(Boolean).join("、");
  const boss = id => Boolean(api.mobs[id]?.boss);
  const nameOf = id => api.cards[id] ? api.formatCard(id) : "#"+id;
  const timeText = seconds => Math.floor(seconds/60)+":"+String(Math.floor(seconds%60)).padStart(2,"0");
  function sourcePlan(stage, monster) {
    const script = api.scripts[stage.id];
    const bosses = (script?.bosses || []).filter(b => Number.isFinite(b.t)).sort((a,b)=>a.t-b.t);
    const spawn = bosses.find(b=>b.id === monster);
    const windows = (script?.waves || []).filter(w=>Array.isArray(w.pool) && w.pool.includes(monster) &&
      Number.isFinite(w.from) && Number.isFinite(w.to)).map(w=>[w.from,w.to]);
    const end = spawn?.t ?? (windows.length ? Math.max(...windows.map(w=>w[1])) : null);
    const stop = end === null ? null : spawn || bosses.find(b=>b.t >= end);
    return {stage:stage.name,stageId:stage.id,chapter:stage.chapter===2?2:1,
      monster,monsterName:api.mobs[monster]?.name || monster,windows,
      windowText:spawn ? timeText(spawn.t)+" 出現" : windows.map(w=>timeText(w[0])+"～"+timeText(w[1])).join("、"),
      bossId:stop?.id || "",bossName:stop ? api.mobs[stop.id]?.name || stop.id : "",
      seconds:stop?.t ?? null};
  }
  const cardByMonster = new Map(Object.values(api.cards).filter(card=>card?.monster && Number(card.id)<1000000).map(card=>[card.monster,Number(card.id)]));
  const sources = new Map(), frontier = [];
  for (let lap=1;lap<=api.maxLap;lap++) {
    for (const [index,stage] of api.stages.entries()) {
      if (!stage.map || stage.storyOnly) continue;
      const state = api.stageState(character,index,gs,lap);
      if (!state?.unlocked || state.storyOk === false) continue;
      frontier.push({id:stage.id,name:stage.name,chapter:stage.chapter===2?2:1,lap});
      const monsters = new Set([...(stage.monsters || []),...(stage.minis || []).map(x=>x.id),stage.mvp?.id,
        ...(api.scripts[stage.id]?.waves || []).flatMap(w=>w.pool || [])].filter(Boolean));
      for (const monster of monsters) {
        if (!options.includeBoss && boss(monster)) continue;
        const base = api.mobCard[monster] || cardByMonster.get(monster);
        const id = base && Number(base)%1000000 + (lap-1)*1000000;
        const card = id && api.cards[id];
        if (!card) continue;
        const plan = {...sourcePlan(stage,monster),lap};
        const old = sources.get(id);
        // A shorter verified spawn window is preferable; unknown timings stay last.
        if (!old || (plan.seconds ?? Infinity) < (old.seconds ?? Infinity))
          sources.set(id,{...plan,card});
      }
    }
  }
  const candidates = [...sources].map(([id,source])=>({id,source}));
  const primary = ["str","agi","vit","int","dex","luk"];
  const categories = [["crit","cd","area","pierce"],["hp","armor","spd","flee"]];
  const baseValue = {crit:.01,cd:.01,area:.01,pierce:.01,hp:5,armor:.4,spd:.01,flee:.01};
  const result = [];
  for (const [slot,uid] of Object.entries(character.equipped || {})) {
    const item = character.inventory.find(x=>x.uid===uid),def = item && api.gear[item.itemId];
    if (!item || !def) continue;
    const score = api.itemScore(item,job), affixes = [], cards = [], cardComparisons = [];
    for (const [index,affix] of (item.affixes || []).entries()) {
      let pool = primary.includes(affix.stat) ? primary : categories.find(group=>group.includes(affix.stat));
      if (!pool) continue;
      // Piercing eligibility varies by weapon. Do not suggest adding it to a different item.
      pool = pool.filter(stat=>stat!=="pierce" || affix.stat==="pierce");
      for (const stat of pool) {
        if (stat===affix.stat || primary.includes(stat) && item.affixes.some((a,i)=>i!==index && a.stat===stat)) continue;
        const value = Number((primary.includes(stat) ? affix.value : affix.value/baseValue[affix.stat]*baseValue[stat]).toFixed(6));
        const replacement = {...affix,stat,value};
        const changed = {...item,affixes:item.affixes.map((a,i)=>i===index?replacement:a)};
        const next = api.itemScore(changed,job);
        if (next>score) affixes.push({index,from:affixText(affix),to:affixText(replacement),delta:next-score,score:next});
      }
    }
    for (const [socket,current] of (item.cards || []).entries()) {
      for (const {id,source} of candidates) {
        const compound = source.card.compound;
        const fits = compound===def.slot || compound==="headgear" && def.slot.startsWith("head_") ||
          compound==="acc" && /^(acc|accessory)/.test(def.slot) ||
          compound==="accessory" && /^(acc|accessory)/.test(def.slot);
        if (!fits || id===current) continue;
        const next = api.itemScore({...item,cards:item.cards.map((c,i)=>i===socket?id:c)},job);
        cardComparisons.push({socket,current:current?nameOf(current):"空卡槽",currentId:current,
          name:nameOf(id),id,effects:source.card.bonuses.map(text).filter(Boolean),
          delta:next-score,score:next,source:{...source,card:undefined}});
      }
    }
    affixes.sort((a,b)=>a.index-b.index || b.delta-a.delta);
    cardComparisons.sort((a,b)=>b.delta-a.delta || (a.source.seconds??Infinity)-(b.source.seconds??Infinity) || a.id-b.id);
    cards.push(...cardComparisons.filter(card=>card.delta>0));
    result.push({slot,uid,name:api.formatGear(item.itemId,""),tier:item.tier,refine:item.refine || 0,star:item.star || item.stars || 0,score,
      fixed:(def.bonuses || []).map(text).filter(Boolean),
      currentAffixes:(item.affixes || []).map(affixText),
      currentCards:(item.cards || []).map(id=>({id,name:id?nameOf(id):"空卡槽",score:id?api.cardScore(id,job):0})),
      compatibleCards:new Set(cardComparisons.map(card=>card.id)).size,
      bestCard:cardComparisons[0] ? {name:cardComparisons[0].name,delta:cardComparisons[0].delta} : null,
      affixes,cards:cards.filter((card,index,rows)=>rows.findIndex(row=>row.id===card.id)===index).slice(0,8)});
  }
  return {at:Date.now(),id:character.id,name:character.name,job,jobName:api.jobName?.(job)||job,gs,frontier,items:result,
    candidateCards:sources.size,includeBoss:Boolean(options.includeBoss)};
}
function installGsAdvisor(api) {
  const root = document.documentElement;
  if (window.__roGsAdviceListener) document.removeEventListener("ro-helper-gs-request",window.__roGsAdviceListener);
  const handler = event => {
    try {
      const options = JSON.parse(event.detail || "{}"), character = api.character();
      if (!character) throw Error("請登入角色後再讀取");
      if (!Array.isArray(character.inventory)) throw Error("角色裝備資料尚未載入");
      const data = buildGsAdvice(api,character,options);
      root.dataset.roHelperGsAdvice = JSON.stringify(data);
    } catch(error) {
      root.dataset.roHelperGsAdvice = JSON.stringify({at:Date.now(),error:"GS 建議："+error.message});
    }
  };
  window.__roGsAdviceListener = handler;
  document.addEventListener("ro-helper-gs-request",handler);
  if(window.__roDifficultyAdviceListener)document.removeEventListener("ro-helper-difficulty-request",window.__roDifficultyAdviceListener);
  window.__roDifficultyAdviceListener=event=>{
    try{
      const character=api.character();if(!character)throw Error("請先登入角色");
      root.dataset.roHelperDifficultyAdvice=JSON.stringify(buildDifficultyAdvice(api,character,JSON.parse(event.detail||"{}")));
    }catch(error){root.dataset.roHelperDifficultyAdvice=JSON.stringify({at:Date.now(),error:error.message});}
  };
  document.addEventListener("ro-helper-difficulty-request",window.__roDifficultyAdviceListener);
  root.dataset.roHelperGsReady = "on";
}

async function createGearAnalysis(imported,doc,characterName){
const ye=imported["ye"];
const Ht=imported["Ht"];
const tt=imported["tt"];
const Nh=imported["Nh"];
const _e=imported["_e"];
const Gm=imported["Gm"];
const Xo=imported["Xo"];
const kt=imported["kt"];
const Yo=imported["Yo"];
const Oe=imported["Oe"];
const Vm=imported["Vm"];
const mr=imported["mr"];
const Km=imported["Km"];
const Wm=imported["Wm"];
const Xm=imported["Xm"];
const Ym=imported["Ym"];
const fr=imported["fr"];
const UM=imported["UM"];
const ow=imported["ow"];
const Jm=imported["Jm"];
const Qm=imported["Qm"];
const iw=imported["iw"];
const GM=imported["GM"];
const VM=imported["VM"];
const KM=imported["KM"];
const WM=imported["WM"];
const XM=imported["XM"];
const YM=imported["YM"];
const JM=imported["JM"];
const Qi=imported["Qi"];
const es=imported["es"];
const Zm=imported["Zm"];
const be=imported["be"];
const dw=imported["dw"];
const ks=imported["ks"];
const jh=imported["jh"];
const _l=imported["_l"];
const It=imported["It"];
const et=imported["et"];
const hw=imported["hw"];
const bl=imported["bl"];
const ZM=imported["ZM"];
const _p=imported["_p"];
const rw=imported["rw"];
const c=imported["c"];
const QM=imported["QM"];
const FM=imported["FM"];
const Um=imported["Um"];
const e$=imported["e$"];
const Zi=imported["Zi"];
const zM=imported["zM"];
const Xa=imported["Xa"];
const Zo=[{key:"count",name:"Número de enemigos",min:1,max:20,om:3},{key:"damage",name:"Daño de los enemigos",min:1,max:20,om:1.5},{key:"hp",name:"Vida de los enemigos",min:1,max:20,om:2},{key:"speed",name:"Velocidad de los enemigos",min:1,max:20,om:1.5},{key:"events",name:"Número de eventos",min:1,max:20,om:2},{key:"tier",name:"刷關等級",min:1,max:20,om:1}];
const RO_LCF=(function makeCurve(KO, C, OLD) {
  const val = (a, s) => Math.min(s.max, Math.max(s.min, +(a && a[s.key]) || s.min));
  const by = k => KO.find(s => s.key === k);
  const K = Math.log(C.MAX) / Math.log(20);
  function base(a) {   // 官方範圍的倍率 b（1～2），跟原本 SR 一樣
    const B = KO.filter(s => s.key !== 'tier'), e = 1 / B.length; let b = 1;
    for (const s of B) { const o = s.om ?? s.max; b += e * (Math.min(val(a, s), o) - s.min) / (o - s.min); }
    return b;
  }
  function gm(a) { let g = 0; for (const s of KO) g += Math.log(Math.max(1, val(a, s))); return Math.exp(g / KO.length); }
  function M(a) { return Math.max(base(a), Math.min(C.MAX, Math.pow(gm(a), K))); }
  // 一般怪卡片／蛋用的難度倍率（上限 CARD_MAX）與怪物量修正 V
  function Mc(a) { return Math.max(base(a), Math.min(C.CARD_MAX, Math.pow(gm(a), Math.log(C.CARD_MAX) / Math.log(20)))); }
  function V(a) {
    const c = by('count'), ev = by('events'); if (!c || !ev) return 1;
    const raw = (n, e) => n * (1 + C.HORDE * (e - 1));
    const n = val(a, c), e = val(a, ev);
    return Math.max(1, raw(n, e) / raw(Math.min(n, c.om ?? c.max), Math.min(e, ev.om ?? ev.max)));
  }
  // killEnemy 的 o（卡片、寵物蛋用）：王＝原本倍率 OLD；一般怪＝Mc×V^−CARD_ALPHA
  function Bc(a) {   // 王卡／王的蛋倍率：GM≤表首照原本，之後依 ln GM 內插 BOSS_CARD，且不低於原本
    const o = OLD ? OLD(a) : M(a), t = C.BOSS_CARD, g = gm(a);
    if (!t || !t.length || g <= t[0][0]) return o;
    let v = t[t.length - 1][1];
    for (let i = 1; i < t.length; i++) if (g <= t[i][0]) { const [g0, v0] = t[i - 1], [g1, v1] = t[i]; v = v0 + (v1 - v0) * (Math.log(g) - Math.log(g0)) / (Math.log(g1) - Math.log(g0)); break; }
    return Math.max(o, v);
  }
  function G(a, boss) { return boss ? Bc(a) : Mc(a) * Math.pow(V(a), -C.CARD_ALPHA); }
  // 一般怪的裝備＝原本的掉寶倍率（所有關卡）
  function GG(a) { return OLD ? OLD(a) : M(a); }
  const ST = st => (C.STAGES && C.STAGES[st]) || null;
  // 生怪量（相對 ×1）：W＝數量 ×（1＋HORDE×(事件−1)）
  function W(a) { const c = by('count'), ev = by('events'); return (c ? val(a, c) : 1) * (1 + C.HORDE * ((ev ? val(a, ev) : 1) - 1)); }
  // 整場理論總件數（全清的單人、不篩選、不封頂）
  function total(a, st) { const s = ST(st); return (s && s.ref || C.REF1) * GG(a) * W(a); }
  // 一場傳說目標（全清、只撿傳說）
  function T(a) { const r = Math.log(Math.max(1, gm(a))) / Math.log(20); return C.LEG_TOTAL * Math.pow(Math.min(1, r), C.LEG_POW); }
  // 傳說：原本＝保底 q0＝(Σln 滑桿 ÷ Σln 上限)^3，沒中再抽品質表（無尋寶率時傳說 T0＝1.48%）
  //   → q＝保底機率；k＝品質表抽到傳說時保留的機率（沒保留就降成史詩）
  function P(a, st) {
    let n = 0, m = 0; for (const s of KO) { n += Math.log(Math.max(1, val(a, s))); m += Math.log(s.max); }
    const q0 = m ? Math.pow(n / m, 3) : 0, t0 = C.T0, old = q0 + (1 - q0) * t0, tot = total(a, st);
    if (tot <= C.CAP) return { q: q0, k: 1, p: old };
    const L = Math.min(old, T(a) / tot);
    if (L >= old) return { q: q0, k: 1, p: old };
    if (L > t0) return { q: (L - t0) / (1 - t0), k: 1, p: L };
    return { q: 0, k: L / t0, p: L };
  }
  function L(a, st) { return P(a, st).p; }
  return { M, Mc, Bc, V, G, GG, W, total, T, P, L, base, gm };
})(Zo,{"MAX":12.5,"BOSS_CARD":[[5,20],[10,50],[20,75]],"CARD_MAX":6,"CARD_ALPHA":0.45,"HORDE":0.1455,"REF1":2.6,"CAP":100,"LEG_TOTAL":95,"LEG_POW":1,"T0":0.01483679525222552,"STAGES":{"orcs":{"ref":2.7},"pyramid":{"ref":2.6},"maze":{"ref":1.1},"xmas":{"ref":2.9},"louyang":{"ref":2.7}}},ar);
function ar(a){const B=Zo.filter(s=>s.key!=="tier"),e=1/B.length,T=Math.min(20,Math.max(1,+a.tier||1));let b=1,E=1;for(const s of B){const v=Math.max(s.min,+a[s.key]||s.min),o=s.om??s.max;b+=e*(Math.min(v,o)-s.min)/(o-s.min);E*=Math.max(1,v/o)}E*=T;return Math.min(20,b*Math.pow(E,0.37))}
const ba=10;
const uC=[.04,.04,.04,.04,.06,.06,.06,.12,.12,.12];
const pC={단검:0,너클:.15,채찍:.15,악기:.2,책:.25,롯드:.3,클럽:.3,검:.35,창:.4,도끼:.45,활:.55,권총:.55,라이플:.7,카타르:.75,수리검:.75,샷건:.85,양손검:.9,양손창:.95,양손도끼:1};
const mC=new Set(["롯드","책"]);
const fC=.4;
const gC={armor:4,shield:3,head_top:2,garment:2,shoes:2};
function yC(a){var r,l;const e=ye[a.itemId];if(!e||e.starter)return{atk:0,matk:0,def:0};const t=zM(Math.min(bn(a)>8?bn(a):bn(a)>3?8:3,bn(a)+(e.secret?1:0)));if(e.slot!=="weapon")return{atk:0,matk:0,def:(gC[e.slot]??0)*t.mult};const[s,n]=Xa,o=pC[e.wtype??""]??(Qi(e)||!e.wtype&&(e.jobs||[]).includes("taekwon")?.8:.15),i=(s+(n-s)*o)*t.weaponMult*(((r=Oe[a.quality??0])==null?void 0:r.baseMult)??1);return mC.has(e.wtype??"")?{atk:i*fC,matk:i,def:0}:{atk:i,matk:(l=e.base)!=null&&l.matk?i:0,def:0}}
function Ma(a,e=a.refine??0){const t=yC(a),s=vr(e)*RO_STARM(a);return{atk:Math.round(t.atk*s),matk:Math.round(t.matk*s),def:Math.round(t.def*s*10)/10}}
function vr(a){return 1+uC.slice(0,Math.max(0,Math.min(ba,a??0))).reduce((e,t)=>e+t,0)}
function Go(a){var t;const e=(vr(a.refine)*RO_STARM(a));return[...((t=ye[a.itemId])==null?void 0:t.bonuses)??[],...jh(a.itemId,bn(a)),...Gm(a.affixes)].map(s=>FM(s,e))}
function os(a){const e=RO_NMINS(Xo(a.itemId,Um(a.affixes)),Xo(a.itemId,""),RO_ITEMSFX(a));return RO_STARNM(a,a.refine?`+${a.refine} ${e}`:e)}
const Sl="ro-survivors.";
const Lk="ro-survivors.dev.";
let Fh=!1;
let Fi=null;
const Ro=new Map;
let Co=null;
function Pu(a){return Fh||!Fi||!a.startsWith(Fi)?null:a.slice(Fi.length)}
const is={getItem(key){const k=key.replace(/^ro-survivors\.(?:acct\.[^.]+\.)?/,"");const value=doc[k];return value==null?null:typeof value==="string"?value:JSON.stringify(value)}};
function Ct(a){return a.startsWith(Sl)?Fh?Lk+a.slice(Sl.length):Fi?Fi+a.slice(Sl.length):a:a}
const Pt=[];
function lt(a,e,t,s,n){Pt.push({id:a,egg:e,acc:t,bonuses:s,from:n})}
lt("poring",9001,10013,[Vm(3),mr(.01)]);
lt("lunatic",9004,10007,[mr(.02),Km(.02)]);
lt("drops",9002,10013,[Km(.04)]);
lt("picky",9005,10012,[Wm(2),Km(.02)]);
lt("savage_babe",9009,10015,[Xm(2),Ym(40)]);
lt("baby_desert_wolf",9010,10003,[fr(2),UM(.02)]);
lt("rocker",9011,10014,[ow(.5),Ym(25)]);
lt("familiar",9138,10031,[fr(3)]);
lt("mastering",9069,void 0,[Vm(4),mr(.02),Jm(.02)],"poring");
lt("whisper",9045,10027,[Jm(.05)]);
lt("spore",9012,10017,[Qm(3)]);
lt("poison_spore",9013,10017,[Wm(2),fr(2)]);
lt("poporing",9003,10013,[Vm(2),iw(.03)]);
lt("smokie",9015,10019,[GM(2),Jm(.02)]);
lt("dokebi",9019,10005,[fr(2),VM(.03)]);
lt("nine_tail",9095,10040,[mr(.02),Qm(2)]);
lt("willow",9103,10023,[fr(3)]);
lt("angeling",9088,void 0,[KM(.05),WM(.15)],"mastering");
lt("munak",9018,10008,[XM(2),fr(2)]);
lt("bon_gun",9025,10020,[Xm(3),Ym(20)]);
lt("sohee",9020,10016,[Wm(2),Qm(2)]);
lt("hyegun",9093,void 0,[Xm(4),iw(.04)],"bon_gun");
lt("cat_o_nine_tail",9096,void 0,[mr(.04),ow(.6)],"nine_tail");
lt("moonlight",9112,void 0,[mr(.04),YM(.6),JM(.03)]);
const Aa=Object.fromEntries(Pt.map(a=>[a.id,a]));
const ei=[{name:"Neutral",min:0,mult:.5},{name:"Cordial",min:750,mult:.75},{name:"Leal",min:910,mult:1}];
const wa=1.5;
function _k(a){return[...ei].reverse().find(e=>a>=e.min)}
function gf(a,e=Ba()){return Aa[a]?e.pets[a]:void 0}
function Ik(a){return _k(a.intimacy).mult*(a.acc?wa:1)}
function Rk(a,e=Ba()){const t=Aa[a],s=gf(a,e);if(!t||!s)return[];const n=Ik(s);return t.bonuses.map(o=>({apply:(i,r)=>o.apply(i,n*r),text:i=>o.text(n*i)}))}
function $a(a){return a.pet&&gf(a.pet)?a.pet:null}
const Bk={damageMult:250,speedMult:120,areaMult:100,extraProjectiles:30,armor:4,damageReduction:250,maxHp:.25,maxHpPct:180,regen:12,regenStill:6,regenMoving:6,regen5:2,lifesteal:300,discovery:80,dotDmg:80,critChance:150,pierceChance:60,critMult:50,doubleChance:150,flee:220,expMult:60,zenyMult:30,potionMult:20,bossUndeadMult:70,bossEliteMult:70,lowHpDamage:40,lowHpBleed:50,endureReduction:60,endureReflect:40,berserk:20,bleedLifesteal:50,petrifyChance:80,stunChance:120,revives:60,castHaste:60,haste:250,atk:.3,matk:.3,str:1,agi:1.5,vit:1.5,int:1,dex:1.5,luk:1.5};
const CC={melee:{atk:1.2,str:3,dex:1.5,reachMult:80,critChance:180,castHaste:40},ranged:{atk:1.2,dex:3,str:1,projSpeedMult:40,extraProjectiles:50,critChance:180,pierceChance:150,castHaste:40},magic:{matk:1.2,int:3,dex:2.5,atk:.2,str:.3,castHaste:180,critChance:180,doubleChance:40}};
const TC={pickupRadius:40};
const Ny=20;
const LC=Bk.damageReduction*(Yo(Ny+1)-Yo(Ny));
const Dy=new Map;
function Nk(a){let e=Dy.get(a);return e||Dy.set(a,e={...Bk,...CC[be(a).scaling]}),e}
const Hy=new WeakMap;
function vf(a,e){let t=Hy.get(a);t||Hy.set(a,t=new Map);let s=t.get(e);return s===void 0&&t.set(e,s=AC(a,e)),s}
function AC(a,e){const t=es(be(e)),s=es(be(e));a.apply(s,1);const n=Nk(e);let o=0;for(const i of Object.keys(t)){if(i==="ext")continue;const r=s[i]-t[i];if(!r)continue;const l=TC[i];l!==void 0?o+=l*(r/t[i]):o+=(n[i]??0)*r}return o}
function PC(a,e){const t=Ma(a),s=Nk(e);return(s.atk??0)*t.atk+(s.matk??0)*t.matk+LC*t.def}
const jC=60;
function qC(a,e){const t=QM(e);return rw(a.affixes,(vr(a.refine)*RO_STARM(a))).reduce((s,n)=>s+(t.includes(n.skill)?n.dmg*jC:0),0)}
const wf=a=>Math.max(0,Math.round(a));
function Ti(a,e){const v=Ti__raw(a,e);return typeof RO_CARDFLOOR=="function"?RO_CARDFLOOR(a,e,v):v}
function Ti__raw(a,e){const t=typeof a=="number"?Ht[a]:a;return t?wf(t.bonuses.reduce((s,n)=>s+vf(n,e),0)):0}
const _C=3;
const IC=.25;
function RC(a){const e=ye[a.itemId];return!e||e.starter?0:_C*bn(a)*(1+IC*(a.quality??0))}
function OC(a,e){const t=ye[a.itemId];if(!t)return 0;const s=[...t.bonuses,...jh(a.itemId,bn(a)),...Gm(a.affixes)].reduce((n,o)=>n+vf(o,e),0)*(vr(a.refine)*RO_STARM(a));return wf(PC(a,e)+s+qC(a,e)+RC(a))}
function BC(a,e){const t=$a(a);return t?Dk(t,e):0}
function Dk(a,e){const t=gf(a);return t?wf(Aa[a].bonuses.reduce((s,n)=>s+vf(n,e),0)*Ik(t)):0}
function or(a,e){const v=OC(a,e)+a.cards.reduce((t,s)=>t+(s?Ti(s,e):0),0);return Qi(ye[a.itemId])?Math.round(v*1.75):v}
function Hk(a){const e=es(dr(a));return Uh(a).applyStats(e),Zm(e,be(a.promotion??a.job).rank),e.damageReduction=Math.min(.6,e.damageReduction),e.flee=Math.min(.5,e.flee),dw(e),e.maxHp=Math.max(30,Math.round(e.maxHp)),e}
function lm(a){const e=e$[a.job];return e&&!a.equipped.weapon?e:null}
function NC(a,e){const t=a;for(const[s,n]of Object.entries(e))typeof n=="number"&&(t[s]=(t[s]??0)+n)}
function Gn(a){const e=[];for(const{id:t}of ks){const s=a.equipped[t],n=s?a.inventory.find(i=>i.uid===s):void 0,o=n?ye[n.itemId]:void 0;n&&o&&e.push({slot:t,inst:n,def:o})}return e}
const DC={archer:.85};
const HC={swordsman:{oneHand:.75,twoHand:1.25},merchant:{oneHand:.75,twoHand:1.25},thief:{oneHand:.35,twoHand:.5}};
function Uh(a){var w,f,m;const e={},t={},s=[],n=[],o=[],i=_l(RO_TJ(a));o.push(v=>{for(const{id:x}of It)v[x]+=a.stats[x]-1});const r=i.reduce((v,x)=>v*(DC[x]??1),1);r!==1&&o.push(v=>v.ext.jobDmg=r);const l=(w=Gn(a).find(v=>v.slot==="weapon"))==null?void 0:w.def.wtype,d=Qd(a);for(const[v,x]of Object.entries(a.talents)){const k=et[v];if(!(!k||x<=0||!i.includes(k.job))&&(k.learn&&n.push(k.learn),!!hw(k,l,d))){if(k.stat&&o.push(M=>k.stat(M,x)),(f=k.gearStat)!=null&&f.weapons.includes(l??"")&&o.push(M=>k.gearStat.stat(M,x)),k.mod)for(const M of[k.mod.skill,...k.mod.also??[]]){const $=e[M]??(e[M]=bl());for(const[P,q]of Object.entries(k.mod.per)){const R=$;P==="splashR"?R.splashR=Math.max(R.splashR,q):R[P]+=q*x}k.mod.hit&&NC($.hit,k.mod.hit(x)),(t[M]??(t[M]=[])).push({name:k.name,text:k.desc(x)})}k.start&&s.push(k.start)}}const h=i.map(v=>HC[v]).find(Boolean);h&&!ZM.has(l??"")&&((e[m=_p]??(e[m]=bl())).dmg+=Qi(Uk(a,"weapon"))?h.twoHand:h.oneHand);for(const{inst:v}of Gn(a)){const x=Ma(v);(x.atk||x.matk||x.def)&&o.push(k=>{k.atk+=x.atk,k.matk+=x.matk,k.def+=x.def});for(const k of Go(v))o.push(M=>k.apply(M,1));for(const{skill:k,dmg:M}of rw(v.affixes,(vr(v.refine)*RO_STARM(v))))(e[k]??(e[k]=bl())).dmg+=M,(t[k]??(t[k]=[])).push({name:os(v),text:c("+{p}% de daño",{p:Math.round(M*100)})});for(const k of v.cards){const M=k?Ht[k]:void 0;if(M)for(const $ of M.bonuses)o.push(P=>$.apply(P,1))}}const u=$a(a);if(u)for(const v of Rk(u))o.push(x=>v.apply(x,1));RO_MT&&RO_MT.stat(a,o);const p=Gn(a).find(v=>v.slot==="weapon"),y=p?{itemId:p.inst.itemId,wtype:p.def.wtype}:null;return{applyStats:v=>o.forEach(x=>x(v)),mods:e,skillTalents:t,starts:s,learned:n,missingWeapon:lm(a),weapon:y,shield:d,pet:u}}
function Qd(a){return Gn(a).some(e=>e.slot==="shield"&&e.def.slot==="shield")}
function Uk(a,e){const t=a.equipped[e],s=t?a.inventory.find(n=>n.uid===t):void 0;return s?ye[s.itemId]:void 0}
function yo(a){const e=tt[a],t=e.bosses.map(s=>({id:s.id,t:s.t}));return{monsters:[...new Set(e.waves.flatMap(s=>s.pool))],minis:t.slice(0,-1),mvp:t[t.length-1],map:e.map,storyOnly:e.storyOnly}}
const xe=[{id:"prontera",name:"Campos de Prontera",place:"Al sur de Prontera",levels:"1–8",tier:1,gsMin:0,...yo("prontera")},{id:"sewer",name:"Alcantarillas de Prontera",place:"Bajo las calles de Prontera",levels:"9–12",tier:1,gsMin:20,...yo("sewer")},{id:"sunken",name:"Barco hundido",place:"Costa de Alberta",levels:"13–15",tier:1,gsMin:40,story:"sunken_story",...yo("sunken")},{id:"byalan",name:"Isla de Byalan",place:"Mazmorra de Izlude",levels:"16–20",tier:2,gsMin:110,...yo("byalan")},{id:"payon",name:"Bosque de Payon",place:"Alrededores de Payon",levels:"21–25",tier:2,gsMin:135,...yo("payon")},{id:"payon_cave",name:"Cueva de Payon",place:"Bajo las montañas de Payon",levels:"26–30",tier:2,gsMin:165,...yo("payon_cave")},{id:"prt_castle",name:"Castillo de Prontera",place:"Sala del trono",levels:"31–35",tier:2,gsMin:185,jobLvMin:50,...yo("prt_castle")},{id:"orcs",name:"Aldea orca",place:"Campos de Geffen",levels:"31–40",tier:3,gsMin:400,...yo("orcs")},{id:"pyramid",name:"Pirámides de Morroc",place:"Desierto de Morroc",levels:"41–50",tier:3,gsMin:650,...yo("pyramid")},{id:"maze",name:"Bosque laberinto",place:"Al norte de Prontera",levels:"51–60",tier:3,gsMin:900,...yo("maze")},{id:"xmas",name:"Navidad",place:"Lutie",levels:"61–65",tier:3,special:true,gsMin:900,...yo("xmas")},{id:"louyang",name:"Feria de faroles de Louyang",place:"Louyang",levels:"61–70",tier:3,special:true,gsMin:900,...yo("louyang")},{id:"c2_gef",name:"Mazmorra de Geffen",place:"Bajo Geffen",levels:"71–76",tier:8,chapter:2,gsMin:2360,...yo("c2_gef")},{id:"c2_clock",name:"Sótano de la Torre del Reloj",place:"Al De Baran",levels:"77–82",tier:8,chapter:2,gsMin:2410,...yo("c2_clock")},{id:"c2_abyss",name:"Lago del Abismo",place:"Nido de dragones",levels:"83–88",tier:8,chapter:2,gsMin:2460,...yo("c2_abyss")},{id:"c2_glast",name:"Monasterio de Glast Heim",place:"Glast Heim",levels:"89–94",tier:8,chapter:2,gsMin:2500,...yo("c2_glast")},{id:"c2_nif",name:"Campos de Niflheim",place:"Niflheim",levels:"95–99",tier:8,chapter:2,gsMin:2550,...yo("c2_nif")}];
function RO_GSJ(a){return typeof RO_TJ==="function"?RO_TJ(a):a.job}
function wr(a){return Gn(a).reduce((e,t)=>e+or(t.inst,RO_GSJ(a)),0)+BC(a,RO_GSJ(a))}
const KC={mastering:["golden_thief_bug"],kraken:["eddga","moonlight"]};
function Zd(a,e){return a.includes(e)||(KC[e]??[]).some(t=>a.includes(t))}
function eh(a,e,t=wr(a)){if(RO_LAP&&RO_LAP.isC2(e))return RO_LAP.eh(a,e,t,1);return RO_EH0(a,e,t)}
function RO_EH0(a,e,t=wr(a)){const s=xe[e],n=RO_ACCMVP(a),o=RO_FSPREV(e),i=!o||Zd(n,o.mvp.id),r=t>=s.gsMin,l=!s.jobLvMin||a.jobLevel>=s.jobLvMin,d=!s.story||(a.stagesCleared??[]).includes(s.story),h=!!s.storyOnly&&(!!a.promotion||(a.stagesCleared??[]).includes(s.id));return{needMvp:o,mvpOk:i,gsOk:r,jobOk:l,unlocked:i&&r&&l,cleared:Zd(n,s.mvp.id),storyOk:d,closed:h}}
function hc(a){var t,s;const e=((t=xe.find(n=>n.id===a||n.story===a))==null?void 0:t.levels)??"";return Number(((s=e.match(/\d+/g))==null?void 0:s.pop())??10)}
function bn(a){var t;if(a.tier)return a.tier;const e=WC(a);return((t=xe.find(s=>hc(s.id)>=e))==null?void 0:t.tier)??xe[xe.length-1].tier}
const qu=new Map;
function WC(a){var e;if(a.ilvl)return a.ilvl;if(!qu.size)for(const t of[...xe].reverse()){const s=[...t.monsters,...t.minis.map(o=>o.id),t.mvp.id].flatMap(o=>(Zi[o]??[]).map(i=>i.id)),n=(e=tt[t.id])==null?void 0:e.reward;for(const o of n?[...s,n]:s)qu.set(o,hc(t.id))}return qu.get(a.itemId)??10}
const Df="ro-survivors.characters.v1";
function dr(a){const e=be(a.job);if(!a.promotion)return e;const t=be(a.promotion);return{...e,hp:t.hp,speed:t.speed,rank:t.rank}}
function RO_POK(j,p){if(!p||p===j)return!1;const d=be(p);return d.id===p&&!!d.base&&_l(p).includes(j)}
function RO_TJ(a){return a&&a.promotion&&RO_POK(a.job,a.promotion)?a.promotion:a.job}
function zf(a){try{const e=is.getItem(a);return e?JSON.parse(e):null}catch{return null}}
function gn(){const a=zf(Ct(Df));return Array.isArray(a)?a.filter(e=>e&&e.id&&e.look):[]}
var RO_MT=null;
var RO_LAPC={"stages":null,"max":6,"curve":{"hp":181.01933598375618,"dmg":22.91765149399039,"gs":4.976041599504569},"suffix":["","・改","・改²","・改³","・改⁴","・改⁵"],"label":["一周目","二周目","三周目","四周目","五周目","六周目"],"tierMax":8,"cardStep":1000000,"cardMult":[1,1.5,2,2.5,3,3.5],"cardNoScale":[4144],"exp":{"from":3,"base":54,"span":44,"mult":[1,1,1.25,1.5,1.75,2],"minLv":70,"lowMult":1,"baseK":0.3333333333333333,"jobK":0.025,"pen":{"slope":0.08,"floor":0.15}}};
var RO_C2T={"c2_gef":[{"hp":1,"dmg":1,"gate":2360,"tier":6,"mult":1.5},{"hp":1.5466,"dmg":1.3004,"gate":2650,"tier":7,"mult":1.75},{"hp":2.3446,"dmg":1.6709,"gate":2950,"tier":8,"mult":2},{"hp":3.9277,"dmg":2.28,"gate":3400,"tier":8,"mult":2},{"hp":7.1436,"dmg":3.2692,"gate":3950,"tier":8,"mult":2},{"hp":14.0046,"dmg":4.9042,"gate":4600,"tier":8,"mult":2}],"c2_clock":[{"hp":1,"dmg":1,"gate":2410,"tier":6,"mult":1.5},{"hp":1.5355,"dmg":1.2948,"gate":2700,"tier":7,"mult":1.75},{"hp":2.3857,"dmg":1.6885,"gate":3030,"tier":8,"mult":2},{"hp":4.0884,"dmg":2.3358,"gate":3500,"tier":8,"mult":2},{"hp":7.5822,"dmg":3.3887,"gate":4090,"tier":8,"mult":2},{"hp":14.9124,"dmg":5.0934,"gate":4750,"tier":8,"mult":2}],"c2_abyss":[{"hp":1,"dmg":1,"gate":2460,"tier":6,"mult":1.5},{"hp":1.525,"dmg":1.2895,"gate":2750,"tier":7,"mult":1.75},{"hp":2.4253,"dmg":1.7053,"gate":3100,"tier":8,"mult":2},{"hp":4.2455,"dmg":2.3894,"gate":3600,"tier":8,"mult":2},{"hp":8.0165,"dmg":3.5044,"gate":4230,"tier":8,"mult":2},{"hp":15.8133,"dmg":5.2766,"gate":4900,"tier":8,"mult":2}],"c2_glast":[{"hp":1,"dmg":1,"gate":2500,"tier":6,"mult":1.5},{"hp":1.515,"dmg":1.2844,"gate":2800,"tier":7,"mult":1.75},{"hp":2.4635,"dmg":1.7214,"gate":3180,"tier":8,"mult":2},{"hp":4.399,"dmg":2.4411,"gate":3700,"tier":8,"mult":2},{"hp":8.446,"dmg":3.6163,"gate":4360,"tier":8,"mult":2},{"hp":16.706,"dmg":5.4541,"gate":5050,"tier":8,"mult":2}],"c2_nif":[{"hp":1,"dmg":1,"gate":2550,"tier":6,"mult":1.5},{"hp":1.5056,"dmg":1.2795,"gate":2850,"tier":7,"mult":1.75},{"hp":2.5003,"dmg":1.7369,"gate":3250,"tier":8,"mult":2},{"hp":4.5489,"dmg":2.4909,"gate":3800,"tier":8,"mult":2},{"hp":8.8703,"dmg":3.7247,"gate":4500,"tier":8,"mult":2},{"hp":17.5894,"dmg":5.626,"gate":5200,"tier":8,"mult":2}]};
function RO_LAPST(sid){try{const s=xe.find(x=>x.id===sid);return!!s&&!!s.map&&!s.storyOnly&&(!RO_LAPC.stages||RO_LAPC.stages.includes(sid))}catch{return!1}}
var RO_LAPKC={};
function RO_LAPAVG(sid){const w=(tt[sid]||{}).waves||[];let h=0,d=0,x=0,l=0,t=0;for(const v of w){const p=(v.pool||[]).map(i=>_e[i]).filter(Boolean),u=Math.max(0,(v.to||0)-(v.from||0));if(!p.length||!u)continue;h+=u*p.reduce((a,m)=>a+(m.hp||0),0)/p.length;d+=u*p.reduce((a,m)=>a+(m.damage||0),0)/p.length;x+=u*p.reduce((a,m)=>a+(m.exp||0),0)/p.length;l+=u*p.reduce((a,m)=>a+(m.level||0),0)/p.length;t+=u}return t?{hp:h/t,dmg:d/t,exp:x/t,lv:l/t}:null}
function RO_LAPLIST(){return xe.filter(s=>RO_LAPST(s.id)&&!s.special&&s.chapter!==2)}
function RO_LAPK(sid,n){const key=sid+"|"+n;if(RO_LAPKC[key])return RO_LAPKC[key];if(RO_C2T[sid]){const T=RO_C2T[sid][Math.max(1,Math.min(RO_LAPC.max,n))-1];return RO_LAPKC[key]={hp:T.hp,damage:T.dmg,exp:1,lv:0,mult:T.mult,mlv:(RO_LAPAVG(sid)||{}).lv||0,gs:T.gate,jobCap:(tt[sid]||{}).jobCap}}const L=RO_LAPLIST(),R=L[L.length-1],k=L.findIndex(s=>s.id===sid);let o={hp:1,damage:1,exp:1,lv:0,gs:0,jobCap:void 0};if(k<0&&R&&R.id!==sid&&(xe.find(s=>s.id===sid)||{}).special&&RO_LAPST(sid)){const r=RO_LAPK(R.id,n),A=RO_LAPAVG(sid),P=L.length,f=((n-2)*P+P)/(P*(RO_LAPC.max-1));return RO_LAPKC[key]=n>1&&A?{...r,...RO_LAPEXK(A,A,f,n,RO_LAPC)}:r}try{const A=RO_LAPAVG(sid),B=R&&RO_LAPAVG(R.id);if(n>1&&A&&B&&k>=0){const P=L.length,f=((n-2)*P+k+1)/(P*(RO_LAPC.max-1)),cv=RO_LAPC.curve;o={hp:Math.max(1,B.hp*Math.pow(cv.hp,f)/Math.max(1,A.hp)),damage:Math.max(1,B.dmg*Math.pow(cv.dmg,f)/Math.max(1,A.dmg)),...RO_LAPEXK(A,B,f,n,RO_LAPC),gs:Math.ceil((R.gsMin||0)*Math.pow(cv.gs,f)),jobCap:(tt[R.id]||{}).jobCap}}}catch(e){console.error("[laps]",e)}return RO_LAPKC[key]=o}
var RO_LAPEXK=function lapExpK(A, B, f, n, C) {
  const E = C.exp || {};
  let lv = Math.max(0, Math.round(B.lv - A.lv));
  const exp = Math.max(1, B.exp / Math.max(0.1, A.exp));
  if (n >= (E.from || Infinity)) lv = Math.max(lv, Math.round(E.base + E.span * f - A.lv));
  const mult = n > 1 && E.mult ? E.mult[Math.min(E.mult.length, n) - 1] || 1 : 1;
  return { lv, exp, mult, mlv: A.lv + lv };
};
function RO_LAPTOP(){return Math.max(1,...xe.filter(s=>s.chapter!==2).map(s=>s.tier||1))}
function RO_ITEMSFX(a){try{const T=RO_LAPTOP();if(a&&a.tier===9)return"・世界王T9";if(a&&(a.ilvl|0)>70)return"・二章T"+(a.tier|0||8);if(!a||!(a.tier>T))return"";return RO_LAPC.suffix[Math.min(RO_LAPC.max,a.tier-T+1)-1]||""}catch{return""}}
function RO_NMINS(full,base,sfx){full=String(full??"");base=String(base??"");return!sfx?full:base&&full.startsWith(base)?base+sfx+full.slice(base.length):full+sfx}
var RO_LAP=null;
function RO_FSPREV(e){const s=xe[e];if(s&&s.special)return e>0?xe[e-1]:null;for(let i=e-1;i>=0;i--)if(xe[i]&&!xe[i].special)return xe[i];return null}
function RO_STARM(a){const n=a&&a.star|0;return n>0?Math.pow(1.05,Math.min(10,n)):1}
function RO_STARNM(a,s){return a&&a.star>0?s+" ★"+(a.star|0):s}
var RO_C2QC={"rolls":2,"up":[0.15,0.22,0.3,0.38,0.46,0.55],"leg":[0.04,0.06,0.09,0.12,0.15,0.2]};
var RO_ACC_C=null;
var RO_ACC_T=0;
function RO_ACCCH(){const t=Date.now();if(!RO_ACC_C||t-RO_ACC_T>300){try{RO_ACC_C=gn()}catch{RO_ACC_C=[]}RO_ACC_T=t}return RO_ACC_C}
function RO_ACCMVP(a){const s=new Set((a&&a.mvpsDefeated)||[]);try{for(const c of RO_ACCCH())for(const m of c.mvpsDefeated||[])s.add(m)}catch{}return[...s]}
function RO_ACCLAP(a,sid){let v=(a&&a.roLap&&a.roLap[sid])|0;try{for(const c of RO_ACCCH())v=Math.max(v,(c.roLap&&c.roLap[sid])|0)}catch{}return v}
var RO_CARDFLOOR=(()=>{let MV=null,MI=null;const F={"mini":20,"mvp":30},M=[1,1.5,2,2.5,3,3.5],NO=new Set([4144]);const sets=()=>{if(MV)return;const a=new Set,b=new Set;for(const s of xe||[]){if(!s)continue;if(s.mvp&&s.mvp.id)a.add(s.mvp.id);for(const m of s.minis||[])if(m&&m.id)b.add(m.id)}if(a.size)MV=a,MI=b};return(a,e,v)=>{try{const c=typeof a=="number"?Ht[a]:a;if(!c)return v;sets();if(!MV)return v;const b=c.base??c.id,o=Ht[b]||c,f=MV.has(o.monster)?F.mvp:MI.has(o.monster)?F.mini:0;if(!f)return v;const k=c.lap?(NO.has(b)?1:M[c.lap-1]||1):1;return Math.max(v,Math.round(f*k))}catch(x){return v}}})();
RO_LAP=(function lapClient(G, C) {
  const $ = q => document.querySelector(q);
  // 第二章（2026-11-18）：G.c2＝{ unlock:{stage, lap}, label, quality, advmat }（沒有＝只有第一章，舊測試用）
  //   CH＝目前的章節分頁；TAB＝這個章節的周目分頁（兩章各記各的）。第二章的周目跟第一章分開：第二章 n 周目＝打倒第二章 n−1 周目最後一關。
  const C2 = G.c2 || null;
  let CH = 1, TAB = 1;
  const TABS = { 1: 1, 2: 1 };
  const chOf = s => (s && s.chapter === 2 ? 2 : 1);
  const listOf = ch => G.stages().map((s, i) => ({ s, i })).filter(x => G.st(x.s.id) && chOf(x.s) === ch);
  const list = () => listOf(CH);   // 周目分頁裡能打的關卡（照順序；第一章含特殊關卡）
  // 「最後一關」＝最後一個一般關卡（特殊關卡 special 不算：打倒它不開下一個周目分頁，2026-11-17 元宵節）
  const lastOf = ch => { const L = listOf(ch).filter(x => !x.s.special); return L.length ? L[L.length - 1].s : null; };
  const last = () => lastOf(CH);
  function clearedAt(c, s, n) {   // 這一關的第 n 周目 MVP 打倒了沒
    if (!c || !s) return false;
    if (n <= 1) return G.zd(RO_ACCMVP(c), s.mvp.id);
    return RO_ACCLAP(c, s.id) >= n;
  }
  // 第二章開放：第一章 C2.unlock.stage 打到 C2.unlock.lap 周目（帳號共用：98_shareprog 把 clearedAt 換成看整個帳號）
  const c2Open = c => !!C2 && clearedAt(c, G.stages().find(x => x.id === C2.unlock.stage), C2.unlock.lap);
  const tabOpenCh = (c, n, ch) => (ch === 2 ? (n <= 1 ? c2Open(c) : c2Open(c) && clearedAt(c, lastOf(2), n - 1)) : n <= 1 || clearedAt(c, lastOf(1), n - 1));
  const tabOpen = (c, n) => tabOpenCh(c, n, CH);   // 第 n 周目分頁：打倒第 n−1 周目最後一關的 MVP
  const maxTabCh = (c, ch) => { let n = 1; while (n < C.max && tabOpenCh(c, n + 1, ch)) n++; return n; };
  const maxTab = c => maxTabCh(c, CH);
  const isC2 = i => { const s = typeof i === 'number' ? G.stages()[i] : G.stages().find(x => x.id === i); return chOf(s) === 2; };
  const gsNeed = (s, n) => (n > 1 && s ? G.k(s.id, n).gs : (s && s.gsMin) || 0);
  // 周目分頁裡的解鎖判斷（形狀同原本的 eh()）。nn：指定周目（第二章的關卡在「不是第二章分頁」的地方被問到時＝一周目）
  function eh(c, i, gs, nn) {
    const s = G.stages()[i], ch = chOf(s), n = nn || (ch === CH ? TAB : 1), L = listOf(ch), k = L.findIndex(x => x.i === i);
    if (!s || k < 0) return { needMvp: null, mvpOk: false, gsOk: false, jobOk: false, unlocked: false, cleared: false, storyOk: true, closed: true, lapSkip: !!s && !!s.storyOnly };   // lapSkip＝劇情關，周目不重打（清單、條件改顯示說明）
    // 前一關（同 95_festival RO_FSPREV）：一般關卡＝前面最近的一般關卡（特殊關卡不擋後面的關）；
    //   特殊關卡＝緊鄰的前一關、同周目（2026-11-17 兩個特殊關卡串起來：聖誕節・改 要迷宮森林・改，元宵節・改 要聖誕節・改）
    const P = s.special ? L.slice(0, k) : L.slice(0, k).filter(x => !x.s.special), prev = P.length ? P[P.length - 1].s : null;
    const mvpOk = prev ? clearedAt(c, prev, n) && (ch !== 2 || c2Open(c)) : tabOpenCh(c, n, ch);
    const gsOk = gs >= gsNeed(s, n), jobOk = !s.jobLvMin || c.jobLevel >= s.jobLvMin;
    // 第二章第 1 關的條件文字（一周目：第一章三周目最後一關；n 周目：第二章 n−1 周目最後一關）
    let c2req = '';
    if (ch === 2 && !prev && C2) {
      const u = n <= 1 ? G.stages().find(x => x.id === C2.unlock.stage) : lastOf(2), ln = n <= 1 ? C2.unlock.lap : n - 1;
      c2req = u ? `打倒${n <= 1 ? '第一章' : C2.label}${C.label[ln - 1]}「${u.name}${C.suffix[ln - 1] || ''}」的 MVP（帳號裡任一角色）` : '';
    }
    return { needMvp: prev, mvpOk, gsOk, jobOk, unlocked: mvpOk && gsOk && jobOk, cleared: clearedAt(c, s, n), storyOk: true, closed: true, c2req };
  }

return {eh,isC2};})({stages:()=>xe,zd:Zd,gs:wr,st:RO_LAPST,eh0:RO_EH0,k:RO_LAPK,top:RO_LAPTOP,c2:{unlock:{stage:"maze",lap:3},label:"第二章"}},RO_LAPC);
RO_MT={stat(a,o){if(Number(a?.mount?.until)>Date.now())o.push(v=>{for(const s of It)v[s.id]+=5;if(v.ext)v.ext.roMount=1;})}};
const bag=JSON.parse(is.getItem('ro-survivors.account.v1')||'{"inventory":[],"cards":{}}');
const characters=gn().map(c=>({...c,inventory:bag.inventory||[],cards:bag.cards||{}}));
const character=characters.find(c=>c.name===characterName);if(!character)throw Error('無法在目前帳號找到同名角色，請先開啟角色面板');
return {character:()=>character,job:RO_GSJ,jobName:j=>be(j).name,total:wr,itemScore:or,cardScore:Ti,formatGear:Xo,formatCard:kt,affixes:Gm,gear:ye,cards:Ht,stages:xe,scripts:tt,mobCard:Nh,mobs:_e,maxLap:RO_LAPC.max,stats:Hk,curve:RO_LCF,difficultyFields:Zo,lapStats:RO_LAPK,defReduction:Yo,qualities:Oe,chapterQuality:RO_C2QC,stageState:(c,i,g,n)=>(n>1||xe[i].chapter===2)?RO_LAP.eh(c,i,g,n):eh(c,i,g)};
}

  let __roGearAnalysisLoading;
  window.__roGearPrepareAnalysis=async(name)=>{
    if(__roGearAnalysisLoading)return __roGearAnalysisLoading;
    __roGearAnalysisLoading=(async()=>{
      if(location.hostname!=='ro.hans-webgametw.com')throw Error('GS 與 AI 難度目前支援漢斯版');
      const session=JSON.parse(localStorage.getItem('ro-survivors-session')||localStorage.getItem('ro-survivors-guest-session')||'null');
      if(!session?.token||!session.id)throw Error('請先登入角色後再讀取分析');
      const scripts=[...document.querySelectorAll('script[type="module"][src]')].map(s=>s.src);
      const main=scripts.find(s=>/\/build\/main[^/]*\.js/.test(s));if(!main)throw Error('找不到目前遊戲程式');
      const source=await(await fetch(main)).text();
      const imports=[
  {
    "name": "ye",
    "exportName": "br"
  },
  {
    "name": "Ht",
    "exportName": "bT"
  },
  {
    "name": "tt",
    "exportName": "ca"
  },
  {
    "name": "Nh",
    "exportName": "eW"
  },
  {
    "name": "_e",
    "exportName": "bj"
  },
  {
    "name": "Gm",
    "exportName": "bt"
  },
  {
    "name": "Xo",
    "exportName": "bp"
  },
  {
    "name": "kt",
    "exportName": "cl"
  },
  {
    "name": "Yo",
    "exportName": "bX"
  },
  {
    "name": "Oe",
    "exportName": "by"
  },
  {
    "name": "Vm",
    "exportName": "bA"
  },
  {
    "name": "mr",
    "exportName": "bB"
  },
  {
    "name": "Km",
    "exportName": "bC"
  },
  {
    "name": "Wm",
    "exportName": "bD"
  },
  {
    "name": "Xm",
    "exportName": "bE"
  },
  {
    "name": "Ym",
    "exportName": "bF"
  },
  {
    "name": "fr",
    "exportName": "bG"
  },
  {
    "name": "UM",
    "exportName": "bH"
  },
  {
    "name": "ow",
    "exportName": "bI"
  },
  {
    "name": "Jm",
    "exportName": "bJ"
  },
  {
    "name": "Qm",
    "exportName": "bK"
  },
  {
    "name": "iw",
    "exportName": "bL"
  },
  {
    "name": "GM",
    "exportName": "bM"
  },
  {
    "name": "VM",
    "exportName": "bN"
  },
  {
    "name": "KM",
    "exportName": "bO"
  },
  {
    "name": "WM",
    "exportName": "bP"
  },
  {
    "name": "XM",
    "exportName": "bQ"
  },
  {
    "name": "YM",
    "exportName": "bR"
  },
  {
    "name": "JM",
    "exportName": "bS"
  },
  {
    "name": "Qi",
    "exportName": "bx"
  },
  {
    "name": "es",
    "exportName": "bW"
  },
  {
    "name": "Zm",
    "exportName": "b$"
  },
  {
    "name": "be",
    "exportName": "j"
  },
  {
    "name": "dw",
    "exportName": "c0"
  },
  {
    "name": "ks",
    "exportName": "b_"
  },
  {
    "name": "jh",
    "exportName": "bs"
  },
  {
    "name": "_l",
    "exportName": "c1"
  },
  {
    "name": "It",
    "exportName": "c9"
  },
  {
    "name": "et",
    "exportName": "d"
  },
  {
    "name": "hw",
    "exportName": "c2"
  },
  {
    "name": "bl",
    "exportName": "c3"
  },
  {
    "name": "ZM",
    "exportName": "c4"
  },
  {
    "name": "_p",
    "exportName": "c5"
  },
  {
    "name": "rw",
    "exportName": "bV"
  },
  {
    "name": "c",
    "exportName": "t"
  },
  {
    "name": "QM",
    "exportName": "bU"
  },
  {
    "name": "FM",
    "exportName": "bu"
  },
  {
    "name": "Um",
    "exportName": "bq"
  },
  {
    "name": "e$",
    "exportName": "c6"
  },
  {
    "name": "Zi",
    "exportName": "cb"
  },
  {
    "name": "zM",
    "exportName": "bv"
  },
  {
    "name": "Xa",
    "exportName": "bz"
  }
];
      const bindings=new Map();
      for(const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g))for(const part of match[1].split(',')){const pair=part.trim().split(/\s+as\s+/);bindings.set(pair[1]||pair[0],{name:pair[0],path:match[2]});}
      const modules=new Map(),values={};
      for(const entry of imports){const binding=bindings.get(entry.name);if(!binding)throw Error('遊戲資料版本已變更，分析轉接需更新：'+entry.name);const url=new URL(binding.path,main);if(url.origin!==location.origin)throw Error('分析資料來源不符');if(!modules.has(url.href))modules.set(url.href,await import(url.href));values[entry.name]=modules.get(url.href)[binding.name];if(values[entry.name]===undefined)throw Error('分析資料缺少：'+entry.name);}
      const response=await fetch(new URL('api/save',document.baseURI),{headers:{'x-session':session.token,'x-ro-tab':sessionStorage.getItem('ro-survivors.lobby-key')||''},cache:'no-store'});
      if(!response.ok)throw Error('讀取角色資料失敗（HTTP '+response.status+'）');
      const snapshot=await response.json();
      const current=JSON.parse(localStorage.getItem('ro-survivors-session')||localStorage.getItem('ro-survivors-guest-session')||'null');
      if(current?.id!==session.id)throw Error('帳號已切換，請重新分析');
      if(!snapshot.doc||typeof snapshot.doc!=='object')throw Error('角色存檔格式已變更');
      const api=await createGearAnalysis(values,snapshot.doc,name);
      const displayed=Number(document.querySelector('#stg-gs b')?.textContent.replace(/[,，]/g,''));
      const computed=api.total(api.character());
      if(!Number.isFinite(displayed)||displayed!==computed)throw Error('GS 校驗不符（遊戲 '+(displayed||'未讀到')+'／分析 '+computed+'），暫停建議以避免錯誤');
      installGsAdvisor(api);return {ok:true};
    })().finally(()=>{__roGearAnalysisLoading=null});
    return __roGearAnalysisLoading;
  };

function mountGearSpecial(){
if(window.top!==window || document.querySelector(`section[aria-label="RO 練等助手"]`))return;
(() => {
  const runtime = __roGearRuntime;
  const isInvalidatedRuntime = error => /Extension context invalidated/i.test(error?.message ?? String(error));
  const versionName = "Gear V99.0 網頁控制特別版";
  let automationMode="normal";
  const raidCompletion={entered:false,finished:false};
  let raidExitAfterDone=false,raidChecklistAfter=0,raidChecklistAskedAt=0;
  const compactRaidToggle=document.createElement("button");compactRaidToggle.type="button";
  const raidStartButton=document.createElement("button");raidStartButton.type="button";
  let runtimeInvalidated = false;
  const button = document.createElement("button");
  button.type = "button";
  const compactToggle = document.createElement("button");
  compactToggle.type = "button";
  const updateAssistantButton = running => {
    document.documentElement.dataset.roHelperMemoryFarming=running?"on":"off";
    document.documentElement.dataset.roHelperRaidMechanics=running && automationMode==="raid" && document.documentElement.dataset.roHelperRaidMechanicsWanted==="on"?"on":"off";
    compactToggle.textContent = running && automationMode==="normal" ? "停止" : "啟動";
    compactRaidToggle.textContent=running && automationMode==="raid"?"停副本":"副本";
    compactRaidToggle.setAttribute("aria-pressed",String(running&&automationMode==="raid"));
    compactRaidToggle.title=running&&automationMode==="raid"?"停止副本掛機":"啟動副本掛機";
    raidStartButton.textContent=running&&automationMode==="raid"?"停止副本掛機":"開始副本掛機";
    compactToggle.setAttribute("aria-label",running && automationMode==="normal" ? "停止助手" : "啟動助手");
    button.textContent = "RO 練等助手 " + versionName + " · 普通掛機 " + (running && automationMode==="normal" ? "啟動中" : "已關閉");
    button.setAttribute("aria-pressed", String(running&&automationMode==="normal"));
  };
  updateAssistantButton(false);
  button.style.cssText = "position:fixed;top:92px;right:12px;z-index:2147483647;pointer-events:auto;background:#234b96;color:white;padding:10px;border-radius:8px";
  const status = document.createElement("div");
  status.style.cssText = "position:fixed;top:135px;right:12px;z-index:2147483647;background:#173569;color:white;padding:8px";
  status.textContent = "已載入，尚未啟動";
  const autoLoginToggle = document.createElement("button");
  autoLoginToggle.type = "button";
  const showAutoLoginSetting = () => {
    const enabled = localStorage.getItem("ro-helper-game-autologin") !== "off";
    autoLoginToggle.textContent = "遊戲自動登入：" + (enabled ? "開" : "關");
    autoLoginToggle.setAttribute("aria-pressed",String(enabled));
  };
  autoLoginToggle.addEventListener("click",() => {
    const enabled = localStorage.getItem("ro-helper-game-autologin") === "off";
    localStorage.setItem("ro-helper-game-autologin",enabled ? "on" : "off");
    showAutoLoginSetting();
    status.textContent = enabled ? "下次重新整理時自動登入" : "下次重新整理時停止自動登入";
  });
  showAutoLoginSetting();
  const accountScope = () => {
    if (location.hostname === "ro.hans-webgametw.com") {
      const root = document.documentElement;
      if (!root) return "local";
      delete root.dataset.roHelperAccountScope;
      document.dispatchEvent(new Event("ro-helper-read-account"));
      return root.dataset.roHelperAccountScope || "local";
    }
    for (const [sessionKey, kind] of [
      ["ro-survivors-session", "account"],
      ["ro-survivors-guest-session", "guest"]
    ]) {
      try {
        const session = JSON.parse(localStorage.getItem(sessionKey));
        if (Number.isSafeInteger(session?.id)) return kind + "." + session.id;
      } catch {}
    }
    return "local";
  };
  let activeAccount = accountScope();
  const settingKey = key => key + "." + activeAccount;
  const readSetting = key => {
    const scoped=localStorage.getItem(settingKey(key));
    return scoped==="__ro_helper_default_v1__"?null:scoped ?? localStorage.getItem(key);
  };
  const writeSetting = (key, value) => localStorage.setItem(settingKey(key), value);
  const worldBossActive = () => taiwanGame && Boolean(document.getElementById("wb-hud"));
  const worldBossShield = () => worldBossActive() && /護盾\s*[1-9]\d*\s*秒/.test(document.getElementById("wb-hpt")?.textContent || "");
  const worldBossToggle = document.createElement("button");
  worldBossToggle.type = "button";
  const refreshWorldBossToggle = () => {
    const enabled=readSetting("ro-helper-world-boss") === "on";
    worldBossToggle.textContent="自動世界王："+(enabled?"開":"關");
    worldBossToggle.setAttribute("aria-pressed",String(enabled));
  };
  worldBossToggle.title="漢斯版：可選回城後參加，或提前指定分鐘結算遠征回城參加。需啟動助手，開啟自動移動可走位。";
  worldBossToggle.onclick=()=>{
    writeSetting("ro-helper-world-boss",readSetting("ro-helper-world-boss")==="on"?"off":"on");
    refreshWorldBossToggle();
    if(readSetting("ro-helper-world-boss")!=="on"){worldBossNextAction=0;status.textContent="自動世界王已關閉，繼續原掛機";}
  };
  refreshWorldBossToggle();
  function worldBossWindow(now,minutes) {
    const shifted=new Date(now+8*60*60*1000);
    const day=Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate())-8*60*60*1000;
    const lead=Math.min(30,Math.max(.1,Number(minutes)||1))*60000;
    return [0,16,20,24].map(hour=>day+hour*3600000).find(at=>now>=at-lead && now<at+7*60000) || null;
  }
  const worldBossMode=document.createElement("select");
  worldBossMode.setAttribute("aria-label","世界王參加方式");
  worldBossMode.append(new Option("回城後參加","lobby"),new Option("開打前退出參加","timed"));
  const worldBossLead=document.createElement("input");
  worldBossLead.type="number";worldBossLead.min="0.1";worldBossLead.max="30";worldBossLead.step="0.1";worldBossLead.style.width="4em";
  worldBossLead.setAttribute("aria-label","世界王提前退出分鐘");
  const worldBossLeadRow=document.createElement("label");worldBossLeadRow.append("提前 ",worldBossLead," 分鐘退出");
  worldBossLeadRow.title="台灣時間每天16:00、20:00、00:00；可填0.1～30分鐘，官方開放後才會進場";
  const refreshWorldBossMode=()=>{
    worldBossMode.value=readSetting("ro-helper-world-boss-mode")==="timed"?"timed":"lobby";
    worldBossLead.value=String(Math.min(30,Math.max(.1,Number(readSetting("ro-helper-world-boss-lead"))||1)));
    worldBossLeadRow.hidden=worldBossMode.value!=="timed";
  };
  worldBossMode.onchange=()=>{writeSetting("ro-helper-world-boss-mode",worldBossMode.value);refreshWorldBossMode();};
  worldBossLead.onchange=()=>{writeSetting("ro-helper-world-boss-lead",String(Math.min(30,Math.max(.1,Number(worldBossLead.value)||1))));refreshWorldBossMode();};
  refreshWorldBossMode();
  const worldBossVisitKey=()=>"ro-helper-world-boss-visit."+activeAccount;
  const readWorldBossVisit=()=>{try{return JSON.parse(sessionStorage.getItem(worldBossVisitKey()))||{};}catch{return {};}};
  const saveWorldBossVisit=visit=>{try{sessionStorage.setItem(worldBossVisitKey(),JSON.stringify(visit));}catch{}};
  function timedWorldBossDeparture() {
    if(readSetting("ro-helper-world-boss-mode")!=="timed")return false;
    const at=worldBossWindow(Date.now(),readSetting("ro-helper-world-boss-lead"));
    if(!at)return false;
    const visit=readWorldBossVisit();
    if(visit.at===at && (visit.done || visit.entered))return false;
    const packet=typeof readLivePacket==="function"?readLivePacket():null;
    const level=packet?.baseLevel;
    if(Number.isFinite(level) && level<25)return false;
    if(packet?.expeditionFlags?.endless || packet?.expeditionFlags?.story || document.getElementById("pvp-hud") || document.getElementById("gw-hud"))return false;
    if(document.querySelector("#picker:not(.hidden):not(.closing)"))return false;
    if(document.getElementById("wb-unq"))return true;
    if(Date.now()<worldBossNextAction)return true;
    const result=document.querySelector("#gameover:not(.hidden) #btn-restart");
    if(result && !result.disabled){worldBossNextAction=Date.now()+700;result.click();return true;}
    const inLobby=document.body.classList.contains("in-lobby");
    if(inLobby){
      if(document.getElementById("wb-join"))return false;
      if(Date.now()>at+60000){saveWorldBossVisit({at,done:true});status.textContent="世界王入口未開放，恢復原掛機";return false;}
      status.textContent="已回城，等待世界王官方入口開放";
      return true;
    }
    if(document.querySelector("#hud:not(.hidden)")) {
      const exit=document.getElementById("btn-endrun");
      if(exit && !exit.disabled && typeof exit.click==="function") {
        saveWorldBossVisit({at,departed:true});
        worldBossNextAction=Date.now()+1500;
        status.textContent="世界王即將開場，結算目前遠征並返回";
        exit.click();
        return true;
      }
      status.textContent="世界王即將開場，等待遊戲提供離場按鈕";
      return true;
    }
    return visit.at===at && visit.departed;
  }

function normalizeRaidPreset(value) {
  let raw=value;if(typeof raw==='string'){try{raw=JSON.parse(raw);}catch{raw={};}}
  raw=raw&&typeof raw==='object'?raw:{};
  const names=Array.isArray(raw.names)?raw.names:typeof raw.names==='string'?raw.names.split(/[\r\n,，;；]+/):[];
  return {role:['leader','member'].includes(raw.role)?raw.role:'off',names:[...new Set(names.filter(n=>typeof n==='string').map(n=>n.trim()).filter(n=>n&&n.length<=80))].slice(0,29),accept:raw.accept!==false,fill:raw.fill!==false};
}
function raidPresetInviteAllowed(preset,invitation,mode,raidName) {
  return Boolean(preset.role!=='off'&&preset.accept&&invitation&&preset.names.includes(invitation.from)&&
    (mode==='any'||invitation.rid===mode||invitation.name===raidName));
}
function raidPresetGroupReadiness(preset,group,me) {
  if(!group)return {ready:false,reason:'等待副本團資料',missing:[]};
  const present=new Set((group.members||[]).map(m=>m.name)),missing=preset.names.filter(n=>!present.has(n));
  if(preset.role!=='leader'||group.leader!==me)return {ready:false,reason:'已準備，等待團長出發',missing};
  if(missing.length)return {ready:false,reason:'等待固定隊友：'+missing.join('、'),missing};
  if(group.members.length<Math.max(6,group.min||6))return {ready:false,reason:'等待副本人數達到 '+Math.max(6,group.min||6)+' 人',missing};
  if((group.needs||[]).some(n=>n.hard&&(!Number.isFinite(n.have)||!Number.isFinite(n.need)||n.have<n.need)))return {ready:false,reason:'等待遊戲要求的補師／隊伍條件',missing};
  if(group.members.some(m=>m.at==='off'))return {ready:false,reason:'等待隊友上線',missing};
  if(group.members.some(m=>m.aid!==group.leader&&!m.ready))return {ready:false,reason:'等待隊友按準備',missing};
  return {ready:true,reason:'固定隊友已到齊並準備，倒數出發',missing};
}

function resetRaidCompletion(state){Object.assign(state,{entered:false,finished:false,proof:false,result:null,runId:null});}
function readRaidCompletionEvidence(active){
  let data;try{data=JSON.parse(document.documentElement.dataset.roHelperRaidOutcome||'null');}catch{}
  if(active&&document.querySelector('#rd-panel .rd-res.win'))return {kind:'success',runId:data?.runId||null};
  if(active&&document.querySelector('#rd-panel .rd-res.lose'))return {kind:'failure',runId:data?.runId||null};
  return data&&['success','failure','interrupted'].includes(data.kind)?data:{kind:'unknown',runId:data?.runId||null};
}
function raidCompletionTransition(state,active,evidence){
  const kind=evidence?.kind||'unknown',runId=evidence?.runId||null;
  if(active){
    if(state.runId&&runId&&state.runId!==runId)resetRaidCompletion(state);
    state.entered=true;if(runId)state.runId=runId;
  }
  if(!state.entered)return false;
  const same=!state.runId||!runId||state.runId===runId;
  if(same&&kind==='success'){state.finished=true;state.proof=true;state.result='success';}
  else if(same&&(kind==='failure'||kind==='interrupted')){state.result=kind;state.finished=false;state.proof=false;}
  if(!active&&state.proof===true&&state.finished===true){resetRaidCompletion(state);return true;}
  return false;
}

  const raidControls=document.createElement("div");
  const raidMode=document.createElement("select");raidMode.setAttribute("aria-label","副本遠征");
  raidMode.append(new Option("副本遠征：關","off"),new Option("副本：我能打的都可以","any"));
  for(const [id,name] of [["r1","獸人的記憶"],["r2","章魚洞穴"],["r3","恐怖玩具工廠"],["r4","尼德霍格之巢"],["r5","驚駭森靈之巢"],["r6","舊格拉斯特海姆"],["r7","死者之國"],["r8","封印神殿"]])raidMode.append(new Option("副本："+name,id));
  const raidRoll=document.createElement("select");raidRoll.setAttribute("aria-label","副本掉落擲骰");
  for(const [id,name] of [["","手動擲骰"],["need","需要"],["greed","貪婪"],["pass","放棄"]])raidRoll.append(new Option("副本擲骰："+name,id));
  const raidPresetBox=document.createElement('details'),raidPresetTitle=document.createElement('summary');raidPresetTitle.textContent='預先組隊打副本';
  const raidPresetRole=document.createElement('select');raidPresetRole.setAttribute('aria-label','預先組隊角色');
  raidPresetRole.append(new Option('預先組隊：關（快速加入）','off'),new Option('我是隊長：邀請固定名單','leader'),new Option('我是隊員：等待指定邀請','member'));
  const raidPresetNames=document.createElement('textarea');raidPresetNames.rows=4;raidPresetNames.maxLength=2048;raidPresetNames.style.cssText='width:100%;box-sizing:border-box';raidPresetNames.placeholder='固定隊友／可同意的邀請人，每行一個角色名稱';raidPresetNames.setAttribute('aria-label','固定隊友與邀請人名單');
  const raidPresetAccept=document.createElement('input');raidPresetAccept.type='checkbox';const raidPresetAcceptRow=document.createElement('label');raidPresetAcceptRow.style.display='block';raidPresetAcceptRow.append(raidPresetAccept,' 自動同意名單內的副本邀請');
  const raidFriendsButton=document.createElement('button');raidFriendsButton.type='button';raidFriendsButton.textContent='讀取好友／勾選隊員';raidFriendsButton.onclick=openRaidFriendsPicker;
  const raidPresetFill=document.createElement('input');raidPresetFill.type='checkbox';const raidPresetFillRow=document.createElement('label');raidPresetFillRow.style.display='block';raidPresetFillRow.append(raidPresetFill,' 名單到齊後公開招募補人');
  const raidPresetHelp=document.createElement('small');raidPresetHelp.style.display='block';raidPresetHelp.textContent='隊長可讀取好友勾選名單，先邀一般隊伍，再開私人副本團；每場副本後若隊伍消失會重新邀請。到齊後可公開補人，至少6人且準備後出發。隊員等待名單內邀請；兩種角色都可自動同意。未指定副本時，隊長選目前可打的最高副本。';
  raidPresetBox.append(raidPresetTitle,raidPresetRole,raidFriendsButton,raidPresetNames,raidPresetAcceptRow,raidPresetFillRow,raidPresetHelp);
  const raidPreset=()=>normalizeRaidPreset(readSetting('ro-helper-raid-preset'));
  const loadRaidPreset=()=>{const p=raidPreset(),signature=JSON.stringify(p);if(signature!==raidPresetSignature){raidPresetSignature=signature;raidPresetGroupId=null;raidPresetInvited.clear();raidPartyInvited.clear();raidOrdinaryPartyPresent=false;raidLeaderChecked=false;}raidPresetRole.value=p.role;raidPresetNames.value=p.names.join('\n');raidPresetAccept.checked=p.accept;raidPresetFill.checked=p.fill;raidPresetFillRow.hidden=p.role!=="leader";};
  let raidLeaderChecked=false,raidFriendsOwned=false,raidOrdinaryPartyPresent=false;const raidPartyInvited=new Map();
  let raidPresetGroupId=null,raidPresetSignature="";const raidPresetInvited=new Map();
  const saveRaidPreset=()=>{const p=normalizeRaidPreset({role:raidPresetRole.value,names:raidPresetNames.value,accept:raidPresetAccept.checked,fill:raidPresetFill.checked});writeSetting('ro-helper-raid-preset',JSON.stringify(p));raidPresetGroupId=null;raidPresetInvited.clear();loadRaidPreset();raidNextAction=0;};
  for(const el of [raidPresetRole,raidPresetNames,raidPresetAccept,raidPresetFill])el.addEventListener('change',saveRaidPreset);

  function readRaidFriends(){
    document.dispatchEvent(new Event('ro-helper-read-friends'));
    try{return JSON.parse(document.documentElement.dataset.roHelperFriends||'null');}catch{return null;}
  }
  function openRaidFriendsPicker(){
    if(document.getElementById('ro-helper-raid-friends'))return;
    const account=activeAccount,selected=new Set(raidPreset().names),dialog=document.createElement('dialog');dialog.id='ro-helper-raid-friends';dialog.style.cssText='width:min(480px,94vw)';
    const title=document.createElement('strong');title.textContent='選擇副本隊員好友';
    const search=document.createElement('input');search.type='search';search.placeholder='搜尋好友名稱';search.style.width='100%';
    const list=document.createElement('div');list.style.cssText='max-height:50vh;overflow:auto';const note=document.createElement('small');note.textContent='套用後，啟動副本隊長模式會自動邀請一般隊伍；每場副本後隊伍消失會重新邀請。';
    let friends=[];const render=()=>{list.replaceChildren();for(const f of friends.filter(f=>f.name.toLowerCase().includes(search.value.trim().toLowerCase()))){const row=document.createElement('label'),box=document.createElement('input');row.style.display='block';box.type='checkbox';box.checked=selected.has(f.name);box.onchange=()=>{if(box.checked){if(selected.size>=29){box.checked=false;note.textContent='最多選擇29位固定隊友';return;}selected.add(f.name);}else selected.delete(f.name);};row.append(box,' '+f.name+' · '+(f.online?'頻道 '+f.channel:'離線／戰鬥中')+(f.party?' · 已有隊伍':''));list.append(row);}if(!friends.length)list.textContent='尚未讀到好友；請先進入廣場，再按重新讀取。';};
    const refresh=document.createElement('button');refresh.type='button';refresh.textContent='重新讀取好友';refresh.onclick=()=>{const data=readRaidFriends();friends=Array.isArray(data?.friends)?data.friends:[];render();};
    const save=document.createElement('button');save.type='button';save.textContent='套用隊員名單';save.onclick=()=>{if(activeAccount!==account){dialog.close();dialog.remove();return;}raidPresetNames.value=[...selected].join('\n');saveRaidPreset();dialog.close();dialog.remove();};
    const close=document.createElement('button');close.type='button';close.textContent='取消';close.onclick=()=>{dialog.close();dialog.remove();};dialog.oncancel=()=>dialog.remove();search.oninput=render;dialog.append(title,search,refresh,list,note,save,close);document.body.append(dialog);dialog.showModal();refresh.click();
  }

  function raidLeaderPartyReadiness(preset,data){
    const missing=preset.names.filter(name=>!data?.party?.members?.includes(name));
    if(!data?.ready)return {ready:false,missing,label:'副本隊長｜等待好友與隊伍資料'};
    if(preset.names.length>7)return {ready:false,missing,label:'副本隊長｜一般隊伍最多8人，請將固定隊員減至7位以內'};
    if(data.party&&!data.party.leader)return {ready:false,missing,label:'副本隊長｜目前不是一般隊伍隊長，請先確認隊伍'};
    return {ready:!!data.party&&missing.length===0,missing,label:'副本隊長｜等待指定隊員到齊（尚缺 '+missing.join('、')+'）'};
  }

  let raidSocialInvite=null;
  function handleRaidLeaderParty(preset,click,now){
    if(preset.role!=='leader'||!document.body.classList.contains('in-lobby')||raidActive()){raidSocialInvite=null;return false;}
    if(document.querySelector('#ro-helper-raid-friends[open]'))return true;
    const friends=document.getElementById('friends'),visible=friends&&!friends.classList.contains('hidden');
    if(raidSocialInvite){
      const step=raidSocialInvite;
      if(step.account!==activeAccount){if(visible&&!click(document.getElementById('fr-close')))return true;raidSocialInvite=null;return false;}
      if(!preset.names.includes(step.name)&&step.phase!=='close')step.phase='next';
      if(step.phase!=='next'&&step.phase!=='close'&&now-step.at>10000){
        raidPartyInvited.set(step.name,now-25000);step.phase='next';status.textContent='隊長自動組隊｜跳過暫時無法邀請的 '+step.name+'，繼續本輪名單';return true;
      }
      if(step.phase==='next'){
        const latest=readRaidFriends();
        if(!latest?.ready){status.textContent='隊長自動組隊｜等待社交資料更新';return true;}
        const members=new Set(latest.party?.members||[]);
        if(latest.party&&(!latest.party.leader||latest.party.members.length>=8))step.queue=[];
        let next;
        while(step.queue?.length){const name=step.queue.shift(),friend=latest.friends.find(f=>f.name===name);if(preset.names.includes(name)&&!members.has(name)&&friend?.online&&!friend.party){next=name;break;}}
        if(next){step.name=next;step.phase='friend';step.at=now;status.textContent='隊長自動組隊｜社交保持開啟，繼續邀請 '+next;return true;}
        step.phase='close';
      }
      if(step.phase==='close'){
        if(visible&&!click(document.getElementById('fr-close')))return true;
        raidFriendsOwned=false;raidSocialInvite=null;status.textContent='隊長自動組隊｜已關閉社交，等待隊員接受邀請';return true;
      }
      if(!visible){status.textContent='隊長自動組隊｜等待社交好友清單開啟';return true;}
      if(step.phase==='friend'){
        const row=[...document.querySelectorAll('#fr-body .fr-row:not(.ask)')].find(row=>[...row.querySelectorAll('[data-name]')].some(el=>el.dataset.name===step.name));
        if(!row){status.textContent='隊長自動組隊｜社交清單尚未找到 '+step.name;return true;}
        const menu=[...row.querySelectorAll('[data-act="menu"]')].find(b=>b.dataset.name===step.name);
        const direct=[...row.querySelectorAll('[data-act="invite"]')].find(b=>b.dataset.name===step.name);
        if(direct&&!direct.disabled){if(click(direct)){raidPartyInvited.set(step.name,now);step.phase='next';status.textContent='隊長自動組隊｜已點擊 '+step.name+' 的邀請入隊';}return true;}
        if(menu&&!menu.disabled){if(click(menu)){step.phase='invite';status.textContent='隊長自動組隊｜已找到 '+step.name+'，開啟邀請選單';}return true;}
        status.textContent='隊長自動組隊｜'+step.name+' 目前無法邀請（離線或已有隊伍）';step.phase='next';raidPartyInvited.set(step.name,now-25000);return true;
      }
      const invite=[...document.querySelectorAll('#friends .player-menu button,#player-menu button')].find(b=>/^(邀請入隊|Invitar al grupo|Invite to party|Convidar para o grupo)$/.test(b.textContent.trim()));
      if(invite&&!invite.disabled){if(click(invite)){raidPartyInvited.set(step.name,now);step.phase='next';status.textContent='隊長自動組隊｜已點擊 '+step.name+' 的邀請入隊，等待實際加入';}return true;}
      const direct=[...document.querySelectorAll('#fr-body [data-act="invite"]')].find(b=>b.dataset.name===step.name);
      if(direct&&!direct.disabled&&click(direct)){raidPartyInvited.set(step.name,now);step.phase='next';status.textContent='隊長自動組隊｜已點擊 '+step.name+' 的好友邀請';return true;}
      status.textContent='隊長自動組隊｜等待 '+step.name+' 的邀請入隊按鈕';return true;
    }
    const data=readRaidFriends();if(!data?.ready)return false;
    if(raidOrdinaryPartyPresent&&!data.party)raidPartyInvited.clear();raidOrdinaryPartyPresent=!!data.party;
    if(data.party&&(!data.party.leader||data.party.members.length>=8))return false;
    const members=new Set(data.party?.members||[]),missing=preset.names.filter(name=>!members.has(name));if(!missing.length)return false;
    const candidates=missing.filter(name=>now-(raidPartyInvited.get(name)??-Infinity)>=30000&&data.friends.some(f=>f.name===name&&f.online&&!f.party)).sort((a,b)=>(raidPartyInvited.get(a)??-Infinity)-(raidPartyInvited.get(b)??-Infinity));
    const candidate=candidates[0];
    if(!candidate){status.textContent='隊長自動組隊｜'+missing.map(name=>{const f=data.friends.find(f=>f.name===name);return name+'（'+(!f?'不在好友名單':!f.online?'離線／戰鬥中':f.party?'已有其他隊伍':'等待接受／稍後重試')+'）';}).join('、');return true;}
    if(now<raidNextAction)return true;
    if(!visible&&document.querySelector('.overlay:not(.hidden),dialog[open]')){status.textContent='隊長自動組隊｜等待其他視窗關閉再開社交';return true;}
    const open=document.getElementById('lobby-friends');
    if(!visible&&(!open||!click(open))){status.textContent='隊長自動組隊｜等待社交按鈕';return true;}
    raidSocialInvite={name:candidate,queue:candidates.slice(1),phase:'friend',at:now,account:activeAccount};raidFriendsOwned=true;status.textContent='隊長自動組隊｜開啟社交，尋找 '+candidate;return true;
  }

  function readRaidGroupSnapshot(){try{return JSON.parse(document.documentElement.dataset.roHelperRaidGroup||'null');}catch{return null;}}

  let raidCountdownRoster=null,raidCountdownRecovery=null,raidCountdownCancelAt=0;
  function handleRaidCountdownGuard(snapshot,preset,click,now){
    const group=snapshot?.group;
    if(preset.role!=='leader'||!group||group.leader!==snapshot.me)return false;
    const counting=group.state==='count'||!!document.getElementById('rg-count');if(!counting)return false;
    const readiness=raidPresetGroupReadiness(preset,group,snapshot.me);
    if(!raidCountdownRoster||raidCountdownRoster.gid!==group.gid)raidCountdownRoster={gid:group.gid,ids:group.members.map(m=>m.aid),names:group.members.filter(m=>m.aid!==group.leader).map(m=>m.name),count:group.members.length};
    const present=new Set(group.members.map(m=>m.aid)),lost=raidCountdownRoster.ids.filter(id=>!present.has(id));
    const changed=group.members.length<raidCountdownRoster.count||lost.length>0;
    if(!readiness.ready||changed){
      status.textContent='副本隊長｜人數／隊員條件不符，取消倒數後重新邀請：'+(changed?'倒數中有隊員離開':readiness.reason);
      if(now<raidCountdownCancelAt)return true;
      const stop=document.getElementById('rg-c-stop')||document.getElementById('rg-w-stop');
      if(stop&&!stop.disabled){
        raidNextAction=Math.min(raidNextAction,now);
        if(click(stop)){raidCountdownCancelAt=now+1500;raidCountdownRecovery={gid:group.gid,names:raidCountdownRoster.names||[]};raidCountdownRoster=null;raidPresetInvited.clear();raidPartyInvited.clear();raidFriendsOwned=false;raidSocialInvite=null;}
      }
      return true;
    }
    status.textContent='副本隊長｜倒數中，指定隊員及人數確認正常';return true;
  }

  function handleRaidPresetGroup(snapshot,preset,click,now){
    const group=snapshot?.group;
    if(!group){const cancel=document.getElementById('rg-chip-x');if(snapshot?.pool&&cancel){click(cancel);status.textContent='預先組隊｜取消原本的隨機配對';}else status.textContent='預先組隊｜等待副本團資料';return true;}
    if(group.gid!==raidPresetGroupId){raidPresetGroupId=group.gid;raidPresetInvited.clear();}
    if(typeof raidCountdownRecovery!=='undefined'&&raidCountdownRecovery?.gid===group.gid)preset={...preset,names:[...new Set([...preset.names,...raidCountdownRecovery.names])]};
    const selected=raidMode.value,raidName=raidMode.selectedOptions?.[0]?.textContent.replace(/^副本：/,'');
    if(selected!=='any'&&group.rid!==selected&&group.name!==raidName){status.textContent='已在其他副本團，請先手動離團或調整副本設定';return true;}
    const readiness=raidPresetGroupReadiness(preset,group,snapshot.me);
    if(preset.role==='leader'&&group.leader===snapshot.me){
      const input=document.getElementById('rg-s-inv'),invite=document.getElementById('rg-s-invb');
      const next=readiness.missing.find(n=>now-(raidPresetInvited.get(n)??-Infinity)>=30000);
      if(next&&input&&invite){input.value=next;input.dispatchEvent(new Event('input',{bubbles:true}));if(click(invite)){raidPresetInvited.set(next,now);status.textContent='預先組隊｜已邀請 '+next;return true;}}
      const publicToggle=document.getElementById('rg-s-open');
      if(!readiness.missing.length&&preset.fill&&!group.open&&publicToggle&&!publicToggle.checked&&click(publicToggle)){status.textContent='預先組隊｜固定名單到齊，公開招募補人';return true;}
      const ready=document.getElementById('rg-w-ready'),go=document.getElementById('rg-w-go');
      if(readiness.ready&&(!ready||ready.textContent.trim()!=='準備好了')&&go&&!go.disabled&&click(go)){raidNextAction=now+10000;raidCountdownRoster={gid:group.gid,ids:group.members.map(m=>m.aid),count:group.members.length};}
    }
    status.textContent='預先組隊｜'+readiness.reason;return true;
  }

  const raidMechanicsToggle=document.createElement("input");raidMechanicsToggle.type="checkbox";
  const raidMechanicsRow=document.createElement("label");raidMechanicsRow.append(raidMechanicsToggle," 自動處理副本機制");raidMechanicsRow.style.display="block";
  raidMechanicsToggle.onchange=()=>{writeSetting("ro-helper-raid-mechanics",raidMechanicsToggle.checked?"on":"off");refreshRaidSettings();};
  const raidReturnNormal=document.createElement("input");raidReturnNormal.type="checkbox";
  const raidReturnNormalRow=document.createElement("label");raidReturnNormalRow.style.display="block";raidReturnNormalRow.append(raidReturnNormal," 全部可打副本完成後離隊並開啟普通掛機");
  raidReturnNormalRow.title="依遊戲完整清單確認今日可挑戰的副本都已用完次數；戰力或等級未達者略過。隊長與隊員會離開副本團及一般隊伍，轉為單人普通掛機；副本設定保留，下次手動啟動。";
  raidReturnNormal.onchange=()=>writeSetting("ro-helper-raid-return-normal",raidReturnNormal.checked?"on":"off");
  raidStartButton.onclick=()=>toggleAutomationMode("raid");
  const raidHelp=document.createElement("small");raidHelp.textContent="回城後快速加入、準備；隊長符合條件時倒數出發。每副本每日一次，失敗也計次。";
  raidHelp.style.display="block";raidControls.append(raidStartButton,raidMode,raidRoll,raidPresetBox,raidMechanicsRow,raidReturnNormalRow,raidHelp);
  const refreshRaidSettings=()=>{loadRaidPreset();raidReturnNormal.checked=readSetting("ro-helper-raid-return-normal")==="on";raidMode.value=readSetting("ro-helper-raid-mode")||"off";if(!raidMode.value)raidMode.value="off";raidRoll.value=readSetting("ro-helper-raid-roll")||"";raidMechanicsToggle.checked=readSetting("ro-helper-raid-mechanics")!=="off";const enabled=raidMode.value!=="off"&&raidMechanicsToggle.checked;document.documentElement.dataset.roHelperRaidMechanicsWanted=enabled?"on":"off";document.documentElement.dataset.roHelperRaidMechanics=enabled&&automationMode==="raid"&&Boolean(window.__roMenuHelper)?"on":"off";};
  raidMode.onchange=()=>{raidLeaderChecked=false;resetRaidCompletion(raidCompletion);writeSetting("ro-helper-raid-mode",raidMode.value);raidNextAction=0;status.textContent=raidMode.value==="off"?"已關閉自動副本；已加入的團或配對請在遊戲中取消":"副本遠征已設定，回城後自動配對";refreshRaidSettings();};
  raidRoll.onchange=()=>writeSetting("ro-helper-raid-roll",raidRoll.value);refreshRaidSettings();
  let raidCleanupPending=false;
  let raidNextAction=0,raidResultSince=0,raidWaiting=false,raidWaitingText="",raidWaitingGroupId=null,raidGroupPanelOwned=false,raidFoldedGroup=null;
function raidGroupPanelAction(snapshot,preset,now) {
  const group=snapshot?.group;if(!group)return null;
  const me=(group.members||[]).find(m=>m.aid===snapshot.me);
  if(!me)return 'state';
  if(!me.ready)return 'ready';
  if(group.leader!==snapshot.me)return null;
  if(preset.role==='member')return null;
  const plan=preset.role==='leader'?preset:{role:'leader',names:[],fill:false};
  const readiness=raidPresetGroupReadiness(plan,group,snapshot.me);
  if(preset.role==='leader'){
    if(readiness.missing.some(n=>now-(raidPresetInvited.get(n)??-Infinity)>=30000))return 'invite';
    if(!readiness.missing.length&&preset.fill&&!group.open)return 'public';
  }
  return readiness.ready?'start':null;
}

  function raidActive(){return document.documentElement.dataset.roHelperRaidActive==="on";}
  function readRaidState(){document.dispatchEvent(new Event("ro-helper-read-raid"));return raidActive();}

  function handleRaidPartyPrompt(preset,click){
    if(preset.role==='off'||!preset.accept||!document.body.classList.contains('in-lobby'))return false;
    const box=document.querySelector('#npc-dialog:not(.hidden)');if(!box)return false;
    const title=box.querySelector('#npc-name')?.textContent.trim();if(!['隊伍','Grupo','Party'].includes(title))return false;
    const text=box.querySelector('#npc-text'),message=text?.textContent.trim()||'',button=box.querySelector('#npc-options button.primary');
    if(!button)return false;
    const trusted=name=>preset.names.includes(name);
    if(/邀請你入隊|邀請你加入|te invita a su grupo/.test(message)){
      const name=text.querySelector('b')?.textContent.trim();
      if(trusted(name)&&/^(接受|Aceptar|Accept)$/.test(button.textContent.trim())&&click(button)){status.textContent='副本組隊｜已接受 '+name+' 的組隊邀請';return true;}
    }
    if(/隊長在頻道|El líder del grupo está en el canal/.test(message)){
      const row=[...document.querySelectorAll('.pf-row')].find(row=>row.querySelector('.pf-lead'));
      const name=row?.querySelector('.pf-name b')?.textContent.trim(),hop=row?.querySelector('button[data-hop]')?.dataset.hop;
      const channel=button.textContent.match(/(?:移至頻道|Ir al canal)\s*(\d+)/)?.[1];
      if(trusted(name)&&channel&&String(hop)===channel&&click(button)){status.textContent='副本組隊｜已移動到隊長頻道 '+channel;return true;}
    }
    return false;
  }
  function handleRaidPostCleanup(){
    if(!raidCleanupPending||raidActive()||!document.body.classList.contains('in-lobby'))return false;
    if(document.getElementById('rg-count'))return false;
    const settings=inventorySettings();
    const targetCount=typeof targetStorageRules!=="undefined"?targetStorageRules.size:0;
    if((!settings.store&&!settings.sell&&!targetCount)||(!inventoryRules(settings).length&&!targetCount)){raidCleanupPending=false;return false;}
    if(inventoryRun?.raidCleanup&&inventoryRun.done){raidCleanupPending=false;return false;}
    if(!inventoryRun||inventoryRun.done){
      if(document.querySelector('.overlay:not(.hidden)')){
        const close=document.querySelector('#raidshop:not(.hidden) #rs-close');
        if(close&&!close.disabled){close.click();return true;}return false;
      }
      inventoryRun={manual:true,raidCleanup:true,phase:'open',expires:Date.now()+35000,next:0,reject:new Set(),stored:0};
    }
    if(runInventoryCleanup())return true;
    raidCleanupPending=false;return false;
  }

  function raidChecklistDecision(snapshot,now,after=0){
    const rows=snapshot?.raids;
    if(snapshot?.closed||!Array.isArray(rows)||new Set(rows.map(r=>r.rid)).size!==8||!Number.isFinite(snapshot.infoAt)||snapshot.infoAt<after||now-snapshot.infoAt>15000)return 'unknown';
    return rows.every(r=>r.done===true||r.why==='rdPower'||r.why==='rdLevel')?'done':'remaining';
  }
  function handleRaidFinishedExit(click,now){
    document.documentElement.dataset.roHelperRaidFinishExit='on';
    if(!document.body.classList.contains('in-lobby')||raidActive()){status.textContent='副本全部可打項目完成｜等待回廣場離隊';return true;}
    const snapshot=readRaidGroupSnapshot();
    if(!snapshot){status.textContent='副本完成｜等待副本團狀態確認';return true;}
    if(snapshot.group){
      if(snapshot.group.state==='count'){
        const stop=document.getElementById('rg-c-stop')||document.getElementById('rg-w-stop');
        if(stop){click(stop);status.textContent='副本完成｜取消團隊倒數後離團';return true;}
        // Members cannot cancel the leader's countdown, but can leave the group.
      }
      if(!document.getElementById('rg-win'))click(document.getElementById('rg-chip-open'));
      else if(now>=raidNextAction){raidNextAction=now+1200;document.dispatchEvent(new Event('ro-helper-finish-raid-group'));}
      status.textContent='副本完成｜正在離開副本團';return true;
    }
    if(snapshot.pool){click(document.getElementById('rg-chip-x'));status.textContent='副本完成｜取消副本配對';return true;}
    const confirmation=document.querySelector('#npc-dialog:not(.hidden)');
    if(confirmation&&/離開隊伍|退出隊伍|Salir del grupo|Leave (?:the )?(?:party|group)|Sair do grupo/i.test(confirmation.querySelector('#npc-text')?.textContent||'')){
      click(confirmation.querySelector('#npc-options button.primary'));status.textContent='副本完成｜確認離開一般隊伍';return true;
    }
    const friends=readRaidFriends();if(!friends?.ready){status.textContent='副本完成｜等待一般隊伍狀態確認';return true;}
    if(friends.party){
      const cancel=document.querySelector('#party-frame [data-cancel]'),leave=document.querySelector('#party-frame .pf-leave[data-leave]');
      click(cancel||leave);status.textContent='副本完成｜正在離開一般隊伍';return true;
    }
    const close=document.querySelector('#raidshop:not(.hidden) #rs-close');if(close&&click(close))return true;
    if(handleCardSwapMode('normal'))return true;
    partyMode.value='off';writeSetting('ro-helper-party-role','off');refreshRollChoiceVisibility();partyWaitingUntil=0;
    raidExitAfterDone=false;raidLeaderChecked=false;raidPartyInvited.clear();raidPresetInvited.clear();raidCountdownRecovery=null;raidCountdownRoster=null;
    delete document.documentElement.dataset.roHelperRaidFinishExit;
    automationMode='normal';resetRaidCompletion(raidCompletion);updateAssistantButton(true);rememberRefresh();
    status.textContent='可打副本全部完成，已離隊並切換單人普通掛機；下次請手動啟動副本';return true;
  }
  function handleRaidExpedition(){
    raidWaiting=false;raidWaitingText="";
    if(!taiwanGame)return false;
    const active=readRaidState(),now=Date.now();
    const evidence=readRaidCompletionEvidence(active);
    if(automationMode==="raid"){
      if(raidCompletionTransition(raidCompletion,active,evidence)){raidChecklistAfter=now;raidChecklistAskedAt=0;raidLeaderChecked=false;raidCleanupPending=true;if(inventoryRun?.done)inventoryRun=undefined;}
    }
    const enabled=automationMode==="raid"&&raidMode.value!=="off";
    if(!enabled)return false;
    const shown=el=>!!el && !el.hidden && !el.closest(".hidden") && el.style.display!=="none";
    const click=el=>{if(!shown(el)||el.disabled||now<raidNextAction)return false;raidNextAction=now+1200;el.click();return true;};
    if(raidExitAfterDone&&!active)return handleRaidFinishedExit(click,now);
    if(!active&&handleCardSwapMode('raid'))return true;
    if(active){
      const down=shown(document.getElementById("rd-dead"));
      if(down){status.textContent="副本：倒地等待復活";return true;}
      const choice=raidRoll.value;
      if(choice){for(const box of document.querySelectorAll("#rd-roll .rd-it")){
        const index={need:0,greed:1,pass:2}[choice];const b=box.querySelectorAll("button")[index];
        if(click(b)){status.textContent="副本：已擲骰";return true;}
      }}
      const back=document.getElementById("rfx-back")||document.getElementById("rd-leave");
      if(shown(back)&&["success","failure","interrupted"].includes(evidence.kind)){
        raidResultSince ||= now;
        const pendingRoll=[...document.querySelectorAll("#rd-roll .rd-it")].some(box=>{
          const result=box.querySelector(".rd-res")?.textContent.trim()||"";
          return !result.startsWith("→");
        });
        if(now-raidResultSince>=2000&&!pendingRoll){
          status.textContent=click(back)?"副本：已自動點擊離開結算":"副本：等待自動結算";
        }else status.textContent=pendingRoll?"副本：等待擲骰結果，完成後自動結算":"副本：準備自動結算";
        return true;
      }
      raidResultSince=0;return false;
    }
    raidResultSince=0;
    if(raidReturnNormal.checked&&raidCompletion.entered&&!active&&raidCompletion.result==='failure'){
      // A settled loss may consume a daily attempt. The native checklist, not a
      // fabricated success, decides whether this raid still has attempts left.
      resetRaidCompletion(raidCompletion);raidChecklistAfter=now;raidChecklistAskedAt=0;raidCleanupPending=true;
    }
    if(raidCompletion.entered&&!raidCompletion.proof){
      const resume=document.getElementById("rd-back");if(shown(resume))click(resume);
      status.textContent=raidCompletion.result==="failure"?"副本未通關，保持遠征模式；請手動選擇後續安排":"副本尚未確認通關，等待返回原副本";
      return true;
    }
    const preset=raidPreset(),snapshot=readRaidGroupSnapshot();
    if(raidReturnNormal.checked&&document.body.classList.contains('in-lobby')){
      const decision=raidChecklistDecision(snapshot,now,raidChecklistAfter);
      if(decision==='done'){raidExitAfterDone=true;rememberRefresh();return handleRaidFinishedExit(click,now);}
      if(decision==='unknown'){
        if(now-raidChecklistAskedAt>=3000){raidChecklistAskedAt=now;document.dispatchEvent(new Event('ro-helper-refresh-raid-checklist'));}
        status.textContent='副本｜正在確認所有可打副本的剩餘次數';return true;
      }
    }
    if(handleRaidCountdownGuard(snapshot,preset,click,now))return true;
    if(handleRaidPartyPrompt(preset,click))return true;
    if(preset.role!=='off'&&!worldBossActive()&&!snapshot?.group){
      const iv=snapshot?.invite,box=document.getElementById('rg-inv');
      const raidName=raidMode.selectedOptions?.[0]?.textContent.replace(/^副本：/,'');
      if(raidPresetInviteAllowed(preset,iv,raidMode.value,raidName)&&box?.querySelector('b')?.textContent.trim()===iv.from){
        if(document.querySelector('#picker:not(.hidden):not(.closing),#pause:not(.hidden),#options:not(.hidden),dialog[open]'))return false;
        if(click(document.getElementById('rg-i-ok'))){status.textContent='預先組隊｜已同意 '+iv.from+' 的副本邀請';return true;}
        status.textContent='預先組隊｜等待同意固定名單的邀請';return true;
      }
    }
    if(preset.role==='leader'&&snapshot?.group)raidLeaderChecked=true;
    if(preset.role==='leader'&&raidLeaderChecked){
      const readiness=raidLeaderPartyReadiness(preset,readRaidFriends());
      if(!readiness.ready){
        const shopClose=document.querySelector('#raidshop:not(.hidden) #rs-close'),groupClose=document.getElementById('rg-w-close');
        if(shopClose){click(shopClose);status.textContent='副本隊長｜已確認可打副本，先關閉管理員組隊';return true;}
        if(groupClose){click(groupClose);status.textContent='副本隊長｜先收起副本團，完成一般組隊';return true;}
        if(preset.names.length<=7&&handleRaidLeaderParty(preset,click,now))return true;
        status.textContent=readiness.label;return true;
      }
      if(handleRaidLeaderParty(preset,click,now))return true;
    }
    if(handleRaidPostCleanup())return true;
    const raidReturn=document.getElementById("rd-back");
    if(shown(raidReturn)){click(raidReturn);status.textContent="副本｜返回尚在進行的副本";return true;}
    if(document.getElementById("rg-count")){status.textContent="副本：等待倒數出發";return true;}
    const chip=document.getElementById("rg-chip");
    if(shown(chip)){
      const group=snapshot?.group;
      if(group){
        if(raidWaitingGroupId!==group.gid){raidWaitingGroupId=group.gid;raidGroupPanelOwned=false;raidFoldedGroup=null;}
        const action=raidGroupPanelAction(snapshot,preset,now);
        const panel=document.getElementById('rg-win');
        if(!action){
          if(panel&&(raidGroupPanelOwned||raidFoldedGroup!==group.gid)){
            if(!click(document.getElementById('rg-w-close'))){status.textContent='副本｜準備完成，收起等待視窗';return true;}
            raidFoldedGroup=group.gid;raidGroupPanelOwned=false;
          }
          raidWaiting=true;
          raidWaitingText='副本｜已準備，等待團隊出發（可整理裝備）';
          status.textContent=raidWaitingText;return false;
        }
        if(action==='state'){status.textContent='副本｜等待團員狀態更新';return true;}
        if(!panel){if(click(document.getElementById('rg-chip-open')))raidGroupPanelOwned=true;status.textContent='副本｜更新準備／團隊安排';return true;}
      }else if(snapshot?.pool&&preset.role==='off'){
        raidWaiting=true;raidWaitingText='副本｜配對等待中（可整理裝備）';status.textContent=raidWaitingText;return false;
      }
      const open=document.getElementById("rg-chip-open");if(open && !document.getElementById("rg-win")){if(click(open))raidGroupPanelOwned=true;return true;}
      const ready=document.getElementById("rg-w-ready");if(ready && ready.textContent.trim()==="準備好了"){if(click(ready))raidGroupPanelOwned=true;status.textContent='副本｜正在準備';return true;}
      if(preset.role!=="off")return handleRaidPresetGroup(snapshot,preset,click,now);
      const go=document.getElementById("rg-w-go");if(go && !go.disabled && (!ready || ready.textContent.trim()!=="準備好了") && click(go))raidNextAction=now+10000;
      status.textContent="副本：配對／等待團員與出發條件";return true;
    }

    if(preset.role==='member'&&!raidReturnNormal.checked){status.textContent='預先組隊｜等待固定名單內的副本邀請';return false;}
    if(preset.role==='leader'&&!preset.names.length){status.textContent='預先組隊｜請先填寫固定隊友名單';return true;}
    if(!document.body.classList.contains("in-lobby"))return false;
    if(worldBossActive() || shown(document.getElementById("wb-join")) || document.querySelector("#ro-helper-settings[open],#ro-helper-target-storage[open]"))return false;
    const shop=document.getElementById("raidshop");
    if(!shown(shop)){if(now>=raidNextAction){raidNextAction=now+10000;document.dispatchEvent(new Event("ro-helper-open-raid"));}status.textContent="副本：開啟遠征副本管理員";return true;}
    const tab=shop.querySelector('[data-tab="raid"]');if(tab && !tab.classList.contains("primary")){click(tab);return true;}
    const all=shop.querySelector('[data-rgf="all"]');if(all && !all.classList.contains("primary")){click(all);return true;}
    const cards=[...shop.querySelectorAll("[data-rid].rg-card")];
    if(preset.role==='member'){status.textContent='預先組隊｜等待固定名單內的副本邀請；全部副本完成前不切換普通掛機';return false;}
    const eligible=cards.filter(el=>!el.classList.contains("locked")&&!el.querySelector(".rg-done")&&!/…/.test(el.querySelector(".stg-state")?.textContent||"…"));
    if((raidMode.value==="any"||raidReturnNormal.checked)&&preset.role!=="leader"){
      if(eligible.length && click(shop.querySelector('[data-rgq="any"]')))raidNextAction=now+10000;
      status.textContent=eligible.length?"副本：快速加入可挑戰的副本":"副本：尚有未完成副本，等待資格／清單更新，不切換普通掛機";return true;
    }
    const card=(raidMode.value==="any"||raidReturnNormal.checked)&&preset.role==="leader"?eligible.at(-1):cards.find(el=>el.dataset.rid===raidMode.value);
    if(!card){status.textContent="副本清單尚未提供所選副本";return true;}
    if(preset.role==='leader'&&eligible.includes(card)&&!raidLeaderChecked){
      raidLeaderChecked=true;
      click(shop.querySelector('#rs-close'));status.textContent='副本隊長｜已確認還有可打副本，先組齊指定隊員';return true;
    }
    if(!card.classList.contains("sel")){click(card);return true;}
    if(preset.role==='leader'){
      if(!eligible.includes(card)){status.textContent='預先組隊｜今日次數或戰力不符，等待遊戲資格';return true;}
      const form=shop.querySelector('#rg-f-ok');
      if(form){
        const open=shop.querySelector('#rg-f-open');if(open)open.checked=false;
        if(click(form))raidNextAction=now+10000;
        status.textContent='預先組隊｜建立固定名單私人團';return true;
      }
      click(shop.querySelector('#rg-create'));status.textContent='預先組隊｜開啟開團設定';return true;
    }
    const quick=shop.querySelector("#rg-quick");
    if(eligible.includes(card) && click(quick))raidNextAction=now+10000;
    status.textContent=quick?.disabled || !eligible.includes(card)?"副本：今日已參加或未達資格，等待遊戲開放":"副本：快速加入所選副本";return true;
  }

  let worldBossNextAction=0;
  let worldBossResultAt=0;
  function handleWorldBoss() {
    if (!taiwanGame || raidActive()) return false;
    const active=worldBossActive();
    document.documentElement.dataset.roHelperWorldBoss=active?"on":"off";
    if (active) {
      const at=worldBossWindow(Date.now(),readSetting("ro-helper-world-boss-lead"));
      if(at)saveWorldBossVisit({at,entered:true});
      delete document.documentElement.dataset.roHelperFinishVictory;
      delete document.documentElement.dataset.roHelperBossCleanup;
      const back=document.getElementById("wb-back");
      if (back) {
        worldBossResultAt ||= Date.now();
        status.textContent="世界王已結算，準備返回";
        if (Date.now()-worldBossResultAt>=1500 && Date.now()>=worldBossNextAction && !back.disabled) {
          worldBossNextAction=Date.now()+1500;
          const visit=readWorldBossVisit();saveWorldBossVisit({...visit,done:true});
          back.click();
        }
        return true;
      }
      worldBossResultAt=0;
      if (document.getElementById("wb-dead")) {status.textContent="世界王：倒地，等待遊戲復活";return true;}
      if (document.querySelector("#picker:not(.hidden):not(.closing)")) return false;
      if (/倒數/.test(document.getElementById("wb-time")?.textContent || "")) {
        status.textContent="世界王：等待降臨";
        return true;
      }
      return false;
    }
    // The game removes the world HUD before returning to the saved expedition.
    worldBossResultAt=0;
    const enabled=readSetting("ro-helper-world-boss")==="on";
    if (!enabled) return false;
    if (readSetting("ro-helper-world-boss-mode")==="timed") {
      const at=worldBossWindow(Date.now(),readSetting("ro-helper-world-boss-lead"));
      const visit=readWorldBossVisit();
      if(!at || visit.at===at && (visit.done || visit.entered))return false;
      if(timedWorldBossDeparture())return true;
    }
    if (document.getElementById("wb-unq")) {status.textContent="世界王：排隊中，等待進場";return true;}
    const join=document.getElementById("wb-join");
    if (!join || join.disabled || !join.getClientRects().length) return false;
    if (!document.body.classList.contains("in-lobby")) return false;
    if (document.querySelector("#npc-dialog:not(.hidden) .lb-pick")) return false;
    if (document.querySelector("#kstorage:not(.hidden),#shop:not(.hidden),#picker:not(.hidden),dialog[open]")) return false;
    const toast=document.getElementById("wb-toast")?.textContent || "";
    if (/Base Lv 25|訪客|沒有連線|找不到.*存檔|沒辦法參加/.test(toast)) {
      worldBossNextAction=Math.max(worldBossNextAction,Date.now()+60000);
      if(readSetting("ro-helper-world-boss-mode")==="timed") {
        const at=worldBossWindow(Date.now(),readSetting("ro-helper-world-boss-lead"));
        if(/Base Lv 25|訪客/.test(toast)){if(at)saveWorldBossVisit({at,done:true});return false;}
        status.textContent="世界王進場暫時失敗，留在主城等候重試";
        return true;
      }
      return false;
    }
    if (Date.now()<worldBossNextAction) return false;
    worldBossNextAction=Date.now()+15000;
    status.textContent="世界王開放，正在申請進場";
    join.click();
    return true;
  }

  const portableSettingKeys = new Set([
    "auto-move","auto-party","auto-reroll","banish-basic","banish-skills","boss-target","card-stop-mode","card-stop-skill","card-stop-target",
    "upgrade","character-growth","chest-discovery-threshold","chest-mode","collision-mode","difficulty","difficulty-solo","difficulty-party","difficulty-objective",
    "expedition-lap","expedition-speed","focus-skill","focus-treasure","focus-treasure-2","force-gear","inventory","inventory-tiers","login-character",
    "goal-action","magnet-minutes","no-flip-level","panel","party-role","pickup-mode","roll-choice","skills","stage","stage-mode","stage-repeats","stage-rotation",
    "gear-movement","gs-boss-cards","treasures","seen-stages","target-pickup","target-storage","treasure-category-priority","treasure-mode","treasure-priority","world-boss","world-boss-mode","world-boss-lead","raid-mode","raid-roll","raid-mechanics","raid-preset","raid-return-normal",
    "skill-level-plan","arrow-extra1","arrow-extra2","arrow-extra3","arrow-mode","arrow-starter","arrow-starter2","arrow-starter3","arrow-preference"
  ].map(key=>"ro-helper-"+key));
  portableSettingKeys.add("ro-helper-recycle-cards");
  portableSettingKeys.add("ro-helper-card-loadouts");
  const isPortableSettingKey = key => portableSettingKeys.has(key) || /^ro-helper-difficulty-stage\.(?:solo|party)\.[1-6]\.[^\s]{1,400}$/.test(key) || /^ro-helper-seen-(?:skills-[a-z_]+|stages-lap-[1-6])$/.test(key);
  const portableGlobalKeys = new Set(["ro-helper-game-autologin","ro-helper-observed-gear-tiers","ro-helper-memory-saver"]);
  const portableServer = server => String(server || "").replace(/^www\./,"");
  function exportAllSettings() {
    const settings={},globals={};
    for (const key of portableSettingKeys) settings[key]=readSetting(key) ?? null;
    for (let index=0;index<localStorage.length;index++) {
      const storedKey=localStorage.key(index),suffix="."+activeAccount;
      const key=storedKey.endsWith(suffix)?storedKey.slice(0,-suffix.length):storedKey;
      if (/\.(?:account|guest)\.\d+$|\.local$/.test(key) || !isPortableSettingKey(key)) continue;
      const value=readSetting(key);if(value!==null && value!==undefined)settings[key]=value;
    }
    for (const key of portableGlobalKeys) globals[key]=localStorage.getItem(key);
    return {format:"ro-helper-all-settings",version:1,replace:true,server:portableServer(location.hostname),settings,globals};
  }
  function parseAllSettings(text) {
    if (typeof text!=="string" || text.length>2*1024*1024) throw Error("設定檔不能超過 2 MB");
    const data=JSON.parse(text);
    if(data?.format!=="ro-helper-all-settings" || data.version!==1 || portableServer(data.server)!==portableServer(location.hostname))
      throw Error("請使用同一伺服器匯出的全部設定檔");
    const validate=(values,allowed)=>{
      if(!values || typeof values!=="object" || Array.isArray(values))throw Error("設定格式錯誤");
      const entries=Object.entries(values);
      if(entries.length>500 || entries.some(([key,value])=>!(allowed===portableSettingKeys?isPortableSettingKey(key):allowed.has(key)) || (value!==null && (typeof value!=="string" || value.length>1024*1024))))throw Error("設定檔含不支援或無效的項目");
      return Object.fromEntries(entries);
    };
    return {replace:data.replace===true,settings:validate(data.settings,portableSettingKeys),globals:validate(data.globals || {},portableGlobalKeys)};
  }
  function applyAllSettings(data) {
    const changes=new Map(Object.entries(data.settings).map(([key,value])=>[settingKey(key),value===null?"__ro_helper_default_v1__":value]));
    if(data.replace) for(let index=0;index<localStorage.length;index++) {
      const storedKey=localStorage.key(index),suffix="."+activeAccount;
      const key=storedKey.endsWith(suffix)?storedKey.slice(0,-suffix.length):storedKey;
      if(/\.(?:account|guest)\.\d+$|\.local$/.test(key) || !isPortableSettingKey(key) || Object.hasOwn(data.settings,key))continue;
      changes.set(settingKey(key),"__ro_helper_default_v1__");
    }
    for(const [key,value]of Object.entries(data.globals))changes.set(key,value);
    const prior=[...changes.keys()].map(key=>[key,localStorage.getItem(key)]);
    try { for(const [key,value]of changes){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);} }
    catch(error) { for(const [key,value]of prior){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}catch{}}throw error; }
    return changes.size;
  }
  const settingsTransferButton=document.createElement("button");
  settingsTransferButton.type="button";
  settingsTransferButton.textContent="設定搬家";
  settingsTransferButton.onclick=()=>{
    if(document.getElementById("ro-helper-transfer-settings"))return;
    const account=activeAccount,dialog=document.createElement("dialog");
    dialog.id="ro-helper-transfer-settings";
    dialog.style.cssText="width:min(440px,94vw);box-sizing:border-box";
    const title=document.createElement("strong");title.textContent="電腦／手機全部設定匯出／匯入";
    const hint=document.createElement("p");hint.textContent="特別版與 Gear 手機版共用設定檔，可直接互相匯入。包含技能、寶物、難度、關卡、整理、指定存倉、精煉、素質、回收與系統設定。只讀取目前帳號；不含登入憑證、網頁控制密碼、配對金鑰和掉落紀錄。";
    const exportButton=document.createElement("button");exportButton.textContent="匯出全部設定";exportButton.type="button";
    const importButton=document.createElement("button");importButton.textContent="匯入電腦／手機設定檔";importButton.type="button";
    const file=document.createElement("input");file.type="file";file.accept=".json,application/json";file.hidden=true;
    const note=document.createElement("p");note.setAttribute("role","status");
    const apply=document.createElement("button");apply.type="button";apply.textContent="套用並重新整理";apply.disabled=true;
    let pending;
    exportButton.onclick=()=>{
      if(activeAccount!==account){note.textContent="帳號已變更，請重新開啟設定搬家";return;}
      try{const data=exportAllSettings(),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"})),link=document.createElement("a");
        link.href=url;link.download="RO-助手全部設定.json";document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
        note.textContent="已匯出 "+(Object.keys(data.settings).length+Object.keys(data.globals).length)+" 項設定。傳到手機後，開啟助手「設定搬家」匯入即可；請使用相同遊戲版本（漢斯／國際）。";
      }catch(error){note.textContent="匯出失敗："+error.message;}
    };
    importButton.onclick=()=>file.click();
    file.onchange=async()=>{
      const selected=file.files?.[0];file.value="";pending=null;apply.disabled=true;if(!selected)return;
      try{if(selected.size>2*1024*1024)throw Error("設定檔不能超過 2 MB");const parsed=parseAllSettings(await selected.text());
        if(activeAccount!==account||!dialog.isConnected)return;
        if(parsed.settings["ro-helper-target-storage"] && typeof parseStorageImport==="function") {
          parseStorageImport(JSON.stringify({format:"ro-helper-target-storage",version:1,...JSON.parse(parsed.settings["ro-helper-target-storage"])}));
        }
        pending=parsed;apply.disabled=false;
        note.textContent="已讀取 "+(Object.keys(parsed.settings).length+Object.keys(parsed.globals).length)+" 項設定。套用會覆蓋目前帳號的助手設定，恢復來源預設值，停止助手並重新整理。請先匯出原設定備份。";
      }catch(error){note.textContent="匯入失敗："+error.message;}
    };
    apply.onclick=()=>{
      if(!pending || activeAccount!==account)return;
      try{applyAllSettings(pending);window.__roMenuHelper?.stop();sessionStorage.removeItem("ro-helper-refresh-resume");note.textContent="設定已匯入，正在重新整理";apply.disabled=true;setTimeout(()=>location.reload(),200);}
      catch(error){note.textContent="套用失敗："+error.message;}
    };
    const close=document.createElement("button");close.type="button";close.textContent="關閉";close.onclick=()=>dialog.close();
    dialog.append(title,hint,exportButton,importButton,file,note,apply,close);
    dialog.addEventListener("close",()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
  };

  const loginCharacterNumber = () => Math.min(100,Math.max(1,Math.trunc(Number(readSetting("ro-helper-login-character"))) || 1));
  const loginCharacterSetting = document.createElement("label");
  loginCharacterSetting.textContent = "重登角色 ";
  loginCharacterSetting.title = "從左上開始，由左到右、逐排計算，空位也算一格";
  const loginCharacterInput = document.createElement("input");
  loginCharacterInput.type = "number";
  loginCharacterInput.min = "1";
  loginCharacterInput.max = "100";
  loginCharacterInput.step = "1";
  loginCharacterInput.value = String(loginCharacterNumber());
  loginCharacterInput.style.cssText = "width:52px";
  loginCharacterInput.setAttribute("aria-label","自動重登角色序號");
  loginCharacterInput.addEventListener("change",()=>{
    const value = Math.min(100,Math.max(1,Math.trunc(Number(loginCharacterInput.value)) || 1));
    writeSetting("ro-helper-login-character",String(value));
    loginCharacterInput.value = String(value);
    status.textContent = "自動重登：第 "+value+" 個角色（從左上逐排計算）";
  });
  loginCharacterSetting.append(loginCharacterInput);

  const skills = () => (readSetting("ro-helper-skills") ?? defaults)
    .split(/[、,，\n]/).map(normalizeSkill).filter(Boolean);
  const focusSkill = () => normalizeSkill(readSetting("ro-helper-focus-skill") || "");
  let autoMove = readSetting("ro-helper-auto-move") !== "off";
  const movementToggle = document.createElement("button");
  movementToggle.type = "button";
  const updateMovementToggle = () => {
    movementToggle.textContent = autoMove ? "自動移動：開" : "自動移動：關";
    movementToggle.setAttribute("aria-pressed", String(autoMove));
  };
  updateMovementToggle();
  movementToggle.addEventListener("click", event => {
    event.stopPropagation();
    autoMove = !autoMove;
    writeSetting("ro-helper-auto-move", autoMove ? "on" : "off");
    updateMovementToggle();
    if (!autoMove) window.__roMenuHelper?.releaseMovement();
  });
  let forceGearPickup = true;
  const gearPickupToggle = {value:"priority"};
  const magnetIntervalSetting = document.createElement("label");
  magnetIntervalSetting.append("每 ");
  const magnetInterval = document.createElement("input");
  magnetInterval.type = "number";
  magnetInterval.min = "0.1";
  magnetInterval.step = "0.1";
  magnetInterval.style.cssText = "width:55px";
  magnetInterval.setAttribute("aria-label","撿磁鐵間隔（遊戲分鐘）");
  magnetIntervalSetting.append(magnetInterval," 遊戲分鐘撿一個磁鐵");
  const readMagnetMinutes = () => {
    const value = Number(readSetting("ro-helper-magnet-minutes"));
    return Number.isFinite(value) && value >= 0.1 ? value : 1;
  };
  let magnetSchedule = {last:0,time:null,token:null};
  function manualMagnetAction(packet,due,cleanupCollected,bossCleanup=false) {
    if(packet?.finalBoss)return "idle";
    if(packet?.cleanup || bossCleanup)return "cleanup";
    return due && packet?.magnetWaypoint ? "collect" : "idle";
  }
  function manualMagnetCleanupReady(packet) {
    return autoMove || magnetSchedule.cleanupCollected ||
      !packet?.magnetWaypoint && Number.isFinite(magnetSchedule.cleanupProbeAt) &&
      Date.now()-magnetSchedule.cleanupProbeAt>=350;
  }
  function updateTimedMagnet(packet, active) {
    const root = document.documentElement.dataset;
    const timed = gearPickupToggle.value === "timed";
    root.roHelperTimedMagnet = timed ? "on" : "off";
    root.roHelperStationaryMagnet = autoMove ? "off" : "on";
    if (!active) magnetSchedule = {last:0,time:null,token:root.roHelperMagnetCollected || ""};
    const seconds = packet?.battleSeconds;
    if (active && Number.isFinite(seconds) && seconds >= 0 && Math.abs(Date.now()-packet.at)<750) {
      if (magnetSchedule.time !== null && seconds < magnetSchedule.time - 1)
        magnetSchedule = {last:0,time:null,token:root.roHelperMagnetCollected || ""};
      const token = root.roHelperMagnetCollected || "";
      if (magnetSchedule.token === null) magnetSchedule.token = token;
      else if (token !== magnetSchedule.token) {
        magnetSchedule.last = seconds; magnetSchedule.token = token;
        if(packet?.cleanup || root.roHelperBossCleanup==="on") magnetSchedule.cleanupCollected=true;
      }
      magnetSchedule.time = seconds;
    }
    const due = timed && active && magnetSchedule.time !== null &&
      magnetSchedule.time - magnetSchedule.last >= readMagnetMinutes()*60;
    const cleanup = active && Boolean(packet?.cleanup || root.roHelperBossCleanup==="on");
    if(cleanup) magnetSchedule.cleanupProbeAt ??= Date.now();
    const cleanupMagnet = !autoMove && cleanup && !magnetSchedule.cleanupCollected;
    root.roHelperPriorityMagnet = forceGearPickup && autoMove || due || cleanupMagnet ? "on" : "off";
    return due;
  }
  const updateGearPickupToggle = () => {
    forceGearPickup = true;
    gearPickupToggle.value = "priority";
    magnetInterval.value = String(readMagnetMinutes());
    magnetIntervalSetting.hidden = gearPickupToggle.value !== "timed";
    document.documentElement.dataset.roHelperTimedMagnet = gearPickupToggle.value === "timed" ? "on" : "off";
    document.documentElement.dataset.roHelperPriorityMagnet = forceGearPickup ? "on" : "off";
  };
  updateGearPickupToggle();
  magnetInterval.addEventListener("change",() => {
    const value = Number(magnetInterval.value);
    writeSetting("ro-helper-magnet-minutes",String(Number.isFinite(value) && value >= 0.1 ? value : 1));
    magnetInterval.value = String(readMagnetMinutes());
  });
  const collisionMode = document.createElement("select");
  collisionMode.setAttribute("aria-label", "無視怪物碰撞時機");
  collisionMode.append(new Option("撿裝備／卡片時無視", "pickup"), new Option("一直無視", "always"));
  collisionMode.value = readSetting("ro-helper-collision-mode") === "always" ? "always" : "pickup";
  collisionMode.addEventListener("change", () => {
    writeSetting("ro-helper-collision-mode", collisionMode.value);
  });
  const defaults = "聖靈召喚、火箭術、雷爆術、火焰之壁、攻擊：法杖";
  const focusTreasure = key => normalizeTreasure(readSetting(key) || "");
  function createFocusChoice(label, key, read, list) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", label);
    const refresh = () => {
      const selected = read();
      select.replaceChildren(new Option(label + "：關", ""));
      for (const name of new Set([...list(), selected].filter(Boolean))) {
        select.append(new Option(label + "：" + name, name));
      }
      select.value = selected;
    };
    select.addEventListener("focus", refresh);
    select.addEventListener("pointerdown", refresh);
    select.addEventListener("change", () => writeSetting(key, select.value));
    return {select, refresh};
  }
  const skillFocus = createFocusChoice("專注技能", "ro-helper-focus-skill", focusSkill, () => skillList());
  const treasureFocusKeys = ["ro-helper-focus-treasure", "ro-helper-focus-treasure-2"];
  const treasureFocus = treasureFocusKeys.map((key, index) =>
    createFocusChoice("專注寶物 " + (index + 1), key, () => focusTreasure(key), () => treasureList()));

  const settings = document.createElement("button");
  settings.type = "button";
  settings.textContent = "技能設定";
  settings.style.cssText = button.style.cssText + ";right:165px";
  const readNames = key => {
    try { const value = JSON.parse(readSetting(key) || "[]"); return Array.isArray(value) ? value.filter(x => typeof x === "string") : []; }
    catch { return []; }
  };
  const stripTreasureUpgrade = name => name.normalize("NFKC").replace(/\s*\+\s*\d+\s*$/u,"").trim();
  const treasureNames = [
    ["恢復藥水","回復藥水","Poción de regeneración","Regeneration Potion","Poção de Regeneração"],
    ["冷卻藥水","冷卻藥水","Poción de enfriamiento","Cooldown Potion","Poção de Recarga"],
    ["生命藥水","生命藥水","Poción de vida","Life Potion","Poção de Vida"],
    ["護甲藥水","護甲藥水","Poción de armadura","Armor Potion","Poção de Armadura"],
    ["廣域藥水（遠）","範圍藥水（遠）","Poción de área","Area Potion","Poção de Área"],
    ["廣域藥水（近）","範圍藥水（近）","Poción de alcance","Reach Potion","Poção de Alcance"],
    ["採集藥水","採集藥水","Poción de recolección","Gathering Potion","Poção de Coleta"],
    ["貪欲藥水","貪婪藥水","Poción de la avaricia","Potion of Greed","Poção da Avareza"],
    ["速度藥水","速度藥水","Poción de velocidad","Speed Potion","Poção de Velocidade"],
    ["詠唱藥水","詠唱藥水","Poción de casteo","Casting Potion","Poção de Conjuração"],
    ["傷害藥水","傷害藥水","Poción de daño","Damage Potion","Poção de Dano"],
    ["爆擊靈藥","爆擊秘藥","Elixir de crítico","Critical Elixir","Elixir de Crítico"],
    ["傷害靈藥","傷害秘藥","Elixir de daño","Damage Elixir","Elixir de Dano"],
    ["生命靈藥","生命秘藥","Elixir de vida","Life Elixir","Elixir de Vida"],
    ["爆擊傷害藥劑","爆擊傷害秘藥","Elixir de daño crítico","Critical Damage Elixir","Elixir de Dano Crítico"],
    ["驚奇靈藥","驚奇秘藥","Elixir de sorpresa","Elixir of Surprise","Elixir Surpresa"],
    ["持續傷害藥劑","持續傷害秘藥","Elixir de daño en el tiempo","Damage over Time Elixir","Elixir de Dano Contínuo"],
    ["Flee（迴避） 秘藥","迴避秘藥","Elixir de Flee","Flee Elixir","Elixir de Esquiva"],
    ["詠唱靈藥","詠唱秘藥","Elixir de casteo","Casting Elixir","Elixir de Conjuração"],
    ["廣域靈藥","範圍秘藥","Elixir de área","Area Elixir","Elixir de Área"],
    ["護甲靈藥","護甲秘藥","Elixir de armadura","Armor Elixir","Elixir de Armadura"],
    ["傷害祝福","傷害祝福","Bendición de daño","Blessing of Damage","Bênção de Dano"],
    ["恢復祝福","回復祝福","Bendición de regeneración","Blessing of Regeneration","Bênção de Regeneração"],
    ["冷卻祝福","冷卻祝福","Bendición de enfriamiento","Blessing of Cooldown","Bênção de Recarga"],
    ["吸血祝福","吸血祝福","Bendición vampírica","Vampiric Blessing","Bênção Vampírica"],
    ["雙倍投擲祝福","雙重詠唱祝福","Bendición de doble casteo","Blessing of Double Cast","Bênção de Conjuração Dupla"],
    ["豐收祝福","豐饒祝福","Bendición de la abundancia","Blessing of Plenty","Bênção da Abundância"],
    ["詠唱祝福","詠唱祝福","Bendición de casteo","Blessing of Casting","Bênção de Conjuração"],
    ["廣域祝福（遠）","範圍祝福（遠）","Bendición de área","Blessing of Area","Bênção de Área"],
    ["廣域祝福（近）","範圍祝福（近）","Bendición de alcance","Blessing of Reach","Bênção do Alcance"],
    ["睿智祝福","智慧祝福","Bendición de la sabiduría","Blessing of Wisdom","Bênção da Sabedoria"],
    ["貪欲之神","貪婪之神","Deity de la avaricia","Deity of Avarice","Divindade da Avareza"],
    ["戰神","戰爭之神","Deity de la guerra","Deity of War","Divindade da Guerra"],
    ["行刑之神","處刑之神","Deity del verdugo","Deity of the Executioner","Divindade do Carrasco","虐刑之神"],
    ["剛力之神","力量之神","Deity de la fuerza","Deity of Might","Divindade do Poder"],
    ["冥思之神","思想之神","Deity del pensamiento","Deity of Thought","Divindade do Pensamento"],
    ["回憶之神","記憶之神","Deity de la memoria","Deity of Memory","Divindade da Memória"],
    ["堅壁之神","堡壘之神","Deity del baluarte","Deity of the Bulwark","Divindade do Baluarte"],
    ["風之神","疾風之神","Deity del viento","Deity of the Wind","Divindade do Vento"],
    ["生機之神","生命之神","Deity de la vida","Deity of Life","Divindade da Vida"],
    ["睿智之神","智慧之神","Deity de la sabiduría","Deity of Wisdom","Divindade da Sabedoria"],
    ["禁錮之神","束縛之神","Deity de la atadura","Deity of Binding","Divindade da Imobilização"],
    ["詐術之神","詭計之神","Deity del engaño","Deity of Trickery","Divindade da Astúcia"],
    ["折磨神格","折磨之神","Deity del tormento","Deity of Torment","Divindade do Tormento"],
    ["STR（力量） 料理","STR 料理","Plato de STR","STR Dish","Prato de FOR"],
    ["AGI（敏捷） 料理","AGI 料理","Plato de AGI","AGI Dish","Prato de AGI"],
    ["VIT（體力） 料理","VIT 料理","Plato de VIT","VIT Dish","Prato de VIT"],
    ["INT（智力） 料理","INT 料理","Plato de INT","INT Dish","Prato de INT"],
    ["DEX（靈巧） 料理","DEX 料理","Plato de DEX","DEX Dish","Prato de DES"],
    ["LUK（幸運） 料理","LUK 料理","Plato de LUK","LUK Dish","Prato de SOR"]
  ];
  const treasureNameIndex = new Map(treasureNames.flatMap(row => row.map(name => [stripTreasureUpgrade(name).toLowerCase(),row])));
  const normalizeTreasure = name => {
    const clean = stripTreasureUpgrade(name);
    return treasureNameIndex.get(clean.toLowerCase())?.[taiwanGame ? 0 : 1] ?? clean;
  };
  function treasureVariant(name) {
    const match = stripTreasureUpgrade(name).match(/^(?:廣域|範圍)(藥水|祝福)(?:\((近|遠)\))?$/u);
    return match ? {kind:match[1],range:match[2] || ""} : null;
  }
  function treasureMatches(name,actual) {
    const expected = normalizeTreasure(name);
    const observed = normalizeTreasure(actual);
    if (expected === observed) return true;
    const selected = treasureVariant(expected), shown = treasureVariant(observed);
    return Boolean(selected && shown && selected.kind === shown.kind && !selected.range);
  }
  function treasureCardName(card, fallback = "") {
    const name = card.querySelector(".pk-name")?.textContent.trim() || fallback;
    const normalized = normalizeTreasure(name);
    const variant = treasureVariant(normalized);
    if (!variant || variant.range) return normalized;
    const image = card.querySelector("img[src*=runitems]")?.getAttribute("src") || "";
    const icon = image.match(/\/(?:p|b)_(area|reach)\.png(?:[?#]|$)/i)?.[1];
    const effects = card.querySelector(".pk-lines")?.textContent || "";
    const near = icon === "reach" || (!icon && /近戰距離|melee reach|alcance (?:cuerpo a cuerpo|corpo a corpo)/i.test(effects));
    const far = icon === "area" || (!icon && /範圍|área|\barea\b/i.test(effects));
    if (!near && !far) return normalized;
    return normalizeTreasure(normalized+"("+ (near ? "近" : "遠") +")");
  }
  const knownTreasures = [
    ...treasureNames.map(([name]) => name),
    "火箭術 Deity", "冰箭術 Deity", "雷擊術 Deity", "聖靈召喚 Deity", "心靈爆破 Deity",
    "火焰之壁 Deity", "冰凍術 Deity", "火狩 Deity", "雷爆術 Deity"
  ];
  const treasureList = () => [...new Set([...knownTreasures, ...readNames("ro-helper-treasures")].map(normalizeTreasure).filter(name=>name && (!treasureVariant(name) || treasureVariant(name).range)))];
  const treasurePriority = () => readNames("ro-helper-treasure-priority").map(normalizeTreasure);
  const treasureCategories=[["deity","神祇"],["blessing","祝福"],["elixir","靈藥"],["potion","藥水"],["dish","料理"]];
  const treasureCategoryOrder=()=>{
    const saved=readSetting("ro-helper-treasure-category-priority");
    const values=saved==null?treasureCategories.map(([key])=>key):readNames("ro-helper-treasure-category-priority");
    return [...new Set(values.filter(value=>treasureCategories.some(([key])=>key===value)))];
  };
  function treasureCategory(card){
    const sub=(card.querySelector(".pk-sub")?.textContent||"").normalize("NFKC").trim().split(/[·・]/,1)[0].trim();
    const labels=[
      ["deity",/^(?:神祇|神祗|神格|神明|Deity|Deidad|Divindade)$/i],
      ["blessing",/^(?:祝福|Blessing|Bendici[oó]n|B[eê]n[cç][aã]o)$/i],
      ["elixir",/^(?:靈藥|秘藥|Elixir|Elix[ií]r)$/i],
      ["potion",/^(?:藥水|藥劑|Potion|Poci[oó]n|Po[cç][aã]o)$/i],
      ["dish",/^(?:料理|食物|餐點|Dish|Food|Plato|Prato)$/i]
    ];
    const category=labels.find(([,pattern])=>pattern.test(sub))?.[0];
    if(category)return category;
    const icon=card.querySelector("img[src*=runitems]")?.getAttribute("src")||"";
    const prefix=icon.match(/\/runitems\/([gbepd])_[^/]+\.png(?:[?#]|$)/i)?.[1]?.toLowerCase();
    if(prefix)return {g:"deity",b:"blessing",e:"elixir",p:"potion",d:"dish"}[prefix];
    const name=treasureCardName(card);
    if(/之神$|神格|(?:^|\s)Deity(?:\s|$)|Divindade/i.test(name))return "deity";
    if(/祝福|Blessing|Bendici[oó]n|B[eê]n[cç][aã]o/i.test(name))return "blessing";
    if(/靈藥|秘藥|Elixir/i.test(name))return "elixir";
    if(/藥水|Potion|Poci[oó]n|Po[cç][aã]o/i.test(name))return "potion";
    if(/料理|(?:^|\s)(?:Dish|Food|Plato|Prato)(?:\s|$)/i.test(name))return "dish";
    return null;
  }
  function selectCategoryTreasure(cards,order,names){
    for(const category of [...new Set(order)]){
      const candidates=cards.filter(card=>treasureCategory(card)===category);
      if(!candidates.length)continue;
      const rank=card=>{
        const index=names.findIndex(name=>treasureMatches(name,treasureCardName(card)));
        return index<0?Number.MAX_SAFE_INTEGER:index;
      };
      candidates.sort((a,b)=>rank(a)-rank(b)||cardRarity(b)-cardRarity(a));
      return candidates[0];
    }
    return null;
  }

  const jobSkillNames = {
    bash:["狂擊","Bash"],
    magnum:["怒爆","怒爆","Magnum Break"],
    sword_dance:["劍刃之舞","劍舞","Sword Dance"],
    shield_bash:["盾擊","盾牌衝擊","Shield Bash"],
    provoke:["挑釁","Provoke"],
    demoralizing_shout:["恐嚇吶喊","降低士氣的吶喊","Demoralizing Shout"],
    endure:["霸體","Endure"],
    hp_recovery:["快速恢復","快速恢復","Increase HP Recovery"],
    firebolt:["火箭術","火箭術","Fire Bolt"],
    coldbolt:["冰箭術","冰箭術","Cold Bolt","Ice Bolt"],
    lightning:["雷擊術","雷擊術","Lightning Bolt"],
    soul_strike:["聖靈召喚","聖靈召喚","Soul Strike"],
    napalm:["心靈爆破","心靈爆破","Napalm Beat"],
    fire_wall:["火焰之壁","火焰之壁","Fire Wall"],
    frost_diver:["冰凍術","冰凍術","Frost Diver"],
    sight:["火狩","Sight"],
    thunderstorm:["雷爆術","Thunderstorm"],
    double_strafe:["二連矢","二連矢","Double Strafe"],
    arrow_shower:["箭雨","箭雨","Arrow Shower"],
    arrow_rain:["驟雨箭","箭矢暴雨","Arrow Rain"],
    arrow_repel:["衝鋒箭","衝鋒箭","Arrow Repel"],
    retreat:["撤退","Retirada"],
    arcane_shot:["祕法射擊","奧術射擊","Arcane Shot"],
    fire_arrow:["火矢","火焰箭","Flecha ígnea"],
    concentration:["心神凝聚","心神凝聚","Improve Concentration"],
    heal:["治癒術","Heal"],
    holy_light:["神聖之光","神聖之光","Holy Light"],
    ruwach:["光獵","Ruwach"],
    decrease_agi:["緩速術","緩速術","Decrease AGI"],
    signum_crucis:["天使之光","天使之光","Signum Crucis"],
    aqua_benedicta:["天使之淚","天使之淚","Aqua Benedicta"],
    blessing:["天使之賜福","Blessing"],
    holy_smite:["聖擊","神聖重擊","Golpe sagrado"],
    envenom:["施毒","Envenom"],
    sand_attack:["噴砂","噴砂","Sand Attack"],
    hiding:["隱匿","Hiding"],
    throw_stone:["投擲石頭","投擲石頭","Throw Stone"],
    poison_bomb:["毒彈","毒藥瓶","Poison Bomb"],
    shadowstep:["影步","Shadowstep"],
    fan_of_knives:["刀扇","飛刀扇","Fan of Knives"],
    caltrops:["鐵蒺藜","Caltrops"],
    mammonite:["金錢攻擊","Mammonite"],
    cart_revolution:["手推車攻擊","手推車攻擊","Cart Revolution"],
    zeny_rain:["撒錢術","金幣雨","Zeny Rain"],
    cart_rush:["手推車突進","手推車衝撞","Cart Rush"],
    vending:["露天商店","Vending"],
    crazy_uproar:["大聲吶喊","大聲吶喊","Crazy Uproar"],
    enlarge_weight:["負重量上升","負重量上升","Enlarge Weight Limit"],
    tornado_kick:["迴旋踢","迴旋踢","Tornado Kick"],
    heel_drop:["砸踢","砸踢","Heel Drop"],
    roundhouse:["轉身踢","Roundhouse"],
    counter_kick:["還擊踢","還擊踢","Counter Kick"],
    sprint:["跑步","Sprint"],
    shuriken:["投擲飛鏢","投擲飛鏢","Throw Shuriken"],
    kunai:["投擲飛刀","投擲飛刀","Throw Kunai"],
    huuma:["投擲風魔飛鏢","投擲風魔飛鏢","Throw Huuma Shuriken"],
    flaming_petals:["火炎花","火炎花","Flaming Petals"],
    lightning_strike:["雷擊斬","雷擊碎","Lightning Strike"],
    triple_action:["三連攻擊","三連攻擊","Triple Action"],
    rapid_shower:["五連擊","五連擊","Rapid Shower"],
    spread_attack:["火力全開","火力全開","Spread Attack"],
    desperado:["亡命之徒","Desperado"],
    ground_drift:["四面埋伏","四面埋伏","Ground Drift"],
    tracking:["百步穿楊","Tracking"],
    brandish_spear:["騎乘攻擊","騎乘攻擊","Brandish Spear"],
    charge_attack:["衝鋒攻擊","衝鋒攻擊","Charge Attack"],
    pierce:["連刺攻擊","Pierce"],
    spear_boomerang:["投擲長矛攻擊","投擲長矛攻擊","Spear Boomerang"],
    auto_counter:["反擊","反擊","Counter Attack"],
    bowling_bash:["怪物互擊","怪物互擊","Bowling Bash"],
    spear_quicken:["長矛加速術","長矛加速術","Spear Quicken"],
    shield_charge:["盾擊","盾擊","Shield Charge"],
    holy_cross:["聖十字攻擊","聖十字攻擊","Holy Cross"],
    grand_cross:["聖十字審判","聖錘 十字星","Grand Cross"],
    shield_boomerang:["迴旋盾擊","迴旋盾擊","Shield Boomerang"],
    auto_guard:["自動防禦","自動防禦","Auto Guard"],
    meteor_storm:["隕石術","隕石術","Meteor Storm","隕石"],
    fire_pillar:["火柱攻擊","火柱攻擊","Fire Pillar","火柱"],
    frost_nova:["霜凍之術","霜凍之術","Frost Nova"],
    storm_gust:["暴風雪","暴風雪","Storm Gust"],
    jupitel_thunder:["雷鳴術","雷鳴術","Jupitel Thunder"],
    lord_of_vermilion:["怒雷強擊","怒雷強擊","Lord of Vermilion"],
    volcano:["火元素領域","Volcano"],
    deluge:["水元素領域","Deluge"],
    earth_spike:["地震術","地震術","Earth Spike"],
    heavens_drive:["崩裂術","崩裂術","Heaven's Drive"],
    hindsight:["自動念咒","Hindsight"],
    abracadabra:["隨機技能","Abracadabra"],
    blitz_beat:["閃電衝擊","閃電衝擊","Blitz Beat"],
    detecting:["獵鷹尋敵","Detecting"],
    claymore_trap:["爆散陷阱","爆散陷阱","Claymore Trap"],
    sandman:["睡魔陷阱","Sandman"],
    beast_strafing:["動物猛擊","動物猛擊","Beast Strafing"],
    phantasmic_arrow:["幻影箭","幻影箭","Phantasmic Arrow"],
    arrow_vulcan:["奧義箭亂舞","奧義箭亂舞","Arrow Vulcan"],
    dissonance:["不諧和音","Dissonance"],
    lullaby:["搖籃曲","Lullaby"],
    lokis_veil:["洛奇的悲鳴","洛奇的悲鳴","Loki's Veil"],
    drum_battlefield:["戰鼓震天","戰鼓震天","A Drum on the Battlefield"],
    siegfried:["不死神齊格弗里德","不死神齊格弗里德","Invulnerable Siegfried"],
    sanctuary:["光耀之堂","Sanctuary"],
    safety_wall:["暗之障壁","暗之障壁","Safety Wall"],
    benedictio:["聖之祈福","Benedictio"],
    magnus_exorcismus:["十字驅魔攻擊","十字驅魔攻擊","Magnus Exorcismus"],
    impositio:["神威祈福","神威祈福","Impositio Manus"],
    magnificat:["聖母之頌歌","Magnificat"],
    call_spirits:["蓄氣","蓄氣","Call Spirits"],
    finger_offensive:["彈指神通","彈指神通","Finger Offensive"],
    chain_combo:["連環全身掌","連環全身掌","Chain Combo"],
    combo_finish:["猛龍誇強","猛龍誇強","Combo Finish"],
    fury:["爆氣","Fury"],
    asura_strike:["阿修羅霸凰拳","阿修羅霸凰拳","Asura Strike"],
    sonic_blow:["音速投擲","音速投擲","Sonic Blow"],
    grimtooth:["無影之牙","Grimtooth"],
    enchant_poison:["塗毒","塗毒","Enchant Poison"],
    venom_dust:["病毒散撥","病毒散撥","Venom Dust"],
    cloaking:["偽裝","Cloaking"],
    venom_knife:["毒刃","毒刃","Venom Knife"],
    back_stab:["背刺","背刺","Back Stab"],
    raid:["潛擊","Raid"],
    divest_weapon:["卸除武器","卸除武器","Divest Weapon"],
    intimidate:["恐嚇","Intimidate"],
    steal_coin:["偷錢","偷錢","Steal Coin"],
    graffiti:["塗鴉","Graffiti"],
    axe_tornado:["戰斧颶風","旋風斧","Axe Tornado"],
    axe_boomerang:["迴旋斧","回力斧","Axe Boomerang"],
    weapon_perfection:["無視體型攻擊","無視體型攻擊","Weapon Perfection"],
    rush_quake:["衝擊撼動","衝擊震地","Rush Quake"],
    greed:["貪婪","Greed"],
    ore_discovery:["尋找礦石","尋找礦石","Ore Discovery"],
    acid_terror:["強酸攻擊","強酸攻擊","Acid Terror"],
    demonstration:["火煙瓶投擲","Demonstration"],
    call_homunculus:["生命體召喚","生命體召喚","Call Homunculus"],
    summon_flora:["生物調撥","生物調撥","Summon Flora"],
    potion_pitcher:["藥水投擲","藥水投擲","Potion Pitcher"],
    chemical_protection:["化學保護","化學保護","Chemical Protection"],
    warmth_sun:["太陽的溫暖","太陽的溫暖","Warmth of the Sun"],
    solar_burst:["太陽爆炸","太陽爆發","Solar Burst"],
    full_moon_kick:["滿月腳","滿月踢","Full Moon Kick"],
    new_moon_kick:["朔月腳","新月踢","New Moon Kick"],
    falling_star:["流星殞落","流星墜落","Falling Star"],
    union:["太陽和月亮和星星的融合","太陽和月亮和星星的融合","Union of the Sun, Moon and Stars"],
    esma:["艾斯麻","Esma"],
    estin:["艾斯提","Estin"],
    estun:["艾斯敦","Estun"],
    kaizel:["凱易哲","Kaizel"],
    kaahi:["凱阿希","Kaahi"],
    kaupe:["凱誣僕","Kaupe"],
    adoramus:["讚頌","Adoramus"],
    judex:["審判之光","Judex Ray"],
    epiclesis:["聖樹降臨","Epiclesis Tree"],
    lauda_ramus:["讚美詩","Lauda Ramus"],
    oratio:["神聖祈禱","Holy Oratio"],
    highness_heal:["至高治癒","Highness Heal"],
    cart_cannon:["推車砲","Cart Cannon"],
    cart_tornado:["推車龍捲風","Cart Tornado"],
    spore_explosion:["孢子爆炸","Spore Explosion"],
    acid_demonstration:["強酸火煙瓶","Acid Demonstration"],
    hells_plant:["地獄之花","Hell's Plant"],
    mandragora_howl:["曼陀羅之嚎","Howling of Mandragora"],
    rolling_cutter:["迴旋斬","Rolling Cutter"],
    cross_ripper_slasher:["十字撕裂斬","Cross Ripper Slasher"],
    cross_impact:["十字衝擊","Cross Impact"],
    dark_claw:["暗黑之爪","Dark Claw"],
    poison_smoke:["毒霧","Poison Smoke"],
    hallucination_walk:["幻覺步","Hallucination Walk"],
    swirling_petal:["風魔花亂","Swirling Petal"],
    spirit_charm:["符咒・炎天","Spirit Charm"],
    kunai_explosion:["爆裂苦無","Kunai Explosion"],
    kunai_splash:["八方苦無","Kunai Splash"],
    cross_slash:["十字斬","Cross Slash"],
    shadow_warrior:["影武者","Shadow Warrior"],
    arms_cannon:["臂砲","Arm Cannon"],
    flame_launcher:["火焰噴射器","Flame Launcher"],
    vulcan_arm:["機關砲臂","Vulcan Arm"],
    silver_sniper:["自走砲台：銀色狙擊手","FAW Silver Sniper"],
    cold_slower:["冷凍彈","Cold Slower"],
    neutral_barrier:["中立屏障","Neutral Barrier"],
    severe_rainstorm:["嚴酷暴雨","Severe Rainstorm"],
    reverberation:["回響","Reverberation"],
    metallic_sound:["金屬之音","Metallic Sound"],
    great_echo:["大回聲","Great Echo"],
    windmill_rush:["風車衝鋒之歌","Windmill Rush Song"],
    frigg_song:["芙麗嘉之歌","Frigg's Song"],
    arrow_storm:["萬箭齊發","Arrow Barrage"],
    cluster_bomb:["集束炸彈","Cluster Bomb"],
    warg_strike:["座狼突襲","Warg Strike"],
    aimed_bolt:["瞄準射擊","Aimed Bolt"],
    fear_breeze:["恐懼之風","Fear Breeze"],
    electric_shocker:["電擊陷阱","Electric Shocker"],
    fire_dance:["烈火之舞","Firedance"],
    round_trip:["往返射擊","Round Trip"],
    crimson_marker:["緋紅標記","Crimson Marker"],
    dragon_tail:["龍尾","Dragontail"],
    hammer_of_god:["神之雷鎚","God Hammer"],
    howling_mine:["嚎叫地雷","Howling Mine"],
    cannon_spear:["加農矛","Cannon Spear"],
    earth_drive:["大地衝擊","Earth Drive"],
    shield_press:["盾壓","Shield Press"],
    genesis_ray:["創世之光","Genesis Ray"],
    prestige:["威望","Prestige"],
    inspiration:["激勵","Inspiration"],
    ignition_break:["點火爆破","Ignition Break"],
    wind_cutter:["風之刃","Wind Cutter"],
    dragon_breath:["龍息","龍的呼吸","Dragon Breath"],
    hundred_spear:["百槍刺","Hundred Spear"],
    giant_growth:["巨人成長符文","Giant Growth"],
    dragon_howling:["龍之咆哮","Dragon Howling"],
    triangle_shot:["三角射擊","Triangle Shot"],
    fatal_menace:["致命威脅","Fatal Menace"],
    feint_bomb:["假爆彈","Feint Bomb"],
    reproduce:["複製","Reproduce"],
    masquerade:["假面詛咒","Masquerade"],
    auto_shadow_spell:["自動魅影念咒","Auto Shadow Spell"],
    elemental_spirit:["元素精靈","Elemental Spirit"],
    varetyr_spear:["瓦雷特之矛","Varetyr Spear"],
    psychic_wave:["念力波","Psychic Wave"],
    vacuum_extreme:["真空極限","Vacuum Extreme"],
    fire_walk:["火焰步道","Fire Walk"],
    diamond_dust:["鑽石星塵","Diamond Dust"],
    espa:["艾斯帕","Espa"],
    eswhoo:["艾斯乎","Eswhoo"],
    soul_curse:["靈魂詛咒","Soul Curse"],
    curse_explosion:["詛咒爆炸","Curse Explosion"],
    soul_collect:["靈魂收集","Soul Collect"],
    soul_explosion:["靈魂爆炸","Soul Explosion"],
    prominence_kick:["日珥踢","Prominence Kick"],
    flash_kick:["閃光踢","Flash Kick"],
    star_emperor_advent:["星帝降臨","Star Emperor Advent"],
    nova_explosion:["新星爆炸","Nova Explosion"],
    universe_stance:["宇宙架式","Universe Stance"],
    gravity_control:["重力控制","Gravity Control"],
    skynet_blow:["天羅地網","Sky Net Blow"],
    rampage_blaster:["狂暴爆破","Rampage Blaster"],
    tiger_cannon:["虎砲","Tiger Cannon"],
    knuckle_arrow:["拳之箭","Knuckle Arrow"],
    raising_dragon:["升龍","Raising Dragon"],
    howling_of_lion:["獅子吼","Howling of Lion"],
    comet:["彗星術","Comet Fall"],
    crimson_rock:["赤紅岩石","Crimson Rock"],
    jack_frost:["傑克冰霜","Jack Frost"],
    tetra_vortex:["四重漩渦","Tetra Vortex"],
    summon_spheres:["元素法球","Elemental Spheres"],
    frost_misty:["冰霜之霧","Frost Misty"],
  };
  const skillJobs = {
    swordsman:["",["swordsman","Swordsman","劍士"],["bash","magnum","sword_dance","shield_bash","provoke","demoralizing_shout","endure","hp_recovery"]],
    mage:["",["mage","Mage","魔法師"],["firebolt","coldbolt","lightning","soul_strike","napalm","fire_wall","frost_diver","sight","thunderstorm"]],
    archer:["",["archer","Archer","弓箭手"],["double_strafe","arrow_shower","arrow_rain","arrow_repel","retreat","arcane_shot","fire_arrow","concentration"]],
    acolyte:["",["acolyte","Acolyte","服事"],["heal","holy_light","ruwach","decrease_agi","signum_crucis","aqua_benedicta","blessing","holy_smite"]],
    thief:["",["thief","Thief","盜賊"],["envenom","sand_attack","hiding","throw_stone","poison_bomb","shadowstep","fan_of_knives","caltrops"]],
    merchant:["",["merchant","Merchant","商人"],["mammonite","cart_revolution","zeny_rain","cart_rush","vending","crazy_uproar","enlarge_weight"]],
    taekwon:["",["taekwon","Taekwon","跆拳少年"],["tornado_kick","heel_drop","roundhouse","counter_kick","sprint"]],
    ninja:["",["ninja","Ninja","忍者"],["shuriken","kunai","huuma","flaming_petals","lightning_strike"]],
    gunslinger:["",["gunslinger","Gunslinger","神槍手"],["triple_action","rapid_shower","spread_attack","desperado","ground_drift","tracking"]],
    knight:["swordsman",["knight","Knight","騎士"],["brandish_spear","charge_attack","pierce","spear_boomerang","auto_counter","bowling_bash"]],
    crusader:["swordsman",["crusader","Crusader","十字軍"],["spear_quicken","shield_charge","holy_cross","grand_cross","shield_boomerang","auto_guard"]],
    wizard:["mage",["wizard","Wizard","巫師"],["meteor_storm","fire_pillar","frost_nova","storm_gust","jupitel_thunder","lord_of_vermilion"]],
    sage:["mage",["sage","Sage","賢者"],["volcano","deluge","earth_spike","heavens_drive","hindsight","abracadabra"]],
    hunter:["archer",["hunter","Hunter","獵人"],["blitz_beat","detecting","claymore_trap","sandman","beast_strafing","phantasmic_arrow"]],
    bard:["archer",["bard","Bard","吟遊詩人","Dancer","舞孃"],["arrow_vulcan","dissonance","lullaby","lokis_veil","drum_battlefield","siegfried"]],
    priest:["acolyte",["priest","Priest","祭司"],["sanctuary","safety_wall","benedictio","magnus_exorcismus","impositio","magnificat"]],
    monk:["acolyte",["monk","Monk","武道家"],["call_spirits","finger_offensive","chain_combo","combo_finish","fury","asura_strike"]],
    assassin:["thief",["assassin","Assassin","刺客"],["sonic_blow","grimtooth","enchant_poison","venom_dust","cloaking","venom_knife"]],
    rogue:["thief",["rogue","Rogue","流氓"],["back_stab","raid","divest_weapon","intimidate","steal_coin","graffiti"]],
    blacksmith:["merchant",["blacksmith","Blacksmith","鐵匠"],["axe_tornado","axe_boomerang","weapon_perfection","rush_quake","greed","ore_discovery"]],
    alchemist:["merchant",["alchemist","Alchemist","鍊金術師"],["acid_terror","demonstration","call_homunculus","summon_flora","potion_pitcher","chemical_protection"]],
    star_gladiator:["taekwon",["star_gladiator","Star Gladiator","拳聖"],["warmth_sun","solar_burst","full_moon_kick","new_moon_kick","falling_star","union"]],
    soul_linker:["taekwon",["soul_linker","Soul Linker","悟靈士"],["esma","estin","estun","kaizel","kaahi","kaupe"]],
    arch_bishop:["priest",["arch_bishop","Arch Bishop","大主教"],["adoramus","judex","epiclesis","lauda_ramus","oratio","highness_heal"]],
    genetic:["alchemist",["genetic","Genetic","基因學者"],["cart_cannon","cart_tornado","spore_explosion","acid_demonstration","hells_plant","mandragora_howl"]],
    guillotine_cross:["assassin",["guillotine_cross","Guillotine Cross","十字斬首者"],["rolling_cutter","cross_ripper_slasher","cross_impact","dark_claw","poison_smoke","hallucination_walk"]],
    kagerou:["ninja",["kagerou","Kagerou","影狼","Oboro","朧"],["swirling_petal","spirit_charm","kunai_explosion","kunai_splash","cross_slash","shadow_warrior"]],
    mechanic:["blacksmith",["mechanic","Mechanic","機械工匠"],["arms_cannon","flame_launcher","vulcan_arm","silver_sniper","cold_slower","neutral_barrier"]],
    minstrel:["bard",["minstrel","Minstrel","宮廷樂師","Wanderer Dancer","浪姬舞者"],["severe_rainstorm","reverberation","metallic_sound","great_echo","windmill_rush","frigg_song"]],
    ranger:["hunter",["ranger","Ranger","遊俠"],["arrow_storm","cluster_bomb","warg_strike","aimed_bolt","fear_breeze","electric_shocker"]],
    rebellion:["gunslinger",["rebellion","Rebellion","叛亂者"],["fire_dance","round_trip","crimson_marker","dragon_tail","hammer_of_god","howling_mine"]],
    royal_guard:["crusader",["royal_guard","Royal Guard","皇家禁衛隊"],["cannon_spear","earth_drive","shield_press","genesis_ray","prestige","inspiration"]],
    rune_knight:["knight",["rune_knight","Rune Knight","盧恩騎士"],["ignition_break","wind_cutter","dragon_breath","hundred_spear","giant_growth","dragon_howling"]],
    shadow_chaser:["rogue",["shadow_chaser","Shadow Chaser","魅影追蹤者"],["triangle_shot","fatal_menace","feint_bomb","reproduce","masquerade","auto_shadow_spell"]],
    sorcerer:["sage",["sorcerer","Sorcerer","元素使"],["elemental_spirit","varetyr_spear","psychic_wave","vacuum_extreme","fire_walk","diamond_dust"]],
    soul_reaper:["soul_linker",["soul_reaper","Soul Reaper","獵靈士"],["espa","eswhoo","soul_curse","curse_explosion","soul_collect","soul_explosion"]],
    star_emperor:["star_gladiator",["star_emperor","Star Emperor","拳皇"],["prominence_kick","flash_kick","star_emperor_advent","nova_explosion","universe_stance","gravity_control"]],
    sura:["monk",["sura","Sura","修羅"],["skynet_blow","rampage_blaster","tiger_cannon","knuckle_arrow","raising_dragon","howling_of_lion"]],
    warlock:["wizard",["warlock","Warlock","咒術士"],["comet","crimson_rock","jack_frost","tetra_vortex","summon_spheres","frost_misty"]],
  };
  const skillNameKey = name => name.normalize("NFKC").trim().toLowerCase();
  const skillNameIndex = new Map(Object.values(jobSkillNames).flatMap(row => row.map(name => [skillNameKey(name),row])));
  const bowBasicAliases=new Set(["攻擊:弓","弓普攻","弓普通攻擊","attack:bow","basicattack:bow","ataque:arco"]);
  const normalizeSkill = name => bowBasicAliases.has(skillNameKey(name).replace(/\s+/g,"")) ? (taiwanGame?"攻擊：弓":"Attack: Bow") : skillNameIndex.get(skillNameKey(name))?.[taiwanGame ? 0 : 1] ?? name.trim();
  const skillCardName = card => card.querySelector(".pk-name")?.textContent.trim() || "";
  const skillMatches = (name,actual) => skillNameKey(normalizeSkill(name)) === skillNameKey(normalizeSkill(actual));
  const skillJobIndex = new Map(Object.entries(skillJobs).flatMap(([id,[,aliases]]) => aliases.map(name => [skillNameKey(name),id])));
  let skillJob;
  function activeSkillJob(openPanel = false) {
    const hudName = document.querySelector("#hud:not(.hidden) #hud-name small")?.textContent.trim();
    if (hudName) return skillJob = {name:hudName,id:skillJobIndex.get(skillNameKey(hudName))};
    if (!document.body.classList.contains("in-lobby")) return null;
    let panel = document.querySelector("#charpanel:not(.hidden)");
    const opened = !panel && openPanel && !document.querySelector(".overlay:not(.hidden),#npc-dialog:not(.hidden)");
    if (opened) {
      document.querySelector("#lobby-char:not(:disabled)")?.click();
      panel = document.querySelector("#charpanel:not(.hidden)");
    }
    const title = panel?.querySelector("#cp-title")?.textContent.trim();
    if (opened) panel?.querySelector("#cp-back")?.click();
    if (title?.includes(" · ")) {
      const name = title.split(" · ").at(-1);
      skillJob = {name,id:skillJobIndex.get(skillNameKey(name))};
    }
    return skillJob;
  }
  function skillList(job = activeSkillJob()) {
    if (!job?.id) return [];
    const names = [];
    for (let id = job.id; id; ) {
      const [base,,skills] = skillJobs[id];
      names.unshift(...skills.map(skill => jobSkillNames[skill][taiwanGame ? 0 : 1]));
      if (id === "mage") names.push("攻擊：法杖");
      id = base;
    }
    const seen = readNames("ro-helper-seen-skills-"+job.id).filter(isBasicAttack);
    return [...new Set([...names,...seen])];
  }
  const skillLevelConfig = () => { try { return JSON.parse(readSetting("ro-helper-skill-level-plan") || "{}"); } catch { return {}; } };
  function evaluateSkillLevelPlan(config, priorities, levels) {
    if(!config.enabled)return {enabled:false,done:false};
    const goals=(config.names||priorities).map((name,index)=>({name,target:Number(config.targets?.[index])||0})).filter(g=>g.name&&g.target>0);
    if(!levels||!goals.length&&config.order!=='acquireFirst')return {enabled:true,done:false};
    const optional=new Set((config.banishNames||[]).map(normalizeSkill)),level=g=>levels.get(normalizeSkill(g.name))||0;
    const relevant=goals.filter(g=>!optional.has(normalizeSkill(g.name))||level(g)>0);
    const pending=relevant.filter(g=>level(g)<g.target);
    const acquisitionPending=config.order==='acquireFirst'?(config.names||priorities).filter(name=>name&&!(levels.get(normalizeSkill(name))>0)):[];
    return {enabled:true,done:relevant.length>0&&pending.length===0&&acquisitionPending.length===0,next:pending[0]?.name,pending:pending.map(g=>g.name),acquisitionPending,unlimited:(config.names||priorities).filter((name,index)=>name&&!(Number(config.targets?.[index])>0)),order:config.order||'rarity',reached:goals.filter(g=>level(g)>=g.target).map(g=>g.name),ignored:goals.filter(g=>optional.has(normalizeSkill(g.name))&&level(g)===0).map(g=>g.name)};
  }
  let skillLevelProgress={signature:'',levels:new Map()};
  function resetSkillLevelProgress(){skillLevelProgress={signature:'',levels:new Map()};}
  function readSkillLevelPlan() {
    const rawConfig=skillLevelConfig(),config={...rawConfig,banishNames:typeof banishSkills==='function'?banishSkills():rawConfig.banishNames||[]};if(!config.enabled)return {enabled:false,done:false};
    const priorities=skills(),signature=JSON.stringify([config.names||priorities,config.targets||[]]);
    if(skillLevelProgress.signature!==signature)skillLevelProgress={signature,levels:new Map()};
    const slots=[...document.querySelectorAll('#skillbar [data-skill], #lu-sockets [data-skill]')],tip=document.getElementById('skill-tip');
    const nodes=tip?[...tip.childNodes]:[],cls=tip?.className,style=tip?.getAttribute('style');
    const remember=(name,level)=>{if(!name||!Number.isSafeInteger(level)||level<1)return;name=normalizeSkill(name);skillLevelProgress.levels.set(name,Math.max(level,skillLevelProgress.levels.get(name)||0));};
    try{for(const slot of slots){
      const level=Number(slot.querySelector('.lvl')?.textContent);if(!Number.isSafeInteger(level)||level<1)continue;
      let actual='';
      if(tip){tip.classList.add('hidden');slot.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));if(!tip.classList.contains('hidden'))actual=tip.querySelector('.st-head b')?.textContent?.replace(/\s*\([^)]*\)\s*$/,'').trim()||'';}
      // Use the game's live name first; retain known ID aliases only as corroboration.
      if(actual)remember(actual,level);
      const aliases=jobSkillNames[slot.dataset.skill];if(aliases)for(const alias of aliases)remember(alias,level);
    }}finally{if(tip){tip.replaceChildren(...nodes);tip.className=cls;if(style===null)tip.removeAttribute('style');else tip.setAttribute('style',style);}}
    // Missing unrelated icons never invalidate confirmed goals. An unobserved
    // required skill still evaluates as zero and cannot count as achieved.
    // An upgrade offer exposes the current level (left of the arrow), even if a
    // hidden or banished HUD icon cannot produce a tooltip. Fresh offers count zero.
    for(const card of document.querySelectorAll('#picker:not(.hidden):not(.closing) #pk-cards .pk-card')){
      if(card.querySelector('.pk-ribbon'))continue;
      const name=card.querySelector('.pk-name')?.textContent.trim(),sub=card.querySelector('.pk-sub')?.textContent.normalize('NFKC').trim()||'';
      const level=Number(sub.match(/^(?:Lv\.?|Nv\.?|Level|等級)\s*(\d+)\s*(?:→|->)/i)?.[1]);remember(name,level);
    }
    const result=evaluateSkillLevelPlan(config,priorities,skillLevelProgress.levels);
    result.pendingDetails=(result.pending||[]).map(name=>{const index=(config.names||priorities).findIndex(n=>skillMatches(n,name)),level=skillLevelProgress.levels.get(normalizeSkill(name));return name+'（'+(level??'未讀到')+'/'+Number(config.targets?.[index])+'）';});
    return result;
  }
  function choosePlannedSkillCard(cards,plan){
    if(!plan.enabled)return null;
    const ranked=(pool,names)=>pool.sort((a,b)=>cardRarity(b)-cardRarity(a)||names.findIndex(n=>skillMatches(n,skillCardName(a)))-names.findIndex(n=>skillMatches(n,skillCardName(b))))[0]||null;
    if(plan.order==='acquireFirst'){
      const missing=plan.acquisitionPending||[];
      const fresh=cards.filter(card=>card.querySelector('.pk-ribbon')&&missing.some(name=>skillMatches(name,skillCardName(card))));
      if(fresh.length)return ranked(fresh,missing);
      const pending=plan.pending||[],upgrade=ranked(cards.filter(card=>pending.some(name=>skillMatches(name,skillCardName(card)))),pending);if(upgrade)return upgrade;const unlimited=plan.unlimited||[];return ranked(cards.filter(card=>unlimited.some(name=>skillMatches(name,skillCardName(card)))),unlimited);
    }
    const names=plan.order==='priority'?[plan.next]:(plan.pending||[plan.next]);
    return ranked(cards.filter(card=>names.some(name=>name&&skillMatches(name,skillCardName(card)))),names);
  }
  const banishSkills = () => readNames("ro-helper-banish-skills").map(normalizeSkill);
  const banishBasic = () => readSetting("ro-helper-banish-basic") === "on";
  const elementalArrows = [
    ["firebolt","火箭術","Fire Bolt"], ["coldbolt","冰箭術","Cold Bolt"], ["lightning","雷擊術","Lightning Bolt"]
  ];
  const arrowUpgrades = [
    ["shots","追加發數",/發數|投射物|[+＋]\s*\d+\s*(?:(?:枚|顆|道|支|發)(?:\s|$|[，。個箭彈投攻])|(?:bolts?|shots?|projectiles?|proyectil(?:es)?|proj[eé]teis|disparos?)\b)|(?:額外|追加|增加)\s*\d*\s*(?:發|枚|支|顆)|\b(?:projectiles?|proyectil(?:es)?|proj[eé]teis)\b/i],
    ["targets","目標數量",/目標數(?:量)?|目標\s*[:：]?\s*[+＋]\s*\d+|\b(?:targets?|objetivos?|alvos?)\s*[:：]?\s*[+＋]\s*\d+|[+＋]\s*\d+\s*(?:個\s*)?目標|[+＋]\s*\d+\s*(?:targets?|objetivos?|alvos?)\b/i],
    ["damage","傷害",/傷害|damage/i],
    ["haste","急速",/急速|冷卻(?:時間|縮減)?|\b(?:haste|cooldown|celeridad|enfriamiento|recarga)\b/i],
    ["cast","詠唱速度",/詠唱|吟唱|施法|cast/i]
  ];
  const arrowSetting = key => readSetting("ro-helper-arrow-" + key);
  const starterSlots = ["starter","starter2","starter3"];
  const starterValue = (key, index) => normalizeSkill(arrowSetting(key) ?? (index === 0 && arrowSetting("mode") === "on" ? "coldbolt" : ""));
  const starterArrows = () => starterSlots.map(starterValue);
  const starterOptions = names => [["","不指定"], ...elementalArrows.filter(([,zh,en])=>names.some(name=>skillMatches(name,zh) || skillMatches(name,en))), ...names
    .filter(name => !isBasicAttack(name) && !elementalArrows.some(([,zh,en]) => name === zh || name === en))
    .map(name => [name,name])];
  function selectStartingSkill(cards, starters, skipArrows) {
    for (const starter of new Set(starters.filter(Boolean))) {
      const arrow = elementalArrows.find(([id]) => id === starter);
      if (skipArrows && arrow) continue;
      const choice = cards.find(card => {
        if (!card.querySelector(".pk-ribbon")) return false;
        const name = skillCardName(card);
        return arrow ? arrow.slice(1).includes(name) || (starter === "coldbolt" && /^ice bolt$/i.test(name)) : skillMatches(starter,name);
      });
      if (choice) return choice;
    }
    return null;
  }
  const elementalArrowOf = card => {
    const identify = text => elementalArrows.find(([,zh,en]) =>
      text.includes(zh) || text.includes(en.toLowerCase()))?.[0] ||
      (/\bice bolt\b/.test(text) ? "coldbolt" : undefined);
    // Shared upgrades can display Cold Bolt as the title and the real arrow in the subtitle.
    return identify(card.querySelector(".pk-sub")?.textContent.toLowerCase() || "") ||
      identify(skillCardName(card).toLowerCase());
  };
  function arrowUpgradeMatches(card) {
    const rows = [...(card.querySelector(".pk-lines")?.querySelectorAll("li") ?? [])]
      .filter(row => !row.querySelector(".pk-talent"))
      .map(row => row.textContent.normalize("NFKC").trim());
    return arrowUpgrades.filter(([key,,pattern]) => rows.some(line => {
      if (key === "damage" && /緩速|冰凍機率|凍結機率|燃燒|中毒|slow|freeze chance|burn|poison/i.test(line)) return false;
      if (key === "haste" && /詠唱|吟唱|施法|\bcast(?:ing)?\b/i.test(line) && !/冷卻|cooldown/i.test(line)) return false;
      return pattern.test(line);
    })).map(([key]) => key);
  }
  function selectTargetArrowOrPriority(cards, priorities) {
    const targets=cards.filter(card=>elementalArrowOf(card) && !card.querySelector(".pk-ribbon") &&
      arrowUpgradeMatches(card).includes("targets"));
    targets.sort((a,b)=>cardRarity(b)-cardRarity(a));
    if(targets.length)return targets[0];
    for(const name of priorities){
      const arrow=elementalArrows.find(([id,zh,en])=>name===id || skillMatches(name,zh) || skillMatches(name,en));
      const choices=cards.filter(card=>arrow ? elementalArrowOf(card)===arrow[0] : skillMatches(name,skillCardName(card)));
      choices.sort((a,b)=>cardRarity(b)-cardRarity(a));
      if(choices.length)return choices[0];
    }
    return null;
  }
  function selectElementalArrow(cards, owned, starters, preference) {
    const fresh = card => Boolean(card.querySelector(".pk-ribbon"));
    const upgrades = cards.filter(card => elementalArrowOf(card) && !fresh(card));
    if (!owned && !upgrades.length) {
      for (const starter of new Set(starters.filter(Boolean))) {
        const choice = cards.find(card => elementalArrowOf(card) === starter && fresh(card));
        if (choice) return choice;
      }
      return null;
    }
    const ranked = upgrades.map(card => {
      const matches = arrowUpgradeMatches(card);
      const rarity = cardRarity(card);
      const priority = rarity === 4 ? 3 : matches.includes("targets") ? 2 :
        matches.includes("damage") || matches.includes("haste") ? 1 : 0;
      return {card,priority,rarity,preferred:matches.includes(preference)};
    });
    ranked.sort((a,b)=>b.priority-a.priority || b.rarity-a.rarity || Number(b.preferred)-Number(a.preferred));
    return ranked[0]?.card ?? null;
  }
  const extraSkillSlots=["extra1","extra2","extra3"];
  const isElementalSkillName=name=>elementalArrows.some(([id,zh,en])=>name===id || skillMatches(name,zh) || skillMatches(name,en));
  const extraSkillNames=()=>extraSkillSlots.map((key,index)=>normalizeSkill(arrowSetting(key) ?? skills().filter(name=>!isElementalSkillName(name)&&!isBasicAttack(name))[index] ?? ""));
  function readExtraOwnedNames() {
    // HUD includes a separate basic-attack slot; it does not consume a skill slot.
    let slots=[...document.querySelectorAll("#skillbar .skill-slot[data-skill]:not(.basic)")];
    if(!slots.length)slots=[...document.querySelectorAll("#lu-sockets [data-skill]:not(.basic)")];
    return [...new Set(slots.map(slot=>slot.dataset.skill))].map(id=>jobSkillNames[id]?.[taiwanGame?0:1] || normalizeSkill(id));
  }
  function selectExtraSkill(cards, configured, ownedNames) {
    const owned=[...new Set(ownedNames.filter(name=>!isElementalSkillName(name)&&!isBasicAttack(name)))];
    const specified=[...new Set(configured.filter(Boolean))];
    const missing=specified.filter(name=>!owned.some(actual=>skillMatches(name,actual)));
    const fresh=cards.filter(card=>card.querySelector(".pk-ribbon")&&!elementalArrowOf(card)&&!isBasicAttack(skillCardName(card)));
    for(const name of missing){const card=fresh.find(card=>skillMatches(name,skillCardName(card)));if(card)return card;}
    if(3-owned.length<=missing.length)return null;
    const random=fresh.filter(card=>!owned.some(name=>skillMatches(name,skillCardName(card))));
    return random.length?random[Math.floor(Math.random()*random.length)]:null;
  }
  function selectPreferredArrowUpgrade(cards,preference) {
    const choices=cards.filter(card=>elementalArrowOf(card)&&!card.querySelector(".pk-ribbon"));
    choices.sort((a,b)=>Number(arrowUpgradeMatches(b).includes(preference))-Number(arrowUpgradeMatches(a).includes(preference)) || cardRarity(b)-cardRarity(a));
    return choices[0]||null;
  }
  const discoveryTreasureMode = () => readSetting("ro-helper-treasure-mode") === "discovery";
  function readTreasureDiscovery(labels) {
    const number = "([0-9]+(?:[.,][0-9]+)?)";
    const stat = "(?:尋寶率|發現率|discovery(?: rate)?|descubrimiento|descoberta)";
    const before = new RegExp("\\+\\s*" + number + "\\s*%\\s*(?:de\\s+)?" + stat,"gi");
    const after = new RegExp(stat + "\\s*[:：]?\\s*\\+\\s*" + number + "\\s*%","gi");
    return labels.reduce((highest,label)=>{
      const text = label.normalize("NFKC");
      const values = [...text.matchAll(before),...text.matchAll(after)]
        .map(match=>Number(match[1].replace(",",".")));
      return Math.max(highest,...values);
    },0);
  }
  const treasureSlotKey = label => label.normalize("NFKC").split(/[·・]/,1)[0].trim().toLowerCase();
  function currentTreasureDiscovery() {
    const slots = [...document.querySelectorAll("#lu-sockets [data-item]")];
    if (!slots.length) slots.push(...document.querySelectorAll("#runitems [data-item]"));
    const results = new Map();
    const ownedNames = [];
    const tip = document.getElementById("skill-tip");
    if (!tip || !slots.length) return {results,ownedNames,unknown:slots.length};
    const originalNodes = [...tip.childNodes];
    const originalClass = tip.getAttribute("class");
    const originalStyle = tip.getAttribute("style");
    try {
      for (const slot of slots) {
        tip.classList.add("hidden");
        slot.dispatchEvent(new MouseEvent("mouseover",{bubbles:true}));
        const label = tip.querySelector(".st-head small")?.textContent;
        const stats = tip.querySelector(".st-item");
        if (!tip.classList.contains("hidden") && label && stats) {
          const ownedName = tip.querySelector(".st-head b")?.textContent.trim();
          if (ownedName) ownedNames.push(normalizeTreasure(ownedName));
          results.set(treasureSlotKey(label),readTreasureDiscovery([...stats.querySelectorAll("li")].map(row=>row.textContent)));
        }
      }
    } finally {
      const currentNodes = [...tip.childNodes];
      if (currentNodes.length !== originalNodes.length || currentNodes.some((node,index)=>node !== originalNodes[index])) {
        tip.replaceChildren(...originalNodes);
      }
      for (const [attribute,value] of [["class",originalClass],["style",originalStyle]]) {
        if (value === null) tip.removeAttribute(attribute);
        else tip.setAttribute(attribute,value);
      }
    }
    return {results,ownedNames,unknown:slots.length-results.size};
  }
  function treasureDiscoveryGain(card, equipped) {
    const list = card.querySelector(".pk-lines");
    const rows = [...(list?.querySelectorAll("li") ?? [])].filter(row=>!row.querySelector(".pk-talent"));
    const total = readTreasureDiscovery(rows.length ? rows.map(row=>row.textContent) : [list?.textContent ?? ""]);
    // New chest cards show the increment as the main line and before/after in .ro-now.
    // That increment must not have the equipped total subtracted a second time.
    const incrementalRows = rows.filter(row=>row.querySelector(".ro-now") && /(?:→|\u2192)/.test(row.querySelector(".ro-now").textContent));
    if (incrementalRows.length) {
      const increments = incrementalRows.map(row=>{
        const copy = row.cloneNode(true);
        for (const note of copy.querySelectorAll(".ro-now")) note.remove();
        return copy.textContent;
      });
      const increment = readTreasureDiscovery(increments);
      if (increment > 0) return increment;
    }
    const slot = treasureSlotKey(card.querySelector(".pk-sub")?.textContent ?? "");
    const previous = equipped.results.get(slot);
    if (previous !== undefined) return Number((total-previous).toFixed(6));
    if (card.querySelector(".pk-swap") || (equipped.unknown > 0 && !card.querySelector(".pk-ribbon"))) return null;
    return total;
  }
  const openSettings = (title, names, priorities, save, skillSettings = false) => {
    const dialog = document.createElement("dialog");
    dialog.id = "ro-helper-settings";
    const form = document.createElement("form");
    form.method = "dialog";
    form.style.cssText = "display:grid;gap:8px;padding:14px;min-width:300px";
    const savedBanish = skillSettings ? new Set(banishSkills()) : new Set();
    const basicBanish = skillSettings ? document.createElement("input") : null;
    const arrowControls = [];
    let treasureMode;
    const categoryControls=[];
    const settingsError=document.createElement("small");
    settingsError.setAttribute("role","status");
    if (!skillSettings) {
      const row = document.createElement("label");
      treasureMode = document.createElement("select");
      treasureMode.append(new Option("依名稱順位","name"),new Option("尋寶率優先","discovery"),new Option("依寶物類別排序","category"));
      treasureMode.value = ["discovery","category"].includes(readSetting("ro-helper-treasure-mode")) ? readSetting("ro-helper-treasure-mode") : "name";
      row.append("寶物選卡模式 ",treasureMode);
      const categoryBox=document.createElement("fieldset"),categoryTitle=document.createElement("legend");
      categoryTitle.textContent="類別順位";categoryBox.append(categoryTitle);
      const order=treasureCategoryOrder();
      for(let index=0;index<treasureCategories.length;index++){
        const label=document.createElement("label"),choice=document.createElement("select");
        label.style.display="block";
        choice.append(new Option("略過此順位",""),...treasureCategories.map(([key,title])=>new Option(title,key)));
        choice.value=order[index]||"";
        choice.setAttribute("aria-label","寶物類別優先 "+(index+1));
        label.append("類別 "+(index+1)+" ",choice);categoryBox.append(label);categoryControls.push(choice);
      }
      const hint = document.createElement("small");
      const showHint = () => {
        categoryBox.hidden=treasureMode.value!=="category";
        hint.textContent = treasureMode.value === "category" ? "先比類別順位；同類別再比下方名稱順位與稀有度。有命中類別就直接選，不會為了更前面的類別反覆重抽。所選類別都未出現時才依自動重抽設定處理。" : treasureMode.value === "discovery"
          ? "第一順位寶物出現時先取得一次；已持有後依淨增加的尋寶率選取。沒有正增量時先重抽，再按備選順位。寶物槽全滿且尋寶率 +0% 時直接啟用遊戲自動選技能與寶箱，不等待技能停選目標；遊戲不支援時暫時保存。"
          : "優先選順位最高的寶物。全部未出現時，才依自動重抽設定處理。";
      };
      treasureMode.addEventListener("change",showHint);
      showHint();
      form.append(row,hint,categoryBox);
    }
    if (skillSettings) {
      for (const [key,label,choices,fallback] of [
        ["mode","技能選卡模式",[["off","原本優先順序"],["on","法師：三元素箭共用"],["boltsOnly","法師：三元素箭，其他技能取得後放逐"],["targetsFirst","三元素箭只選目標，否則依技能順位"]],"off"],
        ...starterSlots.map((key,index) => [key,"起手技能 " + (index + 1),starterOptions(names),starterValue(key,index)]),
        ["preference","同組強化優先",arrowUpgrades,"shots"],
        ...extraSkillSlots.map((key,index)=>[key,"其他技能 "+(index+1)+"（本模式取得一次後放逐）",[["","不指定（隨機）"],...names.filter(name=>!isElementalSkillName(name)&&!isBasicAttack(name)).map(name=>[name,name])],extraSkillNames()[index]])
      ]) {
        const row = document.createElement("label");
        const select = document.createElement("select");
        select.append(...choices.map(([value,title]) => new Option(title,value)));
        select.value = key.startsWith("starter") ? fallback : arrowSetting(key) || fallback;
        row.append(label + " ", select);
        form.append(row);
        arrowControls.push([key,select]);
      }
    }
    const levelConfig=skillLevelConfig();
    const levelOrder=skillSettings?document.createElement("select"):null;
    if(levelOrder){levelOrder.append(new Option("未達標技能：稀有度優先","rarity"),new Option("依優先順序逐招達標","priority"),new Option("先各取得1級，再補目標（沒新技能先補等級）","acquireFirst"));levelOrder.value=levelConfig.order||"rarity";}
    const levelEnabled=skillSettings?document.createElement("input"):null;
    if(levelEnabled){levelEnabled.type="checkbox";levelEnabled.checked=!!levelConfig.enabled;
      const row=document.createElement("label");row.append(levelEnabled," 指定等級停止選卡（0＝不限制）");form.append(row,levelOrder);}
    const fields = Array.from({length:Math.max(skillSettings ? 6 : 5, priorities.length)}, (_, i) => {
      const row = document.createElement("label");
      row.textContent = "優先 " + (i + 1) + " ";
      const select = document.createElement("select");
      select.append(new Option("請選擇", ""));
      const field = document.createElement("input");
      field.value = priorities[i] || "";
      field.placeholder = "也可直接輸入名稱";
      for (const name of new Set(skillSettings ? names : [...names, ...priorities.filter(Boolean)])) select.append(new Option(name, name));
      select.value = field.value;
      const banish = skillSettings ? document.createElement("input") : null;
      const syncBanish = () => {
        if (!banish) return;
        const name = field.value.trim();
        banish.disabled = !name || isBasicAttack(name);
        banish.checked = !banish.disabled && savedBanish.has(name);
      };
      select.onchange = () => { field.value = select.value; syncBanish(); };
      field.oninput = () => { select.value = field.value; syncBanish(); };
      row.append(select, field);
      form.append(row);
      if (banish) {
        banish.type = "checkbox";
        banish.setAttribute("aria-label", "優先 " + (i + 1) + " 取得後放逐");
        banish.title="未抽到不阻擋達標保存；已取得則達目標後放逐，不需等待放逐成功。";
        syncBanish();
        const control = document.createElement("label");
        control.append(banish, " 取得後放逐");
        form.append(control);
      }
      const target=skillSettings?document.createElement("input"):null;
      if(target){target.type="number";target.min="0";target.step="1";target.value=String(levelConfig.targets?.[i]||0);
        target.setAttribute("aria-label","優先 "+(i+1)+" 技能目標等級");
        const row=document.createElement("label");row.append("技能目標等級（0＝不限制） ",target);form.append(row);}
      return { field, banish, target };
    });
    if (basicBanish) {
      basicBanish.type = "checkbox";
      basicBanish.checked = banishBasic();
      const control = document.createElement("label");
      control.append(basicBanish, " 放逐普通攻擊強化（首次出現即可）");
      form.append(control);
    }
    const submit = document.createElement("button");
    submit.textContent = "儲存";
    form.onsubmit = event => {
      const categories=[...new Set(categoryControls.map(control=>control.value).filter(Boolean))];
      if(treasureMode?.value==="category" && !categories.length){
        event.preventDefault();settingsError.textContent="請至少選擇一種寶物類別";return;
      }
      if(treasureMode)writeSetting("ro-helper-treasure-category-priority",JSON.stringify(categories));
      if(levelEnabled){
        if(fields.some(({target})=>!Number.isSafeInteger(target.valueAsNumber)||target.valueAsNumber<0)){event.preventDefault();settingsError.textContent="技能目標等級請填0以上整數";return;}
        if(levelEnabled.checked&&!fields.some(({field,target})=>field.value.trim()&&target.valueAsNumber>0)){event.preventDefault();settingsError.textContent="請至少指定一個技能與大於0的目標等級";return;}
        writeSetting("ro-helper-skill-level-plan",JSON.stringify({enabled:levelEnabled.checked,order:levelOrder.value,names:fields.map(({field})=>field.value.trim()),targets:fields.map(({target})=>target.valueAsNumber)}));
        syncSkillLevelStopControls();
      }
      save(fields.map(({ field }) => field.value.trim()));
      if (treasureMode) writeSetting("ro-helper-treasure-mode",treasureMode.value);
      for (const [key,select] of arrowControls) writeSetting("ro-helper-arrow-" + key,select.value);
      if (basicBanish) {
        const selected = fields.filter(({ banish }) => banish.checked && !banish.disabled)
          .map(({ field }) => field.value.trim());
        writeSetting("ro-helper-banish-skills", JSON.stringify([...new Set(selected)]));
        writeSetting("ro-helper-banish-basic", basicBanish.checked ? "on" : "off");
      }
    };
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "取消";
    cancel.onclick = () => dialog.close();
    form.prepend(title + "（清單有 " + names.length + " 個名稱）");
    form.append(settingsError,submit, cancel);
    dialog.append(form);
    dialog.onclose = () => dialog.remove();
    document.body.append(dialog);
    dialog.showModal();
  };
  settings.onclick = () => {
    const key = settingKey("ro-helper-skills");
    const job = activeSkillJob(true);
    const title = job?.id ? job.name + "技能優先順序" : "技能優先順序（請先進入角色以辨識職業）";
    openSettings(title, skillList(job), skills(), names => localStorage.setItem(key, names.join("、")), true);
  };
  skillFocus.select.addEventListener("pointerdown",() => activeSkillJob(true),true);
  const treasureButton = document.createElement("button");
  treasureButton.type = "button";
  treasureButton.textContent = "寶物設定";
  treasureButton.style.cssText = button.style.cssText + ";right:250px";
  treasureButton.onclick = () => openSettings("寶物優先順序", treasureList(), treasurePriority().slice(0,5), names => writeSetting("ro-helper-treasure-priority", JSON.stringify(names.map(normalizeTreasure))));
  let sharedVideo = null;
  const share = document.createElement("button");
  share.type = "button";
  share.textContent = "連線座標";
  share.style.cssText = button.style.cssText + ";right:340px";
  let coordinateRequest, coordinateConnectedAt = 0;
  let coordinateStatus = "請按「連線座標」";
  const connectCoordinates = (showWhileStopped = true, retry = false) => {
    if (coordinateRequest) return coordinateRequest;
    coordinateConnectedAt = 0;
    coordinateStatus = "正在連線即時座標…";
    status.textContent = coordinateStatus;
    coordinateRequest = Promise.resolve()
      .then(() => ensureRuntime() ? runtime.sendMessage({type:"connect-ro-coordinates",retry}) : null)
      .then(result => {
        if (!ensureRuntime()) return;
        if (!result?.ok) throw new Error(result?.error || "背景程式沒有回應，請重新載入擴充功能後重整遊戲");
        coordinateConnectedAt = Date.now();
        coordinateStatus = result.pending ? (result.phase || "手機座標接入中，等待角色資料") : "已找到戰鬥迴圈，等待座標";
        if (showWhileStopped || window.__roMenuHelper) status.textContent = coordinateStatus;
      })
      .catch(error => {
        if (isInvalidatedRuntime(error)) runtimeInvalidated = true;
        if (!ensureRuntime()) return;
        coordinateStatus = "座標連線失敗：" + error.message;
        if (showWhileStopped || window.__roMenuHelper) status.textContent = coordinateStatus;
      })
      .finally(() => { coordinateRequest = undefined; });
    return coordinateRequest;
  };
  let lastLootCoordinateRetryAt=0;
  function ensureLootCoordinateConnection(packet,inBattle,now=Date.now()) {
    if(!inBattle || coordinateRequest)return;
    const age=now-Number(packet?.at);
    if(Number.isFinite(age) && age>=0 && age<750)return;
    if(lastLootCoordinateRetryAt && now>=lastLootCoordinateRetryAt && now-lastLootCoordinateRetryAt<5000)return;
    lastLootCoordinateRetryAt=now;
    // Loot capture must reconnect even when movement is disabled or a banked card is open.
    void connectCoordinates(false,true);
  }
  share.onclick = () => { if (ensureRuntime()) void connectCoordinates(true, true); };
  const taiwanGame = location.hostname === "ro.hans-webgametw.com";
  const difficultyFields = [
    ["count", "敵人數量", 350, 300],
    ["damage", "敵人傷害", 175, 150],
    ["hp", "敵人血量", 250, 200],
    ["speed", "敵人速度", 175, 150],
    ["events", "事件數量", 250, 200]
  ];
  if (taiwanGame) difficultyFields.push(["tier","刷關等級",20,20]);
  const difficultyEdition = taiwanGame ? "漢斯版" : "國際版";
  const difficultyKey = mode => "ro-helper-difficulty-" + mode;
  const observedDifficulty = new Map();
  const difficultySlider = (dialog, key) =>
    dialog?.querySelector('#npc-text .diff input[data-key="' + key + '"]');
  const difficultyScale = key => key === "tier" ? 1 : 100;
  function readDifficultyLimits(dialog) {
    if (!dialog) return;
    const kind = dialog.querySelector("#npc-text .diff input[data-pick]") ? "party" : "solo";
    for (const [key] of difficultyFields) {
      const input = difficultySlider(dialog, key);
      if (!input?.min || !input.max) continue;
      const scale = difficultyScale(key);
      const min = Math.round(Number(input.min) * scale);
      const max = Math.round(Number(input.max) * scale);
      if (Number.isFinite(min) && max >= min && Number.isFinite(max)) {
        observedDifficulty.set(kind + ":" + key, { min, max });
      }
    }
  }
  const getDifficulty = mode => {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(settingKey(difficultyKey(mode))) ?? localStorage.getItem(settingKey("ro-helper-difficulty"))); } catch {}
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
    return Object.fromEntries(difficultyFields.map(([key]) => {
      const value = Number(saved[key]);
      const fallback = key === "tier" ? 1 : 100;
      return [key, Number.isFinite(value) && value > 0 ? value : fallback];
    }));
  };
  const difficultyButton = document.createElement("button");
  difficultyButton.type = "button";
  difficultyButton.textContent = "難度設定";
  difficultyButton.style.cssText = button.style.cssText + ";right:440px";
  difficultyButton.onclick = () => {
    readDifficultyLimits(expeditionDifficultyDialog());
    const dialog = document.createElement("dialog");
    dialog.id = "ro-helper-settings";
    const form = document.createElement("form");
    form.method = "dialog";
    form.style.cssText = "display:grid;gap:10px;padding:16px";
    form.append(difficultyEdition + "｜自動進場難度");
    if (taiwanGame) form.append("設定存於：" + difficultyAccountLabel());
    const hint = document.createElement("small");
    hint.textContent = "直接輸入百分比，例如 350 代表 350%。出發時依遊戲當下允許的範圍與刻度套用。";
    form.append(hint);
    const mode = document.createElement("select");
    mode.setAttribute("aria-label","難度模式");
    mode.append(new Option("單人","solo"),new Option("組隊","party"));
    mode.value = taiwanGame ? previewDifficultyMode() : partyMode.value === "off" ? "solo" : "party";
    form.append(mode);
    const drafts = new Map();
    let displayed = mode.value;
    const inputs = difficultyFields.map(([key, name, soloMax, partyMax]) => {
      const row = document.createElement("label");
      const input = document.createElement("input");
      const range = document.createElement("small");
      input.type = "number";
      input.inputMode = "numeric";
      input.required = true;
      input.step = "1";
      input.min = "1";
      input.style.width = "7em";
      row.append(name + (key === "tier" ? " Lv " : " % "), input, " ", range);
      form.append(row);
      return { key, input, range, soloMax, partyMax };
    });
    const readInputs = () => Object.fromEntries(inputs.map(({key,input}) => [key,input.valueAsNumber]));
    const difficultyPreview = document.createElement("output");
    const updateDifficultyPreview = () => {
      if (taiwanGame) difficultyPreview.textContent = formatHansDropForecast(previewStage(),readInputs(),displayed);
    };
    if (taiwanGame) {
      form.append(difficultyPreview);
      form.addEventListener("input",updateDifficultyPreview);
    }
    const loadInputs = () => {
      const saved = drafts.get(displayed) ?? getDifficulty(displayed);
      for (const {key,input,range,soloMax,partyMax} of inputs) {
        const observed = observedDifficulty.get(displayed + ":" + key);
        const min = observed?.min ?? (key === "tier" ? 1 : 100);
        const max = observed?.max ?? (taiwanGame && key !== "tier" ? 2000 : displayed === "party" ? partyMax : soloMax);
        range.textContent = "(" + min + "–" + max + ")";
        input.value = Math.round(saved?.[key] ?? min);
      }
      updateDifficultyPreview();
    };
    mode.onchange = () => {
      if (!form.reportValidity()) {
        mode.value = displayed;
        return;
      }
      drafts.set(displayed,readInputs());
      displayed = mode.value;
      loadInputs();
    };
    loadInputs();
    const save = document.createElement("button");
    save.textContent = "儲存";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "取消";
    cancel.onclick = () => dialog.close();
    form.onsubmit = event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      drafts.set(displayed,readInputs());
      for (const [kind,values] of drafts) {
        writeSetting(difficultyKey(kind),JSON.stringify(values));
        if(taiwanGame && previewStage()) writeSetting(stageDifficultyKey(kind,previewStage(),expeditionLap.value),"__ro_helper_default_v1__");
      }
      refreshStageDropPreview();
      status.textContent = "已儲存" + difficultyEdition + "難度，下次出發時套用";
      dialog.close();
    };
    form.append(save, cancel);
    dialog.append(form);
    dialog.onclose = () => dialog.remove();
    document.body.append(dialog);
    dialog.showModal();
  };
  function applyDifficulty(dialog, saved) {
    if (!saved) return "";
    const sliders = difficultyFields.map(([key, name]) => ({
      key, name,
      input: difficultySlider(dialog, key),
      output: dialog?.querySelector('#npc-text .diff [data-out="' + key + '"]')
    }));
    const missing = sliders.find(({input, output}) => !input || !output);
    if (missing) return "找不到難度欄位：" + missing.name;
    for (const {key, name, input, output} of sliders) {
      const scale = difficultyScale(key);
      const min = Number(input.min || 1);
      const max = Number(input.max || saved[key] / scale);
      const step = Number(input.step) || 0.05;
      const value = Math.min(max,Math.max(min,saved[key] / scale));
      const percent = Math.round(Math.min(max,min + Math.round((value-min)/step)*step)*scale);
      input.value = String(percent / scale);
      input.dispatchEvent(new Event("input", {bubbles:true}));
      const expected = key === "tier" ? "Lv " + percent : percent + "%";
      if (Math.round(Number(input.value) * scale) !== percent || output.textContent.trim() !== expected) {
        return "難度未套用：" + name + " " + expected;
      }
    }
    return "";
  }
  const difficultyAccountLabel = () => activeAccount === "local" ? "未辨識帳號" :
    activeAccount.replace(/^account\./,"帳號 #").replace(/^guest\./,"訪客 #");
  function applyHansDepartureDifficulty(dialog) {
    if (activeAccount === "local") return "尚未確認此分頁的帳號，請重新整理後再啟動助手";
    const mode = dialog.querySelector("#npc-text .diff input[data-pick]") ? "party" : "solo";
    const context = currentDepartureDifficultyContext();
    const saved = context ? readStageDifficulty(mode,context.stage,context.lap) ?? getDifficulty(mode) : getDifficulty(mode);
    const values = saved ?? Object.fromEntries(difficultyFields.map(([key]) => [key, key === "tier" ? 1 : 100]));
    return applyDifficulty(dialog, values);
  }
  if (taiwanGame) document.addEventListener("click", event => {
    if (!event.isTrusted || !window.__roMenuHelper) return;
    const dialog = expeditionDifficultyDialog();
    const confirm = dialog?.querySelector("#npc-options button.primary");
    if (!confirm?.contains(event.target) || confirm.disabled) return;
    const error = applyHansDepartureDifficulty(dialog);
    if (!error) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    status.textContent = error;
  }, true);
  const festivalStage = "燈籠節";
  const festivalHostPrompt = /(?:與主持人交談|節慶主持人|活動主持人|節日主持人|Festival Hostess|festival host|anfitriona|anfitriã)/i;
  function requestLobbyNpc(id) {
    document.dispatchEvent(new CustomEvent("ro-helper-lobby-npc",{detail:id}));
  }
  function selectImmediateLevelUps(dialog) {
    const immediate = dialog.querySelector("#npc-text .diff button[data-bank='0']");
    if (!immediate) return true;
    if (immediate.disabled) return false;
    if (!immediate.classList.contains("active")) immediate.click();
    return immediate.classList.contains("active");
  }
  const knownStages = ["普隆德拉原野","普隆德拉地下水道","失事輪","柏伊亞嵐島","斐揚森林","斐揚洞穴","普隆德拉城"];
  const hansStages = ["獸人村","夢羅克金字塔","迷宮森林","吉芬地下迷宮","時計塔地下","深淵之湖","克雷斯特漢姆修道院","尼芙菲姆原野"];
  const stageAliases = new Map([
    ["獸人村落","獸人村"],["Orc Village","獸人村"],["Aldea orca","獸人村"],
    ["金字塔","夢羅克金字塔"],["Pirámides de Morroc","夢羅克金字塔"],["Pyramids of Morroc","夢羅克金字塔"],
    ["失事船","失事輪"],["沉船","失事輪"],["Sunken Ship","失事輪"],["Barco hundido","失事輪"]
  ]);
function hansEventIdentity(name) {
  const text=String(name||'').normalize('NFKC').trim();
  const m=text.match(/^(聖誕節|元宵燈會|元宵節|Navidad|Christmas|Feria de faroles de Louyang|Lantern Festival)\s*(?:[·・･]\s*改(\d*))?\s*(?:特殊關卡|活動關卡|Special stage|Stage especial)?$/i);
  if(!m)return null;
  const base=/^(?:聖誕節|Navidad|Christmas)$/i.test(m[1])?'聖誕節':'元宵燈會';
  const lap=m[2]===undefined?1:Number(m[2]||1)+1;
  return {base,lap,name:base+(lap>1?'・改'+(lap===2?'':lap-1):'')+'特殊關卡'};
}
function hansEventStagesForLap(lap) {
  const value=Number(lap);if(!Number.isSafeInteger(value)||value<1||value>6)return [];
  return ['聖誕節','元宵燈會'].map(name=>hansEventIdentity(name+(value>1?'・改'+(value===2?'':value-1):'')).name);
}

  const stageVariantSuffix = /\s*[·・･]\s*改(\d*)(?=\s*(?:特殊關卡)?$)/u;
  const stageGroup = name => (hansEventIdentity(name) || /特殊關卡|活動|節(?:・|$)|festival|event/i.test(name)) ? "特殊活動" :
    /劇情|story|^普隆德拉城$/i.test(name) ? "劇情關卡" : "一般關卡";
  const stageVariantLap = name => {
    const match = name.normalize("NFKC").trim().match(stageVariantSuffix);
    return match ? Number(match[1] || 1) + 1 : null;
  };
  const stageMatchesLap = (name, lap) => !taiwanGame || stageGroup(name) !== "特殊活動" ||
    (stageVariantLap(name) ?? 1) === Number(lap);
  const stageNameOf = card => card.querySelector(".stg-card-info b")?.textContent.trim() ||
    [...knownStages,...hansStages].find(name => card.textContent.includes(name)) || "";
  const baseExpeditionName = name => {
    const normalized = name.trim().normalize("NFKC");
    const event=taiwanGame && hansEventIdentity(normalized);if(event)return event.name;
    const base = taiwanGame && stageGroup(normalized) !== "特殊活動" ? normalized.replace(stageVariantSuffix,"").trim() : normalized;
    return stageAliases.get(base) || base;
  };
  const seenStageKey = lap => taiwanGame ? "ro-helper-seen-stages-lap-" + lap : "ro-helper-seen-stages";
  function stageNamesForLap(lap) {
    const observed = readNames(seenStageKey(lap));
    const legacyEvents = taiwanGame ? readNames("ro-helper-seen-stages").filter(name =>
      stageGroup(name) === "特殊活動") : [];
    const names = [...knownStages,...(taiwanGame ? [...hansStages,...hansEventStagesForLap(lap)] : [festivalStage]),...observed,...legacyEvents];
    return [...new Set(names.map(baseExpeditionName).filter(name => name && stageMatchesLap(name,lap)))];
  }
  function groupedStageChoices(names, createChoice) {
    return ["一般關卡","劇情關卡","特殊活動"].flatMap(group => {
      const entries = names.filter(name => stageGroup(name) === group);
      return entries.length ? [createChoice(group,entries)] : [];
    });
  }
  function stageOptionGroups(names) {
    return groupedStageChoices(names,(label,entries) => {
      const group = document.createElement("optgroup");
      group.label = label;
      group.append(...entries.map(name=>new Option(name,name)));
      return group;
    });
  }
  const stageIsLocked = card => card.disabled || card.classList.contains("locked") || card.classList.contains("soon");
  function isBasicAttack(name) {
    return /^(?:攻擊\s*[:：]|普通攻擊(?:強化)?$|(?:Basic )?Attack\s*[:：]|Basic Attack$)/i.test(name);
  }
  function findFocusAction(picker, target, chest, visible, used) {
    if (!target) return null;
    for (const slot of picker.querySelectorAll("#pk-cards .pk-slot")) {
      const name = slot.querySelector(".pk-card .pk-name")?.textContent.trim();
      if (!name || (chest ? !treasureMatches(target,treasureCardName(slot.querySelector(".pk-card"),name)) : !skillMatches(target, name))) continue;
      const action = [...slot.querySelectorAll(".pk-acts button.pk-act")].find(button =>
        /^(?:專注|Focus)(?:\s*\d+)?$/i.test(button.textContent.trim()) &&
        visible(button) && !used.has(button));
      if (action) return action;
    }
    return null;
  }
  function eligibleSkillBanishNames(names,config,plan,priorities){
    return names.filter(name=>{
      if(!config)return true;
      const limited=(config.names||priorities).some((goal,index)=>Number(config.targets?.[index])>0&&skillMatches(goal,name));
      return !limited||(plan.reached||[]).some(goal=>skillMatches(goal,name));
    });
  }
  function findSkillBanish(picker, names, basic, visible, used, boltsOnly, protectedFocus = "") {
    if (!names.length && !basic && !boltsOnly) return null;
    let basicAction = null;
    for (const slot of picker?.querySelectorAll("#pk-cards .pk-slot") ?? []) {
      const card = slot.querySelector(".pk-card");
      const name = card?.querySelector(".pk-name")?.textContent.trim();
      if (!name) continue;
      if(protectedFocus && skillMatches(protectedFocus,name))continue;
      // New skills have a ribbon. The game offers their upgrades only after acquisition.
      const basicAttack = isBasicAttack(name);
      if (boltsOnly && elementalArrowOf(card)) continue;
      const shouldBanish = basicAttack ? basic : !card.querySelector(".pk-ribbon") &&
        (boltsOnly || names.some(saved => skillMatches(saved,name)));
      if (!shouldBanish) continue;
      const button = [...slot.querySelectorAll(".pk-acts button.pk-act")].find(action =>
        /^(?:放逐|Banish)(?:\s*\d+)?$/i.test(action.textContent.trim()) && visible(action) && !used.has(action));
      if (!button) continue;
      if (!boltsOnly || !basicAttack) return { button, name };
      basicAction ??= { button, name };
    }
    return basicAction;
  }
  function availableReroll(picker, visible, used, chest = false) {
    const ready = button => visible(button) && !used.has(button);
    const deck = picker?.querySelector('#pk-bar .pk-act[data-act="bar:0"]');
    if (ready(deck)) return { button: deck, action: "重抽全部" };
    const actions = picker?.querySelectorAll("#pk-cards .pk-acts button.pk-act") ?? [];
    const candidates = [...actions].filter(action =>
      /^(?:重抽(?:卡片|單張)?|單張重抽|Reroll(?: card)?)(?:\s*\d+)?$/i.test(action.textContent.trim()) && ready(action));
    // Single-card rerolls follow category order, with deities first by default.
    // This is independent of the treasure selection mode and preserves deck rerolls first.
    if (chest) {
      const order = treasureCategoryOrder();
      const rank = action => {
        const card = action.closest(".pk-slot")?.querySelector(".pk-card");
        const index = card ? order.indexOf(treasureCategory(card)) : -1;
        return index < 0 ? order.length : index;
      };
      candidates.sort((a,b) => rank(a) - rank(b));
    }
    const button = candidates[0];
    return button ? { button, action: "重抽單張" } : null;
  }

  function cardRarity(card) {
    const tiers = [
      /^(普通|common|normal|común)$/i, /^(優良|uncommon|poco común)$/i,
      /^(稀有|rare|raro)$/i, /^(史詩|epic|épico)$/i,
      /^(傳說|legendary|legendario)$/i, /^(神話|mythic|mythical|mítico)$/i
    ];
    const badge = card.querySelector(".pk-badge")?.textContent.trim() || "";
    return tiers.findIndex(tier => tier.test(badge));
  }
  function highestRaritySameSkill(cards) {
    if (cards.length !== 3) return null;
    const names = cards.map(card => card.querySelector(".pk-name")?.textContent.trim());
    if (!names[0] || !names.every(name => name === names[0])) return null;
    return cards.reduce((best,card) => cardRarity(card) > cardRarity(best) ? card : best);
  }
  const highestStageMode = "__highest_normal_stage__";
  const expeditionLap = document.createElement("select");
  expeditionLap.setAttribute("aria-label","遠征周目");
  const lapLabels = ["一周目","二周目","三周目","四周目","五周目","六周目"];
  expeditionLap.append(...lapLabels.map((label,index) => new Option(label,String(index+1))));
  expeditionLap.addEventListener("change",() => {
    writeSetting("ro-helper-expedition-lap",expeditionLap.value);
    refreshStageChoices();
    refreshBossOptions();
    refreshStageDropPreview();
  });
  const expeditionSpeed = document.createElement("select");
  expeditionSpeed.setAttribute("aria-label","漢斯單人遠征倍速");
  expeditionSpeed.append(new Option("遠征倍速：1×（遊戲預設）","1"),new Option("遠征倍速：進場切到 2×","2"));
  expeditionSpeed.addEventListener("change",()=>writeSetting("ro-helper-expedition-speed",expeditionSpeed.value));
  let expeditionSpeedApplied = false;
  function applyExpeditionSpeed(hud) {
    if (!taiwanGame) return;
    if (!hud) {
      expeditionSpeedApplied = false;
      return;
    }
    if (expeditionSpeedApplied || expeditionSpeed.value !== "2" || partyMode.value !== "off") return;
    const timer = hud.querySelector("#timer:not(.hidden)");
    if (!timer || !timer.getClientRects().length) return;
    const controls = timer.parentElement?.parentElement ?? timer.parentElement;
    if (!controls || !hud.contains(controls)) return;
    const buttons = [...controls.querySelectorAll("button,[role='button']")].filter(button =>
      !button.disabled && button.getAttribute("aria-disabled") !== "true" &&
      button.getClientRects().length && !button.closest("[hidden],.hidden,[aria-hidden='true']"));
    const speedOf = button => {
      const label = button.textContent.normalize("NFKC").trim();
      return label.match(/^(?:([12])\s*[x×]|[x×]\s*([12]))$/i)?.slice(1).find(Boolean);
    };
    const speeds = buttons.filter(button=>speedOf(button));
    if (speeds.length !== 1) return;
    expeditionSpeedApplied = true;
    if (speedOf(speeds[0]) === "1") speeds[0].click();
  }
  const stageSettings = document.createElement("details");
  stageSettings.style.cssText = "width:100%;padding:5px;box-sizing:border-box";
  const stageSummary = document.createElement("summary");
  stageSummary.textContent = "關卡設定";
  const stageMode = document.createElement("select");
  stageMode.setAttribute("aria-label", "選關模式");
  stageMode.append(new Option("固定關卡", "fixed"), new Option("自動打最高層（略過劇情）", "highest"),
    new Option("多關卡循環", "rotation"));
  if (taiwanGame) stageMode.append(new Option("擊敗指定首領後重刷（單人）", "boss"));
  const bossTarget = document.createElement("select");
  bossTarget.setAttribute("aria-label","指定首領");
  const stageBosses = [
    [new RegExp("尼芙菲姆原野"),[["bloody_murderer","嗜血怪人","Bloody Murderer"],["loli_ruri","銀月魔女","Loli Ruri"],["dullahan","無顱武士","Dullahan"],["lord_of_the_dead","死靈騎士","Lord of the Dead"],["fallen_bishop_hibram","墮落大神官 悉潘","Fallen Bishop Hibram"]]],

    [new RegExp("克雷斯特漢姆修道院"),[["chimera","凱美拉","Chimera"],["abysmal_knight","深淵騎士","Abysmal Knight"],["bloody_knight","血腥騎士","Bloody Knight"],["dark_illusion","迷幻之王","Dark Illusion"],["dark_lord","黑暗之王","Dark Lord"]]],

    [new RegExp("深淵之湖"),[["ferus","紅貝勒斯","Red Ferus"],["acidus","黃俄希托斯","Gold Acidus"],["hydrolancer","三頭龍","Hydrolancer"],["detardeurus","迪塔勒泰晤勒斯","Detardeurus"],["ktullanux","水晶龍","Ktullanux"]]],

    [new RegExp("時計塔地下"),[["clock_tower_manager","鐘塔守護者","Clock Tower Manager"],["owl_duke","鴞裊首領","Owl Duke"],["executioner","行刑者","Executioner"],["mysteltainn","弒神者","Mysteltainn"],["owl_baron","鴞裊男爵","Owl Baron"]]],

    [new RegExp("吉芬地下迷宮"),[["giant_whisper","巨大白幽靈","Giant Whisper"],["ogretooth","獸牙怪","Ogretooth"],["doppelganger","死靈","Doppelganger"],["dracula","德古拉男爵","Dracula"]]],

    [/普隆德拉原野|Campos de Prontera|Prontera Fields/i,[["eclipse","月蝕兔","Eclipse"],["toad","蛙王","Toad"],["dragon_fly","龍蠅","Dragon Fly"],["vocal","蟋蟀王","Vocal"],["mastering","波利之王","Mastering"]]],
    [/普隆德拉地下水道|Alcantarillas de Prontera|Prontera Sewer/i,[["tarou_bite","撕咬塔羅鼠","Biting Tarou"],["tarou_plague","瘟疫塔羅鼠","Plague Tarou"],["tarou_burrow","鑽地塔羅鼠","Burrowing Tarou"],["golden_thief_bug","黃金蟲","Golden Thief Bug"]]],
    [/失事輪|沉船|Barco hundido|Sunken Ship/i,[["ghostring","幽靈波利","Ghostring"],["penomena","梅納海葵","Penomena"],["drake","海盜之王","Drake"]]],
    [/柏伊亞嵐島|Byalan/i,[["deviace","狄奧斯","Deviace"],["strouf","海神","Strouf"],["king_dramoh","大腳龍蝦","King Dramoh"],["kraken","魔鬼大烏賊","Kraken"]]],
    [/斐揚森林|Bosque de Payon|Payon Forest/i,[["angeling","天使波利","Angeling"],["deviling","惡魔波利","Deviling"],["vagabond_wolf","流浪之狼","Vagabond Wolf"],["eddga","虎王","Eddga"]]],
    [/斐揚洞穴|Cueva de Payon|Payon Cave/i,[["skeleton_general","邪骸戰士長","Skeleton General"],["cat_o_nine_tail","狂暴月夜貓","Cat O' Nine Tails"],["hyegun","妖君","Hyegun"],["moonlight","月夜貓","Moonlight Flower"]]],
    [/普隆德拉城|Castillo de Prontera|Prontera Castle/i,[["high_orc","獸人戰士長","High Orc"]]],
    [/獸人村|Aldea orca|Orc Village/i,[["goblin_leader","哥布靈首領","Goblin Leader"],["kobold_leader","犬妖首領","Kobold Leader"],["high_orc","獸人戰士長","High Orc"],["orc_hero","獸人英雄","Orc Hero"]]],
    [/金字塔|Pirámides de Morroc|Pyramid/i,[["ghostring","幽靈波利","Ghostring"],["ancient_mummy","狂暴木乃伊","Ancient Mummy"],["skeleton_general","邪骸戰士長","Skeleton General"],["osiris","俄塞里斯","Osiris"]]],
    [/迷宮森林|Bosque laberinto|Labyrinth Forest/i,[["leib_olmai","狂暴大腳熊","Leib Olmai"],["sasquatch","雪熊","Sasquatch"],["deviling","惡魔波利","Deviling"],["baphomet","巴風特","Baphomet"]]]
  ];
  const bossesForStage = stage => stageBosses.find(([pattern]) => pattern.test(stage))?.[1] || [];
  const bossKey = name => name.normalize("NFKC").toLowerCase().replace(/[\s_-]+/g,"");
  const bossForStage = (stage,target) => bossesForStage(stage).find(row =>
    row.some(name => bossKey(name) === bossKey(target)));
  function refreshBossOptions() {
    const stage = fixedStage.value;
    const saved = readSetting("ro-helper-boss-target") || "";
    const bosses = bossesForStage(stage);
    bossTarget.replaceChildren(new Option(bosses.length ? "請選擇首領" : "此關卡暫無首領資料",""),
      ...bosses.map(([id,name]) => new Option(name+(["ktullanux","fallen_bishop_hibram"].includes(id)?"（亂入王）":""),id)));
    bossTarget.value = bossForStage(stage,saved)?.[0] || "";
  }
  const fixedStage = document.createElement("select");
  fixedStage.setAttribute("aria-label", "固定關卡");
  const rotationSettings = document.createElement("div");
  const repeatsLabel = document.createElement("label");
  const stageRepeats = document.createElement("input");
  stageRepeats.type = "number";
  stageRepeats.min = "1";
  stageRepeats.step = "1";
  stageRepeats.style.width = "65px";
  repeatsLabel.append("每關次數 ", stageRepeats);
  const stageChecks = document.createElement("div");
  const rotationProgress = document.createElement("div");
  rotationSettings.append(repeatsLabel, stageChecks);
  stageSettings.append(stageSummary,stageMode);
  if (taiwanGame) stageSettings.append(expeditionLap,expeditionSpeed);
  stageSettings.append(fixedStage,bossTarget,rotationSettings,rotationProgress);

  // Hans V0.12.7 uses six difficulty factors and a stage-specific base drop count.
  function hansDropForecast(stage, values, mode) {
    const originalMax = {count:3,damage:1.5,hp:2,speed:1.5,events:2};
    const factors = {};
    for (const key of [...Object.keys(originalMax),"tier"]) {
      const scale = difficultyScale(key);
      const observed = observedDifficulty.get(mode + ":" + key);
      const min = (observed?.min ?? scale) / scale;
      const max = (observed?.max ?? 20*scale) / scale;
      const step = key === "tier" ? 1 : 0.05;
      const value = Math.max(min, Math.min(max, (Number(values?.[key]) || scale)/scale));
      factors[key] = Math.min(max, min + Math.round((value-min)/step)*step);
    }
    let base = 1;
    let excess = factors.tier;
    for (const [key,max] of Object.entries(originalMax)) {
      base += (Math.min(factors[key],max)-1)/(max-1)/5;
      excess *= Math.max(1,factors[key]/max);
    }
    const equipment = Math.min(20,base*Math.pow(excess,0.37));
    const logMean = Object.values(factors).reduce((sum,value) => sum+Math.log(value),0)/6;
    const ratio = logMean/Math.log(20);
    const loot = Math.max(base,Math.min(12.5,Math.pow(12.5,ratio)));
    const stageRef = /聖誕|Navidad|^xmas$/i.test(stage) ? 2.9 :
      /元宵|Louyang|^louyang$/i.test(stage) ? 2.7 :
      /迷宮森林|Labyrinth Forest|^maze$/i.test(stage) ? 1.1 :
      /獸人村|Orc (?:Village|Dungeon)|^orcs$/i.test(stage) ? 2.7 : 2.6;
    const total = stageRef*equipment*factors.count*(1+0.1455*(factors.events-1));
    const originalLegendary = 0.01483679525222552+(1-0.01483679525222552)*Math.pow(ratio,3);
    const legendary = total > 100 ? Math.min(originalLegendary,95*Math.min(1,ratio)/total) : originalLegendary;
    return {loot,equipment,legendary};
  }
  function formatHansDropForecast(stage, values, mode) {
    if (!stage) return "選擇關卡後顯示掉落預估";
    if (/劇情|story/i.test(stage)) return stage + " · 劇情關卡使用遊戲預設難度";
    const {loot,equipment,legendary} = hansDropForecast(stage,values,mode);
    const percent = legendary >= 0.995 ? "100%" : legendary < 0.1
      ? (legendary*100).toFixed(1)+"%" : Math.round(legendary*100)+"%";
    const chapter2 = ["吉芬地下迷宮","時計塔地下","深淵之湖","克雷斯特漢姆修道院","尼芙菲姆原野"].includes(stage);
    return stage + " · 戰利品 ×"+loot.toFixed(2)+" · 一般怪裝備 ×"+equipment.toFixed(2)+" · "+(chapter2 ? "基礎傳說率 "+percent+"（另套用第二章品質提升，最終以遊戲為準）" : "傳說率 "+percent);
  }
  const dropStagePicker = document.createElement("select");
  dropStagePicker.setAttribute("aria-label","掉落預覽關卡");
  const stageDropPreview = document.createElement("div");
  stageDropPreview.setAttribute("aria-live","polite");
  stageDropPreview.style.cssText = "margin-top:5px;line-height:1.45";
  function refreshStageDropPreview() {
    if (!taiwanGame) return;
    const selected = dropStagePicker.value;
    const compare = stageMode.value === "rotation" || stageMode.value === "highest";
    const choices = stageMode.value === "rotation" ? rotationStages() :
      [...fixedStage.options].map(option => option.value).filter(Boolean);
    dropStagePicker.hidden = !compare;
    if (compare) {
      dropStagePicker.replaceChildren(new Option("選擇關卡查看掉落",""),...stageOptionGroups(choices));
      dropStagePicker.value = choices.includes(selected) ? selected : choices[0] || "";
    }
    const mode = previewDifficultyMode();
    stageDropPreview.textContent = (mode === "party" ? "組隊預估 · " : "單人預估 · ") +
      formatHansDropForecast(previewStage(),readStageDifficulty(mode,previewStage(),expeditionLap.value) ?? getDifficulty(mode),mode);
  }
  function previewDifficultyMode() {
    const role = readSetting("ro-helper-party-role") ?? (readSetting("ro-helper-auto-party") === "on" ? "member" : "off");
    return stageMode.value !== "boss" && role !== "off" ? "party" : "solo";
  }
  function previewStage() {
    return stageMode.value === "rotation" || stageMode.value === "highest" ? dropStagePicker.value : fixedStage.value;
  }
  dropStagePicker.addEventListener("change",refreshStageDropPreview);
  const difficultyAdviceButton=document.createElement("button");
  difficultyAdviceButton.type="button";difficultyAdviceButton.textContent="AI 難度建議";
  const stageDifficultyKey=(mode,stage,lap)=>"ro-helper-difficulty-stage."+mode+"."+Number(lap)+"."+encodeURIComponent(baseExpeditionName(stage));
  function readStageDifficultyValue(mode,stage,lap){
    const canonical=stageDifficultyKey(mode,stage,lap);
    if(localStorage.getItem(settingKey(canonical))==="__ro_helper_default_v1__")return null;
    const direct=readSetting(canonical);if(direct!==null&&direct!==undefined)return direct;
    if(!hansEventIdentity(stage))return null;
    const prefix="ro-helper-difficulty-stage."+mode+"."+Number(lap)+".";
    const suffix="."+activeAccount;
    for(const scoped of [true,false])for(let i=0;i<localStorage.length;i++){
      let key=localStorage.key(i);if(!key?.startsWith(prefix)||key.endsWith(suffix)!==scoped)continue;
      if(scoped)key=key.slice(0,-suffix.length);
      try{const old=decodeURIComponent(key.slice(prefix.length));if(baseExpeditionName(old)===baseExpeditionName(stage)){
        const value=readSetting(key);if(value!==null&&value!==undefined)return value;
      }}catch{}
    }
    return null;
  }
  function readStageDifficulty(mode,stage,lap){
    if(!stage)return null;
    try{
      const value=JSON.parse(readStageDifficultyValue(mode,stage,lap)||"null");
      if(!value || difficultyFields.some(([key])=>!Number.isFinite(value[key]) || value[key]<=0))return null;
      return value;
    }catch{return null;}
  }
  let departureDifficultyContext;
  function currentDepartureDifficultyContext(){
    const selected=document.querySelector("#stg-list .stg-card.sel");
    const tab=document.querySelector("#lap-tabs .primary[data-laptab]");
    if(selected) return {stage:baseExpeditionName(stageNameOf(selected)),lap:Number(tab?.dataset.laptab||1),account:activeAccount};
    return departureDifficultyContext?.account===activeAccount?departureDifficultyContext:null;
  }
  difficultyAdviceButton.onclick=async()=>{
    if(readingGsAdvice || document.getElementById("ro-helper-difficulty-advice"))return;
    const stage=previewStage(),lap=Number(expeditionLap.value),mode=previewDifficultyMode(),account=activeAccount;
    if(!stage){status.textContent="請先選擇要評估的關卡";return;}
    if(mode!=="solo"){status.textContent="目前僅能評估單人；組隊需要隊友素質";return;}
    readingGsAdvice=true;difficultyAdviceButton.disabled=true;
    try{
      document.getElementById("ro-helper-stage-dialog")?.close();
      await ensureGsAdviceReady(account);
      if(account!==activeAccount)throw Error("帳號已切換，請重新評估");
      showDifficultyAdvice({stage,lap,mode,account});
    }catch(error){status.textContent=error.message;}
    finally{requestLobbyNpc("cancel");readingGsAdvice=false;difficultyAdviceButton.disabled=false;}
  };
  function showDifficultyAdvice(context){
    const dialog=document.createElement("dialog");
    dialog.id="ro-helper-difficulty-advice";
    dialog.style.cssText="width:min(680px,calc(100vw - 24px));max-height:85dvh;overflow:hidden;box-sizing:border-box;padding:16px;background:#f7f9ff;color:#173569";
    const scroll=document.createElement("div");scroll.style.cssText="flex:1;min-height:0;overflow:auto";
    const footer=document.createElement("div");footer.style.cssText="flex:0 0 auto;border-top:1px solid #cbd6ef;padding-top:10px;text-align:right";
    const title=document.createElement("h2");title.textContent="AI 難度建議 · "+context.stage+" · "+context.lap+"周目";
    const objective=document.createElement("select"),safety=document.createElement("select");
    objective.setAttribute("aria-label","優化目標");safety.setAttribute("aria-label","負荷評估方式");
    objective.append(new Option("傳說率優先","legendary"),new Option("掉落倍率優先（戰利品）","loot"),new Option("王卡掉落優先","bossCard"));
    objective.value=["loot","bossCard"].includes(readSetting("ro-helper-difficulty-objective"))?readSetting("ro-helper-difficulty-objective"):"legendary";
    safety.append(new Option("保守：不增加目前設定的總負荷","conservative"),new Option("依 GS 餘裕小幅增加（最高 30%）","headroom"));
    const hint=document.createElement("p");
    hint.textContent="依目前素質、此關卡與周目的入場條件評估，並以助手目前設定作負荷基準。速度保持不變。這是本機搜尋與風險估算，不保證通關；未讀取實戰通關紀錄。";
    const analyze=document.createElement("button"),apply=document.createElement("button"),clear=document.createElement("button"),close=document.createElement("button");
    analyze.textContent="重新分析";apply.textContent="只套用此關／此周目";clear.textContent="移除此關專用難度";close.textContent="關閉";
    const result=document.createElement("div"),feedback=document.createElement("p");
    feedback.setAttribute("role","status");
    let snapshot;
    const request=()=>{
      document.dispatchEvent(new CustomEvent("ro-helper-difficulty-request",{detail:JSON.stringify({
        stage:context.stage,lap:context.lap,mode:context.mode,values:getDifficulty(context.mode),
        objective:objective.value,safety:safety.value
      })}));
      try{return JSON.parse(document.documentElement.dataset.roHelperDifficultyAdvice||"null");}catch{return null;}
    };
    const percent=n=>(n*100).toFixed(2)+"%";
    const rowLabels={count:"敵人數量 %",damage:"敵人傷害 %",hp:"敵人血量 %",speed:"敵人速度 %",events:"事件數量 %",tier:"刷關等級"};
    function run(){
      snapshot=null;apply.disabled=true;result.replaceChildren();
      if(context.account!==activeAccount){feedback.textContent="帳號已切換，請重新開啟";return;}
      const data=request();
      if(!data||Date.now()-data.at>3000){feedback.textContent="讀取尚未完成，請重新分析";return;}
      if(data.error){feedback.textContent=data.error;return;}
      snapshot=data;apply.disabled=false;
      writeSetting("ro-helper-difficulty-objective",objective.value);
      const identity=document.createElement("p");
      identity.textContent=data.name+" · GS "+data.gs+" · HP "+Math.round(data.stats.hp)+" · MATK "+Math.round(data.stats.matk)+" · 急速 "+Math.round(data.stats.haste*100)+" · 尋寶率 "+percent(data.stats.discovery||0);
      const rates=document.createElement("p");
      rates.textContent="傳說率："+percent(data.baseline.legendary)+" → "+percent(data.recommended.legendary)+"；戰利品倍率：×"+data.baseline.loot.toFixed(2)+" → ×"+data.recommended.loot.toFixed(2)+"；一般怪裝備倍率：×"+data.recommended.equipment.toFixed(2);
      if(objective.value==="bossCard") rates.textContent="王卡掉落倍率：×"+data.baseline.bossCard.toFixed(2)+" → ×"+data.recommended.bossCard.toFixed(2)+"；單隻有卡片的首領機率估計："+percent(Math.min(1,.001*data.baseline.bossCard))+" → "+percent(Math.min(1,.001*data.recommended.bossCard))+"。"+rates.textContent;
      const note=document.createElement("p");note.textContent=objective.value==="bossCard" ? "王卡優先直接比較遊戲首領卡片倍率。同倍率先選首領血量較低，再選傷害與怪量較低的配置。機率以一般首領基礎 0.1% 試算，特殊首領或成組首領判定依遊戲規則；不以傳說裝備率代替王卡率，也未估算每分鐘王卡效率。" : "傳說率已計入角色裝備／卡片的尋寶率及第二章周目品質提升，不含局內寶物的額外尋寶率；這是每件裝備品質機率，並非王卡機率，也不等於每分鐘傳說件數。掉落倍率優先以遊戲的戰利品倍率為目標。";
      const table=document.createElement("table");table.style.cssText="width:100%;border-collapse:collapse";
      const header=document.createElement("tr");
      for(const label of ["項目","目前設定","建議"]){const th=document.createElement("th");th.textContent=label;header.append(th);}table.append(header);
      for(const [key,label]of Object.entries(rowLabels)){const tr=document.createElement("tr");for(const value of [label,data.baseline.values[key],data.recommended.values[key]]){const td=document.createElement("td");td.textContent=String(value);td.style.cssText="padding:5px;border-bottom:1px solid #dce3f3";tr.append(td);}table.append(tr);}
      const warning=document.createElement("p");
      warning.textContent=(data.hitBuffer<1?"注意：按生命與減傷估計，可能承受不了首領一次攻擊，仍高度依賴閃避。":"")+"本次比較 "+data.tested+" 組配置。"+data.caveat;
      result.append(identity,rates,note,table,warning);
      feedback.textContent="建議尚未套用；確認後才會變更此關難度。";
    }
    analyze.onclick=run;
    for(const select of [objective,safety])select.onchange=()=>{snapshot=null;apply.disabled=true;feedback.textContent="目標已變更，請按重新分析";};
    apply.onclick=()=>{
      if(!snapshot||context.account!==activeAccount)return;
      const fresh=request();
      if(!fresh||fresh.error||fresh.id!==snapshot.id||fresh.signature!==snapshot.signature){feedback.textContent="角色狀態已改變，請重新分析";apply.disabled=true;return;}
      writeSetting(stageDifficultyKey(context.mode,context.stage,context.lap),JSON.stringify(snapshot.recommended.values));
      refreshStageDropPreview();feedback.textContent="已儲存，僅在此關卡、此周目單人出發時套用；其他關卡沿用各自設定。";
    };
    clear.onclick=()=>{if(context.account!==activeAccount)return;writeSetting(stageDifficultyKey(context.mode,context.stage,context.lap),"__ro_helper_default_v1__");refreshStageDropPreview();feedback.textContent="已移除此關專用難度，恢復使用一般難度設定。";};
    close.onclick=()=>dialog.close();close.style.cssText="padding:8px 24px";
    scroll.append(title,objective,safety,hint,analyze,result,apply,clear,feedback);
    footer.append(close);dialog.append(scroll,footer);document.body.append(dialog);dialog.showModal();
    dialog.style.display="flex";dialog.style.flexDirection="column";dialog.onclose=()=>dialog.remove();run();
  }

  if (taiwanGame) {
    difficultyButton.style.cssText = "margin-top:6px;background:#234b96;color:white;padding:5px 7px;border-radius:5px;cursor:pointer";
    stageSettings.append(dropStagePicker,stageDropPreview,difficultyButton,difficultyAdviceButton);
  }

  const repeatCount = value => Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(value)) || 1));
  const savedRotationNames = () => [...new Set(readNames("ro-helper-stage-rotation").map(baseExpeditionName))];
  const rotationStages = () => {
    const available = new Set(stageNamesForLap(expeditionLap.value));
    return savedRotationNames().filter(name=>available.has(name));
  };
  function refreshStageChoices() {
    const saved = readSetting("ro-helper-stage") ?? sessionStorage.getItem("ro-helper-stage");
    const checked = rotationStages();
    const names = stageNamesForLap(expeditionLap.value);
    fixedStage.replaceChildren(new Option("請選擇關卡", ""), ...stageOptionGroups(names));
    const current = saved && saved !== highestStageMode ? baseExpeditionName(saved) : "";
    fixedStage.value = names.includes(current) ? current : "";
    const groups = groupedStageChoices(names,(label,entries) => {
      const group = document.createElement("fieldset");
      const title = document.createElement("legend");
      title.textContent = label;
      group.append(title);
      for (const name of entries) {
        const row = document.createElement("label");
        row.style.display = "block";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = checked.includes(name);
        input.addEventListener("change", () => {
          const selected = new Set(savedRotationNames());
          if (input.checked) selected.add(name);
          else selected.delete(name);
          const ordered = [...names.filter(stage=>selected.has(stage)),...Array.from(selected).filter(stage=>!names.includes(stage))];
          writeSetting("ro-helper-stage-rotation",JSON.stringify(ordered));
          refreshStageDropPreview();
        });
        row.append(input," " + name);
        group.append(row);
      }
      return group;
    });
    stageChecks.replaceChildren(...groups);
  }
  const inventoryTerms = {
    STR:/\bSTR\b/i, AGI:/\bAGI\b/i, VIT:/\bVIT\b/i, INT:/\bINT\b/i, DEX:/\bDEX\b/i, LUK:/\bLUK\b/i,
    "急速":/急速|冷卻縮減|\bHaste\b|\bCeleridad\b|Aceleração/i,
    "詠唱速度":/詠唱速度|cast(?:ing)? (?:speed|haste)|rapidez de casteo/i,
    "爆擊":/爆擊(?!傷害)|crit(?:ical)? chance|probabilidad de crítico/i,
    "爆擊傷害":/爆擊傷害|crit(?:ical)? damage|daño crítico/i,
    "範圍":/^[+\-]?\d+(?:\.\d+)?%?\s*(?:範圍|area|área)$/i,
    "最大 HP":/最大\s*HP|max(?:imum)?\s*HP|vida máxima/i,
    "移動速度":/移動速度|move(?:ment)? speed|velocidad de movimiento/i,
    "護甲":/護甲|\barmor\b|armadura/i,
    "迴避":/迴避|\bflee\b|\bdodge\b|evasión/i,
    "物理穿透":/物理穿透|穿透|perforación|penetración|\bpierce\b/i,
    "減傷":/減傷|傷害減免|damage reduction|reducción de daño/i,
    "生命恢復":/生命恢復|生命回復|HP\s*(?:恢復|回復|再生)|(?:HP|health)\s*regen|regeneración|HP\s*[\/／]\s*(?:秒|s\b)/i,
    "傷害":/^[+\-]?\d+(?:\.\d+)?%?\s*(?:傷害|damage|daño)$/i,
    "對首領傷害":/對首領|首領.*傷害|boss.*damage|damage.*boss|daño a jefes/i,
    "持續傷害":/持續傷害|damage over time|daño en el tiempo/i,
    "近戰距離":/近戰(?:距離|範圍)|melee (?:range|reach)|alcance cuerpo a cuerpo/i,
    "投射物速度":/投射物速度|projectile speed|velocidad de proyectil/i,
    "金幣獲取":/金幣|Zeny|zeny/i,
    "拾取範圍":/拾取範圍|撿取範圍|pickup (?:radius|range)|radio de recogida/i,
    "藥水效果":/藥水(?:效果|治療)|potion (?:effect|healing)|(?:curación|efecto).*pociones/i,
    "低血量傷害":/低血量|low[ -]HP|low health|vida baja/i,
    "暈眩機率":/暈眩|暈擊|stun|aturdimiento/i,
    "經驗獲取":/經驗|\bEXP\b|experience|experiencia/i,
    "二重詠唱":/二重詠唱|雙重詠唱|double cast|doble casteo/i
  };
  function inventoryRandomAffixLines(uid) {
    let snapshot;try{snapshot=JSON.parse(document.documentElement.dataset.roHelperRandomAffixes||"null")}catch{}
    if(snapshot?.uid!==uid || Date.now()-snapshot.at>1000 || !Array.isArray(snapshot.affixes))return null;
    const labels={str:"STR",agi:"AGI",vit:"VIT",int:"INT",dex:"DEX",luk:"LUK",crit:"爆擊",critDmg:"爆擊傷害",critMult:"爆擊傷害",pierce:"物理穿透",cd:"急速",area:"範圍",hp:"最大 HP",armor:"護甲",spd:"移動速度",flee:"迴避",dodge:"迴避",dmg:"傷害",cast:"詠唱速度",regen:"生命恢復",pickup:"拾取範圍",exp:"經驗獲取",zeny:"金幣獲取"};
    if(snapshot.affixes.some(a=>a.stat!=="skill" && !labels[a.stat]))return null;
    return snapshot.affixes.filter(a=>a.stat!=="skill" && Number.isFinite(a.value) && a.value!==0).map(a=>labels[a.stat] ? Math.abs(a.value)+" "+labels[a.stat] : null).filter(Boolean);
  }
  function inventoryHasFixedAffixes(tip, uid, gameGear) {
    // This option means the starred fixed affix shown on the actual piece.
    // Base equipment bonuses and encyclopedia entries do not qualify.
    const list=tip.querySelector(".bon-list");
    if(!list)return null;
    return [...list.querySelectorAll("li")].some(row=>/^\s*[★☆⭐]/u.test(row.textContent.normalize("NFKC")));
  }
  function randomInventoryBonuses(bonuses) {
    return (bonuses || []).filter(line=>typeof line === "string").map(line=>line.normalize("NFKC").trim())
      .filter(line=>!/^\s*[★☆⭐]/u.test(line));
  }

  const inventoryQualities = ["普通","優良","稀有","史詩（紫）","傳說（金）"];
  function storageQuality(rank) {
    return Number.isInteger(rank) && rank >= 0 && rank < inventoryQualities.length ? rank : 0;
  }
  const storageGearCatalog = [
    [5053,"人面獅身帽","Sphinx Hat","頭上","INT、減傷",["BOSS 俄塞里斯 · 夢羅克金字塔（一周目 T3）"],[0,0,1,1,2],5053,""],
    [2601,"力量戒指","Ring","飾品","",["MINI 狂暴大腳熊 · 迷宮森林（一周目 T3）"],[0,0,1,1,2],2601,""],
    [2621,"力量戒指","Ring [1]","飾品","STR、LUK",["BOSS 德古拉男爵 · 吉芬地下迷宮（一周目 T6）"],[0,0,1,1,2],2621,""],
    [1710,"十字弓","Crossbow","武器","投射物速度",[],[0,1,2,3,4],1711,"舊版裝備"],
    [1711,"十字弓","Cross Bow","武器","DEX",["一般怪 九尾狐 · 斐揚森林（一周目 T2）、斐揚洞穴（一周目 T2）"],[0,1,2,3,4],1711,""],
    [1163,"十字巨劍","Claymore","武器","範圍",["MINI 雪熊 · 迷宮森林（一周目 T3）"],[0,1,2,3,4],1163,""],
    [1721,"十字機弩","Repeating Crossbow","武器","投射物速度",["一般怪 raydric_archer · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1721,""],
    [1825,"三角幼獅獸之角拳套","Horn of Hillslion","武器","範圍、急速",["BOSS 鴞裊男爵 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1825,""],
    [2544,"三角狂獅獸之外皮","Leather of Tendrilion","披肩","減傷",["MINI 小青 · 元宵燈會（一周目 T3）"],[0,0,1,1,2],2544,""],
    [5042,"丸子頭飾","Bao Bao","頭上","最大 HP",["一般怪 群葉貓 · 元宵燈會（一周目 T3）","一般怪 春兔 · 元宵燈會（一周目 T3）","MINI 紙妖 · 元宵燈會（一周目 T3）","MINI 小青 · 元宵燈會（一周目 T3）","MINI 冰巨人 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5042,""],
    [2274,"亡者髮箍","Ghost Bandana","頭上","AGI",["MINI 幽靈波利 · 失事輪（一周目 T1）、夢羅克金字塔（一周目 T3）","MINI 邪骸戰士長 · 斐揚洞穴（一周目 T2）、夢羅克金字塔（一周目 T3）"],[0,0,1,1,2],2274,""],
    [2111,"大天使之盾","Sacred Mission","盾牌","VIT",["BOSS 冰暴騎士 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2111,""],
    [1732,"大地之弓","Earth Bow","武器","投射物速度",["一般怪 鬼娃樹 · 尼芙菲姆原野（一周目 T6）"],[0,1,2,3,4],1732,""],
    [1821,"大地拳套","Seismic Fist","武器","範圍",["MINI 紅貝勒斯 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],1821,""],
    [1564,"大百科全書","Encyclopedia","武器","詠唱速度",["MINI 鐘塔守護者 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1564,""],
    [2307,"大衣","Mantle","護甲","",[],[0,0,1,1,2],2307,""],
    [2308,"大衣","Mantle","護甲","迴避",["一般怪 penomena · 失事輪（一周目 T1）","一般怪 狼 · 斐揚森林（一周目 T2）、獸人村（一周目 T3）"],[0,0,1,1,2],2308,""],
    [1473,"大巫師之杖","Wizardry Staff","武器","INT、DEX",["BOSS 德古拉男爵 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],1473,""],
    [1222,"大馬士革短劍","Damascus","武器","爆擊",["BOSS 獸人英雄 · 獸人村（一周目 T3）"],[0,1,2,3,4],1222,""],
    [1925,"大提琴","Cello","武器","AGI",["一般怪 古鐘魔 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1925,""],
    [1213,"大駒短劍","Dagger","武器","爆擊",[],[0,1,2,3,4],1214,"舊版裝備"],
    [1214,"大駒短劍","Dagger","武器","爆擊",["一般怪 邪骸士兵 · 斐揚洞穴（一周目 T2）、夢羅克金字塔（一周目 T3）"],[0,1,2,3,4],1214,""],
    [1970,"女王的鞭子","Queen's Whip","武器","範圍",["一般怪 bathory · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1970,""],
    [2005,"女神之杖","Dea Staff","武器","持續傷害",["一般怪 闇神官 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],2005,""],
    [2262,"小丑鼻子","Clown Nose","頭下","LUK",["一般怪 瘋兔 · 普隆德拉原野（一周目 T1）"],[0,0,1,1,2],2262,""],
    [5445,"小鬼棒棒糖","Candy Cane In Mouth","頭下","生命恢復",["一般怪 聖誕哥布靈 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5445,""],
    [2260,"小眼鏡","Mini Glasses","頭中","",[],[0,0,1,1,2],2260,""],
    [5038,"小惡魔帽","Deviruchi Hat","頭上","",[],[0,0,1,1,2],5038,""],
    [1901,"小提琴","Violin","武器","",[],[0,1,2,3,4],1901,""],
    [5059,"小熊帽","Teddybear Hat","頭上","最大 HP",["一般怪 玩偶熊 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5059,""],
    [2256,"山羊頭盔","Majestic Goat","頭上","STR、對首領傷害",["BOSS 巴風特 · 迷宮森林（一周目 T3）"],[0,0,1,1,2],2256,""],
    [1701,"弓","Bow","武器","",[],[0,0,0,0,0],1701,""],
    [1702,"弓","Bow","武器","投射物速度",["一般怪 禿鷹 · 普隆德拉原野（一周目 T1）","一般怪 goblin_archer · 獸人村（一周目 T3）"],[0,1,2,3,4],1702,""],
    [2708,"中國結","Chinese Handicraft","飾品","範圍、LUK",[],[0,0,1,1,2],2708,"舊版裝備"],
    [13101,"六輪發手槍","Six Shooter","武器","",[],[0,0,0,0,0],13101,""],
    [1305,"切削之斧","Cleaver","武器","拾取範圍",["MINI 狂暴大腳熊 · 迷宮森林（一周目 T3）"],[0,1,2,3,4],1305,""],
    [1807,"升龍拳套","Fist","武器","急速",["BOSS 墨蛇君 · 元宵燈會（一周目 T3）"],[0,1,2,3,4],1807,""],
    [2743,"天使之戒","Angelic Ring","飾品","INT",["BOSS 安東尼奧 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2743,""],
    [2116,"天使之保護","Angelic Guard","盾牌","生命恢復",["BOSS 波利之王 · 普隆德拉原野（一周目 T1）"],[0,0,1,1,2],2116,""],
    [2254,"天使之翼","Angel Wings","頭上","AGI、LUK",["MINI 天使波利 · 斐揚森林（一周目 T2）"],[0,0,1,1,2],2254,""],
    [2355,"天使的守護","Angelic Protection","護甲","減傷",["MINI 月蝕兔 · 普隆德拉原野（一周目 T1）"],[0,0,1,1,2],2355,""],
    [2521,"天使的溫氣","Angelic Cardigan","披肩","生命恢復",["BOSS 安東尼奧 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2521,""],
    [2420,"天使的轉生","Angel's Reincarnation","鞋子","最大 HP",["MINI 蟋蟀王 · 普隆德拉原野（一周目 T1）"],[0,0,1,1,2],2420,""],
    [5074,"天使翅膀耳飾","Angel Wing Ears","頭中","STR",["BOSS 安東尼奧 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5074,""],
    [13005,"天使翅膀短劍","Angelic Wing Dagger","武器","爆擊",["BOSS 安東尼奧 · 聖誕節（一周目 T3）"],[0,1,2,3,4],13005,""],
    [5025,"天使頭盔","Helm of Angel","頭上","AGI",["BOSS 安東尼奧 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5025,""],
    [2358,"天使禮服","Angel's Dress","護甲","LUK",["BOSS 安東尼奧 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2358,""],
    [1724,"天龍之翼","Dragon Wing","武器","Zeny、對首領傷害",[],[0,1,2,3,4],1724,"舊版裝備"],
    [1559,"天龍的遺產","Legacy of Dragon","武器","INT、對首領傷害",["BOSS 白素貞 · 元宵燈會（一周目 T3）"],[0,1,2,3,4],1559,""],
    [13001,"天龍短劍","Dragon Killer","武器","",[],[0,1,2,3,4],13001,""],
    [13030,"天龍短劍","Dragon Killer","武器","對首領傷害",[],[0,1,2,3,4],13030,"舊版裝備"],
    [2201,"太陽眼鏡","Sunglasses","頭中","迴避",["一般怪 hydra · 失事輪（一周目 T1）"],[0,0,1,1,2],2201,""],
    [2115,"巴基力亞鋼盾","Valkyrie Shield","盾牌","",[],[0,0,1,1,2],2115,""],
    [2524,"巴基力的斗篷","Valkyrian Manteau","披肩","迴避、最大 HP",["BOSS 死靈騎士 · 尼芙菲姆原野（一周目 T6）"],[0,0,1,1,2],2524,""],
    [2421,"巴基力的長靴","Valkyrian Shoes","鞋子","最大 HP、移動速度",["BOSS 死靈騎士 · 尼芙菲姆原野（一周目 T6）"],[0,0,1,1,2],2421,""],
    [2357,"巴基力的鎧甲","Valkyrie Armor","護甲","",[],[0,0,1,1,2],2357,"特殊取得"],
    [5171,"巴基力頭具","Valkyrie Helm","頭上","減傷、最大 HP",["BOSS 死靈騎士 · 尼芙菲姆原野（一周目 T6）"],[0,0,1,1,2],5171,""],
    [1376,"心破壞斧","Heart Breaker","武器","爆擊、急速",["BOSS 水晶龍 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],1376,""],
    [1601,"手杖","Rod","武器","",[],[0,0,0,0,0],1601,""],
    [1602,"手杖","Rod","武器","詠唱速度",["一般怪 土波利 · 普隆德拉原野（一周目 T1）"],[0,1,2,3,4],1602,""],
    [2604,"手套","Glove","飾品","",["一般怪 狗頭人 · 獸人村（一周目 T3）","一般怪 黑狐 · 夢羅克金字塔（一周目 T3）","一般怪 赤蒼蠅 · 迷宮森林（一周目 T3）"],[0,0,1,1,2],2604,""],
    [1823,"斗士的戰鬥升龍拳套","Valorous Battle Fist","武器","STR",["MINI 黃俄希托斯 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],1823,""],
    [2505,"斗篷","Manteau","披肩","減傷",["一般怪 penomena · 失事輪（一周目 T1）","MINI 狄奧斯 · 柏伊亞嵐島（一周目 T2）","一般怪 九尾狐 · 斐揚森林（一周目 T2）、斐揚洞穴（一周目 T2）"],[0,0,1,1,2],2505,""],
    [2506,"斗篷","Manteau","披肩","迴避",[],[0,0,1,1,2],2505,"舊版裝備"],
    [2211,"方頭巾","Bandana","頭上","最大 HP",["一般怪 邪骸海盜 · 失事輪（一周目 T1）"],[0,0,1,1,2],2211,""],
    [1513,"日星錘","Morning Star","武器","範圍",["MINI 狂暴木乃伊 · 夢羅克金字塔（一周目 T3）"],[0,1,2,3,4],1513,""],
    [1558,"日記本","Girl's Diary","武器","",[],[0,1,2,3,4],1558,""],
    [1234,"月靈短劍","Moonlight Sword","武器","急速",["BOSS 月夜貓 · 斐揚洞穴（一周目 T2）","MINI 狂暴月夜貓 · 斐揚洞穴（一周目 T2）"],[0,1,2,3,4],1234,""],
    [2328,"木製鎧甲","Wooden Mail","護甲","護甲",[],[0,0,1,1,2],2329,"舊版裝備"],
    [2329,"木製鎧甲","Wooden Mail","護甲","護甲",["一般怪 長老樹精 · 斐揚森林（一周目 T2）"],[0,0,1,1,2],2329,""],
    [1501,"木錘","Club","武器","",[],[0,0,0,0,0],1501,""],
    [1502,"木錘","Club","武器","暈眩",["一般怪 綠棉蟲 · 普隆德拉原野（一周目 T1）"],[0,1,2,3,4],1502,""],
    [2311,"毛皮大衣","Mink Coat","護甲","",[],[0,0,1,1,2],2311,""],
    [1131,"水靈之刀","Ice Falchion","武器","",[],[0,1,2,3,4],1131,""],
    [1553,"水靈之書","Book of Billows","武器","",[],[0,1,2,3,4],1553,""],
    [1568,"水靈之書","Book of Billows","武器","持續傷害",["一般怪 兔斯拉 · 尼芙菲姆原野（一周目 T6）"],[0,1,2,3,4],1568,""],
    [2678,"火焰之王戒指","Ring of Flame Lord","飾品","",[],[0,0,1,1,2],2678,""],
    [1471,"火靈之矛","Hellfire","武器","持續傷害、範圍",["MINI 豬婆龍 · 元宵燈會（一周目 T3）","BOSS 墨蛇君 · 元宵燈會（一周目 T3）","BOSS 安東尼奧 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1471,""],
    [1555,"火靈之書","Book of Blazing Sun","武器","INT",["MINI 狂暴大腳熊 · 迷宮森林（一周目 T3）"],[0,1,2,3,4],1555,""],
    [1133,"火靈之劍","Fire Brand","武器","持續傷害",["BOSS 虎王 · 斐揚森林（一周目 T2）"],[0,1,2,3,4],1133,""],
    [13435,"火靈之劍","Fireblend","武器","詠唱速度、持續傷害",[],[0,1,2,3,4],1133,"舊版裝備"],
    [1258,"火靈拳刃","Katar of Raging Blaze","武器","持續傷害",["BOSS 虎王 · 斐揚森林（一周目 T2）"],[0,1,2,3,4],1258,""],
    [1277,"火靈拳刃","Katar of Raging Blaze","武器","持續傷害",[],[0,1,2,3,4],1258,"舊版裝備"],
    [2248,"牛仔帽","Western Grace","頭上","DEX",["MINI 流浪之狼 · 斐揚森林（一周目 T2）"],[0,0,1,1,2],2248,""],
    [2235,"王冠","Crown","頭上","INT",["MINI 大腳龍蝦 · 柏伊亞嵐島（一周目 T2）","BOSS 魔鬼大烏賊 · 柏伊亞嵐島（一周目 T2）"],[0,0,1,1,2],2235,""],
    [13104,"加立遜手槍","Garrison","武器","爆擊傷害",["一般怪 hydra · 失事輪（一周目 T1）","MINI 哥布靈首領 · 獸人村（一周目 T3）"],[0,1,2,3,4],13104,""],
    [13105,"加立遜手槍","Garrison","武器","爆擊",["一般怪 南瓜先生 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],13105,""],
    [1474,"加野矛","Gae Bolg","武器","對首領傷害",["BOSS 墨蛇君 · 元宵燈會（一周目 T3）"],[0,1,2,3,4],1474,""],
    [13002,"卡卡普劍","Ginnungagap","武器","持續傷害、暈眩",["MINI 嗜血怪人 · 尼芙菲姆原野（一周目 T6）"],[0,1,2,3,4],13002,""],
    [5013,"卡浩之角","Lord Kaho's Horn","頭上","",[],[0,0,1,1,2],5013,""],
    [1815,"卡崙的指甲","Hatii Claw","武器","持續傷害、暈眩",["MINI 卡崙 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1815,""],
    [1573,"古老魔法書","Ancient Magic","武器","詠唱速度",["一般怪 惡靈 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1573,""],
    [13009,"古錠劍","Kamaitachi","武器","持續傷害、爆擊",["MINI 紙妖 · 元宵燈會（一周目 T3）","BOSS 白素貞 · 元宵燈會（一周目 T3）","BOSS 安東尼奧 · 聖誕節（一周目 T3）"],[0,1,2,3,4],13009,""],
    [2410,"史雷普尼爾之靴","Sleipnir","鞋子","",[],[0,0,1,1,2],2410,"特殊取得"],
    [1387,"巨人斧","Giant Axe","武器","STR、爆擊傷害",["BOSS 獸人英雄 · 獸人村（一周目 T3）"],[0,1,2,3,4],1387,""],
    [5091,"巨大的金鈴鐺","Big Golden Bell","頭上","暈眩",["一般怪 邪惡禮盒 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5091,""],
    [1168,"巨大雙手劍","Zweihander","武器","對首領傷害",["MINI 死靈 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],1168,""],
    [1351,"巨斧","Battle Axe","武器","範圍",["一般怪 鬼火 · 斐揚洞穴（一周目 T2）"],[0,1,2,3,4],1351,""],
    [1352,"巨斧","Battle Axe","武器","爆擊傷害、最大 HP、護甲",[],[0,1,2,3,4],1351,"舊版裝備"],
    [2630,"布里希嘉曼","Brisingamen","飾品","",[],[0,0,1,1,2],2630,"特殊取得"],
    [13150,"布林其來福槍","Branch","武器","",[],[0,1,2,3,4],13150,""],
    [2614,"永恆戒指","Eye of Dullahan","飾品","",[],[0,0,1,1,2],2614,""],
    [5457,"玉兔頭飾","Moon Rabbit Hat","頭上","AGI",["一般怪 元宵童子 · 元宵燈會（一周目 T3）"],[0,0,1,1,2],5457,""],
    [2509,"生存斗篷","Manteau of Survival","披肩","VIT",["BOSS 魔鬼大烏賊 · 柏伊亞嵐島（一周目 T2）"],[0,0,1,1,2],2509,""],
    [20813,"生存斗篷","Survivor's Manteau","披肩","減傷",[],[0,0,1,1,2],2509,"舊版裝備"],
    [2450,"生命樹枝鞋","Vital Tree Shoes","鞋子","最大 HP",["MINI 巨大白幽靈 · 吉芬地下迷宮（一周目 T6）"],[0,0,1,1,2],2450,""],
    [5197,"白色髮帶","White Ribbon","頭上","減傷",["一般怪 甜餅人 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5197,""],
    [2122,"白金鋼盾","Platinum Shield","盾牌","減傷",["MINI 雪熊 · 迷宮森林（一周目 T3）"],[0,0,1,1,2],2122,""],
    [13015,"白骨劍","Hakujin","武器","INT",["MINI 邪骸浪人 · 元宵燈會（一周目 T3）","BOSS 墨蛇君 · 元宵燈會（一周目 T3）","MINI 卡崙 · 聖誕節（一周目 T3）"],[0,1,2,3,4],13015,""],
    [2627,"皮帶","Belt","飾品","最大 HP",["MINI 撕咬塔羅鼠 · 普隆德拉地下水道（一周目 T1）","MINI 瘟疫塔羅鼠 · 普隆德拉地下水道（一周目 T1）","MINI 鑽地塔羅鼠 · 普隆德拉地下水道（一周目 T1）"],[0,0,1,1,2],2627,""],
    [2303,"皮製外套","Jacket","護甲","護甲",["一般怪 盜蟲 · 普隆德拉地下水道（一周目 T1）"],[0,0,1,1,2],2303,""],
    [2304,"皮製外套","Jacket","護甲","護甲",["一般怪 盜蟲 · 普隆德拉地下水道（一周目 T1）"],[0,0,1,1,2],2304,""],
    [2114,"石製圓盾","Stone Buckler","盾牌","護甲",["MINI 犬妖首領 · 獸人村（一周目 T3）"],[0,0,1,1,2],2114,""],
    [1737,"伊克希恩的羽翼","Ixion Wings","武器","急速、投射物速度",["BOSS 鴞裊男爵 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1737,""],
    [2282,"光環","Halo","頭上","減傷",["MINI 天使波利 · 斐揚森林（一周目 T2）"],[0,0,1,1,2],2282,""],
    [2679,"共鳴戒指","Ring of Resonance","飾品","",[],[0,0,1,1,2],2679,""],
    [1819,"冰柱拳套","Icicle Fist","武器","範圍",["一般怪 雪獸 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1819,""],
    [1731,"冰凍之弓","Frozen Bow","武器","暈眩",["MINI 蓋俄斯提 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1731,""],
    [1966,"冰劍鞭子","Icicle Whip","武器","持續傷害",["MINI 水靈龜 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1966,""],
    [1256,"冰靈拳刃","Katar of Cold Icicle","武器","",[],[0,1,2,3,4],1256,""],
    [1275,"冰靈拳刃","Katar of Frozen Icicle","武器","持續傷害",["MINI 冰巨人 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1275,""],
    [1908,"吉他","Guitar","武器","急速",["MINI 犬妖首領 · 獸人村（一周目 T3）"],[0,1,2,3,4],1908,""],
    [1164,"名刀 不知火","Muramasa","武器","爆擊、急速",["MINI 邪骸浪人 · 元宵燈會（一周目 T3）","BOSS 白素貞 · 元宵燈會（一周目 T3）","BOSS 冰暴騎士 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1164,""],
    [2234,"后冠","Tiara","頭上","",[],[0,0,1,1,2],2234,""],
    [2247,"回憶帽","Romantic Gent","頭上","LUK",["MINI 蟋蟀王 · 普隆德拉原野（一周目 T1）"],[0,0,1,1,2],2247,""],
    [1554,"地靈之書","Book of Mother Earth","武器","持續傷害",["一般怪 飛行魔書 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1554,""],
    [13156,"守門霰彈槍","Gate Keeper","武器","範圍",["BOSS 獸人英雄 · 獸人村（一周目 T3）"],[0,1,2,3,4],13156,""],
    [1517,"尖刃鐵錘","Sword Mace","武器","STR",["一般怪 土人 · 斐揚森林（一周目 T2）"],[0,1,2,3,4],1517,""],
    [1518,"尖刃鐵錘","Sword Mace","武器","暈眩、最大 HP",[],[0,1,2,3,4],1517,"舊版裝備"],
    [2258,"尖角髮圈","Spiky Band","頭上","最大 HP",["MINI 死靈 · 吉芬地下迷宮（一周目 T6）"],[0,0,1,1,2],2258,""],
    [1186,"死亡引導者","Death Guidance","武器","STR、AGI",["MINI 行刑者 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1186,""],
    [1466,"死神之鐮","Crescent Scythe","武器","範圍、對首領傷害",["BOSS 巴風特 · 迷宮森林（一周目 T3）"],[0,1,2,3,4],1466,""],
    [5170,"羽毛貝雷帽","Feather Beret","頭上","減傷、最大 HP",["BOSS 墮落大神官 悉潘 · 尼芙菲姆原野（一周目 T6）"],[0,0,1,1,2],5170,""],
    [1616,"羽翼之杖","Wing Staff","武器","INT",["MINI 犬妖首領 · 獸人村（一周目 T3）"],[0,1,2,3,4],1616,""],
    [5098,"老虎面具","Tiger Mask","頭上","STR",["MINI 邪骸浪人 · 元宵燈會（一周目 T3）"],[0,0,1,1,2],5098,""],
    [2515,"老鷹之翅膀","Eagle Wing","披肩","",[],[0,0,1,1,2],2515,""],
    [1375,"肉搏斧","Berdysz","武器","減傷",["一般怪 綠貝勒斯 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],1375,""],
    [1265,"血拳刃","Bloody Roar","武器","",[],[0,1,2,3,4],1265,""],
    [1271,"血淚拳刃","Blood Tears","武器","範圍",["MINI 獸牙怪 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],1271,""],
    [1306,"血腥戰斧","War Axe","武器","DEX",["MINI 凱美拉 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1306,""],
    [1182,"血靈魔劍","Bloody Eater","武器","持續傷害、爆擊",["一般怪 綠腐屍 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],1182,""],
    [2320,"西裝外套","Formal Suit","護甲","",[],[0,0,1,1,2],2320,""],
    [2507,"伯爵斗篷","Cape of Ancient Lord","披肩","爆擊",["MINI 雪熊 · 迷宮森林（一周目 T3）"],[0,0,1,1,2],2507,""],
    [1919,"低音吉他","Bass Guitar","武器","急速",["一般怪 小惡魔 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],1919,""],
    [1189,"克拉斯拿雅劍","Krasnaya","武器","STR",["BOSS 海盜之王 · 失事輪（一周目 T1）"],[0,1,2,3,4],1189,""],
    [1364,"克萊伊特斧","Great Axe","武器","暈眩",["MINI 凱美拉 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1364,""],
    [1707,"克羅伊特弓","Great Bow","武器","投射物速度",[],[0,1,2,3,4],1708,"舊版裝備"],
    [1708,"克羅伊特弓","Great Bow","武器","爆擊傷害",["一般怪 orc_archer · 獸人村（一周目 T3）","一般怪 skel_archer · 斐揚洞穴（一周目 T2）、夢羅克金字塔（一周目 T3）"],[0,1,2,3,4],1708,""],
    [2004,"克羅納斯魔杖","Kronos","武器","詠唱速度、INT",["BOSS 黑暗之王 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],2004,""],
    [1704,"坎普茲弓","Composite Bow","武器","急速",["一般怪 hydra · 失事輪（一周目 T1）"],[0,1,2,3,4],1704,""],
    [1477,"妖怪的槍","Spectral Spear","武器","對首領傷害",["BOSS 月夜貓 · 斐揚洞穴（一周目 T2）"],[0,1,2,3,4],1477,""],
    [1479,"妖怪的槍","Spectral Spear","武器","對首領傷害、減傷",[],[0,1,2,3,4],1477,"舊版裝備"],
    [5046,"妖道帽","Bongun Hat","頭上","VIT",["一般怪 妖道 · 斐揚洞穴（一周目 T2）"],[0,0,1,1,2],5046,""],
    [1613,"巫杖 魂咬","Mighty Staff","武器","STR",["一般怪 土人 · 斐揚森林（一周目 T2）"],[0,1,2,3,4],1613,""],
    [2666,"希望之燈","Lantern of Hope","飾品","STR",[],[0,0,1,1,2],2666,"舊版裝備"],
    [2337,"忍服 血櫻","Ninja Suit","護甲","AGI",["一般怪 殭屍 · 斐揚洞穴（一周目 T2）"],[0,0,1,1,2],2337,""],
    [2359,"忍服 血櫻","Ninja Suit","護甲","AGI、減傷",[],[0,0,1,1,2],2337,"舊版裝備"],
    [13171,"快速的布林其來福槍","Soldier Rifle","武器","DEX",["一般怪 萬聖魔 · 尼芙菲姆原野（一周目 T6）"],[0,1,2,3,4],13171,""],
    [2508,"抗魔斗篷","Ragamuffin Manteau","披肩","減傷",["一般怪 闇神官 · 克雷斯特漢姆修道院（一周目 T6）"],[0,0,1,1,2],2508,""],
    [1407,"步兵長矛","Pike","武器","",[],[0,1,2,3,4],1407,""],
    [1408,"步兵長矛","Pike","武器","近戰距離",["一般怪 森靈 · 斐揚森林（一周目 T2）"],[0,1,2,3,4],1408,""],
    [1409,"步兵長矛","Pike","武器","近戰距離",[],[0,1,2,3,4],1408,"舊版裝備"],
    [1920,"狂暴吉他","Berserk Guitar","武器","急速、DEX",["MINI 無顱武士 · 尼芙菲姆原野（一周目 T6）"],[0,1,2,3,4],1920,""],
    [1377,"狂暴颶風斧","Hurricane Fury","武器","STR",["MINI 狂暴木乃伊 · 夢羅克金字塔（一周目 T3）"],[0,1,2,3,4],1377,""],
    [1135,"狂擊之劍","Cutlus","武器","STR、護甲",["BOSS 海盜之王 · 失事輪（一周目 T1）"],[0,1,2,3,4],1135,""],
    [1716,"角弓","Gakkung Bow","武器","投射物速度、最大 HP",["BOSS 鴞裊男爵 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1716,""],
    [1610,"言靈魔杖","Arc Wand","武器","INT",["MINI 哥布靈首領 · 獸人村（一周目 T3）","一般怪 樹精 · 斐揚森林（一周目 T2）"],[0,1,2,3,4],1610,""],
    [1612,"言靈魔杖","Arc Wand","武器","INT",[],[0,1,2,3,4],1610,"舊版裝備"],
    [1311,"貝伽勒巨斧","Vecer Axe","武器","LUK",["一般怪 狂暴邪惡箱 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],1311,""],
    [1722,"貝利斯塔強弩","Ballista","武器","",[],[0,1,2,3,4],1722,""],
    [1263,"邪惡拳刃","Unholy Touch","武器","爆擊",["BOSS 巴風特 · 迷宮森林（一周目 T3）"],[0,1,2,3,4],1263,""],
    [2511,"邪骸戰士的斗篷","Skeleton Manteau","披肩","減傷",["一般怪 邪骸獸人 · 夢羅克金字塔（一周目 T3）"],[0,0,1,1,2],2511,""],
    [2424,"防水長靴","Tidal Shoes","鞋子","生命恢復",["一般怪 羅達蛙 · 普隆德拉原野（一周目 T1）","MINI 蛙王 · 普隆德拉原野（一周目 T1）","一般怪 劍魚 · 柏伊亞嵐島（一周目 T2）","MINI 狄奧斯 · 柏伊亞嵐島（一周目 T2）","MINI 海神 · 柏伊亞嵐島（一周目 T2）"],[0,0,1,1,2],2424,""],
    [2615,"防禦戒指","Safety Ring","飾品","護甲",["一般怪 漂浮蟲 · 普隆德拉地下水道（一周目 T1）"],[0,0,1,1,2],2615,""],
    [1715,"亞伯雷弓","Arbalest","武器","DEX",["一般怪 raydric_archer · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1715,""],
    [2749,"亞麻手套","Linen Glove","飾品","減傷",["一般怪 邪惡禮盒 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2749,""],
    [1155,"亞爾特劍","Bastard Sword","武器","對首領傷害",["MINI 弒神者 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1155,""],
    [1170,"亞藍斯之劍","Katzbalger","武器","VIT、護甲",["一般怪 卡利斯格 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1170,""],
    [2214,"兔耳髮箍","Bunny Band","頭上","",[],[0,0,1,1,2],2214,""],
    [2124,"刺針盾牌","Thorny Buckler","盾牌","減傷",["MINI 狂暴木乃伊 · 夢羅克金字塔（一周目 T3）"],[0,0,1,1,2],2124,""],
    [13046,"刺針短劍","Krieg","武器","持續傷害",["BOSS 虎王 · 斐揚森林（一周目 T2）"],[0,1,2,3,4],13046,""],
    [1261,"刺殺拳刃","Infiltrator","武器","爆擊傷害",["MINI 雪熊 · 迷宮森林（一周目 T3）"],[0,1,2,3,4],1261,""],
    [1276,"刺藤拳刃","Katar of Quaking","武器","持續傷害",["一般怪 假面鬼 · 尼芙菲姆原野（一周目 T6）"],[0,1,2,3,4],1276,""],
    [2542,"夜勝魔的火焰斗篷","Flame Manteau of Naght Sieger","披肩","減傷、詠唱速度",["BOSS 德古拉男爵 · 吉芬地下迷宮（一周目 T6）"],[0,0,1,1,2],2542,""],
    [13413,"夜勝魔的雙子銳劍(紅)","Twin Edge of Naght Sieger (Red)","武器","持續傷害",["MINI 弒神者 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],13413,""],
    [13412,"夜勝魔的雙子銳劍(藍)","Twin Edge of Naght Sieger (Blue)","武器","持續傷害",["MINI 獸牙怪 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],13412,""],
    [1915,"孤獨的吉他","Loner's Guitar","武器","持續傷害",["一般怪 stone_shooter · 元宵燈會（一周目 T3）","一般怪 釣魚河童 · 元宵燈會（一周目 T3）","MINI 紙妖 · 元宵燈會（一周目 T3）","BOSS 安東尼奧 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1915,""],
    [1818,"岩漿拳套","Magma Fist","武器","範圍、急速",["BOSS 德古拉男爵 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],1818,""],
    [1958,"幸運鞭子","Tail Whip","武器","LUK",["MINI 犬妖首領 · 獸人村（一周目 T3）"],[0,1,2,3,4],1958,""],
    [2608,"念珠","Rosary","飾品","LUK",["一般怪 獸人腐屍 · 獸人村（一周目 T3）","一般怪 獸人女戰士 · 普隆德拉城（一周目 T2）、獸人村（一周目 T3）","一般怪 腐屍 · 斐揚洞穴（一周目 T2）、夢羅克金字塔（一周目 T3）"],[0,0,1,1,2],2608,""],
    [2626,"念珠","Rosary","飾品","減傷",[],[0,0,1,1,2],2608,"舊版裝備"],
    [2620,"怪盜戒指","Rogue's Treasure","飾品","迴避",["MINI 撕咬塔羅鼠 · 普隆德拉地下水道（一周目 T1）","MINI 瘟疫塔羅鼠 · 普隆德拉地下水道（一周目 T1）","MINI 鑽地塔羅鼠 · 普隆德拉地下水道（一周目 T1）"],[0,0,1,1,2],2620,""],
    [2503,"披肩","Muffler","披肩","生命恢復",["一般怪 庫克雷 · 失事輪（一周目 T1）"],[0,0,1,1,2],2503,""],
    [2504,"披肩","Muffler","披肩","生命恢復",["一般怪 鬼女 · 斐揚洞穴（一周目 T2）"],[0,0,1,1,2],2504,""],
    [1301,"斧","Axe","武器","",[],[0,0,0,0,0],1301,""],
    [1302,"斧","Axe","武器","STR",["一般怪 小野豬 · 普隆德拉原野（一周目 T1）"],[0,1,2,3,4],1302,""],
    [13153,"昏暗來福槍","Dusk Rifle","武器","DEX",["BOSS 俄塞里斯 · 夢羅克金字塔（一周目 T3）"],[0,1,2,3,4],13153,""],
    [1117,"武士刀","Katana","武器","爆擊",["一般怪 異變魚 · 失事輪（一周目 T1）","一般怪 青蛇 · 斐揚森林（一周目 T2）"],[0,1,2,3,4],1117,""],
    [1118,"武士刀","Katana","武器","對首領傷害",[],[0,1,2,3,4],1117,"舊版裝備"],
    [1828,"武僧拳套","Monk Knuckle","武器","INT、範圍",["一般怪 闇神官 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1828,""],
    [5035,"波利帽","Poring Hat","頭上","LUK",["BOSS 波利之王 · 普隆德拉原野（一周目 T1）"],[0,0,1,1,2],5035,""],
    [1648,"波爾多之杖","Staff of Bordeaux","武器","INT、DEX",["MINI 狂暴大腳熊 · 迷宮森林（一周目 T3）","BOSS 月夜貓 · 斐揚洞穴（一周目 T2）"],[0,1,2,3,4],1648,""],
    [1663,"波爾多之杖","Staff Of Bordeaux","武器","INT、DEX",[],[0,1,2,3,4],1648,"舊版裝備"],
    [2205,"泳鏡","Diver Goggles","頭中","護甲",["一般怪 烏賊 · 柏伊亞嵐島（一周目 T2）","一般怪 人魚士兵 · 柏伊亞嵐島（一周目 T2）","MINI 狄奧斯 · 柏伊亞嵐島（一周目 T2）","BOSS 魔鬼大烏賊 · 柏伊亞嵐島（一周目 T2）"],[0,0,1,1,2],2205,""],
    [2367,"狙擊服","Sniping Suit","護甲","",[],[0,0,1,1,2],2367,""],
    [2207,"花朵頭飾","Fancy Flower","頭上","減傷",["一般怪 克瑞米 · 普隆德拉原野（一周目 T1）","一般怪 刺尾蜻蜓 · 斐揚森林（一周目 T2）"],[0,0,1,1,2],2207,""],
    [2612,"花戒指","Flower Ring","飾品","",["一般怪 邪骸獸人 · 夢羅克金字塔（一周目 T3）","一般怪 木乃伊 · 夢羅克金字塔（一周目 T3）"],[0,0,1,1,2],2612,""],
    [5008,"花冠","Puppy Love","頭上","生命恢復",["MINI 狂暴月夜貓 · 斐揚洞穴（一周目 T2）"],[0,0,1,1,2],5008,""],
    [1801,"虎爪拳套","Waghnak","武器","爆擊",["MINI 犬妖首領 · 獸人村（一周目 T3）"],[0,1,2,3,4],1801,""],
    [1802,"虎爪拳套","Waghnak","武器","急速",["一般怪 鐵蠍 · 元宵燈會（一周目 T3）"],[0,1,2,3,4],1802,""],
    [5497,"虎王娃娃帽子","King Tiger Doll Hat","頭上","STR",["MINI 機木人 · 元宵燈會（一周目 T3）"],[0,0,1,1,2],5497,""],
    [2610,"金戒指","Gold Ring","飾品","Zeny",["BOSS 黃金蟲 · 普隆德拉地下水道（一周目 T1）"],[0,0,1,1,2],2610,""],
    [1308,"金斧頭","Golden Axe","武器","最大 HP",["MINI 血腥騎士 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1308,""],
    [2266,"金屬口罩","Iron Cain","頭下","生命恢復",["一般怪 幽靈劍士 · 克雷斯特漢姆修道院（一周目 T6）"],[0,0,1,1,2],2266,""],
    [2310,"長大衣","Coat","護甲","",["一般怪 獸人腐屍 · 獸人村（一周目 T3）","一般怪 牛頭人 · 夢羅克金字塔（一周目 T3）","一般怪 艾吉歐蜈蚣 · 迷宮森林（一周目 T3）"],[0,0,1,1,2],2310,""],
    [1405,"長矛","Spear","武器","近戰距離",["一般怪 mandragora · 普隆德拉原野（一周目 T1）"],[0,1,2,3,4],1405,""],
    [1420,"長角槍","Long Horn","武器","持續傷害、暈眩",["MINI 紅貝勒斯 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],1420,""],
    [13164,"長身來福槍","Long Barrel Rifle","武器","爆擊",["BOSS 巴風特 · 迷宮森林（一周目 T3）"],[0,1,2,3,4],13164,""],
    [1219,"長柄短劍","Gladius","武器","爆擊傷害",["MINI 邪骸戰士長 · 斐揚洞穴（一周目 T2）、夢羅克金字塔（一周目 T3）"],[0,1,2,3,4],1219,""],
    [1220,"長柄短劍","Gladius","武器","爆擊傷害",["MINI 邪骸戰士長 · 斐揚洞穴（一周目 T2）、夢羅克金字塔（一周目 T3）"],[0,1,2,3,4],1220,""],
    [1221,"長柄短劍","Gladius","武器","爆擊、最大 HP",[],[0,1,2,3,4],1219,"舊版裝備"],
    [1401,"長戟","Javelin","武器","",["一般怪 哥布林 · 獸人村（一周目 T3）","一般怪 獸人戰士 · 普隆德拉城（一周目 T2）、獸人村（一周目 T3）","一般怪 黑蛇 · 迷宮森林（一周目 T3）"],[0,1,2,3,4],1401,""],
    [1402,"長戟","Javelin","武器","投射物速度",["一般怪 搖滾蝗蟲 · 普隆德拉原野（一周目 T1）"],[0,1,2,3,4],1402,""],
    [2403,"長靴","Shoes","鞋子","移動速度、最大 HP",[],[0,0,1,1,2],2404,"舊版裝備"],
    [2404,"長靴","Shoes","鞋子","移動速度",["一般怪 殭屍 · 斐揚洞穴（一周目 T2）"],[0,0,1,1,2],2404,""],
    [1101,"長劍","Sword","武器","",[],[0,0,0,0,0],1101,""],
    [13011,"阿修羅","Asura","武器","INT",["一般怪 沙漠幼狼 · 普隆德拉原野（一周目 T1）"],[0,1,2,3,4],13011,""],
    [1175,"阿特羅斯的巨劍","Atlas Weapon","武器","爆擊",["MINI 獸牙怪 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],1175,""],
    [2305,"冒險衣","Adventurer's Suit","護甲","移動速度",["一般怪 殭屍 · 斐揚洞穴（一周目 T2）"],[0,0,1,1,2],2305,""],
    [2306,"冒險衣","Adventurer's Suit","護甲","移動速度",["一般怪 沙漠幼狼 · 普隆德拉原野（一周目 T1）"],[0,0,1,1,2],2306,""],
    [1827,"勇士升龍拳套","Glorious Fist","武器","對首領傷害",["MINI 嗜血怪人 · 尼芙菲姆原野（一周目 T6）"],[0,1,2,3,4],1827,""],
    [13110,"勇士左輪手槍","Glorious Pistol","武器","對首領傷害",["一般怪 南瓜魂 · 尼芙菲姆原野（一周目 T6）"],[0,1,2,3,4],13110,""],
    [1927,"勇士吉他","Glorious Guitar","武器","對首領傷害",["MINI 銀月魔女 · 尼芙菲姆原野（一周目 T6）"],[0,1,2,3,4],1927,""],
    [13176,"勇士來福槍","Glorious Rifle","武器","對首領傷害、範圍",["MINI 凱美拉 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],13176,""],
    [13307,"勇士風魔飛鏢","Glorious Shuriken","武器","對首領傷害、詠唱速度",["一般怪 萬聖魔 · 尼芙菲姆原野（一周目 T6）"],[0,1,2,3,4],13307,""],
    [1826,"勇士龍爪拳套","Glorious Claw","武器","對首領傷害",["MINI 深淵騎士 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1826,""],
    [13178,"勇士霰彈槍","Glorious Shotgun","武器","對首領傷害、範圍",["一般怪 兔斯拉 · 尼芙菲姆原野（一周目 T6）"],[0,1,2,3,4],13178,""],
    [1824,"勇氣的戰鬥升龍拳套","Brave Battle Fist","武器","STR",["MINI 黃俄希托斯 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],1824,""],
    [1107,"厚刃劍","Blade","武器","",[],[0,1,2,3,4],1107,""],
    [1108,"厚刃劍","Blade","武器","護甲",["一般怪 浮勒盜蟲 · 普隆德拉地下水道（一周目 T1）"],[0,1,2,3,4],1108,""],
    [2700,"封印的紅色綢緞","Red Silk Seal","飾品","LUK",["BOSS 白素貞 · 元宵燈會（一周目 T3）","BOSS 墨蛇君 · 元宵燈會（一周目 T3）","MINI 蓋俄斯提 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2700,""],
    [1285,"恰克蘭拳刃","Chakram","武器","爆擊",["BOSS 俄塞里斯 · 夢羅克金字塔（一周目 T3）"],[0,1,2,3,4],1285,""],
    [2294,"星星髮夾","Stellar","頭上","最大 HP",["一般怪 cruiser · 聖誕節（一周目 T3）"],[0,0,1,1,2],2294,""],
    [1643,"枯木魔杖","Dead Tree Cane","武器","詠唱速度、INT",["MINI 巨大白幽靈 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],1643,""],
    [13047,"毒鋸短劍","Weihna","武器","對首領傷害",["一般怪 朽魔 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],13047,""],
    [1963,"毒鞭 薔薇","Rapture Rose","武器","持續傷害、暈眩",["一般怪 邪骸戰俘 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1963,""],
    [1262,"洛奇的指甲","Loki's Nail","武器","爆擊、爆擊傷害",["BOSS 巴風特 · 迷宮森林（一周目 T3）"],[0,1,2,3,4],1262,""],
    [1511,"流星錘","Flail","武器","",[],[0,1,2,3,4],1511,""],
    [1957,"流星鞭子","Rante Whip","武器","範圍",["MINI 雪熊 · 迷宮森林（一周目 T3）"],[0,1,2,3,4],1957,""],
    [1422,"狩獵長矛","Hunting Spear","武器","對首領傷害、範圍",["MINI 鴞裊首領 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1422,""],
    [2407,"玻璃鞋","Crystal Pumps","鞋子","減傷",["一般怪 傀儡娃娃 · 吉芬地下迷宮（一周目 T6）"],[0,0,1,1,2],2407,""],
    [1425,"突襲隊長的長矛","Assaulter Spear","武器","STR",["一般怪 鬼娃樹 · 尼芙菲姆原野（一周目 T6）"],[0,1,2,3,4],1425,""],
    [13420,"紅蓮劍","Honglyun's Sword","武器","持續傷害、STR",[],[0,1,2,3,4],13420,"舊版裝備"],
    [2244,"紅蝶髮帶","Big Ribbon","頭上","減傷",["MINI 蛙王 · 普隆德拉原野（一周目 T1）"],[0,0,1,1,2],2244,""],
    [1974,"紅蘿蔔鞭","Carrot Whip","武器","範圍",["一般怪 鬼娃樹 · 尼芙菲姆原野（一周目 T6）"],[0,1,2,3,4],1974,""],
    [13306,"英勇的戰鬥風魔翼飛鏢","Valorous Huuma Front Shuriken","武器","STR",["一般怪 卡利斯格 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],13306,""],
    [2519,"茉莉雅娜斗篷","Morrigane's Manteau","披肩","LUK",["一般怪 鏡妖 · 時計塔地下（一周目 T6）"],[0,0,1,1,2],2519,""],
    [5127,"茉莉雅娜的頭盔","Morrigane's Helm","頭上","LUK",["MINI 三頭龍 · 深淵之湖（一周目 T6）"],[0,0,1,1,2],5127,""],
    [2418,"迪塔樂長靴","Vidar's Boots","鞋子","",[],[0,0,1,1,2],2418,""],
    [2411,"重靴","Greaves","鞋子","護甲",["一般怪 牛頭人 · 夢羅克金字塔（一周目 T3）"],[0,0,1,1,2],2411,""],
    [13151,"風暴來福槍","Cyclone","武器","爆擊",["MINI 哥布靈首領 · 獸人村（一周目 T3）","一般怪 鬼火 · 斐揚洞穴（一周目 T2）"],[0,1,2,3,4],13151,""],
    [13152,"風暴來福槍","Cyclone","武器","投射物速度、爆擊",[],[0,1,2,3,4],13151,"舊版裝備"],
    [13304,"風魔飛鏢 明淨","Huuma Calm Mind","武器","範圍",["一般怪 鐵蠍 · 元宵燈會（一周目 T3）","一般怪 釣魚河童 · 元宵燈會（一周目 T3）","MINI 豬婆龍 · 元宵燈會（一周目 T3）","MINI 卡崙寶寶 · 聖誕節（一周目 T3）"],[0,1,2,3,4],13304,""],
    [13308,"風魔烈焰手裡劍","Huuma Blazing Shuriken","武器","持續傷害、DEX",["MINI 死靈 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],13308,""],
    [13303,"風魔熱火飛鏢","Huuma Blaze Shuriken","武器","持續傷害",["BOSS 獸人英雄 · 獸人村（一周目 T3）"],[0,1,2,3,4],13303,""],
    [13301,"風魔輪飛鏢","Huuma Giant Wheel Shuriken","武器","範圍",["MINI 犬妖首領 · 獸人村（一周目 T3）"],[0,1,2,3,4],13301,""],
    [13302,"風魔輪飛鏢","Huuma Giant Wheel Shuriken","武器","暈眩",["一般怪 邪惡箱 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],13302,""],
    [13300,"風魔翼飛鏢","Huuma Wing Shuriken","武器","移動速度",["MINI 雪熊 · 迷宮森林（一周目 T3）"],[0,1,2,3,4],13300,""],
    [1468,"風靈之矛","Zephyrus","武器","持續傷害、暈眩",["BOSS 冰暴騎士 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1468,""],
    [1556,"風靈之書","Book of Gust of Wind","武器","持續傷害",["一般怪 飛行魔書 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1556,""],
    [1259,"風靈拳刃","Katar of Piercing Wind","武器","持續傷害",["一般怪 裘卡 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1259,""],
    [1813,"風靈拳套","Kaiser Knuckle","武器","低血量效果",["BOSS 俄塞里斯 · 夢羅克金字塔（一周目 T3）"],[0,1,2,3,4],1813,""],
    [5002,"首領冠冕","Jewel Crown","頭上","INT、LUK",["BOSS 迪塔勒泰晤勒斯 · 深淵之湖（一周目 T6）"],[0,0,1,1,2],5002,""],
    [2267,"香菸","Cigarette","頭下","生命恢復",["MINI 犬妖首領 · 獸人村（一周目 T3）"],[0,0,1,1,2],2267,""],
    [5093,"修女的帽子","Coif","頭上","最大 HP、護甲",["BOSS 黑暗之王 · 克雷斯特漢姆修道院（一周目 T6）"],[0,0,1,1,2],5093,""],
    [1413,"剛尼爾長矛","Gungnir","武器","",[],[0,1,2,3,4],1413,"特殊取得"],
    [5128,"哥夫內的頭具","Goibne's Helm","頭上","VIT",["一般怪 黃諾博斯 · 深淵之湖（一周目 T6）"],[0,0,1,1,2],5128,""],
    [2354,"哥夫內的鎧甲","Goibne's Armor","護甲","VIT、最大 HP",["BOSS 迪塔勒泰晤勒斯 · 深淵之湖（一周目 T6）"],[0,0,1,1,2],2354,""],
    [2520,"哥夫內肩飾","Goibne's Spaulders","披肩","減傷",["一般怪 諾博斯 · 深淵之湖（一周目 T6）"],[0,0,1,1,2],2520,""],
    [2419,"哥夫內軍靴","Goibne's Greaves","鞋子","移動速度、護甲",["MINI 雪熊 · 迷宮森林（一周目 T3）"],[0,0,1,1,2],2419,""],
    [2297,"哥布靈面具","Goblin Mask","頭下","最大 HP",["MINI 哥布靈首領 · 獸人村（一周目 T3）"],[0,0,1,1,2],2297,""],
    [1250,"拳刃","Jur","武器","",[],[0,1,2,3,4],1250,""],
    [1252,"拳刃","Katar","武器","",[],[0,1,2,3,4],1252,""],
    [1253,"拳刃","Katar","武器","",[],[0,1,2,3,4],1253,""],
    [5115,"時尚防寒帽","Winter Hat","頭上","減傷",["一般怪 小雪獸 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5115,""],
    [1550,"書","Book","武器","",[],[0,1,2,3,4],1550,""],
    [1128,"海東劍","Haedong Gum","武器","INT",["BOSS 海盜之王 · 失事輪（一周目 T1）"],[0,1,2,3,4],1128,""],
    [1973,"海洋魔女之腳鞭","Sea Witch's Foot","武器","範圍",["一般怪 南瓜魂 · 尼芙菲姆原野（一周目 T6）"],[0,1,2,3,4],1973,""],
    [5019,"海盜船長帽","Corsair","頭上","VIT",["BOSS 海盜之王 · 失事輪（一周目 T1）"],[0,0,1,1,2],5019,""],
    [2287,"海盜頭巾","Pirate Bandana","頭上","STR",["一般怪 邪骸海盜 · 失事輪（一周目 T1）"],[0,0,1,1,2],2287,""],
    [2546,"海灘斗篷","Beach Manteau","披肩","STR、INT",["BOSS 墮落大神官 悉潘 · 尼芙菲姆原野（一周目 T6）"],[0,0,1,1,2],2546,""],
    [1733,"疾風之弓","Gust Bow","武器","投射物速度",["MINI 鴞裊首領 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1733,""],
    [13007,"破刃劍","Jitte","武器","",[],[0,1,2,3,4],13007,""],
    [13008,"破刃劍","Jitte","武器","暈眩",["一般怪 元宵童子 · 元宵燈會（一周目 T3）","一般怪 stone_shooter · 元宵燈會（一周目 T3）","一般怪 釣魚河童 · 元宵燈會（一周目 T3）","MINI 豬婆龍 · 元宵燈會（一周目 T3）"],[0,1,2,3,4],13008,""],
    [1230,"破甲短錐","Ice Pick","武器","爆擊、最大 HP",["BOSS 死靈騎士 · 尼芙菲姆原野（一周目 T6）"],[0,1,2,3,4],1230,""],
    [2000,"破壞之杖","Staff of Destruction","武器","詠唱速度、INT",["MINI 銀月魔女 · 尼芙菲姆原野（一周目 T6）"],[0,1,2,3,4],2000,""],
    [13108,"破壞性的左輪手槍","Soldier Revolver","武器","DEX",["一般怪 諾博斯 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],13108,""],
    [13160,"破壞者榴彈槍","Destroyer","武器","",[],[0,1,2,3,4],13160,""],
    [2619,"神射手套","Bow Thimble","飾品","DEX",["一般怪 goblin_archer · 獸人村（一周目 T3）"],[0,0,1,1,2],2619,""],
    [2001,"神聖十字之杖","Divine Cross","武器","持續傷害、詠唱速度",["MINI 迷幻之王 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],2001,""],
    [1244,"神聖大駒短劍","Holy Dagger","武器","持續傷害、DEX",["一般怪 邪骸戰俘 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1244,""],
    [2251,"神聖之帽","Monk Hat","頭上","",[],[0,0,1,1,2],2251,""],
    [2366,"神聖的衣裳","Divine Cloth","護甲","減傷、護甲",["BOSS 墮落大神官 悉潘 · 尼芙菲姆原野（一周目 T6）"],[0,0,1,1,2],2366,""],
    [1254,"秘刃 闇嘯","Jamadhar","武器","爆擊傷害",["BOSS 俄塞里斯 · 夢羅克金字塔（一周目 T3）"],[0,1,2,3,4],1254,""],
    [2318,"秘衣 美德","Lord's Clothes","護甲","減傷",["MINI 深淵騎士 · 克雷斯特漢姆修道院（一周目 T6）"],[0,0,1,1,2],2318,""],
    [2319,"秘衣 惡德","Glittering Jacket","護甲","減傷",["一般怪 邪骸戰俘 · 克雷斯特漢姆修道院（一周目 T6）"],[0,0,1,1,2],2319,""],
    [1816,"秘拳套 閃光","Berserk Knuckle","武器","急速",["MINI 狂暴大腳熊 · 迷宮森林（一周目 T3）"],[0,1,2,3,4],1816,""],
    [2333,"秘銀之衣","Silver Robe","護甲","詠唱速度",["一般怪 白幽靈 · 失事輪（一周目 T1）、吉芬地下迷宮（一周目 T6）、尼芙菲姆原野（一周目 T6）"],[0,0,1,1,2],2333,""],
    [2342,"秘銀金屬鎧甲","Legion Plate Armor","護甲","護甲、最大 HP",["BOSS 鴞裊男爵 · 時計塔地下（一周目 T6）"],[0,0,1,1,2],2342,""],
    [1525,"秘銀長錘","Long Mace","武器","近戰距離",["BOSS 月夜貓 · 斐揚洞穴（一周目 T2）"],[0,1,2,3,4],1525,""],
    [1964,"秘鞭 眷戀","Chemeti Whip","武器","急速",["BOSS 俄塞里斯 · 夢羅克金字塔（一周目 T3）"],[0,1,2,3,4],1964,""],
    [2250,"粉紗髮圈","Cute Ribbon","頭上","急速",["MINI 月蝕兔 · 普隆德拉原野（一周目 T1）"],[0,0,1,1,2],2250,""],
    [1541,"納米西斯錘","Nemesis","武器","持續傷害、對首領傷害",["MINI 血腥騎士 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1541,""],
    [1269,"茵博斯拳刃","Inverse Scale","武器","持續傷害、範圍",["MINI 黃俄希托斯 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],1269,""],
    [2280,"草帽","Sakkat","頭上","",[],[0,0,1,1,2],2280,""],
    [2270,"草葉","Romantic Leaf","頭下","減傷",["一般怪 群葉貓 · 元宵燈會（一周目 T3）","一般怪 春兔 · 元宵燈會（一周目 T3）","MINI 機木人 · 元宵燈會（一周目 T3）","MINI 邪骸浪人 · 元宵燈會（一周目 T3）"],[0,0,1,1,2],2270,""],
    [13107,"荒野的無法者","Wasteland's Outlaw","武器","投射物速度",["一般怪 鐘怪 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],13107,""],
    [5162,"骨製頭盔","Bone Helm [1]","頭上","最大 HP、護甲",["BOSS 黑暗之王 · 克雷斯特漢姆修道院（一周目 T6）"],[0,0,1,1,2],5162,""],
    [5017,"骨頭頭盔","Bone Helm","頭上","",[],[0,0,1,1,2],5017,""],
    [2422,"高級輕便鞋","High Fashion Sandals","鞋子","減傷",["一般怪 萬聖魔 · 尼芙菲姆原野（一周目 T6）"],[0,0,1,1,2],2422,""],
    [1529,"高爾夫球桿","Iron Driver","武器","暈眩、最大 HP",["BOSS 死靈騎士 · 尼芙菲姆原野（一周目 T6）"],[0,1,2,3,4],1529,""],
    [2272,"停止標誌頭飾","Stop Post","頭上","暈眩",["一般怪 將軍魔碑 · 斐揚森林（一周目 T2）"],[0,0,1,1,2],2272,""],
    [5111,"啤酒企鵝之帽","Galapago Cap","頭上","Zeny",["MINI 蓋俄斯提 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5111,""],
    [2206,"婚禮頭紗","Wedding Veil","頭上","減傷",["一般怪 惡靈 · 克雷斯特漢姆修道院（一周目 T6）"],[0,0,1,1,2],2206,""],
    [2125,"強硬鋼盾","Strong Shield","盾牌","減傷",["MINI 血腥騎士 · 克雷斯特漢姆修道院（一周目 T6）"],[0,0,1,1,2],2125,""],
    [2605,"敏捷別針","Brooch","飾品","AGI",["一般怪 marine_sphere · 柏伊亞嵐島（一周目 T2）","一般怪 九尾狐 · 斐揚森林（一周目 T2）、斐揚洞穴（一周目 T2）"],[0,0,1,1,2],2605,""],
    [2625,"敏捷別針","Brooch","飾品","AGI",[],[0,0,1,1,2],2605,"舊版裝備"],
    [13173,"敏銳的霰彈槍","Soldier Shotgun","武器","DEX",["一般怪 灰俄希托斯 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],13173,""],
    [2296,"望遠鏡","Binoculars","頭中","",[],[0,0,1,1,2],2296,""],
    [2203,"眼鏡","Glasses","頭中","",["一般怪 邪骸獸人 · 夢羅克金字塔（一周目 T3）","一般怪 木乃伊犬 · 夢羅克金字塔（一周目 T3）"],[0,0,1,1,2],2203,""],
    [1207,"笨拙短劍","Main Gauche","武器","迴避",["一般怪 波波利 · 斐揚森林（一周目 T2）、斐揚洞穴（一周目 T2）"],[0,1,2,3,4],1207,""],
    [1208,"笨拙短劍","Main Gauche","武器","迴避",["一般怪 蜂兵 · 普隆德拉原野（一周目 T1）"],[0,1,2,3,4],1208,""],
    [1209,"笨拙短劍","Main Gauche","武器","爆擊、最大 HP",[],[0,1,2,3,4],1207,"舊版裝備"],
    [1962,"細刃鞭子","Lariat Whip","武器","DEX、AGI",["一般怪 黃諾博斯 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],1962,""],
    [1629,"紳士的權杖","Gentleman's Staff","武器","詠唱速度、DEX",["MINI 鴞裊首領 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1629,""],
    [2245,"紳士帽","Sweet Gent","頭上","LUK",["MINI 龍蠅 · 普隆德拉原野（一周目 T1）"],[0,0,1,1,2],2245,""],
    [5024,"蛋糕帽","Cake Hat","頭上","最大 HP",["一般怪 元宵童子 · 元宵燈會（一周目 T3）","一般怪 猴桃木 · 元宵燈會（一周目 T3）","MINI 機木人 · 元宵燈會（一周目 T3）","MINI 小青 · 元宵燈會（一周目 T3）","BOSS 安東尼奧 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5024,""],
    [2501,"連帽披肩","Hood","披肩","",["一般怪 哥布林 · 獸人村（一周目 T3）","一般怪 獸人嬰兒 · 獸人村（一周目 T3）","一般怪 獸人女戰士 · 普隆德拉城（一周目 T2）、獸人村（一周目 T3）","一般怪 木乃伊 · 夢羅克金字塔（一周目 T3）"],[0,0,1,1,2],2501,""],
    [1822,"連擊的套甲","Combo Battle Glove","武器","範圍",["一般怪 夢魘 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],1822,""],
    [1268,"野獸的指甲","Wild Beast Claw","武器","範圍",["一般怪 綠貝勒斯 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],1268,""],
    [2550,"釣客圍巾","Fisher's Muffler","披肩","迴避",["一般怪 雪獸 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2550,""],
    [2426,"陰暗步行長靴","Shadow Walk","鞋子","減傷",["一般怪 夢魘 · 吉芬地下迷宮（一周目 T6）"],[0,0,1,1,2],2426,""],
    [5738,"雪人帽","Snowman Hat","頭上","護甲",["一般怪 雪獸 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5738,""],
    [5441,"雪白髮帶","Snowy Ribbon","頭上","詠唱速度",["一般怪 甜餅人 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5441,""],
    [2284,"鹿角頭飾","Antlers","頭上","最大 HP",["MINI 卡崙寶寶 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2284,""],
    [5141,"傀儡娃娃頭飾","Marionette Doll","頭上","STR",["一般怪 傀儡娃娃 · 吉芬地下迷宮（一周目 T6）"],[0,0,1,1,2],5141,""],
    [2417,"傅里哥長靴","Fricco's Shoes","鞋子","AGI",["一般怪 灰俄希托斯 · 深淵之湖（一周目 T6）"],[0,0,1,1,2],2417,""],
    [2664,"圍巾","Belcarf","飾品","DEX",["MINI 卡崙寶寶 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2664,""],
    [1143,"尋礦之劍","Gaia Sword","武器","STR",["MINI 弒神者 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1143,""],
    [2255,"惡魔髮圈","Evil Wings","頭上","STR",["一般怪 小巴風特 · 迷宮森林（一周目 T3）","BOSS 巴風特 · 迷宮森林（一周目 T3）","MINI 惡魔波利 · 斐揚森林（一周目 T2）、迷宮森林（一周目 T3）"],[0,0,1,1,2],2255,""],
    [22847,"普隆德拉巡邏徽章","Prontera Patrol Badge","飾品","",[],[0,0,1,1,2],22847,""],
    [2602,"智力耳環","Earring","飾品","",["一般怪 伊希斯 · 夢羅克金字塔（一周目 T3）"],[0,0,1,1,2],2602,""],
    [1366,"智天使之斧","Light Epsilon","武器","STR、對首領傷害",["BOSS 獸人英雄 · 獸人村（一周目 T3）"],[0,1,2,3,4],1366,""],
    [2617,"智慧手套","Celebrant's Mitten","飾品","詠唱速度",["一般怪 伊希斯 · 夢羅克金字塔（一周目 T3）"],[0,0,1,1,2],2617,""],
    [1607,"智慧魔杖","Staff","武器","",[],[0,1,2,3,4],1607,""],
    [2302,"棉襯衫","Cotton Shirt","護甲","最大 HP",["一般怪 小雞 · 普隆德拉原野（一周目 T1）"],[0,0,1,1,2],2302,""],
    [1237,"無影之牙","Grimtooth","武器","迴避、爆擊",["BOSS 黑暗之王 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1237,""],
    [2226,"無邊帽","Cap","頭上","護甲",["一般怪 刺尾蜻蜓 · 斐揚森林（一周目 T2）"],[0,0,1,1,2],2226,""],
    [2227,"無邊帽","Cap","頭上","最大 HP",[],[0,0,1,1,2],2226,"舊版裝備"],
    [1918,"琵琶","Oriental Lute","武器","範圍、急速",["BOSS 水晶龍 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],1918,""],
    [1719,"盜賊之弓","Roguemaster's Bow","武器","投射物速度",["一般怪 raydric_archer · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1719,""],
    [2335,"盜賊之衣","Thief Clothes","護甲","",[],[0,0,1,1,2],2335,""],
    [2336,"盜賊之衣","Thief Clothes","護甲","AGI",["MINI 幽靈波利 · 失事輪（一周目 T1）、夢羅克金字塔（一周目 T3）"],[0,0,1,1,2],2336,""],
    [13167,"短口創DD","Gate Keeper-DD","武器","範圍、護甲",["BOSS 水晶龍 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],13167,""],
    [13165,"短卡賓","Jungle Carbine","武器","投射物速度",["一般怪 裘卡 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],13165,""],
    [1201,"短劍","Knife","武器","",[],[0,0,0,0,0],1201,""],
    [1202,"短劍","Knife","武器","急速",["一般怪 波利 · 普隆德拉原野（一周目 T1）"],[0,1,2,3,4],1202,""],
    [2208,"紫蝶髮帶","Ribbon","頭上","",["一般怪 邪骸獸人 · 夢羅克金字塔（一周目 T3）","一般怪 伊希斯 · 夢羅克金字塔（一周目 T3）","一般怪 小巴風特 · 迷宮森林（一周目 T3）"],[0,0,1,1,2],2208,""],
    [2209,"紫蝶髮帶","Ribbon","頭上","減傷",["一般怪 吸血蝙蝠 · 普隆德拉地下水道（一周目 T1）"],[0,0,1,1,2],2209,""],
    [2321,"絲質外袍","Silk Robe","護甲","減傷",["一般怪 克瑞米 · 普隆德拉原野（一周目 T1）"],[0,0,1,1,2],2321,""],
    [2322,"絲質外袍","Silk Robe","護甲","減傷",[],[0,0,1,1,2],2322,"舊版裝備"],
    [5124,"菲力卡的頭箍","Fricca's Circlet","頭上","減傷",["MINI 三頭龍 · 深淵之湖（一周目 T6）"],[0,0,1,1,2],5124,""],
    [1805,"賀勒拳套","Studded Knuckles","武器","",[],[0,1,2,3,4],1805,""],
    [1806,"賀勒拳套","Studded Knuckles","武器","",["MINI 哥布靈首領 · 獸人村（一周目 T3）"],[0,1,2,3,4],1806,""],
    [1370,"超重雙手斧","Doom Slayer","武器","爆擊傷害",["BOSS 俄塞里斯 · 夢羅克金字塔（一周目 T3）"],[0,1,2,3,4],1370,""],
    [2603,"項鍊","Necklace","飾品","VIT",["MINI 海神 · 柏伊亞嵐島（一周目 T2）","MINI 大腳龍蝦 · 柏伊亞嵐島（一周目 T2）","MINI 狂暴月夜貓 · 斐揚洞穴（一周目 T2）"],[0,0,1,1,2],2603,""],
    [2623,"項鍊","Necklace","飾品","VIT",[],[0,0,1,1,2],2603,"舊版裝備"],
    [1524,"黃金之錘","Golden Mace","武器","對首領傷害",["BOSS 黃金蟲 · 普隆德拉地下水道（一周目 T1）"],[0,1,2,3,4],1524,""],
    [13106,"黃金勒克斯手槍","Gold Lux","武器","範圍",["一般怪 玩偶熊 · 聖誕節（一周目 T3）"],[0,1,2,3,4],13106,""],
    [2246,"黃金帽","Golden Gear","頭上","護甲、Zeny",["BOSS 黃金蟲 · 普隆德拉地下水道（一周目 T1）"],[0,0,1,1,2],2246,""],
    [2618,"黑狐頸鏈","Matyr's Leash","飾品","AGI",["MINI 狂暴木乃伊 · 夢羅克金字塔（一周目 T3）"],[0,0,1,1,2],2618,""],
    [13155,"黑玫瑰霰彈槍","Black Rose","武器","範圍",["MINI 哥布靈首領 · 獸人村（一周目 T3）"],[0,1,2,3,4],13155,""],
    [5808,"黑暗巴西里昂冠","Dark Bacilium","頭上","減傷、最大 HP",["BOSS 黑暗之王 · 克雷斯特漢姆修道院（一周目 T6）"],[0,0,1,1,2],5808,""],
    [1636,"黑暗的荊棘骷髏杖","Thorn Staff of Darkness","武器","INT、DEX",["BOSS 德古拉男爵 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],1636,""],
    [13006,"黑龍短劍","Khukri","武器","持續傷害",["MINI 邪骸浪人 · 元宵燈會（一周目 T3）"],[0,1,2,3,4],13006,""],
    [1104,"圓月刀","Falchion","武器","範圍",["一般怪 邪骸海盜 · 失事輪（一周目 T1）"],[0,1,2,3,4],1104,""],
    [1105,"圓月刀","Falchion","武器","範圍",["一般怪 吸血蝙蝠 · 普隆德拉地下水道（一周目 T1）"],[0,1,2,3,4],1105,""],
    [1125,"圓柄馬刀","Ring Pommel Saber","武器","急速",["BOSS 海盜之王 · 失事輪（一周目 T1）"],[0,1,2,3,4],1125,""],
    [2103,"圓盾","Buckler","盾牌","最大 HP",["一般怪 樹精 · 斐揚森林（一周目 T2）"],[0,0,1,1,2],2103,""],
    [2104,"圓盾","Buckler","盾牌","最大 HP",["一般怪 螃蟹 · 柏伊亞嵐島（一周目 T2）","MINI 大腳龍蝦 · 柏伊亞嵐島（一周目 T2）"],[0,0,1,1,2],2104,""],
    [2353,"奧丁的祝福","Odin's Blessing","護甲","",[],[0,0,1,1,2],2353,""],
    [1138,"弒神者","Mysteltainn","武器","",[],[0,1,2,3,4],1138,""],
    [1358,"毀滅之斧","Buster","武器","STR",["MINI 哥布靈首領 · 獸人村（一周目 T3）"],[0,1,2,3,4],1358,""],
    [2268,"煙斗","Pipe","頭下","減傷",["一般怪 獸人腐屍 · 獸人村（一周目 T3）","BOSS 虎王 · 斐揚森林（一周目 T2）"],[0,0,1,1,2],2268,""],
    [5130,"獅子面具","Lion Mask","頭上","減傷",["MINI 紙妖 · 元宵燈會（一周目 T3）"],[0,0,1,1,2],5130,""],
    [5284,"睡蓮王冠","Water Lily Crown","頭上","DEX",["一般怪 春兔 · 元宵燈會（一周目 T3）"],[0,0,1,1,2],5284,""],
    [1528,"聖十字審判","Grand Cross","武器","",[],[0,1,2,3,4],1528,""],
    [1614,"聖杖 英靈","Wand of Occult","武器","INT",["MINI 狂暴木乃伊 · 夢羅克金字塔（一周目 T3）"],[0,1,2,3,4],1614,""],
    [1551,"聖言之書","Bible","武器","INT",["MINI 狂暴大腳熊 · 迷宮森林（一周目 T3）"],[0,1,2,3,4],1551,""],
    [5811,"聖誕老人鬍子","Santa Beard","頭下","生命恢復",["MINI 水靈龜 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5811,""],
    [5381,"聖誕波利帽","Santa Poring Hat","頭上","藥水效果",["一般怪 綠餅人 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5381,""],
    [39045,"聖誕版人面獅身帽","Christmas Sphinx Hat","頭上","減傷",["BOSS 冰暴騎士 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5053,""],
    [39042,"聖誕版力量戒指","Christmas Ring","飾品","STR",["MINI 卡崙寶寶 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2601,""],
    [39002,"聖誕版十字巨劍","Christmas Claymore","武器","範圍",["BOSS 冰暴騎士 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1163,""],
    [39019,"聖誕版弓","Christmas Bow","武器","投射物速度",["一般怪 cruiser · 聖誕節（一周目 T3）"],[0,1,2,3,4],1702,""],
    [39007,"聖誕版切削之斧","Christmas Cleaver","武器","STR",["BOSS 冰暴騎士 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1305,""],
    [39012,"聖誕版日星錘","Christmas Morning Star","武器","暈眩",["MINI 水靈龜 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1513,""],
    [39014,"聖誕版火靈之書","Christmas Book of Blazing Sun","武器","詠唱速度",["一般怪 甜餅人 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1555,""],
    [39026,"聖誕版加立遜手槍","Christmas Garrison","武器","爆擊",["一般怪 cruiser · 聖誕節（一周目 T3）"],[0,1,2,3,4],13104,""],
    [39009,"聖誕版巨人斧","Christmas Giant Axe","武器","暈眩",["一般怪 雪獸 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1387,""],
    [39035,"聖誕版白金鋼盾","Christmas Platinum Shield","盾牌","減傷",["MINI 冰巨人 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2122,""],
    [39023,"聖誕版吉他","Christmas Guitar","武器","詠唱速度",["MINI 水靈龜 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1908,""],
    [39016,"聖誕版羽翼之杖","Christmas Wing Staff","武器","急速",["一般怪 小雪獸 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1616,""],
    [39036,"聖誕版邪骸戰士的斗篷","Christmas Skeleton Manteau","披肩","低血量效果",["MINI 水靈龜 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2511,""],
    [39003,"聖誕版刺針短劍","Christmas Krieg","武器","爆擊",["一般怪 綠餅人 · 聖誕節（一周目 T3）"],[0,1,2,3,4],13046,""],
    [39024,"聖誕版幸運鞭子","Christmas Tail Whip","武器","LUK",["一般怪 玩偶熊 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1958,""],
    [39027,"聖誕版昏暗來福槍","Christmas Dusk Rifle","武器","爆擊傷害",["MINI 卡崙 · 聖誕節（一周目 T3）"],[0,1,2,3,4],13153,""],
    [39043,"聖誕版花戒指","Christmas Flower Ring","飾品","藥水效果",["一般怪 甜餅人 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2612,""],
    [39033,"聖誕版長大衣","Christmas Coat","護甲","生命恢復",["MINI 冰巨人 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2310,""],
    [39004,"聖誕版長柄短劍","Christmas Gladius","武器","AGI",["MINI 卡崙 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1220,""],
    [39010,"聖誕版長戟","Christmas Javelin","武器","投射物速度",["MINI 卡崙寶寶 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1402,""],
    [39006,"聖誕版恰克蘭拳刃","Christmas Chakram","武器","移動速度",["MINI 卡崙寶寶 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1285,""],
    [39025,"聖誕版流星鞭子","Christmas Rante Whip","武器","持續傷害",["MINI 卡崙寶寶 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1957,""],
    [39038,"聖誕版重靴","Christmas Greaves","鞋子","最大 HP",["MINI 冰巨人 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2411,""],
    [39029,"聖誕版風魔輪飛鏢","Christmas Huuma Giant Wheel Shuriken","武器","投射物速度",["MINI 蓋俄斯提 · 聖誕節（一周目 T3）"],[0,1,2,3,4],13301,""],
    [39001,"聖誕版海東劍","Christmas Haedong Gum","武器","急速",["一般怪 聖誕哥布靈 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1128,""],
    [39041,"聖誕版神射手套","Christmas Bow Thimble","飾品","DEX",["MINI 蓋俄斯提 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2619,""],
    [39005,"聖誕版秘刃 闇嘯","Christmas Jamadhar","武器","爆擊傷害",["MINI 蓋俄斯提 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1254,""],
    [39021,"聖誕版秘拳套 閃光","Christmas Berserk Knuckle","武器","移動速度",["一般怪 玩偶熊 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1816,""],
    [39037,"聖誕版連帽披肩","Christmas Hood","披肩","生命恢復",["一般怪 綠餅人 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2501,""],
    [39040,"聖誕版智慧手套","Christmas Celebrant's Mitten","飾品","詠唱速度",["一般怪 邪惡禮盒 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2617,""],
    [39028,"聖誕版黑玫瑰霰彈槍","Christmas Black Rose","武器","範圍",["MINI 卡崙 · 聖誕節（一周目 T3）"],[0,1,2,3,4],13155,""],
    [39008,"聖誕版毀滅之斧","Christmas Buster","武器","對首領傷害",["MINI 冰巨人 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1358,""],
    [39017,"聖誕版聖杖 英靈","Christmas Wand of Occult","武器","範圍",["MINI 蓋俄斯提 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1614,""],
    [39015,"聖誕版聖言之書","Christmas Bible","武器","生命恢復",["MINI 水靈龜 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1551,""],
    [39032,"聖誕版緊身便衣","Christmas Tights","護甲","迴避",["一般怪 小雪獸 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2330,""],
    [39039,"聖誕版輕便鞋","Christmas Sandals","鞋子","移動速度",["一般怪 聖誕哥布靈 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2401,""],
    [39022,"聖誕版豎琴","Christmas Harp","武器","LUK",["一般怪 玩偶熊 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1909,""],
    [39044,"聖誕版獨眼龍眼罩","Christmas Eye Patch","頭中","爆擊",["MINI 蓋俄斯提 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2212,""],
    [39034,"聖誕版鋼盾","Christmas Steel Shield","盾牌","護甲",["一般怪 cruiser · 聖誕節（一周目 T3）"],[0,0,1,1,2],2106,""],
    [39030,"聖誕版鋼鐵鎖子甲","Christmas Chain Mail","護甲","護甲",["MINI 冰巨人 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2314,""],
    [39031,"聖誕版鋼鐵鎧甲","Christmas Full Plate","護甲","最大 HP",["一般怪 雪獸 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2316,""],
    [39020,"聖誕版龍爪拳套","Christmas Claw","武器","爆擊傷害",["MINI 卡崙寶寶 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1809,""],
    [39018,"聖誕版獵人之弓","Christmas Hunter Bow","武器","DEX",["MINI 卡崙 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1718,""],
    [39013,"聖誕版魔錘 安魂曲","Christmas Slash","武器","持續傷害",["一般怪 邪惡禮盒 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1526,""],
    [39011,"聖誕版彎刃長矛","Christmas Guisarme","武器","範圍",["BOSS 冰暴騎士 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1452,""],
    [2636,"聖誕金戒","Gold Christmas Ring","飾品","LUK",["一般怪 綠餅人 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2636,""],
    [2236,"聖誕帽","Santa's Hat","頭上","最大 HP",["BOSS 安東尼奧 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2236,""],
    [2637,"聖誕銀戒","Silver Christmas Ring","飾品","LUK",["一般怪 甜餅人 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2637,""],
    [2323,"聖職之袍","Scapulare","護甲","護甲、最大 HP",[],[0,0,1,1,2],2324,"舊版裝備"],
    [2324,"聖職之袍","Scapulare","護甲","生命恢復",["MINI 天使波利 · 斐揚森林（一周目 T2）"],[0,0,1,1,2],2324,""],
    [2110,"聖耀之盾","Holy Guard","盾牌","對首領傷害",["MINI 狂暴大腳熊 · 迷宮森林（一周目 T3）"],[0,0,1,1,2],2110,""],
    [2408,"腳鍊","Shackles","鞋子","移動速度",["一般怪 腐屍戰俘 · 克雷斯特漢姆修道院（一周目 T6）"],[0,0,1,1,2],2408,""],
    [5136,"路易士聖誕帽","Louise's Santa Hat","頭上","LUK",["BOSS 安東尼奧 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5136,""],
    [5382,"鈴鐺髮帶","Bell Ribbon","頭上","急速",["一般怪 聖誕哥布靈 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5382,""],
    [2788,"鈽鐳耳環","Bradium Earring","飾品","詠唱速度",["一般怪 朽魔 · 時計塔地下（一周目 T6）"],[0,0,1,1,2],2788,""],
    [2790,"鈽鐳別針","Bradium Brooch","飾品","迴避",["一般怪 鐘怪 · 時計塔地下（一周目 T6）"],[0,0,1,1,2],2790,""],
    [2364,"隕石鋼鐵鎧甲","Meteo Plate Armor","護甲","減傷",["MINI 無顱武士 · 尼芙菲姆原野（一周目 T6）"],[0,0,1,1,2],2364,""],
    [1530,"雷神之錘","Mjolnir","武器","",[],[0,1,2,3,4],1530,"特殊取得"],
    [2629,"雷神腰帶","Megingjord","飾品","",[],[0,0,1,1,2],2629,"特殊取得"],
    [1820,"雷電拳套","Electric Fist","武器","範圍",["MINI 鐘塔守護者 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1820,""],
    [1913,"電子吉他","Electric Guitar","武器","範圍",["BOSS 俄塞里斯 · 夢羅克金字塔（一周目 T3）"],[0,1,2,3,4],1913,""],
    [1972,"電鰻鞭","Electric Eel","武器","持續傷害、INT",["MINI 巨大白幽靈 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],1972,""],
    [1557,"預言錄","Book of Apocalypse","武器","急速",["BOSS 巴風特 · 迷宮森林（一周目 T3）"],[0,1,2,3,4],1557,""],
    [5226,"夢想升空竹蜻蜓","Mini Propeller","頭上","AGI",["一般怪 stone_shooter · 元宵燈會（一周目 T3）"],[0,0,1,1,2],5226,""],
    [2220,"漁夫帽","Hat","頭上","最大 HP",["一般怪 魔菇 · 斐揚森林（一周目 T2）"],[0,0,1,1,2],2220,""],
    [2221,"漁夫帽","Hat","頭上","最大 HP",["一般怪 毒魔菇 · 斐揚森林（一周目 T2）"],[0,0,1,1,2],2221,""],
    [5030,"熊貓帽","Panda Hat","頭上","最大 HP",["一般怪 群葉貓 · 元宵燈會（一周目 T3）"],[0,0,1,1,2],5030,""],
    [1478,"爾休披斯槍","Ahlspiess","武器","對首領傷害、範圍",["BOSS 迪塔勒泰晤勒斯 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],1478,""],
    [2718,"瘋兔別針","Lunatic Brooch","飾品","LUK",["MINI 銀月魔女 · 尼芙菲姆原野（一周目 T6）"],[0,0,1,1,2],2718,""],
    [1561,"精裝之書","Hardcover Book","武器","STR、DEX",["BOSS 水晶龍 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],1561,""],
    [1829,"精製升龍拳套","Refined Fist","武器","對首領傷害",["一般怪 腐屍戰俘 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1829,""],
    [13309,"精製風魔輪飛鏢","Refined Huuma Giant Wheel","武器","對首領傷害",["MINI 行刑者 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],13309,""],
    [1817,"精製風靈拳套","Refined Kaiser Knuckle","武器","持續傷害、對首領傷害",["一般怪 飛行魔書 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1817,""],
    [2286,"精靈耳","Elven Ears","頭中","DEX",["一般怪 紅蝙蝠 · 普隆德拉地下水道（一周目 T1）、吉芬地下迷宮（一周目 T6）"],[0,0,1,1,2],2286,""],
    [2330,"緊身便衣","Tights","護甲","迴避",["一般怪 木乃伊 · 夢羅克金字塔（一周目 T3）"],[0,0,1,1,2],2330,""],
    [2331,"緊身便衣","Tights","護甲","DEX",["一般怪 南瓜先生 · 吉芬地下迷宮（一周目 T6）"],[0,0,1,1,2],2331,""],
    [2401,"輕便鞋","Sandals","鞋子","",["一般怪 狗頭人 · 獸人村（一周目 T3）","一般怪 orc_archer · 獸人村（一周目 T3）","一般怪 獸人女戰士 · 普隆德拉城（一周目 T2）、獸人村（一周目 T3）","一般怪 黑狐 · 夢羅克金字塔（一周目 T3）"],[0,0,1,1,2],2401,""],
    [2611,"銀戒指","Silver Ring","飾品","",["MINI 狂暴木乃伊 · 夢羅克金字塔（一周目 T3）"],[0,0,1,1,2],2611,""],
    [5152,"鳳冠","Chinese Crown","頭上","減傷",["一般怪 猴桃木 · 元宵燈會（一周目 T3）"],[0,0,1,1,2],5152,""],
    [1229,"廚刀","Kitchen Knife","武器","爆擊、Zeny",["MINI 嗜血怪人 · 尼芙菲姆原野（一周目 T6）"],[0,1,2,3,4],1229,""],
    [1210,"德克短劍","Dirk","武器","",[],[0,1,2,3,4],1210,""],
    [1211,"德克短劍","Dirk","武器","爆擊",["一般怪 聖誕哥布靈 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1211,""],
    [1460,"德瑞尹長戟","Trident","武器","範圍",["一般怪 人魚士兵 · 柏伊亞嵐島（一周目 T2）","MINI 海神 · 柏伊亞嵐島（一周目 T2）","BOSS 魔鬼大烏賊 · 柏伊亞嵐島（一周目 T2）"],[0,1,2,3,4],1460,""],
    [1461,"德瑞尹長戟","Trident","武器","範圍、最大 HP",[],[0,1,2,3,4],1460,"舊版裝備"],
    [5113,"憤怒的嘴","Angry Snarl","頭下","爆擊傷害",["MINI 哥布靈首領 · 獸人村（一周目 T3）"],[0,0,1,1,2],5113,""],
    [2648,"摩菲斯戒指","Morpheus's Ring","飾品","INT、LUK",["BOSS 迪塔勒泰晤勒斯 · 深淵之湖（一周目 T6）"],[0,0,1,1,2],2648,""],
    [5126,"摩菲斯的頭巾","Morpheus's Hood","頭上","INT",["MINI 三頭龍 · 深淵之湖（一周目 T6）"],[0,0,1,1,2],5126,""],
    [2649,"摩菲斯臂環","Morpheus's Bracelet","飾品","INT、LUK",["BOSS 迪塔勒泰晤勒斯 · 深淵之湖（一周目 T6）"],[0,0,1,1,2],2649,""],
    [1646,"暴風雪法杖","La'cryma Stick","武器","INT",["MINI 冰巨人 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1646,""],
    [2399,"暴躁龍內衣","Dragon Vest","護甲","減傷",[],[0,0,1,1,2],2399,"舊版裝備"],
    [2553,"暴躁龍斗篷","Dragon Manteau","披肩","AGI、減傷",[],[0,0,1,1,2],2553,"舊版裝備"],
    [1484,"樞機長槍","Cardo","武器","護甲",["一般怪 綠貝勒斯 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],1484,""],
    [2365,"歐羅萊昂的制服","Orleans's Gown","護甲","詠唱速度、護甲",["BOSS 墮落大神官 悉潘 · 尼芙菲姆原野（一周目 T6）"],[0,0,1,1,2],2365,""],
    [1548,"熟練者之錘","Veteran Hammer","武器","藥水效果",["MINI 無顱武士 · 尼芙菲姆原野（一周目 T6）"],[0,1,2,3,4],1548,""],
    [5302,"蓮花帽子","Flower Lily","頭上","最大 HP",["一般怪 釣魚河童 · 元宵燈會（一周目 T3）"],[0,0,1,1,2],5302,""],
    [2291,"蝴蝶面具","Butterfly Mask","頭中","",[],[0,0,1,1,2],2291,""],
    [1909,"豎琴","Harp","武器","急速",["MINI 狂暴木乃伊 · 夢羅克金字塔（一周目 T3）"],[0,1,2,3,4],1909,""],
    [1926,"豬籠草之豎琴","Harp of Nepenthes","武器","INT",["MINI 迷幻之王 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1926,""],
    [1560,"賢者的日記","Sage's Diary","武器","詠唱速度",["一般怪 dragon_egg · 深淵之湖（一周目 T6）"],[0,1,2,3,4],1560,""],
    [1626,"銳利波之杖","Piercing Staff","武器","INT",["一般怪 bathory · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1626,""],
    [1637,"銷魂杖","Eraser","武器","詠唱速度、INT",["BOSS 德古拉男爵 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],1637,""],
    [2609,"骷髏戒指","Skull Ring","飾品","低血量效果",["一般怪 邪骸戰士 · 斐揚洞穴（一周目 T2）、夢羅克金字塔（一周目 T3）"],[0,0,1,1,2],2609,""],
    [2715,"骷髏戒指","Skull Ring","飾品","減傷",[],[0,0,1,1,2],2609,"舊版裝備"],
    [1615,"骷髏魔杖","Evil Bone Wand","武器","持續傷害",["MINI 狂暴木乃伊 · 夢羅克金字塔（一周目 T3）"],[0,1,2,3,4],1615,""],
    [2607,"髮夾","Clip","飾品","急速",["MINI 龍蠅 · 普隆德拉原野（一周目 T1）","一般怪 水母 · 失事輪（一周目 T1）","一般怪 人魚 · 柏伊亞嵐島（一周目 T2）"],[0,0,1,1,2],2607,""],
    [2210,"髮箍","Hairband","頭上","",["一般怪 哥布林 · 獸人村（一周目 T3）","一般怪 goblin_archer · 獸人村（一周目 T3）","一般怪 獸人戰士 · 普隆德拉城（一周目 T2）、獸人村（一周目 T3）"],[0,0,1,1,2],2210,""],
    [1905,"魯特琴","Lute","武器","",[],[0,1,2,3,4],1905,""],
    [5742,"魯道夫的聖誕帽","Rudolph Santa Hat","頭上","AGI",["MINI 卡崙 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5742,""],
    [5204,"魯道夫麋鹿鼻","Rudolph's Nose","頭下","移動速度",["一般怪 小雪獸 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5204,""],
    [5012,"學士帽","Ph.D Hat","頭上","",[],[0,0,1,1,2],5012,""],
    [2405,"戰士長靴","Boots","鞋子","護甲",["一般怪 庫克雷 · 失事輪（一周目 T1）"],[0,0,1,1,2],2405,""],
    [2406,"戰士長靴","Boots","鞋子","護甲",["一般怪 penomena · 失事輪（一周目 T1）","MINI 妖君 · 斐揚洞穴（一周目 T2）"],[0,0,1,1,2],2406,""],
    [13305,"戰鬥風魔翼飛鏢","Brave Huuma Front Shuriken","武器","STR",["MINI 黃俄希托斯 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],13305,""],
    [1228,"戰鬥短劍","Combat Knife","武器","",[],[0,1,2,3,4],1228,""],
    [1421,"戰鬥鉤槍","Battle Hook","武器","暈眩、對首領傷害",["MINI 深淵騎士 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1421,""],
    [13170,"操作桿來福槍","Lever Action Rifle","武器","投射物速度、爆擊",["BOSS 德古拉男爵 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],13170,""],
    [2288,"整人面具","Mr. Scream","頭下","暈眩",["一般怪 白鼠 · 普隆德拉地下水道（一周目 T1）"],[0,0,1,1,2],2288,""],
    [1604,"橡木魔杖","Wand","武器","INT",["一般怪 水母 · 失事輪（一周目 T1）"],[0,1,2,3,4],1604,""],
    [1720,"熾天使之弓","Rudra Bow","武器","持續傷害、INT",["BOSS 安東尼奧 · 聖誕節（一周目 T3）"],[0,1,2,3,4],1720,""],
    [1730,"燃燒之弓","Burning Bow","武器","減傷",["MINI 紅貝勒斯 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],1730,""],
    [2212,"獨眼龍眼罩","Eye Patch","頭中","爆擊",["一般怪 腐屍 · 斐揚洞穴（一周目 T2）、夢羅克金字塔（一周目 T3）"],[0,0,1,1,2],2212,""],
    [2213,"貓耳髮圈","Kitty Band","頭上","移動速度",["一般怪 浣熊 · 斐揚森林（一周目 T2）"],[0,0,1,1,2],2213,""],
    [5051,"貓貓鈴鐺","Pussy Cat Bell","頭下","生命恢復",["一般怪 邪惡禮盒 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5051,""],
    [2106,"鋼盾","Steel Shield","盾牌","減傷",["BOSS 獸人英雄 · 獸人村（一周目 T3）"],[0,0,1,1,2],2106,""],
    [2292,"鋼鐵面具","Welding Mask","頭下","減傷",["MINI 撕咬塔羅鼠 · 普隆德拉地下水道（一周目 T1）","MINI 瘟疫塔羅鼠 · 普隆德拉地下水道（一周目 T1）","MINI 鑽地塔羅鼠 · 普隆德拉地下水道（一周目 T1）"],[0,0,1,1,2],2292,""],
    [1803,"鋼鐵拳套","Knuckle Dusters","武器","",[],[0,1,2,3,4],1803,""],
    [2314,"鋼鐵鎖子甲","Chain Mail","護甲","最大 HP",["一般怪 狗頭人 · 獸人村（一周目 T3）","一般怪 獸人戰士 · 普隆德拉城（一周目 T2）、獸人村（一周目 T3）"],[0,0,1,1,2],2314,""],
    [2315,"鋼鐵鎖子甲","Chain Mail","護甲","護甲",["一般怪 幽靈劍士 · 克雷斯特漢姆修道院（一周目 T6）"],[0,0,1,1,2],2315,""],
    [2316,"鋼鐵鎧甲","Full Plate","護甲","護甲",["一般怪 獸人腐屍 · 獸人村（一周目 T3）"],[0,0,1,1,2],2316,""],
    [2317,"鋼鐵鎧甲","Full Plate","護甲","護甲",["MINI 死靈 · 吉芬地下迷宮（一周目 T6）"],[0,0,1,1,2],2317,""],
    [1954,"鋼鐵鞭子","Wire Whip","武器","",[],[0,1,2,3,4],1954,""],
    [1260,"骸靈拳刃","Sharpened Legbone of Ghoul","武器","持續傷害",["MINI 狂暴木乃伊 · 夢羅克金字塔（一周目 T3）"],[0,1,2,3,4],1260,""],
    [1809,"龍爪拳套","Claw","武器","暈眩",["MINI 狂暴大腳熊 · 迷宮森林（一周目 T3）"],[0,1,2,3,4],1809,""],
    [1810,"龍爪拳套","Claw","武器","STR",["MINI 豬婆龍 · 元宵燈會（一周目 T3）"],[0,1,2,3,4],1810,""],
    [1166,"龍牙劍","Dragon Slayer","武器","對首領傷害",[],[0,1,2,3,4],1166,"舊版裝備"],
    [2527,"龍的呼吸","Dragon Breath [1]","披肩","減傷",[],[0,0,1,1,2],2527,"舊版裝備"],
    [5292,"龍的骷髏","Dragon Skull","頭上","減傷",["BOSS 墨蛇君 · 元宵燈會（一周目 T3）"],[0,0,1,1,2],5292,""],
    [2762,"龍騎兵之戒","Dragon Ring","飾品","LUK",["BOSS 白素貞 · 元宵燈會（一周目 T3）"],[0,0,1,1,2],2762,""],
    [2526,"龍鱗外套","Coat of Dragon Scale","披肩","迴避",[],[0,0,1,1,2],2526,"舊版裝備"],
    [1110,"擊刺長劍","Rapier","武器","",[],[0,1,2,3,4],1110,""],
    [1111,"擊刺長劍","Rapier","武器","STR",["MINI 行刑者 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1111,""],
    [2264,"殭屍帽","Munak Hat","頭上","減傷",["一般怪 殭屍 · 斐揚洞穴（一周目 T2）"],[0,0,1,1,2],2264,""],
    [5167,"殭屍帽","Munak Hat","頭上","減傷",[],[0,0,1,1,2],2264,"舊版裝備"],
    [2289,"糞便帽","Poo Poo Hat","頭上","減傷",["一般怪 大腳熊 · 斐揚森林（一周目 T2）"],[0,0,1,1,2],2289,""],
    [2513,"薄紗圍巾","Heavenly Maiden Robe","披肩","迴避",["一般怪 猴桃木 · 元宵燈會（一周目 T3）","MINI 小青 · 元宵燈會（一周目 T3）","BOSS 白素貞 · 元宵燈會（一周目 T3）","MINI 水靈龜 · 聖誕節（一周目 T3）"],[0,0,1,1,2],2513,""],
    [2109,"謊言紀錄本","Memory Book","盾牌","INT",["MINI 鐘塔守護者 · 時計塔地下（一周目 T6）"],[0,0,1,1,2],2109,""],
    [1523,"闇盲之錘","Spike","武器","爆擊",["一般怪 鐵蠍 · 元宵燈會（一周目 T3）","MINI 機木人 · 元宵燈會（一周目 T3）"],[0,1,2,3,4],1523,""],
    [13103,"鮮紅閃電手槍","Crimson Bolt","武器","爆擊",["MINI 哥布靈首領 · 獸人村（一周目 T3）"],[0,1,2,3,4],13103,""],
    [1718,"獵人之弓","Hunter Bow","武器","DEX",["MINI 犬妖首領 · 獸人村（一周目 T3）"],[0,1,2,3,4],1718,""],
    [1745,"獵鷹閃電弓","Falken Blitz","武器","範圍、投射物速度",["BOSS 鴞裊男爵 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1745,""],
    [1458,"雙刃長戟","Partizan","武器","範圍",["一般怪 小惡魔 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],1458,""],
    [1216,"雙刃短劍","Stiletto","武器","爆擊",["一般怪 邪骸士兵 · 斐揚洞穴（一周目 T2）、夢羅克金字塔（一周目 T3）"],[0,1,2,3,4],1216,""],
    [1217,"雙刃短劍","Stiletto","武器","爆擊",["一般怪 鬼女 · 斐揚洞穴（一周目 T2）"],[0,1,2,3,4],1217,""],
    [1218,"雙刃短劍","Stiletto","武器","爆擊",[],[0,1,2,3,4],1216,"舊版裝備"],
    [1158,"雙手巨劍","Two-Handed Sword","武器","對首領傷害",["一般怪 幽靈劍士 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1158,""],
    [1162,"雙手重劍","Broad Sword","武器","對首領傷害",["MINI 死靈 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],1162,""],
    [1152,"雙手劍","Slayer","武器","",[],[0,1,2,3,4],1152,""],
    [5384,"雙絨球聖誕帽","Twin Pom Santa Hat","頭上","減傷",["BOSS 冰暴騎士 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5384,""],
    [1411,"騎士長矛","Lance","武器","範圍",["MINI 死靈 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],1411,""],
    [1126,"騎兵之劍","Saber","武器","",[],[0,1,2,3,4],1126,""],
    [1127,"騎兵之劍","Saber","武器","移動速度",["BOSS 海盜之王 · 失事輪（一周目 T1）"],[0,1,2,3,4],1127,""],
    [2529,"騎乘之徽章","Rider Insignia","披肩","AGI",["一般怪 假面鬼 · 尼芙菲姆原野（一周目 T6）"],[0,0,1,1,2],2529,""],
    [2616,"爆擊戒指","Critical Ring","飾品","爆擊",["一般怪 藍鼠 · 普隆德拉地下水道（一周目 T1）"],[0,0,1,1,2],2616,""],
    [1124,"獸人刀","Orcish Sword","武器","STR",["BOSS 獸人英雄 · 獸人村（一周目 T3）"],[0,1,2,3,4],1124,""],
    [1734,"獸人弓箭手之弓","Orc Archer Bow","武器","爆擊",["BOSS 獸人英雄 · 獸人村（一周目 T3）"],[0,1,2,3,4],1734,""],
    [1304,"獸人斧","Orcish Axe","武器","",[],[0,1,2,3,4],1304,""],
    [1309,"獸人斧","Orcish Axe","武器","",[],[0,1,2,3,4],1309,""],
    [2299,"獸人頭盔","Orc Helm","頭上","護甲",["一般怪 獸人嬰兒 · 獸人村（一周目 T3）"],[0,0,1,1,2],2299,""],
    [2257,"獸角頭飾","Unicorn Horn","頭上","生命恢復",["BOSS 波利之王 · 普隆德拉原野（一周目 T1）","一般怪 異變魚 · 失事輪（一周目 T1）"],[0,0,1,1,2],2257,""],
    [1950,"繩鞭","Rope","武器","",[],[0,1,2,3,4],1950,""],
    [1519,"鏈錘","Chain","武器","暈眩",["MINI 雪熊 · 迷宮森林（一周目 T3）"],[0,1,2,3,4],1519,""],
    [1520,"鏈錘","Chain","武器","暈眩",["一般怪 傀儡娃娃 · 吉芬地下迷宮（一周目 T6）"],[0,1,2,3,4],1520,""],
    [2107,"鏡盾","Mirror Shield","盾牌","減傷",["一般怪 鬼火 · 斐揚洞穴（一周目 T2）"],[0,0,1,1,2],2107,""],
    [2108,"鏡盾","Mirror Shield","盾牌","減傷",[],[0,0,1,1,2],2107,"舊版裝備"],
    [5531,"寶寶龍帽子","Baby Dragon Hat","頭上","DEX",["MINI 豬婆龍 · 元宵燈會（一周目 T3）"],[0,0,1,1,2],5531,""],
    [2285,"蘋果頭飾","Apple of Archer","頭上","DEX",["一般怪 skel_archer · 斐揚洞穴（一周目 T2）、夢羅克金字塔（一周目 T3）"],[0,0,1,1,2],2285,""],
    [2298,"觸角頭飾","Green Feeler","頭上","拾取範圍",["一般怪 搖滾蝗蟲 · 普隆德拉原野（一周目 T1）"],[0,0,1,1,2],2298,""],
    [5028,"蠟燭頭飾","Candle","頭上","最大 HP",["一般怪 綠餅人 · 聖誕節（一周目 T3）"],[0,0,1,1,2],5028,""],
    [2277,"護士帽","Nurse Cap","頭上","藥水效果",["一般怪 鬼女 · 斐揚洞穴（一周目 T2）"],[0,0,1,1,2],2277,""],
    [1417,"鐮戟","Pole Axe","武器","STR、INT",["BOSS 迪塔勒泰晤勒斯 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],1417,""],
    [2102,"鐵盾","Guard","盾牌","護甲",["一般怪 波利 · 普隆德拉原野（一周目 T1）","一般怪 蟲蛹 · 普隆德拉原野（一周目 T1）","一般怪 大嘴鳥蛋 · 普隆德拉原野（一周目 T1）","一般怪 thief_bug_egg · 普隆德拉地下水道（一周目 T1）","一般怪 卡那多斯 · 柏伊亞嵐島（一周目 T2）"],[0,0,1,1,2],2102,""],
    [1504,"鐵錘","Mace","武器","",[],[0,1,2,3,4],1504,""],
    [1505,"鐵錘","Mace","武器","爆擊傷害",["一般怪 邪骸戰士 · 斐揚洞穴（一周目 T2）、夢羅克金字塔（一周目 T3）"],[0,1,2,3,4],1505,""],
    [1506,"鐵錘","Mace","武器","暈眩",[],[0,1,2,3,4],1505,"舊版裝備"],
    [1355,"鐵鎚","Hammer","武器","",[],[0,1,2,3,4],1355,""],
    [1544,"露娜平底鍋","Lunakaligo","武器","STR",["一般怪 卡利斯格 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1544,""],
    [2537,"魔王的斗篷","Diabolus Manteau","披肩","減傷",["MINI 銀月魔女 · 尼芙菲姆原野（一周目 T6）"],[0,0,1,1,2],2537,""],
    [2374,"魔王的外袍","Diabolus Robe","護甲","減傷",["一般怪 綠腐屍 · 吉芬地下迷宮（一周目 T6）"],[0,0,1,1,2],2374,""],
    [2375,"魔王的鎧甲","Diabolus Armor","護甲","STR、DEX",["BOSS 德古拉男爵 · 吉芬地下迷宮（一周目 T6）"],[0,0,1,1,2],2375,""],
    [2334,"魔法外套","Mage Coat","護甲","減傷、INT",["BOSS 黑暗之王 · 克雷斯特漢姆修道院（一周目 T6）"],[0,0,1,1,2],2334,""],
    [2252,"魔法帽","Wizard Hat","頭上","",[],[0,0,1,1,2],2252,""],
    [1572,"魔法經典","Principles of Magic","武器","詠唱速度",["MINI 迷幻之王 · 克雷斯特漢姆修道院（一周目 T6）"],[0,1,2,3,4],1572,""],
    [5045,"魔術師帽","Magician Hat","頭上","DEX",["MINI 鴞裊首領 · 時計塔地下（一周目 T6）"],[0,0,1,1,2],5045,""],
    [5122,"魔術無邊帽","Magni's Cap","頭上","STR",["MINI 紅貝勒斯 · 深淵之湖（一周目 T6）"],[0,0,1,1,2],5122,""],
    [1526,"魔錘 安魂曲","Slash","武器","對首領傷害",["BOSS 巴風特 · 迷宮森林（一周目 T3）"],[0,1,2,3,4],1526,""],
    [1114,"彎刀","Scimitar","武器","STR",["MINI 行刑者 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1114,""],
    [1452,"彎刃長矛","Guisarme","武器","",["一般怪 狗頭人 · 獸人村（一周目 T3）","一般怪 牛頭人 · 夢羅克金字塔（一周目 T3）","一般怪 狂暴螳螂 · 迷宮森林（一周目 T3）"],[0,1,2,3,4],1452,""],
    [2423,"變形長靴","Variant Shoes","鞋子","護甲、移動速度",["BOSS 死靈騎士 · 尼芙菲姆原野（一周目 T6）"],[0,0,1,1,2],2423,""],
    [1472,"靈魂之杖","Soul Staff","武器","INT、AGI",["BOSS 鴞裊男爵 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],1472,""],
    [1812,"鷹爪拳套","Finger","武器","",[],[0,1,2,3,4],1812,""],
    [1270,"鑽孔機拳刃","Drill Katar","武器","投射物速度、範圍",["一般怪 狂暴邪惡箱 · 深淵之湖（一周目 T6）"],[0,1,2,3,4],1270,""],
    [13169,"Thunder P","Thunder P","武器","急速、最大 HP",["BOSS 鴞裊男爵 · 時計塔地下（一周目 T6）"],[0,1,2,3,4],13169,""]
  ];
  const selectableStorageGear = storageGearCatalog.filter(item => !item[8].includes("舊版裝備"));
  const storageGearById = new Map(selectableStorageGear.map(item => [item[0],item]));
  const storageTier = rank => Number.isSafeInteger(rank) && rank >= 0 ? rank : 8;
  const storageAffixes = {
    ...inventoryTerms, "護甲":/護甲|\barmor\b|armadura/i,
    "迴避":/迴避|\bflee\b|evasión/i, "物理穿透":/物理穿透|穿透|perforación|\bpierce\b/i,
    "技能傷害":/(?!)/
  };
  const targetStorageButton = document.createElement("button");
  targetStorageButton.type = "button";
  let targetStorageRules = new Map();
  function loadTargetStorage() {
    let stored;
    try { stored = JSON.parse(localStorage.getItem(settingKey("ro-helper-target-storage")) ?? localStorage.getItem(settingKey("ro-helper-target-pickup")) ?? "null"); } catch {}
    targetStorageRules = new Map();
    if (Array.isArray(stored?.rules)) {
      for (const entry of stored.rules) {
        if (!Array.isArray(entry) || !storageGearById.has(entry[0]) || !Array.isArray(entry[1])) continue;
        targetStorageRules.set(entry[0],{terms:entry[1].filter(term => Object.hasOwn(storageAffixes,term)),
          page:Number.isInteger(entry[2]) && entry[2] >= 0 && entry[2] <= 6 ? entry[2] : 0,
          quality:storageQuality(entry[3]),tier:storageTier(entry[4]),alternatives:readStorageAlternatives(entry[5]),action:entry[6]==="sell"?"sell":"store"});
      }
    }
    const enabled = taiwanGame && stored?.enabled === true && targetStorageRules.size > 0;
    targetStorageButton.textContent = enabled ? "指定存倉：" + targetStorageRules.size + " 件" : "指定存倉：關";

    if (!enabled) targetStorageRules.clear();
  }
  function readStorageAlternatives(entries) {
    if (entries === undefined) return [];
    if (!Array.isArray(entries) || entries.length > 20) throw Error("存倉分流格式錯誤");
    return entries.map(entry=>{
      if (!Array.isArray(entry) || entry.length !== 4) throw Error("存倉分流格式錯誤");
      const [terms,page,quality,tier] = entry;
      if (!Array.isArray(terms) || terms.length > 50 || terms.some(term=>typeof term!=="string" || !Object.hasOwn(storageAffixes,term)) ||
          !Number.isInteger(page) || page<0 || page>6 || !Number.isInteger(quality) || quality<0 || quality>=inventoryQualities.length ||
          !Number.isSafeInteger(tier) || tier<0 || tier>99) throw Error("存倉分流條件無效");
      return {terms,page,quality,tier};
    });
  }
  function storageRuleEntry(id,rule) {
    const entry=[id,[...rule.terms],rule.page,rule.quality,rule.tier];
    if (rule.alternatives?.length || rule.action==="sell") entry.push((rule.alternatives || []).map(r=>[[...r.terms],r.page,r.quality,r.tier]));
    if(rule.action==="sell")entry.push("sell");
    return entry;
  }
  function selectTargetStorageRule(rule,effects,tier,quality) {
    if (!rule || rule.ambiguous || rule.action==="sell") return null;
    return [rule,...rule.alternatives || []].find(candidate=>(!candidate.tier || tier>=candidate.tier) && targetStorageMatch(candidate,effects,quality)) || null;
  }
  function targetStorageMatch(rule, effects, quality) {
    return quality >= rule.quality && [...rule.terms].every(term => randomInventoryBonuses(effects).some(line => storageAffixes[term].test(line)));
  }
  function matchesTargetStorage(iconKey, effects, tier, quality) {
    const rule = targetStorageRules.get(Number(/^id:(\d+)$/.exec(iconKey)?.[1]));
    return Boolean(selectTargetStorageRule(rule,effects,tier,quality));
  }
  function storageEquipmentName(name) {
    return name.normalize("NFKC").toLowerCase().trim()
      .replace(/^[+]\d+\s*/,"").replace(/\s*★\s*\d+\s*$/,"")
      .replace(/\s*\([^()]*\)\s*$/,"").replace(/\s+of\s+(?:strength|agility|vitality|intelligence|dexterity|luck)$/i,"")
      .replace(/\s*[·・]?\s*改\s*(?:\d+)?$/,"").replace(/\s*[·・]二章T\d+$/i,"").trim();
  }
  function findTargetStorageRule(tip, itemId) {
    if (!targetStorageRules.size) return undefined;
    if (Number.isSafeInteger(itemId)) return targetStorageRules.get(itemId);
    const title = tip.querySelector(".tip-item b")?.textContent;
    if (!title) return undefined;
    const name = storageEquipmentName(title);
    const source = tip.querySelector(".tip-item img")?.getAttribute("src") || "";
    const icon = Number(source.match(/(?:^|\/)items\/(\d+)(?:_art)?\.png(?:[?#]|$)/i)?.[1]);
    const named = storageGearCatalog.filter(([,zh,en]) => [zh,en].some(label => storageEquipmentName(label) === name));
    const byIcon = storageGearCatalog.filter(item => item[7] === icon);
    const matching = named.filter(item => item[7] === icon);
    const candidates = matching.length ? matching : named.length ? named : byIcon;
    const current = candidates.filter(item => storageGearById.has(item[0]));
    if (current.length === 1 && named.length) return targetStorageRules.get(current[0][0]);
    if (candidates.length === 1) return targetStorageRules.get(candidates[0][0]);
    if (candidates.some(([id]) => targetStorageRules.has(id))) return {ambiguous:true};
  }
  function parseStorageImport(text) {
    const data = JSON.parse(text);
    if (data?.format !== 'ro-helper-target-storage' || data.version !== 1 ||
        typeof data.enabled !== 'boolean' || !Array.isArray(data.rules) || data.rules.length > 2000) {
      throw Error('請選擇指定存倉匯出的設定檔');
    }
    const rules = new Map();
    let skipped = 0;
    for (const entry of data.rules) {
      if (!Array.isArray(entry) || (entry.length !== 5 && entry.length !== 6 && entry.length !== 7)) throw Error('設定檔規則格式錯誤');
      if(entry.length===7&&entry[6]!=="sell"&&entry[6]!=="store")throw Error('設定檔包含無效的處理方式');
      const [id,terms,page,quality,tier] = entry;
      if (!Number.isSafeInteger(id) || !Array.isArray(terms) || terms.length > 50 ||
          terms.some(term => typeof term !== 'string' || !Object.hasOwn(storageAffixes,term)) ||
          !Number.isInteger(page) || page < 0 || page > 6 ||
          !Number.isInteger(quality) || quality < 0 || quality >= inventoryQualities.length ||
          !Number.isSafeInteger(tier) || tier < 0 || tier > 99) throw Error('設定檔包含無效的存倉條件');
      if (!storageGearById.has(id)) { skipped++; continue; }
      rules.set(id,{terms:new Set(terms),page,quality,tier,alternatives:readStorageAlternatives(entry[5]),action:entry[6]==="sell"?"sell":"store"});
    }
    return {enabled:data.enabled,rules,skipped};
  }
  targetStorageButton.onclick = () => {
    if (document.getElementById("ro-helper-target-storage")) return;
    const account = activeAccount;
    let stored;
    try { stored = JSON.parse(localStorage.getItem(settingKey("ro-helper-target-storage")) ?? localStorage.getItem(settingKey("ro-helper-target-pickup")) ?? "null"); } catch {}
    const draft = new Map(Array.isArray(stored?.rules) ? stored.rules.filter(entry =>
      Array.isArray(entry) && storageGearById.has(entry[0]) && Array.isArray(entry[1])).map(([id,terms,page,quality,tier,alternatives,action]) => [id,{terms:new Set(terms),page:page ?? 0,quality:storageQuality(quality),tier:storageTier(tier),alternatives:readStorageAlternatives(alternatives),action:action==="sell"?"sell":"store"}]) : []);
    const dialog = document.createElement("dialog");
    dialog.id = "ro-helper-target-storage";
    dialog.style.cssText = "width:min(630px,94vw);box-sizing:border-box";
    const form = document.createElement("form");
    form.style.cssText = "display:grid;gap:9px";
    const title = document.createElement("strong");
    title.textContent = "指定存倉／強制賣出 · 漢斯裝備圖鑑";
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "搜尋裝備、部位、BOSS、MINI 或首領名稱";
    search.setAttribute("aria-label","搜尋漢斯裝備");
    const checkbox = (label,checked) => {
      const row = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(checked);
      row.append(input," ",label);
      return [row,input];
    };
    const [enabledLabel,enabled] = checkbox("啟用指定存倉",stored ? stored.enabled : true);
    const [selectedLabel,selectedOnly] = checkbox("只顯示已勾選裝備",false);
    const [bossLabel,bossOnly] = checkbox("王裝（BOSS／MINI 掉落）",false);
    const help = document.createElement("small");
    help.textContent = "先勾裝備，再選「指定存倉」或「強制賣出」。強制賣出優先於所有存倉條件，不看詞綴、Tier及品質；穿戴中、已插卡或遊戲保護的裝備不賣。★固定詞條不計入隨機詞綴。整理背包時，符合最低 Tier、品質和隨機詞綴的裝備會存入指定頁。開啟自動賣裝時，未命中的裝備會依整理規則出售。";
    const count = document.createElement("small");
    const list = document.createElement("div");
    list.style.cssText = "display:grid;gap:6px;max-height:52vh;overflow:auto";
    const updateCount = () => { count.textContent = "已勾選 " + draft.size + " 件"; };
    let displayLimit = 50;
    const render = () => {
      const query = search.value.normalize("NFKC").trim().toLowerCase().split(/\s+/).filter(Boolean);
      const entries = selectableStorageGear.filter(([id,name,en,slot,fixed,sources,sockets,,tags]) => {
        if (selectedOnly.checked && !draft.has(id)) return false;
        if (bossOnly.checked && !bossStorageGearIds.has(id)) return false;
        const haystack = [String(id),name,en,slot,fixed,tags,...sources,...new Set(sockets.map(count => count + '洞'))]
          .join(" ").normalize("NFKC").toLowerCase();
        return query.every(term => haystack.includes(term));
      });
      list.replaceChildren(...entries.slice(0,displayLimit).map(([id,name,,slot,fixed,sources,sockets,,tags]) => {
        const card = document.createElement("div");
        card.style.cssText = "border:1px solid #cdd9ef;border-radius:6px;padding:6px;background:#f6f8fd";
        const [row,checked] = checkbox(name + " · " + slot + " · #" + id,draft.has(id));
        const detail = document.createElement("small");
        detail.style.display = "block";
        detail.textContent = [fixed && "★ " + fixed,tags].filter(Boolean).join(" · ");
        const dropSources = document.createElement("div");
        for (const source of sources) {
          const line = document.createElement("small");
          line.style.display = "block";
          line.textContent = source;
          dropSources.append(line);
        }
        const holes = document.createElement("small");
        holes.style.display = "block";
        holes.textContent = sockets.every(n => n === sockets[0]) ? "卡孔 " + sockets[0] :
          "卡孔 " + sockets.map((n,index) => ["白","綠","藍","紫","金"][index] + " " + n).join("／");
        const terms = document.createElement("div");
        terms.style.cssText = "margin-top:5px";
        terms.hidden = !checked.checked;
        const hint = document.createElement("small");
        hint.textContent = "隨機詞綴（可複選） ";
        const pageLabel = document.createElement("label");
        const page = document.createElement("input");
        page.type = "number";
        page.min = "0";
        page.max = "6";
        page.style.width = "4em";
        page.value = String(draft.get(id)?.page ?? 0);
        page.onchange = () => { const rule = draft.get(id); if (rule) rule.page = page.valueAsNumber || 0; };
        pageLabel.append("倉庫頁（0 自動） ",page);
        const rarity = document.createElement("div");
        rarity.append("最低稀有度 ");
        const rarityChoices = ["不限",...inventoryQualities.slice(1)].map((label,rank) => {
          const option = document.createElement("label");
          option.style.cssText = "display:inline-block;margin-right:6px";
          const input = document.createElement("input");
          input.type = "radio";
          input.name = "storage-quality-" + id;
          input.checked = rank === (draft.get(id)?.quality ?? 0);
          input.onchange = () => { const rule = draft.get(id); if (rule && input.checked) rule.quality = rank; };
          option.append(input," ",label);
          rarity.append(option);
          return input;
        });
        const tierLabel = document.createElement("label");
        const tier = document.createElement("input");
        tier.type = "number";
        tier.min = "0";
        tier.style.cssText = "width:4em;margin-left:4px";
        tier.value = String(draft.get(id)?.tier ?? 0);
        tier.onchange = () => { const rule = draft.get(id); if (rule) rule.tier = storageTier(tier.valueAsNumber || 0); };
        tierLabel.append("最低 Tier（0 不限）",tier);
        const actionLabel=document.createElement("label"),action=document.createElement("select");
        action.append(new Option("指定存倉","store"),new Option("強制賣出（不看素質）","sell"));
        action.value=draft.get(id)?.action || "store";
        actionLabel.append("處理方式：",action);terms.append(actionLabel,document.createElement("br"));
        const updateAction=()=>{for(const field of terms.querySelectorAll("input,select"))if(field!==action)field.disabled=action.value==="sell";};
        action.onchange=()=>{const rule=draft.get(id);if(rule)rule.action=action.value;updateAction();};
        terms.append(pageLabel," ",tierLabel,rarity,hint);
        const alternatives = draft.get(id)?.alternatives || [];
        if (alternatives.length) {
          const branchInfo = document.createElement("div");
          branchInfo.textContent = "以上條件優先；未符合時依下列分流：";
          alternatives.forEach((rule,index)=>{
            const row=document.createElement("div");
            row.textContent=(index+1)+". "+(rule.terms.join("＋") || "不限制隨機詞綴")+"、Tier "+rule.tier+" 以上、"+inventoryQualities[rule.quality]+"以上 → 倉庫第 ";
            const input=document.createElement("input");
            input.type="number"; input.min="0"; input.max="6"; input.value=String(rule.page); input.style.width="4em";
            input.onchange=()=>{rule.page=Math.min(6,Math.max(0,Math.trunc(input.valueAsNumber)||0));input.value=String(rule.page);};
            row.append(input," 頁（0 自動）"); branchInfo.append(row);
          });
          terms.append(branchInfo);
        }
        for (const term of Object.keys(storageAffixes).filter(term=>term!=="技能傷害")) {
          const [label,box] = checkbox(term,draft.get(id)?.terms.has(term));
          label.style.cssText = "display:inline-block;margin:2px 6px 2px 0";
          box.onchange = () => {
            const choices = draft.get(id)?.terms;
            if (box.checked) choices?.add(term);
            else choices?.delete(term);
          };
          terms.append(label);
        }
        updateAction();
        checked.onchange = () => {
          if (checked.checked) draft.set(id,{terms:new Set(),page:0,quality:0,tier:0,action:action.value});
          else {
            draft.delete(id);
            page.value = "0";
            tier.value = "0";
            rarityChoices[0].checked = true;
            for (const box of terms.querySelectorAll('input[type="checkbox"]')) box.checked = false;
          }
          terms.hidden = !checked.checked;
          updateCount();
          if (selectedOnly.checked) render();
        };
        card.append(row,detail,dropSources,holes,terms);
        return card;
      }));
      if (!entries.length) list.textContent = "找不到符合條件的裝備";
      if (entries.length > displayLimit) {
        const more = document.createElement("button");
        more.type = "button";
        more.textContent = "顯示更多（已顯示 " + displayLimit + "／" + entries.length + "）";
        more.onclick = () => { const top = list.scrollTop; displayLimit += 50; render(); list.scrollTop = top; };
        list.append(more);
      }
      updateCount();
    };
    search.oninput = selectedOnly.onchange = bossOnly.onchange = () => { displayLimit = 50; render(); list.scrollTop = 0; };
    const transfer = document.createElement("div");
    transfer.style.cssText = "display:flex;gap:6px;flex-wrap:wrap";
    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.textContent = "匯出設定";
    const importButton = document.createElement("button");
    importButton.type = "button";
    importButton.textContent = "匯入設定";
    const importFile = document.createElement("input");
    importFile.type = "file";
    importFile.accept = ".json,application/json";
    importFile.hidden = true;
    const importStatus = document.createElement("small");
    importStatus.setAttribute("role","status");
    exportButton.onclick = () => {
      const data = {format:"ro-helper-target-storage",version:1,enabled:enabled.checked,
        rules:[...draft].map(([id,rule]) => storageRuleEntry(id,rule))};
      try {
        const text = JSON.stringify(data,null,2);
        parseStorageImport(text);
        const url = URL.createObjectURL(new Blob([text],{type:"application/json"}));
        const link = document.createElement("a");
        link.href = url;
        link.download = "RO-指定存倉設定.json";
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url),10000);
        importStatus.textContent = "已匯出目前視窗的設定";
      } catch(error) { importStatus.textContent = error.message; }
    };
    importButton.onclick = () => importFile.click();
    importFile.onchange = async () => {
      const file = importFile.files?.[0];
      importFile.value = "";
      if (!file) return;
      if (file.size > 1024*1024) { importStatus.textContent = "設定檔不能超過 1 MB"; return; }
      try {
        const imported = parseStorageImport(await file.text());
        if (activeAccount !== account || !dialog.isConnected) return;
        draft.clear();
        for (const [id,rule] of imported.rules) draft.set(id,rule);
        enabled.checked = imported.enabled;
        search.value = "";
        selectedOnly.checked = true;
        displayLimit = 50;
        render();
        list.scrollTop = 0;
        importStatus.textContent = "已載入 " + draft.size + " 條規則，取代視窗中的設定；按儲存後生效" +
          (imported.skipped ? "，略過 " + imported.skipped + " 件已移除或未知裝備" : "");
      } catch(error) { importStatus.textContent = "匯入失敗：" + error.message; }
    };
    transfer.append(exportButton,importButton,importFile);
    const save = document.createElement("button");
    save.textContent = "儲存";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "取消";
    cancel.onclick = () => dialog.close();
    form.onsubmit = event => {
      event.preventDefault();
      if (activeAccount !== account) { dialog.close(); return; }
      writeSetting("ro-helper-target-storage",JSON.stringify({
        enabled:enabled.checked,rules:[...draft].map(([id,rule]) => storageRuleEntry(id,rule))
      }));
      loadTargetStorage();
      if (inventoryRun?.done) inventoryRun = undefined;
      refreshLootWindow();
      dialog.close();
    };
    dialog.addEventListener("close",() => dialog.remove(),{once:true});
    const tierGuide = document.createElement("small");
    tierGuide.textContent = "來源旁標的是一周目掉落 Tier。第一章二至六周目為 T4～T8；第二章一、二周目為 T6、T7，三至六周目為 T8。";
    form.append(title,help,tierGuide,transfer,importStatus,enabledLabel,search,bossLabel,selectedLabel,count,list,save,cancel);
    dialog.append(form);
    document.body.append(dialog);
    render();
    dialog.showModal();
  };
  loadTargetStorage();

  // Hans smith automation. Uses the game's own buttons and rechecks each selected row.
  const upgradeButton=document.createElement("button");
  upgradeButton.type="button";upgradeButton.textContent="精煉／升星";
  const upgradeConfig=()=>{try{return JSON.parse(readSetting("ro-helper-upgrade")||"{}")}catch{return {}}};
  function upgradeCandidate(row,config,kind){
    const uid=row?.dataset?.uid,info=row?.querySelector(".cand-info small")?.textContent?.trim()||"";
    if(!uid || !info)return false;
    const worn=/已裝備|穿著中|equipped|equipado/i.test(info);
    // Unknown labels never qualify as an unequipped piece.
    const known=/武器|防具|飾品|盾牌|頭部|護甲|披肩|鞋子|頭飾|頭盔|weapon|armor|armour|shield|head|garment|shoes|accessor|arma|capa|calzado|casco/i.test(info);
    if(worn ? kind==="refine" || !config.starWorn : !known)return false;
    const quality=Number(row.className.match(/\bq([0-4])\b/)?.[1]||0);
    return quality>=Number(config.quality??4);
  }
  upgradeButton.onclick=()=>{
    if(document.getElementById("ro-helper-upgrade-settings"))return;
    const config=upgradeConfig(),dialog=document.createElement("dialog"),form=document.createElement("form");
    dialog.id="ro-helper-upgrade-settings";form.method="dialog";form.style.cssText="display:grid;gap:10px;padding:14px;max-width:420px";
    form.append("漢斯版｜精煉／升星（獨立手動啟動）");
    const controls={};
    const check=(key,label)=>{const input=document.createElement("input");input.type="checkbox";input.checked=!!config[key];controls[key]=input;const row=document.createElement("label");row.append(input," "+label);form.append(row);};
    const number=(key,label,value,min,max)=>{const input=document.createElement("input");input.type="number";input.min=String(min);input.max=String(max);input.step="1";input.value=String(config[key]??value);controls[key]=input;const row=document.createElement("label");row.append(label+" ",input);form.append(row);};
    check("refine","自動精煉（永遠排除穿戴中的裝備）");number("refineTarget","精煉目標 +（全部逐階提升）",4,1,10);
    check("buy","缺少精煉材料時自動購買（只買一般精煉礦石）");number("buyBatch","每次補料購買數量",10,1,500);number("buyLimit","每次處理最多購買總數",30,1,500);
    check("refineRisk","允許精煉失敗碎裝（+5起可能連同卡片消失）");
    check("star","自動升星（材料不足就跳過，不購買）");number("starTarget","升星目標 ★",4,1,10);
    check("starRisk","允許有失敗掉星風險的升星（★5起）");check("starWorn","升星包含穿戴中的裝備（精煉仍排除）");
    const quality=document.createElement("select");for(const [value,label]of [[0,"普通以上"],[1,"優良以上"],[2,"稀有以上"],[3,"紫色以上"],[4,"只處理金色"]])quality.append(new Option(label,value));quality.value=String(config.quality??4);controls.quality=quality;const qr=document.createElement("label");qr.append("處理裝備品質 ",quality);form.append(qr);
    number("tier","最低 Tier（0＝不限）",0,0,999);
    const note=document.createElement("small");note.textContent="會處理符合品質與Tier的背包裝備，按「開始處理」才會精煉／升星，完成後停止；平常掛機不會自動執行。精煉不會處理目前穿戴的裝備；已存倉的裝備不處理。每次補料數量受購買總上限與可用點數限制，依商店按鈕分批買足。只使用遊戲卡普拉點數。";form.append(note);
    const message=document.createElement("div"),save=document.createElement("button"),close=document.createElement("button");save.textContent="儲存";close.type="button";close.textContent="關閉";close.onclick=()=>dialog.close();const start=document.createElement("button"),stop=document.createElement("button");start.textContent="儲存並開始處理";start.dataset.upgradeStart="on";stop.type="button";stop.textContent="停止處理";stop.onclick=()=>{const wasActive=upgradeActive;upgradeActive=false;if(wasActive){for(const id of ["sf-close","smith-close","shop-close"])document.getElementById(id)?.click();}requestLobbyNpc("cancel");message.textContent="已停止精煉／升星；已送出的遊戲操作會完成，不再送出下一次操作";status.textContent="精煉／升星已停止";};form.append(message,save,start,stop,close);
    form.onsubmit=event=>{const next={};for(const [key,input]of Object.entries(controls)){if(input.type==="checkbox")next[key]=input.checked;else{const value=Number(input.value);if(!Number.isSafeInteger(value)||value<Number(input.min||0)||value>Number(input.max||999)){event.preventDefault();message.textContent="請填寫範圍內的整數";return;}next[key]=value;}}if(event.submitter?.dataset.upgradeStart==="on"){
      if(!next.refine&&!next.star){event.preventDefault();message.textContent="請先勾選精煉或升星";return;}
      if(!document.body.classList.contains("in-lobby")){event.preventDefault();message.textContent="請先回到廣場，再開始處理";return;}
      if(upgradeActive){event.preventDefault();message.textContent="正在處理中，請先停止再更改設定";return;}
      writeSetting("ro-helper-upgrade",JSON.stringify(next));upgradeRun=null;upgradeActive=true;status.textContent="開始獨立精煉／升星";
    }else{
      if(upgradeActive){event.preventDefault();message.textContent="正在處理中，請先停止再更改設定";return;}
      writeSetting("ro-helper-upgrade",JSON.stringify(next));status.textContent="已儲存設定；尚未啟動精煉／升星";
    }};
    dialog.append(form);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
  };
  let upgradeRun=null;
  let upgradeActive=false;
  const upgradeTimer=setInterval(()=>{
    if(!upgradeActive)return;
    if(!document.body.classList.contains("in-lobby")){upgradeActive=false;requestLobbyNpc("cancel");status.textContent="已離開廣場，精煉／升星停止";return;}
    runEquipmentUpgrade();
    if(upgradeRun?.done)upgradeActive=false;
  },400);
  window.addEventListener("pagehide",()=>{upgradeActive=false;clearInterval(upgradeTimer);});
  function runEquipmentUpgrade(){
    if(!taiwanGame)return false;
    const lobby=document.body.classList.contains("in-lobby");
    if(!lobby){upgradeRun=null;return false;}
    const config=upgradeConfig();if(!config.refine&&!config.star){upgradeRun=null;return false;}
    if(document.querySelector('dialog[open]'))return true;
    const find=selector=>document.querySelector(selector),now=Date.now();
    let run=upgradeRun;
    if(run?.done)return false;
    if(!run){
      const stage=find('#stages:not(.hidden)');if(stage){stage.querySelector('#stg-close')?.click();return true;}
      if(find('.overlay:not(.hidden)'))return false;
      run=upgradeRun={kind:config.refine?"refine":"star",skip:new Set(),next:0,started:now,uid:null,bought:0,refinePass:1,refinePassed:new Set()};
    }
    const finish=message=>{find('#sf-close')?.click();if(find('#smith:not(.hidden)'))find('#smith-close')?.click();if(find('#shop:not(.hidden)'))find('#shop-close')?.click();requestLobbyNpc('cancel');run.done=true;status.textContent=message;return true;};
    const skip=message=>{run.skip.add(run.kind+":"+run.uid);run.uid=null;run.pending=null;run.confirm=null;run.next=now+300;status.textContent=message;return true;};
    if(now<run.next)return true;
    // Continue until candidates are finished or explicitly skipped; no overall time limit.
    if(run.pending){
      const {node,until,at,kind}=run.pending;
      const detail=find(kind==='star'?'#sf-detail':'#smith-detail'),go=find(kind==='star'?'#sf-go':'#smith-go');
      if(now>until)return skip("強化回應逾時，跳過此件裝備");
      const row=find('#'+(kind==='star'?'sf':'smith')+'-list .cand[data-uid="'+CSS.escape(run.uid)+'"]');
      if(!row){run.pending=null;run.uid=null;return true;}
      const result=detail?.querySelector(kind==='star'?'.sf-msg':'.ref-result')?.textContent?.trim();
      if(now-at<650 || detail?.firstChild===node || (go?.disabled && (!result || result===run.pending.message)))return true;
      // Rotate after every completed attempt, including failures that keep the same level.
      if(kind==='refine'){run.refinePassed.add(run.uid);run.uid=null;}
      run.pending=null;run.next=now+300;return true;
    }
    if(run.confirm){
      const dialog=find('#npc-dialog:not(.hidden)'),row=find('#smith-list .cand.sel');
      if(!row || row.dataset.uid!==run.uid || !upgradeCandidate(row,config,'refine'))return finish("裝備狀態改變，停止自動精煉");
      if(!dialog)return skip("精煉確認未開啟，跳過此件裝備");
      const text=dialog.textContent||'',button=dialog.querySelector('#npc-options button.primary:not(:disabled)');
      if(!config.refineRisk || !/精煉|refin/i.test(text) || !button || !text.includes(run.confirm.name))return finish("精煉確認內容不符，停止本次處理");
      run.confirm=null;run.pending={node:find('#smith-detail')?.firstChild,until:now+20000,at:now,kind:'refine',message:find('#smith-detail .ref-result')?.textContent?.trim()};button.click();return true;
    }
    if(run.buy){
      const shop=find('#shop:not(.hidden)');
      if(!shop){requestLobbyNpc('vendor');status.textContent='前往購買精煉礦石';return true;}
      const tab=shop.querySelector('[data-shop="buy"]');if(!tab?.classList.contains('active')){tab?.click();run.next=now+300;return true;}
      const row=[...shop.querySelectorAll('#shop-buy .ore-row')].find(row=>row.querySelector('.cand-info b')?.textContent.trim()===run.buy.name);
      const quantity=Number((row?.querySelector('.qty-tag')?.textContent||'').replace(/[,，]/g,'').match(/\d+/)?.[0]);
      if(run.buy.clicked){
        if(quantity>=run.buy.before+run.buy.ordered){
          run.buy.remaining-=run.buy.ordered;
          if(run.buy.remaining<=0){find('#shop-close')?.click();run.buy=null;}
          else{run.buy.clicked=false;run.buy.ordered=0;}
          run.next=now+300;return true;
        }
        if(now>run.buy.until){run.buy=null;find('#shop-close')?.click();return skip('精煉材料購買未完成，跳過此件裝備');}
        return true;
      }
      const remaining=Math.min(run.buy.remaining ?? Number(config.buyBatch||10),Number(config.buyLimit||30)-run.bought);
      const buttons=[...(row?.querySelectorAll?.('[data-ore][data-n]') || [])];
      if(!buttons.length){const single=row?.querySelector('[data-ore][data-n="1"]');if(single)buttons.push(single);}
      const button=buttons.filter(button=>!button.disabled && [1010,1011,984,985].includes(Number(button.dataset.ore)) && Number.isSafeInteger(Number(button.dataset.n)) && Number(button.dataset.n)>0 && Number(button.dataset.n)<=remaining)
        .sort((a,b)=>Number(b.dataset.n)-Number(a.dataset.n))[0];
      // Only the four ordinary refine ores can ever be purchased. Never star or reroll ores.
      if(!button || ![1010,1011,984,985].includes(Number(button.dataset.ore)) || button.disabled || run.bought>=Number(config.buyLimit||30) || !Number.isFinite(quantity)){
        run.buy=null;find('#shop-close')?.click();return skip('無法購買精煉材料或已達購買上限，跳過此件裝備');
      }
      const ordered=Number(button.dataset.n);run.buy={...run.buy,remaining,ordered,clicked:true,before:quantity,until:now+20000};run.bought+=ordered;status.textContent="購買精煉材料 ×"+ordered;button.click();return true;
    }
    let smith=find('#smith:not(.hidden)');
    if(!smith&&!find('#starforge:not(.hidden)')){
      if(find('.overlay:not(.hidden)'))return false;
      requestLobbyNpc('smith');status.textContent='前往鐵匠精煉／升星';return true;
    }
    if(run.kind==='star'&&!find('#starforge:not(.hidden)')){
      const open=find('#smith-star:not(.hidden)');if(!open)return finish('目前無法開啟升星，繼續掛機');open.click();run.next=now+300;return true;
    }
    if(run.kind==='refine'){
      const all=smith.querySelector('#smith-filters [data-f="all"]');if(all&&!all.classList.contains('active')){all.click();run.next=now+300;return true;}
    }else{
      const tab=find('#starforge [data-sft="star"]');if(!tab?.classList.contains('active')){tab?.click();run.next=now+300;return true;}
    }
    const prefix=run.kind==='star'?'sf':'smith',list=find('#'+prefix+'-list');
    if(!list)return finish('讀不到鐵匠清單，繼續掛機');
    const rows=[...list.querySelectorAll('.cand[data-uid]')];
    const candidates=rows.filter(row=>upgradeCandidate(row,config,run.kind)&&!run.skip.has(run.kind+':'+row.dataset.uid) && (run.kind!=='refine'||!run.refinePassed.has(row.dataset.uid)));
    let row=run.uid&&candidates.find(row=>row.dataset.uid===run.uid);
    if(!row){row=candidates[0];run.uid=row?.dataset.uid;}
    if(!row){
      if(run.kind==='refine' && run.refinePassed.size){run.refinePass=Math.min(run.refinePass+1,Number(config.refineTarget||4));run.refinePassed.clear();run.uid=null;return true;}
      if(run.kind==='refine'&&config.star){run.kind='star';run.uid=null;return true;}
      return finish('精煉／升星本次處理完成，缺材料與不符條件裝備已跳過');
    }
    if(!row.classList.contains('sel')){row.click();run.next=now+300;return true;}
    const detail=find('#'+prefix+'-detail'),go=find('#'+prefix+'-go');
    const tier=Number(detail?.textContent.match(/Tier\s*(\d+)/i)?.[1]);
    if(config.tier>0 && (!Number.isInteger(tier)||tier<config.tier))return skip('未達指定Tier，跳過');
    const nextLevel=Number(detail?.querySelector('.ref-ladder .next')?.firstChild?.textContent.match(/^[+★]\s*(\d+)/)?.[1]);
    const target=Number(run.kind==='star'?config.starTarget||4:config.refineTarget||4);
    if(!Number.isInteger(nextLevel) || nextLevel>target)return skip('已達強化目標或不適用，跳過');
    if(run.kind==='refine' && nextLevel>run.refinePass){run.refinePassed.add(run.uid);run.uid=null;run.next=now+100;return true;}
    if(nextLevel>4 && !(run.kind==='star'?config.starRisk:config.refineRisk))return skip('未允許失敗風險，跳過');
    if(go?.disabled){
      const ore=detail?.querySelector('.ref-ore.sel'),have=Number((ore?.querySelector('small')?.textContent||'').replace(/[,，]/g,'').match(/\d+/)?.[0]);
      if(run.kind==='refine'&&config.buy&&have===0&&run.bought<Number(config.buyLimit||30)){
        const name=ore.querySelector('b')?.textContent.trim();if(name){run.buy={name,remaining:Math.min(Number(config.buyBatch||10),Number(config.buyLimit||30)-run.bought)};find('#smith-close')?.click();return true;}
      }
      return skip(run.kind==='star'?'升星材料或點數不足，跳過':'精煉材料或點數不足，跳過');
    }
    if(!go)return skip('讀不到強化按鈕，跳過');
    // Recheck the current selected UID and worn label immediately before every click.
    if(!upgradeCandidate(row,config,run.kind)||row.dataset.uid!==run.uid)return finish('裝備狀態改變，停止強化');
    if(run.kind==='star' && go.dataset.risky && !/確定/.test(go.textContent)){
      go.click();run.next=now+400;return true;
    }
    if(run.kind==='refine'&&nextLevel>4){run.confirm={name:row.querySelector('.cand-info b')?.textContent.trim()};go.click();run.next=now+300;return true;}
    run.pending={node:detail.firstChild,until:now+20000,at:now,kind:run.kind,message:detail.querySelector(run.kind==='star'?'.sf-msg':'.ref-result')?.textContent?.trim()};
    status.textContent=(run.kind==='star'?'升星至 ★':'精煉至 +')+nextLevel;go.click();return true;
  }

  // Manual card replacement: read the native UI, then invoke only its socket buttons.
  const cardSwapButton=document.createElement('button');cardSwapButton.type='button';cardSwapButton.textContent='卡片更換';
  let cardSwapBusy=false,cardSwapCancel=false,cardSwapDialog=null;
  const cardSwapDelay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const cardSwapShown=selector=>document.querySelector(selector+':not(.hidden)');
  function cardSwapCheck(context,ignoreCancel=false){
    if(cardSwapCancel&&!ignoreCancel)throw Error('已停止更換');
    if(context.account!==activeAccount||!document.body.classList.contains('in-lobby'))throw Error('帳號或場景已改變，停止更換');
    const title=document.getElementById('cp-title')?.textContent.trim();
    if(context.character&&title&&title!==context.character)throw Error('角色已改變，請重新讀取');
  }
  async function cardSwapPanel(context,inventory=true){
    cardSwapCheck(context);
    if(!cardSwapShown('#charpanel'))document.getElementById('lobby-char')?.click();
    for(let i=0;i<30&&!cardSwapShown('#charpanel');i++){await cardSwapDelay(80);cardSwapCheck(context);}
    if(!cardSwapShown('#charpanel'))throw Error('無法開啟角色裝備視窗');
    const title=document.getElementById('cp-title')?.textContent.trim();if(!title)throw Error('讀不到角色名稱');
    if(!context.character)context.character=title;cardSwapCheck(context);
    document.getElementById('cp-sock-done')?.click();
    if(!inventory){document.querySelector('#charpanel .tab-btn[data-tab="equip"]')?.click();return;}
    document.querySelector('#charpanel .tab-btn[data-tab="inv"]')?.click();
    const all=document.querySelector('#cp-inv-filters [data-f="all"]');if(!all)throw Error('裝備清單尚未載入');all.click();
    const mine=document.getElementById('cp-only-mine');if(mine?.checked)mine.click();
  }
  function cardSwapCloseNative(context){
    document.getElementById('cp-sock-done')?.click();
    if(context.closePanel&&cardSwapShown('#charpanel'))document.getElementById('cp-back')?.click();
  }
  function cardSwapSlots(){
    return [...document.querySelectorAll('#cp-sock-body .sock[data-i]')].map(el=>({index:Number(el.dataset.i),name:el.querySelector('img')?(el.querySelector('span')?.textContent.trim()||''):''}));
  }
  function cardSwapCards(){
    return [...document.querySelectorAll('#cp-sock-body .sock-card[data-id]')].map(el=>({id:Number(el.dataset.id),name:el.querySelector('.cand-info b')?.textContent.trim()||'',effects:el.querySelector('.cand-info small')?.textContent.trim()||'',count:Number(el.querySelector('.qty-tag')?.textContent.replace(/[^0-9]/g,''))})).filter(c=>Number.isSafeInteger(c.id)&&c.id>0&&c.name&&Number.isSafeInteger(c.count)&&c.count>0);
  }
  async function cardSwapOpenGear(context,gear){
    await cardSwapPanel(context,!gear.equippedSlot);cardSwapCheck(context);
    if(gear.equippedSlot){
      document.querySelector('#charpanel .tab-btn[data-tab="equip"]')?.click();
      const body=[...document.querySelectorAll('#charpanel .equip-slot[data-slot]')].find(el=>el.dataset.slot===gear.equippedSlot);if(!body)throw Error('找不到身上部位：'+gear.equippedSlot);body.click();
      if(document.querySelector('#cp-eq-current .eq-name b')?.textContent.trim()!==gear.name)throw Error('身上裝備已改變，請重新讀取');
      const open=document.getElementById('cp-add-cards');if(!open||open.disabled)throw Error('身上這件裝備沒有可操作卡槽');open.click();
      if(!cardSwapShown('#cp-sock')||document.querySelector('#cp-sock-body .eq-name b')?.textContent.trim()!==gear.name)throw Error('身上卡槽視窗核對失敗');
      const slots=cardSwapSlots();if(!slots.length)throw Error('讀不到身上卡槽');return {slots,cards:cardSwapCards()};
    }
    const row=[...document.querySelectorAll('#cp-inventory .item-cell[data-uid]')].find(el=>el.dataset.uid===gear.uid);
    if(!row)throw Error('找不到指定裝備：'+gear.name);
    row.click();
    const selected=document.querySelector('#cp-inventory .item-cell.sel[data-uid]'),name=document.querySelector('#cp-inv-detail .eq-name b')?.textContent.trim();
    if(selected?.dataset.uid!==gear.uid||name!==gear.name)throw Error('裝備識別已改變，停止更換');
    const open=document.getElementById('cp-inv-cards');if(!open||open.disabled)throw Error('這件裝備沒有可操作卡槽，或由其他角色穿戴');open.click();
    if(!cardSwapShown('#cp-sock')||document.querySelector('#cp-sock-body .eq-name b')?.textContent.trim()!==gear.name)throw Error('裝備卡槽視窗核對失敗');
    const slots=cardSwapSlots();if(!slots.length||slots.some(v=>!Number.isSafeInteger(v.index)||v.index<0))throw Error('卡槽資料不完整');
    cardSwapCheck(context);return {slots,cards:cardSwapCards()};
  }
  async function cardSwapReadGear(context){
    await cardSwapPanel(context);const ids=[...document.querySelectorAll('#cp-inventory .item-cell[data-uid]')].map(el=>el.dataset.uid),items=[];
    for(let i=0;i<ids.length;i++){
      cardSwapCheck(context);const row=[...document.querySelectorAll('#cp-inventory .item-cell[data-uid]')].find(el=>el.dataset.uid===ids[i]);if(!row)continue;
      const equipped=row.classList.contains('equipped');row.click();
      const selected=document.querySelector('#cp-inventory .item-cell.sel[data-uid]'),name=document.querySelector('#cp-inv-detail .eq-name b')?.textContent.trim(),open=document.getElementById('cp-inv-cards');
      if(selected?.dataset.uid===ids[i]&&name&&open&&!open.disabled)items.push({uid:ids[i],name,equipped,info:document.querySelector('#cp-inv-detail .muted')?.textContent.trim()||'',effects:[...document.querySelectorAll('#cp-inv-detail .bon-list li')].map(el=>el.textContent.trim()).join('、')});
      if(i%10===0){status.textContent='讀取有卡槽的裝備 '+(i+1)+'／'+ids.length;await cardSwapDelay(0);}
    }
    cardSwapCheck(context);return items.sort((a,b)=>Number(b.equipped)-Number(a.equipped)||a.name.localeCompare(b.name));
  }
  function cardSwapValidatePlan(tasks,states){
    const demand=new Map(),stock=new Map(),seen=new Set();
    for(let i=0;i<tasks.length;i++){
      const t=tasks[i],state=states[i],key=t.gear.uid+':'+t.slot;
      if(seen.has(key))throw Error('同一卡槽不能重複設定');seen.add(key);
      const slot=state.slots.find(s=>s.index===t.slot);if(!slot||slot.name!==t.old)throw Error(t.gear.name+' 的卡槽已改變，請重新選擇');
      if(t.card){const card=state.cards.find(c=>c.id===t.card.id);if(!card||card.name!==t.card.name)throw Error('指定卡片已不足或不相容：'+t.card.name);demand.set(card.id,(demand.get(card.id)||0)+1);stock.set(card.id,Math.min(stock.get(card.id)??Infinity,card.count));}
      else if(!slot.name)throw Error('指定拆除的卡槽已經是空的');
    }
    for(const [id,n]of demand)if(n>(stock.get(id)||0))throw Error('更換清單需要 '+n+' 張同一卡片，但卡冊只有 '+(stock.get(id)||0)+' 張');
    return true;
  }
  async function cardSwapExecute(context,tasks,options={}){
    let done=0;cardSwapBusy=true;cardSwapCancel=false;cardSwapButton.textContent='停止更換卡片';window.__roMenuHelper?.releaseMovement?.();
    try{
      const states=[];for(const task of tasks)states.push(await cardSwapOpenGear(context,task.gear));
      if(options.profile)tasks=cardSwapPrepareLoadout(tasks,states);else cardSwapValidatePlan(tasks,states);
      for(const task of tasks){
        cardSwapCheck(context);const state=await cardSwapOpenGear(context,task.gear);
        if(task.card&&task.card.id===0){const matches=state.cards.filter(c=>c.name===task.card.name);if(matches.length!==1)throw Error('無法唯一確認卡片：'+task.card.name);task.card={...task.card,id:matches[0].id};}
        cardSwapValidatePlan([task],[state]);
        const socket=[...document.querySelectorAll('#cp-sock-body .sock[data-i]')].find(el=>Number(el.dataset.i)===task.slot);if(!socket)throw Error('卡槽不存在');socket.click();
        const selected=document.querySelector('#cp-sock-body .sock.sel[data-i]');if(Number(selected?.dataset.i)!==task.slot)throw Error('卡槽選取失敗');
        cardSwapCheck(context);
        if(task.card){const card=[...document.querySelectorAll('#cp-sock-body .sock-card[data-id]')].find(el=>Number(el.dataset.id)===task.card.id);if(!card)throw Error('卡片數量不足，停止更換');card.click();}
        else{const remove=document.getElementById('cp-sock-remove');if(!remove||remove.disabled)throw Error('無法拆除這張卡片');remove.click();}
        await cardSwapDelay(100);cardSwapCheck(context,true);
        if((task.gear.equippedSlot?document.querySelector('#charpanel .equip-slot.sel[data-slot]')?.dataset.slot!==task.gear.equippedSlot:document.querySelector('#cp-inventory .item-cell.sel[data-uid]')?.dataset.uid!==task.gear.uid)||document.querySelector('#cp-sock-body .eq-name b')?.textContent.trim()!==task.gear.name)throw Error('操作視窗已改變，停止後續更換');
        const after=cardSwapSlots().find(s=>s.index===task.slot);if(!after||after.name!==(task.card?.name||''))throw Error('未確認換卡成功，已停止後續操作');
        done++;status.textContent='更換卡片 '+done+'／'+tasks.length+'：'+task.gear.name+' 第'+(task.slot+1)+'洞';
        if(cardSwapCancel)throw Error('已停止更換');
      }
      status.textContent=tasks.length?'卡片更換完成 '+done+'／'+tasks.length+'；舊卡已依遊戲機制回卡冊':'已是指定卡片配置，不需更換';return {ok:true,done,total:tasks.length};
    }catch(error){status.textContent='卡片更換停止（已完成 '+done+'／'+tasks.length+'）：'+error.message;return {ok:false,error:error.message,done,total:tasks.length};}
    finally{cardSwapCloseNative(context);cardSwapBusy=false;cardSwapButton.textContent='卡片更換';}
  }
  let cardSwapTransition=null;
  function cardSwapLoadouts(){
    try{const data=JSON.parse(readSetting('ro-helper-card-loadouts')||'null');return data?.v===1&&Array.isArray(data.profiles)?data.profiles.filter(p=>p&&typeof p.character==='string'&&p.character.length<=200).slice(0,30):[];}catch{return [];}
  }
  function cardSwapSaveLoadout(character,kind,tasks,enabled){
    const profiles=cardSwapLoadouts(),old=profiles.find(p=>p.character===character)||{character,enabled:false};
    const next={...old};
    if(kind){if(!['raid','normal'].includes(kind)||!tasks.length)throw Error('請先加入要更換的卡槽');next[kind]=tasks.map(t=>({gear:{uid:t.gear.uid,name:t.gear.name,...(t.gear.equippedSlot?{equippedSlot:t.gear.equippedSlot,label:t.gear.label}: {})},slot:t.slot,card:t.card?{id:t.card.id,name:t.card.name}:null}));}
    if(enabled!==undefined){if(enabled&&(!next.raid?.length||!next.normal?.length))throw Error('請先儲存副本用與普通掛機用兩套設定');next.enabled=!!enabled;}
    const list=profiles.filter(p=>p.character!==character);list.push(next);writeSetting('ro-helper-card-loadouts',JSON.stringify({v:1,profiles:list}));cardSwapTransition=null;return next;
  }
  function cardSwapPrepareLoadout(tasks,states){
    const idByName=new Map(),available=new Map(),returned=new Map(),needed=new Map(),changed=[],seen=new Set();
    for(const t of tasks)if(t.card?.id>0){if(idByName.has(t.card.name)&&idByName.get(t.card.name)!==t.card.id)throw Error('同名卡片編號不明，請重新儲存');idByName.set(t.card.name,t.card.id);}
    for(let i=0;i<tasks.length;i++){
      const t=tasks[i],state=states[i],key=t.gear.uid+':'+t.slot;
      if(seen.has(key))throw Error('同一卡槽重複設定');seen.add(key);
      if(!t.gear.uid||!Number.isSafeInteger(t.slot)||t.slot<0||t.card&&(!Number.isSafeInteger(t.card.id)||t.card.id<0||!t.card.name))throw Error('卡片設定無效');
      const old=state.slots.find(v=>v.index===t.slot);if(!old)throw Error('目前身上裝備的洞數不足，請重新儲存配置');
      for(const c of state.cards){if(idByName.has(c.name)&&idByName.get(c.name)!==c.id)throw Error('同名卡片編號核對失敗');idByName.set(c.name,c.id);available.set(c.name,Math.min(available.get(c.name)??Infinity,c.count));}
      if(old.name===(t.card?.name||''))continue;
      changed.push({...t,old:old.name});if(old.name)returned.set(old.name,(returned.get(old.name)||0)+1);if(t.card)needed.set(t.card.name,(needed.get(t.card.name)||0)+1);
    }
    for(const [name,count]of needed)if(count>(available.get(name)||0)+(returned.get(name)||0))throw Error('卡片數量不足：'+name+'，尚未更換任何卡片');
    const resolved=changed.map(t=>({...t,card:t.card?{...t.card,id:t.card.id||idByName.get(t.card.name)||0}:null}));
    return [...resolved.filter(t=>t.old).map(t=>({...t,card:null})),...resolved.filter(t=>t.card).map(t=>({...t,old:''}))];
  }
  async function cardSwapApplyLoadout(kind,options={}){
    const context={account:activeAccount,character:null,closePanel:!cardSwapShown('#charpanel')};cardSwapBusy=true;cardSwapCancel=false;window.__roMenuHelper?.releaseMovement?.();
    try{
      await cardSwapPanel(context,false);const config=cardSwapLoadouts().find(p=>p.character===context.character);
      if(!config||!config.enabled&&!options.force){cardSwapCloseNative(context);return {ok:true,skipped:true};}
      const saved=config[kind];if(!Array.isArray(saved)||!saved.length)throw Error('尚未儲存'+(kind==='raid'?'副本':'普通掛機')+'卡片設定');
      const worn=await cardSwapReadWorn(context),legacy=saved.some(t=>!t.gear?.equippedSlot)?await cardSwapReadGear(context):[],tasks=saved.map(t=>{const gear=t.gear?.equippedSlot?worn.find(g=>g.equippedSlot===t.gear.equippedSlot):legacy.find(g=>g.uid===t.gear?.uid);if(!gear)throw Error('找不到身上設定部位：'+(t.gear?.label||t.gear?.name));return {...t,gear};});
      return await cardSwapExecute(context,tasks,{profile:true});
    }catch(error){cardSwapCloseNative(context);return {ok:false,error:error.message};}
    finally{cardSwapBusy=false;cardSwapButton.textContent='卡片更換';}
  }
  function handleCardSwapMode(kind){
    if(!taiwanGame||!cardSwapLoadouts().some(p=>p.enabled===true))return false;
    const key=activeAccount+':'+kind;
    if(cardSwapTransition?.key===key){
      if(cardSwapTransition.state==='done'){if(cardSwapShown('#charpanel'))cardSwapTransition.inspecting=true;else if(cardSwapTransition.inspecting)cardSwapTransition=null;if(cardSwapTransition){if(cardSwapTransition.inspecting){status.textContent='關閉角色視窗後自動重新比對配卡';return true;}return false;}}
      if(cardSwapTransition){status.textContent=cardSwapTransition.state==='error'?'自動換卡停止：'+cardSwapTransition.error+'；請修正卡片設定後重新啟動':(kind==='raid'?'副本':'普通掛機')+'卡片套用中，完成前不出發';return true;}
    }
    if(!document.body.classList.contains('in-lobby'))return true;
    if(cardSwapShown('#charpanel')){status.textContent='關閉角色視窗後，將自動比對身上卡片';return true;}
    if(cardSwapBusy||cardSwapDialog?.open||readingGsAdvice||upgradeActive||recycleReading||cardRecycleActive)return true;
    if(document.querySelector('dialog[open]'))return true;
    const shop=document.querySelector('#raidshop:not(.hidden) #rs-close');if(shop){shop.click();return true;}
    const group=document.getElementById('rg-w-close');if(group){group.click();return true;}
    if(document.querySelector('.overlay:not(.hidden):not(#charpanel)')){status.textContent='自動換卡：請先關閉其他視窗';return true;}
    const token={key,state:'pending'};cardSwapTransition=token;
    void cardSwapApplyLoadout(kind).then(result=>{if(cardSwapTransition!==token)return;token.state=result.ok?'done':'error';token.error=result.error||status.textContent;if(!result.ok)status.textContent='自動換卡停止：'+token.error+'；請修正設定後重新啟動';}).catch(error=>{if(cardSwapTransition===token){token.state='error';token.error=error.message;}});
    return true;
  }

    function cardSwapWornGroup(slot){return slot.startsWith('head_')?'head':/^acc[12]$/.test(slot)?'acc':slot;}
  async function cardSwapReadWorn(context){
    await cardSwapPanel(context,false);document.querySelector('#charpanel .tab-btn[data-tab="equip"]')?.click();
    const ids=[...document.querySelectorAll('#charpanel .equip-slot[data-slot]')].map(el=>el.dataset.slot),items=[];
    for(const id of ids){
      cardSwapCheck(context);const row=[...document.querySelectorAll('#charpanel .equip-slot[data-slot]')].find(el=>el.dataset.slot===id);if(!row)continue;
      row.click();const name=document.querySelector('#cp-eq-current .eq-name b')?.textContent.trim(),label=row.querySelector('.lbl')?.textContent.trim()||id;
      if(!name)continue;const gear={uid:'@equipped:'+id,equippedSlot:id,name,label,equipped:true,info:'目前穿戴',effects:''};
      if(!document.getElementById('cp-add-cards')){items.push({...gear,slots:[],cards:[]});continue;}
      const state=await cardSwapOpenGear(context,gear);items.push({...gear,...state});document.getElementById('cp-sock-done')?.click();
    }
    cardSwapCheck(context);return items;
  }
  function cardSwapWornTasks(gears){
    return gears.flatMap(gear=>gear.slots.map(slot=>{const matches=gear.cards.filter(c=>c.name===slot.name);return {gear:{uid:gear.uid,equippedSlot:gear.equippedSlot,name:gear.name,label:gear.label},slot:slot.index,card:slot.name?{id:matches.length===1?matches[0].id:0,name:slot.name}:null};}));
  }
  function cardSwapShow(context,gears){
    const dialog=document.createElement('dialog');dialog.id='ro-helper-card-swap';dialog.style.cssText='width:min(850px,95vw);max-height:88vh;padding:14px;box-sizing:border-box';cardSwapDialog=dialog;
    const title=document.createElement('b');title.textContent='身上卡片配置｜'+context.character;
    const hint=document.createElement('p');hint.textContent='已自動讀取身上各部位的卡片。可以把身上整套直接存成副本或掛機配置，也可以點表格裡的卡片修改。切換時自動讀取並比對，只更換不同的洞。';
    const tools=document.createElement('div');tools.style.cssText='display:flex;flex-wrap:wrap;gap:8px';
    const message=document.createElement('div'),summary=document.createElement('p'),tableWrap=document.createElement('div');tableWrap.style.overflowX='auto';
    const editor=document.createElement('div');editor.style.cssText='display:none;border:1px solid #9aaed1;padding:10px;margin-top:8px';
    const search=document.createElement('input');search.placeholder='搜尋卡片名稱或詞條';search.style.width='95%';const choices=document.createElement('div');choices.style.cssText='max-height:220px;overflow:auto';const cancelEdit=document.createElement('button');cancelEdit.type='button';cancelEdit.textContent='收起卡片選擇';cancelEdit.onclick=()=>{editor.style.display='none';};editor.append(search,choices,cancelEdit);
    const enabled=document.createElement('input');enabled.type='checkbox';const enableLabel=document.createElement('label');enableLabel.append(enabled,' 自動比對副本／掛機配置並換卡');
    const config=()=>cardSwapLoadouts().find(p=>p.character===context.character);
    let edit=null,working=false;
    const error=err=>{message.textContent=err.message;};
    const persist=(kind,tasks)=>{const p=cardSwapSaveLoadout(context.character,kind,tasks);if(p.raid?.length&&p.normal?.length&&p.enabled!==true)cardSwapSaveLoadout(context.character,null,[],true);};
    const saveSnapshot=kind=>{try{const tasks=cardSwapWornTasks(gears);if(!tasks.length)throw Error('身上沒有可儲存的卡槽');persist(kind,tasks);message.textContent='已把身上整套配卡儲存為'+(kind==='raid'?'副本':'掛機')+'配置';render();}catch(err){error(err);}};
    const renderChoices=()=>{
      choices.replaceChildren();if(!edit)return;const {gear,slot,kind}=edit,options=new Map();
      for(const card of gear.cards)options.set(card.name,{...card});
      for(const g of gears.filter(g=>cardSwapWornGroup(g.equippedSlot)===cardSwapWornGroup(gear.equippedSlot)))for(const s of g.slots)if(s.name&&!options.has(s.name))options.set(s.name,{id:0,name:s.name,effects:'目前裝在身上',count:0});
      const set=card=>{try{let tasks=(config()?.[kind]?.length?config()[kind]:cardSwapWornTasks(gears)).map(t=>({...t,gear:{...t.gear},card:t.card?{...t.card}:null}));tasks=tasks.filter(t=>!(t.gear.equippedSlot===gear.equippedSlot&&t.slot===slot));tasks.push({gear:{uid:gear.uid,equippedSlot:gear.equippedSlot,name:gear.name,label:gear.label},slot,card:card?{id:card.id,name:card.name}:null});persist(kind,tasks);message.textContent='已更新'+(kind==='raid'?'副本':'掛機')+'配置，尚未執行更換';editor.style.display='none';render();}catch(err){error(err);}};
      const empty=document.createElement('button');empty.type='button';empty.textContent='設為空槽（套用時拆回卡冊）';empty.onclick=()=>set(null);choices.append(empty);
      const q=search.value.trim().toLocaleLowerCase();for(const c of options.values())if((c.name+' '+(c.effects||'')).toLocaleLowerCase().includes(q)){const b=document.createElement('button');b.type='button';b.style.cssText='display:block;white-space:normal;text-align:left;width:100%;margin:5px 0';b.textContent=c.name+(c.count?'｜卡冊 '+c.count+' 張':'｜身上卡片')+' '+(c.effects||'');b.onclick=()=>set(c);choices.append(b);}
    };
    function render(){
      const p=config();enabled.checked=p?.enabled===true;summary.textContent='副本配置：'+(p?.raid?.length||0)+'洞｜掛機配置：'+(p?.normal?.length||0)+'洞。身上裝備更換後，依部位套用到目前穿戴的裝備；不更換整件裝備。';
      const table=document.createElement('table');table.style.cssText='width:100%;border-collapse:collapse';const head=document.createElement('tr');for(const text of ['身上部位／裝備','卡槽','目前卡片','副本配置','掛機配置']){const th=document.createElement('th');th.textContent=text;th.style.cssText='text-align:left;border-bottom:1px solid #9aaed1;padding:6px';head.append(th);}table.append(head);
      for(const gear of gears){
        const slots=gear.slots.length?gear.slots:[{index:-1,name:'無卡槽'}];
        for(const slot of slots){const row=document.createElement('tr');for(const text of [gear.label+'｜'+gear.name,slot.index<0?'—':String(slot.index+1),slot.name||'空槽']){const td=document.createElement('td');td.textContent=text;td.style.cssText='padding:6px;border-bottom:1px solid #e0e5ed';row.append(td);}
          for(const kind of ['raid','normal']){const td=document.createElement('td');td.style.cssText='padding:6px;border-bottom:1px solid #e0e5ed';const target=p?.[kind]?.find(t=>t.gear.equippedSlot===gear.equippedSlot&&t.slot===slot.index);const b=document.createElement('button');b.type='button';b.disabled=slot.index<0;b.textContent=slot.index<0?'—':target?(target.card?.name||'空槽'):'尚未儲存';b.onclick=()=>{edit={gear,slot:slot.index,kind};search.value='';editor.style.display='block';renderChoices();};td.append(b);row.append(td);}table.append(row);}
      }
      tableWrap.replaceChildren(table);
    }
    enabled.onchange=()=>{try{cardSwapSaveLoadout(context.character,null,[],enabled.checked);message.textContent=enabled.checked?'已啟用自動讀取、比對及更換':'已關閉自動換卡';}catch(err){error(err);}render();};
    for(const [kind,label]of [['raid','副本'],['normal','掛機']]){
      const save=document.createElement('button');save.type='button';save.textContent='身上這套存為'+label;save.onclick=()=>saveSnapshot(kind);tools.append(save);
      const apply=document.createElement('button');apply.type='button';apply.textContent='立即套用'+label;apply.onclick=()=>{if(working)return;if(!config()?.[kind]?.length){message.textContent='請先儲存'+label+'配置';return;}cardSwapBusy=true;dialog.close();cardSwapCloseNative(context);void cardSwapApplyLoadout(kind,{force:true}).then(r=>{if(!r.ok)status.textContent='換卡停止：'+r.error;});};tools.append(apply);
    }
    const refresh=document.createElement('button');refresh.type='button';refresh.textContent='重新讀取身上卡片';refresh.onclick=async()=>{if(working)return;working=true;cardSwapBusy=true;cardSwapCancel=false;window.__roMenuHelper?.releaseMovement?.();try{gears=await cardSwapReadWorn(context);message.textContent='已重新讀取身上各部位卡片';editor.style.display='none';render();}catch(err){error(err);}finally{working=false;cardSwapBusy=false;if(!cardSwapDialog?.open)cardSwapCloseNative(context);}};tools.append(refresh);
    const footer=document.createElement('div');footer.style.cssText='position:sticky;bottom:0;background:white;padding:10px 0;display:flex;gap:10px;flex-wrap:wrap';const close=document.createElement('button');close.type='button';close.textContent='關閉';close.onclick=()=>dialog.close();footer.append(enableLabel,close);
    dialog.append(title,hint,tools,summary,tableWrap,editor,message,footer);dialog.onclose=()=>{if(working)cardSwapCancel=true;cardSwapDialog=null;dialog.remove();if(!cardSwapBusy)cardSwapCloseNative(context);};search.oninput=renderChoices;document.body.append(dialog);dialog.showModal();render();
  }

  cardSwapButton.onclick=async()=>{
    if(cardSwapBusy){cardSwapCancel=true;status.textContent='正在停止卡片更換';return;}
    if(cardSwapDialog?.open)return;
    if(!taiwanGame||!document.body.classList.contains('in-lobby')){status.textContent='請回廣場後更換裝備卡片';return;}
    if(readingGsAdvice||upgradeActive||recycleReading||cardRecycleActive||recycleDialog?.open||document.querySelector('dialog[open],.overlay:not(.hidden):not(#charpanel)')){status.textContent='請先結束整理／精煉／回收並關閉其他視窗';return;}
    const context={account:activeAccount,character:null,closePanel:!cardSwapShown('#charpanel')};cardSwapBusy=true;cardSwapCancel=false;window.__roMenuHelper?.releaseMovement?.();
    try{const gears=await cardSwapReadWorn(context);cardSwapCloseNative(context);if(!gears.length)throw Error('身上尚未穿戴裝備');cardSwapShow(context,gears);status.textContent='已自動讀取身上 '+gears.length+' 個部位的配卡';}
    catch(error){cardSwapCloseNative(context);status.textContent='卡片更換：'+error.message;}
    finally{cardSwapBusy=false;}
  };

  const cardRecycleButton=document.createElement('button');cardRecycleButton.type='button';cardRecycleButton.textContent='卡片回收';
  let recycleReading=false,cardRecycleActive=false,cardRecycleOpened=false,recycleDialog=null,recycleSelection=new Set(),recycleAccount=null,recycleRowsSnapshot=[];
  const recycleLapOf=id=>Math.floor(Number(id)/1000000)+1;
  const recycleProtected=row=>!!row.querySelector('.cr-tag.mvp,.cr-tag.mini');
  const recycleRows=()=>[...document.querySelectorAll('#cr-body .cr-row[data-id]')];
  const recycleQuantity=(row,count)=>{const input=row.querySelector('input[data-q]');if(!input)return;input.value=String(count);input.dispatchEvent(new Event('change',{bubbles:true}));};
  const recycleCardRole=id=>typeof dropCardRoles==='undefined'?'unknown':dropCardRoles.find(card=>Number(card.id)===Number(id)%1000000)?.type||'unknown';
  async function readOwnedRecycleCards(){
    if(!document.body.classList.contains('in-lobby'))throw Error('請回廣場後讀取卡冊');
    if(document.querySelector('.overlay:not(.hidden):not(#charpanel)'))throw Error('請先關閉其他遊戲視窗');
    const account=activeAccount,wait=()=>new Promise(resolve=>setTimeout(resolve,80));
    if(!document.querySelector('#charpanel:not(.hidden)'))document.getElementById('lobby-char')?.click();
    await wait();
    if(!document.querySelector('#charpanel:not(.hidden)'))throw Error('無法開啟角色卡冊');
    document.querySelector('#charpanel [data-tab="cards"]')?.click();await wait();
    const allCards=document.querySelector('#cp-card-filters [data-f="all"]');if(!allCards)throw Error('卡冊尚未載入，請重新讀取');allCards.click();await wait();
    const cells=[...document.querySelectorAll('#cp-cards .card-cell[data-card]')],cards=[];
    for(const cell of cells){
      if(account!==activeAccount)throw Error('帳號已切換，請重新讀取');
      const id=Number(cell.dataset.card),count=Number(cell.querySelector('.qty')?.textContent.replace(/[,，]/g,''));
      if(!Number.isSafeInteger(id)||!Number.isSafeInteger(count)||count<=0)continue;
      cell.click();
      const name=document.querySelector('#cp-card-detail .eq-name b')?.textContent.trim();
      if(!name)throw Error('卡片名稱讀取不完整，請重新讀取');
      const effects=[...document.querySelectorAll('#cp-card-detail .bon-list li')].map(node=>node.textContent.trim()).filter(Boolean);
      cards.push({id,name,count,effects,lap:recycleLapOf(id),role:recycleCardRole(id)});
    }
    if(account!==activeAccount)throw Error('帳號已切換，請重新讀取');
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));
    return cards;
  }
  function showRecycleManager(cards){
    recycleRowsSnapshot=cards;recycleAccount=activeAccount;
    const stored=(()=>{try{return JSON.parse(readSetting('ro-helper-recycle-cards')||'[]')}catch{return []}})();
    recycleSelection=new Set(stored.filter(id=>cards.some(card=>card.id===id&&!['boss','mini'].includes(card.role))));
    const dialog=document.createElement('dialog');recycleDialog=dialog;dialog.id='ro-helper-card-recycle';
    dialog.style.cssText='width:min(650px,calc(100vw - 24px));max-height:85dvh;box-sizing:border-box;color:#173569;background:#f7f9ff;padding:14px';
    const title=document.createElement('h3');title.textContent='卡片回收設定 · 我的卡冊';
    const tabs=document.createElement('div'),search=document.createElement('input'),list=document.createElement('div'),message=document.createElement('p'),summary=document.createElement('p'),footer=document.createElement('div');
    tabs.style.cssText='display:flex;flex-wrap:wrap;gap:5px';search.placeholder='搜尋卡片名稱或詞條，例如 急速、INT';search.style.cssText='width:100%;box-sizing:border-box;margin:8px 0';list.style.cssText='overflow:auto;max-height:45dvh';footer.style.cssText='position:sticky;bottom:0;background:#f7f9ff;padding-top:8px;display:flex;gap:6px;flex-wrap:wrap';
    let lap=0;const visible=()=>cards.filter(card=>(!lap||card.lap===lap)&&[card.name,...(card.effects||[])].join(' ').normalize('NFKC').toLocaleLowerCase().includes(search.value.trim().normalize('NFKC').toLocaleLowerCase()));
    const save=()=>{if(activeAccount!==recycleAccount)throw Error('帳號已切換');writeSetting('ro-helper-recycle-cards',JSON.stringify([...recycleSelection]));};
    function render(){
      list.replaceChildren();for(const card of visible()){
        const label=document.createElement('label');label.style.cssText='display:flex;gap:8px;padding:7px;border-bottom:1px solid #d4dded';
        const check=document.createElement('input');check.type='checkbox';check.disabled=['boss','mini'].includes(card.role);check.checked=!check.disabled&&recycleSelection.has(card.id);
        check.onchange=()=>{if(check.checked)recycleSelection.add(card.id);else recycleSelection.delete(card.id);render();};
        label.append(check,card.name+' ×'+card.count+' · '+card.lap+'周目'+(check.disabled?' · '+(card.role==='boss'?'BOSS':'MINI')+'卡（保留）':card.role==='unknown'?' · 執行前核對類型':''));if(card.effects?.length){const effects=document.createElement('small');effects.textContent=card.effects.join('、');effects.style.cssText='display:block;color:#53678a';label.append(effects);}list.append(label);
      }
      const selected=cards.filter(card=>recycleSelection.has(card.id));summary.textContent='已勾選回收 '+selected.length+' 種／'+selected.reduce((n,c)=>n+c.count,0)+' 張；未勾選＝保留。BOSS／MINI 卡不回收。';
    }
    for(const value of [0,...new Set(cards.map(card=>card.lap))].sort((a,b)=>a-b)){const button=document.createElement('button');button.type='button';button.textContent=value?value+'周目':'全部';button.onclick=()=>{lap=value;render();};tabs.append(button);}
    const select=document.createElement('button'),clear=document.createElement('button'),start=document.createElement('button'),store=document.createElement('button'),close=document.createElement('button');
    select.textContent='全選目前篩選';clear.textContent='取消目前篩選';start.textContent='儲存並前往回收';store.textContent='儲存設定';close.textContent='關閉';
    select.onclick=()=>{visible().filter(c=>!['boss','mini'].includes(c.role)).forEach(c=>recycleSelection.add(c.id));render();};clear.onclick=()=>{visible().forEach(c=>recycleSelection.delete(c.id));render();};
    store.onclick=()=>{try{save();message.textContent='已儲存回收勾選'}catch(error){message.textContent=error.message}};
    start.onclick=()=>{try{save();if(!recycleSelection.size){message.textContent='請先勾選要回收的卡片';return;}if(!document.body.classList.contains('in-lobby'))throw Error('請回廣場後執行');dialog.close();cardRecycleActive=true;cardRecycleOpened=false;requestLobbyNpc('cardrecycle');status.textContent='前往回收已勾選卡片';}catch(error){message.textContent=error.message}};
    close.onclick=()=>dialog.close();search.oninput=render;footer.append(select,clear,store,start,close);dialog.append(title,tabs,search,summary,list,message,footer);dialog.onclose=()=>{recycleDialog=null;dialog.remove();};document.body.append(dialog);dialog.showModal();render();
  }
  cardRecycleButton.onclick=async()=>{
    if(cardRecycleActive){cardRecycleActive=false;requestLobbyNpc('cancel');status.textContent='卡片回收已停止';return;}
    if(recycleDialog?.open)return;
    cardRecycleButton.disabled=true;recycleReading=true;
    try{status.textContent='讀取實際持有卡片';showRecycleManager(await readOwnedRecycleCards());}catch(error){status.textContent=error.message;}finally{cardRecycleButton.disabled=false;recycleReading=false;}
  };
  const cardRecycleTimer=setInterval(()=>{
    if(!cardRecycleActive)return;
    if(activeAccount!==recycleAccount||!document.body.classList.contains('in-lobby')){cardRecycleActive=false;requestLobbyNpc('cancel');status.textContent='角色狀態改變，回收已停止';return;}
    const open=document.querySelector('#cardrecycle:not(.hidden)');
    if(!open){if(cardRecycleOpened){cardRecycleActive=false;requestLobbyNpc('cancel');}else requestLobbyNpc('cardrecycle');return;}
    if(cardRecycleOpened)return;
    const go=document.getElementById('cr-go');if(!go)return;
    cardRecycleOpened=true;
    const none=document.getElementById('cr-none');if(none)none.click();
    for(const row of recycleRows())recycleQuantity(row,!recycleProtected(row)&&recycleSelection.has(Number(row.dataset.id))?Number(row.querySelector('input[data-q]')?.max)||0:0);
    const freshGo=document.getElementById('cr-go');
    if(freshGo&&!freshGo.disabled){freshGo.click();status.textContent='已填入勾選卡片，請確認遊戲回收視窗';}
    else{status.textContent='沒有可回收的勾選卡片；BOSS／MINI 已排除';cardRecycleActive=false;requestLobbyNpc('cancel');}
  },400);
  window.addEventListener('pagehide',()=>clearInterval(cardRecycleTimer));

  const inventoryButton = document.createElement("button");
  inventoryButton.type = "button";
  inventoryButton.textContent = "裝備整理";
  let inventoryRun;
  const dropRefByUid = new Map();
  const gearIdByUid = new Map();
  const dropDispositions = new Map();
  const dropStorageSources = new Map();
  if (taiwanGame) document.addEventListener("ro-helper-gear-credited", event => {
    try {
      const [uid,ref,itemId] = JSON.parse(event.detail);
      if (typeof uid === "string" && Number.isSafeInteger(itemId)) gearIdByUid.set(uid,itemId);
      if (typeof uid === "string" && typeof ref === "string") dropRefByUid.set(uid,ref);
    } catch {}
  });
  function recordDisposition(uid, disposition, storageSource) {
    gearIdByUid.delete(uid);
    const ref = dropRefByUid.get(uid);
    if (!ref) return;
    dropDispositions.set(ref,disposition);
    if(storageSource)dropStorageSources.set(ref,storageSource);
    refreshLootWindow();
  }
  const inventorySettings = () => {
    try { return JSON.parse(localStorage.getItem(settingKey("ro-helper-inventory"))) || {}; }
    catch { return {}; }
  };
  const inventoryTierKey = "ro-helper-observed-gear-tiers";
  const observedGearTiers = new Set([1,2,3,4,5]);
  const validGearTier = tier => Number.isSafeInteger(tier) && tier > 0;
  if (taiwanGame) {
    try {
      const saved = JSON.parse(localStorage.getItem(inventoryTierKey) || "[]");
      if (Array.isArray(saved)) saved.filter(validGearTier).forEach(tier=>observedGearTiers.add(tier));
    } catch {}
  }
  function readInventoryTier(label) {
    const tier = Number(label.normalize("NFKC").match(/\bTier\s*(\d+)\b/i)?.[1]);
    if (!validGearTier(tier)) return NaN;
    if (taiwanGame && !observedGearTiers.has(tier)) {
      observedGearTiers.add(tier);
      try { localStorage.setItem(inventoryTierKey,JSON.stringify([...observedGearTiers])); } catch {}
    }
    return tier;
  }
  const inventoryWeaponTypes = {
    staff: ["法杖",[1472,1473,1601,1602,1604,1607,1610,1612,1613,1614,1615,1616,1626,1629,1636,1637,1643,1646,1648,1663,2000,2001,2004,2005,39016,39017]],
    book: ["書",[1550,1551,1553,1554,1555,1556,1557,1558,1559,1560,1561,1564,1568,1572,1573,39014,39015]],
    bow: ["弓",[1701,1702,1704,1707,1708,1710,1711,1715,1716,1718,1719,1720,1721,1722,1724,1730,1731,1732,1733,1734,1737,1745,39018,39019]],
    sword: ["單手劍",[1101,1104,1105,1107,1108,1110,1111,1114,1124,1125,1126,1127,1128,1131,1133,1135,1138,1143,13412,13413,13420,13435,39001]],
    twoHandSword: ["雙手劍",[1117,1118,1152,1155,1158,1162,1163,1164,1166,1168,1170,1175,1182,1186,1189,39002]],
    dagger: ["短劍",[1201,1202,1207,1208,1209,1210,1211,1213,1214,1216,1217,1218,1219,1220,1221,1222,1228,1229,1230,1234,1237,1244,1250,1253,1258,1261,1265,13001,13002,13005,13006,13007,13008,13009,13011,13015,13030,13046,13047,39003,39004]],
    knuckle: ["拳套",[1801,1802,1803,1805,1806,1807,1809,1810,1812,1813,1815,1816,1817,1818,1819,1820,1821,1822,1823,1824,1825,1826,1827,1828,1829,39020,39021]],
    katar: ["拳刃",[1252,1254,1256,1258,1259,1260,1262,1263,1268,1269,1270,1271,1275,1276,1277,1285,39005,39006]],
    axe: ["單手斧",[1301,1302,1304,1305,1306,1308,1309,1311,39007]],
    twoHandAxe: ["雙手斧",[1351,1352,1355,1358,1364,1366,1370,1375,1376,1377,1387,39008,39009]],
    spear: ["單手槍",[1401,1402,1405,1407,1408,1409,1413,1417,1420,1421,1422,1425,39010]],
    twoHandSpear: ["雙手槍",[1411,1452,1458,1460,1461,1466,1468,1471,1474,1477,1478,1479,1484,39011]],
    mace: ["鈍器",[1501,1502,1504,1505,1506,1511,1513,1517,1518,1519,1520,1523,1524,1525,1526,1528,1529,1530,1541,1544,1548,39012,39013]],
    instrument: ["樂器",[1901,1905,1908,1909,1913,1915,1918,1919,1920,1925,1926,1927,39022,39023]],
    whip: ["鞭子",[1950,1954,1957,1958,1962,1963,1964,1966,1970,1972,1973,1974,39024,39025]],
    shuriken: ["手裏劍",[13300,13301,13302,13303,13304,13305,13306,13307,13308,13309,39029]],
    handgun: ["手槍",[13101,13103,13104,13105,13106,13107,13108,13110,39026]],
    rifle: ["步槍",[13150,13151,13152,13153,13164,13165,13170,13171,13176,39027]],
    shotgun: ["霰彈槍",[13155,13156,13160,13167,13169,13173,13178,39028]],
    grenade: ["榴彈發射器",[]]
  };
  const inventoryWeaponById = new Map(Object.entries(inventoryWeaponTypes).flatMap(([type,[,ids]]) =>
    ids.map(id => [id,type])));
  const inventoryArmorTypes = {
    armor:["護甲",/^(?:護甲|鎧甲|Armor|Armadura)$/i],
    shield:["盾牌",/^(?:盾牌?|Shield|Escudo)$/i],
    headgear:["頭飾（全部）",/^(?:頭飾|頭盔|頭部|Headgear|Casco|Chapéu)$/i],
    head_top:["頭部（上）",/^(?:(?:頭部|頭飾|Headgear|Head|Cabe[zcç]a)\s*\(\s*(?:上|Upper|Top|arriba|superior|cima)\s*\))$/i],
    head_mid:["頭部（中）",/^(?:(?:頭部|頭飾|Headgear|Head|Cabe[zcç]a)\s*\(\s*(?:中|Middle|Mid|medio|meio)\s*\))$/i],
    head_low:["頭部（下）",/^(?:(?:頭部|頭飾|Headgear|Head|Cabe[zcç]a)\s*\(\s*(?:下|Lower|Low|Bottom|abajo|inferior|baixo)\s*\))$/i],
    garment:["披肩",/^(?:披肩|披風|Garment|Capa)$/i],
    shoes:["鞋子",/^(?:鞋[子靴]?|靴子?|Shoes|Calzado|Calçado)$/i],
    accessory:["飾品",/^(?:飾品|Accessory|Accesorio|Acessório)$/i]
  };
  const inventoryGameWeaponTypes = {"검":"sword","양손검":"twoHandSword","양손창":"twoHandSpear","창":"spear","롯드":"staff","활":"bow","클럽":"mace","단검":"dagger","양손도끼":"twoHandAxe","도끼":"axe","수리검":"shuriken","권총":"handgun","라이플":"rifle","샷건":"shotgun","카타르":"katar","너클":"knuckle","책":"book","악기":"instrument","채찍":"whip"};
  // Complete equipment IDs and shared icons, verified against the current game catalogue.
  const inventoryEquipmentById = new Map([
    ...[2206,2207,2208,2209,2210,2211,2213,2214,2220,2221,2226,2227,2234,2235,2236,2244,2245,2246,2247,2248,2250,2251,2252,2254,2255,2256,2257,2258,2264,2272,2274,2277,2280,2282,2284,2285,2287,2289,2294,2298,2299,5002,5008,5012,5013,5017,5019,5024,5025,5028,5030,5035,5038,5042,5045,5046,5053,5059,5091,5093,5098,5111,5115,5122,5124,5126,5127,5128,5130,5136,5141,5152,5162,5167,5170,5171,5197,5226,5284,5292,5302,5381,5382,5384,5441,5457,5497,5531,5738,5742,5808,39045].map(id => [id,"head_top"]),
    ...[2201,2203,2205,2212,2260,2286,2291,2296,5074,39044].map(id => [id,"head_mid"]),
    ...[2262,2266,2267,2268,2270,2288,2292,2297,5051,5113,5204,5445,5811].map(id => [id,"head_low"]),
    ...[2302,2303,2304,2305,2306,2307,2308,2310,2311,2314,2315,2316,2317,2318,2319,2320,2321,2322,2323,2324,2328,2329,2330,2331,2333,2334,2335,2336,2337,2342,2353,2354,2355,2357,2358,2359,2364,2365,2366,2367,2374,2375,2399,39030,39031,39032,39033].map(id => [id,"armor"]),
    ...[2501,2503,2504,2505,2506,2507,2508,2509,2511,2513,2515,2519,2520,2521,2524,2526,2527,2529,2537,2542,2544,2546,2550,2553,20813,39036,39037].map(id => [id,"garment"]),
    ...[2401,2403,2404,2405,2406,2407,2408,2410,2411,2417,2418,2419,2420,2421,2422,2423,2424,2426,2450,39038,39039].map(id => [id,"shoes"]),
    ...[2102,2103,2104,2106,2107,2108,2109,2110,2111,2114,2115,2116,2122,2124,2125,39034,39035].map(id => [id,"shield"]),
    ...[2601,2602,2603,2604,2605,2607,2608,2609,2610,2611,2612,2614,2615,2616,2617,2618,2619,2620,2621,2623,2625,2626,2627,2629,2630,2636,2637,2648,2649,2664,2666,2678,2679,2700,2708,2715,2718,2743,2749,2762,2788,2790,22847,39040,39041,39042,39043].map(id => [id,"accessory"]),
    ...[1101,1104,1105,1107,1108,1110,1111,1114,1124,1125,1126,1127,1128,1131,1133,1135,1138,1143,13412,13413,13420,13435,39001].map(id => [id,"sword"]),
    ...[1117,1118,1152,1155,1158,1162,1163,1164,1166,1168,1170,1175,1182,1186,1189,39002].map(id => [id,"twoHandSword"]),
    ...[1411,1452,1458,1460,1461,1466,1468,1471,1474,1477,1478,1479,1484,39011].map(id => [id,"twoHandSpear"]),
    ...[1401,1402,1405,1407,1408,1409,1413,1417,1420,1421,1422,1425,39010].map(id => [id,"spear"]),
    ...[1472,1473,1601,1602,1604,1607,1610,1612,1613,1614,1615,1616,1626,1629,1636,1637,1643,1646,1648,1663,2000,2001,2004,2005,39016,39017].map(id => [id,"staff"]),
    ...[1701,1702,1704,1707,1708,1710,1711,1715,1716,1718,1719,1720,1721,1722,1724,1730,1731,1732,1733,1734,1737,1745,39018,39019].map(id => [id,"bow"]),
    ...[1501,1502,1504,1505,1506,1511,1513,1517,1518,1519,1520,1523,1524,1525,1526,1528,1529,1530,1541,1544,1548,39012,39013].map(id => [id,"mace"]),
    ...[1201,1202,1207,1208,1209,1210,1211,1213,1214,1216,1217,1218,1219,1220,1221,1222,1228,1229,1230,1234,1237,1244,1250,1253,1261,1265,13001,13002,13005,13006,13007,13008,13009,13011,13015,13030,13046,13047,39003,39004].map(id => [id,"dagger"]),
    ...[1351,1352,1355,1358,1364,1366,1370,1375,1376,1377,1387,39008,39009].map(id => [id,"twoHandAxe"]),
    ...[1301,1302,1304,1305,1306,1308,1309,1311,39007].map(id => [id,"axe"]),
    ...[1801,1802,1803,1805,1806,1807,1809,1810,1812,1813,1815,1816,1817,1818,1819,1820,1821,1822,1823,1824,1825,1826,1827,1828,1829,39020,39021].map(id => [id,"knuckle"]),
    ...[13300,13301,13302,13303,13304,13305,13306,13307,13308,13309,39029].map(id => [id,"shuriken"]),
    ...[13101,13103,13104,13105,13106,13107,13108,13110,39026].map(id => [id,"handgun"]),
    ...[13150,13151,13152,13153,13164,13165,13170,13171,13176,39027].map(id => [id,"rifle"]),
    ...[13155,13156,13160,13167,13169,13173,13178,39028].map(id => [id,"shotgun"]),
    ...[1252,1254,1256,1258,1259,1260,1262,1263,1268,1269,1270,1271,1275,1276,1277,1285,39005,39006].map(id => [id,"katar"]),
    ...[1550,1551,1553,1554,1555,1556,1557,1558,1559,1560,1561,1564,1568,1572,1573,39014,39015].map(id => [id,"book"]),
    ...[1901,1905,1908,1909,1913,1915,1918,1919,1920,1925,1926,1927,39022,39023].map(id => [id,"instrument"]),
    ...[1950,1954,1957,1958,1962,1963,1964,1966,1970,1972,1973,1974,39024,39025].map(id => [id,"whip"])
  ]);
  function readInventoryWeaponType(tip, label, gameGear) {
    const icon = tip.querySelector(".tip-item img")?.getAttribute("src") || "";
    const id = Number(icon.match(/(?:^|\/)items\/(\d+)(?:_art)?\.png(?:[?#]|$)/i)?.[1]);
    const gameType = gameGear?.["type:" + id];
    const type = Object.hasOwn(inventoryGameWeaponTypes,gameType) ? inventoryGameWeaponTypes[gameType] : inventoryEquipmentById.get(id);
    if (type) return type;
    const fields = label.normalize("NFKC").split(/[·・]/).map(value=>value.trim());
    const slot = Object.entries(inventoryArmorTypes).find(([, [,pattern]]) => fields.some(field=>pattern.test(field)))?.[0];
    if (slot && slot !== "headgear") return slot;
    const known = Number.isInteger(id) ? (gameGear?.["id:" + id] || lootCatalog[0].get("#"+id)?.slot) : null;
    if (known === "acc") return "accessory";
    if (known && Object.hasOwn(inventoryArmorTypes,known)) return known;
    if (slot) return slot;
    return null;
  }
  const bossStorageGearIds=new Set([5053,2601,2621,1163,1825,2544,5042,2274,2111,1821,1564,1473,1222,2256,1305,1807,2743,2116,2254,2355,2521,2420,5074,13005,5025,2358,1559,2524,2421,5171,1376,1823,2505,1513,1234,1471,1555,1133,1258,2248,2235,13104,1474,13002,1815,13009,1387,1168,2509,2450,2122,13015,2627,2114,1737,2282,1731,1966,1275,1908,1164,2247,13156,2258,1186,1466,5170,1616,5098,1271,1306,2507,1189,1364,2004,1477,1920,1377,1135,1716,1610,1263,2424,1155,2124,13046,1261,2542,13413,13412,1915,1818,1958,2620,13153,5035,1648,2205,5008,1801,5497,2610,1308,1420,13164,1219,1220,1175,1827,1927,13176,1826,1824,2700,1285,1643,1262,1957,1422,2244,5127,13151,13304,13308,13303,13301,13300,1468,1813,5002,2267,5093,2354,2419,2297,1128,5019,2546,1733,13008,1230,2000,2001,2366,1254,2318,1816,2342,1525,1964,2250,1541,1269,2270,5162,1529,5111,2125,1629,2245,5024,2284,2664,1143,2255,1366,1237,1918,2336,13167,5124,1806,1370,2603,1524,2246,2618,13155,5808,1636,13006,1125,2104,1358,2268,5130,1614,1551,5811,39045,39042,39002,39007,39012,39035,39023,39036,39027,39033,39004,39010,39006,39025,39038,39029,39041,39005,39028,39008,39017,39015,39044,39030,39020,39018,39011,2236,2324,2110,5136,2364,1820,1913,1972,1557,1478,2718,1561,13309,2611,1229,1460,5113,2648,5126,2649,1646,2365,1548,1909,1926,1637,1615,2607,5742,2406,13305,1421,13170,1720,1730,2106,2292,2317,1260,1809,1810,5292,2762,1111,2513,2109,1523,13103,1718,1745,1162,5384,1411,1127,1124,1734,2257,1519,5531,1417,2537,2375,2334,1572,5045,5122,1526,1114,2423,1472,13169]);
  const knownStorageGearIds=new Set([5053,2601,2621,1711,1163,1721,1825,2544,5042,2274,2111,1732,1821,1564,2307,2308,1473,1222,1925,1214,1970,2005,2262,5445,2260,5038,1901,5059,2256,1701,1702,13101,1305,1807,2743,2116,2254,2355,2521,2420,5074,13005,5025,2358,1559,13001,2201,2115,2524,2421,2357,5171,1376,1601,1602,2604,1823,2505,2211,1513,1558,1234,2329,1501,1502,2311,1131,1553,1568,2678,1471,1555,1133,1258,2248,2235,13104,13105,1474,13002,5013,1815,1573,13009,2410,1387,5091,1168,1351,2630,13150,2614,5457,2509,2450,5197,2122,13015,2627,2303,2304,2114,1737,2282,2679,1819,1731,1966,1256,1275,1908,1164,2234,2247,1554,13156,1517,2258,1186,1466,5170,1616,5098,2515,1375,1265,1271,1306,1182,2320,2507,1919,1189,1364,1708,2004,1704,1477,5046,1613,2337,13171,2508,1407,1408,1920,1377,1135,1716,1610,1311,1722,1263,2511,2424,2615,1715,2749,1155,1170,2214,2124,13046,1261,1276,2542,13413,13412,1915,1818,1958,2608,2620,2503,2504,1301,1302,13153,1117,1828,5035,1648,2205,2367,2207,2612,5008,1801,1802,5497,2610,1308,2266,2310,1405,1420,13164,1219,1220,1401,1402,2404,1101,13011,1175,2305,2306,1827,13110,1927,13176,13307,1826,13178,1824,1107,1108,2700,1285,2294,1643,13047,1963,1262,1511,1957,1422,2407,1425,2244,1974,13306,2519,5127,2418,2411,13151,13304,13308,13303,13301,13302,13300,1468,1556,1259,1813,5002,2267,5093,1413,5128,2354,2520,2419,2297,1250,1252,1253,5115,1550,1128,1973,5019,2287,2546,1733,13007,13008,1230,2000,13108,13160,2619,2001,1244,2251,2366,1254,2318,2319,1816,2333,2342,1525,1964,2250,1541,1269,2280,2270,13107,5162,5017,2422,1529,2272,5111,2206,2125,2605,13173,2296,2203,1207,1208,1962,1629,2245,5024,2501,1822,1268,2550,2426,5738,5441,2284,5141,2417,2664,1143,2255,22847,2602,1366,2617,1607,2302,1237,2226,1918,1719,2335,2336,13167,13165,1201,1202,2208,2209,2321,5124,1805,1806,1370,2603,1524,13106,2246,2618,13155,5808,1636,13006,1104,1105,1125,2103,2104,2353,1138,1358,2268,5130,5284,1528,1614,1551,5811,5381,39045,39042,39002,39019,39007,39012,39014,39026,39009,39035,39023,39016,39036,39003,39024,39027,39043,39033,39004,39010,39006,39025,39038,39029,39001,39041,39005,39021,39037,39040,39028,39008,39017,39015,39032,39039,39022,39044,39034,39030,39031,39020,39018,39013,39011,2636,2236,2637,2324,2110,2408,5136,5382,2788,2790,2364,1530,2629,1820,1913,1972,1557,5226,2220,2221,5030,1478,2718,1561,1829,13309,1817,2286,2330,2331,2401,2611,5152,1229,1210,1211,1460,5113,2648,5126,2649,1646,1484,2365,1548,5302,2291,1909,1926,1560,1626,1637,2609,1615,2607,2210,1905,5742,5204,5012,2405,2406,13305,1228,1421,13170,2288,1604,1720,1730,2212,2213,5051,2106,2292,1803,2314,2315,2316,2317,1954,1260,1809,1810,5292,2762,1110,1111,2264,2289,2513,2109,1523,13103,1718,1745,1458,1216,1217,1158,1162,1152,5384,1411,1126,1127,2529,2616,1124,1734,1304,1309,2299,2257,1950,1519,1520,2107,5531,2285,2298,5028,2277,1417,2102,1504,1505,1355,1544,2537,2374,2375,2334,2252,1572,5045,5122,1526,1114,1452,2423,1472,1812,1270,13169]);
  function inventoryBossGear(tip,uid){
    let captured;try{captured=JSON.parse(document.documentElement.dataset.roHelperRandomAffixes||'null')}catch{}
    const icon=tip?.querySelector('.tip-item img')?.getAttribute('src')||'';
    const id=captured?.uid===uid?captured.itemId:Number(icon.match(/items\/(\d+)(?:_art)?\.png/i)?.[1]);
    return knownStorageGearIds.has(id)?bossStorageGearIds.has(id):null;
  }
  function inventoryWeaponMatches(filter, type, bossGear) {
    if(filter==="boss")return bossGear===true;
    if (!filter) return true;
    if (filter === "magic") return ["staff","book"].includes(type) || Object.hasOwn(inventoryArmorTypes,type);
    if (filter === "melee") return ["sword","twoHandSword","dagger","knuckle","katar","axe","twoHandAxe","spear","twoHandSpear","mace"].includes(type) || Object.hasOwn(inventoryArmorTypes,type);
    if (filter === "ranged") return ["bow","shuriken","handgun","rifle","shotgun","grenade","instrument","whip"].includes(type) || Object.hasOwn(inventoryArmorTypes,type);
    if (filter === "headgear") return type === "headgear" || Boolean(type?.startsWith("head_"));
    return filter === type;
  }
  function inventoryTypeExcluded(exclude,type) {
    if(!exclude?.length)return false;
    if(!type)return true;
    if(exclude.includes(type))return true;
    if(exclude.includes("weapon") && Object.hasOwn(inventoryWeaponTypes,type))return true;
    if(exclude.includes("headgear") && (type==="headgear" || type.startsWith("head_")))return true;
    return type==="headgear" && exclude.some(key=>key.startsWith("head_"));
  }
  const inventoryNeedsType=rule=>Boolean(rule.weapon || rule.exclude?.length);
  function inventoryRules(settings) {
    const rules = Array.isArray(settings.rules) ? settings.rules : [{terms:settings.terms,page:0}];
    return rules.flatMap(rule => {
      if (!Array.isArray(rule?.terms) || !Number.isInteger(rule.page) || rule.page < 0 || rule.page > 6) return [];
      const terms = [...new Set(rule.terms.filter(term => Object.hasOwn(inventoryTerms,term)))];
      const tier = rule.tier ?? 0;
      const quality = rule.quality ?? 0;
      const weapon = rule.weapon ?? "";
      const exclude=[...new Set((Array.isArray(rule.exclude)?rule.exclude:[]).filter(key=>key==="weapon" || Object.hasOwn(inventoryArmorTypes,key) || Object.hasOwn(inventoryWeaponTypes,key)))];
      if (weapon && !["magic","melee","ranged","boss"].includes(weapon) && !Object.hasOwn(inventoryWeaponTypes,weapon) && !Object.hasOwn(inventoryArmorTypes,weapon)) return [];
      if ((tier !== 0 && !validGearTier(tier)) ||
          !Number.isInteger(quality) || quality < 0 || quality >= inventoryQualities.length) return [];
      return terms.length || tier || quality || weapon || exclude.length ? [{terms,page:rule.page,tier,quality,weapon,exclude}] : [];
    });
  }
  function matchingInventoryRule(bonuses, rules, tier, quality, weaponType, bossGear) {
    bonuses = randomInventoryBonuses(bonuses);
    let best;
    let bestSpecificity = 0;
    for (const rule of rules) {
      const specificity = rule.terms.length + Number(rule.tier > 0) + Number(rule.quality > 0) + Number(Boolean(rule.weapon)) + Number(Boolean(rule.exclude?.length));
      if (specificity <= bestSpecificity) continue;
      if ((rule.tier && (!Number.isInteger(tier) || tier < rule.tier)) || quality < rule.quality) continue;
      if (!inventoryWeaponMatches(rule.weapon,weaponType,bossGear) || inventoryTypeExcluded(rule.exclude,weaponType)) continue;
      if (rule.terms.every(term => bonuses.some(bonus => inventoryTerms[term].test(bonus)))) {
        best = rule;
        bestSpecificity = specificity;
      }
    }
    return best;
  }
  const normalizeBagReserve = (value, fallback) => {
    const count = Number(value);
    return Number.isInteger(count) && count >= 1 && count <= 250 ? count : fallback;
  };
  function inventoryBagRoom() {
    const open = document.querySelector("#lobby-char");
    if (!open || open.disabled) return null;
    open.click();
    const panel = document.querySelector("#charpanel:not(.hidden)");
    if (!panel) return null;
    const originalTab = panel.querySelector(".tab-btn.active");
    const inventoryTab = panel.querySelector('.tab-btn[data-tab="inv"]');
    try {
      if (inventoryTab && !inventoryTab.disabled && inventoryTab !== originalTab) inventoryTab.click();
      const label = panel.querySelector("#cp-bag-cap");
      const text = label?.textContent.normalize("NFKC").replace(/[,，]/g,"") || "";
      const match = text.match(/(?:背包裝備|裝備背包|(?:bag|inventory)\s+equipment|equipment\s+(?:bag|inventory))\s*[:：]?\s*(\d+)\s*\/\s*(\d+)/i);
      return match && Number(match[2]) > 0 ? Math.max(0,Number(match[2])-Number(match[1])) : null;
    } finally {
      if (originalTab && inventoryTab && inventoryTab !== originalTab) originalTab.click();
      panel.querySelector("#cp-back")?.click();
    }
  }
  inventoryButton.onclick = () => {
    const dialog = document.createElement("dialog");
    dialog.id = "ro-helper-settings";
    const account = activeAccount;
    const initial = inventorySettings();
    const form = document.createElement("form");
    form.style.cssText = "display:grid;gap:10px;padding:16px;max-width:320px";
    form.append("漢斯版裝備整理");
    const checkbox = (parent, label, checked) => {
      const row = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = checked;
      row.append(input, " ", label);
      parent.append(row);
      return input;
    };
    const requireFixed = checkbox(form, "沒有固定詞條的裝備不存", initial.requireFixed);
    const store = checkbox(form, "自動存倉（符合的裝備）", initial.store);
    const sell = checkbox(form, "自動賣裝（不符合的裝備）", initial.sell);
    const reserveInput = (name, value, fallback) => {
      const row = document.createElement("label");
      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.max = "250";
      input.step = "1";
      input.required = true;
      input.style.width = "5em";
      input.value = String(normalizeBagReserve(value,fallback));
      row.append(name + " ",input," 格");
      form.append(row);
      return input;
    };
    const soloReserve = reserveInput("單人出發預留",initial.soloReserve,120);
    const partyReserve = reserveInput("組隊出發預留",initial.partyReserve,220);
    form.append("保留與存倉規則 · 只看隨機詞條，★固定詞條不算；同一條規則須全部符合");
    const list = document.createElement("div");
    list.style.cssText = "display:grid;gap:8px";
    const rows = [];
    const savedRules = inventoryRules(initial);
    const tierOptions = document.createElement("datalist");
    tierOptions.id = "ro-helper-inventory-tiers";
    for (const element of document.querySelectorAll(".tip-item .muted, .dr-q, #charpanel [title], #ks-bag [title]")) {
      readInventoryTier(element.getAttribute("title") || element.textContent);
    }
    const availableTiers = [...new Set([...observedGearTiers,...savedRules.map(rule=>rule.tier)])]
      .filter(validGearTier).sort((a,b)=>a-b);
    tierOptions.append(...availableTiers.map(tier=>new Option("Tier "+tier,String(tier))));
    form.append(tierOptions,"Tier 為最低階級。填 4 代表 T4 以上，0 表示不限。");
    function addRule({terms = [],page = 1,tier = 0,quality = 0,weapon = "",exclude = []} = {}) {
      const fieldset = document.createElement("fieldset");
      fieldset.style.cssText = "min-width:0;border:1px solid #a8b9d5;border-radius:6px;padding:6px";
      const destination = document.createElement("select");
      destination.setAttribute("aria-label","存入倉庫頁");
      destination.append(new Option("第一個有空位的頁面","0"));
      for (let i=1;i<=6;i++) destination.append(new Option("倉庫第 "+i+" 頁",String(i)));
      destination.value = String(page);
      const tierField = document.createElement("input");
      tierField.type = "number";
      tierField.min = "0";
      tierField.step = "1";
      tierField.required = true;
      tierField.style.width = "6em";
      tierField.setAttribute("list",tierOptions.id);
      tierField.setAttribute("aria-label","最低裝備 Tier（0 表示不限）");
      tierField.value = String(tier);
      const qualityField = document.createElement("select");
      qualityField.setAttribute("aria-label","最低裝備品質");
      qualityField.append(new Option("不限品質","0"),...inventoryQualities.slice(1).map((name,index) =>
        new Option(name+"以上",String(index+1))));
      qualityField.value = String(quality);
      const weaponField = document.createElement("select");
      weaponField.setAttribute("aria-label","職業／裝備篩選");
      weaponField.append(new Option("不限職業／裝備",""),new Option("王裝（BOSS／MINI 掉落）","boss"),new Option("法系（防具、飾品、法杖、書）","magic"),
        new Option("近戰裝備（防具、飾品、近戰武器）","melee"),
        new Option("遠程裝備（防具、飾品、弓、槍械、手裏劍、樂器、鞭子）","ranged"),
        ...Object.entries(inventoryArmorTypes).map(([key,[label]]) => new Option("只留"+label,key)),
        ...Object.entries(inventoryWeaponTypes).map(([key,[label]]) => new Option("只留"+label,key)));
      weaponField.value = weapon;
      const exclusionBox=document.createElement("details"),exclusionTitle=document.createElement("summary");
      const exclusionChoices=document.createElement("div");exclusionChoices.style.cssText="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px";
      const excludedFields=[];
      for(const [key,[label]]of Object.entries(inventoryArmorTypes))excludedFields.push([key,checkbox(exclusionChoices,label,exclude.includes(key))]);
      const allWeapons=checkbox(exclusionChoices,"武器（全部）",exclude.includes("weapon"));
      const weaponExclusions=Object.entries(inventoryWeaponTypes).map(([key,[label]])=>[key,checkbox(exclusionChoices,label,exclude.includes("weapon") || exclude.includes(key))]);
      excludedFields.push(...weaponExclusions);
      const readExcluded=()=>[...excludedFields.filter(([key,input])=>input.checked && (!allWeapons.checked || !Object.hasOwn(inventoryWeaponTypes,key))).map(([key])=>key),...(allWeapons.checked?["weapon"]:[])];
      const updateExcluded=()=>{const selected=weaponExclusions.filter(([,input])=>input.checked).length;allWeapons.checked=selected===weaponExclusions.length;allWeapons.indeterminate=selected>0&&!allWeapons.checked;exclusionTitle.textContent="項目除外（"+readExcluded().length+"）";};
      allWeapons.onchange=()=>{for(const [,input]of weaponExclusions)input.checked=allWeapons.checked;updateExcluded();};
      for(const [,input]of excludedFields)input.onchange=updateExcluded;
      updateExcluded();exclusionBox.append(exclusionTitle,"勾選的項目不適用這條規則；其他規則與指定存倉仍各自判定。",exclusionChoices);
      const copy = document.createElement("button");
      copy.type = "button";
      copy.textContent = "複製此規則";
      copy.onclick = () => addRule({
        page:Number(destination.value),
        tier:tierField.valueAsNumber,
        quality:Number(qualityField.value),
        weapon:weaponField.value,
        exclude:readExcluded(),
        terms:fields.filter(([,input]) => input.checked).map(([term]) => term)
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "刪除此規則";
      const choices = document.createElement("div");
      choices.style.cssText = "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px";
      const fields = Object.keys(inventoryTerms).map(term => [term,checkbox(choices,term,terms.includes(term))]);
      const row = {destination,tierField,qualityField,weaponField,fields,readExcluded};
      remove.onclick = () => {
        rows.splice(rows.indexOf(row),1);
        fieldset.remove();
      };
      rows.push(row);
      fieldset.append(destination,tierField,qualityField,weaponField,exclusionBox,copy,remove,choices);
      list.append(fieldset);
    }
    if (savedRules.length) savedRules.forEach(addRule);
    else addRule();
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "新增存倉規則";
    add.onclick = () => addRule();
    const feedback = document.createElement("small");
    feedback.setAttribute("role","status");
    form.append(list,add,"條件較多的規則優先，項數相同時使用上方規則。指定頁已滿或未解鎖就留在背包。",feedback);
    form.style.maxHeight = "75dvh";
    form.style.overflowY = "auto";
    const save = document.createElement("button");
    save.textContent = "儲存";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "取消";
    cancel.onclick = () => dialog.close();
    form.append(save, cancel);
    form.onsubmit = event => {
      event.preventDefault();
      if (account !== activeAccount || account === "local") return;
      const rules = rows.map(({destination,tierField,qualityField,weaponField,fields,readExcluded}) => ({
        page:Number(destination.value),tier:tierField.valueAsNumber,quality:Number(qualityField.value),weapon:weaponField.value,exclude:readExcluded(),terms:fields.filter(([,input]) => input.checked).map(([term]) => term)
      }));
      if (rules.some(rule=>rule.tier !== 0 && !validGearTier(rule.tier))) {
        feedback.textContent = "裝備 Tier 請輸入非負整數";
        return;
      }
      if ((store.checked || sell.checked) && (!rules.length || rules.some(rule => !rule.terms.length && !rule.tier && !rule.quality))) {
        feedback.textContent = "每條規則至少設定一個詞條、Tier 或品質，或刪除空白規則";
        return;
      }
      writeSetting("ro-helper-inventory", JSON.stringify({requireFixed:requireFixed.checked,store:store.checked,sell:sell.checked,rules,soloReserve:soloReserve.valueAsNumber,partyReserve:partyReserve.valueAsNumber}));
      inventoryRun = undefined;
      dialog.close();
      status.textContent = "已儲存裝備整理設定";
    };
    dialog.append(form);
    dialog.onclose = () => dialog.remove();
    document.body.append(dialog);
    dialog.showModal();
  };

  let readDropLevelOnReturn = true;
  function readLobbyDropCharacter() {
    const selector = "#charpanel:not(.hidden)";
    let panel = document.querySelector(selector);
    const opened = !panel;
    if (opened) {
      if (document.querySelector(".overlay:not(.hidden), #npc-dialog:not(.hidden), #ro-helper-settings[open], #ro-helper-stage-dialog[open], #ro-helper-target-storage[open]")) return null;
      document.querySelector("#lobby-char:not(:disabled)")?.click();
      panel = document.querySelector(selector);
      if (!panel) return null;
    }
    try {
      const title = panel.querySelector("#cp-title")?.textContent.trim() || "";
      const split = title.lastIndexOf(" · ");
      const baseLevel = Number(panel.querySelector("#cp-level")?.textContent.match(/\bBase\s+Lv\.?\s*(\d+)\b/i)?.[1]);
      if (split <= 0 || !Number.isSafeInteger(baseLevel) || baseLevel < 1) return null;
      return {label:title.slice(0,split),job:title.slice(split+3),baseLevel};
    } finally {
      if (opened) panel.querySelector("#cp-back")?.click();
    }
  }
  const growthStats = {str:"力量 STR",agi:"敏捷 AGI",vit:"體力 VIT",int:"智力 INT",dex:"靈巧 DEX",luk:"幸運 LUK"};
  const growthKey = "ro-helper-character-growth";
  const growthButton = document.createElement("button");
  growthButton.type = "button";
  growthButton.textContent = "轉生／素質";
  function growthSettings() {
    try {
      const saved = JSON.parse(readSetting(growthKey));
      return {
        rebirth:saved?.rebirth === true,
        targets:Array.isArray(saved?.targets) ? saved.targets.filter(({stat,target}) =>
          Object.hasOwn(growthStats,stat) && Number.isSafeInteger(target) && target > 0).slice(0,6) : []
      };
    } catch { return {rebirth:false,targets:[]}; }
  }
  growthButton.onclick = () => {
    if (activeAccount === "local" || document.querySelector("#ro-helper-settings[open]")) return;
    const account = activeAccount;
    const settings = growthSettings();
    const dialog = document.createElement("dialog");
    dialog.id = "ro-helper-settings";
    const form = document.createElement("form");
    form.style.cssText = "display:grid;gap:8px;padding:16px;max-width:360px";
    const rebirth = document.createElement("input");
    rebirth.type = "checkbox";
    rebirth.checked = settings.rebirth;
    const rebirthLabel = document.createElement("label");
    rebirthLabel.append(rebirth," Base Lv 70 起自動轉生");
    form.append("漢斯版轉生與素質",rebirthLabel,
      "轉生會把 Base Lv 和已分配素質重置。素質由上往下點，以角色狀態的總值為準。");
    const rows = [];
    for (let index=0;index<6;index++) {
      const row = document.createElement("div");
      const stat = document.createElement("select");
      stat.setAttribute("aria-label","優先 "+(index+1)+" 素質");
      stat.append(new Option("略過",""),...Object.entries(growthStats).map(([id,label]) => new Option(label,id)));
      stat.value = settings.targets[index]?.stat ?? "";
      const target = document.createElement("input");
      target.type = "number";
      target.min = "1";
      target.step = "1";
      target.placeholder = "目標總值";
      target.setAttribute("aria-label","優先 "+(index+1)+" 目標總值");
      target.style.width = "7em";
      target.value = settings.targets[index]?.target ?? "";
      stat.onchange = () => { target.disabled = !stat.value; target.required = Boolean(stat.value); };
      stat.onchange();
      row.append((index+1)+". ",stat," ",target);
      form.append(row);
      rows.push({stat,target});
    }
    const save = document.createElement("button");
    save.textContent = "儲存";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "取消";
    cancel.onclick = () => dialog.close();
    const feedback = document.createElement("small");
    feedback.setAttribute("role","status");
    form.append(feedback,save,cancel);
    form.onsubmit = event => {
      event.preventDefault();
      if (account !== activeAccount) return dialog.close();
      const targets = rows.filter(row => row.stat.value).map(({stat,target}) => ({stat:stat.value,target:target.valueAsNumber}));
      if (new Set(targets.map(row => row.stat)).size !== targets.length) {
        feedback.textContent = "每種素質請只設定一次。";
        return;
      }
      writeSetting(growthKey,JSON.stringify({rebirth:rebirth.checked,targets}));
      nextGrowthCheck = 0;
      dialog.close();
    };
    dialog.addEventListener("close",() => dialog.remove(),{once:true});
    dialog.append(form);
    document.body.append(dialog);
    dialog.showModal();
  };

  let growthRun;
  let nextGrowthCheck = 0;
  function displayedGrowthTotal(row) {
    const value = row?.querySelector(".prim-val");
    if (!value) return NaN;
    const bonus = value.querySelector(".prim-bonus");
    const suffix = bonus?.textContent.trim();
    const base = value.textContent.trim().slice(0,suffix ? -suffix.length : undefined).trim();
    if (!/^\d+(?:\.\d+)?$/.test(base)) return NaN;
    if (!suffix) return Number(base);
    const match = suffix.match(/^\+\s*([+-]?\d+(?:\.\d+)?)$/);
    return match ? Number(base)+Number(match[1]) : NaN;
  }
  function allocateGrowthStats(panel, targets) {
    let spent = 0;
    for (const {stat,target} of targets) {
      for (;;) {
        const add = panel.querySelector(`#cp-prim .prim-btn[data-s="${stat}"][data-d="1"]`);
        const row = add?.closest(".prim-row");
        const before = displayedGrowthTotal(row);
        if (!Number.isFinite(before)) return spent;
        if (before >= target) break;
        if (add.disabled || spent >= 200) return spent;
        add.click();
        const updated = panel.querySelector(`#cp-prim .prim-btn[data-s="${stat}"][data-d="1"]`);
        if (!(displayedGrowthTotal(updated?.closest(".prim-row")) > before)) return spent;
        spent++;
      }
    }
    return spent;
  }
  function runCharacterGrowth() {
    if (!taiwanGame || !/^account\./.test(activeAccount) || !document.body.classList.contains("in-lobby") ||
        document.querySelector("#hud:not(.hidden), #gameover:not(.hidden)")) return false;
    const now = Date.now();
    const settings = growthSettings();
    const finish = (message,wait=15000) => {
      if (growthRun) requestLobbyNpc("cancel");
      growthRun = undefined;
      nextGrowthCheck = now+wait;
      if (message) status.textContent = message;
      return false;
    };
    if (growthRun) {
      if (growthRun.account !== activeAccount || !settings.rebirth) return finish();
      const dialog = document.querySelector("#npc-dialog:not(.hidden)");
      if (dialog?.querySelector("#npc-name")?.textContent.trim() === "轉生師") {
        const text = dialog.querySelector("#npc-text")?.textContent || "";
        const primary = dialog.querySelector("#npc-options button.primary:not(:disabled)");
        if (growthRun.phase === "seek" && /Base Lv\s*(\d+)/.test(text) &&
            Number(text.match(/Base Lv\s*(\d+)/)?.[1]) >= 70 && primary?.textContent.trim() === "轉生") {
          growthRun.phase = "confirm";
          primary.click();
          return true;
        }
        if (growthRun.phase === "confirm" && /確定要轉生/.test(text) && /Base Lv\s*會回到\s*1/.test(text) &&
            primary?.textContent.trim() === "轉生") {
          growthRun.phase = "waiting";
          growthRun.expires = now+45000;
          primary.click();
          return true;
        }
        const close = [...dialog.querySelectorAll("#npc-options button")].find(button => button.textContent.trim() === "關閉");
        if (close && (growthRun.phase !== "waiting" || /轉生完成|發生錯誤|連不上|到上限|找不到|登入帳號/.test(text))) {
          close.click();
          const completed = text.includes("轉生完成");
          if (completed) readDropLevelOnReturn = true;
          finish(completed ? "轉生完成，準備依序點素質" : "目前無法轉生",completed ? 0 : 60000);
          return completed;
        }
      }
      if (now >= growthRun.expires) return finish("轉生流程逾時，稍後重新確認角色等級",60000);
      if (!dialog && growthRun.phase === "seek") requestLobbyNpc("rebirth");
      return true;
    }
    if (now < nextGrowthCheck || (!settings.rebirth && !settings.targets.length) ||
        (inventoryRun && !inventoryRun.done) ||
        document.querySelector(".overlay:not(.hidden), #npc-dialog:not(.hidden), #ro-helper-settings[open], #ro-helper-stage-dialog[open], #ro-helper-target-storage[open]")) return false;
    const open = document.querySelector("#lobby-char:not(:disabled)");
    if (!open) return false;
    nextGrowthCheck = now+15000;
    open.click();
    const panel = document.querySelector("#charpanel:not(.hidden)");
    if (!panel) return false;
    const originalTab = panel.querySelector(".tab-btn.active");
    const stats = panel.querySelector('.tab-btn[data-tab="stats"]');
    try {
      const levelText = panel.querySelector("#cp-level")?.textContent || "";
      const level = Number(levelText.match(/Base\s*Lv\.?\s*(\d+)/i)?.[1]);
      const rebirthCount = Number(levelText.match(/轉生\s*(\d+)/)?.[1] ?? 0);
      if (settings.rebirth && level >= 70 && rebirthCount < 10) {
        growthRun = {phase:"seek",account:activeAccount,expires:now+35000};
        status.textContent = "前往轉生師";
        return true;
      }
      if (settings.targets.length && stats && !stats.disabled) {
        if (stats !== originalTab) stats.click();
        const spent = allocateGrowthStats(panel,settings.targets);
        if (spent) status.textContent = "已依設定分配 "+spent+" 次素質";
      }
      return false;
    } finally {
      if (stats && originalTab && stats !== originalTab && stats.classList.contains("active")) originalTab.click();
      panel.querySelector("#cp-back")?.click();
    }
  }

  let nextLobbySelectionAt = 0;
  function handleLobbySelection() {
    const dialog = document.querySelector("#npc-dialog:not(.hidden) .lb-pick");
    if (!dialog || !dialog.getClientRects().length) return false;
    const choices = [...dialog.querySelectorAll("button[data-lb]")].filter(button=>
      !button.disabled && button.getClientRects().length && !button.closest("[hidden],[inert],[aria-hidden=true]"));
    if (inventoryRun && !inventoryRun.done) {
      inventoryRun.expires = Math.max(inventoryRun.expires || 0,Date.now()+35000);
      inventoryRun.next = Date.now()+800;
    }
    if (!choices.length) { status.textContent = "大廳暫時無空位，等待可用大廳"; return true; }
    if (Date.now() < nextLobbySelectionAt) return true;
    const choice = choices.find(button=>button.querySelector("em")) || choices.find(button=>button.classList.contains("me")) || choices[0];
    nextLobbySelectionAt = Date.now()+1000;
    status.textContent = "正在選擇大廳："+(choice.querySelector("b")?.textContent.trim() || choice.textContent.trim());
    choice.click();
    return true;
  }
  function runInventoryCleanup() {
    if (handleLobbySelection()) return true;
    if (!taiwanGame || activeAccount === "local") return false;
    if (!document.body.classList.contains("in-lobby")) {
      inventoryRun = undefined;
      return false;
    }
    const settings = inventorySettings();
    const rules = inventoryRules(settings);
    const manual = inventoryRun?.manual === true;
    if ((!manual && !settings.store && !settings.sell && !targetStorageRules.size) || (!rules.length && !targetStorageRules.size)) return false;
    const find = selector => document.querySelector(selector);
    const reserve = find(".pf-leave[data-leave]") || previewDifficultyMode() === "party"
      ? normalizeBagReserve(settings.partyReserve,220) : normalizeBagReserve(settings.soloReserve,120);
    if (inventoryRun?.done && inventoryRun.reserve === reserve) return false;
    if (find("#ro-helper-settings[open], #ro-helper-stage-dialog[open], #ro-helper-target-storage[open]")) return true;
    let run = inventoryRun;
    if (!run || run.done) {
      if (find(".overlay:not(.hidden)")) {
        const close = find("#stages:not(.hidden) #stg-close") ||
          (find("#npc-dialog:not(.hidden) #npc-text .diff") &&
           find("#npc-dialog:not(.hidden) #npc-options button:not(.primary)"));
        if (!close || close.disabled) return false;
        close.click();
        requestLobbyNpc("cancel");
        status.textContent = "暫停出發，先檢查背包容量";
        return true;
      }
      run = inventoryRun = {phase:"check",reserve,expires:0,next:0,reject:new Set(),stored:0};
    }
    run.reserve = reserve;
    const warehouse = find("#kstorage:not(.hidden)");
    const shop = find("#shop:not(.hidden)");
    const finish = message => {
      find("#ks-tip-x")?.click();
      if (warehouse) find("#ks-close")?.click();
      if (shop) find("#shop-close")?.click();
      requestLobbyNpc("cancel");
      status.textContent = message;
      if (run.manual) run.done = true;
      else {
        run.phase = "recheck";
        run.next = Date.now()+500;
      }
      return true;
    };
    if (Date.now() < run.next) return true;
    if (["check","recheck"].includes(run.phase)) {
      if (find(".overlay:not(.hidden)")) return true;
      const room = inventoryBagRoom();
      if (room !== null && room >= reserve) {
        run.done = true;
        status.textContent = "背包剩餘 " + room + " 格，可出發";
        return true;
      }
      if (room === null) {
        status.textContent = "暫停出發：讀不到背包空間，稍後重查";
        run.next = Date.now()+15000;
        return true;
      }
      if (run.phase === "recheck") {
        if (room === 0) {
          run.phase = "check";
          run.next = Date.now()+30000;
          status.textContent = "背包整理後仍滿，暫停出發，30 秒後重查";
          return true;
        }
        run.done = true;
        status.textContent = "整理後背包剩餘 " + room + " 格，繼續出發";
        return true;
      }
      run.reject.clear();
      run.stored = 0;
      run.phase = "open";
      run.expires = Date.now()+35000;
    }
    if (Date.now() > run.expires) return finish("裝備整理逾時，正在重新檢查背包");
    run.next = Date.now()+100;
    if (run.phase === "open") {
      if (!warehouse) {
        requestLobbyNpc("kstorage");
        status.textContent = "正在前往卡普拉倉庫整理裝備";
        return true;
      }
      const all = find('#ks-filt [data-f="all"]');
      if (!all) return true;
      const search = find("#ks-q");
      if (search?.value) {
        search.value = "";
        search.dispatchEvent(new Event("input",{bubbles:true}));
      }
      all.click();
      for (let page = 0; page < 30; page++) {
        const previous = find("#ks-bp-prev:not(:disabled)");
        if (!previous) break;
        previous.click();
      }
      run.phase = "scan";
      run.seen = new Set();
    }
    if (run.phase === "scan") {
      if (!warehouse) return finish("倉庫已關閉，裝備整理已停止");
      const cells = [...warehouse.querySelectorAll("#ks-bag [data-uid]")];
      const filterByType = rules.some(inventoryNeedsType);
      let gameGear;
      if (filterByType || settings.requireFixed) {
        try { gameGear = JSON.parse(document.documentElement.dataset.roHelperGearSlots || "null"); } catch {}
      }
      for (const cell of cells) {
        const uid = cell.dataset.uid;
        if (!uid || run.seen.has(uid)) continue;
        run.seen.add(uid);
        if (cell.matches(".ks-off,.worn,.equipped") || cell.querySelector(".safe-tag,.qty")) continue;
        // The game handles data-info through event delegation, including on desktop.
        const info = document.createElement("span");
        info.dataset.info = uid;
        cell.append(info);
        delete document.documentElement.dataset.roHelperRandomAffixes;
        document.dispatchEvent(new CustomEvent("ro-helper-random-affixes",{detail:uid}));
        try{info.click();}finally{document.dispatchEvent(new CustomEvent("ro-helper-random-affixes",{detail:""}));info.remove();}
        const tip = find("#ks-tip");
        const close = tip?.querySelector("#ks-tip-x");
        if (!close || !tip.querySelector(".tip-item")) {
          close?.click();
          continue;
        }
        const cardLine = [...tip.querySelectorAll(".ro-body > .muted")].find(el =>
          /^(?:卡片|Cards|Cartas)\s*[:：]/i.test(el.textContent.trim()));
        const hasCard = cardLine && !/(?:空|free|libres|livres|empty)/i.test(cardLine.textContent);
        const forcedTarget=findTargetStorageRule(tip,gearIdByUid.get(uid));
        if(forcedTarget?.action==="sell"&&!forcedTarget.ambiguous){
          close.click();if(!hasCard)run.reject.add(uid);continue;
        }
        const bonuses = inventoryRandomAffixLines(uid);
        if(bonuses===null){close.click();continue;}
        const tierText = tip.querySelector(".tip-item .muted")?.textContent.normalize("NFKC") || "";
        const tier = readInventoryTier(tierText);
        const grade = [...cell.classList].map(name => name.match(/^q(\d+)$/)?.[1]).find(Boolean);
        const quality = grade === undefined ? 0 : Number(grade);
        const weaponType = filterByType ? readInventoryWeaponType(tip,tierText,gameGear) : null;
        const bossGear=inventoryBossGear(tip,uid);
        const fixed = settings.requireFixed ? inventoryHasFixedAffixes(tip,uid,gameGear) : true;
        const target = findTargetStorageRule(tip,gearIdByUid.get(uid));
        if(!target && (fixed===null || (bossGear===null && rules.some(rule=>rule.weapon==="boss")))){close.click();continue;}
        const rule = target ? selectTargetStorageRule(target,bonuses,tier,quality) : !fixed ? undefined :
          matchingInventoryRule(bonuses,rules,tier,quality,weaponType,bossGear);
        close.click();
        if (hasCard || target?.ambiguous || (target?.tier && !Number.isInteger(tier))) continue;
        if (rule && (target || settings.store || manual)) {
          const page = [...warehouse.querySelectorAll("#ks-pages [data-p]:not(.lock)")].find(el => {
            if (rule.page && Number(el.dataset.p) !== rule.page) return false;
            const capacity = el.querySelector("small")?.textContent.match(/^(\d+)\/(\d+)$/);
            return capacity && Number(capacity[1]) < Number(capacity[2]);
          });
          if (page) {
            if (!page.classList.contains("active")) page.click();
            const item = warehouse.querySelector("#ks-bag [data-uid=" + CSS.escape(uid) + "]");
            if (item) {
              item.click();
              if (warehouse.querySelector("#ks-st [data-uid=" + CSS.escape(uid) + "]")) {
                run.stored++;
                recordDisposition(uid,"存倉",target?"指定存倉":"裝備整理存倉");
              }
              run.expires = Date.now()+35000;
              return true;
            }
          }
        }
        const canSell = settings.sell || (manual && rules.length > 0 && !target);
        if (!rule && canSell &&
            (Number.isInteger(tier) || (!targetStorageRules.size && !rules.some(setting => setting.tier))) &&
            (target || ((weaponType !== null || !rules.some(inventoryNeedsType)) &&
              (weaponType !== "headgear" || !rules.some(setting => setting.weapon?.startsWith("head_") || setting.exclude?.some(key=>key.startsWith("head_"))))))) run.reject.add(uid);
      }
      const next = find("#ks-bp-next:not(:disabled)");
      if (next) {
        next.click();
        return true;
      }
      if (!run.reject.size) return finish("裝備整理完成，存倉 " + run.stored + " 件");
      find("#ks-close")?.click();
      run.phase = "shop";
      run.expires = Date.now()+35000;
      return true;
    }
    if (run.phase === "shop") {
      if (!shop) {
        requestLobbyNpc("vendor");
        status.textContent = "正在前往礦石商人出售裝備";
        return true;
      }
      const all = shop.querySelector('#shop-filters [data-f="all"]');
      if (!all) return true;
      if (!all.classList.contains("active")) all.click();
      const grid = shop.querySelector("#shop-items");
      if (!grid || grid.querySelector(".picked")) return finish("商店有既有選取，已停止自動賣裝");
      const candidates = [...grid.querySelectorAll("[data-uid]:not(.worn):not(.safe)")].filter(el => run.reject.has(el.dataset.uid));
      if (!candidates.length) return finish("裝備整理完成，存倉 " + run.stored + " 件");
      for (const item of candidates) {
        grid.querySelector("[data-uid=" + CSS.escape(item.dataset.uid) + "]")?.click();
      }
      const picked = [...grid.querySelectorAll(".picked")];
      if (picked.length !== candidates.length || picked.some(el => !run.reject.has(el.dataset.uid))) {
        return finish("商店選取與出售清單不符，已停止賣裝");
      }
      find("#shop-sell-btn:not(:disabled)")?.click();
      const confirm = find("#npc-dialog:not(.hidden) #npc-options button.primary");
      if (!confirm || !/^(?:賣出|販賣|出售|賣掉|賣|Vender|Sell|Confirmar venda)$/i.test(confirm.textContent.trim())) {
        return finish("讀不到出售確認按鈕，已停止賣裝");
      }
      run.phase = "sold";
      run.selling = picked.map(el => el.dataset.uid);
      confirm.click();
      return true;
    }
    if (!shop) return finish("商店已關閉，裝備整理已停止");
    if (shop.querySelector('#shop-filters [data-f="all"].active') &&
        !shop.querySelector("#shop-items .picked") &&
        run.selling.every(uid => !shop.querySelector("#shop-items [data-uid=" + CSS.escape(uid) + "]"))) {
      for (const uid of run.selling) recordDisposition(uid,"賣出");
      return finish("裝備整理完成，存倉 " + run.stored + " 件，賣出 " + run.selling.length + " 件");
    }
    return true;
  }

  function refreshStageMode() {
    expeditionLap.hidden = stageMode.value === "highest";
    fixedStage.hidden = stageMode.value !== "fixed" && stageMode.value !== "boss";
    bossTarget.hidden = !taiwanGame || stageMode.value !== "boss";
    rotationSettings.hidden = stageMode.value !== "rotation";
    rotationProgress.hidden = stageMode.value !== "rotation";
    refreshStageDropPreview();
  }
  function validatedStageConfig(input, control) {
    if (!input || typeof input !== "object" || !control || !Array.isArray(control.stages)) return null;
    if (!input.mode) {
      return input.stage === "highest" || control.stages.includes(input.stage) ? {stage:input.stage} : null;
    }
    if (control.configVersion !== 1 || !["fixed","highest","rotation","boss"].includes(input.mode)) return null;
    if (input.mode === "boss" && !control.bossEnabled) return null;
    const config = {mode:input.mode};
    let stages = control.stages;
    if (input.lap !== undefined) {
      if (input.mode === "highest" || !Number.isInteger(input.lap) ||
          !Array.isArray(control.laps?.[input.lap])) return null;
      config.lap = input.lap;
      stages = control.laps[input.lap];
    }
    if (input.mode === "fixed" || input.mode === "boss") {
      if (!stages.includes(input.stage)) return null;
      config.stage = input.stage;
      if (input.mode === "boss") {
        if (typeof input.boss !== "string" || !input.boss.trim() || input.boss.length > 80) return null;
        config.boss = input.boss.trim();
      }
    }
    if (input.mode === "rotation") {
      if (!Array.isArray(input.rotation) || !input.rotation.length || input.rotation.length > 120 ||
          !input.rotation.every(stage => stages.includes(stage)) ||
          !Number.isInteger(input.repeats) || input.repeats < 1 || input.repeats > 9999) return null;
      config.rotation = [...new Set(input.rotation)];
      config.repeats = input.repeats;
    }
    if (input.difficulty !== undefined) {
      const {kind,values} = input.difficulty || {};
      const fields = ["solo","party"].includes(kind) && control.difficulties?.[kind]?.fields;
      if (!Array.isArray(fields) || !fields.length || (input.mode === "boss" && kind !== "solo")) return null;
      const validated = {};
      for (const {key,min,max} of fields) {
        const value = values?.[key];
        if (!Number.isInteger(value) || value < min || value > max) return null;
        validated[key] = value;
      }
      config.difficulty = {kind,values:validated};
    }
    return config;
  }
  function remoteStageControl(applied,received) {
    const difficulties = Object.fromEntries(["solo","party"].map(kind => {
      const fields = difficultyFields.map(([key,label,soloMax,partyMax]) => {
        const observed = observedDifficulty.get(kind + ":" + key);
        return {key,label,min:observed?.min ?? difficultyScale(key),
          max:observed?.max ?? (taiwanGame && key !== "tier" ? 2000 : kind === "solo" ? soloMax : partyMax)};
      });
      const saved = getDifficulty(kind);
      const values = Object.fromEntries(fields.map(({key,min,max}) =>
        [key,Math.min(max,Math.max(min,Math.round(saved?.[key] ?? min)))]));
      return [kind,{fields,values}];
    }));
    return {
      stages:[...fixedStage.options].map(option => option.value).filter(Boolean),
      ...(taiwanGame ? {
        lap:Number(expeditionLap.value),
        laps:Object.fromEntries(lapLabels.map((_,index) => [index+1,stageNamesForLap(index+1)]))
      } : {}),
      mode:stageMode.selectedOptions[0]?.textContent || "",
      modeId:stageMode.value,
      selected:stageMode.value === "highest" ? "highest" : fixedStage.value,
      configVersion:1,bossEnabled:taiwanGame,boss:bossForStage(fixedStage.value,bossTarget.value)?.[1] || "",
      bossSuggestions:bossesForStage(fixedStage.value).map(([,name]) => name),
      rotation:rotationStages(),repeats:repeatCount(stageRepeats.value),difficulties,applied,received
    };
  }
  function applyRemoteStageConfig(config) {
    const mode = config.mode ?? (config.stage === "highest" ? "highest" : "fixed");
    if (config.lap !== undefined) writeSetting("ro-helper-expedition-lap",String(config.lap));
    writeSetting("ro-helper-stage-mode",mode);
    if (mode === "fixed" || mode === "boss") writeSetting("ro-helper-stage",config.stage);
    if (mode === "boss") writeSetting("ro-helper-boss-target",bossForStage(config.stage,config.boss)?.[0] || "");
    if (mode === "rotation") {
      writeSetting("ro-helper-stage-rotation",JSON.stringify(config.rotation));
      writeSetting("ro-helper-stage-repeats",String(config.repeats));
    }
    if (config.difficulty) {
      writeSetting(difficultyKey(config.difficulty.kind),JSON.stringify(config.difficulty.values));
      const targets = mode==="rotation" ? config.rotation : ["fixed","boss"].includes(mode) ? [config.stage] : [];
      for(const stage of targets) localStorage.removeItem(settingKey(stageDifficultyKey(config.difficulty.kind,stage,config.lap ?? expeditionLap.value)));
    }
    loadStageSettings();
  }
  function loadStageSettings() {
    expeditionSpeed.value = readSetting("ro-helper-expedition-speed") === "2" ? "2" : "1";
    const lap = localStorage.getItem(settingKey("ro-helper-expedition-lap"));
    expeditionLap.value = lap && lapLabels[Number(lap)-1] ? lap : "1";
    stageMode.value = readSetting("ro-helper-stage-mode") ||
      ((readSetting("ro-helper-stage") ?? sessionStorage.getItem("ro-helper-stage")) === highestStageMode ? "highest" : "fixed");
    stageRepeats.value = String(repeatCount(readSetting("ro-helper-stage-repeats")));
    rotationProgress.textContent = "";
    refreshStageChoices();
    refreshBossOptions();
    refreshStageMode();
  }
  stageMode.addEventListener("change", () => {
    writeSetting("ro-helper-stage-mode", stageMode.value);
    refreshStageMode();
  });
  fixedStage.addEventListener("change", () => {
    writeSetting("ro-helper-stage", fixedStage.value);
    refreshBossOptions();
    refreshStageDropPreview();
  });
  bossTarget.addEventListener("change", () => writeSetting("ro-helper-boss-target",bossTarget.value.trim()));
  stageRepeats.addEventListener("change", () => {
    stageRepeats.value = String(repeatCount(stageRepeats.value));
    writeSetting("ro-helper-stage-repeats", stageRepeats.value);
  });
  loadStageSettings();

  const gsAdvisorButton = document.createElement("button");
  gsAdvisorButton.type = "button";
  gsAdvisorButton.textContent = "GS 建議";
  let readingGsAdvice = false;
  async function ensureGsAdviceReady(account){
 if(!document.body.classList.contains('in-lobby'))throw Error('請先回廣場讀取分析');
 document.querySelector('#stages:not(.hidden) #stg-close')?.click();
 const identity=readLobbyDropCharacter();if(!identity?.label)throw Error('請先開啟角色面板，確認角色名稱後重試');
 for(let attempt=0;attempt<40&&!document.querySelector('#stages:not(.hidden) #stg-gs b');attempt++){
  if(account!==activeAccount)throw Error('帳號已切換');requestLobbyNpc('captain');await new Promise(resolve=>setTimeout(resolve,250));
 }
 await window.__roGearPrepareAnalysis(identity.label);
 if(account!==activeAccount)throw Error('帳號已切換');
 document.querySelector('#stages:not(.hidden) #stg-close')?.click();
  }
  async function openGsAdvice() {
    if (readingGsAdvice || document.getElementById("ro-helper-gs-advice")) return;
    if (!taiwanGame) { status.textContent = "GS 建議目前支援漢斯版"; return; }
    readingGsAdvice = true;
    gsAdvisorButton.disabled = true;
    const account = activeAccount;
    try {
      await ensureGsAdviceReady(account);
      if (account !== activeAccount) throw Error("角色已切換，請重新讀取");
      showGsAdvice(account);
    } catch(error) { status.textContent = error.message; }
    finally { requestLobbyNpc("cancel");readingGsAdvice=false;gsAdvisorButton.disabled=false; }
  }
  function showGsAdvice(account) {
    const dialog = document.createElement("dialog");
    dialog.id = "ro-helper-gs-advice";
    dialog.setAttribute("aria-label","GS 提升建議");
    dialog.style.cssText = "width:min(760px,calc(100vw - 24px));max-height:85dvh;overflow:auto;padding:16px;box-sizing:border-box;color:#173569;background:#f7f9ff";
    const heading = document.createElement("h2");heading.textContent = "GS 提升建議";
    const identity = document.createElement("p"), reach = document.createElement("p");
    const explanation = document.createElement("p");
    explanation.textContent = "開啟視窗或按「重新分析」時讀取角色與可入場關卡。沿用遊戲 GS 公式，保留目前階級、品質、強化、升星及其他卡片；每條建議單獨比較，分數不可直接相加。詞綴為同類別單條試算，不代表可單獨洗鍊；技能傷害詞綴暫不建議更換。GS 提升不等於實戰傷害提升。";
    const bossLabel = document.createElement("label"), bossCheck = document.createElement("input");
    bossCheck.type="checkbox";bossCheck.checked=readSetting("ro-helper-gs-boss-cards")==="on";
    bossLabel.append(bossCheck," 包含王卡／小王卡（預設排除）");
    const feedback = document.createElement("p");feedback.setAttribute("role","status");
    const list = document.createElement("div"), reload = document.createElement("button"), close = document.createElement("button");
    reload.textContent="重新分析";close.textContent="關閉";
    close.onclick=()=>dialog.close();
    let adviceMode="affix", lastAdvice;
    const tabs=document.createElement("div"), affixTab=document.createElement("button"), cardTab=document.createElement("button");
    tabs.style.cssText="display:flex;gap:8px;margin:10px 0";
    tabs.append(affixTab,cardTab);
    affixTab.onclick=()=>{adviceMode="affix";if(lastAdvice)render(lastAdvice);};
    cardTab.onclick=()=>{adviceMode="card";if(lastAdvice)render(lastAdvice);};
    const labels={weapon:"武器",shield:"盾牌",armor:"護甲",garment:"披肩",shoes:"鞋子",acc1:"飾品一",acc2:"飾品二",accessory1:"飾品一",accessory2:"飾品二",head_top:"頭上",head_mid:"頭中",head_low:"頭下"};
    let viewedCharacterId;
    function apply(source) {
      if (account!==activeAccount) { feedback.textContent="帳號已切換，請重新開啟";return; }
      document.dispatchEvent(new CustomEvent("ro-helper-gs-request",{detail:JSON.stringify({includeBoss:bossCheck.checked})}));
      let current;try{current=JSON.parse(document.documentElement.dataset.roHelperGsAdvice || "null");}catch{}
      if (current?.id !== viewedCharacterId || !current.frontier?.some(s=>s.id===source.stageId && s.lap===source.lap)) { feedback.textContent="角色或可入場範圍已改變，請重新分析";return; }
      if (partyMode.value!=="off") { feedback.textContent="這條提前退出路線限單人使用，請先關閉組隊模式";return; }
      const boss = source.bossId && bossForStage(source.stage,source.bossId);
      if (!boss) { feedback.textContent="此來源尚無可套用的收尾首領，請自行選關；不會猜測退出時間";return; }
      writeSetting(seenStageKey(String(source.lap)),JSON.stringify([...new Set([...readNames(seenStageKey(String(source.lap))),source.stage])]));
      writeSetting("ro-helper-expedition-lap",String(source.lap));
      writeSetting("ro-helper-stage",source.stage);
      writeSetting("ro-helper-stage-mode","boss");
      writeSetting("ro-helper-boss-target",boss[0]);
      loadStageSettings();
      feedback.textContent="已套用下場循環："+source.stage+" · "+source.lap+"周目，擊敗"+boss[1]+"後收完裝備／卡片退出重刷";
    }
    function render(data) {
      if (data.error) {feedback.textContent=data.error;return;}
      if (account!==activeAccount) {feedback.textContent="帳號已切換，請關閉後重新讀取";list.replaceChildren();return;}
      if (viewedCharacterId !== undefined && viewedCharacterId !== data.id) { list.replaceChildren();feedback.textContent="角色已切換，請關閉後重新讀取";return; }
      viewedCharacterId=data.id;
      lastAdvice=data;
      affixTab.textContent="詞綴提升（"+data.items.reduce((n,item)=>n+item.affixes.length,0)+"）";
      cardTab.textContent="卡片提升（"+data.items.reduce((n,item)=>n+item.cards.length,0)+"）";
      affixTab.setAttribute("aria-pressed",String(adviceMode==="affix"));
      cardTab.setAttribute("aria-pressed",String(adviceMode==="card"));
      identity.textContent=data.name+" · "+(data.jobName||data.job)+" · GS "+data.gs;
      const frontier=[1,2].map(ch=>data.frontier.filter(s=>s.chapter===ch).sort((a,b)=>b.lap-a.lap).filter((s,i,a)=>s.lap===a[0]?.lap).at(-1)).filter(Boolean);
      reach.textContent="目前可入場範圍："+frontier.map(s=>"第"+s.chapter+"章 "+s.lap+"周目 · "+s.name).join("；");
      feedback.textContent="已更新。能入場的 GS／解鎖條件不保證能打贏；來源按已知出怪時段規劃，未估算實際掉率。";
      list.replaceChildren();
      for(const item of data.items) {
        const section=document.createElement("section");
        section.style.cssText="border:1px solid #cbd6ef;border-radius:8px;padding:10px;margin:10px 0";
        const title=document.createElement("strong");
        title.textContent=(labels[item.slot]||item.slot)+" · "+item.name+" · T"+item.tier+" · GS "+item.score;
        const details=document.createElement("details"),summary=document.createElement("summary"),current=document.createElement("p");
        summary.textContent="目前詞綴／卡片";
        current.textContent="固定："+(item.fixed.join("、")||"無")+"；隨機："+(item.currentAffixes.join("、")||"無")+"；卡片："+item.currentCards.map((c,i)=>(i+1)+". "+c.name+"（GS "+c.score+"）").join("、");
        details.append(summary,current);section.append(title,details);
        if(adviceMode==="card") {
          const p=document.createElement("p");
          p.textContent=item.cards.length ? "卡片提升建議" : !item.currentCards.length ? "此裝備沒有卡槽" : !data.candidateCards ? "目前可入場範圍未讀到卡片來源" : !item.compatibleCards ? "目前可刷範圍沒有讀到適用此部位的其他卡片" : "已比較 "+item.compatibleCards+" 種可刷卡片，目前沒有比已插卡更高 GS 的替換";
          if(!item.cards.length && item.bestCard) p.textContent+="；最高候選："+item.bestCard.name+"（GS "+(item.bestCard.delta>=0?"+":"")+item.bestCard.delta+"）";
          section.append(p);
        }
        if(adviceMode==="affix" && !item.affixes.length) {const p=document.createElement("p");p.textContent="目前沒有可提升 GS 的一般詞綴替換";section.append(p);}
        if(adviceMode==="affix" && item.affixes.length) {
          const p=document.createElement("p");p.textContent="詞綴替換（同條詞綴類別、保持原本數值檔次）";section.append(p);
          for(const change of item.affixes) {
            const row=document.createElement("p");
            row.textContent="第"+(change.index+1)+"條："+change.from+" → "+change.to+"　GS +"+change.delta+"（全身 "+(data.gs+change.delta)+"）";
            section.append(row);
          }
        }
        for(const card of adviceMode==="card" ? item.cards : []) {
          const row=document.createElement("div");row.style.cssText="border-top:1px solid #dce3f3;padding:7px 0";
          const p=document.createElement("p");p.textContent="卡槽"+(card.socket+1)+"："+card.current+" → "+card.name+"　GS +"+card.delta+"（全身 "+(data.gs+card.delta)+"）";
          const effect=document.createElement("p");effect.textContent=card.effects.join("、");
          const source=document.createElement("p");source.textContent="來源：第"+card.source.chapter+"章 "+card.source.lap+"周目 · "+card.source.stage+" · "+card.source.monsterName+"；"+(card.source.windowText||"出怪時段資料不足");
          const plan=document.createElement("p");plan.textContent=card.source.bossId ? "刷法：刷到 "+formatElapsed(card.source.seconds)+" 的"+card.source.bossName+"，打死後撿完裝備與卡片再退出重刷" : "未找到可靠的收尾首領，不自動套用提前退出";
          row.append(p,effect,source,plan);
          if(card.source.bossId){const button=document.createElement("button");button.textContent="套用下場循環";button.onclick=()=>apply(card.source);row.append(button);}
          section.append(row);
        }
        list.append(section);
      }
    }
    const read = () => {
      if(account!==activeAccount){feedback.textContent="帳號已切換，請重新開啟";list.replaceChildren();return;}
      document.dispatchEvent(new CustomEvent("ro-helper-gs-request",{detail:JSON.stringify({includeBoss:bossCheck.checked})}));
      let data;try{data=JSON.parse(document.documentElement.dataset.roHelperGsAdvice || "null");}catch{}
      if(!data || Date.now()-data.at>3000){feedback.textContent="GS 讀取連線尚未準備完成，請重新讀取";return;}
      render(data);
    };
    bossCheck.onchange=()=>{writeSetting("ro-helper-gs-boss-cards",bossCheck.checked?"on":"off");read();};
    reload.onclick=read;
    const scrollArea=document.createElement("div"),footer=document.createElement("div");
    scrollArea.style.cssText="flex:1;min-height:0;overflow:auto;overscroll-behavior:contain";
    footer.style.cssText="flex:0 0 auto;border-top:1px solid #cbd6ef;padding-top:10px;margin-top:8px;text-align:right;background:#f7f9ff";
    close.style.cssText="padding:8px 24px;cursor:pointer";
    scrollArea.append(heading,identity,reach,explanation,bossLabel,reload,tabs,list,feedback);
    footer.append(close);dialog.append(scrollArea,footer);
    dialog.style.overflow="hidden";
    document.body.append(dialog);dialog.showModal();
    dialog.style.display="flex";dialog.style.flexDirection="column";read();
    dialog.onclose=()=>dialog.remove();
  }
  gsAdvisorButton.onclick=openGsAdvice;

  const chestMode = document.createElement("select");
  chestMode.setAttribute("aria-label", "撿取寶箱");
  chestMode.append(new Option("會撿取寶箱","collect"), new Option("不撿取寶箱（可經過）","pass"), new Option("躲避寶箱","avoid"),
    new Option("發現率達門檻後保存寶箱","discovery"));
  const chestDiscoverySetting = document.createElement("div");
  const chestDiscoveryThreshold = document.createElement("input");
  chestDiscoveryThreshold.type = "number";
  chestDiscoveryThreshold.min = "1";
  chestDiscoveryThreshold.step = "1";
  chestDiscoveryThreshold.inputMode = "numeric";
  chestDiscoveryThreshold.style.cssText = "width:4em;color:#111;background:#fff";
  chestDiscoveryThreshold.setAttribute("aria-label","停止自動選寶箱的發現率加成百分比");
  const chestDiscoveryStatus = document.createElement("span");
  chestDiscoverySetting.append("發現率 +",chestDiscoveryThreshold,"% ",chestDiscoveryStatus);
  const loadChestDiscoveryThreshold = () => {
    const saved = Number(readSetting("ro-helper-chest-discovery-threshold"));
    chestDiscoveryThreshold.value = Number.isSafeInteger(saved) && saved > 0 ? String(saved) : "300";
  };
  const refreshChestDiscoverySetting = () => {
    chestDiscoverySetting.hidden = chestMode.value !== "discovery";
    chestDiscoveryStatus.textContent = "";
  };
  chestDiscoveryThreshold.addEventListener("change", () => {
    const value = chestDiscoveryThreshold.valueAsNumber;
    writeSetting("ro-helper-chest-discovery-threshold",String(Number.isSafeInteger(value) && value > 0 ? value : 300));
    loadChestDiscoveryThreshold();
  });
  const loadChestMode = () => {
    const saved = readSetting("ro-helper-chest-mode");
    chestMode.value = ["pass","avoid","discovery"].includes(saved) ? saved : "collect";
    loadChestDiscoveryThreshold();
    refreshChestDiscoverySetting();
  };
  loadChestMode();
  chestMode.addEventListener("change", () => {
    writeSetting("ro-helper-chest-mode",chestMode.value);
    refreshChestDiscoverySetting();
  });
  const goalAction=document.createElement("select");goalAction.setAttribute("aria-label","達標後處理");
  goalAction.append(new Option("達標後：遊戲自動選（技能＋寶箱）","native"),new Option("達標後：保存卡片／寶箱","save"));
  goalAction.title="遊戲自動選同時接管技能與寶箱，完全隨機且本局不能取消；兩邊已設定的目標都達成才開啟。";
  const loadGoalAction=()=>{goalAction.value=readSetting("ro-helper-goal-action")==="save"?"save":"native";};loadGoalAction();
  goalAction.onchange=()=>{writeSetting("ro-helper-goal-action",goalAction.value);goalActionHelp.hidden=goalAction.value==="save";};
  const goalActionSetting=document.createElement("div"),goalActionHelp=document.createElement("small");
  goalActionHelp.textContent="自動選會同時接管技能與寶箱；已設定條件達標才開啟，本局不能取消。技能等級計畫中，勾選取得後放逐但未抽到的技能不擋保存；已取得才檢查等級，不等放逐成功。";goalActionHelp.style.display="block";goalActionSetting.append(goalAction,goalActionHelp);
  const noFlipSetting = document.createElement("label");
  noFlipSetting.textContent = "局內等級停止選技能卡（0＝關） ";
  const noFlipLevel = document.createElement("input");
  noFlipLevel.type = "number";
  noFlipLevel.min = "0";
  noFlipLevel.step = "1";
  noFlipLevel.inputMode = "numeric";
  noFlipLevel.style.width = "5em";
  noFlipLevel.setAttribute("aria-label","局內等級停止翻牌門檻");
  noFlipSetting.append(noFlipLevel);
  const loadNoFlipLevel = () => { noFlipLevel.value = readSetting("ro-helper-no-flip-level") || "0"; };
  loadNoFlipLevel();
  noFlipLevel.addEventListener("change",() => {
    const value = noFlipLevel.valueAsNumber;
    writeSetting("ro-helper-no-flip-level", Number.isSafeInteger(value) && value > 0 ? String(value) : "0");
    loadNoFlipLevel();
  });
  const cardStopMode = document.createElement("select");
  cardStopMode.setAttribute("aria-label","停止選技能卡條件");
  cardStopMode.append(new Option("依局內等級停選","level"),new Option("依技能目標數量停選","targets"));
  const targetStop = document.createElement("label");
  const targetSkill = document.createElement("select");
  targetSkill.setAttribute("aria-label","停選用技能");
  const targetCount = document.createElement("input");
  targetCount.type = "number";
  targetCount.min = "0";
  targetCount.step = "1";
  targetCount.inputMode = "numeric";
  targetCount.style.width = "4em";
  targetCount.setAttribute("aria-label","停選目標數量（0＝關）");
  const targetReadout = document.createElement("span");
  targetStop.append(targetSkill," 目標數量 ",targetCount,targetReadout);
  function refreshTargetSkill(openPanel = false) {
    const saved = readSetting("ro-helper-card-stop-skill") || "";
    const job = activeSkillJob(openPanel);
    const ids = new Set();
    for (let id = job?.id; id; id = skillJobs[id][0]) {
      for (const skill of skillJobs[id][2]) ids.add(skill);
    }
    if (Object.hasOwn(jobSkillNames,saved)) ids.add(saved);
    targetSkill.replaceChildren(new Option("選擇技能",""),...Array.from(ids,skill =>
      new Option(jobSkillNames[skill][taiwanGame ? 0 : 1],skill)));
    targetSkill.value = saved;
  }
  function syncSkillLevelStopControls() {
    const enabled=!!skillLevelConfig().enabled;
    for(const control of [cardStopMode,noFlipLevel,targetSkill,targetCount]){control.disabled=enabled;control.style.opacity=enabled?"0.45":"";}
  }
  function loadCardStopTarget() {
    loadGoalAction();goalActionHelp.hidden=goalAction.value==="save";
    syncSkillLevelStopControls();
    cardStopMode.value = readSetting("ro-helper-card-stop-mode") === "targets" ? "targets" : "level";
    noFlipSetting.hidden = cardStopMode.value === "targets";
    targetStop.hidden = cardStopMode.value !== "targets";
    targetCount.value = readSetting("ro-helper-card-stop-target") || "0";
    targetReadout.textContent = "";
    refreshTargetSkill();
  }
  targetSkill.addEventListener("pointerdown",()=>refreshTargetSkill(true));
  targetSkill.addEventListener("focus",()=>refreshTargetSkill(true));
  targetSkill.addEventListener("change",()=>writeSetting("ro-helper-card-stop-skill",targetSkill.value));
  cardStopMode.addEventListener("change",()=>{writeSetting("ro-helper-card-stop-mode",cardStopMode.value);loadCardStopTarget()});
  targetCount.addEventListener("change",()=>{
    const value = targetCount.valueAsNumber;
    targetCount.value = Number.isSafeInteger(value) && value > 0 ? String(value) : "0";
    writeSetting("ro-helper-card-stop-target",targetCount.value);
  });
  loadCardStopTarget();
  function createPausedBattleResume() {
    let lastClick=0;
    return function resumePausedBattle(now=Date.now()) {
      if(!window.__roMenuHelper || document.body.classList.contains("in-lobby") ||
          !document.querySelector("#hud:not(.hidden)") || document.querySelector("#gameover:not(.hidden)"))return false;
      const pause=document.querySelector("#pause:not(.hidden)");
      if(!pause || !pause.getClientRects().length || getComputedStyle(pause).visibility!=="visible")return false;
      // Leave open settings/confirmation dialogs alone. Use only the pause menu's native button.
      if(document.querySelector("#options:not(.hidden),dialog[open],#picker:not(.hidden):not(.closing),#fp-confirm"))return false;
      const resume=pause.querySelector("#btn-resume");
      if(!resume || resume.disabled || !resume.getClientRects().length || getComputedStyle(resume).visibility!=="visible")return false;
      if(lastClick && now>=lastClick && now-lastClick<1000)return true;
      lastClick=now;resume.click();status.textContent="偵測到遊戲暫停，已自動繼續";
      return true;
    };
  }
  function inBattleReadyForBank(hud,picker) {
    return Boolean((hud || picker) && !document.body.classList.contains("in-lobby") &&
      !document.querySelector("#gameover:not(.hidden)"));
  }
function nativeSelectionGoalsReady(skillConfigured,skillReached,chestConfigured,chestReached,zeroDiscoveryFull=false) {
  return Boolean(zeroDiscoveryFull||((skillConfigured||chestConfigured)&&(!skillConfigured||skillReached)&&(!chestConfigured||chestReached)));
}
function createNativeGoalSelection() {
  let requested=false,ownedConfirm=null,nextAttempt=0;
  return {
    reset(){if(requested&&document.getElementById('fp-confirm')===ownedConfirm)document.getElementById('fp-no')?.click();requested=false;ownedConfirm=null;nextAttempt=0;},
    act(enabled,ready){
      if(document.body.classList.contains('fp-auto')){requested=false;return 'active';}
      if(!enabled||!ready){if(requested){if(document.getElementById('fp-confirm')===ownedConfirm)document.getElementById('fp-no')?.click();requested=false;}return document.getElementById('fp-confirm')?'manual':false;}
      const confirm=document.getElementById('fp-confirm');
      if(requested&&confirm){if(confirm!==ownedConfirm){requested=false;return 'manual';}const yes=document.getElementById('fp-yes');if(yes&&!yes.disabled){yes.click();requested=false;nextAttempt=Date.now()+3000;return 'pending';}return 'pending';}
      if(confirm)return 'manual';
      if(Date.now()<nextAttempt)return requested?'pending':'unavailable';
      const control=document.getElementById('fp-check-auto'),row=document.getElementById('fp-row-auto');
      if(!control||control.disabled||control.checked||!row||row.classList.contains('hidden'))return 'unavailable';
      requested=true;nextAttempt=Date.now()+3000;control.click();
      ownedConfirm=document.getElementById('fp-confirm');if(!ownedConfirm)requested=false;
      return 'pending';
    }
  };
}

  function createLevelCardStop() {
    const nativeSelection=createNativeGoalSelection();
    const preferenceKey = "ro-hans.saveUp";
    let stopped = false;
    let ownsPreference = false;
    let previousPreference = null;
    let lastAction = 0;
    let chestCutoff = false;
    let saveZeroDiscoveryChests = false;
    let roundActive = false;
    const splitPreferences = [["ro-hans.saveLv","sv-check"],["ro-hans.saveChest","sv-check-ch"]];
    const splitOwned = new Set();
    function setSplit(index,on) {
      const [key,id] = splitPreferences[index];
      const value = on ? "1" : "0";
      if (localStorage.getItem(key) !== value) localStorage.setItem(key,value);
      const control = document.getElementById(id);
      if (control) control.checked = on;
    }
    let attemptedChestTab;
    let retrySavedChestAt = 0;
    function reset() {
      if(typeof resetSkillLevelProgress==='function')resetSkillLevelProgress();
      nativeSelection.reset();
      stopped = false;
      chestCutoff = false;
      saveZeroDiscoveryChests = false;
      tooltipSkill = "";
      tooltipTargets = undefined;
      for (const index of splitOwned) setSplit(index,false);
      splitOwned.clear();
      lastAction = 0;
      attemptedChestTab = undefined;
      retrySavedChestAt = 0;
      if (!ownsPreference) return;
      ownsPreference = false;
      if (localStorage.getItem(preferenceKey) !== "1") return;
      if (previousPreference === null) localStorage.removeItem(preferenceKey);
      else localStorage.setItem(preferenceKey,previousPreference);
      const checkbox = document.getElementById("sv-check");
      if (checkbox) checkbox.checked = previousPreference === "1";
    }
    function keep(bar) {
      const present = bar.querySelector('button[data-t="keep"]');
      const button = present || document.createElement("button");
      if (!present) {
        // The game only shows this button with multiple offers, but uses a delegated handler.
        button.dataset.t = "keep";
        bar.append(button);
      }
      const previous = localStorage.getItem(preferenceKey);
      try { button.click(); }
      finally { if (!present) button.remove(); }
      if (!ownsPreference && previous !== "1" && localStorage.getItem(preferenceKey) === "1") {
        ownsPreference = true;
        previousPreference = previous;
      }
    }
    let tooltipSkill = "";
    let tooltipReadAt = 0;
    let tooltipTargets;
    function readTooltipTargets(id) {
      if (!id) return;
      if (id === tooltipSkill && Date.now()-tooltipReadAt < 500) return tooltipTargets;
      tooltipSkill = id;
      tooltipReadAt = Date.now();
      tooltipTargets = undefined;
      const key = CSS.escape(id);
      const slot = document.querySelector('#skillbar [data-skill="'+key+'"], #lu-sockets [data-skill="'+key+'"]');
      const tip = document.getElementById("skill-tip");
      if (!slot || !tip) return;
      const nodes = [...tip.childNodes], name = tip.className, style = tip.getAttribute("style");
      try {
        tip.classList.add("hidden");
        slot.dispatchEvent(new MouseEvent("mouseover",{bubbles:true}));
        if (tip.classList.contains("hidden")) return;
        for (const value of tip.querySelectorAll(".st-rows b")) {
          const text = value.textContent.normalize("NFKC").trim();
          const count = Number(text.match(/^\+?\s*(\d+)\s*(?:個\s*)?(?:目標|targets?|objetivos?|alvos?)$/i)?.[1]);
          if (Number.isSafeInteger(count) && count > 0) return tooltipTargets = count;
        }
      } finally {
        tip.replaceChildren(...nodes);
        tip.className = name;
        if (style === null) tip.removeAttribute("style");
        else tip.setAttribute("style",style);
      }
    }
    function act(picker,chest,discovery,skillTargets) {
      if (!taiwanGame) return false;
      if(document.body.classList.contains("fp-auto")){for(const index of splitOwned)setSplit(index,false);splitOwned.clear();return Boolean(picker);}
      const levelPlan=readSkillLevelPlan();
      const byTargets = !levelPlan.enabled && cardStopMode.value === "targets";
      const threshold = levelPlan.enabled ? (levelPlan.done ? 1 : 0) : byTargets ? targetCount.valueAsNumber : noFlipLevel.valueAsNumber;
      if(levelPlan.enabled)stopped=levelPlan.done;
      const liveTargets = byTargets ? (skillTargets?.[targetSkill.value] ?? readTooltipTargets(targetSkill.value)) : undefined;
      if (byTargets) targetReadout.textContent = " 目前 "+(Number.isSafeInteger(liveTargets) ? liveTargets : "—")+(stopped ? " · 已停選" : "");
      const discoveryMode = chestMode.value === "discovery";
      const discoveryLimit = (chestDiscoveryThreshold.valueAsNumber || 300)/100;
      if (!discoveryMode) chestCutoff = false;
      else if (Number.isFinite(discovery)) chestCutoff = discovery >= discoveryLimit-1e-9;
      const canCollect = chestMode.value === "collect" || discoveryMode;
      const supportsSaving = Boolean(document.getElementById("sv-check"));
      const prioritizeDiscovery = canCollect && supportsSaving && discoveryTreasureMode();
      saveZeroDiscoveryChests = false;
      if (prioritizeDiscovery && discovery === 0) {
        const slots = [...document.querySelectorAll("#runitems .run-slot")];
        saveZeroDiscoveryChests = slots.length > 0 && slots.every(slot => slot.hasAttribute("data-item"));
      }
      const saveChest = (chestCutoff || saveZeroDiscoveryChests) && supportsSaving;
      let savedChestStatus = saveZeroDiscoveryChests ? "寶物已滿、尋寶率 +0%，等待遊戲自動選；暫時保存寶箱" : "已達尋寶率門檻，寶箱已保存";
      if (!Number.isSafeInteger(threshold) || threshold < 1) stopped = false;
      if (byTargets && !stopped && Number.isSafeInteger(threshold) && threshold > 0 &&
          Number.isSafeInteger(liveTargets) && liveTargets >= threshold && document.getElementById("sv-check")) stopped = true;
      if (!levelPlan.enabled && !byTargets && picker && !chest && !stopped && threshold > 0) {
        const gain = picker.querySelector("#pk-gain:not(.hidden)")?.textContent.normalize("NFKC").trim();
        const level = Number(gain?.match(/^(?:Lv\.?|Nv\.?|Level|等級)\s*(\d+)\b/i)?.[1]);
        if (Number.isSafeInteger(level) && level >= threshold) {
          const legacy = picker.querySelector("#nf-btn:not(.hidden):not(.on):not(:disabled)");
          if (legacy) {
            legacy.click();
            status.textContent = "已設定本局之後不再翻牌";
          } else if (picker.querySelector("#sv-bar")) stopped = true;
        }
      }
      const skillConfigured=levelPlan.enabled || Number.isSafeInteger(threshold)&&threshold>0;
      const nativeReady=nativeSelectionGoalsReady(skillConfigured,stopped,discoveryMode,chestCutoff,saveZeroDiscoveryChests);
      const nativeResult=nativeSelection.act(saveZeroDiscoveryChests || goalAction.value==="native",nativeReady);
      const nativeNotice=nativeResult==="unavailable"?"（遊戲尚未開放自動選，暫時保存）":"";
      savedChestStatus+=nativeNotice;
      if(nativeResult==="active"){
        for(const index of splitOwned)setSplit(index,false);splitOwned.clear();
        status.textContent="本局已由遊戲隨機自動選技能與寶箱";
        return Boolean(picker);
      }
      if(nativeResult==="pending"||nativeResult==="manual"){
        status.textContent=nativeResult==="manual"?"等待手動處理遊戲自動選確認":saveZeroDiscoveryChests?"寶物已滿、尋寶率 +0%，啟用遊戲自動選技能與寶箱":"目標皆已達成，啟用遊戲自動選技能與寶箱";
        return true;
      }
      if (document.getElementById("sv-check-ch") || localStorage.getItem("ro-hans.saveLv") !== null) {
        const managesSkill = levelPlan.enabled || Number.isSafeInteger(threshold) && threshold > 0;
        if (managesSkill) { splitOwned.add(0); setSplit(0,stopped); }
        if (discoveryMode || prioritizeDiscovery || splitOwned.has(1)) { splitOwned.add(1); setSplit(1,saveChest); }
        if(managesSkill && !stopped && !picker && !document.querySelector("#pause:not(.hidden)") && Date.now()-lastAction>=500){
          const hud=document.querySelector("#sv-hud:not(.hidden)");
          const count=Number(hud?.textContent.match(/(?:卡片|Cards|Cartas)\s*(\d+)/i)?.[1]);
          const open=hud?.querySelector("#sv-open:not(:disabled)");
          if(count>0 && open){lastAction=Date.now();open.click();status.textContent="尚未達停選條件，繼續選擇已保存的技能卡";return true;}
        }
        if (!picker || !(chest ? saveChest : stopped)) return false;
        const bar = picker.querySelector("#sv-bar");
        if (!bar) return false;
        if (Date.now()-lastAction < 400) return true;
        lastAction = Date.now();
        const savedSkill = localStorage.getItem(splitPreferences[0][0]) === "1";
        const savedChest = localStorage.getItem(splitPreferences[1][0]) === "1";
        keep(bar);
        setSplit(0,savedSkill);
        setSplit(1,savedChest);
        status.textContent = chest ? savedChestStatus : "已達技能目標，技能卡已保存"+nativeNotice;
        return true;
      }
      if (!stopped && !saveChest) { if (ownsPreference) reset(); return false; }
      const chestAllowed = canCollect && !chestCutoff && !saveZeroDiscoveryChests;
      const openSaved = chestAllowed && (!discoveryMode || Number.isFinite(discovery));
      const now = Date.now();
      if (picker) {
        const bar = picker.querySelector("#sv-bar");
        if (chest) { attemptedChestTab = undefined; retrySavedChestAt = 0; }
        if (!bar || (chest ? chestAllowed : !stopped)) return false;
        if (now-lastAction < 400) return true;
        const tab = chest ? (!stopped && bar.querySelector('button[data-t="lv"]:not(:disabled)')) :
          (openSaved && bar.querySelector('button[data-t="chest"]:not(:disabled)'));
        lastAction = now;
        if (tab && (chest || tab !== attemptedChestTab)) {
          if (!chest) attemptedChestTab = tab;
          tab.click();
          status.textContent = chest ? "保留寶箱，繼續選技能" : "處理已保存的寶箱";
        } else {
          if (!chest && tab) retrySavedChestAt = now+5000;
          attemptedChestTab = undefined;
          keep(bar);
          status.textContent = chest ? savedChestStatus : byTargets ? "已達目標數量，保留技能卡" : "已達指定等級，保留技能卡";
        }
        return true;
      }
      if ((saveChest || stopped) && localStorage.getItem(preferenceKey) !== "1") {
        previousPreference = localStorage.getItem(preferenceKey);
        localStorage.setItem(preferenceKey,"1");
        ownsPreference = true;
      }
      if (now-lastAction < 400) return false;
      const hud = document.querySelector("#sv-hud:not(.hidden)");
      const count = Number(hud?.querySelectorAll("span b")[stopped ? 1 : 0]?.textContent);
      if (stopped ? !openSaved || now < retrySavedChestAt : !saveChest) return false;
      const open = hud?.querySelector("#sv-open:not(:disabled)");
      if (!open || !(count > 0)) return false;
      lastAction = now;
      open.click();
      return true;
    }
    function beginRound() {
      if (roundActive) return;
      roundActive = true;
      reset();
      const skillPlanEnabled=typeof skillLevelConfig==="function" && !!skillLevelConfig().enabled;
      if (!taiwanGame || !(skillPlanEnabled || (cardStopMode.value === "targets" ? targetCount.valueAsNumber : noFlipLevel.valueAsNumber) > 0 || chestMode.value === "discovery")) return;
      if (document.getElementById("sv-check-ch") || localStorage.getItem("ro-hans.saveLv") !== null) {
        const threshold = cardStopMode.value === "targets" ? targetCount.valueAsNumber : noFlipLevel.valueAsNumber;
        if (skillPlanEnabled || threshold > 0) {splitOwned.add(0);setSplit(0,false);}
        if (chestMode.value === "discovery") setSplit(1,false);
        return;
      }
      if (localStorage.getItem(preferenceKey) === "1") localStorage.setItem(preferenceKey,"0");
      const checkbox = document.getElementById("sv-check");
      if (checkbox) checkbox.checked = false;
    }
    function endRound() {
      if (!roundActive) return;
      roundActive = false;
      reset();
    }
    return {act,reset,beginRound,endRound, savingZeroDiscoveryChests:()=>saveZeroDiscoveryChests};
  }
  function crossesChest([px,py], x, y, chests) {
    const dx = x-px, dy = y-py;
    const lengthSquared = dx*dx + dy*dy;
    return chests.some(([,cx,cy]) => {
      cy -= 20;
      const startDistance = Math.hypot(px-cx,py-cy);
      const fraction = Math.max(0,Math.min(1,((cx-px)*dx + (cy-py)*dy)/(lengthSquared || 1)));
      if (startDistance < 42) return fraction > 0 || Math.hypot(x-cx,y-cy) <= startDistance;
      return Math.hypot(px+dx*fraction-cx,py+dy*fraction-cy) < 42;
    });
  }
  function createPickupTracker() {
    let target;
    const skipped = new Map();
    const keyOf = ([kind,x,y]) => kind + ":" + Math.round(x) + ":" + Math.round(y);
    return (drops, [px,py], affordable, now, reset = false) => {
      if (reset) { target = undefined; skipped.clear(); return null; }
      for (const [key,until] of skipped) if (now >= until) skipped.delete(key);
      const choices = [];
      for (const drop of drops) {
        const [kind,x,y] = drop;
        if (kind === "loot" || kind === "card" || (kind === "chest" && !affordable)) continue;
        const key = keyOf(drop);
        if (skipped.has(key)) continue;
        const aimY = kind === "chest" || kind === "ball" ? y - 20 : y;
        const distance = Math.hypot(x-px,aimY-py);
        if (distance <= 480) choices.push({key,kind,x,y:aimY,distance});
      }
      const current = choices.find(choice => choice.key === target?.key);
      const ballVisible = choices.some(choice => choice.kind === "ball");
      if (current) {
        if (current.distance < target.best - 6) {
          target.best = current.distance;
          target.progressAt = now;
        }
        if (now - target.progressAt >= 1100) skipped.set(current.key,now+5000);
        else if (!ballVisible || current.kind === "ball") return current;
      }
      const next = choices.filter(choice => !skipped.has(choice.key)).sort((a,b) =>
        Number(b.kind === "ball") - Number(a.kind === "ball") ||
        Number(b.kind === "magnet") - Number(a.kind === "magnet") || Number(b.kind === "chest") - Number(a.kind === "chest") || a.distance-b.distance)[0];
      target = next && {key:next.key,best:next.distance,progressAt:now};
      return next ?? null;
    };
  }
  function advanceRotation(rotation, stages, repeats) {
    if (!stages.includes(rotation.stage)) return {stage: stages[0], completed: 0};
    const completed = rotation.completed + 1;
    if (completed < repeats) return {stage: rotation.stage, completed};
    return {stage: stages[(stages.indexOf(rotation.stage) + 1) % stages.length], completed: 0};
  }
  function highestPlayableStage(cards, rejected, canDepart) {
    if (!cards.length) rejected.clear();
    const ranked = cards.filter(card => !stageIsLocked(card) &&
      stageGroup(baseExpeditionName(stageNameOf(card))) === "一般關卡" &&
      !card.matches(".story,.story-only") && !card.querySelector(".stg-story"))
      .sort((a, b) => Number(b.dataset.i) - Number(a.dataset.i));
    for (const card of ranked) {
      const id = card.dataset.i ?? stageNameOf(card);
      if (rejected.has(id)) continue;
      if (!card.classList.contains("sel") || canDepart) return card;
      rejected.add(id);
    }
    return null;
  }
  const rollChoice = document.createElement("select");
  rollChoice.setAttribute("aria-label", "隊伍掉落擲骰");
  for (const [value, text] of [
    ["", "擲骰：手動"],
    ["need", "擲骰：Need"],
    ["greed", "擲骰：Greed"],
    ["pass", "擲骰：不需要"]
  ]) {
    rollChoice.append(new Option(text, value));
  }
  rollChoice.value = readSetting("ro-helper-roll-choice") || "";
  rollChoice.addEventListener("change", () => {
    writeSetting("ro-helper-roll-choice", rollChoice.value);
  });
  const createDropConfirmation = () => {
    const seen = new WeakMap();
    return () => {
      const reveal = document.querySelector("#drop-reveal:not(.hidden)");
      if (!reveal?.getClientRects().length) return false;
      const confirm = reveal.querySelector(".dr-get");
      const quality = reveal.querySelector(".dr-q")?.textContent.trim() || "";
      const petEgg = /^(?:寵物(?:蛋)?|Pet Egg|Huevo de pet)(?:\s*[·・]|$)/i.test(quality);
      const supportedDrop = petEgg || /^(?:卡片|卡牌|Carta|Card)$/i.test(quality) ||
        /\bTier\s*\d+/i.test(quality) ||
        /^(?:普通|優良|稀有|史詩|傳說|神話|Common|Uncommon|Rare|Epic|Legendary|Mythic|Común|Poco común|Raro|Épico|Legendario|Mítico)$/i.test(quality);
      const rolling = reveal.classList.contains("roll");
      const selectedRoll = rollChoice.value;
      const action = rolling
        ? (["need", "greed", "pass"].includes(selectedRoll) ? reveal.querySelector('.dr-roll-btns button[data-c="' + selectedRoll + '"]') : null)
        : (supportedDrop ? confirm : null);
      if (!action || action.disabled) {
        if (rolling) status.textContent = !selectedRoll ? "等待手動擲骰" : "等待擲骰結果";
        return true;
      }
      const now = performance.now();
      const current = reveal.querySelector(".dr-inner") || action;
      let state = seen.get(current);
      if (!state) {
        state = {firstSeen: now, sent: false};
        seen.set(current, state);
      }
      if (!state.sent && now - state.firstSeen >= 650) {
        state.sent = true;
        if (rolling) {
          action.click();
          status.textContent = "已選擲骰 " + rollChoice.selectedOptions[0].textContent.replace("擲骰：", "");
          return true;
        }
        status.textContent = "已按空白鍵確認拾取";
        for (const type of ["keydown", "keyup"]) {
          window.dispatchEvent(new KeyboardEvent(type, {key:" ", code:"Space", keyCode:32, which:32, bubbles:true}));
        }
      }
      return true;
    };
  };
function createRaidRouteProgress(){
  let anchor=null,since=0,lastDirection=-1,key='',repath=false;const banned=new Map();
  return {reset(){anchor=null;since=0;lastDirection=-1;key='';banned.clear();},
    blocked(packet,now=Date.now()){
      repath=false;for(const [direction,until] of banned)if(now>=until)banned.delete(direction);
      const m=packet.raidMechanics,k=[packet.stageId,m?.kind,...(m?.target||[]).map(v=>Math.round(v/32))].join(':');
      if(k!==key){this.reset();key=k;}
      const p=packet.player;if(!anchor||lastDirection<0||Math.hypot(p[0]-anchor[0],p[1]-anchor[1])>=8){anchor=p.slice();since=now;}
      else if(now-since>=1200){banned.set(lastDirection,now+2400);since=now;anchor=p.slice();repath=true;}
      return [...banned.keys()];
    },record(direction){lastDirection=direction;},needsRepath(){return repath;}
  };
}

const raidRouteProgress=createRaidRouteProgress();
function raidHazardClearance(zones,x,y) {
  let result=Infinity;
  for(const [kind,cx,cy,w,h,angle=0,inner=0] of zones){
    if(![cx,cy,w,h,angle,inner].every(Number.isFinite)||w<=0||h<=0)continue;
    const dx=x-cx,dy=y-cy,d=Math.hypot(dx,dy),r=w/2;let gap=d-r;
    if(kind==='rect'){const u=Math.abs(dx*Math.cos(angle)+dy*Math.sin(angle)),v=Math.abs(-dx*Math.sin(angle)+dy*Math.cos(angle));gap=Math.max(u-w/2,v-h/2);}
    else if(kind==='ring')gap=Math.max(d-r,r*inner-d);
    else if(kind==='cone'){
      const half=Math.max(0,Math.min(Math.PI,inner)),delta=Math.atan2(Math.sin(Math.atan2(dy,dx)-angle),Math.cos(Math.atan2(dy,dx)-angle));
      const segment=a=>{const u=Math.cos(a),v=Math.sin(a),t=Math.max(0,Math.min(r,dx*u+dy*v));return Math.hypot(dx-u*t,dy-v*t);};
      const edge=Math.min(segment(angle-half),segment(angle+half),Math.abs(delta)<=half?Math.abs(d-r):Infinity);
      gap=d<=r&&Math.abs(delta)<=half?-edge:edge;
    }
    result=Math.min(result,gap-16);
  }
  return result;
}
function chooseRaidMechanicRoute(packet,now=Date.now(),blockedDirections=[]) {
  const m=packet.raidMechanics;
  if(!m?.enabled)return null;
  if(!m.ready || !Array.isArray(packet.player)||!Array.isArray(packet.routes))return {direction:-1,label:m.label||'副本｜等待機制資料'};
  const same=(a,b)=>a[0]===b[0]&&a.slice(1,7).every((v,i)=>Math.abs(v-b[i+1])<.1);
  const neutral=m.neutral||[],danger=m.hazards||[];
  // A friendly marker can share coordinates with a real attack. Keep the attack in that case.
  const zones=[...(packet.hazards||[]).filter(a=>!neutral.some(b=>same(a,b))||danger.some(b=>same(a,b))),...danger];
  const [px,py]=packet.player,age=Math.max(0,Math.min(.3,(now-packet.at)/1000));
  const corridorTravel=m.rid==='r4'&&Array.isArray(m.fixedSegment)&&['kills','next','hold'].includes(m.kind);
  const clearance=(x,y)=>Math.min(raidHazardClearance(zones,x,y),shotClearance(packet.enemyShots||[],packet.player,[x,y],age)-37,(corridorTravel?[]:packet.enemies||[]).reduce((v,[ex,ey])=>Math.min(v,Math.hypot(x-ex,y-ey)-38),Infinity));
  const mandatorySafe=m.kind==='bell'||m.kind==='curse';
  if(mandatorySafe&&m.stay)return {direction:-1,label:m.label+'｜安全區優先，留在圈內'};
  const origin=clearance(px,py),separation=(x,y)=>(m.players||[]).reduce((d,[a,b])=>Math.min(d,Math.hypot(x-a,y-b)),Infinity);
  if(m.stay&&origin>0&&(!m.marked||separation(px,py)>m.markRadius+35))return {direction:-1,label:m.label};
  const goal=m.waypoint||m.target;
  const candidates=packet.routes.map(([x,y,walkable],direction)=>{
    if(blockedDirections.includes(direction)||!walkable||![x,y].every(Number.isFinite))return null;
    const end=clearance(x,y),path=Math.min(...[.2,.4,.6,.8,1].map(f=>raidHazardClearance(zones,px+(x-px)*f,py+(y-py)*f)));
    const distance=goal?Math.hypot(x-goal[0],y-goal[1]):0,sep=separation(x,y);
    const monster=(packet.enemies||[]).reduce((v,[ex,ey])=>Math.min(v,Math.hypot(x-ex,y-ey)),Infinity);
    return {direction,end,path,distance,sep,monster};
  }).filter(Boolean);
  if(!candidates.length)return {direction:-1,label:m.label+'（無可通行方向）'};
  // In a clear fixed corridor keep the segment heading. Small coordinate noise
  // must not alternate diagonal/axis keys on every sample. Real hazards still win.
  if(m.fixedSegment&&!m.stay&&!mandatorySafe&&!m.marked&&origin>0){
    const [ax,ay,bx,by]=m.fixedSegment,dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);
    const lateral=len?Math.abs((px-ax)*dy-(py-ay)*dx)/len:Infinity;
    if(len&&lateral<=12){
      const aligned=candidates.filter(c=>c.end>0&&c.path>0).filter(c=>{const q=packet.routes[c.direction],vx=q[0]-px,vy=q[1]-py,vl=Math.hypot(vx,vy);return vl>0&&(vx*dx+vy*dy)/(vl*len)>.98;});
      if(aligned.length)return {direction:aligned.sort((a,b)=>a.distance-b.distance)[0].direction,label:m.label};
    }
  }
  const safe=candidates.filter(c=>c.end>0&&(origin<=0||c.path>0));
  const pool=mandatorySafe?candidates:safe.length?safe:candidates;
  pool.sort((a,b)=>{
    if(mandatorySafe)return a.distance-b.distance||b.end-a.end;
    if(!safe.length)return b.end-a.end||b.sep-a.sep;
    if(m.marked&&m.kind!=='bell'&&m.kind!=='curse'&&Math.min(a.sep,b.sep)<m.markRadius+40)return b.sep-a.sep||a.distance-b.distance;
    if(origin<=0 && !goal)return b.end-a.end;
    return a.distance-b.distance||Math.min(100,b.monster)-Math.min(100,a.monster)||b.end-a.end;
  });
  return {direction:pool[0].direction,label:mandatorySafe?m.label+'｜安全區優先':origin<=0?m.label+'｜閃避危險':m.label};
}

  function shotClearance(shots, [px,py], [x,y], age) {
    const dx = x-px, dy = y-py;
    const travelTime = Math.max(0.04,Math.hypot(dx,dy)/240);
    let clearance = Infinity;
    for (const [sx,sy,vx,vy,life] of shots) {
      const duration = Math.min(0.34,life-age);
      if (duration <= 0) continue;
      const rx = sx+vx*age-px, ry = sy+vy*age-py;
      const approach = (a,b,u,v,limit) => {
        const t = Math.max(0,Math.min(limit,-(a*u+b*v)/(u*u+v*v||1)));
        return Math.hypot(a+u*t,b+v*t);
      };
      clearance = Math.min(clearance,approach(rx,ry,vx-dx/travelTime,vy-dy/travelTime,Math.min(duration,travelTime)));
      if (duration>travelTime) clearance = Math.min(clearance,
        approach(rx+vx*travelTime-dx,ry+vy*travelTime-dy,vx,vy,duration-travelTime));
    }
    return clearance;
  }
  function projectileDodge(packet, zones, age, planned = -1) {
    const shots = packet.enemyShots;
    if (!shots?.length) return null;
    const player = packet.player;
    const origin = shotClearance(shots,player,player,age);
    const chosen = planned < 0 ? origin : shotClearance(shots,player,packet.routes[planned],age);
    if (chosen >= 37) return null;
    let best = -1, bestScore = origin >= 37 ? 37 : origin-10;
    for (const [i,[x,y,walkable]] of packet.routes.entries()) {
      if (!walkable) continue;
      if ([.2,.4,.6,.8,1].some(f=>hazardClearance(zones,player[0]+(x-player[0])*f,player[1]+(y-player[1])*f)<=0)) continue;
      const monsterDistance = (packet.enemies || []).reduce((nearest,[ex,ey])=>Math.min(nearest,Math.hypot(ex-x,ey-y)),Infinity);
      const clearance = shotClearance(shots,player,[x,y],age);
      const score = Math.min(80,clearance)-Math.max(0,50-monsterDistance);
      if (score > bestScore) { best = i; bestScore = score; }
    }
    return best;
  }
  const hazardClearance = (zones, x, y) => {
    let clearance = Infinity;
    for (const [shape, cx, cy, width, height, angle, inner] of zones) {
      const dx = x - cx, dy = y - cy;
      const distance = Math.hypot(dx, dy);
      let gap = distance - width / 2;
      if (shape === "ring") gap = Math.max(gap, width / 2 * inner - distance);
      if (shape === "rect") {
        const along = Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle));
        const across = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
        gap = Math.max(along - width / 2, across - height / 2);
      }
      clearance = Math.min(clearance, gap - 12);
    }
    return clearance;
  };
  const partyMode = document.createElement("select");
  partyMode.setAttribute("aria-label", "組隊模式");
  for (const [value, text] of [
    ["off", "組隊模式：關"],
    ["leader", "組隊模式：隊長"],
    ["member", "組隊模式：隊員"],
    ["follow", "組隊模式：跟隨隊長"]
  ]) {
    partyMode.append(new Option(text, value));
  }
  const savedPartyRole = readSetting("ro-helper-party-role");
  partyMode.value = ["off","leader","member","follow"].includes(savedPartyRole)
    ? savedPartyRole : readSetting("ro-helper-auto-party") === "on" ? "member" : "off";
  const refreshRollChoiceVisibility = () => { rollChoice.hidden = partyMode.value === "off"; };
  refreshRollChoiceVisibility();
  let partyWaitingUntil = 0;
  partyMode.addEventListener("change", () => {
    writeSetting("ro-helper-party-role", partyMode.value);
    refreshRollChoiceVisibility();
    refreshStageDropPreview();
    partyWaitingUntil = 0;
  });
  function hansHighDifficultyEnterButton() {
    if (!taiwanGame) return null;
    const dialog = document.querySelector("#npc-dialog:not(.hidden)");
    if (!dialog?.getClientRects().length) return null;
    const title = dialog.querySelector("#npc-name")?.textContent.trim();
    if (title !== "高難度提醒") return null;
    const enter = dialog.querySelector("#npc-options button.primary");
    const label = enter?.textContent.trim().replace(/^[✓✔☑\s]+/u,"");
    return !enter?.disabled && label === "入場" ? enter : null;
  }
  function finalStageDialogButton() {
    const dialog = document.querySelector("#npc-dialog:not(.hidden)");
    if (!dialog?.getClientRects().length) return null;
    const title = dialog.querySelector("#npc-name")?.textContent.trim() || "";
    if (!/^(?:未完待續|To be continued|Continuará)[.…。！!\s]*$/i.test(title)) return null;
    const accept = dialog.querySelector("#npc-options button.primary");
    return /^(?:接受|Accept|OK|Aceptar)[。！!\s]*$/i.test(accept?.textContent.trim() || "") ? accept : null;
  }
  function expeditionDifficultyDialog() {
    const dialog = document.querySelector("#npc-dialog:not(.hidden)");
    return dialog?.getClientRects().length && dialog.querySelector("#npc-text .diff") ? dialog : null;
  }
  function partyProposalButton(dialog, visible) {
    // Only the group difficulty dialog has a card selection time slider.
    if (!dialog?.querySelector("#npc-text .diff input[data-pick]")) return null;
    const primary = dialog.querySelector("#npc-options button.primary");
    return visible(primary) ? primary : null;
  }
  const partyReadyButton = () => {
    const dialog = document.querySelector("#npc-dialog:not(.hidden)");
    if (!dialog?.getClientRects().length) return null;
    const title = dialog.querySelector("#npc-name")?.textContent.trim() || "";
    const message = dialog.querySelector("#npc-text");
    const primary = dialog.querySelector("#npc-options button.primary");
    const secondary = dialog.querySelector("#npc-options button:not(.primary)");
    if (!/^(?:組隊|隊伍|小隊|團隊|群組|隊伍確認|Party|Group|Grupo)$/i.test(title) ||
        !message?.querySelector("b") || !/(?:出發|遠征|出征|salir con el grupo|set out|depart|start)/i.test(message.textContent) ||
        !primary || primary.disabled || !secondary ||
        !/^(?:不|否|不要|不行|拒絕|不參加|不準備|No)[！!。]?$/i.test(secondary.textContent.trim())) return null;
    return primary;
  };
  const bellDirection = (packet, zones) => {
    if (!Array.isArray(packet.bell)) return null;
    const [cx,cy,radius] = packet.bell;
    const [px,py] = packet.player;
    const distance = Math.hypot(px-cx,py-cy);
    if (distance <= radius - 24) return -1;
    const options = packet.routes.map(([x,y,walkable], index) => ({
      index, walkable, distance: Math.hypot(x-cx,y-cy), clearance: hazardClearance(zones,x,y)
    })).filter(option => option.walkable && option.distance < distance - 1);
    options.sort((a,b) => Number(b.clearance>0)-Number(a.clearance>0) || a.distance-b.distance);
    return options[0]?.index ?? -1;
  };
  let autoReroll = readSetting("ro-helper-auto-reroll") !== "off";
  const rerollToggle = document.createElement("button");
  rerollToggle.type = "button";
  const refreshReroll = () => {
    rerollToggle.textContent = autoReroll ? "自動重抽：開" : "自動重抽：關";
    rerollToggle.setAttribute("aria-pressed", String(autoReroll));
  };
  refreshReroll();
  rerollToggle.addEventListener("click", event => {
    event.stopPropagation();
    autoReroll = !autoReroll;
    writeSetting("ro-helper-auto-reroll", autoReroll ? "on" : "off");
    refreshReroll();
  });
  const lootButton = document.createElement("button");
  lootButton.type = "button";
  lootButton.textContent = "本次掛機掉落";
  const lootWindow = document.createElement("section");
  lootWindow.setAttribute("aria-label", "本次掛機掉落");
  lootWindow.style.cssText = "position:fixed;z-index:2147483647;top:16px;left:16px;width:620px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;padding:14px;box-sizing:border-box;background:#f8faff;color:#172c55;font:13px/1.5 Inter,system-ui,sans-serif;border:1px solid #839bd1;border-radius:8px;pointer-events:auto";
  lootWindow.hidden = true;
  const lootCategory = document.createElement("div");
  const lootSlot = document.createElement("div");
  for (const [group,label] of [[lootCategory,"掉落分類"],[lootSlot,"掉落部位"]]) {
    group.setAttribute("role","group");
    group.setAttribute("aria-label",label);
    group.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;margin-bottom:5px";
  }
  const slotLabels = {acc:"飾品",head_mid:"頭部（中）",head_low:"頭部（下）",head_top:"頭部（上）",weapon:"武器",headgear:"頭飾",armor:"護甲",shield:"盾牌",garment:"披肩",shoes:"鞋子",accessory:"飾品"};
  const lootSlots = [
    ["weapon","shield","head_mid","head_top","head_low","armor","shoes","garment","acc"],
    ["armor","acc","garment","headgear","weapon","shield","shoes"],
    []
  ];
  let lootCategoryIndex = 0;
  const lootSelectedSlots = ["all","all","all"];
  function filterButton(label, selected, choose) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-pressed",String(selected));
    button.style.cssText = "border:1px solid #839bd1;border-radius:5px;padding:3px 7px;cursor:pointer;color:" + (selected ? "#fff" : "#254878") + ";background:" +
      (selected ? "#2854a1" : "#edf2fb");
    button.addEventListener("click",choose);
    return button;
  }
  function refreshLootFilters() {
    lootCategory.replaceChildren(...["裝備","卡片","寵物"].map((label,index) =>
      filterButton(label,index === lootCategoryIndex,() => {
        lootCategoryIndex = index;
        refreshLootFilters();
        refreshLootWindow();
      })));
    const slots = lootSlots[lootCategoryIndex];
    lootSlot.style.display = slots.length ? "flex" : "none";
    lootSlot.replaceChildren(...(slots.length ? ["all",...slots] : []).map(slot =>
      filterButton(slotLabels[slot] || "全部",slot === lootSelectedSlots[lootCategoryIndex],() => {
        lootSelectedSlots[lootCategoryIndex] = slot;
        refreshLootFilters();
        refreshLootWindow();
      })));
  }
  function lootFilterSlot(category,slot) {
    if (slot === "accessory" || /^acc[12]$/.test(slot)) return "acc";
    if (category === 1 && /^head_(?:top|mid|low)$/.test(slot)) return "headgear";
    return slot === "head" ? "headgear" : slot;
  }
  const lootClose = document.createElement("button");
  lootClose.type = "button";
  lootClose.textContent = "關閉";
  lootClose.style.cssText = "padding:3px 9px;border:1px solid #aebfdd;border-radius:5px;color:#254878;background:#edf2fb;cursor:pointer";
  const lootSearch = document.createElement("input");
  lootSearch.type = "search";
  lootSearch.placeholder = "搜尋名稱或詞條，例如 INT";
  lootSearch.setAttribute("aria-label","快速尋找掉落");
  lootSearch.autocomplete = "off";
  lootSearch.spellcheck = false;
  lootSearch.style.cssText = "width:100%;box-sizing:border-box;margin:6px 0;padding:6px 8px;border:1px solid #9cb0d6;border-radius:6px;background:#f7f9ff;color:#172c55";
  lootSearch.addEventListener("input", refreshLootWindow);
  const normalizeLootSearch = value => String(value ?? "").normalize("NFKC").toLowerCase().trim();
  function matchesLootSearch([name,,,effects,english,disposition],query) {
    const stats = normalizeLootSearch(effects?.join(" "));
    const names = normalizeLootSearch(name+" "+(english || "")+" "+(disposition || ""));
    return normalizeLootSearch(query).split(/\s+/).filter(Boolean).every(term =>
      /^(?:str|agi|vit|int|dex|luk)$/i.test(term) ? new RegExp("\\b"+term+"\\b","i").test(stats) :
        names.includes(term) || stats.includes(term));
  }
  const lootRows = document.createElement("div");
  lootRows.style.cssText = "max-height:min(56vh,420px);overflow:auto;margin-top:10px;border:1px solid #d1dbed;border-radius:7px;background:white";
  const lootHeader = document.createElement("div");
  lootHeader.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px";
  const lootHandle = document.createElement("strong");
  lootHandle.textContent = "本次掛機掉落";
  lootHandle.style.cssText = "flex:1;cursor:grab;touch-action:none;user-select:none";
  const lootCollapse=document.createElement("button"),lootContents=document.createElement("div");
  lootCollapse.type="button";lootCollapse.style.cssText=lootClose.style.cssText;
  function setLootCollapsed(collapsed){
    lootContents.hidden=collapsed;lootCollapse.textContent=collapsed?"展開":"收起";
    lootCollapse.setAttribute("aria-expanded",String(!collapsed));
  }
  lootCollapse.addEventListener("click",()=>setLootCollapsed(!lootContents.hidden));
  lootContents.append(lootSearch,lootCategory,lootSlot,lootRows);
  setLootCollapsed(false);
  lootHeader.append(lootHandle,lootCollapse,lootClose);
  lootWindow.append(lootHeader,lootContents);
  function moveLootWindow(x,y) {
    const {width,height} = lootWindow.getBoundingClientRect();
    lootWindow.style.left = Math.max(0, Math.min(x,innerWidth-width)) + "px";
    lootWindow.style.top = Math.max(0, Math.min(y,innerHeight-height)) + "px";
  }
  let lootDrag;
  lootHandle.addEventListener("pointerdown", event => {
    if (event.button !== 0 || lootDrag) return;
    const {left,top} = lootWindow.getBoundingClientRect();
    lootDrag = {id:event.pointerId,x:event.clientX-left,y:event.clientY-top};
    lootHandle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  lootHandle.addEventListener("pointermove", event => {
    if (lootDrag?.id === event.pointerId) moveLootWindow(event.clientX-lootDrag.x,event.clientY-lootDrag.y);
  });
  lootHandle.addEventListener("lostpointercapture", () => { lootDrag = undefined; });
  window.addEventListener("resize", () => {
    if (lootWindow.hidden) return;
    const {left,top} = lootWindow.getBoundingClientRect();
    moveLootWindow(left,top);
  });
  const lootHistory = new Map();
  const revealedLoot = new Map();
  const settledLoot = new Map();
  let seenLootReveals = new WeakSet();
  let currentLootRun = null;
  let fallbackLootRun = 0;
  let lootBattleActive = false;
  function trackSettlementLoot(settlement, run) {
    const groups = [[],[],[]];
    for (const icon of settlement.querySelectorAll(".go-loot img, .go-items img, .go-eggs img, .go-cards img, .go-pets img")) {
        const title = (icon.getAttribute("title") || icon.getAttribute("alt") || "").trim();
        if (!title) continue;
        const key = title.normalize("NFKC").toLowerCase();
        const category = icon.classList.contains("cardimg") || icon.closest(".go-cards") || lootCatalog[1].has(key) || /卡[片牌]$|\bcard$|^carta\b/i.test(title) ? 1 :
          icon.closest(".go-eggs, .go-pets") || lootCatalog[2].has(key) || /(?:寵物蛋|蛋)$|\begg$|^huevo\b/i.test(title) ? 2 :
          icon.closest(".go-items") || [...icon.classList].some(name => /^q[0-5]$/.test(name)) ? 0 : -1;
        if (category < 0) continue;
        const rarity = category === 0 ? [...icon.classList].find(name => /^q[0-5]$/.test(name)) : null;
        const name = category === 0 ? title.replace(/\s*[（(][^）()]+[）)]$/, "") : title;
        const iconKey = icon.src ? "icon:" + new URL(icon.src).pathname : "";
        groups[category].push([name,"",rarity ? Number(rarity[1]) : 0,iconKey]);
    }
    const signature = JSON.stringify(groups);
    if (!groups.some(rows => rows.length) || settledLoot.get(run)?.signature === signature) return;
    settledLoot.set(run,{signature,groups});
    refreshLootWindow();
  }
  const gameCardKey = "ro-helper-game-card-effects";
  const cardKey = name => name.normalize("NFKC").trim().toLowerCase().replace(/[·・･]/g,"・").replace(/\s*・\s*/g,"・");
  let gameCardDetails = new Map();
  try { gameCardDetails = new Map(JSON.parse(localStorage.getItem(gameCardKey)||"[]")); } catch {}
  const cardSlotName = label => {
    const value = label.split(/[:：]/).at(-1).trim();
    return [
      ["armor",/^(?:護甲|鎧甲|armor|armadura)$/i],
      ["shield",/^(?:盾牌|shield|escudo)$/i],
      ["weapon",/^(?:武器|weapon|arma)$/i],
      ["headgear",/^(?:頭飾|頭部|headgear|casco|chapéu)$/i],
      ["garment",/^(?:披肩|披風|garment|capa)$/i],
      ["shoes",/^(?:鞋子|長靴|鞋類|shoes|calzado|calçado)$/i],
      ["accessory",/^(?:飾品|accessory|accesorio|acessório)$/i]
    ].find(([,pattern])=>pattern.test(value))?.[0] || "";
  };
  function rememberGameCard(name, effects, slot = "") {
    if (!name || (!effects.length && !slot)) return false;
    const key = cardKey(name);
    const existing = gameCardDetails.get(key);
    const data = {effects:effects.length ? effects : existing?.effects || [],slot:slot || existing?.slot || ""};
    if (JSON.stringify(existing) === JSON.stringify(data)) return false;
    gameCardDetails.set(key,data);
    try { localStorage.setItem(gameCardKey,JSON.stringify([...gameCardDetails])); } catch {}
    return true;
  }
  let lastCardDetail;
  function readGameCardDetail() {
    const detail = document.querySelector("#charpanel:not(.hidden) #cp-card-detail .eq-info") ||
      document.querySelector(".item-tip:not(.hidden) .tip-item:has(.tip-card)");
    if (!detail || detail === lastCardDetail) return;
    lastCardDetail = detail;
    const name = detail.querySelector(".eq-name b, b")?.textContent.trim();
    const slot = [...detail.querySelectorAll(".muted")].map(node=>cardSlotName(node.textContent)).find(Boolean);
    const effects = [...detail.querySelectorAll(".bon-list li")].map(node=>node.textContent.trim()).filter(Boolean);
    if (rememberGameCard(name,effects,slot)) refreshLootWindow();
  }
  function recordLootReveal(run) {
    const reveal = document.querySelector("#drop-reveal:not(.hidden):not(.roll)");
    const item = reveal?.querySelector(".dr-inner");
    const button = item?.querySelector(".dr-get");
    if (!item || !button || seenLootReveals.has(item)) return;
    // Party results shown to losing players have a Continue button.
    if (item.querySelector(".dr-result") && !/^(?:領取|拾取|撿取|拿取|取得|收下|Coger|Take|Collect)$/i.test(button.textContent.trim())) return;
    const quality = item.querySelector(".dr-q")?.textContent.trim() || "";
    const name = item.querySelector(".dr-name")?.textContent.trim();
    if (!name) return;
    const tier = [/普通|Common|Común/i,/優良|Uncommon|Poco común/i,/稀有|Rare|Raro/i,/史詩|Epic|Épico/i,/傳說|Legendary|Legendario/i,/神話|Mythic|Mítico/i]
      .findLastIndex(pattern => pattern.test(quality));
    const category = /寵物|Pet Egg|Huevo de pet/i.test(quality) ? 2 :
      /^(?:卡片|卡牌|Carta|Card)$/i.test(quality) ? 1 : tier >= 0 || /Tier\s*\d+/i.test(quality) ? 0 : -1;
    if (category < 0) return;
    if (taiwanGame && category === 0) readInventoryTier(quality);
    seenLootReveals.add(item);
    const groups = revealedLoot.get(run) || [[],[],[]];
    const icon = category === 0 ? item.querySelector(".dr-card img") : null;
    const iconKey = icon?.src ? "icon:" + new URL(icon.src).pathname : "";
    const stats = category === 0 || category === 1 ? [...item.querySelectorAll(".dr-stats li:not(.dr-note)")]
      .map(line => line.textContent.trim()).filter(Boolean).sort() : undefined;
    if (category === 1) rememberGameCard(name,stats);
    groups[category].push([name,"",Math.max(0,tier),iconKey,stats]);
    revealedLoot.set(run,groups);
    refreshLootWindow();
  }
  let lootBaseline = null;
  let lootSignature = "";
  let lastTrackedLootSnapshot=null;
  // Names and equipment slots from the RO 倖存者小百科 data snapshot.
  const lootCatalog = [[[1101,"Sword","劍","weapon"],[1104,"Falchion","彎刃劍","weapon"],[1105,"Falchion","彎刃劍","weapon"],[1107,"Blade","大刀","weapon"],[1108,"Blade","大刀","weapon"],[1110,"Rapier","細劍","weapon"],[1117,"Katana","太刀","weapon"],[1124,"Orcish Sword","獸人劍","weapon"],[1125,"Ring Pommel Saber","環柄軍刀","weapon"],[1126,"Saber","軍刀","weapon"],[1127,"Saber","軍刀","weapon"],[1128,"Haedong Gum","海東劍","weapon"],[1131,"Ice Falchion","冰之彎刃劍","weapon"],[1133,"Fire Brand","火焰之刃","weapon"],[1135,"Cutlus","彎刀","weapon"],[1138,"Mysteltainn","米斯特汀","weapon"],[1152,"Slayer","屠殺者","weapon"],[1163,"Claymore","雙手大劍","weapon"],[1189,"Krasnaya","克拉斯納亞","weapon"],[1201,"Knife","小刀","weapon"],[1202,"Knife","小刀","weapon"],[1207,"Main Gauche","左手短劍","weapon"],[1208,"Main Gauche","左手短劍","weapon"],[1210,"Dirk","匕首","weapon"],[1214,"Dagger","短劍","weapon"],[1216,"Stiletto","錐刀","weapon"],[1217,"Stiletto","錐刀","weapon"],[1219,"Gladius","羅馬短劍","weapon"],[1220,"Gladius","羅馬短劍","weapon"],[1222,"Damascus","大馬士革刀","weapon"],[1228,"Combat Knife","戰鬥小刀","weapon"],[1234,"Moonlight Sword","月光劍","weapon"],[1250,"Jur","尤爾拳刃","weapon"],[1252,"Katar","拳刃","weapon"],[1253,"Katar","拳刃","weapon"],[1254,"Jamadhar","賈瑪達拳刃","weapon"],[1256,"Katar of Cold Icicle","冰柱拳刃","weapon"],[1258,"Katar of Raging Blaze","烈焰拳刃","weapon"],[1261,"Infiltrator","滲透者","weapon"],[1262,"Loki's Nail","洛奇之釘","weapon"],[1265,"Bloody Roar","血之咆哮","weapon"],[1301,"Axe","斧頭","weapon"],[1302,"Axe","斧頭","weapon"],[1304,"Orcish Axe","獸人斧","weapon"],[1309,"Orcish Axe","獸人斧","weapon"],[1351,"Battle Axe","戰斧","weapon"],[1355,"Hammer","鐵鎚","weapon"],[1370,"Doom Slayer","末日殺手","weapon"],[1377,"Hurricane Fury","颶風之怒","weapon"],[1402,"Javelin","標槍","weapon"],[1405,"Spear","矛","weapon"],[1407,"Pike","長槍","weapon"],[1408,"Pike","長槍","weapon"],[1413,"Gungnir","昆古尼爾","weapon"],[1460,"Trident","三叉戟","weapon"],[1466,"Crescent Scythe","新月鐮刀","weapon"],[1477,"Spectral Spear","幽靈之矛","weapon"],[1501,"Club","棍棒","weapon"],[1502,"Club","棍棒","weapon"],[1504,"Mace","鈍器","weapon"],[1505,"Mace","鈍器","weapon"],[1511,"Flail","連枷","weapon"],[1513,"Morning Star","晨星","weapon"],[1517,"Sword Mace","劍錘","weapon"],[1519,"Chain","鏈錘","weapon"],[1524,"Golden Mace","黃金錘","weapon"],[1525,"Long Mace","長錘","weapon"],[1528,"Grand Cross","聖十字審判","weapon"],[1530,"Mjolnir","雷神之鎚","weapon"],[1550,"Book","書","weapon"],[1553,"Book of Billows","巨浪之書","weapon"],[1555,"Book of Blazing Sun","烈日之書","weapon"],[1557,"Book of Apocalypse","啟示錄之書","weapon"],[1558,"Girl's Diary","少女的日記","weapon"],[1601,"Rod","法杖","weapon"],[1602,"Rod","法杖","weapon"],[1604,"Wand","魔杖","weapon"],[1607,"Staff","法杖","weapon"],[1610,"Arc Wand","弧形魔杖","weapon"],[1613,"Mighty Staff","強力法杖","weapon"],[1648,"Staff of Bordeaux","波爾多法杖","weapon"],[1701,"Bow","弓","weapon"],[1702,"Bow","弓","weapon"],[1704,"Composite Bow","複合弓","weapon"],[1708,"Great Bow","巨弓","weapon"],[1711,"Cross Bow","十字弓","weapon"],[1718,"Hunter Bow","獵人之弓","weapon"],[1722,"Ballista","巨弩","weapon"],[1734,"Orc Archer Bow","獸人弓箭手之弓","weapon"],[1801,"Waghnak","虎爪","weapon"],[1803,"Knuckle Dusters","指虎","weapon"],[1805,"Studded Knuckles","釘刺拳套","weapon"],[1806,"Studded Knuckles","釘刺拳套","weapon"],[1809,"Claw","爪","weapon"],[1812,"Finger","指","weapon"],[1813,"Kaiser Knuckle","凱薩拳套","weapon"],[1901,"Violin","小提琴","weapon"],[1905,"Lute","魯特琴","weapon"],[1909,"Harp","豎琴","weapon"],[1913,"Electric Guitar","電吉他","weapon"],[1950,"Rope","繩索","weapon"],[1954,"Wire Whip","鋼絲鞭","weapon"],[1958,"Tail Whip","尾鞭","weapon"],[1964,"Chemeti Whip","化學鞭","weapon"],[2101,"Guard","防禦","shield"],[2102,"Guard","防禦","shield"],[2103,"Buckler","小圓盾","shield"],[2104,"Buckler","小圓盾","shield"],[2107,"Mirror Shield","鏡盾","shield"],[2110,"Holy Guard","神聖守護","shield"],[2114,"Stone Buckler","石製小圓盾","shield"],[2115,"Valkyrie Shield","女武神之盾","shield"],[2116,"Angelic Guard","天使守護","shield"],[2124,"Thorny Buckler","荊棘小圓盾","shield"],[2201,"Sunglasses","太陽眼鏡","head_mid"],[2205,"Diver Goggles","潛水護目鏡","head_mid"],[2207,"Fancy Flower","漂亮的花","head_top"],[2209,"Ribbon","蝴蝶結","head_top"],[2211,"Bandana","頭巾","head_top"],[2212,"Eye Patch","眼罩","head_mid"],[2213,"Kitty Band","貓耳髮箍","head_top"],[2214,"Bunny Band","兔耳髮箍","head_top"],[2220,"Hat","帽子","head_top"],[2221,"Hat","帽子","head_top"],[2226,"Cap","帽子","head_top"],[2234,"Tiara","頭冠","head_top"],[2235,"Crown","王冠","head_top"],[2244,"Big Ribbon","大蝴蝶結","head_top"],[2245,"Sweet Gent","甜蜜紳士帽","head_top"],[2246,"Golden Gear","黃金齒輪","head_top"],[2247,"Romantic Gent","浪漫紳士帽","head_top"],[2248,"Western Grace","西部之恩","head_top"],[2250,"Cute Ribbon","可愛蝴蝶結","head_top"],[2251,"Monk Hat","和尚帽","head_top"],[2252,"Wizard Hat","巫師帽","head_top"],[2254,"Angel Wings","天使之翼","head_top"],[2255,"Evil Wings","惡魔之翼","head_top"],[2256,"Majestic Goat","山羊頭盔","head_top"],[2257,"Unicorn Horn","獨角獸之角","head_top"],[2260,"Mini Glasses","迷你眼鏡","head_mid"],[2262,"Clown Nose","小丑鼻","head_low"],[2264,"Munak Hat","慕納克帽","head_top"],[2268,"Pipe","煙斗","head_low"],[2272,"Stop Post","禁止標誌","head_top"],[2274,"Ghost Bandana","幽靈頭巾","head_top"],[2277,"Nurse Cap","護士帽","head_top"],[2280,"Sakkat","斗笠","head_top"],[2282,"Halo","光環","head_top"],[2285,"Apple of Archer","弓箭手的蘋果","head_top"],[2286,"Elven Ears","精靈耳","head_mid"],[2287,"Pirate Bandana","海盜頭巾","head_top"],[2288,"Mr. Scream","尖叫先生","head_low"],[2289,"Poo Poo Hat","便便帽","head_top"],[2291,"Butterfly Mask","蝴蝶面具","head_mid"],[2292,"Welding Mask","焊接面罩","head_low"],[2296,"Binoculars","望遠鏡","head_mid"],[2297,"Goblin Mask","哥布林面具","head_low"],[2298,"Green Feeler","綠色觸角","head_top"],[2299,"Orc Helm","獸人頭盔","head_top"],[2301,"Cotton Shirt","棉襯衫","armor"],[2302,"Cotton Shirt","棉襯衫","armor"],[2303,"Jacket","夾克","armor"],[2304,"Jacket","夾克","armor"],[2305,"Adventurer's Suit","冒險家套裝","armor"],[2306,"Adventurer's Suit","冒險家套裝","armor"],[2307,"Mantle","斗篷","armor"],[2308,"Mantle","斗篷","armor"],[2311,"Mink Coat","貂皮大衣","armor"],[2314,"Chain Mail","鎖子甲","armor"],[2316,"Full Plate","全身鎧甲","armor"],[2320,"Formal Suit","正式禮服","armor"],[2321,"Silk Robe","絲綢長袍","armor"],[2324,"Scapulare","聖肩衣","armor"],[2329,"Wooden Mail","木甲","armor"],[2330,"Tights","緊身衣","armor"],[2333,"Silver Robe","銀色長袍","armor"],[2335,"Thief Clothes","盜賊服","armor"],[2336,"Thief Clothes","盜賊服","armor"],[2337,"Ninja Suit","忍者裝","armor"],[2353,"Odin's Blessing","奧丁的祝福","armor"],[2355,"Angelic Protection","天使保護","armor"],[2357,"Valkyrie Armor","女武神鎧甲","armor"],[2367,"Sniping Suit","狙擊服","armor"],[2404,"Shoes","鞋子","shoes"],[2405,"Boots","長靴","shoes"],[2406,"Boots","長靴","shoes"],[2410,"Sleipnir","斯雷普尼爾","shoes"],[2411,"Greaves","護脛","shoes"],[2418,"Vidar's Boots","維達之靴","shoes"],[2419,"Goibne's Greaves","高布紐的護脛","shoes"],[2420,"Angel's Reincarnation","天使轉生","shoes"],[2424,"Tidal Shoes","潮汐之鞋","shoes"],[2503,"Muffler","圍巾","garment"],[2504,"Muffler","圍巾","garment"],[2505,"Manteau","披風","garment"],[2507,"Cape of Ancient Lord","古代君主披風","garment"],[2509,"Manteau of Survival","生存披風","garment"],[2511,"Skeleton Manteau","骷髏披風","garment"],[2515,"Eagle Wing","鷹之翼","garment"],[2603,"Necklace","項鍊","acc"],[2605,"Brooch","胸針","acc"],[2607,"Clip","夾子","acc"],[2608,"Rosary","玫瑰念珠","acc"],[2609,"Skull Ring","骷髏戒指","acc"],[2610,"Gold Ring","金戒指","acc"],[2614,"Eye of Dullahan","杜拉漢之眼","acc"],[2615,"Safety Ring","安全戒指","acc"],[2616,"Critical Ring","爆擊戒指","acc"],[2617,"Celebrant's Mitten","祭司手套","acc"],[2619,"Bow Thimble","弓箭手的頂針","acc"],[2620,"Rogue's Treasure","流氓的寶物","acc"],[2627,"Belt","腰帶","acc"],[2629,"Megingjord","雷神腰帶","acc"],[2630,"Brisingamen","布理辛格曼","acc"],[2678,"Ring of Flame Lord","火焰領主戒指","acc"],[2679,"Ring of Resonance","共鳴戒指","acc"],[5008,"Puppy Love","小狗之愛","head_top"],[5012,"Ph.D Hat","博士帽","head_top"],[5013,"Lord Kaho's Horn","卡侯領主之角","head_top"],[5017,"Bone Helm","骨盔","head_top"],[5019,"Corsair","海盜帽","head_top"],[5035,"Poring Hat","波利帽","head_top"],[5038,"Deviruchi Hat","小惡魔帽","head_top"],[5046,"Bongun Hat","邦艮帽","head_top"],[13001,"Dragon Killer","屠龍刀","weapon"],[13007,"Jitte","十手","weapon"],[13011,"Asura","阿修羅","weapon"],[13046,"Krieg","克里格","weapon"],[13101,"Six Shooter","六連發左輪","weapon"],[13104,"Garrison","守備兵","weapon"],[13150,"Branch","樹枝","weapon"],[13151,"Cyclone","旋風","weapon"],[13156,"Gate Keeper","守門人","weapon"],[13160,"Destroyer","毀滅者","weapon"],[13301,"Huuma Giant Wheel Shuriken","風魔巨輪手裡劍","weapon"],[13303,"Huuma Blaze Shuriken","風魔火焰手裡劍","weapon"],[22847,"Prontera Patrol Badge","普隆德拉巡邏隊徽章","acc"]],[[4001,"Poring Card","波利卡片","armor"],[4002,"Fabre Card","綠棉蟲卡片","armor"],[4003,"Pupa Card","蟲蛹卡片","armor"],[4004,"Drops Card","土波利卡片","accessory"],[4006,"Lunatic Card","瘋兔卡片","garment"],[4007,"Pecopeco Egg Card","大嘴鳥蛋卡片","armor"],[4008,"Picky Card","皮丘卡片","armor"],[4009,"Chonchon Card","叮噹蒼蠅卡片","garment"],[4010,"Willow Card","樹精卡片","headgear"],[4012,"Thiefbug Egg Card","盜蟲卵卡片","armor"],[4014,"Roda Frog Card","洛達蛙卡片","armor"],[4015,"Condor Card","禿鷹卡片","accessory"],[4016,"Thief Bug Card","盜蟲卡片","armor"],[4017,"Savage Bebe Card","小野豬卡片","weapon"],[4019,"Hornet Card","大黃蜂卡片","weapon"],[4020,"Familiar Card","蝙蝠卡片","weapon"],[4021,"Rocker Card","搖滾蝗蟲卡片","accessory"],[4022,"Spore Card","菇菇卡片","armor"],[4023,"Baby Desert Wolf Card","沙漠幼狼卡片","weapon"],[4024,"Plankton Card","浮游生物卡片","weapon"],[4025,"Skeleton Card","骷髏卡片","weapon"],[4026,"Female Thiefbug Card","母盜蟲卡片","weapon"],[4027,"Kukre Card","庫克雷卡片","accessory"],[4028,"Tarou Card","塔羅鼠卡片","accessory"],[4029,"Wolf Card","狼卡片","weapon"],[4030,"Mandragora Card","曼陀羅花卡片","weapon"],[4033,"PoPoring Card","波波利卡片","headgear"],[4034,"Wormtail Card","蠕蟲尾卡片","accessory"],[4035,"Hydra Card","海葵卡片","weapon"],[4037,"Snake Card","蟒蛇卡片","weapon"],[4038,"Zombie Card","殭屍卡片","armor"],[4040,"Creamy Card","粉蝶卡片","accessory"],[4044,"Smokie Card","狸貓卡片","accessory"],[4047,"Ghostring Card","幽靈波利卡片","armor"],[4048,"Poison Spore Card","毒菇卡片","accessory"],[4049,"Vadon Card","瓦頓蟹卡片","weapon"],[4052,"Elder Willow Card","老樹精卡片","headgear"],[4054,"Angelring Card","天使波利卡片","armor"],[4055,"Marina Card","水母卡片","weapon"],[4060,"Goblin Card","哥布林卡片","weapon"],[4061,"Cornutus Card","海螺卡片","armor"],[4066,"Orc Warrior Card","獸人戰士卡片","shield"],[4069,"Drainliar Card","吸血蝙蝠卡片","weapon"],[4073,"Pirate Skel Card","海盜骷髏卡片","accessory"],[4074,"Bigfoot Card","大腳熊卡片","shield"],[4077,"Phen Card","芬魚卡片","accessory"],[4084,"Marine Sphere Card","海洋炸彈卡片","accessory"],[4085,"Orc Skeleton Card","獸人骷髏卡片","weapon"],[4086,"Soldier Skeleton Card","骷髏士兵卡片","weapon"],[4089,"Swordfish Card","劍魚卡片","armor"],[4090,"Munak Card","慕納克卡片","shield"],[4091,"Kobold Card","犬妖卡片","weapon"],[4093,"Obeaune Card","歐比恩卡片","accessory"],[4094,"Archer Skeleton Card","骷髏弓箭手卡片","weapon"],[4095,"Marse Card","章魚卡片","garment"],[4098,"Dokkaebi Card","獨角鬼卡片","armor"],[4100,"Sohee Card","蘇熙卡片","shoes"],[4102,"Whisper Card","幽影卡片","garment"],[4103,"Horong Card","火鬼卡片","accessory"],[4111,"Strouf Card","史特勞夫卡片","weapon"],[4123,"Eddga Card","虎王卡片","shoes"],[4125,"Deviace Card","迪維斯卡片","weapon"],[4128,"Golden Thiefbug Card","黃金蟲卡片","shield"],[4131,"Moonlight Flower Card","月夜貓卡片","shoes"],[4137,"Drake Card","德瑞克卡片","weapon"],[4143,"Orc Hero Card","獸人英雄卡片","headgear"],[4144,"Osiris Card","歐西里斯卡片","accessory"],[4147,"Baphomet Card","巴風特卡片","weapon"],[4159,"Nine Tail Card","九尾狐卡片","garment"],[4174,"Devilring Card","惡魔波利卡片","garment"],[4178,"Dragon Tail Card","龍尾蜻蜓卡片","garment"],[4179,"Dragonfly Card","龍蜻蜓卡片","garment"],[4183,"Wandering Wolf Card","流浪狼卡片","garment"],[4197,"Mastering Card","波利王卡片","accessory"],[4199,"Merman Card","魚人卡片","accessory"],[4211,"Vocal Card","吟唱蝗蟲卡片","headgear"],[4212,"Bongun Card","邦艮卡片","accessory"],[4221,"Skeleton General Card","骷髏將軍卡片","shoes"],[4266,"Eclipse Card","蝕月兔卡片","garment"],[4283,"Greatest General Card","天下大將軍卡片","accessory"],[4290,"Cat O' Nine Tails Card","九尾貓卡片","shoes"],[4296,"Cramp Card","巨鼠卡片","headgear"],[4306,"Toad Card","蟾蜍卡片","garment"],[4314,"Penomena Card","佩諾梅娜卡片","shield"],[4328,"Yao Jun Card","惠君卡片","garment"],[4524,"King Dramoh Card","朵拉莫王卡片","headgear"],[4525,"Kraken Card","克拉肯卡片","garment"]],[[9001,"Poring Egg","波利蛋",""],[9004,"Lunatic Egg","瘋兔蛋",""],[9002,"Drops Egg","土波利蛋",""],[9005,"Picky Egg","皮丘蛋",""],[9009,"Savage Bebe Egg","小野豬蛋",""],[9010,"Baby Desert Wolf Egg","沙漠幼狼蛋",""],[9011,"Rocker Egg","搖滾蝗蟲蛋",""],[9138,"Familiar Egg","蝙蝠蛋",""],[9069,"Mastering Egg","波利王蛋",""],[9045,"Whisper Egg","幽影蛋",""],[9012,"Spore Egg","菇菇蛋",""],[9013,"Poison Spore Egg","毒菇蛋",""],[9003,"Poporing Egg","波波利蛋",""],[9015,"Smokie Egg","狸貓蛋",""],[9019,"Dokkaebi Egg","獨角鬼蛋",""],[9095,"Nine Tails Egg","九尾狐蛋",""],[9103,"Willow Egg","樹精蛋",""],[9088,"Angelring Egg","天使波利蛋",""],[9018,"Munak Egg","慕納克蛋",""],[9025,"Bongun Egg","邦艮蛋",""],[9020,"Sohee Egg","蘇熙蛋",""],[9093,"Hyegun Egg","惠君蛋",""],[9096,"Cat O Nine Tails Egg","九尾貓蛋",""],[9112,"Moonlight Flower Egg","月夜貓蛋",""]]].map(rows => {
    const index = new Map();
    for (const [id,en,zh,slot] of rows) {
      for (const key of ["#" + id,en,zh]) {
        if (key) index.set(key.normalize("NFKC").trim().toLowerCase(), {id,en,zh,slot});
      }
    }
    return index;
  });
  const cardEffects = {"4001":["+3% 迴避","+2% 爆擊"],"4002":["+30 最大 HP"],"4003":["+40 最大 HP"],"4004":["+6% 投射物速度","+3% 傷害"],"4006":["+3% 爆擊","+2% 迴避"],"4007":["-3% 受到傷害"],"4008":["+3% 傷害","+10 最大 HP"],"4009":["+5% 移動速度"],"4010":["+5 冷卻縮減"],"4012":["+25 最大 HP","+1 護甲"],"4014":["+40 最大 HP"],"4015":["+5% 迴避"],"4016":["+3% 迴避"],"4017":["命中時 +5% 暈眩"],"4019":["+3% 傷害","+1% 爆擊"],"4020":["命中時 +3% 暈眩"],"4021":["+4% 傷害"],"4022":["+2 護甲"],"4023":["+3 冷卻縮減"],"4024":["命中時 +4% 暈眩"],"4025":["+4% 傷害","命中時 +2% 暈眩"],"4026":["+2% 爆擊","+2% 傷害"],"4027":["+2 AGI"],"4028":["+2 STR"],"4029":["+6% 傷害","+2% 爆擊"],"4030":["+5% 傷害"],"4033":["+0.5 HP/秒"],"4034":["+2 DEX"],"4035":["+5% 傷害"],"4037":["+3% 爆擊","+2% 傷害"],"4038":["+1 HP/秒"],"4040":["+4% 移動速度","+2% 迴避"],"4044":["+12% 拾取範圍","+3% 移動速度"],"4047":["+12% 迴避","-0.5 HP/秒"],"4048":["+2 STR"],"4049":["+5% 傷害"],"4052":["+2 INT"],"4054":["+60 最大 HP","+2 護甲"],"4055":["命中時 +5% 暈眩","+2% 傷害"],"4060":["+8% 傷害"],"4061":["+1 護甲","-3% 受到傷害"],"4066":["-8% 受到傷害"],"4069":["+5% 傷害"],"4073":["+15% 金幣"],"4074":["-5% 受到傷害"],"4077":["+4 冷卻縮減"],"4084":["+5% 範圍"],"4085":["+12% 對頭目與不死族傷害"],"4086":["+5% 爆擊"],"4089":["+1 護甲","-3% 受到傷害"],"4090":["+2 護甲"],"4091":["+5% 爆擊"],"4093":["+25 最大 HP"],"4094":["+8% 投射物速度","+2% 傷害"],"4095":["+5% 迴避"],"4098":["+4% 迴避","+2% 移動速度"],"4100":["+4 冷卻縮減","+15 最大 HP"],"4102":["+8% 迴避","+4% 受到傷害"],"4103":["+4% 範圍"],"4111":["對頭目與菁英傷害 +8%"],"4123":["+12% 移動速度","+2 護甲"],"4125":["+6% 傷害"],"4128":["-15% 受到傷害"],"4131":["+8% 移動速度","移動時 +0.6 HP/秒"],"4137":["對頭目與菁英傷害 +15%","+5% 傷害"],"4143":["+3 護甲","+40 最大 HP"],"4144":["每局可滿血復活一次"],"4147":["+20% 範圍","+10% 傷害"],"4159":["+2 AGI","+5% 迴避"],"4174":["-12% 受到傷害"],"4178":["+4% 移動速度"],"4179":["+1 AGI","+2% 迴避"],"4183":["+1 STR","+4% 傷害"],"4197":["+6% 迴避","+3% 爆擊"],"4199":["+0.6 HP/秒"],"4211":["+6% 移動速度","+3% 迴避"],"4212":["+2 VIT"],"4221":["+6% 移動速度","+5% 對頭目與不死族傷害"],"4266":["+50 最大 HP","+1 護甲"],"4283":["+30 最大 HP","+1 護甲"],"4290":["+50 最大 HP","+0.5 HP/秒"],"4296":["+12% 金幣"],"4306":["+5% 迴避"],"4314":["-6% 受到傷害"],"4328":["-6% 受到傷害","+3% 迴避"],"4524":["+2 STR"],"4525":["+8% 迴避","+3% 爆擊"]};
  const modifiedCardCatalog = {"4001":["Poring Card","波利卡片","armor",["+4.5% 迴避","+3% 爆擊"],["+6% 迴避","+4% 爆擊"]],"4002":["Fabre Card","綠棉蟲卡片","armor",["+45 最大 HP"],["+60 最大 HP"]],"4003":["Pupa Card","蟲蛹卡片","armor",["+60 最大 HP"],["+80 最大 HP"]],"4004":["Drops Card","土波利卡片","accessory",["+9% 投射物速度","+4.5% 傷害"],["+12% 投射物速度","+6% 傷害"]],"4006":["Lunatic Card","瘋兔卡片","garment",["+4.5% 爆擊","+3% 迴避"],["+6% 爆擊","+4% 迴避"]],"4007":["Pecopeco Egg Card","大嘴鳥蛋卡片","armor",["-4.5% 受到傷害"],["-6% 受到傷害"]],"4008":["Picky Card","小雞卡片","armor",["+4.5% 傷害","+15 最大 HP"],["+6% 傷害","+20 最大 HP"]],"4009":["Chonchon Card","蒼蠅卡片","garment",["+7.5% 移動速度"],["+10% 移動速度"]],"4010":["Willow Card","樹精卡片","headgear",["+7.5 急速"],["+10 急速"]],"4012":["Thiefbug Egg Card","盜蟲卵卡片","armor",["+37.5 最大 HP","+1.5 護甲"],["+50 最大 HP","+2 護甲"]],"4014":["Roda Frog Card","羅達蛙卡片","armor",["+60 最大 HP"],["+80 最大 HP"]],"4015":["Condor Card","禿鷹卡片","accessory",["+7.5% 迴避"],["+10% 迴避"]],"4016":["Thief Bug Card","盜蟲卡片","armor",["+4.5% 迴避"],["+6% 迴避"]],"4017":["Savage Bebe Card","小野豬卡片","weapon",["+7.5% 命中時暈眩機率"],["+10% 命中時暈眩機率"]],"4019":["Hornet Card","蜂兵卡片","weapon",["+4.5% 傷害","+1.5% 爆擊"],["+6% 傷害","+2% 爆擊"]],"4020":["Familiar Card","吸血蝙蝠卡片","weapon",["+4.5% 命中時暈眩機率"],["+6% 命中時暈眩機率"]],"4021":["Rocker Card","搖滾蝗蟲卡片","accessory",["+6% 傷害"],["+8% 傷害"]],"4022":["Spore Card","魔菇卡片","armor",["+3 護甲"],["+4 護甲"]],"4023":["Baby Desert Wolf Card","沙漠幼狼卡片","weapon",["+4.5 急速"],["+6 急速"]],"4024":["Plankton Card","漂浮蟲卡片","weapon",["+6% 命中時暈眩機率"],["+8% 命中時暈眩機率"]],"4025":["Skeleton Card","邪骸戰士卡片","weapon",["+6% 傷害","+3% 命中時暈眩機率"],["+8% 傷害","+4% 命中時暈眩機率"]],"4026":["Female Thiefbug Card","浮勒盜蟲卡片","weapon",["+3% 爆擊","+3% 傷害"],["+4% 爆擊","+4% 傷害"]],"4027":["Kukre Card","庫克雷卡片","accessory",["+3 AGI"],["+4 AGI"]],"4028":["Tarou Card","白鼠卡片","accessory",["+3 STR"],["+4 STR"]],"4029":["Wolf Card","野狼卡片","weapon",["+9% 傷害","+3% 爆擊"],["+12% 傷害","+4% 爆擊"]],"4030":["Mandragora Card","曼陀羅卡片","weapon",["+7.5% 傷害"],["+10% 傷害"]],"4033":["PoPoring Card","波波利卡片","headgear",["+0.75 HP／秒"],["+1 HP／秒"]],"4034":["Wormtail Card","森靈卡片","accessory",["+3 DEX"],["+4 DEX"]],"4035":["Hydra Card","海葵卡片","weapon",["+7.5% 傷害"],["+10% 傷害"]],"4037":["Snake Card","青蛇卡片","weapon",["+4.5% 爆擊","+3% 傷害"],["+6% 爆擊","+4% 傷害"]],"4038":["Zombie Card","腐屍卡片","armor",["+1.5 HP／秒"],["+2 HP／秒"]],"4040":["Creamy Card","克瑞米卡片","accessory",["+6% 移動速度","+3% 迴避"],["+8% 移動速度","+4% 迴避"]],"4044":["Smokie Card","浣熊卡片","accessory",["+18% 拾取範圍","+4.5% 移動速度"],["+24% 拾取範圍","+6% 移動速度"]],"4047":["Ghostring Card","幽靈波利卡片","armor",["+18% 迴避","-0.75 HP／秒"],["+24% 迴避","-1 HP／秒"]],"4048":["Poison Spore Card","毒魔菇卡片","accessory",["+3 STR"],["+4 STR"]],"4049":["Vadon Card","螃蟹卡片","weapon",["+7.5% 傷害"],["+10% 傷害"]],"4052":["Elder Willow Card","長老樹精卡片","headgear",["+3 INT"],["+4 INT"]],"4054":["Angelring Card","天使波利卡片","armor",["+90 最大 HP","+3 護甲"],["+120 最大 HP","+4 護甲"]],"4055":["Marina Card","水母卡片","weapon",["+7.5% 命中時暈眩機率","+3% 傷害"],["+10% 命中時暈眩機率","+4% 傷害"]],"4060":["Goblin Card","哥布靈卡片","weapon",["+12% 傷害"],["+16% 傷害"]],"4061":["Cornutus Card","卡那多斯卡片","armor",["+1.5 護甲","-4.5% 受到傷害"],["+2 護甲","-6% 受到傷害"]],"4066":["Orc Warrior Card","獸人戰士卡片","shield",["-12% 受到傷害"],["-16% 受到傷害"]],"4069":["Drainliar Card","紅蝙蝠卡片","weapon",["+7.5% 傷害"],["+10% 傷害"]],"4071":["Orc Zombie Card","獸人腐屍卡片","garment",["-7.5% 受到傷害","+1.5% 迴避"],["-10% 受到傷害","+2% 迴避"]],"4073":["Pirate Skel Card","邪骸海盜卡片","accessory",["+22.5% 金幣"],["+30% 金幣"]],"4074":["Bigfoot Card","大腳熊卡片","shield",["-7.5% 受到傷害"],["-10% 受到傷害"]],"4077":["Phen Card","劍魚卡片","accessory",["+6 急速"],["+8 急速"]],"4084":["Marine Sphere Card","氣泡蟲卡片","accessory",["+7.5% 範圍"],["+10% 範圍"]],"4085":["Orc Skeleton Card","邪骸獸人卡片","weapon",["+18% 對頭目與不死族傷害"],["+24% 對頭目與不死族傷害"]],"4086":["Soldier Skeleton Card","邪骸士兵卡片","weapon",["+7.5% 爆擊"],["+10% 爆擊"]],"4089":["Swordfish Card","異變魚卡片","armor",["+1.5 護甲","-4.5% 受到傷害"],["+2 護甲","-6% 受到傷害"]],"4090":["Munak Card","殭屍卡片","shield",["+3 護甲"],["+4 護甲"]],"4091":["Kobold Card","犬妖卡片","weapon",["+7.5% 爆擊"],["+10% 爆擊"]],"4093":["Obeaune Card","人魚卡片","accessory",["+37.5 最大 HP"],["+50 最大 HP"]],"4094":["Archer Skeleton Card","邪骸弓箭手卡片","weapon",["+12% 投射物速度","+3% 傷害"],["+16% 投射物速度","+4% 傷害"]],"4095":["Marse Card","烏賊卡片","garment",["+7.5% 迴避"],["+10% 迴避"]],"4097":["Matyr Card","黑狐卡片","shoes",["+60 最大 HP","+3% 移動速度"],["+80 最大 HP","+4% 移動速度"]],"4098":["Dokkaebi Card","土人卡片","armor",["+6% 迴避","+3% 移動速度"],["+8% 迴避","+4% 移動速度"]],"4100":["Sohee Card","鬼女卡片","shoes",["+6 急速","+22.5 最大 HP"],["+8 急速","+30 最大 HP"]],"4102":["Whisper Card","白幽靈卡片","garment",["+12% 迴避","+6% 受到傷害"],["+16% 迴避","+8% 受到傷害"]],"4103":["Horong Card","鬼火卡片","accessory",["+6% 範圍"],["+8% 範圍"]],"4106":["Mummy Card","木乃伊卡片","weapon",["+9% 穿透機率"],["+12% 穿透機率"]],"4107":["Verit Card","木乃伊犬卡片","shoes",["+75 最大 HP"],["+100 最大 HP"]],"4111":["Strouf Card","海神卡片","weapon",["+12% 對頭目與菁英傷害"],["+16% 對頭目與菁英傷害"]],"4114":["Argiope Card","艾吉歐蜈蚣卡片","armor",["+3 護甲","-4.5% 受到傷害"],["+4 護甲","-6% 受到傷害"]],"4115":["Hunter Fly Card","赤蒼蠅卡片","weapon",["+6% 傷害","+0.75 HP／秒"],["+8% 傷害","+1 HP／秒"]],"4116":["Isis Card","伊希斯卡片","garment",["-7.5% 受到傷害","+3% 迴避"],["-10% 受到傷害","+4% 迴避"]],"4117":["Sidewinder Card","黑蛇卡片","weapon",["+7.5% 雙重詠唱"],["+10% 雙重詠唱"]],"4123":["Eddga Card","虎王卡片","shoes",["+18% 移動速度","+3 護甲"],["+24% 移動速度","+4 護甲"]],"4125":["Deviace Card","狄奧斯卡片","weapon",["+9% 傷害"],["+12% 傷害"]],"4126":["Minorous Card","牛頭人卡片","weapon",["+9% 傷害","+6% 對頭目與菁英傷害"],["+12% 傷害","+8% 對頭目與菁英傷害"]],"4128":["Golden Thiefbug Card","黃金蟲卡片","shield",["-22.5% 受到傷害"],["-30% 受到傷害"]],"4129":["Baphomet Jr. Card","小巴風特卡片","garment",["+4.5 急速","+3% 爆擊"],["+6 急速","+4% 爆擊"]],"4131":["Moonlight Flower Card","月夜貓卡片","shoes",["+12% 移動速度","+0.9 移動時 HP／秒"],["+16% 移動速度","+1.2 移動時 HP／秒"]],"4137":["Drake Card","海盜之王卡片","weapon",["+22.5% 對頭目與菁英傷害","+7.5% 傷害"],["+30% 對頭目與菁英傷害","+10% 傷害"]],"4143":["Orc Hero Card","獸人英雄卡片","headgear",["+4.5 護甲","+60 最大 HP"],["+6 護甲","+80 最大 HP"]],"4144":["Osiris Card","俄塞里斯卡片","accessory",["每局可滿血復活一次"],["每局可滿血復活一次"]],"4147":["Baphomet Card","巴風特卡片","weapon",["+30% 範圍","+15% 傷害"],["+40% 範圍","+20% 傷害"]],"4155":["Goblin Leader Card","哥布靈首領卡片","weapon",["+12% 傷害","+9% 對頭目與菁英傷害"],["+16% 傷害","+12% 對頭目與菁英傷害"]],"4157":["Goblin Archer Card","弓箭哥布靈卡片","weapon",["+18% 爆擊傷害","+6% 對頭目與不死族傷害"],["+24% 爆擊傷害","+8% 對頭目與不死族傷害"]],"4159":["Nine Tail Card","九尾狐卡片","garment",["+3 AGI","+7.5% 迴避"],["+4 AGI","+10% 迴避"]],"4174":["Devilring Card","惡魔波利卡片","garment",["-18% 受到傷害"],["-24% 受到傷害"]],"4178":["Dragon Tail Card","刺尾蜻蜓卡片","garment",["+6% 移動速度"],["+8% 移動速度"]],"4179":["Dragonfly Card","龍蠅卡片","garment",["+2 AGI","+3% 迴避"],["+2 AGI","+4% 迴避"]],"4183":["Wandering Wolf Card","遊蕩狼卡片","garment",["+2 STR","+6% 傷害"],["+2 STR","+8% 傷害"]],"4188":["Leib Olmai Card","狂暴大腳熊卡片","headgear",["+22.5% 拾取範圍","+15% 金幣"],["+30% 拾取範圍","+20% 金幣"]],"4197":["Mastering Card","波利之王卡片","accessory",["+9% 迴避","+4.5% 爆擊"],["+12% 迴避","+6% 爆擊"]],"4199":["Merman Card","人魚士兵卡片","accessory",["+0.9 HP／秒"],["+1.2 HP／秒"]],"4211":["Vocal Card","蝗蟲之王卡片","headgear",["+9% 移動速度","+4.5% 迴避"],["+12% 移動速度","+6% 迴避"]],"4212":["Bongun Card","妖道卡片","accessory",["+3 VIT"],["+4 VIT"]],"4216":["Sasquatch Card","雪熊卡片","armor",["-9% 受到傷害","+60 最大 HP"],["-12% 受到傷害","+80 最大 HP"]],"4221":["Skeleton General Card","邪骸戰士長卡片","shoes",["+9% 移動速度","+7.5% 對頭目與不死族傷害"],["+12% 移動速度","+10% 對頭目與不死族傷害"]],"4248":["Ancient Mummy Card","狂暴木乃伊卡片","shield",["+1.8 HP／秒","+45 最大 HP"],["+2.4 HP／秒","+60 最大 HP"]],"4255":["Orc Lady Card","獸人女戰士卡片","weapon",["+6% 傷害","+7.5% 對頭目與菁英傷害"],["+8% 傷害","+10% 對頭目與菁英傷害"]],"4256":["Orc Archer Card","獸人弓箭手卡片","accessory",["+15% 金幣"],["+20% 金幣"]],"4266":["Eclipse Card","藍瘋兔卡片","garment",["+75 最大 HP","+1.5 護甲"],["+100 最大 HP","+2 護甲"]],"4283":["Greatest General Card","將軍魔碑卡片","accessory",["+45 最大 HP","+1.5 護甲"],["+60 最大 HP","+2 護甲"]],"4290":["Cat O' Nine Tails Card","狂暴月夜貓卡片","shoes",["+75 最大 HP","+0.75 HP／秒"],["+100 最大 HP","+1 HP／秒"]],"4291":["Kobold Leader Card","犬妖首領卡片","weapon",["+7.5% 爆擊","+7.5% 傷害"],["+10% 爆擊","+10% 傷害"]],"4296":["Cramp Card","藍鼠卡片","headgear",["+18% 金幣"],["+24% 金幣"]],"4301":["Killer Mantis Card","狂暴螳螂卡片","armor",["+4.5% 命中時暈眩機率","-6% 受到傷害"],["+6% 命中時暈眩機率","-8% 受到傷害"]],"4306":["Toad Card","蛙王卡片","garment",["+7.5% 迴避"],["+10% 迴避"]],"4314":["Penomena Card","梅納海葵卡片","shield",["-9% 受到傷害"],["-12% 受到傷害"]],"4322":["High Orc Card","獸人戰士長卡片","shield",["-9% 受到傷害","+3 護甲"],["-12% 受到傷害","+4 護甲"]],"4328":["Yao Jun Card","妖君卡片","garment",["-9% 受到傷害","+4.5% 迴避"],["-12% 受到傷害","+6% 迴避"]],"4375":["Orc Baby Card","獸人嬰兒卡片","garment",["+7.5% 迴避","-3% 受到傷害"],["+10% 迴避","-4% 受到傷害"]],"4524":["King Dramoh Card","大腳龍蝦卡片","headgear",["+3 STR"],["+4 STR"]],"4525":["Kraken Card","魔鬼大烏賊卡片","garment",["+12% 迴避","+4.5% 爆擊"],["+16% 迴避","+6% 爆擊"]]};
  const modifiedCardNames = new Map(Object.values(modifiedCardCatalog).flatMap(card =>
    [card[0],card[1]].map(name => [name.normalize("NFKC").trim().toLowerCase(),card])));
  function modifiedCardInfo(name, iconKey, aliases) {
    const variant = name.normalize("NFKC").trim().match(/^(.*?)(?:\s*[·・･]\s*|\s+)改(2)?$/u);
    const id = Number((iconKey || name).match(/(?:^id:|^#|\/)(\d+)(?:\.[^/]+)?$/)?.[1]);
    const lap = id >= 1000000 ? Math.floor(id / 1000000) : variant ? (variant[2] ? 2 : 1) : 0;
    if (lap !== 1 && lap !== 2) return null;
    const baseName = variant?.[1].trim().toLowerCase();
    const card = modifiedCardCatalog[id % 1000000] || modifiedCardNames.get(baseName) ||
      modifiedCardCatalog[aliases?.get(baseName)?.id];
    if (!card) return null;
    return {name:card[1] + (lap === 1 ? "・改" : "・改²"),english:card[0],slot:card[2],effects:card[2+lap]};
  }
  const currentHansCards = [{"id":4001,"en":"Poring Card","zh":"波利卡片","slot":"armor","boss":false,"effects":[["+3% 迴避","+2% 爆擊"],["+4.5% 迴避","+3% 爆擊"],["+6% 迴避","+4% 爆擊"],["+7.5% 迴避","+5% 爆擊"],["+9% 迴避","+6% 爆擊"],["+10.5% 迴避","+7% 爆擊"]]},{"id":4006,"en":"Lunatic Card","zh":"瘋兔卡片","slot":"garment","boss":false,"effects":[["+3% 爆擊","+2% 迴避"],["+4.5% 爆擊","+3% 迴避"],["+6% 爆擊","+4% 迴避"],["+7.5% 爆擊","+5% 迴避"],["+9% 爆擊","+6% 迴避"],["+10.5% 爆擊","+7% 迴避"]]},{"id":4002,"en":"Fabre Card","zh":"綠棉蟲卡片","slot":"armor","boss":false,"effects":[["+30 最大 HP"],["+45 最大 HP"],["+60 最大 HP"],["+75 最大 HP"],["+90 最大 HP"],["+105 最大 HP"]]},{"id":4004,"en":"Drops Card","zh":"土波利卡片","slot":"accessory","boss":false,"effects":[["+6% 投射物速度","+3% 傷害"],["+9% 投射物速度","+4.5% 傷害"],["+12% 投射物速度","+6% 傷害"],["+15% 投射物速度","+7.5% 傷害"],["+18% 投射物速度","+9% 傷害"],["+21% 投射物速度","+10.5% 傷害"]]},{"id":4009,"en":"Chonchon Card","zh":"蒼蠅卡片","slot":"garment","boss":false,"effects":[["+5% 移動速度"],["+7.5% 移動速度"],["+10% 移動速度"],["+12.5% 移動速度"],["+15% 移動速度"],["+17.5% 移動速度"]]},{"id":4021,"en":"Rocker Card","zh":"搖滾蝗蟲卡片","slot":"accessory","boss":false,"effects":[["+4% 傷害"],["+6% 傷害"],["+8% 傷害"],["+10% 傷害"],["+12% 傷害"],["+14% 傷害"]]},{"id":4010,"en":"Willow Card","zh":"樹精卡片","slot":"headgear","boss":false,"effects":[["+5 急速"],["+7.5 急速"],["+10 急速"],["+12.5 急速"],["+15 急速"],["+17.5 急速"]]},{"id":4015,"en":"Condor Card","zh":"禿鷹卡片","slot":"accessory","boss":false,"effects":[["+5% 迴避"],["+7.5% 迴避"],["+10% 迴避"],["+12.5% 迴避"],["+15% 迴避"],["+17.5% 迴避"]]},{"id":4022,"en":"Spore Card","zh":"魔菇卡片","slot":"armor","boss":false,"effects":[["+2 護甲"],["+3 護甲"],["+4 護甲"],["+5 護甲"],["+6 護甲"],["+7 護甲"]]},{"id":4033,"en":"PoPoring Card","zh":"波波利卡片","slot":"headgear","boss":false,"effects":[["+0.5 HP／秒"],["+0.75 HP／秒"],["+1 HP／秒"],["+1.25 HP／秒"],["+1.5 HP／秒"],["+1.75 HP／秒"]]},{"id":4017,"en":"Savage Bebe Card","zh":"小野豬卡片","slot":"weapon","boss":false,"effects":[["+5% 命中暈眩機率"],["+7.5% 命中暈眩機率"],["+10% 命中暈眩機率"],["+12.5% 命中暈眩機率"],["+15% 命中暈眩機率"],["+17.5% 命中暈眩機率"]]},{"id":4044,"en":"Smokie Card","zh":"浣熊卡片","slot":"accessory","boss":false,"effects":[["+12% 拾取範圍","+3% 移動速度"],["+18% 拾取範圍","+4.5% 移動速度"],["+24% 拾取範圍","+6% 移動速度"],["+30% 拾取範圍","+7.5% 移動速度"],["+36% 拾取範圍","+9% 移動速度"],["+42% 拾取範圍","+10.5% 移動速度"]]},{"id":4029,"en":"Wolf Card","zh":"野狼卡片","slot":"weapon","boss":false,"effects":[["+6% 傷害","+2% 爆擊"],["+9% 傷害","+3% 爆擊"],["+12% 傷害","+4% 爆擊"],["+15% 傷害","+5% 爆擊"],["+18% 傷害","+6% 爆擊"],["+21% 傷害","+7% 爆擊"]]},{"id":4066,"en":"Orc Warrior Card","zh":"獸人戰士卡片","slot":"shield","boss":false,"effects":[["+8% 減傷"],["+12% 減傷"],["+16% 減傷"],["+20% 減傷"],["+24% 減傷"],["+28% 減傷"]]},{"id":4060,"en":"Goblin Card","zh":"哥布靈卡片","slot":"weapon","boss":false,"effects":[["+8% 傷害"],["+12% 傷害"],["+16% 傷害"],["+20% 傷害"],["+24% 傷害"],["+28% 傷害"]]},{"id":4091,"en":"Kobold Card","zh":"犬妖卡片","slot":"weapon","boss":false,"effects":[["+5% 爆擊"],["+7.5% 爆擊"],["+10% 爆擊"],["+12.5% 爆擊"],["+15% 爆擊"],["+17.5% 爆擊"]]},{"id":4038,"en":"Zombie Card","zh":"腐屍卡片","slot":"armor","boss":false,"effects":[["+1 HP／秒"],["+1.5 HP／秒"],["+2 HP／秒"],["+2.5 HP／秒"],["+3 HP／秒"],["+3.5 HP／秒"]]},{"id":4085,"en":"Orc Skeleton Card","zh":"邪骸獸人卡片","slot":"weapon","boss":false,"effects":[["+12% 對首領及不死系傷害"],["+18% 對首領及不死系傷害"],["+24% 對首領及不死系傷害"],["+30% 對首領及不死系傷害"],["+36% 對首領及不死系傷害"],["+42% 對首領及不死系傷害"]]},{"id":4054,"en":"Angelring Card","zh":"天使波利卡片","slot":"armor","boss":true,"effects":[["+60 最大 HP","+2 護甲"],["+90 最大 HP","+3 護甲"],["+120 最大 HP","+4 護甲"],["+150 最大 HP","+5 護甲"],["+180 最大 HP","+6 護甲"],["+210 最大 HP","+7 護甲"]]},{"id":4174,"en":"Devilring Card","zh":"惡魔波利卡片","slot":"garment","boss":true,"effects":[["+12% 減傷"],["+18% 減傷"],["+24% 減傷"],["+30% 減傷"],["+36% 減傷"],["+42% 減傷"]]},{"id":4047,"en":"Ghostring Card","zh":"幽靈波利卡片","slot":"armor","boss":true,"effects":[["+12% 迴避","-0.5 HP／秒"],["+18% 迴避","-0.75 HP／秒"],["+24% 迴避","-1 HP／秒"],["+30% 迴避","-1.25 HP／秒"],["+36% 迴避","-1.5 HP／秒"],["+42% 迴避","-1.75 HP／秒"]]},{"id":4123,"en":"Eddga Card","zh":"虎王卡片","slot":"shoes","boss":true,"effects":[["+12% 移動速度","+2 護甲"],["+18% 移動速度","+3 護甲"],["+24% 移動速度","+4 護甲"],["+30% 移動速度","+5 護甲"],["+36% 移動速度","+6 護甲"],["+42% 移動速度","+7 護甲"]]},{"id":4143,"en":"Orc Hero Card","zh":"獸人英雄卡片","slot":"headgear","boss":true,"effects":[["+3 護甲","+40 最大 HP"],["+4.5 護甲","+60 最大 HP"],["+6 護甲","+80 最大 HP"],["+7.5 護甲","+100 最大 HP"],["+9 護甲","+120 最大 HP"],["+10.5 護甲","+140 最大 HP"]]},{"id":4144,"en":"Osiris Card","zh":"俄塞里斯卡片","slot":"accessory","boss":true,"effects":[["每場滿血復活一次"],["每場滿血復活一次"],["每場滿血復活一次"],["每場滿血復活一次"],["每場滿血復活一次"],["每場滿血復活一次"]]},{"id":4147,"en":"Baphomet Card","zh":"巴風特卡片","slot":"weapon","boss":true,"effects":[["+20% 範圍","+10% 傷害"],["+30% 範圍","+15% 傷害"],["+40% 範圍","+20% 傷害"],["+50% 範圍","+25% 傷害"],["+60% 範圍","+30% 傷害"],["+70% 範圍","+35% 傷害"]]},{"id":4071,"en":"Orc Zombie Card","zh":"獸人腐屍卡片","slot":"garment","boss":false,"effects":[["+5% 減傷","+1% 迴避"],["+7.5% 減傷","+1.5% 迴避"],["+10% 減傷","+2% 迴避"],["+12.5% 減傷","+2.5% 迴避"],["+15% 減傷","+3% 迴避"],["+17.5% 減傷","+3.5% 迴避"]]},{"id":4097,"en":"Matyr Card","zh":"黑狐卡片","slot":"shoes","boss":false,"effects":[["+40 最大 HP","+2% 移動速度"],["+60 最大 HP","+3% 移動速度"],["+80 最大 HP","+4% 移動速度"],["+100 最大 HP","+5% 移動速度"],["+120 最大 HP","+6% 移動速度"],["+140 最大 HP","+7% 移動速度"]]},{"id":4106,"en":"Mummy Card","zh":"木乃伊卡片","slot":"weapon","boss":false,"effects":[["+6% 物理穿透"],["+9% 物理穿透"],["+12% 物理穿透"],["+15% 物理穿透"],["+18% 物理穿透"],["+21% 物理穿透"]]},{"id":4107,"en":"Verit Card","zh":"木乃伊犬卡片","slot":"shoes","boss":false,"effects":[["+50 最大 HP"],["+75 最大 HP"],["+100 最大 HP"],["+125 最大 HP"],["+150 最大 HP"],["+175 最大 HP"]]},{"id":4109,"en":"Jakk Card","zh":"南瓜先生卡片","slot":"garment","boss":false,"effects":[["+4% 減傷","+3% 迴避"],["+6% 減傷","+4.5% 迴避"],["+8% 減傷","+6% 迴避"],["+10% 減傷","+7.5% 迴避"],["+12% 減傷","+9% 迴避"],["+14% 減傷","+10.5% 迴避"]]},{"id":4110,"en":"Ghoul Card","zh":"綠腐屍卡片","slot":"headgear","boss":false,"effects":[["+45 最大 HP","+1 護甲"],["+67.5 最大 HP","+1.5 護甲"],["+90 最大 HP","+2 護甲"],["+112.5 最大 HP","+2.5 護甲"],["+135 最大 HP","+3 護甲"],["+157.5 最大 HP","+3.5 護甲"]]},{"id":4113,"en":"Marionette Card","zh":"傀儡娃娃卡片","slot":"garment","boss":false,"effects":[["+5% 迴避","+2% 減傷"],["+7.5% 迴避","+3% 減傷"],["+10% 迴避","+4% 減傷"],["+12.5% 迴避","+5% 減傷"],["+15% 迴避","+6% 減傷"],["+17.5% 迴避","+7% 減傷"]]},{"id":4114,"en":"Argiope Card","zh":"艾吉歐蜈蚣卡片","slot":"armor","boss":false,"effects":[["+2 護甲","+3% 減傷"],["+3 護甲","+4.5% 減傷"],["+4 護甲","+6% 減傷"],["+5 護甲","+7.5% 減傷"],["+6 護甲","+9% 減傷"],["+7 護甲","+10.5% 減傷"]]},{"id":4115,"en":"Hunter Fly Card","zh":"赤蒼蠅卡片","slot":"weapon","boss":false,"effects":[["+4% 傷害","+0.5 HP／秒"],["+6% 傷害","+0.75 HP／秒"],["+8% 傷害","+1 HP／秒"],["+10% 傷害","+1.25 HP／秒"],["+12% 傷害","+1.5 HP／秒"],["+14% 傷害","+1.75 HP／秒"]]},{"id":4116,"en":"Isis Card","zh":"伊希斯卡片","slot":"garment","boss":false,"effects":[["+5% 減傷","+2% 迴避"],["+7.5% 減傷","+3% 迴避"],["+10% 減傷","+4% 迴避"],["+12.5% 減傷","+5% 迴避"],["+15% 減傷","+6% 迴避"],["+17.5% 減傷","+7% 迴避"]]},{"id":4117,"en":"Sidewinder Card","zh":"黑蛇卡片","slot":"weapon","boss":false,"effects":[["+5% 雙重施法機率"],["+7.5% 雙重施法機率"],["+10% 雙重施法機率"],["+12.5% 雙重施法機率"],["+15% 雙重施法機率"],["+17.5% 雙重施法機率"]]},{"id":4119,"en":"Bathory Card","zh":"巫婆卡片","slot":"armor","boss":false,"effects":[["+4% 減傷","+3% 迴避"],["+6% 減傷","+4.5% 迴避"],["+8% 減傷","+6% 迴避"],["+10% 減傷","+7.5% 迴避"],["+12% 減傷","+9% 迴避"],["+14% 減傷","+10.5% 迴避"]]},{"id":4122,"en":"Deviruchi Card","zh":"小惡魔卡片","slot":"headgear","boss":false,"effects":[["+2 護甲","+3% 傷害"],["+3 護甲","+4.5% 傷害"],["+4 護甲","+6% 傷害"],["+5 護甲","+7.5% 傷害"],["+6 護甲","+9% 傷害"],["+7 護甲","+10.5% 傷害"]]},{"id":4126,"en":"Minorous Card","zh":"牛頭人卡片","slot":"weapon","boss":false,"effects":[["+6% 傷害","+4% 對首領及菁英傷害"],["+9% 傷害","+6% 對首領及菁英傷害"],["+12% 傷害","+8% 對首領及菁英傷害"],["+15% 傷害","+10% 對首領及菁英傷害"],["+18% 傷害","+12% 對首領及菁英傷害"],["+21% 傷害","+14% 對首領及菁英傷害"]]},{"id":4127,"en":"Nightmare Card","zh":"夢魘卡片","slot":"headgear","boss":false,"effects":[["+2 護甲","+3% 迴避"],["+3 護甲","+4.5% 迴避"],["+4 護甲","+6% 迴避"],["+5 護甲","+7.5% 迴避"],["+6 護甲","+9% 迴避"],["+7 護甲","+10.5% 迴避"]]},{"id":4129,"en":"Baphomet Jr. Card","zh":"小巴風特卡片","slot":"garment","boss":false,"effects":[["+3 急速","+2% 爆擊"],["+4.5 急速","+3% 爆擊"],["+6 急速","+4% 爆擊"],["+7.5 急速","+5% 爆擊"],["+9 急速","+6% 爆擊"],["+10.5 急速","+7% 爆擊"]]},{"id":4133,"en":"Raydric Card","zh":"幽靈劍士卡片","slot":"garment","boss":false,"effects":[["+6% 減傷","+1% 迴避"],["+9% 減傷","+1.5% 迴避"],["+12% 減傷","+2% 迴避"],["+15% 減傷","+2.5% 迴避"],["+18% 減傷","+3% 迴避"],["+21% 減傷","+3.5% 迴避"]]},{"id":4134,"en":"Dracula Card","zh":"德古拉男爵卡片","slot":"weapon","boss":true,"effects":[["+2 HP／秒","+6% 傷害"],["+3 HP／秒","+9% 傷害"],["+4 HP／秒","+12% 傷害"],["+5 HP／秒","+15% 傷害"],["+6 HP／秒","+18% 傷害"],["+7 HP／秒","+21% 傷害"]]},{"id":4136,"en":"Khalitzburg Card","zh":"卡利斯格卡片","slot":"shield","boss":false,"effects":[["+6% 減傷","+10 最大 HP"],["+9% 減傷","+15 最大 HP"],["+12% 減傷","+20 最大 HP"],["+15% 減傷","+25 最大 HP"],["+18% 減傷","+30 最大 HP"],["+21% 減傷","+35 最大 HP"]]},{"id":4139,"en":"Joker Card","zh":"裘卡卡片","slot":"accessory","boss":false,"effects":[["+12% Zeny","+2% 移動速度"],["+18% Zeny","+3% 移動速度"],["+24% Zeny","+4% 移動速度"],["+30% Zeny","+5% 移動速度"],["+36% Zeny","+6% 移動速度"],["+42% Zeny","+7% 移動速度"]]},{"id":4140,"en":"Abysmal Knight Card","zh":"深淵騎士卡片","slot":"weapon","boss":true,"effects":[["+15% 對首領及菁英傷害","+5% 傷害"],["+22.5% 對首領及菁英傷害","+7.5% 傷害"],["+30% 對首領及菁英傷害","+10% 傷害"],["+37.5% 對首領及菁英傷害","+12.5% 傷害"],["+45% 對首領及菁英傷害","+15% 傷害"],["+52.5% 對首領及菁英傷害","+17.5% 傷害"]]},{"id":4141,"en":"Evil Druid Card","zh":"闇神官卡片","slot":"armor","boss":false,"effects":[["+4% 減傷","+0.6 HP／秒"],["+6% 減傷","+0.9 HP／秒"],["+8% 減傷","+1.2 HP／秒"],["+10% 減傷","+1.5 HP／秒"],["+12% 減傷","+1.8 HP／秒"],["+14% 減傷","+2.1 HP／秒"]]},{"id":4142,"en":"Doppelganger Card","zh":"死靈卡片","slot":"weapon","boss":true,"effects":[["+5 急速","+4% 傷害"],["+7.5 急速","+6% 傷害"],["+10 急速","+8% 傷害"],["+12.5 急速","+10% 傷害"],["+15 急速","+12% 傷害"],["+17.5 急速","+14% 傷害"]]},{"id":4155,"en":"Goblin Leader Card","zh":"哥布靈首領卡片","slot":"weapon","boss":true,"effects":[["+8% 傷害","+6% 對首領及菁英傷害"],["+12% 傷害","+9% 對首領及菁英傷害"],["+16% 傷害","+12% 對首領及菁英傷害"],["+20% 傷害","+15% 對首領及菁英傷害"],["+24% 傷害","+18% 對首領及菁英傷害"],["+28% 傷害","+21% 對首領及菁英傷害"]]},{"id":4157,"en":"Goblin Archer Card","zh":"弓箭哥布靈卡片","slot":"weapon","boss":false,"effects":[["+12% 爆擊傷害","+4% 對首領及不死系傷害"],["+18% 爆擊傷害","+6% 對首領及不死系傷害"],["+24% 爆擊傷害","+8% 對首領及不死系傷害"],["+30% 爆擊傷害","+10% 對首領及不死系傷害"],["+36% 爆擊傷害","+12% 對首領及不死系傷害"],["+42% 爆擊傷害","+14% 對首領及不死系傷害"]]},{"id":4168,"en":"Dark Lord Card","zh":"黑暗之王卡片","slot":"shoes","boss":true,"effects":[["+8% 減傷","+12% 範圍"],["+12% 減傷","+18% 範圍"],["+16% 減傷","+24% 範圍"],["+20% 減傷","+30% 範圍"],["+24% 減傷","+36% 範圍"],["+28% 減傷","+42% 範圍"]]},{"id":4169,"en":"Dark Illusion Card","zh":"迷幻之王卡片","slot":"headgear","boss":true,"effects":[["+6 急速","+12 詠唱速度","-2% 最大 HP"],["+9 急速","+18 詠唱速度","-3% 最大 HP"],["+12 急速","+24 詠唱速度","-4% 最大 HP"],["+15 急速","+30 詠唱速度","-5% 最大 HP"],["+18 急速","+36 詠唱速度","-6% 最大 HP"],["+21 急速","+42 詠唱速度","-7% 最大 HP"]]},{"id":4170,"en":"Dark Frame Card","zh":"鏡妖卡片","slot":"armor","boss":false,"effects":[["+5% 命中暈眩機率","+4% 減傷"],["+7.5% 命中暈眩機率","+6% 減傷"],["+10% 命中暈眩機率","+8% 減傷"],["+12.5% 命中暈眩機率","+10% 減傷"],["+15% 命中暈眩機率","+12% 減傷"],["+17.5% 命中暈眩機率","+14% 減傷"]]},{"id":4172,"en":"The Paper Card","zh":"紙妖卡片","slot":"weapon","boss":true,"effects":[["+15% 爆擊傷害","+5% 傷害"],["+22.5% 爆擊傷害","+7.5% 傷害"],["+30% 爆擊傷害","+10% 傷害"],["+37.5% 爆擊傷害","+12.5% 傷害"],["+45% 爆擊傷害","+15% 傷害"],["+52.5% 爆擊傷害","+17.5% 傷害"]]},{"id":4176,"en":"Dullahan Card","zh":"無顱武士卡片","slot":"weapon","boss":true,"effects":[["+15% 爆擊傷害","+15% 對首領及菁英傷害"],["+22.5% 爆擊傷害","+22.5% 對首領及菁英傷害"],["+30% 爆擊傷害","+30% 對首領及菁英傷害"],["+37.5% 爆擊傷害","+37.5% 對首領及菁英傷害"],["+45% 爆擊傷害","+45% 對首領及菁英傷害"],["+52.5% 爆擊傷害","+52.5% 對首領及菁英傷害"]]},{"id":4181,"en":"Disguise Card","zh":"假面鬼卡片","slot":"armor","boss":false,"effects":[["+5% 命中暈眩機率","+5% 減傷"],["+7.5% 命中暈眩機率","+7.5% 減傷"],["+10% 命中暈眩機率","+10% 減傷"],["+12.5% 命中暈眩機率","+12.5% 減傷"],["+15% 命中暈眩機率","+15% 減傷"],["+17.5% 命中暈眩機率","+17.5% 減傷"]]},{"id":4185,"en":"Rideword Card","zh":"飛行魔書卡片","slot":"headgear","boss":false,"effects":[["+5 急速","+1 INT"],["+7.5 急速","+1.5 INT"],["+10 急速","+2 INT"],["+12.5 急速","+2.5 INT"],["+15 急速","+3 INT"],["+17.5 急速","+3.5 INT"]]},{"id":4187,"en":"Raydric Archer Card","zh":"幽靈弓箭手卡片","slot":"accessory","boss":false,"effects":[["+10% Zeny","+8% 投射物速度"],["+15% Zeny","+12% 投射物速度"],["+20% Zeny","+16% 投射物速度"],["+25% Zeny","+20% 投射物速度"],["+30% Zeny","+24% 投射物速度"],["+35% Zeny","+28% 投射物速度"]]},{"id":4188,"en":"Leib Olmai Card","zh":"狂暴大腳熊卡片","slot":"headgear","boss":true,"effects":[["+15% 拾取範圍","+10% Zeny"],["+22.5% 拾取範圍","+15% Zeny"],["+30% 拾取範圍","+20% Zeny"],["+37.5% 拾取範圍","+25% Zeny"],["+45% 拾取範圍","+30% Zeny"],["+52.5% 拾取範圍","+35% Zeny"]]},{"id":4190,"en":"Wraith Card","zh":"惡靈卡片","slot":"accessory","boss":false,"effects":[["+10% Zeny","+0.5 HP／秒"],["+15% Zeny","+0.75 HP／秒"],["+20% Zeny","+1 HP／秒"],["+25% Zeny","+1.25 HP／秒"],["+30% Zeny","+1.5 HP／秒"],["+35% Zeny","+1.75 HP／秒"]]},{"id":4191,"en":"Loli Ruri Card","zh":"銀月魔女卡片","slot":"armor","boss":true,"effects":[["+1.2 HP／秒","+40 最大 HP"],["+1.8 HP／秒","+60 最大 HP"],["+2.4 HP／秒","+80 最大 HP"],["+3 HP／秒","+100 最大 HP"],["+3.6 HP／秒","+120 最大 HP"],["+4.2 HP／秒","+140 最大 HP"]]},{"id":4193,"en":"Lude Card","zh":"南瓜魂卡片","slot":"accessory","boss":false,"effects":[["+0.8 HP／秒","+2 護甲"],["+1.2 HP／秒","+3 護甲"],["+1.6 HP／秒","+4 護甲"],["+2 HP／秒","+5 護甲"],["+2.4 HP／秒","+6 護甲"],["+2.8 HP／秒","+7 護甲"]]},{"id":4195,"en":"Leaf Cat Card","zh":"群葉貓卡片","slot":"headgear","boss":false,"effects":[["+4% 減傷","+10% 拾取範圍"],["+6% 減傷","+15% 拾取範圍"],["+8% 減傷","+20% 拾取範圍"],["+10% 減傷","+25% 拾取範圍"],["+12% 減傷","+30% 拾取範圍"],["+14% 減傷","+35% 拾取範圍"]]},{"id":4205,"en":"Mimic Card","zh":"邪惡箱卡片","slot":"accessory","boss":false,"effects":[["+12% Zeny","+15% 拾取範圍"],["+18% Zeny","+22.5% 拾取範圍"],["+24% Zeny","+30% 拾取範圍"],["+30% Zeny","+37.5% 拾取範圍"],["+36% Zeny","+45% 拾取範圍"],["+42% Zeny","+52.5% 拾取範圍"]]},{"id":4206,"en":"Myst Case Card","zh":"邪惡禮盒卡片","slot":"headgear","boss":false,"effects":[["+12% Zeny","+3% 局內經驗"],["+18% Zeny","+4.5% 局內經驗"],["+24% Zeny","+6% 局內經驗"],["+30% Zeny","+7.5% 局內經驗"],["+36% Zeny","+9% 局內經驗"],["+42% Zeny","+10.5% 局內經驗"]]},{"id":4207,"en":"Mysteltainn Card","zh":"弒神者卡片","slot":"shield","boss":true,"effects":[["+6% 減傷","+3% 迴避"],["+9% 減傷","+4.5% 迴避"],["+12% 減傷","+6% 迴避"],["+15% 減傷","+7.5% 迴避"],["+18% 減傷","+9% 迴避"],["+21% 減傷","+10.5% 迴避"]]},{"id":4210,"en":"Wanderer Card","zh":"邪骸浪人卡片","slot":"garment","boss":true,"effects":[["+7% 迴避","+4% 命中暈眩機率"],["+10.5% 迴避","+6% 命中暈眩機率"],["+14% 迴避","+8% 命中暈眩機率"],["+17.5% 迴避","+10% 命中暈眩機率"],["+21% 迴避","+12% 命中暈眩機率"],["+24.5% 迴避","+14% 命中暈眩機率"]]},{"id":4214,"en":"Bloody Murderer Card","zh":"嗜血怪人卡片","slot":"weapon","boss":true,"effects":[["+15% 爆擊傷害","+5% 傷害"],["+22.5% 爆擊傷害","+7.5% 傷害"],["+30% 爆擊傷害","+10% 傷害"],["+37.5% 爆擊傷害","+12.5% 傷害"],["+45% 爆擊傷害","+15% 傷害"],["+52.5% 爆擊傷害","+17.5% 傷害"]]},{"id":4216,"en":"Sasquatch Card","zh":"雪熊卡片","slot":"armor","boss":true,"effects":[["+6% 減傷","+40 最大 HP"],["+9% 減傷","+60 最大 HP"],["+12% 減傷","+80 最大 HP"],["+15% 減傷","+100 最大 HP"],["+18% 減傷","+120 最大 HP"],["+21% 減傷","+140 最大 HP"]]},{"id":4217,"en":"Enchanted Peach Tree Card","zh":"猴桃木卡片","slot":"shield","boss":false,"effects":[["+1 HP／秒","+20 最大 HP"],["+1.5 HP／秒","+30 最大 HP"],["+2 HP／秒","+40 最大 HP"],["+2.5 HP／秒","+50 最大 HP"],["+3 HP／秒","+60 最大 HP"],["+3.5 HP／秒","+70 最大 HP"]]},{"id":4222,"en":"Skeleton Prisoner Card","zh":"邪骸戰俘卡片","slot":"armor","boss":false,"effects":[["+5% 命中暈眩機率","+4% 減傷"],["+7.5% 命中暈眩機率","+6% 減傷"],["+10% 命中暈眩機率","+8% 減傷"],["+12.5% 命中暈眩機率","+10% 減傷"],["+15% 命中暈眩機率","+12% 減傷"],["+17.5% 命中暈眩機率","+14% 減傷"]]},{"id":4225,"en":"Stone Shooter Card","zh":"石炮火樹卡片","slot":"weapon","boss":false,"effects":[["+4% 傷害","+5% 物理穿透"],["+6% 傷害","+7.5% 物理穿透"],["+8% 傷害","+10% 物理穿透"],["+10% 傷害","+12.5% 物理穿透"],["+12% 傷害","+15% 物理穿透"],["+14% 傷害","+17.5% 物理穿透"]]},{"id":4227,"en":"Spring Rabbit Card","zh":"春兔卡片","slot":"accessory","boss":false,"effects":[["+40% 肉類恢復量","+8% Zeny"],["+60% 肉類恢復量","+12% Zeny"],["+80% 肉類恢復量","+16% Zeny"],["+100% 肉類恢復量","+20% Zeny"],["+120% 肉類恢復量","+24% Zeny"],["+140% 肉類恢復量","+28% Zeny"]]},{"id":4229,"en":"Tower Keeper Card","zh":"鐘塔守護者卡片","slot":"headgear","boss":true,"effects":[["+12 詠唱速度","+5 急速"],["+18 詠唱速度","+7.5 急速"],["+24 詠唱速度","+10 急速"],["+30 詠唱速度","+12.5 急速"],["+36 詠唱速度","+15 急速"],["+42 詠唱速度","+17.5 急速"]]},{"id":4235,"en":"Christmas Cookie Card","zh":"XMAS甜餅人卡片","slot":"shoes","boss":false,"effects":[["+6% 局內經驗","-1% 減傷"],["+9% 局內經驗","-1.5% 減傷"],["+12% 局內經驗","-2% 減傷"],["+15% 局內經驗","-2.5% 減傷"],["+18% 局內經驗","-3% 減傷"],["+21% 局內經驗","-3.5% 減傷"]]},{"id":4237,"en":"Owl Duke Card","zh":"鴞裊首領卡片","slot":"accessory","boss":true,"effects":[["+6% 傷害","+5% 雙重施法機率"],["+9% 傷害","+7.5% 雙重施法機率"],["+12% 傷害","+10% 雙重施法機率"],["+15% 傷害","+12.5% 雙重施法機率"],["+18% 傷害","+15% 雙重施法機率"],["+21% 傷害","+17.5% 雙重施法機率"]]},{"id":4238,"en":"Owl Baron Card","zh":"鴞裊男爵卡片","slot":"accessory","boss":true,"effects":[["+15% 對首領及菁英傷害","+8% 傷害"],["+22.5% 對首領及菁英傷害","+12% 傷害"],["+30% 對首領及菁英傷害","+16% 傷害"],["+37.5% 對首領及菁英傷害","+20% 傷害"],["+45% 對首領及菁英傷害","+24% 傷害"],["+52.5% 對首領及菁英傷害","+28% 傷害"]]},{"id":4239,"en":"Iron Fist Card","zh":"鐵蠍卡片","slot":"shoes","boss":false,"effects":[["+6% 局內經驗","+3% 移動速度"],["+9% 局內經驗","+4.5% 移動速度"],["+12% 局內經驗","+6% 移動速度"],["+15% 局內經驗","+7.5% 移動速度"],["+18% 局內經驗","+9% 移動速度"],["+21% 局內經驗","+10.5% 移動速度"]]},{"id":4243,"en":"Antonio Card","zh":"安東尼奧卡片","slot":"armor","boss":true,"effects":[["+8% 減傷","+6% 移動速度","+15% Zeny"],["+12% 減傷","+9% 移動速度","+22.5% Zeny"],["+16% 減傷","+12% 移動速度","+30% Zeny"],["+20% 減傷","+15% 移動速度","+37.5% Zeny"],["+24% 減傷","+18% 移動速度","+45% Zeny"],["+28% 減傷","+21% 移動速度","+52.5% Zeny"]]},{"id":4244,"en":"Alarm Card","zh":"鐘怪卡片","slot":"shoes","boss":false,"effects":[["+50 最大 HP","+1 護甲"],["+75 最大 HP","+1.5 護甲"],["+100 最大 HP","+2 護甲"],["+125 最大 HP","+2.5 護甲"],["+150 最大 HP","+3 護甲"],["+175 最大 HP","+3.5 護甲"]]},{"id":4248,"en":"Ancient Mummy Card","zh":"狂暴木乃伊卡片","slot":"shield","boss":true,"effects":[["+1.2 HP／秒","+30 最大 HP"],["+1.8 HP／秒","+45 最大 HP"],["+2.4 HP／秒","+60 最大 HP"],["+3 HP／秒","+75 最大 HP"],["+3.6 HP／秒","+90 最大 HP"],["+4.2 HP／秒","+105 最大 HP"]]},{"id":4250,"en":"Executioner Card","zh":"行刑者卡片","slot":"shield","boss":true,"effects":[["+7% 減傷","+1 護甲"],["+10.5% 減傷","+1.5 護甲"],["+14% 減傷","+2 護甲"],["+17.5% 減傷","+2.5 護甲"],["+21% 減傷","+3 護甲"],["+24.5% 減傷","+3.5 護甲"]]},{"id":4254,"en":"Ogretooth Card","zh":"獸牙怪卡片","slot":"shield","boss":true,"effects":[["+5% 減傷","+3 護甲"],["+7.5% 減傷","+4.5 護甲"],["+10% 減傷","+6 護甲"],["+12.5% 減傷","+7.5 護甲"],["+15% 減傷","+9 護甲"],["+17.5% 減傷","+10.5 護甲"]]},{"id":4255,"en":"Orc Lady Card","zh":"獸人女戰士卡片","slot":"weapon","boss":false,"effects":[["+4% 傷害","+5% 對首領及菁英傷害"],["+6% 傷害","+7.5% 對首領及菁英傷害"],["+8% 傷害","+10% 對首領及菁英傷害"],["+10% 傷害","+12.5% 對首領及菁英傷害"],["+12% 傷害","+15% 對首領及菁英傷害"],["+14% 傷害","+17.5% 對首領及菁英傷害"]]},{"id":4256,"en":"Orc Archer Card","zh":"獸人弓箭手卡片","slot":"accessory","boss":false,"effects":[["+10% Zeny"],["+15% Zeny"],["+20% Zeny"],["+25% Zeny"],["+30% Zeny"],["+35% Zeny"]]},{"id":4259,"en":"Wooden Golem Card","zh":"機木人卡片","slot":"armor","boss":true,"effects":[["+3 護甲","+1.1 HP／秒"],["+4.5 護甲","+1.65 HP／秒"],["+6 護甲","+2.2 HP／秒"],["+7.5 護甲","+2.75 HP／秒"],["+9 護甲","+3.3 HP／秒"],["+10.5 護甲","+3.85 HP／秒"]]},{"id":4275,"en":"Zombie Prisoner Card","zh":"腐屍戰俘卡片","slot":"shoes","boss":false,"effects":[["+5% 局內經驗","+5% Zeny"],["+7.5% 局內經驗","+7.5% Zeny"],["+10% 局內經驗","+10% Zeny"],["+12.5% 局內經驗","+12.5% Zeny"],["+15% 局內經驗","+15% Zeny"],["+17.5% 局內經驗","+17.5% Zeny"]]},{"id":4276,"en":"Lord of The Dead Card","zh":"死靈騎士卡片","slot":"weapon","boss":true,"effects":[["+8% 命中暈眩機率","+8% 傷害","+10% 毒、燃燒與流血傷害"],["+12% 命中暈眩機率","+12% 傷害","+15% 毒、燃燒與流血傷害"],["+16% 命中暈眩機率","+16% 傷害","+20% 毒、燃燒與流血傷害"],["+20% 命中暈眩機率","+20% 傷害","+25% 毒、燃燒與流血傷害"],["+24% 命中暈眩機率","+24% 傷害","+30% 毒、燃燒與流血傷害"],["+28% 命中暈眩機率","+28% 傷害","+35% 毒、燃燒與流血傷害"]]},{"id":4278,"en":"Gibbet Card","zh":"鬼娃樹卡片","slot":"headgear","boss":false,"effects":[["+2 護甲","+40 最大 HP"],["+3 護甲","+60 最大 HP"],["+4 護甲","+80 最大 HP"],["+5 護甲","+100 最大 HP"],["+6 護甲","+120 最大 HP"],["+7 護甲","+140 最大 HP"]]},{"id":4287,"en":"Kapha Card","zh":"釣魚河童卡片","slot":"garment","boss":false,"effects":[["+5% 減傷","+1% 迴避"],["+7.5% 減傷","+1.5% 迴避"],["+10% 減傷","+2% 迴避"],["+12.5% 減傷","+2.5% 迴避"],["+15% 減傷","+3% 迴避"],["+17.5% 減傷","+3.5% 迴避"]]},{"id":4291,"en":"Kobold Leader Card","zh":"犬妖首領卡片","slot":"weapon","boss":true,"effects":[["+5% 爆擊","+5% 傷害"],["+7.5% 爆擊","+7.5% 傷害"],["+10% 爆擊","+10% 傷害"],["+12.5% 爆擊","+12.5% 傷害"],["+15% 爆擊","+15% 傷害"],["+17.5% 爆擊","+17.5% 傷害"]]},{"id":4293,"en":"Cookie Card","zh":"甜餅人卡片","slot":"accessory","boss":false,"effects":[["+4% 爆擊","+3% 傷害"],["+6% 爆擊","+4.5% 傷害"],["+8% 爆擊","+6% 傷害"],["+10% 爆擊","+7.5% 傷害"],["+12% 爆擊","+9% 傷害"],["+14% 爆擊","+10.5% 傷害"]]},{"id":4294,"en":"Quve Card","zh":"萬聖魔卡片","slot":"accessory","boss":false,"effects":[["+5% 移動速度","+4% 迴避"],["+7.5% 移動速度","+6% 迴避"],["+10% 移動速度","+8% 迴避"],["+12.5% 移動速度","+10% 迴避"],["+15% 移動速度","+12% 迴避"],["+17.5% 移動速度","+14% 迴避"]]},{"id":4297,"en":"Cruiser Card","zh":"玩具士兵卡片","slot":"weapon","boss":false,"effects":[["+12% 爆擊傷害","+4% 爆擊"],["+18% 爆擊傷害","+6% 爆擊"],["+24% 爆擊傷害","+8% 爆擊"],["+30% 爆擊傷害","+10% 爆擊"],["+36% 爆擊傷害","+12% 爆擊"],["+42% 爆擊傷害","+14% 爆擊"]]},{"id":4299,"en":"Clock Card","zh":"古鐘魔卡片","slot":"armor","boss":false,"effects":[["+5% 減傷","+1 護甲"],["+7.5% 減傷","+1.5 護甲"],["+10% 減傷","+2 護甲"],["+12.5% 減傷","+2.5 護甲"],["+15% 減傷","+3 護甲"],["+17.5% 減傷","+3.5 護甲"]]},{"id":4300,"en":"Chimera Card","zh":"凱美拉卡片","slot":"armor","boss":true,"effects":[["+6% 命中暈眩機率","+5% 減傷"],["+9% 命中暈眩機率","+7.5% 減傷"],["+12% 命中暈眩機率","+10% 減傷"],["+15% 命中暈眩機率","+12.5% 減傷"],["+18% 命中暈眩機率","+15% 減傷"],["+21% 命中暈眩機率","+17.5% 減傷"]]},{"id":4301,"en":"Killer Mantis Card","zh":"狂暴螳螂卡片","slot":"armor","boss":false,"effects":[["+3% 命中暈眩機率","+4% 減傷"],["+4.5% 命中暈眩機率","+6% 減傷"],["+6% 命中暈眩機率","+8% 減傷"],["+7.5% 命中暈眩機率","+10% 減傷"],["+9% 命中暈眩機率","+12% 減傷"],["+10.5% 命中暈眩機率","+14% 減傷"]]},{"id":4303,"en":"Giant Whisper Card","zh":"巨大白幽靈卡片","slot":"garment","boss":true,"effects":[["+6% 迴避","+4% 傷害"],["+9% 迴避","+6% 傷害"],["+12% 迴避","+8% 傷害"],["+15% 迴避","+10% 傷害"],["+18% 迴避","+12% 傷害"],["+21% 迴避","+14% 傷害"]]},{"id":4313,"en":"Punk Card","zh":"朽魔卡片","slot":"garment","boss":false,"effects":[["+4% 移動速度","+3% 減傷"],["+6% 移動速度","+4.5% 減傷"],["+8% 移動速度","+6% 減傷"],["+10% 移動速度","+7.5% 減傷"],["+12% 移動速度","+9% 減傷"],["+14% 移動速度","+10.5% 減傷"]]},{"id":4318,"en":"Stormy Knight Card","zh":"冰暴騎士卡片","slot":"weapon","boss":true,"effects":[["+10% 範圍","+6% 傷害","+3% 命中暈眩機率"],["+15% 範圍","+9% 傷害","+4.5% 命中暈眩機率"],["+20% 範圍","+12% 傷害","+6% 命中暈眩機率"],["+25% 範圍","+15% 傷害","+7.5% 命中暈眩機率"],["+30% 範圍","+18% 傷害","+9% 命中暈眩機率"],["+35% 範圍","+21% 傷害","+10.5% 命中暈眩機率"]]},{"id":4319,"en":"Freezer Card","zh":"水靈龜卡片","slot":"shoes","boss":true,"effects":[["+60 最大 HP","+3% 傷害"],["+90 最大 HP","+4.5% 傷害"],["+120 最大 HP","+6% 傷害"],["+150 最大 HP","+7.5% 傷害"],["+180 最大 HP","+9% 傷害"],["+210 最大 HP","+10.5% 傷害"]]},{"id":4320,"en":"Bloody Knight Card","zh":"血腥騎士卡片","slot":"weapon","boss":true,"effects":[["+10% 範圍","+5% 傷害"],["+15% 範圍","+7.5% 傷害"],["+20% 範圍","+10% 傷害"],["+25% 範圍","+12.5% 傷害"],["+30% 範圍","+15% 傷害"],["+35% 範圍","+17.5% 傷害"]]},{"id":4321,"en":"Hylozoist Card","zh":"兔斯拉卡片","slot":"accessory","boss":false,"effects":[["+5% 命中暈眩機率","+4% 傷害"],["+7.5% 命中暈眩機率","+6% 傷害"],["+10% 命中暈眩機率","+8% 傷害"],["+12.5% 命中暈眩機率","+10% 傷害"],["+15% 命中暈眩機率","+12% 傷害"],["+17.5% 命中暈眩機率","+14% 傷害"]]},{"id":4322,"en":"High Orc Card","zh":"獸人戰士長卡片","slot":"shield","boss":true,"effects":[["+6% 減傷","+2 護甲"],["+9% 減傷","+3 護甲"],["+12% 減傷","+4 護甲"],["+15% 減傷","+5 護甲"],["+18% 減傷","+6 護甲"],["+21% 減傷","+7 護甲"]]},{"id":4323,"en":"Hatii Babe Card","zh":"卡崙寶寶卡片","slot":"weapon","boss":true,"effects":[["+6% 雙重施法機率","+4% 傷害"],["+9% 雙重施法機率","+6% 傷害"],["+12% 雙重施法機率","+8% 傷害"],["+15% 雙重施法機率","+10% 傷害"],["+18% 雙重施法機率","+12% 傷害"],["+21% 雙重施法機率","+14% 傷害"]]},{"id":4324,"en":"Hatii Card","zh":"卡崙卡片","slot":"armor","boss":true,"effects":[["+6% 命中暈眩機率","+7% 減傷"],["+9% 命中暈眩機率","+10.5% 減傷"],["+12% 命中暈眩機率","+14% 減傷"],["+15% 命中暈眩機率","+17.5% 減傷"],["+18% 命中暈眩機率","+21% 減傷"],["+21% 命中暈眩機率","+24.5% 減傷"]]},{"id":4330,"en":"Evil Snake Lord Card","zh":"墨蛇君卡片","slot":"headgear","boss":true,"effects":[["+12 詠唱速度","+8% 減傷","+3 INT"],["+18 詠唱速度","+12% 減傷","+4.5 INT"],["+24 詠唱速度","+16% 減傷","+6 INT"],["+30 詠唱速度","+20% 減傷","+7.5 INT"],["+36 詠唱速度","+24% 減傷","+9 INT"],["+42 詠唱速度","+28% 減傷","+10.5 INT"]]},{"id":4340,"en":"Teddy Bear Card","zh":"玩偶熊卡片","slot":"shield","boss":false,"effects":[["+6% 減傷"],["+9% 減傷"],["+12% 減傷"],["+15% 減傷"],["+18% 減傷"],["+21% 減傷"]]},{"id":4372,"en":"White Lady Card","zh":"白素貞卡片","slot":"headgear","boss":true,"effects":[["+50% 肉類恢復量","+2 HP／秒","+6% 最大 HP"],["+75% 肉類恢復量","+3 HP／秒","+9% 最大 HP"],["+100% 肉類恢復量","+4 HP／秒","+12% 最大 HP"],["+125% 肉類恢復量","+5 HP／秒","+15% 最大 HP"],["+150% 肉類恢復量","+6 HP／秒","+18% 最大 HP"],["+175% 肉類恢復量","+7 HP／秒","+21% 最大 HP"]]},{"id":4375,"en":"Orc Baby Card","zh":"獸人嬰兒卡片","slot":"garment","boss":false,"effects":[["+5% 迴避","+2% 減傷"],["+7.5% 迴避","+3% 減傷"],["+10% 迴避","+4% 減傷"],["+12.5% 迴避","+5% 減傷"],["+15% 迴避","+6% 減傷"],["+17.5% 迴避","+7% 減傷"]]},{"id":4378,"en":"Gold Acidus Card","zh":"黃俄希托斯卡片","slot":"shoes","boss":true,"effects":[["+5 急速","+6% 最大 HP"],["+7.5 急速","+9% 最大 HP"],["+10 急速","+12% 最大 HP"],["+12.5 急速","+15% 最大 HP"],["+15 急速","+18% 最大 HP"],["+17.5 急速","+21% 最大 HP"]]},{"id":4379,"en":"Blue Acidus Card","zh":"灰俄希托斯卡片","slot":"headgear","boss":false,"effects":[["+5 急速","+2% 迴避"],["+7.5 急速","+3% 迴避"],["+10 急速","+4% 迴避"],["+12.5 急速","+5% 迴避"],["+15 急速","+6% 迴避"],["+17.5 急速","+7% 迴避"]]},{"id":4380,"en":"Red Ferus Card","zh":"紅貝勒斯卡片","slot":"weapon","boss":true,"effects":[["+7% 傷害","+5% 爆擊"],["+10.5% 傷害","+7.5% 爆擊"],["+14% 傷害","+10% 爆擊"],["+17.5% 傷害","+12.5% 爆擊"],["+21% 傷害","+15% 爆擊"],["+24.5% 傷害","+17.5% 爆擊"]]},{"id":4381,"en":"Green Ferus Card","zh":"綠貝勒斯卡片","slot":"shoes","boss":false,"effects":[["+6% 最大 HP","+15 最大 HP"],["+9% 最大 HP","+22.5 最大 HP"],["+12% 最大 HP","+30 最大 HP"],["+15% 最大 HP","+37.5 最大 HP"],["+18% 最大 HP","+45 最大 HP"],["+21% 最大 HP","+52.5 最大 HP"]]},{"id":4382,"en":"Yellow Novus Card","zh":"黃諾博斯卡片","slot":"armor","boss":false,"effects":[["+35 最大 HP","+0.8 HP／秒"],["+52.5 最大 HP","+1.2 HP／秒"],["+70 最大 HP","+1.6 HP／秒"],["+87.5 最大 HP","+2 HP／秒"],["+105 最大 HP","+2.4 HP／秒"],["+122.5 最大 HP","+2.8 HP／秒"]]},{"id":4383,"en":"Red Novus Card","zh":"諾博斯卡片","slot":"armor","boss":false,"effects":[["+5% 命中暈眩機率","+4% 減傷"],["+7.5% 命中暈眩機率","+6% 減傷"],["+10% 命中暈眩機率","+8% 減傷"],["+12.5% 命中暈眩機率","+10% 減傷"],["+15% 命中暈眩機率","+12% 減傷"],["+17.5% 命中暈眩機率","+14% 減傷"]]},{"id":4384,"en":"Hydrolancer Card","zh":"三頭龍卡片","slot":"accessory","boss":true,"effects":[["+6% 雙重施法機率","+5% 傷害"],["+9% 雙重施法機率","+7.5% 傷害"],["+12% 雙重施法機率","+10% 傷害"],["+15% 雙重施法機率","+12.5% 傷害"],["+18% 雙重施法機率","+15% 傷害"],["+21% 雙重施法機率","+17.5% 傷害"]]},{"id":4385,"en":"Dragon Egg Card","zh":"龍蛋卡片","slot":"accessory","boss":false,"effects":[["+12% Zeny"],["+18% Zeny"],["+24% Zeny"],["+30% Zeny"],["+36% Zeny"],["+42% Zeny"]]},{"id":4386,"en":"Detardeurus Card","zh":"迪塔勒泰晤勒斯卡片","slot":"armor","boss":true,"effects":[["+10% 減傷","+6% 命中暈眩機率"],["+15% 減傷","+9% 命中暈眩機率"],["+20% 減傷","+12% 命中暈眩機率"],["+25% 減傷","+15% 命中暈眩機率"],["+30% 減傷","+18% 命中暈眩機率"],["+35% 減傷","+21% 命中暈眩機率"]]},{"id":4387,"en":"Ancient Mimic Card","zh":"狂暴邪惡箱卡片","slot":"armor","boss":false,"effects":[["+5% 迴避","+2 AGI"],["+7.5% 迴避","+3 AGI"],["+10% 迴避","+4 AGI"],["+12.5% 迴避","+5 AGI"],["+15% 迴避","+6 AGI"],["+17.5% 迴避","+7 AGI"]]},{"id":4415,"en":"Snowier Card","zh":"雪獸卡片","slot":"accessory","boss":false,"effects":[["+12% Zeny","+20% 肉類恢復量"],["+18% Zeny","+30% 肉類恢復量"],["+24% Zeny","+40% 肉類恢復量"],["+30% Zeny","+50% 肉類恢復量"],["+36% Zeny","+60% 肉類恢復量"],["+42% Zeny","+70% 肉類恢復量"]]},{"id":4416,"en":"Siroma Card","zh":"小雪獸卡片","slot":"accessory","boss":false,"effects":[["+4% 傷害","+8 詠唱速度"],["+6% 傷害","+12 詠唱速度"],["+8% 傷害","+16 詠唱速度"],["+10% 傷害","+20 詠唱速度"],["+12% 傷害","+24 詠唱速度"],["+14% 傷害","+28 詠唱速度"]]},{"id":4417,"en":"Ice Titan Card","zh":"冰巨人卡片","slot":"shoes","boss":true,"effects":[["+3 護甲","+40 最大 HP"],["+4.5 護甲","+60 最大 HP"],["+6 護甲","+80 最大 HP"],["+7.5 護甲","+100 最大 HP"],["+9 護甲","+120 最大 HP"],["+10.5 護甲","+140 最大 HP"]]},{"id":4418,"en":"Gazeti Card","zh":"蓋俄斯提卡片","slot":"accessory","boss":true,"effects":[["+6% 雙重施法機率","+4% 傷害"],["+9% 雙重施法機率","+6% 傷害"],["+12% 雙重施法機率","+8% 傷害"],["+15% 雙重施法機率","+10% 傷害"],["+18% 雙重施法機率","+12% 傷害"],["+21% 雙重施法機率","+14% 傷害"]]},{"id":4419,"en":"Ktullanux Card","zh":"水晶龍卡片","slot":"armor","boss":true,"effects":[["+8% 傷害","+4% 減傷","+6% 命中暈眩機率"],["+12% 傷害","+6% 減傷","+9% 命中暈眩機率"],["+16% 傷害","+8% 減傷","+12% 命中暈眩機率"],["+20% 傷害","+10% 減傷","+15% 命中暈眩機率"],["+24% 傷害","+12% 減傷","+18% 命中暈眩機率"],["+28% 傷害","+14% 減傷","+21% 命中暈眩機率"]]},{"id":4441,"en":"Fallen Bishop Hibram Card","zh":"墮落大神官 悉潘卡片","slot":"shoes","boss":true,"effects":[["+11% 傷害","+19% 對首領及菁英傷害","-4 急速"],["+16.5% 傷害","+28.5% 對首領及菁英傷害","-6 急速"],["+22% 傷害","+38% 對首領及菁英傷害","-8 急速"],["+27.5% 傷害","+47.5% 對首領及菁英傷害","-10 急速"],["+33% 傷害","+57% 對首領及菁英傷害","-12 急速"],["+38.5% 傷害","+66.5% 對首領及菁英傷害","-14 急速"]]},{"id":4003,"en":"Pupa Card","zh":"蟲蛹卡片","slot":"armor","boss":false,"effects":[["+40 最大 HP"],["+60 最大 HP"],["+80 最大 HP"],["+100 最大 HP"],["+120 最大 HP"],["+140 最大 HP"]]},{"id":4008,"en":"Picky Card","zh":"小雞卡片","slot":"armor","boss":false,"effects":[["+3% 傷害","+10 最大 HP"],["+4.5% 傷害","+15 最大 HP"],["+6% 傷害","+20 最大 HP"],["+7.5% 傷害","+25 最大 HP"],["+9% 傷害","+30 最大 HP"],["+10.5% 傷害","+35 最大 HP"]]},{"id":4007,"en":"Pecopeco Egg Card","zh":"大嘴鳥蛋卡片","slot":"armor","boss":false,"effects":[["+3% 減傷"],["+4.5% 減傷"],["+6% 減傷"],["+7.5% 減傷"],["+9% 減傷"],["+10.5% 減傷"]]},{"id":4012,"en":"Thiefbug Egg Card","zh":"盜蟲卵卡片","slot":"armor","boss":false,"effects":[["+25 最大 HP","+1 護甲"],["+37.5 最大 HP","+1.5 護甲"],["+50 最大 HP","+2 護甲"],["+62.5 最大 HP","+2.5 護甲"],["+75 最大 HP","+3 護甲"],["+87.5 最大 HP","+3.5 護甲"]]},{"id":4019,"en":"Hornet Card","zh":"蜂兵卡片","slot":"weapon","boss":false,"effects":[["+3% 傷害","+1% 爆擊"],["+4.5% 傷害","+1.5% 爆擊"],["+6% 傷害","+2% 爆擊"],["+7.5% 傷害","+2.5% 爆擊"],["+9% 傷害","+3% 爆擊"],["+10.5% 傷害","+3.5% 爆擊"]]},{"id":4020,"en":"Familiar Card","zh":"吸血蝙蝠卡片","slot":"weapon","boss":false,"effects":[["+3% 命中暈眩機率"],["+4.5% 命中暈眩機率"],["+6% 命中暈眩機率"],["+7.5% 命中暈眩機率"],["+9% 命中暈眩機率"],["+10.5% 命中暈眩機率"]]},{"id":4023,"en":"Baby Desert Wolf Card","zh":"沙漠幼狼卡片","slot":"weapon","boss":false,"effects":[["+3 急速"],["+4.5 急速"],["+6 急速"],["+7.5 急速"],["+9 急速"],["+10.5 急速"]]},{"id":4024,"en":"Plankton Card","zh":"漂浮蟲卡片","slot":"weapon","boss":false,"effects":[["+4% 命中暈眩機率"],["+6% 命中暈眩機率"],["+8% 命中暈眩機率"],["+10% 命中暈眩機率"],["+12% 命中暈眩機率"],["+14% 命中暈眩機率"]]},{"id":4266,"en":"Eclipse Card","zh":"藍瘋兔卡片","slot":"garment","boss":true,"effects":[["+50 最大 HP","+1 護甲"],["+75 最大 HP","+1.5 護甲"],["+100 最大 HP","+2 護甲"],["+125 最大 HP","+2.5 護甲"],["+150 最大 HP","+3 護甲"],["+175 最大 HP","+3.5 護甲"]]},{"id":4211,"en":"Vocal Card","zh":"蝗蟲之王卡片","slot":"headgear","boss":true,"effects":[["+6% 移動速度","+3% 迴避"],["+9% 移動速度","+4.5% 迴避"],["+12% 移動速度","+6% 迴避"],["+15% 移動速度","+7.5% 迴避"],["+18% 移動速度","+9% 迴避"],["+21% 移動速度","+10.5% 迴避"]]},{"id":4197,"en":"Mastering Card","zh":"波利之王卡片","slot":"accessory","boss":true,"effects":[["+6% 迴避","+3% 爆擊"],["+9% 迴避","+4.5% 爆擊"],["+12% 迴避","+6% 爆擊"],["+15% 迴避","+7.5% 爆擊"],["+18% 迴避","+9% 爆擊"],["+21% 迴避","+10.5% 爆擊"]]},{"id":4128,"en":"Golden Thiefbug Card","zh":"黃金蟲卡片","slot":"shield","boss":true,"effects":[["+15% 減傷"],["+22.5% 減傷"],["+30% 減傷"],["+37.5% 減傷"],["+45% 減傷"],["+52.5% 減傷"]]},{"id":4016,"en":"Thief Bug Card","zh":"盜蟲卡片","slot":"armor","boss":false,"effects":[["+3% 迴避"],["+4.5% 迴避"],["+6% 迴避"],["+7.5% 迴避"],["+9% 迴避"],["+10.5% 迴避"]]},{"id":4026,"en":"Female Thiefbug Card","zh":"浮勒盜蟲卡片","slot":"weapon","boss":false,"effects":[["+2% 爆擊","+2% 傷害"],["+3% 爆擊","+3% 傷害"],["+4% 爆擊","+4% 傷害"],["+5% 爆擊","+5% 傷害"],["+6% 爆擊","+6% 傷害"],["+7% 爆擊","+7% 傷害"]]},{"id":4014,"en":"Roda Frog Card","zh":"羅達蛙卡片","slot":"armor","boss":false,"effects":[["+40 最大 HP"],["+60 最大 HP"],["+80 最大 HP"],["+100 最大 HP"],["+120 最大 HP"],["+140 最大 HP"]]},{"id":4040,"en":"Creamy Card","zh":"克瑞米卡片","slot":"accessory","boss":false,"effects":[["+4% 移動速度","+2% 迴避"],["+6% 移動速度","+3% 迴避"],["+8% 移動速度","+4% 迴避"],["+10% 移動速度","+5% 迴避"],["+12% 移動速度","+6% 迴避"],["+14% 移動速度","+7% 迴避"]]},{"id":4030,"en":"Mandragora Card","zh":"曼陀羅卡片","slot":"weapon","boss":false,"effects":[["+5% 傷害"],["+7.5% 傷害"],["+10% 傷害"],["+12.5% 傷害"],["+15% 傷害"],["+17.5% 傷害"]]},{"id":4306,"en":"Toad Card","zh":"蛙王卡片","slot":"garment","boss":true,"effects":[["+5% 迴避"],["+7.5% 迴避"],["+10% 迴避"],["+12.5% 迴避"],["+15% 迴避"],["+17.5% 迴避"]]},{"id":4179,"en":"Dragonfly Card","zh":"龍蠅卡片","slot":"garment","boss":true,"effects":[["+1 AGI","+2% 迴避"],["+1.5 AGI","+3% 迴避"],["+2 AGI","+4% 迴避"],["+2.5 AGI","+5% 迴避"],["+3 AGI","+6% 迴避"],["+3.5 AGI","+7% 迴避"]]},{"id":4028,"en":"Tarou Card","zh":"白鼠卡片","slot":"accessory","boss":false,"effects":[["+2 STR"],["+3 STR"],["+4 STR"],["+5 STR"],["+6 STR"],["+7 STR"]]},{"id":4069,"en":"Drainliar Card","zh":"紅蝙蝠卡片","slot":"weapon","boss":false,"effects":[["+5% 傷害"],["+7.5% 傷害"],["+10% 傷害"],["+12.5% 傷害"],["+15% 傷害"],["+17.5% 傷害"]]},{"id":4296,"en":"Cramp Card","zh":"藍鼠卡片","slot":"headgear","boss":false,"effects":[["+12% Zeny"],["+18% Zeny"],["+24% Zeny"],["+30% Zeny"],["+36% Zeny"],["+42% Zeny"]]},{"id":4027,"en":"Kukre Card","zh":"庫克雷卡片","slot":"accessory","boss":false,"effects":[["+2 AGI"],["+3 AGI"],["+4 AGI"],["+5 AGI"],["+6 AGI"],["+7 AGI"]]},{"id":4055,"en":"Marina Card","zh":"水母卡片","slot":"weapon","boss":false,"effects":[["+5% 命中暈眩機率","+2% 傷害"],["+7.5% 命中暈眩機率","+3% 傷害"],["+10% 命中暈眩機率","+4% 傷害"],["+12.5% 命中暈眩機率","+5% 傷害"],["+15% 命中暈眩機率","+6% 傷害"],["+17.5% 命中暈眩機率","+7% 傷害"]]},{"id":4035,"en":"Hydra Card","zh":"海葵卡片","slot":"weapon","boss":false,"effects":[["+5% 傷害"],["+7.5% 傷害"],["+10% 傷害"],["+12.5% 傷害"],["+15% 傷害"],["+17.5% 傷害"]]},{"id":4102,"en":"Whisper Card","zh":"白幽靈卡片","slot":"garment","boss":false,"effects":[["+8% 迴避","-4% 減傷"],["+12% 迴避","-6% 減傷"],["+16% 迴避","-8% 減傷"],["+20% 迴避","-10% 減傷"],["+24% 迴避","-12% 減傷"],["+28% 迴避","-14% 減傷"]]},{"id":4314,"en":"Penomena Card","zh":"梅納海葵卡片","slot":"shield","boss":false,"effects":[["+6% 減傷"],["+9% 減傷"],["+12% 減傷"],["+15% 減傷"],["+18% 減傷"],["+21% 減傷"]]},{"id":4089,"en":"Swordfish Card","zh":"異變魚卡片","slot":"armor","boss":false,"effects":[["+1 護甲","+3% 減傷"],["+1.5 護甲","+4.5% 減傷"],["+2 護甲","+6% 減傷"],["+2.5 護甲","+7.5% 減傷"],["+3 護甲","+9% 減傷"],["+3.5 護甲","+10.5% 減傷"]]},{"id":4073,"en":"Pirate Skel Card","zh":"邪骸海盜卡片","slot":"accessory","boss":false,"effects":[["+15% Zeny"],["+22.5% Zeny"],["+30% Zeny"],["+37.5% Zeny"],["+45% Zeny"],["+52.5% Zeny"]]},{"id":4137,"en":"Drake Card","zh":"海盜之王卡片","slot":"weapon","boss":true,"effects":[["+15% 對首領及菁英傷害","+5% 傷害"],["+22.5% 對首領及菁英傷害","+7.5% 傷害"],["+30% 對首領及菁英傷害","+10% 傷害"],["+37.5% 對首領及菁英傷害","+12.5% 傷害"],["+45% 對首領及菁英傷害","+15% 傷害"],["+52.5% 對首領及菁英傷害","+17.5% 傷害"]]},{"id":4049,"en":"Vadon Card","zh":"螃蟹卡片","slot":"weapon","boss":false,"effects":[["+5% 傷害"],["+7.5% 傷害"],["+10% 傷害"],["+12.5% 傷害"],["+15% 傷害"],["+17.5% 傷害"]]},{"id":4061,"en":"Cornutus Card","zh":"卡那多斯卡片","slot":"armor","boss":false,"effects":[["+1 護甲","+3% 減傷"],["+1.5 護甲","+4.5% 減傷"],["+2 護甲","+6% 減傷"],["+2.5 護甲","+7.5% 減傷"],["+3 護甲","+9% 減傷"],["+3.5 護甲","+10.5% 減傷"]]},{"id":4095,"en":"Marse Card","zh":"烏賊卡片","slot":"garment","boss":false,"effects":[["+5% 迴避"],["+7.5% 迴避"],["+10% 迴避"],["+12.5% 迴避"],["+15% 迴避"],["+17.5% 迴避"]]},{"id":4077,"en":"Phen Card","zh":"劍魚卡片","slot":"accessory","boss":false,"effects":[["+4 急速"],["+6 急速"],["+8 急速"],["+10 急速"],["+12 急速"],["+14 急速"]]},{"id":4093,"en":"Obeaune Card","zh":"人魚卡片","slot":"accessory","boss":false,"effects":[["+25 最大 HP"],["+37.5 最大 HP"],["+50 最大 HP"],["+62.5 最大 HP"],["+75 最大 HP"],["+87.5 最大 HP"]]},{"id":4084,"en":"Marine Sphere Card","zh":"氣泡蟲卡片","slot":"accessory","boss":false,"effects":[["+5% 範圍"],["+7.5% 範圍"],["+10% 範圍"],["+12.5% 範圍"],["+15% 範圍"],["+17.5% 範圍"]]},{"id":4199,"en":"Merman Card","zh":"人魚士兵卡片","slot":"accessory","boss":false,"effects":[["+0.6 HP／秒"],["+0.9 HP／秒"],["+1.2 HP／秒"],["+1.5 HP／秒"],["+1.8 HP／秒"],["+2.1 HP／秒"]]},{"id":4125,"en":"Deviace Card","zh":"狄奧斯卡片","slot":"weapon","boss":true,"effects":[["+6% 傷害"],["+9% 傷害"],["+12% 傷害"],["+15% 傷害"],["+18% 傷害"],["+21% 傷害"]]},{"id":4111,"en":"Strouf Card","zh":"海神卡片","slot":"weapon","boss":true,"effects":[["+8% 對首領及菁英傷害"],["+12% 對首領及菁英傷害"],["+16% 對首領及菁英傷害"],["+20% 對首領及菁英傷害"],["+24% 對首領及菁英傷害"],["+28% 對首領及菁英傷害"]]},{"id":4524,"en":"King Dramoh Card","zh":"大腳龍蝦卡片","slot":"headgear","boss":true,"effects":[["+2 STR"],["+3 STR"],["+4 STR"],["+5 STR"],["+6 STR"],["+7 STR"]]},{"id":4525,"en":"Kraken Card","zh":"魔鬼大烏賊卡片","slot":"garment","boss":true,"effects":[["+8% 迴避","+3% 爆擊"],["+12% 迴避","+4.5% 爆擊"],["+16% 迴避","+6% 爆擊"],["+20% 迴避","+7.5% 爆擊"],["+24% 迴避","+9% 爆擊"],["+28% 迴避","+10.5% 爆擊"]]},{"id":4037,"en":"Snake Card","zh":"青蛇卡片","slot":"weapon","boss":false,"effects":[["+3% 爆擊","+2% 傷害"],["+4.5% 爆擊","+3% 傷害"],["+6% 爆擊","+4% 傷害"],["+7.5% 爆擊","+5% 傷害"],["+9% 爆擊","+6% 傷害"],["+10.5% 爆擊","+7% 傷害"]]},{"id":4034,"en":"Wormtail Card","zh":"森靈卡片","slot":"accessory","boss":false,"effects":[["+2 DEX"],["+3 DEX"],["+4 DEX"],["+5 DEX"],["+6 DEX"],["+7 DEX"]]},{"id":4048,"en":"Poison Spore Card","zh":"毒魔菇卡片","slot":"accessory","boss":false,"effects":[["+2 STR"],["+3 STR"],["+4 STR"],["+5 STR"],["+6 STR"],["+7 STR"]]},{"id":4052,"en":"Elder Willow Card","zh":"長老樹精卡片","slot":"headgear","boss":false,"effects":[["+2 INT"],["+3 INT"],["+4 INT"],["+5 INT"],["+6 INT"],["+7 INT"]]},{"id":4074,"en":"Bigfoot Card","zh":"大腳熊卡片","slot":"shield","boss":false,"effects":[["+5% 減傷"],["+7.5% 減傷"],["+10% 減傷"],["+12.5% 減傷"],["+15% 減傷"],["+17.5% 減傷"]]},{"id":4098,"en":"Dokkaebi Card","zh":"土人卡片","slot":"armor","boss":false,"effects":[["+4% 迴避","+2% 移動速度"],["+6% 迴避","+3% 移動速度"],["+8% 迴避","+4% 移動速度"],["+10% 迴避","+5% 移動速度"],["+12% 迴避","+6% 移動速度"],["+14% 迴避","+7% 移動速度"]]},{"id":4159,"en":"Nine Tail Card","zh":"九尾狐卡片","slot":"garment","boss":false,"effects":[["+2 AGI","+5% 迴避"],["+3 AGI","+7.5% 迴避"],["+4 AGI","+10% 迴避"],["+5 AGI","+12.5% 迴避"],["+6 AGI","+15% 迴避"],["+7 AGI","+17.5% 迴避"]]},{"id":4283,"en":"Greatest General Card","zh":"將軍魔碑卡片","slot":"accessory","boss":false,"effects":[["+30 最大 HP","+1 護甲"],["+45 最大 HP","+1.5 護甲"],["+60 最大 HP","+2 護甲"],["+75 最大 HP","+2.5 護甲"],["+90 最大 HP","+3 護甲"],["+105 最大 HP","+3.5 護甲"]]},{"id":4178,"en":"Dragon Tail Card","zh":"刺尾蜻蜓卡片","slot":"garment","boss":false,"effects":[["+4% 移動速度"],["+6% 移動速度"],["+8% 移動速度"],["+10% 移動速度"],["+12% 移動速度"],["+14% 移動速度"]]},{"id":4183,"en":"Wandering Wolf Card","zh":"遊蕩狼卡片","slot":"garment","boss":true,"effects":[["+1 STR","+4% 傷害"],["+1.5 STR","+6% 傷害"],["+2 STR","+8% 傷害"],["+2.5 STR","+10% 傷害"],["+3 STR","+12% 傷害"],["+3.5 STR","+14% 傷害"]]},{"id":4131,"en":"Moonlight Flower Card","zh":"月夜貓卡片","slot":"shoes","boss":true,"effects":[["+8% 移動速度","+0.6 移動時 HP／秒"],["+12% 移動速度","+0.9 移動時 HP／秒"],["+16% 移動速度","+1.2 移動時 HP／秒"],["+20% 移動速度","+1.5 移動時 HP／秒"],["+24% 移動速度","+1.8 移動時 HP／秒"],["+28% 移動速度","+2.1 移動時 HP／秒"]]},{"id":4025,"en":"Skeleton Card","zh":"邪骸戰士卡片","slot":"weapon","boss":false,"effects":[["+4% 傷害","+2% 命中暈眩機率"],["+6% 傷害","+3% 命中暈眩機率"],["+8% 傷害","+4% 命中暈眩機率"],["+10% 傷害","+5% 命中暈眩機率"],["+12% 傷害","+6% 命中暈眩機率"],["+14% 傷害","+7% 命中暈眩機率"]]},{"id":4094,"en":"Archer Skeleton Card","zh":"邪骸弓箭手卡片","slot":"weapon","boss":false,"effects":[["+8% 投射物速度","+2% 傷害"],["+12% 投射物速度","+3% 傷害"],["+16% 投射物速度","+4% 傷害"],["+20% 投射物速度","+5% 傷害"],["+24% 投射物速度","+6% 傷害"],["+28% 投射物速度","+7% 傷害"]]},{"id":4086,"en":"Soldier Skeleton Card","zh":"邪骸士兵卡片","slot":"weapon","boss":false,"effects":[["+5% 爆擊"],["+7.5% 爆擊"],["+10% 爆擊"],["+12.5% 爆擊"],["+15% 爆擊"],["+17.5% 爆擊"]]},{"id":4090,"en":"Munak Card","zh":"殭屍卡片","slot":"shield","boss":false,"effects":[["+2 護甲"],["+3 護甲"],["+4 護甲"],["+5 護甲"],["+6 護甲"],["+7 護甲"]]},{"id":4212,"en":"Bongun Card","zh":"妖道卡片","slot":"accessory","boss":false,"effects":[["+2 VIT"],["+3 VIT"],["+4 VIT"],["+5 VIT"],["+6 VIT"],["+7 VIT"]]},{"id":4100,"en":"Sohee Card","zh":"鬼女卡片","slot":"shoes","boss":false,"effects":[["+4 急速","+15 最大 HP"],["+6 急速","+22.5 最大 HP"],["+8 急速","+30 最大 HP"],["+10 急速","+37.5 最大 HP"],["+12 急速","+45 最大 HP"],["+14 急速","+52.5 最大 HP"]]},{"id":4103,"en":"Horong Card","zh":"鬼火卡片","slot":"accessory","boss":false,"effects":[["+4% 範圍"],["+6% 範圍"],["+8% 範圍"],["+10% 範圍"],["+12% 範圍"],["+14% 範圍"]]},{"id":4221,"en":"Skeleton General Card","zh":"邪骸戰士長卡片","slot":"shoes","boss":true,"effects":[["+6% 移動速度","+5% 對首領及不死系傷害"],["+9% 移動速度","+7.5% 對首領及不死系傷害"],["+12% 移動速度","+10% 對首領及不死系傷害"],["+15% 移動速度","+12.5% 對首領及不死系傷害"],["+18% 移動速度","+15% 對首領及不死系傷害"],["+21% 移動速度","+17.5% 對首領及不死系傷害"]]},{"id":4290,"en":"Cat O' Nine Tails Card","zh":"狂暴月夜貓卡片","slot":"shoes","boss":true,"effects":[["+50 最大 HP","+0.5 HP／秒"],["+75 最大 HP","+0.75 HP／秒"],["+100 最大 HP","+1 HP／秒"],["+125 最大 HP","+1.25 HP／秒"],["+150 最大 HP","+1.5 HP／秒"],["+175 最大 HP","+1.75 HP／秒"]]},{"id":4328,"en":"Yao Jun Card","zh":"妖君卡片","slot":"garment","boss":true,"effects":[["+6% 減傷","+3% 迴避"],["+9% 減傷","+4.5% 迴避"],["+12% 減傷","+6% 迴避"],["+15% 減傷","+7.5% 迴避"],["+18% 減傷","+9% 迴避"],["+21% 減傷","+10.5% 迴避"]]}];
  const currentHansCardById = new Map(currentHansCards.map(card => [card.id,card]));
  const currentHansCardNames = new Map(currentHansCards.flatMap(card => [card.zh,card.en].map(name => [name.normalize('NFKC').toLowerCase().trim(),card])));
  function localizeLoot(category, name, slot, rank, iconKey, catalog, stats) {
    if (taiwanGame && category === 1) {
      const cardId = Number((iconKey || name).match(/(?:^id:|^#|\/)(\d+)(?:\.[^/]+)?$/)?.[1]);
      const suffix = name.normalize('NFKC').match(/\s*[·・]\s*改(\d*)$/);
      const variant = cardId >= 1000000 ? Math.floor(cardId / 1000000) : suffix ? Number(suffix[1] || 1) : 0;
      const base = name.normalize('NFKC').replace(/\s*[·・]\s*改\d*$/,'').toLowerCase().trim();
      const card = currentHansCardById.get(cardId % 1000000) || currentHansCardNames.get(base);
      if (card && variant >= 0 && variant <= 5) return [card.zh + (variant ? ['','・改','・改²','・改³','・改⁴','・改⁵'][variant] : ''),card.slot,rank,stats?.length ? stats : card.effects[variant],card.en];
    }
    const gameCard = category === 1 ? gameCardDetails.get(cardKey(name)) : null;
    if (category === 1 && taiwanGame) {
      const modified = modifiedCardInfo(name,iconKey,lootCatalog[1]);
      if (modified) return [modified.name,slot || gameCard?.slot || modified.slot,rank,stats?.length ? stats : gameCard?.effects?.length ? gameCard.effects : modified.effects,modified.english];
    }
    const key = name.normalize("NFKC").trim().toLowerCase();
    const id = iconKey?.match(/(?:^id:|\/)(\d+)(?:\.[^/]+)?$/)?.[1];
    const item = lootCatalog[category].get("#" + id) || lootCatalog[category].get(key);
    const effects = category === 1 ? (stats?.length ? stats : gameCard?.effects?.length ? gameCard.effects : cardEffects[item?.id]) : stats;
    return [item?.zh || name, slot || gameCard?.slot || item?.slot || catalog?.[iconKey] || catalog?.[key] || "",rank,effects,item?.en];
  }
  let lastGearCatalog;
  const bossDropCards = new Set([4054,4174,4047,4123,4143,4144,4147,4134,4140,4142,4155,4168,4169,4172,4176,4188,4191,4207,4210,4214,4216,4229,4237,4238,4243,4248,4250,4254,4259,4276,4291,4300,4303,4318,4319,4320,4322,4323,4324,4330,4372,4378,4380,4384,4386,4417,4418,4419,4441,4266,4211,4197,4128,4306,4179,4137,4125,4111,4524,4525,4183,4131,4221,4290,4328]);
  function lootSortPriority(category,iconKey,stats,tier,rank,slot,disposition,catalog) {
    const id = Number(iconKey?.match(/(?:^id:|\/)(\d+)(?:\.[^/]+)?$/)?.[1]);
    if (category === 1) return bossDropCards.has(id % 1000000) ? 1 : 0;
    if (category !== 0 || disposition === '賣出') return 0;
    if (disposition === '存倉' || matchesTargetStorage(iconKey,stats,tier,rank)) return 1;
    const specific = targetStorageRules.get(id);
    if (specific) return 0;
    const rawType = catalog?.['type:' + id];
    const type = inventoryGameWeaponTypes[rawType] || inventoryWeaponById.get(id) ||
      (slot === 'acc' ? 'accessory' : slot === 'weapon' ? null : slot);
    return matchingInventoryRule(stats || [],inventoryRules(inventorySettings()),tier,rank,type) ? 1 : 0;
  }
  const dropCardRoles = [{"id":4001,"zh":"波利卡片","en":"Poring Card","type":"normal"},{"id":4006,"zh":"瘋兔卡片","en":"Lunatic Card","type":"normal"},{"id":4002,"zh":"綠棉蟲卡片","en":"Fabre Card","type":"normal"},{"id":4004,"zh":"土波利卡片","en":"Drops Card","type":"normal"},{"id":4009,"zh":"蒼蠅卡片","en":"Chonchon Card","type":"normal"},{"id":4021,"zh":"搖滾蝗蟲卡片","en":"Rocker Card","type":"normal"},{"id":4010,"zh":"樹精卡片","en":"Willow Card","type":"normal"},{"id":4015,"zh":"禿鷹卡片","en":"Condor Card","type":"normal"},{"id":4022,"zh":"魔菇卡片","en":"Spore Card","type":"normal"},{"id":4033,"zh":"波波利卡片","en":"PoPoring Card","type":"normal"},{"id":4017,"zh":"小野豬卡片","en":"Savage Bebe Card","type":"normal"},{"id":4044,"zh":"浣熊卡片","en":"Smokie Card","type":"normal"},{"id":4029,"zh":"野狼卡片","en":"Wolf Card","type":"normal"},{"id":4066,"zh":"獸人戰士卡片","en":"Orc Warrior Card","type":"normal"},{"id":4060,"zh":"哥布靈卡片","en":"Goblin Card","type":"normal"},{"id":4091,"zh":"犬妖卡片","en":"Kobold Card","type":"normal"},{"id":4038,"zh":"腐屍卡片","en":"Zombie Card","type":"normal"},{"id":4085,"zh":"邪骸獸人卡片","en":"Orc Skeleton Card","type":"normal"},{"id":4054,"zh":"天使波利卡片","en":"Angelring Card","type":"mini"},{"id":4174,"zh":"惡魔波利卡片","en":"Devilring Card","type":"mini"},{"id":4047,"zh":"幽靈波利卡片","en":"Ghostring Card","type":"mini"},{"id":4123,"zh":"虎王卡片","en":"Eddga Card","type":"boss"},{"id":4143,"zh":"獸人英雄卡片","en":"Orc Hero Card","type":"boss"},{"id":4144,"zh":"俄塞里斯卡片","en":"Osiris Card","type":"boss"},{"id":4147,"zh":"巴風特卡片","en":"Baphomet Card","type":"boss"},{"id":4071,"zh":"獸人腐屍卡片","en":"Orc Zombie Card","type":"normal"},{"id":4097,"zh":"黑狐卡片","en":"Matyr Card","type":"normal"},{"id":4106,"zh":"木乃伊卡片","en":"Mummy Card","type":"normal"},{"id":4107,"zh":"木乃伊犬卡片","en":"Verit Card","type":"normal"},{"id":4109,"zh":"南瓜先生卡片","en":"Jakk Card","type":"normal"},{"id":4110,"zh":"綠腐屍卡片","en":"Ghoul Card","type":"normal"},{"id":4113,"zh":"傀儡娃娃卡片","en":"Marionette Card","type":"normal"},{"id":4114,"zh":"艾吉歐蜈蚣卡片","en":"Argiope Card","type":"normal"},{"id":4115,"zh":"赤蒼蠅卡片","en":"Hunter Fly Card","type":"normal"},{"id":4116,"zh":"伊希斯卡片","en":"Isis Card","type":"normal"},{"id":4117,"zh":"黑蛇卡片","en":"Sidewinder Card","type":"normal"},{"id":4119,"zh":"巫婆卡片","en":"Bathory Card","type":"normal"},{"id":4122,"zh":"小惡魔卡片","en":"Deviruchi Card","type":"normal"},{"id":4126,"zh":"牛頭人卡片","en":"Minorous Card","type":"normal"},{"id":4127,"zh":"夢魘卡片","en":"Nightmare Card","type":"normal"},{"id":4129,"zh":"小巴風特卡片","en":"Baphomet Jr. Card","type":"normal"},{"id":4133,"zh":"幽靈劍士卡片","en":"Raydric Card","type":"normal"},{"id":4134,"zh":"德古拉男爵卡片","en":"Dracula Card","type":"boss"},{"id":4136,"zh":"卡利斯格卡片","en":"Khalitzburg Card","type":"normal"},{"id":4139,"zh":"裘卡卡片","en":"Joker Card","type":"normal"},{"id":4140,"zh":"深淵騎士卡片","en":"Abysmal Knight Card","type":"mini"},{"id":4141,"zh":"闇神官卡片","en":"Evil Druid Card","type":"normal"},{"id":4142,"zh":"死靈卡片","en":"Doppelganger Card","type":"mini"},{"id":4155,"zh":"哥布靈首領卡片","en":"Goblin Leader Card","type":"mini"},{"id":4157,"zh":"弓箭哥布靈卡片","en":"Goblin Archer Card","type":"normal"},{"id":4168,"zh":"黑暗之王卡片","en":"Dark Lord Card","type":"boss"},{"id":4169,"zh":"迷幻之王卡片","en":"Dark Illusion Card","type":"mini"},{"id":4170,"zh":"鏡妖卡片","en":"Dark Frame Card","type":"normal"},{"id":4172,"zh":"紙妖卡片","en":"The Paper Card","type":"mini"},{"id":4176,"zh":"無顱武士卡片","en":"Dullahan Card","type":"mini"},{"id":4181,"zh":"假面鬼卡片","en":"Disguise Card","type":"normal"},{"id":4185,"zh":"飛行魔書卡片","en":"Rideword Card","type":"normal"},{"id":4187,"zh":"幽靈弓箭手卡片","en":"Raydric Archer Card","type":"normal"},{"id":4188,"zh":"狂暴大腳熊卡片","en":"Leib Olmai Card","type":"mini"},{"id":4190,"zh":"惡靈卡片","en":"Wraith Card","type":"normal"},{"id":4191,"zh":"銀月魔女卡片","en":"Loli Ruri Card","type":"mini"},{"id":4193,"zh":"南瓜魂卡片","en":"Lude Card","type":"normal"},{"id":4195,"zh":"群葉貓卡片","en":"Leaf Cat Card","type":"normal"},{"id":4205,"zh":"邪惡箱卡片","en":"Mimic Card","type":"normal"},{"id":4206,"zh":"邪惡禮盒卡片","en":"Myst Case Card","type":"normal"},{"id":4207,"zh":"弒神者卡片","en":"Mysteltainn Card","type":"mini"},{"id":4210,"zh":"邪骸浪人卡片","en":"Wanderer Card","type":"mini"},{"id":4214,"zh":"嗜血怪人卡片","en":"Bloody Murderer Card","type":"mini"},{"id":4216,"zh":"雪熊卡片","en":"Sasquatch Card","type":"mini"},{"id":4217,"zh":"猴桃木卡片","en":"Enchanted Peach Tree Card","type":"normal"},{"id":4222,"zh":"邪骸戰俘卡片","en":"Skeleton Prisoner Card","type":"normal"},{"id":4225,"zh":"石炮火樹卡片","en":"Stone Shooter Card","type":"normal"},{"id":4227,"zh":"春兔卡片","en":"Spring Rabbit Card","type":"normal"},{"id":4229,"zh":"鐘塔守護者卡片","en":"Tower Keeper Card","type":"mini"},{"id":4235,"zh":"XMAS甜餅人卡片","en":"Christmas Cookie Card","type":"normal"},{"id":4237,"zh":"鴞裊首領卡片","en":"Owl Duke Card","type":"mini"},{"id":4238,"zh":"鴞裊男爵卡片","en":"Owl Baron Card","type":"boss"},{"id":4239,"zh":"鐵蠍卡片","en":"Iron Fist Card","type":"normal"},{"id":4243,"zh":"安東尼奧卡片","en":"Antonio Card","type":"boss"},{"id":4244,"zh":"鐘怪卡片","en":"Alarm Card","type":"normal"},{"id":4248,"zh":"狂暴木乃伊卡片","en":"Ancient Mummy Card","type":"mini"},{"id":4250,"zh":"行刑者卡片","en":"Executioner Card","type":"mini"},{"id":4254,"zh":"獸牙怪卡片","en":"Ogretooth Card","type":"mini"},{"id":4255,"zh":"獸人女戰士卡片","en":"Orc Lady Card","type":"normal"},{"id":4256,"zh":"獸人弓箭手卡片","en":"Orc Archer Card","type":"normal"},{"id":4259,"zh":"機木人卡片","en":"Wooden Golem Card","type":"mini"},{"id":4275,"zh":"腐屍戰俘卡片","en":"Zombie Prisoner Card","type":"normal"},{"id":4276,"zh":"死靈騎士卡片","en":"Lord of The Dead Card","type":"boss"},{"id":4278,"zh":"鬼娃樹卡片","en":"Gibbet Card","type":"normal"},{"id":4287,"zh":"釣魚河童卡片","en":"Kapha Card","type":"normal"},{"id":4291,"zh":"犬妖首領卡片","en":"Kobold Leader Card","type":"mini"},{"id":4293,"zh":"甜餅人卡片","en":"Cookie Card","type":"normal"},{"id":4294,"zh":"萬聖魔卡片","en":"Quve Card","type":"normal"},{"id":4297,"zh":"玩具士兵卡片","en":"Cruiser Card","type":"normal"},{"id":4299,"zh":"古鐘魔卡片","en":"Clock Card","type":"normal"},{"id":4300,"zh":"凱美拉卡片","en":"Chimera Card","type":"mini"},{"id":4301,"zh":"狂暴螳螂卡片","en":"Killer Mantis Card","type":"normal"},{"id":4303,"zh":"巨大白幽靈卡片","en":"Giant Whisper Card","type":"mini"},{"id":4313,"zh":"朽魔卡片","en":"Punk Card","type":"normal"},{"id":4318,"zh":"冰暴騎士卡片","en":"Stormy Knight Card","type":"boss"},{"id":4319,"zh":"水靈龜卡片","en":"Freezer Card","type":"mini"},{"id":4320,"zh":"血腥騎士卡片","en":"Bloody Knight Card","type":"mini"},{"id":4321,"zh":"兔斯拉卡片","en":"Hylozoist Card","type":"normal"},{"id":4322,"zh":"獸人戰士長卡片","en":"High Orc Card","type":"mini"},{"id":4323,"zh":"卡崙寶寶卡片","en":"Hatii Babe Card","type":"mini"},{"id":4324,"zh":"卡崙卡片","en":"Hatii Card","type":"mini"},{"id":4330,"zh":"墨蛇君卡片","en":"Evil Snake Lord Card","type":"boss"},{"id":4340,"zh":"玩偶熊卡片","en":"Teddy Bear Card","type":"normal"},{"id":4372,"zh":"白素貞卡片","en":"White Lady Card","type":"boss"},{"id":4375,"zh":"獸人嬰兒卡片","en":"Orc Baby Card","type":"normal"},{"id":4378,"zh":"黃俄希托斯卡片","en":"Gold Acidus Card","type":"mini"},{"id":4379,"zh":"灰俄希托斯卡片","en":"Blue Acidus Card","type":"normal"},{"id":4380,"zh":"紅貝勒斯卡片","en":"Red Ferus Card","type":"mini"},{"id":4381,"zh":"綠貝勒斯卡片","en":"Green Ferus Card","type":"normal"},{"id":4382,"zh":"黃諾博斯卡片","en":"Yellow Novus Card","type":"normal"},{"id":4383,"zh":"諾博斯卡片","en":"Red Novus Card","type":"normal"},{"id":4384,"zh":"三頭龍卡片","en":"Hydrolancer Card","type":"mini"},{"id":4385,"zh":"龍蛋卡片","en":"Dragon Egg Card","type":"normal"},{"id":4386,"zh":"迪塔勒泰晤勒斯卡片","en":"Detardeurus Card","type":"boss"},{"id":4387,"zh":"狂暴邪惡箱卡片","en":"Ancient Mimic Card","type":"normal"},{"id":4415,"zh":"雪獸卡片","en":"Snowier Card","type":"normal"},{"id":4416,"zh":"小雪獸卡片","en":"Siroma Card","type":"normal"},{"id":4417,"zh":"冰巨人卡片","en":"Ice Titan Card","type":"mini"},{"id":4418,"zh":"蓋俄斯提卡片","en":"Gazeti Card","type":"mini"},{"id":4419,"zh":"水晶龍卡片","en":"Ktullanux Card","type":"boss"},{"id":4441,"zh":"墮落大神官 悉潘卡片","en":"Fallen Bishop Hibram Card","type":"boss"},{"id":4003,"zh":"蟲蛹卡片","en":"Pupa Card","type":"normal"},{"id":4008,"zh":"小雞卡片","en":"Picky Card","type":"normal"},{"id":4007,"zh":"大嘴鳥蛋卡片","en":"Pecopeco Egg Card","type":"normal"},{"id":4012,"zh":"盜蟲卵卡片","en":"Thiefbug Egg Card","type":"normal"},{"id":4019,"zh":"蜂兵卡片","en":"Hornet Card","type":"normal"},{"id":4020,"zh":"吸血蝙蝠卡片","en":"Familiar Card","type":"normal"},{"id":4023,"zh":"沙漠幼狼卡片","en":"Baby Desert Wolf Card","type":"normal"},{"id":4024,"zh":"漂浮蟲卡片","en":"Plankton Card","type":"normal"},{"id":4266,"zh":"藍瘋兔卡片","en":"Eclipse Card","type":"mini"},{"id":4211,"zh":"蝗蟲之王卡片","en":"Vocal Card","type":"mini"},{"id":4197,"zh":"波利之王卡片","en":"Mastering Card","type":"boss"},{"id":4128,"zh":"黃金蟲卡片","en":"Golden Thiefbug Card","type":"boss"},{"id":4016,"zh":"盜蟲卡片","en":"Thief Bug Card","type":"normal"},{"id":4026,"zh":"浮勒盜蟲卡片","en":"Female Thiefbug Card","type":"normal"},{"id":4014,"zh":"羅達蛙卡片","en":"Roda Frog Card","type":"normal"},{"id":4040,"zh":"克瑞米卡片","en":"Creamy Card","type":"normal"},{"id":4030,"zh":"曼陀羅卡片","en":"Mandragora Card","type":"normal"},{"id":4306,"zh":"蛙王卡片","en":"Toad Card","type":"mini"},{"id":4179,"zh":"龍蠅卡片","en":"Dragonfly Card","type":"mini"},{"id":4028,"zh":"白鼠卡片","en":"Tarou Card","type":"normal"},{"id":4069,"zh":"紅蝙蝠卡片","en":"Drainliar Card","type":"normal"},{"id":4296,"zh":"藍鼠卡片","en":"Cramp Card","type":"normal"},{"id":4027,"zh":"庫克雷卡片","en":"Kukre Card","type":"normal"},{"id":4055,"zh":"水母卡片","en":"Marina Card","type":"normal"},{"id":4035,"zh":"海葵卡片","en":"Hydra Card","type":"normal"},{"id":4102,"zh":"白幽靈卡片","en":"Whisper Card","type":"normal"},{"id":4314,"zh":"梅納海葵卡片","en":"Penomena Card","type":"mini"},{"id":4089,"zh":"異變魚卡片","en":"Swordfish Card","type":"normal"},{"id":4073,"zh":"邪骸海盜卡片","en":"Pirate Skel Card","type":"normal"},{"id":4137,"zh":"海盜之王卡片","en":"Drake Card","type":"boss"},{"id":4049,"zh":"螃蟹卡片","en":"Vadon Card","type":"normal"},{"id":4061,"zh":"卡那多斯卡片","en":"Cornutus Card","type":"normal"},{"id":4095,"zh":"烏賊卡片","en":"Marse Card","type":"normal"},{"id":4077,"zh":"劍魚卡片","en":"Phen Card","type":"normal"},{"id":4093,"zh":"人魚卡片","en":"Obeaune Card","type":"normal"},{"id":4084,"zh":"氣泡蟲卡片","en":"Marine Sphere Card","type":"normal"},{"id":4199,"zh":"人魚士兵卡片","en":"Merman Card","type":"normal"},{"id":4125,"zh":"狄奧斯卡片","en":"Deviace Card","type":"mini"},{"id":4111,"zh":"海神卡片","en":"Strouf Card","type":"mini"},{"id":4524,"zh":"大腳龍蝦卡片","en":"King Dramoh Card","type":"mini"},{"id":4525,"zh":"魔鬼大烏賊卡片","en":"Kraken Card","type":"boss"},{"id":4037,"zh":"青蛇卡片","en":"Snake Card","type":"normal"},{"id":4034,"zh":"森靈卡片","en":"Wormtail Card","type":"normal"},{"id":4048,"zh":"毒魔菇卡片","en":"Poison Spore Card","type":"normal"},{"id":4052,"zh":"長老樹精卡片","en":"Elder Willow Card","type":"normal"},{"id":4074,"zh":"大腳熊卡片","en":"Bigfoot Card","type":"normal"},{"id":4098,"zh":"土人卡片","en":"Dokkaebi Card","type":"normal"},{"id":4159,"zh":"九尾狐卡片","en":"Nine Tail Card","type":"normal"},{"id":4283,"zh":"將軍魔碑卡片","en":"Greatest General Card","type":"normal"},{"id":4178,"zh":"刺尾蜻蜓卡片","en":"Dragon Tail Card","type":"normal"},{"id":4183,"zh":"遊蕩狼卡片","en":"Wandering Wolf Card","type":"mini"},{"id":4131,"zh":"月夜貓卡片","en":"Moonlight Flower Card","type":"boss"},{"id":4025,"zh":"邪骸戰士卡片","en":"Skeleton Card","type":"normal"},{"id":4094,"zh":"邪骸弓箭手卡片","en":"Archer Skeleton Card","type":"normal"},{"id":4086,"zh":"邪骸士兵卡片","en":"Soldier Skeleton Card","type":"normal"},{"id":4090,"zh":"殭屍卡片","en":"Munak Card","type":"normal"},{"id":4212,"zh":"妖道卡片","en":"Bongun Card","type":"normal"},{"id":4100,"zh":"鬼女卡片","en":"Sohee Card","type":"normal"},{"id":4103,"zh":"鬼火卡片","en":"Horong Card","type":"normal"},{"id":4221,"zh":"邪骸戰士長卡片","en":"Skeleton General Card","type":"mini"},{"id":4290,"zh":"狂暴月夜貓卡片","en":"Cat O' Nine Tails Card","type":"mini"},{"id":4328,"zh":"妖君卡片","en":"Yao Jun Card","type":"mini"}];
  const dropCardById=new Map(dropCardRoles.map(card=>[card.id,card]));
  const dropRoleName=name=>String(name||"").normalize("NFKC").toLowerCase().replace(/\s*[·・]\s*改\d*$/,"").trim();
  const dropCardByName=new Map(dropCardRoles.flatMap(card=>[card.zh,card.en].map(name=>[dropRoleName(name),card])));
  const runStageNames = {"prontera":"普隆德拉原野","sewer":"普隆德拉地下水道","sunken":"失事輪","byalan":"柏伊亞嵐島","payon":"斐揚森林","payon_cave":"斐揚洞穴","prt_castle":"普隆德拉城","orcs":"獸人村","pyramid":"夢羅克金字塔","maze":"迷宮森林","xmas":"聖誕節","louyang":"元宵燈會","c2_gef":"吉芬地下迷宮","c2_clock":"時計塔地下","c2_abyss":"深淵之湖","c2_glast":"克雷斯特漢姆修道院","c2_nif":"尼芙菲姆原野"};
  function dropRowMetadata(category,iconKey,name,stats,tier,rank,slot,ref,catalog) {
    const itemId=Number(iconKey?.match(/(?:^id:|\/)(\d+)(?:_art)?(?:\.[^/]+)?$/)?.[1]) || null;
    const card=category===1?(dropCardById.get(itemId%1000000)||dropCardByName.get(dropRoleName(name))):null;
    let storageSource=category===0?dropStorageSources.get(ref):null;
    if(category===0 && !storageSource && dropDispositions.get(ref)!=="賣出") {
      if(typeof matchesTargetStorage==="function" && matchesTargetStorage(iconKey,stats,tier,rank))storageSource="指定存倉";
      else if(!(typeof targetStorageRules!=="undefined" && targetStorageRules.has(itemId))) {
        const rawType=catalog?.["type:"+itemId];
        const type=inventoryGameWeaponTypes[rawType] || inventoryWeaponById.get(itemId) || (slot==="acc"?"accessory":slot==="weapon"?null:slot);
        if(matchingInventoryRule(stats||[],inventoryRules(inventorySettings()),tier,rank,type,bossStorageGearIds.has(itemId)))storageSource="裝備整理存倉";
      }
    }
    return {itemId,cardType:card?.type||null,storageSource:storageSource||null};
  }
  function createRunStatistics() {
    let active=null; const seen=new Set(),stages=new Map();
    const finish=completed=>{
      if(!active || seen.has(active.id))return;
      seen.add(active.id);if(seen.size>5000)seen.delete(seen.values().next().value);
      const key=active.stage+"|"+active.lap;
      const row=stages.get(key)||{stage:active.stage,lap:active.lap,completed:0,incomplete:0};
      row[completed?"completed":"incomplete"]++;stages.set(key,row);active=null;
    };
    return {
      reset(){active=null;seen.clear();stages.clear();},
      update(packet,settlement,inBattle,inLobby,worldBoss){
        if(worldBoss || (settlement && !active))return;
        if(inBattle && packet?.lootLog?.id && packet?.stageId && Math.abs(Date.now()-packet.at)<1500) {
          const id=packet.lootLog.id;
          if(!seen.has(id))active={id,stage:packet.stageLabel || packet.stageId,lap:Number.isInteger(packet.lap)?packet.lap:1};
        }
        if(settlement && active) {
          const title=settlement.querySelector("#go-title")?.textContent.normalize("NFKC").trim() || "";
          if(/你活下來|通關成功|You survived|Has sobrevivido|Você sobreviveu/i.test(title))finish(true);
          else if(/陣亡|死亡|已放棄|已結束|You died|Run abandoned|Run finished|Has muerto|Partida abandonada|Partida terminada|Você morreu/i.test(title))finish(false);
        } else if(inLobby && active)finish(false);
      },
      current(){return active?{...active}:null;},
      snapshot(){const rows=[...stages.values()].map(row=>({...row}));return {completed:rows.reduce((n,r)=>n+r.completed,0),incomplete:rows.reduce((n,r)=>n+r.incomplete,0),stages:rows};}
    };
  }
  const runStatistics=createRunStatistics();
  function createIntruderNotes() {
    let run=null;const counted=new Set(),totals=new Map();
    return {
      reset(){run=null;counted.clear();totals.clear();},
      update(packet,inBattle,worldBoss){
        if(!inBattle || worldBoss || !packet?.lootLog?.id || Math.abs(Date.now()-packet.at)>=1500)return;
        if(run!==packet.lootLog.id){run=packet.lootLog.id;counted.clear();}
        const farm=packet.bossFarm,id=farm?.intruderId;
        if(!id || counted.has(id))return;
        if(!(farm.bosses||[]).some(row=>row[0]===id) && !(farm.kills?.[id]>0))return;
        counted.add(id);totals.set(id,(totals.get(id)||0)+1);
      },
      snapshot(){return [...totals].map(([id,count])=>({id,count}));}
    };
  }
  const intruderNotes=createIntruderNotes();
  function buildSessionNotes(cards,gear,statistics,intruders,current) {
    const group=rows=>{const counts=new Map();for(const row of rows)counts.set(row[0],(counts.get(row[0])||0)+1);return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"zh-Hant"));};
    return {completed:statistics.completed,incomplete:statistics.incomplete,finished:statistics.completed+statistics.incomplete,active:current?1:0,
      boss:group(cards.filter(row=>row[9]?.cardType==="boss")),mini:group(cards.filter(row=>row[9]?.cardType==="mini")),
      specified:group(gear.filter(row=>row[7]===true)),intruders:intruders.map(row=>({...row})),
      intruderTotal:intruders.reduce((sum,row)=>sum+row.count,0)};
  }
  const sessionNotesWindow=document.createElement("section");
  sessionNotesWindow.id="ro-helper-session-notes";sessionNotesWindow.hidden=true;
  sessionNotesWindow.setAttribute("role","dialog");sessionNotesWindow.setAttribute("aria-label","本次掛機記事");
  sessionNotesWindow.style.cssText="position:fixed;right:12px;top:70px;z-index:2147483647;width:min(460px,calc(100vw - 24px));max-height:80vh;box-sizing:border-box;background:#f7f9ff;color:#173569;border:1px solid #839bd1;border-radius:8px;padding:12px";
  const sessionNotesBody=document.createElement("div"),sessionNotesFooter=document.createElement("div");
  sessionNotesBody.style.cssText="max-height:calc(80vh - 70px);overflow:auto;white-space:pre-line;overflow-wrap:anywhere";
  sessionNotesFooter.style.cssText="display:flex;justify-content:flex-end;gap:8px;padding-top:10px";
  const sessionNotesRefresh=document.createElement("button"),sessionNotesClose=document.createElement("button");
  sessionNotesRefresh.type=sessionNotesClose.type="button";sessionNotesRefresh.textContent="更新";sessionNotesClose.textContent="關閉";
  sessionNotesRefresh.onclick=()=>refreshSessionNotes();sessionNotesClose.onclick=()=>sessionNotesWindow.hidden=true;
  sessionNotesFooter.append(sessionNotesRefresh,sessionNotesClose);sessionNotesWindow.append(sessionNotesBody,sessionNotesFooter);document.body.append(sessionNotesWindow);
  function refreshSessionNotes() {
    const data=buildSessionNotes(collectLootRows(1),collectLootRows(0),runStatistics.snapshot(),intruderNotes.snapshot(),runStatistics.current());
    const count=rows=>rows.reduce((sum,[,n])=>sum+n,0),lines=["本次掛機記事","已結束 "+data.finished+" 場（通關 "+data.completed+"／中途退出或失敗 "+data.incomplete+"）；進行中 "+data.active+" 場"];
    const section=(title,rows)=>{lines.push("",title+"："+count(rows));for(const [name,n]of rows)lines.push("• "+name+" ×"+n);if(!rows.length)lines.push("尚無紀錄");};
    section("王卡（張）",data.boss);section("MINI 卡（張）",data.mini);
    lines.push("","遇到亂入王："+data.intruderTotal+" 次");
    for(const row of data.intruders){const entry=stageBosses.flatMap(([,bosses])=>bosses).find(boss=>boss[0]===row.id);lines.push("• "+(entry?.[1]||row.id)+" ×"+row.count);}
    section("符合指定存倉的裝備（件，依目前規則）",data.specified);
    lines.push("","統計本次助手啟動後記錄到的掉落；只計已取得物品。按更新或重新開啟時讀取最新資料。");
    sessionNotesBody.textContent=lines.join("\n");
  }


  function collectLootRows(category) {
    const runs = new Set([...lootHistory.keys(), ...revealedLoot.keys(), ...settledLoot.keys()]);
    const rows = [...runs].flatMap(run => {
      const sampled = lootHistory.get(run)?.[category] || [];
      const revealed = revealedLoot.get(run)?.[category] || [];
      const settled = settledLoot.get(run)?.groups[category] || [];
      if (settled.length > sampled.length && settled.length >= revealed.length) return settled;
      if (category === 0 && sampled.length === revealed.length &&
          !sampled.some(row => row[4]?.length) && revealed.some(row => row[4]?.length)) return revealed;
      return sampled.length >= revealed.length ? sampled : revealed;
    });
    let catalog;
    lastGearCatalog = document.documentElement.dataset.roHelperGearSlots;
    try { catalog = JSON.parse(lastGearCatalog || "null"); } catch {}
    return rows.map(([name,slot,rank,iconKey,stats,ref,tier]) => [
      ...localizeLoot(category,name,slot,rank,iconKey,catalog,stats),dropDispositions.get(ref),ref,
      category === 0 && matchesTargetStorage(iconKey,stats,tier,rank),
      lootSortPriority(category,iconKey,stats,tier,rank,slot,dropDispositions.get(ref),catalog),
      dropRowMetadata(category,iconKey,name,stats,tier,rank,slot,ref,catalog)
    ]);
  }
  function drawDropViewerQr(canvas, url) {
    const qr = qrcode(0,"M");
    qr.addData(url, "Byte");
    qr.make();
    const size = qr.getModuleCount();
    const scale = Math.max(2,Math.floor(240 / (size + 8)));
    canvas.width = canvas.height = (size + 8) * scale;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0,0,canvas.width,canvas.height);
    context.fillStyle = "#000";
    for (let row=0; row<size; row++) {
      for (let column=0; column<size; column++) {
        if (qr.isDark(row,column)) context.fillRect((column+4)*scale,(row+4)*scale,scale,scale);
      }
    }
  }
  const mobileDrops = document.createElement("button");
  mobileDrops.type = "button";
  mobileDrops.textContent = "手機查看掉落";
  mobileDrops.onclick = async () => {
    if (!ensureRuntime() || document.querySelector("#ro-helper-settings[open], #ro-helper-stage-dialog[open], #ro-helper-target-storage[open]")) return;
    const account = activeAccount;
    const request = (action, fields = {}) => Promise.resolve().then(() =>
      runtime.sendMessage({type:"pair-ro-drops",action,account,...fields}));
    const dialog = document.createElement("dialog");
    dialog.id = "ro-helper-settings";
    const panel = document.createElement("div");
    panel.style.cssText = "display:grid;gap:10px;padding:12px;min-width:min(340px,75vw)";
    const feedback = document.createElement("div");
    feedback.setAttribute("role","status");
    const joinKey = document.createElement("input");
    joinKey.placeholder = "貼上 A 助手的配對金鑰";
    joinKey.setAttribute("aria-label","配對金鑰");
    const address = document.createElement("input");
    address.placeholder = "選填手機可連線的 HTTPS 網址";
    address.setAttribute("aria-label","手機連線網址");
    const output = document.createElement("input");
    output.readOnly = true;
    output.setAttribute("aria-label","手機查看網址");
    const qrCanvas = document.createElement("canvas");
    qrCanvas.setAttribute("role","img");
    qrCanvas.setAttribute("aria-label","手機掉落查看網址 QR Code");
    qrCanvas.style.cssText = "max-width:100%;height:auto;justify-self:center;image-rendering:pixelated";
    qrCanvas.hidden = true;
    const makeButton = (text,fn) => {
      const control = document.createElement("button");
      control.type = "button";
      control.textContent = text;
      control.onclick = fn;
      return control;
    };
    let pending = false;
    const controlPassword = document.createElement("input");
    controlPassword.type = "password";
    controlPassword.placeholder = "網頁控制密碼（8～128 字元）";
    controlPassword.setAttribute("aria-label","網頁控制密碼");
    controlPassword.autocomplete = "new-password";
    const apply = async (action, fields) => {
      if (pending || activeAccount !== account) return;
      pending = true;
      try {
        const result = await request(action,fields);
        if (!result?.ok) throw Error(result?.error || "請確認掉落查看網站可以連線");
        if (action === "password") {
          controlPassword.value = "";
          feedback.textContent = "已儲存此配對的網頁控制密碼";
          return;
        }
        output.value = result.url || "";
        qrCanvas.hidden = true;
        qrButton.disabled = !output.value;
        qrButton.textContent = "產生 QR Code";
        if (result.key) joinKey.value = result.key;
        if (action === "leave") joinKey.value = "";
        address.value = result.address || "";
        feedback.textContent = action === "clear" ? "已清空此角色的網頁掉落" : result.url ? "已配對，進場後會同步掉落" : "尚未配對";
      } catch (error) {
        feedback.textContent = isInvalidatedRuntime(error) ? "請重新整理遊戲" : error.message;
      } finally { pending = false; }
    };
    const qrButton = makeButton("產生 QR Code",() => {
      if (!output.value) return;
      if (!qrCanvas.hidden) {
        qrCanvas.hidden = true;
        qrButton.textContent = "產生 QR Code";
        return;
      }
      try {
        drawDropViewerQr(qrCanvas,output.value);
        qrCanvas.hidden = false;
        qrButton.textContent = "收起 QR Code";
      } catch { feedback.textContent = "無法產生 QR Code，仍可複製查看網址"; }
    });
    qrButton.disabled = true;
    panel.append("手機查看掉落",
      makeButton("產生金鑰",() => apply("create",{address:address.value})),
      joinKey,makeButton("輸入金鑰",() => apply("join",{token:joinKey.value.trim()})),
      address,makeButton("更新查看網址",() => apply("address",{address:address.value})),
      output,makeButton("複製查看網址",async () => {
        if (!output.value) return;
        try { await navigator.clipboard.writeText(output.value); feedback.textContent = "已複製查看網址"; }
        catch { output.select(); feedback.textContent = "請複製已選取的網址"; }
      }),
      qrButton, qrCanvas,
      makeButton("清空此角色網頁掉落",() => {
        const id = readSetting("ro-helper-last-drop-character");
        if (!id) { feedback.textContent = "這個帳號還沒有同步過角色"; return; }
        if (confirm("清空此角色的網頁掉落？同頁其他角色的紀錄會保留。")) void apply("clear",{id});
      }),
      controlPassword,makeButton("儲存網頁控制密碼",() => {
        const password = controlPassword.value;
        if (password.length < 8 || password.length > 128 || !password.trim()) {
          feedback.textContent = "請輸入 8～128 字元的密碼";
          return;
        }
        void apply("password",{password});
      }),
      makeButton("取消配對",() => apply("leave")),feedback,
      makeButton("關閉",() => dialog.close()));
    dialog.append(panel);
    dialog.onclose = () => dialog.remove();
    document.body.append(dialog);
    dialog.showModal();
    await apply("read");
  };
  function syncMobileDrops(identity, rows, session, control, runStats) {
    const storageKey = "ro-helper-drop-character-" + identity.label;
    let id = readSetting(storageKey);
    if (!id) {
      id = crypto.randomUUID();
      writeSetting(storageKey,id);
    }
    const account = activeAccount;
    return Promise.resolve().then(() => runtime.sendMessage({
      type:"sync-ro-drops", account, data:{id,...identity,rows,session,control,runStats}
    })).then(result => {
      if (result?.ok && activeAccount === account) writeSetting("ro-helper-last-drop-character",id);
      return result;
    });
  }
  function refreshLootWindow() {
    if (lootWindow.hidden) return;
    const category = lootCategoryIndex;
    const hasLoot = lootHistory.size || revealedLoot.size || settledLoot.size;
    const categorized = collectLootRows(category);
    const selected = lootSelectedSlots[category];
    const filtered = categorized.filter(row =>
      (selected === "all" || lootFilterSlot(category,row[1]) === selected) && matchesLootSearch(row,lootSearch.value));
    const counts = new Map();
    for (const row of filtered) {
      const key = JSON.stringify([...row.slice(0,6),row[7],row[8]]);
      counts.set(key,(counts.get(key) || 0)+1);
    }
    const entries = [...counts].map(([key,count]) => ({item:JSON.parse(key),count}))
      .sort((a,b) => (b.item[7] || 0)-(a.item[7] || 0) || b.item[2]-a.item[2] || a.item[0].localeCompare(b.item[0],"zh-Hant"));
    const tiers = ["普通","優良","稀有","史詩（紫）","傳說（金）","神話"];
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.style.padding = "12px";
      empty.textContent = hasLoot ? (lootSearch.value.trim() ? "找不到符合搜尋的掉落" : "目前沒有符合的掉落") : "等待本次掛機取得掉落物";
      lootRows.replaceChildren(empty);
      return;
    }
    const table = document.createElement("table");
    table.style.cssText = "width:100%;border-spacing:0;text-align:left;color:#172c55";
    const heading = document.createElement("thead");
    const labels = document.createElement("tr");
    const columns = [["裝備","部位","稀有度","素質","數量","處理"],["卡片","部位","效果","數量"],["寵物","數量"]][category];
    for (const column of columns) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = column;
      cell.style.cssText = "position:sticky;top:0;background:#e8eef9;padding:7px 8px;border-bottom:1px solid #ccd8ed;white-space:nowrap";
      labels.append(cell);
    }
    heading.append(labels);
    const body = document.createElement("tbody");
    entries.forEach(({item:[name,slot,rank,effects,english,disposition,targetMatch],count},index) => {
      const row = document.createElement("tr");
      row.style.background = index % 2 ? "#f7f9fd" : "#fff";
      const values = [name];
      if (category !== 2) values.push(slotLabels[slot] || slot || "未辨識部位",
        category === 0 ? tiers[rank] || "階級 " + rank : effects?.join("\n") || "—");
      if (category === 0) values.push(effects?.join("\n") || "—");
      values.push(String(count));
      if (category === 0) values.push(disposition || "—");
      values.forEach((value,column) => {
        const cell = document.createElement("td");
        cell.style.cssText = "vertical-align:top;padding:7px 8px;border-bottom:1px solid #e1e8f4;white-space:pre-line;overflow-wrap:anywhere";
        cell.textContent = value;
        if (column === 0) {
          cell.style.color = "#214c9b";
          if (targetMatch) {
            const marker = document.createElement("small");
            marker.style.cssText = "display:block;color:#236344;font-weight:bold";
            marker.textContent = "符合指定存倉";
            cell.append(marker);
          }
          if (english && english !== name) {
            const original = document.createElement("div");
            original.style.cssText = "font-size:12px;color:#536789;margin-top:2px";
            original.textContent = english;
            cell.append(original);
          }
        }
        row.append(cell);
      });
      body.append(row);
    });
    table.append(heading,body);
    lootRows.replaceChildren(table);
  }
  function trackLoot(snapshot) {
    if (!snapshot?.id || !Array.isArray(snapshot.groups)) return;
    if(lootSignature && snapshot===lastTrackedLootSnapshot)return;
    lastTrackedLootSnapshot=snapshot;
    const signature = JSON.stringify(snapshot);
    if (signature === lootSignature) return;
    lootSignature = signature;
    const offset = lootBaseline?.id === snapshot.id ? lootBaseline.counts : [];
    lootHistory.set(snapshot.id,snapshot.groups.map((rows,i) => rows.slice(offset[i] || 0)));
    refreshLootWindow();
  }
  lootButton.addEventListener("click", () => {
    lootWindow.hidden = false;
    const {left,top} = lootWindow.getBoundingClientRect();
    moveLootWindow(left,top);
    refreshLootWindow();
  });
  lootClose.addEventListener("click", () => { lootWindow.hidden = true; });
  refreshLootFilters();


  const timerDisplay = document.createElement("div");
  timerDisplay.style.cssText = "padding:5px 2px 0;white-space:pre-line;font-variant-numeric:tabular-nums";
  function formatElapsed(seconds) {
    if (!Number.isFinite(seconds)) return "—";
    const total = Math.floor(Math.max(0, seconds));
    return [Math.floor(total / 60), total % 60].map(value => String(value).padStart(2, "0")).join(":");
  }
  let cachedLiveText,cachedLivePacket,cachedLootText,cachedLootSnapshot;
  function readLivePacket() {
    try {
      const root=document.documentElement.dataset,raw=root.roHelperLive||"null";
      if(raw!==cachedLiveText){cachedLivePacket=JSON.parse(raw);cachedLiveText=raw;}
      const packet=cachedLivePacket;
      if(packet?.lootRunId){
        const loot=root.roHelperLootSnapshot||"null";
        if(loot!==cachedLootText){cachedLootSnapshot=JSON.parse(loot);cachedLootText=loot;}
        if(cachedLootSnapshot?.id===packet.lootRunId)packet.lootLog=cachedLootSnapshot;
        else delete packet.lootLog;
      }
      return packet;
    } catch {return null;}
  }
  function readSettledBaseExp(settlement) {
    const text = settlement?.querySelector(".go-exp")?.textContent.normalize("NFKC") || "";
    const match = text.match(/(?:Base\s*(?:EXP|經驗(?:值)?)|(?:EXP|經驗(?:值)?)\s*(?:de\s+)?Base|基礎經驗(?:值)?)\s*:\s*\+\s*([\d,. \u00a0\u202f]+)/i);
    return match ? Number(match[1].replace(/[^\d]/g,"")) : null;
  }
  function formatBaseRate(value) {
    const amount = Math.floor(Math.max(0,value));
    if (amount < 1000) return String(amount);
    const [unit,scale] = amount >= 1e9 ? ["b",1e9] : amount >= 1e6 ? ["m",1e6] : ["k",1e3];
    const tenths = Math.floor(amount / (scale / 10));
    return Math.floor(tenths / 10) + unit + (tenths % 10 || "");
  }
  const roundTimerText = document.createTextNode("");
  const roundDiscoveryText = document.createElement("span");
  const sessionTimerText = document.createTextNode("");
  const gameTimerText = document.createTextNode("");
  roundDiscoveryText.hidden = true;
  timerDisplay.append(roundTimerText,roundDiscoveryText,gameTimerText,sessionTimerText);
  const formatDiscoveryBonus = bonus => Number.isFinite(bonus) ? "+" + Number((bonus * 100).toFixed(1)) + "%" : "—";
  function readInGameSeconds(packet,hud,active) {
    if(!active)return undefined;
    if(Number.isFinite(packet?.battleSeconds) && packet.battleSeconds>=0 && Math.abs(Date.now()-packet.at)<1500)return packet.battleSeconds;
    const text=hud?.querySelector("#timer:not(.hidden):not(.mvp):not(.loot)")?.textContent.trim();
    const match=text?.match(/^(\d+):(\d{2})$/);
    return match?Number(match[1])*60+Number(match[2]):undefined;
  }
  function showTimers(startedAt, battleSeconds, totalBaseExp = 0, discoveryBonus, inGameSeconds) {
    const elapsed = startedAt === null ? 0 : (performance.now() - startedAt) / 1000;
    const rate = elapsed > 0 ? formatBaseRate(totalBaseExp * 60 / elapsed) : "—";
    const round = "本局時間 " + formatElapsed(battleSeconds);
    const discovery = " · 本局尋寶率 " + formatDiscoveryBonus(discoveryBonus);
    const session = "\n本次啟動時間 " + (startedAt === null ? "—" : formatElapsed(elapsed) + " · Base/分 " + rate);
    const game="\n局內時間 "+formatElapsed(inGameSeconds);
    if(gameTimerText.data!==game)gameTimerText.data=game;
    if (roundTimerText.data !== round) roundTimerText.data = round;
    if (roundDiscoveryText.textContent !== discovery) roundDiscoveryText.textContent = discovery;
    if (sessionTimerText.data !== session) sessionTimerText.data = session;
  }
  showTimers(null);
  const ensureRuntime = () => {
    if (!runtimeInvalidated) {
      try { if (runtime?.id) return true; }
      catch (error) { if (!isInvalidatedRuntime(error)) throw error; }
    }
    runtimeInvalidated = true;
    rememberRefresh();
    window.__roMenuHelper?.stop(true);
    refreshGpuSaver(false);
    status.textContent = "擴充功能已重新載入，請重新整理遊戲頁面";
    button.disabled = true;
    share.disabled = true;
    return false;
  };
  let refreshRecovery;
  const toggle = (resuming = false) => {
    if (refreshRecovery && !resuming) {
      refreshRecovery = null;
      clearRefreshCheckpoint();
      status.textContent = "已取消刷新後接續，請進入角色後啟動助手";
      return;
    }
    if (!ensureRuntime()) return;
    if (window.__roMenuHelper) {
      window.__roMenuHelper.stop();
      return;
    }
    try {
      (()=>{if(!["ro-survivors.com","www.ro-survivors.com","ro.hans-webgametw.com"].includes(location.hostname))return;const key="__roMenuHelper";let stageName="", rotation={stage:undefined,completed:0}, rotationRun;const rejectedStages=new Set();let highestLap = "1";let lapTabRefreshed = false;const unavailableLaps = new Set();const visible=e=>e&&e.getClientRects().length&&!e.disabled&&getComputedStyle(e).visibility==="visible"&&!e.closest("[hidden],[inert],[aria-hidden=true]");const label=e=>e.innerText.trim();const buttons=()=>[...document.querySelectorAll("button,[role=button]")].filter(visible);const click=e=>{last=e;e.click()};let pickerFirstCard=null,pickerReadyAt=0,attemptedCard=null,attempts=0;const blocked=new Map();const trackPickup=createPickupTracker();let previousPosition=null,previousDirection=null,still=0,escapeDirection=-1,escapeUntil=0;let retriedCoordinates=false;let movePulse,nextMenuAt=0,nextCaptureAt=0,lastCoordinateAt=0;let last,held,index=0,departing=false,retriedSoloDialog=false;const route=["d","s","a","w","wd","sd","sa","wa"];const probe=document.createElement("canvas");probe.width=probe.height=128;const ctx=probe.getContext("2d",{willReadFrequently:true});const directions=[[1,0],[0,1],[-1,0],[0,-1]];let captureStatus="正在等候分頁截圖",screenshot=null,requested=false,stamp=0,previousFrame=null;const assess=()=>{const canvas=[...document.querySelectorAll("canvas")].filter(visible).sort((a,b)=>b.width*b.height-a.width*a.height)[0];if((!canvas&&!sharedVideo)||!ctx)return null;try{ctx.clearRect(0,0,128,128);if(sharedVideo?.readyState>=2){const r=canvas?.getBoundingClientRect()||{left:0,top:0,width:innerWidth,height:innerHeight},sx=sharedVideo.videoWidth/innerWidth,sy=sharedVideo.videoHeight/innerHeight;ctx.drawImage(sharedVideo,r.left*sx,r.top*sy,r.width*sx,r.height*sy,0,0,128,128)}else if(screenshot&&Date.now()-stamp<1600){const r=canvas.getBoundingClientRect(),sx=screenshot.width/innerWidth,sy=screenshot.height/innerHeight;ctx.drawImage(screenshot,r.left*sx,r.top*sy,r.width*sx,r.height*sy,0,0,128,128)}else{ctx.drawImage(canvas,0,0,128,128)}const data=ctx.getImageData(0,0,128,128).data;let content=0;const red=(x,y)=>{const i=(128*y+x)*4;return data[i+3]>150&&data[i]>95&&data[i]>1.45*data[i+1]&&data[i]>1.32*data[i+2]};for(let i=0;i<data.length;i+=64)if(data[i+3]>150&&data[i]+data[i+1]+data[i+2]>45)content++;if(content<60)return null;const prior=previousFrame;previousFrame=data;let shiftX=0,shiftY=0,alignment=Infinity;if(prior){for(let dy=-16;dy<=16;dy+=2)for(let dx=-16;dx<=16;dx+=2){let error=0;for(let y=24;y<104;y+=8)for(let x=24;x<104;x+=8){if(x>48&&x<80&&y>48&&y<80)continue;const i=(128*y+x)*4,j=(128*(y+dy)+x+dx)*4;error+=Math.abs(data[i]-prior[j])+Math.abs(data[i+1]-prior[j+1])+Math.abs(data[i+2]-prior[j+2])}if(error<alignment){alignment=error;shiftX=dx;shiftY=dy}}}const moving=(x,y)=>{if(!prior||alignment>3600)return false;const i=(128*y+x)*4,j=(128*(y+shiftY)+x+shiftX)*4;return Math.abs(data[i]-prior[j])+Math.abs(data[i+1]-prior[j+1])+Math.abs(data[i+2]-prior[j+2])>85};return directions.map(([dx,dy])=>{let score=0;for(let step=4;step<=22;step++)for(let side=-5;side<=5;side++){{const x=64+dx*step-dy*side,y=64+dy*step+dx*side;if(red(x,y))score+=12;else if(moving(x,y))score+=step<=12?3:1}}let nearMotion=0,nearRed=0;for(let step=8;step<=16;step++)for(let side=-4;side<=4;side++){const x=64+dx*step-dy*side,y=64+dy*step+dx*side;if(red(x,y))nearRed++;else if(moving(x,y))nearMotion++}const uncertain=!prior||alignment>3600;const unsafe=nearRed>=4||(!uncertain&&nearMotion>=12);let chest=0,loot=0;for(let step=7;step<=22;step++)for(let side=-6;side<=6;side++){const x=64+dx*step-dy*side,y=64+dy*step+dx*side,i=(128*y+x)*4;const r=data[i],g=data[i+1],b=data[i+2],w=23-step;if(r>75&&g>55&&r>g*1.06&&r<g*1.7&&g>b*1.32){const j=i-1024;if(data[j]>data[j+1]*1.12&&data[j+1]>data[j+2]*1.15)chest+=w;else loot+=w}else if(b>70&&b>r*1.24&&b>g*1.12&&data[i+6]<b*0.9)loot+=w}return {score,chest,loot,unsafe,uncertain}})}catch{return null}};const send=(type,k)=>(document.activeElement||document.body).dispatchEvent(new KeyboardEvent(type,{key:k,code:"Key"+k.toUpperCase(),bubbles:true,cancelable:true,keyCode:k.toUpperCase().charCodeAt(0),which:k.toUpperCase().charCodeAt(0)}));const release=()=>{if(held){for(const key of held)send("keyup",key);held=null}};const confirmDrop=createDropConfirmation();const acceptedFinalDialogs=new WeakSet();const confirmedParty=new WeakSet();let returnedResult;let bossLootEmptySince;let settlementSeenAt = 0;const usedRerolls=new WeakSet();const usedFocus=new WeakSet();const discoveryFocused=new Set();const usedBanish=new WeakSet();const startedAt = performance.now();
let battleStartedAt = null;
inventoryRun = undefined;
lootHistory.clear();
    runStatistics.reset();
    intruderNotes.reset();sessionNotesWindow.hidden=true;
    dropRefByUid.clear();
    dropDispositions.clear();
    dropStorageSources.clear();
revealedLoot.clear();
    settledLoot.clear();
seenLootReveals = new WeakSet();
currentLootRun = null;
fallbackLootRun = 0;
lootBattleActive = false;
lootSignature = "";
const initialLoot = readLivePacket();
lootBaseline = initialLoot && Math.abs(Date.now() - initialLoot.at) < 750 && initialLoot.lootLog
  ? {id:initialLoot.lootLog.id,counts:initialLoot.lootLog.groups.map(rows => rows.length)} : null;
refreshLootWindow();
const dropSession = crypto.randomUUID();
let dropIdentity;
let nextDropUpload = 0;
let dropUploadPending = false;
let appliedStageCommand;
let pendingStageCommand;
let settledBaseExp = 0;
let liveBaseExp = 0;
let countedBaseSettlement = Boolean(document.querySelector("#gameover:not(.hidden)"));
showTimers(startedAt);
let hansHighDifficultyUntil = 0;
const levelCardStop = createLevelCardStop();
const resumePausedBattle = createPausedBattleResume();
window.addEventListener("pagehide",levelCardStop.reset);
const timer=setInterval(()=>{try {
  if (cardSwapBusy || cardSwapDialog?.open || recycleReading || recycleDialog?.open || cardRecycleActive || upgradeActive || document.getElementById("ro-helper-upgrade-settings")?.open || document.getElementById("ro-helper-transfer-settings")?.open) { release(); return; }
  if (handleRefreshDialog()) { release(); return; }
  if (readingGsAdvice) { release(); return; }
  if (Date.now() < hansHighDifficultyUntil) {
    const enter = hansHighDifficultyEnterButton();
    if (enter) {
      hansHighDifficultyUntil = 0;
      release();
      status.textContent = "已確認高難度提醒，正在入場";
      enter.click();
      return;
    }
  }
  if (!ensureRuntime()) return;
  if(!document.body.classList.contains('in-lobby')&&cardSwapTransition?.state==='done')cardSwapTransition=null;
  const battleHud = document.querySelector("#hud:not(.hidden)");
  if (document.body.classList.contains("in-lobby") || document.querySelector("#gameover:not(.hidden)")) levelCardStop.endRound();
  else if (inBattleReadyForBank(battleHud,document.querySelector("#picker:not(.hidden)"))) levelCardStop.beginRound();
  applyExpeditionSpeed(battleHud);
  const hudName = battleHud?.querySelector?.("#hud-name");
  const characterName = hudName?.querySelector("span")?.textContent.trim();
  const job = hudName?.querySelector("small")?.textContent.trim();
  const inLobby = document.body.classList.contains("in-lobby");
  if (!inLobby || battleHud) readDropLevelOnReturn = true;
  const lobbyCharacter = inLobby && !battleHud && readDropLevelOnReturn ? readLobbyDropCharacter() : null;
  if (lobbyCharacter) readDropLevelOnReturn = false;
  const dropName = lobbyCharacter?.label || characterName;
  const dropJob = lobbyCharacter?.job || job;
  if (dropName && dropJob) {
    if (dropIdentity?.account === activeAccount && dropIdentity.label !== dropName) {
      lootHistory.clear();
    runStatistics.reset();
    intruderNotes.reset();sessionNotesWindow.hidden=true;
    dropRefByUid.clear();
    dropDispositions.clear();
    dropStorageSources.clear();
      revealedLoot.clear();
      settledLoot.clear();
      lootBaseline = null;
      lootSignature = "";
      refreshLootWindow();
    }
    const baseLevel = lobbyCharacter?.baseLevel ?? (dropIdentity?.account === activeAccount && dropIdentity.label === dropName ? dropIdentity.baseLevel : undefined);
    dropIdentity = {label:dropName,job:dropJob,baseLevel,realm:difficultyEdition,account:activeAccount};
  }
  if (pendingStageCommand && (pendingStageCommand.account !== activeAccount ||
      pendingStageCommand.label !== dropIdentity?.label)) pendingStageCommand = undefined;
  if (pendingStageCommand && !battleHud && document.body.classList.contains("in-lobby") &&
      !document.querySelector("#npc-dialog:not(.hidden), #gameover:not(.hidden)")) {
    const {id,config} = pendingStageCommand;
    if (validatedStageConfig(config,remoteStageControl(appliedStageCommand))) {
      applyRemoteStageConfig(config);
      appliedStageCommand = id;
      rotation = {stage:undefined,completed:0};
      rejectedStages.clear();
      status.textContent = "已套用網頁遠征設定";
    }
    pendingStageCommand = undefined;
  }
  const lootPacket = readLivePacket();
  ensureLootCoordinateConnection(lootPacket,Boolean(battleHud) && !inLobby && !document.querySelector("#gameover:not(.hidden)"));
  if (taiwanGame && (!battleHud || stageMode.value !== "boss")) {
    bossLootEmptySince = undefined;
    delete document.documentElement.dataset.roHelperBossCleanup;
  }
  const settlement = document.querySelector("#gameover:not(.hidden)");
  runStatistics.update(lootPacket?{...lootPacket,stageLabel:runStageNames[lootPacket.stageId]||lootPacket.stageId}:null,settlement,Boolean(battleHud)&&!document.body.classList.contains("in-lobby"),document.body.classList.contains("in-lobby"),worldBossActive());
  intruderNotes.update(lootPacket,Boolean(battleHud)&&!inLobby&&!settlement,worldBossActive());
  if (!settlement) countedBaseSettlement = false;
  else if (!countedBaseSettlement) {
    const baseExp = readSettledBaseExp(settlement);
    if (Number.isFinite(baseExp)) {
      settledBaseExp += baseExp;
      countedBaseSettlement = true;
    }
  }
  const battleEnded = settlement || document.body.classList?.contains("in-lobby");
  if (battleEnded) discoveryFocused.clear();
  const choosingCard = battleStartedAt !== null && document.querySelector("#picker:not(.hidden)");
  if (battleEnded || (!battleHud && !choosingCard)) liveBaseExp = 0;
  else if (Number.isFinite(lootPacket?.runBaseExp) && Math.abs(Date.now() - lootPacket.at) < 750) {
    liveBaseExp = lootPacket.runBaseExp;
  }
  if (battleEnded && !settlement) lootBattleActive = false;
  if (battleHud && !battleEnded && !lootBattleActive) {
    currentLootRun = "reveal-" + ++fallbackLootRun;
    lootBattleActive = true;
  }
  if ((lootBattleActive || (settlement && currentLootRun)) && lootPacket?.lootLog && Math.abs(Date.now() - lootPacket.at) < 750 &&
      (!settlement || currentLootRun.startsWith("reveal-") || currentLootRun === lootPacket.lootLog.id)) {
    const snapshot = lootPacket.lootLog;
    if (currentLootRun?.startsWith("reveal-")) {
      const reveals = revealedLoot.get(currentLootRun);
      if (reveals) {
        revealedLoot.set(snapshot.id,reveals);
        revealedLoot.delete(currentLootRun);
      }
    }
    currentLootRun = snapshot.id;
    trackLoot(snapshot);
  }
  readGameCardDetail();
  if (lootBattleActive && currentLootRun) recordLootReveal(currentLootRun);
  if (!taiwanGame && settlement) {
    currentLootRun ??= "reveal-" + ++fallbackLootRun;
    trackSettlementLoot(settlement,currentLootRun);
  }
  if (settlement) lootBattleActive = false;
  if (handleRaidExpedition()) { release(); return; }
  if (raidWaiting && document.body.classList.contains("in-lobby")) {
    if(!runInventoryCleanup())status.textContent=raidWaitingText;
    release();return;
  }
  if (raidActive() && automationMode!=="raid") {release();status.textContent="副本中，請按遠征啟動副本掛機";return;}
  if (automationMode==="raid" && !raidActive() && document.body.classList.contains("in-lobby")) {
    if(!runInventoryCleanup())status.textContent="遠征模式：等待所選副本與隊伍";
    release();return;
  }
  if(automationMode==='normal'&&!raidActive()&&document.body.classList.contains('in-lobby')&&handleCardSwapMode('normal')){release();return;}
  if (automationMode==="normal" && !raidWaiting && handleWorldBoss()) { release(); return; }
  if (!raidActive() && (handleLobbySelection() || runCharacterGrowth() || runInventoryCleanup())) {
    release();
    return;
  }
  if(resumePausedBattle()){release();return;}

  if (dropIdentity?.account === activeAccount && !dropUploadPending && Date.now() >= nextDropUpload) {
    nextDropUpload = Date.now() + 5000;
    {
      const {account, ...identity} = dropIdentity;
      const rows = ["裝備","卡片","寵物"].flatMap((category,index) => {
        const counts = new Map();
        for (const [name,slot,rank,effects,,disposition,ref,,priority,meta] of collectLootRows(index)) {
          const rarity=index===0&&Number.isInteger(rank)&&rank>=0&&rank<=5?rank:null;
          const key=JSON.stringify([name,rarity,effects??[],disposition,ref,slot,priority,meta]);
          counts.set(key,(counts.get(key)||0)+1);
        }
        return [...counts].map(([key,count])=>{
          const [name,rarity,stats,disposition,ref,slot,priority,meta]=JSON.parse(key);
          return {category,name,count,rarity,stats,disposition,ref,slot,priority,...meta};
        });
      });
      const control = remoteStageControl(appliedStageCommand,pendingStageCommand?.id);
      const helper = window.__roMenuHelper;
      dropUploadPending = true;
      void syncMobileDrops(identity,rows,dropSession,control,runStatistics.snapshot()).then(result => {
        if (helper !== window.__roMenuHelper || account !== activeAccount || dropIdentity?.label !== identity.label) return;
        if (result?.ok) {
          const command = result.command;
          if (command?.session === dropSession && command.id !== appliedStageCommand && command.expiresAt > Date.now()) {
            const config = validatedStageConfig(command.config ?? command,control);
            if (config) pendingStageCommand = {id:command.id,config,account,label:identity.label};
          }
        }
        else if (!result?.disabled) status.textContent = result?.error || "掉落同步失敗，請確認網路與配對設定";
      }).catch(error => {
        if (!isInvalidatedRuntime(error)) status.textContent = "掉落同步連線失敗";
      }).finally(() => { dropUploadPending = false; });
    }
  }
  if (!lootWindow.hidden && lastGearCatalog !== document.documentElement.dataset.roHelperGearSlots) refreshLootWindow();
  const now = performance.now();
  if (settlement || (!battleHud && !choosingCard)) {
    battleStartedAt = null;
  } else if (battleStartedAt === null) {
    const packet = readLivePacket();
    const gameTimer = battleHud?.querySelector("#timer:not(.hidden):not(.mvp):not(.loot)");
    const match = gameTimer?.textContent.trim().match(/^(\d+):(\d{2})$/);
    const elapsed = Number.isFinite(packet?.battleSeconds) && Math.abs(Date.now() - packet.at) < 750
      ? packet.battleSeconds : match ? Number(match[1]) * 60 + Number(match[2]) : 0;
    battleStartedAt = now - elapsed * 1000;
  }
  updateTimedMagnet(lootPacket,Boolean(battleHud || choosingCard) && !battleEnded);
  const discoveryBonus = !battleEnded && (battleHud || choosingCard) && Math.abs(Date.now() - lootPacket?.at) < 750
    ? lootPacket.discoveryBonus : null;
  showTimers(startedAt, battleStartedAt === null ? undefined : (now - battleStartedAt) / 1000, settledBaseExp + liveBaseExp, discoveryBonus, readInGameSeconds(lootPacket,battleHud,!battleEnded && Boolean(battleHud || choosingCard)));
  const dataset = document.documentElement.dataset;
  const discoveryMode = chestMode.value === "discovery";
  dataset.roHelperSkipChest = chestMode.value === "pass" || chestMode.value === "avoid" ? "on" : "off";
  if (discoveryMode) {
    dataset.roHelperChestDiscovery = chestDiscoveryThreshold.value || "300";
    chestDiscoveryStatus.textContent = "目前 " + formatDiscoveryBonus(discoveryBonus);
  } else {
    delete dataset.roHelperChestDiscovery;
  }
  if(document.hidden||document.querySelector("#ro-helper-settings[open], #ro-helper-stage-dialog[open], #ro-helper-target-storage[open]")){release();return}if (taiwanGame) {
    const completion = finalStageDialogButton();
    if (completion) {
      release();
      if (!acceptedFinalDialogs.has(completion) && !completion.disabled) {
        acceptedFinalDialogs.add(completion);
        status.textContent = "已確認未完待續，正在結算";
        completion.click();
      }
      return;
    }
  }
  if(confirmDrop()){release();return}
  if (taiwanGame && stageMode.value === "boss" && !raidActive() && battleHud && lootPacket?.bossFarm && Math.abs(Date.now()-lootPacket.at)<750) {
    const farm = lootPacket.bossFarm;
    const target = bossTarget.value;
    const defeated = target && farm.kills[target] > 0;
    if (farm.solo && defeated) {
      document.documentElement.dataset.roHelperBossCleanup = "on";
      delete document.documentElement.dataset.roHelperFinishVictory;
      if (!Array.isArray(farm.gear) || farm.gear.length) bossLootEmptySince = undefined;
      else bossLootEmptySince ??= lootPacket.battleSeconds;
      const endRun = document.getElementById("btn-endrun");
      if (farm.playing && !lootPacket.finalBoss && manualMagnetCleanupReady(lootPacket) && bossLootEmptySince !== undefined &&
          lootPacket.battleSeconds - bossLootEmptySince >= 1 && endRun && !endRun.disabled) {
        release();
        status.textContent = "已擊敗 " + target + "，正在結算並重刷";
        endRun.click();
        return;
      }
    }
  }if(partyMode.value==="member"||partyMode.value==="follow"){const ready=partyReadyButton();if(ready){release();if(!confirmedParty.has(ready)){confirmedParty.add(ready);ready.click();status.textContent="已同意隊伍出發"}return}}const list=buttons();const byId=id=>list.find(e=>e.id===id);const exact=t=>list.find(e=>label(e)===t);const result=byId("btn-restart");if(!result){returnedResult=undefined;settlementSeenAt=0;}const go=byId("stg-go");const partyLeader=partyMode.value==="leader";const followLeader=!worldBossActive()&&partyMode.value==="follow";const partyMember=partyMode.value==="member"||followLeader;const difficultyDialog = expeditionDifficultyDialog();
const proposal = partyLeader ? partyProposalButton(difficultyDialog, visible) : null;
const field = proposal || (difficultyDialog && list.find(button => button === difficultyDialog.querySelector("#npc-options button.primary")));
if (partyLeader && difficultyDialog && !proposal) {
  release();
  const isPartyDialog = difficultyDialog.querySelector("#npc-text .diff input[data-pick]");
  const cancel = difficultyDialog.querySelector("#npc-options button:not(.primary)");
  const inParty = visible(document.querySelector(".pf-leave[data-leave]"));
  if (!isPartyDialog && inParty && !retriedSoloDialog && visible(cancel)) {
    retriedSoloDialog = true;
    departing = false;
    status.textContent = "隊長模式：關閉單人難度視窗，重新選關";
    click(cancel);
  } else {
    status.textContent = isPartyDialog ? "隊長模式：等待隊伍出發按鈕可用" :
      inParty ? "隊長模式：遊戲仍開啟單人難度，請確認隊長身分後重開遠征選單" :
        "隊長模式：遊戲尚未顯示已加入隊伍";
  }
  return;
}
if(field){release();if(partyMember||partyLeader&&!proposal)return;if(last===field)return;
if (taiwanGame) {
  const selectedLap = lapLabels[Number(stageMode.value === "highest" ? highestLap : expeditionLap.value)-1];
  const lapInfo = difficultyDialog.querySelector(".lap-info")?.textContent || "";
  const secondChapter = ["吉芬地下迷宮","時計塔地下","深淵之湖","克雷斯特漢姆修道院","尼芙菲姆原野"].includes(fixedStage.value) || document.querySelector('#ch-tabs [data-chtab="2"].primary');
  if (secondChapter ? !lapInfo.includes("第二章"+selectedLap) : (selectedLap === "一周目" ? !!lapInfo : !lapInfo.includes("（"+selectedLap+"）"))) {
    status.textContent = "出發周目與助手設定不符，請取消後重新開啟遠征";
    return;
  }
}
readDifficultyLimits(difficultyDialog);const savedDifficulty=taiwanGame ? null : getDifficulty(proposal?"party":"solo");
const bankChoice=!taiwanGame&&difficultyDialog.querySelector("#npc-text .diff [data-bank]");if(bankChoice&&!selectImmediateLevelUps(difficultyDialog)){status.textContent="等待選擇立即升級";return}const seasonal=bankChoice&&!difficultyDialog.querySelector("#npc-text .diff input[data-key]");const difficultyError=seasonal?"":taiwanGame?applyHansDepartureDifficulty(difficultyDialog):applyDifficulty(difficultyDialog,savedDifficulty);if(difficultyError){status.textContent=difficultyError;return}if(proposal){retriedSoloDialog=false;partyWaitingUntil=Date.now()+30000;status.textContent="已發起隊伍出發，等待隊員確認"}else status.textContent=seasonal?"燈籠節：立即升級，正在進場":savedDifficulty?"已套用助手的難度設定，正在進場":taiwanGame?"已套用漢斯出發難度，正在進場":"使用遊戲目前的難度，正在進場";if(taiwanGame) hansHighDifficultyUntil=Date.now()+30000;click(field);return}const captain=byId("lobby-prompt");const stageCards=[...document.querySelectorAll("#stg-list .stg-card")].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility==="visible"&&!e.closest("[hidden],[inert],[aria-hidden=true]"));
const selectedStages = rotationStages();
const repeats = repeatCount(stageRepeats.value);
if (!selectedStages.includes(rotation.stage)) rotation = {stage: selectedStages[0], completed: 0};
if (!stageCards.length) lapTabRefreshed = false;
if (stageCards.length && !partyMember && (!taiwanGame || lapTabRefreshed ||
    !visible(document.querySelector("#lap-tabs [data-laptab].primary")))) {
  const activeLap = taiwanGame ?
    document.querySelector("#lap-tabs [data-laptab].primary")?.dataset.laptab || "1" : "1";
  const key = seenStageKey(activeLap);
  const available = stageNamesForLap(activeLap);
  const found = stageCards.map(card => baseExpeditionName(stageNameOf(card))).filter(name =>
    name && !available.includes(name) && stageMatchesLap(name,activeLap));
  if (found.length) {
    writeSetting(key,JSON.stringify([...new Set([...readNames(key),...found])]));
    refreshStageChoices();
    refreshBossOptions();
    refreshStageDropPreview();
  }
}
stageName = stageMode.value === "highest" ? highestStageMode :
  stageMode.value === "rotation" ? rotation.stage || "" : fixedStage.value;
if (stageMode.value === "rotation") {
  rotationProgress.textContent = rotation.stage
    ? rotation.stage + " · 已完成 " + rotation.completed + " / " + repeats
    : "請勾選循環關卡";
}
if (!stageCards.length || stageMode.value !== "highest") unavailableLaps.clear();

if (taiwanGame && stageCards.length && stageName && !partyMember) {
  const chapterTabs = [...document.querySelectorAll("#ch-tabs [data-chtab]")];
  const chapter = ["吉芬地下迷宮","時計塔地下","深淵之湖","克雷斯特漢姆修道院","尼芙菲姆原野"].includes(stageName) ? "2" :
    stageMode.value === "highest" && chapterTabs.some(tab => tab.dataset.chtab === "2" && !/🔒/.test(tab.textContent)) ? "2" : "1";
  const current = chapterTabs.find(tab => tab.classList.contains("primary"));
  const target = chapterTabs.find(tab => tab.dataset.chtab === chapter);
  if (target && current !== target) {
    release();
    if (/🔒/.test(target.textContent) || target.disabled) {
      status.textContent = "第二章尚未解鎖";
      return;
    }
    lapTabRefreshed = false;
    departing = false;
    rejectedStages.clear();
    click(target);
    return;
  }
}
if (taiwanGame && stageCards.length && stageName && !partyMember) {
  const tabs = [...document.querySelectorAll("#lap-tabs [data-laptab]")].filter(tab =>
    visible(tab) && !tab.matches('.locked,[aria-disabled="true"]') &&
    /^[1-6]$/.test(tab.dataset.laptab));
  const activeTab = tabs.find(tab => tab.classList.contains("primary"));
  const activeLap = activeTab?.dataset.laptab ?? "1";
  let lapId = expeditionLap.value;
  if (stageMode.value === "highest") {
    if ((lapTabRefreshed || !activeTab) && !highestPlayableStage(stageCards,rejectedStages,Boolean(go))) unavailableLaps.add(activeLap);
    const available = tabs.length ? tabs.map(tab=>tab.dataset.laptab) : ["1"];
    lapId = available.filter(id=>!unavailableLaps.has(id)).sort((a,b)=>Number(b)-Number(a))[0];
    if (!lapId) {
      release();
      status.textContent = "目前已解鎖的周目沒有可出發的關卡";
      return;
    }
    highestLap = lapId;
  }
  const targetTab = tabs.find(tab=>tab.dataset.laptab === lapId);
  if (activeLap !== lapId || (targetTab && !lapTabRefreshed)) {
    release();
    if (!visible(targetTab)) {
      status.textContent = "無法出發：" + lapLabels[Number(lapId)-1] + "尚未解鎖或未顯示";
      return;
    }
    departing = false;
    rejectedStages.clear();
    lapTabRefreshed = true;
    click(targetTab);
    return;
  }
}
if (!taiwanGame && stageName === festivalStage && !partyMember && !battleHud && !result) {
  if (partyLeader && Date.now() < partyWaitingUntil) { release(); return; }
  const play = byId("festival-play");
  if (play) {
    release();
    if (last !== play) {
      departing = true;
      rotationRun = stageMode.value === "rotation" ? {stage:festivalStage} : undefined;
      status.textContent = "燈籠節：正在開啟出發設定";
      click(play);
    }
    return;
  }
  if (!difficultyDialog && !document.querySelector("#npc-dialog:not(.hidden)") &&
      !document.querySelector("#picker:not(.hidden)")) {
    release();
    if (captain && festivalHostPrompt.test(label(captain)) && last !== captain) click(captain);
    else requestLobbyNpc("festival");
    status.textContent = "燈籠節：前往節慶主持人";
    return;
  }
}
if (!partyMember && stageName && !battleHud && !result && !stageCards.length && !go &&
    document.body.classList?.contains("in-lobby") && !document.querySelector("#npc-dialog:not(.hidden), #picker:not(.hidden), #stages:not(.hidden)")) {
  release();
  if (partyLeader && Date.now() < partyWaitingUntil) return;
  if (captain && /(?:遠征隊長|與隊長交談|Hablar con el capitán|talk to the captain|Capitão)/i.test(label(captain)) && last !== captain) click(captain);
  else requestLobbyNpc("captain");
  status.textContent = "正在前往遠征隊長";
  return;
}
if (!partyMember && stageCards.length && stageMode.value === "boss" && !bossTarget.value) {
  release();
  status.textContent = "請選擇這個關卡的指定首領";
  return;
}
if (!partyMember && stageCards.length && !stageName) {
  release();
  status.textContent = "請在助手的關卡設定選擇關卡";
  return;
}
const hud=document.body.innerText;const pickerNode=document.querySelector("#picker:not(.hidden):not(.closing)");const visiblePicker=visible(pickerNode)?pickerNode:null;const pickerTitle=visiblePicker?.querySelector("#pk-title")?.textContent || "";const pickerSubtitle=visiblePicker?.querySelector("#pk-sub")?.textContent || "";const chest=!!visiblePicker && /寶箱|寶物箱|(?:treasure\s+)?chest|cofre/i.test(pickerTitle);const picking=!!visiblePicker && (chest || /升級|level\s*up/i.test(pickerTitle) || /(?:選擇|強化)\s*技能|(?:choose|upgrade)\s+(?:a\s+)?skill|elige una habilidad|mejora una habilidad/i.test(pickerSubtitle));if (!raidActive() && !worldBossActive() && inBattleReadyForBank(battleHud,visiblePicker) && levelCardStop.act(picking ? visiblePicker : null,chest,discoveryBonus,
  Math.abs(Date.now()-lootPacket?.at) < 750 ? lootPacket.skillTargets : null)) { release(); return; }
const inBattle=Boolean(battleHud)||(/\bEXP\b/.test(hud)&&/\b\d{2}:\d{2}\b/.test(hud)&&/\(\s*-?\d+\s*,\s*-?\d+\s*\)/.test(hud));if(inBattle){partyWaitingUntil=0;retriedSoloDialog=false}if(partyLeader&&!inBattle&&!picking&&!result&&Date.now()<partyWaitingUntil){release();return}if(partyMember&&!inBattle&&!picking&&!result){release();status.textContent=followLeader?"跟隨隊長：等待隊伍出發確認":"隊員模式：等待隊伍出發確認";return}if(!stageName&&!captain&&!inBattle&&!picking&&!result){status.textContent="請先開啟遠征選單";return}const stage=stageName===highestStageMode?highestPlayableStage(stageCards,rejectedStages,Boolean(go)):stageCards.find(card=>baseExpeditionName(stageNameOf(card))===stageName&&!stageIsLocked(card));let next;if(!picking){pickerFirstCard=null;attemptedCard=null;attempts=0;nextMenuAt=0}if(picking){release();const picker = document.querySelector("#picker");
if (!picker || picker.classList.contains("hidden") || picker.classList.contains("closing")) return;
const confirm = picker.querySelector("#pk-cards .pk-slot.asking [data-yes]");
if (visible(confirm)) {
  status.textContent = "確認選卡";
  confirm.click();
  return;
}
let cards = [...picker.querySelectorAll("#pk-cards .pk-card[data-i]")].filter(visible);
if (cards[0] !== pickerFirstCard) {
  pickerFirstCard = cards[0];
  // The game unlocks selection after 380 ms plus 120 ms per card.
  pickerReadyAt = Date.now() + 381 + cards.length * 120;
  nextMenuAt = 0;
  attemptedCard = null;
  attempts = 0;
}
if (!cards.length || Date.now() < Math.max(pickerReadyAt, nextMenuAt)) return;
const offeredCardCount=cards.length;
const skillPlan=chest?{enabled:false}:readSkillLevelPlan();
if(skillPlan.enabled && skillPlan.reached?.length)cards=cards.filter(card=>!skillPlan.reached.some(name=>skillMatches(name,skillCardName(card))));
const planChoice=choosePlannedSkillCard(cards,skillPlan);
const arrowMode = chest || skillPlan.enabled ? "off" : arrowSetting("mode");
const boltsOnly = arrowMode === "boltsOnly";
const targetsFirst = arrowMode === "targetsFirst";
const legacyTreasureName=e=>label(e).split(/\n/).map(t=>t.trim()).find(t=>t&&!/^(?:[123]|普通|優良|稀有|史詩|傳說|神話|技能|新[！!])$/.test(t))||"";
const treasureName = card => treasureCardName(card,card.querySelector(".pk-name") ? "" : legacyTreasureName(card));if(chest){const seen=[...new Set([...treasureList(),...cards.map(e=>normalizeTreasure(treasureName(e))).filter(Boolean)])];writeSetting("ro-helper-treasures",JSON.stringify(seen))}else{const job=activeSkillJob();if(job?.id){const key="ro-helper-seen-skills-"+job.id;const basic=cards.map(skillCardName).filter(isBasicAttack);if(basic.length)writeSetting(key,JSON.stringify([...new Set([...readNames(key),...basic])]))}}if (!chest) {
  const picker = document.querySelector("#picker:not(.hidden):not(.closing)");
  const levelGoals=skillPlan.enabled ? skillLevelConfig() : null;
  const eligibleBanish=eligibleSkillBanishNames(banishSkills(),levelGoals,skillPlan,skills());
  const banish = findSkillBanish(picker, eligibleBanish, banishBasic(), visible, usedBanish, boltsOnly, boltsOnly ? "" : focusSkill());
  if (banish) {
    usedBanish.add(banish.button);
    status.textContent = "已按放逐：" + banish.name;
    nextMenuAt = Date.now() + 320;
    banish.button.click();
    return;
  }
}
const categoryModeForTreasure = chest && readSetting("ro-helper-treasure-mode")==="category";
const discoveryModeForTreasure = chest && discoveryTreasureMode();
const equippedDiscovery = discoveryModeForTreasure ? currentTreasureDiscovery() : null;
const firstDiscoveryName = discoveryModeForTreasure ? treasurePriority()[0] : null;
const firstDiscoveryChoice = firstDiscoveryName && !equippedDiscovery?.ownedNames?.some(name=>treasureMatches(firstDiscoveryName,name))
  ? cards.find(card=>treasureMatches(firstDiscoveryName,treasureName(card))) : null;
const rankedDiscovery = discoveryModeForTreasure ? cards.map(card=>({
  card,name:treasureName(card),
  bonus:treasureDiscoveryGain(card,equippedDiscovery)
})).filter(entry=>entry.bonus > 0).sort((a,b)=>b.bonus-a.bonus) : [];
const focusNames = discoveryModeForTreasure
  ? (discoveryFocused.size < 2 ? rankedDiscovery.map(entry=>entry.name).filter(name=>!discoveryFocused.has(normalizeTreasure(name))) : [])
  : chest ? treasureFocusKeys.map(focusTreasure)
  : [focusSkill()];
if (boltsOnly && !elementalArrows.some(([, zh, en]) => [zh,en].includes(focusNames[0]))) focusNames.length = 0;
for (const focusName of firstDiscoveryChoice ? [] : focusNames) {
  const focusAction = findFocusAction(picker, focusName, chest, visible, usedFocus);
  if (!focusAction) continue;
  usedFocus.add(focusAction);
  if (discoveryModeForTreasure) discoveryFocused.add(normalizeTreasure(focusName));
  status.textContent = (chest ? "已專注寶物：" : "已專注技能：") + focusName;
  nextMenuAt = Date.now() + 320;
  focusAction.click();
  return;
}
const sameSkill = chest || boltsOnly || targetsFirst || skillPlan.enabled ? null : highestRaritySameSkill(cards);
let elementalChoice;
if (arrowMode === "on" || boltsOnly) {
  const equipped = document.querySelectorAll("#lu-sockets [data-skill], #skillbar [data-skill]");
  const owned = [...equipped].some(slot => elementalArrows.some(([id]) => id === slot.dataset.skill));
  elementalChoice = selectElementalArrow(cards,owned,
    starterArrows(),arrowSetting("preference") || "shots");
  if(boltsOnly)elementalChoice=selectPreferredArrowUpgrade(cards,arrowSetting("preference")||"shots") || elementalChoice;
}
const startingChoice = chest || boltsOnly || targetsFirst || skillPlan.enabled ? null : selectStartingSkill(cards,starterArrows(),arrowMode === "on");
const priorities = chest ? treasurePriority().filter(Boolean) : skills();
if(targetsFirst) elementalChoice=selectTargetArrowOrPriority(cards,priorities);
let preferred;
if (categoryModeForTreasure) { preferred=selectCategoryTreasure(cards,treasureCategoryOrder(),priorities); }
else if (targetsFirst) { preferred=elementalChoice; }
else if (boltsOnly) {
  const newSkills = cards.filter(card => card.querySelector(".pk-ribbon") &&
    skillCardName(card) && !isBasicAttack(skillCardName(card)));
  const ownedNames=readExtraOwnedNames();
  preferred = newSkills.find(elementalArrowOf) || selectExtraSkill(cards,extraSkillNames(),ownedNames);
} else {
  preferred = priorities.map(name => cards.find(card => chest
  ? treasureMatches(name,treasureName(card))
  : skillMatches(name, skillCardName(card)) || label(card).includes(name))).find(Boolean);
}
if ((discoveryModeForTreasure ? !firstDiscoveryChoice && rankedDiscovery.length === 0 : autoReroll && (skillPlan.enabled&&skillPlan.order==="acquireFirst" ? !planChoice : (categoryModeForTreasure || boltsOnly || priorities.length) && !preferred)) &&
    !planChoice && offeredCardCount && !elementalChoice && !startingChoice && !sameSkill) {
  const picker = document.querySelector("#picker:not(.hidden):not(.closing)");
  const reroll = availableReroll(picker, visible, usedRerolls, chest);
  if (reroll) {
    usedRerolls.add(reroll.button);
    status.textContent = discoveryModeForTreasure ? "沒有能增加尋寶率的寶物，" + reroll.action :
      (chest ? "寶箱" : "技能") + "未命中優先清單，" + reroll.action;
    nextMenuAt = Date.now() + 320;
    reroll.button.click();
    return;
  }
}
if(skillPlan.enabled&&skillPlan.order==='acquireFirst'&&!planChoice){
  status.textContent='先各取得1級：沒有指定新技能或未達標技能，'+(autoReroll?'目前無可用重抽，請手動處理':'請開啟自動重抽或手動處理')+(skillPlan.acquisitionPending?.length?'｜待取得：'+skillPlan.acquisitionPending.join('、'):'');return;
}
const card = planChoice || (boltsOnly ? elementalChoice || preferred :
  firstDiscoveryChoice || elementalChoice || startingChoice || sameSkill || rankedDiscovery[0]?.card || preferred || attemptedCard ||
  (chest ? cards[Math.floor(Math.random() * cards.length)] : cards[0]));
if (!card) {
  status.textContent = skillPlan.enabled ? "技能目標尚未確認："+(skillPlan.pendingDetails?.join("、")||skillPlan.pending?.join("、")||"等待讀取技能等級") : arrowMode!=="off" ? "三元素箭：目前牌面沒有可選技能，且無可用重抽／放逐" : "原本優先順序：目前沒有可選技能，且無可用重抽／放逐";
  return;
}
const index = Number(card.dataset.i);
if (!Number.isInteger(index) || index < 0 || index > 8) return;
const number = String(index + 1);
if (attemptedCard !== card) {
  attemptedCard = card;
  attempts = 0;
}
status.textContent = categoryModeForTreasure ? "選寶物："+(treasureCategories.find(([key])=>key===treasureCategory(card))?.[1] || "其他")+" · "+treasureName(card) : (chest ? "選寶箱：" : "選技能：") + number;
if (attempts % 2 === 0) {
  card.click();
} else {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: number, code: "Digit" + number, bubbles: true, cancelable: true }));
}
attempts++;
nextMenuAt = Date.now() + (attempts >= 2 ? 650 : 320);
return;
}else if (result) {
  if (!taiwanGame) {
    settlementSeenAt ||= Date.now();
    if (Date.now() - settlementSeenAt < 800) { release(); return; }
  }
  if (!taiwanGame && [...document.querySelectorAll("#loot-rolls .lr-row")].some(visible)) {
    release();
    status.textContent = "等待隊伍掉落分配完成";
    return;
  }
  if (returnedResult === result) return;
  returnedResult = result;
  trackPickup([], [0,0], false, Date.now(), true);
  if (rotationRun && rotationRun.stage === rotation.stage && stageMode.value === "rotation") {
    rotation = advanceRotation(rotation, selectedStages, repeats);
  }
  rotationRun = undefined;
  departing = false;
  delete document.documentElement.dataset.roHelperFinishVictory;
  next = result;
}else if(stage){if(!stage.classList.contains("sel")){next=stage}else if(go&&!departing){next=go;departing=true;departureDifficultyContext={stage:baseExpeditionName(stageNameOf(stage)),lap:Number(highestLap||expeditionLap.value),account:activeAccount};if(taiwanGame) hansHighDifficultyUntil=Date.now()+30000;rotationRun=stageMode.value==="rotation"?{stage:stageName}:undefined}}else if(stageCards.length&&stageName){release();status.textContent=stageName===highestStageMode?"目前沒有可出發的一般關卡":"指定關卡目前無法出發："+stageName;return}else if(!go&&!field){departing=false;if(captain)next=captain}if(!next){if(last?.id!=="stg-go")last=undefined;const view=document.body.innerText;const battle=!visiblePicker&&!picking&&!result&&!go&&!field&&!captain&&inBattle&&!document.querySelector("#pause:not(.hidden),#npc-dialog:not(.hidden),dialog[open]")&&!document.activeElement?.matches("input,textarea,select,[contenteditable=true]");if(!(battle&&autoMove&&raidActive()&&document.documentElement.dataset.roHelperRaidMechanics==="on"))release();if(battle){const packet=readLivePacket();const stationaryMagnetOnly=!autoMove;const manualMagnetDue=updateTimedMagnet(packet,true);const manualMagnetPlan=manualMagnetAction(packet,manualMagnetDue,magnetSchedule.cleanupCollected,document.documentElement.dataset.roHelperBossCleanup==="on");if(stationaryMagnetOnly&&manualMagnetPlan==="idle"){blocked.clear();previousPosition=null;previousDirection=null;escapeDirection=-1;escapeUntil=0;status.textContent=gearPickupToggle.value==="timed"?(manualMagnetDue?"原地待命：等待可撿取的磁鐵":"原地待命：等待磁鐵間隔"):"手動移動";return}const fresh=packet&&Date.now()-packet.at>=0&&Date.now()-packet.at<750&&packet.routes?.length===route.length;if(!fresh){if(!retriedCoordinates&&!coordinateRequest&&(!coordinateConnectedAt||Date.now()-coordinateConnectedAt>3000)){retriedCoordinates=true;void connectCoordinates(false,true)}blocked.clear();previousPosition=null;previousDirection=null;escapeDirection=-1;escapeUntil=0;release();status.textContent=document.documentElement.dataset.roHelperError||document.documentElement.dataset.roHelperPhase|| (coordinateConnectedAt&&Date.now()-coordinateConnectedAt>3000?"戰鬥中未收到即時座標，走位已暫停":coordinateStatus);return}retriedCoordinates=false;
if(autoMove && raidActive() && packet.raidMechanics?.enabled){
  const blockedDirections=raidRouteProgress.blocked(packet);
  if(raidRouteProgress.needsRepath())document.documentElement.dataset.roHelperRaidRepath=String(Date.now());
  const decision=chooseRaidMechanicRoute(packet,Date.now(),blockedDirections);
  raidRouteProgress.record(decision?.direction??-1);
  if(decision){status.textContent=decision.label;previousDirection=null;escapeDirection=-1;escapeUntil=0;
    if(decision.direction>=0){const nextHeld=route[decision.direction];if(held!==nextHeld){release();held=nextHeld;for(const key of held)send("keydown",key);}clearTimeout(movePulse);movePulse=setTimeout(release,packet.raidMechanics.pulseMs||120);}else{clearTimeout(movePulse);release();}
    return;
  }
}
release();raidRouteProgress.reset();
const collectionWaypoint = stationaryMagnetOnly && manualMagnetPlan==="cleanup" && magnetSchedule.cleanupCollected ? null : packet.magnetWaypoint;
if(stationaryMagnetOnly && manualMagnetPlan==="cleanup"){
  const pending = document.documentElement.dataset.roHelperBossCleanup==="on" ? packet.bossFarm?.gear : packet.cleanup?.gear;
  if(!collectionWaypoint && (pending?.length || !manualMagnetCleanupReady(packet))){
    previousDirection=null;escapeDirection=-1;escapeUntil=0;
    status.textContent=magnetSchedule.cleanupCollected?"磁鐵收尾中：等待裝備／卡片靠近":"尾王已擊敗：等待可撿取的磁鐵";
    return;
  }
}
const ignoreMonsterCollision=forceGearPickup&&collisionMode.value==="always";const zones=Array.isArray(packet.hazards)?packet.hazards:[];const shelter=bellDirection(packet,zones);if(shelter!==null){status.textContent=shelter<0?"座標｜留在金鐘安全區":"座標｜前往金鐘安全區";if(shelter>=0){held=route[shelter];for(const key of held)send("keydown",key);clearTimeout(movePulse);movePulse=setTimeout(release,145)}return}const originClearance=hazardClearance(zones,...packet.player);const evadingRed=originClearance<=0;
const shotAge=Math.max(0,Math.min(.18,(Date.now()-packet.at)/1000));
const sidestep = direction => {
  status.textContent = "座標｜閃避敵方投擲物";
  previousDirection = null;
  if (direction < 0) return;
  held = route[direction];
  previousDirection = held;
  for (const key of held) send("keydown",key);
  clearTimeout(movePulse);
  movePulse = setTimeout(release,145);
};
if (!evadingRed) {
  const dodge = projectileDodge(packet,zones,shotAge);
  if (dodge !== null && dodge >= 0) { sidestep(dodge); return; }
}
const bossGear = document.documentElement.dataset.roHelperBossCleanup === "on" ? packet.bossFarm?.gear : null;
const cleanup = Array.isArray(bossGear) ? {gear:bossGear,bossFarm:true,canFinish:false} : packet.cleanup;
const leader = !stationaryMagnetOnly && !cleanup && followLeader && Array.isArray(packet.leader) && packet.leader.length === 2 &&
  packet.leader.every(Number.isFinite) ? packet.leader : null;
const leaderDistance = leader ? Math.hypot(packet.player[0]-leader[0],packet.player[1]-leader[1]) : Infinity;
if (!stationaryMagnetOnly && !cleanup && followLeader && !evadingRed && (!leader || leaderDistance <= 95)) {
  previousDirection = null;
  escapeDirection = -1;
  escapeUntil = 0;
  const reason = {
    solo: "目前是單人戰鬥",
    host: "目前角色是隊長，請在隊員端開啟跟隨",
    connecting: "等待組隊戰鬥連線",
    missing: "隊長尚未進入戰鬥",
    stale: "等待隊長座標更新",
    down: "隊長已倒地"
  }[packet.leaderState];
  status.textContent = leader ? "座標｜已跟上隊長" : "跟隨隊長｜" + (reason || "等待隊長位置");
  return;
}
const timedMagnet = !worldBossActive() && gearPickupToggle.value === "timed";
const timedMagnetDue = updateTimedMagnet(packet,true);
const raidWaypoint=raidActive()?packet.raidWaypoint:null;
const finalBossTarget = raidWaypoint || packet.finalBoss;
const drops = worldBossActive() || finalBossTarget ? [] : cleanup?.gear ?? packet.drops;
if (!finalBossTarget && cleanup && !drops.length && !evadingRed && !(stationaryMagnetOnly && collectionWaypoint)) {
  previousDirection = null;
  if (cleanup.canFinish && cleanup.ready) document.documentElement.dataset.roHelperFinishVictory = String(Date.now());
  if (cleanup.bossFarm) {
    status.textContent = "指定首領已擊敗，確認裝備及卡片已撿完";
    return;
  }
  if (cleanup.deferredPartyLoot) {
    status.textContent = "等待國際版隊伍結算與掉落擲骰";
    return;
  }
  if (cleanup.waitForNaturalSettlement) {
    status.textContent = "等待紫色問號掉落登記與遊戲結算";
    return;
  }
  status.textContent = cleanup.canFinish ? (cleanup.ready ? "清場完成，正在返回" : "打王完成，確認掉落物中") : "裝備與卡片已撿完，等待隊伍結算";
  return;
}
const chests = !worldBossActive() && chestMode.value === "avoid" ? packet.drops.filter(([kind]) => kind === "chest") : [];
const discoveryThreshold = Number(document.documentElement.dataset.roHelperChestDiscovery);
const discoveryAllowsChest = discoveryMode && !(packet.discoveryBonus >= discoveryThreshold / 100 - 1e-9);
const canOpenChest=!levelCardStop.savingZeroDiscoveryChests() && (chestMode.value === "collect" || discoveryAllowsChest) && Number.isFinite(packet.zeny)&&Number.isFinite(packet.chestCost)&&packet.zeny>=packet.chestCost;
const eligibleDrops = stationaryMagnetOnly ? [] : drops.filter(([kind]) => kind !== "magnet" && (!timedMagnet || kind === "chest"));
const pickup=trackPickup(eligibleDrops,packet.player,canOpenChest,Date.now(),Boolean(cleanup||leader||evadingRed));const scores=packet.routes.map(([x,y,walkable])=>{const [px,py]=packet.player;const segment=(ex,ey)=>{const vx=x-px,vy=y-py,q=Math.max(0,Math.min(1,((ex-px)*vx+(ey-py)*vy)/(vx*vx+vy*vy||1)));return Math.hypot(ex-px-q*vx,ey-py-q*vy)};let unsafe=!walkable,score=0,chest=0,loot=0,gear=0,clearance=Infinity,pressure=0;for(const [ex,ey] of packet.enemies){const here=Math.hypot(ex-px,ey-py),there=Math.hypot(ex-x,ey-y);clearance=Math.min(clearance,there);pressure+=Math.max(0,150-there)**2;if(!ignoreMonsterCollision&&segment(ex,ey)<35&&there<here+8)unsafe=true;if(!ignoreMonsterCollision&&there<125)score+=(125-there)/15}if (pickup) {
  const progress = pickup.distance - Math.hypot(pickup.x-x,pickup.y-y);
  const value = progress > 3 ? progress / (1 + pickup.distance / 90) : 0;
  if (pickup.kind === "chest") chest = value;
  else loot = value;
}if (!worldBossActive() && !timedMagnet && !stationaryMagnetOnly && packet.gearWaypoint) {
  const {x:gx,y:gy} = packet.gearWaypoint;
  const here = Math.hypot(gx-px,gy-py);
  const there = segment(gx,gy);
  gear = Math.max(0,here-there);
  if (!cleanup && !pickup) loot = gear/3;
}
const crossesAvoidedChest = !evadingRed && crossesChest(packet.player,x,y,chests);
const endClearance=hazardClearance(zones,x,y);const checks=Math.max(1,Math.ceil(Math.hypot(x-px,y-py)/6));const crossesRed=Array.from({length:checks},(_,i)=>(i+1)/checks).some(f=>hazardClearance(zones,px+(x-px)*f,py+(y-py)*f)<=0);return {score,chest,loot,gear,endClearance,crossesRed,crossesAvoidedChest,unsafe,walkable,uncertain:false,escapeCost:pressure-Math.min(150,clearance)*35}});if(scores){const pos=fresh?packet.player.map(Math.round).join(","):view.match(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/)?.slice(1).join(",");if(pos&&pos===previousPosition&&previousDirection&&Date.now()-lastCoordinateAt>=800){const id=pos+":"+previousDirection;blocked.set(id,Date.now()+6500);still++}else{still=0}if(pos!==previousPosition||Date.now()-lastCoordinateAt>=800){previousPosition=pos;lastCoordinateAt=Date.now()}for(const [id,until] of blocked)if(until<Date.now())blocked.delete(id);status.textContent="戰鬥中：依紅色區域與移動物體選路";const start=index++%route.length;let escaping=false;let candidates=Array.from({length:route.length},(_,i)=>(start+i)%route.length).filter(i=>!scores[i].unsafe&&!scores[i].crossesRed&&!scores[i].crossesAvoidedChest&&!blocked.has(pos+":"+route[i]));const forced=!stationaryMagnetOnly&&forceGearPickup&&!worldBossActive()&&!evadingRed&&(!followLeader||cleanup)?scores.map((_,i)=>i).filter(i=>scores[i].walkable&&!scores[i].crossesRed&&!scores[i].crossesAvoidedChest&&scores[i].gear>0&&!blocked.has(pos+":"+route[i])):[];
if (timedMagnet && cleanup && drops.length && !collectionWaypoint && !evadingRed) {
  previousDirection = null;
  status.textContent = "清場收尾：等待可撿取的磁鐵";
  return;
}
let usingMagnet = false;
const prioritizeMagnet = (forceGearPickup || timedMagnetDue || ((timedMagnet || stationaryMagnetOnly) && cleanup && (drops.length || collectionWaypoint))) && (!followLeader || cleanup || stationaryMagnetOnly);
const fallbackMagnet = cleanup && drops.length && !forced.length &&
  !candidates.some(i => scores[i].gear > 0);
if (!evadingRed && collectionWaypoint && (prioritizeMagnet || fallbackMagnet)) {
  const {x,y} = collectionWaypoint;
  const distance = Math.hypot(packet.player[0]-x,packet.player[1]-y);
  const best = candidates.reduce((nearest,i) => {
    const nextDistance = Math.hypot(packet.routes[i][0]-x,packet.routes[i][1]-y);
    return nextDistance < (nearest?.distance ?? distance) ? {i,distance:nextDistance} : nearest;
  },null);
  if (best) {
    forced.splice(0,forced.length,best.i);
    usingMagnet = true;
  }
}
if (!stationaryMagnetOnly && !forced.length && forceGearPickup && cleanup && drops.length && packet.gearWaypoint && !evadingRed) {
  // Take a walkable detour when the waypoint cannot be approached directly.
  const {x,y} = packet.gearWaypoint;
  const detours = scores.map((_,i) => i).filter(i => scores[i].walkable && !scores[i].crossesRed &&
    !scores[i].crossesAvoidedChest && !blocked.has(pos+":"+route[i]));
  detours.sort((a,b) => Math.hypot(packet.routes[a][0]-x,packet.routes[a][1]-y) -
    Math.hypot(packet.routes[b][0]-x,packet.routes[b][1]-y));
  if (detours.length) forced.push(detours[0]);
}
if(stationaryMagnetOnly && !usingMagnet && !evadingRed){
  previousDirection=null;status.textContent="撿磁鐵：等待安全可通行的路線";return;
}
if(forced.length)candidates=forced;if(!candidates.length&&fresh){const open=scores.map((_,i)=>i).filter(i=>scores[i].walkable&&!scores[i].crossesRed&&!scores[i].crossesAvoidedChest);const clear=open.filter(i=>!scores[i].unsafe);const unblocked=open.filter(i=>!blocked.has(pos+":"+route[i]));candidates=clear.length?clear:unblocked.length?unblocked:open;escaping=candidates.length>0&&!clear.length}if(evadingRed){candidates=scores.map((_,i)=>i).filter(i=>scores[i].walkable&&scores[i].endClearance>originClearance);escaping=false}if(!candidates.length){previousDirection=null;if(evadingRed){status.textContent="座標｜紅圈內，找不到脫離方向";return}status.textContent=fresh?"座標｜目前沒有可通行方向":"畫面｜沒有可走方向，請確認座標來源";return}const lowest=Math.min(...candidates.map(i=>scores[i].score));let viable=candidates.filter(i=>scores[i].score<=lowest+3);
if (!finalBossTarget && cleanup && !evadingRed && !escaping && !forced.length && !timedMagnet && !stationaryMagnetOnly) {
  viable = viable.filter(i => scores[i].gear > 0);
  if (!viable.length) {
    previousDirection = null;
    status.textContent = forceGearPickup
      ? "清場收尾：找不到可通往裝備或卡片的路線"
      : "清場收尾：目前無法安全靠近裝備或卡片";
    return;
  }
}
if (leader && !evadingRed && !escaping) {
  viable = viable.filter(i => {
    const [x,y] = packet.routes[i];
    return Math.hypot(x-leader[0],y-leader[1]) < leaderDistance - 4;
  });
  if (!viable.length) {
    previousDirection = null;
    status.textContent = "座標｜等待安全路線跟隨隊長";
    return;
  }
}
if(fresh&&escaping&&Date.now()<escapeUntil&&candidates.includes(escapeDirection)&&!blocked.has(pos+":"+route[escapeDirection]))candidates=[escapeDirection];const best=(evadingRed?candidates:forced.length?forced:escaping?candidates:viable).reduce((best,i)=>{const a=scores[i],b=scores[best];if(evadingRed)return a.endClearance>b.endClearance||(a.endClearance===b.endClearance&&a.score<b.score)?i:best;if(forced.length)return a.gear>b.gear||(a.gear===b.gear&&a.score<b.score)?i:best;if(escaping)return a.escapeCost<b.escapeCost?i:best;
if (cleanup && !finalBossTarget) return a.gear > b.gear ? i : best;
if (leader) {
  const [ax,ay] = packet.routes[i];
  const [bx,by] = packet.routes[best];
  return Math.hypot(ax-leader[0],ay-leader[1]) < Math.hypot(bx-leader[0],by-leader[1]) ? i : best;
}
if (finalBossTarget) {
  const approach = index => {
    const [x,y] = packet.routes[index];
    return Math.abs(Math.hypot(x-finalBossTarget[0],y-finalBossTarget[1])-(raidWaypoint?0:worldBossShield()?850:worldBossActive()?250:145));
  };
  return approach(i) < approach(best) ? i : best;
}
if (a.chest !== b.chest) return a.chest > b.chest ? i : best;
if (a.loot !== b.loot) return a.loot > b.loot ? i : best;
if (Math.abs(a.score-b.score) < 0.5 && (route[i] === previousDirection || route[best] === previousDirection)) {
  return route[i] === previousDirection ? i : best;
}
return a.score < b.score ? i : best});const chosen=scores[best];
if (!evadingRed) {
  const dodge = projectileDodge(packet,zones,shotAge,best);
  if (dodge !== null && dodge !== best) { sidestep(dodge); return; }
}if(escaping){if(escapeDirection!==best||Date.now()>=escapeUntil){escapeDirection=best;escapeUntil=Date.now()+650}}else{escapeDirection=-1;escapeUntil=0}status.textContent=evadingRed?"座標｜閃避紅圈":usingMagnet?"走位：優先撿磁鐵":forced.length?"座標｜強制撿裝備／卡片":escaping?"座標｜走位：脫離怪群":finalBossTarget?(worldBossActive()?(worldBossShield()?"世界王｜護盾期間退開躲招":"世界王｜攻擊並優先閃避"):raidWaypoint?"副本｜前往下一區／戰鬥目標":"座標｜尾王優先"):cleanup?"清場收尾：撿取裝備與卡片":followLeader?"座標｜跟隨隊長":(fresh?"座標｜":"畫面｜")+(chosen.chest?"走位：靠近寶箱":chosen.loot?(pickup?.kind === "magnet" ? "走位：靠近磁鐵" : pickup?.kind === "ball" ? "走位：撿燈籠節扭蛋" : "走位：靠近掉落物"):timedMagnet?(timedMagnetDue?"走位：等待可撿取的磁鐵":"走位：等待磁鐵間隔"):"走位：巡找掉落物");held=route[best];previousDirection=held;if(still>=2)status.textContent="座標未變：換方向避開卡點";for(const key of held)send("keydown",key);clearTimeout(movePulse);movePulse=setTimeout(release,escaping?155:chosen.uncertain?80:145)}else{status.textContent="已暫停走位："+captureStatus+""}}else if(picking){status.textContent="偵測到升級，但找不到可選卡片"}return}previousPosition=null;previousDirection=null;escapeDirection=-1;escapeUntil=0;release();if(picking)status.textContent="選擇技能："+label(next).split(/\n/).slice(0,4).join(" ");if(next!==last||next===go||next===stage)click(next)}catch(error){release();status.textContent="助手流程錯誤："+(error?.message||String(error));}},80);const stop=(preserveRefresh=false)=>{if(!preserveRefresh)clearRefreshCheckpoint();window.removeEventListener("pagehide",levelCardStop.reset);levelCardStop.reset();requestLobbyNpc("cancel");delete document.documentElement.dataset.roHelperBossCleanup;delete document.documentElement.dataset.roHelperSkipChest;delete document.documentElement.dataset.roHelperChestDiscovery;if(sharedVideo){sharedVideo.srcObject.getTracks().forEach(track=>track.stop());sharedVideo=null}clearInterval(timer);clearTimeout(movePulse);delete document.documentElement.dataset.roHelperWorldBoss;release();rotationProgress.textContent="";window.removeEventListener("blur",release);
  delete document.documentElement.dataset.roHelperFinishVictory;
  delete window[key];
  updateAssistantButton(false);
  showTimers(null);
  status.textContent = "助手已關閉";
};
window.addEventListener("blur",release);
window[key]={stop,releaseMovement:release};
updateAssistantButton(true);
rememberRefresh();
void connectCoordinates(false);
})();
    } catch (error) { status.textContent = "載入失敗：" + error.message; }
  };
  function toggleAutomationMode(mode){
    if(mode==="raid"&&raidMode.value==="off"){
      preference.collapsed=false;showCollapsed();for(const group of panelGroups)if(group.contains(raidControls))group.open=true;
      status.textContent="請先選擇要打的副本，再按遠征";return;
    }
    if(cardSwapTransition?.state==='pending')cardSwapCancel=true;cardSwapTransition=null;
    const running=Boolean(window.__roMenuHelper);
    if(running&&automationMode===mode){toggle();return;}
    automationMode=mode;resetRaidCompletion(raidCompletion);
    if(mode==='raid'){raidExitAfterDone=false;raidChecklistAfter=Date.now();raidChecklistAskedAt=0;delete document.documentElement.dataset.roHelperRaidFinishExit;}
    if(running){updateAssistantButton(true);rememberRefresh();status.textContent=mode==="raid"?"已切換副本掛機":"已切換普通掛機";}
    else toggle();
  }
  button.addEventListener("click", event => { event.stopPropagation(); toggleAutomationMode("normal"); });
  compactRaidToggle.addEventListener("click",event=>{event.stopPropagation();toggleAutomationMode("raid");});
  try {
    runtime.onMessage.addListener((message, sender, respond) => {
      if (message?.type === "ro-gs-error") { status.textContent = message.error; return; }
      if (message?.type === "ro-coordinate-error") {
        coordinateConnectedAt = 0;
        coordinateStatus = "座標連線失敗：" + message.error;
        status.textContent = coordinateStatus;
      }
      if (message?.type === "toggle-ro-helper") { toggle(); respond(true); }
    });
  } catch (error) {
    if (!isInvalidatedRuntime(error)) throw error;
    return;
  }
  const memoryStatusButton=document.createElement("button");
  memoryStatusButton.type="button";memoryStatusButton.textContent="記憶體狀態";
  memoryStatusButton.onclick=()=>{
    const dialog=document.createElement("dialog"),body=document.createElement("div"),close=document.createElement("button");
    dialog.style.cssText="padding:16px;max-width:430px;color:#173569;background:#f7f9ff";
    close.textContent="關閉";close.onclick=()=>dialog.close();
    let data;try{data=JSON.parse(document.documentElement.dataset.roHelperMemoryStatus||"null")}catch{}
    const current=data?.current,previous=data?.previous;
    body.style.whiteSpace="pre-line";
    if(!current)body.textContent="尚無資源資料；請進入戰鬥，等待約10秒後再開啟。";
    else{
      const mb=value=>Number.isFinite(value)?(value/1048576).toFixed(1)+" MB":"不支援";
      const elapsed=Math.max(0,Math.round((current.at-previous.at)/1000));
      body.textContent="遊戲資源狀態（"+Math.max(0,Math.round((Date.now()-current.at)/1000))+"秒前）\nRO 分頁 JavaScript 堆積（遊戲與助手合計）："+mb(current.heap)+"\n觀察起點："+mb(previous.heap)+"（"+elapsed+"秒前）\n怪物："+current.enemies+"\n特效："+current.effects+"\n投射物："+current.projectiles+"\n地面特效："+current.ground+"\n立體特效："+current.cylinders+"\n圖示延後載入："+(current.lazyEnabled?"生效":"未啟用")+"（延後 "+(current.lazyDeferred??"—")+"／已載入 "+(current.lazyLoaded??"—")+"）\n3D貼圖："+(current.textures??"—")+"\n3D幾何資源："+(current.geometries??"—")+"\n\n這是 RO 分頁的 JavaScript 堆積與遊戲資源計數，不是助手單獨用量，也不是整個分頁的總記憶體；不包含完整 GPU／原生資源。";
    }
    let native;try{native=JSON.parse(document.documentElement.dataset.roHelperNativeMemory||"null")}catch{}
    body.textContent += "\n遊戲閒置回收："+(localStorage.getItem("ro-helper-memory-saver")==="off"?"關":native?"已執行 "+native.passes+" 次；閒置批次釋放 "+native.batches+" 個；渲染清單重建 "+native.listResets+" 次；原生回收 "+native.gcRuns+" 次（非釋放資源數）":"等待戰鬥畫面維護");
    let budget;try{budget=JSON.parse(document.documentElement.dataset.roHelperVisualBudget||"null")}catch{}
    body.textContent += "\n掛機減少生成："+(budget?(budget.enabled?"生效":"未啟用")+"；已略過數字 "+budget.numbers+" 次、玩家裝飾 "+budget.decorations+" 次；受控裝飾 "+budget.active+"／"+budget.limit:"等待戰鬥資料");
    let pooled;try{pooled=JSON.parse(document.documentElement.dataset.roHelperGeometryPool||"null")}catch{}
    body.textContent += "\n相同幾何共用："+(pooled?"已合併 "+pooled.shared+" 份重複幾何；使用中 "+pooled.groups+" 組；整組到期釋放 "+pooled.released+" 次":"尚無可共用的已核對特效");
    dialog.append(body,close);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
  };
  function clearRebuildableMemoryCaches() {
    const cleared=[];
    // These are derived JSON views only. The authoritative datasets, loot history,
    // identity, counters and game-owned resources remain untouched.
    if(cachedLiveText!==undefined || cachedLivePacket!==undefined){
      cachedLiveText=undefined;cachedLivePacket=undefined;
      cleared.push({name:"助手即時座標解析快取",count:1});
    }
    if(cachedLootText!==undefined || cachedLootSnapshot!==undefined){
      cachedLootText=undefined;cachedLootSnapshot=undefined;
      cleared.push({name:"助手掉落快照解析快取",count:1});
    }
    return cleared;
  }
  const memoryCleanupButton=document.createElement("button");
  memoryCleanupButton.type="button";memoryCleanupButton.textContent="立即清理記憶體";
  const memoryCleanupReport=document.createElement("div");
  memoryCleanupReport.setAttribute("role","status");memoryCleanupReport.setAttribute("aria-live","polite");
  memoryCleanupReport.style.cssText="font-size:12px;white-space:pre-line;flex-basis:100%;margin:4px 0";
  memoryCleanupButton.title="清除可安全重建的助手解析快取；保留本局掉落與統計，不暫停掛機";
  memoryCleanupButton.onclick=()=>{
    const cleared=clearRebuildableMemoryCaches();
    memoryCleanupReport.textContent=cleared.length
      ? "已清理 "+cleared.reduce((sum,row)=>sum+row.count,0)+" 項：\n"+cleared.map(row=>row.name+" ×"+row.count).join("\n")+"\n快取會依需要重建；不代表整個 RO 分頁的記憶體已立即下降。"
      : "目前沒有可安全清理的資源";
  };
  const memorySaver=document.createElement("button");
  memorySaver.type="button";
  const refreshMemorySaver=()=>{
    const enabled=localStorage.getItem("ro-helper-memory-saver")!=="off";
    memorySaver.textContent="省記憶體："+(enabled?"開":"關");
    memorySaver.title="掛機時略過傷害數字、沿用最少模式的可選特效限制，玩家技能純裝飾3D上限24；保留原生更新、回收及戰鬥判定。圖示延後載入需重新整理生效";
    memorySaver.setAttribute("aria-pressed",String(enabled));
  };
  memorySaver.onclick=()=>{const enabled=localStorage.getItem("ro-helper-memory-saver")!=="off";localStorage.setItem("ro-helper-memory-saver",enabled?"off":"on");refreshMemorySaver();status.textContent="省記憶體已切換：戰鬥閒置回收立即生效；圖示延後載入需重新整理";};
  refreshMemorySaver();
  const gpuSaver = document.createElement("button");
  gpuSaver.type = "button";
  const gpuCanvasStyle=document.createElement("style");
  gpuCanvasStyle.textContent="html[data-ro-helper-gpu-saver=on] #stage canvas,html[data-ro-helper-gpu-saver=on] #hud{visibility:hidden!important}html[data-ro-helper-gpu-saver=on] #stage *{animation-play-state:paused!important}";
  document.head.append(gpuCanvasStyle);
  const gpuShade = document.createElement("div");
  gpuShade.setAttribute("aria-hidden", "true");
  gpuShade.style.cssText = "position:fixed;inset:0;background:#000;z-index:2147483646;pointer-events:none;display:none";
  const refreshGpuSaver = enabled => {
    document.documentElement.dataset.roHelperGpuSaver = enabled ? "on" : "off";
    gpuShade.style.display = enabled ? "block" : "none";
    gpuSaver.textContent = enabled ? "節省 GPU：開" : "節省 GPU：關";
    gpuSaver.setAttribute("aria-pressed", String(enabled));
  };
  gpuSaver.addEventListener("click", () => {
    const enabled=document.documentElement.dataset.roHelperGpuSaver!=="on";
    refreshGpuSaver(enabled);
    if(enabled && !document.documentElement.dataset.roHelperGpuRenderState)void connectCoordinates(false);
  });
  refreshGpuSaver(false);
  document.body.append(gpuShade);
  setInterval(()=>{
    if(document.documentElement.dataset.roHelperGpuSaver!=="on")return;
    const suspended=document.documentElement.dataset.roHelperGpuRenderState==="suspended";
    let counts;try{counts=JSON.parse(document.documentElement.dataset.roHelperGpuCounts||"null")}catch{}
    const fresh=counts && Date.now()-counts.at<2500;
    const rate=fresh?Math.round((counts.blocked2d+counts.blockedWebgl)/Math.max(.1,counts.seconds)):0;
    const label=fresh?"節省 GPU：已攔截 "+rate+" 次／秒":suspended?"節省 GPU：等待繪圖計數":"節省 GPU：等待繪圖連線";
    if(gpuSaver.textContent!==label)gpuSaver.textContent=label;
  },1000);
  const panel = document.createElement("section");
  panel.setAttribute("aria-label", "RO 練等助手");
  panel.style.cssText = "position:fixed;top:92px;right:12px;z-index:2147483647;max-width:calc(100vw - 16px);box-sizing:border-box;background:#173569;color:white;border:1px solid #839bd1;border-radius:8px;pointer-events:auto";
  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px;padding:4px 6px";
  const handle = document.createElement("span");
  handle.textContent = "⋮⋮ RO 助手";
  handle.title = "拖曳移動助手";
  handle.style.cssText = "cursor:grab;touch-action:none;user-select:none;padding:4px";
  const footer = document.createElement("div");
  footer.style.cssText = "display:flex;justify-content:flex-end;align-items:center;gap:4px;padding:0 6px 3px";
  footer.append(handle);
  const compactLoot = document.createElement("button");
  compactLoot.type = "button";
  compactLoot.textContent = "掉落";
  compactLoot.setAttribute("aria-label","本次掛機掉落");
  const compactStage = document.createElement("button");
  compactStage.type = "button";
  compactStage.textContent = "關卡";
  compactStage.setAttribute("aria-label","開啟關卡設定");
  compactStage.addEventListener("click", event => {
    event.stopPropagation();
    if (document.querySelector("#ro-helper-settings[open], #ro-helper-stage-dialog[open], #ro-helper-target-storage[open]")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "ro-helper-stage-dialog";
    dialog.setAttribute("aria-label","關卡設定");
    dialog.style.cssText = "width:min(340px,calc(100vw - 36px));max-height:80dvh;box-sizing:border-box;padding:12px;border:1px solid #839bd1;border-radius:8px";
    const previousOpen = stageSettings.open;
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "關閉";
    close.addEventListener("click",() => dialog.close());
    dialog.addEventListener("close",() => {
      stageSettings.open = previousOpen;
      stageSettings.hidden = preference.collapsed === true;
      content.insertBefore(stageSettings,timerDisplay);
      dialog.remove();
    },{once:true});
    stageSettings.hidden = false;
    stageSettings.open = true;
    dialog.append(stageSettings,close);
    document.body.append(dialog);
    dialog.showModal();
  });
  const compactOrganize = document.createElement("button");
  compactOrganize.type = "button";
  compactOrganize.textContent = "整理";
  compactOrganize.setAttribute("aria-label","立即整理背包");
  compactOrganize.addEventListener("click",event => {
    event.stopPropagation();
    if (activeAccount === "local" || !document.body.classList.contains("in-lobby")) {
      status.textContent = "回廣場後才能整理背包";
      return;
    }
    if (!targetStorageRules.size && !inventoryRules(inventorySettings()).length) {
      status.textContent = "請先設定裝備整理或指定存倉規則";
      return;
    }
    if (inventoryRun && !inventoryRun.done && ["open","scan","shop","sold"].includes(inventoryRun.phase)) return;
    if (document.querySelector(".overlay:not(.hidden), #ro-helper-settings[open], #ro-helper-stage-dialog[open], #ro-helper-target-storage[open]")) {
      status.textContent = "請先關閉遊戲視窗再整理背包";
      return;
    }
    const account = activeAccount;
    const run = inventoryRun = {manual:true,phase:"open",expires:Date.now()+35000,next:0,reject:new Set(),stored:0};
    status.textContent = "正在整理背包";
    if (window.__roMenuHelper) return;
    const manualTimer = setInterval(() => {
      if (activeAccount !== account || inventoryRun !== run || window.__roMenuHelper || !runInventoryCleanup() || run.done) {
        clearInterval(manualTimer);
      }
    },160);
  });
  const compactNotes=document.createElement("button");compactNotes.type="button";compactNotes.textContent="記事";
  compactNotes.onclick=event=>{event.stopPropagation();sessionNotesWindow.hidden=false;refreshSessionNotes();};
  for (const shortcut of [compactToggle,compactRaidToggle,compactOrganize,compactLoot,compactStage,compactNotes]) {
    shortcut.style.cssText = "background:#234b96;color:white;border:1px solid #839bd1;border-radius:4px;padding:2px 5px;cursor:pointer;white-space:nowrap";
  }
  compactLoot.addEventListener("click", event => {
    event.stopPropagation();
    lootButton.click();
  });
  compactToggle.addEventListener("click", event => {
    event.stopPropagation();
    button.click();
  });
  const collapse = document.createElement("button");
  collapse.type = "button";
  collapse.style.cssText = "cursor:pointer;border-radius:4px;padding:2px 7px";
  const content = document.createElement("div");
  content.style.cssText = "padding:5px;max-width:260px;max-height:calc(100vh - 64px);overflow:auto";
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;flex-direction:column;gap:6px;width:100%;box-sizing:border-box";
  for (const control of [button, gpuSaver, ...(taiwanGame?[memorySaver,memoryCleanupButton,memoryCleanupReport,memoryStatusButton]:[]), autoLoginToggle, loginCharacterSetting, settingsTransferButton, ...(taiwanGame ? [worldBossToggle,worldBossMode,worldBossLeadRow,raidControls] : []), lootButton, mobileDrops, settings, treasureButton, share, ...(taiwanGame ? [inventoryButton,cardRecycleButton,cardSwapButton,upgradeButton,gsAdvisorButton,growthButton,targetStorageButton] : [difficultyButton]), movementToggle, collisionMode, chestMode, chestDiscoverySetting, ...(taiwanGame ? [goalActionSetting,cardStopMode,noFlipSetting,targetStop] : []), rollChoice, partyMode, rerollToggle, skillFocus.select, ...treasureFocus.map(choice => choice.select)]) {
    control.style.cssText = "background:#234b96;color:white;padding:5px 7px;border-radius:5px;cursor:pointer";
    actions.append(control);
  }

  // Move the existing controls into native collapsible groups; retain every listener and value.
  const panelGroups = [];
  const panelGroupStyle = "width:100%;box-sizing:border-box;border:1px solid #718bbd;border-radius:6px;background:#1c3d72;margin:0";
  const panelSummaryStyle = "cursor:pointer;padding:7px 8px;font-weight:bold;user-select:none";
  const addPanelGroup = (title,controls) => {
    if (!controls.length) return;
    const group = document.createElement("details");
    group.className = "ro-helper-control-group";
    group.style.cssText = panelGroupStyle;
    const summary = document.createElement("summary");
    summary.textContent = title;
    summary.style.cssText = panelSummaryStyle;
    const body = document.createElement("div");
    body.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;padding:0 6px 7px;min-width:0";
    for (const control of controls) {
      control.style.maxWidth = "100%";
      control.style.boxSizing = "border-box";
      body.append(control);
    }
    group.append(summary,body);
    group.addEventListener("toggle",()=>{
      if (!group.open) return;
      panelGroups.forEach(other=>{if(other!==group)other.open=false;});
      if (stageSettings.parentElement===content) stageSettings.open=false;
    });
    panelGroups.push(group);
    actions.append(group);
  };
  actions.replaceChildren(button);
  button.style.width = "100%";
  button.style.fontWeight = "bold";
  addPanelGroup("技能／寶物選牌",[settings,treasureButton,skillFocus.select,...treasureFocus.map(choice=>choice.select),rerollToggle,chestMode,chestDiscoverySetting,...(taiwanGame?[goalActionSetting,cardStopMode,noFlipSetting,targetStop]:[])]);
  addPanelGroup("裝備／角色整理",taiwanGame?[inventoryButton,cardRecycleButton,cardSwapButton,upgradeButton,gsAdvisorButton,targetStorageButton,growthButton]:[]);

  addPanelGroup("移動／系統",[movementToggle,collisionMode,share,gpuSaver,...(taiwanGame?[memorySaver,memoryCleanupButton,memoryCleanupReport,memoryStatusButton]:[]),autoLoginToggle,loginCharacterSetting]);
  addPanelGroup("組隊／副本／世界王",[partyMode,rollChoice,...(taiwanGame?[worldBossToggle,worldBossMode,worldBossLeadRow,raidControls]:[])]);
  addPanelGroup("掉落／設定備份",[lootButton,mobileDrops,settingsTransferButton]);
  if (!taiwanGame) stageSettings.append(difficultyButton);
  stageSettings.style.cssText = panelGroupStyle+";margin-top:6px;padding:0";
  stageSummary.style.cssText = panelSummaryStyle;
  stageSettings.addEventListener("toggle",()=>{
    if(stageSettings.open && stageSettings.parentElement===content)panelGroups.forEach(group=>group.open=false);
  });
  status.style.cssText = "padding:5px 2px 0;overflow-wrap:anywhere";
  content.append(actions, stageSettings, timerDisplay, status);
  header.append(compactToggle, compactRaidToggle, compactOrganize, compactLoot, compactStage, compactNotes, collapse);
  panel.append(header, content, footer);
  document.body.append(panel, lootWindow);
  skillFocus.refresh();
  treasureFocus.forEach(choice => choice.refresh());

  const storageKey = "ro-helper-panel";
  let preference = {};
  try { preference = JSON.parse(readSetting(storageKey)) || {}; } catch {}
  const savePanel = () => {
    try { writeSetting(storageKey, JSON.stringify(preference)); } catch {}
  };
  const movePanel = (x, y) => {
    const rect = panel.getBoundingClientRect();
    const left = Math.max(0, Math.min(x, innerWidth - rect.width));
    const top = Math.max(0, Math.min(y, innerHeight - rect.height));
    panel.style.right = "auto";
    panel.style.left = left + "px";
    panel.style.top = top + "px";
    return { x: left, y: top };
  };
  const clampPanel = () => {
    const rect = panel.getBoundingClientRect();
    if (rect.right > innerWidth || rect.bottom > innerHeight || rect.left < 0 || rect.top < 0) {
      movePanel(rect.left, rect.top);
    }
  };
  const restore=document.createElement('button'),minimize=document.createElement('button');
  minimize.type=restore.type='button';minimize.textContent='縮到最小';restore.textContent='RO';
  minimize.style.cssText=collapse.style.cssText;
  restore.style.cssText='width:42px;height:42px;border-radius:50%;border:1px solid #839bd1;background:#173569;color:white;touch-action:none;cursor:move;pointer-events:auto';
  restore.setAttribute('aria-label','展開 RO 助手');header.append(minimize);panel.append(restore);
  const normalPanelWidth=panel.style.width;
  let iconDrag;
  minimize.onclick=event=>{event.stopPropagation();preference.minimized=true;showCollapsed();clampPanel();savePanel();};
  restore.addEventListener('pointerdown',event=>{event.stopPropagation();const r=panel.getBoundingClientRect();iconDrag={id:event.pointerId,x:event.clientX,y:event.clientY,left:r.left,top:r.top,moved:false};restore.setPointerCapture(event.pointerId);});
  restore.addEventListener('pointermove',event=>{if(!iconDrag||iconDrag.id!==event.pointerId)return;const dx=event.clientX-iconDrag.x,dy=event.clientY-iconDrag.y;if(Math.hypot(dx,dy)>5)iconDrag.moved=true;if(iconDrag.moved)movePanel(iconDrag.left+dx,iconDrag.top+dy);});
  const finishIcon=event=>{if(!iconDrag||iconDrag.id!==event.pointerId)return;const moved=iconDrag.moved;iconDrag=null;if(event.type==='pointerup'&&!moved){preference.minimized=false;showCollapsed();}clampPanel();savePanel();};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])restore.addEventListener(name,finishIcon);

  const showCollapsed = () => {
    const minimized=preference.minimized===true;
    panel.style.width=minimized?"auto":normalPanelWidth;
    header.style.display=minimized?"none":"flex";content.style.display=minimized?"none":"";footer.style.display=minimized?"none":"flex";restore.style.display=minimized?"block":"none";panel.style.background=minimized?"transparent":"#173569";panel.style.borderColor=minimized?"transparent":"#839bd1";
    const collapsed = preference.collapsed === true;
    roundDiscoveryText.hidden = !collapsed;
    header.style.justifyContent = collapsed ? "flex-start" : "flex-end";
    actions.style.display = collapsed ? "none" : "flex";
    compactNotes.hidden = !collapsed;
    compactLoot.hidden = !collapsed;
    compactToggle.hidden = !collapsed;compactRaidToggle.hidden=!collapsed||!taiwanGame;
    compactStage.hidden = !collapsed;
    compactOrganize.hidden = !collapsed || !taiwanGame;
    stageSettings.hidden = collapsed;
    collapse.textContent = collapsed ? "展開" : "收起";
    collapse.setAttribute("aria-expanded", String(!collapsed));
  };
  showCollapsed();
  if (Number.isFinite(preference.x) && Number.isFinite(preference.y)) movePanel(preference.x, preference.y);
  collapse.addEventListener("click", event => {
    event.stopPropagation();
    preference.collapsed = !preference.collapsed;
    showCollapsed();
    clampPanel();
    savePanel();
  });
  let drag;
  handle.addEventListener("pointerdown", event => {
    if (event.button !== 0 || drag) return;
    const rect = panel.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });
  handle.addEventListener("pointermove", event => {
    if (drag?.id !== event.pointerId) return;
    Object.assign(preference, movePanel(event.clientX - drag.x, event.clientY - drag.y));
  });
  const finishDrag = event => {
    if (drag?.id !== event.pointerId) return;
    drag = undefined;
    savePanel();
  };
  handle.addEventListener("pointerup", finishDrag);
  handle.addEventListener("pointercancel", finishDrag);
  handle.addEventListener("lostpointercapture", finishDrag);
  window.addEventListener("resize", clampPanel);
  const refreshStateKey = "ro-helper-refresh-resume";
  const refreshCooldownKey = "ro-helper-update-reload-at";
  let refreshCharacter = "";
  let refreshOpened = false;
  let refreshEntered = false;
  let refreshUntil = 0;
  let refreshCheckpointAt = 0;
  function clearRefreshCheckpoint() {
    try { sessionStorage.removeItem(refreshStateKey); } catch {}
  }
  const visibleRefreshControl = element => element && !element.disabled &&
    element.getClientRects().length && !element.closest(".hidden,[hidden],[inert],[aria-hidden=true]");
  const refreshControl = selector => {
    const element = document.querySelector(selector);
    return visibleRefreshControl(element) ? element : null;
  };
  const refreshDialogTitle = () =>
    document.querySelector("#npc-dialog:not(.hidden) #npc-name")?.textContent.trim() || "";
  const refreshDialogButton = () => refreshControl("#npc-dialog:not(.hidden) #npc-options button.primary");
  const rememberRefresh = () => {
    if (!window.__roMenuHelper) return false;
    const name = document.querySelector("#hud:not(.hidden) #hud-name span")?.textContent.trim();
    try {
      refreshCheckpointAt = Date.now();
      sessionStorage.setItem(refreshStateKey,JSON.stringify({
        at:refreshCheckpointAt,account:activeAccount,character:name || refreshCharacter,
        automationMode,raidCleanupPending,raidExitAfterDone,raidCompletion:{...raidCompletion},
        characterSlot:Math.max(1,[...document.querySelectorAll("#charselect #slots > .slot")].findIndex(slot=>slot.classList.contains("selected"))+1),
        gpuSaver:document.documentElement.dataset.roHelperGpuSaver === "on"
      }));
      return true;
    } catch { return false; }
  };
  try {
    const saved = JSON.parse(sessionStorage.getItem(refreshStateKey));
    const navigation = performance.getEntriesByType("navigation")[0];
    const reloaded = navigation ? navigation.type === "reload" : performance.navigation?.type === 1;
    if (reloaded &&
        saved && Date.now()-saved.at >= 0 && Date.now()-saved.at < 180000) {
      refreshRecovery = saved;
      refreshUntil = saved.at+180000;
      status.textContent = "重新整理後接續：等待遊戲載入";
    } else clearRefreshCheckpoint();
  } catch {}
  window.addEventListener("pagehide",rememberRefresh);
  const isUnfinishedRunTitle = title =>
    /^(?:尚未結束的一局|尚未結束的戰鬥|未完成的一局|未完成的戰鬥|Unfinished run|Unfinished battle|Partida a medias|Partida inacabada)$/i
      .test(String(title).normalize("NFKC").trim());
  function handleRefreshDialog() {
    const title = refreshDialogTitle();
    const confirm = refreshDialogButton();
    const label = confirm?.textContent.trim() || "";
    if (isUnfinishedRunTitle(title) &&
        /^(?:繼續|繼續這局|Continue|Continuar)$/i.test(label)) {
      confirm.click();
      status.textContent = "繼續上一場戰鬥";
      return true;
    }
    if (!/^(?:新版本|遊戲更新|New version|Versión nueva|Nova versão)$/i.test(title) ||
        !/^(?:重新整理|重新載入|Reload|Recargar|Recarregar)$/i.test(label)) return false;
    try {
      if (Date.now()-Number(sessionStorage.getItem(refreshCooldownKey)) < 90000 || !rememberRefresh()) return true;
      sessionStorage.setItem(refreshCooldownKey,String(Date.now()));
    } catch { return true; }
    status.textContent = "偵測到遊戲更新，正在重新整理";
    confirm.click();
    return true;
  }
  setInterval(() => {
    const helper = window.__roMenuHelper;
    if (helper) {
      refreshCharacter = document.querySelector("#hud:not(.hidden) #hud-name span")?.textContent.trim() || refreshCharacter;
      if (Date.now()-refreshCheckpointAt >= 5000) rememberRefresh();
    } else if (!refreshRecovery) {
      refreshCharacter = "";
      refreshUntil = 0;
      return;
    }
    if (Date.now() < refreshUntil) {
      const servers = [...document.querySelectorAll("#npc-dialog:not(.hidden) .lb-pick button[data-lb]")]
        .filter(visibleRefreshControl);
      const server = servers.find(option => option.querySelector("em")) || servers[0];
      if (server) {
        status.textContent = "重新整理後接續：選擇伺服器";
        server.click();
        return;
      }
    }
    if (!refreshRecovery || helper) return;
    const stopRecovery = message => {
      refreshRecovery = null;
      clearRefreshCheckpoint();
      status.textContent = message;
    };
    if (Date.now() >= refreshUntil) {
      stopRecovery("接續逾時，請進入角色後啟動助手");
      return;
    }
    if (refreshRecovery.account !== "local" && activeAccount !== "local" && refreshRecovery.account !== activeAccount) {
      stopRecovery("接續已取消：目前帳號與刷新前不同");
      return;
    }
    if (document.body.classList.contains("in-lobby") || refreshControl("#hud:not(.hidden)")) {
      if (refreshControl("#npc-dialog:not(.hidden)")) {
        if(isUnfinishedRunTitle(refreshDialogTitle())) handleRefreshDialog();
        return;
      }
      const restoreGpuSaver = refreshRecovery.gpuSaver === true;
      automationMode=refreshRecovery.automationMode==="raid"?"raid":"normal";
      raidCleanupPending=refreshRecovery.raidCleanupPending===true;raidExitAfterDone=refreshRecovery.raidExitAfterDone===true;raidChecklistAfter=Date.now();raidChecklistAskedAt=0;
      raidCompletion.entered=!!refreshRecovery.raidCompletion?.entered;raidCompletion.proof=refreshRecovery.raidCompletion?.proof===true;raidCompletion.finished=raidCompletion.proof&&refreshRecovery.raidCompletion?.finished===true;raidCompletion.result=refreshRecovery.raidCompletion?.result||null;raidCompletion.runId=refreshRecovery.raidCompletion?.runId||null;
      refreshRecovery = null;
      toggle(true);
      if (window.__roMenuHelper) {
        if (restoreGpuSaver) refreshGpuSaver(true);
        rememberRefresh();
        status.textContent = "重新整理後已接續掛機";
      }
      return;
    }
    if (refreshControl("#npc-dialog:not(.hidden)")) return;
    const characterNumber = loginCharacterNumber();
    const slot = refreshControl("#charselect:not(.hidden) #slots > .slot:nth-child("+characterNumber+"):not(.empty)");
    if (!slot && refreshControl("#charselect:not(.hidden)")) {
      status.textContent = "自動重登：第 "+characterNumber+" 格沒有可登入角色，請調整序號";
      return;
    }
    if (slot && !refreshEntered) {
      const nameLabel = slot.querySelector(".slot-name")?.cloneNode(true);
      nameLabel?.querySelectorAll(".rn-pen").forEach(pen => pen.remove());
      const name = nameLabel?.textContent.trim();
      if (!name) return;
      if ((refreshRecovery.characterSlot || 1) === characterNumber && refreshRecovery.character && name !== refreshRecovery.character) {
        stopRecovery("接續已取消：指定角色與刷新前不同");
        return;
      }
      if (!slot.classList.contains("selected")) {
        slot.click();
        return;
      }
      const enter = refreshControl("#charselect:not(.hidden) #btn-play");
      if (enter) {
        refreshEntered = true;
        status.textContent = "重新整理後接續：登入第 "+characterNumber+" 個角色";
        enter.click();
      }
      return;
    }
    const start = refreshControl("#splash #sp-play");
    const startLabel = start?.textContent.normalize("NFKC").trim() || "";
    const ready = start && (start.classList.contains("ready") ||
      /^(?:進入遊戲|開始遊戲|進入|Play(?: now)?|Start(?: game)?|Jugar|Entrar|Jogar)\s*!?$/i.test(startLabel));
    if (!refreshOpened && ready && refreshControl("#splash #sp-leave") &&
        localStorage.getItem("ro-helper-game-autologin") !== "off") {
      refreshOpened = true;
      status.textContent = "重新整理後接續：開啟角色選擇";
      start.click();
    }
  },500);
  window.addEventListener("ro-account", () => {
    const nextAccount = accountScope();
    if (nextAccount === activeAccount) return;
    window.__roMenuHelper?.stop();
    delete window.__roMenuHelper;
    document.querySelector("#ro-helper-settings[open]")?.close();
    document.querySelector("#ro-helper-stage-dialog[open]")?.close();
    document.querySelector("#ro-helper-target-storage[open]")?.close();
    activeAccount = nextAccount;
    refreshWorldBossToggle();
    refreshWorldBossMode();refreshRaidSettings();
    loginCharacterInput.value = String(loginCharacterNumber());
    gearIdByUid.clear();
    loadTargetStorage();
    skillJob = undefined;
    growthRun = undefined;
    nextGrowthCheck = 0;
    inventoryRun = undefined;
    upgradeActive = false;
    upgradeRun = null;
    lootHistory.clear();
    runStatistics.reset();
    intruderNotes.reset();sessionNotesWindow.hidden=true;
    dropRefByUid.clear();
    dropDispositions.clear();
    dropStorageSources.clear();
    revealedLoot.clear();
    settledLoot.clear();
    refreshLootWindow();
    refreshGpuSaver(false);
    loadStageSettings();
    autoMove = readSetting("ro-helper-auto-move") !== "off";
    forceGearPickup = true;
    magnetSchedule = {last:0,time:null,token:document.documentElement.dataset.roHelperMagnetCollected || ""};
    autoReroll = readSetting("ro-helper-auto-reroll") !== "off";
    collisionMode.value = readSetting("ro-helper-collision-mode") === "always" ? "always" : "pickup";
    loadChestMode();
    loadNoFlipLevel();
    loadGoalAction();
    loadCardStopTarget();
    rollChoice.value = readSetting("ro-helper-roll-choice") || "";
    const role = readSetting("ro-helper-party-role");
    partyMode.value = ["off","leader","member","follow"].includes(role)
      ? role : readSetting("ro-helper-auto-party") === "on" ? "member" : "off";
    refreshRollChoiceVisibility();
    partyWaitingUntil = 0;
    updateMovementToggle();
    updateGearPickupToggle();
    refreshReroll();
    skillFocus.refresh();
    treasureFocus.forEach(choice => choice.refresh());
    drag = undefined;
    try { preference = JSON.parse(readSetting(storageKey)) || {}; } catch { preference = {}; }
    panel.style.left = "";
    panel.style.right = "12px";
    panel.style.top = "92px";
    showCollapsed();
    if (Number.isFinite(preference.x) && Number.isFinite(preference.y)) movePanel(preference.x, preference.y);
    status.textContent = "已切換帳號設定，請啟動助手";
  });
})();






















































}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mountGearSpecial,{once:true});else mountGearSpecial();
