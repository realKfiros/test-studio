import { useWindowDimensions } from "react-native";
import styled from "styled-components/native";
import { observer } from "mobx-react-lite";
import studioStore from "../stores";
import { workspaceName } from "../model";
import { Actions, Row } from "../styles/layout";
import { Caption } from "../styles/typography";
import { Select } from "./Select";
import { Button } from "./Button";

const Container = styled.View`
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 12px;
	min-height: 74px;
	padding: 16px 0px;
	border-bottom-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
`;

const ToolbarActions = styled(Actions)`
	max-width: 100%;
	flex-shrink: 1;
`;

export const Toolbar = observer(function Toolbar() {
	const { width } = useWindowDimensions();
	const workspaces = studioStore.workspaces;
	return (
		<Container>
			<Row>
				{width > 600 && <Caption>WORKSPACE /</Caption>}
				<Select
					label="Workspace"
					value={studioStore.filters.workspace}
					options={[
						{ value: "all", label: "All workspaces" },
						...workspaces.map((workspace) => ({
							value: workspace,
							label: workspaceName(workspace),
						})),
					]}
					onValueChange={studioStore.setWorkspace}
				/>
			</Row>
			<ToolbarActions>
				<Button compact variant="quiet" onPress={studioStore.showHistory}>
					◷ Runs
				</Button>
				<Button compact variant="quiet" onPress={studioStore.openSettings}>
					⚙ Run settings
				</Button>
				<Button
					compact
					variant="quiet"
					disabled={studioStore.scanning}
					onPress={() => void studioStore.rescan()}
				>
					↻ Rescan
				</Button>
				<Button
					variant="primary"
					compact={width <= 600}
					disabled={!studioStore.selected.size || studioStore.busy}
					accessibilityHint={`${studioStore.selected.size} files selected; individual test filters are preserved`}
					onPress={() => void studioStore.startSelected()}
				>
					▶ Run selected {studioStore.selected.size}
				</Button>
			</ToolbarActions>
		</Container>
	);
});
