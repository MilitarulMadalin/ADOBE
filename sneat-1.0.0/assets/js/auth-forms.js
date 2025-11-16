'use strict';

(function (global) {
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

  function getField(form, selector) {
    return form.querySelector(selector);
  }

  function showStatus(target, message, type) {
    if (!target) return;
    target.textContent = message;
    target.classList.remove('d-none', 'alert-danger', 'alert-success');
    target.classList.add(type === 'success' ? 'alert-success' : 'alert-danger');
  }

  function clearStatus(target) {
    if (!target) return;
    target.textContent = '';
    target.classList.add('d-none');
    target.classList.remove('alert-danger', 'alert-success');
  }

  function setButtonLoading(button, isLoading) {
    if (!button) return;
    button.disabled = isLoading;
    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.textContent = 'Please wait...';
    } else if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }

  async function request(path, options) {
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        ...options
      });
    } catch (networkError) {
      throw new Error('Nu putem contacta serverul. Verifică dacă aplicația este pornită.');
    }

    const raw = await response.text();
    let payload = null;
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch (err) {
        payload = null;
      }
    }

    if (!response.ok) {
      const errorMessage = (payload && payload.error) || raw || 'A apărut o eroare. Încearcă din nou.';
      throw new Error(errorMessage.trim() || 'A apărut o eroare. Încearcă din nou.');
    }

    return payload || {};
  }

  function parseName(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function initLoginForm() {
    const form = document.querySelector('#formAuthentication');
    if (!form) return;

    form.setAttribute('novalidate', 'true');
    const emailInput = getField(form, 'input[name="email"]') || getField(form, '#email');
    const passwordInput = getField(form, 'input[name="password"]');
    const rememberInput = getField(form, '#remember-me');
    const submitButton = form.querySelector('button[type="submit"]');
    const statusPlaceholder = document.querySelector('[data-auth-error]');

    form.addEventListener('submit', async event => {
      event.preventDefault();
      clearStatus(statusPlaceholder);

      const email = parseName(emailInput ? emailInput.value : '');
      const password = passwordInput ? passwordInput.value : '';
      if (!email || !password) {
        showStatus(statusPlaceholder, 'Completează emailul și parola.', 'error');
        return;
      }

      try {
        setButtonLoading(submitButton, true);
        await request('/login', {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
            rememberMe: rememberInput ? rememberInput.checked : false
          })
        });
        window.location.href = 'index.html';
      } catch (error) {
        showStatus(statusPlaceholder, error.message, 'error');
      } finally {
        setButtonLoading(submitButton, false);
      }
    });
  }

  function initRegisterForm() {
    const form = document.querySelector('#formAuthentication');
    if (!form) return;

    form.setAttribute('novalidate', 'true');
    const usernameInput = getField(form, '#username');
    const emailInput = getField(form, '#email');
    const passwordInput = getField(form, '#password');
    const termsInput = getField(form, '#terms-conditions');
    const submitButton = form.querySelector('button[type="submit"], button[type="button"]');
    const statusPlaceholder = document.querySelector('[data-auth-error]');

    form.addEventListener('submit', async event => {
      event.preventDefault();
      clearStatus(statusPlaceholder);

      if (termsInput && !termsInput.checked) {
        showStatus(statusPlaceholder, 'Trebuie să accepți termenii și condițiile.', 'error');
        return;
      }

      const email = parseName(emailInput ? emailInput.value : '');
      const password = passwordInput ? passwordInput.value : '';
      if (!email || !password) {
        showStatus(statusPlaceholder, 'Completează emailul și parola (minim 8 caractere).', 'error');
        return;
      }

      if (password.length < 8) {
        showStatus(statusPlaceholder, 'Parola trebuie să aibă cel puțin 8 caractere.', 'error');
        return;
      }

      try {
        setButtonLoading(submitButton, true);
        await request('/register', {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
            username: usernameInput ? parseName(usernameInput.value) : ''
          })
        });
        showStatus(statusPlaceholder, 'Cont creat cu succes. Poți să te autentifici acum.', 'success');
        statusPlaceholder.scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => {
          window.location.href = 'auth-login-basic.html';
        }, 1200);
      } catch (error) {
        showStatus(statusPlaceholder, error.message, 'error');
      } finally {
        setButtonLoading(submitButton, false);
      }
    });
  }

  global.AuthForms = {
    initLoginForm,
    initRegisterForm
  };
})(window);
