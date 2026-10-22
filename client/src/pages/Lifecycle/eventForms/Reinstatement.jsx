// ======================================================
// File Name : Reinstatement.jsx
// Purpose   : Lifecycle Event form for the "Reinstatement" card only.
//             Pulls its field list from FIELD_SCHEMAS.reinstatement and
//             hands it to the shared EventFormBase for rendering.
//             Reinstatement-only changes belong in THIS file — editing it
//             can't affect any other card's file. (Note: the "Post Event
//             → Reinstatement" prefill-from-asset logic lives in the
//             parent, LifecycleEvents.jsx, since it runs before a card is
//             even rendered.)
// ======================================================

import { FIELD_SCHEMAS } from '../../../data/lifecycleFormSchemas';
import { EventFormBase } from './EventFormBase';

// ======================================================
// START: Component Functions
// ======================================================

// ======================================================
// Function : Reinstatement
// Purpose  : React component that renders the 'Reinstatement' event form
// ======================================================

export function Reinstatement(props) {
    return (<EventFormBase
      {...props}
      schema={FIELD_SCHEMAS.reinstatement ?? []}
    />);
}

// ======================================================
// END: Reinstatement
// ======================================================

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : Reinstatement.jsx
// ======================================================
