/**
 * The one place device cleaners are registered, imported by main.tsx before anything else so the
 * start-up marker check can run them. Plan 5a registers none (nothing persists before 5b); Plan 5b
 * registers its IndexedDB store here.
 */
export {};
