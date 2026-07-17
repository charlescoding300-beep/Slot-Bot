// web/public/app.js

// ---- synthesized casino sound (Web Audio API — no external audio file
// needed, so this never breaks from a missing asset). ----
let audioCtx;
function playCoinSound() {
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  const now = audioCtx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now + i * 0.09);
    gain.gain.setValueAtTime(0.0001, now + i * 0.09);
    gain.gain.exponentialRampToValueAtTime(0.15, now + i * 0.09 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.18);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + i * 0.09);
    osc.stop(now + i * 0.09 + 0.2);
  });
}

// ---- elements ----
const phoneForm = document.getElementById('phoneForm');
const codeForm = document.getElementById('codeForm');
const loginError = document.getElementById('loginError');
const loginSection = document.getElementById('loginSection');
const playerSection = document.getElementById('playerSection');
const logoutBtn = document.getElementById('logoutBtn');
const bottomNav = document.getElementById('bottomNav');
const greetingName = document.getElementById('greetingName');
const spinBtn = document.getElementById('spinBtn');
const spinDisplay = document.getElementById('spinDisplay');
const spinMessage = document.getElementById('spinMessage');
const bigBalance = document.getElementById('bigBalance');
const toggleEye = document.getElementById('toggleEye');
const historyLink = document.getElementById('historyLink');

let pendingPhone = '';
let balanceHidden = false;
let lastWallet = 0;

function showError(msg) {
  loginError.textContent = msg;
  loginError.classList.remove('hidden');
}

phoneForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  const phone = document.getElementById('phone').value.trim();
  const res = await fetch('/api/request-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const data = await res.json();
  if (!res.ok) return showError(data.error || 'Something went wrong.');

  pendingPhone = phone;
  phoneForm.classList.add('hidden');
  codeForm.classList.remove('hidden');
});

codeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  const code = document.getElementById('code').value.trim();
  const res = await fetch('/api/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: pendingPhone, code }),
  });
  const data = await res.json();
  if (!res.ok) return showError(data.error || 'Invalid code.');

  playCoinSound();
  await enterApp();
});

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  location.reload();
});

toggleEye.addEventListener('click', () => {
  balanceHidden = !balanceHidden;
  bigBalance.textContent = balanceHidden ? '🪙 ••••••' : `🪙 ${lastWallet.toLocaleString()}`;
});

historyLink.addEventListener('click', () => {
  document.getElementById('activitySection').scrollIntoView({ behavior: 'smooth' });
});

async function enterApp() {
  await loadPlayer();
  loginSection.classList.add('hidden');
  playerSection.classList.remove('hidden');
  logoutBtn.classList.remove('hidden');
  bottomNav.classList.remove('hidden');
}

async function loadPlayer() {
  const res = await fetch('/api/me');
  if (!res.ok) return;
  const data = await res.json();

  greetingName.textContent = data.phone;
  lastWallet = data.wallet;
  bigBalance.textContent = balanceHidden ? '🪙 ••••••' : `🪙 ${data.wallet.toLocaleString()}`;

  document.getElementById('boxWallet').textContent = data.wallet.toLocaleString();
  document.getElementById('boxBank').textContent = data.bank.toLocaleString();
  document.getElementById('boxArmy').textContent = (data.army.soldier + data.army.archer + data.army.giant).toLocaleString();

  document.getElementById('unitSoldier').textContent = data.army.soldier;
  document.getElementById('unitArcher').textContent = data.army.archer;
  document.getElementById('unitGiant').textContent = data.army.giant;
  document.getElementById('totalDamage').textContent = data.army.totalDamage.toLocaleString();

  const hpPct = Math.max(0, Math.min(100, (data.army.hp / data.army.maxHp) * 100));
  document.getElementById('hpFill').style.width = `${hpPct}%`;
  document.getElementById('hpText').textContent = `${data.army.hp} / ${data.army.maxHp}`;
}

async function loadLeaderboard() {
  const res = await fetch('/api/leaderboard');
  if (!res.ok) return;
  const board = await res.json();
  const list = document.getElementById('leaderboardList');
  list.innerHTML = board
    .map((entry, i) => `<li><span><span class="rank">#${i + 1}</span>${entry.userId}</span><span>${entry.score.toLocaleString()}</span></li>`)
    .join('');
}

function renderActivityRow(entry) {
  const isWin = entry.type === 'win';
  const arrow = isWin ? '↓' : '↑';
  const sign = isWin ? '+' : '-';
  return `
    <div class="activity-row ${isWin ? 'win' : 'loss'}">
      <span>${arrow} ${entry.userId} — ${entry.game}</span>
      <span class="amt">${sign}${entry.amount.toLocaleString()} coins</span>
    </div>
  `;
}

function renderPreviewEntry(entry) {
  const isWin = entry.type === 'win';
  const arrow = isWin ? '↓' : '↑';
  const sign = isWin ? '+' : '-';
  return `
    <div class="preview-entry ${isWin ? 'win' : 'loss'}">
      <span class="arrow">${arrow}</span>
      <span class="info">
        <div class="who">${entry.userId}</div>
        <div class="game-label">${entry.game}</div>
      </span>
      <span class="amt">${sign}${entry.amount.toLocaleString()}</span>
    </div>
  `;
}

async function loadActivity() {
  const res = await fetch('/api/activity');
  if (!res.ok) return;
  const feed = await res.json();

  const list = document.getElementById('activityList');
  list.innerHTML = feed.map(renderActivityRow).join('') || '<p class="muted small">No activity yet — go play something!</p>';

  const preview = document.getElementById('previewFeed');
  preview.innerHTML = feed.slice(0, 2).map(renderPreviewEntry).join('');
}

spinBtn.addEventListener('click', async () => {
  spinBtn.disabled = true;
  spinDisplay.textContent = '🎲';
  const res = await fetch('/api/play-spin', { method: 'POST' });
  const data = await res.json();

  if (!res.ok) {
    const mins = Math.ceil((data.remainingSeconds || 0) / 60);
    spinMessage.textContent = `⏳ Come back in ~${mins} min for another spin.`;
    spinDisplay.textContent = '🎰';
    spinBtn.disabled = false;
    return;
  }

  playCoinSound();
  spinDisplay.textContent = '💰';
  spinMessage.textContent = `+${data.won} coins! New balance: ${data.balance.toLocaleString()}`;
  await loadPlayer();
  await loadActivity();
  setTimeout(() => { spinDisplay.textContent = '🎰'; spinBtn.disabled = false; }, 1200);
});

// Bottom nav scroll-to-section
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.target;
    if (target === 'body') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// ---- on load ----
(async () => {
  loadLeaderboard();
  loadActivity();
  setInterval(loadActivity, 15000); // refresh the live feed every 15s

  const res = await fetch('/api/me');
  if (res.ok) await enterApp();
})();
