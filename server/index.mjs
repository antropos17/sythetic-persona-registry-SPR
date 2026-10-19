import { createApp } from './app.mjs';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4176);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535');
const app = createApp();
app.server.listen(port, host, () => console.log(`SPR listening on http://${host}:${app.server.address().port}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    try { await app.close(); process.exitCode = 0; }
    catch (error) { console.error(error); process.exitCode = 1; }
  });
}
