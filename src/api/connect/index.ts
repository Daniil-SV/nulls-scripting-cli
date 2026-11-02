import { randomUUID } from "node:crypto";
import Conf from "conf";
import machine from "node-machine-id";
import createClient, { type Middleware } from "openapi-fetch";
import { SafeClient } from "@/api/client.js";
import type { paths } from "@/api/connect/schema.js";
import { decodeJwt, isTokenExpired, jwtExpiry } from "@/api/jwt.js";
import { CONNECT_API } from "@/url.js";

export class ConnectError extends Error {
	constructor(
		message: string,
		readonly status: number = 200,
		readonly errorType?: string,
	) {
		super(message);
	}
}

export interface LinkedAccount {
	player_id: string;
	tag: string;
	name: string;
}

/** Domain errors returned by Connect with HTTP 418 */
const CONNECT_ERRORS: Record<string, string> = {
	unknown_game: "Unknown game slug.",
	email_invalid: "That email address was rejected.",
	email_not_found: "No Connect account exists for that email address.",
	pin_invalid: "Wrong PIN. Check the newest email and try again.",
	pin_expired: "The PIN expired. Request a new one.",
	pin_required: "A PIN is required for this account.",
	forbidden: "This Connect account is not allowed to sign in.",
	account_blocked: "This Connect account is blocked.",
};

function formatConnectError(
	status: number,
	body: unknown,
): { message: string; errorType?: string } {
	if (body && typeof body === "object") {
		const record = body as Record<string, unknown>;
		if (typeof record["error_type"] === "string") {
			const errorType = record["error_type"];
			return {
				message: CONNECT_ERRORS[errorType] ?? `Connect error: ${errorType}`,
				errorType,
			};
		}
		if (typeof record["detail"] === "string") {
			return { message: `Connect error: ${record["detail"]}` };
		}
		if (Array.isArray(record["detail"])) {
			const first = record["detail"][0] as { msg?: string } | undefined;
			return {
				message: `Connect rejected the request: ${first?.msg ?? "validation error"}`,
			};
		}
	}
	return { message: `Connect returned HTTP ${status}` };
}

interface ConnectConfig {
	uid: number;

	/** Cached user email. Used as placeholder for future logins */
	email?: string;

	/** RS256 bearer token, usually 30 min TTL */
	token?: string;
	token_expires_at?: number;

	/** Chosen linked account id */
	player_id?: string;
	linked_accounts: LinkedAccount[];
}

export class NullsConnectAPI extends SafeClient<paths> {
	private config: Conf<ConnectConfig>;

	constructor(
		private game: string,
		private locale: string,
	) {
		super();

		this.api = createClient<paths>({
			baseUrl: CONNECT_API,
			headers: { accept: "application/json" },
		});

		this.config = new Conf<ConnectConfig>({
			projectName: "nulls-connect",
			configName: `${game}_${locale}`,
			encryptionKey: machine.machineIdSync(),
		});

		const instance = this;
		const bearerMiddleware: Middleware = {
			onRequest({ request }) {
				const token = instance.config.get("token");
				if (token) request.headers.set("authorization", `Bearer ${token}`);

				return request;
			},
		};

		this.api.use(bearerMiddleware);
	}

	protected onFail(response: Response, _data: unknown, error: unknown): never {
		const { message, errorType } = formatConnectError(response.status, error);
		throw new ConnectError(message, response.status, errorType);
	}

	private async loginWithTokenOrPin(
		email: string,
		token?: string,
		pin?: string,
	) {
		if (token === undefined) {
			if (pin === undefined)
				throw new ConnectError("Code is required to sigin to Nulls Connect");

			const result = await this.get("/auth/login.v2", {
				params: {
					query: {
						email,
						game: this.game,
						locale: this.locale,
						pin,
						can_register: true,
					},
				},
			});

			if ("token" in result) {
				token = result.token;
			} else {
				throw new ConnectError(
					"Connect did not issue a token for that PIN. Request a new PIN and try again.",
					200,
				);
			}
		}

		const jwt = decodeJwt(token);

		this.config.set("token", token);
		const token_expire = jwtExpiry(token);
		if (token_expire !== undefined) {
			this.config.set("token_expires_at", token_expire);
		} else {
			this.config.reset("token_expires_at");
		}

		// Parsing linked nulls accounts
		const result = await this.get("/games/links", {
			params: { query: { game: this.game } },
		});

		const linked: LinkedAccount[] = result.links.map((link) => ({
			player_id: link.player_id,
			tag: link.player_info.tag ?? "",
			name: link.player_info.name ?? "",
		}));

		if (linked.length === 0) {
			throw new ConnectError(
				"No game account is linked to this Connect identity. Link one at https://connect.nulls.gg first.",
			);
		}

		const currentAccount = result.links.find((link) => link.is_current);

		this.config.set("email", email);
		this.config.set("uid", jwt["uid"] as number);
		this.config.set("linked_accounts", linked);

		if (currentAccount) {
			this.config.set("player_id", currentAccount.player_id);
		}
	}

	private async requestToken(email: string) {
		this.config.reset("token");
		this.config.reset("token_expires_at");

		const result = await this.get("/auth/login.v2", {
			params: {
				query: {
					email,
					game: this.game,
					locale: this.locale,
					can_register: true,
				},
			},
		});

		if ("token" in result) {
			return result.token;
		}

		// Pin required
		return undefined;
	}

	logout() {
		this.config.clear();
	}

	get valid() {
		if (this.config.get("token") === undefined) return false;

		const expire = this.config.get("token_expires_at");
		return !isTokenExpired(expire);
	}

	/**
	 * Creates nulls connect session. Needs to be called twice:
	 * 1st time to request pin
	 * 2nd time to confirm pin
	 * Sometimes server could return token after first call
	 * @param email User email
	 * @param pin Code sent to user email after first call
	 */
	async login(email: string, pin?: string): Promise<boolean> {
		let token: string | undefined;
		if (pin === undefined) {
			token = await this.requestToken(email);
		}

		if (token === undefined) {
			// Login with pin
			if (pin !== undefined) {
				await this.loginWithTokenOrPin(email, undefined, pin);
				return true;
			}

			// Pin is required
			return false;
		} else {
			await this.loginWithTokenOrPin(email, token);
			return true;
		}
	}

	get email(): string | undefined {
		return this.config.get("email");
	}

	get accounts(): LinkedAccount[] {
		return this.config.get("linked_accounts", []);
	}

	/**
	 * Chosen account is required to make any account (including oauth) operations
	 */
	get chosenAccount(): LinkedAccount | undefined {
		const playerId = this.config.get("player_id");
		if (playerId === undefined) return undefined;

		const account = this.config.get("linked_accounts", []);

		return account.find((value) => {
			return value.player_id === playerId;
		});
	}

	set chosenAccount(id: string) {
		this.config.set("player_id", id);

		if (this.chosenAccount === undefined)
			throw new ConnectError("Invalid player account id");
	}

	async createOAuth(client_id: string) {
		const player_id = this.config.get("player_id");

		// Not sure about that
		if (player_id === undefined)
			throw new ConnectError("OAuth requires chosen player account");

		const token = this.config.get("token");
		if (token === undefined)
			throw new ConnectError("OAuth requires a Connect session. Log in first.");

		const nonce = randomUUID();
		const state = randomUUID();
		const oauth = await this.get("/oauth/token", {
			params: {
				query: {
					client_id,
					player_id,
					game: this.game,
					scope: "openid email",
					nonce,
					state,
				},
			},
		});

		return oauth.id_token;
	}

	authorizeUrl(client_id: string, redirect_url: string): string {
		const url = new URL("https://connect.nulls.gg/authorize");
		url.searchParams.set("scope", "openid email");
		url.searchParams.set("response_type", "id_token");
		url.searchParams.set("client_id", client_id);
		url.searchParams.set("redirect_uri", redirect_url);
		return url.toString();
	}
}
