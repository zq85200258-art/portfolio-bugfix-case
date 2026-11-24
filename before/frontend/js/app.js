(() => {
  'use strict';

  const DEMO_CREDENTIALS = Object.freeze({
    email: 'ava@northwind.example',
    password: 'demo-password-only',
  });

  const DEFAULT_CROSS_ORIGIN_EXAMPLE = 'http://127.0.0.1:8000';

  const state = {
    apiBase: '',
    user: null,
    projects: [],
    isSubmittingLogin: false,
    isLoadingProjects: false,
    isSigningOut: false,
  };

  const els = {
    // Header
    headerApiDot: document.getElementById('header-api-dot'),
    headerApiLabel: document.getElementById('header-api-label'),

    // Auth view
    authView: document.getElementById('auth-view'),
    loginForm: document.getElementById('login-form'),
    emailInput: document.getElementById('email-input'),
    passwordInput: document.getElementById('password-input'),
    togglePasswordBtn: document.getElementById('toggle-password-btn'),
    fillDemoBtn: document.getElementById('fill-demo-btn'),
    loginSubmitBtn: document.getElementById('login-submit-btn'),
    loginSpinner: document.getElementById('login-spinner'),
    loginBtnLabel: document.getElementById('login-btn-label'),
    authNotice: document.getElementById('auth-notice'),
    authNoticeTitle: document.getElementById('auth-notice-title'),
    authNoticeBody: document.getElementById('auth-notice-body'),
    authNoticeTrace: document.getElementById('auth-notice-trace'),
    authNoticeHint: document.getElementById('auth-notice-hint'),

    // Portal view
    portalView: document.getElementById('portal-view'),
    portalHeading: document.getElementById('portal-heading'),
    portalStudio: document.getElementById('portal-studio'),
    portalEmail: document.getElementById('portal-email'),
    refreshProjectsBtn: document.getElementById('refresh-projects-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    portalNotice: document.getElementById('portal-notice'),
    portalNoticeTitle: document.getElementById('portal-notice-title'),
    portalNoticeBody: document.getElementById('portal-notice-body'),
    portalNoticeTrace: document.getElementById('portal-notice-trace'),
    portalNoticeHint: document.getElementById('portal-notice-hint'),
    projectsSummary: document.getElementById('projects-summary'),
    projectsLoading: document.getElementById('projects-loading'),
    projectsList: document.getElementById('projects-list'),
    projectsEmpty: document.getElementById('projects-empty'),
    emptyRefreshBtn: document.getElementById('empty-refresh-btn'),

    // Footer API settings bar
    apiBaseForm: document.getElementById('api-base-form'),
    apiBaseInput: document.getElementById('api-base-input'),
    apiActiveDisplay: document.getElementById('api-active-display'),
    apiHealthChip: document.getElementById('api-health-chip'),
    apiHealthDot: document.getElementById('api-health-dot'),
    apiHealthText: document.getElementById('api-health-text'),
    apiSameOriginBtn: document.getElementById('api-same-origin-btn'),
    apiHealthBtn: document.getElementById('api-health-btn'),
    apiBarFeedback: document.getElementById('api-bar-feedback'),
  };

  /* ------------------------------------------------------------------------
     API Base URL Resolution & Helpers
     ------------------------------------------------------------------------ */

  function normalizeApiBase(rawValue) {
    const trimmed = String(rawValue || '').trim();
    if (!trimmed) {
      return { ok: true, value: '' };
    }

    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch {
      return {
        ok: false,
        error: 'Enter a full http:// or https:// URL (for example http://127.0.0.1:8000), or leave empty for same-origin.',
      };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        ok: false,
        error: 'API base URL must start with http:// or https://.',
      };
    }

    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    return {
      ok: true,
      value: `${parsed.origin}${cleanPath}`,
    };
  }

  function resolveInitialApiBase() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('api')) {
      const fromQuery = normalizeApiBase(params.get('api'));
      if (fromQuery.ok) {
        return { base: fromQuery.value, source: 'query' };
      }
    }

    if (typeof window.LUMENDESK_API === 'string' && window.LUMENDESK_API.trim() !== '') {
      const fromGlobal = normalizeApiBase(window.LUMENDESK_API);
      if (fromGlobal.ok) {
        return { base: fromGlobal.value, source: 'global' };
      }
    }

    return { base: '', source: 'default' };
  }

  function isCrossOriginTarget(base) {
    if (!base) {
      return false;
    }
    try {
      return new URL(base, window.location.href).origin !== window.location.origin;
    } catch {
      return true;
    }
  }

  function buildEndpointUrl(path) {
    return state.apiBase ? `${state.apiBase}${path}` : path;
  }

  function formatCurrentOrigin() {
    return window.location.origin && window.location.origin !== 'null'
      ? window.location.origin
      : 'local file';
  }

  /* ------------------------------------------------------------------------
     Unified Fetch Client (always credentials: 'include' + JSON Content-Type)
     ------------------------------------------------------------------------ */

  function extractDetail(data, rawText, status, statusText) {
    if (data && typeof data === 'object') {
      if (typeof data.detail === 'string' && data.detail.trim()) {
        return data.detail.trim();
      }
      if (Array.isArray(data.detail) && data.detail.length > 0) {
        const first = data.detail[0];
        if (first && typeof first.msg === 'string') {
          return first.msg;
        }
      }
      if (typeof data.message === 'string' && data.message.trim()) {
        return data.message.trim();
      }
    }

    if (rawText && rawText.trim().length > 0 && rawText.trim().length < 180) {
      return rawText.trim();
    }

    return statusText || `HTTP ${status}`;
  }

  async function apiRequest(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const url = buildEndpointUrl(path);
    const crossOrigin = isCrossOriginTarget(state.apiBase);

    const fetchOptions = {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (options.body !== undefined) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    let response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (err) {
      return {
        ok: false,
        networkError: true,
        crossOrigin,
        method,
        path,
        url,
        status: 0,
        statusText: '',
        data: null,
        rawText: '',
        parseError: false,
        detail: err instanceof Error && err.message ? err.message : 'Network request failed',
      };
    }

    const rawText = await response.text();
    let data = null;
    let parseError = false;

    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        parseError = true;
      }
    }

    return {
      ok: response.ok,
      networkError: false,
      crossOrigin,
      method,
      path,
      url,
      status: response.status,
      statusText: response.statusText,
      data,
      rawText,
      parseError,
      detail: extractDetail(data, rawText, response.status, response.statusText),
    };
  }

  /* ------------------------------------------------------------------------
     Notice / Diagnostic Rendering
     ------------------------------------------------------------------------ */

  function showNotice(target, { variant = 'error', title, body, trace = [], hint = '' }) {
    const map = target === 'portal'
      ? {
          box: els.portalNotice,
          titleEl: els.portalNoticeTitle,
          bodyEl: els.portalNoticeBody,
          traceEl: els.portalNoticeTrace,
          hintEl: els.portalNoticeHint,
        }
      : {
          box: els.authNotice,
          titleEl: els.authNoticeTitle,
          bodyEl: els.authNoticeBody,
          traceEl: els.authNoticeTrace,
          hintEl: els.authNoticeHint,
        };

    map.box.className = `notice notice--${variant}`;
    map.titleEl.textContent = title;
    map.bodyEl.textContent = body;

    map.traceEl.textContent = '';
    if (trace.length > 0) {
      trace.forEach((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        map.traceEl.appendChild(li);
      });
      map.traceEl.hidden = false;
    } else {
      map.traceEl.hidden = true;
    }

    if (hint) {
      map.hintEl.textContent = hint;
      map.hintEl.hidden = false;
    } else {
      map.hintEl.textContent = '';
      map.hintEl.hidden = true;
    }

    map.box.hidden = false;
  }

  function clearNotice(target) {
    const box = target === 'portal' ? els.portalNotice : els.authNotice;
    box.hidden = true;
  }

  function buildNetworkErrorNotice(res, contextLabel) {
    if (res.crossOrigin) {
      return {
        variant: 'error',
        title: `${contextLabel}: cross-origin request blocked or unreachable`,
        body: `${res.method} ${res.url} failed before the browser could read a response (${res.detail}). When calling a different origin from ${formatCurrentOrigin()} with credentials and JSON headers, this usually means a CORS preflight or origin check was rejected, or the API server is offline.`,
        trace: [`${res.method} ${res.url} -> Blocked / Network error (${res.detail})`],
        hint: 'Inspect the browser DevTools Network tab for the OPTIONS preflight response and Access-Control-Allow-* headers.',
      };
    }

    return {
      variant: 'error',
      title: `${contextLabel}: unable to reach the API`,
      body: `${res.method} ${res.url} failed (${res.detail}). Verify that the LumenDesk API server is running and reachable at this address.`,
      trace: [`${res.method} ${res.url} -> Network error (${res.detail})`],
      hint: 'Use “Check health” in the API Base URL bar below to test /api/health.',
    };
  }

  /* ------------------------------------------------------------------------
     View Switching & Header / API Bar Rendering
     ------------------------------------------------------------------------ */

  function updateApiIndicators() {
    const crossOrigin = isCrossOriginTarget(state.apiBase);

    if (!state.apiBase) {
      els.headerApiLabel.textContent = 'API: same-origin';
      els.headerApiDot.className = 'status-dot status-dot--ok';
      els.apiActiveDisplay.textContent = `Active: same-origin (${formatCurrentOrigin()})`;
    } else {
      els.headerApiLabel.textContent = crossOrigin
        ? `API: ${state.apiBase} (cross-origin)`
        : `API: ${state.apiBase}`;
      els.headerApiDot.className = crossOrigin
        ? 'status-dot status-dot--cross'
        : 'status-dot status-dot--ok';
      els.apiActiveDisplay.textContent = crossOrigin
        ? `Active: ${state.apiBase} (cross-origin)`
        : `Active: ${state.apiBase} (same-origin)`;
    }
  }

  function setHealthStatus(statusKind, text, feedbackMessage, feedbackKind = '') {
    els.apiHealthText.textContent = text;

    els.apiHealthChip.className = 'health-chip';
    if (statusKind === 'ok') {
      els.apiHealthChip.classList.add('health-chip--ok');
      els.apiHealthDot.className = 'status-dot status-dot--ok';
    } else if (statusKind === 'error') {
      els.apiHealthChip.classList.add('health-chip--error');
      els.apiHealthDot.className = 'status-dot status-dot--error';
      els.headerApiDot.className = 'status-dot status-dot--error';
    } else {
      els.apiHealthDot.className = 'status-dot';
    }

    if (feedbackMessage !== undefined) {
      els.apiBarFeedback.textContent = feedbackMessage;
      els.apiBarFeedback.className = 'api-bar-feedback';
      if (feedbackKind === 'error') {
        els.apiBarFeedback.classList.add('api-bar-feedback--error');
      } else if (feedbackKind === 'ok') {
        els.apiBarFeedback.classList.add('api-bar-feedback--ok');
      }
    }
  }

  function showAuthView() {
    state.user = null;
    state.projects = [];
    els.portalView.hidden = true;
    els.authView.hidden = false;
    clearNotice('portal');
  }

  function showPortalView(user) {
    state.user = user;
    els.portalHeading.textContent = user && user.name
      ? `Welcome back, ${user.name}`
      : 'Welcome back';
    els.portalStudio.textContent = (user && user.studio) || 'Client Studio';
    els.portalEmail.textContent = (user && user.email) || '';

    els.authView.hidden = true;
    els.portalView.hidden = false;
    clearNotice('auth');
    clearNotice('portal');
  }

  function setLoginBusy(busy) {
    state.isSubmittingLogin = busy;
    els.loginSubmitBtn.disabled = busy;
    els.emailInput.disabled = busy;
    els.passwordInput.disabled = busy;
    els.fillDemoBtn.disabled = busy;
    els.loginSpinner.hidden = !busy;
    els.loginBtnLabel.textContent = busy ? 'Signing in…' : 'Sign in';
  }

  /* ------------------------------------------------------------------------
     Projects Rendering
     ------------------------------------------------------------------------ */

  function statusBadgeModifier(statusText) {
    const normalized = String(statusText || '').trim().toLowerCase();
    if (normalized === 'in progress' || normalized === 'active') {
      return 'status-badge--progress';
    }
    if (normalized === 'delivered' || normalized === 'completed' || normalized === 'complete') {
      return 'status-badge--delivered';
    }
    return 'status-badge--neutral';
  }

  function formatProjectSummary(projects) {
    if (projects.length === 0) {
      return '0 projects';
    }
    const counts = new Map();
    projects.forEach((project) => {
      const label = String(project.status || 'Unknown').trim().toLowerCase();
      counts.set(label, (counts.get(label) || 0) + 1);
    });

    const parts = [`${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`];
    counts.forEach((count, label) => {
      parts.push(`${count} ${label}`);
    });
    return parts.join(' · ');
  }

  function renderProjectsLoading() {
    els.projectsSummary.textContent = 'Loading…';
    els.projectsLoading.hidden = false;
    els.projectsList.hidden = true;
    els.projectsEmpty.hidden = true;
  }

  function renderProjects(projects) {
    state.projects = projects;
    els.projectsLoading.hidden = true;
    els.projectsSummary.textContent = formatProjectSummary(projects);

    if (projects.length === 0) {
      els.projectsList.hidden = true;
      els.projectsList.textContent = '';
      els.projectsEmpty.hidden = false;
      return;
    }

    els.projectsEmpty.hidden = true;
    els.projectsList.textContent = '';

    projects.forEach((project, idx) => {
      const li = document.createElement('li');
      li.className = 'project-row';

      const indexEl = document.createElement('span');
      indexEl.className = 'project-index';
      indexEl.textContent = String(idx + 1).padStart(2, '0');

      const titleEl = document.createElement('h3');
      titleEl.className = 'project-title';
      titleEl.textContent = project && typeof project.title === 'string'
        ? project.title
        : 'Untitled project';

      const statusText = project && typeof project.status === 'string'
        ? project.status
        : 'Unknown';
      const badgeEl = document.createElement('span');
      badgeEl.className = `status-badge ${statusBadgeModifier(statusText)}`;
      badgeEl.textContent = statusText;

      li.append(indexEl, titleEl, badgeEl);
      els.projectsList.appendChild(li);
    });

    els.projectsList.hidden = false;
  }

  /* ------------------------------------------------------------------------
     API Workflows
     ------------------------------------------------------------------------ */

  async function checkHealth({ userTriggered = false } = {}) {
    els.apiHealthBtn.disabled = true;
    setHealthStatus('pending', 'Health: checking…');

    const res = await apiRequest('/api/health', { method: 'GET' });
    els.apiHealthBtn.disabled = false;

    if (res.networkError) {
      const targetDesc = res.crossOrigin
        ? `${res.url} was blocked by CORS or is unreachable (${res.detail}).`
        : `${res.url} could not be reached (${res.detail}).`;
      setHealthStatus('error', 'Health: blocked / offline', `GET ${targetDesc}`, 'error');
      return res;
    }

    if (!res.ok) {
      setHealthStatus(
        'error',
        `Health: HTTP ${res.status}`,
        `GET ${res.url} returned HTTP ${res.status} (${res.detail}).`,
        'error'
      );
      return res;
    }

    const statusLabel = res.data && res.data.status ? res.data.status : 'ok';
    updateApiIndicators();
    const activeNote = !state.apiBase && !userTriggered
      ? `GET ${res.url} returned 200 (${statusLabel}). Input is prefilled with ${DEFAULT_CROSS_ORIGIN_EXAMPLE} so you can click Apply to test cross-origin mode.`
      : `GET ${res.url} returned HTTP ${res.status} (${statusLabel}).`;
    setHealthStatus('ok', `Health: ${statusLabel} (${res.status})`, activeNote, 'ok');
    return res;
  }

  async function loadProjects({ verifySession = false } = {}) {
    if (state.isLoadingProjects) {
      return;
    }
    state.isLoadingProjects = true;
    els.refreshProjectsBtn.disabled = true;
    clearNotice('portal');
    renderProjectsLoading();

    if (verifySession) {
      const meRes = await apiRequest('/api/me', { method: 'GET' });
      if (meRes.networkError) {
        state.isLoadingProjects = false;
        els.refreshProjectsBtn.disabled = false;
        els.projectsLoading.hidden = true;
        els.projectsSummary.textContent = 'Unavailable';
        showNotice('portal', buildNetworkErrorNotice(meRes, 'Session check failed'));
        return;
      }

      if (meRes.status === 401) {
        state.isLoadingProjects = false;
        els.refreshProjectsBtn.disabled = false;
        showAuthView();
        showNotice('auth', {
          variant: 'warning',
          title: 'Session expired or no longer active',
          body: `GET /api/me returned HTTP 401 ("${meRes.detail}"). Please sign in again to resume your session.`,
          trace: [`GET ${meRes.url} -> 401 ${meRes.statusText || 'Unauthorized'} (${meRes.detail})`],
        });
        return;
      }

      if (!meRes.ok || !meRes.data || !meRes.data.user) {
        state.isLoadingProjects = false;
        els.refreshProjectsBtn.disabled = false;
        els.projectsLoading.hidden = true;
        els.projectsSummary.textContent = 'Unavailable';
        showNotice('portal', {
          variant: 'error',
          title: `Could not verify session (HTTP ${meRes.status})`,
          body: `GET ${meRes.url} returned an unexpected response (${meRes.detail}).`,
          trace: [`GET ${meRes.url} -> HTTP ${meRes.status}`],
        });
        return;
      }

      showPortalView(meRes.data.user);
    }

    const res = await apiRequest('/api/projects', { method: 'GET' });
    state.isLoadingProjects = false;
    els.refreshProjectsBtn.disabled = false;

    if (res.networkError) {
      els.projectsLoading.hidden = true;
      els.projectsSummary.textContent = 'Unavailable';
      showNotice('portal', buildNetworkErrorNotice(res, 'Could not load projects'));
      return;
    }

    if (res.status === 401) {
      showAuthView();
      showNotice('auth', {
        variant: 'warning',
        title: 'Session expired or no longer active',
        body: `GET /api/projects returned HTTP 401 ("${res.detail}"). You have been returned to the sign-in screen.`,
        trace: [`GET ${res.url} -> 401 ${res.statusText || 'Unauthorized'} (${res.detail})`],
      });
      return;
    }

    if (!res.ok) {
      els.projectsLoading.hidden = true;
      els.projectsSummary.textContent = 'Unavailable';
      showNotice('portal', {
        variant: 'error',
        title: `Could not load projects (HTTP ${res.status})`,
        body: `GET ${res.url} failed with "${res.detail}".`,
        trace: [`GET ${res.url} -> HTTP ${res.status}`],
      });
      return;
    }

    if (res.parseError || !res.data || !Array.isArray(res.data.projects)) {
      els.projectsLoading.hidden = true;
      els.projectsSummary.textContent = 'Invalid payload';
      showNotice('portal', {
        variant: 'error',
        title: 'Unexpected projects response',
        body: `GET ${res.url} returned HTTP ${res.status}, but the JSON body did not include a projects list.`,
        trace: [`GET ${res.url} -> ${res.status} (invalid JSON shape)`],
      });
      return;
    }

    renderProjects(res.data.projects);
  }

  async function hydrateSession() {
    const meRes = await apiRequest('/api/me', { method: 'GET' });

    if (meRes.networkError) {
      showAuthView();
      showNotice('auth', buildNetworkErrorNotice(meRes, 'Initial session check failed'));
      return;
    }

    if (meRes.status === 401) {
      showAuthView();
      return;
    }

    if (!meRes.ok || !meRes.data || !meRes.data.user) {
      showAuthView();
      showNotice('auth', {
        variant: 'error',
        title: `Unexpected response from /api/me (HTTP ${meRes.status})`,
        body: `GET ${meRes.url} returned "${meRes.detail}".`,
        trace: [`GET ${meRes.url} -> HTTP ${meRes.status}`],
      });
      return;
    }

    showPortalView(meRes.data.user);
    await loadProjects({ verifySession: false });
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    if (state.isSubmittingLogin) {
      return;
    }

    clearNotice('auth');
    const email = els.emailInput.value.trim();
    const password = els.passwordInput.value;

    if (!email) {
      showNotice('auth', {
        variant: 'warning',
        title: 'Email is required',
        body: 'Enter your account email before signing in.',
      });
      els.emailInput.focus();
      return;
    }

    if (!password) {
      showNotice('auth', {
        variant: 'warning',
        title: 'Password is required',
        body: 'Enter your account password before signing in.',
      });
      els.passwordInput.focus();
      return;
    }

    setLoginBusy(true);

    // Step 1: Authenticate via POST /api/login
    const loginRes = await apiRequest('/api/login', {
      method: 'POST',
      body: { email, password },
    });

    if (loginRes.networkError) {
      setLoginBusy(false);
      showNotice('auth', buildNetworkErrorNotice(loginRes, 'Sign-in request failed'));
      return;
    }

    if (loginRes.status === 401) {
      setLoginBusy(false);
      showNotice('auth', {
        variant: 'error',
        title: 'Invalid credentials',
        body: loginRes.detail || 'Invalid email or password.',
        trace: [`POST ${loginRes.url} -> 401 ${loginRes.statusText || 'Unauthorized'}`],
      });
      return;
    }

    if (!loginRes.ok) {
      setLoginBusy(false);
      showNotice('auth', {
        variant: 'error',
        title: `Sign-in failed (HTTP ${loginRes.status})`,
        body: `POST ${loginRes.url} returned "${loginRes.detail}".`,
        trace: [`POST ${loginRes.url} -> HTTP ${loginRes.status}`],
      });
      return;
    }

    // Step 2: Verify that the browser actually persisted & sends the session cookie via GET /api/me
    const loginUser = loginRes.data && loginRes.data.user ? loginRes.data.user : null;
    const meRes = await apiRequest('/api/me', { method: 'GET' });
    setLoginBusy(false);

    if (meRes.networkError) {
      showNotice('auth', {
        variant: 'error',
        title: 'Sign-in succeeded, but session verification failed',
        body: `POST ${loginRes.url} returned HTTP ${loginRes.status}, then GET ${meRes.url} failed with a network or CORS error (${meRes.detail}).`,
        trace: [
          `POST ${loginRes.url} -> ${loginRes.status} ${loginRes.statusText || 'OK'}`,
          `GET ${meRes.url} -> Blocked / Network error (${meRes.detail})`,
        ],
      });
      return;
    }

    if (meRes.status === 401) {
      const identityText = loginUser && loginUser.name
        ? `${loginUser.name}${loginUser.studio ? ` (${loginUser.studio})` : ''}`
        : email;
      showNotice('auth', {
        variant: 'error',
        title: 'Sign-in returned HTTP 200, but the session did not persist',
        body: `POST /api/login accepted credentials for ${identityText} with HTTP ${loginRes.status}, yet the immediate follow-up GET /api/me returned HTTP 401 ("${meRes.detail}"). The portal stays signed out because no active session cookie was sent to /api/me.`,
        trace: [
          `POST ${loginRes.url} -> ${loginRes.status} ${loginRes.statusText || 'OK'}`,
          `GET ${meRes.url} -> 401 ${meRes.statusText || 'Unauthorized'} (${meRes.detail})`,
        ],
        hint: 'Check the Set-Cookie header on POST /api/login and the request cookies sent on GET /api/me in DevTools.',
      });
      return;
    }

    if (!meRes.ok || !meRes.data || !meRes.data.user) {
      showNotice('auth', {
        variant: 'error',
        title: `Session check returned HTTP ${meRes.status}`,
        body: `POST /api/login returned HTTP ${loginRes.status}, but GET /api/me returned "${meRes.detail}".`,
        trace: [
          `POST ${loginRes.url} -> ${loginRes.status} ${loginRes.statusText || 'OK'}`,
          `GET ${meRes.url} -> HTTP ${meRes.status}`,
        ],
      });
      return;
    }

    showPortalView(meRes.data.user);
    await loadProjects({ verifySession: false });
  }

  async function handleLogout() {
    if (state.isSigningOut) {
      return;
    }
    state.isSigningOut = true;
    els.logoutBtn.disabled = true;
    els.logoutBtn.textContent = 'Signing out…';
    clearNotice('portal');

    const res = await apiRequest('/api/logout', { method: 'POST' });

    state.isSigningOut = false;
    els.logoutBtn.disabled = false;
    els.logoutBtn.textContent = 'Sign out';

    if (res.networkError) {
      showNotice('portal', buildNetworkErrorNotice(res, 'Sign-out failed'));
      return;
    }

    if (!res.ok) {
      showNotice('portal', {
        variant: 'error',
        title: `Sign-out failed (HTTP ${res.status})`,
        body: `POST ${res.url} returned "${res.detail}".`,
        trace: [`POST ${res.url} -> HTTP ${res.status}`],
      });
      return;
    }

    showAuthView();
    showNotice('auth', {
      variant: 'success',
      title: 'Signed out',
      body: 'Your session has been cleared on the server.',
      trace: [`POST ${res.url} -> ${res.status} ${res.statusText || 'OK'}`],
    });
  }

  /* ------------------------------------------------------------------------
     API Base URL Settings Interactions
     ------------------------------------------------------------------------ */

  async function applyApiBase(newBase) {
    state.apiBase = newBase;
    updateApiIndicators();
    clearNotice('auth');
    clearNotice('portal');

    await checkHealth({ userTriggered: true });
    await hydrateSession();
  }

  async function handleApiFormSubmit(event) {
    event.preventDefault();
    const parsed = normalizeApiBase(els.apiBaseInput.value);
    if (!parsed.ok) {
      els.apiBarFeedback.textContent = parsed.error;
      els.apiBarFeedback.className = 'api-bar-feedback api-bar-feedback--error';
      els.apiBaseInput.focus();
      return;
    }

    if (parsed.value) {
      els.apiBaseInput.value = parsed.value;
    }
    await applyApiBase(parsed.value);
  }

  async function handleResetSameOrigin() {
    els.apiBaseInput.value = DEFAULT_CROSS_ORIGIN_EXAMPLE;
    await applyApiBase('');
    if (!els.apiBarFeedback.classList.contains('api-bar-feedback--error')) {
      els.apiBarFeedback.textContent = `Switched to same-origin requests. Input stays prefilled with ${DEFAULT_CROSS_ORIGIN_EXAMPLE} for cross-origin demos.`;
    }
  }

  /* ------------------------------------------------------------------------
     Event Wiring & Initialization
     ------------------------------------------------------------------------ */

  function wireEvents() {
    els.loginForm.addEventListener('submit', handleLoginSubmit);

    els.togglePasswordBtn.addEventListener('click', () => {
      const showing = els.passwordInput.type === 'text';
      els.passwordInput.type = showing ? 'password' : 'text';
      els.togglePasswordBtn.textContent = showing ? 'Show' : 'Hide';
      els.togglePasswordBtn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      els.togglePasswordBtn.setAttribute('aria-pressed', String(!showing));
    });

    els.fillDemoBtn.addEventListener('click', () => {
      els.emailInput.value = DEMO_CREDENTIALS.email;
      els.passwordInput.value = DEMO_CREDENTIALS.password;
      clearNotice('auth');
      els.emailInput.focus();
    });

    els.refreshProjectsBtn.addEventListener('click', () => {
      loadProjects({ verifySession: true });
    });

    els.emptyRefreshBtn.addEventListener('click', () => {
      loadProjects({ verifySession: true });
    });

    els.logoutBtn.addEventListener('click', handleLogout);

    els.apiBaseForm.addEventListener('submit', handleApiFormSubmit);
    els.apiSameOriginBtn.addEventListener('click', handleResetSameOrigin);
    els.apiHealthBtn.addEventListener('click', () => {
      checkHealth({ userTriggered: true });
    });
  }

  async function init() {
    const initial = resolveInitialApiBase();
    state.apiBase = initial.base;

    // Keep the settings input prefilled with http://127.0.0.1:8000 in same-origin mode
    // so cross-origin demos are one click away; reflect the active URL when explicitly set.
    els.apiBaseInput.value = state.apiBase || DEFAULT_CROSS_ORIGIN_EXAMPLE;

    updateApiIndicators();
    wireEvents();

    await Promise.all([
      checkHealth({ userTriggered: false }),
      hydrateSession(),
    ]);
  }

  init();
})();
