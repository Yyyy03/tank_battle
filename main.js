(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const livesEl = document.getElementById("lives");
  const scoreEl = document.getElementById("score");
  const overlay = document.getElementById("overlay");

  const TILE_SIZE = 32;
  const GRID_WIDTH = 20;
  const GRID_HEIGHT = 15;
  const PLAYER_SIZE = 26;
  const ENEMY_SIZE = 26;
  const BULLET_SIZE = 6;
  const PLAYER_SPEED = 120;
  const ENEMY_SPEED = 90;
  const BULLET_SPEED = 240;
  const MAX_ENEMIES = 3;
  const RESPAWN_INVULN = 1.2;

  const Direction = {
    UP: { x: 0, y: -1 },
    DOWN: { x: 0, y: 1 },
    LEFT: { x: -1, y: 0 },
    RIGHT: { x: 1, y: 0 },
  };

  const directionList = Object.values(Direction);

  class Input {
    constructor() {
      this.keys = new Set();
      window.addEventListener("keydown", (event) => {
        this.keys.add(event.code);
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
          event.preventDefault();
        }
      });
      window.addEventListener("keyup", (event) => {
        this.keys.delete(event.code);
      });
    }

    isPressed(code) {
      return this.keys.has(code);
    }
  }

  class Map {
    constructor() {
      this.tiles = this.createMap();
    }

    createMap() {
      const tiles = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(0));
      for (let x = 0; x < GRID_WIDTH; x += 1) {
        tiles[0][x] = 2;
        tiles[GRID_HEIGHT - 1][x] = 2;
      }
      for (let y = 0; y < GRID_HEIGHT; y += 1) {
        tiles[y][0] = 2;
        tiles[y][GRID_WIDTH - 1] = 2;
      }
      for (let y = 2; y < GRID_HEIGHT - 2; y += 2) {
        for (let x = 2; x < GRID_WIDTH - 2; x += 3) {
          tiles[y][x] = 1;
          tiles[y][x + 1] = 1;
          if (y % 4 === 0) {
            tiles[y][x + 2] = 2;
          }
        }
      }
      return tiles;
    }

    reset() {
      this.tiles = this.createMap();
    }

    draw(context) {
      for (let y = 0; y < GRID_HEIGHT; y += 1) {
        for (let x = 0; x < GRID_WIDTH; x += 1) {
          const tile = this.tiles[y][x];
          if (tile === 0) continue;
          context.fillStyle = tile === 1 ? "#b45309" : "#64748b";
          context.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          if (tile === 1) {
            context.fillStyle = "rgba(255,255,255,0.1)";
            context.fillRect(x * TILE_SIZE + 4, y * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          }
        }
      }
    }

    tileAt(x, y) {
      const gridX = Math.floor(x / TILE_SIZE);
      const gridY = Math.floor(y / TILE_SIZE);
      if (gridX < 0 || gridX >= GRID_WIDTH || gridY < 0 || gridY >= GRID_HEIGHT) {
        return 2;
      }
      return this.tiles[gridY][gridX];
    }

    isBlocked(rect) {
      const points = [
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.width, y: rect.y },
        { x: rect.x, y: rect.y + rect.height },
        { x: rect.x + rect.width, y: rect.y + rect.height },
      ];
      return points.some((point) => this.tileAt(point.x, point.y) !== 0);
    }

    hitTile(rect) {
      const gridX = Math.floor((rect.x + rect.width / 2) / TILE_SIZE);
      const gridY = Math.floor((rect.y + rect.height / 2) / TILE_SIZE);
      if (gridX < 0 || gridX >= GRID_WIDTH || gridY < 0 || gridY >= GRID_HEIGHT) {
        return { type: 2 };
      }
      const tile = this.tiles[gridY][gridX];
      if (tile === 1) {
        this.tiles[gridY][gridX] = 0;
        return { type: 1 };
      }
      if (tile === 2) {
        return { type: 2 };
      }
      return null;
    }
  }

  class Entity {
    constructor(x, y, size) {
      this.x = x;
      this.y = y;
      this.size = size;
    }

    get rect() {
      return {
        x: this.x - this.size / 2,
        y: this.y - this.size / 2,
        width: this.size,
        height: this.size,
      };
    }

    drawBase(context, color) {
      context.fillStyle = color;
      context.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    }
  }

  class Tank extends Entity {
    constructor(x, y, size, color, speed, isPlayer = false) {
      super(x, y, size);
      this.color = color;
      this.speed = speed;
      this.direction = Direction.UP;
      this.cooldown = 0;
      this.invulnerable = 0;
      this.isAlive = true;
      this.isPlayer = isPlayer;
    }

    updateCooldown(dt) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.invulnerable = Math.max(0, this.invulnerable - dt);
    }

    move(dx, dy, map, tanks) {
      if (!this.isAlive) return;
      const nextX = this.x + dx;
      const nextY = this.y + dy;
      const rectX = { ...this.rect, x: nextX - this.size / 2 };
      if (!map.isBlocked(rectX) && !hitsTank(rectX, tanks, this)) {
        this.x = nextX;
      }
      const rectY = { ...this.rect, y: nextY - this.size / 2 };
      if (!map.isBlocked(rectY) && !hitsTank(rectY, tanks, this)) {
        this.y = nextY;
      }
    }

    fire(bullets) {
      if (this.cooldown > 0 || !this.isAlive) return;
      const offset = this.size / 2 + BULLET_SIZE / 2 + 2;
      const bullet = new Bullet(
        this.x + this.direction.x * offset,
        this.y + this.direction.y * offset,
        this.direction,
        this
      );
      bullets.push(bullet);
      this.cooldown = 0.45;
    }

    draw(context) {
      this.drawBase(context, this.color);
      context.fillStyle = "#0f172a";
      const barrelWidth = this.size / 5;
      const barrelLength = this.size / 1.6;
      const bx = this.x + this.direction.x * (barrelLength / 2);
      const by = this.y + this.direction.y * (barrelLength / 2);
      context.save();
      context.translate(bx, by);
      context.rotate(directionToAngle(this.direction));
      context.fillRect(-barrelWidth / 2, -barrelLength / 2, barrelWidth, barrelLength);
      context.restore();
      if (this.invulnerable > 0) {
        context.strokeStyle = "rgba(251,191,36,0.9)";
        context.lineWidth = 2;
        context.strokeRect(this.x - this.size / 2 - 2, this.y - this.size / 2 - 2, this.size + 4, this.size + 4);
      }
    }
  }

  class Bullet extends Entity {
    constructor(x, y, direction, owner) {
      super(x, y, BULLET_SIZE);
      this.direction = direction;
      this.owner = owner;
      this.isAlive = true;
    }

    update(dt, map, tanks, onEnemyDestroyed) {
      if (!this.isAlive) return;
      this.x += this.direction.x * BULLET_SPEED * dt;
      this.y += this.direction.y * BULLET_SPEED * dt;
      const rect = this.rect;
      if (
        rect.x < 0 ||
        rect.y < 0 ||
        rect.x + rect.width > canvas.width ||
        rect.y + rect.height > canvas.height
      ) {
        this.isAlive = false;
        return;
      }
      const tileHit = map.hitTile(rect);
      if (tileHit) {
        this.isAlive = false;
        return;
      }
      const hit = tanks.find(
        (tank) => tank !== this.owner && tank.isAlive && rectsOverlap(rect, tank.rect)
      );
      if (hit && hit.invulnerable <= 0) {
        hit.isAlive = false;
        this.isAlive = false;
        if (this.owner.isPlayer && !hit.isPlayer) {
          onEnemyDestroyed();
        }
      }
    }

    draw(context) {
      context.fillStyle = "#e2e8f0";
      context.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    }
  }

  class Game {
    constructor() {
      this.input = new Input();
      this.map = new Map();
      this.bullets = [];
      this.score = 0;
      this.lives = 3;
      this.lastTime = 0;
      this.gameOver = false;
      this.player = null;
      this.enemies = [];
      this.spawn();
    }

    spawn() {
      this.player = new Tank(64, canvas.height - 64, PLAYER_SIZE, "#22c55e", PLAYER_SPEED, true);
      this.player.invulnerable = RESPAWN_INVULN;
      this.enemies = [];
      this.bullets = [];
      const positions = [
        { x: canvas.width - 64, y: 64 },
        { x: canvas.width / 2, y: 64 },
        { x: 64, y: 64 },
      ];
      for (let i = 0; i < MAX_ENEMIES; i += 1) {
        const pos = positions[i % positions.length];
        const enemy = new EnemyTank(pos.x, pos.y);
        this.enemies.push(enemy);
      }
    }

    reset() {
      this.map.reset();
      this.score = 0;
      this.lives = 3;
      this.gameOver = false;
      overlay.classList.add("hidden");
      this.spawn();
      this.updateHud();
    }

    handleInput(dt) {
      const tanks = [this.player, ...this.enemies];
      let dx = 0;
      let dy = 0;
      if (this.input.isPressed("KeyW") || this.input.isPressed("ArrowUp")) {
        dy -= 1;
        this.player.direction = Direction.UP;
      }
      if (this.input.isPressed("KeyS") || this.input.isPressed("ArrowDown")) {
        dy += 1;
        this.player.direction = Direction.DOWN;
      }
      if (this.input.isPressed("KeyA") || this.input.isPressed("ArrowLeft")) {
        dx -= 1;
        this.player.direction = Direction.LEFT;
      }
      if (this.input.isPressed("KeyD") || this.input.isPressed("ArrowRight")) {
        dx += 1;
        this.player.direction = Direction.RIGHT;
      }
      const speed = this.player.speed * dt;
      if (dx !== 0 || dy !== 0) {
        const length = Math.hypot(dx, dy) || 1;
        this.player.move((dx / length) * speed, (dy / length) * speed, this.map, tanks);
      }
      if (this.input.isPressed("Space")) {
        this.player.fire(this.bullets);
      }
      if (this.input.isPressed("KeyR")) {
        this.reset();
      }
    }

    updateHud() {
      livesEl.textContent = this.lives.toString();
      scoreEl.textContent = this.score.toString();
    }

    update(dt) {
      if (this.gameOver) return;
      this.handleInput(dt);
      this.player.updateCooldown(dt);
      this.enemies.forEach((enemy) => enemy.updateCooldown(dt));
      this.enemies.forEach((enemy) => enemy.updateAI(dt, this.map, [this.player, ...this.enemies]));
      this.enemies.forEach((enemy) => enemy.tryFire(this.bullets));

      this.bullets.forEach((bullet) =>
        bullet.update(dt, this.map, [this.player, ...this.enemies], () => {
          this.score += 100;
          this.updateHud();
        })
      );
      this.bullets = this.bullets.filter((bullet) => bullet.isAlive);

      if (!this.player.isAlive) {
        this.lives -= 1;
        if (this.lives <= 0) {
          this.gameOver = true;
          overlay.classList.remove("hidden");
        } else {
          this.player.isAlive = true;
          this.player.x = 64;
          this.player.y = canvas.height - 64;
          this.player.invulnerable = RESPAWN_INVULN;
        }
        this.updateHud();
      }

      this.enemies = this.enemies.filter((enemy) => enemy.isAlive);
      while (this.enemies.length < MAX_ENEMIES) {
        const enemy = new EnemyTank(canvas.width - 64, 64 + Math.random() * 64);
        this.enemies.push(enemy);
      }
    }

    render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#0b1120";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.map.draw(ctx);
      this.player.draw(ctx);
      this.enemies.forEach((enemy) => enemy.draw(ctx));
      this.bullets.forEach((bullet) => bullet.draw(ctx));
    }

    tick(timestamp) {
      const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
      this.lastTime = timestamp;
      this.update(dt);
      this.render();
      requestAnimationFrame((time) => this.tick(time));
    }
  }

  class EnemyTank extends Tank {
    constructor(x, y) {
      super(x, y, ENEMY_SIZE, "#ef4444", ENEMY_SPEED);
      this.turnTimer = 0;
      this.fireTimer = 0;
      this.direction = directionList[Math.floor(Math.random() * directionList.length)];
    }

    updateAI(dt, map, tanks) {
      if (!this.isAlive) return;
      this.turnTimer -= dt;
      this.fireTimer -= dt;
      if (this.turnTimer <= 0) {
        this.direction = directionList[Math.floor(Math.random() * directionList.length)];
        this.turnTimer = 0.8 + Math.random() * 1.4;
      }
      const speed = this.speed * dt;
      this.move(this.direction.x * speed, this.direction.y * speed, map, tanks);
    }

    tryFire(bullets) {
      if (this.fireTimer <= 0) {
        this.fire(bullets);
        this.fireTimer = 0.8 + Math.random() * 1.2;
      }
    }
  }

  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  function hitsTank(rect, tanks, self) {
    return tanks.some((tank) => tank !== self && tank.isAlive && rectsOverlap(rect, tank.rect));
  }

  function directionToAngle(direction) {
    if (direction === Direction.UP) return 0;
    if (direction === Direction.RIGHT) return Math.PI / 2;
    if (direction === Direction.DOWN) return Math.PI;
    if (direction === Direction.LEFT) return (3 * Math.PI) / 2;
    return 0;
  }

  const game = new Game();
  game.updateHud();
  requestAnimationFrame((time) => {
    game.lastTime = time;
    game.tick(time);
  });
})();
