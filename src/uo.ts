import type { Client } from "discord.js";
import { env } from "./env";

enum TYPE {
	UO,
	NASU,
}

export function uo(client: Client) {
	client.on("messageCreate", async (message) => {
		try {
			if (message.author.bot) return;
			if (message.guild?.id !== env.SERVER) return;
			const ch = message.channel;
			if (ch.isDMBased()) return;
			if (ch.parentId != null && env.UO_IGNORE_CATEGORIES.includes(ch.parentId)) return;
			if (env.UO_IGNORE_CHANNELS.includes(ch.id)) return;
			switch (match(message.content)) {
				case TYPE.UO:
					await message.reply({ content: "うおｗ", allowedMentions: { repliedUser: false } });
					break;
				case TYPE.NASU:
					await message.reply({ content: "🍆", allowedMentions: { repliedUser: false } });
					break;
				default:
					return;
			}
		} catch (e) {
			console.error(e);
		}
	});
}

function match(str: string): TYPE | null {
	if (str.includes("おお")) return TYPE.UO;
	if (str.includes("なす")) return TYPE.NASU;
	return null;
}
