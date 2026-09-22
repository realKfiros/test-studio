import { Platform } from "react-native";
import "styled-components/native";

export const theme = {
	colors: {
		background: "#111214",
		surface: "#151619",
		sidebar: "#191a1e",
		raised: "#212328",
		text: "#e6e7eb",
		secondaryText: "#b3b7c0",
		muted: "#8d939f",
		border: "#2c2f36",
		accent: "#9eb6d8",
		selected: "#252d39",
		primary: "#dcdfe5",
		onPrimary: "#17191e",
		danger: "#ed9393",
		dangerSurface: "#302225",
		success: "#97c3a2",
		successSurface: "#202d25",
		warning: "#d9bd85",
		warningSurface: "#302b20",
		terminal: "#101113",
	},
	fonts: {
		body: Platform.select({ ios: "System", android: "sans-serif", default: "system-ui" }),
		mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
	},
};

type AppTheme = typeof theme;
declare module "styled-components/native/dist/models/ThemeProvider" {
	export interface DefaultTheme {
		colors: AppTheme["colors"];
		fonts: AppTheme["fonts"];
	}
}
