import { afterEach, describe, expect, it } from "bun:test";
import * as path from "node:path";
import {
	type BuildHost,
	downloadBuildFile,
	fetchBuild,
	fetchReleaseBuild,
	isMuslLinuxForTest,
	OMP_BUILD,
	parseBuildAnswer,
	resolveBuildHost,
} from "@oh-my-pi/pi-coding-agent/cli/build-service";
import { TempDir, VERSION } from "@oh-my-pi/pi-utils";

const fileName = "omp-darwin-arm64";
const host: BuildHost = { target: "macos-arm64", asset: "darwin-arm64", windows: false };
const sha = (text: string) => Bun.SHA256.hash(text, "hex");

/** A well-formed `latest` answer, with `overrides` merged over the top level. */
function answer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		build: { id: "20261011-120000-abcdef0", version: "18.8.9", channel: "stable" },
		file: { name: fileName, platform: "macos", arch: "arm64", kind: "binary", size: 205_765_664, sha256: sha("new") },
		download: "https://r2.test/omp/18.8.9/omp-darwin-arm64?X-Amz-Signature=x",
		patch: {
			format: "file",
			from: "20261001-120000-1234567",
			from_sha256: sha("old"),
			size: 6_700_636,
			sha256: sha("patch"),
			url: "https://r2.test/patches/p?X-Amz-Signature=y",
		},
		...overrides,
	};
}

describe("build service answers", () => {
	it("keeps a complete file patch and the version the check named as installed", () => {
		const parsed = parseBuildAnswer(answer(), OMP_BUILD, host, "18.8.8");

		expect(parsed).toEqual({
			version: "18.8.9",
			file: { name: fileName, size: 205_765_664, sha256: sha("new") },
			download: "https://r2.test/omp/18.8.9/omp-darwin-arm64?X-Amz-Signature=x",
			patch: {
				fromSha256: sha("old"),
				fromVersion: "18.8.8",
				size: 6_700_636,
				sha256: sha("patch"),
				url: "https://r2.test/patches/p?X-Amz-Signature=y",
			},
		});
	});

	it("rejects answers that cannot be installed safely", () => {
		const file = (fields: Record<string, unknown>) => ({ file: { ...(answer().file as object), ...fields } });
		const parse = (body: Record<string, unknown>) => parseBuildAnswer(body, OMP_BUILD, host);
		expect(() => parse(answer(file({ sha256: sha("new").toUpperCase() })))).toThrow("invalid sha256");
		expect(() => parse(answer(file({ sha256: "abc" })))).toThrow("invalid sha256");
		expect(() => parse(answer(file({ size: 0 })))).toThrow("invalid size");
		expect(() => parse(answer(file({ name: "omp-darwin-x64" })))).toThrow("omp-darwin-x64 is not omp-darwin-arm64");
		expect(() => parse(answer({ download: "http://r2.test/omp" }))).toThrow("no HTTPS download");
		expect(() => parse(answer({ build: { version: "latest" } }))).toThrow("no valid version");
	});

	it("installs the whole file when the patch is incomplete or not a file patch", () => {
		const parse = (body: Record<string, unknown>) => parseBuildAnswer(body, OMP_BUILD, host);
		const { url: _url, ...withoutUrl } = answer().patch as Record<string, unknown>;
		expect(parse(answer({ patch: withoutUrl })).patch).toBeUndefined();
		expect(parse(answer({ patch: { ...(answer().patch as object), format: "tree" } })).patch).toBeUndefined();
		expect(
			parse(answer({ patch: { ...(answer().patch as object), url: "http://r2.test/p" } })).patch,
		).toBeUndefined();
	});
});

describe("build service targets", () => {
	it("maps platform, architecture, and libc to the service target and omp's release file name", () => {
		const resolve = (platform: NodeJS.Platform, arch: string, musl: boolean) => {
			const resolved = resolveBuildHost(platform, arch, musl);
			return { target: resolved.target, fileName: OMP_BUILD.fileName(resolved, "18.8.9") };
		};
		expect(resolve("darwin", "arm64", false)).toEqual({ target: "macos-arm64", fileName: "omp-darwin-arm64" });
		expect(resolve("linux", "x64", true)).toEqual({ target: "linux-musl-x86_64", fileName: "omp-linux-musl-x64" });
		expect(resolve("linux", "arm64", false)).toEqual({ target: "linux-arm64", fileName: "omp-linux-arm64" });
		expect(resolve("win32", "x64", false)).toEqual({ target: "windows-x86_64", fileName: "omp-windows-x64.exe" });
	});

	it("does not mistake an installed musl loader for a glibc host", () => {
		expect(
			isMuslLinuxForTest({
				platform: "linux",
				alpineRelease: false,
				lddOutput: "ldd (Ubuntu GLIBC 2.39-0ubuntu8.7) 2.39",
			}),
		).toBe(false);
	});

	it("recognizes a musl host from ldd output", () => {
		expect(
			isMuslLinuxForTest({
				platform: "linux",
				alpineRelease: false,
				lddOutput: "musl libc (x86_64)",
			}),
		).toBe(true);
	});
});

describe("fetchBuild", () => {
	const previousUrl = process.env.PI_BUILD_URL;

	afterEach(() => {
		if (previousUrl === undefined) delete process.env.PI_BUILD_URL;
		else process.env.PI_BUILD_URL = previousUrl;
	});

	it("asks the configured origin for the channel's newest build, naming the installed version", async () => {
		process.env.PI_BUILD_URL = "https://build.test/";
		const requests: Array<{ url: string; userAgent: string | null; signal: AbortSignal | null | undefined }> = [];

		const build = await fetchBuild(
			{ channel: "canary" },
			{
				host,
				repo: "can1357/oh-my-pi",
				fromVersion: "18.8.8",
				fetchImpl: async (input, init) => {
					requests.push({
						url: String(input),
						userAgent: new Headers(init?.headers).get("User-Agent"),
						signal: init?.signal,
					});
					return Response.json(answer());
				},
			},
		);

		expect(requests).toHaveLength(1);
		expect(requests[0].url).toBe(
			"https://build.test/api/products/omp/latest/macos-arm64?channel=canary&from_version=18.8.8",
		);
		expect(requests[0].userAgent).toBe(`omp/${VERSION}`);
		expect(requests[0].signal).toBeInstanceOf(AbortSignal);
		expect(build.patch?.fromVersion).toBe("18.8.8");
	});

	it("asks for one exact version without a channel", async () => {
		delete process.env.PI_BUILD_URL;
		let url = "";

		await fetchBuild(
			{ version: "18.8.9" },
			{
				host,
				repo: "can1357/oh-my-pi",
				fetchImpl: async input => {
					url = String(input);
					return Response.json(answer());
				},
			},
		);

		expect(url).toBe("https://build.stencil.so/api/products/omp/versions/18.8.9/macos-arm64");
	});

	it("names the target when nothing is published for it", async () => {
		await expect(
			fetchBuild(
				{ channel: "stable" },
				{
					host,
					repo: "can1357/oh-my-pi",
					fetchImpl: async () => Response.json({ error: "no_build" }, { status: 404 }),
				},
			),
		).rejects.toThrow("No omp stable build for macos-arm64 is published");
	});
});

describe("fetchReleaseBuild", () => {
	const repo = "acme/omp";
	const apiBase = "https://api.test";
	const digest = sha("binary");
	const assetUrl = "https://github.test/acme/omp/releases/download/v19.3.0/omp-darwin-arm64";
	const listingUrl = "https://github.test/acme/omp/releases/download/v19.3.0/SHASUMS256.txt";

	/** A release answer with `version`'s asset and, unless `withListing` is false, its checksum file. */
	function release(version: string, options: { withListing?: boolean; listing?: string } = {}): Response {
		const file = host.windows ? "omp-darwin-arm64.exe" : fileName;
		return Response.json({
			tag_name: `v${version}`,
			assets: [
				{ name: file, size: 6, browser_download_url: assetUrl },
				...(options.withListing === false
					? []
					: [{ name: "SHASUMS256.txt", size: 70, browser_download_url: listingUrl }]),
			],
		});
	}

	it("reads the newest release's asset and its checksum listing", async () => {
		const requests: string[] = [];
		const build = await fetchReleaseBuild(
			{ channel: "stable" },
			{
				repo,
				apiBase,
				host,
				fetchImpl: async input => {
					const url = String(input);
					requests.push(url);
					if (url === `${apiBase}/repos/${repo}/releases/latest`) return release("19.3.0");
					if (url === listingUrl) return new Response(`${digest}  ${fileName}\n${sha("other")}  other\n`);
					return new Response("unexpected", { status: 500 });
				},
			},
		);

		expect(build).toEqual({
			version: "19.3.0",
			file: { name: fileName, size: 6, sha256: digest },
			download: assetUrl,
		});
		expect(requests).toEqual([`${apiBase}/repos/${repo}/releases/latest`, listingUrl]);
	});

	it("asks for the tag of one exact version", async () => {
		let url = "";
		await fetchReleaseBuild(
			{ version: "19.3.0" },
			{
				repo,
				apiBase,
				host,
				fetchImpl: async input => {
					if (!url) {
						url = String(input);
						return release("19.3.0");
					}
					return new Response(`${digest}  ${fileName}\n`);
				},
			},
		);
		expect(url).toBe(`${apiBase}/repos/${repo}/releases/tags/v19.3.0`);
	});

	it("refuses a release without a checksum listing", async () => {
		await expect(
			fetchReleaseBuild(
				{ channel: "stable" },
				{ repo, apiBase, host, fetchImpl: async () => release("19.3.0", { withListing: false }) },
			),
		).rejects.toThrow("no SHASUMS256.txt");
	});

	it("refuses a listing that names no digest for the asset", async () => {
		await expect(
			fetchReleaseBuild(
				{ channel: "stable" },
				{
					repo,
					apiBase,
					host,
					fetchImpl: async input =>
						String(input).endsWith("/latest") ? release("19.3.0") : new Response(`${digest}  other\n`),
				},
			),
		).rejects.toThrow(`names no sha256 for ${fileName}`);
	});

	it("explains an empty repository", async () => {
		await expect(
			fetchReleaseBuild(
				{ channel: "stable" },
				{ repo, apiBase, host, fetchImpl: async () => new Response("{}", { status: 404 }) },
			),
		).rejects.toThrow(`No omp stable release for macos-arm64 is published on ${repo} yet`);
	});

	it("routes fetchBuild to GitHub releases for a fork's repository", async () => {
		const previousApi = process.env.PI_GITHUB_API;
		process.env.PI_GITHUB_API = apiBase;
		const requests: string[] = [];
		try {
			const build = await fetchBuild(
				{ channel: "stable" },
				{
					repo,
					host,
					fetchImpl: async input => {
						const url = String(input);
						requests.push(url);
						if (url.startsWith(`${apiBase}/repos/`)) return release("19.3.0");
						if (url === listingUrl) return new Response(`${digest}  ${fileName}\n`);
						return new Response("unexpected", { status: 500 });
					},
				},
			);
			expect(build.version).toBe("19.3.0");
		} finally {
			if (previousApi === undefined) delete process.env.PI_GITHUB_API;
			else process.env.PI_GITHUB_API = previousApi;
		}
		expect(requests[0]).toContain(`${repo}/releases/latest`);
		expect(requests.every(url => !url.includes("build.stencil.so"))).toBe(true);
	});
});

describe("downloadBuildFile", () => {
	const url = "https://r2.test/omp-linux-x64";
	const content = "verified binary";
	const sha256 = Bun.SHA256.hash(content, "hex");
	let temp: TempDir | undefined;

	afterEach(async () => {
		await temp?.remove();
		temp = undefined;
	});

	async function target(): Promise<string> {
		temp = await TempDir.create("@omp-build-download-");
		return path.join(temp.path(), "omp-linux-x64");
	}

	it("writes a download only after its size and digest match", async () => {
		const targetPath = await target();

		await downloadBuildFile({
			url,
			targetPath,
			size: Buffer.byteLength(content),
			sha256,
			fetchImpl: async () => new Response(content),
		});

		expect(await Bun.file(targetPath).text()).toBe(content);
	});

	it("reports cumulative bytes per chunk, ending at the full size", async () => {
		const chunks = ["verified ", "binary"];
		const received: number[] = [];

		await downloadBuildFile({
			url,
			targetPath: await target(),
			size: Buffer.byteLength(content),
			sha256,
			fetchImpl: async () =>
				new Response(
					new ReadableStream<Uint8Array>({
						pull(controller) {
							const chunk = chunks.shift();
							if (chunk === undefined) controller.close();
							else controller.enqueue(new TextEncoder().encode(chunk));
						},
					}),
				),
			onProgress: bytes => received.push(bytes),
		});

		expect(received).toEqual([9, 15]);
	});

	it("aborts the response stream as soon as it exceeds the expected size", async () => {
		const targetPath = await target();
		let pulls = 0;
		const body = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					pulls++;
					controller.enqueue(new Uint8Array(pulls === 1 ? 2 : 1));
					if (pulls === 2) controller.close();
				},
			},
			{ highWaterMark: 0 },
		);

		await expect(
			downloadBuildFile({ url, targetPath, size: 1, sha256, fetchImpl: async () => new Response(body) }),
		).rejects.toThrow("received at least 2");
		expect(pulls).toBe(1);
		expect(await Bun.file(targetPath).exists()).toBe(false);
	});

	it("wraps a timeout during body streaming with a friendly message", async () => {
		const targetPath = await target();
		const body = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					controller.enqueue(new Uint8Array(1));
					controller.error(new DOMException("The operation timed out.", "TimeoutError"));
				},
			},
			{ highWaterMark: 0 },
		);

		await expect(
			downloadBuildFile({
				url,
				targetPath,
				size: Buffer.byteLength(content),
				sha256,
				fetchImpl: async () => new Response(body),
			}),
		).rejects.toThrow(`Timed out downloading ${url} after 15 minutes`);
		expect(await Bun.file(targetPath).exists()).toBe(false);
	});

	it("removes downloads whose size or digest does not match", async () => {
		const targetPath = await target();
		const fetchImpl = async () => new Response(content);

		await expect(
			downloadBuildFile({ url, targetPath, size: Buffer.byteLength(content) + 1, sha256, fetchImpl }),
		).rejects.toThrow("size mismatch");
		expect(await Bun.file(targetPath).exists()).toBe(false);

		await expect(
			downloadBuildFile({
				url,
				targetPath,
				size: Buffer.byteLength(content),
				sha256: Bun.SHA256.hash("different binary", "hex"),
				fetchImpl,
			}),
		).rejects.toThrow("digest mismatch");
		expect(await Bun.file(targetPath).exists()).toBe(false);
	});
});
