const DEFAULT_LOCAL_API = 'http://localhost:5000';
const DEFAULT_PROD_API = 'https://auth-project-production-2d1e.up.railway.app';

const API_BASE_URL = localStorage.getItem('API_BASE_URL') ||
  window.AUTH_API_BASE_URL ||
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? DEFAULT_LOCAL_API
    : DEFAULT_PROD_API);

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  verifyProtectedSession();
});

async function verifyProtectedSession() {
  const token = localStorage.getItem('jwt_token');

  if (!token) {
    redirectToLogin();
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('cached_user');
      redirectToLogin();
      return;
    }

    renderProtectedUser(data.user);
  } catch (error) {
    console.error('Protected session check failed:', error);
    redirectToLogin();
  }
}

function renderProtectedUser(user) {
  const displayName = user.name || 'MISBAH ULLAH';
  document.getElementById('protected-profile-name').innerText = displayName;
  document.getElementById('protected-contact').innerText = user.email || user.phone || 'Authenticated user';
  document.getElementById('protected-avatar').innerText = displayName.charAt(0).toUpperCase();
  document.getElementById('protected-main-name').innerText = 'MISBAH ULLAH';
}

function logoutProtectedUser() {
  localStorage.removeItem('jwt_token');
  localStorage.removeItem('cached_user');
  redirectToLogin();
}

function redirectToLogin() {
  window.location.href = 'index.html';
}
