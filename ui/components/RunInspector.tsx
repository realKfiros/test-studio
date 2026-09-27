import ArrowLeft from "lucide-react-native/icons/arrow-left";
import Square from "lucide-react-native/icons/square";
import RotateCw from "lucide-react-native/icons/rotate-cw";
import Code2 from "lucide-react-native/icons/code-xml";
import { Fragment, useEffect, useState } from "react";
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
import { FailureCodeView } from "./FailureCodeView";

const BackRow = styled.View`
	align-items: flex-start;
	margin-bottom: 12px;
`;
const ProgressTrack = styled.View`
	height: 2px;
	margin-top: 16px;
	background-color: ${({ theme }) => theme.colors.border};
`;
const ProgressFill = styled.View<{ $percent: number }>`
	height: 2px;
	width: ${({ $percent }) => $percent}%;
	background-color: ${({ theme }) => theme.colors.success};
`;
const Summary = styled.View`
	flex-direction: row;
	flex-wrap: wrap;
	gap: 12px;
	padding: 10px 24px;
	background-color: ${({ theme }) => theme.colors.surface};
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
	font-size: 12px;
`;
const Command = styled(MonoText)`
	padding: 10px 24px;
	background-color: ${({ theme }) => theme.colors.terminal};
	color: ${({ theme }) => theme.colors.muted};
	font-size: 11px;
	line-height: 16px;
`;
const Results = styled.ScrollView.attrs({
	contentContainerStyle: { paddingVertical: 10, paddingHorizontal: 24 },
})`
	max-height: 180px;
	flex-grow: 0;
	flex-shrink: 0;
	background-color: ${({ theme }) => theme.colors.surface};
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
const OutputTabs = styled.View`
	flex-direction: row;
	gap: 20px;
	padding: 0px 24px;
	border-bottom-width: 1px;
	border-color: ${({ theme }) => theme.colors.border};
`;
const OutputTab = styled.Pressable<{ $active: boolean }>`
	padding: 9px 0px;
	border-bottom-width: 2px;
	border-bottom-color: ${({ $active, theme }) => ($active ? theme.colors.accent : "transparent")};
`;
const OutputTabLabel = styled(BodyText)<{ $active: boolean }>`
	font-size: 12px;
	color: ${({ $active, theme }) => ($active ? theme.colors.secondaryText : theme.colors.muted)};
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
	font-size: 11px;
`;

function RunClock({ startedAt, finishedAt }: { startedAt: number; finishedAt?: number }) {
	const [now, setNow] = useState(Date.now);

	useEffect(() => {
		if (finishedAt) return;
		const timer = setInterval(() => setNow(Date.now()), 100);
		return () => clearInterval(timer);
	}, [finishedAt]);

	return <Caption>{duration((finishedAt ?? now) - startedAt)}</Caption>;
}

export const RunInspector = observer(function RunInspector() {
	const run = studioStore.run;
	if (!run) return <EmptyState description="Loading run…" />;
	const job = studioStore.currentJob;
	if (!job) return <EmptyState description="No files in this run." />;
	const results = run.jobs.flatMap((job) => job.results);
	const counts = (status: string) => results.filter((result) => result.status === status).length;
	const completed = run.jobs.filter((job) => !["queued", "running"].includes(job.status)).length;
	const failed = run.jobs.filter((job) => job.status === "failed");
	const firstFailure = job.results.findIndex((result) => result.status === "failed");
	const selectedFailure =
		studioStore.failureIndex !== null &&
		job.results[studioStore.failureIndex]?.status === "failed"
			? studioStore.failureIndex
			: firstFailure;
	const codeOpen = studioStore.runPanel === "code" && selectedFailure >= 0;
	return (
		<>
			<InspectorHeading>
				<BackRow>
					<Button
						icon={ArrowLeft}
						compact
						variant="quiet"
						onPress={studioStore.showFiles}
					>
						Back to tests
					</Button>
				</BackRow>
				<Overline>
					<Badge status={run.status}>{run.status}</Badge>
					<Caption>{new Date(run.startedAt).toLocaleTimeString()}</Caption>
					{!run.finishedAt && <StatusText $status="running">Live</StatusText>}
				</Overline>
				<TitleRow>
					<HeadingText>{runName(run)}</HeadingText>
					<Actions>
						{!run.finishedAt ? (
							<Button icon={Square} compact onPress={() => void studioStore.stop()}>
								Stop
							</Button>
						) : (
							<>
								<Button
									icon={RotateCw}
									compact
									disabled={studioStore.busy}
									onPress={() =>
										void studioStore.start(run.jobs.map((job) => job.selection))
									}
								>
									Rerun
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
				<RunClock key={run.id} startedAt={run.startedAt} finishedAt={run.finishedAt} />
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
			{firstFailure >= 0 && (
				<OutputTabs accessibilityRole="tablist" accessibilityLabel="Run details">
					{(["output", "code"] as const).map((panel) => (
						<OutputTab
							key={panel}
							accessibilityRole="tab"
							aria-selected={codeOpen ? panel === "code" : panel === "output"}
							$active={codeOpen ? panel === "code" : panel === "output"}
							onPress={() => studioStore.setRunPanel(panel)}
						>
							<OutputTabLabel
								$active={codeOpen ? panel === "code" : panel === "output"}
							>
								{panel === "code" ? "Code" : "Output"}
							</OutputTabLabel>
						</OutputTab>
					))}
				</OutputTabs>
			)}
			{codeOpen ? (
				<FailureCodeView job={job} result={job.results[selectedFailure]} />
			) : (
				<LiveOutput
					jobId={job.id}
					output={
						job.output ||
						(job.status === "queued"
							? "Waiting for the previous file to finish…"
							: "Waiting for runner output…")
					}
				/>
			)}
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
								{result.status === "failed" && (
									<Button
										icon={Code2}
										compact
										variant="quiet"
										onPress={() => studioStore.openFailure(index)}
									>
										Code
									</Button>
								)}
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
