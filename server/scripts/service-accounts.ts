// ======================================================
// File Name : service-accounts.ts
// Purpose   : Command-line tool to manage Service API accounts (one per
//             calling system: ERP, billing, ...). Keys are shown ONCE at
//             creation / rotation — only a hash is stored.
// Run with  : npm run service-account -- <command> ...
//               create <name> [--events addition,adjustment|all] [--companies 5B,2D|all] [--expires YYYY-MM-DD]
//               list
//               disable <name>        enable <name>
//               rotate <name>         (new key; the old one stops working at once)
//               set-events <name> <addition,adjustment,...|all>
//               set-companies <name> <5B,2D,...|all>
//               set-expiry <name> <YYYY-MM-DD|none>
//             (on Render Shell: cd server && npx tsx scripts/service-accounts.ts list)
// ======================================================

import { pathToFileURL } from 'node:url';
import { pool } from '../src/db/postgres.js';
import {
  createAccount, listAccounts, parseCompanies, parseEvents, rotateKey, setCompanies, setEnabled, setEvents, setExpiry
} from '../src/services/serviceAccounts.js';
import type { ServiceAccount } from '../src/services/serviceAccounts.js';

const USAGE = `Usage: npm run service-account -- <command>
  create <name> [--events addition,adjustment|all] [--companies 5B,2D|all] [--expires YYYY-MM-DD]
  list
  disable <name>      enable <name>
  rotate <name>
  set-events <name> <addition,adjustment,...|all>
  set-companies <name> <5B,2D,...|all>
  set-expiry <name> <YYYY-MM-DD|none>`;

function parseDate(v: string): Date | null {
  if (v === 'none') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new Error('Date must be YYYY-MM-DD (or "none").');
  return new Date(`${v}T23:59:59Z`); // valid through the end of that day (UTC)
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const describe = (a: ServiceAccount) =>
  `${a.name}  events: ${a.allowedEvents.length ? a.allowedEvents.join(', ') : 'ALL'}  ` +
  `companies: ${a.allowedCompanies.length ? a.allowedCompanies.join(', ') : 'ALL'}  ` +
  `${a.enabled ? 'enabled' : 'DISABLED'}  expires: ${a.expiresAt ? a.expiresAt.toISOString().slice(0, 10) : 'never'}`;

function showKey(key: string) {
  console.log('\nAPI key (copy it now - it cannot be shown again):\n');
  console.log(`  ${key}\n`);
  console.log('The caller sends it in the  x-api-key  header.');
}

export async function main(argv: string[]): Promise<void> {
  const [cmd, name, ...rest] = argv;

  switch (cmd) {
    case 'create': {
      if (!name) throw new Error('create needs a name.\n' + USAGE);
      const events = parseEvents(flag(rest, '--events'));
      const companies = parseCompanies(flag(rest, '--companies'));
      const expiresRaw = flag(rest, '--expires');
      const { account, key } = await createAccount({ name, events, companies, expiresAt: expiresRaw ? parseDate(expiresRaw) : null });
      console.log(`Created service account: ${describe(account)}`);
      showKey(key);
      break;
    }
    case 'list': {
      const all = await listAccounts();
      if (all.length === 0) { console.log('No service accounts yet. Create one with: npm run service-account -- create <name>'); break; }
      for (const a of all) {
        console.log(`${describe(a)}  key: ${a.keyPrefix}…  last used: ${a.lastUsedAt ? a.lastUsedAt.toISOString().slice(0, 16).replace('T', ' ') : 'never'}`);
      }
      break;
    }
    case 'disable':
    case 'enable': {
      if (!name) throw new Error(`${cmd} needs a name.\n` + USAGE);
      console.log(`Updated: ${describe(await setEnabled(name, cmd === 'enable'))}`);
      break;
    }
    case 'rotate': {
      if (!name) throw new Error('rotate needs a name.\n' + USAGE);
      const { account, key } = await rotateKey(name);
      console.log(`Rotated key for: ${describe(account)}\nThe previous key no longer works.`);
      showKey(key);
      break;
    }
    case 'set-events': {
      if (!name || !rest[0]) throw new Error('set-events needs a name and a list.\n' + USAGE);
      console.log(`Updated: ${describe(await setEvents(name, parseEvents(rest[0])))}`);
      break;
    }
    case 'set-companies': {
      if (!name || !rest[0]) throw new Error('set-companies needs a name and a list.\n' + USAGE);
      console.log(`Updated: ${describe(await setCompanies(name, parseCompanies(rest[0])))}`);
      break;
    }
    case 'set-expiry': {
      if (!name || !rest[0]) throw new Error('set-expiry needs a name and a date (or "none").\n' + USAGE);
      console.log(`Updated: ${describe(await setExpiry(name, parseDate(rest[0])))}`);
      break;
    }
    default:
      console.log(USAGE);
  }
}

// Run only when executed directly (not when imported by a test).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .catch((err) => { console.error(`Error: ${err instanceof Error ? err.message : err}`); process.exitCode = 1; })
    .finally(() => pool.end());
}

// ======================================================
// END OF FILE : service-accounts.ts
// ======================================================
