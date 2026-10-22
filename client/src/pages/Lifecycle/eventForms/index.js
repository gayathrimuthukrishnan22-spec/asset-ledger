// ======================================================
// File Name : index.js
// Purpose   : Maps each real event-type id (matches the "id" field on the
//             cards LifecycleEvents fetches from GET /lifecycle/event-
//             types) to its own form component file. LifecycleEvents.jsx
//             looks up EVENT_FORM_COMPONENTS[selected] and renders
//             whichever one comes back — so adding a 7th real event type
//             later just means adding one new file here, not touching
//             the other six.
// ======================================================

import { Addition } from './Addition';
import { Adjustment } from './Adjustment';
import { Transfer } from './Transfer';
import { Retirement } from './Retirement';
import { Reinstatement } from './Reinstatement';
import { Reclassification } from './Reclassification';

// ======================================================
// START: Form Component Map
// ======================================================

export const EVENT_FORM_COMPONENTS = {
    addition: Addition,
    adjustment: Adjustment,
    transfer: Transfer,
    retirement: Retirement,
    reinstatement: Reinstatement,
    reclassification: Reclassification
};

// ======================================================
// END: Form Component Map
// ======================================================

// ======================================================
// END OF FILE : index.js
// ======================================================
