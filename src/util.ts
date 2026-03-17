// config
import "dotenv/config";

const TOKEN = mustBeString(process.env.TOKEN, "env.TOKEN");
const VCID = mustBeString(process.env.VC, "env.VCID");
const SERVERID = mustBeString(process.env.SERVER, "env.SERVER");

export const config = { TOKEN, SERVERID, VCID } as const;

import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { basename } from "node:path";
// utils
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

export async function trimMusic(path: string) {
	const file = basename(path);
	const newFile = file.replace(/\.opus$/, ".trimmed.opus");
	const newPath = path.replace(file, newFile);

	await new Promise<void>((resolve, reject) => {
		const child = spawn("ffmpeg", [
			"-i",
			path,
			"-af",
			"silenceremove=start_periods=1:start_duration=1:start_threshold=-60dB:detection=peak,aformat=dblp,areverse,silenceremove=start_periods=1:start_duration=1:start_threshold=-60dB:detection=peak,aformat=dblp,areverse",
			newPath,
		]);
		child.on("error", (err) => reject(err));
		child.on("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`ffmpeg exited with code ${code}`));
		});
	});
	await rm(path).catch(() => {});
	return newPath;
}
