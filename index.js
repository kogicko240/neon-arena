const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Элементы интерфейса
const timeDisplay = document.getElementById('time-display');
const waveDisplay = document.getElementById('wave-display');
const bestDisplay = document.getElementById('best-display');
const timeBarFill = document.getElementById('time-bar-fill');

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySubtitle = document.getElementById('overlay-subtitle');
const finalScoreBox = document.getElementById('final-score-box');
const finalTimeSpan = document.getElementById('final-time');
const startBtn = document.getElementById('start-btn');
const diffButtons = document.querySelectorAll('.diff-btn');

// Конфигурация уровней сложности
const DIFFICULTIES = {
  easy: {
    name: 'Лёгкая',
    spawnInterval: 0.65,   // секунды между спавном снарядов
    minSpawnInterval: 0.25,
    baseSpeed: 160,        // пикселей в секунду
    speedGrowth: 4.5,      // прирост скорости в секунду
    projectileRadius: 6,
    color: '#4ade80'
  },
  medium: {
    name: 'Средняя',
    spawnInterval: 0.42,
    minSpawnInterval: 0.16,
    baseSpeed: 230,
    speedGrowth: 7.5,
    projectileRadius: 7,
    color: '#facc15'
  },
  hard: {
    name: 'Сложная',
    spawnInterval: 0.26,
    minSpawnInterval: 0.10,
    baseSpeed: 310,
    speedGrowth: 11.0,
    projectileRadius: 8,
    color: '#f87171'
  }
};

// Состояние игры
let currentDiff = 'easy';
let isPlaying = false;
let survivalTime = 0;
let lastFrameTime = 0;
let spawnTimer = 0;
let shakeTime = 0;

// Игрок (ядро)
const player = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  radius: 9,
  trail: []
};

// Массивы объектов
let projectiles = [];
let particles = [];

// Загрузка рекорда для выбранной сложности
function getBestScore(diff) {
  return parseFloat(localStorage.getItem(`arena_best_${diff}`)) || 0;
}

function saveBestScore(diff, score) {
  const currentBest = getBestScore(diff);
  if (score > currentBest) {
    localStorage.setItem(`arena_best_${diff}`, score.toFixed(2));
    return score;
  }
  return currentBest;
}

function updateBestDisplay() {
  bestDisplay.textContent = `${getBestScore(currentDiff).toFixed(2)} с`;
}

// Переключение сложности
diffButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    diffButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentDiff = btn.dataset.diff;
    updateBestDisplay();
  });
});

// Отслеживание координат мыши/пальца с привязкой к границам квадратной арены
function updatePlayerPosition(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  let targetX = (clientX - rect.left) * scaleX;
  let targetY = (clientY - rect.top) * scaleY;

  // Жёсткое ограничение внутри квадрата арены
  player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, targetX));
  player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, targetY));
}

window.addEventListener('mousemove', (e) => {
  if (isPlaying) {
    updatePlayerPosition(e.clientX, e.clientY);
  }
});

window.addEventListener('touchmove', (e) => {
  if (isPlaying && e.touches.length > 0) {
    updatePlayerPosition(e.touches[0].clientX, e.touches[0].clientY);
  }
}, { passive: true });

// Создание нового снаряда по краям арены
function spawnProjectile() {
  const config = DIFFICULTIES[currentDiff];
  const side = Math.floor(Math.random() * 4); // 0: верх, 1: право, 2: низ, 3: лево
  let x, y;

  if (side === 0) {
    x = Math.random() * canvas.width;
    y = -config.projectileRadius;
  } else if (side === 1) {
    x = canvas.width + config.projectileRadius;
    y = Math.random() * canvas.height;
  } else if (side === 2) {
    x = Math.random() * canvas.width;
    y = canvas.height + config.projectileRadius;
  } else {
    x = -config.projectileRadius;
    y = Math.random() * canvas.height;
  }

  // Направление в сторону игрока с небольшим случайным разбросом
  const spread = (Math.random() - 0.5) * 0.45;
  const angle = Math.atan2(player.y - y, player.x - x) + spread;

  // Скорость растёт пропорционально прожитому времени
  const speed = config.baseSpeed + survivalTime * config.speedGrowth + (Math.random() * 40 - 20);

  projectiles.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: config.projectileRadius,
    color: Math.random() > 0.25 ? '#f43f5e' : '#fb923c'
  });
}

// Эффект взрыва частиц при столкновении
function createExplosion(x, y) {
  for (let i = 0; i < 35; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 260;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,
      decay: 1.2 + Math.random() * 1.5,
      size: 2 + Math.random() * 4,
      color: i % 2 === 0 ? '#38bdf8' : '#f43f5e'
    });
  }
}

// Запуск игры
function startGame() {
  isPlaying = true;
  survivalTime = 0;
  spawnTimer = 0;
  shakeTime = 0;
  projectiles = [];
  particles = [];
  player.trail = [];

  player.x = canvas.width / 2;
  player.y = canvas.height / 2;

  overlay.classList.add('hidden');
  lastFrameTime = performance.now();
  requestAnimationFrame(gameLoop);
}

// Завершение игры при столкновении
function gameOver() {
  isPlaying = false;
  shakeTime = 0.35;
  createExplosion(player.x, player.y);

  const best = saveBestScore(currentDiff, survivalTime);
  bestDisplay.textContent = `${best.toFixed(2)} с`;

  overlayTitle.textContent = 'ВЫ УНИЧТОЖЕНЫ';
  overlaySubtitle.textContent = 'Попробуйте продержаться дольше или смените уровень сложности.';
  finalTimeSpan.textContent = `${survivalTime.toFixed(2)} с`;
  finalScoreBox.classList.remove('hidden');
  startBtn.textContent = 'ИГРАТЬ СНОВА';

  // Небольшая задержка перед показом меню, чтобы был виден взрыв
  setTimeout(() => {
    overlay.classList.remove('hidden');
  }, 450);
}

// Отрисовка фоновой сетки арены
function drawGrid() {
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
  ctx.lineWidth = 1;
  const step = 45;

  for (let x = step; x < canvas.width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = step; y < canvas.height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

// Главный игровой цикл
function gameLoop(now) {
  const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;

  // Очистка холста
  ctx.save();
  ctx.fillStyle = '#0d111a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Тряска камеры при взрыве
  if (shakeTime > 0) {
    shakeTime -= dt;
    const mag = shakeTime * 18;
    ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
  }

  drawGrid();

  if (isPlaying) {
    survivalTime += dt;
    timeDisplay.textContent = `${survivalTime.toFixed(2)} с`;

    // Обновление шкалы времени (цикл каждые 10 секунд)
    const wave = Math.floor(survivalTime / 10) + 1;
    const waveProgress = ((survivalTime % 10) / 10) * 100;
    waveDisplay.textContent = wave;
    timeBarFill.style.width = `${waveProgress}%`;

    // Спавн снарядов с постепенным ускорением
    const config = DIFFICULTIES[currentDiff];
    const currentInterval = Math.max(
      config.minSpawnInterval,
      config.spawnInterval - survivalTime * 0.004
    );

    spawnTimer += dt;
    if (spawnTimer >= currentInterval) {
      spawnTimer = 0;
      spawnProjectile();
    }

    // Обновление следа игрока
    player.trail.push({ x: player.x, y: player.y });
    if (player.trail.length > 12) {
      player.trail.shift();
    }
  }

  // Отрисовка следа игрока
  if (isPlaying && player.trail.length > 1) {
    for (let i = 0; i < player.trail.length; i++) {
      const point = player.trail[i];
      const ratio = i / player.trail.length;
      ctx.beginPath();
      ctx.arc(point.x, point.y, player.radius * ratio * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(56, 189, 248, ${ratio * 0.25})`;
      ctx.fill();
    }
  }

  // Отрисовка игрока
  if (isPlaying) {
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Внутреннее белое ядро
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  // Обновление и отрисовка снарядов
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (isPlaying) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    // Отрисовка снаряда
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Проверка столкновения с игроком
    if (isPlaying) {
      const dx = p.x - player.x;
      const dy = p.y - player.y;
      const dist = Math.hypot(dx, dy);

      if (dist < p.radius + player.radius - 1.5) {
        gameOver();
        break;
      }
    }

    // Удаление снарядов, улетевших далеко за пределы арены
    const margin = 60;
    if (
      p.x < -margin ||
      p.x > canvas.width + margin ||
      p.y < -margin ||
      p.y > canvas.height + margin
    ) {
      projectiles.splice(i, 1);
    }
  }

  // Обновление и отрисовка частиц взрыва
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= pt.decay * dt;

    if (pt.life <= 0) {
      particles.splice(i, 1);
      continue;
    }

    ctx.globalAlpha = pt.life;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // Продолжаем рендер, пока идёт игра или доигрывает анимация взрыва
  if (isPlaying || particles.length > 0 || shakeTime > 0) {
    requestAnimationFrame(gameLoop);
  }
}

// Инициализация при загрузке
startBtn.addEventListener('click', startGame);
updateBestDisplay();
drawGrid();
