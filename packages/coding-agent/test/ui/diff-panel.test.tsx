/** @jsxImportSource @oh-my-pi/pi-tui */
import { expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { $ } from "bun";
import { DiffModel } from "../../src/ui/overlays/panels/diff-panel";

it("shows the working tree's changes, refreshes, and closes on q", async () => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omp-diff-"));
	try {
		await $`git -C ${dir} init -q`.quiet();
		await Bun.write(path.join(dir, "a.txt"), "first\n");
		await $`git -C ${dir} add -N a.txt`.quiet();

		const model = new DiffModel(dir, 30);
		await model.refresh();
		const shown = model.lines().join("\n");
		expect(shown).toContain("Changes:");
		expect(shown).toContain("a.txt");
		expect(shown).toContain("+first");

		await Bun.write(path.join(dir, "a.txt"), "second\n");
		await model.refresh();
		expect(model.lines().join("\n")).toContain("+second");

		let closed = false;
		expect(await model.key({ id: "j" } as never, () => {})).toBe(true);
		expect(
			await model.key({ id: "q" } as never, () => {
				closed = true;
			}),
		).toBe(true);
		expect(closed).toBe(true);
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
});
