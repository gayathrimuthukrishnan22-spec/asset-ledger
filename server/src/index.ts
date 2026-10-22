// ======================================================
// File Name : index.ts
// Purpose   : Implements index
// ======================================================

import cors from 'cors';
import express from 'express';
import { booksRouter } from './routes/books.js';
import { assetsRouter } from './routes/assets.js';
import { dashboardRouter } from './routes/dashboard.js';
import { forecastingRouter, reportingRouter, usersRouter, configRouter } from './routes/misc.js';
import { authRouter } from './routes/auth.js';
import { chatRouter } from './routes/chat.js';
import { agentRouter } from './routes/agent.js';
import { lifecycleRouter } from './routes/lifecycle.js';
import { serviceRouter } from './routes/service.js';
import { integrationsRouter } from './routes/integrations.js';
import { modelingRouter } from './routes/modeling.js';
import { initStore, persistNow } from './data/assets.js';
import { initAssetTypeConfig } from './services/assetTypeConfig.js';
import { initRateTables } from './services/rateTables.js';
import { initBooks } from './services/books.js';
import { initBonusRates } from './services/bonusRates.js';
import { initFormOptions } from './services/formOptions.js';
import { initAssetClassLabels } from './services/assetClassLabels.js';
import { initRecoveryDefaults } from './services/recoveryDefaults.js';
import { assertSeedData } from './services/bootChecks.js';
import { pingPostgres } from './db/postgres.js';


// ======================================================
// START: index Functions
// ======================================================

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(cors());

// Machine-to-machine API (API-key protected, own bigger JSON limit) — mounted
// BEFORE the global express.json() so its larger body limit applies.
app.use('/api/service', serviceRouter);

app.use(express.json());

app.get('/api/health', async (_req, res) => {
  const postgres = await pingPostgres();
  res.status(postgres ? 200 : 503).json({ ok: postgres, postgres });
});

app.use('/api/dashboard', dashboardRouter);
app.use('/api/books', booksRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/lifecycle', lifecycleRouter);
app.use('/api/integrations', integrationsRouter);
app.use('/api/modeling', modelingRouter);
app.use('/api/forecasting', forecastingRouter);
app.use('/api/reporting', reportingRouter);
app.use('/api/config', configRouter);
app.use('/api/users', usersRouter);
app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);
app.use('/api/agent', agentRouter);

// ======================================================
// Function : start
// Purpose  : Boot sequence. Postgres must answer BEFORE the server
//            accepts traffic — the asset book is hydrated from it, so
//            starting without it would serve an empty register and
//            silently drop every write. Fail loud instead.
// ======================================================

async function start(): Promise<void> {
  const reachable = await pingPostgres();
  if (!reachable) {
    console.error(
      '\n[boot] Cannot reach Postgres. Check DATABASE_URL in server/.env\n' +
      '       Postgres (Neon) is the source of truth for the asset book.\n' +
      '       Apply the schema first:\n' +
      '         npm run db:schema:apply\n'
    );
    process.exit(1);
  }

  const rateTableCount = await initRateTables();
  console.log(`[boot] MACRS rate tables loaded from Postgres — ${rateTableCount} tables`);

  const assetTypeCount = await initAssetTypeConfig();
  console.log(`[boot] asset type config loaded from Postgres — ${assetTypeCount} types`);

  const bookCount = await initBooks();
  console.log(`[boot] books loaded from Postgres - ${bookCount} books`);

  const bonusRuleCount = await initBonusRates();
  console.log(`[boot] bonus depreciation rules loaded from Postgres - ${bonusRuleCount} rules`);

  await initFormOptions();
  await assertSeedData();
  await initAssetClassLabels();
  await initRecoveryDefaults();

  const { source, assetCount, schedulesBuilt } = await initStore();
  console.log(`[boot] asset book hydrated from ${source} — ${assetCount} assets, ${schedulesBuilt} schedules generated`);

  const server = app.listen(PORT, () => {
    console.log(`AssetLedger API listening on http://localhost:${PORT}`);
  });

  // Don't lose an in-flight write-behind flush on Ctrl-C.
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      server.close(() => {
        persistNow()
          .catch((err) => console.error('Final flush failed:', err))
          .finally(() => process.exit(0));
      });
    });
  }
}

start().catch((err) => {
  console.error('[boot] failed:', err);
  process.exit(1);
});

// ======================================================
// END: index Functions
// ======================================================

// ======================================================
// END OF FILE : index.ts
// ======================================================
