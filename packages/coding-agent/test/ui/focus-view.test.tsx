/** @jsxImportSource @oh-my-pi/pi-tui */
import { expect, it } from "bun:test";
import type { UiNode } from "@oh-my-pi/pi-tui";
import { isUserBlock, lastUserBlock } from "../../src/ui/shell/transcript";

const block = (role: string): UiNode =>
	(
		<col role="omp.block">
			<card role={role} />
		</col>
	) as UiNode;

it("finds the last user prompt among transcript blocks", () => {
	const nodes = [
		block("omp.user"),
		block("omp.assistant"),
		block("omp.tool"),
		block("omp.user.synthetic"),
		block("omp.assistant"),
	];
	expect(isUserBlock(nodes[0]!)).toBe(true);
	expect(isUserBlock(nodes[1]!)).toBe(false);
	expect(lastUserBlock(nodes)).toBe(3);
});

it("reports no prompt when the transcript has none", () => {
	expect(lastUserBlock([block("omp.assistant"), block("omp.tool")])).toBe(-1);
});
