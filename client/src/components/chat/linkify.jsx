// ======================================================
// File Name : linkify.jsx
// Purpose   : Turns chat answers into clickable text:
//             asset numbers -> Asset Detail, totals -> Dashboard,
//             menu / page names -> that page.
// ======================================================

const PAGES = [
  ['Lifecycle Events', '/lifecycle'],
  ['Bulk Import', '/lifecycle/bulk-import'],
  ['Asset Register', '/assets'],
  ['Add Asset', '/lifecycle?type=addition'],
  ['Pub 946 Tables', '/configuration/pub946'],
  ['Bonus Depreciation', '/configuration/bonus-depreciation'],
  ['Asset Classes', '/configuration/asset-classes'],
  ['Books List', '/configuration/books'],
  ['User Management', '/users'],
  ['Forecasting', '/forecasting'],
  ['Modeling', '/modeling'],
  ['Reporting', '/reporting'],
  ['Dashboard', '/']
];

const PAGE_MAP = Object.fromEntries(PAGES.map(([label, to]) => [label, to]));
const PAGE_RE = PAGES.map(([label]) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
// A page name, or an asset number of 6+ digits.
const TOKEN_RE = new RegExp(`(${PAGE_RE})|\\b(\\d{6,})\\b`, 'g');

const ACTIVE_LINE = /^Active assets\b/i;
const TOTAL_LINE = /^(Active assets|Gross cost|Net book value|Accumulated depreciation)\b/i;
const LIST_ITEM = /^([A-Za-z0-9][A-Za-z0-9-]*)( - .*)$/;
const COUNT_LINE = /^\d+ [a-z ]*asset\(s\):/i;

function Link({ to, go, children, title }) {
  return (<button type="button" className="chat-a" title={title} onClick={() => go(to)}>{children}</button>);
}

function lineNodes(line, go, key) {
  // "Active assets: 10" opens the Asset Register with the same 10 rows
  // (the dashboard count = every asset that is not Retired).
  if (ACTIVE_LINE.test(line)) {
    return <Link key={key} to="/assets?exclude=Retired" go={go} title="Open these assets in the Asset Register">{line}</Link>;
  }
  // Other totals: whole line opens the Dashboard
  if (TOTAL_LINE.test(line)) {
    return <Link key={key} to="/" go={go} title="Open Dashboard">{line}</Link>;
  }
  // "10 retired asset(s):" opens the Asset Register
  if (COUNT_LINE.test(line)) {
    return <Link key={key} to="/assets" go={go} title="Open Asset Register">{line}</Link>;
  }
  // "845862189 - Network Rack ..." opens that asset
  const item = line.match(LIST_ITEM);
  if (item) {
    return (<span key={key}>
      <Link to={`/assets/${encodeURIComponent(item[1])}`} go={go} title="Open asset detail">{item[1]}</Link>{item[2]}
    </span>);
  }
  // Anything else: link page names and asset numbers inside the sentence
  const out = [];
  let last = 0, m, n = 0;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    if (m[1]) out.push(<Link key={`${key}-${n++}`} to={PAGE_MAP[m[1]]} go={go} title={`Open ${m[1]}`}>{m[1]}</Link>);
    else out.push(<Link key={`${key}-${n++}`} to={`/assets/${m[2]}`} go={go} title="Open asset detail">{m[2]}</Link>);
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return <span key={key}>{out}</span>;
}

export function renderRich(text, go) {
  return String(text ?? '').split('\n').map((line, i, arr) => (
    <span key={i}>{lineNodes(line, go, i)}{i < arr.length - 1 ? '\n' : ''}</span>
  ));
}
