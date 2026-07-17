import { localFeatureDisabled } from "@superset/shared/local-runtime";
import { posthog } from "renderer/lib/posthog";

export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	if (localFeatureDisabled(process.env, "TELEMETRY")) return;
	posthog.capture(event, properties);
}
