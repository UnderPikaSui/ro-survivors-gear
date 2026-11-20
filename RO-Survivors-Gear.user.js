// ==UserScript==
// @name RO 練等助手 Gear 試用版
// @namespace ro-survivors-helper
// @version 68.1
// @description GS／AI 難度建議僅支援電腦漢斯版；Gear 未提供這兩個按鈕，其他共用功能保持同步。
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
            document.dispatchEvent(new CustomEvent("ro-helper-gear-credited",{detail:JSON.stringify([uid,tracked.ref])}));
          }
        }
        return length;
      };
    };
  }
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
    if (!["captain","festival","kstorage","vendor"].includes(npcId)) return;
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
  let active, direction, loading;
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
  const gpuWrappedGames = new WeakSet();
  function wrapGearRendering(game) {
    if (gpuWrappedGames.has(game)) return;
    const render = game.renderWorld;
    game.renderWorld = function(...args) {
      const world = this.world3d;
      if (document.documentElement?.dataset.roHelperGpuSaver !== "on" ||
          typeof world?.render !== "function") return render.apply(this,args);
      const original = Object.getOwnPropertyDescriptor(world,"render");
      world.render = () => {};
      try {
        return render.apply(this,args);
      } finally {
        if (original) Object.defineProperty(world,"render",original);
        else delete world.render;
      }
    };
    gpuWrappedGames.add(game);
  }
  function capturePlayer(target, key) {
    if (key === "player" && typeof target.renderWorld === "function") {
      active = target;
      wrapGearRendering(target);
      setPhase("已讀到戰鬥物件");
    }
  }
  Object.defineProperty = function(target, key, descriptor) {
    const result = defineProperty(target,key,descriptor);
    capturePlayer(target,key);
    return result;
  };
  defineProperty(Object.prototype,"player",{
    configurable:true,
    set(value) {
      defineProperty(this,"player",{value,writable:true,enumerable:true,configurable:true});
      capturePlayer(this,"player");
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
    try { (() => { const root = document.documentElement; if (!z?.player || performance.now() - Number(root.dataset.roHelperLast || 0) < 100) return false; const {x,y} = z.player; const partyLeader = readPartyLeader(z, performance.now()); const cleanup = victoryCleanup(z,root.dataset,Date.now(),victoryEmptySince,location.hostname !== "ro.hans-webgametw.com"); watchLocalPickups(z,root.dataset,pickupWatch); const finalBoss = activeFinalBoss(z); const gearWaypoint = !finalBoss && root.dataset.roHelperTimedMagnet!=='on' && root.dataset.roHelperStationaryMagnet!=='on' && readGearWaypoint(z,cleanup || root.dataset.roHelperBossCleanup==='on',gearPaths,performance.now()); const prioritizeMagnet = root.dataset.roHelperPriorityMagnet==='on'; const magnetCleanup = cleanup || root.dataset.roHelperBossCleanup==='on'; const magnetWaypoint = !finalBoss && (prioritizeMagnet || (magnetCleanup && z.pickups.some(e=>!e.dead&&(e.kind==='loot'||e.kind==='card')))) ? readGearWaypoint(z,Boolean(magnetCleanup),magnetPaths,performance.now(),true) : null; const waypoint = (prioritizeMagnet && magnetWaypoint) || gearWaypoint || magnetWaypoint; const reach = waypoint ? Math.max(24,Math.min(60,Math.hypot(waypoint.x-x,waypoint.y-y))) : 60; const routes = [[1,0],[0,1],[-1,0],[0,-1],[1,-1],[1,1],[-1,1],[-1,-1]].map(([dx,dy]) => { const length=Math.hypot(dx,dy); const [vx,vy]=direction(dx/length,dy/length); const clearAt = length => [.2,.4,.6,.8,1].every(fraction=>{const step=length*fraction;const tx=x+vx*step,ty=y+vy*step;return tx>=z.bounds.x0&&tx<=z.bounds.x1&&ty>=z.bounds.y0&&ty<=z.bounds.y1&&(!z.walk||z.walk.walkable(tx,ty))});const distance = [reach,reach/2,reach/4].find(clearAt) || reach; return [x+vx*distance,y+vy*distance,clearAt(distance)] }); const nearby=e=>!e.dead&&Math.hypot(e.x-x,e.y-y)<520; root.dataset.roHelperLive=JSON.stringify({at:Date.now(),battleSeconds:z.time,stageId:z.stageId,lap:Number(z.difficulty?.lap)||1,baseLevel:z.charExp?.level,expeditionFlags:{story:Boolean(z.story),endless:Boolean(z.endless)},runBaseExp:z.endless ? null : z.charExp?.base,bossFarm:{gear:root.dataset.roHelperBossCleanup==='on'?z.pickups.filter(e=>!e.dead&&(e.kind==='loot'||e.kind==='card')).map(e=>[e.kind,e.x,e.y]):null,solo:!z.coop&&!z.story&&!z.endless,playing:z.state==='playing',bosses:(z.bosses||[]).filter(e=>e.def?.boss).map(e=>[e.def.id,e.def.name]),kills:Object.fromEntries((z.script?.bosses||[]).map(e=>[e.id,z.killsBy?.get(e.id)||0])),maze:z.stageId==='maze'?(z.script?.bosses||[]).map(e=>[e.id,e.t]):[]},skillTargets:Object.fromEntries((z.weapons||[]).flatMap(weapon=>{if(typeof weapon.id!=='string')return [];try{const mod=weapon.mod?.(z);const bonus=(weapon.up?.targets||0)+(mod?.targets||0);const count=weapon.countUnit?.()==='objetivo'&&mod?.count>0?mod.count:bonus>0?1+bonus:weapon.targets?.(z);return Number.isSafeInteger(count)&&count>0?[[weapon.id,count]]:[]}catch{return []}})),discoveryBonus:Number.isFinite(z.stats?.discovery)?z.stats.discovery:null,lootLog:lootSnapshot(z),player:[x,y],finalBoss:finalBoss ? [finalBoss.x,finalBoss.y] : null,...partyLeader,cleanup,gearWaypoint,magnetWaypoint,routes,zeny:z.zeny,chestCost:z.chestCost(),hazards:readHazards(z),enemyShots:sampleEnemyShots(z,enemyShotCache),bell:readBell(z),enemies:z.enemies.filter(nearby).map(e=>[e.x,e.y]),drops:z.pickups.filter(e=>!e.dead&&(e.kind==='loot'||e.kind==='card'||e.kind==='magnet'||Math.hypot(e.x-x,e.y-y)<650)).map(e=>[e.kind,e.x,e.y])});root.dataset.roHelperLast=String(performance.now());return false })(); setPhase(""); delete document.documentElement.dataset.roHelperError; } catch (error) {
      document.documentElement.dataset.roHelperError = error.message;
    }
  },100);
})();

function mountGearAssistant() {
(() => {
  if (window.top !== window || document.querySelector('section[aria-label="RO 練等助手"]')) return;
  const button = document.createElement("button");
  button.type = "button";
  const compactToggle = document.createElement("button");
  compactToggle.type = "button";
  const updateAssistantButton = running => {
    compactToggle.textContent = running ? "停止" : "啟動";
    compactToggle.setAttribute("aria-label",running ? "停止助手" : "啟動助手");
    button.textContent = "RO 練等助手 " + "Gear V68.1" + " · " + (running ? "啟動中" : "已關閉");
    button.setAttribute("aria-pressed", String(running));
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

  let worldBossNextAction=0;
  let worldBossResultAt=0;
  function handleWorldBoss() {
    if (!taiwanGame) return false;
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
    "character-growth","chest-discovery-threshold","chest-mode","collision-mode","difficulty","difficulty-solo","difficulty-party","difficulty-objective",
    "expedition-lap","expedition-speed","focus-skill","focus-treasure","focus-treasure-2","force-gear","inventory","inventory-tiers","login-character",
    "magnet-minutes","no-flip-level","panel","party-role","pickup-mode","roll-choice","skills","stage","stage-mode","stage-repeats","stage-rotation",
    "gear-movement","gs-boss-cards","treasures","seen-stages","target-pickup","target-storage","treasure-category-priority","treasure-mode","treasure-priority","world-boss","world-boss-mode","world-boss-lead",
    "arrow-extra1","arrow-extra2","arrow-extra3","arrow-mode","arrow-starter","arrow-starter2","arrow-starter3","arrow-preference"
  ].map(key=>"ro-helper-"+key));
  const isPortableSettingKey = key => portableSettingKeys.has(key) || /^ro-helper-difficulty-stage\.(?:solo|party)\.[1-6]\.[^\s]{1,400}$/.test(key) || /^ro-helper-seen-(?:skills-[a-z_]+|stages-lap-[1-6])$/.test(key);
  const portableGlobalKeys = new Set(["ro-helper-game-autologin","ro-helper-observed-gear-tiers"]);
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
    const title=document.createElement("strong");title.textContent="全部設定匯出／匯入";
    const hint=document.createElement("p");hint.textContent="搬移技能、寶物、難度、關卡、整理及指定存倉設定。只讀取目前帳號；不含登入憑證、網頁控制密碼、配對金鑰和掉落紀錄。";
    const exportButton=document.createElement("button");exportButton.textContent="匯出全部設定";exportButton.type="button";
    const importButton=document.createElement("button");importButton.textContent="選擇設定檔";importButton.type="button";
    const file=document.createElement("input");file.type="file";file.accept=".json,application/json";file.hidden=true;
    const note=document.createElement("p");note.setAttribute("role","status");
    const apply=document.createElement("button");apply.type="button";apply.textContent="套用並重新整理";apply.disabled=true;
    let pending;
    exportButton.onclick=()=>{
      if(activeAccount!==account){note.textContent="帳號已變更，請重新開啟設定搬家";return;}
      try{const data=exportAllSettings(),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"})),link=document.createElement("a");
        link.href=url;link.download="RO-助手全部設定.json";document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
        note.textContent="已匯出 "+(Object.keys(data.settings).length+Object.keys(data.globals).length)+" 項設定。到另一瀏覽器登入後匯入即可。";
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
  const gearMovementMode = document.createElement("select");
  gearMovementMode.setAttribute("aria-label","Gear 走位方式");
  gearMovementMode.append(new Option("智慧走位（測試）","smart"),new Option("固定巡走","patrol"));
  gearMovementMode.value = readSetting("ro-helper-gear-movement") || "smart";
  gearMovementMode.addEventListener("change",() => writeSetting("ro-helper-gear-movement",gearMovementMode.value));
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
  let forceGearPickup = readSetting("ro-helper-force-gear") === "on";
  const gearPickupToggle = document.createElement("select");
  gearPickupToggle.setAttribute("aria-label","優先撿取模式");
  gearPickupToggle.append(new Option("優先撿取：關","off"),new Option("優先撿取：磁鐵 → 裝備／卡片","priority"),new Option("優先撿取：定時撿磁鐵","timed"));
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
    gearPickupToggle.value = readSetting("ro-helper-pickup-mode") === "timed" ? "timed" : forceGearPickup ? "priority" : "off";
    magnetInterval.value = String(readMagnetMinutes());
    magnetIntervalSetting.hidden = gearPickupToggle.value !== "timed";
    document.documentElement.dataset.roHelperTimedMagnet = gearPickupToggle.value === "timed" ? "on" : "off";
    document.documentElement.dataset.roHelperPriorityMagnet = forceGearPickup ? "on" : "off";
  };
  updateGearPickupToggle();
  gearPickupToggle.addEventListener("change", event => {
    event.stopPropagation();
    if (gearPickupToggle.value === "timed") {
      gearMovementMode.value = "smart";
      writeSetting("ro-helper-gear-movement","smart");
    }
    forceGearPickup = gearPickupToggle.value === "priority";
    writeSetting("ro-helper-force-gear",forceGearPickup ? "on" : "off");
    writeSetting("ro-helper-pickup-mode",gearPickupToggle.value);
    updateGearPickupToggle();
  });
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
  const normalizeSkill = name => skillNameIndex.get(skillNameKey(name))?.[taiwanGame ? 0 : 1] ?? name.trim();
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
    const tip = document.getElementById("skill-tip");
    if (!tip || !slots.length) return {results,unknown:slots.length};
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
    return {results,unknown:slots.length-results.size};
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
          ? "比較選牌後淨增加的尋寶率。沒有正增量時先重抽，再按備選順位。漢斯版寶物槽全滿且尋寶率 +0% 時，保存後續寶箱。"
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
        ["preference","同稀有度優先",arrowUpgrades,"shots"]
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
        syncBanish();
        const control = document.createElement("label");
        control.append(banish, " 取得後放逐");
        form.append(control);
      }
      return { field, banish };
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
      .then(() => ({ok:false,error:"Gear未連接即時座標"}))
      .then(result => {
        if (!result?.ok) throw new Error(result?.error || "擴充功能沒有回應");
        coordinateConnectedAt = Date.now();
        coordinateStatus = "已找到戰鬥迴圈，等待座標";
        if (showWhileStopped || window.__roMenuHelper) status.textContent = coordinateStatus;
      })
      .catch(error => {
        coordinateStatus = "座標連線失敗：" + error.message;
        if (showWhileStopped || window.__roMenuHelper) status.textContent = coordinateStatus;
      })
      .finally(() => { coordinateRequest = undefined; });
    return coordinateRequest;
  };
  share.onclick = () => connectCoordinates(true, true);
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
      for (const [kind,values] of drafts) writeSetting(difficultyKey(kind),JSON.stringify(values));
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
    const saved = getDifficulty(mode);
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
  const stageVariantSuffix = /\s*[·・･]\s*改(\d*)(?=\s*(?:特殊關卡)?$)/u;
  const stageGroup = name => /特殊關卡|活動|節(?:・|$)|festival|event/i.test(name) ? "特殊活動" :
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
    const base = taiwanGame && stageGroup(normalized) !== "特殊活動" ? normalized.replace(stageVariantSuffix,"").trim() : normalized;
    return stageAliases.get(base) || base;
  };
  const seenStageKey = lap => taiwanGame ? "ro-helper-seen-stages-lap-" + lap : "ro-helper-seen-stages";
  function stageNamesForLap(lap) {
    const observed = readNames(seenStageKey(lap));
    const legacyEvents = taiwanGame ? readNames("ro-helper-seen-stages").filter(name =>
      stageGroup(name) === "特殊活動") : [];
    const names = [...knownStages,...(taiwanGame ? hansStages : [festivalStage]),...observed,...legacyEvents];
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
  function findSkillBanish(picker, names, basic, visible, used, boltsOnly) {
    if (!names.length && !basic && !boltsOnly) return null;
    let basicAction = null;
    for (const slot of picker?.querySelectorAll("#pk-cards .pk-slot") ?? []) {
      const card = slot.querySelector(".pk-card");
      const name = card?.querySelector(".pk-name")?.textContent.trim();
      if (!name) continue;
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
      ...bosses.map(([id,name]) => new Option(name,id)));
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
      formatHansDropForecast(previewStage(),getDifficulty(mode),mode);
  }
  function previewDifficultyMode() {
    const role = readSetting("ro-helper-party-role") ?? (readSetting("ro-helper-auto-party") === "on" ? "member" : "off");
    return stageMode.value !== "boss" && role !== "off" ? "party" : "solo";
  }
  function previewStage() {
    return stageMode.value === "rotation" || stageMode.value === "highest" ? dropStagePicker.value : fixedStage.value;
  }
  dropStagePicker.addEventListener("change",refreshStageDropPreview);
  if (taiwanGame) {
    difficultyButton.style.cssText = "margin-top:6px;background:#234b96;color:white;padding:5px 7px;border-radius:5px;cursor:pointer";
    stageSettings.append(dropStagePicker,stageDropPreview,difficultyButton);
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
  function inventoryWeaponMatches(filter, type) {
    if (!filter) return true;
    if (filter === "magic") return ["staff","book"].includes(type) || Object.hasOwn(inventoryArmorTypes,type);
    if (filter === "melee") return ["sword","twoHandSword","dagger","knuckle","katar","axe","twoHandAxe","spear","twoHandSpear","mace"].includes(type) || Object.hasOwn(inventoryArmorTypes,type);
    if (filter === "ranged") return ["bow","shuriken","handgun","rifle","shotgun","grenade","instrument","whip"].includes(type) || Object.hasOwn(inventoryArmorTypes,type);
    if (filter === "headgear") return type === "headgear" || Boolean(type?.startsWith("head_"));
    return filter === type;
  }
  function inventoryRules(settings) {
    const rules = Array.isArray(settings.rules) ? settings.rules : [{terms:settings.terms,page:0}];
    return rules.flatMap(rule => {
      if (!Array.isArray(rule?.terms) || !Number.isInteger(rule.page) || rule.page < 0 || rule.page > 6) return [];
      const terms = [...new Set(rule.terms.filter(term => Object.hasOwn(inventoryTerms,term)))];
      const tier = rule.tier ?? 0;
      const quality = rule.quality ?? 0;
      const weapon = rule.weapon ?? "";
      if (weapon && !["magic","melee","ranged"].includes(weapon) && !Object.hasOwn(inventoryWeaponTypes,weapon) && !Object.hasOwn(inventoryArmorTypes,weapon)) return [];
      if ((tier !== 0 && !validGearTier(tier)) ||
          !Number.isInteger(quality) || quality < 0 || quality >= inventoryQualities.length) return [];
      return terms.length || tier || quality || weapon ? [{terms,page:rule.page,tier,quality,weapon}] : [];
    });
  }
  function matchingInventoryRule(bonuses, rules, tier, quality, weaponType) {
    bonuses = randomInventoryBonuses(bonuses);
    let best;
    let bestSpecificity = 0;
    for (const rule of rules) {
      const specificity = rule.terms.length + Number(rule.tier > 0) + Number(rule.quality > 0) + Number(Boolean(rule.weapon));
      if (specificity <= bestSpecificity) continue;
      if ((rule.tier && (!Number.isInteger(tier) || tier < rule.tier)) || quality < rule.quality) continue;
      if (!inventoryWeaponMatches(rule.weapon,weaponType)) continue;
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
    function addRule({terms = [],page = 1,tier = 0,quality = 0,weapon = ""} = {}) {
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
      weaponField.append(new Option("不限職業／裝備",""),new Option("法系（防具、飾品、法杖、書）","magic"),
        new Option("近戰裝備（防具、飾品、近戰武器）","melee"),
        new Option("遠程裝備（防具、飾品、弓、槍械、手裏劍、樂器、鞭子）","ranged"),
        ...Object.entries(inventoryArmorTypes).map(([key,[label]]) => new Option("只留"+label,key)),
        ...Object.entries(inventoryWeaponTypes).map(([key,[label]]) => new Option("只留"+label,key)));
      weaponField.value = weapon;
      const copy = document.createElement("button");
      copy.type = "button";
      copy.textContent = "複製此規則";
      copy.onclick = () => addRule({
        page:Number(destination.value),
        tier:tierField.valueAsNumber,
        quality:Number(qualityField.value),
        weapon:weaponField.value,
        terms:fields.filter(([,input]) => input.checked).map(([term]) => term)
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "刪除此規則";
      const choices = document.createElement("div");
      choices.style.cssText = "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px";
      const fields = Object.keys(inventoryTerms).map(term => [term,checkbox(choices,term,terms.includes(term))]);
      const row = {destination,tierField,qualityField,weaponField,fields};
      remove.onclick = () => {
        rows.splice(rows.indexOf(row),1);
        fieldset.remove();
      };
      rows.push(row);
      fieldset.append(destination,tierField,qualityField,weaponField,copy,remove,choices);
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
      const rules = rows.map(({destination,tierField,qualityField,weaponField,fields}) => ({
        page:Number(destination.value),tier:tierField.valueAsNumber,quality:Number(qualityField.value),weapon:weaponField.value,terms:fields.filter(([,input]) => input.checked).map(([term]) => term)
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
    if ((!manual && !settings.store && !settings.sell) || !rules.length) return false;
    const find = selector => document.querySelector(selector);
    const reserve = find(".pf-leave[data-leave]") || previewDifficultyMode() === "party"
      ? normalizeBagReserve(settings.partyReserve,220) : normalizeBagReserve(settings.soloReserve,120);
    if (inventoryRun?.done && inventoryRun.reserve === reserve) return false;
    if (find("#ro-helper-settings[open], #ro-helper-stage-dialog[open]")) return true;
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
      const filterByType = rules.some(setting => setting.weapon);
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
        const bonuses = inventoryRandomAffixLines(uid);
        if(bonuses===null){close.click();continue;}
        const tierText = tip.querySelector(".tip-item .muted")?.textContent.normalize("NFKC") || "";
        const tier = readInventoryTier(tierText);
        const grade = [...cell.classList].map(name => name.match(/^q(\d+)$/)?.[1]).find(Boolean);
        const quality = grade === undefined ? 0 : Number(grade);
        const weaponType = filterByType ? readInventoryWeaponType(tip,tierText,gameGear) : null;
        const fixed = settings.requireFixed ? inventoryHasFixedAffixes(tip,uid,gameGear) : true;
        if(fixed===null){close.click();continue;}
        const rule = !fixed ? undefined : matchingInventoryRule(bonuses,rules,tier,quality,weaponType);
        close.click();
        if (hasCard) continue;
        if (rule && (settings.store || manual)) {
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
                recordDisposition(uid,"存倉","裝備整理存倉");
              }
              run.expires = Date.now()+35000;
              return true;
            }
          }
        }
        if (!rule && (settings.sell || manual) &&
            (Number.isInteger(tier) || !rules.some(setting => setting.tier)) &&
            (weaponType !== null || !rules.some(setting => setting.weapon)) &&
            (weaponType !== "headgear" || !rules.some(setting => setting.weapon?.startsWith("head_")))) run.reject.add(uid);
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
  function loadCardStopTarget() {
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
  function inBattleReadyForBank(hud,picker) {
    return Boolean((hud || picker) && !document.body.classList.contains("in-lobby") &&
      !document.querySelector("#gameover:not(.hidden)"));
  }
  function createLevelCardStop() {
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
      const byTargets = cardStopMode.value === "targets";
      const threshold = byTargets ? targetCount.valueAsNumber : noFlipLevel.valueAsNumber;
      const liveTargets = byTargets ? (skillTargets?.[targetSkill.value] ?? readTooltipTargets(targetSkill.value)) : undefined;
      if (byTargets) targetReadout.textContent = " 目前 "+(Number.isSafeInteger(liveTargets) ? liveTargets : "—")+(stopped ? " · 已停選" : "");
      const discoveryMode = chestMode.value === "discovery";
      const discoveryLimit = (chestDiscoveryThreshold.valueAsNumber || 300)/100;
      if (!discoveryMode) chestCutoff = false;
      else if (Number.isFinite(discovery)) chestCutoff = discovery >= discoveryLimit-1e-9;
      const canCollect = chestMode.value === "collect" || discoveryMode;
      const supportsSaving = Boolean(document.getElementById("sv-check"));
      const prioritizeDiscovery = canCollect && supportsSaving && discoveryTreasureMode();
      if (!prioritizeDiscovery) saveZeroDiscoveryChests = false;
      else if (!saveZeroDiscoveryChests && discovery === 0) {
        const slots = [...document.querySelectorAll("#runitems .run-slot")];
        saveZeroDiscoveryChests = slots.length > 0 && slots.every(slot => slot.hasAttribute("data-item"));
      }
      const saveChest = (chestCutoff || saveZeroDiscoveryChests) && supportsSaving;
      const savedChestStatus = saveZeroDiscoveryChests ? "寶物已滿、尋寶率 +0%，寶箱已保存" : "已達尋寶率門檻，寶箱已保存";
      if (!Number.isSafeInteger(threshold) || threshold < 1) stopped = false;
      if (byTargets && !stopped && Number.isSafeInteger(threshold) && threshold > 0 &&
          Number.isSafeInteger(liveTargets) && liveTargets >= threshold && document.getElementById("sv-check")) stopped = true;
      if (!byTargets && picker && !chest && !stopped && threshold > 0) {
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
      if (document.getElementById("sv-check-ch")) {
        const managesSkill = Number.isSafeInteger(threshold) && threshold > 0;
        if (managesSkill) { splitOwned.add(0); setSplit(0,stopped); }
        if (discoveryMode || prioritizeDiscovery || splitOwned.has(1)) { splitOwned.add(1); setSplit(1,saveChest); }
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
        status.textContent = chest ? savedChestStatus : "已達停選門檻，技能卡已保存";
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
      if (!taiwanGame || !((cardStopMode.value === "targets" ? targetCount.valueAsNumber : noFlipLevel.valueAsNumber) > 0 || chestMode.value === "discovery")) return;
      if (document.getElementById("sv-check-ch")) {
        const threshold = cardStopMode.value === "targets" ? targetCount.valueAsNumber : noFlipLevel.valueAsNumber;
        if (threshold > 0) setSplit(0,false);
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
  function matchesLootSearch([name,,,effects,english],query) {
    const stats = normalizeLootSearch(effects?.join(" "));
    const names = normalizeLootSearch(name+" "+(english || ""));
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
  lootHeader.append(lootHandle,lootClose);
  lootWindow.append(lootHeader,lootSearch,lootCategory,lootSlot,lootRows);
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
        if(matchingInventoryRule(stats||[],inventoryRules(inventorySettings()),tier,rank,type))storageSource="裝備整理存倉";
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
      snapshot(){const rows=[...stages.values()].map(row=>({...row}));return {completed:rows.reduce((n,r)=>n+r.completed,0),incomplete:rows.reduce((n,r)=>n+r.incomplete,0),stages:rows};}
    };
  }
  const runStatistics=createRunStatistics();

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
      false,0,
      dropRowMetadata(category,iconKey,name,stats,tier,rank,slot,ref,catalog)
    ]);
  }
  function refreshLootWindow() {
    if (lootWindow.hidden) return;
    const category = lootCategoryIndex;
    const categorized = collectLootRows(category);
    const selected = lootSelectedSlots[category];
    const filtered = categorized.filter(row =>
      (selected === "all" || lootFilterSlot(category,row[1]) === selected) && matchesLootSearch(row,lootSearch.value));
    const counts = new Map();
    for (const row of filtered) {
      const key = JSON.stringify(row);
      counts.set(key,(counts.get(key) || 0)+1);
    }
    const entries = [...counts].map(([key,count]) => ({item:JSON.parse(key),count}))
      .sort((a,b) => b.item[2]-a.item[2] || a.item[0].localeCompare(b.item[0],"zh-Hant"));
    const tiers = ["普通","優良","稀有","史詩（紫）","傳說（金）","神話"];
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.style.padding = "12px";
      empty.textContent = runs.size ? "目前沒有符合的掉落" : "等待本次掛機取得掉落物";
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
    entries.forEach(({item:[name,slot,rank,effects,english,disposition],count},index) => {
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
  function readLivePacket() {
    try { return JSON.parse(document.documentElement.dataset.roHelperLive || "null"); }
    catch { return null; }
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
  roundDiscoveryText.hidden = true;
  timerDisplay.append(roundTimerText,roundDiscoveryText,sessionTimerText);
  const formatDiscoveryBonus = bonus => Number.isFinite(bonus) ? "+" + Number((bonus * 100).toFixed(1)) + "%" : "—";
  function showTimers(startedAt, battleSeconds, totalBaseExp = 0, discoveryBonus) {
    const elapsed = startedAt === null ? 0 : (performance.now() - startedAt) / 1000;
    const rate = elapsed > 0 ? formatBaseRate(totalBaseExp * 60 / elapsed) : "—";
    const round = "本局時間 " + formatElapsed(battleSeconds);
    const discovery = " · 本局尋寶率 " + formatDiscoveryBonus(discoveryBonus);
    const session = "\n本次啟動時間 " + (startedAt === null ? "—" : formatElapsed(elapsed) + " · Base/分 " + rate);
    if (roundTimerText.data !== round) roundTimerText.data = round;
    if (roundDiscoveryText.textContent !== discovery) roundDiscoveryText.textContent = discovery;
    if (sessionTimerText.data !== session) sessionTimerText.data = session;
  }
  showTimers(null);
  let refreshRecovery;
  const toggle = (resuming = false) => {
    if (refreshRecovery && !resuming) {
      refreshRecovery = null;
      clearRefreshCheckpoint();
      status.textContent = "已取消刷新後接續，請進入角色後啟動助手";
      return;
    }
    if (window.__roMenuHelper) {
      window.__roMenuHelper.stop();
      return;
    }
    try {
      (()=>{if(!["ro-survivors.com","www.ro-survivors.com","ro.hans-webgametw.com"].includes(location.hostname))return;const key="__roMenuHelper";let stageName="", rotation={stage:undefined,completed:0}, rotationRun;const rejectedStages=new Set();let highestLap = "1";let lapTabRefreshed = false;const unavailableLaps = new Set();const visible=e=>e&&e.getClientRects().length&&!e.disabled&&getComputedStyle(e).visibility==="visible"&&!e.closest("[hidden],[inert],[aria-hidden=true]");const label=e=>e.innerText.trim();const buttons=()=>[...document.querySelectorAll("button,[role=button]")].filter(visible);const click=e=>{last=e;e.click()};let pickerFirstCard=null,pickerReadyAt=0,attemptedCard=null,attempts=0;const blocked=new Map();const trackPickup=createPickupTracker();let previousPosition=null,previousDirection=null,still=0,escapeDirection=-1,escapeUntil=0;let retriedCoordinates=false;let movePulse,nextMenuAt=0,nextCaptureAt=0,lastCoordinateAt=0;let last,held,index=0,departing=false,retriedSoloDialog=false;const route=["d","s","a","w","wd","sd","sa","wa"];const probe=document.createElement("canvas");probe.width=probe.height=128;const ctx=probe.getContext("2d",{willReadFrequently:true});const directions=[[1,0],[0,1],[-1,0],[0,-1]];let captureStatus="正在等候分頁截圖",screenshot=null,requested=false,stamp=0,previousFrame=null;const assess=()=>{const canvas=[...document.querySelectorAll("canvas")].filter(visible).sort((a,b)=>b.width*b.height-a.width*a.height)[0];if((!canvas&&!sharedVideo)||!ctx)return null;try{ctx.clearRect(0,0,128,128);if(sharedVideo?.readyState>=2){const r=canvas?.getBoundingClientRect()||{left:0,top:0,width:innerWidth,height:innerHeight},sx=sharedVideo.videoWidth/innerWidth,sy=sharedVideo.videoHeight/innerHeight;ctx.drawImage(sharedVideo,r.left*sx,r.top*sy,r.width*sx,r.height*sy,0,0,128,128)}else if(screenshot&&Date.now()-stamp<1600){const r=canvas.getBoundingClientRect(),sx=screenshot.width/innerWidth,sy=screenshot.height/innerHeight;ctx.drawImage(screenshot,r.left*sx,r.top*sy,r.width*sx,r.height*sy,0,0,128,128)}else{ctx.drawImage(canvas,0,0,128,128)}const data=ctx.getImageData(0,0,128,128).data;let content=0;const red=(x,y)=>{const i=(128*y+x)*4;return data[i+3]>150&&data[i]>95&&data[i]>1.45*data[i+1]&&data[i]>1.32*data[i+2]};for(let i=0;i<data.length;i+=64)if(data[i+3]>150&&data[i]+data[i+1]+data[i+2]>45)content++;if(content<60)return null;const prior=previousFrame;previousFrame=data;let shiftX=0,shiftY=0,alignment=Infinity;if(prior){for(let dy=-16;dy<=16;dy+=2)for(let dx=-16;dx<=16;dx+=2){let error=0;for(let y=24;y<104;y+=8)for(let x=24;x<104;x+=8){if(x>48&&x<80&&y>48&&y<80)continue;const i=(128*y+x)*4,j=(128*(y+dy)+x+dx)*4;error+=Math.abs(data[i]-prior[j])+Math.abs(data[i+1]-prior[j+1])+Math.abs(data[i+2]-prior[j+2])}if(error<alignment){alignment=error;shiftX=dx;shiftY=dy}}}const moving=(x,y)=>{if(!prior||alignment>3600)return false;const i=(128*y+x)*4,j=(128*(y+shiftY)+x+shiftX)*4;return Math.abs(data[i]-prior[j])+Math.abs(data[i+1]-prior[j+1])+Math.abs(data[i+2]-prior[j+2])>85};return directions.map(([dx,dy])=>{let score=0;for(let step=4;step<=22;step++)for(let side=-5;side<=5;side++){{const x=64+dx*step-dy*side,y=64+dy*step+dx*side;if(red(x,y))score+=12;else if(moving(x,y))score+=step<=12?3:1}}let nearMotion=0,nearRed=0;for(let step=8;step<=16;step++)for(let side=-4;side<=4;side++){const x=64+dx*step-dy*side,y=64+dy*step+dx*side;if(red(x,y))nearRed++;else if(moving(x,y))nearMotion++}const uncertain=!prior||alignment>3600;const unsafe=nearRed>=4||(!uncertain&&nearMotion>=12);let chest=0,loot=0;for(let step=7;step<=22;step++)for(let side=-6;side<=6;side++){const x=64+dx*step-dy*side,y=64+dy*step+dx*side,i=(128*y+x)*4;const r=data[i],g=data[i+1],b=data[i+2],w=23-step;if(r>75&&g>55&&r>g*1.06&&r<g*1.7&&g>b*1.32){const j=i-1024;if(data[j]>data[j+1]*1.12&&data[j+1]>data[j+2]*1.15)chest+=w;else loot+=w}else if(b>70&&b>r*1.24&&b>g*1.12&&data[i+6]<b*0.9)loot+=w}return {score,chest,loot,unsafe,uncertain}})}catch{return null}};const send=(type,k)=>(document.activeElement||document.body).dispatchEvent(new KeyboardEvent(type,{key:k,code:"Key"+k.toUpperCase(),bubbles:true,cancelable:true,keyCode:k.toUpperCase().charCodeAt(0),which:k.toUpperCase().charCodeAt(0)}));const release=()=>{if(held){for(const key of held)send("keyup",key);held=null}};const confirmDrop=createDropConfirmation();const acceptedFinalDialogs=new WeakSet();const confirmedParty=new WeakSet();let returnedResult;let bossLootEmptySince;let settlementSeenAt = 0;const usedRerolls=new WeakSet();const usedFocus=new WeakSet();const discoveryFocused=new Set();const usedBanish=new WeakSet();const startedAt = performance.now();
let battleStartedAt = null;
inventoryRun = undefined;
let patrolStartedAt = null;
lootHistory.clear();
    runStatistics.reset();
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
let settledBaseExp = 0;
let liveBaseExp = 0;
let countedBaseSettlement = Boolean(document.querySelector("#gameover:not(.hidden)"));
showTimers(startedAt);
let hansHighDifficultyUntil = 0;
const levelCardStop = createLevelCardStop();
window.addEventListener("pagehide",levelCardStop.reset);
const timer=setInterval(()=>{
  if (document.getElementById("ro-helper-transfer-settings")?.open) { release(); return; }
  if (handleRefreshDialog()) { release(); return; }
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
  const battleHud = document.querySelector("#hud:not(.hidden)");
  if (document.body.classList.contains("in-lobby") || document.querySelector("#gameover:not(.hidden)")) levelCardStop.endRound();
  else if (inBattleReadyForBank(battleHud,document.querySelector("#picker:not(.hidden)"))) levelCardStop.beginRound();
  applyExpeditionSpeed(battleHud);
  const lootPacket = readLivePacket();
  if (taiwanGame && (!battleHud || stageMode.value !== "boss")) {
    bossLootEmptySince = undefined;
    delete document.documentElement.dataset.roHelperBossCleanup;
  }
  const settlement = document.querySelector("#gameover:not(.hidden)");
  runStatistics.update(lootPacket?{...lootPacket,stageLabel:runStageNames[lootPacket.stageId]||lootPacket.stageId}:null,settlement,Boolean(battleHud)&&!document.body.classList.contains("in-lobby"),document.body.classList.contains("in-lobby"),worldBossActive());
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
  if (handleWorldBoss()) { release(); return; }
  if (handleLobbySelection() || runInventoryCleanup()) {
    release();
    return;
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
  showTimers(startedAt, battleStartedAt === null ? undefined : (now - battleStartedAt) / 1000, settledBaseExp + liveBaseExp, discoveryBonus);
  if (settlement || !battleHud && !choosingCard) patrolStartedAt = null;
  const dataset = document.documentElement.dataset;
  const discoveryMode = chestMode.value === "discovery";
  dataset.roHelperSkipChest = chestMode.value === "pass" || chestMode.value === "avoid" ? "on" : "off";
  if (discoveryMode) {
    dataset.roHelperChestDiscovery = chestDiscoveryThreshold.value || "300";
    chestDiscoveryStatus.textContent = "目前 " + formatDiscoveryBonus(discoveryBonus);
  } else {
    delete dataset.roHelperChestDiscovery;
  }
  if(document.hidden||document.querySelector("#ro-helper-settings[open], #ro-helper-stage-dialog[open]")){release();return}if (taiwanGame) {
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
  if (taiwanGame && stageMode.value === "boss" && battleHud && lootPacket?.bossFarm && Math.abs(Date.now()-lootPacket.at)<750) {
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
const hud=document.body.innerText;const visiblePicker=document.querySelector("#picker:not(.hidden)");const pickerTitle=visiblePicker?.querySelector("#pk-title")?.textContent || "";const pickerSubtitle=visiblePicker?.querySelector("#pk-sub")?.textContent || "";const chest=!!visiblePicker && /寶箱|寶物箱|(?:treasure\s+)?chest|cofre/i.test(pickerTitle);const picking=!!visiblePicker && (chest || /升級|level\s*up/i.test(pickerTitle) || /(?:選擇|強化)\s*技能|(?:choose|upgrade)\s+(?:a\s+)?skill|elige una habilidad|mejora una habilidad/i.test(pickerSubtitle));if (!worldBossActive() && inBattleReadyForBank(battleHud,visiblePicker) && levelCardStop.act(picking ? visiblePicker : null,chest,discoveryBonus,
  Math.abs(Date.now()-lootPacket?.at) < 750 ? lootPacket.skillTargets : null)) { release(); return; }
const inBattle=Boolean(battleHud)||(/\bEXP\b/.test(hud)&&/\b\d{2}:\d{2}\b/.test(hud)&&/\(\s*-?\d+\s*,\s*-?\d+\s*\)/.test(hud));if(inBattle){partyWaitingUntil=0;retriedSoloDialog=false}if(partyLeader&&!inBattle&&!picking&&!result&&Date.now()<partyWaitingUntil){release();return}if(partyMember&&!inBattle&&!picking&&!result){release();status.textContent=followLeader?"跟隨隊長：等待隊伍出發確認":"隊員模式：等待隊伍出發確認";return}if(!stageName&&!captain&&!inBattle&&!picking&&!result){status.textContent="請先開啟遠征選單";return}const stage=stageName===highestStageMode?highestPlayableStage(stageCards,rejectedStages,Boolean(go)):stageCards.find(card=>baseExpeditionName(stageNameOf(card))===stageName&&!stageIsLocked(card));let next;if(!picking){pickerFirstCard=null;attemptedCard=null;attempts=0;nextMenuAt=0}if(picking){release();const picker = document.querySelector("#picker");
if (!picker || picker.classList.contains("hidden") || picker.classList.contains("closing")) return;
const confirm = picker.querySelector("#pk-cards .pk-slot.asking [data-yes]");
if (visible(confirm)) {
  status.textContent = "確認選卡";
  confirm.click();
  return;
}
const cards = [...picker.querySelectorAll("#pk-cards .pk-card[data-i]")].filter(visible);
if (cards[0] !== pickerFirstCard) {
  pickerFirstCard = cards[0];
  // The game unlocks selection after 380 ms plus 120 ms per card.
  pickerReadyAt = Date.now() + 381 + cards.length * 120;
  nextMenuAt = 0;
  attemptedCard = null;
  attempts = 0;
}
if (!cards.length || Date.now() < Math.max(pickerReadyAt, nextMenuAt)) return;
const arrowMode = chest ? "off" : arrowSetting("mode");
const boltsOnly = arrowMode === "boltsOnly";
const targetsFirst = arrowMode === "targetsFirst";
const legacyTreasureName=e=>label(e).split(/\n/).map(t=>t.trim()).find(t=>t&&!/^(?:[123]|普通|優良|稀有|史詩|傳說|神話|技能|新[！!])$/.test(t))||"";
const treasureName = card => treasureCardName(card,card.querySelector(".pk-name") ? "" : legacyTreasureName(card));if(chest){const seen=[...new Set([...treasureList(),...cards.map(e=>normalizeTreasure(treasureName(e))).filter(Boolean)])];writeSetting("ro-helper-treasures",JSON.stringify(seen))}else{const job=activeSkillJob();if(job?.id){const key="ro-helper-seen-skills-"+job.id;const basic=cards.map(skillCardName).filter(isBasicAttack);if(basic.length)writeSetting(key,JSON.stringify([...new Set([...readNames(key),...basic])]))}}if (!chest) {
  const picker = document.querySelector("#picker:not(.hidden):not(.closing)");
  const banish = findSkillBanish(picker, banishSkills(), banishBasic(), visible, usedBanish, boltsOnly);
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
const rankedDiscovery = discoveryModeForTreasure ? cards.map(card=>({
  card,name:treasureName(card),
  bonus:treasureDiscoveryGain(card,equippedDiscovery)
})).filter(entry=>entry.bonus > 0).sort((a,b)=>b.bonus-a.bonus) : [];
const focusNames = discoveryModeForTreasure
  ? (discoveryFocused.size < 2 ? rankedDiscovery.map(entry=>entry.name).filter(name=>!discoveryFocused.has(normalizeTreasure(name))) : [])
  : chest ? treasureFocusKeys.map(focusTreasure)
  : discoveryTreasureMode() && discoveryFocused.size < 2 ? [] : [focusSkill()];
if (boltsOnly && !elementalArrows.some(([, zh, en]) => [zh,en].includes(focusNames[0]))) focusNames.length = 0;
for (const focusName of focusNames) {
  const focusAction = findFocusAction(picker, focusName, chest, visible, usedFocus);
  if (!focusAction) continue;
  usedFocus.add(focusAction);
  if (discoveryModeForTreasure) discoveryFocused.add(normalizeTreasure(focusName));
  status.textContent = (chest ? "已專注寶物：" : "已專注技能：") + focusName;
  nextMenuAt = Date.now() + 320;
  focusAction.click();
  return;
}
const sameSkill = chest || boltsOnly || targetsFirst ? null : highestRaritySameSkill(cards);
let elementalChoice;
if (arrowMode === "on" || boltsOnly) {
  const equipped = document.querySelectorAll("#lu-sockets [data-skill], #skillbar [data-skill]");
  const owned = [...equipped].some(slot => elementalArrows.some(([id]) => id === slot.dataset.skill));
  elementalChoice = selectElementalArrow(cards,owned,
    starterArrows(),arrowSetting("preference") || "shots");
  if(boltsOnly)elementalChoice=selectPreferredArrowUpgrade(cards,arrowSetting("preference")||"shots") || elementalChoice;
}
const startingChoice = chest || boltsOnly || targetsFirst ? null : selectStartingSkill(cards,starterArrows(),arrowMode === "on");
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
if ((discoveryModeForTreasure ? rankedDiscovery.length === 0 : autoReroll && (categoryModeForTreasure || boltsOnly || priorities.length) && !preferred) &&
    cards.length && !elementalChoice && !startingChoice && !sameSkill) {
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
const card = boltsOnly ? preferred || elementalChoice :
  elementalChoice || startingChoice || sameSkill || rankedDiscovery[0]?.card || preferred || attemptedCard ||
  (chest ? cards[Math.floor(Math.random() * cards.length)] : cards[0]);
if (!card) {
  status.textContent = "三元素箭：目前牌面沒有可選技能，且無可用重抽／放逐";
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
}else if(stage){if(!stage.classList.contains("sel")){next=stage}else if(go&&!departing){next=go;departing=true;if(taiwanGame) hansHighDifficultyUntil=Date.now()+30000;rotationRun=stageMode.value==="rotation"?{stage:stageName}:undefined}}else if(stageCards.length&&stageName){release();status.textContent=stageName===highestStageMode?"目前沒有可出發的一般關卡":"指定關卡目前無法出發："+stageName;return}else if(!go&&!field){departing=false;if(captain)next=captain}if(!next){if(last?.id!=="stg-go")last=undefined;const view=document.body.innerText;const battle=!visiblePicker&&!picking&&!result&&!go&&!field&&!captain&&inBattle&&!document.querySelector("#picker:not(.hidden), #gameover:not(.hidden), #npc-dialog:not(.hidden)")&&!/(暫停|繼續遊戲)/.test(view)&&!document.activeElement?.matches("input,textarea,select,[contenteditable=true]");release();if(battle){const packet=readLivePacket();const stationaryMagnetOnly=!autoMove;const manualMagnetDue=updateTimedMagnet(packet,true);const manualMagnetPlan=manualMagnetAction(packet,manualMagnetDue,magnetSchedule.cleanupCollected,document.documentElement.dataset.roHelperBossCleanup==="on");if(stationaryMagnetOnly&&manualMagnetPlan==="idle"){blocked.clear();previousPosition=null;previousDirection=null;escapeDirection=-1;escapeUntil=0;status.textContent=gearPickupToggle.value==="timed"?(manualMagnetDue?"原地待命：等待可撿取的磁鐵":"原地待命：等待磁鐵間隔"):"手動移動";return}const fresh=packet&&Date.now()-packet.at>=0&&Date.now()-packet.at<750&&packet.routes?.length===route.length;if (!fresh) {
  if (gearMovementMode.value === "smart" || stationaryMagnetOnly) {
    const {roHelperError,roHelperPhase} = document.documentElement.dataset;
    status.textContent = "智慧走位：" + (roHelperError || roHelperPhase || "等待即時戰鬥資料");
    return;
  }
  patrolStartedAt ??= performance.now();
  const patrol = ["d","s","a","w"];
  held = patrol[Math.floor((performance.now() - patrolStartedAt) / 2300) % patrol.length];
  send("keydown",held);
  clearTimeout(movePulse);
  movePulse = setTimeout(release,145);
  status.textContent = "Gear｜自動巡走";
  return;
}retriedCoordinates=false;
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
const finalBossTarget = packet.finalBoss;
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
    return Math.abs(Math.hypot(x-finalBossTarget[0],y-finalBossTarget[1])-(worldBossShield()?850:worldBossActive()?250:145));
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
}if(escaping){if(escapeDirection!==best||Date.now()>=escapeUntil){escapeDirection=best;escapeUntil=Date.now()+650}}else{escapeDirection=-1;escapeUntil=0}status.textContent=evadingRed?"座標｜閃避紅圈":usingMagnet?"走位：優先撿磁鐵":forced.length?"座標｜強制撿裝備／卡片":escaping?"座標｜走位：脫離怪群":finalBossTarget?(worldBossActive()?(worldBossShield()?"世界王｜護盾期間退開躲招":"世界王｜攻擊並優先閃避"):"座標｜尾王優先"):cleanup?"清場收尾：撿取裝備與卡片":followLeader?"座標｜跟隨隊長":(fresh?"座標｜":"畫面｜")+(chosen.chest?"走位：靠近寶箱":chosen.loot?(pickup?.kind === "magnet" ? "走位：靠近磁鐵" : pickup?.kind === "ball" ? "走位：撿燈籠節扭蛋" : "走位：靠近掉落物"):timedMagnet?(timedMagnetDue?"走位：等待可撿取的磁鐵":"走位：等待磁鐵間隔"):"走位：巡找掉落物");held=route[best];previousDirection=held;if(still>=2)status.textContent="座標未變：換方向避開卡點";for(const key of held)send("keydown",key);clearTimeout(movePulse);movePulse=setTimeout(release,escaping?155:chosen.uncertain?80:145)}else{status.textContent="已暫停走位："+captureStatus+""}}else if(picking){status.textContent="偵測到升級，但找不到可選卡片"}return}previousPosition=null;previousDirection=null;escapeDirection=-1;escapeUntil=0;release();if(picking)status.textContent="選擇技能："+label(next).split(/\n/).slice(0,4).join(" ");if(next!==last||next===go||next===stage)click(next)},160);const stop=(preserveRefresh=false)=>{if(!preserveRefresh)clearRefreshCheckpoint();window.removeEventListener("pagehide",levelCardStop.reset);levelCardStop.reset();requestLobbyNpc("cancel");delete document.documentElement.dataset.roHelperBossCleanup;delete document.documentElement.dataset.roHelperSkipChest;delete document.documentElement.dataset.roHelperChestDiscovery;if(sharedVideo){sharedVideo.srcObject.getTracks().forEach(track=>track.stop());sharedVideo=null}clearInterval(timer);clearTimeout(movePulse);delete document.documentElement.dataset.roHelperWorldBoss;release();rotationProgress.textContent="";window.removeEventListener("blur",release);
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

})();
    } catch (error) { status.textContent = "載入失敗：" + error.message; }
  };
  button.addEventListener("click", event => { event.stopPropagation(); toggle(); });
  const gpuSaver = document.createElement("button");
  gpuSaver.type = "button";
  const gpuShade = document.createElement("div");
  gpuShade.setAttribute("aria-hidden", "true");
  gpuShade.style.cssText = "position:fixed;inset:0;background:#000;z-index:2147483646;pointer-events:none;display:none";
  const refreshGpuSaver = enabled => {
    document.documentElement.dataset.roHelperGpuSaver = enabled ? "on" : "off";
    gpuShade.style.display = enabled ? "block" : "none";
    gpuSaver.textContent = enabled ? "節省 GPU：開" : "節省 GPU：關";
    gpuSaver.setAttribute("aria-pressed", String(enabled));
  };
  gpuSaver.addEventListener("click", () =>
    refreshGpuSaver(document.documentElement.dataset.roHelperGpuSaver !== "on"));
  refreshGpuSaver(false);
  document.body.append(gpuShade);
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
    if (document.querySelector("#ro-helper-settings[open], #ro-helper-stage-dialog[open]")) return;
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
    if (!inventoryRules(inventorySettings()).length) {
      status.textContent = "請先在裝備整理設定保留規則";
      return;
    }
    if (inventoryRun && !inventoryRun.done && ["open","scan","shop","sold"].includes(inventoryRun.phase)) return;
    if (document.querySelector(".overlay:not(.hidden), #ro-helper-settings[open], #ro-helper-stage-dialog[open]")) {
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
  for (const shortcut of [compactToggle,compactOrganize,compactLoot,compactStage]) {
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
  for (const control of [button, gpuSaver, autoLoginToggle, loginCharacterSetting, settingsTransferButton, ...(taiwanGame ? [worldBossToggle,worldBossMode,worldBossLeadRow] : []), movementToggle, gearMovementMode, gearPickupToggle, magnetIntervalSetting, collisionMode, lootButton, settings, treasureButton, ...(taiwanGame ? [inventoryButton] : [difficultyButton]), chestMode, chestDiscoverySetting, ...(taiwanGame ? [cardStopMode,noFlipSetting,targetStop] : []), rollChoice, partyMode, rerollToggle, skillFocus.select, ...treasureFocus.map(choice => choice.select)]) {
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
  addPanelGroup("技能／寶物選牌",[settings,treasureButton,skillFocus.select,...treasureFocus.map(choice=>choice.select),rerollToggle,...(taiwanGame?[cardStopMode,noFlipSetting,targetStop]:[])]);
  addPanelGroup("裝備／角色整理",taiwanGame?[inventoryButton]:[]);
  addPanelGroup("拾取設定",[gearPickupToggle,magnetIntervalSetting,chestMode,chestDiscoverySetting]);
  addPanelGroup("移動／系統",[movementToggle,gearMovementMode,collisionMode,gpuSaver,autoLoginToggle,loginCharacterSetting]);
  addPanelGroup("組隊／世界王",[partyMode,rollChoice,...(taiwanGame?[worldBossToggle,worldBossMode,worldBossLeadRow]:[])]);
  addPanelGroup("掉落／設定備份",[lootButton,settingsTransferButton]);
  if (!taiwanGame) stageSettings.append(difficultyButton);
  stageSettings.style.cssText = panelGroupStyle+";margin-top:6px;padding:0";
  stageSummary.style.cssText = panelSummaryStyle;
  stageSettings.addEventListener("toggle",()=>{
    if(stageSettings.open && stageSettings.parentElement===content)panelGroups.forEach(group=>group.open=false);
  });
  status.style.cssText = "padding:5px 2px 0;overflow-wrap:anywhere";
  content.append(actions, stageSettings, timerDisplay, status);
  const minimize = document.createElement("button");
  minimize.type = "button";
  minimize.textContent = "縮到最小";
  minimize.style.cssText = collapse.style.cssText;
  const restore = document.createElement("button");
  restore.type = "button";
  restore.textContent = "Ⅱ";
  restore.title = "放大 RO 助手";
  restore.setAttribute("aria-label", "放大 RO 助手");
  restore.style.cssText = "display:none;width:44px;height:44px;border-radius:50%;padding:0;border:1px solid #949fb3;background:#d2d8e5;color:#173569;font:bold 18px/1 system-ui;cursor:grab;touch-action:none;user-select:none";
  footer.prepend(minimize);
  header.append(compactToggle, compactOrganize, compactLoot, compactStage, collapse);
  panel.append(header, content, footer, restore);
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
  const showCollapsed = () => {
    const minimized = preference.minimized === true;
    header.style.display = minimized ? "none" : "flex";
    content.style.display = minimized ? "none" : "";
    footer.style.display = minimized ? "none" : "flex";
    restore.style.display = minimized ? "block" : "none";
    panel.style.background = minimized ? "transparent" : "#173569";
    panel.style.borderColor = minimized ? "transparent" : "#839bd1";
    const collapsed = preference.collapsed === true;
    roundDiscoveryText.hidden = !collapsed;
    header.style.justifyContent = collapsed ? "flex-start" : "flex-end";
    actions.style.display = collapsed ? "none" : "flex";
    compactLoot.hidden = !collapsed;
    compactToggle.hidden = !collapsed;
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
  for (const [control,minimized] of [[minimize,true],[restore,false]]) {
    control.addEventListener("click", event => {
      event.stopPropagation();
      if (!minimized && suppressRestoreClick && event.detail !== 0) {
        suppressRestoreClick = false;
        return;
      }
      preference.minimized = minimized;
      showCollapsed();
      if (!minimized && Number.isFinite(preference.x) && Number.isFinite(preference.y)) movePanel(preference.x,preference.y);
      clampPanel();
      savePanel();
    });
  }
  let suppressRestoreClick = false;
  let iconDrag;
  restore.addEventListener("pointerdown", event => {
    if (event.button !== 0 || iconDrag) return;
    suppressRestoreClick = false;
    const {left,top} = panel.getBoundingClientRect();
    iconDrag = {id:event.pointerId,x:event.clientX,y:event.clientY,left,top,moved:false};
    restore.setPointerCapture(event.pointerId);
    event.stopPropagation();
  });
  restore.addEventListener("pointermove", event => {
    if (iconDrag?.id !== event.pointerId) return;
    const dx = event.clientX - iconDrag.x;
    const dy = event.clientY - iconDrag.y;
    if (!iconDrag.moved && Math.hypot(dx,dy) < 6) return;
    iconDrag.moved = true;
    Object.assign(preference,movePanel(iconDrag.left + dx,iconDrag.top + dy));
    event.stopPropagation();
  });
  const finishIconDrag = event => {
    if (iconDrag?.id !== event.pointerId) return;
    suppressRestoreClick = iconDrag.moved;
    if (iconDrag.moved) savePanel();
    iconDrag = undefined;
  };
  for (const type of ["pointerup","pointercancel","lostpointercapture"]) restore.addEventListener(type,finishIconDrag);
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
    activeAccount = nextAccount;
    refreshWorldBossToggle();
    refreshWorldBossMode();
    loginCharacterInput.value = String(loginCharacterNumber());
    skillJob = undefined;
    inventoryRun = undefined;
    lootHistory.clear();
    runStatistics.reset();
    dropRefByUid.clear();
    dropDispositions.clear();
    dropStorageSources.clear();
    revealedLoot.clear();
    settledLoot.clear();
    refreshLootWindow();
    refreshGpuSaver(false);
    loadStageSettings();
    autoMove = readSetting("ro-helper-auto-move") !== "off";
    forceGearPickup = readSetting("ro-helper-force-gear") === "on";
    magnetSchedule = {last:0,time:null,token:document.documentElement.dataset.roHelperMagnetCollected || ""};
    autoReroll = readSetting("ro-helper-auto-reroll") !== "off";
    collisionMode.value = readSetting("ro-helper-collision-mode") === "always" ? "always" : "pickup";
    loadChestMode();
    loadNoFlipLevel();
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
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",mountGearAssistant,{once:true});
else mountGearAssistant();
