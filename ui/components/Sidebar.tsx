import styled from "styled-components/native";
import { useWindowDimensions } from "react-native";
import { observer } from "mobx-react-lite";
import studioStore from "../stores";
import { runName, workspaceName } from "../model";
import { BodyText, Caption } from "../styles/typography";

const Container = styled.View<{ $width: number }>`
	width: ${({ $width }) => $width}px;
	background-color: ${({ theme }) => theme.colors.sidebar};
	padding: 24px 12px 16px;
	flex-shrink: 0;
`;
const Navigation = styled.ScrollView`
	flex: 1;
`;
const Project = styled.View`
	flex-direction: row;
	align-items: center;
	gap: 10px;
	border-width: 1px;
	border-color: #3c4e44;
	border-radius: 8px;
	padding: 12px 10px;
	margin-bottom: 28px;
`;
const ProjectDetails = styled.View`
	flex: 1;
	gap: 4px;
`;
const ProjectName = styled(BodyText)`
	color: #e5eee7;
	font-weight: 600;
`;
const ProjectIcon = styled(BodyText)`
	color: #c1cabc;
	font-size: 20px;
`;
const Label = styled(Caption)<{ $spaced?: boolean }>`
	font-size: 9px;
	letter-spacing: 1.6px;
	color: #7f9687;
	margin: ${({ $spaced }) => ($spaced ? 30 : 0)}px 12px 12px;
`;
const NavButton = styled.Pressable<{ $active: boolean; $compact: boolean }>`
	flex-direction: row;
	align-items: center;
	justify-content: ${({ $compact }) => ($compact ? "center" : "flex-start")};
	gap: 10px;
	padding: 12px 8px;
	border-radius: 6px;
	margin-bottom: 3px;
	background-color: ${({ $active }) => ($active ? "#30463a" : "transparent")};
`;
const NavText = styled(BodyText)`
	color: #abc0b1;
	flex: 1;
`;
const NavIcon = styled(BodyText)`
	color: #94b39e;
	font-size: 15px;
`;
const Count = styled(Caption)`
	color: #9ab8a3;
	font-size: 9px;
`;
const Dot = styled.View<{ $status: string }>`
	width: 6px;
	height: 6px;
	border-radius: 3px;
	background-color: ${({ $status }) => (["failed", "offline"].includes($status) ? "#dc8e7b" : $status === "running" ? "#dbbe79" : "#84c598")};
`;
const Empty = styled(Caption)`
	padding: 0px 12px;
	color: #80978a;
`;
const Connection = styled.View`
	flex-direction: row;
	align-items: center;
	gap: 6px;
	padding: 24px 8px 0px;
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
	const workspaces = studioStore.workspaces;
	return (
		<Container $width={compact ? 62 : width <= 1100 ? 190 : 224}>
			<Navigation accessibilityLabel="Test navigation">
				{!compact && (
					<>
						<Project>
							<ProjectIcon>⌘</ProjectIcon>
							<ProjectDetails>
								<ProjectName numberOfLines={2} accessibilityHint={catalog?.root}>
									{catalog?.name ?? "Discovering…"}
								</ProjectName>
								<Caption>Local workspace</Caption>
							</ProjectDetails>
							<Dot $status={studioStore.connected ? "passed" : "offline"} />
						</Project>
						<Label>EXPLORER</Label>
					</>
				)}
				{["all", ...runners].map((id) => {
					const label =
						id === "all"
							? "All tests"
							: (catalog?.runners.find((runner) => runner.id === id)?.label ?? id);
					return (
						<NavButton
							key={id}
							accessibilityRole="button"
							accessibilityLabel={label}
							aria-selected={studioStore.filters.runner === id}
							$active={studioStore.filters.runner === id}
							$compact={compact}
							onPress={() => studioStore.setRunner(id)}
						>
							<NavIcon>{id === "all" ? "▦" : "◉"}</NavIcon>
							{!compact && (
								<>
									<NavText numberOfLines={1}>{label}</NavText>
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
						<Label $spaced>WORKSPACES</Label>
						{workspaces.map((workspace) => (
							<NavButton
								key={workspace}
								accessibilityRole="button"
								accessibilityLabel={workspaceName(workspace)}
								aria-selected={studioStore.filters.workspace === workspace}
								$active={studioStore.filters.workspace === workspace}
								$compact={false}
								onPress={() => studioStore.toggleWorkspace(workspace)}
							>
								<NavIcon>⌑</NavIcon>
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
						<Label $spaced>RECENT RUNS · {studioStore.runs.length}</Label>
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
							<Empty>No runs yet.</Empty>
						)}
					</>
				)}
			</Navigation>
			{!compact && (
				<Connection accessibilityLiveRegion="polite">
					<Dot $status={studioStore.connected ? "passed" : "offline"} />
					<Count>
						{studioStore.connected
							? "Auto-discovery is on"
							: "Disconnected · retrying…"}
					</Count>
				</Connection>
			)}
		</Container>
	);
});
