import { useWindowDimensions } from "react-native";
import styled from "styled-components/native";
import type { Studio } from "../useStudio";
import { selectionsFor, workspaceName } from "../model";
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

export function Toolbar({
	studio,
	onOpenSettings,
}: {
	studio: Studio;
	onOpenSettings: () => void;
}) {
	const { width } = useWindowDimensions();
	const workspaces = [...new Set(studio.catalog?.files.map((file) => file.workspace))].sort();
	return (
		<Container>
			<Row>
				{width > 600 && <Caption>WORKSPACE /</Caption>}
				<Select
					label="Workspace"
					value={studio.filters.workspace}
					options={[
						{ value: "all", label: "All workspaces" },
						...workspaces.map((workspace) => ({
							value: workspace,
							label: workspaceName(workspace),
						})),
					]}
					onValueChange={(workspace) =>
						studio.setFilters((filters) => ({ ...filters, workspace }))
					}
				/>
			</Row>
			<ToolbarActions>
				<Button compact variant="quiet" onPress={() => studio.setView("history")}>
					◷ Runs
				</Button>
				<Button compact variant="quiet" onPress={onOpenSettings}>
					⚙ Run settings
				</Button>
				<Button
					compact
					variant="quiet"
					disabled={studio.scanning}
					onPress={() => void studio.rescan()}
				>
					↻ Rescan
				</Button>
				<Button
					variant="primary"
					compact={width <= 600}
					disabled={!studio.selected.size || studio.busy}
					accessibilityHint={`${studio.selected.size} files selected; individual test filters are preserved`}
					onPress={() => void studio.start(selectionsFor(studio.selected))}
				>
					▶ Run selected {studio.selected.size}
				</Button>
			</ToolbarActions>
		</Container>
	);
}
