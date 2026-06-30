import { EventEmitter } from "node:events";
import {
	type ButtonInteraction,
	ButtonStyle,
	type Client,
	ComponentType,
	type Interaction,
	type MessageCreateOptions,
} from "discord.js";
import { schedule, type TaskOptions } from "node-cron";
import type { CommandEmitter } from "./commands";
import { env } from "./env";
import { getSettings, setSettings } from "./settings";

const cleans = new Map<string, () => void | Promise<void>>();
const GlobalScheduleOption = { timezone: "Asia/Tokyo" } as const satisfies TaskOptions;

export async function reminder(client: Client, commandEmitter: CommandEmitter) {
	try {
		for (const clean of cleans.values()) {
			await clean();
		}
		cleans.clear();

		const buttonEventEmitter = new EventEmitter<Record<string, [ButtonInteraction]>>();
		const server = await client.guilds.fetch(env.SERVER);
		const reminderChannel = await client.channels.fetch(env.REMINDER_CHANNEL);
		if (reminderChannel == null || !reminderChannel.isSendable())
			throw new Error("Reminder channel not found or not text channel");

		const interactionHandler = async (interaction: Interaction) => {
			if (!interaction.isButton()) return;
			if (!interaction.inGuild()) return;
			if (interaction.customId.startsWith("reminder:")) {
				buttonEventEmitter.emit(interaction.customId.split(":")[1], interaction);
			}
		};
		client.on("interactionCreate", interactionHandler);
		cleans.set("main:interactionCreate", () => {
			client.off("interactionCreate", interactionHandler);
		});

		const suenRole = await server.roles.fetch(env.SUEN_ROLE);
		if (suenRole == null) throw new Error("Role SUEN not found");
		const suenTmpRole = await server.roles.fetch(env.SUEN_TEMP_ROLE);
		if (suenTmpRole == null) throw new Error("Role SUEN_TEMP not found");

		const registerSuen = async () => {
			await cleans.get("suen")?.();
			cleans.delete("suen");
			const curcleans: (() => void | Promise<void>)[] = [];
			const initTask = schedule(
				"0 9 * * 3",
				async () => {
					const members = await server.members.fetch();
					const suenMembers = members.filter((m) => m.roles.cache.has(suenRole.id));
					await Promise.all(
						suenMembers.map(async (m) => {
							await m.roles.add(suenTmpRole);
						}),
					).catch((e) => console.error("Error adding suenTmpRole:", e));
				},
				GlobalScheduleOption,
			);
			curcleans.push(() => initTask.destroy());
			const remindMessage = {
				content: `${suenTmpRole} 数演の課題をやりましょう！`,
				components: [
					{
						type: ComponentType.ActionRow,
						components: [
							{
								type: ComponentType.Button,
								customId: "reminder:suen:done",
								label: "done",
								style: ButtonStyle.Success,
								emoji: { name: "✅️" },
							},
						],
					},
				],
			} as const satisfies MessageCreateOptions;
			let lastSend: string | undefined;
			curcleans.push(async () => {
				if (lastSend != null)
					await reminderChannel.messages
						.delete(lastSend)
						.catch((e) => console.error("Error deleting last reminder message:", e));
			});
			const remind = async () => {
				if (lastSend != null)
					await reminderChannel.messages
						.delete(lastSend)
						.catch((e) => console.error("Error deleting last reminder message:", e));
				const sended = await reminderChannel
					.send(remindMessage)
					.catch((e) => console.error("Error sending reminder:", e));
				lastSend = sended?.id;
			};
			const reminders = [
				schedule("0 18-20 * * 3", remind, GlobalScheduleOption),
				schedule("0 18-23 * * 4", remind, GlobalScheduleOption),
				schedule("10-50/10 23 * * 4", remind, GlobalScheduleOption),
			];
			curcleans.push(() => Promise.all(reminders.map((task) => task.destroy())).then(() => void 0));
			const suenButtonHandler = async (interaction: ButtonInteraction) => {
				try {
					if (interaction.customId === "reminder:suen:done") {
						if (interaction.member == null) {
							await interaction.reply({
								content: "Error: member not found",
								flags: ["Ephemeral"],
							});
							return;
						}
						const member = await server.members.fetch(interaction.user.id);
						if (member.roles.cache.has(suenTmpRole.id)) {
							await member.roles.remove(suenTmpRole);
							await interaction.reply({
								content: "課題完了おめでとうございます！",
								flags: ["Ephemeral"],
							});
						} else {
							await interaction.reply({ content: "すでに完了しています！", flags: ["Ephemeral"] });
						}
					}
				} catch (e) {
					console.error("Error handling suen button interaction:", e);
					await interaction.reply({ content: "Error occurred", flags: ["Ephemeral"] });
				}
			};
			buttonEventEmitter.on("suen", suenButtonHandler);
			curcleans.push(() => {
				buttonEventEmitter.off("suen", suenButtonHandler);
			});

			cleans.set("suen", async () => {
				await Promise.allSettled(curcleans.map((clean) => clean())).catch((e) =>
					console.error("Error cleaning up suen resources:", e),
				);
				const members = await server.members.fetch();
				const tmpMembers = members.filter((m) => m.roles.cache.has(suenTmpRole.id));
				await Promise.all(
					tmpMembers.map(async (m) =>
						m.roles
							.remove(suenTmpRole)
							.catch((e) => console.error(`Error removing role from ${m.user.username}:`, e)),
					),
				);
			});
		};

		commandEmitter.on("setsuen", async (interaction, { active }) => {
			try {
				if (active) {
					await interaction.deferReply();
					setSettings("activeSuen", true);
					await registerSuen();
					await interaction.editReply({ content: "数演リマインダーを有効にしました" });
				} else {
					await interaction.deferReply();
					setSettings("activeSuen", false);
					await cleans.get("suen")?.();
					cleans.delete("suen");
					await interaction.editReply({ content: "数演リマインダーを無効にしました" });
				}
			} catch (e) {
				console.error("error occurred in setsuen command:", e);
			}
		});
		if (getSettings("activeSuen")) {
			await registerSuen();
		}
	} catch (e) {
		console.error("error occurred in reminder function:", e);
	}
}
