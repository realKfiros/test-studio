import type { ReactNode } from "react";
import type { PressableProps } from "react-native";
import styled from "styled-components/native";
import { BodyText } from "../styles/typography";

type Variant = "primary" | "secondary" | "quiet";
interface ButtonProps extends PressableProps {
	children: ReactNode;
	variant?: Variant;
	compact?: boolean;
}

const Container = styled.Pressable<{ $variant: Variant; $disabled: boolean; $compact: boolean }>`
	flex-direction: row;
	align-items: center;
	justify-content: center;
	border-width: ${({ $variant }) => ($variant === "quiet" ? 0 : 1)}px;
	border-color: ${({ $variant, theme }) => ($variant === "primary" ? theme.colors.green : theme.colors.border)};
	background-color: ${({ $variant, theme }) => ($variant === "primary" ? theme.colors.green : "transparent")};
	border-radius: 6px;
	padding: ${({ $compact }) => ($compact ? "7px 8px" : "10px 14px")};
	opacity: ${({ $disabled }) => ($disabled ? 0.45 : 1)};
	flex-shrink: 0;
`;
const Label = styled(BodyText)<{ $variant: Variant; $compact: boolean }>`
	color: ${({ $variant, theme }) => ($variant === "primary" ? theme.colors.surface : theme.colors.secondaryText)};
	font-size: ${({ $compact }) => ($compact ? 10 : 12)}px;
	font-weight: ${({ $variant }) => ($variant === "primary" ? 600 : 400)};
`;

export function Button({
	children,
	variant = "secondary",
	compact = false,
	disabled = false,
	...props
}: ButtonProps) {
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
			<Label $variant={variant} $compact={compact}>
				{children}
			</Label>
		</Container>
	);
}
