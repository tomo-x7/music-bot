import {
	AudioPlayerStatus,
	createAudioPlayer,
	entersState,
	getVoiceConnection,
	joinVoiceChannel,
	NoSubscriberBehavior,
	type PlayerSubscription,
	type VoiceConnection,
	VoiceConnectionStatus,
} from "@discordjs/voice";
import { type ChatInputCommandInteraction, Client } from "discord.js";
import { genCommandEmitter } from "./commands";
import { MusicQueue } from "./queue";
import { config, neverAbort, sleep, waitReady } from "./util";

const client = new Client({ intents: ["Guilds", "GuildVoiceStates"] });
await client.login(config.TOKEN);
await waitReady(client);

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

let connection: VoiceConnection | null = null;
let sub: PlayerSubscription | null = null;
const player = createAudioPlayer();
const commandEmitter = genCommandEmitter(client);

client.on("voiceStateUpdate", (oldState, newState) => {
	const me = client.user?.id;
	if (me == null) return;
	if (oldState.member?.id === me && newState.channelId == null) {
		sub?.unsubscribe();
		connection?.destroy();
		connection = null;
		sub = null;
		queue.clear();
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
			await entersState(player, AudioPlayerStatus.Idle, neverAbort);
			const next = queue.front();
			if (next == null) break;
			const resource = await next.promise;
			if (resource == null) {
				await notify("error", `Failed to download ${next.url}`);
				queue.pop();
				continue;
			}
			player.play(resource.data);
			await entersState(player, AudioPlayerStatus.Playing, neverAbort);
			const skipListener = (int: ChatInputCommandInteraction) => {
				if (int.user.id !== next.requesterId)
					return void int.reply({
						content: "リクエスト者のみスキップ可能",
						flags: ["Ephemeral"],
					});
				int.reply("スキップします");
				player.stop();
			};
			commandEmitter.on("skip", skipListener);
			const requester = await guild.members.fetch(next.requesterId);
			await channel.send({
				embeds: [
					{
						title: next.title,
						url: next.url,
						image: { url: next.thumbnail },
						author: {
							name: `requested by ${requester.displayName}`,
							icon_url: requester.displayAvatarURL(),
						},
					},
				],
			});
			await entersState(player, AudioPlayerStatus.Idle, neverAbort);
			resource.clean();
			commandEmitter.off("skip", skipListener);
			queue.pop();
		}
		await notify("success", "再生が終了しました");
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
	if (!URL.canParse(input.url)) {
		int.reply({ content: "URLが無効です", flags: ["Ephemeral"] });
		return;
	}
	const dPromise = int.deferReply();
	const music = await queue.push(input.url, int.user.id);
	await dPromise;
	if (music == null) {
		await int.deleteReply();
		await int.followUp({
			embeds: [{ description: `対応していないサービスです: "${input.url}"` }],
			flags: ["Ephemeral"],
		});
		return;
	}
	if (!isPlaying) play();
	await int.editReply({ embeds: [{ description: `"${music.title}"をキューに追加しました` }] });
});
commandEmitter.on("skip", async (int) => {
	await sleep(2000);
	if (int.replied) return;
	int.reply({ content: "スキップコマンドは再生中のみ使用可能", flags: ["Ephemeral"] });
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
				description: items.map((item, i) => `**${i + 1}.** [${item.title}](${item.url})`).join("\n"),
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
