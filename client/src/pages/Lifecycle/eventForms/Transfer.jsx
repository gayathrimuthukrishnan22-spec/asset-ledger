// ======================================================
// File Name : Transfer.jsx
// Purpose   : Lifecycle Event form for the "Transfer" card only. Pulls
//             its field list from FIELD_SCHEMAS.transfer and hands it to
//             the shared EventFormBase for rendering. Transfer-only
//             changes belong in THIS file — editing it can't affect any
//             other card's file.
// ======================================================

import { FIELD_SCHEMAS } from '../../../data/lifecycleFormSchemas';
import { EventFormBase } from './EventFormBase';

// ======================================================
// START: Component Functions
// ======================================================

// ======================================================
// Function : Transfer
// Purpose  : React component that renders the 'Transfer' event form
// ======================================================

export function Transfer(props) {
    return (<EventFormBase
      {...props}
      schema={FIELD_SCHEMAS.transfer ?? []}
    />);
}

// ======================================================
// END: Transfer
// ======================================================

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : Transfer.jsx
// ======================================================
