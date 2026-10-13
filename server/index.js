import { resolve } from 'node:path';
import { createApp } from './app.js';
import { createProviders } from './providers.js';

const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
const app = createApp({
  dbPath: process.env.DATABASE_PATH || resolve('data/pocket.sqlite'),
  providers: createProviders({ env: process.env }),
  config: {
    authSecret: process.env.AUTH_SECRET,
    appOrigins: process.env.APP_ORIGINS,
    publicAppUrl: process.env.PUBLIC_APP_URL || process.env.PUBLIC_SITE_URL,
    adminUserIds: process.env.ADMIN_USER_IDS,
    trustProxy: process.env.TRUST_PROXY === 'true',
    timeZone: process.env.TZ || 'Asia/Shanghai',
    staticDir: process.env.SERVE_STATIC === 'false' ? null : resolve('dist'),
    basePath: process.env.BASE_PATH || '',
    repairPriceCents: process.env.REPAIR_PRICE_CENTS,
    imageLimit: process.env.MAX_IMAGE_REQUESTS_PER_DAY,
    memberImageLimit: process.env.MAX_MEMBER_IMAGE_REQUESTS_PER_DAY,
  },
});
await app.controllersReady;
app.server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`Pocket server listening on port ${port}`));
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  if (stopping) return;
  stopping = true;
  await app.close();
  process.exit(0);
});
