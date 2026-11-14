// ==UserScript==
// @name RO 練等助手 Gear 試用版
// @namespace ro-survivors-helper
// @version 2.0
// @updateURL https://raw.githubusercontent.com/UnderPikaSui/ro-survivors-gear/main/RO-Survivors-Gear.user.js
// @downloadURL https://raw.githubusercontent.com/UnderPikaSui/ro-survivors-gear/main/RO-Survivors-Gear.user.js
// @match https://ro-survivors.com/*
// @run-at document-start
// @unwrap
// @noframes
// ==/UserScript==
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

function victoryCleanup(game, dataset, now, emptySince) {
  if (!(game.lootUntil >= 0) || game.enemies.some(enemy => !enemy.dead)) {
    emptySince.delete(game);
    return null;
  }
  const gear = game.pickups.filter(item => !item.dead && (item.kind === "loot" || item.kind === "card"));
  if (gear.length) emptySince.delete(game);
  else if (!emptySince.has(game)) emptySince.set(game, now);
  const ready = !gear.length && now - emptySince.get(game) >= 1000;
  const requestedAt = Number(dataset.roHelperFinishVictory);
  const canFinish = !game.coop || game.coop.isHost === true;
  if (canFinish && !game.story && !game.endless && game.state === "playing" && game.closeAt >= 0 &&
      ready && now - requestedAt >= 0 && now - requestedAt < 750) {
    // Advance through the game's normal victory settlement on the next update.
    game.closeAt = game.time;
  }
  return {gear: gear.map(item => [item.kind, item.x, item.y]), canFinish, ready};
}

function readGearWaypoint(game, cleanup, cache, now) {
  const {x,y} = game.player;
  const isGear = item => !item.dead && (item.kind === "loot" || item.kind === "card");
  const distance = item => Math.hypot(item.x-x,item.y-y);
  const previous = cache.get(game);
  if (previous && now < previous.retryAt) {
    const {item,point} = previous;
    if (!item || (isGear(item) && game.pickups.includes(item) &&
        Math.hypot(item.x-previous.x,item.y-previous.y)<24 && Math.hypot(point.x-x,point.y-y)>12)) return point;
  }
  const choices = game.pickups.filter(item => isGear(item) && (cleanup || distance(item)<800))
    .sort((a,b) => distance(a)-distance(b));
  if (previous?.item && choices.includes(previous.item)) {
    choices.splice(choices.indexOf(previous.item),1);
    choices.unshift(previous.item);
  }
  for (const item of choices.slice(0,4)) {
    const walk = game.walk;
    const [tx,ty] = walk?.nearestWalkable ? walk.nearestWalkable(item.x,item.y) : [item.x,item.y];
    const path = walk?.pathTo ? walk.pathTo(x,y,tx,ty) : [{x:tx,y:ty}];
    const point = path?.find(step => Math.hypot(step.x-x,step.y-y)>8);
    if (!point) continue;
    cache.set(game,{item,point,x:item.x,y:item.y,retryAt:now+450});
    return point;
  }
  cache.set(game,{point:null,retryAt:now+450});
  return null;
}


  const gameOrigin = "https://ro-survivors.com/";
function isGameScript(url) {
  try {
    const script = new URL(url);
    return script.origin === new URL(gameOrigin).origin && /\.(?:m?js)$/i.test(script.pathname);
  } catch {
    return false;
  }
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
  const lootImports = [gearAlias,dropNames?.[1],dropNames?.[2],iconAlias].map(alias => {
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
    lootAliases: [gearAlias,dropNames?.[1],dropNames?.[2],iconAlias],
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
            if (!(alpha>0) || ![x,y,w,h,rotation].every(Number.isFinite) || w<=0 || h<=0) return [];
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
  const lootSnapshot = () => undefined;
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
        const movement = locateBattleLoop(await response.text())?.movementImport;
        if (!movement) continue;
        const target = new URL(movement.path,url);
        if (target.origin !== location.origin) continue;
        const module = await import(target.href);
        if (typeof module[movement.name] === "function") {
          direction = module[movement.name];
          break;
        }
      } catch {}
    }
    loading = false;
    if (!direction) setPhase("已讀到戰鬥物件，但找不到移動方向函式");
  }
  const defineProperty = Object.defineProperty;
  function capturePlayer(target, key) {
    if (key === "player" && typeof target.renderWorld === "function") {
      active = target;
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
    if (!document.querySelector("#hud:not(.hidden)")) return;
    if (!z?.player) {
      setPhase("進場了，但 Gear 尚未讀到戰鬥物件");
      return;
    }
    if (!direction && performance.now() - lastAttempt >= 5000) {
      lastAttempt = performance.now();
      void findDirection();
    }
    if (!direction) return;
    try { (() => { const root = document.documentElement; if (!z?.player || performance.now() - Number(root.dataset.roHelperLast || 0) < 100) return false; const {x,y} = z.player; const partyLeader = readPartyLeader(z, performance.now()); const cleanup = victoryCleanup(z,root.dataset,Date.now(),victoryEmptySince); const gearWaypoint = readGearWaypoint(z,cleanup,gearPaths,performance.now()); const reach = gearWaypoint ? Math.max(24,Math.min(60,Math.hypot(gearWaypoint.x-x,gearWaypoint.y-y))) : 60; const routes = [[1,0],[0,1],[-1,0],[0,-1],[1,-1],[1,1],[-1,1],[-1,-1]].map(([dx,dy]) => { const length=Math.hypot(dx,dy); const [vx,vy]=direction(dx/length,dy/length); const clear=[.2,.4,.6,.8,1].every(fraction=>{const step=reach*fraction;const tx=x+vx*step,ty=y+vy*step;return tx>=z.bounds.x0&&tx<=z.bounds.x1&&ty>=z.bounds.y0&&ty<=z.bounds.y1&&(!z.walk||z.walk.walkable(tx,ty))});return [x+vx*reach,y+vy*reach,clear] }); const nearby=e=>!e.dead&&Math.hypot(e.x-x,e.y-y)<520; root.dataset.roHelperLive=JSON.stringify({at:Date.now(),battleSeconds:z.time,lootLog:lootSnapshot(z),player:[x,y],...partyLeader,cleanup,gearWaypoint,routes,zeny:z.zeny,chestCost:z.chestCost(),hazards:readHazards(z),bell:readBell(z),enemies:z.enemies.filter(nearby).map(e=>[e.x,e.y]),drops:z.pickups.filter(e=>!e.dead&&Math.hypot(e.x-x,e.y-y)<(e.kind==='loot'||e.kind==='card'?800:520)).map(e=>[e.kind,e.x,e.y])});root.dataset.roHelperLast=String(performance.now());return false })(); setPhase(""); delete document.documentElement.dataset.roHelperError; } catch (error) {
      document.documentElement.dataset.roHelperError = error.message;
    }
  },100);
})();

function mountGearAssistant() {
(() => {
  if (window.top !== window || document.querySelector('section[aria-label="RO 練等助手"]')) return;
  const button = document.createElement("button");
  button.type = "button";
  const updateAssistantButton = running => {
    button.textContent = "RO 練等助手 " + "Gear V2.0" + " · " + (running ? "啟動中" : "已關閉");
    button.setAttribute("aria-pressed", String(running));
  };
  updateAssistantButton(false);
  button.style.cssText = "position:fixed;top:92px;right:12px;z-index:2147483647;pointer-events:auto;background:#234b96;color:white;padding:10px;border-radius:8px";
  const status = document.createElement("div");
  status.style.cssText = "position:fixed;top:135px;right:12px;z-index:2147483647;background:#173569;color:white;padding:8px";
  status.textContent = "已載入，尚未啟動";
  const accountScope = () => {
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
  const readSetting = key => localStorage.getItem(settingKey(key)) ?? localStorage.getItem(key);
  const writeSetting = (key, value) => localStorage.setItem(settingKey(key), value);
  const skills = () => (readSetting("ro-helper-skills") ?? defaults)
    .split(/[、,，\n]/).map(name => name.trim()).filter(Boolean);
  const focusSkill = () => localStorage.getItem(settingKey("ro-helper-focus-skill")) || "";
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
  const gearPickupToggle = document.createElement("button");
  gearPickupToggle.type = "button";
  const updateGearPickupToggle = () => {
    gearPickupToggle.textContent = forceGearPickup ? "強制撿裝備／卡片：開" : "強制撿裝備／卡片：關";
    gearPickupToggle.setAttribute("aria-pressed", String(forceGearPickup));
  };
  updateGearPickupToggle();
  gearPickupToggle.addEventListener("click", event => {
    event.stopPropagation();
    forceGearPickup = !forceGearPickup;
    writeSetting("ro-helper-force-gear", forceGearPickup ? "on" : "off");
    updateGearPickupToggle();
  });
  const collisionMode = document.createElement("select");
  collisionMode.setAttribute("aria-label", "無視怪物碰撞時機");
  collisionMode.append(new Option("撿裝備／卡片時無視", "pickup"), new Option("一直無視", "always"));
  collisionMode.value = readSetting("ro-helper-collision-mode") === "always" ? "always" : "pickup";
  collisionMode.addEventListener("change", () => {
    writeSetting("ro-helper-collision-mode", collisionMode.value);
  });
  const defaults = "聖靈召喚、火箭術、雷爆術、火焰之壁、攻擊：法杖";
  const focusTreasure = key => localStorage.getItem(settingKey(key)) || "";
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
  const normalizeTreasure = name => name.normalize("NFKC").replace(/\s*\+\s*\d+\s*$/u, "").trim();
  const knownTreasures = [
    // 屬性神祇
    "貪婪之神", "戰爭之神", "虐刑之神", "力量之神", "思想之神", "記憶之神",
    "堡壘之神", "疾風之神", "生命之神", "智慧之神", "束縛之神", "詭計之神", "折磨之神",
    // 魔法師神祇
    "火箭術 Deity", "冰箭術 Deity", "雷擊術 Deity", "聖靈召喚 Deity", "心靈爆破 Deity",
    "火焰之壁 Deity", "冰凍術 Deity", "火狩 Deity", "雷爆術 Deity",
    // 藥水
    "回復藥水", "冷卻藥水", "生命藥水", "護甲藥水", "範圍藥水", "採集藥水",
    "貪婪藥水", "速度藥水", "詠唱藥水", "傷害藥水",
    // 秘藥
    "爆擊秘藥", "傷害秘藥", "生命秘藥", "爆擊傷害秘藥", "驚奇秘藥",
    "持續傷害秘藥", "迴避秘藥", "詠唱秘藥", "範圍秘藥", "護甲秘藥",
    // 祝福
    "傷害祝福", "回復祝福", "冷卻祝福", "吸血祝福", "雙重詠唱祝福",
    "豐饒祝福", "詠唱祝福", "範圍祝福", "智慧祝福",
    // 料理
    "STR 料理", "AGI 料理", "VIT 料理", "INT 料理", "DEX 料理", "LUK 料理"
  ];
  const treasureList = () => [...new Set([...knownTreasures, ...readNames("ro-helper-treasures")].map(normalizeTreasure).filter(Boolean))];
  const treasurePriority = () => readNames("ro-helper-treasure-priority").map(normalizeTreasure);
  const skillList = () => [...new Set(["火箭術", "冰箭術", "冰凍術", "聖靈召喚", "雷擊術", "火狩", "火焰之壁", "雷爆術", "攻擊：法杖", ...readNames("ro-helper-seen-skills")])];
  const banishSkills = () => readNames("ro-helper-banish-skills");
  const banishBasic = () => readSetting("ro-helper-banish-basic") === "on";
  const elementalArrows = [
    ["firebolt","火箭術","Fire Bolt"], ["coldbolt","冰箭術","Cold Bolt"], ["lightning","雷擊術","Lightning Bolt"]
  ];
  const arrowUpgrades = [
    ["shots","追加發數",/發數|投射物|[+＋]\s*\d+\s*(?:枚|發)|projectiles?|bolts?/i],
    ["damage","傷害",/傷害|damage/i],
    ["cast","詠唱速度",/詠唱|吟唱|施法|cast/i]
  ];
  const arrowSetting = key => readSetting("ro-helper-arrow-" + key);
  function selectElementalArrow(cards, owned, starter, preference) {
    const arrow = card => {
      const name = card.querySelector(".pk-name")?.textContent.trim();
      const text = name?.toLowerCase();
      const match = elementalArrows.find(([,zh,en]) => text === zh || text === en.toLowerCase());
      return match?.[0] || (text === "ice bolt" ? "coldbolt" : undefined);
    };
    const fresh = card => Boolean(card.querySelector(".pk-ribbon"));
    const upgrades = cards.filter(card => arrow(card) && !fresh(card));
    if (!owned && !upgrades.length) return cards.find(card => arrow(card) === starter && fresh(card));
    const order = [...arrowUpgrades].sort(([a],[b]) => Number(b === preference) - Number(a === preference));
    const score = card => {
      const lines = card.querySelector(".pk-lines")?.textContent || "";
      const index = order.findIndex(([, , pattern]) => pattern.test(lines));
      return index < 0 ? 0 : order.length - index;
    };
    return upgrades
      .reduce((best,card) => !best || cardRarity(card) > cardRarity(best) ||
        (cardRarity(card) === cardRarity(best) && score(card) > score(best)) ? card : best, null);
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
    if (skillSettings) {
      for (const [key,label,choices,fallback] of [
        ["mode","技能選卡模式",[["off","原本優先順序"],["on","法師：三元素箭共用"]],"off"],
        ["starter","起手箭",elementalArrows,"coldbolt"],
        ["preference","同稀有度優先",arrowUpgrades,"shots"]
      ]) {
        const row = document.createElement("label");
        const select = document.createElement("select");
        select.append(...choices.map(([value,title]) => new Option(title,value)));
        select.value = arrowSetting(key) || fallback;
        row.append(label + " ", select);
        form.append(row);
        arrowControls.push([key,select]);
      }
    }
    const fields = Array.from({length:Math.max(5, priorities.length)}, (_, i) => {
      const row = document.createElement("label");
      row.textContent = "優先 " + (i + 1) + " ";
      const select = document.createElement("select");
      select.append(new Option("請選擇", ""));
      const field = document.createElement("input");
      field.value = priorities[i] || "";
      field.placeholder = "也可直接輸入名稱";
      for (const name of new Set([...names, ...priorities.filter(Boolean)])) select.append(new Option(name, name));
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
    form.onsubmit = () => {
      save(fields.map(({ field }) => field.value.trim()));
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
    form.append(submit, cancel);
    dialog.append(form);
    dialog.onclose = () => dialog.remove();
    document.body.append(dialog);
    dialog.showModal();
  };
  settings.onclick = () => {
    const key = settingKey("ro-helper-skills");
    openSettings("技能優先順序", skillList(), skills(), names => localStorage.setItem(key, names.join("、")), true);
  };
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
  const difficultyFields = [
    ["count", "敵人數量", 350, 300],
    ["damage", "敵人傷害", 175, 150],
    ["hp", "敵人血量", 250, 200],
    ["speed", "敵人速度", 175, 150],
    ["events", "事件數量", 250, 200]
  ];
  const difficultyKey = mode => "ro-helper-difficulty-" + mode;
  const getDifficulty = mode => {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(settingKey(difficultyKey(mode))) ?? localStorage.getItem(settingKey("ro-helper-difficulty"))); } catch {}
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
    return Object.fromEntries(difficultyFields.map(([key, , soloMax, partyMax]) => {
      const max = mode === "party" ? partyMax : soloMax;
      const value = Number(saved?.[key]);
      return [key, Number.isFinite(value) && value >= 100 ? Math.min(max, Math.round(value / 5) * 5) : 100];
    }));
  };
  const difficultyButton = document.createElement("button");
  difficultyButton.type = "button";
  difficultyButton.textContent = "難度設定";
  difficultyButton.style.cssText = button.style.cssText + ";right:440px";
  difficultyButton.onclick = () => {
    const dialog = document.createElement("dialog");
    dialog.id = "ro-helper-settings";
    const form = document.createElement("form");
    form.method = "dialog";
    form.style.cssText = "display:grid;gap:10px;padding:16px";
    form.append("自動進場難度");
    const mode = document.createElement("select");
    mode.setAttribute("aria-label","難度模式");
    mode.append(new Option("單人","solo"),new Option("組隊","party"));
    mode.value = partyMode.value === "off" ? "solo" : "party";
    form.append(mode);
    const drafts = new Map();
    let displayed = mode.value;
    const inputs = difficultyFields.map(([key, name]) => {
      const row = document.createElement("label");
      const input = document.createElement("input");
      const output = document.createElement("output");
      input.type = "range";
      input.min = 100;
      input.step = 5;
      const update = () => { output.textContent = input.value + "%"; };
      input.oninput = update;
      row.append(name + " ", input, output);
      form.append(row);
      return [key, input];
    });
    const readInputs = () => Object.fromEntries(inputs.map(([key,input]) => [key,Number(input.value)]));
    const loadInputs = () => {
      const saved = drafts.get(displayed) ?? getDifficulty(displayed);
      inputs.forEach(([key,input],index) => {
        input.max = displayed === "party" ? difficultyFields[index][3] : difficultyFields[index][2];
        input.value = saved?.[key] ?? 100;
        input.oninput();
      });
    };
    mode.onchange = () => {
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
      drafts.set(displayed,readInputs());
      for (const [kind,values] of drafts) writeSetting(difficultyKey(kind),JSON.stringify(values));
      status.textContent = "已儲存難度，下次出發時套用";
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
      input: dialog?.querySelector('#npc-text .diff input[data-key="' + key + '"]'),
      output: dialog?.querySelector('#npc-text .diff [data-out="' + key + '"]')
    }));
    const missing = sliders.find(({input, output}) => !input || !output);
    if (missing) return "找不到難度欄位：" + missing.name;
    for (const {key, name, input, output} of sliders) {
      const min = Number(input.min || 1);
      const max = Number(input.max || saved[key] / 100);
      const step = Number(input.step) || 0.05;
      const value = Math.min(max,Math.max(min,saved[key] / 100));
      const percent = Math.round(Math.min(max,min + Math.round((value-min)/step)*step)*100);
      input.value = String(percent / 100);
      input.dispatchEvent(new Event("input", {bubbles:true}));
      if (Math.round(Number(input.value) * 100) !== percent ||
          output.textContent.trim() !== percent + "%") {
        return "難度未套用：" + name + " " + percent + "%";
      }
    }
    return "";
  }
  const knownStages = ["普隆德拉原野", "普隆德拉地下水道", "失事輪", "柏伊亞嵐島", "斐揚森林", "斐揚洞穴", "普隆德拉城"];
  const stageNameOf = card => card.querySelector(".stg-card-info b")?.textContent.trim() ||
    knownStages.find(name => card.textContent.includes(name)) || "";
  const stageIsLocked = card => card.disabled || card.classList.contains("locked") || card.classList.contains("soon");
  function isBasicAttack(name) {
    return /^(?:攻擊\s*[:：]|普通攻擊(?:強化)?$|(?:Basic )?Attack\s*[:：]|Basic Attack$)/i.test(name);
  }
  function findFocusAction(picker, target, chest, visible, used) {
    if (!target) return null;
    for (const slot of picker.querySelectorAll("#pk-cards .pk-slot")) {
      const name = slot.querySelector(".pk-card .pk-name")?.textContent.trim();
      if (!name || (chest ? normalizeTreasure(name) !== normalizeTreasure(target) : name !== target)) continue;
      const action = [...slot.querySelectorAll(".pk-acts button.pk-act")].find(button =>
        /^(?:專注|Focus)(?:\s*\d+)?$/i.test(button.textContent.trim()) &&
        visible(button) && !used.has(button));
      if (action) return action;
    }
    return null;
  }
  function findSkillBanish(picker, names, basic, visible, used) {
    if (!names.length && !basic) return null;
    for (const slot of picker?.querySelectorAll("#pk-cards .pk-slot") ?? []) {
      const card = slot.querySelector(".pk-card");
      const name = card?.querySelector(".pk-name")?.textContent.trim();
      if (!name) continue;
      // New skills have a ribbon. The game offers their upgrades only after acquisition.
      const shouldBanish = isBasicAttack(name) ? basic : names.includes(name) && !card.querySelector(".pk-ribbon");
      if (!shouldBanish) continue;
      const button = [...slot.querySelectorAll(".pk-acts button.pk-act")].find(action =>
        /^(?:放逐|Banish)(?:\s*\d+)?$/i.test(action.textContent.trim()) && visible(action) && !used.has(action));
      if (button) return { button, name };
    }
    return null;
  }
  function availableReroll(picker, visible, used) {
    const ready = button => visible(button) && !used.has(button);
    const deck = picker?.querySelector('#pk-bar .pk-act[data-act="bar:0"]');
    if (ready(deck)) return { button: deck, action: "重抽全部" };
    const actions = picker?.querySelectorAll("#pk-cards .pk-acts button.pk-act") ?? [];
    const button = [...actions].find(action =>
      /^(?:重抽(?:卡片|單張)?|單張重抽|Reroll(?: card)?)(?:\s*\d+)?$/i.test(action.textContent.trim())
      && ready(action));
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
  const stageSettings = document.createElement("details");
  stageSettings.style.cssText = "width:100%;padding:5px;box-sizing:border-box";
  const stageSummary = document.createElement("summary");
  stageSummary.textContent = "關卡設定";
  const stageMode = document.createElement("select");
  stageMode.setAttribute("aria-label", "選關模式");
  stageMode.append(new Option("固定關卡", "fixed"), new Option("自動打最高層（略過劇情）", "highest"),
    new Option("多關卡循環", "rotation"));
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
  stageSettings.append(stageSummary, stageMode, fixedStage, rotationSettings, rotationProgress);

  const repeatCount = value => Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(value)) || 1));
  const rotationStages = () => readNames("ro-helper-stage-rotation");
  function refreshStageChoices() {
    const saved = readSetting("ro-helper-stage") ?? sessionStorage.getItem("ro-helper-stage");
    const checked = rotationStages();
    const names = [...new Set([...knownStages, ...readNames("ro-helper-seen-stages"), ...checked,
      ...[saved].filter(name => name && name !== highestStageMode)])];
    fixedStage.replaceChildren(new Option("請選擇關卡", ""), ...names.map(name => new Option(name, name)));
    fixedStage.value = saved === highestStageMode ? "" : saved || "";
    stageChecks.replaceChildren();
    for (const name of names) {
      const row = document.createElement("label");
      row.style.display = "block";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = checked.includes(name);
      input.addEventListener("change", () => {
        const selected = new Set(rotationStages());
        if (input.checked) selected.add(name);
        else selected.delete(name);
        writeSetting("ro-helper-stage-rotation", JSON.stringify(names.filter(stage => selected.has(stage))));
      });
      row.append(input, " " + name);
      stageChecks.append(row);
    }
  }
  function refreshStageMode() {
    fixedStage.hidden = stageMode.value !== "fixed";
    rotationSettings.hidden = stageMode.value !== "rotation";
    rotationProgress.hidden = stageMode.value !== "rotation";
  }
  function loadStageSettings() {
    stageMode.value = readSetting("ro-helper-stage-mode") ||
      ((readSetting("ro-helper-stage") ?? sessionStorage.getItem("ro-helper-stage")) === highestStageMode ? "highest" : "fixed");
    stageRepeats.value = String(repeatCount(readSetting("ro-helper-stage-repeats")));
    rotationProgress.textContent = "";
    refreshStageChoices();
    refreshStageMode();
  }
  stageMode.addEventListener("change", () => {
    writeSetting("ro-helper-stage-mode", stageMode.value);
    refreshStageMode();
  });
  fixedStage.addEventListener("change", () => writeSetting("ro-helper-stage", fixedStage.value));
  stageRepeats.addEventListener("change", () => {
    stageRepeats.value = String(repeatCount(stageRepeats.value));
    writeSetting("ro-helper-stage-repeats", stageRepeats.value);
  });
  loadStageSettings();

  function advanceRotation(rotation, stages, repeats) {
    if (!stages.includes(rotation.stage)) return {stage: stages[0], completed: 0};
    const completed = rotation.completed + 1;
    if (completed < repeats) return {stage: rotation.stage, completed};
    return {stage: stages[(stages.indexOf(rotation.stage) + 1) % stages.length], completed: 0};
  }
  function highestPlayableStage(cards, rejected, canDepart) {
    if (!cards.length) rejected.clear();
    const ranked = cards.filter(card => !stageIsLocked(card))
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
      if (!action || action.disabled) return true;
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
  let partyWaitingUntil = 0;
  partyMode.addEventListener("change", () => {
    writeSetting("ro-helper-party-role", partyMode.value);
    partyWaitingUntil = 0;
  });
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
  const lootRows = document.createElement("div");
  lootRows.style.cssText = "max-height:min(56vh,420px);overflow:auto;margin-top:10px;border:1px solid #d1dbed;border-radius:7px;background:white";
  const lootHeader = document.createElement("div");
  lootHeader.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px";
  const lootHandle = document.createElement("strong");
  lootHandle.textContent = "本次掛機掉落";
  lootHandle.style.cssText = "flex:1;cursor:grab;touch-action:none;user-select:none";
  lootHeader.append(lootHandle,lootClose);
  lootWindow.append(lootHeader,lootCategory,lootSlot,lootRows);
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
  let seenLootReveals = new WeakSet();
  let currentLootRun = null;
  let fallbackLootRun = 0;
  let lootBattleActive = false;
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
    seenLootReveals.add(item);
    const groups = revealedLoot.get(run) || [[],[],[]];
    const icon = category === 0 ? item.querySelector(".dr-card img") : null;
    const iconKey = icon?.src ? "icon:" + new URL(icon.src).pathname : "";
    groups[category].push([name,"",Math.max(0,tier),iconKey]);
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
  function localizeLoot(category, name, slot, rank, iconKey, catalog) {
    const key = name.normalize("NFKC").trim().toLowerCase();
    const id = iconKey?.match(/(?:^id:|\/)(\d+)(?:\.[^/]+)?$/)?.[1];
    const item = lootCatalog[category].get("#" + id) || lootCatalog[category].get(key);
    return [item?.zh || name, slot || item?.slot || catalog?.[iconKey] || catalog?.[key] || "",rank,category === 1 ? cardEffects[item?.id] : undefined,item?.en];
  }
  let lastGearCatalog;
  function refreshLootWindow() {
    if (lootWindow.hidden) return;
    const category = lootCategoryIndex;
    const runs = new Set([...lootHistory.keys(), ...revealedLoot.keys()]);
    const rows = [...runs].flatMap(run => {
      const sampled = lootHistory.get(run)?.[category] || [];
      const revealed = revealedLoot.get(run)?.[category] || [];
      return sampled.length >= revealed.length ? sampled : revealed;
    });
    let catalog;
    lastGearCatalog = document.documentElement.dataset.roHelperGearSlots;
    try { catalog = JSON.parse(lastGearCatalog || "null"); } catch {}
    const categorized = rows.map(([name,slot,rank,iconKey]) => localizeLoot(category,name,slot,rank,iconKey,catalog));
    const selected = lootSelectedSlots[category];
    const filtered = categorized.filter(([,slot]) => selected === "all" || lootFilterSlot(category,slot) === selected);
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
    const columns = [["裝備","部位","稀有度","數量"],["卡片","部位","效果","數量"],["寵物","數量"]][category];
    for (const column of columns) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = column;
      cell.style.cssText = "position:sticky;top:0;background:#e8eef9;padding:7px 8px;border-bottom:1px solid #ccd8ed;white-space:nowrap";
      labels.append(cell);
    }
    heading.append(labels);
    const body = document.createElement("tbody");
    entries.forEach(({item:[name,slot,rank,effects,english],count},index) => {
      const row = document.createElement("tr");
      row.style.background = index % 2 ? "#f7f9fd" : "#fff";
      const values = [name];
      if (category !== 2) values.push(slotLabels[slot] || slot || "未辨識部位",
        category === 0 ? tiers[rank] || "階級 " + rank : effects?.join("\n") || "—");
      values.push(String(count));
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
  function showTimers(startedAt, battleSeconds) {
    const line = "本局時間 " + formatElapsed(battleSeconds) + "\n本次啟動時間 " +
      (startedAt === null ? "—" : formatElapsed((performance.now() - startedAt) / 1000));
    if (timerDisplay.textContent !== line) timerDisplay.textContent = line;
  }
  showTimers(null);
  const toggle = () => {
    if (window.__roMenuHelper) {
      window.__roMenuHelper.stop();
      return;
    }
    try {
      (()=>{if(location.hostname!=="ro-survivors.com")return;const key="__roMenuHelper";let stageName="", rotation={stage:undefined,completed:0}, rotationRun;const rejectedStages=new Set();const visible=e=>e&&e.getClientRects().length&&!e.disabled&&getComputedStyle(e).visibility==="visible"&&!e.closest("[hidden],[inert],[aria-hidden=true]");const label=e=>e.innerText.trim();const buttons=()=>[...document.querySelectorAll("button,[role=button]")].filter(visible);const click=e=>{last=e;e.click()};let pickerFirstCard=null,pickerReadyAt=0,attemptedCard=null,attempts=0;const blocked=new Map();let previousPosition=null,previousDirection=null,still=0,escapeDirection=-1,escapeUntil=0;let retriedCoordinates=false;let movePulse,nextMenuAt=0,nextCaptureAt=0,lastCoordinateAt=0;let last,held,index=0,departing=false,retriedSoloDialog=false;const route=["d","s","a","w","wd","sd","sa","wa"];const probe=document.createElement("canvas");probe.width=probe.height=128;const ctx=probe.getContext("2d",{willReadFrequently:true});const directions=[[1,0],[0,1],[-1,0],[0,-1]];let captureStatus="正在等候分頁截圖",screenshot=null,requested=false,stamp=0,previousFrame=null;const assess=()=>{const canvas=[...document.querySelectorAll("canvas")].filter(visible).sort((a,b)=>b.width*b.height-a.width*a.height)[0];if((!canvas&&!sharedVideo)||!ctx)return null;try{ctx.clearRect(0,0,128,128);if(sharedVideo?.readyState>=2){const r=canvas?.getBoundingClientRect()||{left:0,top:0,width:innerWidth,height:innerHeight},sx=sharedVideo.videoWidth/innerWidth,sy=sharedVideo.videoHeight/innerHeight;ctx.drawImage(sharedVideo,r.left*sx,r.top*sy,r.width*sx,r.height*sy,0,0,128,128)}else if(screenshot&&Date.now()-stamp<1600){const r=canvas.getBoundingClientRect(),sx=screenshot.width/innerWidth,sy=screenshot.height/innerHeight;ctx.drawImage(screenshot,r.left*sx,r.top*sy,r.width*sx,r.height*sy,0,0,128,128)}else{ctx.drawImage(canvas,0,0,128,128)}const data=ctx.getImageData(0,0,128,128).data;let content=0;const red=(x,y)=>{const i=(128*y+x)*4;return data[i+3]>150&&data[i]>95&&data[i]>1.45*data[i+1]&&data[i]>1.32*data[i+2]};for(let i=0;i<data.length;i+=64)if(data[i+3]>150&&data[i]+data[i+1]+data[i+2]>45)content++;if(content<60)return null;const prior=previousFrame;previousFrame=data;let shiftX=0,shiftY=0,alignment=Infinity;if(prior){for(let dy=-16;dy<=16;dy+=2)for(let dx=-16;dx<=16;dx+=2){let error=0;for(let y=24;y<104;y+=8)for(let x=24;x<104;x+=8){if(x>48&&x<80&&y>48&&y<80)continue;const i=(128*y+x)*4,j=(128*(y+dy)+x+dx)*4;error+=Math.abs(data[i]-prior[j])+Math.abs(data[i+1]-prior[j+1])+Math.abs(data[i+2]-prior[j+2])}if(error<alignment){alignment=error;shiftX=dx;shiftY=dy}}}const moving=(x,y)=>{if(!prior||alignment>3600)return false;const i=(128*y+x)*4,j=(128*(y+shiftY)+x+shiftX)*4;return Math.abs(data[i]-prior[j])+Math.abs(data[i+1]-prior[j+1])+Math.abs(data[i+2]-prior[j+2])>85};return directions.map(([dx,dy])=>{let score=0;for(let step=4;step<=22;step++)for(let side=-5;side<=5;side++){{const x=64+dx*step-dy*side,y=64+dy*step+dx*side;if(red(x,y))score+=12;else if(moving(x,y))score+=step<=12?3:1}}let nearMotion=0,nearRed=0;for(let step=8;step<=16;step++)for(let side=-4;side<=4;side++){const x=64+dx*step-dy*side,y=64+dy*step+dx*side;if(red(x,y))nearRed++;else if(moving(x,y))nearMotion++}const uncertain=!prior||alignment>3600;const unsafe=nearRed>=4||(!uncertain&&nearMotion>=12);let chest=0,loot=0;for(let step=7;step<=22;step++)for(let side=-6;side<=6;side++){const x=64+dx*step-dy*side,y=64+dy*step+dx*side,i=(128*y+x)*4;const r=data[i],g=data[i+1],b=data[i+2],w=23-step;if(r>75&&g>55&&r>g*1.06&&r<g*1.7&&g>b*1.32){const j=i-1024;if(data[j]>data[j+1]*1.12&&data[j+1]>data[j+2]*1.15)chest+=w;else loot+=w}else if(b>70&&b>r*1.24&&b>g*1.12&&data[i+6]<b*0.9)loot+=w}return {score,chest,loot,unsafe,uncertain}})}catch{return null}};const send=(type,k)=>(document.activeElement||document.body).dispatchEvent(new KeyboardEvent(type,{key:k,code:"Key"+k.toUpperCase(),bubbles:true,cancelable:true,keyCode:k.toUpperCase().charCodeAt(0),which:k.toUpperCase().charCodeAt(0)}));const release=()=>{if(held){for(const key of held)send("keyup",key);held=null}};const confirmDrop=createDropConfirmation();const confirmedParty=new WeakSet();let returnedResult;const usedRerolls=new WeakSet();const usedFocus=new WeakSet();const usedBanish=new WeakSet();const startedAt = performance.now();
let battleStartedAt = null;
let patrolStartedAt = null;
lootHistory.clear();
revealedLoot.clear();
seenLootReveals = new WeakSet();
currentLootRun = null;
fallbackLootRun = 0;
lootBattleActive = false;
lootSignature = "";
const initialLoot = readLivePacket();
lootBaseline = initialLoot && Math.abs(Date.now() - initialLoot.at) < 750 && initialLoot.lootLog
  ? {id:initialLoot.lootLog.id,counts:initialLoot.lootLog.groups.map(rows => rows.length)} : null;
refreshLootWindow();
showTimers(startedAt);
const timer=setInterval(()=>{
  const battleHud = document.querySelector("#hud:not(.hidden)");
  const lootPacket = readLivePacket();
  const settlement = document.querySelector("#gameover:not(.hidden)");
  const battleEnded = settlement || document.body.classList?.contains("in-lobby");
  if (battleEnded) lootBattleActive = false;
  if (battleHud && !battleEnded && !lootBattleActive) {
    currentLootRun = "reveal-" + ++fallbackLootRun;
    lootBattleActive = true;
  }
  if (lootBattleActive && lootPacket?.lootLog && Math.abs(Date.now() - lootPacket.at) < 750) {
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
  if (lootBattleActive && currentLootRun) recordLootReveal(currentLootRun);
  if (!lootWindow.hidden && lastGearCatalog !== document.documentElement.dataset.roHelperGearSlots) refreshLootWindow();
  const choosingCard = battleStartedAt !== null && document.querySelector("#picker:not(.hidden)");
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
  showTimers(startedAt, battleStartedAt === null ? undefined : (now - battleStartedAt) / 1000);
  if (settlement || !battleHud && !choosingCard) patrolStartedAt = null;
  if(document.hidden||document.querySelector("#ro-helper-settings[open]")){release();return}if(confirmDrop()){release();return}if(partyMode.value==="member"||partyMode.value==="follow"){const ready=partyReadyButton();if(ready){release();if(!confirmedParty.has(ready)){confirmedParty.add(ready);ready.click();status.textContent="已同意隊伍出發"}return}}const list=buttons();const byId=id=>list.find(e=>e.id===id);const exact=t=>list.find(e=>label(e)===t);const result=byId("btn-restart");if(!result)returnedResult=undefined;const go=byId("stg-go");const partyLeader=partyMode.value==="leader";const followLeader=partyMode.value==="follow";const partyMember=partyMode.value==="member"||followLeader;const difficultyDialog = expeditionDifficultyDialog();
const proposal = partyLeader ? partyProposalButton(difficultyDialog, visible) : null;
const field = proposal || exact("前往野外");
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
if(field){release();if(partyMember||partyLeader&&!proposal)return;if(last===field)return;const difficulty=getDifficulty(proposal?"party":"solo");const difficultyError=applyDifficulty(difficultyDialog,difficulty);if(difficultyError){status.textContent=difficultyError;return}if(proposal){retriedSoloDialog=false;partyWaitingUntil=Date.now()+30000;status.textContent="已發起隊伍出發，等待隊員確認"}else status.textContent=difficulty?"已套用助手的難度設定，正在進場":"使用遊戲目前的難度，正在進場";click(field);return}const captain=byId("lobby-prompt");const stageCards=[...document.querySelectorAll("#stg-list .stg-card")].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility==="visible"&&!e.closest("[hidden],[inert],[aria-hidden=true]"));
const selectedStages = rotationStages();
const repeats = repeatCount(stageRepeats.value);
if (!selectedStages.includes(rotation.stage)) rotation = {stage: selectedStages[0], completed: 0};
if (stageCards.length && !partyMember) {
  const seen = readNames("ro-helper-seen-stages");
  const found = stageCards.map(stageNameOf).filter(name => name && !knownStages.includes(name) && !seen.includes(name));
  if (found.length) {
    writeSetting("ro-helper-seen-stages", JSON.stringify([...new Set([...seen,...found])]));
    refreshStageChoices();
  }
}
stageName = stageMode.value === "highest" ? highestStageMode :
  stageMode.value === "rotation" ? rotation.stage || "" : fixedStage.value;
if (stageMode.value === "rotation") {
  rotationProgress.textContent = rotation.stage
    ? rotation.stage + " · 已完成 " + rotation.completed + " / " + repeats
    : "請勾選循環關卡";
}
if (!partyMember && stageCards.length && !stageName) {
  release();
  status.textContent = "請在助手的關卡設定選擇關卡";
  return;
}
const hud=document.body.innerText;const chest=/選擇\s*一件\s*裝備/.test(document.body.innerText)&&/寶箱/.test(document.body.innerText);const picking=chest||/(?:選擇|強化)\s*技能/.test(document.body.innerText)&&/升級\s*[！!]/.test(document.body.innerText);const inBattle=Boolean(battleHud)||/\bEXP\b/.test(hud)&&/\b\d{2}:\d{2}\b/.test(hud)&&/\(\s*-?\d+\s*,\s*-?\d+\s*\)/.test(hud);if(inBattle){partyWaitingUntil=0;retriedSoloDialog=false}if(partyLeader&&!inBattle&&!picking&&!result&&Date.now()<partyWaitingUntil){release();return}if(partyMember&&!inBattle&&!picking&&!result){release();status.textContent=followLeader?"跟隨隊長：等待隊伍出發確認":"隊員模式：等待隊伍出發確認";return}if(!stageName&&!captain&&!inBattle&&!picking&&!result){status.textContent="請先開啟遠征選單";return}const stage=stageName===highestStageMode?highestPlayableStage(stageCards,rejectedStages,Boolean(go)):stageCards.find(card=>stageNameOf(card)===stageName&&!stageIsLocked(card));let next;if(!picking){pickerFirstCard=null;attemptedCard=null;attempts=0;nextMenuAt=0}if(picking){release();const picker = document.querySelector("#picker");
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
const treasureName=e=>label(e).split(/\n/).map(t=>t.trim()).find(t=>t&&!/^(?:[123]|普通|優良|稀有|史詩|傳說|神話|技能|新[！!])$/.test(t))||"";if(chest){const seen=[...new Set([...treasureList(),...cards.map(e=>normalizeTreasure(treasureName(e))).filter(Boolean)])];writeSetting("ro-helper-treasures",JSON.stringify(seen))}else{const seen=[...new Set([...skillList(),...cards.map(treasureName).filter(Boolean)])];writeSetting("ro-helper-seen-skills",JSON.stringify(seen))}if (!chest) {
  const picker = document.querySelector("#picker:not(.hidden):not(.closing)");
  const banish = findSkillBanish(picker, banishSkills(), banishBasic(), visible, usedBanish);
  if (banish) {
    usedBanish.add(banish.button);
    status.textContent = "已按放逐：" + banish.name;
    nextMenuAt = Date.now() + 320;
    banish.button.click();
    return;
  }
}
const focusNames = chest ? treasureFocusKeys.map(focusTreasure) : [focusSkill()];
for (const focusName of focusNames) {
  const focusAction = findFocusAction(picker, focusName, chest, visible, usedFocus);
  if (!focusAction) continue;
  usedFocus.add(focusAction);
  status.textContent = (chest ? "已專注寶物：" : "已專注技能：") + focusName;
  nextMenuAt = Date.now() + 320;
  focusAction.click();
  return;
}
const sameSkill = chest ? null : highestRaritySameSkill(cards);
let elementalChoice;
if (!chest && arrowSetting("mode") === "on") {
  const equipped = document.querySelectorAll("#lu-sockets [data-skill], #skillbar [data-skill]");
  const owned = [...equipped].some(slot => elementalArrows.some(([id]) => id === slot.dataset.skill));
  elementalChoice = selectElementalArrow(cards,owned,
    arrowSetting("starter") || "coldbolt",arrowSetting("preference") || "shots");
}
const priorities = chest ? treasurePriority().filter(Boolean) : skills();
const preferred = priorities.map(name => cards.find(card => chest
  ? normalizeTreasure(treasureName(card)) === normalizeTreasure(name)
  : label(card).split(/\n/).some(line => line.trim() === name) || label(card).includes(name))).find(Boolean);
if (autoReroll && priorities.length && cards.length && !elementalChoice && !sameSkill && !preferred) {
  const picker = document.querySelector("#picker:not(.hidden):not(.closing)");
  const reroll = availableReroll(picker, visible, usedRerolls);
  if (reroll) {
    usedRerolls.add(reroll.button);
    status.textContent = (chest ? "寶箱" : "技能") + "未命中優先清單，" + reroll.action;
    nextMenuAt = Date.now() + 320;
    reroll.button.click();
    return;
  }
}
const card = elementalChoice || sameSkill || preferred || attemptedCard || (chest ? cards[Math.floor(Math.random() * cards.length)] : cards[0]);
const index = Number(card.dataset.i);
if (!Number.isInteger(index) || index < 0 || index > 8) return;
const number = String(index + 1);
if (attemptedCard !== card) {
  attemptedCard = card;
  attempts = 0;
}
status.textContent = (chest ? "選寶箱：" : "選技能：") + number;
if (attempts % 2 === 0) {
  card.click();
} else {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: number, code: "Digit" + number, bubbles: true, cancelable: true }));
}
attempts++;
nextMenuAt = Date.now() + (attempts >= 2 ? 650 : 320);
return;
}else if (result) {
  if (returnedResult === result) return;
  returnedResult = result;
  if (rotationRun && rotationRun.stage === rotation.stage && stageMode.value === "rotation") {
    rotation = advanceRotation(rotation, selectedStages, repeats);
  }
  rotationRun = undefined;
  departing = false;
  delete document.documentElement.dataset.roHelperFinishVictory;
  next = result;
}else if(stage){if(!stage.classList.contains("sel")){next=stage}else if(go&&!departing){next=go;departing=true;rotationRun=stageMode.value==="rotation"?{stage:stageName}:undefined}}else if(stageCards.length&&stageName){release();status.textContent=stageName===highestStageMode?"目前沒有可出發的一般關卡":"指定關卡目前無法出發："+stageName;return}else if(!go&&!field){departing=false;if(captain)next=captain}if(!next){if(last?.id!=="stg-go")last=undefined;const view=document.body.innerText;const battle=!picking&&!result&&!go&&!field&&!captain&&inBattle&&!document.querySelector("#picker:not(.hidden), #gameover:not(.hidden), #npc-dialog:not(.hidden)")&&!/(暫停|繼續遊戲)/.test(view)&&!document.activeElement?.matches("input,textarea,select,[contenteditable=true]");release();if(battle){if(!autoMove){blocked.clear();previousPosition=null;previousDirection=null;escapeDirection=-1;escapeUntil=0;status.textContent="手動移動";return}const packet=readLivePacket();const fresh=packet&&Date.now()-packet.at>=0&&Date.now()-packet.at<750&&packet.routes?.length===route.length;if (!fresh) {
  if (gearMovementMode.value === "smart") {
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
}retriedCoordinates=false;const ignoreMonsterCollision=forceGearPickup&&collisionMode.value==="always";const zones=Array.isArray(packet.hazards)?packet.hazards:[];const shelter=bellDirection(packet,zones);if(shelter!==null){status.textContent=shelter<0?"座標｜留在金鐘安全區":"座標｜前往金鐘安全區";if(shelter>=0){held=route[shelter];for(const key of held)send("keydown",key);clearTimeout(movePulse);movePulse=setTimeout(release,145)}return}const originClearance=hazardClearance(zones,...packet.player);const evadingRed=originClearance<=0;
const cleanup = packet.cleanup;
const leader = !cleanup && followLeader && Array.isArray(packet.leader) && packet.leader.length === 2 &&
  packet.leader.every(Number.isFinite) ? packet.leader : null;
const leaderDistance = leader ? Math.hypot(packet.player[0]-leader[0],packet.player[1]-leader[1]) : Infinity;
if (!cleanup && followLeader && !evadingRed && (!leader || leaderDistance <= 95)) {
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
const drops = cleanup?.gear ?? packet.drops;
if (cleanup && !drops.length && !evadingRed) {
  previousDirection = null;
  if (cleanup.canFinish && cleanup.ready) document.documentElement.dataset.roHelperFinishVictory = String(Date.now());
  status.textContent = cleanup.canFinish ? (cleanup.ready ? "清場完成，正在返回" : "打王完成，確認掉落物中") : "裝備與卡片已撿完，等待隊伍結算";
  return;
}
const canOpenChest=Number.isFinite(packet.zeny)&&Number.isFinite(packet.chestCost)&&packet.zeny>=packet.chestCost;const scores=packet.routes.map(([x,y,walkable])=>{const [px,py]=packet.player;const segment=(ex,ey)=>{const vx=x-px,vy=y-py,q=Math.max(0,Math.min(1,((ex-px)*vx+(ey-py)*vy)/(vx*vx+vy*vy||1)));return Math.hypot(ex-px-q*vx,ey-py-q*vy)};let unsafe=!walkable,score=0,chest=0,loot=0,gear=0,clearance=Infinity,pressure=0;for(const [ex,ey] of packet.enemies){const here=Math.hypot(ex-px,ey-py),there=Math.hypot(ex-x,ey-y);clearance=Math.min(clearance,there);pressure+=Math.max(0,150-there)**2;if(!ignoreMonsterCollision&&segment(ex,ey)<35&&there<here+8)unsafe=true;if(!ignoreMonsterCollision&&there<125)score+=(125-there)/15}for(const [kind,dx,dy] of drops){const dist=Math.hypot(dx-px,dy-py),next=cleanup?segment(dx,dy):Math.hypot(dx-x,dy-y);const equipment=kind==="loot"||kind==="card";if((cleanup||dist<(equipment?800:480))&&next<dist){const value=(dist-next)/(1+dist/90);if(equipment)continue;if(kind==="chest"){if(canOpenChest)chest=Math.max(chest,value)}else loot=Math.max(loot,value)}}if (packet.gearWaypoint) {
  const {x:gx,y:gy} = packet.gearWaypoint;
  const here = Math.hypot(gx-px,gy-py);
  const there = segment(gx,gy);
  gear = Math.max(0,here-there);
  if (!cleanup) loot = Math.max(loot,gear/3);
}
const endClearance=hazardClearance(zones,x,y);const crossesRed=[.25,.5,.75,1].some(f=>hazardClearance(zones,px+(x-px)*f,py+(y-py)*f)<=0);return {score,chest,loot,gear,endClearance,crossesRed,unsafe,walkable,uncertain:false,escapeCost:pressure-Math.min(150,clearance)*35}});if(scores){const pos=fresh?packet.player.map(Math.round).join(","):view.match(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/)?.slice(1).join(",");if(pos&&pos===previousPosition&&previousDirection&&Date.now()-lastCoordinateAt>=800){const id=pos+":"+previousDirection;blocked.set(id,Date.now()+6500);still++}else{still=0}if(pos!==previousPosition||Date.now()-lastCoordinateAt>=800){previousPosition=pos;lastCoordinateAt=Date.now()}for(const [id,until] of blocked)if(until<Date.now())blocked.delete(id);status.textContent="戰鬥中：依紅色區域與移動物體選路";const start=index++%route.length;let escaping=false;let candidates=Array.from({length:route.length},(_,i)=>(start+i)%route.length).filter(i=>!scores[i].unsafe&&!scores[i].crossesRed&&!blocked.has(pos+":"+route[i]));const forced=forceGearPickup&&!evadingRed&&!followLeader?scores.map((_,i)=>i).filter(i=>scores[i].walkable&&!scores[i].crossesRed&&scores[i].gear>0&&!blocked.has(pos+":"+route[i])):[];if(forced.length)candidates=forced;if(!candidates.length&&fresh){const open=scores.map((_,i)=>i).filter(i=>scores[i].walkable&&!scores[i].crossesRed);const clear=open.filter(i=>!scores[i].unsafe);const unblocked=open.filter(i=>!blocked.has(pos+":"+route[i]));candidates=clear.length?clear:unblocked.length?unblocked:open;escaping=candidates.length>0&&!clear.length}if(evadingRed){candidates=scores.map((_,i)=>i).filter(i=>scores[i].walkable&&scores[i].endClearance>originClearance);escaping=false}if(!candidates.length){previousDirection=null;status.textContent=fresh?"座標｜目前沒有可通行方向":"畫面｜沒有可走方向，請確認座標來源";return}const lowest=Math.min(...candidates.map(i=>scores[i].score));let viable=candidates.filter(i=>scores[i].score<=lowest+3);
if (cleanup && !evadingRed && !escaping) {
  viable = viable.filter(i => scores[i].gear > 0);
  if (!viable.length) {
    previousDirection = null;
    status.textContent = "清場收尾：目前無法安全靠近裝備或卡片";
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
if (cleanup) return a.gear > b.gear ? i : best;
if (leader) {
  const [ax,ay] = packet.routes[i];
  const [bx,by] = packet.routes[best];
  return Math.hypot(ax-leader[0],ay-leader[1]) < Math.hypot(bx-leader[0],by-leader[1]) ? i : best;
}
return a.chest>b.chest||(a.chest===b.chest&&(a.loot>b.loot||(a.loot===b.loot&&a.score<b.score)))?i:best});const chosen=scores[best];if(escaping){if(escapeDirection!==best||Date.now()>=escapeUntil){escapeDirection=best;escapeUntil=Date.now()+650}}else{escapeDirection=-1;escapeUntil=0}status.textContent=evadingRed?"座標｜閃避紅圈":forced.length?"座標｜強制撿裝備／卡片":escaping?"座標｜走位：脫離怪群":cleanup?"清場收尾：撿取裝備與卡片":followLeader?"座標｜跟隨隊長":(fresh?"座標｜":"畫面｜")+(chosen.chest?"走位：靠近疑似寶箱":chosen.loot?"走位：靠近疑似掉落物":"走位：巡找掉落物");held=route[best];previousDirection=held;if(still>=2)status.textContent="座標未變：換方向避開卡點";for(const key of held)send("keydown",key);clearTimeout(movePulse);movePulse=setTimeout(release,escaping?155:chosen.uncertain?80:145)}else{status.textContent="已暫停走位："+captureStatus+""}}else if(picking){status.textContent="偵測到升級，但找不到可選卡片"}return}previousPosition=null;previousDirection=null;escapeDirection=-1;escapeUntil=0;release();if(picking)status.textContent="選擇技能："+label(next).split(/\n/).slice(0,4).join(" ");if(next!==last||next===go||next===stage)click(next)},160);const stop=()=>{if(sharedVideo){sharedVideo.srcObject.getTracks().forEach(track=>track.stop());sharedVideo=null}clearInterval(timer);clearTimeout(movePulse);release();rotationProgress.textContent="";window.removeEventListener("blur",release);
  delete document.documentElement.dataset.roHelperFinishVictory;
  delete window[key];
  updateAssistantButton(false);
  showTimers(null);
  status.textContent = "助手已關閉";
};
window.addEventListener("blur",release);
window[key]={stop,releaseMovement:release};
updateAssistantButton(true);

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
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 6px";
  const handle = document.createElement("span");
  handle.textContent = "⋮⋮ RO 助手";
  handle.title = "拖曳移動助手";
  handle.style.cssText = "cursor:grab;touch-action:none;user-select:none;flex:1;padding:4px";
  const collapse = document.createElement("button");
  collapse.type = "button";
  collapse.style.cssText = "cursor:pointer;border-radius:4px;padding:2px 7px";
  const content = document.createElement("div");
  content.style.cssText = "padding:5px;max-width:260px;max-height:calc(100vh - 64px);overflow:auto";
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;flex-wrap:wrap;gap:4px";
  for (const control of [button, movementToggle, gearMovementMode, lootButton, settings, treasureButton, difficultyButton, rollChoice, partyMode, rerollToggle, skillFocus.select, ...treasureFocus.map(choice => choice.select)]) {
    control.style.cssText = "background:#234b96;color:white;padding:5px 7px;border-radius:5px;cursor:pointer";
    actions.append(control);
  }
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
  header.append(handle, collapse, minimize);
  panel.append(header, content, restore);
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
    restore.style.display = minimized ? "block" : "none";
    panel.style.background = minimized ? "transparent" : "#173569";
    panel.style.borderColor = minimized ? "transparent" : "#839bd1";
    const collapsed = preference.collapsed === true;
    actions.style.display = collapsed ? "none" : "flex";
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
  window.addEventListener("ro-account", () => {
    const nextAccount = accountScope();
    if (nextAccount === activeAccount) return;
    window.__roMenuHelper?.stop();
    delete window.__roMenuHelper;
    document.querySelector("#ro-helper-settings[open]")?.close();
    activeAccount = nextAccount;
    lootHistory.clear();
    revealedLoot.clear();
    refreshLootWindow();
    refreshGpuSaver(false);
    loadStageSettings();
    autoMove = readSetting("ro-helper-auto-move") !== "off";
    forceGearPickup = readSetting("ro-helper-force-gear") === "on";
    autoReroll = readSetting("ro-helper-auto-reroll") !== "off";
    collisionMode.value = readSetting("ro-helper-collision-mode") === "always" ? "always" : "pickup";
    rollChoice.value = readSetting("ro-helper-roll-choice") || "";
    const role = readSetting("ro-helper-party-role");
    partyMode.value = ["off","leader","member","follow"].includes(role)
      ? role : readSetting("ro-helper-auto-party") === "on" ? "member" : "off";
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
