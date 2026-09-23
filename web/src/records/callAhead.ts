/**
 * "Call ahead and ask" prompts, ported from the Swift app's Localizable.strings (ask_general,
 * ask_italian, ask_asian, ask_bakery) and labelled by group; only the first group is general.
 */
export const CALL_AHEAD_GROUPS: ReadonlyArray<{ label: string; questions: readonly string[] }> = [
  { label: "Anywhere", questions: ["Do you have a dedicated fryer for gluten-free items?", "How do you prevent cross-contamination?"] },
  { label: "Italian", questions: ["Does your pasta come from a dedicated cooking station?", "Is your pizza base made in a separate area?"] },
  { label: "Asian", questions: ["Does your soy sauce contain wheat?", "Do you use a separate wok for gluten-free orders?"] },
  { label: "Bakeries", questions: ["Are gluten-free items prepared in a separate area?", "Do you change gloves between orders?"] },
];
