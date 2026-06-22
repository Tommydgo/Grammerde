import { apiPost, showToast, updateNav } from './auth.js';
import { initTheme } from './i18n.js';

updateNav();
initTheme();

const gameDataRaw = sessionStorage.getItem('gameData');
if (!gameDataRaw) { window.location.href = '/'; }

const gameData = JSON.parse(gameDataRaw);

// corrections: [{ idx, wrong_word, correction }] — keyed by span index to prevent cross-pollination
let corrections = [];
let startTime = Date.now();
let currentErrorWord = null;
let timerInterval = null;
let gameOver = false;

// ── Timer ─────────────────────────────────────────────────────────────────────

function startTimer(duration) {
  const timerBlock = document.getElementById('timer-block');
  const timerEl = document.getElementById('timer-value');
  if (timerBlock) timerBlock.classList.remove('hidden');

  let remaining = duration;

  function tick() {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    if (timerEl) {
      timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
      timerEl.classList.toggle('urgent', remaining <= 30);
    }
    if (remaining <= 0) {
      clearInterval(timerInterval);
      if (!gameOver) {
        closePopup();
        document.getElementById('btn-submit')?.click();
      }
    }
    remaining--;
  }

  tick();
  timerInterval = setInterval(tick, 1000);
}

// ── Render text ───────────────────────────────────────────────────────────────

function renderAllWords(text) {
  const container = document.getElementById('text-display');
  if (!container) return;
  let idx = 0;
  const words = text.split(/(\s+)/);
  container.innerHTML = words.map(seg => {
    if (/^\s+$/.test(seg) || /^[.,;:!?«»"'()\[\]\-—–]+$/.test(seg)) return seg;
    const clean = seg.replace(/^[^a-zA-ZÀ-ÿ]+|[^a-zA-ZÀ-ÿ]+$/g, '');
    if (!clean) return seg;
    const i = idx++;
    return `<span class="word-selectable" data-idx="${i}" data-word="${escapeHtml(clean)}" data-orig="${escapeHtml(seg)}">${seg}</span>`;
  }).join('');

  container.querySelectorAll('.word-selectable').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => openWordPopup(el));
  });
}

// ── Popup ─────────────────────────────────────────────────────────────────────

function openWordPopup(el) {
  if (gameOver) return;
  const idx = el.dataset.idx;
  const word = el.dataset.word;

  // Pre-fill only if THIS specific span was already corrected
  const existing = corrections.find(c => c.idx === idx);

  document.getElementById('popup-word').textContent = word;
  document.getElementById('popup-input').value = existing?.correction || '';
  document.getElementById('popup-overlay').classList.remove('hidden');
  document.getElementById('popup-input').focus();
  currentErrorWord = el;
}

function closePopup() {
  document.getElementById('popup-overlay').classList.add('hidden');
  currentErrorWord = null;
}

document.getElementById('popup-overlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'popup-overlay') closePopup();
});

document.getElementById('btn-popup-validate')?.addEventListener('click', submitCorrection);
document.getElementById('popup-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitCorrection();
  if (e.key === 'Escape') closePopup();
});

document.getElementById('btn-popup-skip')?.addEventListener('click', closePopup);

async function submitCorrection() {
  const correction = document.getElementById('popup-input').value.trim();
  if (!correction || !currentErrorWord) return;

  const idx = currentErrorWord.dataset.idx;
  const wrongWord = currentErrorWord.dataset.word;

  // Update corrections array keyed by idx (not by word)
  const existingIdx = corrections.findIndex(c => c.idx === idx);
  if (existingIdx >= 0) corrections[existingIdx].correction = correction;
  else corrections.push({ idx, wrong_word: wrongWord, correction });

  // Visual: mark span as corrected (blue badge) with cancel button
  const wordEl = currentErrorWord;
  wordEl.innerHTML = `<span>${escapeHtml(correction)}</span><button class="cancel-btn" title="Annuler">✕</button>`;
  wordEl.classList.add('corrected');
  wordEl.querySelector('.cancel-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    cancelCorrection(wordEl);
  });

  closePopup();
  updateProgress();

  // Send to server for real-time validation and storage (fire-and-forget)
  try {
    await apiPost('/game/correct', {
      session_id: gameData.session_id,
      span_idx: parseInt(idx),
      correction,
    });
  } catch { /* non-blocking — server fallback handles it at submit */ }
}

function cancelCorrection(el) {
  const idx = el.dataset.idx;
  corrections = corrections.filter(c => c.idx !== idx);
  el.textContent = el.dataset.orig || el.dataset.word;
  el.classList.remove('corrected');
  updateProgress();
}

function updateProgress() {
  const total = gameData.total_errors;
  const done = Math.min(corrections.length, total);
  const pct = total ? (done / total) * 100 : 0;
  document.getElementById('progress-fill').style.width = Math.min(pct, 100) + '%';
  const n = corrections.length;
  document.getElementById('progress-label').textContent = `${n} mot${n > 1 ? 's' : ''} modifié${n > 1 ? 's' : ''} · ${total} faute${total > 1 ? 's' : ''} cachée${total > 1 ? 's' : ''}`;
  document.getElementById('stat-corrections').textContent = corrections.length;
  document.getElementById('stat-total').textContent = total;
}

// ── Submit ────────────────────────────────────────────────────────────────────

document.getElementById('btn-submit')?.addEventListener('click', async () => {
  if (gameOver) return;
  gameOver = true;
  clearInterval(timerInterval);

  const duration = Math.round((Date.now() - startTime) / 1000);
  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.textContent = 'Correction…';

  const correctionsPayload = corrections.map(c => ({ span_idx: parseInt(c.idx), correction: c.correction }));

  try {
    const result = await apiPost('/game/submit', {
      session_id: gameData.session_id,
      corrections: correctionsPayload,
      duration_seconds: duration,
    });
    sessionStorage.setItem('gameResult', JSON.stringify(result));
    sessionStorage.removeItem('gameData');
    renderResults(result);
  } catch (e) {
    showToast(e.message, 'error');
    gameOver = false;
    btn.disabled = false;
    btn.textContent = 'Terminer et voir le score';
  }
});

// ── Results ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderResults(result) {
  document.getElementById('game-view').classList.add('hidden');
  const rv = document.getElementById('results-view');
  rv.classList.remove('hidden');

  document.getElementById('score-value').textContent = result.score + '%';
  document.getElementById('score-summary').textContent = `${result.correct} / ${result.total} fautes corrigées correctement`;

  let valid = 0, wrong = 0, missed = 0;
  result.details.forEach(d => {
    if (!d.user_answer) missed++;
    else if (d.is_correct) valid++;
    else wrong++;
  });
  const applied = corrections.length;
  document.getElementById('result-stat-applied').textContent = applied;
  document.getElementById('result-stat-valid').textContent = valid;
  document.getElementById('result-stat-wrong').textContent = wrong;
  document.getElementById('result-stat-missed').textContent = missed;

  // All maps keyed by span_idx (integer) — no word-text ambiguity
  const detailMap = new Map();
  result.details.forEach(d => detailMap.set(d.span_idx, d));

  const userAnswerMap = new Map();
  corrections.forEach(c => userAnswerMap.set(parseInt(c.idx), c.correction));

  const touchedCorrectSet = new Set();
  corrections.forEach(c => {
    const idx = parseInt(c.idx);
    if (!detailMap.has(idx)) touchedCorrectSet.add(idx);
  });

  // Walk tokens with the same logic as renderAllWords to track span_idx
  let spanIdx = 0;
  const tokens = gameData.corrupted_text.split(/(\s+)/);

  const html = tokens.map(seg => {
    if (/^\s+$/.test(seg)) return seg;
    const isPunct = /^[.,;:!?«»"'()\[\]\-—–]+$/.test(seg);
    const clean   = seg.replace(/^[^a-zA-ZÀ-ÿ]+|[^a-zA-ZÀ-ÿ]+$/g, '');
    if (isPunct || !clean) return escapeHtml(seg);

    const currentIdx = spanIdx++;

    const detail = detailMap.get(currentIdx);
    if (detail) {
      const userAnswer = userAnswerMap.get(currentIdx);
      let cls, display;
      if (!userAnswer) {
        cls = 'badge-result-red';
        display = seg;
      } else if (detail.is_correct) {
        cls = 'badge-result-green';
        display = userAnswer;
      } else {
        cls = 'badge-result-orange';
        display = userAnswer;
      }
      const tip = `<span class="tooltip-row"><span class="tooltip-label">Mot invalide</span><span>${escapeHtml(detail.displayed_invalid)}</span></span><span class="tooltip-row"><span class="tooltip-label">Votre réponse</span><span>${escapeHtml(userAnswer || '—')}</span></span><span class="tooltip-row"><span class="tooltip-label">Mot valide</span><span>${escapeHtml(detail.original_valid)}</span></span><span class="tooltip-divider"></span><span class="tooltip-row"><span class="tooltip-label">${escapeHtml(detail.error_type)}</span><span>${escapeHtml(detail.explanation || '')}</span></span>`;
      return `<span class="result-badge ${cls}">${escapeHtml(display)}<span class="result-tooltip">${tip}</span></span>`;
    }

    if (touchedCorrectSet.has(currentIdx)) {
      const c = corrections.find(x => parseInt(x.idx) === currentIdx);
      const tip = `<span class="tooltip-row"><span class="tooltip-label">Mot correct</span><span>${escapeHtml(seg)}</span></span><span class="tooltip-row"><span class="tooltip-label">Votre modification</span><span>${escapeHtml(c?.correction || '—')}</span></span>`;
      return `<span class="result-badge badge-result-blue">${escapeHtml(c?.correction || seg)}<span class="result-tooltip">${tip}</span></span>`;
    }

    return escapeHtml(seg);
  }).join('');

  const container = document.getElementById('results-text');
  if (container) container.innerHTML = html;
}

document.getElementById('btn-replay')?.addEventListener('click', () => {
  window.location.href = '/';
});

// ── Init ─────────────────────────────────────────────────────────────────────

renderAllWords(gameData.corrupted_text);
updateProgress();

const timerSecs = gameData.timer_seconds || gameData.timer_duration;
if (timerSecs) {
  startTimer(timerSecs);
}
