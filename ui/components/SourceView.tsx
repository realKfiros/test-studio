import { observer } from "mobx-react-lite";
import styled from "styled-components/native";
import type { TestFile } from "../../types";
import studioStore from "../stores";
import { MonoText, Note } from "../styles/typography";

const HorizontalScroll = styled.ScrollView`
	flex-grow: 0;
`;
const Lines = styled.View`
	align-items: flex-start;
`;
const Line = styled.View`
	flex-direction: row;
`;
const Number = styled(MonoText)`
	width: 36px;
	padding-right: 12px;
	text-align: right;
	color: ${({ theme }) => theme.colors.muted};
`;
const Code = styled(MonoText)`
	color: ${({ theme }) => theme.colors.secondaryText};
	flex-shrink: 0;
`;

export const SourceView = observer(function SourceView({ file }: { file: TestFile }) {
	const source = studioStore.source;
	const error = studioStore.sourceError;
	if (error) return <Note accessibilityRole="alert">{error}</Note>;
	if (source === null) return <Note>Loading source…</Note>;
	return (
		<HorizontalScroll horizontal accessibilityLabel={`Source of ${file.name}`}>
			<Lines>
				{source.split("\n").map((line, index) => (
					<Line key={index}>
						<Number>{index + 1}</Number>
						<Code selectable>{line || " "}</Code>
					</Line>
				))}
			</Lines>
		</HorizontalScroll>
	);
});
