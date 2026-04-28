(() => {
  'use strict';

  const TILE = 32;
  const MAP_W = 120;
  const MAP_H = 120;
  const VIEW_W = 30;
  const VIEW_H = 20;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const statusLine = document.getElementById('statusLine');
  const quickInfo = document.getElementById('quickInfo');
  const teamList = document.getElementById('teamList');
  const bagList = document.getElementById('bagList');
  const dexList = document.getElementById('dexList');
  const panel = document.getElementById('panel');

  const keys = new Set();
  let lastTime = 0;

  const TILE_KIND = {
    WATER: 0,
    SAND: 1,
    GRASS: 2,
    FOREST: 3,
    MOUNTAIN: 4,
    ROAD: 5,
    TALL_GRASS: 6,
    CENTER: 7,
    SHOP: 8,
  };

  const MON_DB = [
    { id: 1, name: 'Pyron', type: 'Fuoco', baseHp: 42, atk: 18, def: 10, spd: 14, color: '#ff7043' },
    { id: 2, name: 'Aquava', type: 'Acqua', baseHp: 46, atk: 15, def: 13, spd: 12, color: '#42a5f5' },
    { id: 3, name: 'Florab', type: 'Erba', baseHp: 48, atk: 14, def: 14, spd: 10, color: '#66bb6a' },
    { id: 4, name: 'Voltix', type: 'Elettro', baseHp: 38, atk: 20, def: 9, spd: 18, color: '#fdd835' },
    { id: 5, name: 'Roclan', type: 'Roccia', baseHp: 56, atk: 16, def: 17, spd: 7, color: '#8d6e63' },
    { id: 6, name: 'Noctowlf', type: 'Buio', baseHp: 44, atk: 17, def: 11, spd: 15, color: '#7e57c2' },
    { id: 7, name: 'Glacera', type: 'Ghiaccio', baseHp: 40, atk: 16, def: 12, spd: 16, color: '#80deea' },
    { id: 8, name: 'Sprigoon', type: 'Erba', baseHp: 34, atk: 12, def: 8, spd: 20, color: '#9ccc65' },
    { id: 9, name: 'Terron', type: 'Terra', baseHp: 50, atk: 17, def: 15, spd: 8, color: '#a1887f' },
    { id: 10, name: 'Spectry', type: 'Spettro', baseHp: 36, atk: 21, def: 7, spd: 19, color: '#ab47bc' },
  ];

  const state = {
    map: [],
    npcs: [],
    player: {
      x: 60,
      y: 60,
      dir: 'down',
      moving: false,
      moveTimer: 0,
      speed: 7,
      coins: 500,
    },
    world: {
      centerPos: { x: 62, y: 60 },
      shopPos: { x: 58, y: 60 },
    },
    mode: 'world',
    encounterRate: 0.11,
    battle: null,
    dex: new Set([1]),
    party: [],
    storage: [],
    bag: {
      potion: 6,
      superPotion: 2,
      captureBall: 12,
    },
    messageQueue: [],
    ui: {
      showPanel: true,
      blink: 0,
    },
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function choose(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function smoothNoise(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  function fbm(x, y, octaves = 4) {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 0.04;
    for (let i = 0; i < octaves; i++) {
      value += amplitude * smoothNoise(x * frequency, y * frequency);
      frequency *= 2;
      amplitude *= 0.5;
    }
    return value;
  }

  function generateMap() {
    const map = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(TILE_KIND.GRASS));
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const h = fbm(x, y, 5);
        let tile = TILE_KIND.GRASS;
        if (h < 0.22) tile = TILE_KIND.WATER;
        else if (h < 0.28) tile = TILE_KIND.SAND;
        else if (h < 0.56) tile = TILE_KIND.GRASS;
        else if (h < 0.72) tile = TILE_KIND.FOREST;
        else if (h < 0.86) tile = TILE_KIND.MOUNTAIN;
        else tile = TILE_KIND.TALL_GRASS;
        map[y][x] = tile;
      }
    }

    const midX = Math.floor(MAP_W / 2);
    const midY = Math.floor(MAP_H / 2);
    for (let x = 5; x < MAP_W - 5; x++) {
      map[midY][x] = TILE_KIND.ROAD;
      if (x % 7 === 0) map[midY - 1][x] = TILE_KIND.ROAD;
    }
    for (let y = 5; y < MAP_H - 5; y++) {
      map[y][midX] = TILE_KIND.ROAD;
      if (y % 8 === 0) map[y][midX + 1] = TILE_KIND.ROAD;
    }

    state.world.centerPos = { x: midX + 2, y: midY };
    state.world.shopPos = { x: midX - 2, y: midY };

    stampBuilding(map, state.world.centerPos.x, state.world.centerPos.y, TILE_KIND.CENTER);
    stampBuilding(map, state.world.shopPos.x, state.world.shopPos.y, TILE_KIND.SHOP);

    for (let i = 0; i < 16; i++) {
      const nx = rand(6, MAP_W - 7);
      const ny = rand(6, MAP_H - 7);
      if (map[ny][nx] === TILE_KIND.GRASS || map[ny][nx] === TILE_KIND.TALL_GRASS) {
        for (let oy = -2; oy <= 2; oy++) {
          for (let ox = -2; ox <= 2; ox++) {
            const xx = nx + ox;
            const yy = ny + oy;
            if (xx >= 0 && yy >= 0 && xx < MAP_W && yy < MAP_H && Math.random() > 0.3) {
              map[yy][xx] = TILE_KIND.TALL_GRASS;
            }
          }
        }
      }
    }

    state.map = map;
    state.npcs = [
      { x: midX + 4, y: midY, text: 'Il Centro Cura rimette in forma tutta la squadra!' },
      { x: midX - 4, y: midY, text: 'Nel negozio trovi Ball e Pozioni.' },
      { x: midX, y: midY + 3, text: 'L\'erba alta nasconde mostri rari.' },
    ];
  }

  function stampBuilding(map, x, y, type) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const xx = x + ox;
        const yy = y + oy;
        if (xx >= 0 && yy >= 0 && xx < MAP_W && yy < MAP_H) {
          map[yy][xx] = type;
        }
      }
    }
  }

  function tileAt(x, y) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return TILE_KIND.MOUNTAIN;
    return state.map[y][x];
  }

  function isWalkable(tile) {
    return tile !== TILE_KIND.WATER && tile !== TILE_KIND.MOUNTAIN;
  }

  function createMonster(template, level) {
    const iv = rand(0, 6);
    const hpMax = template.baseHp + level * 3 + iv;
    return {
      uid: `${template.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      dexId: template.id,
      name: template.name,
      type: template.type,
      level,
      hp: hpMax,
      hpMax,
      atk: template.atk + level + Math.floor(iv / 2),
      def: template.def + Math.floor(level / 2),
      spd: template.spd + Math.floor(level / 2),
      color: template.color,
      exp: 0,
    };
  }

  function starter() {
    const s = createMonster(MON_DB[0], 5);
    s.name = 'Pyron';
    return s;
  }

  function enemyForTile(tile) {
    let pool = MON_DB;
    if (tile === TILE_KIND.WATER || tile === TILE_KIND.SAND) pool = MON_DB.filter((m) => ['Acqua', 'Ghiaccio', 'Terra'].includes(m.type));
    if (tile === TILE_KIND.FOREST || tile === TILE_KIND.TALL_GRASS) pool = MON_DB.filter((m) => ['Erba', 'Buio', 'Spettro'].includes(m.type));
    if (tile === TILE_KIND.MOUNTAIN) pool = MON_DB.filter((m) => ['Roccia', 'Terra', 'Fuoco'].includes(m.type));
    if (!pool.length) pool = MON_DB;
    return createMonster(choose(pool), rand(2, 9));
  }

  function queueMessage(msg) {
    state.messageQueue.push({ msg, t: 2.6 });
  }

  function currentFront() {
    return state.party.find((m) => m.hp > 0);
  }

  function healAll() {
    state.party.forEach((m) => {
      m.hp = m.hpMax;
    });
  }

  function addMonsterToCollection(mon) {
    state.dex.add(mon.dexId);
    if (state.party.length < 6) {
      state.party.push(mon);
      queueMessage(`${mon.name} si unisce alla squadra!`);
    } else {
      state.storage.push(mon);
      queueMessage(`${mon.name} inviato al deposito.`);
    }
  }

  function tryMove(dx, dy, dt) {
    const p = state.player;
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const stepTime = sprint ? 0.08 : 0.12;
    p.moveTimer -= dt;
    if (p.moveTimer > 0) return;

    const nx = clamp(p.x + dx, 0, MAP_W - 1);
    const ny = clamp(p.y + dy, 0, MAP_H - 1);
    const target = tileAt(nx, ny);
    if (!isWalkable(target)) return;

    p.x = nx;
    p.y = ny;
    p.moveTimer = stepTime;

    for (const npc of state.npcs) {
      if (npc.x === p.x && npc.y === p.y) {
        queueMessage(npc.text);
      }
    }

    if (target === TILE_KIND.TALL_GRASS && Math.random() < state.encounterRate) {
      startBattle(enemyForTile(target));
    }
  }

  function interact() {
    const { x, y } = state.player;
    const tile = tileAt(x, y);
    if (tile === TILE_KIND.CENTER) {
      healAll();
      queueMessage('Squadra curata completamente.');
      return;
    }
    if (tile === TILE_KIND.SHOP) {
      if (state.player.coins >= 100) {
        state.player.coins -= 100;
        state.bag.captureBall += 3;
        state.bag.potion += 1;
        queueMessage('Acquistati: 3 Ball + 1 Pozione (-100).');
      } else {
        queueMessage('Monete insufficienti per fare acquisti.');
      }
      return;
    }
    queueMessage('Qui non c\'è nulla con cui interagire.');
  }

  function startBattle(enemy) {
    const ally = currentFront();
    if (!ally) {
      queueMessage('Tutti i tuoi mostri sono KO! Vai al Centro Cura.');
      return;
    }
    state.mode = 'battle';
    state.battle = {
      enemy,
      ally,
      flash: 0,
      log: [`Un ${enemy.name} selvatico appare!`],
      cooldown: 0,
    };
  }

  function damageFormula(attacker, defender, power = 12) {
    const base = power + attacker.atk - Math.floor(defender.def * 0.6);
    const variance = rand(-2, 2);
    return Math.max(1, base + variance);
  }

  function enemyTurn() {
    const b = state.battle;
    if (!b) return;
    const dmg = damageFormula(b.enemy, b.ally, 11);
    b.ally.hp = Math.max(0, b.ally.hp - dmg);
    b.log.push(`${b.enemy.name} colpisce: -${dmg} HP.`);
    if (b.ally.hp <= 0) {
      b.log.push(`${b.ally.name} è KO!`);
      const next = currentFront();
      if (next) {
        b.ally = next;
        b.log.push(`Vai ${next.name}!`);
      } else {
        b.log.push('Non hai più mostri utilizzabili.');
        endBattle(false);
      }
    }
  }

  function tryCapture() {
    const b = state.battle;
    if (!b || state.bag.captureBall <= 0) {
      if (b) b.log.push('Nessuna Ball disponibile.');
      return;
    }
    state.bag.captureBall--;
    const hpFactor = 1 - b.enemy.hp / b.enemy.hpMax;
    const levelFactor = (10 - b.enemy.level) / 20;
    const chance = 0.2 + hpFactor * 0.6 + levelFactor;
    if (Math.random() < chance) {
      b.log.push(`Cattura riuscita! ${b.enemy.name} ottenuto.`);
      addMonsterToCollection(b.enemy);
      endBattle(true);
    } else {
      b.log.push('La Ball si rompe...');
      enemyTurn();
    }
  }

  function usePotion() {
    const b = state.battle;
    if (!b || state.bag.potion <= 0) {
      if (b) b.log.push('Nessuna Pozione disponibile.');
      return;
    }
    state.bag.potion--;
    b.ally.hp = Math.min(b.ally.hpMax, b.ally.hp + 28);
    b.log.push(`${b.ally.name} recupera HP.`);
    enemyTurn();
  }

  function attack() {
    const b = state.battle;
    if (!b) return;
    const dmg = damageFormula(b.ally, b.enemy, 13);
    b.enemy.hp = Math.max(0, b.enemy.hp - dmg);
    b.log.push(`${b.ally.name} attacca: -${dmg} HP.`);

    if (b.enemy.hp <= 0) {
      b.log.push(`${b.enemy.name} è stato sconfitto!`);
      b.ally.exp += 15 + b.enemy.level * 2;
      state.player.coins += 25 + b.enemy.level * 3;
      if (b.ally.exp >= b.ally.level * 25) {
        b.ally.exp -= b.ally.level * 25;
        b.ally.level += 1;
        b.ally.hpMax += 4;
        b.ally.atk += 2;
        b.ally.def += 1;
        b.ally.spd += 1;
        b.ally.hp = b.ally.hpMax;
        b.log.push(`${b.ally.name} sale al livello ${b.ally.level}!`);
      }
      endBattle(true);
      return;
    }
    enemyTurn();
  }

  function runAway() {
    const b = state.battle;
    if (!b) return;
    const chance = 0.55 + (b.ally.spd - b.enemy.spd) * 0.03;
    if (Math.random() < chance) {
      b.log.push('Fuga riuscita.');
      endBattle(true);
    } else {
      b.log.push('Non riesci a fuggire!');
      enemyTurn();
    }
  }

  function endBattle(win) {
    if (!state.battle) return;
    setTimeout(() => {
      state.mode = 'world';
      state.battle = null;
      queueMessage(win ? 'Battaglia terminata.' : 'Ritirata forzata: cura la squadra.');
    }, 500);
  }

  function drawTile(x, y, sx, sy) {
    const t = tileAt(x, y);
    const colors = {
      [TILE_KIND.WATER]: '#1e5ea8',
      [TILE_KIND.SAND]: '#d9c189',
      [TILE_KIND.GRASS]: '#4e9f4f',
      [TILE_KIND.FOREST]: '#2d7a39',
      [TILE_KIND.MOUNTAIN]: '#646b73',
      [TILE_KIND.ROAD]: '#9f8c6a',
      [TILE_KIND.TALL_GRASS]: '#3f9d4a',
      [TILE_KIND.CENTER]: '#f06292',
      [TILE_KIND.SHOP]: '#ffca28',
    };
    ctx.fillStyle = colors[t] || '#333';
    ctx.fillRect(sx, sy, TILE, TILE);

    if (t === TILE_KIND.WATER) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(sx + ((x + y) % 6), sy + 5, 10, 2);
    }
    if (t === TILE_KIND.TALL_GRASS || t === TILE_KIND.FOREST) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(sx + 4 + i * 8, sy + 10 + (i % 2), 3, 12);
      }
    }
    if (t === TILE_KIND.CENTER || t === TILE_KIND.SHOP) {
      ctx.fillStyle = '#1c243d';
      ctx.fillRect(sx + 6, sy + 8, 20, 18);
      ctx.fillStyle = '#fff';
      ctx.fillRect(sx + 12, sy + 12, 8, 3);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.strokeRect(sx, sy, TILE, TILE);
  }

  function drawMonSprite(mon, x, y, scale = 1.5, facing = 1) {
    const w = 16 * scale;
    const h = 16 * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    ctx.fillStyle = mon.color;
    ctx.fillRect(-w / 2, -h / 2 + 4, w, h - 4);
    ctx.fillStyle = '#111';
    ctx.fillRect(-w / 4, -h / 4, w / 8, h / 8);
    ctx.fillRect(w / 8, -h / 4, w / 8, h / 8);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-w / 5, -h / 4 + 1, w / 18, h / 18);
    ctx.fillRect(w / 7, -h / 4 + 1, w / 18, h / 18);
    ctx.fillStyle = '#000';
    ctx.fillRect(-w / 3, h / 4, (2 * w) / 3, 2);
    ctx.restore();
  }

  function drawPlayer(px, py) {
    ctx.fillStyle = '#f6f7fb';
    ctx.fillRect(px + 10, py + 6, 12, 10);
    ctx.fillStyle = '#d32f2f';
    ctx.fillRect(px + 10, py + 3, 12, 5);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(px + 11, py + 16, 10, 12);
    ctx.fillStyle = '#ffd180';
    ctx.fillRect(px + 12, py + 8, 8, 7);
  }

  function drawWorld() {
    const camX = clamp(state.player.x - Math.floor(VIEW_W / 2), 0, MAP_W - VIEW_W);
    const camY = clamp(state.player.y - Math.floor(VIEW_H / 2), 0, MAP_H - VIEW_H);

    for (let y = 0; y < VIEW_H; y++) {
      for (let x = 0; x < VIEW_W; x++) {
        drawTile(camX + x, camY + y, x * TILE, y * TILE);
      }
    }

    for (const npc of state.npcs) {
      if (npc.x >= camX && npc.x < camX + VIEW_W && npc.y >= camY && npc.y < camY + VIEW_H) {
        const sx = (npc.x - camX) * TILE;
        const sy = (npc.y - camY) * TILE;
        ctx.fillStyle = '#ffee58';
        ctx.fillRect(sx + 8, sy + 8, 16, 16);
        ctx.fillStyle = '#3e2723';
        ctx.fillRect(sx + 10, sy + 10, 12, 12);
      }
    }

    const px = (state.player.x - camX) * TILE;
    const py = (state.player.y - camY) * TILE;
    drawPlayer(px, py);

    drawMinimap(camX, camY);
  }

  function drawMinimap(camX, camY) {
    const mmX = canvas.width - 178;
    const mmY = 10;
    const mmW = 160;
    const mmH = 160;
    ctx.fillStyle = 'rgba(9,16,26,0.74)';
    ctx.fillRect(mmX - 6, mmY - 6, mmW + 12, mmH + 12);

    const stepX = MAP_W / mmW;
    const stepY = MAP_H / mmH;
    for (let yy = 0; yy < mmH; yy += 2) {
      for (let xx = 0; xx < mmW; xx += 2) {
        const tx = Math.floor(xx * stepX);
        const ty = Math.floor(yy * stepY);
        const t = tileAt(tx, ty);
        let c = '#4e9f4f';
        if (t === TILE_KIND.WATER) c = '#1e5ea8';
        else if (t === TILE_KIND.MOUNTAIN) c = '#646b73';
        else if (t === TILE_KIND.FOREST) c = '#2d7a39';
        else if (t === TILE_KIND.TALL_GRASS) c = '#3f9d4a';
        else if (t === TILE_KIND.ROAD) c = '#a89574';
        else if (t === TILE_KIND.CENTER) c = '#f06292';
        else if (t === TILE_KIND.SHOP) c = '#ffca28';
        ctx.fillStyle = c;
        ctx.fillRect(mmX + xx, mmY + yy, 2, 2);
      }
    }

    const px = Math.floor((state.player.x / MAP_W) * mmW);
    const py = Math.floor((state.player.y / MAP_H) * mmH);
    ctx.fillStyle = '#fff';
    ctx.fillRect(mmX + px - 1, mmY + py - 1, 4, 4);

    ctx.strokeStyle = '#fff';
    ctx.strokeRect(
      mmX + (camX / MAP_W) * mmW,
      mmY + (camY / MAP_H) * mmH,
      (VIEW_W / MAP_W) * mmW,
      (VIEW_H / MAP_H) * mmH
    );
  }

  function drawBattle() {
    const b = state.battle;
    if (!b) return;

    ctx.fillStyle = '#0d111c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#23314f';
    ctx.fillRect(0, canvas.height - 220, canvas.width, 220);

    ctx.fillStyle = '#7aa95e';
    ctx.beginPath();
    ctx.ellipse(250, 260, 170, 70, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#7aa95e';
    ctx.beginPath();
    ctx.ellipse(700, 430, 190, 80, 0, 0, Math.PI * 2);
    ctx.fill();

    drawMonSprite(b.enemy, 250, 220, 4, 1);
    drawMonSprite(b.ally, 700, 390, 4.4, -1);

    drawBar(80, 70, 280, 56, `${b.enemy.name} Lv.${b.enemy.level}`, b.enemy.hp, b.enemy.hpMax);
    drawBar(600, 285, 280, 56, `${b.ally.name} Lv.${b.ally.level}`, b.ally.hp, b.ally.hpMax);

    const actions = ['[A]ttacco', '[P]ozione', '[B]all', '[F]uga'];
    ctx.fillStyle = '#e6edff';
    ctx.font = '22px sans-serif';
    ctx.fillText(actions.join('   '), 30, canvas.height - 160);

    ctx.font = '18px sans-serif';
    const logs = b.log.slice(-4);
    logs.forEach((l, i) => ctx.fillText(l, 30, canvas.height - 120 + i * 26));
  }

  function drawBar(x, y, w, h, label, hp, hpMax) {
    ctx.fillStyle = '#111827';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#94a3b8';
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.fillText(label, x + 10, y + 20);

    const ratio = hpMax ? hp / hpMax : 0;
    let c = '#4ade80';
    if (ratio < 0.5) c = '#fbbf24';
    if (ratio < 0.25) c = '#f87171';
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(x + 10, y + 30, w - 20, 16);
    ctx.fillStyle = c;
    ctx.fillRect(x + 10, y + 30, (w - 20) * ratio, 16);
    ctx.fillStyle = '#fff';
    ctx.fillText(`${hp}/${hpMax}`, x + w - 90, y + 22);
  }

  function updateHud() {
    const p = state.player;
    const tile = tileAt(p.x, p.y);
    const tileName = Object.keys(TILE_KIND).find((k) => TILE_KIND[k] === tile);
    quickInfo.textContent = `Pos ${p.x},${p.y} | Zona ${tileName} | Monete ${p.coins}`;

    teamList.innerHTML = state.party
      .map((m) => {
        const dead = m.hp <= 0;
        return `<div class="card"><strong>${m.name}</strong> Lv.${m.level} <small>(${m.type})</small><br/><small class="${dead ? 'bad' : 'good'}">HP ${m.hp}/${m.hpMax}</small> <small>EXP ${m.exp}</small></div>`;
      })
      .join('');

    bagList.innerHTML = `<div class="card">Ball: <strong>${state.bag.captureBall}</strong><br/>Pozioni: <strong>${state.bag.potion}</strong><br/>Super Pozioni: <strong>${state.bag.superPotion}</strong></div>`;

    dexList.innerHTML = MON_DB.map((m) => {
      const seen = state.dex.has(m.id);
      return `<div class="card">#${m.id.toString().padStart(3, '0')} ${seen ? m.name : '???'} <small>${seen ? m.type : ''}</small></div>`;
    }).join('');

    if (state.messageQueue.length > 0) {
      statusLine.textContent = state.messageQueue[0].msg;
    } else {
      statusLine.textContent = state.mode === 'battle' ? 'Battaglia in corso...' : 'Esplora il mondo e cattura mostri!';
    }

    panel.style.display = state.ui.showPanel ? 'block' : 'none';
  }

  function tickMessages(dt) {
    if (state.messageQueue.length === 0) return;
    state.messageQueue[0].t -= dt;
    if (state.messageQueue[0].t <= 0) state.messageQueue.shift();
  }

  function updateWorld(dt) {
    let dx = 0;
    let dy = 0;
    if (keys.has('ArrowUp') || keys.has('KeyW')) dy = -1;
    else if (keys.has('ArrowDown') || keys.has('KeyS')) dy = 1;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) dx = -1;
    else if (keys.has('ArrowRight') || keys.has('KeyD')) dx = 1;

    if (dx !== 0 || dy !== 0) {
      tryMove(dx, dy, dt);
    } else {
      state.player.moveTimer = 0;
    }
  }

  function gameLoop(ts) {
    const dt = Math.min(0.05, (ts - lastTime) / 1000 || 0.016);
    lastTime = ts;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (state.mode === 'world') {
      updateWorld(dt);
      drawWorld();
    } else {
      drawBattle();
    }

    tickMessages(dt);
    updateHud();
    requestAnimationFrame(gameLoop);
  }

  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'KeyE' && state.mode === 'world') interact();
    if (e.code === 'KeyI') state.ui.showPanel = !state.ui.showPanel;

    if (state.mode === 'battle') {
      if (e.code === 'KeyA') attack();
      else if (e.code === 'KeyP') usePotion();
      else if (e.code === 'KeyB') tryCapture();
      else if (e.code === 'KeyF') runAway();
    }
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
  });

  function init() {
    generateMap();
    state.party.push(starter());
    queueMessage('Benvenuto! Esplora e diventa il miglior allenatore.');
    requestAnimationFrame(gameLoop);
  }

  init();
})();
