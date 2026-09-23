import { Fragment } from "react";
import { observer } from "mobx-react-lite";
import styled from "styled-components/native";
import Folder from "lucide-react-native/icons/folder";
import FolderOpen from "lucide-react-native/icons/folder-open";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import FileCode from "lucide-react-native/icons/file-code-corner";
import Play from "lucide-react-native/icons/play";
import type { CatalogNode } from "../catalog";
import studioStore from "../stores";
import { BodyText, Caption } from "../styles/typography";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";

const Row = styled.View<{ $depth: number; $active?: boolean }>`
	flex-direction: row;
	align-items: center;
	min-height: 34px;
	padding: 2px 8px 2px ${({ $depth }) => 8 + $depth * 14}px;
	border-left-width: 2px;
	border-left-color: ${({ $active, theme }) => ($active ? theme.colors.accent : "transparent")};
	background-color: ${({ $active, theme }) => ($active ? theme.colors.selected : "transparent")};
`;
const Open = styled.Pressable`
	flex-direction: row;
	align-items: center;
	gap: 6px;
	flex: 1;
	min-width: 0px;
	padding: 5px 2px;
`;
const Name = styled(BodyText)`
	font-size: 12px;
	flex: 1;
	min-width: 0px;
`;
const StatusDot = styled.View<{ $status: string }>`
	width: 5px;
	height: 5px;
	border-radius: 3px;
	margin: 0px 5px;
	background-color: ${({ $status, theme }) => ($status === "failed" ? theme.colors.danger : $status === "passed" ? theme.colors.success : $status === "running" || $status === "queued" ? theme.colors.warning : theme.colors.muted)};
`;

export const FileTreeEntry = observer(function FileTreeEntry({
	node,
	depth = 0,
}: {
	node: CatalogNode;
	depth?: number;
}) {
	if (node.kind === "folder") {
		const open = !studioStore.collapsedFolders.has(node.path);
		const count = studioStore.folderCount(node.path);
		return (
			<Fragment>
				<Row $depth={depth}>
					<Checkbox
						label={`Select folder ${node.path}`}
						{...studioStore.folderSelection(node.path)}
						disabled={!count}
						onValueChange={(checked) => studioStore.selectFolder(node.path, checked)}
					/>
					<Open
						accessibilityRole="button"
						accessibilityLabel={`Folder ${node.path}`}
						aria-expanded={open}
						onPress={() => studioStore.toggleFolder(node.path)}
					>
						<Icon icon={open ? ChevronDown : ChevronRight} size={12} />
						<Icon icon={open ? FolderOpen : Folder} size={14} />
						<Name numberOfLines={1}>{node.name}</Name>
						<Caption>{node.files.length}</Caption>
					</Open>
					<Button
						icon={Play}
						compact
						variant="quiet"
						accessibilityLabel={`Run ${count} visible files in ${node.path}`}
						disabled={!count || studioStore.busy}
						onPress={() => void studioStore.startFolder(node.path)}
					/>
				</Row>
				{open &&
					node.children.map((child) => (
						<FileTreeEntry key={child.path} node={child} depth={depth + 1} />
					))}
			</Fragment>
		);
	}
	const { file } = node;
	const enabled = studioStore.catalog?.runners.some((runner) => runner.id === file.runner);
	const status = studioStore.fileStatuses.get(file.id);
	return (
		<Row $depth={depth} $active={studioStore.currentFile?.id === file.id}>
			<Checkbox
				label={`Select ${file.path}`}
				checked={studioStore.selected.has(file.id)}
				indeterminate={studioStore.selected.get(file.id) instanceof Set}
				disabled={!enabled}
				onValueChange={(checked) => studioStore.selectFile(file.id, checked)}
			/>
			<Open
				accessibilityRole="button"
				accessibilityLabel={`Open ${file.path}`}
				accessibilityHint={file.name}
				onPress={() => studioStore.openFile(file.id)}
			>
				<Icon icon={FileCode} size={14} />
				<Name numberOfLines={1}>{node.name}</Name>
				<Caption>{file.steps?.length ?? file.cases.length}</Caption>
				{status && (
					<StatusDot $status={status} accessibilityLabel={`Latest result: ${status}`} />
				)}
			</Open>
		</Row>
	);
});
