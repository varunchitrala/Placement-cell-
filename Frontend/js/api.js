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
    const res  = await fetch(`${API_BASE}${endpoint}`, { headers: api.headers() });
    const data = await res.json();
    if (res.status === 401 && !window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
      localStorage.clear();
      window.location.href = '/index.html';
    }
    return data;
  },

  async post(endpoint, body) {
    const res  = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST', headers: api.headers(), body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.status === 401 && !window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
      localStorage.clear();
      window.location.href = '/index.html';
    }
    return data;
  },

  async put(endpoint, body) {
    const res  = await fetch(`${API_BASE}${endpoint}`, {
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
    const res  = await fetch(`${API_BASE}${endpoint}`, { method: 'DELETE', headers: api.headers() });
    const data = await res.json();
    return data;
  }
};

// ─────────────────────────────────────────────────────
//  Auth Guard
// ─────────────────────────────────────────────────────
function requireAuth(expectedRole) {
  const token = localStorage.getItem('token');
  const user  = JSON.parse(localStorage.getItem('user') || 'null');
  if (!token || !user) { window.location.href = '/index.html'; return null; }
  // Treat 'recruiter' and 'coordinator' as the same role for auth-guard purposes
  const normaliseRole = r => (r === 'recruiter' || r === 'coordinator') ? 'coordinator' : r;
  if (expectedRole && normaliseRole(user.role) !== normaliseRole(expectedRole)) {
    if      (user.role === 'admin')     window.location.href = '/admin/dashboard.html';
    else if (user.role === 'recruiter' || user.role === 'coordinator') window.location.href = '/cordinator/dashboard.html';
    else                                window.location.href = '/student/dashboard.html';
    return null;
  }
  return user;
}

function logout() {
  localStorage.clear();
  window.location.href = '/index.html';
}

// ─────────────────────────────────────────────────────
//  Sidebar: fill user info, mark active nav,
//  and inject Export Reports link on admin pages
// ─────────────────────────────────────────────────────
function initSidebar(role) {
  const user   = JSON.parse(localStorage.getItem('user') || '{}');
  const name   = document.getElementById('sidebarUserName');
  const roleEl = document.getElementById('sidebarUserRole');
  const avatar = document.getElementById('sidebarAvatar');
  if (name)   name.textContent   = user.name || 'User';
  if (roleEl) roleEl.textContent = role === 'admin'
    ? 'Admin / TPO'
    : (role === 'recruiter' || role === 'coordinator')
      ? (user.company_name || 'Coordinator')
      : (user.roll_no || 'Student');
  if (avatar) avatar.textContent = (user.name || 'U')[0].toUpperCase();

  // ── Inject Export Reports link into admin sidebar if not already there ──
  if (role === 'admin') {
    var nav = document.querySelector('.sidebar-nav ul');
    if (nav && !document.querySelector('a[href="export.html"]')) {
      var li = document.createElement('li');
      li.className = 'nav-item';
      li.innerHTML = '<a href="export.html" style="color:#10B981"><i class="fas fa-file-excel" style="color:#10B981"></i> Export Reports</a>';
      nav.appendChild(li);
    }
  }

  // Mark active nav item
  var links = document.querySelectorAll('.nav-item a');
  links.forEach(function(link) {
    if (link.href === window.location.href) {
      link.closest('.nav-item').classList.add('active');
    }
  });
}

// ─────────────────────────────────────────────────────
//  Toast Notification
// ─────────────────────────────────────────────────────
function showToast(message, type) {
  type = type || 'success';
  var container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
  }
  var toast = document.createElement('div');
  toast.style.cssText =
    'background:var(--bg-card);border:1px solid ' +
    (type === 'success' ? 'rgba(46,204,113,0.3)' : type === 'error' ? 'rgba(231,76,60,0.3)' : 'rgba(108,99,255,0.3)') +
    ';color:' +
    (type === 'success' ? '#6EEDAB' : type === 'error' ? '#FF8080' : 'var(--primary-light)') +
    ';padding:12px 18px;border-radius:10px;font-size:13px;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,0.4);display:flex;align-items:center;gap:8px;animation:slideIn 0.3s ease;min-width:240px;font-family:Inter,sans-serif;';
  var icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = '<span>' + icon + '</span><span>' + message + '</span>';
  container.appendChild(toast);
  setTimeout(function() {
    toast.style.opacity    = '0';
    toast.style.transform  = 'translateX(100%)';
    toast.style.transition = 'all 0.3s';
    setTimeout(function() { toast.remove(); }, 300);
  }, 3000);
}

// Slide-in animation
var _s = document.createElement('style');
_s.textContent = '@keyframes slideIn{from{opacity:0;transform:translateX(100%)}to{opacity:1;transform:translateX(0)}}';
document.head.appendChild(_s);

// ─────────────────────────────────────────────────────
//  Date / Time Helpers
// ─────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

// ─────────────────────────────────────────────────────
//  Mobile Sidebar Nav Toggle
// ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  var header = document.querySelector('.page-header');
  var sidebar = document.querySelector('.sidebar');
  if (header && sidebar) {
    var titleArea = header.firstElementChild;
    if (titleArea) {
      var toggleBtn = document.createElement('button');
      toggleBtn.innerHTML = '<i class="fas fa-bars"></i>';
      toggleBtn.className = 'mobile-menu-btn';
      toggleBtn.style.cssText = 'display:none; background:none; border:none; font-size:24px; color:var(--text-primary); cursor:pointer; margin-right:16px; padding:4px;';
      
      titleArea.style.display = 'flex';
      titleArea.style.alignItems = 'center';
      titleArea.insertBefore(toggleBtn, titleArea.firstChild);
      
      toggleBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        sidebar.classList.toggle('open');
      });
      
      document.addEventListener('click', function(e) {
        if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
          if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
            sidebar.classList.remove('open');
          }
        }
      });
    }
  }
});
