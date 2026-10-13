import { computed, onMounted, ref } from 'vue';
import { createApiClient, getConfiguredApiBase } from '../lib/api.js';
import * as game from '../lib/game.js';
import { compactGuestState } from '../lib/guestTransfer.js';

const PRODUCTS = [
  { id: 'membership', name: '奇妙月卡', type: 'membership', amountCents: 990 },
  { id: 'keychain', name: '道具钥匙扣', type: 'merchandise', amountCents: 1990 },
  { id: 'magnet', name: '奇妙冰箱贴', type: 'merchandise', amountCents: 1490 },
  { id: 'postcards', name: '明信片套装', type: 'merchandise', amountCents: 2990 },
  { id: 'stand', name: '桌面小立牌', type: 'merchandise', amountCents: 2490 },
  { id: 'seasonal', name: '节日限定口袋', type: 'seasonal', amountCents: 600 },
];

export function usePocketCloud({ state, storage, notify }) {
  const user = ref(null), busy = ref(false), error = ref('');
  const ideas = ref([]), myIdeas = ref([]), pendingIdeas = ref([]), orders = ref([]);
  const ideaDraft = ref(null);
  try { ideaDraft.value = JSON.parse(storage.getItem('wonder-pocket:idea-draft') || 'null'); } catch { /* A damaged draft does not prevent play. */ }
  const config = ref({ backendConnected: false, capabilities: {}, products: PRODUCTS, events: game.listSeasonalEvents() });
  const localBase = import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(location.hostname) ? `${location.protocol}//${location.hostname}:3001` : '';
  const api = createApiClient({ baseUrl: getConfiguredApiBase() || localBase });
  const role = computed(() => user.value ? user.value.memberUntil > Date.now() ? 'member' : 'registered' : 'guest');
  function apply(data) {
    error.value = '';
    if (data.user) user.value = data.user;
    if (data.state) state.value = data.state;
    if (data.orders) orders.value = data.orders;
    return data;
  }
  function serverDay(value = Date.now()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: config.value.timeZone || 'Asia/Shanghai' }).format(new Date(value));
  }
  function handleError(err) {
    error.value = err.message || '这次没有成功，请稍后再试。';
    if (err.status === 401) {
      user.value = null;
      state.value = game.loadState(storage);
      myIdeas.value = []; pendingIdeas.value = []; orders.value = [];
    }
    notify(error.value);
    return null;
  }
  async function task(fn) {
    if (busy.value) return null;
    busy.value = true; error.value = '';
    try { return await fn(); }
    catch (err) { return handleError(err); }
    finally { busy.value = false; }
  }
  async function refreshIdeas() {
    if (!config.value.backendConnected) return;
    const publicData = await api.listIdeas(); ideas.value = publicData.ideas || [];
    if (user.value) myIdeas.value = (await api.myIdeas()).ideas || [];
    if (user.value?.isAdmin) pendingIdeas.value = (await api.listPendingIdeas()).ideas || [];
  }
  async function refreshOrders() {
    if (user.value) orders.value = (await api.listOrders()).orders || [];
  }
  function persist() {
    if (user.value) {
      try { storage.setItem(`wonder-pocket:cloud:${user.value.id}`, JSON.stringify(state.value)); return true; } catch { return false; }
    }
    return game.saveState(storage, state.value);
  }
  function track(event, props = {}) {
    if (!config.value.backendConnected || state.value.settings.analyticsConsent !== true) return;
    api.track(event, props, true).catch(() => {});
  }
  onMounted(async () => {
    if (!api.enabled) return;
    try {
      const connected = await api.connect();
      config.value = { ...config.value, ...connected, backendConnected: true, capabilities: { ...connected.capabilities, submissions: connected.submissions === true } };
      apply(connected);
      const hash = new URLSearchParams(location.hash.slice(1));
      const code = hash.get('wechat_code') || hash.get('wechat');
      if (code) {
        history.replaceState(null, '', location.pathname + location.search);
        apply(await api.exchangeWechatCode(code, compactGuestState(game.loadState(storage))));
        notify('欢迎回来，你的奇妙收藏已同步。');
      }
      await Promise.all([refreshIdeas(), refreshOrders()]);
      track('visit');
    } catch (err) { handleError(err); if (err.status !== 401) config.value.backendConnected = false; }
  });
  return {
    api, user, role, config, busy, error, ideas, myIdeas, pendingIdeas, orders, ideaDraft, apply, persist, task, track, serverDay, handleError,
    requestCode: ({ phone }) => task(async () => { await api.requestPhoneCode(phone); notify('验证码已发出，请查收短信。'); }),
    verify: ({ phone, code }) => task(async () => { apply(await api.verifyPhoneCode(phone, code, compactGuestState(game.loadState(storage)))); await Promise.all([refreshIdeas(), refreshOrders()]); notify('登录成功，口袋已为你同步收藏。'); }),
    wechatLogin: () => task(async () => { const data = await api.wechatLoginUrl(); const url = new URL(data.url); if (url.protocol !== 'https:' || url.hostname !== 'open.weixin.qq.com') throw new Error('微信登录地址无效。'); location.assign(url.href); }),
    logout: () => task(async () => { try { await api.logout(); } finally { user.value = null; state.value = game.loadState(storage); myIdeas.value = []; pendingIdeas.value = []; orders.value = []; } notify('已退出，游客收藏仍保留在这台设备。'); }),
    sync: () => task(async () => { apply(await api.getState()); notify('已同步云端收藏。'); }),
    preferences: async (values) => {
      Object.assign(state.value.settings, values); persist();
      if (user.value) {
        try { apply(await api.updatePreferences(values)); } catch (err) { handleError(err); }
      }
    },
    favorite: async (gadget) => {
      game.toggleFavorite(state.value, gadget); persist();
      if (user.value) {
        try { apply(await api.updatePreferences({ favorites: state.value.favorites })); } catch (err) { handleError(err); }
      }
    },
    shared: () => task(async () => {
      if (user.value) apply(await api.confirmShare());
      else { const reward = game.registerSuccessfulShare(state.value); if (!reward.ok) { notify(reward.reason); return; } persist(); }
      track('poster_share'); notify('分享成功，口袋送你一次额外修理。');
    }),
    refreshIdeas: () => task(refreshIdeas), refreshOrders: () => task(refreshOrders),
    submitIdea: (payload) => task(async () => { await api.submitIdea(payload); await refreshIdeas(); track('idea_submit'); notify('脑洞已寄出，审核通过后会出现在公共图鉴。'); }),
    draftIdea: (payload) => { try { storage.setItem('wonder-pocket:idea-draft', JSON.stringify(payload)); ideaDraft.value = payload; notify('脑洞草稿已保存在这台设备。'); } catch { notify('暂时无法保存草稿。'); } },
    moderateIdea: ({ id, ...payload }) => task(async () => { await api.moderateIdea(id, payload); await refreshIdeas(); notify('审核结果已保存。'); }),
    checkout: (payload) => task(async () => {
      const data = await api.createOrder(payload);
      const checkout = new URL(data.checkoutUrl);
      if (checkout.protocol !== 'https:') throw new Error('支付链接无效，请稍后再试。');
      await refreshOrders(); track('checkout_start', { productId: payload.productId });
      location.assign(checkout.href);
    }),
    refreshOrder: (id) => task(async () => { const data = await api.getOrder(id); const order = data.order; if (['paid', 'processing', 'shipped', 'fulfillment_failed'].includes(order.status) && order.type === 'merchandise') await api.refreshFulfillment(id); await refreshOrders(); apply(await api.getMe()); notify('订单状态已更新。'); }),
    exportData: () => {
      try {
        const url = URL.createObjectURL(new Blob([game.exportState(state.value)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = `奇妙口袋收藏-${game.localDay()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
        notify('收藏备份已保存，不包含账户或支付凭据。');
      } catch (err) { notify(err.message); }
    },
    importData: (file) => task(async () => {
      const parsed = game.importState(await file.text());
      if (!parsed.ok) throw new Error(parsed.reason);
      if (user.value) apply(await api.mergeState(compactGuestState(parsed.state)));
      else {
        const imported = parsed.state, current = state.value;
        for (const key of ['collected', 'favorites', 'events', 'achievements']) imported[key] = [...new Set([...(current[key] || []), ...imported[key]])];
        imported.customGadgets = [...new Map([...current.customGadgets, ...imported.customGadgets].map(g => [g.id, g])).values()];
        imported.eventRecords = [...new Map([...current.eventRecords, ...imported.eventRecords].map(e => [e.id, e])).values()];
        imported.history = [...new Map([...current.history, ...imported.history].map(e => [e.id, e])).values()].sort((a, b) => a.createdAt - b.createdAt).slice(-30);
        for (const type of ['help', 'blind', 'fusion']) imported.usage[type] = Math.max(current.usage[type], imported.usage[type]);
        imported.settings.analyticsConsent = current.settings.analyticsConsent === true;
        state.value = imported; persist();
      }
      notify('备份已合并，已有收藏仍保留。');
    }),
  };
}
