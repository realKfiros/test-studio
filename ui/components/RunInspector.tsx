import { Fragment } from "react";
import styled from "styled-components/native";
import { observer } from "mobx-react-lite";
import studioStore from "../stores";
import { duration, runName } from "../model";
import { Caption, BodyText, MonoText, StatusText } from "../styles/typography";
import { Actions } from "../styles/layout";
import { InspectorHeading, Overline, TitleRow, HeadingText } from "../styles/inspector";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { EmptyState } from "./EmptyState";
import { LiveOutput } from "./LiveOutput";

const BackRow = styled.View`
	align-items: flex-start;
	margin-bottom: 12px;
`;
const ProgressTrack = styled.View`
	height: 3px;
	margin-top: 22px;
	background-color: #eef1e8;
`;
const ProgressFill = styled.View<{ $percent: number }>`
	height: 3px;
	width: ${({ $percent }) => $percent}%;
	background-color: #95ac7d;
`;
const Summary = styled.View`
	flex-direction: row;
	flex-wrap: wrap;
	gap: 12px;
	padding: 13px 24px;
	background-color: #fafbf7;
	border-bottom-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
`;
const Jobs = styled.ScrollView.attrs({
	contentContainerStyle: { paddingVertical: 6, paddingHorizontal: 24 },
})`
	max-height: 110px;
	flex-grow: 0;
	flex-shrink: 0;
`;
const JobButton = styled.Pressable<{ $active: boolean }>`
	flex-direction: row;
	align-items: center;
	gap: 10px;
	padding: 8px;
	border-radius: 3px;
	background-color: ${({ $active, theme }) => ($active ? theme.colors.selected : "transparent")};
`;
const JobName = styled(BodyText)`
	flex: 1;
	min-width: 0px;
	font-size: 11px;
`;
const Command = styled(MonoText)`
	padding: 14px 24px;
	background-color: #223126;
	color: #9bae8f;
	font-size: 9px;
	line-height: 16px;
`;
const Results = styled.ScrollView.attrs({
	contentContainerStyle: { paddingVertical: 10, paddingHorizontal: 24 },
})`
	max-height: 150px;
	flex-grow: 0;
	flex-shrink: 0;
	background-color: #f8faf5;
`;
const ResultRow = styled.View`
	flex-direction: row;
	align-items: center;
	gap: 10px;
	padding: 6px 0px;
`;
const ResultMessage = styled(MonoText)`
	font-size: 10px;
	color: ${({ theme }) => theme.colors.danger};
`;
const Meta = styled.View`
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px 24px;
`;
const ArtifactPath = styled(Caption)`
	flex: 1;
	min-width: 0px;
	font-size: 9px;
`;

export const RunInspector = observer(function RunInspector() {
	const run = studioStore.run;
	if (!run) return <EmptyState description="Loading run…" />;
	const job =
		run.jobs.find((job) => job.id === studioStore.jobId) ??
		run.jobs.find((job) => job.status === "running") ??
		run.jobs[0];
	if (!job) return <EmptyState description="No files in this run." />;
	const results = run.jobs.flatMap((job) => job.results);
	const counts = (status: string) => results.filter((result) => result.status === status).length;
	const completed = run.jobs.filter((job) => !["queued", "running"].includes(job.status)).length;
	const failed = run.jobs.filter((job) => job.status === "failed");
	return (
		<>
			<InspectorHeading>
				<BackRow>
					<Button compact variant="quiet" onPress={studioStore.showFiles}>
						← Back to tests
					</Button>
				</BackRow>
				<Overline>
					<Badge status={run.status}>{run.status.toUpperCase()}</Badge>
					<Caption>{new Date(run.startedAt).toLocaleTimeString()}</Caption>
					{!run.finishedAt && <Caption>● LIVE</Caption>}
				</Overline>
				<TitleRow>
					<HeadingText>{runName(run)}</HeadingText>
					<Actions>
						{!run.finishedAt ? (
							<Button compact onPress={() => void studioStore.stop()}>
								■ Stop
							</Button>
						) : (
							<>
								<Button
									compact
									disabled={studioStore.busy}
									onPress={() =>
										void studioStore.start(run.jobs.map((job) => job.selection))
									}
								>
									↻ Rerun
								</Button>
								{!!failed.length && (
									<Button
										compact
										disabled={studioStore.busy}
										onPress={() =>
											void studioStore.start(
												failed.map((job) => job.selection),
											)
										}
									>
										Rerun failed
									</Button>
								)}
							</>
						)}
					</Actions>
				</TitleRow>
			</InspectorHeading>
			<ProgressTrack
				accessibilityRole="progressbar"
				accessibilityLabel="Run progress"
				aria-valuemin={0}
				aria-valuemax={run.jobs.length}
				aria-valuenow={completed}
			>
				<ProgressFill $percent={(completed / run.jobs.length) * 100} />
			</ProgressTrack>
			<Summary accessibilityLiveRegion="polite">
				<StatusText $status="passed">✓ {counts("passed")} passed</StatusText>
				<StatusText $status="failed">{counts("failed")} failed</StatusText>
				<Caption>{counts("skipped")} skipped</Caption>
				<Caption>
					{completed}/{run.jobs.length} files
				</Caption>
				{!!failed.length && (
					<StatusText $status="failed">{failed.length} files failed</StatusText>
				)}
				<Caption>{duration((run.finishedAt ?? Date.now()) - run.startedAt)}</Caption>
			</Summary>
			<Jobs>
				{run.jobs.map((item) => (
					<JobButton
						key={item.id}
						accessibilityRole="button"
						accessibilityLabel={`${item.status} ${item.file.path}`}
						aria-selected={item.id === job.id}
						$active={item.id === job.id}
						onPress={() => studioStore.selectJob(item.id)}
					>
						<StatusText $status={item.status}>{item.status}</StatusText>
						<JobName numberOfLines={1}>{item.file.path}</JobName>
						<Caption>
							{item.finishedAt && item.startedAt
								? duration(item.finishedAt - item.startedAt)
								: ""}
						</Caption>
					</JobButton>
				))}
			</Jobs>
			<Command selectable>
				{job.command || "Waiting in queue…"}
				{"\n"}cwd: {job.file.cwd}
			</Command>
			<LiveOutput
				jobId={job.id}
				output={
					job.output ||
					(job.status === "queued"
						? "Waiting for the previous file to finish…"
						: "Waiting for runner output…")
				}
			/>
			{!!job.results.length && (
				<Results>
					{job.results.map((result, index) => (
						<Fragment key={index}>
							<ResultRow>
								<StatusText $status={result.status}>
									{result.status === "passed"
										? "✓"
										: result.status === "failed"
											? "×"
											: "−"}
								</StatusText>
								<JobName>{result.name}</JobName>
								<Caption>{duration(result.duration)}</Caption>
							</ResultRow>
							{!!result.message && (
								<ResultMessage selectable>{result.message}</ResultMessage>
							)}
						</Fragment>
					))}
				</Results>
			)}
			<Meta>
				<ArtifactPath selectable numberOfLines={1}>
					Reports: {run.artifactDir}
				</ArtifactPath>
				<Caption>
					{job.exitCode !== undefined ? `Exit ${job.exitCode ?? "signal"}` : ""}
				</Caption>
			</Meta>
		</>
	);
});
