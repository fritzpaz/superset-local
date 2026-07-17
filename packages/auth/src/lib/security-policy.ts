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
	disablePublicSignUp: boolean;
	minimumPasswordLength: number;
	requireVerifiedEmailForDomainEnrollment: boolean;
	disableSessionRefresh: boolean;
	jwtExpirationTime: "1h" | "5m";
	oauthAccessTokenExpiresIn: number;
	sessionExpiresIn: number;
	sessionUpdateAge: number;
}

interface AuthSecurityPolicyOptions {
	allowBootstrapSignUp?: boolean;
}

/**
 * Centralizes the few authentication defaults that change for regulated
 * deployments. This is a safeguard, not a claim that the application or an
 * operator's deployment is HIPAA compliant.
 */
export function getAuthSecurityPolicy(
	hipaaMode: boolean,
	options: AuthSecurityPolicyOptions = {},
): AuthSecurityPolicy {
	if (!hipaaMode) {
		return {
			apiKeyRateLimit: {
				enabled: false,
				maxRequests: 10,
				timeWindow: 24 * 60 * 60 * 1000,
			},
			cookieCache: { enabled: true, maxAge: 5 * 60 },
			disablePublicSignUp: false,
			minimumPasswordLength: 8,
			requireVerifiedEmailForDomainEnrollment: false,
			disableSessionRefresh: false,
			jwtExpirationTime: "1h",
			oauthAccessTokenExpiresIn: 60 * 60 * 24 * 7,
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
		disablePublicSignUp: !options.allowBootstrapSignUp,
		minimumPasswordLength: 12,
		requireVerifiedEmailForDomainEnrollment: true,
		disableSessionRefresh: true,
		jwtExpirationTime: "5m",
		oauthAccessTokenExpiresIn: 5 * 60,
		sessionExpiresIn: HIPAA_SESSION_SECONDS,
		sessionUpdateAge: 5 * 60,
	};
}

export function canAutoEnrollByDomain({
	emailVerified,
	policy,
}: {
	emailVerified: boolean;
	policy: AuthSecurityPolicy;
}): boolean {
	return !policy.requireVerifiedEmailForDomainEnrollment || emailVerified;
}
