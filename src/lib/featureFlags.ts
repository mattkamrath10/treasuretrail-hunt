// Single source of truth for the Marketplace listing-creation beta gate.
//
// While this is false, the manual "Create Listing" flow stays hidden and the
// Smart Screenshot Import "Publish" step is disabled (the import extraction +
// review flow still works — it just can't publish a live listing yet). Flip to
// true to turn user-created marketplace listings back on everywhere.
export const MARKETPLACE_CREATE_ENABLED = false;
