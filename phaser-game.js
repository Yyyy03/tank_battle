(() => {
  const root = document.getElementById("phaser-root");
  if (!window.Phaser) {
    if (root) {
      const message = document.createElement("div");
      message.className = "phaser-fallback";
      message.innerHTML = `
        <h2>Phaser 资源加载失败</h2>
        <p>当前环境无法从外部 CDN 拉取 Phaser.js，请确认网络可用，或将 Phaser 脚本下载到本地并替换引用。</p>
      `;
      root.appendChild(message);
    }
    return;
  }
  const CONFIG = {
    width: 640,
    height: 480,
    tileSize: 32,
    player: { speed: 160, fireCooldown: 350, hp: 3 },
    enemy: { speed: 120, fireCooldown: 700, detectRange: 220, accuracy: 0.6 },
    bullet: { speed: 280 },
  };

  const MAP = [
    "SSSSSSSSSSSSSSSSSSSS",
    "S..BB....BB....BB...S",
    "S..BB....BB....BB...S",
    "S...................S",
    "S..SS....BB....SS...S",
    "S..BB....BB....BB...S",
    "S...................S",
    "S....BB....SS....B..S",
    "S....BB....SS....B..S",
    "S...................S",
    "S..SS....BB....SS...S",
    "S..BB....BB....BB...S",
    "S...................S",
    "S..BB....BB....BB...S",
    "SSSSSSSSSSSSSSSSSSSS",
  ];

  const hudLives = document.getElementById("phaser-lives");
  const hudScore = document.getElementById("phaser-score");

  class MainScene extends Phaser.Scene {
    constructor() {
      super("main");
      this.lastFire = 0;
      this.enemyLastFire = 0;
      this.enemyDirection = new Phaser.Math.Vector2(1, 0);
      this.enemyTurnTimer = 0;
      this.score = 0;
      this.playerHp = CONFIG.player.hp;
    }

    preload() {
      this.createTextures();
    }

    create() {
      this.physics.world.setBounds(0, 0, CONFIG.width, CONFIG.height);
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys("W,A,S,D,SPACE");

      this.walls = this.physics.add.staticGroup();
      this.bricks = this.physics.add.staticGroup();
      this.buildMap();

      this.player = this.physics.add.sprite(64, CONFIG.height - 64, "player");
      this.player.setCollideWorldBounds(true);

      this.enemy = this.physics.add.sprite(CONFIG.width - 80, 80, "enemy");
      this.enemy.setCollideWorldBounds(true);

      this.bullets = this.physics.add.group();
      this.enemyBullets = this.physics.add.group();

      this.physics.add.collider(this.player, this.walls);
      this.physics.add.collider(this.player, this.bricks);
      this.physics.add.collider(this.enemy, this.walls);
      this.physics.add.collider(this.enemy, this.bricks);
      this.physics.add.collider(this.bullets, this.walls, this.onBulletWall, undefined, this);
      this.physics.add.collider(this.enemyBullets, this.walls, this.onBulletWall, undefined, this);
      this.physics.add.collider(this.bullets, this.bricks, this.onBulletBrick, undefined, this);
      this.physics.add.collider(this.enemyBullets, this.bricks, this.onBulletBrick, undefined, this);

      this.physics.add.overlap(this.bullets, this.enemy, this.onEnemyHit, undefined, this);
      this.physics.add.overlap(this.enemyBullets, this.player, this.onPlayerHit, undefined, this);

      this.updateHud();
    }

    createTextures() {
      const makeRect = (key, color, size = 26) => {
        const gfx = this.make.graphics({ x: 0, y: 0, add: false });
        gfx.fillStyle(color, 1);
        gfx.fillRect(0, 0, size, size);
        gfx.generateTexture(key, size, size);
        gfx.destroy();
      };
      makeRect("player", 0x22c55e, 26);
      makeRect("enemy", 0xef4444, 26);
      makeRect("bullet", 0xe2e8f0, 8);
      makeRect("brick", 0xb45309, CONFIG.tileSize);
      makeRect("steel", 0x64748b, CONFIG.tileSize);
    }

    buildMap() {
      MAP.forEach((row, y) => {
        row.split("").forEach((cell, x) => {
          if (cell === ".") return;
          const px = x * CONFIG.tileSize + CONFIG.tileSize / 2;
          const py = y * CONFIG.tileSize + CONFIG.tileSize / 2;
          if (cell === "B") {
            const brick = this.bricks.create(px, py, "brick");
            brick.refreshBody();
          } else if (cell === "S") {
            const steel = this.walls.create(px, py, "steel");
            steel.refreshBody();
          }
        });
      });
    }

    update(time, delta) {
      this.handlePlayer(delta);
      this.handleEnemy(delta);
      this.cleanupBullets();
    }

    handlePlayer() {
      const velocity = new Phaser.Math.Vector2(0, 0);
      if (this.cursors.left.isDown || this.keys.A.isDown) velocity.x = -1;
      if (this.cursors.right.isDown || this.keys.D.isDown) velocity.x = 1;
      if (this.cursors.up.isDown || this.keys.W.isDown) velocity.y = -1;
      if (this.cursors.down.isDown || this.keys.S.isDown) velocity.y = 1;
      velocity.normalize().scale(CONFIG.player.speed);
      this.player.setVelocity(velocity.x, velocity.y);

      if (this.keys.SPACE.isDown && this.time.now - this.lastFire > CONFIG.player.fireCooldown) {
        const dir = this.getFacing(velocity) || new Phaser.Math.Vector2(0, -1);
        this.spawnBullet(this.player, dir, this.bullets);
        this.lastFire = this.time.now;
      }
    }

    handleEnemy(delta) {
      const distance = Phaser.Math.Distance.Between(
        this.enemy.x,
        this.enemy.y,
        this.player.x,
        this.player.y
      );
      if (distance < CONFIG.enemy.detectRange) {
        const desired = new Phaser.Math.Vector2(
          this.player.x - this.enemy.x,
          this.player.y - this.enemy.y
        ).normalize();
        this.enemy.setVelocity(desired.x * CONFIG.enemy.speed, desired.y * CONFIG.enemy.speed);
        if (this.time.now - this.enemyLastFire > CONFIG.enemy.fireCooldown) {
          const aim = this.pickAimDirection(desired);
          this.spawnBullet(this.enemy, aim, this.enemyBullets);
          this.enemyLastFire = this.time.now;
        }
      } else {
        this.enemyTurnTimer -= delta;
        if (this.enemyTurnTimer <= 0) {
          this.enemyDirection = Phaser.Math.Vector2.Random().normalize();
          this.enemyTurnTimer = Phaser.Math.Between(500, 1400);
        }
        this.enemy.setVelocity(
          this.enemyDirection.x * CONFIG.enemy.speed,
          this.enemyDirection.y * CONFIG.enemy.speed
        );
      }
    }

    getFacing(velocity) {
      if (!velocity || velocity.length() === 0) return null;
      if (Math.abs(velocity.x) > Math.abs(velocity.y)) {
        return new Phaser.Math.Vector2(Math.sign(velocity.x), 0);
      }
      return new Phaser.Math.Vector2(0, Math.sign(velocity.y));
    }

    pickAimDirection(direction) {
      if (Math.random() <= CONFIG.enemy.accuracy) {
        return direction.clone();
      }
      const variants = [
        new Phaser.Math.Vector2(1, 0),
        new Phaser.Math.Vector2(-1, 0),
        new Phaser.Math.Vector2(0, 1),
        new Phaser.Math.Vector2(0, -1),
      ];
      return variants[Math.floor(Math.random() * variants.length)];
    }

    spawnBullet(source, dir, group) {
      const bullet = group.create(source.x, source.y, "bullet");
      bullet.body.allowGravity = false;
      bullet.setVelocity(dir.x * CONFIG.bullet.speed, dir.y * CONFIG.bullet.speed);
      bullet.direction = dir.clone();
    }

    cleanupBullets() {
      const withinBounds = (sprite) =>
        sprite.x >= 0 && sprite.x <= CONFIG.width && sprite.y >= 0 && sprite.y <= CONFIG.height;
      this.bullets.getChildren().forEach((bullet) => {
        if (!withinBounds(bullet)) bullet.destroy();
      });
      this.enemyBullets.getChildren().forEach((bullet) => {
        if (!withinBounds(bullet)) bullet.destroy();
      });
    }

    onBulletWall(bullet) {
      bullet.destroy();
    }

    onBulletBrick(bullet, brick) {
      bullet.destroy();
      brick.destroy();
    }

    onEnemyHit(enemy, bullet) {
      bullet.destroy();
      enemy.disableBody(true, true);
      this.score += 100;
      this.updateHud();
      this.time.delayedCall(1200, () => {
        enemy.enableBody(true, CONFIG.width - 80, 80, true, true);
      });
    }

    onPlayerHit(player, bullet) {
      bullet.destroy();
      this.playerHp = Math.max(0, this.playerHp - 1);
      this.updateHud();
      if (this.playerHp <= 0) {
        this.scene.restart();
      }
    }

    updateHud() {
      hudLives.textContent = this.playerHp.toString();
      hudScore.textContent = this.score.toString();
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: CONFIG.width,
    height: CONFIG.height,
    backgroundColor: "#0b1120",
    parent: "phaser-root",
    physics: {
      default: "arcade",
      arcade: { debug: false },
    },
    scene: [MainScene],
  });

  window.__phaserGame = game;
})();
