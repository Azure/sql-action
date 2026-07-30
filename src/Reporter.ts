import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import * as github from '@actions/github';

import { IActionInputs, IActionResult, IDacpacActionInputs, ActionType, SqlPackageAction } from './AzureSqlAction';
import { parseDeploymentReport, DeploymentReport } from './DeploymentReport';
import { buildSummary, SummaryContext, SUMMARY_MARKER } from './DeploymentSummary';

/** How the sticky pull request comment should be posted. */
type CommentMode = 'off' | 'auto' | 'always';

/** Resolved reporting configuration read from the action inputs. */
interface IReportingOptions {
    /** Whether to write the GitHub Actions job summary. */
    summary: boolean;
    /** Whether and when to post the sticky pull request comment. */
    commentPr: CommentMode;
    /** Token used to authenticate the pull request comment, if provided. */
    githubToken?: string;
}

/**
 * Turns the deployment report and script captured during a run into a readable
 * summary, and publishes it to the job summary and (optionally) a sticky pull
 * request comment. Reporting is best-effort: any failure is surfaced as a warning
 * and never fails the deployment.
 */
export default class Reporter {

    /**
     * Publishes the deployment summary for a completed, successful action.
     * @param inputs The inputs the action executed with.
     * @param result The report/script paths captured during execution, if any.
     */
    public static async report(inputs: IActionInputs, result: IActionResult): Promise<void> {
        try {
            const options = this._getReportingOptions();
            if (!options.summary && options.commentPr === 'off') {
                return;
            }

            const safeResult = result || {};
            const context = this._buildContext(inputs, safeResult);
            const markdown = buildSummary(context);

            this._setOutputs(context, safeResult);

            if (options.summary) {
                await core.summary.addRaw(markdown).write();
            }

            if (options.commentPr !== 'off') {
                await this._upsertPullRequestComment(markdown, options);
            }
        }
        catch (error) {
            core.warning(`Unable to generate deployment summary: ${error.message}`);
        }
    }

    /**
     * Reads and validates the reporting-related action inputs, applying defaults.
     */
    private static _getReportingOptions(): IReportingOptions {
        const commentPrRaw = (core.getInput('comment-pr') || 'auto').trim().toLowerCase();
        const commentPr: CommentMode = commentPrRaw === 'off' || commentPrRaw === 'always' ? commentPrRaw : 'auto';

        return {
            summary: this._getBooleanInput('summary', true),
            commentPr,
            githubToken: core.getInput('github-token') || undefined
        };
    }

    /**
     * Reads a boolean input, returning the default when the input is empty or
     * unrecognized. Unlike core.getBooleanInput, this does not throw on an empty
     * or unexpected value.
     */
    private static _getBooleanInput(name: string, defaultValue: boolean): boolean {
        const raw = core.getInput(name).trim().toLowerCase();
        if (raw === 'true') {
            return true;
        }
        if (raw === 'false') {
            return false;
        }
        return defaultValue;
    }

    /**
     * Assembles the summary context from the inputs and any captured artifacts.
     */
    private static _buildContext(inputs: IActionInputs, result: IActionResult): SummaryContext {
        const context = github.context;
        return {
            action: this._actionLabel(inputs),
            source: path.basename(inputs.filePath),
            server: inputs.connectionConfig.Server,
            database: inputs.connectionConfig.Database,
            report: this._readReport(result.reportPath),
            script: this._readScript(result.scriptPath),
            durationMs: result.durationMs,
            options: this._redactSecrets(inputs.additionalArguments),
            actor: context.actor || undefined,
            commit: context.sha ? context.sha.substring(0, 7) : undefined,
            runUrl: this._buildRunUrl(context)
        };
    }

    /**
     * Builds a link to the current workflow run, or undefined when unavailable.
     */
    private static _buildRunUrl(context: typeof github.context): string | undefined {
        if (!context.runId) {
            return undefined;
        }
        const serverUrl = context.serverUrl || 'https://github.com';
        return `${serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
    }

    /**
     * Redacts additional arguments that may contain secrets before they are
     * rendered into the summary or a pull request comment, neither of which is
     * covered by GitHub secret masking.
     */
    private static _redactSecrets(args?: string): string | undefined {
        if (args && /password|pwd|secret|token/i.test(args)) {
            return '[redacted]';
        }
        return args;
    }

    /**
     * Returns a human-readable label for the action that ran.
     */
    private static _actionLabel(inputs: IActionInputs): string {
        if (inputs.actionType === ActionType.SqlAction) {
            return 'SQL script';
        }
        const dacpacInputs = inputs as IDacpacActionInputs;
        return SqlPackageAction[dacpacInputs.sqlpackageAction];
    }

    /**
     * Reads and parses the deployment report file, if it exists.
     */
    private static _readReport(reportPath?: string): DeploymentReport | undefined {
        if (!reportPath || !fs.existsSync(reportPath)) {
            return undefined;
        }
        try {
            return parseDeploymentReport(fs.readFileSync(reportPath, 'utf8'));
        }
        catch (error) {
            core.debug(`Unable to read deployment report at ${reportPath}: ${error.message}`);
            return undefined;
        }
    }

    /**
     * Reads the deployment script file, if it exists.
     */
    private static _readScript(scriptPath?: string): string | undefined {
        if (!scriptPath || !fs.existsSync(scriptPath)) {
            return undefined;
        }
        try {
            return fs.readFileSync(scriptPath, 'utf8');
        }
        catch (error) {
            core.debug(`Unable to read deployment script at ${scriptPath}: ${error.message}`);
            return undefined;
        }
    }

    /**
     * Publishes the action outputs describing the deployment.
     */
    private static _setOutputs(context: SummaryContext, result: IActionResult): void {
        if (context.report) {
            const operations = context.report.operations;
            core.setOutput('changes-detected', operations.length > 0 ? 'true' : 'false');
            core.setOutput('objects-changed', operations.length.toString());
        }

        if (result.reportPath) {
            core.setOutput('deployment-report-path', result.reportPath);
        }
        if (result.scriptPath) {
            core.setOutput('deployment-script-path', result.scriptPath);
        }
    }

    /**
     * Creates or updates the single sticky pull request comment for this action.
     * No-ops with a debug or warning message when there is no pull request, no
     * token, or insufficient permissions.
     */
    private static async _upsertPullRequestComment(markdown: string, options: IReportingOptions): Promise<void> {
        const pullRequestNumber = github.context.payload.pull_request && github.context.payload.pull_request.number;
        if (!pullRequestNumber) {
            if (options.commentPr === 'always') {
                core.warning('comment-pr is set but this run is not a pull request; skipping deployment summary comment.');
            } else {
                core.debug('Not a pull request event; skipping deployment summary comment.');
            }
            return;
        }

        if (!options.githubToken) {
            core.warning('comment-pr is enabled but no github-token was provided; skipping deployment summary comment.');
            return;
        }

        try {
            const octokit = github.getOctokit(options.githubToken);
            const { owner, repo } = github.context.repo;

            const existingCommentId = await this._findExistingComment(octokit, owner, repo, pullRequestNumber);
            if (existingCommentId) {
                await octokit.rest.issues.updateComment({ owner, repo, comment_id: existingCommentId, body: markdown });
            } else {
                await octokit.rest.issues.createComment({ owner, repo, issue_number: pullRequestNumber, body: markdown });
            }
        }
        catch (error) {
            core.warning(`Unable to post deployment summary comment (ensure the workflow grants 'pull-requests: write'): ${error.message}`);
        }
    }

    /**
     * Finds the id of a previously posted summary comment by its hidden marker.
     */
    private static async _findExistingComment(octokit: ReturnType<typeof github.getOctokit>, owner: string, repo: string, issueNumber: number): Promise<number | undefined> {
        const comments = await octokit.paginate(octokit.rest.issues.listComments, { owner, repo, issue_number: issueNumber, per_page: 100 });
        const existing = comments.find(comment => !!comment.body && comment.body.includes(SUMMARY_MARKER));
        return existing ? existing.id : undefined;
    }
}
