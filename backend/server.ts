import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
const server = createApp().listen(port, '127.0.0.1', () => {
  console.log(`Airport API listening at http://127.0.0.1:${port}`);
});
server.on('error', error => { console.error(error); process.exitCode = 1; });
