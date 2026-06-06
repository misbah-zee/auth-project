// API Base URL Configuration
// Automatically detects if running locally or in production (hosted on Vercel)
// IMPORTANT: Once you deploy your backend to Railway, replace the Railway URL placeholder below.
const DEFAULT_LOCAL_API = 'http://localhost:5000';
const DEFAULT_PROD_API = 'https://auth-project-backend.up.railway.app'; // <-- REPLACE THIS with your deployed Railway backend URL

const API_BASE_URL = localStorage.getItem('API_BASE_URL') || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? DEFAULT_LOCAL_API 
    : DEFAULT_PROD_API);

// Print API Config to Console
console.log(`[Auth Client] Pointing to API backend at: ${API_BASE_URL}`);

// Client State
let activeAuthTab = 'login';
let activeLoginMethod = 'password';
let otpSent = false;
let userSession = null;

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  lucide.createIcons();
  
  // Check for existing JWT session
  checkAuthSession();

  // Test backend API health status
  checkApiHealth();
});

// Toast Notification Engine
function showToast(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  // Select appropriate icon
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';
  if (type === 'warning') iconName = 'alert-circle';

  toast.innerHTML = `
    <div class="toast-icon-wrapper">
      <i data-lucide="${iconName}"></i>
    </div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;

  container.appendChild(toast);
  lucide.createIcons(); // Render the new icon

  // Slide out and remove after 5 seconds
  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 6000);
}

// Toggle View States: Auth (Login/Signup) vs Dashboard
function toggleView(view) {
  const authCard = document.getElementById('auth-card');
  const dashboardCard = document.getElementById('dashboard-card');

  if (view === 'dashboard') {
    authCard.classList.add('hidden');
    dashboardCard.classList.remove('hidden');
  } else {
    authCard.classList.remove('hidden');
    dashboardCard.classList.add('hidden');
    
    // Reset forms when returning to login
    document.getElementById('login-form').reset();
    document.getElementById('signup-form').reset();
    switchLoginMethod('password');
  }
}

// Toggle Password Field Visibility
function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(`${inputId}-toggle-icon`);
  
  if (input.type === 'password') {
    input.type = 'text';
    icon.setAttribute('data-lucide', 'eye-off');
  } else {
    input.type = 'password';
    icon.setAttribute('data-lucide', 'eye');
  }
  lucide.createIcons();
}

// Switch Auth Page Tabs (Login vs Signup)
function switchAuthTab(tab) {
  activeAuthTab = tab;
  const tabs = document.querySelectorAll('#main-tabs .tab-btn');
  const loginForm = document.getElementById('login-form-container');
  const signupForm = document.getElementById('signup-form-container');
  const title = document.getElementById('auth-title');
  const subtitle = document.getElementById('auth-subtitle');

  tabs.forEach(btn => btn.classList.remove('active'));

  if (tab === 'login') {
    tabs[0].classList.add('active');
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
    title.innerText = 'Welcome Back';
    subtitle.innerText = 'Secure access to your account panel';
  } else {
    tabs[1].classList.add('active');
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
    title.innerText = 'Create Account';
    subtitle.innerText = 'Join us and set up your profile';
  }
}

// Switch Login Types (Password vs OTP)
function switchLoginMethod(method) {
  activeLoginMethod = method;
  const btnPassword = document.getElementById('btn-login-password');
  const btnOtp = document.getElementById('btn-login-otp');
  const passwordGroup = document.getElementById('login-password-group');
  const otpSection = document.getElementById('login-otp-section');
  const submitBtn = document.getElementById('btn-login-submit');

  btnPassword.classList.remove('active');
  btnOtp.classList.remove('active');

  if (method === 'password') {
    btnPassword.classList.add('active');
    passwordGroup.classList.remove('hidden');
    otpSection.classList.add('hidden');
    document.getElementById('login-password').setAttribute('required', 'true');
    submitBtn.querySelector('span').innerText = 'Sign In';
    otpSent = false;
    document.getElementById('otp-input-group').classList.add('hidden');
    document.getElementById('login-otp').removeAttribute('required');
  } else {
    btnOtp.classList.add('active');
    passwordGroup.classList.add('hidden');
    otpSection.classList.remove('hidden');
    document.getElementById('login-password').removeAttribute('required');
    
    if (otpSent) {
      submitBtn.querySelector('span').innerText = 'Verify & Sign In';
    } else {
      submitBtn.querySelector('span').innerText = 'Enter OTP to Sign In';
    }
  }
}

// Check Backend API Connection Health
async function checkApiHealth() {
  const apiStatusEl = document.getElementById('api-status');
  try {
    const res = await fetch(`${API_BASE_URL}/`);
    const data = await res.json();
    if (res.ok) {
      apiStatusEl.innerText = 'Online';
      apiStatusEl.className = 'info-value connected';
      console.log('[Auth Health] Connected to backend successfully.');
    } else {
      throw new Error();
    }
  } catch (err) {
    apiStatusEl.innerText = 'Offline';
    apiStatusEl.className = 'info-value';
    console.error('[Auth Health] Could not connect to API Backend.');
    showToast('Connection Warning', 'Backend API is currently offline. Ensure server.js is running.', 'warning');
  }
}

// Check for existing local session and validate JWT token
async function checkAuthSession() {
  const token = localStorage.getItem('jwt_token');
  if (!token) {
    toggleView('auth');
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await res.json();
    if (res.ok && data.success) {
      setupDashboard(data.user);
      toggleView('dashboard');
    } else {
      // Token expired or invalid
      localStorage.removeItem('jwt_token');
      toggleView('auth');
    }
  } catch (error) {
    console.error('Session validation failed:', error);
    // Offline / Network error: show dashboard offline if token exists for demo convenience
    const cachedUser = localStorage.getItem('cached_user');
    if (cachedUser) {
      setupDashboard(JSON.parse(cachedUser));
      toggleView('dashboard');
    } else {
      toggleView('auth');
    }
  }
}

// Populates and structures the Dashboard elements
function setupDashboard(user) {
  userSession = user;
  
  // Set User Profile Card values
  document.getElementById('user-name').innerText = user.name || 'System User';
  document.getElementById('user-contact').innerText = user.email || user.phone || 'Authenticated User';
  
  // Set Avatar Letter
  const firstLetter = user.name ? user.name.charAt(0).toUpperCase() : 'U';
  document.getElementById('user-avatar').innerText = firstLetter;

  // Cache user data for offline fallback
  localStorage.setItem('cached_user', JSON.stringify(user));
}

// Request OTP Route
async function requestOTP() {
  const identifier = document.getElementById('login-identifier').value.trim();
  const sendBtn = document.getElementById('btn-send-otp');

  if (!identifier) {
    showToast('Input Required', 'Please enter your registered Email or Phone number.', 'warning');
    return;
  }

  try {
    sendBtn.disabled = true;
    sendBtn.querySelector('span').innerText = 'Sending OTP...';

    const res = await fetch(`${API_BASE_URL}/api/otp/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ emailOrPhone: identifier })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      showToast('OTP Sent Successfully', data.message, 'success');
      
      // EXTREMELY HELPFUL DEMO TOAST
      // Displays the OTP code in the UI for rapid testing convenience
      setTimeout(() => {
        showToast('Demo helper: OTP Received', `Your verification code is: ${data.demoOtp}`, 'info');
      }, 800);

      // Transition to OTP Code Submission view
      otpSent = true;
      document.getElementById('otp-input-group').classList.remove('hidden');
      document.getElementById('login-otp').setAttribute('required', 'true');
      document.getElementById('btn-login-submit').querySelector('span').innerText = 'Verify & Sign In';
      
      // Start Countdown for Resend (Basic helper)
      let seconds = 30;
      const originalText = sendBtn.querySelector('span').innerText;
      
      const interval = setInterval(() => {
        seconds--;
        if (seconds > 0) {
          sendBtn.querySelector('span').innerText = `Resend OTP in ${seconds}s`;
        } else {
          clearInterval(interval);
          sendBtn.disabled = false;
          sendBtn.querySelector('span').innerText = 'Resend One-Time Password';
        }
      }, 1000);

    } else {
      showToast('OTP Request Failed', data.message || 'Error generating code.', 'error');
      sendBtn.disabled = false;
      sendBtn.querySelector('span').innerText = 'Send One-Time Password (OTP)';
    }

  } catch (error) {
    console.error('Request OTP network error:', error);
    showToast('Network Connection Error', 'Could not reach server. Verify backend is running.', 'error');
    sendBtn.disabled = false;
    sendBtn.querySelector('span').innerText = 'Send One-Time Password (OTP)';
  }
}

// Handle Form Submission for Login
async function handleLoginSubmit(event) {
  event.preventDefault();
  
  const identifier = document.getElementById('login-identifier').value.trim();
  const password = document.getElementById('login-password').value;
  const otp = document.getElementById('login-otp').value.trim();

  let endpoint = '';
  let payload = {};

  if (activeLoginMethod === 'password') {
    endpoint = '/api/login';
    payload = { emailOrPhone: identifier, password };
  } else {
    // OTP Login
    if (!otpSent) {
      showToast('Action Required', 'Please click "Send One-Time Password" first.', 'warning');
      return;
    }
    if (otp.length !== 6) {
      showToast('Validation Error', 'Please enter a valid 6-digit verification code.', 'warning');
      return;
    }
    endpoint = '/api/otp/verify';
    payload = { emailOrPhone: identifier, otp };
  }

  try {
    const submitBtn = document.getElementById('btn-login-submit');
    submitBtn.disabled = true;
    const origSpanText = submitBtn.querySelector('span').innerText;
    submitBtn.querySelector('span').innerText = 'Authenticating...';

    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    submitBtn.disabled = false;
    submitBtn.querySelector('span').innerText = origSpanText;

    if (res.ok && data.success) {
      showToast('Authentication Success', data.message, 'success');
      
      // Save session credentials
      localStorage.setItem('jwt_token', data.token);
      setupDashboard(data.user);
      
      // Transition Page
      toggleView('dashboard');
    } else {
      showToast('Authentication Failed', data.message || 'Incorrect credentials.', 'error');
    }

  } catch (error) {
    console.error('Login submit network error:', error);
    showToast('Connection Refused', 'Could not establish connection to authentication server.', 'error');
  }
}

// Handle Form Submission for Registration
async function handleSignupSubmit(event) {
  event.preventDefault();

  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const phone = document.getElementById('signup-phone').value.trim();
  const password = document.getElementById('signup-password').value;

  if (!email && !phone) {
    showToast('Validation Error', 'You must fill in either Email Address or Phone Number.', 'warning');
    return;
  }

  const payload = {
    name,
    password
  };

  if (email) payload.email = email;
  if (phone) payload.phone = phone;

  try {
    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.querySelector('span').innerText = 'Creating Profile...';

    const res = await fetch(`${API_BASE_URL}/api/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    submitBtn.disabled = false;
    submitBtn.querySelector('span').innerText = 'Create Account';

    if (res.ok && data.success) {
      showToast('Account Created', 'Your registration is complete! Logging in...', 'success');
      
      // Save session credentials
      localStorage.setItem('jwt_token', data.token);
      setupDashboard(data.user);
      
      // Transition Page
      toggleView('dashboard');
    } else {
      showToast('Registration Refused', data.message || 'Error creating account.', 'error');
    }

  } catch (error) {
    console.error('Signup network error:', error);
    showToast('Server Unreachable', 'Could not connect to database registration system.', 'error');
  }
}

// Handle Logout
function handleLogout() {
  localStorage.removeItem('jwt_token');
  localStorage.removeItem('cached_user');
  userSession = null;
  showToast('Logged Out', 'Your session has been terminated safely.', 'info');
  toggleView('auth');
}
