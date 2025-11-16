'use strict';

(function () {
  function resolveApiBase() {
    if (typeof window === 'undefined') {
      return '/api';
    }

    if (window.APP_API_BASE) {
      return String(window.APP_API_BASE);
    }

    const { protocol, hostname, port } = window.location;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

    if (protocol === 'file:') {
      return 'http://localhost:3000/api';
    }

    if (isLocal && port !== '3000') {
      return `${protocol}//${hostname}:3000/api`;
    }

    return '/api';
  }

  const API_BASE = resolveApiBase().replace(/\/$/, '');
  const apiFetch = (path, options = {}) => {
    const requestOptions = { credentials: 'include', ...options };
    return fetch(`${API_BASE}${path}`, requestOptions);
  };

  const form = document.getElementById('formAccountSettings');
  const statusBanner = form ? document.createElement('div') : null;

  if (form && statusBanner) {
    statusBanner.className = 'alert d-none';
    statusBanner.setAttribute('role', 'alert');
    form.parentNode.insertBefore(statusBanner, form);
  }

  const field = name => (form ? form.querySelector(`[name="${name}"]`) : null);

  const inputs = {
    firstName: field('firstName'),
    lastName: field('lastName'),
    email: field('email'),
    username: field('username')
  };

  const showStatus = (message, type) => {
    if (!statusBanner) return;
    statusBanner.textContent = message;
    statusBanner.classList.remove('d-none', 'alert-success', 'alert-danger');
    statusBanner.classList.add(type === 'success' ? 'alert-success' : 'alert-danger');
  };

  const clearStatus = () => {
    if (!statusBanner) return;
    statusBanner.textContent = '';
    statusBanner.classList.add('d-none');
    statusBanner.classList.remove('alert-success', 'alert-danger');
  };

  const redirectToLogin = () => {
    window.location.href = 'auth-login-basic.html';
  };

  async function fetchSession() {
    try {
      const response = await apiFetch('/me');
      if (!response.ok) throw new Error('unauthorized');
      return response.json();
    } catch (error) {
      redirectToLogin();
      return null;
    }
  }

  function populateUser(user) {
    if (inputs.firstName) inputs.firstName.value = user.firstName || '';
    if (inputs.lastName) inputs.lastName.value = user.lastName || '';
    if (inputs.email) inputs.email.value = user.email || '';
    if (inputs.username) inputs.username.value = user.username || '';
  }

  function collectFormValues() {
    return {
      firstName: inputs.firstName ? inputs.firstName.value.trim() : '',
      lastName: inputs.lastName ? inputs.lastName.value.trim() : '',
      username: inputs.username ? inputs.username.value.trim() : ''
    };
  }

  fetchSession().then(user => {
    if (!user) return;
    populateUser(user);
  });

  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    clearStatus();

    const values = collectFormValues();

    try {
      const response = await apiFetch('/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Nu am putut salva datele.' }));
        throw new Error(payload.error || 'Nu am putut salva datele.');
      }
      showStatus('Datele au fost salvate.', 'success');
    } catch (error) {
      showStatus(error.message, 'error');
    }
  });
})();
