import Play from "lucide-react-native/icons/play";
import Code2 from "lucide-react-native/icons/code-xml";
import ListChecks from "lucide-react-native/icons/list-checks";
import { Icon } from "./Icon";
import styled from "styled-components/native";
import { observer } from "mobx-react-lite";
import studioStore from "../stores";
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
	padding: 11px 0px;
	flex-direction: row;
	align-items: center;
	gap: 7px;
	border-bottom-width: 2px;
	border-bottom-color: ${({ $active, theme }) => ($active ? theme.colors.accent : "transparent")};
`;
const TabLabel = styled(BodyText)<{ $active: boolean }>`
	font-size: 12px;
	color: ${({ $active, theme }) => ($active ? theme.colors.secondaryText : theme.colors.muted)};
`;

export const FileInspector = observer(function FileInspector() {
	const file = studioStore.currentFile;
	if (!file)
		return (
			<EmptyState
				title={studioStore.catalog ? "Select a file" : "Discovering your tests"}
				description="Choose a file to inspect its tests, browse the source, or start a run."
			/>
		);
	const runner = studioStore.catalog?.runners.find((runner) => runner.id === file.runner);
	return (
		<>
			<InspectorHeading>
				<Overline>
					<Badge>{runner?.label ?? file.runner}</Badge>
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
						icon={Play}
						compact
						disabled={!runner?.available || studioStore.busy}
						onPress={() => void studioStore.start([{ fileId: file.id }])}
					>
						Run {file.steps ? "flow" : "file"}
					</Button>
				</TitleRow>
				<PathText selectable>{file.path}</PathText>
			</InspectorHeading>
			<Tabs accessibilityRole="tablist" accessibilityLabel="File details">
				{(["tests", "source"] as const).map((tab) => (
					<Tab
						key={tab}
						accessibilityRole="tab"
						aria-selected={studioStore.tab === tab}
						$active={studioStore.tab === tab}
						onPress={() => studioStore.setTab(tab)}
					>
						<Icon icon={tab === "source" ? Code2 : ListChecks} size={14} />
						<TabLabel $active={studioStore.tab === tab}>
							{tab === "source" ? "Source" : file.steps ? "Flow steps" : "Tests"}
						</TabLabel>
					</Tab>
				))}
			</Tabs>
			<InspectorContent>
				{studioStore.tab === "source" ? (
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
						{file.steps ? <FlowSteps file={file} /> : <TestCases />}
					</>
				)}
			</InspectorContent>
		</>
	);
});
