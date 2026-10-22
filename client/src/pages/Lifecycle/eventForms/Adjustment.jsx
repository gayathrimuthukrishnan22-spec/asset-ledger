// ======================================================
// File Name : Adjustment.jsx
// Purpose   : Lifecycle Event form for the "Adjustment" card only. Pulls
//             its field list from FIELD_SCHEMAS.adjustment and hands it to
//             the shared EventFormBase for rendering. Adjustment-only
//             changes belong in THIS file — editing it can't affect any
//             other card's file.
// ======================================================

import { FIELD_SCHEMAS } from '../../../data/lifecycleFormSchemas';
import { EventFormBase } from './EventFormBase';

// ======================================================
// START: Component Functions
// ======================================================

// ======================================================
// Function : Adjustment
// Purpose  : React component that renders the 'Adjustment' event form
// ======================================================

export function Adjustment(props) {
    return (<EventFormBase
      {...props}
      schema={FIELD_SCHEMAS.adjustment ?? []}
    />);
}

// ======================================================
// END: Adjustment
// ======================================================

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : Adjustment.jsx
// ======================================================
