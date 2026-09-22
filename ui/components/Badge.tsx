import type { ReactNode } from "react";
import styled from "styled-components/native";
import { Caption } from "../styles/typography";

const Container = styled.View<{ $status?: string }>`
	padding: 3px 5px;
	border-radius: 3px;
	align-self: flex-start;
	background-color: ${({ $status, theme }) => ($status === "failed" ? "#f7eae5" : theme.colors.selected)};
`;
const Label = styled(Caption)<{ $status?: string }>`
	color: ${({ $status, theme }) => ($status === "failed" ? theme.colors.danger : theme.colors.secondaryText)};
	font-size: 9px;
`;

export function Badge({ children, status }: { children: ReactNode; status?: string }) {
	return (
		<Container $status={status}>
			<Label $status={status}>{children}</Label>
		</Container>
	);
}
