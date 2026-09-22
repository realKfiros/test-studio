import styled from "styled-components/native";
import { useWindowDimensions } from "react-native";
import Files from "lucide-react-native/icons/files";
import Folder from "lucide-react-native/icons/folder";
import FolderOpen from "lucide-react-native/icons/folder-open";
import Terminal from "lucide-react-native/icons/terminal";
import Smartphone from "lucide-react-native/icons/smartphone";
import FlaskConical from "lucide-react-native/icons/flask-conical";
import { observer } from "mobx-react-lite";
import studioStore from "../stores";
import { runName, workspaceName } from "../model";
import { BodyText, Caption } from "../styles/typography";
import { Icon } from "./Icon";

const Container = styled.View<{ $compact: boolean }>`
	width: ${({ $compact }) => ($compact ? 48 : 204)}px;
	background-color: ${({ theme }) => theme.colors.sidebar};
	border-right-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
	flex-shrink: 0;
`;
const Project = styled.View<{ $compact: boolean }>`
	min-height: 53px;
	flex-direction: row;
	align-items: center;
	gap: 10px;
	padding: 12px ${({ $compact }) => ($compact ? 15 : 16)}px;
	border-bottom-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
`;
const ProjectName = styled(BodyText)`
	font-weight: 600;
	flex: 1;
`;
const Navigation = styled.ScrollView.attrs({
	contentContainerStyle: { paddingVertical: 18, paddingHorizontal: 8 },
})`
	flex: 1;
`;
const Label = styled(Caption)<{ $spaced?: boolean }>`
	font-size: 11px;
	font-weight: 500;
	margin: ${({ $spaced }) => ($spaced ? 26 : 0)}px 8px 8px;
`;
const NavButton = styled.Pressable<{ $active: boolean; $compact: boolean }>`
	flex-direction: row;
	align-items: center;
	justify-content: ${({ $compact }) => ($compact ? "center" : "flex-start")};
	gap: 9px;
	min-height: 32px;
	padding: 7px 8px;
	border-radius: 3px;
	margin-bottom: 2px;
	background-color: ${({ $active, theme }) => ($active ? theme.colors.raised : "transparent")};
`;
const NavText = styled(BodyText)<{ $active?: boolean }>`
	color: ${({ $active, theme }) => ($active ? theme.colors.text : theme.colors.secondaryText)};
	font-size: 12px;
	flex: 1;
`;
const Count = styled(Caption)`
	font-family: ${({ theme }) => theme.fonts.mono};
	font-size: 10px;
`;
const Dot = styled.View<{ $status: string }>`
	width: 5px;
	height: 5px;
	border-radius: 3px;
	background-color: ${({ $status, theme }) => ($status === "failed" || $status === "offline" ? theme.colors.danger : $status === "running" ? theme.colors.warning : $status === "passed" ? theme.colors.success : theme.colors.muted)};
`;
const Empty = styled(Caption)`
	padding: 4px 8px;
`;
const Connection = styled.View`
	flex-direction: row;
	align-items: center;
	gap: 8px;
	padding: 11px 16px;
	border-top-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
`;

export const Sidebar = observer(function Sidebar() {
	const { width } = useWindowDimensions();
	const compact = width <= 800;
	const catalog = studioStore.catalog;
	const runners = [
		...new Set([
			...(catalog?.runners.map((runner) => runner.id) ?? []),
			...(catalog?.files.map((file) => file.runner) ?? []),
		]),
	];
	return (
		<Container $compact={compact}>
			<Project $compact={compact}>
				<Icon icon={FolderOpen} size={17} />
				{!compact && (
					<ProjectName numberOfLines={1} accessibilityHint={catalog?.root}>
						{catalog?.name ?? "Opening project…"}
					</ProjectName>
				)}
			</Project>
			<Navigation accessibilityLabel="Test navigation">
				{!compact && <Label>Runners</Label>}
				{["all", ...runners].map((id) => {
					const label =
						id === "all"
							? "All tests"
							: (catalog?.runners.find((runner) => runner.id === id)?.label ?? id);
					const active = studioStore.filters.runner === id;
					const icon =
						id === "all"
							? Files
							: id === "bun"
								? Terminal
								: id === "maestro"
									? Smartphone
									: FlaskConical;
					return (
						<NavButton
							key={id}
							accessibilityRole="button"
							accessibilityLabel={label}
							aria-selected={active}
							$active={active}
							$compact={compact}
							onPress={() => studioStore.setRunner(id)}
						>
							<Icon icon={icon} size={15} />
							{!compact && (
								<>
									<NavText $active={active} numberOfLines={1}>
										{label}
									</NavText>
									<Count>
										{catalog?.files.filter(
											(file) => id === "all" || file.runner === id,
										).length ?? 0}
									</Count>
								</>
							)}
						</NavButton>
					);
				})}
				{!compact && (
					<>
						<Label $spaced>Workspaces</Label>
						{studioStore.workspaces.map((workspace) => (
							<NavButton
								key={workspace}
								accessibilityRole="button"
								accessibilityLabel={workspaceName(workspace)}
								aria-selected={studioStore.filters.workspace === workspace}
								$active={studioStore.filters.workspace === workspace}
								$compact={false}
								onPress={() => studioStore.toggleWorkspace(workspace)}
							>
								<Icon icon={Folder} size={14} />
								<NavText numberOfLines={1}>{workspaceName(workspace)}</NavText>
								<Count>
									{
										catalog?.files.filter(
											(file) => file.workspace === workspace,
										).length
									}
								</Count>
							</NavButton>
						))}
						<Label $spaced>Recent runs</Label>
						{studioStore.runs.length ? (
							studioStore.runs.map((run) => (
								<NavButton
									key={run.id}
									accessibilityRole="button"
									accessibilityLabel={`${runName(run)}, ${run.status}`}
									$active={
										studioStore.view === "run" && studioStore.runId === run.id
									}
									$compact={false}
									onPress={() => studioStore.openRun(run.id)}
								>
									<Dot $status={run.status} />
									<NavText numberOfLines={1}>{runName(run)}</NavText>
									<Count>
										{new Date(run.startedAt).toLocaleTimeString([], {
											hour: "2-digit",
											minute: "2-digit",
										})}
									</Count>
								</NavButton>
							))
						) : (
							<Empty>No runs yet</Empty>
						)}
					</>
				)}
			</Navigation>
			{!compact && (
				<Connection accessibilityLiveRegion="polite">
					<Dot $status={studioStore.connected ? "passed" : "offline"} />
					<Caption>{studioStore.connected ? "Connected" : "Reconnecting…"}</Caption>
				</Connection>
			)}
		</Container>
	);
});
