import { useWindowDimensions } from "react-native";
import History from "lucide-react-native/icons/rotate-ccw-clock";
import Settings2 from "lucide-react-native/icons/settings-2";
import RotateCw from "lucide-react-native/icons/rotate-cw";
import Play from "lucide-react-native/icons/play";
import styled from "styled-components/native";
import { observer } from "mobx-react-lite";
import studioStore from "../stores";
import { workspaceName } from "../model";
import { Actions } from "../styles/layout";
import { Select } from "./Select";
import { Button } from "./Button";

const Container = styled.View`
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
	min-height: 53px;
	padding: 10px 16px;
	border-bottom-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
	background-color: ${({ theme }) => theme.colors.sidebar};
`;
const ToolbarActions = styled(Actions)`
	max-width: 100%;
	flex-shrink: 1;
	gap: 4px;
`;
const Divider = styled.View`
	width: 1px;
	height: 18px;
	margin: 0px 6px;
	background-color: ${({ theme }) => theme.colors.border};
`;

export const Toolbar = observer(function Toolbar() {
	const { width } = useWindowDimensions();
	return (
		<Container>
			<Select
				label="Workspace"
				value={studioStore.filters.workspace}
				options={[
					{ value: "all", label: "All workspaces" },
					...studioStore.workspaces.map((workspace) => ({
						value: workspace,
						label: workspaceName(workspace),
					})),
				]}
				onValueChange={studioStore.setWorkspace}
			/>
			<ToolbarActions>
				<Button
					icon={History}
					compact
					variant="quiet"
					accessibilityLabel="Run history"
					onPress={studioStore.showHistory}
				>
					{width > 1000 ? "History" : null}
				</Button>
				<Button
					icon={Settings2}
					compact
					variant="quiet"
					accessibilityLabel="Run settings"
					onPress={studioStore.openSettings}
				/>
				<Button
					icon={RotateCw}
					compact
					variant="quiet"
					accessibilityLabel="Rescan project"
					disabled={studioStore.scanning}
					onPress={() => void studioStore.rescan()}
				>
					{width > 800 ? "Rescan" : null}
				</Button>
				<Divider />
				<Button
					icon={Play}
					variant="primary"
					compact
					disabled={!studioStore.selected.size || studioStore.busy}
					accessibilityLabel={`Run selected ${studioStore.selected.size}`}
					accessibilityHint={`${studioStore.selected.size} files selected; individual test filters are preserved`}
					onPress={() => void studioStore.startSelected()}
				>
					{width <= 600 ? "Run" : "Run selected"}{" "}
					{studioStore.selected.size > 0 ? `(${studioStore.selected.size})` : ""}
				</Button>
			</ToolbarActions>
		</Container>
	);
});
