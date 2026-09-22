import { useWindowDimensions } from "react-native";
import styled from "styled-components/native";
import type { Catalog } from "../../types";
import { BodyText, Caption } from "../styles/typography";

const Container = styled.View`
	flex-direction: row;
	gap: 12px;
	margin: 24px 0px;
`;
const Card = styled.View<{ $compact: boolean }>`
	flex: 1;
	min-width: 0px;
	flex-direction: row;
	align-items: center;
	gap: 12px;
	padding: ${({ $compact }) => ($compact ? 12 : 16)}px;
	border-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
	border-radius: 9px;
	background-color: ${({ theme }) => theme.colors.surface};
`;
const Icon = styled(BodyText)`
	background-color: ${({ theme }) => theme.colors.selected};
	color: #677d61;
	padding: 9px;
	border-radius: 8px;
	font-size: 18px;
`;
const Metric = styled.View`
	gap: 4px;
	flex-shrink: 1;
`;
const Value = styled(BodyText)`
	font-size: 24px;
	letter-spacing: -0.8px;
`;
const Detail = styled(Caption)`
	margin-left: auto;
	font-size: 9px;
`;

export function DiscoverySummary({ catalog }: { catalog: Catalog | null }) {
	const { width } = useWindowDimensions();
	const stats = [
		{
			icon: "▤",
			value: catalog?.files.length ?? 0,
			label: "test files",
			note: "Auto-discovered",
		},
		{
			icon: "⌘",
			value: catalog?.files.reduce((n, file) => n + file.cases.length, 0) ?? 0,
			label: "test declarations",
			note: "From source",
		},
		{
			icon: "◈",
			value: catalog?.runners.length ?? 0,
			label: "active adapters",
			note: `${catalog?.runners.filter((runner) => runner.available).length ?? 0} tools available`,
		},
	];
	return (
		<Container accessibilityLabel="Discovery summary">
			{stats.map((stat) => (
				<Card key={stat.label} $compact={width <= 800}>
					{width > 800 && <Icon>{stat.icon}</Icon>}
					<Metric>
						<Value>{stat.value.toLocaleString()}</Value>
						<Caption>{stat.label}</Caption>
					</Metric>
					{width > 1100 && <Detail>{stat.note}</Detail>}
				</Card>
			))}
		</Container>
	);
}
