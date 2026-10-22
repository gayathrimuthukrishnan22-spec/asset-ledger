// ======================================================
// File Name : PostEventMenu.jsx
// Purpose   : "Post Event" button that drops down the event-type cards
//             right on the current page. Picking a card navigates
//             straight to /lifecycle with that type (and the current
//             asset, when known) pre-selected, so the Transaction
//             Details form opens immediately — no extra click needed
//             on the Lifecycle Events page itself.
//
//             Reinstatement is only valid for an asset that is
//             currently Retired, so the option set flips based on
//             asset status: while Retired, ONLY Reinstatement is
//             clickable (everything else greys out); otherwise
//             Reinstatement itself greys out and the rest stay live.
// ======================================================

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { lifecycleApi } from '../../api/lifecycle.api';

// ======================================================
// START: Component Functions
// ======================================================

// ======================================================
// Function : PostEventMenu
// Purpose  : React component that renders the 'PostEventMenu' UI
// Input    : assetNumber, assetStatus — assetStatus === 'Retired'
//            flips which event-type options are clickable
// ======================================================

export function PostEventMenu({ assetNumber, assetStatus }) {
    const [open, setOpen] = useState(false);
    const [eventTypes, setEventTypes] = useState([]);
    const wrapRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        lifecycleApi.getEventTypes().then(setEventTypes);
    }, []);

    useEffect(() => {
        function onClickOutside(e) {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        }
        function onEsc(e) {
            if (e.key === 'Escape') setOpen(false);
        }
        document.addEventListener('mousedown', onClickOutside);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onClickOutside);
            document.removeEventListener('keydown', onEsc);
        };
    }, []);

    const isRetired = assetStatus === 'Retired';

    // While the asset is Retired, only Reinstatement can be posted;
    // for every other status, Reinstatement itself is the one that's
    // not applicable yet.
    function isDisabled(eventTypeId) {
        if (isRetired) return eventTypeId !== 'reinstatement';
        return eventTypeId === 'reinstatement';
    }

    function pick(eventTypeId) {
        if (isDisabled(eventTypeId)) return;
        setOpen(false);
        const params = new URLSearchParams({ type: eventTypeId });
        if (assetNumber) params.set('asset', assetNumber);
        navigate(`/lifecycle?${params.toString()}`);
    }

    return (<div className="post-event-menu" ref={wrapRef}>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Post Event {open ? '▴' : '▾'}
      </button>

      {open && (<div className="post-event-menu-panel">
          {eventTypes.filter((e) => e.id !== 'addition').map((e) => {
              const disabled = isDisabled(e.id);
              return (<div key={e.id} className={`post-event-option${disabled ? ' post-event-option-disabled' : ''}`} aria-disabled={disabled} onClick={() => pick(e.id)}>
                  <div className={`ei ico-${disabled ? 'gray' : e.color}`}>{e.icon}</div>
                  <div className="post-event-option-text">
                    <h4>{e.label}</h4>
                    <p>{disabled && e.id === 'reinstatement' ? 'Only available once this asset has been retired' : e.description}</p>
                  </div>
                </div>);
          })}
        </div>)}
    </div>);
}

// ======================================================
// END: PostEventMenu
// ======================================================

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : PostEventMenu.jsx
// ======================================================
