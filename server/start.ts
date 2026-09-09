import { createApiServer, type RpcHandler } from './api';

export async function startApiServer(handlers: Readonly<Record<string, RpcHandler>>) {
  const databasePath = process.env.QINGUAN_DATABASE_PATH;
  if (!databasePath) throw new Error('QINGUAN_DATABASE_PATH is required');
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const api = await createApiServer({
    databasePath,
    setupKey: process.env.QINGUAN_SETUP_KEY,
    allowedOrigins: (process.env.QINGUAN_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean),
    handlers,
  });
  await new Promise<void>((done, reject) => {
    api.server.once('error', reject);
    api.server.listen(port, '0.0.0.0', () => { api.server.off('error', reject); done(); });
  });
  console.log(`QinGuan shared API listening on port ${port}`);
  const stop = () => { void api.close().then(() => process.exit(0)).catch(() => process.exit(1)); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  return api;
}
