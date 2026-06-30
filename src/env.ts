import { cleanEnv, makeValidator, str } from "envalid";
import "dotenv/config";

// 数値で構成された文字列
const numStr = makeValidator<string>((input) => {
	if (!/^\d+$/.test(input)) throw new Error(`Expected number but got ${input}`);
	return input;
});

const numStrArray = makeValidator<string[]>((input) => {
	const arr = JSON.parse(input);
	if (!Array.isArray(arr)) throw new Error(`Expected array but got ${input}`);
	for (const numStr of arr) {
		if (!/^\d+$/.test(numStr)) throw new Error(`Expected number but got ${numStr} at ${input}`);
	}
	return arr;
});

export const env = cleanEnv(process.env, {
	TOKEN: str(),
	VC: numStr(),
	SERVER: numStr(),
	UO_IGNORE_CATEGORIES: numStrArray(),
	UO_IGNORE_CHANNELS: numStrArray(),
	REMINDER_CHANNEL: numStr(),
	SUEN_ROLE: numStr(),
	SUEN_TEMP_ROLE: numStr(),
});
