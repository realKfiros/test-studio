import type { LucideIcon } from "lucide-react-native";
import { useTheme } from "styled-components/native";

export function Icon({
	icon: Component,
	size = 16,
	color,
}: {
	icon: LucideIcon;
	size?: number;
	color?: string;
}) {
	const theme = useTheme();
	return (
		<Component
			size={size}
			color={color ?? theme.colors.muted}
			strokeWidth={1.6}
			accessible={false}
		/>
	);
}
