import { EventEmitter } from "node:events";
import {
	type APIApplicationCommandOption,
	type ApplicationCommandDataResolvable,
	ApplicationCommandOptionType,
	ApplicationCommandType,
	type ChatInputCommandInteraction,
	Client,
	type CommandInteractionOptionResolver,
} from "discord.js";
import { config, waitReady } from "./util";

const commands = [
	{
		name: "play",
		type: ApplicationCommandType.ChatInput,
		description: "曲を再生する",
		options: [{ name: "url", description: "曲のURL", type: ApplicationCommandOptionType.String, required: true }],
	},
	{
		name: "skip",
		type: ApplicationCommandType.ChatInput,
		description: "曲をスキップする",
		options: [],
	},
	{
		name: "queue",
		type: ApplicationCommandType.ChatInput,
		description: "キューを表示する",
		options: [],
	},
] as const satisfies Array<ApplicationCommandDataResolvable>;

export async function register() {
	const client = new Client({ intents: ["Guilds"] });
	await client.login(config.TOKEN);
	await waitReady(client);
	if (client.application == null) throw new Error("Application is not ready");
	await client.application?.commands.set(commands, config.SERVERID);

	await client.destroy();
}

export function genCommandEmitter(client: Client) {
	type R = CommandInteractionOptionResolver;
	const getMethod = {
		[ApplicationCommandOptionType.Subcommand]: "getSubcommand",
		[ApplicationCommandOptionType.SubcommandGroup]: "getSubcommandGroup",
		[ApplicationCommandOptionType.String]: "getString",
		[ApplicationCommandOptionType.Integer]: "getInteger",
		[ApplicationCommandOptionType.Boolean]: "getBoolean",
		[ApplicationCommandOptionType.User]: "getUser",
		[ApplicationCommandOptionType.Channel]: "getChannel",
		[ApplicationCommandOptionType.Role]: "getRole",
		[ApplicationCommandOptionType.Mentionable]: "getMentionable",
		[ApplicationCommandOptionType.Number]: "getNumber",
		[ApplicationCommandOptionType.Attachment]: "getAttachment",
	} as const;
	type InputValues = {
		[ApplicationCommandOptionType.Subcommand]: never;
		[ApplicationCommandOptionType.SubcommandGroup]: never;
		[ApplicationCommandOptionType.String]: string;
		[ApplicationCommandOptionType.Integer]: number;
		[ApplicationCommandOptionType.Boolean]: boolean;
		[ApplicationCommandOptionType.User]: never;
		[ApplicationCommandOptionType.Channel]: never;
		[ApplicationCommandOptionType.Role]: never;
		[ApplicationCommandOptionType.Mentionable]: never;
		[ApplicationCommandOptionType.Number]: number;
		[ApplicationCommandOptionType.Attachment]: never;
	};
	type OptionsInput<Options extends APIApplicationCommandOption[]> = {
		[K in Options[number] as K["name"]]: K["required"] extends true
			? InputValues[K["type"]]
			: InputValues[K["type"]] | null;
	};
	type Events = {
		[Com in (typeof commands)[number] as Com["name"]]: [ChatInputCommandInteraction, OptionsInput<Com["options"]>];
	};
	const emitter = new EventEmitter<Events>();
	client.on("interactionCreate", (interaction) => {
		if (!interaction.isChatInputCommand()) return;
		if (interaction.channelId !== config.VCID) {
			interaction.reply({ content: "使用不可", flags: ["Ephemeral"] });
			return;
		}
		const command = commands.find((c) => c.name === interaction.commandName);
		if (command == null) return;
		const input = Object.fromEntries(
			command.options.map((option) => {
				const value = interaction.options[getMethod[option.type]](option.name);
				if (value == null && option.required === true) throw new Error(`Option ${option.name} missing`);
				return [option.name, value] as const;
			}),
		);
		emitter.emit(command.name, interaction, input as any);
	});
	return emitter;
}
