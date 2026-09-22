import type { ReactNode } from "react";
import { Modal } from "react-native";
import styled from "styled-components/native";
import { HeadingText, TitleRow } from "../styles/inspector";
import { Button } from "./Button";

interface DialogProps {
	title: string;
	open: boolean;
	onClose: () => void;
	children: ReactNode;
}
const Overlay = styled.View`
	flex: 1;
	background-color: #192c2766;
	align-items: center;
	justify-content: center;
	padding: 20px;
`;
const DismissArea = styled.Pressable`
	position: absolute;
	top: 0px;
	right: 0px;
	bottom: 0px;
	left: 0px;
`;
const Panel = styled.View`
	width: 100%;
	max-width: 440px;
	max-height: 90%;
	border-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
	border-radius: 12px;
	background-color: ${({ theme }) => theme.colors.surface};
	padding: 24px;
	gap: 20px;
`;
const Content = styled.ScrollView.attrs({ keyboardShouldPersistTaps: "handled" })`
	flex-shrink: 1;
`;

export function Dialog({ title, open, onClose, children }: DialogProps) {
	return (
		<Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
			<Overlay>
				<DismissArea
					accessibilityLabel="Dismiss dialog"
					accessibilityRole="button"
					onPress={onClose}
				/>
				<Panel aria-modal accessibilityLabel={title}>
					<TitleRow>
						<HeadingText>{title}</HeadingText>
						<Button
							compact
							variant="quiet"
							accessibilityLabel={`Close ${title.toLowerCase()}`}
							onPress={onClose}
						>
							×
						</Button>
					</TitleRow>
					<Content>{children}</Content>
				</Panel>
			</Overlay>
		</Modal>
	);
}
