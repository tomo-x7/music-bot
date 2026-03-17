import { execSync, spawn } from "node:child_process";
import { join } from "node:path";
import { mustBeNumber, mustBeString } from "./util";

try {
	execSync("yt-dlp --version");
} catch {
	throw new Error("yt-dlp required");
}
try {
	execSync("ffmpeg -version");
} catch {
	throw new Error("ffmpeg required");
}
const EXT = "opus";
const retry = (n: number) => ["--retries", n.toString(), "--fragment-retries", n.toString()];
const UA = ["--user-agent", "Mozilla/5.0 (X11; Linux x86_64; rv:148.0) Gecko/20100101 Firefox/148.0"];
const out = (id: number) => join(import.meta.dirname, "../tmp", `${id}.${EXT}`);

export function downloadYt(url: string, id: number, timeout?: number) {
	return new Promise<string>((resolve, reject) => {
		const child = spawn("yt-dlp", [
			"-x",
			"--audio-format",
			EXT,
			"--limit-rate",
			"1M",
			"--no-playlist",
			...retry(5),
			...UA,
			"--output",
			out(id),
			url,
		]);
		child.on("error", (err) => reject(err));
		child.on("exit", (code) => {
			if (code === 0) resolve(out(id));
			else reject(new Error(`yt-dlp exited with code ${code}`));
		});
	});
}
const print = (key: string) => ["--print", `%(${key})s`];
export function getMetaYt(url: string) {
	return new Promise<{ title: string; duration: number; thumbnail: string }>((resolve, reject) => {
		let str = "";
		const child = spawn("yt-dlp", [
			...print("title"),
			...print("duration"),
			...print("thumbnail"),
			"--no-download",
			"--no-playlist",
			url,
		]);
		child.stdout.on("data", (data) => {
			str += data.toString();
		});
		child.on("error", (err) => reject(err));
		child.on("exit", (code, signal) => {
			if (code === 0) {
				const results = str
					.split("\n")
					.map((s) => s.trim())
					.filter((s) => s.length > 0);
				resolve({
					title: mustBeString(results[0], "yt-dlp title"),
					duration: mustBeNumber(results[1], "yt-dlp duration"),
					thumbnail: mustBeString(results[2], "yt-dlp thumbnail"),
				});
			} else {
				reject(new Error(`yt-dlp exited with code ${code}`));
			}
		});
	});
}
