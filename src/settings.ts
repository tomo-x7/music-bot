import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Settings {
	activeSuen?: boolean;
}

const settingsPath = join(import.meta.dirname, "../settings.json");
if (!existsSync(settingsPath)) {
	writeFileSync(settingsPath, JSON.stringify({}, null, 2), "utf-8");
}
const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Settings;

export function getSettings(key: keyof Settings) {
	return settings[key];
}
export function setSettings<K extends keyof Settings>(key: K, value: Settings[K]) {
	settings[key] = value;
	writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}
