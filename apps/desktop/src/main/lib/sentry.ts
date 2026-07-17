import * as Sentry from "@sentry/electron/main";
import { IPCMode } from "@sentry/electron/main";
import { localFeatureDisabled } from "@superset/shared/local-runtime";
import { session } from "electron";
import { env } from "../env.main";

let sentryInitialized = false;

export function initSentry(): void {
	if (sentryInitialized) return;
	if (localFeatureDisabled(process.env, "TELEMETRY")) return;

	if (!env.SENTRY_DSN_DESKTOP || env.NODE_ENV !== "production") {
		return;
	}

	try {
		Sentry.init({
			dsn: env.SENTRY_DSN_DESKTOP,
			environment: env.NODE_ENV,
			tracesSampleRate: 0.1,
			sendDefaultPii: false,
			ipcMode: IPCMode.Classic,
			getSessions: () => [
				session.defaultSession,
				session.fromPartition("persist:superset"),
			],
		});

		sentryInitialized = true;
		console.log("[sentry] Initialized in main process");
	} catch (error) {
		console.error("[sentry] Failed to initialize in main:", error);
	}
}
