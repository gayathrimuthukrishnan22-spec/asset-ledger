// ======================================================
// File Name : ChatWidget.jsx
// Purpose   : Floating robot button (bottom-right) that opens the AI agent chat.
//             When the agent prepares a lifecycle event it shows a preview card;
//             nothing is posted until the user clicks Confirm.
// ======================================================

import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { findGuide, isGuideQuestion, relatedQuestions } from './guide';
import { renderRich } from './linkify';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import './chat.css';

const SUGGESTIONS = ['How many assets do we have?', 'How to add a new asset?', 'How to retire an asset?', 'Show retired assets'];
// Starter chips for the AI Agent (second icon).
const AGENT_SUGGESTIONS = ['Give me a site update', 'Show recent lifecycle activity', 'Forecast the next 3 years', 'Latest bonus depreciation rules (web)'];


const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');

// Used when /api/chat is not available on the server: answers from the
// dashboard and assets endpoints that every version of the server already has.
async function answerFromExistingApis(message, assetNumber) {
    const t = message.toLowerCase();
    if (isGuideQuestion(t)) {
        const g = findGuide(t);
        if (g) return { text: `${g.title}\n\n${g.text}`, link: g.link };
    }
    const bare = message.trim().match(/^[A-Za-z0-9-]*\d[A-Za-z0-9-]*$/)?.[0];
    const num = message.match(/\b\d{6,}\b/)?.[0] ?? bare ?? assetNumber;
    if (num) {
        const a = await api.get(`/assets/${num}`).catch(() => null);
        if (a && (a.assetNumber || a.asset?.assetNumber)) {
            const x = a.asset || a;
            return `${x.assetNumber} - ${x.description}\nClass: ${x.assetClass} | Status: ${x.status}\nCost ${money(x.cost)}, Accumulated depreciation ${money(x.accumDepreciation)}, Net book value ${money(x.nbv)}.`;
        }
    }
    if (bare) return `No asset found with number ${bare}. Open the Asset Register to search.`;
    const statuses = ['Retired', 'Fully Depreciated', 'Under Review', 'Transferred', 'Active'];
    const status = statuses.find((st) => t.includes(st.toLowerCase()));
    if (status) {
        const r = await api.get(`/assets?status=${encodeURIComponent(status)}`);
        const items = r.items || [];
        if (!items.length) return `There are no ${status.toLowerCase()} assets.`;
        return `${items.length} ${status.toLowerCase()} asset(s):\n` + items.slice(0, 6).map((a) => `${a.assetNumber} - ${a.description} (${money(a.cost)})`).join('\n');
    }
    if (/(how many|total|count|summary|dashboard|net book|nbv|book value|cost|depreciation|assets)/.test(t)) {
        const s = await api.get('/dashboard/summary');
        return `Active assets: ${s.totalAssets}\nGross cost: ${money(s.grossCost)}\nNet book value: ${money(s.netBookValue)}\nAccumulated depreciation: ${money(s.ytdDepreciation)}`;
    }
    const r = await api.get(`/assets?q=${encodeURIComponent(message)}`).catch(() => null);
    if (r?.items?.length) return `Found ${r.total} matching asset(s):\n` + r.items.slice(0, 6).map((a) => `${a.assetNumber} - ${a.description}`).join('\n');
    return 'I could not find data for that. Try "how many assets", "net book value", "retired assets", or type an asset number.';
}

function RobotIcon({ size = 30 }) {
    return (<svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <line x1="16" y1="3" x2="16" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="16" cy="3" r="1.8" fill="currentColor"/>
      <rect x="5" y="7" width="22" height="17" rx="5" fill="currentColor"/>
      <circle cx="12" cy="15" r="2.6" fill="var(--robot-eye, #2563eb)"/>
      <circle cx="20" cy="15" r="2.6" fill="var(--robot-eye, #2563eb)"/>
      <rect x="12" y="19.5" width="8" height="1.8" rx="0.9" fill="var(--robot-eye, #2563eb)"/>
      <rect x="2" y="12" width="2.5" height="6" rx="1.2" fill="currentColor"/>
      <rect x="27.5" y="12" width="2.5" height="6" rx="1.2" fill="currentColor"/>
      <rect x="10" y="25" width="12" height="3" rx="1.5" fill="currentColor"/>
    </svg>);
}

// Sparkle icon for the AI Agent launcher (sits beside the robot).
function AgentIcon({ size = 28 }) {
    return (<svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M13 4l2.4 6.6L22 13l-6.6 2.4L13 22l-2.4-6.6L4 13l6.6-2.4z" fill="currentColor"/>
      <path d="M24 17l1.4 3.6L29 22l-3.6 1.4L24 27l-1.4-3.6L19 22l3.6-1.4z" fill="currentColor"/>
    </svg>);
}

// variant 'assistant' = the original robot (guide + /api/chat); 'agent' = LLM agent (/api/agent, web search).
export function ChatWidget({ variant = 'assistant', open, setOpen }) {
    const isAgent = variant === 'agent';
    const { user, hasEdit } = useAuth();
    const canEdit = !!hasEdit?.('lifecycle');
    const navigate = useNavigate();
    const goTo = (to) => { navigate(to); setOpen(false); };
    const location = useLocation();
    const [busy, setBusy] = useState(false);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState([
        { role: 'bot', text: isAgent
            ? "Hi! I'm the AI Agent. I can read everything on this site, prepare lifecycle events for your confirmation, and search the web for outside information."
            : "Hi! I'm the Asset Ledger assistant. Ask me anything about your assets." }
    ]);
    const endRef = useRef(null);

    // Starter chips on first open; related chips after every answer.
    const userMsgs = messages.filter((m) => m.role === 'user').map((m) => m.text);
    const suggestions = isAgent
        ? (userMsgs.length === 0 ? AGENT_SUGGESTIONS : [])
        : (userMsgs.length === 0 ? SUGGESTIONS : relatedQuestions(userMsgs[userMsgs.length - 1], userMsgs));

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, open, busy]);

    async function send(text) {
        const message = (text ?? input).trim();
        if (!message || busy) return;
        const history = messages.slice(1).filter((x) => x.text); // preview cards carry no text
        setMessages((m) => [...m, { role: 'user', text: message }]);
        setInput('');
        setBusy(true);
        const assetNumber = location.pathname.match(/^\/assets\/(\d+)/)?.[1];
        // "How do I...?" questions are answered from the built-in guide (exact, instant).
        const guide = !isAgent && isGuideQuestion(message) ? findGuide(message) : null;
        if (guide) {
            setMessages((m) => [...m, { role: 'bot', text: `${guide.title}\n\n${guide.text}`, link: guide.link }]);
            setBusy(false);
            return;
        }
        try {
            const res = await api.post(isAgent ? '/agent' : '/chat', { message, history, page: location.pathname, role: user?.role, assetNumber, canEdit });
            setMessages((m) => [
                ...m,
                { role: 'bot', text: res.reply, sources: res.sources },
                // One preview card per proposal the agent prepared; nothing is saved yet.
                ...(res.actions || []).map((action) => ({ role: 'bot', action, state: 'pending' }))
            ]);
        } catch {
            // Agent: no offline fallback (it is LLM-only). Assistant: answer from the existing APIs.
            if (isAgent) {
                setMessages((m) => [...m, { role: 'bot', text: "Sorry, I couldn't reach the AI Agent. Please check that the server is running." }]);
                return;
            }
            try {
                const reply = await answerFromExistingApis(message, assetNumber);
                setMessages((m) => [...m, typeof reply === 'string' ? { role: 'bot', text: reply } : { role: 'bot', ...reply }]);
            } catch {
                setMessages((m) => [...m, { role: 'bot', text: "Sorry, I couldn't load the data. Please check that the server is running." }]);
            }
        } finally {
            setBusy(false);
        }
    }

    function patchCard(id, patch) {
        setMessages((m) => m.map((x) => (x.action?.id === id ? { ...x, ...patch } : x)));
    }
    async function confirmAction(id) {
        patchCard(id, { state: 'working' });
        try {
            const r = await api.post('/chat/confirm', { id, canEdit, postedBy: user?.name });
            patchCard(id, { state: 'posted', result: r.message });
        } catch (e) {
            patchCard(id, { state: 'error', result: e.message });
        }
    }
    async function cancelAction(id) {
        patchCard(id, { state: 'cancelled' });
        api.post('/chat/cancel', { id }).catch(() => { });
    }

    return (<>
      {open && (<div className={`chat-panel${isAgent ? ' agent' : ''}`} role="dialog" aria-label={isAgent ? 'AI Agent chat' : 'Assistant chat'}>
        <div className="chat-head">
          <span className="chat-head-icon">{isAgent ? <AgentIcon size={20}/> : <RobotIcon size={22}/>}</span>
          <div className="chat-head-title"><strong>{isAgent ? 'AI Agent' : 'Asset Assistant'}</strong><small>{isAgent ? 'Online · web search on' : 'Online'}</small></div>
          <button className="chat-close" onClick={() => setOpen(false)} aria-label="Close chat">×</button>
        </div>
        <div className="chat-body">
          {messages.map((m, i) => m.action ? (<div key={i} className="chat-msg bot chat-card">
            <div className="chat-card-title">{m.action.title}</div>
            <div className="chat-card-badge">{m.action.badge}</div>
            <table className="chat-card-rows"><tbody>
              {m.action.rows.map((r, j) => (<tr key={j} className={r.emphasize ? 'em' : ''}><td>{r.label}</td><td>{r.value}</td></tr>))}
            </tbody></table>
            {m.action.note && <div className="chat-card-note">{m.action.note}</div>}
            {m.action.inputs?.length > 0 && (<details className="chat-card-inputs"><summary>Inputs used ({m.action.inputs.length})</summary>
              {m.action.inputs.map((x, j) => (<div key={j}><span>{x.label}</span><span>{x.value}</span></div>))}
            </details>)}
            {m.state === 'pending' && (<div className="chat-card-actions">
              <button className="ok" onClick={() => confirmAction(m.action.id)}>Confirm &amp; Post</button>
              <button onClick={() => cancelAction(m.action.id)}>Cancel</button>
            </div>)}
            {m.state === 'working' && <div className="chat-card-status">Posting…</div>}
            {m.state === 'posted' && <div className="chat-card-status good">✓ {m.result}</div>}
            {m.state === 'cancelled' && <div className="chat-card-status">Cancelled. Nothing was saved.</div>}
            {m.state === 'error' && <div className="chat-card-status bad">✗ {m.result}</div>}
          </div>) : (<div key={i} className={`chat-msg ${m.role}`}>
            {m.role === 'bot' ? renderRich(m.text, goTo) : m.text}
            {m.link && (<button className="chat-link" onClick={() => goTo(m.link.to)}>{m.link.label} →</button>)}
            {m.sources?.length > 0 && (<div className="chat-sources"><span>From the web:</span>
              {m.sources.map((x) => (<a key={x.url} href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a>))}
            </div>)}
          </div>))}
          {busy && <div className="chat-msg bot chat-typing"><span/><span/><span/></div>}
          {/* First open: the 4 starter questions. After any answer: 4 related questions. */}
          {!busy && messages[messages.length - 1].role === 'bot' && (<div className="chat-chips">
            {suggestions.map((s) => (<button key={s} onClick={() => send(s)}>{s}</button>))}
          </div>)}
          <div ref={endRef}/>
        </div>
        <div className="chat-input">
          <input value={input} placeholder="Type your question..." onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}/>
          <button onClick={() => send()} disabled={busy || !input.trim()} aria-label="Send">➤</button>
        </div>
      </div>)}
      <button className={`chat-fab${open ? ' open' : ''}${isAgent ? ' agent' : ''}`} onClick={() => setOpen(!open)}
        aria-label={isAgent ? 'Open AI Agent' : 'Open assistant'} title={isAgent ? 'AI Agent (site + web)' : 'Ask the assistant'}>
        {open ? <span className="chat-fab-x">×</span> : (isAgent ? <AgentIcon/> : <RobotIcon/>)}
      </button>
    </>);
}
// Both launchers side by side; opening one closes the other.
export function ChatLaunchers() {
    const [active, setActive] = useState(null);
    return (<>
      <ChatWidget variant="assistant" open={active === 'assistant'} setOpen={(v) => setActive(v ? 'assistant' : null)}/>
      <ChatWidget variant="agent" open={active === 'agent'} setOpen={(v) => setActive(v ? 'agent' : null)}/>
    </>);
}

// ======================================================
// END OF FILE : ChatWidget.jsx
// ======================================================
