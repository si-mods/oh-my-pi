/** @jsxImportSource @oh-my-pi/pi-tui */
import { expect, it } from "bun:test";
import { signal, type UiNode } from "@oh-my-pi/pi-tui";
import { defineRolePainter, EMPTY_BLOCK } from "@oh-my-pi/pi-tui/term/paint";
import { PLAIN_THEME } from "@oh-my-pi/pi-tui/theme/plain";
import { settle } from "@oh-my-pi/pi-tui/surface";
import { createTestTerminal } from "@oh-my-pi/pi-tui/testing/terminal";
import "../../src/ui/shell/transcript";

it("bubbles a tool head hit through the transcript's omp.block wrapper", () => {
	const acts: string[] = [];
	const card = (
		<tool
			name="bash"
			title="seq 1 3"
			status="done"
			frame="card"
			collapsible
			collapsed
			preview="none"
			onAction={act => acts.push(act)}
		>
			<text text="1" />
		</tool>
	) as UiNode;
	const block = (<col role="omp.block">{card}</col>) as UiNode;
	settle(block);
	const blocks = signal<UiNode[]>([block]);
	const term = createTestTerminal(() => ({ main: () => blocks(), dock: <text text="dock" /> }), {
		columns: 30,
		rows: 8,
		transcriptFullscreen: true,
	});
	const row = term.screen().findIndex(line => line.includes("seq 1 3"));
	expect(row).toBeGreaterThanOrEqual(0);
	term.mouse({ row, col: 2, button: "left", action: "press", mods: [] });
	term.mouse({ row, col: 2, button: "left", action: "release", mods: [] });
	expect(acts).toEqual(["omp.toggle"]);
	term.dispose();
});

it("keeps the head hit when the block paints a blank row above it", () => {
	// A card that pads above its head, inside the transcript's trimming block wrapper.
	defineRolePainter("tool", "test.padded", (node: UiNode) => {
		void node;
		return { ...EMPTY_BLOCK, rows: ["", PLAIN_THEME.fg("accent", "PADDED HEAD"), "body"] };
	});
	const acts: string[] = [];
	const card = (
		<tool
			role="test.padded"
			name="bash"
			title="x"
			status="done"
			collapsible
			collapsed
			onAction={act => acts.push(act)}
		/>
	) as UiNode;
	const block = (<col role="omp.block">{card}</col>) as UiNode;
	settle(block);
	const blocks = signal<UiNode[]>([block]);
	const term = createTestTerminal(() => ({ main: () => blocks(), dock: <text text="dock" /> }), {
		columns: 30,
		rows: 8,
		transcriptFullscreen: true,
	});
	const row = term.screen().findIndex(line => line.includes("PADDED HEAD"));
	expect(row).toBeGreaterThanOrEqual(0);
	term.mouse({ row, col: 2, button: "left", action: "press", mods: [] });
	term.mouse({ row, col: 2, button: "left", action: "release", mods: [] });
	expect(acts).toEqual(["omp.toggle"]);
	term.dispose();
});
