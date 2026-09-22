import styled from "styled-components/native";
import Check from "lucide-react-native/icons/check";
import Minus from "lucide-react-native/icons/minus";
import { useTheme } from "styled-components/native";
import { Icon } from "./Icon";

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
	border-color: ${({ $checked, theme }) => ($checked ? theme.colors.accent : theme.colors.muted)};
	background-color: ${({ $checked, theme }) => ($checked ? theme.colors.accent : theme.colors.surface)};
	align-items: center;
	justify-content: center;
`;

export function Checkbox({
	label,
	checked,
	indeterminate = false,
	disabled = false,
	onValueChange,
}: CheckboxProps) {
	const theme = useTheme();
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
				{(checked || indeterminate) && (
					<Icon
						icon={indeterminate ? Minus : Check}
						size={12}
						color={theme.colors.onPrimary}
					/>
				)}
			</Box>
		</HitTarget>
	);
}
