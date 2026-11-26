import { expect, it } from "bun:test";
import { focusToolSummary } from "../../src/ui/transcript/focus-summary";

it("summarises edits with a diffstat for the changed lines", () => {
	expect(focusToolSummary("edit", { file_path: "src/a.ts", old_string: "a\nb\nc", new_string: "a\nB\nc" })).toBe(
		"src/a.ts +1 −1",
	);
	expect(focusToolSummary("edit", { file_path: "src/a.ts", old_string: "", new_string: "x\ny" })).toBe(
		"src/a.ts +2 −0",
	);
});

it("summarises writes, reads, and commands", () => {
	expect(focusToolSummary("write", { file_path: "/repo/src/b.ts", content: "1\n2\n3" })).toBe(
		"…/src/b.ts +3".replace("…/src/b.ts", "…/src/b.ts"),
	);
	expect(focusToolSummary("read", { file_path: "README.md" })).toBe("README.md");
	expect(focusToolSummary("bash", { command: "npm test -- --watch=false" })).toBe("npm test -- --watch=false");
	expect(focusToolSummary("bash", { command: "" })).toBeUndefined();
	expect(focusToolSummary("todo", {})).toBeUndefined();
});
