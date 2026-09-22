import Play from "lucide-react-native/icons/play";
import { Fragment } from "react";
import styled from "styled-components/native";
import { observer } from "mobx-react-lite";
import studioStore from "../stores";
import { BodyText, Caption, Note } from "../styles/typography";
import { Checkbox } from "./Checkbox";
import { Badge } from "./Badge";
import { Button } from "./Button";

const Group = styled(Caption)`
	padding: 8px 0px 12px;
	color: ${({ theme }) => theme.colors.text};
	font-size: 12px;
	font-weight: 500;
`;
const TestRow = styled.View`
	flex-direction: row;
	align-items: center;
	gap: 8px;
	padding: 5px 0px;
	min-height: 39px;
	border-bottom-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
`;
const Name = styled(BodyText)`
	flex: 1;
	min-width: 0px;
	color: ${({ theme }) => theme.colors.secondaryText};
`;

export const TestCases = observer(function TestCases() {
	const file = studioStore.currentFile;
	if (!file) return null;
	const runner = studioStore.catalog?.runners.find((runner) => runner.id === file.runner);
	const selection = studioStore.selected.get(file.id);
	let previousGroup = "";
	if (!file.cases.length)
		return (
			<Note>
				No static test declarations found. A file-level run discovers tests generated at
				runtime.
			</Note>
		);
	return (
		<>
			{file.cases.map((test) => {
				const group =
					test.fullName.slice(0, -test.name.length).trim() || "File-level tests";
				const heading = group !== previousGroup;
				previousGroup = group;
				return (
					<Fragment key={test.id}>
						{heading && <Group>{group}</Group>}
						<TestRow>
							<Checkbox
								label={`Select test ${test.fullName}`}
								checked={
									studioStore.selected.has(file.id) &&
									(selection === null || !!selection?.has(test.id))
								}
								disabled={!test.runnable || !runner?.supportsIndividualTests}
								onValueChange={(checked) =>
									studioStore.selectCase(test.id, checked)
								}
							/>
							<Name>{test.name}</Name>
							{test.mode !== "normal" && <Badge>{test.mode}</Badge>}
							<Caption>:{test.line}</Caption>
							<Button
								icon={Play}
								compact
								variant="quiet"
								accessibilityLabel={`Run test ${test.fullName}`}
								disabled={
									!test.runnable ||
									!runner?.supportsIndividualTests ||
									!runner.available ||
									studioStore.busy
								}
								onPress={() =>
									void studioStore.start([
										{ fileId: file.id, caseIds: [test.id] },
									])
								}
							/>
						</TestRow>
					</Fragment>
				);
			})}
		</>
	);
});
