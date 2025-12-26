(() => {
  const CONFIG = {
    canvas: { width: 640, height: 480 },
    grid: { width: 20, height: 15, tileSize: 32 },
    player: {
      size: 26,
      speed: 130,
      maxHp: 3,
      fireCooldown: 0.45,
      invulnerableTime: 1.2,
    },
    bullet: { size: 6, speed: 260, damage: 1 },
    effects: {
      hitFlashDuration: 0.1,
      deathDuration: 0.6,
      shake: { duration: 0.2, magnitude: 4 },
      particles: { count: 16, speed: 120, life: 0.6 },
    },
    enemyTypes: {
      scout: { size: 24, speed: 110, maxHp: 2, fireCooldown: 0.9, detectRange: 200, attackRange: 150 },
      heavy: { size: 28, speed: 80, maxHp: 4, fireCooldown: 1.2, detectRange: 220, attackRange: 170 },
      sniper: { size: 24, speed: 95, maxHp: 2, fireCooldown: 0.6, detectRange: 260, attackRange: 210 },
    },
    ai: {
      retreatThreshold: 0.3,
      retreatDuration: 1.2,
      patrolTurnMin: 0.6,
      patrolTurnMax: 1.6,
    },
    levels: [
      {
        name: "Level 1",
        map: [
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
        ],
        enemies: [
          { type: "scout", count: 3 },
          { type: "heavy", count: 1 },
        ],
      },
      {
        name: "Level 2",
        map: [
          "SSSSSSSSSSSSSSSSSSSS",
          "S..BB..SS..BB..SS...S",
          "S..BB..SS..BB..SS...S",
          "S...................S",
          "S..SS....BB....SS...S",
          "S..BB....SS....BB...S",
          "S...................S",
          "S..BB..SS....SS..B..S",
          "S..BB..SS....SS..B..S",
          "S...................S",
          "S..SS....BB....SS...S",
          "S..BB....SS....BB...S",
          "S...................S",
          "S..BB..SS..BB..SS...S",
          "SSSSSSSSSSSSSSSSSSSS",
        ],
        enemies: [
          { type: "scout", count: 2 },
          { type: "sniper", count: 2 },
          { type: "heavy", count: 2 },
        ],
      },
    ],
  };

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  canvas.width = CONFIG.canvas.width;
  canvas.height = CONFIG.canvas.height;

  const livesEl = document.getElementById("lives");
  const scoreEl = document.getElementById("score");
  const levelEl = document.getElementById("level");
  const overlay = document.getElementById("overlay");

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

  class Camera {
    constructor() {
      this.offsetX = 0;
      this.offsetY = 0;
      this.shakeTime = 0;
    }

    shake() {
      this.shakeTime = CONFIG.effects.shake.duration;
    }

    update(dt) {
      if (this.shakeTime > 0) {
        this.shakeTime = Math.max(0, this.shakeTime - dt);
        const magnitude = CONFIG.effects.shake.magnitude;
        this.offsetX = (Math.random() - 0.5) * magnitude;
        this.offsetY = (Math.random() - 0.5) * magnitude;
      } else {
        this.offsetX = 0;
        this.offsetY = 0;
      }
    }
  }

  class Feedback {
    constructor() {
      this.particles = [];
      this.explosions = [];
    }

    hitEffect(x, y) {
      for (let i = 0; i < CONFIG.effects.particles.count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = CONFIG.effects.particles.speed * (0.4 + Math.random() * 0.6);
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: CONFIG.effects.particles.life,
        });
      }
    }

    explosion(x, y) {
      this.explosions.push({ x, y, timer: CONFIG.effects.deathDuration });
      this.hitEffect(x, y);
    }

    update(dt) {
      this.particles.forEach((particle) => {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.life -= dt;
      });
      this.particles = this.particles.filter((particle) => particle.life > 0);
      this.explosions.forEach((explosion) => {
        explosion.timer -= dt;
      });
      this.explosions = this.explosions.filter((explosion) => explosion.timer > 0);
    }

    draw(context) {
      this.particles.forEach((particle) => {
        const alpha = Math.max(0, particle.life / CONFIG.effects.particles.life);
        context.fillStyle = `rgba(253, 224, 71, ${alpha})`;
        context.beginPath();
        context.arc(particle.x, particle.y, 2, 0, Math.PI * 2);
        context.fill();
      });
      this.explosions.forEach((explosion) => {
        const progress = 1 - explosion.timer / CONFIG.effects.deathDuration;
        const radius = 8 + progress * 18;
        context.strokeStyle = `rgba(239, 68, 68, ${1 - progress})`;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
        context.stroke();
      });
    }
  }

  class GameMap {
    constructor(layout) {
      this.tiles = this.parseLayout(layout);
    }

    parseLayout(layout) {
      return layout.map((row) =>
        row.split("").map((cell) => {
          if (cell === "B") return 1;
          if (cell === "S") return 2;
          return 0;
        })
      );
    }

    draw(context) {
      const { tileSize } = CONFIG.grid;
      for (let y = 0; y < CONFIG.grid.height; y += 1) {
        for (let x = 0; x < CONFIG.grid.width; x += 1) {
          const tile = this.tiles[y][x];
          if (tile === 0) continue;
          context.fillStyle = tile === 1 ? "#b45309" : "#64748b";
          context.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
          if (tile === 1) {
            context.fillStyle = "rgba(255,255,255,0.1)";
            context.fillRect(x * tileSize + 4, y * tileSize + 4, tileSize - 8, tileSize - 8);
          }
        }
      }
    }

    tileAt(x, y) {
      const gridX = Math.floor(x / CONFIG.grid.tileSize);
      const gridY = Math.floor(y / CONFIG.grid.tileSize);
      if (
        gridX < 0 ||
        gridX >= CONFIG.grid.width ||
        gridY < 0 ||
        gridY >= CONFIG.grid.height
      ) {
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
      const gridX = Math.floor((rect.x + rect.width / 2) / CONFIG.grid.tileSize);
      const gridY = Math.floor((rect.y + rect.height / 2) / CONFIG.grid.tileSize);
      if (
        gridX < 0 ||
        gridX >= CONFIG.grid.width ||
        gridY < 0 ||
        gridY >= CONFIG.grid.height
      ) {
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
    constructor(config) {
      super(config.x, config.y, config.size);
      this.color = config.color;
      this.speed = config.speed;
      this.maxHp = config.maxHp;
      this.hp = config.maxHp;
      this.fireCooldown = config.fireCooldown;
      this.isPlayer = config.isPlayer;
      this.direction = Direction.UP;
      this.cooldown = 0;
      this.invulnerable = 0;
      this.isAlive = true;
      this.isDying = false;
      this.deathTimer = 0;
      this.deathHandled = false;
      this.flashTimer = 0;
    }

    updateCooldown(dt) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.invulnerable = Math.max(0, this.invulnerable - dt);
      this.flashTimer = Math.max(0, this.flashTimer - dt);
      if (this.isDying) {
        this.deathTimer = Math.max(0, this.deathTimer - dt);
      }
    }

    move(dx, dy, map, tanks) {
      if (!this.isAlive || this.isDying) return;
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
      if (this.cooldown > 0 || !this.isAlive || this.isDying) return;
      const offset = this.size / 2 + CONFIG.bullet.size / 2 + 2;
      const bullet = new Bullet(
        this.x + this.direction.x * offset,
        this.y + this.direction.y * offset,
        this.direction,
        this
      );
      bullets.push(bullet);
      this.cooldown = this.fireCooldown;
    }

    takeDamage(amount, feedback) {
      if (this.invulnerable > 0 || this.isDying) return false;
      this.hp = Math.max(0, this.hp - amount);
      this.flashTimer = CONFIG.effects.hitFlashDuration;
      feedback.hitEffect(this.x, this.y);
      if (this.hp <= 0) {
        this.startDeath(feedback);
        return true;
      }
      return false;
    }

    startDeath(feedback) {
      this.isAlive = false;
      this.isDying = true;
      this.deathTimer = CONFIG.effects.deathDuration;
      this.deathHandled = false;
      feedback.explosion(this.x, this.y);
    }

    draw(context) {
      if (this.isDying && this.deathTimer <= 0) return;
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
      if (this.flashTimer > 0) {
        context.fillStyle = "rgba(255,255,255,0.7)";
        context.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
      }
      if (this.invulnerable > 0) {
        context.strokeStyle = "rgba(251,191,36,0.9)";
        context.lineWidth = 2;
        context.strokeRect(
          this.x - this.size / 2 - 2,
          this.y - this.size / 2 - 2,
          this.size + 4,
          this.size + 4
        );
      }
    }
  }

  class Bullet extends Entity {
    constructor(x, y, direction, owner) {
      super(x, y, CONFIG.bullet.size);
      this.direction = direction;
      this.owner = owner;
      this.isAlive = true;
    }

    update(dt, map, tanks, onHit) {
      if (!this.isAlive) return;
      this.x += this.direction.x * CONFIG.bullet.speed * dt;
      this.y += this.direction.y * CONFIG.bullet.speed * dt;
      const rect = this.rect;
      if (
        rect.x < 0 ||
        rect.y < 0 ||
        rect.x + rect.width > CONFIG.canvas.width ||
        rect.y + rect.height > CONFIG.canvas.height
      ) {
        this.isAlive = false;
        return;
      }
      const tileHit = map.hitTile(rect);
      if (tileHit) {
        this.isAlive = false;
        return;
      }
      const hit = tanks.find((tank) => tank !== this.owner && tank.isAlive && rectsOverlap(rect, tank.rect));
      if (hit) {
        const killed = hit.takeDamage(CONFIG.bullet.damage, onHit.feedback);
        this.isAlive = false;
        onHit.onTankHit(hit, killed);
      }
    }

    draw(context) {
      context.fillStyle = "#e2e8f0";
      context.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    }
  }

  class StateMachine {
    constructor(states, initial) {
      this.states = states;
      this.state = initial;
      this.states[this.state].enter?.();
    }

    setState(nextState) {
      if (nextState === this.state || !this.states[nextState]) return;
      this.state = nextState;
      this.states[this.state].enter?.();
    }

    update(context, dt) {
      const nextState = this.states[this.state].transition(context);
      if (nextState) {
        this.setState(nextState);
      }
      this.states[this.state].update(context, dt);
    }
  }

  class EnemyTank extends Tank {
    constructor(config) {
      super(config);
      this.type = config.type;
      this.retreatTimer = 0;
      this.patrolTimer = 0;
      this.direction = directionList[Math.floor(Math.random() * directionList.length)];
      this.ai = this.createAI();
    }

    createAI() {
      const aiStates = {
        Patrol: {
          enter: () => {
            this.patrolTimer = randomRange(CONFIG.ai.patrolTurnMin, CONFIG.ai.patrolTurnMax);
          },
          transition: (context) => context.transitionTo,
          update: (context, dt) => {
            this.patrolTimer -= dt;
            if (this.patrolTimer <= 0) {
              this.direction = randomDirection();
              this.patrolTimer = randomRange(CONFIG.ai.patrolTurnMin, CONFIG.ai.patrolTurnMax);
            }
            const speed = this.speed * dt;
            this.move(this.direction.x * speed, this.direction.y * speed, context.map, context.tanks);
          },
        },
        Chase: {
          transition: (context) => context.transitionTo,
          update: (context, dt) => {
            const speed = this.speed * 1.05 * dt;
            this.direction = directionToTarget(this, context.player);
            this.move(this.direction.x * speed, this.direction.y * speed, context.map, context.tanks);
          },
        },
        Attack: {
          transition: (context) => context.transitionTo,
          update: (context) => {
            this.direction = directionToTarget(this, context.player);
            this.fire(context.bullets);
          },
        },
        Retreat: {
          enter: () => {
            this.retreatTimer = CONFIG.ai.retreatDuration;
          },
          transition: (context) => context.transitionTo,
          update: (context, dt) => {
            this.retreatTimer -= dt;
            const speed = this.speed * 1.2 * dt;
            const away = directionAwayFrom(this, context.player);
            this.direction = away;
            this.move(away.x * speed, away.y * speed, context.map, context.tanks);
          },
        },
      };

      return new StateMachine(aiStates, "Patrol");
    }

    updateAI(context, dt) {
      if (!this.isAlive || this.isDying) return;
      const distance = distanceBetween(this, context.player);
      const hpRatio = this.hp / this.maxHp;
      const transitionRules = [
        { state: "Retreat", when: () => hpRatio <= CONFIG.ai.retreatThreshold || this.retreatTimer > 0 },
        { state: "Attack", when: () => distance <= this.type.attackRange },
        { state: "Chase", when: () => distance <= this.type.detectRange },
        { state: "Patrol", when: () => true },
      ];
      const transitionTo = transitionRules.find((rule) => rule.when())?.state;
      const next = this.ai.state === "Retreat" && this.retreatTimer > 0 ? "Retreat" : transitionTo;
      this.ai.update({ ...context, transitionTo: next }, dt);
    }
  }

  class LevelManager {
    constructor(levels) {
      this.levels = levels;
      this.levelIndex = 0;
      this.enemyQueue = [];
      this.map = null;
    }

    startLevel(index) {
      this.levelIndex = index;
      const level = this.levels[this.levelIndex];
      this.map = new GameMap(level.map);
      this.enemyQueue = level.enemies.flatMap((entry) =>
        Array.from({ length: entry.count }, () => entry.type)
      );
      return level;
    }

    nextLevel() {
      const nextIndex = this.levelIndex + 1;
      if (nextIndex >= this.levels.length) {
        return null;
      }
      return this.startLevel(nextIndex);
    }

    hasRemainingEnemies(activeEnemies) {
      return this.enemyQueue.length > 0 || activeEnemies.length > 0;
    }

    spawnEnemy() {
      const typeKey = this.enemyQueue.shift();
      if (!typeKey) return null;
      const enemyType = CONFIG.enemyTypes[typeKey];
      const spawnPoints = [
        { x: CONFIG.canvas.width - 64, y: 64 },
        { x: CONFIG.canvas.width / 2, y: 64 },
        { x: 64, y: 64 },
      ];
      const spawn = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
      return new EnemyTank({
        x: spawn.x,
        y: spawn.y,
        size: enemyType.size,
        color: "#ef4444",
        speed: enemyType.speed,
        maxHp: enemyType.maxHp,
        fireCooldown: enemyType.fireCooldown,
        isPlayer: false,
        type: enemyType,
      });
    }
  }

  class GameStateManager {
    constructor(game) {
      this.game = game;
      this.state = "Menu";
      this.states = {
        Menu: {
          enter: () => {
            overlay.querySelector("h1").textContent = "Tank Battle";
            overlay.querySelector("p").textContent = "按 Space 开始";
            overlay.classList.remove("hidden");
          },
          update: () => {
            if (this.game.input.isPressed("Space")) {
              this.setState("Playing");
            }
          },
          render: () => {
            this.game.render();
          },
        },
        Playing: {
          enter: () => {
            overlay.classList.add("hidden");
          },
          update: (dt) => {
            this.game.update(dt);
          },
          render: () => {
            this.game.render();
          },
        },
        GameOver: {
          enter: () => {
            overlay.querySelector("h1").textContent = this.game.victory ? "Victory" : "Game Over";
            overlay.querySelector("p").textContent = "按 R 重新开始";
            overlay.classList.remove("hidden");
          },
          update: () => {
            if (this.game.input.isPressed("KeyR")) {
              this.game.reset();
              this.setState("Playing");
            }
          },
          render: () => {
            this.game.render();
          },
        },
      };
    }

    setState(nextState) {
      if (nextState === this.state) return;
      this.state = nextState;
      this.states[this.state].enter?.();
    }

    update(dt) {
      this.states[this.state].update(dt);
    }

    render() {
      this.states[this.state].render();
    }
  }

  class Game {
    constructor() {
      this.input = new Input();
      this.camera = new Camera();
      this.feedback = new Feedback();
      this.bullets = [];
      this.score = 0;
      this.lives = CONFIG.player.maxHp;
      this.lastTime = 0;
      this.player = null;
      this.enemies = [];
      this.levelManager = new LevelManager(CONFIG.levels);
      this.currentLevel = this.levelManager.startLevel(0);
      this.map = this.levelManager.map;
      this.victory = false;
      this.spawnPlayer();
      this.stateManager = new GameStateManager(this);
      this.stateManager.setState("Playing");
      this.updateHud();
    }

    spawnPlayer() {
      this.player = new Tank({
        x: 64,
        y: CONFIG.canvas.height - 64,
        size: CONFIG.player.size,
        color: "#22c55e",
        speed: CONFIG.player.speed,
        maxHp: CONFIG.player.maxHp,
        fireCooldown: CONFIG.player.fireCooldown,
        isPlayer: true,
      });
      this.player.invulnerable = CONFIG.player.invulnerableTime;
    }

    reset() {
      this.score = 0;
      this.lives = CONFIG.player.maxHp;
      this.victory = false;
      this.currentLevel = this.levelManager.startLevel(0);
      this.map = this.levelManager.map;
      this.enemies = [];
      this.bullets = [];
      this.feedback = new Feedback();
      this.spawnPlayer();
      this.updateHud();
    }

    updateHud() {
      livesEl.textContent = this.lives.toString();
      scoreEl.textContent = this.score.toString();
      levelEl.textContent = (this.levelManager.levelIndex + 1).toString();
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
      if (dx !== 0 || dy !== 0) {
        const length = Math.hypot(dx, dy) || 1;
        const speed = this.player.speed * dt;
        this.player.move((dx / length) * speed, (dy / length) * speed, this.map, tanks);
      }
      if (this.input.isPressed("Space")) {
        this.player.fire(this.bullets);
      }
    }

    update(dt) {
      this.handleInput(dt);
      this.camera.update(dt);
      this.feedback.update(dt);
      this.player.updateCooldown(dt);
      this.enemies.forEach((enemy) => enemy.updateCooldown(dt));

      const aiContext = {
        player: this.player,
        tanks: [this.player, ...this.enemies],
        map: this.map,
        bullets: this.bullets,
      };
      this.enemies.forEach((enemy) => enemy.updateAI(aiContext, dt));

      this.bullets.forEach((bullet) =>
        bullet.update(dt, this.map, [this.player, ...this.enemies], {
          feedback: this.feedback,
          onTankHit: (target, killed) => {
            if (target.isPlayer) {
              this.camera.shake();
            }
            if (killed && bullet.owner.isPlayer && !target.isPlayer) {
              this.score += 100;
              this.updateHud();
            }
          },
        })
      );
      this.bullets = this.bullets.filter((bullet) => bullet.isAlive);

      if (this.player.isDying && this.player.deathTimer <= 0 && !this.player.deathHandled) {
        this.player.deathHandled = true;
        this.lives -= 1;
        if (this.lives <= 0) {
          this.stateManager.setState("GameOver");
        } else {
          this.spawnPlayer();
        }
        this.updateHud();
      }

      this.enemies.forEach((enemy) => {
        if (enemy.isDying && enemy.deathTimer <= 0) {
          enemy.isDying = false;
        }
      });
      this.enemies = this.enemies.filter((enemy) => enemy.isAlive || enemy.isDying);

      while (this.enemies.length < 3 && this.levelManager.enemyQueue.length > 0) {
        const enemy = this.levelManager.spawnEnemy();
        if (enemy) {
          this.enemies.push(enemy);
        }
      }

      if (!this.levelManager.hasRemainingEnemies(this.enemies)) {
        const nextLevel = this.levelManager.nextLevel();
        if (nextLevel) {
          this.currentLevel = nextLevel;
          this.map = this.levelManager.map;
          this.enemies = [];
          this.bullets = [];
          this.spawnPlayer();
          this.updateHud();
        } else {
          this.victory = true;
          this.stateManager.setState("GameOver");
        }
      }
    }

    render() {
      ctx.save();
      ctx.translate(this.camera.offsetX, this.camera.offsetY);
      ctx.clearRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
      ctx.fillStyle = "#0b1120";
      ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
      this.map.draw(ctx);
      this.player.draw(ctx);
      this.enemies.forEach((enemy) => enemy.draw(ctx));
      this.bullets.forEach((bullet) => bullet.draw(ctx));
      this.feedback.draw(ctx);
      ctx.restore();
    }

    tick(timestamp) {
      const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
      this.lastTime = timestamp;
      this.stateManager.update(dt);
      this.stateManager.render();
      requestAnimationFrame((time) => this.tick(time));
    }
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
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

  function randomDirection() {
    return directionList[Math.floor(Math.random() * directionList.length)];
  }

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function distanceBetween(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function directionToTarget(from, target) {
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? Direction.RIGHT : Direction.LEFT;
    }
    return dy > 0 ? Direction.DOWN : Direction.UP;
  }

  function directionAwayFrom(from, target) {
    const toward = directionToTarget(from, target);
    if (toward === Direction.UP) return Direction.DOWN;
    if (toward === Direction.DOWN) return Direction.UP;
    if (toward === Direction.LEFT) return Direction.RIGHT;
    return Direction.LEFT;
  }

  const game = new Game();
  requestAnimationFrame((time) => {
    game.lastTime = time;
    game.tick(time);
  });
})();
