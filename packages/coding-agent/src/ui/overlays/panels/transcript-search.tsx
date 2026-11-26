/** @jsxImportSource @oh-my-pi/pi-tui */
/**
 * The fullscreen transcript's search sheet: one line for the query, the match counter, and the
 * keys it understands. The caller owns the backend search and the clipboard-free highlight.
 */
import type { JSXNode, KeyEvent, Signal, UiNode } from "@oh-my-pi/pi-tui";

/** What the sheet edits and reports. */
export interface TranscriptSearchModel {
	readonly query: Signal<string>;
	readonly caret: Signal<number>;
	/** 1-based current match and the total; `count === 0` reads as no matches. */
	readonly status: Signal<{ index: number; count: number }>;
	/** A text edit from the input (already applied by `onEdit`'s owner). */
	readonly onEdit: (edit: { from: number; to: number; text: string; cursor: number }) => void;
	/** Enter steps to the next match; anything else may close the sheet. */
	readonly onKey: (key: KeyEvent) => boolean;
}

/** The search sheet, as one overlay node; focus its input with {@link firstInput}. */
export function TranscriptSearch(model: TranscriptSearchModel): JSXNode {
	const input = (<input text={model.query} cursor={model.caret} onEdit={model.onEdit} />) as UiNode;
	return (
		<overlay
			key="transcript-search"
			role="omp.search"
			anchor="bottom"
			size="md"
			term={{ width: "full" }}
			onKey={model.onKey}
		>
			<col>
				<row gap="sm">
					<text text="find" />
					{input}
					<text
						text={() =>
							model.status().count === 0 ? "no matches" : `${model.status().index}/${model.status().count}`
						}
					/>
				</row>
				<text spans={[{ s: "dim", t: "type to search · ⏎ next · esc close" }]} />
			</col>
		</overlay>
	);
}

/** The first `input` under `node` (what the sheet focuses). */
export function firstInput(node: UiNode): UiNode | undefined {
	if (node.kind === "input") return node;
	for (const child of node.children()) {
		const found = firstInput(child);
		if (found) return found;
	}
	return undefined;
}
