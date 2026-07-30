import * as path from 'path';
import * as core from '@actions/core';
import * as github from '@actions/github';
import Reporter from '../src/Reporter';
import { IDacpacActionInputs, ActionType, SqlPackageAction, IActionResult } from '../src/AzureSqlAction';
import { SUMMARY_MARKER } from '../src/DeploymentSummary';
import SqlConnectionConfig from '../src/SqlConnectionConfig';

jest.mock('@actions/core');
jest.mock('@actions/github');

describe('Reporter tests', () => {

    const reportFixturePath = path.join(__dirname, '..', '__testdata__', 'deployReport.xml');

    const inputs: IDacpacActionInputs = {
        actionType: ActionType.DacpacAction,
        connectionConfig: new SqlConnectionConfig('Server=testServer.database.windows.net;Initial Catalog=testDB;User Id=testUser;Password=placeholder'),
        filePath: './Database.dacpac',
        sqlpackageAction: SqlPackageAction.Publish,
        skipFirewallCheck: true
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (core as any).summary = { addRaw: jest.fn().mockReturnThis(), write: jest.fn().mockResolvedValue(undefined) };
        (github as any).context = { payload: { pull_request: { number: 42 } }, repo: { owner: 'octo', repo: 'sql-action' } };
        (core.getInput as jest.Mock).mockReturnValue('');
    });

    /** Sets the value returned for each named action input. */
    function mockInputs(values: Record<string, string>): void {
        (core.getInput as jest.Mock).mockImplementation((name: string) => values[name] ?? '');
    }

    /** Builds a mock Octokit whose listComments returns the supplied comments. */
    function mockOctokit(comments: Array<{ id: number, body: string }>): any {
        const octokit = {
            rest: {
                issues: {
                    listComments: jest.fn().mockResolvedValue({ data: comments }),
                    createComment: jest.fn().mockResolvedValue({}),
                    updateComment: jest.fn().mockResolvedValue({})
                }
            },
            paginate: jest.fn().mockResolvedValue(comments)
        };
        (github.getOctokit as jest.Mock).mockReturnValue(octokit);
        return octokit;
    }

    it('writes the job summary when summary is enabled', async () => {
        mockInputs({ summary: 'true', 'comment-pr': 'off' });

        await Reporter.report(inputs, {});

        expect(core.summary.addRaw).toHaveBeenCalled();
        expect(core.summary.write).toHaveBeenCalled();
    });

    it('does not write the job summary when summary is disabled', async () => {
        mockInputs({ summary: 'false', 'comment-pr': 'off' });

        await Reporter.report(inputs, {});

        expect(core.summary.addRaw).not.toHaveBeenCalled();
    });

    it('sets the change outputs from the deployment report', async () => {
        mockInputs({ summary: 'true', 'comment-pr': 'off' });
        const result: IActionResult = { reportPath: reportFixturePath };

        await Reporter.report(inputs, result);

        expect(core.setOutput).toHaveBeenCalledWith('changes-detected', 'true');
        expect(core.setOutput).toHaveBeenCalledWith('objects-changed', '4');
    });

    it('does not set the change outputs when no report was captured', async () => {
        mockInputs({ summary: 'true', 'comment-pr': 'off' });

        await Reporter.report(inputs, {});

        expect(core.setOutput).not.toHaveBeenCalledWith('changes-detected', expect.anything());
        expect(core.setOutput).not.toHaveBeenCalledWith('objects-changed', expect.anything());
    });

    it('redacts secret-looking additional arguments from the summary', async () => {
        mockInputs({ summary: 'true', 'comment-pr': 'off' });

        await Reporter.report({ ...inputs, additionalArguments: '/TargetPassword:hunter2' }, {});

        const markdown = (core.summary.addRaw as jest.Mock).mock.calls[0][0];
        expect(markdown).toContain('[redacted]');
        expect(markdown).not.toContain('hunter2');
    });

    it('falls back to the default when the summary value is unrecognized', async () => {
        mockInputs({ summary: 'yes', 'comment-pr': 'off' });

        await Reporter.report(inputs, {});

        expect(core.summary.addRaw).toHaveBeenCalled();
    });

    it('creates a new comment when none exists', async () => {
        mockInputs({ summary: 'false', 'comment-pr': 'auto', 'github-token': 'token' });
        const octokit = mockOctokit([]);

        await Reporter.report(inputs, {});

        expect(github.getOctokit).toHaveBeenCalledWith('token');
        expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 42 }));
        expect(octokit.rest.issues.updateComment).not.toHaveBeenCalled();
    });

    it('updates the existing comment when the marker is found', async () => {
        mockInputs({ summary: 'false', 'comment-pr': 'auto', 'github-token': 'token' });
        const octokit = mockOctokit([{ id: 7, body: `previous summary\n${SUMMARY_MARKER}` }]);

        await Reporter.report(inputs, {});

        expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith(expect.objectContaining({ comment_id: 7 }));
        expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
    });

    it('does not comment when comment-pr is off', async () => {
        mockInputs({ summary: 'true', 'comment-pr': 'off' });

        await Reporter.report(inputs, {});

        expect(github.getOctokit).not.toHaveBeenCalled();
    });

    it('skips the comment when no token is available', async () => {
        mockInputs({ summary: 'false', 'comment-pr': 'auto', 'github-token': '' });

        await Reporter.report(inputs, {});

        expect(github.getOctokit).not.toHaveBeenCalled();
        expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('no github-token'));
    });

    it('skips the comment when the run is not a pull request', async () => {
        (github as any).context = { payload: {}, repo: { owner: 'octo', repo: 'sql-action' } };
        mockInputs({ summary: 'false', 'comment-pr': 'auto', 'github-token': 'token' });

        await Reporter.report(inputs, {});

        expect(github.getOctokit).not.toHaveBeenCalled();
    });

    it('warns without throwing when the comment API fails', async () => {
        mockInputs({ summary: 'false', 'comment-pr': 'auto', 'github-token': 'token' });
        (github.getOctokit as jest.Mock).mockReturnValue({
            rest: { issues: { listComments: jest.fn() } },
            paginate: jest.fn().mockRejectedValue(new Error('forbidden'))
        });

        await expect(Reporter.report(inputs, {})).resolves.toBeUndefined();
        expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('pull-requests: write'));
    });
});
