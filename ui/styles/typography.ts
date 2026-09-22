import styled from "styled-components/native";

export const BodyText = styled.Text`
	font-family: ${({ theme }) => theme.fonts.body};
	color: ${({ theme }) => theme.colors.text};
	font-size: 12px;
`;
export const Caption = styled(BodyText)`
	color: ${({ theme }) => theme.colors.muted};
	font-size: 10px;
`;
export const Note = styled(Caption)`
	font-size: 11px;
	line-height: 20px;
	margin-bottom: 12px;
`;
export const MonoText = styled(BodyText)`
	font-family: ${({ theme }) => theme.fonts.mono};
	font-size: 11px;
	line-height: 20px;
`;
export const StatusText = styled(Caption)<{ $status: string }>`
	color: ${({ $status, theme }) => ($status === "failed" ? theme.colors.danger : $status === "passed" ? theme.colors.success : theme.colors.muted)};
`;
