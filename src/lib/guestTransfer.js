import { GADGETS, OUTCOME_KINDS } from './game.js';

/** Bound guest imports below the API's 64 KB limit. The complete local backup stays intact. */
export function compactGuestState(source, maxBytes = 56000) {
  const known = new Map(GADGETS.map(g => [g.id, g]));
  const ids = values => Array.isArray(values) ? [...new Set(values.filter(id => known.has(id)))] : [];
  const collected = ids(source?.collected);
  const favorites = ids(source?.favorites).filter(id => collected.includes(id));
  const settings = Object.fromEntries(['sound', 'guideSeen', 'storageConsent', 'analyticsConsent'].map(key => [key, source?.settings?.[key] === true]));
  const history = Array.isArray(source?.history) ? source.history.slice(-30).filter(record => record && known.has(record.gadgetId) && typeof record.text === 'string').map(record => ({
    gadgetId: record.gadgetId, kind: OUTCOME_KINDS.includes(record.kind) ? record.kind : 'normal',
    title: typeof record.title === 'string' ? record.title.slice(0, 100) : '曾经的小小奇遇',
    text: record.text.slice(0, 1000), worry: typeof record.worry === 'string' ? record.worry.slice(0, 100) : '',
    strength: Math.max(0, Math.min(100, Number(record.strength) || 0)), createdAt: Number(record.createdAt) || 0,
  })) : [];
  const output = { collected, favorites, settings, history };
  const bytes = () => new TextEncoder().encode(JSON.stringify(output)).length;
  while (history.length && bytes() > maxBytes) history.shift();
  return output;
}
