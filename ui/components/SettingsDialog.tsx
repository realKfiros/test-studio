import styled from "styled-components/native";
import type { Studio } from "../useStudio";
import { BodyText, Note } from "../styles/typography";
import { Dialog } from "./Dialog";
import { Button } from "./Button";

const Field = styled.View`
	gap: 8px;
	margin: 10px 0px 18px;
`;
const Input = styled.TextInput`
	border-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
	border-radius: 6px;
	padding: 10px;
	background-color: #fcfdfb;
	color: ${({ theme }) => theme.colors.secondaryText};
	font-family: ${({ theme }) => theme.fonts.body};
	font-size: 12px;
`;
const VariablesInput = styled(Input)`
	min-height: 120px;
	font-family: ${({ theme }) => theme.fonts.mono};
`;
const DoneRow = styled.View`
	align-items: flex-start;
`;

export function SettingsDialog({
	studio,
	open,
	onClose,
}: {
	studio: Studio;
	open: boolean;
	onClose: () => void;
}) {
	return (
		<Dialog title="Run settings" open={open} onClose={onClose}>
			<Note>Maestro uses a running simulator or connected device with your app ready.</Note>
			<Field>
				<BodyText>Device ID (optional)</BodyText>
				<Input
					accessibilityLabel="Device ID (optional)"
					placeholder="Automatic device selection"
					value={studio.device}
					onChangeText={studio.setDevice}
					autoCorrect={false}
					autoCapitalize="none"
				/>
			</Field>
			<Field>
				<BodyText>Flow variables (one NAME=value per line)</BodyText>
				<VariablesInput
					accessibilityLabel="Flow variables (one NAME=value per line)"
					placeholder="APP_ID=com.example.app"
					value={studio.variables}
					onChangeText={studio.setVariables}
					multiline
					textAlignVertical="top"
					autoCorrect={false}
					autoCapitalize="none"
				/>
			</Field>
			<Note>
				Variables are passed to Maestro only. Values stay in this page for this session.
				Existing shell environment and test configuration are inherited.
			</Note>
			<DoneRow>
				<Button variant="primary" onPress={onClose}>
					Done
				</Button>
			</DoneRow>
		</Dialog>
	);
}
