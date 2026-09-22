import styled from "styled-components/native";
import type { Studio } from "../useStudio";
import { runName } from "../model";
import { Caption, BodyText, Note } from "../styles/typography";
import {
	InspectorHeading,
	TitleRow,
	HeadingText,
	PathText,
	InspectorContent,
} from "../styles/inspector";
import { Button } from "./Button";
import { Badge } from "./Badge";

const BackRow = styled.View`
	align-items: flex-start;
	margin-bottom: 12px;
`;
const Entry = styled.Pressable`
	flex-direction: row;
	align-items: center;
	gap: 10px;
	padding: 15px 0px;
	border-bottom-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
`;
const Name = styled(BodyText)`
	flex: 1;
	min-width: 0px;
`;

export function RunHistory({ studio }: { studio: Studio }) {
	return (
		<>
			<InspectorHeading>
				<BackRow>
					<Button compact variant="quiet" onPress={() => studio.setView("file")}>
						← Back to tests
					</Button>
				</BackRow>
				<TitleRow>
					<HeadingText>Recent runs</HeadingText>
				</TitleRow>
				<PathText>The last 20 runs in this server session.</PathText>
			</InspectorHeading>
			<InspectorContent>
				{studio.runs.map((run) => (
					<Entry
						key={run.id}
						accessibilityRole="button"
						accessibilityLabel={`${runName(run)}, ${run.status}, ${new Date(run.startedAt).toLocaleTimeString()}`}
						onPress={() => studio.openRun(run.id)}
					>
						<Badge status={run.status}>{run.status}</Badge>
						<Name numberOfLines={1}>{runName(run)}</Name>
						<Caption>{new Date(run.startedAt).toLocaleTimeString()}</Caption>
					</Entry>
				))}
				{!studio.runs.length && (
					<Note>No runs yet. Select a file or test to get started.</Note>
				)}
			</InspectorContent>
		</>
	);
}
