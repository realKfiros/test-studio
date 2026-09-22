import styled from "styled-components/native";
import { HeadingText } from "../styles/inspector";
import { Note } from "../styles/typography";

const Container = styled.View`
	flex: 1;
	min-height: 250px;
	padding: 28px;
	align-items: center;
	justify-content: center;
	gap: 12px;
`;
const Description = styled(Note)`
	text-align: center;
	max-width: 300px;
`;

export function EmptyState({ title, description }: { title?: string; description: string }) {
	return (
		<Container>
			{title && <HeadingText>{title}</HeadingText>}
			<Description>{description}</Description>
		</Container>
	);
}
