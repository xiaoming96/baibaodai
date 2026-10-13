/** Browser API transport. Static deployments stay local unless a backend is configured. */
const DEFAULT_TIMEOUT_MS = 15_000;
const TOKEN_PREFIX = 'wonder-pocket:session:';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'API_ERROR' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function getConfiguredApiBase() {
  const built = import.meta.env?.VITE_API_BASE_URL;
  const runtime = globalThis.window?.__POCKET_CONFIG__?.apiBaseUrl;
  return typeof built === 'string' && built.trim() ? built.trim()
    : typeof runtime === 'string' ? runtime.trim() : '';
}

function normalizeBase(value) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') throw new ApiError('云端地址配置无效。', { code: 'INVALID_API_BASE' });
  const trimmed = value.trim();
  if (!trimmed) return '';
  let url;
  try { url = new URL(trimmed); } catch { throw new ApiError('云端地址需要使用完整的 HTTPS 地址。', { code: 'INVALID_API_BASE' }); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash) {
    throw new ApiError('云端地址需要使用 HTTPS，且不能包含账号、查询参数或片段。', { code: 'INVALID_API_BASE' });
  }
  return url.href.replace(/\/+$/, '');
}

function defaultStorage() {
  try { return globalThis.sessionStorage; } catch { return undefined; }
}

function safeMessage(payload, fallback) {
  const error = payload?.error;
  const value = typeof error === 'string' ? error : error?.message ?? payload?.message;
  if (typeof value !== 'string' || !value.trim()) return fallback;
  // Public error messages are useful; HTML, stack traces and oversized payloads are not.
  if (value.length > 240 || /[<>]|\bat\s+\S+\s*\(|(?:Traceback|stack trace|Error:)|(?:Bearer\s+\S+)/i.test(value)) return fallback;
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
}

function errorCode(payload, fallback = 'API_ERROR') {
  const value = typeof payload?.error === 'object' ? payload.error?.code : payload?.code;
  return typeof value === 'string' && /^[A-Z0-9_:-]{1,80}$/i.test(value) ? value : fallback;
}

export function createApiClient({ baseUrl = getConfiguredApiBase(), fetchImpl = globalThis.fetch, storage = defaultStorage(), timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const base = normalizeBase(baseUrl);
  const tokenKey = `${TOKEN_PREFIX}${base}`;
  let token = '';
  let user = null;
  let config = null;
  if (base) {
    try { token = storage?.getItem(tokenKey) || ''; } catch { /* Restricted browser storage: use this tab's memory. */ }
  }
  const setToken = (value) => {
    token = typeof value === 'string' ? value : '';
    try {
      if (token) storage?.setItem(tokenKey, token);
      else storage?.removeItem(tokenKey);
    } catch { /* Authentication still works in memory when storage is unavailable. */ }
    if (!token) user = null;
  };
  const acceptSession = (payload) => {
    if (typeof payload.token === 'string' && payload.token) setToken(payload.token);
    if (payload.user && typeof payload.user === 'object') user = payload.user;
    return payload;
  };

  async function request(path, { method = 'GET', body, auth = true, clearOnUnauthorized = true } = {}) {
    if (!base) throw new ApiError('当前是本地体验模式，请连接云端服务后使用此功能。', { code: 'OFFLINE_MODE' });
    if (typeof fetchImpl !== 'function') throw new ApiError('浏览器暂不支持连接云端服务。', { code: 'NETWORK_ERROR' });
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
    try {
      const headers = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (auth && token) headers.Authorization = `Bearer ${token}`;
      const response = await fetchImpl(`${base}${path}`, {
        method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store',
      });
      if (response.status === 401 && clearOnUnauthorized) setToken('');
      let payload;
      try { payload = await response.json(); } catch {
        if (timedOut) throw new ApiError('云端响应超时，请稍后重试。', { code: 'TIMEOUT' });
        throw new ApiError(response.ok ? '云端返回了无法识别的数据，请稍后重试。' : '云端请求失败，请稍后重试。', {
          status: response.status, code: response.ok ? 'INVALID_RESPONSE' : 'HTTP_ERROR',
        });
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new ApiError('云端返回了无法识别的数据，请稍后重试。', { status: response.status, code: 'INVALID_RESPONSE' });
      }
      if (!response.ok || payload.ok === false) {
        throw new ApiError(safeMessage(payload, response.status === 401 ? '登录已过期，请重新登录。' : '云端请求失败，请稍后重试。'), {
          status: response.status, code: errorCode(payload, response.status === 401 ? 'UNAUTHORIZED' : 'API_ERROR'),
        });
      }
      if (payload.ok !== true) throw new ApiError('云端返回了无法识别的数据，请稍后重试。', { status: response.status, code: 'INVALID_RESPONSE' });
      return payload;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(timedOut ? '云端响应超时，请稍后重试。' : '暂时连接不到云端，请检查网络后重试。', { code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR' });
    } finally { clearTimeout(timeout); }
  }

  const post = (path, body, options) => request(path, { method: 'POST', body, ...options });
  const idPath = (id) => encodeURIComponent(String(id));
  return {
    enabled: Boolean(base), baseUrl: base,
    get token() { return token; },
    get user() { return user; },
    get config() { return config; },
    async connect() {
      if (!base) return { ok: true, enabled: false, mode: 'offline' };
      const data = await request('/api/config', { auth: false });
      config = data;
      if (!token) return { ...data, enabled: true };
      try { return { ...data, ...acceptSession(await request('/api/auth/me')), enabled: true }; }
      catch (error) { if (error.status === 401) return { ...data, enabled: true }; throw error; }
    },
    requestPhoneCode: (phone) => post('/api/auth/phone/request', { phone }, { auth: false, clearOnUnauthorized: false }),
    verifyPhoneCode: async (phone, code, guestState) => acceptSession(await post('/api/auth/phone/verify', { phone, code, guestState }, { auth: false, clearOnUnauthorized: false })),
    wechatLoginUrl: () => request('/api/auth/wechat/start', { auth: false, clearOnUnauthorized: false }),
    exchangeWechatCode: async (code, guestState) => acceptSession(await post('/api/auth/wechat/exchange', { code, guestState }, { auth: false, clearOnUnauthorized: false })),
    getMe: async () => acceptSession(await request('/api/auth/me')),
    async logout() { try { return await post('/api/auth/logout', {}); } finally { setToken(''); } },
    getState: () => request('/api/state'),
    mergeState: (state) => post('/api/state/merge', { state }),
    updatePreferences: (preferences) => post('/api/state/preferences', preferences),
    draw: (kind, worry = '', eventId) => post('/api/play/draw', { kind, worry, ...(eventId ? { eventId } : {}) }),
    useGadget: (payload) => post('/api/play/use', payload),
    fuse: (ids) => post('/api/play/fuse', { ids }),
    repair: (gadgetId) => post('/api/play/repair', { gadgetId }),
    confirmShare: () => post('/api/play/share', { confirmed: true }),
    generateIllustration: (gadgetId) => post('/api/ai/illustration', { gadgetId }),
    listIdeas: () => request('/api/ideas', { auth: false }),
    myIdeas: () => request('/api/ideas/mine'),
    submitIdea: (payload) => post('/api/ideas', payload),
    listPendingIdeas: () => request('/api/admin/ideas'),
    moderateIdea: (id, payload) => request(`/api/admin/ideas/${idPath(id)}`, { method: 'PATCH', body: payload }),
    getMetrics: () => request('/api/admin/metrics'),
    listOrders: () => request('/api/orders'),
    createOrder: (payload) => post('/api/orders', payload),
    getOrder: (id) => request(`/api/orders/${idPath(id)}`),
    refreshFulfillment: (id) => post(`/api/orders/${idPath(id)}/fulfillment`, {}),
    track: (eventName, props = {}, consent = false) => consent === true
      ? post('/api/events', { event: eventName, props, consent: true }, { auth: false, clearOnUnauthorized: false })
      : Promise.resolve({ ok: true, skipped: true, reason: 'consent-required' }),
  };
}
