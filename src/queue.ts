import { rm } from "node:fs/promises";
import { type AudioResource, createAudioResource } from "@discordjs/voice";
import type { GuildMember } from "discord.js";
import { v7 } from "uuid";
import { assertNever, trimMusic } from "./util";
import { downloadYt, genEmbedYt, getMetaYt, type YtMeta } from "./yt";

export type MusicQueueItem = MusicQueueItemBase & Meta;
interface MusicQueueItemBase {
	id: string;
	promise: Promise<Resource | null> | null;
	requester: GuildMember;
	url: string;
}
type Meta = { type: "yt"; meta: YtMeta };

type Resource = {
	data: AudioResource;
	clean: () => Promise<void>;
	path: string;
};

export class MusicQueue {
	private queue: Array<MusicQueueItem> = [];
	public async push(url: string, requester: GuildMember) {
		const id = v7();
		const type = urlParse(url);
		if (type == null) throw new Error(`Unsupported URL: ${url}`);
		const meta = await getMeta(type, url);
		if (meta == null) return null;
		const item: MusicQueueItem = {
			id,
			url,
			requester,
			promise: null,
			...meta,
		};
		this.queue.push(item);
		this.checkDownload();
		return { item, position: this.queue.length - 1 };
	}
	public front() {
		this.checkDownload();
		return this.queue[0] ?? null;
	}
	public fronts(n: number) {
		this.checkDownload();
		return this.queue.slice(0, n);
	}
	public pop() {
		this.checkDownload();
		const item = this.queue.shift() ?? null;
		item?.promise?.then((res) => res?.clean());
		return item;
	}
	public clear() {
		for (const item of this.queue) {
			item.promise?.then((res) => res?.clean());
		}
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
				item.promise = download(item.type, item.url, item.id).catch((e) => {
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
	public size() {
		return this.queue.length;
	}
}

const services = {
	yt: ["www.youtube.com", "youtu.be", "music.youtube.com", "www.nicovideo.jp"],
} as const;
function urlParse(url: string): keyof typeof services | null {
	const parsed = new URL(url);
	for (const [k, hosts] of Object.entries(services)) {
		if (hosts.some((h) => parsed.hostname === h)) return k as keyof typeof services;
	}
	return null;
}

async function getMeta(type: keyof typeof services, url: string): Promise<Meta | null> {
	switch (type) {
		case "yt":
			return { type: "yt", meta: await getMetaYt(url) };
		default:
			assertNever(type);
	}
}
async function download(type: keyof typeof services, url: string, id: string): Promise<Resource | null> {
	let path: string;
	switch (type) {
		case "yt": {
			path = await downloadYt(url, id);
			break;
		}
		default:
			assertNever(type);
	}
	path = await trimMusic(path);
	const data = createAudioResource(path);
	const clean = async () => {
		await rm(path).catch(() => {});
	};
	return { data, clean, path };
}

export function genEmbed(item: MusicQueueItem) {
	switch (item.type) {
		case "yt":
			return genEmbedYt(item.meta, item.requester);
		default:
			assertNever(item.type);
	}
}
