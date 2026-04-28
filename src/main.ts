import Phaser from 'phaser';

type Tile = 'water' | 'sand' | 'grass' | 'forest' | 'mountain' | 'road' | 'tall' | 'center' | 'shop';

type MonTemplate = {
  id: number;
  name: string;
  type: string;
  color: number;
  baseHp: number;
  atk: number;
  def: number;
  spd: number;
};

type Mon = MonTemplate & {
  level: number;
  hpMax: number;
  hp: number;
  exp: number;
};

const TILE = 24;
const MAP_W = 160;
const MAP_H = 160;
const MON_DB: MonTemplate[] = [
  { id: 1, name: 'Pyron', type: 'Fuoco', color: 0xff7043, baseHp: 42, atk: 18, def: 10, spd: 14 },
  { id: 2, name: 'Aquava', type: 'Acqua', color: 0x42a5f5, baseHp: 46, atk: 15, def: 13, spd: 12 },
  { id: 3, name: 'Florab', type: 'Erba', color: 0x66bb6a, baseHp: 48, atk: 14, def: 14, spd: 10 },
  { id: 4, name: 'Voltix', type: 'Elettro', color: 0xfdd835, baseHp: 38, atk: 20, def: 9, spd: 18 },
  { id: 5, name: 'Roclan', type: 'Roccia', color: 0x8d6e63, baseHp: 56, atk: 16, def: 17, spd: 7 }
];

const gameState = {
  map: [] as Tile[][],
  player: { x: Math.floor(MAP_W / 2), y: Math.floor(MAP_H / 2), coins: 500 },
  bag: { potion: 5, ball: 10 },
  party: [] as Mon[],
  log: 'Benvenuto nel mondo Monstermon!',
  worldReady: false,
  inBattle: false,
  enemy: null as Mon | null
};

const rand = (a: number, b: number): number => Phaser.Math.Between(a, b);

const mkMon = (tpl: MonTemplate, level: number): Mon => {
  const iv = rand(0, 5);
  const hpMax = tpl.baseHp + level * 3 + iv;
  return { ...tpl, level, hpMax, hp: hpMax, exp: 0 };
};

class WorldScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { [k: string]: Phaser.Input.Keyboard.Key };
  private mapGfx!: Phaser.GameObjects.Graphics;
  private playerGfx!: Phaser.GameObjects.Graphics;
  private uiText!: Phaser.GameObjects.Text;
  private minimap!: Phaser.GameObjects.Graphics;

  constructor() {
    super('world');
  }

  create(): void {
    if (!gameState.worldReady) {
      this.generateMap();
      gameState.party.push(mkMon(MON_DB[0], 5));
      gameState.worldReady = true;
    }

    this.cameras.main.setBackgroundColor('#0f172a');
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D,E') as { [k: string]: Phaser.Input.Keyboard.Key };

    this.mapGfx = this.add.graphics();
    this.playerGfx = this.add.graphics();
    this.minimap = this.add.graphics();

    this.uiText = this.add
      .text(12, 12, '', {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: '16px',
        color: '#e2e8f0',
        backgroundColor: '#0b1220cc',
        padding: { x: 10, y: 6 }
      })
      .setDepth(99)
      .setScrollFactor(0);

    this.cameras.main.startFollow(new Phaser.GameObjects.Zone(this, gameState.player.x * TILE, gameState.player.y * TILE, 1, 1), true);

    this.input.keyboard!.on('keydown-E', () => this.interact());
    this.input.keyboard!.on('keydown-I', () => this.startBattle());
  }

  update(_: number, dt: number): void {
    if (gameState.inBattle) return;

    const step = dt > 0 ? 1 : 0;
    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) dx = -step;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) dx = step;
    if (this.cursors.up.isDown || this.wasd.W.isDown) dy = -step;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) dy = step;

    if (dx !== 0 || dy !== 0) {
      const nx = Phaser.Math.Clamp(gameState.player.x + dx, 0, MAP_W - 1);
      const ny = Phaser.Math.Clamp(gameState.player.y + dy, 0, MAP_H - 1);
      const t = gameState.map[ny][nx];
      if (t !== 'water' && t !== 'mountain') {
        gameState.player.x = nx;
        gameState.player.y = ny;
        if (t === 'tall' && Math.random() < 0.025) this.startBattle();
      }
    }

    this.drawWorld();
    const zone = this.cameras.main._follow as Phaser.GameObjects.Zone;
    if (zone) zone.setPosition(gameState.player.x * TILE, gameState.player.y * TILE);
  }

  private drawWorld(): void {
    this.mapGfx.clear();
    const cam = this.cameras.main;
    const sx = Math.floor(cam.worldView.x / TILE) - 1;
    const sy = Math.floor(cam.worldView.y / TILE) - 1;
    const ex = sx + Math.ceil(cam.width / TILE) + 2;
    const ey = sy + Math.ceil(cam.height / TILE) + 2;

    for (let y = sy; y <= ey; y++) {
      for (let x = sx; x <= ex; x++) {
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
        const t = gameState.map[y][x];
        const c = this.tileColor(t);
        this.mapGfx.fillStyle(c, 1);
        this.mapGfx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    this.playerGfx.clear();
    this.playerGfx.fillStyle(0x111827, 0.25);
    this.playerGfx.fillEllipse(gameState.player.x * TILE + TILE / 2, gameState.player.y * TILE + TILE * 0.86, TILE * 0.45, TILE * 0.2);
    this.playerGfx.fillStyle(0xef4444, 1);
    this.playerGfx.fillRoundedRect(gameState.player.x * TILE + 6, gameState.player.y * TILE + 3, 12, 8, 3);
    this.playerGfx.fillStyle(0xf8fafc, 1);
    this.playerGfx.fillRoundedRect(gameState.player.x * TILE + 6, gameState.player.y * TILE + 10, 12, 10, 3);
    this.playerGfx.fillStyle(0x0f172a, 1);
    this.playerGfx.fillRoundedRect(gameState.player.x * TILE + 7, gameState.player.y * TILE + 18, 10, 5, 2);

    this.drawMinimap();
    this.uiText.setText(
      `Monete: ${gameState.player.coins} | Pozioni: ${gameState.bag.potion} | Ball: ${gameState.bag.ball}\n` +
        `${gameState.log} (E = interagisci, I = forzo encounter)`
    );
  }

  private drawMinimap(): void {
    this.minimap.clear();
    const w = 140;
    const h = 140;
    const x0 = this.cameras.main.width - w - 18;
    const y0 = 16;

    this.minimap.fillStyle(0x0b1220, 0.8);
    this.minimap.fillRoundedRect(x0 - 6, y0 - 6, w + 12, h + 12, 8);

    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const tx = Math.floor((x / w) * MAP_W);
        const ty = Math.floor((y / h) * MAP_H);
        this.minimap.fillStyle(this.tileColor(gameState.map[ty][tx]), 1);
        this.minimap.fillRect(x0 + x, y0 + y, 2, 2);
      }
    }

    this.minimap.fillStyle(0xffffff, 1);
    this.minimap.fillRect(x0 + (gameState.player.x / MAP_W) * w - 1, y0 + (gameState.player.y / MAP_H) * h - 1, 4, 4);
    this.minimap.setScrollFactor(0);
  }

  private tileColor(tile: Tile): number {
    switch (tile) {
      case 'water':
        return 0x1d4ed8;
      case 'sand':
        return 0xe8c08c;
      case 'grass':
        return 0x5ca853;
      case 'forest':
        return 0x287443;
      case 'mountain':
        return 0x667381;
      case 'road':
        return 0xad946f;
      case 'tall':
        return 0x3f964f;
      case 'center':
        return 0xf472b6;
      case 'shop':
        return 0xfacc15;
      default:
        return 0x334155;
    }
  }

  private generateMap(): void {
    const map: Tile[][] = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => 'grass'));

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const n = this.noise(x, y);
        if (n < 0.2) map[y][x] = 'water';
        else if (n < 0.27) map[y][x] = 'sand';
        else if (n < 0.55) map[y][x] = 'grass';
        else if (n < 0.7) map[y][x] = 'forest';
        else if (n < 0.84) map[y][x] = 'mountain';
        else map[y][x] = 'tall';
      }
    }

    const cx = Math.floor(MAP_W / 2);
    const cy = Math.floor(MAP_H / 2);
    for (let x = 5; x < MAP_W - 5; x++) map[cy][x] = 'road';
    for (let y = 5; y < MAP_H - 5; y++) map[y][cx] = 'road';

    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        map[cy + oy][cx + ox + 2] = 'center';
        map[cy + oy][cx + ox - 2] = 'shop';
      }
    }

    gameState.map = map;
  }

  private noise(x: number, y: number): number {
    const n = Math.sin(x * 0.075 + y * 0.044) + Math.sin(x * 0.022) + Math.cos(y * 0.05);
    return (n + 3) / 6;
  }

  private interact(): void {
    const t = gameState.map[gameState.player.y][gameState.player.x];
    const lead = gameState.party[0];
    if (!lead) return;
    if (t === 'center') {
      gameState.party.forEach((m) => (m.hp = m.hpMax));
      gameState.log = 'Centro cura: squadra rimessa in forma!';
    } else if (t === 'shop') {
      if (gameState.player.coins >= 100) {
        gameState.player.coins -= 100;
        gameState.bag.ball += 3;
        gameState.bag.potion += 1;
        gameState.log = 'Shop: comprate 3 Ball e 1 Pozione.';
      } else {
        gameState.log = 'Monete insufficienti.';
      }
    } else {
      gameState.log = `In zona ${t}. Esplora o vai in erba alta.`;
    }
  }

  private startBattle(): void {
    if (gameState.inBattle) return;
    gameState.inBattle = true;
    gameState.enemy = mkMon(MON_DB[rand(0, MON_DB.length - 1)], rand(2, 9));
    this.scene.pause();
    this.scene.launch('battle');
  }
}

class BattleScene extends Phaser.Scene {
  private info!: Phaser.GameObjects.Text;
  private action!: Phaser.GameObjects.Text;

  constructor() {
    super('battle');
  }

  create(): void {
    this.add.rectangle(640, 360, 1280, 720, 0x0a1020, 0.94);
    this.add.ellipse(290, 260, 300, 120, 0x7aa95e, 1);
    this.add.ellipse(920, 470, 340, 140, 0x7aa95e, 1);

    const ally = gameState.party[0];
    const enemy = gameState.enemy;
    if (!ally || !enemy) return;

    this.drawMon(enemy, 290, 220, 1);
    this.drawMon(ally, 920, 420, -1);

    this.info = this.add.text(30, 26, this.infoText(), {
      fontFamily: 'Segoe UI, sans-serif',
      fontSize: '25px',
      color: '#e2e8f0'
    });

    this.action = this.add.text(30, 560, '[A]ttacco   [P]ozione   [B]all   [F]uga', {
      fontFamily: 'Segoe UI, sans-serif',
      fontSize: '32px',
      color: '#c7d2fe'
    });

    this.input.keyboard!.on('keydown-A', () => this.attack());
    this.input.keyboard!.on('keydown-P', () => this.potion());
    this.input.keyboard!.on('keydown-B', () => this.capture());
    this.input.keyboard!.on('keydown-F', () => this.runAway());
  }

  private infoText(): string {
    const ally = gameState.party[0]!;
    const enemy = gameState.enemy!;
    return `${enemy.name} Lv.${enemy.level} HP ${enemy.hp}/${enemy.hpMax}\n` + `${ally.name} Lv.${ally.level} HP ${ally.hp}/${ally.hpMax}\n` + gameState.log;
  }

  private damage(a: Mon, d: Mon, p = 12): number {
    return Math.max(1, p + a.atk - Math.floor(d.def * 0.5) + rand(-2, 2));
  }

  private attack(): void {
    const ally = gameState.party[0]!;
    const enemy = gameState.enemy!;
    const d = this.damage(ally, enemy, 13);
    enemy.hp = Math.max(0, enemy.hp - d);
    gameState.log = `${ally.name} colpisce ${enemy.name}: -${d} HP.`;

    if (enemy.hp <= 0) {
      gameState.player.coins += 35;
      ally.exp += 15;
      if (ally.exp >= ally.level * 25) {
        ally.exp = 0;
        ally.level += 1;
        ally.hpMax += 4;
        ally.hp = ally.hpMax;
        ally.atk += 2;
        ally.def += 1;
      }
      this.finishBattle('Nemico sconfitto!');
      return;
    }

    this.enemyTurn();
  }

  private enemyTurn(): void {
    const ally = gameState.party[0]!;
    const enemy = gameState.enemy!;
    const d = this.damage(enemy, ally, 11);
    ally.hp = Math.max(0, ally.hp - d);
    gameState.log += ` ${enemy.name} risponde: -${d} HP.`;
    if (ally.hp <= 0) {
      ally.hp = 1;
      this.finishBattle('Sei KO tecnico, ritorna al centro cura.');
      return;
    }
    this.info.setText(this.infoText());
  }

  private potion(): void {
    const ally = gameState.party[0]!;
    if (gameState.bag.potion <= 0) {
      gameState.log = 'Nessuna pozione disponibile.';
      this.info.setText(this.infoText());
      return;
    }
    gameState.bag.potion -= 1;
    ally.hp = Math.min(ally.hpMax, ally.hp + 28);
    gameState.log = 'Usi una pozione.';
    this.enemyTurn();
  }

  private capture(): void {
    const enemy = gameState.enemy!;
    if (gameState.bag.ball <= 0) {
      gameState.log = 'Nessuna ball disponibile.';
      this.info.setText(this.infoText());
      return;
    }
    gameState.bag.ball -= 1;
    const chance = 0.2 + (1 - enemy.hp / enemy.hpMax) * 0.6;
    if (Math.random() < chance) {
      gameState.party.push(enemy);
      this.finishBattle(`Catturato ${enemy.name}!`);
      return;
    }
    gameState.log = 'La ball si rompe.';
    this.enemyTurn();
  }

  private runAway(): void {
    if (Math.random() < 0.65) {
      this.finishBattle('Fuga riuscita.');
      return;
    }
    gameState.log = 'Non riesci a fuggire!';
    this.enemyTurn();
  }

  private finishBattle(message: string): void {
    gameState.log = message;
    gameState.enemy = null;
    gameState.inBattle = false;
    this.scene.stop();
    this.scene.resume('world');
  }

  private drawMon(mon: Mon, x: number, y: number, face: 1 | -1): void {
    const g = this.add.graphics();
    const radius = 50;
    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(x, y + 54, 90, 22);

    g.fillStyle(mon.color, 1);
    g.fillEllipse(x, y, radius * 2, radius * 1.6);

    g.fillStyle(0x111827, 1);
    g.fillCircle(x - 14 * face, y - 10, 6);
    g.fillCircle(x + 14 * face, y - 10, 6);

    g.fillStyle(0xf8fafc, 1);
    g.fillCircle(x - 12 * face, y - 11, 2);
    g.fillCircle(x + 16 * face, y - 11, 2);

    g.lineStyle(4, 0x030712, 1);
    g.beginPath();
    g.arc(x, y + 10, 20, 0, Math.PI, false);
    g.strokePath();
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#0f172a',
  scene: [WorldScene, BattleScene],
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
});
