import { EventEmitter } from "node:events";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
	AudioPlayerStatus,
	createAudioPlayer,
	entersState,
	getVoiceConnection,
	joinVoiceChannel,
	NoSubscriberBehavior,
	VoiceConnectionStatus,
} from "@discordjs/voice";
import { ActivityType, Client } from "discord.js";
import { genCommandEmitter } from "./commands";
import { genEmbed, MusicQueue } from "./queue";
import { uo } from "./uo";
import { config, neverAbort, waitReady } from "./util";

const client = new Client({ intents: ["Guilds", "GuildVoiceStates", "MessageContent", "GuildMessages"] });
client.on("error", (e) => {
	console.error("client error:", e);
});

await rm(join(import.meta.dirname, "../tmp"), { recursive: true, force: true });
await client.login(config.TOKEN);
await waitReady(client);

uo(client);

const guild = await client.guilds.fetch(config.SERVERID);
const channel = await (async () => {
	const c = await client.channels.fetch(config.VCID);
	if (!(c?.isVoiceBased() && c?.isSendable())) {
		throw new Error("Invalid voice channel");
	}
	return c;
})();

async function notify(status: "success" | "error", text: string) {
	await channel.send({ embeds: [{ color: status === "success" ? 0x00ff00 : 0xff0000, description: text }] });
}

const queue = new MusicQueue();
const commandEmitter = genCommandEmitter(client);
const skipEmitter = new EventEmitter<{ skip: [string, (ok: boolean) => void] }>();

client.on("voiceStateUpdate", (oldState, newState) => {
	const me = client.user?.id;
	if (me == null) return;
	if (oldState.member?.id === me && newState.channelId == null) {
		getVoiceConnection(config.SERVERID)?.destroy();
	}
});

let isPlaying = false;
async function play() {
	if (isPlaying) return;
	isPlaying = true;
	const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Stop } });
	const connection = joinVoiceChannel({
		guildId: config.SERVERID,
		channelId: config.VCID,
		adapterCreator: guild.voiceAdapterCreator,
	});
	try {
		await entersState(connection, VoiceConnectionStatus.Ready, 10 * 1000);
		connection.subscribe(player);

		while (!queue.empty()) {
			try {
				await entersState(player, AudioPlayerStatus.Idle, neverAbort);
				const next = queue.front();
				if (next == null) break;
				const resource = await next.promise;
				if (resource == null) {
					await notify("error", `Failed to download ${next.meta.title}`);
					continue;
				}
				player.play(resource.data);
				await entersState(player, AudioPlayerStatus.Playing, neverAbort);
				skipEmitter.once("skip", (id, cb) => {
					if (id !== next.requester.id) return void cb(false);
					player.stop();
					cb(true);
				});
				await channel.send({
					embeds: [genEmbed(next)],
				});
				client.user?.setPresence({ activities: [{ name: next.meta.title, type: ActivityType.Listening }] });
				await entersState(player, AudioPlayerStatus.Idle, neverAbort);
			} catch (e) {
				console.error("play error:", e);
				await notify("error", `再生中にエラーが発生しました: ${e instanceof Error ? e.message : String(e)}`);
				player.stop();
			} finally {
				skipEmitter.removeAllListeners("skip");
				queue.pop();
			}
		}
		await notify("success", "再生が終了しました");
		client.user?.setPresence({ activities: [] });
	} catch (e) {
		console.error("unknown error:", e);
		await notify("error", `fatal: ${e instanceof Error ? e.message : String(e)}`);
	} finally {
		isPlaying = false;
		player.stop();
		connection.destroy();
	}
}

commandEmitter.on("play", async (int, input) => {
	try {
		if (!URL.canParse(input.url)) {
			await int.reply({ content: "URLが無効です", flags: ["Ephemeral"] });
			return;
		}
		await int.deferReply();
		const member = await guild.members.fetch(int.user.id);
		const musicItem = await queue.push(input.url, member);
		if (musicItem == null) {
			await int.deleteReply();
			await int.followUp({
				embeds: [{ description: `対応していないサービスです: "${input.url}"` }],
				flags: ["Ephemeral"],
			});
			return;
		}
		if (!isPlaying) play();
		await int.editReply({
			embeds: [
				{
					description: `"${musicItem.item.meta.title}"をキューに追加しました: ${musicItem.position}曲後に再生`,
				},
			],
		});
	} catch (e) {
		console.error("play command error:", e);
		await int.followUp({
			content: `エラーが発生しました: ${e instanceof Error ? e.message : String(e)}`,
			flags: ["Ephemeral"],
		});
	}
});
commandEmitter.on("skip", async (int) => {
	const handled = skipEmitter.emit("skip", int.user.id, (ok) => {
		if (ok) {
			int.reply({ content: "スキップしました" });
		} else {
			int.reply({
				content: "リクエスト者のみスキップ可能",
				flags: ["Ephemeral"],
			});
		}
	});
	if (!handled) int.reply({ content: "スキップコマンドは再生中のみ使用可能", flags: ["Ephemeral"] });
});
commandEmitter.on("queue", async (int) => {
	const items = queue.fronts(10);
	if (items.length === 0) {
		int.reply({ content: "キューは空です", flags: ["Ephemeral"] });
		return;
	}
	int.reply({
		embeds: [
			{
				title: "キュー",
				description: items
					.map((item, i) => `**${i === 0 ? "今" : i}.** [${item.meta.title}](${item.url})`)
					.join("\n"),
			},
		],
		flags: ["Ephemeral"],
	});
});

process.on("SIGINT", async () => {
	console.log("destroying");
	getVoiceConnection(config.SERVERID)?.destroy();
	await client.destroy();
	process.exit(0);
});
