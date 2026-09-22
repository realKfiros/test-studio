import { useState } from "react";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import Check from "lucide-react-native/icons/check";
import { Icon } from "./Icon";
import styled from "styled-components/native";
import { BodyText, Caption } from "../styles/typography";
import { Dialog } from "./Dialog";

interface SelectProps {
	label: string;
	value: string;
	options: { label: string; value: string }[];
	onValueChange: (value: string) => void;
}
const Trigger = styled.Pressable`
	flex-direction: row;
	align-items: center;
	gap: 8px;
	padding: 7px 8px;
	border-radius: 4px;
	border-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
	background-color: ${({ theme }) => theme.colors.raised};
	max-width: 190px;
	flex-shrink: 1;
`;
const Value = styled(Caption)`
	color: ${({ theme }) => theme.colors.secondaryText};
	flex-shrink: 1;
`;
const Option = styled.Pressable<{ $selected: boolean }>`
	flex-direction: row;
	align-items: center;
	gap: 12px;
	padding: 14px 12px;
	border-radius: 6px;
	background-color: ${({ $selected, theme }) => ($selected ? theme.colors.selected : "transparent")};
`;
const OptionLabel = styled(BodyText)`
	flex: 1;
`;

export function Select({ label, value, options, onValueChange }: SelectProps) {
	const [open, setOpen] = useState(false);
	const selected = options.find((option) => option.value === value);
	return (
		<>
			<Trigger
				accessibilityRole="button"
				accessibilityLabel={`${label}: ${selected?.label ?? value}`}
				aria-expanded={open}
				onPress={() => setOpen(true)}
			>
				<Value numberOfLines={1}>{selected?.label ?? value}</Value>
				<Icon icon={ChevronDown} size={12} />
			</Trigger>
			<Dialog title={label} open={open} onClose={() => setOpen(false)}>
				{options.map((option) => (
					<Option
						key={option.value}
						accessibilityRole="radio"
						accessibilityLabel={option.label}
						aria-checked={option.value === value}
						$selected={option.value === value}
						onPress={() => {
							onValueChange(option.value);
							setOpen(false);
						}}
					>
						<OptionLabel>{option.label}</OptionLabel>
						{option.value === value && <Icon icon={Check} size={14} />}
					</Option>
				))}
			</Dialog>
		</>
	);
}
