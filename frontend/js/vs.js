import { apiPost, getToken, getUser, showToast, updateNav } from './auth.js';
import { initTheme } from './i18n.js';

updateNav();
initTheme();

if (!getToken()) {
  showToast('Connectez-vous pour jouer en VS', 'error');
  setTimeout(() => window.location.href = '/', 1500);
}

const user = getUser();
let ws = null;
let roomCode = null;
let vsCorrections = []; // { idx, displayed_invalid, correction }
let vsErrors = [];
let vsCorruptedText = '';
let gameStarted = false;
let vsLang = 'fr';

// Lang selection for VS create
document.querySelectorAll('#view-setup .lang-group .diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#view-setup .lang-group .diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    vsLang = btn.dataset.lang;
  });
});

// ── Views ─────────────────────────────────────────────────────────────────────

function showView(id) {
  ['view-setup', 'view-waiting', 'view-game', 'finish-screen'].forEach(v => {
    document.getElementById(v)?.classList.add('hidden');
  });
  document.getElementById(id)?.classList.remove('hidden');
}

showView('view-setup');

// ── Create Room ───────────────────────────────────────────────────────────────

document.getElementById('btn-create-room')?.addEventListener('click', async () => {
  try {
    const data = await apiPost('/vs/create', { lang: vsLang });
    roomCode = data.room_code;
    document.getElementById('display-code').textContent = roomCode;
    showView('view-waiting');
    connectWS(roomCode);
  } catch (e) {
    showToast(e.message, 'error');
  }
});

// ── Join Room ─────────────────────────────────────────────────────────────────

document.getElementById('btn-join-room')?.addEventListener('click', async () => {
  const code = document.getElementById('join-code')?.value.trim().toUpperCase();
  if (!code) return showToast('Entrez un code', 'error');
  try {
    await apiPost('/vs/join', { room_code: code });
    roomCode = code;
    showView('view-waiting');
    connectWS(roomCode);
  } catch (e) {
    showToast(e.message, 'error');
  }
});

// ── WebSocket ─────────────────────────────────────────────────────────────────

function connectWS(code) {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${protocol}://${location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join_room', room_code: code, user_id: user.id, username: user.username }));
    document.getElementById('waiting-status').textContent = "Connecté — en attente d'un adversaire…";
  };

  ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
  ws.onclose = () => { if (!gameStarted) showToast('Connexion perdue', 'error'); };
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'player_joined':
      if (msg.player_count === 2) {
        document.getElementById('waiting-code-card')?.classList.add('hidden');
        document.getElementById('waiting-status').textContent = 'Génération du texte en cours…';
        if (msg.players) populateWaitingPlayers(msg.players);
      } else {
        document.getElementById('waiting-status').textContent = `${msg.player_count}/2 joueur(s) connecté(s)…`;
      }
      break;

    case 'game_start':
      gameStarted = true;
      vsErrors = msg.errors_map || [];
      vsCorruptedText = msg.corrupted_text;
      startGame(msg);
      if (msg.timer_seconds) updateTimer(msg.timer_seconds);
      break;

    case 'tick':
      updateTimer(msg.remaining);
      break;

    case 'score_update':
      updateScores(msg.scores);
      break;

    case 'player_done':
      if (String(msg.player_id) !== String(user.id)) {
        document.getElementById('opponent-done-notice')?.classList.remove('hidden');
      }
      break;

    case 'opponent_disconnected':
      showToast('Adversaire déconnecté — victoire dans 10s…', 'success');
      break;

    case 'game_over':
      showGameOver(msg);
      break;

    case 'error':
      showToast(msg.message, 'error');
      break;
  }
}

// ── Game ──────────────────────────────────────────────────────────────────────

function avatarUrl(seed) {
  return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(seed || 'default')}`;
}

function populateWaitingPlayers(players) {
  const me = players.find(p => String(p.id) === String(user.id));
  const op = players.find(p => String(p.id) !== String(user.id));
  const el = document.getElementById('waiting-players');
  if (!el) return;
  el.classList.remove('hidden');
  el.style.display = 'flex';
  if (me) {
    document.getElementById('waiting-my-avatar').src = avatarUrl(me.avatar_seed || me.username);
    document.getElementById('waiting-my-name').textContent = me.username;
  }
  if (op) {
    document.getElementById('waiting-op-avatar').src = avatarUrl(op.avatar_seed || op.username);
    document.getElementById('waiting-op-name').textContent = op.username;
  }
}

function startGame(msg) {
  showView('view-game');

  const me = msg.players?.find(p => String(p.id) === String(user.id));
  const op = msg.players?.find(p => String(p.id) !== String(user.id));

  document.getElementById('my-username').textContent = me?.username || user.username;
  document.getElementById('my-avatar').src = avatarUrl(me?.avatar_seed || user.username);

  if (op) {
    document.getElementById('opponent-username').textContent = op.username;
    document.getElementById('opponent-avatar').src = avatarUrl(op.avatar_seed || op.username);
  }

  const totalEl = document.getElementById('vs-total-errors');
  if (totalEl && msg.total_errors != null) {
    totalEl.textContent = `${msg.total_errors} fautes cachées`;
  }

  vsCorrections = [];
  renderText(msg.corrupted_text);
  updateScores({});
}

function renderText(text) {
  const container = document.getElementById('vs-text');
  if (!container) return;
  let idx = 0;
  container.innerHTML = text.split(/(\s+)/).map(seg => {
    if (/^\s+$/.test(seg) || /^[.,;:!?«»"'()\[\]\-—–]+$/.test(seg)) return seg;
    const clean = seg.replace(/^[^a-zA-ZÀ-ÿ]+|[^a-zA-ZÀ-ÿ]+$/g, '');
    if (!clean) return seg;
    const i = idx++;
    return `<span class="word-selectable" style="cursor:pointer" data-idx="${i}" data-word="${clean.replace(/"/g,'&quot;')}" data-orig="${seg.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}">${seg}</span>`;
  }).join('');

  container.querySelectorAll('.word-selectable').forEach(el => {
    el.addEventListener('click', () => openVsPopup(el));
  });
}

let vsCurrentEl = null;

function openVsPopup(el) {
  const existing = vsCorrections.find(c => c.idx === el.dataset.idx);
  vsCurrentEl = el;
  document.getElementById('vs-popup-word').textContent = el.dataset.word;
  document.getElementById('vs-popup-input').value = existing?.correction || '';
  document.getElementById('vs-popup').classList.remove('hidden');
  document.getElementById('vs-popup-input').focus();
}

document.getElementById('btn-vs-done')?.addEventListener('click', () => {
  const btn = document.getElementById('btn-vs-done');
  btn.disabled = true;
  btn.textContent = "En attente de l'adversaire…";
  ws?.send(JSON.stringify({ type: 'player_done', room_code: roomCode, user_id: user.id, corrections: vsCorrections }));
});

document.getElementById('btn-vs-validate')?.addEventListener('click', submitVsCorrection);
document.getElementById('vs-popup-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitVsCorrection();
  if (e.key === 'Escape') document.getElementById('vs-popup').classList.add('hidden');
});
document.getElementById('btn-vs-skip')?.addEventListener('click', () => {
  document.getElementById('vs-popup').classList.add('hidden');
});

function submitVsCorrection() {
  const correction = document.getElementById('vs-popup-input').value.trim();
  if (!correction || !vsCurrentEl) return;

  const idx = vsCurrentEl.dataset.idx;
  const displayedInvalid = vsCurrentEl.dataset.word;

  const existingIdx = vsCorrections.findIndex(c => c.idx === idx);
  if (existingIdx >= 0) vsCorrections[existingIdx].correction = correction;
  else vsCorrections.push({ idx, displayed_invalid: displayedInvalid, correction });

  const wordEl = vsCurrentEl;
  wordEl.innerHTML = `<span>${escapeHtml(correction)}</span><button class="cancel-btn" title="Annuler">✕</button>`;
  wordEl.classList.add('corrected');
  wordEl.querySelector('.cancel-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    cancelVsCorrection(wordEl);
  });
  document.getElementById('vs-popup').classList.add('hidden');

  ws?.send(JSON.stringify({
    type: 'correction',
    room_code: roomCode,
    user_id: user.id,
    corrections_count: vsCorrections.length,
    corrections: vsCorrections,
  }));

  document.getElementById('my-score').textContent = vsCorrections.length;
}

function cancelVsCorrection(el) {
  const idx = el.dataset.idx;
  vsCorrections = vsCorrections.filter(c => c.idx !== idx);
  el.textContent = el.dataset.orig || el.dataset.word;
  el.classList.remove('corrected');
  document.getElementById('my-score').textContent = vsCorrections.length;
  ws?.send(JSON.stringify({
    type: 'correction',
    room_code: roomCode,
    user_id: user.id,
    corrections_count: vsCorrections.length,
    corrections: vsCorrections,
  }));
}

function updateTimer(remaining) {
  const el = document.getElementById('vs-timer');
  if (!el) return;
  el.textContent = remaining;
  el.classList.toggle('urgent', remaining <= 30);
}

function updateScores(scores) {
  document.getElementById('my-score').textContent = scores[user.id] ?? vsCorrections.length;
  const opId = Object.keys(scores).find(id => id != user.id);
  if (opId) document.getElementById('opponent-score').textContent = scores[opId] ?? 0;
}

// ── Results ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function normalizeStr(s) { return s.trim().toLowerCase().replace(/\s+/g, ' '); }

// Tab switching
document.querySelectorAll('.vs-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.vs-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    ['tab-my-results', 'tab-op-results'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById(tab.dataset.tab)?.classList.remove('hidden');
  });
});

function showGameOver(msg) {
  showView('finish-screen');

  const isWinner = String(msg.winner_id) === String(user.id);
  const titleEl = document.getElementById('finish-title');
  titleEl.textContent = isWinner ? 'Victoire !' : 'Défaite';
  titleEl.style.color = isWinner ? 'var(--green)' : 'var(--red)';

  const myScore = msg.player_scores?.[user.id];
  renderMyResults(myScore);

  const opId = Object.keys(msg.scores).find(id => id != user.id);
  if (opId && msg.all_corrections?.[opId]) {
    const opName = msg.player_info?.[opId]?.username || 'Adversaire';
    const opScore = msg.player_scores?.[opId];
    document.getElementById('op-tab-btn').textContent = opName;
    document.getElementById('op-results-name').textContent = opName;
    renderOpponentResults(msg.all_corrections[opId], opScore);
  }
}

function buildResultsHtml(corrections, errors, corruptedText, responseLabel) {
  const detailMap = new Map(errors.map(e => [e.span_idx, e]));
  const answerMap = new Map(corrections.map(c => [parseInt(c.idx), c.correction]));
  const touchedCorrectSet = new Set();
  corrections.forEach(c => {
    const idx = parseInt(c.idx);
    if (!detailMap.has(idx)) touchedCorrectSet.add(idx);
  });

  let spanIdx = 0;
  return corruptedText.split(/(\s+)/).map(seg => {
    if (/^\s+$/.test(seg)) return seg;
    const isPunct = /^[.,;:!?«»"'()\[\]\-—–]+$/.test(seg);
    const clean   = seg.replace(/^[^a-zA-ZÀ-ÿ]+|[^a-zA-ZÀ-ÿ]+$/g, '');
    if (isPunct || !clean) return escapeHtml(seg);

    const currentIdx = spanIdx++;
    const detail = detailMap.get(currentIdx);

    if (detail) {
      const answer = answerMap.get(currentIdx);
      let cls, display;
      if (!answer)                                                        { cls = 'badge-result-red';    display = seg; }
      else if (normalizeStr(answer) === normalizeStr(detail.original_valid)) { cls = 'badge-result-green';  display = answer; }
      else                                                                 { cls = 'badge-result-orange'; display = answer; }

      const tip = `<span class="tooltip-row"><span class="tooltip-label">Mot invalide</span><span>${escapeHtml(detail.displayed_invalid)}</span></span><span class="tooltip-row"><span class="tooltip-label">${escapeHtml(responseLabel)}</span><span>${escapeHtml(answer || '—')}</span></span><span class="tooltip-row"><span class="tooltip-label">Mot valide</span><span>${escapeHtml(detail.original_valid)}</span></span><span class="tooltip-divider"></span><span class="tooltip-row"><span class="tooltip-label">${escapeHtml(detail.error_type)}</span><span>${escapeHtml(detail.explanation || '')}</span></span>`;
      return `<span class="result-badge ${cls}">${escapeHtml(display)}<span class="result-tooltip">${tip}</span></span>`;
    }

    if (touchedCorrectSet.has(currentIdx)) {
      const c = corrections.find(x => parseInt(x.idx) === currentIdx);
      const tip = `<span class="tooltip-row"><span class="tooltip-label">Mot correct</span><span>${escapeHtml(seg)}</span></span><span class="tooltip-row"><span class="tooltip-label">${escapeHtml(responseLabel)}</span><span>${escapeHtml(c?.correction || '—')}</span></span>`;
      return `<span class="result-badge badge-result-blue">${escapeHtml(c?.correction || seg)}<span class="result-tooltip">${tip}</span></span>`;
    }

    return escapeHtml(seg);
  }).join('');
}

function renderMyResults(playerScore) {
  const valid   = playerScore?.valid   ?? 0;
  const wrong   = playerScore?.wrong   ?? 0;
  const missed  = playerScore?.missed  ?? 0;
  const applied = playerScore?.applied ?? vsCorrections.length;
  const score   = vsErrors.length ? Math.round((valid / vsErrors.length) * 100) : 0;

  document.getElementById('finish-my-score').textContent = `${score}% — ${valid} / ${vsErrors.length} fautes corrigées correctement`;
  document.getElementById('finish-stat-applied').textContent = applied;
  document.getElementById('finish-stat-valid').textContent   = valid;
  document.getElementById('finish-stat-wrong').textContent   = wrong;
  document.getElementById('finish-stat-missed').textContent  = missed;

  const container = document.getElementById('vs-results-text');
  if (container) container.innerHTML = buildResultsHtml(vsCorrections, vsErrors, vsCorruptedText, 'Votre réponse');
}

function renderOpponentResults(opCorrections, opScore) {
  document.getElementById('op-stat-applied').textContent = opScore?.applied ?? opCorrections.length;
  document.getElementById('op-stat-valid').textContent   = opScore?.valid   ?? '—';
  document.getElementById('op-stat-wrong').textContent   = opScore?.wrong   ?? '—';
  document.getElementById('op-stat-missed').textContent  = opScore?.missed  ?? '—';

  const container = document.getElementById('op-results-text');
  if (container) container.innerHTML = buildResultsHtml(opCorrections, vsErrors, vsCorruptedText, 'Sa réponse');
}

document.getElementById('btn-play-again')?.addEventListener('click', () => window.location.href = '/');

// ── VS Leaderboard ────────────────────────────────────────────────────────────

function avatarUrlLb(seed) {
  return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(seed || 'default')}`;
}

async function loadVsLeaderboard() {
  const tbody = document.getElementById('vs-leaderboard-body');
  if (!tbody) return;
  try {
    const res = await fetch('/api/leaderboard/vs', {
      headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {},
    });
    const data = await res.json();
    if (!data.rows || data.rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);padding:24px">Aucune partie VS terminée pour l\'instant</td></tr>';
      return;
    }
    tbody.innerHTML = data.rows.map((row, i) => {
      const rank = i + 1;
      const rankClass = rank === 1 ? 'top-1' : rank === 2 ? 'top-2' : rank === 3 ? 'top-3' : '';
      return `<tr>
        <td class="lb-rank ${rankClass}">#${rank}</td>
        <td><div class="lb-user">
          <img class="lb-avatar" src="${avatarUrlLb(row.avatar_seed || row.username)}" alt="">
          <span class="lb-username">${escapeHtml(row.username)}</span>
        </div></td>
        <td class="lb-score">${row.wins}</td>
      </tr>`;
    }).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);padding:24px">Impossible de charger le classement</td></tr>';
  }
}

loadVsLeaderboard();
