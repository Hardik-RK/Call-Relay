import { createApp } from './app.ts';
import { isLoopbackBind, loadConfig } from './config.ts';

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
  if (config.accessKey === null && !isLoopbackBind(config.host)) {
    console.log(
      'Open on the network: anyone who can reach this port can queue calls. The phone still asks you to confirm each one. Set ACCESS_KEY to lock the page.',
    );
  }
});
