// ======================================================
// File Name : Reclassification.jsx
// Purpose   : Lifecycle Event form for the "Reclassification" card only.
//             Pulls its field list from FIELD_SCHEMAS.reclassification and
//             hands it to the shared EventFormBase for rendering.
//             Reclassification-only changes belong in THIS file — editing
//             it can't affect any other card's file.
// ======================================================

import { FIELD_SCHEMAS } from '../../../data/lifecycleFormSchemas';
import { EventFormBase } from './EventFormBase';

// ======================================================
// START: Component Functions
// ======================================================

// ======================================================
// Function : Reclassification
// Purpose  : React component that renders the 'Reclassification' event
//            form
// ======================================================

export function Reclassification(props) {
    return (<EventFormBase
      {...props}
      schema={FIELD_SCHEMAS.reclassification ?? []}
    />);
}

// ======================================================
// END: Reclassification
// ======================================================

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : Reclassification.jsx
// ======================================================
