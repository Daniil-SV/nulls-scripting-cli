export function clearScreen(): void {
	if (!process.stdin.isTTY && !process.stdout.isTTY) return;
	process.stdout.write("\x1b[H\x1b[2J\x1b[3J");
}
