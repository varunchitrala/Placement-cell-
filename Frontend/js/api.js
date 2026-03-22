// ─────────────────────────────────────────────────────
//  API Utility - connects Frontend to Backend
// ─────────────────────────────────────────────────────
const API_BASE = '/api';

const api = {
  getToken: () => localStorage.getItem('token'),

  headers: () => ({
    'Content-Type': 'application/json',
    ...(localStorage.getItem('token') ? { Authorization: `Bearer ${localStorage.getItem('token')}` } : {})
  }),

  async get(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`, { headers: api.headers() });
    // BUG FIX: Only redirect to login on 401 for non-login pages.
    // On index.html (login page) a 401 is a normal "wrong credentials" response,
    // NOT a session expiry — redirecting here caused an infinite redirect loop.
    const data = await res.json();
    if (res.status === 401 && !window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
      localStorage.clear();
      window.location.href = '/index.html';
    }
    return data;
  },

  async post(endpoint, body) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST', headers: api.headers(), body: JSON.stringify(body)
    });
    // BUG FIX: Same redirect loop fix — don't redirect on 401 from the login page itself.
    const data = await res.json();
    if (res.status === 401 && !window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
      localStorage.clear();
      window.location.href = '/index.html';
    }
    return data;
  },

  async put(endpoint, body) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PUT', headers: api.headers(), body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.status === 401 && !window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
      localStorage.clear();
      window.location.href = '/index.html';
    }
    return data;
  },

  async del(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`, { method: 'DELETE', headers: api.headers() });
    const data = await res.json();
    return data;
  }
};

// ─────────────────────────────────────────────────────
//  Auth Guard - call on every protected page
// ─────────────────────────────────────────────────────
function requireAuth(expectedRole) {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!token || !user) { window.location.href = '/index.html'; return null; }
  if (expectedRole && user.role !== expectedRole) {
    if (user.role === 'admin')     window.location.href = '/admin/dashboard.html';
    else if (user.role === 'recruiter') window.location.href = '/recruiter/dashboard.html';
    else                           window.location.href = '/student/dashboard.html';
    return null;
  }
  return user;
}

function logout() {
  localStorage.clear();
  window.location.href = '/index.html';
}

// ─────────────────────────────────────────────────────
//  Sidebar: fill user info & mark active nav
// ─────────────────────────────────────────────────────
function initSidebar(role) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const name = document.getElementById('sidebarUserName');
  const roleEl = document.getElementById('sidebarUserRole');
  const avatar = document.getElementById('sidebarAvatar');
  if (name) name.textContent = user.name || 'User';
  if (roleEl) roleEl.textContent = role === 'admin' ? 'Admin / TPO' : (role === 'recruiter' ? user.company_name || 'Recruiter' : (user.roll_no || 'Student'));
  if (avatar) avatar.textContent = (user.name || 'U')[0].toUpperCase();

  // Mark active navitem
  const links = document.querySelectorAll('.nav-item a');
  links.forEach(link => {
    if (link.href === window.location.href) {
      link.closest('.nav-item').classList.add('active');
    }
  });
}

// ─────────────────────────────────────────────────────
//  Toast Notification
// ─────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.style.cssText = `
    background: var(--bg-card); border: 1px solid ${type === 'success' ? 'rgba(46,204,113,0.3)' : type === 'error' ? 'rgba(231,76,60,0.3)' : 'rgba(108,99,255,0.3)'};
    color: ${type === 'success' ? '#6EEDAB' : type === 'error' ? '#FF8080' : 'var(--primary-light)'};
    padding: 12px 18px; border-radius: 10px; font-size: 13px; font-weight: 500;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4); display: flex; align-items: center; gap: 8px;
    animation: slideIn 0.3s ease; min-width: 240px; font-family: 'Inter', sans-serif;
  `;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add slideIn animation
const style = document.createElement('style');
style.textContent = '@keyframes slideIn{from{opacity:0;transform:translateX(100%)}to{opacity:1;transform:translateX(0)}}';
document.head.appendChild(style);

// ─────────────────────────────────────────────────────
//  Date/Time Helpers
// ─────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
