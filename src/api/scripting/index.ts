import Conf from "conf";
import machine from "node-machine-id";
import createClient, { type Middleware } from "openapi-fetch";

import { SafeClient } from "@/api/client.js";
import { ConnectError, NullsConnectAPI } from "@/api/connect/index.js";
import { isTokenExpired, jwtExpiry } from "@/api/jwt.js";
import { SCRIPTING_API, SCRIPTING_CLIENT_ID } from "@/url.js";
import type { components, paths } from "./schema.js";

export type ScriptSummary = components["schemas"]["ScriptSummary"];

export class ScriptingAPIError extends Error {
	constructor(
		readonly status: number,
		readonly body: unknown,
		message?: string,
	) {
		super(message ?? ScriptingAPIError.describe(status, body));
	}

	private static describe(status: number, body: unknown): string {
		if (typeof body === "string" && body.trim())
			return `HTTP ${status}: ${body.trim()}`;

		if (body && typeof body === "object") {
			const record = body as Record<string, unknown>;
			if (typeof record["error"] === "string")
				return `HTTP ${status}: ${record["error"]}`;
			return `HTTP ${status}: ${JSON.stringify(body)}`;
		}

		return `HTTP ${status}`;
	}

	/** The API answers `400` with an empty body when its publish/share quota trips. */
	get isLikelyQuotaExceeded(): boolean {
		return (
			this.status === 400 &&
			(this.body === undefined || this.body === "" || this.body === null)
		);
	}
}

interface ScriptingConfig {
	created_at: string;

	/** HS256 JWT `{sub: <user uuid>, exp}`, 24 h TTL */
	auth_token?: string;
	auth_token_expires_at?: number;

	user: {
		uuid: string;
		name: string;
		username: string;
		hasConnectEmail: boolean;
		hasPassword: boolean;
	};
}

class ScriptingAPI extends SafeClient<paths> {
	connect = new NullsConnectAPI("laser", "en");

	private config = new Conf<ScriptingConfig>({
		projectName: "nulls-scripting",
		encryptionKey: machine.machineIdSync(),
	});

	constructor() {
		super();

		this.api = createClient<paths>({
			baseUrl: SCRIPTING_API,
			headers: { accept: "application/json" },
		});

		const instance = this;

		// Attach the session cookie to every request when one is available
		const cookieMiddleware: Middleware = {
			onRequest({ request }) {
				const token = instance.config.get("auth_token");

				if (token) {
					request.headers.set("cookie", `auth_token=${token}`);
				}

				return request;
			},
		};

		this.api.use(cookieMiddleware);
	}

	protected onFail(response: Response, data: unknown, error: unknown): never {
		throw new ScriptingAPIError(response.status, error ?? data);
	}

	async login() {
		if (!this.connect.valid)
			throw new ConnectError(
				"Nulls Connect is required to login into scripting",
			);

		const id_token = await this.connect.createOAuth(SCRIPTING_CLIENT_ID);

		// direct api.POST: this is the only call that needs response headers
		const { response, data, error } = await this.api.POST("/auth/connect", {
			body: { id_token },
		});

		if (!response.ok || error !== undefined) this.onFail(response, data, error);

		if (data !== undefined && "sign_up_token" in data) {
			throw new ConnectError(
				"This Connect identity is not bound to a scripting account yet \n" +
					"Sign in once at https://scripting.nulls.gg/connect to finish registration",
				response.status,
			);
		}

		const cookiePair = response.headers
			.getSetCookie()
			.flatMap((header) => header.split(/,(?=\s*[^;=]+=)/))
			.map((header) => header.split(";")[0]?.trim())
			.find((pair): pair is string => Boolean(pair?.startsWith("auth_token=")));

		if (!cookiePair)
			throw new ScriptingAPIError(
				response.status,
				data,
				"scripting.nulls.gg accepted the login but set no auth_token cookie",
			);

		const auth_token = cookiePair.slice("auth_token=".length);
		this.config.set("auth_token", auth_token);

		const expiry = jwtExpiry(auth_token);
		if (expiry !== undefined) {
			this.config.set("auth_token_expires_at", expiry);
		} else {
			this.config.reset("auth_token_expires_at");
		}

		this.config.set("created_at", new Date().toISOString());

		const me = await this.get("/users/me");
		this.config.set("user", {
			uuid: me.user_id,
			name: me.name,
			username: me.username,
			hasConnectEmail: me.has_connect_email,
			hasPassword: me.has_password,
		});
	}

	logout() {
		this.connect.logout();
		this.config.clear();
	}

	get email(): string | undefined {
		return this.config.get("email");
	}

	get user() {
		return this.config.get("user");
	}

	get expired() {
		const expire = this.config.get("auth_token_expires_at");
		return isTokenExpired(expire);
	}

	get valid() {
		return this.config.get("auth_token") !== undefined;
	}
}

const Api = new ScriptingAPI();
export default Api;
