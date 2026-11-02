import { isCancel, note, select, taskLog, text } from "@clack/prompts";
import type { LinkedAccount } from "@/api/connect/index.js";
import Api from "@/api/scripting/index.js";

export class LoginError extends Error {
	constructor(message: string) {
		super(message);
	}
}

type TaskGroup = ReturnType<ReturnType<typeof taskLog>["group"]>;

async function loginIntoConnect(task: TaskGroup) {
	const email = (await text({
		message: "What is your email?",
		initialValue: Api.connect.email,
	})) as string;

	if (isCancel(email)) {
		throw new LoginError("Email is required to login to scripting");
	}

	let loggedIn = await Api.connect.login(email);
	if (!loggedIn) {
		note(`Verification code sent to ${email}`, "Nulls Connect");

		const pin = (await text({
			message: "Verification code",
		})) as string;

		if (isCancel(pin)) {
			throw new LoginError("Code is required to login");
		}

		loggedIn = await Api.connect.login(email, pin);
	}

	// Shouldn't happen
	if (!loggedIn) {
		throw new LoginError("Failed to login");
	}

	let chosenAccount = Api.connect.chosenAccount?.player_id;
	if (Api.connect.chosenAccount !== undefined) {
		return;
	}

	if (chosenAccount === undefined) {
		// Selecting user account
		const accounts = Api.connect.accounts;

		// Using the single one we have
		if (accounts.length === 1) {
			Api.connect.chosenAccount = (accounts[0] as LinkedAccount).player_id;
			return;
		}

		chosenAccount = (await select({
			message: "Pick nulls account",
			options: accounts.map((account) => {
				return {
					value: account.player_id,
					label: account.name,
					hint: account.tag,
				};
			}),
		})) as string;

		if (isCancel(chosenAccount)) {
			throw new LoginError(
				"You need to select proper nulls account to login into scripting",
			);
		}
	}

	Api.connect.chosenAccount = chosenAccount;
	task.success(
		`Logged in as ${Api.connect.chosenAccount?.name} (${Api.connect.chosenAccount?.tag})`,
	);
}

async function loginIntoApi() {
	const task = taskLog({
		title: "Logging in",
	});

	if (!Api.valid && !Api.connect.valid) {
		note("Nulls Connect is required to get into scripting", "First login");
	}

	if (Api.expired) {
		note("Your API session is expired. Please login again.", "Welcome back");
	}

	// Login into nulls connect first
	if (!Api.connect.valid) {
		const connect = task.group("Nulls connect");
		await loginIntoConnect(connect);
	}

	task.message("Logging in to scripting.nulls.gg...");
	await Api.login();

	const username = Api.user.name || Api.user.username;
	task.success(`Logged in as ${username}`);
}

export async function verifyApiLogin() {
	if (Api.valid && !Api.expired) return;

	await loginIntoApi();
	return verifyApiLogin();
}

/** Simple decorator which checks for user login */
export function RequireLogin(
	_target: object,
	_propertyKey: string | symbol,
	descriptor: TypedPropertyDescriptor<(...args: any[]) => any>,
) {
	const original = descriptor.value;

	if (!original) {
		throw new Error("@RequireLogin can only decorate methods");
	}

	descriptor.value = async function (this: unknown, ...args: any[]) {
		await verifyApiLogin();
		return original.apply(this, args);
	};

	return descriptor;
}
