(() => {
  const CFG = (window.__BLOCKMAN_CFG__ || {});
  const CONTAINER_ID = CFG.containerId || 'blockman-game';
  const ASSETS = CFG.assets || {};
  const DPR = Math.min(window.devicePixelRatio || 1, 2); // Akku/Leistung schonen

  // --- Input-State (Keyboard + D-Pad Polling)
  const inputState = { up:false, down:false, left:false, right:false };
  const setDir = (d, on) => { inputState[d] = on; };

  // D-Pad DOM (Polling)
  (function initDPad(){
    const pad = document.getElementById('bm-dpad');
    if (!pad) return;
    const bind = (btn, dir) => {
      ['pointerdown','pointerenter'].forEach(ev => btn.addEventListener(ev, e => { if(e.buttons){ setDir(dir,true); } }));
      ['pointerup','pointerleave','pointercancel'].forEach(ev => btn.addEventListener(ev, () => setDir(dir,false)));
      // Tap fallback
      btn.addEventListener('touchstart', e => { e.preventDefault(); setDir(dir,true); }, {passive:false});
      btn.addEventListener('touchend',   e => { e.preventDefault(); setDir(dir,false); }, {passive:false});
    };
    pad.querySelectorAll('.bm-key').forEach(el => bind(el, el.dataset.dir));
  })();

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.key)) e.preventDefault();
    if (e.key==='ArrowUp') setDir('up',true);
    if (e.key==='ArrowDown') setDir('down',true);
    if (e.key==='ArrowLeft') setDir('left',true);
    if (e.key==='ArrowRight') setDir('right',true);
  }, {passive:false});
  window.addEventListener('keyup', (e) => {
    if (e.key==='ArrowUp') setDir('up',false);
    if (e.key==='ArrowDown') setDir('down',false);
    if (e.key==='ArrowLeft') setDir('left',false);
    if (e.key==='ArrowRight') setDir('right',false);
  });

  // HUD
  const elScore = document.getElementById('bm-score-val');
  const elLevel = document.getElementById('bm-level-val');
  const btnPause = document.getElementById('bm-pause-btn');
  const btnSound = document.getElementById('bm-sound-btn');
  const startOverlay = document.getElementById('bm-start');
  const startBtn = document.getElementById('bm-start-btn');

  // Phaser Config
  const config = {
    type: Phaser.AUTO,
    parent: CONTAINER_ID,
    backgroundColor: '#0b0b12',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 1024, height: 576,
      min: { width: 480, height: 270 },
      max: { width: 1920, height: 1080 },
      expandParent: true
    },
    resolution: DPR,
    physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
    audio: { disableWebAudio: false },
    fps: { target: 60, forceSetTimeOut: true },
    scene: []
  };

  class BootScene extends Phaser.Scene {
    constructor(){ super('boot'); }
    preload() {
      this.load.setBaseURL('');
      // Assets
      this.load.image('player', ASSETS.player);
      this.load.image('dot', ASSETS.circle);
      this.load.image('bonusSquare', ASSETS.square);
      this.load.image('powerHex', ASSETS.hex);
      this.load.image('bonusStar', ASSETS.star);

      // einfache SFX (optional eigene hinzufügen)
      this.load.audio('sfxDot', 'data:audio/ogg;base64,T2dnUwACAAAAAAAAAAB...'); // (platzhalterlos – kann leer bleiben)
    }
    create() { this.scene.start('game'); }
  }

  class GameScene extends Phaser.Scene {
    constructor(){ super('game'); }

    init() {
      this.level = 1;
      this.score = 0;
      this.soundOn = true;
      this.tileSize = 32;
      // Simple Maze (1=Wand, 0=leer)
      this.map = [
        "1111111111111111111111111111",
        "1000000000110000000000000001",
        "1011111100110111111111101101",
        "1010000100000000001000100001",
        "1010110111111111101110111101",
        "1010110000001000000010000101",
        "1010111111101111111011100101",
        "1010000000100000000010000101",
        "1011111100111111111010110101",
        "1000000100000000000010000101",
        "1111110111110111111110110101",
        "1000000000000100000000000101",
        "1011111111110111111111111101",
        "1000000000000000000000000001",
        "1111111111111111111111111111",
      ].map(r => r.split('').map(Number));
      this.worldW = this.map[0].length * this.tileSize;
      this.worldH = this.map.length * this.tileSize;
    }

    create() {
      const { width, height } = this.scale;

      // Walls
      this.walls = this.physics.add.staticGroup();
      for (let y=0; y<this.map.length; y++){
        for (let x=0; x<this.map[y].length; x++){
          if (this.map[y][x] === 1) {
            const r = this.add.rectangle(
              x*this.tileSize + this.tileSize/2,
              y*this.tileSize + this.tileSize/2,
              this.tileSize, this.tileSize, 0x121223, 0.88
            );
            this.physics.add.existing(r, true);
            this.walls.add(r);
          }
        }
      }

      // Player
      this.player = this.physics.add.image(2*this.tileSize, 2*this.tileSize, 'player')
        .setDisplaySize(28,28).setCircle(14).setOffset(0,0);
      this.player.speed = 140;

      // Collectibles
      this.dots = this.physics.add.staticGroup();
      this.power = this.physics.add.staticGroup();
      this.bonus = this.physics.add.group({ allowGravity:false, immovable:true });

      for (let y=0; y<this.map.length; y++){
        for (let x=0; x<this.map[y].length; x++){
          if (this.map[y][x] === 0) {
            const atEdge = (x%6===0 && y%3===0);
            if (atEdge) {
              // Power Hex
              const p = this.power.create(x*this.tileSize+16, y*this.tileSize+16, 'powerHex').setScale(0.22).refreshBody();
              p.type = 'power';
            } else {
              const d = this.dots.create(x*this.tileSize+16, y*this.tileSize+16, 'dot').setScale(0.18).refreshBody();
              d.type = 'dot';
            }
          }
        }
      }

      // Enemies (simple ‘weighted chase’)
      this.enemies = this.physics.add.group();
      const spawn = [
        {x: 22, y: 2, color: 0xff3b30, speed: 120}, // Blinky-like
        {x: 22, y:12, color: 0xff2ea6, speed: 110}, // Pinky-like
        {x: 10, y:12, color: 0x00e5ff, speed: 105}, // Inky-like
        {x: 10, y:2,  color: 0xffa400, speed: 95},  // Clyde-like
      ];
      spawn.slice(0, Math.min(2+Math.floor((this.level-1)/2), 4)).forEach(s => {
        const e = this.add.circle(s.x*this.tileSize, s.y*this.tileSize, 14, s.color);
        this.physics.add.existing(e);
        e.body.setCircle(14); e.speed = s.speed; e.state = 'chase'; e.dir = new Phaser.Math.Vector2(1,0);
        this.enemies.add(e);
      });

      // Collisions
      this.player.setCollideWorldBounds(true);
      this.physics.add.collider(this.player, this.walls);
      this.physics.add.overlap(this.player, this.dots, this.collect, null, this);
      this.physics.add.overlap(this.player, this.power, this.collectPower, null, this);
      this.physics.add.overlap(this.player, this.bonus, this.collectBonus, null, this);
      this.physics.add.overlap(this.player, this.enemies, this.hitEnemy, null, this);

      // Camera
      this.cameras.main.setBounds(0,0,this.worldW, this.worldH);
      this.physics.world.setBounds(0,0,this.worldW, this.worldH);
      this.cameras.main.startFollow(this.player);
      // leichte Zoom-Anpassung je nach Device
      const w = this.scale.gameSize.width;
      if (w < 600) this.cameras.main.setZoom(0.9);
      else if (w > 1400) this.cameras.main.setZoom(1.15);

      // HUD Bindings
      elLevel && (elLevel.textContent = String(this.level));
      elScore && (elScore.textContent = String(this.score));

      // UI Events
      btnPause && btnPause.addEventListener('click', () => {
        const p = !this.physics.world.isPaused;
        this.physics.world.isPaused = p;
        btnPause.setAttribute('aria-pressed', String(p));
      });
      btnSound && btnSound.addEventListener('click', () => {
        this.soundOn = !this.soundOn;
        btnSound.setAttribute('aria-pressed', String(this.soundOn));
        this.sound.mute = !this.soundOn;
      });

      // Start Overlay
      if (startOverlay) {
        startBtn && startBtn.addEventListener('click', () => {
          startOverlay.style.display = 'none';
        }, { once: true });
      }
    }

    collect(player, dot) {
      dot.destroy();
      this.addScore(10);
      // Optionale SFX
      if (this.soundOn && this.sound.get('sfxDot')) this.sound.play('sfxDot',{volume:.25});
      if (this.dots.countActive() === 0 && this.power.countActive() === 0) {
        this.nextLevel();
      }
    }

    collectPower(player, pellet) {
      pellet.destroy();
      this.addScore(50);
      // Frightened kurz: Gegner werden langsamer/blau (hier nur slowdown)
      this.enemies.children.iterate(e => {
        if (!e) return;
        e.prevSpeed = e.speed;
        e.speed = Math.max(60, e.speed*0.6);
        this.tweens.addCounter({
          from: 0, to: 1, duration: Math.max(1200, 700 + this.level*50),
          onComplete: () => { e.speed = e.prevSpeed || e.speed; }
        });
      });
    }

    collectBonus(player, b) {
      b.destroy();
      this.addScore(200);
    }

    addScore(v) {
      this.score += v;
      elScore && (elScore.textContent = String(this.score));
    }

    nextLevel() {
      this.level++;
      elLevel && (elLevel.textContent = String(this.level));
      // Respawn dots/power minimal schneller + zusätzliche Gegner bis 4
      this.scene.restart({ level: this.level, score: this.score, soundOn: this.soundOn });
    }

    hitEnemy(player, e) {
      // Wenn gerade "frightened-slow" aktiv wäre, könnte man Gegner entfernen.
      // Hier: einfacher Lose-Effekt → Restart Level
      this.cameras.main.flash(200, 255, 0, 160);
      this.time.delayedCall(300, () => this.scene.restart({ level: this.level, score: Math.max(0,this.score-100), soundOn: this.soundOn }));
    }

    update(time, delta) {
      // Player Movement (grid-freundlich)
      const body = this.player.body;
      const speed = this.player.speed;
      const vx = (inputState.left ? -1 : inputState.right ? 1 : 0);
      const vy = (inputState.up   ? -1 : inputState.down  ? 1 : 0);
      body.setVelocity(vx*speed, vy*speed);
      if (vx && vy) { // diagonal → priorisiere letzte Richtung (einfach)
        body.velocity.normalize().scale(speed);
      }

      // Gegner-Logik (simplified chase weighting)
      const px = this.player.x, py = this.player.y;
      this.enemies.children.iterate((e) => {
        if (!e) return;
        const eb = e.body;
        // nur an "Kreuzungen" Richtung wechseln (naiv: wenn nahe Tile-Zentrum)
        const nearCenter = (Math.abs((e.x % this.tileSize) - this.tileSize/2) < 2 &&
                            Math.abs((e.y % this.tileSize) - this.tileSize/2) < 2);
        if (nearCenter) {
          const toP = new Phaser.Math.Vector2(px - e.x, py - e.y).normalize();
          // leichte Zufallskomponente, Clyde-like Abstand
          const dist = Phaser.Math.Distance.Between(px,py,e.x,e.y);
          const avoid = dist < 120 ? -0.6 : 0.0;
          e.dir = new Phaser.Math.Vector2(
            Phaser.Math.Clamp(toP.x + (Math.random()-.5)*0.4 + avoid, -1, 1),
            Phaser.Math.Clamp(toP.y + (Math.random()-.5)*0.4 + avoid, -1, 1)
          ).normalize();
        }
        eb.setVelocity(e.dir.x*e.speed, e.dir.y*e.speed);
        // primitive Wand-Kollision vermeiden
        this.physics.world.collide(e, this.walls, () => {
          e.dir = e.dir.rotate(Math.PI/2); // abbiegen
        });
      });

      // Bonus Items sporadisch spawnen
      if (!this._nextBonus || time > this._nextBonus) {
        this._nextBonus = time + Phaser.Math.Between(8000, 14000);
        const empties = [];
        for (let y=1; y<this.map.length-1; y++){
          for (let x=1; x<this.map[0].length-1; x++){
            if (this.map[y][x]===0) empties.push({x,y});
          }
        }
        const pick = Phaser.Utils.Array.GetRandom(empties);
        const b = this.bonus.create(pick.x*this.tileSize+16, pick.y*this.tileSize+16, Math.random()<.5?'bonusSquare':'bonusStar');
        b.setScale(.25); b.type='bonus';
        this.time.delayedCall(6000, ()=> b.destroy());
      }
    }

    // Keep params on restart
    constructorRestartInject() { /* placeholder */ }
    // Use scene data to carry forward
    init(data) {
      if (data) {
        this.level = data.level || this.level || 1;
        this.score = data.score || this.score || 0;
        this.soundOn = (typeof data.soundOn==='boolean') ? data.soundOn : true;
      }
      this.tileSize = 32;
      this.map = [
        "1111111111111111111111111111",
        "1000000000110000000000000001",
        "1011111100110111111111101101",
        "1010000100000000001000100001",
        "1010110111111111101110111101",
        "1010110000001000000010000101",
        "1010111111101111111011100101",
        "1010000000100000000010000101",
        "1011111100111111111010110101",
        "1000000100000000000010000101",
        "1111110111110111111110110101",
        "1000000000000100000000000101",
        "1011111111110111111111111101",
        "1000000000000000000000000001",
        "1111111111111111111111111111",
      ].map(r => r.split('').map(Number));
      this.worldW = this.map[0].length * this.tileSize;
      this.worldH = this.map.length * this.tileSize;
    }
  }

  // Start Game
  const game = new Phaser.Game({ ...config, scene: [BootScene, GameScene] });

  // Safety: Pause when tab hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.loop.sleep();
    else game.loop.wake();
  });
})();
