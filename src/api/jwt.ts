export interface JwtData {
	[claim: string]: unknown;
	exp?: number;
	iat?: number;
}

/** Decode the payload of a compact JWS */
export function decodeJwt<T extends JwtData = JwtData>(token: string): T {
	const parts = token.split(".");
	if (parts.length < 2)
		throw new Error("Incorrect JWT: expected at least two segments");

	const payload = parts[1];
	if (!payload) throw new Error("Incorrect JWT: empty payload segment");

	let json: string;
	try {
		json = Buffer.from(payload, "base64url").toString("utf8");
	} catch {
		throw new Error("Incorrect JWT: payload is not base64url");
	}

	try {
		return JSON.parse(json) as T;
	} catch {
		throw new Error("Incorrect JWT: payload is not JSON");
	}
}

/** `exp` in seconds since the epoch, or `undefined` when absent/unreadable */
export function jwtExpiry(token: string): number | undefined {
	try {
		const exp = decodeJwt(token).exp;
		return typeof exp === "number" ? exp : undefined;
	} catch {
		return undefined;
	}
}

/** True when `exp` has passed, allowing for a little clock skew */
export function isTokenExpired(
	exp: number | undefined,
	skewSeconds = 30,
): boolean {
	if (exp === undefined) return false;
	return Date.now() / 1000 + skewSeconds >= exp;
}

/** Human-readable remaining lifetime, e.g. `23h 12m` */
export function formatJwtExpiry(exp: number | undefined): string {
	if (exp === undefined) return "unknown";

	const remaining = Math.round(exp - Date.now() / 1000);
	if (remaining <= 0) return "expired";

	const hours = Math.floor(remaining / 3600);
	const minutes = Math.floor((remaining % 3600) / 60);

	if (hours > 0) return `${hours}h ${minutes}m`;
	if (minutes > 0) return `${minutes}m ${remaining % 60}s`;
	return `${remaining}s`;
}

/** ISO timestamp for an `exp` claim */
export function jwtExpiresAt(exp: number | undefined): string | undefined {
	return exp === undefined ? undefined : new Date(exp * 1000).toISOString();
}
