import { rm } from "node:fs/promises";
import { type AudioResource, createAudioResource } from "@discordjs/voice";
import { assertNever, trimMusic } from "./util";
import { downloadYt, getMetaYt } from "./yt";

export type MusicQueueItem = {
	id: number;
	title: string;
	url: string;
	duration: number;
	thumbnail: string;
	requesterId: string;
	promise: Promise<Resource | null> | null;
};
type Resource = {
	data: AudioResource;
	clean: () => Promise<void>;
	path: string;
};

export class MusicQueue {
	private queue: Array<MusicQueueItem> = [];
	private lastId = 0;
	public async push(url: string, requesterId: string) {
		const id = Date.now() === this.lastId ? this.lastId + 1 : Date.now();
		this.lastId = id;
		const { title, duration, thumbnail } = (await getMeta(url)) ?? {};
		if (title == null || duration == null || thumbnail == null) return null;
		const item: MusicQueueItem = {
			id,
			title,
			url,
			duration,
			thumbnail,
			requesterId,
			promise: null,
		};
		this.queue.push(item);
		this.checkDownload();
		return item;
	}
	public front() {
		this.checkDownload();
		return this.queue[0] ?? null;
	}
	public pop() {
		this.checkDownload();
		return this.queue.shift() ?? null;
	}
	public clear() {
		this.queue.length = 0;
	}
	public empty() {
		return this.queue.length === 0;
	}
	private checkDownload() {
		for (let i = 0; i < 3; i++) {
			const item = this.queue[i];
			if (item == null) break;
			if (item.promise == null) {
				item.promise = download(item.url, item.id).catch((e) => {
					console.error(`Failed to download ${item.url}:`, e);
					item.promise = null;
					return null;
				});
			}
		}
	}
	public [Symbol.toString()]() {
		return `MusicQueue[${this.queue.join(", ")}]`;
	}
}

const services = {
	yt: ["youtube.com", "youtu.be"],
} as const;
function urlParse(url: string): keyof typeof services | null {
	const parsed = new URL(url);
	for (const [key, hosts] of Object.entries(services)) {
		if (hosts.some((h) => parsed.hostname.endsWith(h))) return key as keyof typeof services;
	}
	return null;
}

function getMeta(url: string) {
	const parsed = urlParse(url);
	if (parsed == null) return null;
	switch (parsed) {
		case "yt":
			return getMetaYt(url);
		default:
			assertNever(parsed);
	}
}
async function download(url: string, id: number): Promise<Resource | null> {
	const parsed = urlParse(url);
	if (parsed == null) return null;
	let path: string;
	switch (parsed) {
		case "yt": {
			path = await downloadYt(url, id);
			break;
		}
		default:
			assertNever(parsed);
	}
	path = await trimMusic(path);
	const data = createAudioResource(path);
	const clean = async () => {
		await rm(path).catch(() => {});
	};
	return { data, clean, path };
}
