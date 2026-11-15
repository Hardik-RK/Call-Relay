import { createApp } from './app.ts';
import { loadConfig } from './config.ts';

let config;
try {
  config = loadConfig(process.env);
} catch (err) {
  console.error(`Configuration error: ${(err as Error).message}`);
  process.exit(1);
}

const { server } = createApp(config);
server.listen(config.port, config.host, () => {
  const shown = config.host.includes(':') ? `[${config.host}]` : config.host;
  console.log(`quick-dial listening on http://${shown}:${config.port}  (default country ${config.defaultCountry})`);
  if (config.accessKey === null) {
    console.log('No ACCESS_KEY set: fine on loopback, but do not expose this port to a network.');
  }
});
