import { useEffect, useRef } from "react";
import { TextInput, useWindowDimensions } from "react-native";
import styled, { ThemeProvider } from "styled-components/native";
import { theme } from "./theme";
import { observer } from "mobx-react-lite";
import studioStore from "./stores";
import { usePageTitle } from "./hooks/usePageTitle";
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

const App = observer(function App() {
	useEffect(() => {
		studioStore.connect();
		return studioStore.disconnect;
	}, []);
	usePageTitle(studioStore.catalog?.name);
	const { width, height } = useWindowDimensions();
	const searchRef = useRef<TextInput>(null);
	useSearchShortcut(searchRef, !studioStore.settingsOpen);
	const mobile = width <= 600;
	return (
		<ThemeProvider theme={theme}>
			<Shell>
				<Sidebar />
				<PageScroll>
					<Main
						$mobile={mobile}
						$height={height}
						$padding={width <= 800 ? 16 : width <= 1100 ? 22 : 36}
					>
						<Toolbar />
						<DiscoverySummary catalog={studioStore.catalog} />
						{!!studioStore.notice && (
							<Notice accessibilityRole="alert">{studioStore.notice}</Notice>
						)}
						<StudioPanel $mobile={mobile}>
							<CatalogPanel searchRef={searchRef} />
							<Inspector $mobile={mobile}>
								{studioStore.view === "run" ? (
									<RunInspector />
								) : studioStore.view === "history" ? (
									<RunHistory />
								) : (
									<FileInspector />
								)}
							</Inspector>
						</StudioPanel>
						<Footer>
							Detected: {studioStore.catalog?.libraries.join(" · ") || "none yet"}
						</Footer>
					</Main>
				</PageScroll>
				<SettingsDialog />
			</Shell>
		</ThemeProvider>
	);
});

export default App;
