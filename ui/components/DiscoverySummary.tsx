import styled from "styled-components/native";
import type { Catalog } from "../../types";
import { Caption } from "../styles/typography";

const Container = styled.View`
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
	padding: 8px 16px;
	border-top-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
	background-color: ${({ theme }) => theme.colors.background};
`;
const Counts = styled.View`
	flex-direction: row;
	align-items: center;
	gap: 16px;
`;
const Detail = styled(Caption)`
	font-family: ${({ theme }) => theme.fonts.mono};
	font-size: 10px;
`;

export function DiscoverySummary({ catalog }: { catalog: Catalog | null }) {
	return (
		<Container accessibilityLabel="Discovery summary">
			<Counts>
				<Caption>{catalog?.files.length ?? 0} files</Caption>
				<Caption>
					{catalog?.files.reduce((count, file) => count + file.cases.length, 0) ?? 0}{" "}
					tests
				</Caption>
				<Caption>{catalog?.runners.length ?? 0} adapters</Caption>
			</Counts>
			<Detail>
				{catalog
					? `Scanned ${new Date(catalog.scannedAt).toLocaleTimeString()}`
					: "Scanning…"}
			</Detail>
		</Container>
	);
}
