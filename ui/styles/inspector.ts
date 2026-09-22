import styled from "styled-components/native";
import { BodyText, Caption } from "./typography";
import { Row } from "./layout";

export const InspectorHeading = styled.View`
	padding: 20px 24px 0px;
	flex-shrink: 0;
`;
export const Overline = styled(Row)`
	flex-wrap: wrap;
	gap: 8px;
	margin-bottom: 10px;
`;
export const TitleRow = styled(Row)`
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 12px;
`;
export const HeadingText = styled(BodyText).attrs({ accessibilityRole: "header" })`
	font-size: 16px;
	font-weight: 600;
	flex-shrink: 1;
`;
export const PathText = styled(Caption)`
	margin: 8px 0px 18px;
`;
export const InspectorContent = styled.ScrollView.attrs({
	contentContainerStyle: { padding: 24 },
})`
	flex: 1;
	min-height: 0px;
`;
