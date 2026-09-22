import type { ReactNode } from "react";
import type { PressableProps } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import styled, { useTheme } from "styled-components/native";
import { BodyText } from "../styles/typography";
import { Icon } from "./Icon";

type Variant = "primary" | "secondary" | "quiet";
interface ButtonProps extends PressableProps {
	children?: ReactNode;
	icon?: LucideIcon;
	variant?: Variant;
	compact?: boolean;
}
const Container = styled.Pressable<{ $variant: Variant; $disabled: boolean; $compact: boolean }>`
	flex-direction: row;
	align-items: center;
	justify-content: center;
	gap: 7px;
	border-width: ${({ $variant }) => ($variant === "quiet" ? 0 : 1)}px;
	border-color: ${({ $variant, theme }) => ($variant === "primary" ? theme.colors.primary : theme.colors.border)};
	background-color: ${({ $variant, theme }) => ($variant === "primary" ? theme.colors.primary : $variant === "secondary" ? theme.colors.raised : "transparent")};
	border-radius: 4px;
	min-height: ${({ $compact }) => ($compact ? 28 : 32)}px;
	padding: ${({ $compact }) => ($compact ? "5px 8px" : "6px 11px")};
	opacity: ${({ $disabled }) => ($disabled ? 0.4 : 1)};
	flex-shrink: 0;
`;
const Label = styled(BodyText)<{ $variant: Variant }>`
	color: ${({ $variant, theme }) => ($variant === "primary" ? theme.colors.onPrimary : theme.colors.secondaryText)};
	font-size: 12px;
	font-weight: 500;
`;

export function Button({
	children,
	icon,
	variant = "secondary",
	compact = false,
	disabled = false,
	...props
}: ButtonProps) {
	const theme = useTheme();
	return (
		<Container
			{...props}
			accessibilityRole={props.accessibilityRole ?? "button"}
			aria-disabled={!!disabled}
			disabled={!!disabled}
			$disabled={!!disabled}
			$variant={variant}
			$compact={compact}
		>
			{icon && (
				<Icon
					icon={icon}
					size={14}
					color={
						variant === "primary" ? theme.colors.onPrimary : theme.colors.secondaryText
					}
				/>
			)}
			{children != null && <Label $variant={variant}>{children}</Label>}
		</Container>
	);
}
