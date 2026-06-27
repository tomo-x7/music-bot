import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client, GatewayIntentBits } from "discord.js";
import { config } from "./util";

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});
await client.login(config.TOKEN);
await new Promise<void>((resolve) => (client.isReady() ? resolve() : client.once("clientReady", () => resolve())));

await client.user?.setAvatar(readFileSync(resolve(import.meta.dirname, "icon.png")));

client.destroy();
