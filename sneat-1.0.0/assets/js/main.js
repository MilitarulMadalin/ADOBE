/**
 * Main
 */

'use strict';

let menu, animate;

(function () {
  const resolveApiBase = () => {
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
  };

  const API_BASE = resolveApiBase().replace(/\/$/, '');
  const apiFetch = (path, options = {}) => {
    const requestOptions = { credentials: 'include', ...options };
    return fetch(`${API_BASE}${path}`, requestOptions);
  };

  const escapeHtml = value => {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const applyInlineMarkdown = text => {
    let output = escapeHtml(text);
    output = output.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    output = output.replace(/\*(.+?)\*/g, '<em>$1</em>');
    return output;
  };

  const renderMarkdownToHtml = markdown => {
    if (!markdown) {
      return '';
    }

    const lines = String(markdown).split(/\r?\n/);
    const htmlChunks = [];
    let paragraphBuffer = [];
    let listBuffer = null;
    let tableBuffer = null;

    const flushParagraph = () => {
      if (!paragraphBuffer.length) return;
      const paragraphText = paragraphBuffer.join(' ');
      htmlChunks.push(`<p>${applyInlineMarkdown(paragraphText)}</p>`);
      paragraphBuffer = [];
    };

    const flushList = () => {
      if (!listBuffer) return;
      if (listBuffer.type === 'ol') {
        const startAttr = listBuffer.start > 1 ? ` start="${listBuffer.start}"` : '';
        htmlChunks.push(`<ol${startAttr}>`);
        listBuffer.items.forEach(item => {
          htmlChunks.push(`<li>${item}</li>`);
        });
        htmlChunks.push('</ol>');
      } else {
        htmlChunks.push('<ul>');
        listBuffer.items.forEach(item => {
          htmlChunks.push(`<li>${item}</li>`);
        });
        htmlChunks.push('</ul>');
      }
      listBuffer = null;
    };

    const isTableSeparatorRow = cells =>
      cells.every(cell => /^:?-{3,}:?$/u.test(cell.replace(/\s+/g, '')));

    const parseAlignment = token => {
      const trimmed = token.trim();
      const startsWithColon = trimmed.startsWith(':');
      const endsWithColon = trimmed.endsWith(':');
      if (startsWithColon && endsWithColon) return 'center';
      if (endsWithColon) return 'right';
      if (startsWithColon) return 'left';
      return '';
    };

    const parseTableCells = line =>
      line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(cell => cell.trim());

    const normaliseRowLength = row => {
      if (!tableBuffer || !tableBuffer.header) return row;
      const targetLength = tableBuffer.header.length;
      if (row.length === targetLength) return row;
      if (row.length < targetLength) {
        return row.concat(Array.from({ length: targetLength - row.length }, () => ''));
      }
      return row.slice(0, targetLength);
    };

    const flushTable = () => {
      if (!tableBuffer) return;
      const { header, align, rows } = tableBuffer;
      const alignments = (align || []).slice(0, header.length);
      while (alignments.length < header.length) {
        alignments.push('');
      }

      htmlChunks.push('<div class="markdown-table-wrapper"><table class="markdown-table">');
      if (header.length) {
        htmlChunks.push('<thead><tr>');
        header.forEach((cell, index) => {
          const alignAttr = alignments[index] ? ` style="text-align:${alignments[index]}"` : '';
          htmlChunks.push(`<th${alignAttr}>${applyInlineMarkdown(cell)}</th>`);
        });
        htmlChunks.push('</tr></thead>');
      }

      if (rows.length) {
        htmlChunks.push('<tbody>');
        rows.forEach(row => {
          htmlChunks.push('<tr>');
          row.forEach((cell, index) => {
            const alignAttr = alignments[index] ? ` style="text-align:${alignments[index]}"` : '';
            htmlChunks.push(`<td${alignAttr}>${applyInlineMarkdown(cell)}</td>`);
          });
          htmlChunks.push('</tr>');
        });
        htmlChunks.push('</tbody>');
      }

      htmlChunks.push('</table></div>');
      tableBuffer = null;
    };

    lines.forEach(line => {
      const trimmed = line.trim();

      if (!trimmed) {
        flushParagraph();
        flushList();
        flushTable();
        return;
      }

      const isTableRow = /^\|.*\|$/u.test(trimmed);
      if (isTableRow) {
        const cells = parseTableCells(trimmed);
        if (!tableBuffer) {
          flushParagraph();
          flushList();
          tableBuffer = { header: cells, align: null, rows: [], awaitingSeparator: true };
          return;
        }

        if (tableBuffer.awaitingSeparator && isTableSeparatorRow(cells)) {
          tableBuffer.align = cells.map(parseAlignment);
          tableBuffer.awaitingSeparator = false;
          return;
        }

        if (tableBuffer.awaitingSeparator) {
          tableBuffer.rows.push(normaliseRowLength(cells));
          tableBuffer.awaitingSeparator = false;
          return;
        }

        tableBuffer.rows.push(normaliseRowLength(cells));
        return;
      }

      if (tableBuffer) {
        flushTable();
      }

      const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
      if (headingMatch) {
        flushParagraph();
        flushList();
        flushTable();
        const level = Math.min(headingMatch[1].length, 3);
        htmlChunks.push(`<h${level}>${applyInlineMarkdown(headingMatch[2])}</h${level}>`);
        return;
      }

      const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (orderedMatch) {
        flushParagraph();
        const itemHtml = applyInlineMarkdown(orderedMatch[2]);
        const startValue = Number(orderedMatch[1]);
        if (!listBuffer || listBuffer.type !== 'ol') {
          flushList();
          listBuffer = { type: 'ol', start: startValue, items: [] };
        } else if (!listBuffer.items.length) {
          listBuffer.start = startValue;
        }
        listBuffer.items.push(itemHtml);
        return;
      }

      const unorderedMatch = trimmed.match(/^[-*]\s+(.*)$/);
      if (unorderedMatch) {
        flushParagraph();
        const itemHtml = applyInlineMarkdown(unorderedMatch[1]);
        if (!listBuffer || listBuffer.type !== 'ul') {
          flushList();
          listBuffer = { type: 'ul', start: 1, items: [] };
        }
        listBuffer.items.push(itemHtml);
        return;
      }

      paragraphBuffer.push(trimmed);
    });

    flushParagraph();
    flushList();
    flushTable();

    return htmlChunks.join('');
  };

  const allowedTopLevelItems = new Set(['Dashboard', 'Chats', 'Account Settings', 'Authentications']);
  const allowedHeaders = new Set(['Pages']);

  const pruneSidebarMenus = root => {
    const list = root.querySelector('.menu-inner');
    if (!list) return;
    Array.from(list.children).forEach(item => {
      if (item.classList.contains('menu-header')) {
        const headerText = item.querySelector('.menu-header-text');
        if (!headerText || !allowedHeaders.has(headerText.textContent.trim())) {
          item.remove();
        }
        return;
      }
      const labelEl = item.querySelector('a.menu-link div[data-i18n]');
      const label = labelEl && labelEl.closest('li.menu-item') === item ? labelEl.textContent.trim() : '';
      if (!allowedTopLevelItems.has(label)) {
        item.remove();
      }
    });
  };

  const layoutMenuEl = document.querySelectorAll('#layout-menu');
  layoutMenuEl.forEach(pruneSidebarMenus);

  const assetsPathAttr = document.documentElement.getAttribute('data-assets-path');
  const assetsPath = assetsPathAttr || '../assets/';
  const fontsPath = assetsPath.replace(/assets\/?$/, '') + 'fonts/';
  const projectLogoFile = 'project logo.png';
  const projectLogoHref = fontsPath + encodeURIComponent(projectLogoFile);
  const menuIconMap = {
    Chats: 'chats.png',
    Account: 'user-account-icon.png',
    Notifications: 'notification-icon.png',
    Connections: 'connections.png'
  };

  const brandTextEls = document.querySelectorAll('.app-brand-text');
  brandTextEls.forEach(el => {
    el.textContent = 'STYLX';
  });

  const brandLogoEls = document.querySelectorAll('.app-brand-logo');
  brandLogoEls.forEach(el => {
    el.innerHTML = '';
    const logoImg = document.createElement('img');
    logoImg.src = projectLogoHref;
    logoImg.alt = 'STYLX logo';
    logoImg.className = 'app-brand-logo-img';
    logoImg.style.maxWidth = '100%';
    logoImg.style.height = 'auto';
    el.appendChild(logoImg);
  });

    const menuLabelEls = document.querySelectorAll('.menu-inner .menu-sub .menu-link div[data-i18n]');
    menuLabelEls.forEach(labelEl => {
      const key = labelEl.getAttribute('data-i18n') || labelEl.textContent.trim();
      const iconFile = menuIconMap[key];
      if (!iconFile || labelEl.querySelector('.menu-custom-icon')) {
        return;
      }
      const icon = document.createElement('img');
      icon.src = fontsPath + encodeURIComponent(iconFile);
      icon.alt = `${key} icon`;
      icon.className = 'menu-custom-icon';
      labelEl.classList.add('with-custom-icon');
      const parentLink = labelEl.closest('.menu-link');
      if (parentLink) {
        parentLink.classList.add('has-custom-icon');
      }
      labelEl.insertBefore(icon, labelEl.firstChild);
    });

    const accountTabs = document.querySelectorAll('.nav.nav-pills.flex-column.flex-md-row.mb-3, .nav.nav-pills.account-settings-tabs');
      const topLevelLabels = document.querySelectorAll('.menu-inner > .menu-item > .menu-link > div[data-i18n]');
      topLevelLabels.forEach(labelEl => {
        const key = labelEl.getAttribute('data-i18n') || labelEl.textContent.trim();
        if (key !== 'Chats') return;
        const iconFile = menuIconMap[key];
        if (!iconFile) return;
        const iconContainer = labelEl.previousElementSibling;
        if (!iconContainer || iconContainer.querySelector('.menu-custom-icon')) {
          return;
        }
        iconContainer.classList.add('menu-icon-with-image');
        iconContainer.innerHTML = '';
        const icon = document.createElement('img');
        icon.src = fontsPath + encodeURIComponent(iconFile);
        icon.alt = `${key} icon`;
        icon.className = 'menu-custom-icon menu-custom-icon-top';
        iconContainer.appendChild(icon);
      });

    accountTabs.forEach(tabList => {
      tabList.classList.add('account-settings-tabs');
      tabList.querySelectorAll('.nav-link').forEach(link => {
        const existingLabel = link.querySelector('.menu-custom-icon + span, span.account-tab-label');
        const textNode = existingLabel ? existingLabel.textContent.trim() : link.textContent.trim();
        const key = textNode.replace(/\s+.*/, '');
        const iconFile = menuIconMap[key];
        if (!iconFile || link.querySelector('.menu-custom-icon')) {
          return;
        }
        const icon = document.createElement('img');
        icon.src = fontsPath + encodeURIComponent(iconFile);
        icon.alt = `${key} icon`;
        icon.className = 'menu-custom-icon';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'account-tab-label';
        labelSpan.textContent = textNode;
        link.textContent = '';
        link.appendChild(icon);
        link.appendChild(labelSpan);
      });
    });

  const faviconEl = document.querySelector('link[rel="icon"]');
  if (faviconEl) {
    faviconEl.setAttribute('href', projectLogoHref);
    faviconEl.setAttribute('type', 'image/png');
  }

  const githubButton = document.querySelector('.navbar-nav .github-button');
  if (githubButton) {
    const githubItem = githubButton.closest('li');
    if (githubItem) githubItem.remove();
  }

  const profileDropdown = document.querySelector('.dropdown-user .dropdown-menu');
  if (profileDropdown) {
    profileDropdown.innerHTML = [
      '<li class="px-3 py-2">',
      '  <div class="d-flex align-items-center">',
      '    <div class="flex-shrink-0 me-3">',
      '      <div class="avatar avatar-online">',
      '        <img src="" alt class="w-px-40 h-auto rounded-circle dropdown-user-avatar" />',
      '      </div>',
      '    </div>',
      '    <div class="flex-grow-1">',
      '      <span class="fw-semibold d-block dropdown-user-name"></span>',
      '      <small class="text-muted dropdown-user-email"></small>',
      '    </div>',
      '  </div>',
      '</li>',
      '<li><div class="dropdown-divider"></div></li>',
      '<li>',
      '  <a class="dropdown-item" data-role="profile" href="pages-account-settings-account.html">',
      '    <span class="align-middle">My Profile</span>',
      '  </a>',
      '</li>',
      '<li>',
      '  <a class="dropdown-item" data-role="settings" href="pages-account-settings-account.html#formAccountSettings">',
      '    <span class="align-middle">Settings</span>',
      '  </a>',
      '</li>',
      '<li><div class="dropdown-divider"></div></li>',
      '<li>',
      '  <button type="button" class="dropdown-item" data-action="logout">',
      '    <span class="align-middle">Log Out</span>',
      '  </button>',
      '</li>'
    ].join('\n');
  }

  const applyProfileMenuIcons = () => {
    if (!profileDropdown) return;
    const profileIconMap = {
      profile: 'user-account-icon.png',
      settings: 'settings.png'
    };

    profileDropdown.querySelectorAll('[data-role]').forEach(link => {
      const role = link.getAttribute('data-role');
      const iconFile = role && profileIconMap[role];
      if (!iconFile || link.querySelector('.profile-menu-icon')) {
        return;
      }
      const label = link.querySelector('.align-middle') || link;
      const icon = document.createElement('img');
      icon.src = fontsPath + encodeURIComponent(iconFile);
      icon.alt = `${label.textContent.trim()} icon`;
      icon.className = 'menu-custom-icon profile-menu-icon';
      link.insertBefore(icon, label);
    });

    const logoutButton = profileDropdown.querySelector('[data-action="logout"]');
    if (logoutButton && !logoutButton.querySelector('.profile-menu-icon')) {
      const label = logoutButton.querySelector('.align-middle') || logoutButton;
      const icon = document.createElement('img');
      icon.src = fontsPath + encodeURIComponent('logout.png');
      icon.alt = 'Log Out icon';
      icon.className = 'menu-custom-icon profile-menu-icon';
      logoutButton.insertBefore(icon, label);
    }
  };

  applyProfileMenuIcons();

  const navUserContainer = document.querySelector('.dropdown-user');
  if (navUserContainer) {
    const anchorAvatar = navUserContainer.querySelector(':scope > a img');
    if (anchorAvatar) anchorAvatar.classList.add('dropdown-user-avatar');
  }

  const navList = document.querySelector('.navbar-nav.flex-row.align-items-center.ms-auto');
  const defaultAvatar = '/fonts/unknown.png';
  const dashboardUserTargets = document.querySelectorAll('[data-role="dashboard-user"]');

  const setDashboardUserName = name => {
    dashboardUserTargets.forEach(target => {
      if (name) {
        target.textContent = name;
      } else {
        const fallback = target.getAttribute('data-guest-text') || '';
        target.textContent = fallback;
      }
    });
  };

  const ensureGuestLink = () => {
    if (!navList) return null;
    let guestItem = navList.querySelector('.guest-login');
    if (!guestItem) {
      guestItem = document.createElement('li');
      guestItem.className = 'nav-item guest-login';
      const link = document.createElement('a');
      link.className = 'nav-link';
      link.href = 'auth-login-basic.html';
      link.textContent = 'Log In';
      guestItem.appendChild(link);
      navList.appendChild(guestItem);
    }
    return guestItem;
  };

  const updateAvatar = src => {
    if (!navUserContainer) return;
    const avatars = navUserContainer.querySelectorAll('.dropdown-user-avatar');
    avatars.forEach(img => {
      img.setAttribute('src', src);
    });
  };

  const showGuest = () => {
    const guestItem = ensureGuestLink();
    if (guestItem) guestItem.classList.add('is-visible');
    if (navUserContainer) {
      navUserContainer.classList.remove('is-authenticated');
      const nameEl = navUserContainer.querySelector('.dropdown-user-name');
      const emailEl = navUserContainer.querySelector('.dropdown-user-email');
      if (nameEl) nameEl.textContent = '';
      if (emailEl) emailEl.textContent = '';
      updateAvatar(defaultAvatar);
    }
    setDashboardUserName(null);
  };

  const showUser = user => {
    if (!navUserContainer) return;
    const guestItem = ensureGuestLink();
    if (guestItem) guestItem.classList.remove('is-visible');

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    const displayName = fullName || user.username || user.email;

    const nameEl = navUserContainer.querySelector('.dropdown-user-name');
    const emailEl = navUserContainer.querySelector('.dropdown-user-email');
    if (nameEl) nameEl.textContent = displayName;
    if (emailEl) emailEl.textContent = user.email;

    const resolvedAvatar = user.avatarUrl ? String(user.avatarUrl) : defaultAvatar;
    updateAvatar(resolvedAvatar);
    navUserContainer.classList.add('is-authenticated');
    setDashboardUserName(displayName);
  };

  const syncAuthState = async () => {
    if (!profileDropdown || !navUserContainer) {
      return;
    }
    try {
      const response = await apiFetch('/me');
      if (!response.ok) {
        throw new Error('unauthorized');
      }
      const user = await response.json();
      showUser(user);
    } catch (error) {
      showGuest();
    }
  };

  showGuest();
  setDashboardUserName(null);
  syncAuthState();

  const chatWindowEl = document.querySelector('[data-role="chat-window"]');
  const chatFormEl = document.querySelector('[data-role="chat-form"]');
  const chatInputEl = document.querySelector('[data-role="chat-input"]');

  const statsContainer = document.querySelector('[data-role="stats-content"]');

  if (statsContainer) {
    const showStatsMessage = message => {
      statsContainer.innerHTML = `<p>${escapeHtml(message)}</p>`;
    };

    const loadStats = async () => {
      try {
        const response = await apiFetch('/stats');
        if (!response.ok) {
          throw new Error('response_error');
        }
        const markdown = await response.text();
        const rendered = renderMarkdownToHtml(markdown) || '<p>Datele nu sunt disponibile.</p>';
        statsContainer.innerHTML = rendered;
      } catch (error) {
        showStatsMessage('Nu am putut încărca statisticile. Încearcă din nou mai târziu.');
      }
    };

    showStatsMessage('Se încarcă statisticile...');
    loadStats();
  }

  const appendChatMessage = (text, variant = 'server') => {
    if (!chatWindowEl || !text) return;
    const allowedVariants = new Set(['client', 'server', 'system']);
    const bubble = document.createElement('div');
    const resolvedVariant = allowedVariants.has(variant) ? variant : 'server';
    bubble.className = `chat-message chat-message--${resolvedVariant}`;
    bubble.textContent = text;
    chatWindowEl.appendChild(bubble);
    chatWindowEl.scrollTop = chatWindowEl.scrollHeight;
  };

  const postChatMessageToServer = async message => {
    const response = await apiFetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    if (!response.ok) {
      throw new Error('failed');
    }
    const data = await response.json();
    if (data && data.message) {
      appendChatMessage(data.message, 'server');
    }
  };

  const initializeChat = async () => {
    if (!chatWindowEl) return;
    let initialLoaded = false;
    try {
      const response = await apiFetch('/chat');
      if (response.ok) {
        const payload = await response.json();
        if (payload && payload.message) {
          appendChatMessage(payload.message, 'server');
          initialLoaded = true;
        }
      }
    } catch (error) {
      // ignore; system message below will inform the user
    }

    if (!initialLoaded) {
      appendChatMessage('Nu am putut obține mesajul inițial de la server.', 'system');
    }
  };

  if (chatWindowEl) {
    initializeChat();
  }

  if (chatFormEl && chatInputEl) {
    chatFormEl.addEventListener('submit', async event => {
      event.preventDefault();
      const message = chatInputEl.value.trim();
      if (!message) return;
      appendChatMessage(message, 'client');
      chatInputEl.value = '';
      try {
        await postChatMessageToServer(message);
      } catch (error) {
        appendChatMessage('A apărut o eroare la trimiterea mesajului.', 'system');
      }
      chatInputEl.focus();
    });
  }

  document.addEventListener('click', event => {
    const target = event.target;
    if (!target) return;
    const actionButton = target.closest('[data-action="logout"]');
    if (!actionButton) return;
    event.preventDefault();
    apiFetch('/logout', { method: 'POST' })
      .catch(() => {})
      .finally(() => {
        showGuest();
        window.location.href = 'auth-login-basic.html';
      });
  });

  // Initialize menu
  //-----------------
  layoutMenuEl.forEach(function (element) {
    menu = new Menu(element, {
      orientation: 'vertical',
      closeChildren: false
    });
    // Change parameter to true if you want scroll animation
    window.Helpers.scrollToActive((animate = false));
    window.Helpers.mainMenu = menu;
  });

  // Initialize menu togglers and bind click on each
  let menuToggler = document.querySelectorAll('.layout-menu-toggle');
  menuToggler.forEach(item => {
    item.addEventListener('click', event => {
      event.preventDefault();
      window.Helpers.toggleCollapsed();
    });
  });

  // Display menu toggle (layout-menu-toggle) on hover with delay
  let delay = function (elem, callback) {
    let timeout = null;
    elem.onmouseenter = function () {
      // Set timeout to be a timer which will invoke callback after 300ms (not for small screen)
      if (!Helpers.isSmallScreen()) {
        timeout = setTimeout(callback, 300);
      } else {
        timeout = setTimeout(callback, 0);
      }
    };

    elem.onmouseleave = function () {
      // Clear any timers set to timeout
      document.querySelector('.layout-menu-toggle').classList.remove('d-block');
      clearTimeout(timeout);
    };
  };
  if (document.getElementById('layout-menu')) {
    delay(document.getElementById('layout-menu'), function () {
      // not for small screen
      if (!Helpers.isSmallScreen()) {
        document.querySelector('.layout-menu-toggle').classList.add('d-block');
      }
    });
  }

  // Display in main menu when menu scrolls
  let menuInnerContainer = document.getElementsByClassName('menu-inner'),
    menuInnerShadow = document.getElementsByClassName('menu-inner-shadow')[0];
  if (menuInnerContainer.length > 0 && menuInnerShadow) {
    menuInnerContainer[0].addEventListener('ps-scroll-y', function () {
      if (this.querySelector('.ps__thumb-y').offsetTop) {
        menuInnerShadow.style.display = 'block';
      } else {
        menuInnerShadow.style.display = 'none';
      }
    });
  }

  // Init helpers & misc
  // --------------------

  // Init BS Tooltip
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });

  // Accordion active class
  const accordionActiveFunction = function (e) {
    if (e.type == 'show.bs.collapse' || e.type == 'show.bs.collapse') {
      e.target.closest('.accordion-item').classList.add('active');
    } else {
      e.target.closest('.accordion-item').classList.remove('active');
    }
  };

  const accordionTriggerList = [].slice.call(document.querySelectorAll('.accordion'));
  const accordionList = accordionTriggerList.map(function (accordionTriggerEl) {
    accordionTriggerEl.addEventListener('show.bs.collapse', accordionActiveFunction);
    accordionTriggerEl.addEventListener('hide.bs.collapse', accordionActiveFunction);
  });

  // Auto update layout based on screen size
  window.Helpers.setAutoUpdate(true);

  // Toggle Password Visibility
  window.Helpers.initPasswordToggle();

  // Speech To Text
  window.Helpers.initSpeechToText();

  // Manage menu expanded/collapsed with templateCustomizer & local storage
  //------------------------------------------------------------------

  // If current layout is horizontal OR current window screen is small (overlay menu) than return from here
  if (window.Helpers.isSmallScreen()) {
    return;
  }

  // If current layout is vertical and current window screen is > small

  // Auto update menu collapsed/expanded based on the themeConfig
  window.Helpers.setCollapsed(true, false);
})();
