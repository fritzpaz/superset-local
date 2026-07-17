import type { BrowserWindow } from "electron";
import { env } from "shared/env.shared";
import { PACKAGED_RENDERER_URL } from "./renderer-protocol";

/** Window IDs defined in the router configuration */
type WindowId = "main" | "about";

/**
 * Load an Electron window with the appropriate URL for TanStack Router.
 * Uses hash-based routing in development and production.
 *
 * - Development: loads from Vite dev server at http://localhost:PORT/#/
 * - Production: loads bundled assets from a standard, secure custom origin
 */
export function registerRoute(props: {
	id: WindowId;
	browserWindow: BrowserWindow;
	query?: Record<string, string>;
}): void {
	const isDev = env.NODE_ENV === "development";

	if (isDev) {
		// Development: load from Vite dev server with hash routing
		const url = `http://localhost:${env.DESKTOP_VITE_PORT}/#/`;
		console.log("[window-loader] Loading development URL:", url);
		props.browserWindow.loadURL(url);
	} else {
		// A custom standard origin avoids file:// privileges and gives CORS a
		// concrete origin without weakening the Electric proxy to accept `null`.
		console.log("[window-loader] Loading packaged URL:", PACKAGED_RENDERER_URL);
		props.browserWindow.loadURL(PACKAGED_RENDERER_URL);
	}

	// Log successful loads
	props.browserWindow.webContents.on("did-finish-load", () => {
		console.log(
			"[window-loader] Successfully loaded:",
			props.browserWindow.webContents.getURL(),
		);
	});

	// Log and handle load failures
	props.browserWindow.webContents.on(
		"did-fail-load",
		(_event, errorCode, errorDescription, validatedURL) => {
			console.error("[window-loader] Failed to load URL:", validatedURL);
			console.error("[window-loader] Error code:", errorCode);
			console.error("[window-loader] Error description:", errorDescription);
		},
	);
}
