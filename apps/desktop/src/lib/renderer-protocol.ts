import path from "node:path";

export const PACKAGED_RENDERER_SCHEME = "superset-app";
export const PACKAGED_RENDERER_HOST = "renderer";
export const PACKAGED_RENDERER_ORIGIN = `${PACKAGED_RENDERER_SCHEME}://${PACKAGED_RENDERER_HOST}`;
export const PACKAGED_RENDERER_URL = `${PACKAGED_RENDERER_ORIGIN}/index.html#/`;

/**
 * Maps a packaged-renderer request to the bundled renderer directory.
 * Requests for another origin or paths that escape the bundle are rejected.
 */
export function resolvePackagedRendererPath(
	rendererRoot: string,
	requestUrl: string,
): string | null {
	let url: URL;
	try {
		url = new URL(requestUrl);
	} catch {
		return null;
	}

	if (
		url.protocol !== `${PACKAGED_RENDERER_SCHEME}:` ||
		url.host !== PACKAGED_RENDERER_HOST
	) {
		return null;
	}

	let pathname: string;
	try {
		pathname = decodeURIComponent(url.pathname);
	} catch {
		return null;
	}

	const root = path.resolve(rendererRoot);
	const resolved = path.resolve(
		root,
		`.${pathname === "/" ? "/index.html" : pathname}`,
	);
	const relative = path.relative(root, resolved);
	if (relative.startsWith("..") || path.isAbsolute(relative)) return null;

	return resolved;
}
