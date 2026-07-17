import { type ReactNode, useEffect, useState } from "react";
import { authClient, setAuthToken, setJwt } from "renderer/lib/auth-client";
import { getJwtRefreshDelayMs } from "renderer/lib/jwt-expiry";
import { SupersetLogo } from "renderer/routes/sign-in/components/SupersetLogo/SupersetLogo";
import { electronTrpc } from "../../lib/electron-trpc";

export function AuthProvider({ children }: { children: ReactNode }) {
	const [isHydrated, setIsHydrated] = useState(false);
	const { refetch: refetchSession } = authClient.useSession();

	const { data: storedToken, isSuccess } =
		electronTrpc.auth.getStoredToken.useQuery(undefined, {
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		});

	useEffect(() => {
		if (!isSuccess || isHydrated) return;

		let cancelled = false;

		async function hydrate() {
			if (storedToken?.token && storedToken?.expiresAt) {
				const isExpired = new Date(storedToken.expiresAt) < new Date();
				if (!isExpired) {
					setAuthToken(storedToken.token);
					try {
						await refetchSession();
					} catch (err) {
						console.warn(
							"[AuthProvider] session refetch failed during hydration",
							err,
						);
					}
					try {
						const res = await authClient.token();
						if (res.data?.token) {
							setJwt(res.data.token);
						}
					} catch (err) {
						console.warn(
							"[AuthProvider] JWT fetch failed during hydration",
							err,
						);
					}
				}
			}
			if (!cancelled) {
				setIsHydrated(true);
			}
		}

		hydrate();
		return () => {
			cancelled = true;
		};
	}, [storedToken, isSuccess, isHydrated, refetchSession]);

	electronTrpc.auth.onTokenChanged.useSubscription(undefined, {
		onData: async (data) => {
			if (data?.token && data?.expiresAt) {
				setAuthToken(null);
				await authClient.signOut({ fetchOptions: { throw: false } });
				setAuthToken(data.token);
				try {
					await refetchSession();
				} catch (err) {
					console.warn(
						"[AuthProvider] session refetch failed after token change",
						err,
					);
				}
				setIsHydrated(true);
			} else if (data === null) {
				setAuthToken(null);
				setJwt(null);
				try {
					await refetchSession();
				} catch (err) {
					console.warn(
						"[AuthProvider] session refetch failed after token cleared",
						err,
					);
				}
			}
		},
	});

	useEffect(() => {
		if (!isHydrated) return;

		let cancelled = false;
		let refreshTimer: ReturnType<typeof setTimeout> | undefined;

		const refreshJwt = async () => {
			let nextDelayMs = 60_000;
			try {
				const res = await authClient.token();
				if (res.data?.token) {
					setJwt(res.data.token);
					nextDelayMs = getJwtRefreshDelayMs(
						res.data.token,
						Date.now(),
						50 * 60_000,
					);
				}
			} catch (err) {
				console.warn("[AuthProvider] JWT refresh failed", err);
			}
			if (!cancelled) refreshTimer = setTimeout(refreshJwt, nextDelayMs);
		};

		void refreshJwt();
		return () => {
			cancelled = true;
			if (refreshTimer) clearTimeout(refreshTimer);
		};
	}, [isHydrated]);

	if (!isHydrated) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background">
				<SupersetLogo className="h-8 w-auto" gradient />
			</div>
		);
	}

	return <>{children}</>;
}
