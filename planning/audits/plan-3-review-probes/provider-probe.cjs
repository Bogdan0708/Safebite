// Run from repository root after npm --prefix functions run build. No network or database calls.
const path = require("node:path");
const base = path.resolve(process.cwd(), "functions/lib/discovery");
const { createGoogleProvider } = require(path.join(base, "googleProvider.js"));
const { runSearch } = require(path.join(base, "search.js"));
const { ProviderError } = require(path.join(base, "provider.js"));
(async () => {
  let body;
  const provider = createGoogleProvider("audit-not-a-key", async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ places: [{ id: "audit-city-id", displayName: { text: "Lisbon" }, formattedAddress: "Lisbon, Portugal", googleMapsUri: "https://maps.google.com/?q=Lisbon" }] }), { status: 200 });
  });
  const results = await provider.searchText("Lisbon", 10);
  console.log(JSON.stringify({ actualRequestBody: body, results }));
  const db = { doc: () => ({get: async () => ({ data: () => ({ enabled: true, dailySearchCap: 10 }) })}), runTransaction: async fn => fn({ get: async () => ({get: () => 0}), set: () => {} }) };
  const failProvider = { searchText: async () => { throw new ProviderError("badRequest", "ECHOED_PRIVATE_QUERY_MARKER", 400); } };
  try {
    await runSearch({db, selection: {kind: "provider", provider: failProvider}, now: () => new Date()}, {uid: "audit-user", householdId: "audit-home", displayName: "Audit"}, {kind: "destination", query: "ECHOED_PRIVATE_QUERY_MARKER"});
  } catch (err) { console.log("Mapped error: " + err.code); }
})().catch(err => { console.error(err); process.exitCode=1; });
