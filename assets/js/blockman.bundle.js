(() => {
  const CFG = (window.__BLOCKMAN_CFG__ |

| {});
  const CONTAINER_ID = CFG.containerId |

| 'blockman-game';
  const ASSETS = CFG.assets |

| {};
  // DPR auf max 2 begrenzen, aber für scharfe Grafik nutzen
  const DPR = Math.min(window.devicePixelRatio |

| 1, 2);

  // Globale Konstanten für das Spiel
  const TILE_SIZE = 32;
  const PLAYER_SPEED_BASE = 140;
  const GHOST_SPEED_BASE = 120;
  const FRIGHT_DURATION = 5000; // 5 Sekunden frightened
  const SCATTER_DURATION = 7000; // 7 Sekunden Scatter Phase 1
  
  // --- Input-State (Keyboard + D-Pad Polling)
  const inputState = { up:false, down:false, left:false, right:false, dir: 'right' };
  const setDir = (d, on) => {
    inputState[d] = on;
    if (on) { inputState.dir = d; }
  };

  // D-Pad DOM (Polling)
  (function initDPad(){
    const pad = document.getElementById('bm-dpad');
    if (!pad) return;
    const bind = (btn, dir) => {
      ['pointerdown','pointerenter'].forEach(ev => btn.addEventListener(ev, e => { if(e.buttons){ setDir(dir,true); } }));
      ['pointerup','pointerleave','pointercancel'].forEach(ev => btn.addEventListener(ev, () => setDir(dir,false)));
      btn.addEventListener('touchstart', e => { e.preventDefault(); setDir(dir,true); }, {passive:false});
      btn.addEventListener('touchend',   e => { e.preventDefault(); setDir(dir,false); }, {passive:false});
    };
    pad.querySelectorAll('.bm-key').forEach(el => bind(el, el.dataset.dir));
  })();

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (.includes(e.key)) e.preventDefault();
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

  // HUD Elements
  const elScore = document.getElementById('bm-score-val');
  const elLevel = document.getElementById('bm-level-val');
  const btnPause = document.getElementById('bm-pause-btn');
  const btnSound = document.getElementById('bm-sound-btn');
  const startOverlay = document.getElementById('bm-start');
  const startBtn = document.getElementById('bm-start-btn');

  // Phaser Config (AAA-Scaling: NONE + Resize)
  const config = {
    type: Phaser.AUTO,
    parent: CONTAINER_ID,
    backgroundColor: '#0b0b12',
    scale: {
      mode: Phaser.Scale.NONE, // Manuelle Skalierung
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 1024, height: 576, // Logische Spielgröße
      expandParent: true,
    },
    resolution: DPR,
    physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
    audio: { disableWebAudio: false },
    fps: { target: 60, forceSetTimeOut: true },
    scene:
  };

  class BootScene extends Phaser.Scene {
    constructor(){ super('boot'); }
    preload() {
      this.load.setBaseURL('');
      this.load.image('player', ASSETS.player);
      this.load.image('dot', ASSETS.circle);
      this.load.image('bonusSquare', ASSETS.square);
      this.load.image('powerHex', ASSETS.hex);
      this.load.image('bonusStar', ASSETS.star);
      this.load.audio('sfxDot', 'data:audio/ogg;base64,T2dnUwACAAAAAAAAAAB...'); 
    }
    create() { this.scene.start('game'); }
  }

  class GameScene extends Phaser.Scene {
    constructor(){ super('game'); }

    init(data) {
      // Zustände für Geister
      this.GHOST_STATE = { CHASE: 0, SCATTER: 1, FRIGHTENED: 2 };

      this.level = data.level |

| 1;
      this.score = data.score |

| 0;
      this.soundOn = (typeof data.soundOn==='boolean')? data.soundOn : true;
      this.tileSize = TILE_SIZE;
      
      // Map und Weltgröße wie im Original
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
      this.worldW = this.map.length * this.tileSize;
      this.worldH = this.map.length * this.tileSize;
    }

    create() {
      // Manuelles Resize-Handling für AAA/Hi-DPI
      this.scale.on('resize', this.resize, this);
      this.resize(this.scale.gameSize); // Initialer Aufruf

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

      // Player (BlockMan)
      this.player = this.physics.add.image(2*this.tileSize + this.tileSize/2, 2*this.tileSize + this.tileSize/2, 'player')
       .setDisplaySize(28,28).setCircle(14).setOffset(0,0);
      this.player.speed = PLAYER_SPEED_BASE;
      this.player.dir = new Phaser.Math.Vector2(1, 0); // Aktuelle Bewegungsrichtung
      this.player.desiredDir = new Phaser.Math.Vector2(1, 0); // Gewünschte Abbiegerichtung

      // Collectibles
      this.dots = this.physics.add.staticGroup();
      this.power = this.physics.add.staticGroup();
      this.bonus = this.physics.add.group({ allowGravity:false, immovable:true });
      this.spawnDots(); // Initialer Spawn

      // Enemies (mit State Pattern Struktur)
      this.enemies = this.physics.add.group();
      const spawnData =;
      
      // Gegneranzahl abhängig vom Level (max 4)
      spawnData.slice(0, Math.min(2 + Math.floor(this.level / 5), 4)).forEach((s, index) => {
        const e = this.add.circle(s.x * this.tileSize + this.tileSize/2, s.y * this.tileSize + this.tileSize/2, 14, s.color);
        this.physics.add.existing(e);
        e.body.setCircle(14); 
        e.speed = s.speed; 
        e.defaultSpeed = s.speed;
        e.state = this.GHOST_STATE.SCATTER;
        e.targetCorner = s.targetCorner;
        e.dir = new Phaser.Math.Vector2(index % 2 === 0? 1 : -1, 0); // Startrichtung
        e.isBlinky = index === 0;
        this.enemies.add(e);
      });

      this.startGhostTimer(); // Start der Scatter/Chase-Zyklen

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

      // HUD Bindings
      elLevel && (elLevel.textContent = String(this.level));
      elScore && (elScore.textContent = String(this.score));

      // UI Events
      btnPause && btnPause.addEventListener('click', this.togglePause.bind(this));
      btnSound && btnSound.addEventListener('click', this.toggleSound.bind(this));

      // Start Overlay
      if (startOverlay) {
        startBtn && startBtn.addEventListener('click', () => {
          startOverlay.style.display = 'none';
        }, { once: true });
      }
    }

    // --- Skalierung (AAA / Hi-DPI) ---
    resize() {
      // Stellt sicher, dass das Canvas im Parent-Container zentriert und skaliert wird
      const { width, height } = this.scale.gameSize;
      const gameRatio = 1024 / 576; // Logisches 16:9 Verhältnis

      // Aktuelle Viewport-Größe
      const innerW = window.innerWidth;
      const innerH = window.innerHeight;
      const innerRatio = innerW / innerH;

      let newWidth, newHeight;
      if (innerRatio > gameRatio) {
        newHeight = innerH * DPR;
        newWidth = newHeight * gameRatio;
      } else {
        newWidth = innerW * DPR;
        newHeight = newWidth / gameRatio;
      }
      
      // Update des GameSize-Objekts (wichtig für interne Berechnung)
      this.scale.setGameSize(newWidth / DPR, newHeight / DPR);

      // Skalierung des Canvas-Containers
      const canvas = this.sys.game.canvas;
      if (canvas && canvas.style) {
          canvas.style.width = (newWidth / DPR) + 'px';
          canvas.style.height = (newHeight / DPR) + 'px';
      }

      // Kamera-Zoom anpassen (basierend auf der tatsächlichen Breite)
      const visibleW = this.scale.gameSize.width;
      let zoom = 1.0;
      if (visibleW < 600) zoom = 0.9;
      else if (visibleW > 1400) zoom = 1.15;
      this.cameras.main.setZoom(zoom);

      // World Bounds aktualisieren
      this.cameras.main.setBounds(0,0,this.worldW, this.worldH);
      this.physics.world.setBounds(0,0,this.worldW, this.worldH);
    }
    
    // --- Collectibles ---
    spawnDots() {
      for (let y=0; y<this.map.length; y++){
        for (let x=0; x<this.map[y].length; x++){
          if (this.map[y][x] === 0) {
            const atPowerSpot = (x % 11 === 2 && y % 11 === 2); // Beispiel: 2,2 / 2,13 / 13,2 / 13,13
            if (atPowerSpot) {
              const p = this.power.create(x*this.tileSize+16, y*this.tileSize+16, 'powerHex').setScale(0.22).refreshBody();
              p.type = 'power';
            } else {
              const d = this.dots.create(x*this.tileSize+16, y*this.tileSize+16, 'dot').setScale(0.18).refreshBody();
              d.type = 'dot';
            }
          }
        }
      }
    }

    collect(player, dot) {
      dot.destroy();
      this.addScore(10);
      if (this.soundOn && this.sound.get('sfxDot')) this.sound.play('sfxDot',{volume:.25});
      
      // *** NEU: Cruise Elroy Check ***
      const totalDots = this.dots.countActive() + this.power.countActive();
      if (totalDots <= 30) { // Beispiel: Turbo bei < 30 Punkten
        this.enemies.children.iterate(e => {
          if (e.isBlinky) {
            e.speed = e.defaultSpeed * 1.35; // Blinky Turbo-Modus
            if (e.state === this.GHOST_STATE.SCATTER) {
              e.state = this.GHOST_STATE.CHASE; // Chase Mode erzwingen
            }
          }
        });
      }

      if (totalDots === 0) {
        this.nextLevel();
      }
    }

    collectPower(player, pellet) {
      pellet.destroy();
      this.addScore(50);
      this.enemies.children.iterate(e => {
        if (!e) return;
        e.state = this.GHOST_STATE.FRIGHTENED;
        e.prevSpeed = e.speed;
        e.speed = Math.max(60, e.speed * 0.5); // Verlangsamen
        e.fillColor = 0x0000ff; // Blau färben
        
        // Frightened-Timer
        this.time.delayedCall(FRIGHT_DURATION, () => { 
          if (e.state === this.GHOST_STATE.FRIGHTENED) {
            e.speed = e.prevSpeed |

| e.defaultSpeed;
            e.state = this.GHOST_STATE.CHASE; // Zurück zu Chase (oder Scatter)
            e.fillColor = e.defaultColor; // Originalfarbe
          }
        });
      });
      this.time.delayedCall(FRIGHT_DURATION - 1500, this.startFlicker.bind(this));
    }
    
    // Einfache Frightened Flicker Logik
    startFlicker() {
        this.enemies.children.iterate(e => {
            if (e.state === this.GHOST_STATE.FRIGHTENED) {
                this.tweens.add({
                    targets: e,
                    fillColor: { from: 0x0000ff, to: 0xffffff }, // Blau zu Weiß
                    duration: 300,
                    repeat: 4,
                    yoyo: true,
                    onComplete: () => e.fillColor = e.defaultColor 
                });
            }
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
      this.scene.restart({ level: this.level, score: this.score, soundOn: this.soundOn });
    }

    hitEnemy(player, e) {
      if (e.state === this.GHOST_STATE.FRIGHTENED) {
          // Gegner gefressen (in Pac-Man entfernt man sie, hier: nur Restart)
          e.destroy();
          this.addScore(500);
      } else {
          this.cameras.main.flash(200, 255, 0, 160);
          this.time.delayedCall(300, () => this.scene.restart({ level: this.level, score: Math.max(0,this.score-100), soundOn: this.soundOn }));
      }
    }
    
    // --- Zustandswechsel für Geister (State Pattern Timing) ---
    startGhostTimer() {
        // Zyklus: Scatter (7s) -> Chase (20s) -> Scatter (7s) -> Chase (20s) ->...
        this._ghostTimer = this.time.addEvent({
            delay: SCATTER_DURATION,
            callback: this.toggleGhostState,
            callbackScope: this,
            loop: true
        });
    }

    toggleGhostState() {
        this.enemies.children.iterate(e => {
            if (!e) return;
            if (e.state!== this.GHOST_STATE.FRIGHTENED) {
                e.state = (e.state === this.GHOST_STATE.SCATTER)? this.GHOST_STATE.CHASE : this.GHOST_STATE.SCATTER;
            }
        });

        // Nächster Zyklus-Delay (kürzer Scatter, länger Chase)
        const newDelay = (this.enemies.getFirstAlive().state === this.GHOST_STATE.CHASE)? 20000 : SCATTER_DURATION;
        this._ghostTimer.delay = newDelay;
    }

    // --- Tile/Grid Helper ---
    getTile(pos) {
      return { 
        x: Math.floor(pos.x / this.tileSize), 
        y: Math.floor(pos.y / this.tileSize) 
      };
    }
    getCenterPos(tile) {
      return { 
        x: tile.x * this.tileSize + this.tileSize / 2, 
        y: tile.y * this.tileSize + this.tileSize / 2 
      };
    }
    isNearTileCenter(sprite) {
        const center = this.getCenterPos(this.getTile(sprite));
        return Phaser.Math.Distance.Between(sprite.x, sprite.y, center.x, center.y) < 6;
    }
    
    // --- Game Loop Update ---
    update(time, delta) {
      // 1. Player Movement (Grid-basiert mit Abbiege-Puffer)
      const playerTile = this.getTile(this.player);
      const center = this.getCenterPos(playerTile);
      const currentDir = this.player.dir;
      const desiredDir = new Phaser.Math.Vector2(
        (inputState.left? -1 : inputState.right? 1 : 0),
        (inputState.up? -1 : inputState.down? 1 : 0)
      );
      
      const speed = this.player.speed;
      let newVelocity = new Phaser.Math.Vector2(0, 0);

      // Bewegt den Spieler zum Tile-Center, wenn er abbiegen will
      if (this.isNearTileCenter(this.player)) {
          if (desiredDir.length() > 0) {
              const newDirVec = new Phaser.Math.Vector2(desiredDir.x, desiredDir.y).normalize();
              const nextTileX = playerTile.x + newDirVec.x;
              const nextTileY = playerTile.y + newDirVec.y;

              // Prüfe, ob das Abbiegen möglich ist (keine Wand)
              if (this.map && this.map!== 1) {
                  this.player.dir = newDirVec; // Neue Richtung übernehmen
                  newVelocity = newDirVec.scale(speed);
              }
          }
      }

      // Weiterhin in alter Richtung bewegen, wenn keine neue Richtung gewählt oder möglich
      if (newVelocity.length() === 0) {
          newVelocity = currentDir.clone().scale(speed);
      }
      
      this.player.body.setVelocity(newVelocity.x, newVelocity.y);


      // 2. Gegner-Logik (State-Based Grid-Movement)
      this.enemies.children.iterate((e) => {
        if (!e) return;
        
        e.defaultColor = e.defaultColor |

| e.fillColor; // Farbe für Frightened speichern
        const eTile = this.getTile(e);
        let targetTile = eTile; // Standard: aktuelle Kachel
        
        // Zielkachel basierend auf dem Zustand festlegen
        if (e.state === this.GHOST_STATE.SCATTER) {
            targetTile = e.targetCorner;
        } else if (e.state === this.GHOST_STATE.CHASE) {
            // Vereinfachte Jagd: Blinky zielt direkt auf BlockMan
            targetTile = playerTile; 
            // Hier könnten komplexe Target-Logiken für Pinky/Inky/Clyde implementiert werden
        } else if (e.state === this.GHOST_STATE.FRIGHTENED) {
            // Frightened: Zufällige Bewegung an Kreuzungen
            targetTile = { 
                x: eTile.x + Phaser.Math.Between(-1, 1), 
                y: eTile.y + Phaser.Math.Between(-1, 1) 
            }; 
        }

        // Bewegung zum nächsten Knotenpunkt
        if (this.isNearTileCenter(e)) {
            // Nur an Kreuzungen/Zentren neue Richtung wählen
            
            // Greed Pathfinder (Kurz: wähle Richtung, die dem Ziel am nächsten kommt)
            const possibleDirs = [{x: 1, y: 0}, {x: -1, y: 0}, {x: 0, y: 1}, {x: 0, y: -1}];
            let bestDir = e.dir;
            let minDistance = Infinity;
            
            possibleDirs.forEach(dir => {
                const nextTileX = eTile.x + dir.x;
                const nextTileY = eTile.y + dir.y;
                
                // Vermeide Rückwärtsbewegung, wenn nicht Frightened
                if (e.state!== this.GHOST_STATE.FRIGHTENED && 
                    dir.x === -e.dir.x && dir.y === -e.dir.y) return;

                // Prüfe, ob die Kachel begehbar ist
                if (this.map && this.map!== 1) {
                    const nextPos = this.getCenterPos({x: nextTileX, y: nextTileY});
                    const dist = Phaser.Math.Distance.Between(nextPos.x, nextPos.y, 
                        this.getCenterPos(targetTile).x, this.getCenterPos(targetTile).y);

                    if (dist < minDistance) {
                        minDistance = dist;
                        bestDir = new Phaser.Math.Vector2(dir.x, dir.y);
                    }
                }
            });

            e.dir = bestDir;
        }

        // Bewegung anwenden
        e.body.setVelocity(e.dir.x * e.speed, e.dir.y * e.speed);
      });

      // 3. Bonus Items sporadisch spawnen (unverändert)
      if (!this._nextBonus |

| time > this._nextBonus) {
        this._nextBonus = time + Phaser.Math.Between(8000, 14000);
        const empties =;
        for (let y=1; y<this.map.length-1; y++){
          for (let x=1; x<this.map.length-1; x++){
            if (this.map[y][x]===0) empties.push({x,y});
          }
        }
        const pick = Phaser.Utils.Array.GetRandom(empties);
        const b = this.bonus.create(pick.x*this.tileSize+16, pick.y*this.tileSize+16, Math.random()<.5?'bonusSquare':'bonusStar');
        b.setScale(.25); b.type='bonus';
        this.time.delayedCall(6000, ()=> b.destroy());
      }
    }
    
    // UI Handler
    togglePause() {
        const p =!this.physics.world.isPaused;
        this.physics.world.isPaused = p;
        btnPause && btnPause.setAttribute('aria-pressed', String(p));
    }
    toggleSound() {
        this.soundOn =!this.soundOn;
        btnSound && btnSound.setAttribute('aria-pressed', String(this.soundOn));
        this.sound.mute =!this.soundOn;
    }
  }

  // Start Game
  const game = new Phaser.Game({...config, scene: });

  // Safety: Pause when tab hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.loop.sleep();
    else game.loop.wake();
  });
})();
