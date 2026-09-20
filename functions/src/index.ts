import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { onCall } from "firebase-functions/v2/https";
import { requireMember, type Member } from "./membership";

initializeApp();

setGlobalOptions({
  region: "europe-west2",
  maxInstances: 2,
});

/** Returns the caller's household membership. Used by the web app's Settings screen. */
export const whoami = onCall<unknown, Promise<Member>>(async (request) => {
  return requireMember(request);
});
