// ======================================================
// File Name : Addition.jsx
// Purpose   : Lifecycle Event form for the "Addition" card only. Pulls
//             its field list from FIELD_SCHEMAS.addition and hands it to
//             the shared EventFormBase for rendering. Addition-only
//             changes (a new field, different validation, etc.) belong in
//             THIS file — editing it can't affect Adjustment.jsx,
//             Transfer.jsx, or any other card's file.
// ======================================================

import { FIELD_SCHEMAS } from '../../../data/lifecycleFormSchemas';
import { EventFormBase } from './EventFormBase';

// ======================================================
// START: Component Functions
// ======================================================

// ======================================================
// Function : Addition
// Purpose  : React component that renders the 'Addition' event form
// ======================================================

export function Addition(props) {
    return (<EventFormBase
      {...props}
      schema={FIELD_SCHEMAS.addition ?? []}
    />);
}

// ======================================================
// END: Addition
// ======================================================

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : Addition.jsx
// ======================================================
