import { useLayoutEffect, useRef } from "react";
import { ScrollView } from "react-native";
import styled from "styled-components/native";
import { MonoText } from "../styles/typography";

const OutputScroll = styled(ScrollView).attrs({
	contentContainerStyle: { paddingVertical: 18, paddingHorizontal: 24 },
})`
	flex: 1;
	min-height: 100px;
	background-color: ${({ theme }) => theme.colors.terminal};
`;
const OutputText = styled(MonoText)`
	color: ${({ theme }) => theme.colors.secondaryText};
`;

export function LiveOutput({ output, jobId }: { output: string; jobId: string }) {
	const ref = useRef<ScrollView>(null);
	const follow = useRef(true);
	useLayoutEffect(() => {
		follow.current = true;
		ref.current?.scrollToEnd({ animated: false });
	}, [jobId]);
	return (
		<OutputScroll
			ref={ref}
			accessibilityLabel="Runner output"
			scrollEventThrottle={16}
			onContentSizeChange={() => {
				if (follow.current) ref.current?.scrollToEnd({ animated: false });
			}}
			onScroll={({ nativeEvent }) => {
				follow.current =
					nativeEvent.contentSize.height -
						nativeEvent.layoutMeasurement.height -
						nativeEvent.contentOffset.y <
					50;
			}}
		>
			<OutputText selectable>{output}</OutputText>
		</OutputScroll>
	);
}
