import { isCountryCode, SUPPORTED_COUNTRIES, type CountryCode } from './phone.ts';

export interface Config {
  host: string;
  port: number;
  defaultCountry: CountryCode;
  /** Shared secret for the web page; required when not bound to loopback. */
  accessKey: string | null;
  /** Host header values (without port) accepted in addition to loopback names. */
  allowedHosts: string[];
  /** JSON state file; null keeps everything in memory. */
  dataFile: string | null;
  commandTtlMs: number;
  /** Longest a phone long-poll is held open. */
  pollWaitMs: number;
}

const LOOPBACK_BINDS = new Set(['127.0.0.1', 'localhost', '::1']);

export function isLoopbackBind(host: string): boolean {
  return LOOPBACK_BINDS.has(host);
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const host = env.HOST?.trim() || '127.0.0.1';
  const port = Number(env.PORT?.trim() || '8787');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid PORT: ${env.PORT}`);

  const country = (env.DEFAULT_COUNTRY?.trim() || 'IN').toUpperCase();
  if (!isCountryCode(country)) {
    throw new Error(`Invalid DEFAULT_COUNTRY "${country}". Supported: ${SUPPORTED_COUNTRIES.join(', ')}`);
  }

  const accessKey = env.ACCESS_KEY?.trim() || null;
  if (accessKey !== null && accessKey.length < 12) {
    throw new Error('ACCESS_KEY must be at least 12 characters.');
  }
  if (!isLoopbackBind(host) && accessKey === null) {
    throw new Error(
      `HOST=${host} exposes the server beyond this machine, so ACCESS_KEY is required. ` +
        'Anyone who can reach the port could otherwise make the paired phone dial numbers.',
    );
  }

  const ttl = Number(env.COMMAND_TTL_SECONDS?.trim() || '120');
  if (!Number.isFinite(ttl) || ttl < 5) throw new Error('COMMAND_TTL_SECONDS must be a number >= 5');

  return {
    host,
    port,
    defaultCountry: country,
    accessKey,
    allowedHosts: (env.ALLOWED_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
    dataFile: env.DATA_FILE === undefined ? null : env.DATA_FILE.trim() || null,
    commandTtlMs: ttl * 1000,
    pollWaitMs: 25_000,
  };
}
