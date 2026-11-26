/** @jsxImportSource @oh-my-pi/pi-tui */
/**
 * The fullscreen transcript mode (`TermBackendOptions.transcriptFullscreen`): the transcript and the
 * dock paint on the alternate screen, the app scrolls a window over them, and the inline history
 * bookkeeping stays out of the way until the shutdown flush writes the transcript into scrollback.
 */
import { describe, expect, it } from "bun:test";
import { type Signal, type UiNode, signal } from "@oh-my-pi/pi-tui";
import { settle } from "@oh-my-pi/pi-tui/surface";
import { createTestTerminal, type TestTerminal } from "@oh-my-pi/pi-tui/testing/terminal";

interface Transcript {
	readonly term: TestTerminal;
	readonly blocks: Signal<UiNode[]>;
}

/** One settled one-row block per line, a one-row dock, on a 20x6 terminal by default. */
function transcript(lines: string[], options: { columns?: number; rows?: number } = {}): Transcript {
	const blocks = signal<UiNode[]>(lines.map(line => (<text text={line} />) as UiNode));
	for (const node of blocks.peek()) settle(node);
	const term = createTestTerminal(() => ({ main: () => blocks(), dock: <text text="dock" /> }), {
		columns: options.columns ?? 20,
		rows: options.rows ?? 6,
		transcriptFullscreen: true,
	});
	return { term, blocks };
}

/** Append a settled block to the transcript. */
function append(blocks: Signal<UiNode[]>, line: string): void {
	const node = (<text text={line} />) as UiNode;
	settle(node);
	blocks.set([...blocks.peek(), node]);
}

describe("fullscreen transcript", () => {
	it("paints the transcript and the dock on the alternate screen and writes no history", () => {
		const { term } = transcript(["a", "b", "c"]);

		expect(term.fullscreen()).toHaveLength(6);
		expect(term.screen()).toEqual(["a", "", "b", "", "c", "dock"]);
		expect(term.history()).toEqual([]);
		term.dispose();
	});

	it("follows the newest rows and keeps the dock pinned", () => {
		const { term, blocks } = transcript(["a", "b", "c", "d", "e", "f", "g", "h"]);

		expect(term.screen()).toEqual(["f", "", "g", "", "h", "dock"]);
		append(blocks, "i");
		term.render();
		expect(term.screen()).toEqual(["g", "", "h", "", "i", "dock"]);
		term.dispose();
	});

	it("scrolls the window up and reports the rows left below", () => {
		const { term } = transcript(["a", "b", "c", "d", "e", "f", "g", "h"]);

		expect(term.backend.scrollTranscript(-4)).toBe(true);
		term.render();

		const screen = term.screen();
		expect(screen.slice(0, 4)).toEqual(["d", "", "e", ""]);
		expect(screen[4]).toContain("5 more lines");
		expect(screen[5]).toBe("dock");
		expect(term.backend.transcriptScroll()).toMatchObject({ top: 6, following: false });
		term.dispose();
	});

	it("holds a scrolled window still while new rows arrive", () => {
		const { term, blocks } = transcript(["a", "b", "c", "d", "e", "f", "g", "h"]);

		term.backend.scrollTranscript(-4);
		term.render();
		append(blocks, "i");
		append(blocks, "j");
		term.render();

		expect(term.screen().slice(0, 4)).toEqual(["d", "", "e", ""]);
		expect(term.backend.transcriptScroll()).toMatchObject({ top: 6, following: false });
		term.dispose();
	});

	it("returns to the tail on Ctrl+End", () => {
		const { term } = transcript(["a", "b", "c", "d", "e", "f", "g", "h"]);

		term.backend.scrollTranscript(-4);
		term.render();
		term.backend.scrollTranscript("bottom");
		term.render();

		expect(term.screen()).toEqual(["f", "", "g", "", "h", "dock"]);
		expect(term.backend.transcriptScroll()).toMatchObject({ following: true });
		term.dispose();
	});

	it("repaints the transcript at a new width", () => {
		const { term } = transcript(["0123456789abcdef"], { columns: 20, rows: 4 });

		expect(term.screen()).toEqual(["", "", "0123456789abcdef", "dock"]);
		term.resize(10, 4);
		expect(term.screen()).toEqual(["", "0123456789", "abcdef", "dock"]);
		term.dispose();
	});

	it("writes the whole transcript into history on the shutdown flush", () => {
		const { term } = transcript(["a", "b", "c"]);

		term.backend.flush();

		expect(term.history()).toEqual(["a", "", "b", "", "c"]);
		term.dispose();
	});

	it("switches modes between frames and replays the transcript inline", () => {
		const fullscreen = signal(false);
		const lines = ["a", "b", "c", "d", "e", "f", "g", "h"];
		const blocks = signal<UiNode[]>(lines.map(line => (<text text={line} />) as UiNode));
		for (const node of blocks.peek()) settle(node);
		const term = createTestTerminal(() => ({ main: () => blocks(), dock: <text text="dock" /> }), {
			columns: 20,
			rows: 6,
			transcriptFullscreen: fullscreen,
		});
		expect(term.fullscreen()).toBeUndefined();
		const inline = [...term.history()];
		expect(inline.length).toBeGreaterThan(0);

		fullscreen.set(true);
		term.render();
		expect(term.screen()).toEqual(["f", "", "g", "", "h", "dock"]);
		expect(term.history()).toEqual(inline);

		fullscreen.set(false);
		term.render();
		expect(term.fullscreen()).toBeUndefined();
		expect(term.history()).toEqual(inline);
		term.dispose();
	});
});

describe("fullscreen transcript selection", () => {
	/** The same transcript, with the copy callback captured. */
	function selectable(lines: string[]) {
		const blocks = signal<UiNode[]>(lines.map(line => (<text text={line} />) as UiNode));
		for (const node of blocks.peek()) settle(node);
		const copied: string[] = [];
		const term = createTestTerminal(() => ({ main: () => blocks(), dock: <text text="dock" /> }), {
			columns: 20,
			rows: 6,
			transcriptFullscreen: true,
			onTranscriptCopy: text => copied.push(text),
		});
		return { term, copied };
	}

	it("inverts the dragged cells and copies their text on release", () => {
		const { term, copied } = selectable(["a", "b", "c", "d", "e", "f", "g", "h"]);

		term.mouse({ row: 0, col: 0, button: "left", action: "press", mods: [] });
		expect(term.rows().some(row => row.includes("\x1b[7m"))).toBe(true);
		term.mouse({ row: 2, col: 0, button: "left", action: "drag", mods: [] });
		term.mouse({ row: 2, col: 0, button: "left", action: "release", mods: [] });

		expect(copied).toEqual(["f\n\ng"]);
		expect(term.rows().some(row => row.includes("\x1b[7m"))).toBe(false);
		term.dispose();
	});

	it("leaves clicks on the dock to the dock", () => {
		const { term, copied } = selectable(["a", "b", "c"]);

		term.mouse({ row: 5, col: 0, button: "left", action: "press", mods: [] });
		term.mouse({ row: 5, col: 2, button: "left", action: "release", mods: [] });

		expect(copied).toEqual([]);
		term.dispose();
	});

	it("drops a selection when the transcript scrolls", () => {
		const { term, copied } = selectable(["a", "b", "c", "d", "e", "f", "g", "h"]);

		term.mouse({ row: 0, col: 0, button: "left", action: "press", mods: [] });
		term.mouse({ row: 1, col: 0, button: "left", action: "drag", mods: [] });
		term.backend.scrollTranscript(-2);
		term.render();
		term.mouse({ row: 1, col: 0, button: "left", action: "release", mods: [] });

		expect(copied).toEqual([]);
		term.dispose();
	});
});

describe("fullscreen transcript clicks", () => {
	it("routes a click on a settled block's button to its action", () => {
		const acts: string[] = [];
		const button = (<button text="Go" actions={{ click: "go" }} onAction={act => acts.push(act)} />) as UiNode;
		settle(button);
		const blocks = signal<UiNode[]>([
			...["one", "two", "three"].map(line => (<text text={line} />) as UiNode),
			button,
		]);
		for (const node of blocks.peek()) settle(node);
		const term = createTestTerminal(() => ({ main: () => blocks(), dock: <text text="dock" /> }), {
			columns: 20,
			rows: 6,
			transcriptFullscreen: true,
		});

		const row = term.screen().findIndex(line => line.includes("Go"));
		expect(row).toBeGreaterThanOrEqual(0);
		term.mouse({ row, col: 1, button: "left", action: "press", mods: [] });
		term.mouse({ row, col: 1, button: "left", action: "release", mods: [] });

		expect(acts).toEqual(["go"]);
		term.dispose();
	});

	it("jumps to the tail when the indicator row is clicked", () => {
		const blocks = signal<UiNode[]>(
			["a", "b", "c", "d", "e", "f", "g", "h"].map(line => (<text text={line} />) as UiNode),
		);
		for (const node of blocks.peek()) settle(node);
		const term = createTestTerminal(() => ({ main: () => blocks(), dock: <text text="dock" /> }), {
			columns: 20,
			rows: 6,
			transcriptFullscreen: true,
		});

		term.backend.scrollTranscript(-4);
		term.render();
		const indicator = term.screen().findIndex(line => line.includes("more lines"));
		expect(indicator).toBeGreaterThanOrEqual(0);
		term.mouse({ row: indicator, col: 2, button: "left", action: "press", mods: [] });
		term.mouse({ row: indicator, col: 2, button: "left", action: "release", mods: [] });

		expect(term.backend.transcriptScroll()?.following).toBe(true);
		expect(term.screen().some(line => line.includes("more lines"))).toBe(false);
		term.dispose();
	});
});

describe("fullscreen transcript expanders", () => {
	it("bubbles a click on a collapsed tool's head as the expand action", () => {
		const acts: string[] = [];
		const tool = (
			<tool
				name="bash"
				title="seq 1 3"
				status="done"
				frame="inline"
				collapsible
				collapsed
				preview="none"
				onAction={act => acts.push(act)}
			>
				<text text="1" />
			</tool>
		) as UiNode;
		const blocks = signal<UiNode[]>(["one", "two"].map(line => (<text text={line} />) as UiNode));
		blocks.set([...blocks.peek(), tool]);
		for (const node of blocks.peek()) settle(node);
		const term = createTestTerminal(() => ({ main: () => blocks(), dock: <text text="dock" /> }), {
			columns: 30,
			rows: 8,
			transcriptFullscreen: true,
		});

		const head = term.screen().findIndex(line => line.includes("seq 1 3"));
		expect(head).toBeGreaterThanOrEqual(0);
		term.mouse({ row: head, col: 1, button: "left", action: "press", mods: [] });
		term.mouse({ row: head, col: 1, button: "left", action: "release", mods: [] });

		expect(acts).toEqual(["omp.toggle"]);
		term.dispose();
	});
});

describe("fullscreen transcript card heads", () => {
	it("bubbles a click on a collapsed card's top border as the expand action", () => {
		const acts: string[] = [];
		const tool = (
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
		settle(tool);
		const blocks = signal<UiNode[]>([tool]);
		const term = createTestTerminal(() => ({ main: () => blocks(), dock: <text text="dock" /> }), {
			columns: 30,
			rows: 8,
			transcriptFullscreen: true,
		});
		const border = term.screen().findIndex(line => line.includes("seq 1 3"));
		expect(border).toBeGreaterThanOrEqual(0);
		term.mouse({ row: border, col: 2, button: "left", action: "press", mods: [] });
		term.mouse({ row: border, col: 2, button: "left", action: "release", mods: [] });
		expect(acts).toEqual(["omp.toggle"]);
		term.dispose();
	});
});
