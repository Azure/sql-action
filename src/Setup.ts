// This file is run before main.js to setup the tools that the action depends on
// https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions#runspre

import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import { Octokit } from 'octokit';

export const sqlcmdToolName = 'go-sqlcmd';
export const sqlcmdFallbackVersion = '0.13.0';

export default class Setup {
    
    /**
     * Ensures go-sqlcmd is in the runner's tool cache and PATH environment variable.
     */
    public static async setupSqlcmd(sqlcmdSelectedVersion: string): Promise<void> {
        // Get sqlcmd versions from tool cache and find the latest version that satisfies the version range

        let sqlcmdVersion: string = sqlcmdSelectedVersion;
        // TODO parse sqlcmdSelectedVersion to validate its a version number

        if (sqlcmdVersion === "latest") {
            sqlcmdVersion = await this.getSqlCmdLatestReleaseInfo();
        }
        let sqlcmdPath = tc.find(sqlcmdToolName, sqlcmdVersion);
        // if not found, download it and add to tool cache
        if (!sqlcmdPath) {
            const extractedPath = await this.downloadAndExtractSqlcmd(sqlcmdVersion);
            sqlcmdPath = await tc.cacheDir(extractedPath, sqlcmdToolName, sqlcmdVersion);
        }

        // Add sqlcmd to PATH
        core.addPath(sqlcmdPath);
    }

    /**
     * Downloads go-sqlcmd release from GitHub and extracts from the compressed file.
     * @returns The path to the extracted file.
     */
    private static async downloadAndExtractSqlcmd(sqlcmdVersion: string): Promise<string> {

        // node returns win32, linux, darwin but go-sqlcmd uses windows, linux, darwin
        const platform = process.platform === 'win32' ? 'windows' : process.platform;
        const fileextension = process.platform === 'win32' ? 'zip' : 'tar.bz2';

        let downloadPath: string = await tc.downloadTool(`https://github.com/microsoft/go-sqlcmd/releases/download/v${sqlcmdVersion}/sqlcmd-v${sqlcmdVersion}-${platform}-${process.arch}.${fileextension}`);

        switch (process.platform) {
            case 'linux':
                return await tc.extractTar(downloadPath, undefined, 'xj');
            case 'win32':
                return await tc.extractZip(downloadPath);
    
            default:
                throw new Error(`Runner OS is not supported: ${process.platform}`);
        }
    }

    /**
     * Identifies the latest release of go-sqlcmd from the GitHub releases matching
     * the pipeline's OS and architecture.
     * @returns The version number for the latest release.
     */
    private static async getSqlCmdLatestReleaseInfo(): Promise<string> {
        const octokit = new Octokit({userAgent: "azure/sql-action"});
        const release = await octokit.rest.repos.getLatestRelease({
            owner: "microsoft",
            repo: "go-sqlcmd"
        });
        if (release.status !== 200) {
            core.warning(`Failed to get latest go-sqlcmd release: ${release.status}`);
            return sqlcmdFallbackVersion;
        }

        // convert v0.13.0 to 0.13.0
        const versionNumber = release.data.tag_name.substring(1);
        return versionNumber;
    }

}
