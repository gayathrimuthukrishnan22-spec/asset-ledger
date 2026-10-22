// ======================================================
// File Name : ui.jsx
// Purpose   : Reusable UI component: ui
// ======================================================


// ======================================================
// START: Component Functions
// ======================================================

// ======================================================
// Function : StatCard
// Purpose  : React component that renders the 'StatCard' UI
// ======================================================

export function StatCard({ label, value, icoClass, icon, delta, deltaDirection }) {
    return (<div className="card card-pad stat">
      <div className="top">
        <span className="label">{label}</span>
        {icon && <span className={`ico-box ${icoClass ?? ''}`}>{icon}</span>}
      </div>
      <div className="value">{value}</div>
      {delta && <div className={`delta ${deltaDirection ?? ''}`}>{delta}</div>}
    </div>);
}

// ======================================================
// END: StatCard
// ======================================================
// ======================================================
// Function : Pill
// Purpose  : React component that renders the 'Pill' UI
// ======================================================

export function Pill({ tone, children }) {
    return <span className={`pill pill-${tone}`}>{children}</span>;
}

// ======================================================
// END: Pill
// ======================================================
// ======================================================
// Function : BarsChart
// Purpose  : React component that renders the 'BarsChart' UI
// ======================================================

const FILL_BASE_COLOR = '#2563eb';

// ======================================================
// Function : niceAxisMax
// Purpose  : Rounds the largest value up to a clean axis top (1/2/5 x
//            a power of ten), so bars are measured against a fixed
//            scale starting at zero instead of against each other.
//            The old chart normalized every bar against the tallest
//            bar in the set — which meant six identical months all
//            rendered at 100%, making a flat series look like a full
//            chart and a near-zero series look healthy.
// ======================================================

function niceAxisMax(max) {
    if (!(max > 0)) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(max)));
    const n = max / pow;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * pow;
}

// ======================================================
// Function : axisMoney
// Purpose  : Compact dollar label for the y-axis ticks.
// ======================================================

function axisMoney(n) {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `$${(n / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`;
    if (abs >= 1e6) return `$${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
    if (abs >= 1e3) return `$${(n / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}K`;
    return `$${Math.round(n)}`;
}

// ======================================================
// Function : mixWithWhite
// Purpose  : Mixes a base hex colour with white by weight (0 = white, 1 = full colour) for chart shading.
// ======================================================
// mix base hex color with white according to weight (0 = white, 1 = full base color)
function mixWithWhite(hex, weight) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const wr = Math.round(r * weight + 255 * (1 - weight));
    const wg = Math.round(g * weight + 255 * (1 - weight));
    const wb = Math.round(b * weight + 255 * (1 - weight));
    return `rgb(${wr}, ${wg}, ${wb})`;
}

// ======================================================
// Function : BarsChart
// Purpose  : Monthly Depreciation Expense bars, measured in DOLLARS
//            against a zero-based axis with labelled gridlines. Each
//            bar prints its own amount, so a genuinely flat month-over-
//            month series reads as "steady at $162.2K" instead of as a
//            broken/empty card.
// ======================================================

export function BarsChart({ data, height = 200, emptyLabel = 'No depreciation recorded for this period' }) {
        if (!data || data.length === 0) return null;

        const values = data.map((d) => Number(d.value) || 0);
        const maxValue = Math.max(...values, 0);

        if (maxValue <= 0) {
            return (<div className="bars-chart-empty" style={{ height }}>{emptyLabel}</div>);
        }

        const axisMax = niceAxisMax(maxValue);
        const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => ({ frac: f, label: axisMoney(axisMax * f) }));

        return (<div className="bars-chart-wrap">
            <div className="bars-axis" style={{ height }}>
                {ticks.map((t) => (<div className="tick" key={t.frac}><span>{t.label}</span></div>))}
            </div>
            <div className="bars-chart-scroll">
              <div className="bars-chart" style={{ height }}>
                {ticks.map((t) => (<div className="gridline" key={t.frac} style={{ bottom: `${t.frac * 100}%` }} />))}
                {data.map((d) => {
                        const value = Number(d.value) || 0;
                        const ratio = Math.max(0, Math.min(1, value / axisMax));
                        const fillPct = value > 0 ? Math.max(1.5, ratio * 100) : 0;
                        const dimFactor = d.projected || d.dim ? 0.55 : 1;
                        const fillColor = mixWithWhite(FILL_BASE_COLOR, Math.max(0.45, ratio));
                        const label = d.valueLabel ?? axisMoney(value);
                        const title = [
                            `${d.month}: ${label}`,
                            d.assetCount != null ? `${d.assetCount} asset${d.assetCount === 1 ? '' : 's'} depreciating` : null,
                            d.deltaPct != null ? `${d.deltaPct > 0 ? '+' : ''}${d.deltaPct}% vs prior month` : null,
                            d.projected ? 'Projected' : null
                        ].filter(Boolean).join(' · ');

                        return (<div className="col" key={d.month} title={title}>
                            <div className="val-label">{label}</div>
                            <div className="box" style={{ opacity: dimFactor }}>
                                <div
                                    className="fill"
                                    style={{ height: `${fillPct}%`, background: fillColor }}
                                />
                            </div>
                            <div className="cap">{d.month}</div>
                        </div>);
                    })}
              </div>
            </div>
        </div>);
}

// ======================================================
// END: BarsChart
// ======================================================
// ======================================================
// Function : Donut
// Purpose  : React component that renders the 'Donut' UI
// ======================================================

export function Donut({ segments, size = 150 }) {
    let acc = 0;
    const stops = segments
        .map((s) => {
        const start = acc;
        acc += s.pct;
        return `${s.color} ${start}% ${acc}%`;
    })
        .join(', ');
    return (<div style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: `conic-gradient(${stops})`
        }}/>);
}

// ======================================================
// END: Donut
// ======================================================

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : ui.jsx
// ======================================================
