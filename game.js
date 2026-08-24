'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - blue
  '#ffb74d', // L - orange
  '#f06292', // + (plus) - rosa
  '#aed581', // U - verde claro
  '#9575cd', // Y - violeta
  '#fff59d', // single (1x1) - amarillo claro
  '#78909c', // 3x3 hueco - gris
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[0,8,0],[8,8,8],[0,8,0]],                  // + pentominó
  [[9,0,9],[9,9,9]],                          // U pentominó
  [[0,10],[10,10],[0,10],[0,10]],             // Y pentominó
  [[11]],                                      // 1x1 (recompensa tras Tetris)
  [[12,12,12],[12,0,12],[12,12,12]],          // 3x3 hueco (reto)
];

const SINGLE_TYPE = 11;
const HOLLOW_TYPE = 12;
const PENTOMINO_TYPES = [8, 9, 10];
const CHALLENGE_CHANCE = 0.05;   // probabilidad de pieza 3x3 hueca
const PENTOMINO_CHANCE = 0.12;   // probabilidad de pentominó (+, U, Y)

const LINE_SCORES = [0, 100, 300, 500, 800];
const TSPIN_SCORES = [0, 800, 1200, 1600];     // T-spin single/double/triple × nivel
const TSPIN_LABELS = ['', 'SINGLE', 'DOUBLE', 'TRIPLE'];
const PERFECT_CLEAR_SCORES = [0, 800, 1200, 1800, 2000]; // × nivel
const B2B_TETRIS_BONUS = 0.5; // +50% al encadenar tetris consecutivos

const POWERUP_TYPES = ['bomb', 'lightning', 'dye', 'gravity', 'freeze'];
const POWERUP_INFO = {
  bomb:      { symbol: '💣', color: '#ff7043', label: 'BOMBA' },
  lightning: { symbol: '⚡', color: '#fff176', label: 'RAYO' },
  dye:       { symbol: '🎨', color: '#ba68c8', label: 'TINTE' },
  gravity:   { symbol: '⬇️', color: '#78909c', label: 'GRAVEDAD' },
  freeze:    { symbol: '❄️', color: '#4fc3f7', label: 'CONGELAR' },
};
const POWERUP_INTERVAL = 5; // líneas despejadas entre apariciones de pieza especial
const POWERUP_SCORE = 250;
const FREEZE_MS = 5000;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const powerupStatusEl = document.getElementById('powerup-status');
const comboPopupEl = document.getElementById('combo-popup');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridColor, blockHighlight;
let wildcard, linesSincePowerup, pendingPowerup, pendingSingle, freezeRemaining;
let combo, b2bTetrisActive, lastActionWasRotate, comboPopupTimeout, audioCtx;

function readThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  gridColor = styles.getPropertyValue('--grid-line').trim();
  blockHighlight = styles.getPropertyValue('--block-highlight').trim();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  localStorage.setItem('theme', theme);
  readThemeColors();
  if (board) {
    draw();
    if (next) drawNext();
  }
}

function toggleTheme() {
  const activeTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  applyTheme(activeTheme === 'light' ? 'dark' : 'light');
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function createWildcardGrid() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
}

function randomPiece(forcePowerup, forceSingle) {
  if (forcePowerup) {
    const powerup = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    const shape = [[1, 1], [1, 1]];
    return { type: 0, powerup, shape, x: Math.floor(COLS / 2) - 1, y: 0 };
  }
  let type;
  if (forceSingle) {
    type = SINGLE_TYPE;
  } else {
    const roll = Math.random();
    if (roll < CHALLENGE_CHANCE) {
      type = HOLLOW_TYPE;
    } else if (roll < CHALLENGE_CHANCE + PENTOMINO_CHANCE) {
      type = PENTOMINO_TYPES[Math.floor(Math.random() * PENTOMINO_TYPES.length)];
    } else {
      type = Math.floor(Math.random() * 7) + 1;
    }
  }
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      lastActionWasRotate = true;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function countWildcards() {
  let n = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (wildcard[r][c]) n++;
  return n;
}

function consumeWildcards(n) {
  let remaining = n;
  for (let r = 0; r < ROWS && remaining > 0; r++)
    for (let c = 0; c < COLS && remaining > 0; c++)
      if (wildcard[r][c]) { wildcard[r][c] = false; remaining--; }
}

function removeRow(r) {
  board.splice(r, 1);
  board.unshift(new Array(COLS).fill(0));
  wildcard.splice(r, 1);
  wildcard.unshift(new Array(COLS).fill(false));
}

function isFilledOrWall(r, c) {
  return r < 0 || r >= ROWS || c < 0 || c >= COLS || !!board[r][c];
}

function detectTSpin() {
  if (!current || current.type !== 3 || !lastActionWasRotate) return false;
  const cx = current.x + 1, cy = current.y + 1; // centro de la caja 3x3 de la T
  const corners = [
    isFilledOrWall(cy - 1, cx - 1),
    isFilledOrWall(cy - 1, cx + 1),
    isFilledOrWall(cy + 1, cx - 1),
    isFilledOrWall(cy + 1, cx + 1),
  ];
  return corners.filter(Boolean).length >= 3;
}

function isBoardEmpty() {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c]) return false;
  return true;
}

function clearLines() {
  const wasTSpin = detectTSpin();
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    const emptyCount = board[r].filter(v => v === 0).length;
    // fila con huecos: se completa gastando comodines de "tinte" en cualquier parte del tablero
    const wildcardAssist = emptyCount > 0 && emptyCount < COLS && countWildcards() >= emptyCount;
    if (emptyCount === 0 || wildcardAssist) {
      if (wildcardAssist) consumeWildcards(emptyCount);
      removeRow(r);
      cleared++;
      r++;
    }
  }

  if (!cleared) {
    combo = 0;
    return;
  }

  lines += cleared;
  combo++;
  const messages = [];
  let gained = wasTSpin ? TSPIN_SCORES[cleared] * level : LINE_SCORES[cleared] * level;

  if (wasTSpin) {
    messages.push(`T-SPIN ${TSPIN_LABELS[cleared]}!`);
    playTSpinSound();
  }

  if (cleared === 4) {
    if (b2bTetrisActive) {
      gained += Math.floor(gained * B2B_TETRIS_BONUS);
      messages.push('B2B TETRIS!');
      playB2BSound();
    }
    b2bTetrisActive = true;
  } else {
    b2bTetrisActive = false;
  }

  if (combo > 1) {
    gained *= combo;
    messages.push(`COMBO x${combo}`);
    playComboSound(combo);
  }

  const perfectClear = isBoardEmpty();
  if (perfectClear) {
    gained += PERFECT_CLEAR_SCORES[cleared] * level;
    messages.push('PERFECT CLEAR!');
    playPerfectClearSound();
  }

  score += gained;
  level = Math.floor(lines / 10) + 1;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  linesSincePowerup += cleared;
  if (linesSincePowerup >= POWERUP_INTERVAL) {
    linesSincePowerup -= POWERUP_INTERVAL;
    pendingPowerup = true;
  }
  if (cleared === 4) {
    pendingSingle = true;
  }
  if (messages.length) showComboPopup(messages, gained);
  updateHUD();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    lastActionWasRotate = false;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function powerupCenter() {
  const shape = current.shape;
  return {
    cx: current.x + Math.floor(shape[0].length / 2),
    cy: current.y + Math.floor(shape.length / 2),
  };
}

function clearCell(r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
  board[r][c] = 0;
  wildcard[r][c] = false;
}

function applyBomb() {
  const { cx, cy } = powerupCenter();
  for (let r = cy - 1; r <= cy + 1; r++)
    for (let c = cx - 1; c <= cx + 1; c++)
      clearCell(r, c);
}

function applyLightning() {
  const { cx, cy } = powerupCenter();
  for (let c = 0; c < COLS; c++) clearCell(cy, c);
  for (let r = 0; r < ROWS; r++) clearCell(r, cx);
}

function applyDye() {
  const present = new Set();
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c]) present.add(board[r][c]);
  if (present.size === 0) return;
  const colors = [...present];
  const target = colors[Math.floor(Math.random() * colors.length)];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === target) wildcard[r][c] = true;
}

function applyGravityPowerup() {
  for (let c = 0; c < COLS; c++) {
    const colorStack = [];
    const wildStack = [];
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c] !== 0) {
        colorStack.push(board[r][c]);
        wildStack.push(wildcard[r][c]);
      }
    }
    for (let r = 0; r < ROWS; r++) {
      board[r][c] = 0;
      wildcard[r][c] = false;
    }
    const startRow = ROWS - colorStack.length;
    for (let i = 0; i < colorStack.length; i++) {
      board[startRow + i][c] = colorStack[i];
      wildcard[startRow + i][c] = wildStack[i];
    }
  }
}

function applyFreeze() {
  freezeRemaining = FREEZE_MS;
}

function applyPowerup(type) {
  switch (type) {
    case 'bomb': applyBomb(); break;
    case 'lightning': applyLightning(); break;
    case 'dye': applyDye(); break;
    case 'gravity': applyGravityPowerup(); break;
    case 'freeze': applyFreeze(); break;
  }
  score += POWERUP_SCORE;
}

function lockPiece() {
  if (current.powerup) {
    applyPowerup(current.powerup);
  } else {
    merge();
  }
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece(pendingPowerup, pendingSingle);
  pendingPowerup = false;
  pendingSingle = false;
  lastActionWasRotate = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
  updatePowerupStatus();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  updatePowerupStatus();
}

function updatePowerupStatus() {
  if (freezeRemaining > 0) {
    powerupStatusEl.textContent = `❄️ ${(freezeRemaining / 1000).toFixed(1)}s`;
  } else if (next && next.powerup) {
    const info = POWERUP_INFO[next.powerup];
    powerupStatusEl.textContent = `${info.symbol} ${info.label}`;
  } else {
    powerupStatusEl.textContent = `${POWERUP_INTERVAL - linesSincePowerup} líneas`;
  }
  canvas.classList.toggle('frozen', freezeRemaining > 0);
}

function showComboPopup(messages, gained) {
  clearTimeout(comboPopupTimeout);
  comboPopupEl.innerHTML = messages.map(m => `<div class="combo-line">${m}</div>`).join('')
    + `<div class="combo-points">+${gained.toLocaleString()}</div>`;
  comboPopupEl.classList.remove('show');
  void comboPopupEl.offsetWidth; // reinicia la animación CSS
  comboPopupEl.classList.add('show');
  comboPopupTimeout = setTimeout(() => comboPopupEl.classList.remove('show'), 900);
}

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, duration, type, delay, gainValue) {
  const ctxA = getAudioCtx();
  if (ctxA.state === 'suspended') ctxA.resume();
  const osc = ctxA.createOscillator();
  const gain = ctxA.createGain();
  osc.type = type || 'square';
  osc.frequency.value = freq;
  const startTime = ctxA.currentTime + (delay || 0);
  const peak = gainValue ?? 0.15;
  gain.gain.setValueAtTime(peak, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctxA.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playComboSound(comboCount) {
  playTone(440 + Math.min(comboCount, 10) * 60, 0.15);
}

function playTSpinSound() {
  playTone(660, 0.1);
  playTone(880, 0.12, 'square', 0.08);
}

function playB2BSound() {
  playTone(330, 0.12);
  playTone(660, 0.15, 'square', 0.1);
}

function playPerfectClearSound() {
  [523, 659, 784, 1046].forEach((f, i) => playTone(f, 0.18, 'triangle', i * 0.09, 0.18));
}

function drawBlock(context, x, y, colorIndex, size, alpha, options) {
  if (!colorIndex) return;
  const color = (options && options.color) || COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = blockHighlight;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  if (options && options.symbol) {
    context.font = `${Math.floor(size * 0.6)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(options.symbol, x * size + size / 2, y * size + size / 2 + 1);
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK, 1, wildcard[r][c] ? { symbol: '★' } : undefined);

  if (gameOver) return;

  const powerupOptions = current.powerup
    ? { color: POWERUP_INFO[current.powerup].color, symbol: POWERUP_INFO[current.powerup].symbol }
    : undefined;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2, powerupOptions);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK, 1, powerupOptions);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  const powerupOptions = next.powerup
    ? { color: POWERUP_INFO[next.powerup].color, symbol: POWERUP_INFO[next.powerup].symbol }
    : undefined;
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB, 1, powerupOptions);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  draw();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (freezeRemaining > 0) {
    freezeRemaining = Math.max(0, freezeRemaining - dt);
    updatePowerupStatus();
  } else {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
        lastActionWasRotate = false;
      } else {
        lockPiece();
      }
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  wildcard = createWildcardGrid();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  linesSincePowerup = 0;
  pendingPowerup = false;
  pendingSingle = false;
  freezeRemaining = 0;
  combo = 0;
  b2bTetrisActive = false;
  lastActionWasRotate = false;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) { current.x--; lastActionWasRotate = false; }
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) { current.x++; lastActionWasRotate = false; }
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
themeToggleBtn.addEventListener('click', toggleTheme);

applyTheme(localStorage.getItem('theme') === 'light' ? 'light' : 'dark');
init();
