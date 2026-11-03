const BASE = 62;
const BASE_BIGINT = 62n;
const ALPHABET =
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const cachedEncoder = new globalThis.TextEncoder();
const cachedDecoder = new globalThis.TextDecoder();

export class Base62 {
	alphabet: string[];
	indices: Map<string, number>;

	constructor(alphabet = ALPHABET) {
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

		let value = 0n;
		for (const byte of bytes) {
			value = (value << 8n) | BigInt(byte);
		}

		return this.encodeBigInt(value);
	}

	decodeBytes(encodedString: string) {
		const value = this.decodeBigInt(encodedString);

		if (value === 0n) {
			return new Uint8Array();
		}

		const bytes = [];

		let current = value;

		while (current > 0n) {
			bytes.unshift(Number(current & 0xffn));
			current >>= 8n;
		}

		return Uint8Array.from(bytes);
	}

	encodeInteger(integer: number) {
		if (integer < 0) {
			throw new TypeError("The integer must be non-negative.");
		}

		if (integer === 0) {
			return this.alphabet[0];
		}

		let encodedString = "";
		while (integer > 0) {
			encodedString = this.alphabet[integer % BASE] + encodedString;
			integer = Math.floor(integer / BASE);
		}

		return encodedString;
	}

	decodeInteger(encodedString: string) {
		let integer = 0;
		for (const character of encodedString) {
			integer = integer * BASE + this.getIndex(character);
		}

		return integer;
	}

	encodeBigInt(bigint: bigint) {
		if (typeof bigint !== "bigint") {
			throw new TypeError(
				`Expected a bigint, got \`${bigint}\` (${typeof bigint}).`,
			);
		}

		if (bigint < 0) {
			throw new TypeError("The bigint must be non-negative.");
		}

		if (bigint === 0n) {
			return this.alphabet[0];
		}

		let encodedString = "";
		while (bigint > 0n) {
			encodedString =
				this.alphabet[Number(bigint % BASE_BIGINT)] + encodedString;
			bigint /= BASE_BIGINT;
		}

		return encodedString;
	}

	decodeBigInt(encodedString: string) {
		let bigint = 0n;
		for (const character of encodedString) {
			bigint = bigint * BASE_BIGINT + BigInt(this.getIndex(character));
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
