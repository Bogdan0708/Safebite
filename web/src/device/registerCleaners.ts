import { offlineCopyCleaner } from "../offline/store";
import { registerDeviceCleaner } from "./cleanup";

/**
 * The one place device cleaners are registered, imported first by main.tsx so a pending clear at
 * start-up runs every cleaner (spec §3.8). 5b registers the offline copy (spec §3.9). Nothing
 * imported here may load Firebase (review P2-5; guarded by registerCleaners.test.tsx).
 */
registerDeviceCleaner(offlineCopyCleaner);
