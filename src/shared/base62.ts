const ALPHABET =
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const cachedEncoder = new globalThis.TextEncoder();
const cachedDecoder = new globalThis.TextDecoder();

export class Base62 {
	alphabet: string[];
	indices: Map<string, number>;

	constructor(alphabet = ALPHABET) {
		if (alphabet.length < 2) {
			throw new TypeError("The alphabet must contain at least two characters.");
		}

		if (new Set(alphabet).size !== alphabet.length) {
			throw new TypeError(
				"The alphabet must not contain duplicate characters.",
			);
		}

		this.alphabet = [...alphabet];
		this.indices = new Map(
			this.alphabet.map((character, index) => [character, index]),
		);
	}

	private getIndex(character: string) {
		const index = this.indices.get(character);

		if (index === undefined) {
			throw new TypeError(
				`Unexpected character for Base62 encoding: \`${character}\`.`,
			);
		}

		return index;
	}

	encodeString(string: string) {
		return this.encodeBytes(cachedEncoder.encode(string));
	}

	decodeString(encodedString: string) {
		return cachedDecoder.decode(this.decodeBytes(encodedString));
	}

	encodeBytes(bytes: Uint8Array) {
		if (bytes.length === 0) {
			return "";
		}

		// Preserve leading zero bytes the same way base-x does: each one maps
		// to a leading alphabet[0] character.
		let zeros = 0;
		while (zeros < bytes.length && bytes[zeros] === 0) {
			zeros++;
		}

		let value = 0n;
		for (const byte of bytes.subarray(zeros)) {
			value = (value << 8n) | BigInt(byte);
		}

		const encoded = value === 0n ? "" : this.encodeBigInt(value);
		const zeroCharacter = this.alphabet[0] ?? "";

		return zeroCharacter.repeat(zeros) + encoded;
	}

	decodeBytes(encodedString: string) {
		const zeroCharacter = this.alphabet[0] ?? "";

		let zeros = 0;
		while (
			zeros < encodedString.length &&
			encodedString[zeros] === zeroCharacter
		) {
			zeros++;
		}

		const value = this.decodeBigInt(encodedString.slice(zeros));
		const bytes: number[] = [];

		let current = value;

		while (current > 0n) {
			bytes.unshift(Number(current & 0xffn));
			current >>= 8n;
		}

		return Uint8Array.from([...new Array(zeros).fill(0), ...bytes]);
	}

	encodeInteger(integer: number) {
		if (!Number.isSafeInteger(integer)) {
			throw new TypeError("The integer must be a safe integer.");
		}

		if (integer < 0) {
			throw new TypeError("The integer must be non-negative.");
		}

		if (integer === 0) {
			return this.alphabet[0];
		}

		const base = this.alphabet.length;
		let encodedString = "";

		while (integer > 0) {
			encodedString = this.alphabet[integer % base] + encodedString;
			integer = Math.floor(integer / base);
		}

		return encodedString;
	}

	decodeInteger(encodedString: string) {
		const base = this.alphabet.length;
		let integer = 0;

		for (const character of encodedString) {
			integer = integer * base + this.getIndex(character);

			if (!Number.isSafeInteger(integer)) {
				throw new TypeError(
					"The encoded integer is too large. Use decodeBigInt instead.",
				);
			}
		}

		return integer;
	}

	encodeBigInt(bigint: bigint) {
		if (typeof bigint !== "bigint") {
			throw new TypeError(
				`Expected a bigint, got \`${bigint}\` (${typeof bigint}).`,
			);
		}

		if (bigint < 0n) {
			throw new TypeError("The bigint must be non-negative.");
		}

		if (bigint === 0n) {
			return this.alphabet[0];
		}

		const base = BigInt(this.alphabet.length);
		let encodedString = "";

		while (bigint > 0n) {
			encodedString = this.alphabet[Number(bigint % base)] + encodedString;
			bigint /= base;
		}

		return encodedString;
	}

	decodeBigInt(encodedString: string) {
		const base = BigInt(this.alphabet.length);
		let bigint = 0n;

		for (const character of encodedString) {
			bigint = bigint * base + BigInt(this.getIndex(character));
		}

		return bigint;
	}
}

// Create default instance with standard alphabet
const base62 = new Base62();

// Export convenience functions using the default alphabet for backward compatibility
export const encodeString = (string: string) => base62.encodeString(string);
export const decodeString = (encodedString: string) =>
	base62.decodeString(encodedString);
export const encodeBytes = (bytes: Uint8Array) => base62.encodeBytes(bytes);
export const decodeBytes = (encodedString: string) =>
	base62.decodeBytes(encodedString);
export const encodeInteger = (integer: number) => base62.encodeInteger(integer);
export const decodeInteger = (encodedString: string) =>
	base62.decodeInteger(encodedString);
export const encodeBigInt = (bigint: bigint) => base62.encodeBigInt(bigint);
export const decodeBigInt = (encodedString: string) =>
	base62.decodeBigInt(encodedString);

export default base62;
