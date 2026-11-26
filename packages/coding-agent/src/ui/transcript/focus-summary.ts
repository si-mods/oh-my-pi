/**
 * `/focus` tool summaries: one line per tool call — what it touched and, for edits, its diffstat.
 * A summary is the compact presentation's label, so it becomes the card's head target.
 */
const SUMMARY_WIDTH = 60;

/** Last `max` path segments, keeping a trailing file name readable. */
function shortPath(path: string): string {
	const clean = path.replace(/^\.\//, "");
	const parts = clean.split("/");
	return parts.length <= 2 ? clean : `…/${parts.slice(-2).join("/")}`;
}

/** Lines shared at the start and at the end, for an approximate diffstat of one edit. */
function changedLines(before: string, after: string): { added: number; removed: number } {
	const oldLines = before === "" ? [] : before.split("\n");
	const newLines = after === "" ? [] : after.split("\n");
	let start = 0;
	while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start++;
	let end = 0;
	while (
		end < oldLines.length - start &&
		end < newLines.length - start &&
		oldLines[oldLines.length - 1 - end] === newLines[newLines.length - 1 - end]
	)
		end++;
	return { added: newLines.length - start - end, removed: oldLines.length - start - end };
}

function diffstat(before: string, after: string): string {
	const { added, removed } = changedLines(before, after);
	return `+${added} −${removed}`;
}

/** The one-line summary of a tool call, or undefined when the default head already says it. */
export function focusToolSummary(name: string, args: unknown): string | undefined {
	if (typeof args !== "object" || args === null) return undefined;
	const record = args as Record<string, unknown>;
	const path =
		typeof record.file_path === "string"
			? record.file_path
			: typeof record.path === "string"
				? record.path
				: undefined;
	switch (name) {
		case "edit":
		case "apply_patch": {
			if (!path) return undefined;
			const before = typeof record.old_string === "string" ? record.old_string : undefined;
			const after = typeof record.new_string === "string" ? record.new_string : undefined;
			const stat = before !== undefined && after !== undefined ? ` ${diffstat(before, after)}` : "";
			return `${shortPath(path)}${stat}`;
		}
		case "write": {
			if (!path) return undefined;
			const content = typeof record.content === "string" ? record.content : undefined;
			const added = content === undefined || content === "" ? 0 : content.split("\n").length;
			return `${shortPath(path)} +${added}`;
		}
		case "read":
			return path ? shortPath(path) : undefined;
		case "bash": {
			const command = typeof record.command === "string" ? record.command.split("\n")[0]?.trim() : undefined;
			return command ? command.slice(0, SUMMARY_WIDTH) : undefined;
		}
		case "grep":
		case "glob":
		case "ls": {
			const pattern = typeof record.pattern === "string" ? record.pattern : path;
			return pattern ? pattern.slice(0, SUMMARY_WIDTH) : undefined;
		}
		default:
			return undefined;
	}
}
