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
	const blocks = signal<UiNode[]>(lines.map(line => <text text={line} /> as UiNode));
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
		const blocks = signal<UiNode[]>(lines.map(line => <text text={line} /> as UiNode));
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
