const API = '';

let refreshing = false;

const __fetch = window.fetch.bind(window);
window.fetch = async function(i, init) {
  const r = await __fetch(i, init);
  if (r.status === 401) {
    const url = typeof i === 'string' ? i : i?.url;
    if (url && !url.endsWith('/auth/login') && !url.endsWith('/auth/register') && !url.endsWith('/auth/refresh') && !refreshing) {
      refreshing = true;
      const ok = await tryRefresh();
      refreshing = false;
      if (ok) {
        window.location.reload();
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('username');
        localStorage.removeItem('role');
        sessionStorage.setItem('relogin', 'Tu sesión expiró. Iniciá sesión de nuevo.');
        window.location.href = '/';
      }
    }
  }
  return r;
};

async function tryRefresh() {
  const rt = localStorage.getItem('refreshToken');
  if (!rt) return false;
  try {
    const res = await __fetch(API + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem('token', data.token);
    localStorage.setItem('refreshToken', data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

const CTX_LABELS = { fasting:'Ayunas', before_meal:'Antes', after_meal:'Después', bedtime:'Acostarse', other:'Otro' };

let token = localStorage.getItem('token');
let username = localStorage.getItem('username');
let userRole = localStorage.getItem('role') || 'user';

function checkAuth() {
  if (!token || !username) { window.location.href = '/'; return false; }
  document.getElementById('user-name').textContent = username;
  return true;
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  if (!el) return;
  el.textContent = msg; el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 4000);
}

function showToast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = 'toast show ' + (type || '');
  setTimeout(() => el.className = 'toast', 3000);
}

async function handleLogout() {
  try {
    await __fetch(API + '/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
    });
  } catch {}
  token = null; username = null;
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('username');
  localStorage.removeItem('role');
  window.location.href = '/';
}

function navTo(page) {
  const el = document.getElementById('page-loader');
  if (el) el.style.display = 'flex';
  setTimeout(() => { window.location.href = '/' + page; }, 80);
}

function suggestContext(dtId, selId) {
  const dt = document.getElementById(dtId)?.value;
  if (!dt) return;
  const h = new Date(dt).getHours();
  const map = {5:'fasting',6:'fasting',7:'fasting',8:'fasting',
    9:'after_meal',10:'after_meal',11:'after_meal',12:'before_meal',
    13:'after_meal',14:'after_meal',15:'after_meal',
    16:'before_meal',17:'before_meal',18:'before_meal',
    19:'after_meal',20:'after_meal',21:'after_meal'};
  document.getElementById(selId).value = map[h] || 'bedtime';
}

function toggleMenu() {
  const el = document.getElementById('menu-dropdown');
  if (el) el.classList.toggle('show');
}

document.querySelectorAll('.menu-dropdown').forEach(menu => {
  const perfilBtn = document.createElement('button');
  perfilBtn.textContent = '👤 Perfil';
  perfilBtn.onclick = () => navTo('profile.html');
  menu.insertBefore(perfilBtn, menu.firstChild);
  if (userRole === 'admin') {
    const adminBtn = document.createElement('button');
    adminBtn.textContent = '⚙️ Admin';
    adminBtn.onclick = () => navTo('admin.html');
    menu.insertBefore(adminBtn, menu.firstChild);
  }
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-dots')) document.querySelectorAll('.menu-dropdown').forEach(m => m.classList.remove('show'));
});

function formatDate(iso) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('es-ES', { day:'numeric', month:'short' }),
    time: d.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' }),
  };
}
