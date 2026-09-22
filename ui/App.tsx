import { useRef, useState } from "react";
import { TextInput, useWindowDimensions } from "react-native";
import styled, { ThemeProvider } from "styled-components/native";
import { theme } from "./theme";
import { useStudio } from "./useStudio";
import { useSearchShortcut } from "./hooks/useSearchShortcut";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { DiscoverySummary } from "./components/DiscoverySummary";
import { CatalogPanel } from "./components/CatalogPanel";
import { FileInspector } from "./components/FileInspector";
import { RunInspector } from "./components/RunInspector";
import { RunHistory } from "./components/RunHistory";
import { SettingsDialog } from "./components/SettingsDialog";
import { Caption, BodyText } from "./styles/typography";

const Shell = styled.View`
	flex: 1;
	flex-direction: row;
	background-color: ${({ theme }) => theme.colors.background};
`;
const PageScroll = styled.ScrollView.attrs({ contentContainerStyle: { flexGrow: 1 } })`
	flex: 1;
`;
const Main = styled.View<{ $mobile: boolean; $height: number; $padding: number }>`
	min-height: ${({ $height }) => $height}px;
	${({ $mobile, $height }) => ($mobile ? "" : `height: ${Math.max($height, 700)}px;`)}
	padding: 0px ${({ $padding }) => $padding}px;
`;
const Notice = styled(BodyText)`
	border-width: 1px;
	border-color: #e3d6bd;
	background-color: #fff9e9;
	color: #806a47;
	border-radius: 6px;
	padding: 10px 14px;
	margin-bottom: 12px;
`;
const StudioPanel = styled.View<{ $mobile: boolean }>`
	flex: ${({ $mobile }) => ($mobile ? "0 0 auto" : "1")};
	flex-direction: ${({ $mobile }) => ($mobile ? "column" : "row")};
	min-height: 440px;
	border-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
	border-radius: 10px;
	overflow: hidden;
	background-color: ${({ theme }) => theme.colors.surface};
`;
const Inspector = styled.View<{ $mobile: boolean }>`
	flex: ${({ $mobile }) => ($mobile ? "0 0 auto" : "1")};
	min-width: 0px;
	${({ $mobile }) => ($mobile ? "height: 520px;" : "")}
`;
const Footer = styled(Caption)`
	padding: 15px 0px;
	font-size: 9px;
`;

export default function App() {
	const studio = useStudio();
	const { width, height } = useWindowDimensions();
	const [settingsOpen, setSettingsOpen] = useState(false);
	const searchRef = useRef<TextInput>(null);
	useSearchShortcut(searchRef, !settingsOpen);
	const mobile = width <= 600;
	const notice = [studio.error, ...(studio.catalog?.warnings ?? [])].filter(Boolean).join("\n");
	return (
		<ThemeProvider theme={theme}>
			<Shell>
				<Sidebar studio={studio} />
				<PageScroll>
					<Main
						$mobile={mobile}
						$height={height}
						$padding={width <= 800 ? 16 : width <= 1100 ? 22 : 36}
					>
						<Toolbar studio={studio} onOpenSettings={() => setSettingsOpen(true)} />
						<DiscoverySummary catalog={studio.catalog} />
						{!!notice && <Notice accessibilityRole="alert">{notice}</Notice>}
						<StudioPanel $mobile={mobile}>
							<CatalogPanel studio={studio} searchRef={searchRef} />
							<Inspector $mobile={mobile}>
								{studio.view === "run" ? (
									<RunInspector studio={studio} />
								) : studio.view === "history" ? (
									<RunHistory studio={studio} />
								) : (
									<FileInspector studio={studio} />
								)}
							</Inspector>
						</StudioPanel>
						<Footer>
							Detected: {studio.catalog?.libraries.join(" · ") || "none yet"}
						</Footer>
					</Main>
				</PageScroll>
				<SettingsDialog
					studio={studio}
					open={settingsOpen}
					onClose={() => setSettingsOpen(false)}
				/>
			</Shell>
		</ThemeProvider>
	);
}
