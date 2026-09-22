import styled from "styled-components/native";
import { BodyText, Caption } from "./typography";
import { Row } from "./layout";

export const InspectorHeading = styled.View`
	padding: 24px 24px 0px;
	flex-shrink: 0;
`;
export const Overline = styled(Row)`
	flex-wrap: wrap;
	gap: 8px;
	margin-bottom: 12px;
`;
export const TitleRow = styled(Row)`
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 12px;
`;
export const HeadingText = styled(BodyText).attrs({ accessibilityRole: "header" })`
	font-size: 19px;
	font-weight: 600;
	flex-shrink: 1;
`;
export const PathText = styled(Caption)`
	margin: 12px 0px 20px;
`;
export const InspectorContent = styled.ScrollView.attrs({
	contentContainerStyle: { padding: 24 },
})`
	flex: 1;
	min-height: 0px;
`;
