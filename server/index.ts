import { startApiServer } from './start';

// The application owner supplies the explicit RPC registry here.
void startApiServer({}).catch(() => {
  console.error('Shared API startup failed. Verify the database path and service configuration.');
  process.exitCode = 1;
});
