/**
 * Matches the canonical UUID shape (8-4-4-4-12 hex).
 */
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns true when the value looks like a UUID of any version */
export function isUuid(value: string): boolean {
	return UUID_PATTERN.test(value);
}
