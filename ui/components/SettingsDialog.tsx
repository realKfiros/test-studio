import styled from "styled-components/native";
import { observer } from "mobx-react-lite";
import studioStore from "../stores";
import { BodyText, Note } from "../styles/typography";
import { Dialog } from "./Dialog";
import { Button } from "./Button";

const Field = styled.View`
	gap: 8px;
	margin: 10px 0px 18px;
`;
const Input = styled.TextInput.attrs(({ theme }) => ({
	placeholderTextColor: theme.colors.muted,
	selectionColor: theme.colors.accent,
}))`
	border-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
	border-radius: 4px;
	padding: 10px;
	background-color: ${({ theme }) => theme.colors.background};
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

export const SettingsDialog = observer(function SettingsDialog() {
	return (
		<Dialog
			title="Run settings"
			open={studioStore.settingsOpen}
			onClose={studioStore.closeSettings}
		>
			<Note>Maestro uses a running simulator or connected device with your app ready.</Note>
			<Field>
				<BodyText>Device ID (optional)</BodyText>
				<Input
					accessibilityLabel="Device ID (optional)"
					placeholder="Automatic device selection"
					value={studioStore.device}
					onChangeText={studioStore.setDevice}
					autoCorrect={false}
					autoCapitalize="none"
				/>
			</Field>
			<Field>
				<BodyText>Flow variables (one NAME=value per line)</BodyText>
				<VariablesInput
					accessibilityLabel="Flow variables (one NAME=value per line)"
					placeholder="APP_ID=com.example.app"
					value={studioStore.variables}
					onChangeText={studioStore.setVariables}
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
				<Button variant="primary" onPress={studioStore.closeSettings}>
					Done
				</Button>
			</DoneRow>
		</Dialog>
	);
});
