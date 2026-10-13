const EVENTS = new Set(['visit', 'draw_help', 'draw_blind', 'use_normal', 'use_oops', 'use_chaos', 'use_surprise', 'fusion_success', 'fusion_failure', 'poster_download', 'poster_share', 'checkout_start', 'payment_confirmed', 'idea_submit']);
function failure(code, message, status = 400) { return Object.assign(new Error(message), { code, status }); }

/** Aggregate daily counts only. Worries, identities, IPs and event props are never stored. */
export function createTelemetry({ store, now = Date.now }) {
  return {
    record(_user, payload) {
      if (payload?.consent !== true) return { recorded: false };
      if (!EVENTS.has(payload.event)) throw failure('INVALID_EVENT', '统计事件无效。');
      if (payload.event === 'payment_confirmed') throw failure('SERVER_EVENT_ONLY', '支付结果由服务端确认。');
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(now()));
      store.db.prepare('INSERT INTO telemetry(day,event,count) VALUES(?,?,1) ON CONFLICT(day,event) DO UPDATE SET count=count+1').run(day, payload.event);
      return { recorded: true };
    },
    summary() {
      const since = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(now() - 29 * 86400000));
      const days = store.db.prepare('SELECT day,event,count FROM telemetry WHERE day>=? ORDER BY day DESC,event').all(since);
      const totals = Object.fromEntries([...EVENTS].map(key => [key, 0]));
      for (const row of days) totals[row.event] = (totals[row.event] || 0) + row.count;
      return { since, days, totals, note: '只包含自愿开启匿名统计的访问；计数不代表独立用户数。' };
    },
  };
}
