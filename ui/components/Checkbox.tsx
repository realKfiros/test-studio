import styled from "styled-components/native";
import { BodyText } from "../styles/typography";

interface CheckboxProps {
	label: string;
	checked: boolean;
	indeterminate?: boolean;
	disabled?: boolean;
	onValueChange: (checked: boolean) => void;
}
const HitTarget = styled.Pressable<{ $disabled: boolean }>`
	padding: 5px;
	opacity: ${({ $disabled }) => ($disabled ? 0.45 : 1)};
	flex-shrink: 0;
`;
const Box = styled.View<{ $checked: boolean }>`
	width: 15px;
	height: 15px;
	border-radius: 3px;
	border-width: 1px;
	border-color: ${({ $checked, theme }) => ($checked ? theme.colors.green : theme.colors.muted)};
	background-color: ${({ $checked, theme }) => ($checked ? theme.colors.green : theme.colors.surface)};
	align-items: center;
	justify-content: center;
`;
const Mark = styled(BodyText)`
	color: ${({ theme }) => theme.colors.surface};
	font-size: 11px;
	line-height: 13px;
`;

export function Checkbox({
	label,
	checked,
	indeterminate = false,
	disabled = false,
	onValueChange,
}: CheckboxProps) {
	return (
		<HitTarget
			accessibilityRole="checkbox"
			accessibilityLabel={label}
			aria-checked={indeterminate ? "mixed" : checked}
			aria-disabled={disabled}
			disabled={disabled}
			$disabled={disabled}
			onPress={() => onValueChange(indeterminate || !checked)}
		>
			<Box $checked={checked || indeterminate}>
				<Mark>{indeterminate ? "−" : checked ? "✓" : ""}</Mark>
			</Box>
		</HitTarget>
	);
}
