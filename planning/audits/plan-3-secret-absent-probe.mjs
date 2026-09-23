// Plan 3 probe: what does a member's search return when functions/.secret.local is ABSENT?
// Expected (verified from firebase-tools 15.30 and firebase-functions 7 sources, 2026-09-22):
// the emulator logs "Unable to access secret environment variables from Google Cloud Secret
// Manager", the function still runs, PLACES_API_KEY.value() is "", and the callable answers
// 400 FAILED_PRECONDITION "Search is not configured." — never a fixture result.
// Run from the repo root, with the emulators already started WITHOUT the secret file:
//   mv functions/.secret.local /tmp/secret.bak   # if present
//   npm --prefix functions run build && FUNCTIONS_DISCOVERY_TIMEOUT=90 firebase emulators:exec \
//     --only auth,firestore,functions --project demo-safebite "node planning/audits/plan-3-secret-absent-probe.mjs"
//   mv /tmp/secret.bak functions/.secret.local   # restore
const AUTH = "http://127.0.0.1:9099";
const FS = "http://127.0.0.1:8080/v1/projects/demo-safebite/databases/(default)/documents";
const FN = "http://127.0.0.1:5001/demo-safebite/europe-west2/searchDestination";
const json = { "Content-Type": "application/json" };
const owner = { ...json, Authorization: "Bearer owner" };

async function put(path, fields) {
  const res = await fetch(`${FS}/${path}`, { method: "PATCH", headers: owner, body: JSON.stringify({ fields }) });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
}
await put("households/probe-home", { name: { stringValue: "Probe" }, memberIds: { arrayValue: { values: [{ stringValue: "probe-uid" }] } }, createdAt: { timestampValue: new Date().toISOString() } });
await put("users/probe-uid", { householdId: { stringValue: "probe-home" }, displayName: { stringValue: "Probe" } });
await put("config/discovery", { enabled: { booleanValue: true }, dailySearchCap: { integerValue: "5" } });

const signUp = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
  method: "POST", headers: json, body: JSON.stringify({ email: "probe@safebite.test", password: "probe-password-1", returnSecureToken: true }),
});
let token = (await signUp.json()).idToken;
if (!token) {
  const signIn = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: "POST", headers: json, body: JSON.stringify({ email: "probe@safebite.test", password: "probe-password-1", returnSecureToken: true }),
  });
  token = (await signIn.json()).idToken;
}
// The Auth emulator assigns its own uid on signUp; rewrite the membership docs to that uid.
const lookup = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=fake-api-key`, { method: "POST", headers: json, body: JSON.stringify({ idToken: token }) });
const uid = (await lookup.json()).users[0].localId;
await put("households/probe-home", { name: { stringValue: "Probe" }, memberIds: { arrayValue: { values: [{ stringValue: uid }] } }, createdAt: { timestampValue: new Date().toISOString() } });
await put(`users/${uid}`, { householdId: { stringValue: "probe-home" }, displayName: { stringValue: "Probe" } });

const res = await fetch(FN, { method: "POST", headers: { ...json, Authorization: `Bearer ${token}` }, body: JSON.stringify({ data: { query: "probe" } }) });
console.log("PROBE status", res.status);
console.log("PROBE body", await res.text());
