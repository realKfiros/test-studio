import styled from "styled-components/native";
import type { Job, Result } from "../../types.ts";
import { failureLocation } from "../model.ts";
import { Caption, MonoText } from "../styles/typography";
import { SourceView } from "./SourceView";

const CodeScroll = styled.ScrollView.attrs({
	contentContainerStyle: { paddingHorizontal: 20, paddingVertical: 12 },
})`
	flex: 1;
	min-height: 100px;
	background-color: ${({ theme }) => theme.colors.terminal};
`;
const CodePath = styled(MonoText)`
	color: ${({ theme }) => theme.colors.text};
	font-size: 12px;
	margin-bottom: 4px;
`;
const Explanation = styled(Caption)`
	margin-bottom: 8px;
`;

export function FailureCodeView({ job, result }: { job: Job; result: Result }) {
	const location = failureLocation(job.file, result, job.output);
	return (
		<CodeScroll accessibilityLabel={`Code for failed test ${result.name}`}>
			<CodePath selectable>
				{job.file.path}
				{location ? `:${location.line}` : ""}
			</CodePath>
			<Explanation>
				{location?.exact
					? "Failure line reported by the test runner"
					: location
						? "Exact failure line unavailable; showing the test declaration"
						: "No test-file line was reported; showing the test source"}
			</Explanation>
			<SourceView file={job.file} focusLine={location?.line} />
		</CodeScroll>
	);
}
