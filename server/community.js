import { randomUUID } from 'node:crypto';
import { GADGETS } from '../src/lib/game.js';

function failure(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}
function text(value, max, label, optional = false) {
  if (optional && (value == null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw failure('INVALID_IDEA', `${label}请填写1–${max}个字。`);
  return value.trim();
}
function publicIdea(idea) {
  const { id, name, effect, warning, parentIds, authorName, createdAt, approvedAt } = idea;
  return { id, name, effect, warning, parentIds, authorName, createdAt, approvedAt, status: 'approved', contributorBadge: '口袋创想家' };
}

/** Submissions become public only after an operator explicitly approves them. */
export function createCommunity({ store, now = Date.now, config = {} }) {
  const adminIds = Array.isArray(config.adminUserIds) ? config.adminUserIds : String(process.env.ADMIN_USER_IDS || '').split(',').filter(Boolean);
  function requireAdmin(user) {
    if (!user || !adminIds.includes(user.id)) throw failure('FORBIDDEN', '仅管理员可以审核脑洞。', 403);
  }
  return {
    listPublic(params = {}) {
      const limit = Math.max(1, Math.min(100, Number(params.limit) || 50));
      return store.listIdeas({ status: 'approved', limit }).map(publicIdea);
    },
    listMine(user) {
      if (!user) throw failure('UNAUTHORIZED', '登录后查看自己的投稿。', 401);
      return store.listIdeas({ userId: user.id, limit: 100 }).map(({ userId, ...idea }) => idea);
    },
    submit(user, payload) {
      if (!user) throw failure('UNAUTHORIZED', '登录后才能把脑洞寄到事务所。', 401);
      const name = text(payload?.name, 24, '道具名称');
      const effect = text(payload?.effect, 160, '正面效果');
      const warning = text(payload?.warning, 160, '乌龙副作用');
      if (/哆啦A梦|机器猫|四次元口袋|任意门/i.test(name)) throw failure('ORIGINAL_NAME_REQUIRED', '请给道具起一个原创名字。');
      const parentIds = Array.isArray(payload.parentIds) ? [...new Set(payload.parentIds)] : [];
      if (![0, 2].includes(parentIds.length) || parentIds.some(id => typeof id !== 'string')) throw failure('INVALID_PARENTS', '请选择两件不同的道具，或提交一个独立脑洞。');
      const state = store.getState(user.id);
      const known = [...GADGETS, ...(state?.customGadgets || [])];
      if (parentIds.some(id => !state?.collected?.includes(id) || !known.some(g => g.id === id))) throw failure('GADGET_NOT_OWNED', '只能使用已发现的道具作为合体原料。');
      const time = now();
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(time));
      return store.transact(() => {
        const today = store.listIdeas({ userId: user.id, limit: 100 }).filter(idea => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(idea.createdAt)) === day);
        if (today.length >= 3) throw failure('IDEA_LIMIT', '每天可以寄出3个脑洞，明天再来吧。', 429);
        const idea = { id: randomUUID(), userId: user.id, name, effect, warning, parentIds, authorName: String(user.nickname || '口袋旅人').slice(0, 40), status: 'pending', reason: '', createdAt: time };
        store.putIdea(idea);
        const { userId, ...safe } = idea;
        return safe;
      });
    },
    listPending(user) { requireAdmin(user); return store.listIdeas({ status: 'pending', limit: 100 }); },
    moderate(user, id, payload) {
      requireAdmin(user);
      if (!['approved', 'rejected'].includes(payload?.status)) throw failure('INVALID_REVIEW', '审核结果应为通过或退回。');
      const reason = text(payload.reason, 160, '审核备注', true);
      return store.transact(() => {
        const idea = store.getIdea(id);
        if (!idea) throw failure('NOT_FOUND', '这个脑洞已经找不到了。', 404);
        if (idea.status !== 'pending') throw failure('ALREADY_REVIEWED', '这个脑洞已经审核过了。', 409);
        return store.updateIdea(id, { status: payload.status, reason, reviewedAt: now(), ...(payload.status === 'approved' ? { approvedAt: now() } : {}) });
      });
    },
  };
}
