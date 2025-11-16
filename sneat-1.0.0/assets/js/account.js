'use strict';

(function () {
  const DEFAULT_AVATAR_URL = '/fonts/unknown.png';
  const MAX_AVATAR_SIZE = 800 * 1024;
  const ALLOWED_AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif']);

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
  const avatarImg = document.getElementById('uploadedAvatar');
  const avatarInput = document.querySelector('.account-file-input');

  let originalAvatarUrl = avatarImg ? avatarImg.getAttribute('src') || DEFAULT_AVATAR_URL : DEFAULT_AVATAR_URL;
  let pendingAvatarDataUrl = null;
  let avatarDirty = false;
  let avatarObjectUrl = null;

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
    username: field('username'),
    phoneNumber: field('phoneNumber'),
    address: field('address'),
    state: field('state'),
    zipCode: field('zipCode'),
    country: field('country'),
    language: field('language'),
    timezone: field('timezone'),
    currency: field('currency')
  };

  const redirectToLogin = () => {
    window.location.href = 'auth-login-basic.html';
  };

  const setAvatarPreview = url => {
    if (!avatarImg) return;
    avatarImg.src = url || DEFAULT_AVATAR_URL;
  };

  const setOriginalAvatar = url => {
    originalAvatarUrl = url || DEFAULT_AVATAR_URL;
    pendingAvatarDataUrl = null;
    avatarDirty = false;
    if (avatarImg) {
      avatarImg.dataset.defaultSrc = originalAvatarUrl;
    }
    setAvatarPreview(originalAvatarUrl);
  };

  const revokeAvatarObjectUrl = () => {
    if (avatarObjectUrl) {
      URL.revokeObjectURL(avatarObjectUrl);
      avatarObjectUrl = null;
    }
  };

  const readFileAsDataUrl = file =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Nu am putut citi fișierul.'));
      reader.readAsDataURL(file);
    });

  document.addEventListener('account-avatar-selected', event => {
    const detail = event && event.detail ? event.detail : {};
    const file = detail.file;
    if (!file) return;

    clearStatus();
    pendingAvatarDataUrl = null;
    avatarDirty = false;

    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      if (avatarInput) {
        avatarInput.value = '';
      }
      revokeAvatarObjectUrl();
      setAvatarPreview(originalAvatarUrl);
      showStatus('Imaginea trebuie să fie PNG, JPG sau GIF.', 'error');
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      if (avatarInput) {
        avatarInput.value = '';
      }
      revokeAvatarObjectUrl();
      setAvatarPreview(originalAvatarUrl);
      showStatus('Imaginea trebuie să fie mai mică de 800 KB.', 'error');
      return;
    }

    revokeAvatarObjectUrl();
    avatarObjectUrl = URL.createObjectURL(file);
    setAvatarPreview(avatarObjectUrl);

    readFileAsDataUrl(file)
      .then(dataUrl => {
        pendingAvatarDataUrl = dataUrl;
        avatarDirty = true;
      })
      .catch(error => {
        pendingAvatarDataUrl = null;
        avatarDirty = false;
        revokeAvatarObjectUrl();
        setAvatarPreview(originalAvatarUrl);
        showStatus(error.message, 'error');
      });
  });

  document.addEventListener('account-avatar-reset', () => {
    clearStatus();
    pendingAvatarDataUrl = null;
    avatarDirty = false;
    revokeAvatarObjectUrl();
    setAvatarPreview(originalAvatarUrl);
    if (avatarInput) {
      avatarInput.value = '';
    }
  });

  const normalize = value => {
    if (typeof value !== 'string') return '';
    return value.trim();
  };

  const populateUser = user => {
    if (!user) return;
    if (inputs.firstName) inputs.firstName.value = user.firstName || '';
    if (inputs.lastName) inputs.lastName.value = user.lastName || '';
    if (inputs.email) inputs.email.value = user.email || '';
    if (inputs.username) inputs.username.value = user.username || '';
    if (inputs.phoneNumber) inputs.phoneNumber.value = user.phoneNumber || '';
    if (inputs.address) inputs.address.value = user.address || '';
    if (inputs.state) inputs.state.value = user.state || '';
    if (inputs.zipCode) inputs.zipCode.value = user.zipCode || '';
    if (inputs.country) inputs.country.value = user.country || '';
    if (inputs.language) inputs.language.value = user.language || '';
    if (inputs.timezone) inputs.timezone.value = user.timezone || '';
    if (inputs.currency) inputs.currency.value = user.currency || '';
    setOriginalAvatar(user.avatarUrl || DEFAULT_AVATAR_URL);
    if (avatarInput) {
      avatarInput.value = '';
    }
  };

  const collectFormValues = () => ({
    firstName: normalize(inputs.firstName ? inputs.firstName.value : ''),
    lastName: normalize(inputs.lastName ? inputs.lastName.value : ''),
    username: normalize(inputs.username ? inputs.username.value : ''),
    phoneNumber: normalize(inputs.phoneNumber ? inputs.phoneNumber.value : ''),
    address: normalize(inputs.address ? inputs.address.value : ''),
    state: normalize(inputs.state ? inputs.state.value : ''),
    zipCode: normalize(inputs.zipCode ? inputs.zipCode.value : ''),
    country: inputs.country ? inputs.country.value : '',
    language: inputs.language ? inputs.language.value : '',
    timezone: inputs.timezone ? inputs.timezone.value : '',
    currency: inputs.currency ? inputs.currency.value : ''
  });

  const fetchSession = async () => {
    try {
      const response = await apiFetch('/me');
      if (!response.ok) throw new Error('unauthorized');
      const user = await response.json();
      populateUser(user);
    } catch (_error) {
      redirectToLogin();
    }
  };

  fetchSession();

  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    clearStatus();

    const values = collectFormValues();
    if (avatarDirty && pendingAvatarDataUrl) {
      values.avatarData = pendingAvatarDataUrl;
    }

    try {
      const response = await apiFetch('/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });

      const payload = await response
        .json()
        .catch(() => ({ error: 'Nu am putut salva datele.' }));

      if (!response.ok) {
        throw new Error(payload && payload.error ? payload.error : 'Nu am putut salva datele.');
      }

      const user = payload && payload.user ? payload.user : null;
      if (user) {
        revokeAvatarObjectUrl();
        populateUser(user);
      }
      showStatus('Datele au fost salvate.', 'success');
    } catch (error) {
      showStatus(error.message || 'Nu am putut salva datele.', 'error');
    }
  });
})();
