import Search from "lucide-react-native/icons/search";
import { Icon } from "./Icon";
import { type RefObject } from "react";
import { TextInput, useWindowDimensions } from "react-native";
import styled from "styled-components/native";
import { observer } from "mobx-react-lite";
import studioStore from "../stores";
import { FileTreeEntry } from "./FileTree";
import { Select } from "./Select";
import { Button } from "./Button";
import { BodyText, Caption, Note } from "../styles/typography";

const Container = styled.View<{ $mobile: boolean; $width: number }>`
	width: ${({ $mobile, $width }) => ($mobile ? "100%" : `${$width}px`)};
	${({ $mobile }) => ($mobile ? "height: 420px;" : "")}
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
const TreeControls = styled(Filters)`
	padding: 0px 8px;
	margin-top: 0px;
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
	const panelWidth = width > 1100 ? 380 : width > 800 ? 320 : 280;
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
					<Select
						label="Latest result"
						value={studioStore.filters.status}
						options={[
							{ value: "all", label: "All results" },
							{ value: "unrun", label: "Not run" },
							{ value: "failed", label: "Failed" },
							{ value: "passed", label: "Passed" },
							{ value: "running", label: "Running" },
							{ value: "queued", label: "Queued" },
							{ value: "cancelled", label: "Cancelled" },
						]}
						onValueChange={studioStore.setStatus}
					/>
				</Filters>
				<Filters>
					<Select
						label="Tag"
						value={studioStore.filters.tag}
						options={[
							{ value: "all", label: "All tags" },
							...studioStore.tags.map((tag) => ({ value: tag, label: tag })),
						]}
						onValueChange={studioStore.setTag}
					/>
					<Button
						compact
						variant="quiet"
						disabled={!studioStore.hasFilters}
						onPress={studioStore.resetFilters}
					>
						Reset filters
					</Button>
				</Filters>
				<Filters>
					<Button compact variant="quiet" onPress={studioStore.selectVisible}>
						Select visible
					</Button>
					<Button compact variant="quiet" onPress={studioStore.clearSelection}>
						Clear selection
					</Button>
				</Filters>
			</Toolbar>
			<ListHeading>
				<BodyText>Folders & files</BodyText>
				<Caption>{studioStore.files.length}</Caption>
			</ListHeading>
			<TreeControls>
				<Button compact variant="quiet" onPress={studioStore.expandFolders}>
					Expand all
				</Button>
				<Button compact variant="quiet" onPress={studioStore.collapseFolders}>
					Collapse all
				</Button>
			</TreeControls>
			<List accessibilityLabel="Discovered test files">
				{studioStore.tree.map((node) => (
					<FileTreeEntry key={node.path} node={node} />
				))}
				{!studioStore.files.length && <Note>No tests match these filters.</Note>}
			</List>
			<Footer>
				<Caption>{studioStore.selected.size} selected</Caption>
				<Caption>Folder actions follow filters</Caption>
			</Footer>
		</Container>
	);
});
