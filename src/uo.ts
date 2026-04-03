import type { Client } from "discord.js";
import { config } from "./util";

const EXCLUDE_CATEGORIES = ["1479537501701148855"];
const EXCLUDE_CHANNELS = [
	"1479537502141288560", //挨拶
	"1479736063059820667", //要望質問
	"1486237162281238618", //自己紹介
	"1480682104512839940", //有益情報
	"1480682318979928165", //質問
	"1480033203812176043", //アンケート
	"1479814191593427024", //有益1
	"1479813518483001435", //有益2
	"1479813948311212325", //有益3
];

export function uo(client: Client) {
	client.on("messageCreate", async (message) => {
		try {
			if (message.author.bot) return;
			if (message.guild?.id !== config.SERVERID) return;
			const ch = message.channel;
			if (ch.isDMBased()) return;
			if (ch.parentId != null && EXCLUDE_CATEGORIES.includes(ch.parentId)) return;
			if (EXCLUDE_CHANNELS.includes(ch.id)) return;

			if (match(message.content)) {
				await message.reply({ content: "うおｗ", allowedMentions: { repliedUser: false } });
			}
		} catch (e) {
			console.error(e);
		}
	});
}

function match(str: string) {
	if (str.includes("おお")) return true;
}
