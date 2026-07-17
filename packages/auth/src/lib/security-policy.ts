const DEFAULT_SESSION_SECONDS = 60 * 60 * 24 * 30;
const HIPAA_SESSION_SECONDS = 15 * 60;

export interface AuthSecurityPolicy {
	apiKeyRateLimit: {
		enabled: boolean;
		maxRequests: number;
		timeWindow: number;
	};
	cookieCache: {
		enabled: boolean;
		maxAge: number;
	};
	minimumPasswordLength: number;
	sessionExpiresIn: number;
	sessionUpdateAge: number;
}

/**
 * Centralizes the few authentication defaults that change for regulated
 * deployments. This is a safeguard, not a claim that the application or an
 * operator's deployment is HIPAA compliant.
 */
export function getAuthSecurityPolicy(hipaaMode: boolean): AuthSecurityPolicy {
	if (!hipaaMode) {
		return {
			apiKeyRateLimit: {
				enabled: false,
				maxRequests: 10,
				timeWindow: 24 * 60 * 60 * 1000,
			},
			cookieCache: { enabled: true, maxAge: 5 * 60 },
			minimumPasswordLength: 8,
			sessionExpiresIn: DEFAULT_SESSION_SECONDS,
			sessionUpdateAge: 24 * 60 * 60,
		};
	}

	return {
		apiKeyRateLimit: {
			enabled: true,
			maxRequests: 300,
			timeWindow: 60 * 1000,
		},
		cookieCache: { enabled: false, maxAge: 0 },
		minimumPasswordLength: 12,
		sessionExpiresIn: HIPAA_SESSION_SECONDS,
		sessionUpdateAge: 5 * 60,
	};
}
