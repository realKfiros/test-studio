import type { ReactNode } from "react";
import styled from "styled-components/native";
import { Caption } from "../styles/typography";

const Container = styled.View<{ $status?: string }>`
	padding: 3px 6px;
	border-radius: 3px;
	align-self: flex-start;
	background-color: ${({ $status, theme }) => ($status === "failed" ? theme.colors.dangerSurface : $status === "passed" ? theme.colors.successSurface : theme.colors.raised)};
`;
const Label = styled(Caption)<{ $status?: string }>`
	color: ${({ $status, theme }) => ($status === "failed" ? theme.colors.danger : $status === "passed" ? theme.colors.success : $status === "running" ? theme.colors.warning : theme.colors.secondaryText)};
	font-size: 10px;
`;

export function Badge({ children, status }: { children: ReactNode; status?: string }) {
	return (
		<Container $status={status}>
			<Label $status={status}>{children}</Label>
		</Container>
	);
}
