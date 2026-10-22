// ======================================================
// File Name : guide.js
// Purpose   : "How do I...?" answers for the chat assistant, written from the
//             real menu, routes and forms of this app.
// ======================================================

export const GUIDE = [
  {
    id: 'map',
    keys: ['menu', 'pages', 'modules', 'project', 'overview', 'what can', 'where is everything', 'sections'],
    title: 'Project map',
    text: `Left menu:
- Dashboard: portfolio totals and monthly depreciation
- Asset Register: list, search, export, add assets
- Asset Detail: full record of one asset
- Lifecycle Events: addition, adjustment, transfer, retirement, reinstatement, reclassification
- Bulk Import: post many events from a CSV
- Planning: Modeling, Forecasting
- Compliance: Reporting
- Configuration: Pub 946 Tables, Bonus Depreciation, Asset Classes, Books List
- Administration: User Management`,
    link: { label: 'Open Dashboard', to: '/' }
  },
  {
    id: 'add',
    keys: ['add asset', 'new asset', 'add new', 'create asset', 'capitalize', 'addition', 'add an asset'],
    title: 'Add a new asset',
    text: `Option 1 (single asset):
1. Open Asset Register from the left menu.
2. Click "+ Add Asset" (top right) - it opens the Addition form in Lifecycle Events.
3. Fill in the form, calculate the preview and post it.

Option 2 (as a posted event):
1. Open Lifecycle Events and choose "Addition".
2. Pick the Asset Class (it auto-fills property type, method, rate %, life and bonus %).
3. Enter Asset Cost, Placed-In-Service Date and Accounting Period Date, then post.

You need edit access for this. Many assets at once: use Bulk Import.`,
    link: { label: 'Go to Add Asset', to: '/lifecycle?type=addition' }
  },
  {
    id: 'adjust',
    keys: ['adjust', 'adjustment', 'correct cost', 'change cost', 'increase cost', 'decrease cost'],
    title: 'Adjust an asset',
    text: `1. Open Lifecycle Events and choose "Adjustment".
2. Select the asset.
3. Enter Original Asset Cost, PISD, Existing Accum Depr (BOY), Prior Adjustment Balance.
4. Enter the Adjustment Amount (use a minus sign to reduce), plus Effective Date and Accounting Period Date.
5. Check Convention, Quarter and Bonus %, then post the event.`,
    link: { label: 'Open Lifecycle Events', to: '/lifecycle' }
  },
  {
    id: 'retire',
    keys: ['retire', 'retirement', 'dispose', 'disposal', 'sell asset', 'scrap', 'write off'],
    title: 'Retire (dispose of) an asset',
    text: `1. Open Lifecycle Events and choose "Retirement".
2. Select the asset.
3. Check Asset Cost, PISD, Convention, Quarter, Bonus % and BOY Accumulated Depr.
4. Enter Disposal Date, Accounting Period Date, Cost Disposed and Proceeds (sale amount).
5. Post the event. The asset status changes to Retired.

Retired by mistake? Use "Reinstatement" to bring it back.`,
    link: { label: 'Open Lifecycle Events', to: '/lifecycle' }
  },
  {
    id: 'reinstate',
    keys: ['reinstate', 'reinstatement', 'undo retire', 'bring back', 'restore asset'],
    title: 'Reinstate a retired asset',
    text: `1. Open Lifecycle Events and choose "Reinstatement".
2. Select the retired asset (fields are pre-filled from its record).
3. Confirm Original Disposal Date, A/D at Disposal, Original Gain/Loss.
4. Enter Reinstatement Date and Accounting Period, then post.`,
    link: { label: 'Open Lifecycle Events', to: '/lifecycle' }
  },
  {
    id: 'transfer',
    keys: ['transfer', 'move asset', 'change location', 'change company'],
    title: 'Transfer an asset',
    text: `1. Open Lifecycle Events and choose "Transfer".
2. Select the asset.
3. Enter Cost Transferred, Transfer Date and Accounting Period.
4. Fill Source and Dest Company, and Source and Dest Location, then post.`,
    link: { label: 'Open Lifecycle Events', to: '/lifecycle' }
  },
  {
    id: 'reclass',
    keys: ['reclass', 'reclassification', 'change class', 'change asset class', 'change method'],
    title: 'Reclassify an asset',
    text: `1. Open Lifecycle Events and choose "Reclassification".
2. Select the asset.
3. Enter the Old Asset Type, Old Method, Old Life, Old Convention and Old Bonus %, then the new class details.
4. Post the event.`,
    link: { label: 'Open Lifecycle Events', to: '/lifecycle' }
  },
  {
    id: 'bulk',
    keys: ['bulk', 'import', 'csv', 'upload', 'many assets at once', 'excel'],
    title: 'Bulk import',
    text: `1. Open Bulk Import (Asset Management group), or use "Master Data Set" inside Lifecycle Events.
2. Download the CSV template.
3. Fill one row per transaction. The eventType column must be one of: Addition, Adjustment, Transfer, Retirement, Reinstatement, Reclassification.
4. Upload the file, fix any warnings, then post all.`,
    link: { label: 'Open Bulk Import', to: '/lifecycle/bulk-import' }
  },
  {
    id: 'find',
    keys: ['find asset', 'search', 'filter', 'look up', 'asset detail', 'view asset', 'export'],
    title: 'Find or export assets',
    text: `Open Asset Register. Use Search (asset number or description) and the Asset Class, Company and Status filters. "Export CSV" downloads the list (or only the rows you ticked). Click an asset to open its Asset Detail page.`,
    link: { label: 'Open Asset Register', to: '/assets' }
  },
  {
    id: 'reports',
    keys: ['report', 'reporting', 'forecast', 'forecasting', 'modeling', 'model', 'what if'],
    title: 'Reports, modeling and forecasting',
    text: `Reporting (Compliance) has the depreciation reports. Modeling and Forecasting (Planning) let you test scenarios and project future depreciation. The Dashboard shows monthly depreciation by book.`,
    link: { label: 'Open Reporting', to: '/reporting' }
  },
  {
    id: 'config',
    keys: ['configuration', 'config', 'asset class', 'asset classes', 'pub 946', 'bonus', 'books', 'book list', 'setup', 'settings'],
    title: 'Configuration',
    text: `Under Configuration: Asset Classes (class rates and life), Pub 946 Tables (MACRS rate tables), Bonus Depreciation (bonus % by period) and Books List (Federal Tax and other books). Changes here affect new events, so set them before posting assets.`,
    link: { label: 'Open Asset Classes', to: '/configuration/asset-classes' }
  },
  {
    id: 'users',
    keys: ['user', 'users', 'role', 'permission', 'access', 'invite'],
    title: 'Users and access',
    text: `Administration > User Management lets an admin add users and set what each role can view or edit. If a page or button is missing for you, your role does not have access.`,
    link: { label: 'Open User Management', to: '/users' }
  }
];

const HOW_WORDS = /\b(how|where|steps?|way to|procedure|process|guide|help|navigate|go to|menu|pages?|modules?)\b/;
const ACTION_WORDS = /\b(add|create|new|adjust\w*|retire|retirement|dispose|transfer|reinstate\w*|reclass\w*|import|upload|export|capitalize)\b/;

export function isGuideQuestion(message) {
  const t = message.toLowerCase();
  if (HOW_WORDS.test(t)) return true;
  // A command carrying specifics (asset number, amount, date) or a longer sentence is a TASK
  // for the AI agent, not a how-to. Without this, "retire asset 009 ..." was answered by the
  // static guide and never reached the agent.
  if (/\d/.test(t) || t.trim().split(/\s+/).length > 6) return false;
  return ACTION_WORDS.test(t);
}

export function findGuide(message) {
  const t = message.toLowerCase();
  let best = null, bestScore = 0;
  for (const g of GUIDE) {
    const score = g.keys.reduce((s, k) => (new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(t) ? s + k.length : s), 0);
    if (score > bestScore) { best = g; bestScore = score; }
  }
  return best;
}

// ------------------------------------------------------
// Related follow-up questions: after an answer, the chat shows these as
// clickable chips. Keys are guide ids (above) or data topics (data-*).
// ------------------------------------------------------
const FOLLOW_UPS = {
  add: ['How to bulk import assets?', 'How to adjust an asset?', 'How to find or export assets?', 'How many assets do we have?'],
  adjust: ['How to retire an asset?', 'How to transfer an asset?', 'How to reclassify an asset?', 'How to add a new asset?'],
  retire: ['How to reinstate a retired asset?', 'Show retired assets', 'How to adjust an asset?', 'How to transfer an asset?'],
  reinstate: ['How to retire an asset?', 'Show retired assets', 'How to adjust an asset?', 'How to add a new asset?'],
  transfer: ['How to reclassify an asset?', 'How to retire an asset?', 'How to adjust an asset?', 'How to find or export assets?'],
  reclass: ['How to transfer an asset?', 'How to adjust an asset?', 'What is in Configuration?', 'How to retire an asset?'],
  bulk: ['How to add a new asset?', 'How to find or export assets?', 'How to adjust an asset?', 'How to retire an asset?'],
  find: ['How to add a new asset?', 'Show retired assets', 'How many assets do we have?', 'How to bulk import assets?'],
  reports: ['What is in Configuration?', 'How many assets do we have?', 'What is the net book value?', 'Show me the project map'],
  config: ['How to add a new asset?', 'Tell me about reports and forecasting', 'Who can access which pages?', 'How to bulk import assets?'],
  users: ['Show me the project map', 'What is in Configuration?', 'How to add a new asset?', 'How many assets do we have?'],
  map: ['How to add a new asset?', 'How to retire an asset?', 'How to bulk import assets?', 'Tell me about reports and forecasting'],
  'data-count': ['What is the net book value?', 'Show retired assets', 'Show fully depreciated assets', 'How to add a new asset?'],
  'data-retired': ['How to reinstate a retired asset?', 'How many assets do we have?', 'Show fully depreciated assets', 'How to retire an asset?'],
  'data-status': ['How many assets do we have?', 'Show retired assets', 'What is the net book value?', 'How to find or export assets?'],
  'data-nbv': ['How many assets do we have?', 'Show retired assets', 'Tell me about reports and forecasting', 'How to adjust an asset?'],
  'data-asset': ['How to adjust an asset?', 'How to transfer an asset?', 'How to retire an asset?', 'How many assets do we have?'],
  default: ['How many assets do we have?', 'How to add a new asset?', 'How to retire an asset?', 'Show retired assets']
};

// Works out which topic a user message belongs to.
function topicOf(message) {
  const t = message.toLowerCase();
  if (isGuideQuestion(t)) { const g = findGuide(t); if (g) return g.id; }
  if (/^[a-z0-9-]*\d[a-z0-9-]*$/.test(t.trim())) return 'data-asset';
  if (/retired/.test(t)) return 'data-retired';
  if (/(fully depreciated|under review|transferred|active)/.test(t)) return 'data-status';
  if (/(net book|nbv|book value|cost|depreciation)/.test(t)) return 'data-nbv';
  if (/(how many|total|count|summary|assets)/.test(t)) return 'data-count';
  return 'default';
}

// Returns up to 4 related questions for the last thing the user asked,
// skipping any question already asked in this chat.
export function relatedQuestions(message, alreadyAsked = []) {
  const asked = new Set(alreadyAsked.map((q) => q.trim().toLowerCase()));
  const pool = [...FOLLOW_UPS[topicOf(message)], ...FOLLOW_UPS.default, ...FOLLOW_UPS.add];
  const out = [];
  for (const q of pool) {
    if (!asked.has(q.toLowerCase()) && !out.includes(q)) out.push(q);
    if (out.length === 4) break;
  }
  return out;
}
// ======================================================
// END OF FILE : guide.js
// ======================================================
