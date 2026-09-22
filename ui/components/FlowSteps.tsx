import styled from "styled-components/native";
import type { TestFile } from "../../types";
import { BodyText, Caption, Note } from "../styles/typography";

const Step = styled.View`
	flex-direction: row;
	align-items: center;
	gap: 10px;
	padding: 12px 0px;
	border-bottom-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
`;
const Name = styled(BodyText)`
	flex: 1;
	color: ${({ theme }) => theme.colors.secondaryText};
`;

export function FlowSteps({ file }: { file: TestFile }) {
	return (
		<>
			<Note>
				{file.appId ? `App: ${file.appId}` : "Flow"}
				{file.tags?.length ? ` · Tags: ${file.tags.join(", ")}` : ""}
				{"\n"}Runs the complete flow. Start any required devices, apps, and services first.
			</Note>
			{file.steps?.map((step, index) => (
				<Step key={`${index}:${step.line}`}>
					<Caption>{String(index + 1).padStart(2, "0")}</Caption>
					<Name>{step.name}</Name>
					<Caption>:{step.line}</Caption>
				</Step>
			))}
		</>
	);
}
