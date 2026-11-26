/** @jsxImportSource @oh-my-pi/pi-tui */
import { expect, it } from "bun:test";
import { signal, type KeyEvent, type UiNode } from "@oh-my-pi/pi-tui";
import { createTestTerminal } from "@oh-my-pi/pi-tui/testing/terminal";
import {
	firstInput,
	TranscriptSearch,
	type TranscriptSearchModel,
} from "../../src/ui/overlays/panels/transcript-search";

it("edits the query, shows the match counter, and reports Enter", () => {
	const query = signal("");
	const caret = signal(0);
	const status = signal({ index: 0, count: 0 });
	const keys: string[] = [];
	const model: TranscriptSearchModel = {
		query,
		caret,
		status,
		onEdit: edit => {
			query.set(query().slice(0, edit.from) + edit.text + query().slice(edit.to));
			caret.set(edit.cursor);
			status.set({ index: query().length > 0 ? 1 : 0, count: query().length > 0 ? 3 : 0 });
		},
		onKey: (key: KeyEvent) => {
			if (key.id !== "enter") return false;
			keys.push(key.id);
			status.set({ index: 2, count: 3 });
			return true;
		},
	};
	const view = TranscriptSearch(model);
	const term = createTestTerminal(() => ({ layer: view, dock: <text text="dock" /> }), {
		columns: 40,
		rows: 8,
	});
	const input = firstInput(term.surface.layer()[0]!) as UiNode;
	expect(input.kind).toBe("input");
	term.focus(input);
	term.type("ab");
	expect(query()).toBe("ab");
	expect(term.screen().join("\n")).toContain("1/3");
	term.press("enter");
	expect(keys).toEqual(["enter"]);
	expect(term.screen().join("\n")).toContain("2/3");
	term.dispose();
});
