import styled from "styled-components/native";
import type { Studio } from "../useStudio";
import { BodyText, Caption, Note } from "../styles/typography";
import {
	InspectorHeading,
	Overline,
	TitleRow,
	HeadingText,
	PathText,
	InspectorContent,
} from "../styles/inspector";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { EmptyState } from "./EmptyState";
import { SourceView } from "./SourceView";
import { TestCases } from "./TestCases";
import { FlowSteps } from "./FlowSteps";

const Tabs = styled.View`
	flex-direction: row;
	gap: 24px;
	padding: 0px 24px;
	border-bottom-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
`;
const Tab = styled.Pressable<{ $active: boolean }>`
	padding: 13px 0px;
	border-bottom-width: 2px;
	border-bottom-color: ${({ $active, theme }) => ($active ? theme.colors.success : "transparent")};
`;
const TabLabel = styled(BodyText)<{ $active: boolean }>`
	font-size: 11px;
	color: ${({ $active, theme }) => ($active ? theme.colors.secondaryText : theme.colors.muted)};
`;

export function FileInspector({ studio }: { studio: Studio }) {
	const file = studio.currentFile;
	if (!file)
		return (
			<EmptyState
				title={studio.catalog ? "Select a file" : "Discovering your tests"}
				description="Choose a file to inspect its tests, browse the source, or start a run."
			/>
		);
	const runner = studio.catalog?.runners.find((runner) => runner.id === file.runner);
	return (
		<>
			<InspectorHeading>
				<Overline>
					<Badge>{file.runner.toUpperCase()}</Badge>
					{file.platform && <Badge>{file.platform}</Badge>}
					<Caption>
						{file.steps
							? `${file.steps.length} steps`
							: `${file.cases.length} declarations`}
					</Caption>
				</Overline>
				<TitleRow>
					<HeadingText>{file.name}</HeadingText>
					<Button
						compact
						disabled={!runner?.available || studio.busy}
						onPress={() => void studio.start([{ fileId: file.id }])}
					>
						▶ Run {file.steps ? "flow" : "file"}
					</Button>
				</TitleRow>
				<PathText selectable>{file.path}</PathText>
			</InspectorHeading>
			<Tabs accessibilityRole="tablist" accessibilityLabel="File details">
				{(["tests", "source"] as const).map((tab) => (
					<Tab
						key={tab}
						accessibilityRole="tab"
						aria-selected={studio.tab === tab}
						$active={studio.tab === tab}
						onPress={() => studio.setTab(tab)}
					>
						<TabLabel $active={studio.tab === tab}>
							{tab === "source" ? "Source" : file.steps ? "Flow steps" : "Tests"}
						</TabLabel>
					</Tab>
				))}
			</Tabs>
			<InspectorContent>
				{studio.tab === "source" ? (
					<SourceView key={file.id} file={file} />
				) : (
					<>
						{!!file.note && <Note>{file.note}</Note>}
						{!runner ? (
							<Note>
								{file.runner} was detected. Enable an adapter for this framework in
								the project configuration.
							</Note>
						) : !runner.available ? (
							<Note>
								{runner.executable} is unavailable. Install it in your project or
								add it to PATH.
							</Note>
						) : null}
						{file.steps ? <FlowSteps file={file} /> : <TestCases studio={studio} />}
					</>
				)}
			</InspectorContent>
		</>
	);
}
