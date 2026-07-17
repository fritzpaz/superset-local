import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import { isSupersetLocalMode } from "@superset/shared/local-runtime";
import { eq } from "drizzle-orm";

async function seedLocalAccount(): Promise<void> {
	if (!isSupersetLocalMode(process.env)) {
		throw new Error("seed-local requires SUPERSET_LOCAL_MODE=true");
	}

	const email = process.env.SUPERSET_LOCAL_ADMIN_EMAIL;
	const password = process.env.SUPERSET_LOCAL_ADMIN_PASSWORD;
	const name = process.env.SUPERSET_LOCAL_ADMIN_NAME || "Local Administrator";
	if (!email || !password) {
		throw new Error(
			"SUPERSET_LOCAL_ADMIN_EMAIL and SUPERSET_LOCAL_ADMIN_PASSWORD are required",
		);
	}
	if (password.length < 12) {
		throw new Error(
			"SUPERSET_LOCAL_ADMIN_PASSWORD must be at least 12 characters",
		);
	}

	let user = await db.query.users.findFirst({ where: eq(users.email, email) });
	if (!user) {
		// The regulated API rejects every public signup. This flag is scoped to
		// this one-shot bootstrap process, which exits immediately after seeding.
		process.env.SUPERSET_AUTH_BOOTSTRAP_SIGNUP = "true";
		const { auth } = await import("./server");
		await auth.api.signUpEmail({ body: { email, password, name } });
		user = await db.query.users.findFirst({ where: eq(users.email, email) });
	}
	if (!user) throw new Error("local administrator was not created");

	await db
		.update(users)
		.set({ emailVerified: true, onboardedAt: new Date() })
		.where(eq(users.id, user.id));

	console.log(`Local administrator ready: ${email}`);
}

seedLocalAccount()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("seed-local failed:", error);
		process.exit(1);
	});
