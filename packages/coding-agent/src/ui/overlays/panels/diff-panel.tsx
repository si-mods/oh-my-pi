/** @jsxImportSource @oh-my-pi/pi-tui */
/**
 * `/diff`: the working tree's changes as a panel under the conversation — status lines and the
 * unified diff, scrollable, refreshed on demand. A side-by-side pane needs a split layout the
 * terminal renderer does not have, so this is a bottom panel; Tern draws it natively.
 */
import { type JSXNode, type KeyEvent, type Signal, signal } from "@oh-my-pi/pi-tui";
import { $ } from "bun";

/** The panel's lines and window. */
export class DiffModel {
	readonly lines: Signal<readonly string[]> = signal([]);
	readonly scroll: Signal<number> = signal(0);
	readonly title: Signal<string> = signal("diff");
	readonly #cwd: string;
	readonly #rows: number;

	constructor(cwd: string, rows: number) {
		this.#cwd = cwd;
		this.#rows = Math.max(4, rows - 4);
	}

	/** Load `git status` and the working tree's diff. */
	async refresh(): Promise<void> {
		const status = await $`git -C ${this.#cwd} --no-pager status --porcelain`.quiet().nothrow();
		const diff = await $`git -C ${this.#cwd} --no-pager diff --no-color --no-ext-diff`.quiet().nothrow();
		const lines: string[] = [];
		const changed = status.text().trim();
		if (changed) {
			lines.push("Changes:", ...changed.split("\n"));
			lines.push("");
		}
		const body = diff.text().replace(/\s+$/, "");
		if (body) lines.push(...body.split("\n"));
		if (lines.length === 0) lines.push("No changes in the working tree.");
		this.lines.set(lines);
		this.scroll.set(0);
		this.title.set(`diff · ${this.#cwd}`);
	}

	/** Keys the panel takes: scroll, refresh, close (`onClose`). Returns true when handled. */
	async key(key: KeyEvent, onClose: () => void): Promise<boolean> {
		const max = Math.max(0, this.lines().length - this.#rows);
		const clamp = (value: number): void => this.scroll.set(Math.max(0, Math.min(max, value)));
		switch (key.id) {
			case "j":
			case "down":
				clamp(this.scroll() + 1);
				return true;
			case "k":
			case "up":
				clamp(this.scroll() - 1);
				return true;
			case "pagedown":
			case "ctrl+d":
				clamp(this.scroll() + this.#rows);
				return true;
			case "pageup":
			case "ctrl+u":
				clamp(this.scroll() - this.#rows);
				return true;
			case "g":
			case "home":
				this.scroll.set(0);
				return true;
			case "G":
			case "end":
				clamp(max);
				return true;
			case "r":
				await this.refresh();
				return true;
			case "escape":
			case "q":
				onClose();
				return true;
			default:
				return false;
		}
	}

	/** Rows the window shows (fixed at open: the terminal's height less chrome). */
	get rows(): number {
		return this.#rows;
	}

	/** The panel: the title, the visible window, and the key hints. */
	view(): JSXNode {
		return (
			<col>
				<text spans={[{ s: "accent", t: this.title() }]} />
				<rows lines={this.lines().slice(this.scroll(), this.scroll() + this.#rows)} />
				<text spans={[{ s: "dim", t: "j/k scroll · r refresh · esc close" }]} />
			</col>
		);
	}
}

/** The `/diff` panel as one overlay node; `onClose` runs for Esc/q. */
export function DiffPanel(props: { readonly model: DiffModel; readonly onClose: () => void }): JSXNode {
	return () => (
		<overlay
			key="diff-panel"
			role="omp.diff"
			anchor="bottom"
			size="lg"
			term={{ width: "full" }}
			onKey={key => {
				if (key.kind === "release") return false;
				void props.model.key(key, props.onClose);
				// The panel owns every key while it is open; unknown keys are swallowed.
				return true;
			}}
		>
			{props.model.view()}
		</overlay>
	);
}
