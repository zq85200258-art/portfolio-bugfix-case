(() => {
  'use strict';

  const DEMO_CREDENTIALS = Object.freeze({
    email: 'ava@northwind.example',
    password: 'demo-password-only',
  });

  const DEFAULT_CROSS_ORIGIN_EXAMPLE = 'http://127.0.0.1:8000';

  const ALLOWED_LOCAL_DEMO_ORIGINS = new Set([
    'http://127.0.0.1:8000',
    'http://localhost:8000',
  ]);

  const state = {
    apiBase: '',
    user: null,
    projects: [],
    isSubmittingLogin: false,
    isLoadingProjects: false,
    isSigningOut: false,
    apiEpoch: 0,
    sessionEpoch: 0,
    projectsEpoch: 0,
    healthEpoch: 0,
    controllers: {
      health: null,
      session: null,
      projects: null,
      login: null,
      logout: null,
    },
  };

  const els = {
    // Header
    headerApiDot: document.getElementById('header-api-dot'),
    headerApiLabel: document.getElementById('header-api-label'),

    // Auth view
    authView: document.getElementById('auth-view'),
    authHeading: document.getElementById('auth-heading'),
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
    apiApplyBtn: document.getElementById('api-apply-btn'),
    apiActiveDisplay: document.getElementById('api-active-display'),
    apiHealthChip: document.getElementById('api-health-chip'),
    apiHealthDot: document.getElementById('api-health-dot'),
    apiHealthText: document.getElementById('api-health-text'),
    apiSameOriginBtn: document.getElementById('api-same-origin-btn'),
    apiHealthBtn: document.getElementById('api-health-btn'),
    apiBarFeedback: document.getElementById('api-bar-feedback'),
  };

  /* ------------------------------------------------------------------------
     Request Lifecycle & Cancellation Helpers
     ------------------------------------------------------------------------ */

  function abortControllerSlot(slot) {
    const existing = state.controllers[slot];
    if (existing) {
      state.controllers[slot] = null;
      existing.abort();
    }
  }

  function createControllerSlot(slot) {
    abortControllerSlot(slot);
    if (typeof AbortController === 'function') {
      const controller = new AbortController();
      state.controllers[slot] = controller;
      return controller;
    }
    return null;
  }

  function clearControllerSlot(slot, controller) {
    if (controller && state.controllers[slot] === controller) {
      state.controllers[slot] = null;
    }
  }

  function resetProjectsBusy() {
    state.isLoadingProjects = false;
    els.refreshProjectsBtn.disabled = false;
  }

  function resetLogoutBusy() {
    state.isSigningOut = false;
    els.logoutBtn.disabled = false;
    els.logoutBtn.textContent = 'Sign out';
  }

  function cancelSessionFlows() {
    abortControllerSlot('session');
    abortControllerSlot('projects');
    abortControllerSlot('login');
    state.sessionEpoch += 1;
    state.projectsEpoch += 1;
    setLoginBusy(false);
    resetProjectsBusy();
  }

  function cancelAllFlows() {
    abortControllerSlot('health');
    abortControllerSlot('session');
    abortControllerSlot('projects');
    abortControllerSlot('login');
    abortControllerSlot('logout');
    state.apiEpoch += 1;
    state.sessionEpoch += 1;
    state.projectsEpoch += 1;
    state.healthEpoch += 1;
    setLoginBusy(false);
    resetProjectsBusy();
    resetLogoutBusy();
    els.apiHealthBtn.disabled = false;
  }

  /* ------------------------------------------------------------------------
     API Base URL Allowlist, Resolution & URL Sync
     ------------------------------------------------------------------------ */

  function getCurrentHttpOrigin() {
    if (
      (window.location.protocol === 'http:' || window.location.protocol === 'https:') &&
      window.location.origin &&
      window.location.origin !== 'null'
    ) {
      return window.location.origin;
    }
    return '';
  }

  function formatCurrentOrigin() {
    return getCurrentHttpOrigin() || 'local file';
  }

  function isAllowedApiOrigin(origin) {
    if (!origin) {
      return false;
    }
    if (ALLOWED_LOCAL_DEMO_ORIGINS.has(origin)) {
      return true;
    }
    const currentOrigin = getCurrentHttpOrigin();
    return Boolean(currentOrigin && origin === currentOrigin);
  }

  function describeAllowedTargets() {
    const currentOrigin = getCurrentHttpOrigin();
    const targets = [currentOrigin ? `same-origin (${currentOrigin})` : 'same-origin'];
    ALLOWED_LOCAL_DEMO_ORIGINS.forEach((origin) => {
      if (origin !== currentOrigin) {
        targets.push(origin);
      }
    });
    return targets.join(', ');
  }

  function normalizeApiBase(rawValue) {
    const trimmed = String(rawValue == null ? '' : rawValue).trim();
    if (!trimmed) {
      return { ok: true, value: '' };
    }

    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch {
      return {
        ok: false,
        error: `Invalid API URL. Enter an allowed http(s) origin (${describeAllowedTargets()}), or leave empty for same-origin.`,
      };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        ok: false,
        error: 'API base URL must use http:// or https://.',
      };
    }

    if (parsed.username || parsed.password) {
      return {
        ok: false,
        error: 'API base URL must not include embedded credentials.',
      };
    }

    if (parsed.search || parsed.hash) {
      return {
        ok: false,
        error: 'API base URL must not include query parameters or hash fragments.',
      };
    }

    if (parsed.pathname.includes('//')) {
      return {
        ok: false,
        error: 'API base URL contains an invalid path.',
      };
    }

    if (!isAllowedApiOrigin(parsed.origin)) {
      return {
        ok: false,
        error: `Disallowed API target "${parsed.origin}". Only ${describeAllowedTargets()} are permitted.`,
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
      const rawParam = params.get('api') || '';
      const fromQuery = normalizeApiBase(rawParam);
      if (fromQuery.ok) {
        return { base: fromQuery.value, source: 'query', rejected: null };
      }
      return {
        base: '',
        source: 'fallback',
        rejected: {
          source: 'query',
          raw: rawParam,
          error: fromQuery.error,
        },
      };
    }

    if (typeof window.LUMENDESK_API === 'string' && window.LUMENDESK_API.trim() !== '') {
      const fromGlobal = normalizeApiBase(window.LUMENDESK_API);
      if (fromGlobal.ok) {
        return { base: fromGlobal.value, source: 'global', rejected: null };
      }
      return {
        base: '',
        source: 'fallback',
        rejected: {
          source: 'global',
          raw: window.LUMENDESK_API,
          error: fromGlobal.error,
        },
      };
    }

    return { base: '', source: 'default', rejected: null };
  }

  function syncApiBaseToUrl(apiBase) {
    if (!window.history || typeof window.history.replaceState !== 'function') {
      return;
    }

    const validated = normalizeApiBase(apiBase);
    if (!validated.ok) {
      return;
    }

    try {
      const url = new URL(window.location.href);
      const hasValidGlobalPreset =
        typeof window.LUMENDESK_API === 'string' &&
        window.LUMENDESK_API.trim() !== '' &&
        normalizeApiBase(window.LUMENDESK_API).ok;

      if (validated.value) {
        url.searchParams.set('api', validated.value);
      } else if (hasValidGlobalPreset) {
        url.searchParams.set('api', '');
      } else {
        url.searchParams.delete('api');
      }

      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(window.history.state, '', nextUrl);
    } catch {
      // Ignore History API restrictions on non-HTTP origins (e.g. file://).
    }
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

  function buildEndpointUrl(path, apiBase) {
    return apiBase ? `${apiBase}${path}` : path;
  }

  function buildRejectionNotice(rejected) {
    const label = rejected.source === 'query' ? '?api=' : 'window.LUMENDESK_API';
    return {
      variant: 'warning',
      title: `Blocked disallowed ${label} target`,
      body: `${rejected.error} No requests were sent to "${rejected.raw}". The portal fell back to the safe default: same-origin (${formatCurrentOrigin()}).`,
      trace: [`Rejected ${label} (${rejected.raw}) -> fallback to same-origin`],
      hint: `Allowed targets: ${describeAllowedTargets()}.`,
    };
  }

  /* ------------------------------------------------------------------------
     Response Parsing & Unified Fetch Client
     ------------------------------------------------------------------------ */

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function looksLikeHtml(contentType, rawText) {
    if (contentType && /text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return true;
    }
    if (typeof rawText === 'string' && /^\s*(?:<!doctype\s+html|<html\b|<head\b|<body\b)/i.test(rawText)) {
      return true;
    }
    return false;
  }

  function isValidLogoutPayload(res) {
    if (
      res.parseError ||
      looksLikeHtml(res.contentType, res.rawText) ||
      !isPlainObject(res.data)
    ) {
      return false;
    }

    const { ok, status, logged_out: loggedOut, signed_out: signedOut, authenticated } = res.data;

    if (ok === false || authenticated === true) {
      return false;
    }
    if (typeof ok === 'boolean') {
      return ok === true;
    }
    if (typeof status === 'string') {
      const normalized = status.trim().toLowerCase();
      return normalized === 'ok' || normalized === 'signed_out' || normalized === 'logged_out';
    }
    if (typeof loggedOut === 'boolean') {
      return loggedOut === true;
    }
    if (typeof signedOut === 'boolean') {
      return signedOut === true;
    }
    if (authenticated === false) {
      return true;
    }
    return false;
  }

  function extractDetail(data, rawText, status, statusText, contentType) {
    if (isPlainObject(data)) {
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

    if (looksLikeHtml(contentType, rawText)) {
      return 'HTML document returned instead of JSON';
    }

    if (rawText && rawText.trim().length > 0 && rawText.trim().length < 180) {
      return rawText.trim();
    }

    return statusText || `HTTP ${status}`;
  }

  async function apiRequest(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const requestedBase = options.apiBase !== undefined ? options.apiBase : state.apiBase;
    const validatedBase = normalizeApiBase(requestedBase);

    if (!validatedBase.ok) {
      return {
        ok: false,
        aborted: false,
        blocked: true,
        networkError: true,
        bodyReadError: false,
        crossOrigin: true,
        method,
        path,
        url: String(requestedBase || path),
        status: 0,
        statusText: '',
        contentType: '',
        data: null,
        rawText: '',
        parseError: false,
        detail: validatedBase.error,
      };
    }

    const pinnedBase = validatedBase.value;
    const url = buildEndpointUrl(path, pinnedBase);
    const crossOrigin = isCrossOriginTarget(pinnedBase);

    const fetchOptions = {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (options.signal) {
      fetchOptions.signal = options.signal;
    }

    if (options.body !== undefined) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    let response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (err) {
      const wasAborted =
        (options.signal && options.signal.aborted) ||
        (err && err.name === 'AbortError');
      return {
        ok: false,
        aborted: Boolean(wasAborted),
        blocked: false,
        networkError: !wasAborted,
        bodyReadError: false,
        crossOrigin,
        method,
        path,
        url,
        status: 0,
        statusText: '',
        contentType: '',
        data: null,
        rawText: '',
        parseError: false,
        detail: wasAborted
          ? 'Request cancelled'
          : (err instanceof Error && err.message ? err.message : 'Network request failed'),
      };
    }

    const contentType = response.headers.get('content-type') || '';
    let rawText = '';

    try {
      rawText = await response.text();
    } catch (err) {
      const wasAborted =
        (options.signal && options.signal.aborted) ||
        (err && err.name === 'AbortError');
      return {
        ok: false,
        aborted: Boolean(wasAborted),
        blocked: false,
        networkError: !wasAborted,
        bodyReadError: !wasAborted,
        crossOrigin,
        method,
        path,
        url,
        status: response.status,
        statusText: response.statusText,
        contentType,
        data: null,
        rawText: '',
        parseError: false,
        detail: wasAborted
          ? 'Request cancelled'
          : (err instanceof Error && err.message
              ? `Response body interrupted: ${err.message}`
              : 'Response body interrupted while reading'),
      };
    }

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
      aborted: false,
      blocked: false,
      networkError: false,
      bodyReadError: false,
      crossOrigin,
      method,
      path,
      url,
      status: response.status,
      statusText: response.statusText,
      contentType,
      data,
      rawText,
      parseError,
      detail: extractDetail(data, rawText, response.status, response.statusText, contentType),
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
    if (res.bodyReadError) {
      return {
        variant: 'error',
        title: `${contextLabel}: response stream interrupted`,
        body: `${res.method} ${res.url} returned HTTP ${res.status || 'response'}, but reading the response body was interrupted (${res.detail}).`,
        trace: [`${res.method} ${res.url} -> Body read interrupted (${res.detail})`],
        hint: 'Check that the API server stayed up and retry the request.',
      };
    }

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
     Password Visibility & Sensitive Field Reset
     ------------------------------------------------------------------------ */

  function resetPasswordVisibility() {
    els.passwordInput.type = 'password';
    els.togglePasswordBtn.textContent = 'Show';
    els.togglePasswordBtn.setAttribute('aria-label', 'Show password');
    els.togglePasswordBtn.setAttribute('aria-pressed', 'false');
  }

  function clearSensitivePasswordInput() {
    els.passwordInput.value = '';
    resetPasswordVisibility();
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

  function focusViewHeading(headingEl) {
    if (headingEl && typeof headingEl.focus === 'function') {
      headingEl.focus();
    }
  }

  function showAuthView({ moveFocus = false, clearPassword = false } = {}) {
    const wasHidden = els.authView.hidden;
    state.user = null;
    state.projects = [];
    if (clearPassword) {
      clearSensitivePasswordInput();
    }
    els.portalView.hidden = true;
    els.authView.hidden = false;
    clearNotice('portal');

    if (moveFocus && wasHidden) {
      focusViewHeading(els.authHeading);
    }
  }

  function showPortalView(user, { moveFocus = false } = {}) {
    const wasHidden = els.portalView.hidden;
    state.user = user;
    clearSensitivePasswordInput();

    els.portalHeading.textContent = user && user.name
      ? `Welcome back, ${user.name}`
      : 'Welcome back';
    els.portalStudio.textContent = (user && user.studio) || 'Client Studio';
    els.portalEmail.textContent = (user && user.email) || '';

    els.authView.hidden = true;
    els.portalView.hidden = false;
    clearNotice('auth');
    clearNotice('portal');

    if (moveFocus && wasHidden) {
      focusViewHeading(els.portalHeading);
    }
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

  async function checkHealth({ userTriggered = false, apiBase = state.apiBase, initialRejection = null } = {}) {
    state.healthEpoch += 1;
    const myHealthEpoch = state.healthEpoch;
    const myApiEpoch = state.apiEpoch;
    const controller = createControllerSlot('health');

    const isStale = () => myHealthEpoch !== state.healthEpoch || myApiEpoch !== state.apiEpoch;

    els.apiHealthBtn.disabled = true;
    setHealthStatus('pending', 'Health: checking…');

    let res;
    try {
      res = await apiRequest('/api/health', {
        method: 'GET',
        apiBase,
        signal: controller ? controller.signal : undefined,
      });
    } finally {
      clearControllerSlot('health', controller);
      if (!isStale()) {
        els.apiHealthBtn.disabled = false;
      }
    }

    if (isStale() || res.aborted) {
      return res;
    }

    const withRejectionPrefix = (msg, kind) => {
      if (!initialRejection) {
        return { message: msg, kind };
      }
      return {
        message: `${initialRejection.error} Fell back to same-origin. (${msg})`,
        kind: 'error',
      };
    };

    if (res.networkError) {
      const targetDesc = res.bodyReadError
        ? `${res.url} interrupted while reading response body (${res.detail}).`
        : (res.crossOrigin
            ? `${res.url} was blocked by CORS or is unreachable (${res.detail}).`
            : `${res.url} could not be reached (${res.detail}).`);
      const feedback = withRejectionPrefix(`GET ${targetDesc}`, 'error');
      setHealthStatus(
        'error',
        res.bodyReadError ? 'Health: stream interrupted' : 'Health: blocked / offline',
        feedback.message,
        feedback.kind
      );
      return res;
    }

    if (!res.ok) {
      const feedback = withRejectionPrefix(
        `GET ${res.url} returned HTTP ${res.status} (${res.detail}).`,
        'error'
      );
      setHealthStatus('error', `Health: HTTP ${res.status}`, feedback.message, feedback.kind);
      return res;
    }

    if (looksLikeHtml(res.contentType, res.rawText)) {
      const feedback = withRejectionPrefix(
        `GET ${res.url} returned HTTP ${res.status} with HTML instead of JSON. This looks like a static preview server rather than the LumenDesk API.`,
        'error'
      );
      setHealthStatus('error', 'Health: invalid response (HTML)', feedback.message, feedback.kind);
      return res;
    }

    const validJsonObj = !res.parseError && isPlainObject(res.data);
    const statusLabel = validJsonObj && typeof res.data.status === 'string'
      ? res.data.status.trim()
      : '';

    if (!validJsonObj || !statusLabel) {
      const feedback = withRejectionPrefix(
        `GET ${res.url} returned HTTP ${res.status}, but the body was not a valid health JSON payload (expected {"status":"ok"}).`,
        'error'
      );
      setHealthStatus('error', 'Health: invalid JSON', feedback.message, feedback.kind);
      return res;
    }

    if (statusLabel.toLowerCase() !== 'ok') {
      const feedback = withRejectionPrefix(
        `GET ${res.url} returned HTTP ${res.status} with status "${statusLabel}".`,
        'error'
      );
      setHealthStatus('error', `Health: ${statusLabel} (${res.status})`, feedback.message, feedback.kind);
      return res;
    }

    updateApiIndicators();
    const activeNote = !apiBase && !userTriggered
      ? `GET ${res.url} returned 200 (${statusLabel}). Input is prefilled with ${DEFAULT_CROSS_ORIGIN_EXAMPLE} so you can click Apply to test cross-origin mode.`
      : `GET ${res.url} returned HTTP ${res.status} (${statusLabel}).`;
    const feedback = withRejectionPrefix(activeNote, 'ok');
    setHealthStatus('ok', `Health: ${statusLabel} (${res.status})`, feedback.message, feedback.kind);
    return res;
  }

  async function loadProjects({
    verifySession = false,
    apiBase = state.apiBase,
    sessionEpoch = state.sessionEpoch,
    apiEpoch = state.apiEpoch,
  } = {}) {
    if (apiEpoch !== state.apiEpoch || sessionEpoch !== state.sessionEpoch) {
      return;
    }

    state.projectsEpoch += 1;
    const myProjectsEpoch = state.projectsEpoch;
    const controller = createControllerSlot('projects');

    const isStale = () =>
      apiEpoch !== state.apiEpoch ||
      sessionEpoch !== state.sessionEpoch ||
      myProjectsEpoch !== state.projectsEpoch;

    state.isLoadingProjects = true;
    els.refreshProjectsBtn.disabled = true;
    clearNotice('portal');
    renderProjectsLoading();

    try {
      if (verifySession) {
        const meRes = await apiRequest('/api/me', {
          method: 'GET',
          apiBase,
          signal: controller ? controller.signal : undefined,
        });

        if (isStale() || meRes.aborted) {
          return;
        }

        if (meRes.networkError) {
          els.projectsLoading.hidden = true;
          els.projectsSummary.textContent = 'Unavailable';
          showNotice('portal', buildNetworkErrorNotice(meRes, 'Session check failed'));
          return;
        }

        if (meRes.status === 401) {
          showAuthView({ moveFocus: true, clearPassword: true });
          showNotice('auth', {
            variant: 'warning',
            title: 'Session expired or no longer active',
            body: `GET /api/me returned HTTP 401 ("${meRes.detail}"). Please sign in again to resume your session.`,
            trace: [`GET ${meRes.url} -> 401 ${meRes.statusText || 'Unauthorized'} (${meRes.detail})`],
          });
          return;
        }

        if (!meRes.ok || meRes.parseError || !isPlainObject(meRes.data) || !isPlainObject(meRes.data.user)) {
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

        showPortalView(meRes.data.user, { moveFocus: false });
      }

      const res = await apiRequest('/api/projects', {
        method: 'GET',
        apiBase,
        signal: controller ? controller.signal : undefined,
      });

      if (isStale() || res.aborted) {
        return;
      }

      if (res.networkError) {
        els.projectsLoading.hidden = true;
        els.projectsSummary.textContent = 'Unavailable';
        showNotice('portal', buildNetworkErrorNotice(res, 'Could not load projects'));
        return;
      }

      if (res.status === 401) {
        showAuthView({ moveFocus: true, clearPassword: true });
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

      if (res.parseError || !isPlainObject(res.data) || !Array.isArray(res.data.projects)) {
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
    } finally {
      clearControllerSlot('projects', controller);
      if (!isStale()) {
        resetProjectsBusy();
      }
    }
  }

  async function hydrateSession({
    apiBase = state.apiBase,
    moveFocusOnChange = false,
    initialRejection = null,
  } = {}) {
    cancelSessionFlows();
    const myApiEpoch = state.apiEpoch;
    const mySessionEpoch = state.sessionEpoch;
    const controller = createControllerSlot('session');

    const isStale = () => myApiEpoch !== state.apiEpoch || mySessionEpoch !== state.sessionEpoch;

    let meRes;
    try {
      meRes = await apiRequest('/api/me', {
        method: 'GET',
        apiBase,
        signal: controller ? controller.signal : undefined,
      });
    } finally {
      clearControllerSlot('session', controller);
    }

    if (isStale() || meRes.aborted) {
      return;
    }

    if (meRes.networkError) {
      showAuthView({ moveFocus: moveFocusOnChange });
      showNotice(
        'auth',
        initialRejection
          ? buildRejectionNotice(initialRejection)
          : buildNetworkErrorNotice(meRes, 'Initial session check failed')
      );
      return;
    }

    if (meRes.status === 401) {
      showAuthView({ moveFocus: moveFocusOnChange });
      if (initialRejection) {
        showNotice('auth', buildRejectionNotice(initialRejection));
      }
      return;
    }

    if (!meRes.ok || meRes.parseError || !isPlainObject(meRes.data) || !isPlainObject(meRes.data.user)) {
      showAuthView({ moveFocus: moveFocusOnChange });
      if (initialRejection) {
        showNotice('auth', buildRejectionNotice(initialRejection));
      } else {
        showNotice('auth', {
          variant: 'error',
          title: `Unexpected response from /api/me (HTTP ${meRes.status})`,
          body: `GET ${meRes.url} returned "${meRes.detail}".`,
          trace: [`GET ${meRes.url} -> HTTP ${meRes.status}`],
        });
      }
      return;
    }

    showPortalView(meRes.data.user, { moveFocus: moveFocusOnChange });
    await loadProjects({
      verifySession: false,
      apiBase,
      sessionEpoch: mySessionEpoch,
      apiEpoch: myApiEpoch,
    });
    if (!isStale() && initialRejection) {
      showNotice('portal', buildRejectionNotice(initialRejection));
    }
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

    const pinnedApiBase = state.apiBase;
    cancelSessionFlows();
    const myApiEpoch = state.apiEpoch;
    const mySessionEpoch = state.sessionEpoch;
    const controller = createControllerSlot('login');

    const isStale = () => myApiEpoch !== state.apiEpoch || mySessionEpoch !== state.sessionEpoch;

    setLoginBusy(true);

    try {
      // Step 1: Authenticate via POST /api/login
      const loginRes = await apiRequest('/api/login', {
        method: 'POST',
        apiBase: pinnedApiBase,
        body: { email, password },
        signal: controller ? controller.signal : undefined,
      });

      if (isStale() || loginRes.aborted) {
        return;
      }

      if (loginRes.networkError) {
        showNotice('auth', buildNetworkErrorNotice(loginRes, 'Sign-in request failed'));
        return;
      }

      if (loginRes.status === 401) {
        showNotice('auth', {
          variant: 'error',
          title: 'Invalid credentials',
          body: loginRes.detail || 'Invalid email or password.',
          trace: [`POST ${loginRes.url} -> 401 ${loginRes.statusText || 'Unauthorized'}`],
        });
        return;
      }

      if (!loginRes.ok) {
        showNotice('auth', {
          variant: 'error',
          title: `Sign-in failed (HTTP ${loginRes.status})`,
          body: `POST ${loginRes.url} returned "${loginRes.detail}".`,
          trace: [`POST ${loginRes.url} -> HTTP ${loginRes.status}`],
        });
        return;
      }

      if (
        loginRes.parseError ||
        looksLikeHtml(loginRes.contentType, loginRes.rawText) ||
        !isPlainObject(loginRes.data)
      ) {
        showNotice('auth', {
          variant: 'error',
          title: `Unexpected sign-in response (HTTP ${loginRes.status})`,
          body: `POST ${loginRes.url} returned HTTP ${loginRes.status}, but did not return valid JSON (${loginRes.detail}).`,
          trace: [`POST ${loginRes.url} -> ${loginRes.status} (invalid JSON)`],
        });
        return;
      }

      // Step 2: Verify that the browser persisted & sends the session cookie via GET /api/me
      const loginUser = isPlainObject(loginRes.data.user) ? loginRes.data.user : null;
      const meRes = await apiRequest('/api/me', {
        method: 'GET',
        apiBase: pinnedApiBase,
        signal: controller ? controller.signal : undefined,
      });

      if (isStale() || meRes.aborted) {
        return;
      }

      if (meRes.networkError) {
        showNotice('auth', {
          variant: 'error',
          title: 'Sign-in succeeded, but session verification failed',
          body: `POST ${loginRes.url} returned HTTP ${loginRes.status}, then GET ${meRes.url} failed (${meRes.detail}).`,
          trace: [
            `POST ${loginRes.url} -> ${loginRes.status} ${loginRes.statusText || 'OK'}`,
            `GET ${meRes.url} -> ${meRes.bodyReadError ? 'Body read interrupted' : 'Blocked / Network error'} (${meRes.detail})`,
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

      if (!meRes.ok || meRes.parseError || !isPlainObject(meRes.data) || !isPlainObject(meRes.data.user)) {
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

      showPortalView(meRes.data.user, { moveFocus: true });
      await loadProjects({
        verifySession: false,
        apiBase: pinnedApiBase,
        sessionEpoch: mySessionEpoch,
        apiEpoch: myApiEpoch,
      });
    } finally {
      clearControllerSlot('login', controller);
      if (!isStale()) {
        setLoginBusy(false);
      }
    }
  }

  async function handleLogout() {
    if (state.isSigningOut) {
      return;
    }

    const pinnedApiBase = state.apiBase;
    // Immediately invalidate any in-flight session/projects/login requests so late /api/me cannot re-authenticate
    cancelSessionFlows();
    const myApiEpoch = state.apiEpoch;
    const mySessionEpoch = state.sessionEpoch;
    const controller = createControllerSlot('logout');

    const isStale = () => myApiEpoch !== state.apiEpoch || mySessionEpoch !== state.sessionEpoch;

    state.isSigningOut = true;
    els.logoutBtn.disabled = true;
    els.logoutBtn.textContent = 'Signing out…';
    clearNotice('portal');

    let res;
    try {
      res = await apiRequest('/api/logout', {
        method: 'POST',
        apiBase: pinnedApiBase,
        signal: controller ? controller.signal : undefined,
      });
    } finally {
      clearControllerSlot('logout', controller);
      if (!isStale()) {
        resetLogoutBusy();
      }
    }

    if (isStale() || res.aborted) {
      return;
    }

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

    if (!isValidLogoutPayload(res)) {
      showNotice('portal', {
        variant: 'error',
        title: 'Unexpected sign-out response',
        body: `POST ${res.url} returned HTTP ${res.status}, but did not return the expected JSON sign-out confirmation (${res.detail}).`,
        trace: [`POST ${res.url} -> ${res.status} (invalid sign-out JSON)`],
      });
      return;
    }

    showAuthView({ moveFocus: true, clearPassword: true });
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
    const validated = normalizeApiBase(newBase);
    if (!validated.ok) {
      els.apiBarFeedback.textContent = validated.error;
      els.apiBarFeedback.className = 'api-bar-feedback api-bar-feedback--error';
      return false;
    }

    cancelAllFlows();
    const myApiEpoch = state.apiEpoch;

    state.apiBase = validated.value;
    syncApiBaseToUrl(state.apiBase);
    updateApiIndicators();
    clearNotice('auth');
    clearNotice('portal');

    await Promise.all([
      checkHealth({ userTriggered: true, apiBase: state.apiBase }),
      hydrateSession({ apiBase: state.apiBase, moveFocusOnChange: true }),
    ]);

    return myApiEpoch === state.apiEpoch;
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
    const stillCurrent = await applyApiBase('');
    if (stillCurrent && !els.apiBarFeedback.classList.contains('api-bar-feedback--error')) {
      els.apiBarFeedback.textContent = `Switched to same-origin requests. Input stays prefilled with ${DEFAULT_CROSS_ORIGIN_EXAMPLE} for cross-origin demos.`;
    }
  }

  /* ------------------------------------------------------------------------
     Event Wiring & Initialization
     ------------------------------------------------------------------------ */

  function wireEvents() {
    els.loginForm.addEventListener('submit', handleLoginSubmit);
    // Enable submit only after JS submit handler is bound so credentials cannot submit natively before JS loads
    els.loginSubmitBtn.disabled = false;

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
      resetPasswordVisibility();
      clearNotice('auth');
      els.emailInput.focus();
    });

    els.refreshProjectsBtn.addEventListener('click', () => {
      loadProjects({ verifySession: true, apiBase: state.apiBase });
    });

    els.emptyRefreshBtn.addEventListener('click', () => {
      loadProjects({ verifySession: true, apiBase: state.apiBase });
    });

    els.logoutBtn.addEventListener('click', handleLogout);

    els.apiBaseForm.addEventListener('submit', handleApiFormSubmit);
    els.apiApplyBtn.disabled = false;

    els.apiSameOriginBtn.addEventListener('click', handleResetSameOrigin);
    els.apiHealthBtn.addEventListener('click', () => {
      checkHealth({ userTriggered: true, apiBase: state.apiBase });
    });
  }

  async function init() {
    const initial = resolveInitialApiBase();
    state.apiBase = initial.base;

    // Keep the settings input prefilled with http://127.0.0.1:8000 in same-origin mode
    // so cross-origin demos are one click away; reflect the active URL when explicitly set.
    els.apiBaseInput.value = state.apiBase || DEFAULT_CROSS_ORIGIN_EXAMPLE;

    if (initial.rejected) {
      // Remove illegal ?api= from the address bar so it never overrides same-origin on reload
      if (initial.rejected.source === 'query') {
        syncApiBaseToUrl('');
      }
      els.apiBarFeedback.textContent = `${initial.rejected.error} Fell back to safe default: same-origin (${formatCurrentOrigin()}).`;
      els.apiBarFeedback.className = 'api-bar-feedback api-bar-feedback--error';
      showNotice('auth', buildRejectionNotice(initial.rejected));
    } else if (initial.source === 'query') {
      syncApiBaseToUrl(state.apiBase);
    }

    updateApiIndicators();
    wireEvents();

    await Promise.all([
      checkHealth({
        userTriggered: false,
        apiBase: state.apiBase,
        initialRejection: initial.rejected,
      }),
      hydrateSession({
        apiBase: state.apiBase,
        moveFocusOnChange: false,
        initialRejection: initial.rejected,
      }),
    ]);
  }

  init();
})();
