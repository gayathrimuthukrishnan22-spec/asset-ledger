// ======================================================
// File Name : Retirement.jsx
// Purpose   : Lifecycle Event form for the "Retirement" card only. Pulls
//             its field list from FIELD_SCHEMAS.retirement and hands it to
//             the shared EventFormBase for rendering. Retirement-only
//             changes belong in THIS file — editing it can't affect any
//             other card's file.
// ======================================================

import { FIELD_SCHEMAS } from '../../../data/lifecycleFormSchemas';
import { EventFormBase } from './EventFormBase';

// ======================================================
// START: Component Functions
// ======================================================

// ======================================================
// Function : Retirement
// Purpose  : React component that renders the 'Retirement' event form
// ======================================================

export function Retirement(props) {
    return (<EventFormBase
      {...props}
      schema={FIELD_SCHEMAS.retirement ?? []}
    />);
}

// ======================================================
// END: Retirement
// ======================================================

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : Retirement.jsx
// ======================================================
