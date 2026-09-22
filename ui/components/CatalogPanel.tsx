import { Fragment, type RefObject } from "react";
import { TextInput, useWindowDimensions } from "react-native";
import styled from "styled-components/native";
import type { TestFile } from "../../types";
import type { Studio } from "../useStudio";
import { workspaceName } from "../model";
import { Checkbox } from "./Checkbox";
import { Select } from "./Select";
import { Button } from "./Button";
import { BodyText, Caption, Note } from "../styles/typography";

const Container = styled.View<{ $mobile: boolean; $width: number }>`
	width: ${({ $mobile, $width }) => ($mobile ? "100%" : `${$width}px`)};
	${({ $mobile }) => ($mobile ? "height: 300px;" : "")}
	flex-shrink: 0;
	border-right-width: ${({ $mobile }) => ($mobile ? 0 : 1)}px;
	border-bottom-width: ${({ $mobile }) => ($mobile ? 1 : 0)}px;
	border-color: ${({ theme }) => theme.colors.border};
	background-color: #fcfdfa;
`;
const Toolbar = styled.View`
	padding: 16px;
	border-bottom-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
`;
const SearchRow = styled.View`
	flex-direction: row;
	align-items: center;
	gap: 7px;
	border-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
	background-color: ${({ theme }) => theme.colors.surface};
	border-radius: 6px;
	padding: 0px 10px;
`;
const SearchInput = styled(TextInput)`
	height: 36px;
	flex: 1;
	min-width: 0px;
	font-family: ${({ theme }) => theme.fonts.body};
	font-size: 11px;
	color: ${({ theme }) => theme.colors.secondaryText};
`;
const Filters = styled.View`
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	gap: 4px;
	margin-top: 12px;
`;
const ListHeading = styled.View`
	flex-direction: row;
	justify-content: space-between;
	padding: 15px 16px 9px;
`;
const List = styled.ScrollView.attrs({
	contentContainerStyle: { paddingHorizontal: 9, paddingBottom: 12 },
})`
	flex: 1;
	min-height: 0px;
`;
const Group = styled.View`
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	padding: 14px 7px 8px;
`;
const FileRow = styled.View<{ $active: boolean }>`
	flex-direction: row;
	align-items: center;
	gap: 4px;
	padding: 7px 2px;
	border-radius: 6px;
	background-color: ${({ $active, theme }) => ($active ? theme.colors.selected : "transparent")};
`;
const OpenFile = styled.Pressable`
	flex: 1;
	min-width: 0px;
	flex-direction: row;
	align-items: center;
	gap: 10px;
	padding: 3px 4px;
`;
const FileIcon = styled(Caption)`
	background-color: #e5ecdc;
	color: #7a8c6c;
	padding: 4px;
	border-radius: 3px;
	font-size: 9px;
`;
const FileInfo = styled.View`
	flex: 1;
	min-width: 0px;
	gap: 5px;
`;
const Footer = styled.View`
	flex-direction: row;
	justify-content: space-between;
	border-top-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
	padding: 12px 16px;
`;

export function CatalogPanel({
	studio,
	searchRef,
}: {
	studio: Studio;
	searchRef: RefObject<TextInput | null>;
}) {
	const { width } = useWindowDimensions();
	const groups = new Map<string, TestFile[]>();
	for (const file of studio.files) {
		const group = groups.get(file.workspace);
		if (group) group.push(file);
		else groups.set(file.workspace, [file]);
	}
	const panelWidth = width > 1100 ? Math.max(300, (width - 296) * 0.36) : width > 800 ? 300 : 260;
	return (
		<Container $mobile={width <= 600} $width={panelWidth}>
			<Toolbar>
				<SearchRow>
					<Caption>⌕</Caption>
					<SearchInput
						ref={searchRef}
						accessibilityLabel="Search files, tests, and tags"
						placeholder="Search files, tests, tags…"
						value={studio.filters.query}
						onChangeText={(query) =>
							studio.setFilters((filters) => ({ ...filters, query }))
						}
						autoCorrect={false}
						autoCapitalize="none"
						returnKeyType="search"
					/>
					<Caption>/</Caption>
				</SearchRow>
				<Filters>
					<Select
						label="Platform"
						value={studio.filters.platform}
						options={[
							{ value: "all", label: "All platforms" },
							{ value: "ios", label: "iOS" },
							{ value: "android", label: "Android" },
						]}
						onValueChange={(platform) =>
							studio.setFilters((filters) => ({ ...filters, platform }))
						}
					/>
					<Button compact variant="quiet" onPress={studio.selectVisible}>
						Select visible
					</Button>
					<Button compact variant="quiet" onPress={() => studio.setSelected(new Map())}>
						Clear
					</Button>
				</Filters>
			</Toolbar>
			<ListHeading>
				<Caption>TEST FILES</Caption>
				<Caption>{studio.files.length} files</Caption>
			</ListHeading>
			<List accessibilityLabel="Discovered test files">
				{[...groups].map(([workspace, files]) => (
					<Fragment key={workspace}>
						<Group>
							<Caption>{workspaceName(workspace)}</Caption>
							<Caption>{files.length}</Caption>
						</Group>
						{files.map((file) => {
							const runner = studio.catalog?.runners.find(
								(runner) => runner.id === file.runner,
							);
							return (
								<FileRow key={file.id} $active={studio.currentFile?.id === file.id}>
									<Checkbox
										label={`Select ${file.name}`}
										checked={studio.selected.has(file.id)}
										indeterminate={studio.selected.get(file.id) instanceof Set}
										disabled={!runner}
										onValueChange={(checked) =>
											studio.selectFile(file.id, checked)
										}
									/>
									<OpenFile
										accessibilityRole="button"
										accessibilityLabel={`Open ${file.name}`}
										accessibilityHint={file.path}
										onPress={() => studio.openFile(file.id)}
									>
										<FileIcon>
											{(runner?.label ?? file.runner)
												.slice(0, 2)
												.toUpperCase()}
										</FileIcon>
										<FileInfo>
											<BodyText numberOfLines={1}>{file.name}</BodyText>
											<Caption numberOfLines={1}>
												{file.path.slice(
													workspace === "." ? 0 : workspace.length + 1,
												)}
											</Caption>
										</FileInfo>
										<Caption>{file.steps?.length ?? file.cases.length}</Caption>
									</OpenFile>
								</FileRow>
							);
						})}
					</Fragment>
				))}
				{!studio.files.length && <Note>No tests match these filters.</Note>}
			</List>
			<Footer>
				<Caption>
					{studio.catalog
						? `Scanned ${new Date(studio.catalog.scannedAt).toLocaleTimeString()}`
						: "Scanning project…"}
				</Caption>
				<Caption>↻ 5s</Caption>
			</Footer>
		</Container>
	);
}
