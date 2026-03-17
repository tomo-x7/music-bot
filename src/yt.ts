import { execSync, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { APIEmbed, GuildMember } from "discord.js";
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
const out = (id: string) => join(import.meta.dirname, "../tmp", `${id}.${EXT}`);

await mkdir(join(import.meta.dirname, "../log"), { recursive: true });
const ytDlLog = createWriteStream(join(import.meta.dirname, "../log/yt-dlp-dl.log"), { flags: "a" });
const ytMetaLog = createWriteStream(join(import.meta.dirname, "../log/yt-dlp-meta.log"), { flags: "a" });

export function downloadYt(url: string, id: string) {
	return new Promise<string>((resolve, reject) => {
		const child = spawn(
			"yt-dlp",
			[
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
			],
			{ stdio: ["ignore", "ignore", ytDlLog] },
		);
		child.on("error", (err) => reject(err));
		child.on("exit", (code) => {
			if (code === 0) resolve(out(id));
			else reject(new Error(`yt-dlp exited with code ${code}`));
		});
	});
}
const print = (key: string) => ["--print", `%(${key})s`];
export type YtMeta = {
	title: string;
	duration: number;
	thumbnail: string;
	url: string;
	channel: string;
	channel_url: string;
};
export function getMetaYt(url: string) {
	return new Promise<YtMeta>((resolve, reject) => {
		let str = "";
		const child = spawn(
			"yt-dlp",
			[
				...print("title"),
				...print("duration"),
				...print("thumbnail"),
				...print("channel"),
				...print("channel_url"),
				"--no-download",
				"--no-playlist",
				url,
			],
			{ stdio: ["ignore", "pipe", ytMetaLog] },
		);
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
					channel: mustBeString(results[3], "yt-dlp channel"),
					channel_url: mustBeString(results[4], "yt-dlp channel_url"),
					url,
				});
			} else {
				reject(new Error(`yt-dlp exited with code ${code}`));
			}
		});
	});
}

export function genEmbedYt(meta: YtMeta, requester: GuildMember): APIEmbed {
	return {
		title: meta.title,
		url: meta.url,
		description: `requested by ${requester}`,
		author: {
			name: meta.channel,
			url: meta.channel_url,
		},
		image: { url: meta.thumbnail },
	};
}
