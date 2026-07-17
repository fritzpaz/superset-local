export const APPLICATION_SECRET_KEYS = [
	"BETTER_AUTH_SECRET",
	"DATABASE_URL",
	"DATABASE_URL_UNPOOLED",
	"ELECTRIC_SECRET",
	"KV_REST_API_TOKEN",
	"KV_URL",
	"SECRETS_ENCRYPTION_KEY",
] as const;

export type ApplicationSecretKey = (typeof APPLICATION_SECRET_KEYS)[number];

/**
 * Secrets injected into each application image container. Keep these lists
 * explicit: ECS secret selection is a container boundary, even when the
 * containers share one task definition for the cost-conscious profile.
 */
export const CONTAINER_SECRET_KEYS = {
	api: [
		"BETTER_AUTH_SECRET",
		"DATABASE_URL",
		"DATABASE_URL_UNPOOLED",
		"KV_REST_API_TOKEN",
		"KV_URL",
		"SECRETS_ENCRYPTION_KEY",
	],
	"electric-proxy": ["ELECTRIC_SECRET"],
	migration: [
		"BETTER_AUTH_SECRET",
		"DATABASE_URL",
		"DATABASE_URL_UNPOOLED",
		"KV_REST_API_TOKEN",
	],
	web: [
		"BETTER_AUTH_SECRET",
		"DATABASE_URL",
		"DATABASE_URL_UNPOOLED",
		"KV_REST_API_TOKEN",
	],
} as const satisfies Record<string, readonly ApplicationSecretKey[]>;
