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
const Line = styled.View<{ $highlight: boolean }>`
	flex-direction: row;
	padding: 1px 6px;
	background-color: ${({ $highlight, theme }) =>
		$highlight ? theme.colors.dangerSurface : "transparent"};
	border-left-width: 2px;
	border-left-color: ${({ $highlight, theme }) =>
		$highlight ? theme.colors.danger : "transparent"};
`;
const Number = styled(MonoText)<{ $highlight: boolean }>`
	width: 42px;
	padding-right: 12px;
	text-align: right;
	color: ${({ $highlight, theme }) => ($highlight ? theme.colors.danger : theme.colors.muted)};
`;
const Code = styled(MonoText)`
	color: ${({ theme }) => theme.colors.secondaryText};
	flex-shrink: 0;
`;

export const SourceView = observer(function SourceView({
	file,
	focusLine,
}: {
	file: TestFile;
	focusLine?: number;
}) {
	const source = studioStore.source;
	const error = studioStore.sourceError;
	if (error) return <Note accessibilityRole="alert">{error}</Note>;
	if (source === null) return <Note>Loading source…</Note>;
	const lines = source.split("\n");
	const target = focusLine && focusLine <= lines.length ? focusLine : undefined;
	const start = target ? target - 1 : 0;
	const end = target ? Math.min(lines.length, target + 7) : lines.length;
	return (
		<HorizontalScroll
			horizontal
			accessibilityLabel={`Source of ${file.name}${target ? ` near line ${target}` : ""}`}
		>
			<Lines>
				{lines.slice(start, end).map((line, index) => {
					const number = start + index + 1;
					return (
						<Line key={number} $highlight={number === target}>
							<Number $highlight={number === target}>{number}</Number>
							<Code selectable>{line || " "}</Code>
						</Line>
					);
				})}
			</Lines>
		</HorizontalScroll>
	);
});
