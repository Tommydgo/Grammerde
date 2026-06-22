import { apiPost, apiGet, getToken, setSession, logout, updateNav, showToast } from './auth.js';
import { initTheme } from './i18n.js';

updateNav();
initTheme();
document.getElementById('btn-logout')?.addEventListener('click', logout);

// ── Configurator ─────────────────────────────────────────────────────────────
let config = {
  errorTypes: ['conjugaison', 'accord', 'homophone', 'orthographe'],
  lang: null,
};

// Lang selection
document.querySelectorAll('.lang-group .diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lang-group .diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    config.lang = btn.dataset.lang;
    const launchBtn = document.getElementById('btn-launch');
    if (launchBtn) launchBtn.disabled = false;
  });
});

// Error type chips
document.querySelectorAll('.type-chip input[type="checkbox"]').forEach(input => {
  input.addEventListener('change', () => {
    const type = input.dataset.type;
    input.closest('.type-chip').classList.toggle('active', input.checked);
    if (input.checked) {
      config.errorTypes.push(type);
    } else {
      config.errorTypes = config.errorTypes.filter(t => t !== type);
    }
  });
});

// Launch game
document.getElementById('btn-launch')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-launch');
  btn.disabled = true;
  btn.textContent = 'Chargement…';
  try {
    if (!config.lang) { showToast('Choisissez une langue', 'error'); btn.disabled = false; btn.textContent = 'Lancer la partie'; return; }
    const data = await apiPost('/game/start', { errorTypes: config.errorTypes, lang: config.lang });
    sessionStorage.setItem('gameData', JSON.stringify(data));
    window.location.href = '/game.html';
  } catch (e) {
    showToast(e.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Lancer la partie';
  }
});

// VS mode — guard on all entry points
function goVs() {
  if (!getToken()) { showToast('Connectez-vous pour jouer en VS', 'error'); return; }
  window.location.href = '/vs.html';
}
document.getElementById('btn-vs')?.addEventListener('click', goVs);
document.getElementById('btn-vs-hero')?.addEventListener('click', goVs);

// ── Leaderboard ───────────────────────────────────────────────────────────────
let lbPeriod = 'all';

async function loadLeaderboard() {
  try {
    const { rows } = await apiGet(`/leaderboard?period=${lbPeriod}`);
    renderLeaderboard(rows);
  } catch { /* ignore */ }
}

function renderLeaderboard(rows) {
  const tbody = document.getElementById('lb-tbody');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:32px">Aucun score pour le moment</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r, i) => {
    const rank = i + 1;
    const rankClass = rank <= 3 ? `top-${rank}` : '';
    const avatarUrl = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(r.avatar_seed || r.username)}`;
    return `
      <tr>
        <td><span class="lb-rank ${rankClass}">${rank}</span></td>
        <td>
          <div class="lb-user">
            <img class="lb-avatar" src="${avatarUrl}" alt="${r.username}" loading="lazy">
            <span class="lb-username">${r.username}</span>
          </div>
        </td>
        <td><span class="lb-score">${r.avg_score}%</span></td>
        <td><span class="lb-games">${r.games_played}</span></td>
      </tr>`;
  }).join('');
}

document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    lbPeriod = tab.dataset.period;
    loadLeaderboard();
  });
});

loadLeaderboard();

// ── Auth modals ───────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

document.getElementById('btn-login')?.addEventListener('click', () => openModal('modal-login'));
document.getElementById('btn-register')?.addEventListener('click', () => openModal('modal-register'));
document.getElementById('close-login')?.addEventListener('click', () => closeModal('modal-login'));
document.getElementById('close-register')?.addEventListener('click', () => closeModal('modal-register'));
document.getElementById('link-to-register')?.addEventListener('click', (e) => {
  e.preventDefault(); closeModal('modal-login'); openModal('modal-register');
});
document.getElementById('link-to-login')?.addEventListener('click', (e) => {
  e.preventDefault(); closeModal('modal-register'); openModal('modal-login');
});

['modal-login', 'modal-register'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', (e) => {
    if (e.target.id === id) closeModal(id);
  });
});

document.getElementById('form-login')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const err = document.getElementById('login-error');
  err.textContent = '';
  try {
    const { token, user } = await apiPost('/auth/login', { email, password });
    setSession(token, user);
    closeModal('modal-login');
    updateNav();
    showToast(`Bienvenue, ${user.username} !`, 'success');
  } catch (ex) {
    err.textContent = ex.message;
  }
});

document.getElementById('form-register')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('register-username').value;
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  const err = document.getElementById('register-error');
  err.textContent = '';
  try {
    const { token, user } = await apiPost('/auth/register', { username, email, password });
    setSession(token, user);
    closeModal('modal-register');
    updateNav();
    showToast(`Compte créé ! Bienvenue, ${user.username} !`, 'success');
  } catch (ex) {
    err.textContent = ex.message;
  }
});
