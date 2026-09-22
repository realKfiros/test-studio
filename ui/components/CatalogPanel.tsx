import Search from "lucide-react-native/icons/search";
import FileCode2 from "lucide-react-native/icons/file-code-corner";
import ListChecks from "lucide-react-native/icons/list-checks";
import { Icon } from "./Icon";
import { Fragment, type RefObject } from "react";
import { TextInput, useWindowDimensions } from "react-native";
import styled from "styled-components/native";
import type { TestFile } from "../../types";
import { observer } from "mobx-react-lite";
import studioStore from "../stores";
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
	background-color: ${({ theme }) => theme.colors.surface};
`;
const Toolbar = styled.View`
	padding: 12px;
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
	border-radius: 4px;
	padding: 0px 10px;
`;
const SearchInput = styled(TextInput).attrs(({ theme }) => ({
	placeholderTextColor: theme.colors.muted,
	selectionColor: theme.colors.accent,
}))`
	height: 30px;
	flex: 1;
	min-width: 0px;
	font-family: ${({ theme }) => theme.fonts.body};
	font-size: 12px;
	color: ${({ theme }) => theme.colors.secondaryText};
`;
const Filters = styled.View`
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	gap: 4px;
	margin-top: 8px;
`;
const ListHeading = styled.View`
	flex-direction: row;
	justify-content: space-between;
	padding: 14px 16px 6px;
`;
const List = styled.ScrollView.attrs({
	contentContainerStyle: { paddingHorizontal: 0, paddingBottom: 12 },
})`
	flex: 1;
	min-height: 0px;
`;
const Group = styled.View`
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	padding: 12px 16px 8px;
`;
const FileRow = styled.View<{ $active: boolean }>`
	flex-direction: row;
	align-items: center;
	gap: 4px;
	padding: 7px 10px;
	min-height: 48px;
	border-left-width: 2px;
	border-left-color: ${({ $active, theme }) => ($active ? theme.colors.accent : "transparent")};
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
const FileInfo = styled.View`
	flex: 1;
	min-width: 0px;
	gap: 3px;
`;
const Footer = styled.View`
	flex-direction: row;
	justify-content: space-between;
	border-top-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
	padding: 12px 16px;
`;

export const CatalogPanel = observer(function CatalogPanel({
	searchRef,
}: {
	searchRef: RefObject<TextInput | null>;
}) {
	const { width } = useWindowDimensions();
	const groups = new Map<string, TestFile[]>();
	for (const file of studioStore.files) {
		const group = groups.get(file.workspace);
		if (group) group.push(file);
		else groups.set(file.workspace, [file]);
	}
	const panelWidth = width > 1100 ? 340 : width > 800 ? 300 : 280;
	return (
		<Container $mobile={width <= 600} $width={panelWidth}>
			<Toolbar>
				<SearchRow>
					<Icon icon={Search} size={14} />
					<SearchInput
						ref={searchRef}
						accessibilityLabel="Search files, tests, and tags"
						placeholder="Search files, tests, tags…"
						value={studioStore.filters.query}
						onChangeText={studioStore.setQuery}
						autoCorrect={false}
						autoCapitalize="none"
						returnKeyType="search"
					/>
					<Caption>/</Caption>
				</SearchRow>
				<Filters>
					<Select
						label="Platform"
						value={studioStore.filters.platform}
						options={[
							{ value: "all", label: "All platforms" },
							{ value: "ios", label: "iOS" },
							{ value: "android", label: "Android" },
						]}
						onValueChange={studioStore.setPlatform}
					/>
					<Button compact variant="quiet" onPress={studioStore.selectVisible}>
						Select all
					</Button>
					<Button compact variant="quiet" onPress={studioStore.clearSelection}>
						Clear
					</Button>
				</Filters>
			</Toolbar>
			<ListHeading>
				<BodyText>Files</BodyText>
				<Caption>{studioStore.files.length}</Caption>
			</ListHeading>
			<List accessibilityLabel="Discovered test files">
				{[...groups].map(([workspace, files]) => (
					<Fragment key={workspace}>
						<Group>
							<Caption>{workspaceName(workspace)}</Caption>
							<Caption>{files.length}</Caption>
						</Group>
						{files.map((file) => {
							const runner = studioStore.catalog?.runners.find(
								(runner) => runner.id === file.runner,
							);
							return (
								<FileRow
									key={file.id}
									$active={studioStore.currentFile?.id === file.id}
								>
									<Checkbox
										label={`Select ${file.name}`}
										checked={studioStore.selected.has(file.id)}
										indeterminate={
											studioStore.selected.get(file.id) instanceof Set
										}
										disabled={!runner}
										onValueChange={(checked) =>
											studioStore.selectFile(file.id, checked)
										}
									/>
									<OpenFile
										accessibilityRole="button"
										accessibilityLabel={`Open ${file.name}`}
										accessibilityHint={file.path}
										onPress={() => studioStore.openFile(file.id)}
									>
										<Icon
											icon={file.steps ? ListChecks : FileCode2}
											size={16}
										/>
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
				{!studioStore.files.length && <Note>No tests match these filters.</Note>}
			</List>
			<Footer>
				<Caption>{studioStore.selected.size} selected</Caption>
				<Caption>Auto-discovery</Caption>
			</Footer>
		</Container>
	);
});
