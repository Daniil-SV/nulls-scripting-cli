import {
	alternateBuffer,
	close,
	createInput,
	createTerm,
	cursor,
	fixed,
	grow,
	type Input,
	type InputEvent,
	type KeyCode,
	type KeyDown,
	type KeyRepeat,
	type MouseDownEvent,
	type MouseMoveEvent,
	mouseTracking,
	type Op,
	open,
	rgba,
	type Setting,
	settings,
	type Term,
	text,
	type WheelEvent,
} from "@bomb.sh/tty";
import { spinner } from "@clack/prompts";
import { Flags } from "@oclif/core";
import openUrl from "open";
import Api, { type ScriptSummary } from "@/api/scripting/index.js";
import config from "@/config.js";
import device from "@/device/index.js";
import { RequireLogin } from "@/shared/auth.js";
import { BaseCommand } from "@/shared/command.js";
import { buildBattleLink } from "@/shared/deeplink.js";
import { formatPublishDate, formatUpdateDate } from "@/shared/format.js";
import { clearScreen } from "@/shared/terminal.js";
import { SCRIPTING_URL } from "@/url.js";

const C = {
	bg: rgba(14, 16, 22),
	descriptionBg: rgba(20, 23, 31),
	fg: rgba(210, 214, 222),
	dim: rgba(120, 126, 140),
	border: rgba(48, 54, 68),
	accent: rgba(110, 200, 255),
	selectedBg: rgba(38, 48, 70),
	action: rgba(120, 220, 180),
	error: rgba(255, 120, 120),
	pink: rgba(255, 182, 193),
	pink_dim: rgba(255, 105, 180),
};

const CELL_GAP = 2;
const TARGET_CELL_WIDTH = 36;
const MAX_COLUMNS = 5;
const CHROME_HEIGHT = 3; // header + actions + status

const shareTokens = new Map<string, string>();

async function deeplinkFor(script: ScriptSummary): Promise<string> {
	let token = shareTokens.get(script.script_id);

	if (!token) {
		const share = await Api.post("/scripts/{scriptId}/share", {
			params: { path: { scriptId: script.script_id } },
		});
		token = share.token;
		shareTokens.set(script.script_id, token);
	}

	return await buildBattleLink({
		scriptId: script.script_id,
		parameters: config.parameters ?? [],
	});
}

const wrap = (value: string, maxWidth: number, maxLines: number) => {
	const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
	const lines: string[] = [];
	let line = "";

	for (const word of words) {
		if (lines.length >= maxLines) break;

		const candidate = line ? `${line} ${word}` : word;

		if ([...candidate].length <= maxWidth) {
			line = candidate;
			continue;
		}

		if (line) {
			lines.push(truncate(line, maxWidth));
			line = word;
		} else {
			lines.push(truncate(word, maxWidth));
			line = "";
		}
	}

	if (line && lines.length < maxLines) lines.push(truncate(line, maxWidth));

	return lines;
};

const truncate = (value: string, max: number) => {
	const clean = value.replace(/\s+/g, " ").trim();
	const chars = [...clean];
	const limit = Math.max(1, max);

	return chars.length <= limit
		? clean
		: `${chars.slice(0, Math.max(0, limit - 1)).join("")}…`;
};

interface TtyContext {
	term: Term;
	input: Input;
	setting: Setting;
}

interface ContextAction {
	key: KeyCode[];
	label: string;
	private: boolean;
	callback: (script: ScriptSummary) => boolean | Promise<boolean>;
}

interface FilterState {
	label: string;
	test(script: ScriptSummary): boolean;
}

interface Action {
	name: string;
	args: string;
	description: string;
	values?: string[];
	callback(args: string): Promise<boolean> | boolean;
}

enum State {
	List,
	Command,
}

export default class List extends BaseCommand {
	static override description = "Browse published scripts";
	static override flags = {
		json: Flags.boolean({ description: "Print raw JSON and exit" }),
	};

	static override examples = ["<%= config.bin %> <%= command.id %>"];

	static width = process.stdout.columns ?? 80;
	static height = process.stdout.rows ?? 24;

	private tty!: TtyContext;
	private selected = 0;
	private offset = 0;
	private input = "";
	private filter: FilterState = { label: "", test: () => true };
	private state: State = State.List;
	private status = "";
	private busy = false;
	private ttyActive = false;
	private escTimer: ReturnType<typeof setTimeout> | undefined;
	private lastClick = {
		index: -1,
		time: 0,
	};

	private useScriptsLibrary = true;
	private allScripts: ScriptSummary[] = [];
	private myScripts: ScriptSummary[] = [];

	private get scripts() {
		if (this.useScriptsLibrary) return this.allScripts;

		return this.myScripts;
	}

	private async openScriptWebsite(script: ScriptSummary) {
		await openUrl(`${SCRIPTING_URL}/scripts/${script.script_id}/view`);
		this.status = "opened website";
		return true;
	}

	private async openFriendlyBattle(script: ScriptSummary) {
		const url = await deeplinkFor(script);

		this.status = "waiting device...";

		// adb can print logs, start the emulator, wait for a device and show a
		// device picker, so always hide the list while it runs
		if (this.ttyActive) {
			await this.toggleTTY();

			try {
				await device.ensureDevice();
				clearScreen();
				await device.openUrl(url);
			} finally {
				// Always restore the list, even if the device setup or opening
				// the deeplink failed.
				await this.toggleTTY();
			}
		} else {
			await device.ensureDevice();
			await device.openUrl(url);
		}

		this.status = "friendly battle room created";
		return true;
	}

	private async toggleFavorite(script: ScriptSummary) {
		if (script.is_favorite) {
			await Api.delete("/users/{userId}/favorites", {
				body: { script_id: script.script_id },
				params: { path: { userId: Api.user.uuid } },
			});
			this.status = "removed from favorite";
		} else {
			await Api.post("/users/{userId}/favorites", {
				body: { script_id: script.script_id },
				params: { path: { userId: Api.user.uuid } },
			});

			this.status = "added to favorite";
		}

		script.is_favorite = !script.is_favorite;
		return true;
	}

	private async removeScript(script: ScriptSummary): Promise<boolean> {
		if (script.author_uuid !== Api.user.uuid) return true;

		await Api.delete("/scripts/{scriptId}", {
			params: { path: { scriptId: script.script_id } },
		});
		const index = this.myScripts.findIndex(
			(value) => value.script_id === script.script_id,
		);
		this.myScripts.splice(index, 1);
		return true;
	}

	private get contextActions(): ContextAction[] {
		return [
			{
				key: ["Enter"],
				label: "open website",
				private: false,
				callback: (script) => {
					return this.openScriptWebsite(script);
				},
			},
			{
				key: ["o"],
				label: "open friendly battle",
				private: false,
				callback: (script) => {
					return this.openFriendlyBattle(script);
				},
			},
			{
				key: ["f"],
				label: "add to favorite",
				private: false,
				callback: (script) => {
					return this.toggleFavorite(script);
				},
			},
			{
				key: ["r"],
				label: "remove script",
				private: true,
				callback: (script) => {
					return this.removeScript(script);
				},
			},
		] as const;
	}

	private get actions(): Action[] {
		return [
			{
				name: "filter",
				args: "<text>",
				description: "Filter by script or author name",
				callback: (args) => {
					const value = args.trim();
					const query = value.toLowerCase();
					const title = query ? `filter: ${value}` : "";

					this.setFilter(title, (script) => {
						if (query)
							return `${script.name} ${script.author_name}`
								.toLowerCase()
								.includes(query);

						return true;
					});
					this.status = query ? `filter: ${value}` : "filter cleared";
					return true;
				},
			},
			{
				name: "author",
				args: "<uuid|me>",
				description: "Filter by author UUID, or 'me' for yourself",
				values: ["me"],
				callback: async (args) => {
					const value = args.trim();

					if (!value) {
						this.status = "error: /author needs a uuid or 'me'";
						return false;
					}

					const uuid = value;
					const label = value;

					if (value.toLowerCase() === "me") {
						this.useScriptsLibrary = false;
						return true;
					} else {
						this.useScriptsLibrary = true;
					}

					this.setFilter(
						`author: ${label}`,
						(script) => script.author_uuid.toLowerCase() === uuid.toLowerCase(),
					);
					this.status = `author: ${label}`;
					return true;
				},
			},
		];
	}

	private async runContextAction(
		action: (typeof this.contextActions)[number],
	): Promise<boolean> {
		const script = this.activeScripts[this.selected];
		if (!script || this.busy) return false;

		this.busy = true;
		this.status = `working: ${action.label}…`;
		this.draw();

		try {
			return await action.callback(script);
		} catch (error) {
			this.status = `error: ${(error as Error).message}`;
		} finally {
			this.busy = false;
			this.draw();
		}

		return false;
	}

	private setFilter(label: string, test: FilterState["test"]) {
		this.filter = { label, test };
		this.selected = 0;
		this.offset = 0;
	}

	private clearFilter() {
		this.setFilter("", () => true);
	}

	private async runInput(raw: string): Promise<boolean> {
		const value = raw.trim().replace(/^\/+/, "");
		const [name, ...rest] = value.split(/\s+/);
		const action = this.actions.find(
			(item) => item.name === name?.toLowerCase(),
		);

		if (action) return action.callback(rest.join(" "));

		const fallback = this.actions.find((item) => item.name === "filter");
		return fallback?.callback(value) ?? true;
	}

	private get suggestions(): Action[] {
		const value = this.input.trimStart();
		if (!value) return this.actions;

		const name = value.split(/\s+/)[0]?.toLowerCase() ?? "";
		const exact = this.actions.find((action) => action.name === name);

		if (exact) return [exact];

		return this.actions.filter((action) => action.name.startsWith(name));
	}

	private completeInput(): boolean {
		const value = this.input;
		const firstSpace = value.indexOf(" ");

		if (firstSpace === -1) {
			const prefix = value.trim().toLowerCase();
			if (!prefix) return false;

			const matches = this.actions.filter((action) =>
				action.name.startsWith(prefix),
			);
			const match = matches[0];
			if (!match) return false;

			this.input = `${match.name} `;
			return true;
		}

		const [name, ...rest] = value.split(/\s+/);
		const action = this.actions.find(
			(item) => item.name === name?.toLowerCase(),
		);
		if (!action?.values?.length) return false;

		const prefix = rest.join(" ").trim().toLowerCase();
		const match = action.values.find((item) =>
			item.toLowerCase().startsWith(prefix),
		);
		if (!match) return false;

		this.input = `${action.name} ${match}`;
		return true;
	}

	private calculateLayout() {
		const usableWidth = Math.max(1, List.width - 2);
		const columns = Math.max(
			1,
			Math.min(
				MAX_COLUMNS,
				Math.floor((usableWidth + CELL_GAP) / (TARGET_CELL_WIDTH + CELL_GAP)),
			),
		);
		const cellWidth = Math.max(
			12,
			Math.floor((usableWidth - (columns - 1) * CELL_GAP) / columns),
		);

		const descriptionMinHeight = Math.max(
			0,
			Math.min(6, Math.floor(List.height * 0.25)),
		);
		const maxListRows = Math.max(
			1,
			List.height - CHROME_HEIGHT - descriptionMinHeight,
		);

		const active = this.activeScripts;
		const rowsNeeded = Math.max(1, Math.ceil(active.length / columns));
		const listRows = Math.min(rowsNeeded, maxListRows);
		const descriptionHeight = Math.max(
			0,
			List.height - CHROME_HEIGHT - listRows,
		);

		return {
			columns,
			cellWidth,
			listRows,
			descriptionHeight,
			capacity: listRows * columns,
		};
	}

	private buildLayout(): Op[] {
		const { columns, cellWidth, listRows, descriptionHeight } =
			this.calculateLayout();

		const active = this.activeScripts;
		const capacity = listRows * columns;
		const rows = active.slice(this.offset, this.offset + capacity);
		const gridRows: ScriptSummary[][] = [];

		for (let index = 0; index < rows.length; index += columns) {
			gridRows.push(rows.slice(index, index + columns));
		}

		const selectedScript = active[this.selected];
		const authorScript = selectedScript?.author_uuid === Api.user.uuid;
		const descLines = this.descriptionLines(selectedScript);
		const help =
			" i/k up/down | j/l left/right | enter open | / commands | q quit";

		const root = open("root", {
			layout: {
				width: grow(),
				height: grow(),
				direction: "ttb",
				padding: { left: 1, right: 1 },
			},
			bg: C.bg,
		});

		const header = open("header", {
			layout: { width: grow(), height: fixed(1) },
			clip: { horizontal: true },
		});

		const totalPages = Math.max(
			1,
			Math.ceil(active.length / Math.max(1, capacity)),
		);

		const page = Math.min(
			totalPages,
			Math.floor(this.selected / Math.max(1, capacity)) + 1,
		);

		const filterLabel = this.filter.label ? `  · ${this.filter.label}` : "";

		const title = text(
			` Nulls scripting  ${active.length}/${this.scripts.length}  page ${page}/${totalPages}${filterLabel}`,
			{ color: C.accent },
		);

		const listHead = open("list", {
			layout: {
				width: grow(),
				height: fixed(listRows),
				direction: "ttb",
			},
			clip: { horizontal: true, vertical: true },
		});

		const grid = gridRows.flatMap((row, rowIndex) => {
			const rowId = this.offset + rowIndex * columns;

			return [
				open(`grid:${rowId}`, {
					layout: {
						width: grow(),
						height: fixed(1),
						direction: "ltr",
						gap: CELL_GAP,
					},
				}),
				...row.flatMap((script: ScriptSummary, columnIndex: number) => {
					const index = rowId + columnIndex;
					const isSelected = index === this.selected;

					const row = open(`row:${script.script_id}`, {
						layout: {
							width: fixed(cellWidth),
							height: fixed(1),
						},
						clip: { horizontal: true },
						...(isSelected ? { bg: C.selectedBg } : {}),
					});

					const color = script.is_favorite
						? isSelected
							? C.pink
							: C.pink_dim
						: isSelected
							? C.fg
							: C.dim;

					const label = text(
						`${isSelected ? "▸ " : "  "}${truncate(
							script.name,
							cellWidth - 2,
						)}`,
						{ color },
					);

					return [row, label, close()];
				}),
				close(),
			];
		});

		const scriptDescription = open("description", {
			layout: {
				width: grow(),
				height: grow(),
				direction: "ttb",
				padding: {
					left: 1,
					right: 1,
					top: descriptionHeight > 0 ? 1 : 0,
				},
			},
			bg: C.descriptionBg,
			...(descriptionHeight > 0 ? { border: { color: C.border, top: 1 } } : {}),
			clip: { horizontal: true, vertical: true },
		});

		const actionsHead = open("actions", {
			layout: { width: grow(), height: fixed(1), gap: 1 },
			clip: { horizontal: true },
		});

		let actions: { id?: string; label: string }[];
		if (this.state === State.Command) {
			actions = this.suggestions.map((action) => ({
				id: action.name,
				label: `[${action.name}] ${action.args}`,
			}));
		} else {
			const active = this.contextActions.filter((action) => {
				if (action.private && !authorScript) return false;

				return true;
			});

			actions = active.map((action) => ({
				id: action.key[0],
				label: `[${action.key[0]}] ${action.label}`,
			}));
		}

		const actionLayout = actions.flatMap((action) => [
			open(`action:${action.id}`, {
				layout: { padding: { left: 1, right: 1 } },
			}),
			text(action.label, { color: C.action }),
			close(),
		]);

		return [
			// Head block
			root,
			header,
			title,
			close(),

			// Items block
			listHead,
			...grid,
			close(),

			// Script description block
			scriptDescription,
			...descLines.map((line, index) =>
				text(line || " ", {
					color: index === 0 ? C.fg : C.dim,
				}),
			),
			close(),

			actionsHead,
			...actionLayout,
			close(),

			// Status block
			open("status", { layout: { width: grow(), height: fixed(1) } }),
			this.state === State.Command
				? text(` /${this.input}`, {
						color: C.fg,
						caret: 2 + [...this.input].length,
					})
				: text(
						this.status ? ` ${this.status}` : truncate(help, List.width - 2),
						{
							color: this.status.startsWith("error") ? C.error : C.dim,
						},
					),
			close(),

			// End
			close(),
		];
	}

	private get activeScripts() {
		return this.scripts.filter((script) => this.filter.test(script));
	}

	private clamp() {
		const { capacity } = this.calculateLayout();
		const active = this.activeScripts;

		this.selected = Math.min(
			Math.max(this.selected, 0),
			Math.max(0, active.length - 1),
		);

		const pageStart =
			Math.floor(this.selected / Math.max(1, capacity)) * capacity;
		const maxStart = Math.max(0, active.length - capacity);
		this.offset = Math.min(pageStart, maxStart);
	}

	private draw() {
		this.clamp();
		const { output } = this.tty.term.render(this.buildLayout());
		process.stdout.write(output);
	}

	public async toggleTTY(): Promise<boolean> {
		if (this.ttyActive) {
			this.ttyActive = false;
			clearTimeout(this.escTimer);
			process.stdin.setRawMode(false);
			process.stdout.write("\x1b[0m");
			process.stdout.write(
				"\x1b[?1000h" + // Mouse button tracking
					"\x1b[?1002h" + // Mouse drag tracking
					"\x1b[?1006h", // SGR mouse encoding
			);
			process.stdout.write(this.tty.setting.revert);

			clearScreen();
			return false;
		}

		// The terminal may have been resized while the tty was hidden (e.g. while
		// an adb device picker was open), and resize events are ignored while
		// inactive, so pick up the current size before rebuilding the renderer.
		List.width = process.stdout.columns ?? List.width;
		List.height = process.stdout.rows ?? List.height;

		// A fresh term starts with a blank back buffer, so the first draw is a
		// full-frame repaint. Reusing the old term would only emit cells that
		// changed since the last frame, leaving the cleared screen half-drawn
		// until something else (like a terminal resize) forces a full repaint.
		await this.resetTTY();
		this.ttyActive = true;

		this.tty.input.scan();
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdout.write(this.tty.setting.apply);
		process.stdout.write("\x1b[0m\x1b[H\x1b[2J\x1b[3J");
		this.draw();

		return true;
	}

	private descriptionLines(script: ScriptSummary | undefined) {
		const { descriptionHeight } = this.calculateLayout();
		const maxWidth = Math.max(10, List.width - 4);
		const maxLines = Math.max(0, descriptionHeight - 2);

		if (maxLines === 0) return [];
		if (!script)
			return [truncate("No scripts match the current filter.", maxWidth)];

		const lines = [
			truncate(script.name, maxWidth),
			truncate(
				`by ${script.author_name} · ${formatUpdateDate(script.updated_at)}` +
					` · ${formatPublishDate(script.published_at)}`,
				maxWidth,
			),
		];

		const description = script.description?.trim();
		if (description && lines.length < maxLines) {
			if (maxLines - lines.length > 1) lines.push("");
			lines.push(...wrap(description, maxWidth, maxLines - lines.length));
		}

		return lines.slice(0, maxLines);
	}

	private async handleCommand(event: KeyDown | KeyRepeat): Promise<boolean> {
		if (event.code === "Enter") {
			if (this.input.trim()) await this.runInput(this.input);

			this.state = State.List;
			this.input = "";
			this.draw();
			return true;
		}

		if (event.code === "Escape") {
			this.state = State.List;
			this.input = "";
			this.clearFilter();
			this.status = "";
			this.draw();
			return true;
		}

		if (event.code === "Backspace") {
			this.input = [...this.input].slice(0, -1).join("");
			this.draw();
			return true;
		}

		if (event.code === "Tab") {
			if (this.completeInput()) this.draw();
			return true;
		}

		const typed = event.text ?? (event.code === " " ? " " : undefined);
		if (typed && !event.ctrl && !event.alt) {
			this.input += typed;
			this.draw();
		}

		return true;
	}

	private async updateState(event: KeyDown | KeyRepeat): Promise<boolean> {
		switch (this.state) {
			case State.Command:
				await this.handleCommand(event);
				return true;
		}

		if (event.code === "/") {
			this.state = State.Command;
			this.input = "";
			this.status = "";
			this.draw();
			return true;
		}

		return false;
	}

	private handleNavigation(event: KeyDown | KeyRepeat) {
		const { columns, capacity } = this.calculateLayout();
		const active = this.activeScripts;
		const pageStep = Math.max(columns, Math.floor(capacity / 2));

		if (event.code === "k" || event.code === "ArrowDown") {
			this.selected += columns;
		} else if (event.code === "i" || event.code === "ArrowUp") {
			this.selected -= columns;
		} else if (event.code === "j" || event.code === "ArrowLeft") {
			this.selected -= 1;
		} else if (event.code === "l" || event.code === "ArrowRight") {
			this.selected += 1;
		} else if ((event.code === "g" && event.shift) || event.key === "G") {
			this.selected = active.length - 1;
		} else if (event.code === "g") {
			this.selected = 0;
		} else if (event.ctrl && event.code === "d") {
			this.selected += pageStep;
		} else if (event.ctrl && event.code === "u") {
			this.selected -= pageStep;
		} else if (event.code === "PageDown") {
			this.selected += capacity;
		} else if (event.code === "PageUp") {
			this.selected -= capacity;
		}
	}

	private handleContextAction(event: KeyDown | KeyRepeat): boolean {
		for (const action of this.contextActions) {
			if (!action.key.includes(event.code)) continue;

			this.runContextAction(action);
			return true;
		}

		return false;
	}

	private getScriptIndexAt(x: number, y: number): number | undefined {
		const { columns, cellWidth, listRows } = this.calculateLayout();

		// Root padding
		x -= 1;

		// Header occupies row 0
		y -= 1;

		if (x < 0 || y < 0 || y >= listRows) return;

		const column = Math.floor(x / (cellWidth + CELL_GAP));

		if (column >= columns) return;

		// Ignore horizontal gaps between cards
		if (x % (cellWidth + CELL_GAP) >= cellWidth) return;

		const index = this.offset + y * columns + column;

		if (index >= this.activeScripts.length) return;

		return index;
	}

	private handleMouse(event: MouseDownEvent | MouseMoveEvent | WheelEvent) {
		if (this.state !== State.List || this.busy) return;

		if (event.type === "wheel") {
			if (event.y < 1) return;

			const { columns } = this.calculateLayout();

			this.selected += event.direction === "down" ? columns : -columns;
			this.status = "";
			this.draw();
			return;
		}

		if (event.type === "mousemove" && event.button !== "left") {
			return;
		}

		const index = this.getScriptIndexAt(event.x, event.y);
		if (index === undefined) return;

		if (this.selected !== index) {
			this.selected = index;
			this.status = "";
			this.draw();
		}

		if (event.type !== "mousedown") return;

		if (event.button === "right") {
			const openFriendly = this.contextActions[1];
			if (openFriendly !== undefined) this.runContextAction(openFriendly);
			return;
		}

		if (event.button !== "left") return;

		const now = Date.now();

		if (this.lastClick.index === index && now - this.lastClick.time < 350) {
			this.lastClick = { index: -1, time: 0 };

			const script = this.activeScripts[index];
			if (script !== undefined) this.openScriptWebsite(script);
			return;
		}

		this.lastClick = { index, time: now };
	}

	private async handleEvent(event: InputEvent): Promise<boolean> {
		if (
			event.type === "mousedown" ||
			event.type === "mousemove" ||
			event.type === "wheel"
		) {
			this.handleMouse(event);
		}

		if (event.type === "mouseup") return true;

		if (event.type !== "keydown" && event.type !== "keyrepeat") return true;

		if (event.type !== "keydown" && event.type !== "keyrepeat") return true;
		if (this.busy) return true;

		if (event.ctrl && event.code === "c") return false;
		if (await this.updateState(event)) return true;

		if (event.code === "Escape" || event.code === "q") return false;
		if (this.handleContextAction(event)) return true;

		this.handleNavigation(event);
		this.status = "";
		this.draw();
		return true;
	}

	private async runLoop() {
		const loop = Promise.withResolvers<void>();

		const onData = async (buffer: Buffer) => {
			if (!this.ttyActive) return;

			clearTimeout(this.escTimer);
			const { events, pending } = this.tty.input.scan(new Uint8Array(buffer));

			for (const event of events) {
				const success = await this.handleEvent(event);
				if (!success) {
					loop.resolve();
				}
			}

			if (pending) {
				this.escTimer = setTimeout(() => {
					if (!this.ttyActive) return;

					const flushed = this.tty.input.scan();
					for (const event of flushed.events) {
						this.handleEvent(event);
					}
				}, pending.delay);
			}
		};

		const onResize = () => {
			if (!this.ttyActive) return;

			List.width = process.stdout.columns ?? 80;
			List.height = process.stdout.rows ?? 24;
			process.stdout.write("\x1b[2J");
			const output = this.tty.term.update([
				{ type: "resize", width: List.width, height: List.height },
			]);
			if (output.length > 0) process.stdout.write(output);
			this.draw();
		};

		process.stdin.on("data", onData);
		process.stdout.on("resize", onResize);
		await this.toggleTTY();

		try {
			await loop.promise;
		} finally {
			process.stdin.off("data", onData);
			process.stdout.off("resize", onResize);

			if (this.ttyActive) await this.toggleTTY();
			process.stdin.pause();
		}
	}

	private async resetTTY() {
		this.tty = {
			term: await createTerm({ width: List.width, height: List.height }),
			input: await createInput({ escLatency: 25 }),
			setting: settings(alternateBuffer(), cursor(false), mouseTracking()),
		};
	}

	@RequireLogin
	public async run(): Promise<void> {
		const { flags } = await this.parse(List);
		await config.initialize(flags);

		const interactive =
			!flags.json && process.stdin.isTTY && process.stdout.isTTY;

		const spin = interactive ? spinner() : undefined;
		spin?.start("Loading scripts");
		const library = await Api.get("/scripts");
		spin?.stop(`${library.scripts.length} scripts`);

		if (!interactive) {
			this.log(JSON.stringify(library.scripts, null, 2));
			return;
		}

		const userLibrary = await Api.get("/users/{userId}/scripts", {
			params: { path: { userId: Api.user.uuid } },
		});
		this.allScripts = library.scripts;
		this.myScripts = userLibrary.scripts;
		await this.runLoop();
	}
}
