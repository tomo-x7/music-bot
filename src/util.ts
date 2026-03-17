// config
import "dotenv/config";

const TOKEN = mustBeString(process.env.TOKEN, "env.TOKEN");
const VCID = mustBeString(process.env.VC, "env.VCID");
const SERVERID = mustBeString(process.env.SERVER, "env.SERVER");

export const config = { TOKEN, SERVERID, VCID } as const;

// utils
import { spawn } from "node:child_process";
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Client } from "discord.js";

export function waitReady(client: Client) {
	return new Promise<void>((resolve) => {
		client.once("clientReady", () => resolve());
		if (client.isReady()) resolve();
	});
}

export function mustBeString(str: unknown, ctx: string) {
	if (typeof str !== "string" || str.length === 0) throw new Error(`Expected string but got ${str} in ${ctx}`);
	return str;
}
export function mustBeNumber(str: unknown, ctx: string) {
	if (typeof str === "number") return str;
	if (typeof str === "string" && str.length > 0) {
		const num = Number.parseInt(str, 10);
		if (!Number.isNaN(num)) return num;
	}
	throw new Error(`Expected number but got ${str} in ${ctx}`);
}

export function assertNever(x: never): never {
	throw new Error("unreachable");
}

export async function sleep(ms: number) {
	return new Promise<void>((resolve) => setTimeout(() => resolve(), ms));
}

export function raceTimer<T>(p: Promise<T>, timeout: number): Promise<T | null> {
	return Promise.race([p, sleep(timeout).then(() => null)]);
}

export const neverAbort = new AbortController().signal;

await mkdir(join(import.meta.dirname, "../log"), { recursive: true });
const ffmpegLog = createWriteStream(join(import.meta.dirname, "../log/ffmpeg.log"), { flags: "a" });
await waitStreamReady(ffmpegLog);
const trimFilter =
	"silenceremove=start_periods=1:start_mode=all:start_threshold=-70dB:start_duration=0.2:start_silence=0.1:detection=peak,areverse,silenceremove=start_periods=1:start_mode=all:start_threshold=-70dB:start_duration=0.2:start_silence=0.2:detection=peak,areverse";
export async function trimMusic(path: string) {
	const file = basename(path);
	const newFile = file.replace(/\.opus$/, ".trimmed.opus");
	const newPath = path.replace(file, newFile);

	await new Promise<void>((resolve, reject) => {
		const child = spawn("ffmpeg", ["-i", path, "-af", trimFilter, newPath], {
			stdio: ["ignore", "ignore", ffmpegLog],
		});
		child.on("error", (err) => reject(err));
		child.on("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`ffmpeg exited with code ${code}`));
		});
	});
	await rm(path).catch(() => {});
	return newPath;
}

export function waitStreamReady(stream: WriteStream) {
	return new Promise<void>((resolve, reject) => {
		if (!stream.pending) resolve();
		stream.once("ready", () => resolve());
	});
}
