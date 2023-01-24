// This file is run before main.js to setup the tools that the action depends on
// https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions#runspre

import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import { Octokit } from 'octokit';

export const sqlcmdToolName = 'go-sqlcmd';
export const sqlcmdVersionMin = '^0.9.1';

export default class Setup {
    
    /**
     * Ensures go-sqlcmd is in the runner's tool cache and PATH environment variable.
     */
    public static async setupSqlcmd(): Promise<void> {
        // Get sqlcmd versions from tool cache and find the latest version that satisfies the minimum version
        const sqlcmdVersions = tc.findAllVersions(sqlcmdToolName);
        let sqlcmdVersion: string;
        let sqlcmdPath: string = "";
        if (sqlcmdVersions.length > 0) {
            sqlcmdVersion = tc.evaluateVersions(sqlcmdVersions, sqlcmdVersionMin);
            if (sqlcmdVersion) {
                sqlcmdPath = tc.find(sqlcmdToolName, sqlcmdVersion);
            } 
        }

        // Get sqlcmd from tool cache; if not found, download it and add to tool cache
        if (sqlcmdPath === "") {
            const extractedSqlCmd = await this.downloadAndExtractSqlcmd();
            sqlcmdPath = await tc.cacheDir(extractedSqlCmd[0], sqlcmdToolName, extractedSqlCmd[1]);
        }
        
        // Add sqlcmd to PATH
        core.addPath(sqlcmdPath);
    }

    /**
     * Downloads go-sqlcmd release from GitHub and extracts from the compressed file.
     * @returns The path to the extracted file.
     */
    private static async downloadAndExtractSqlcmd(): Promise<[string, string]> {
        // Get latest download link and version for go-sqlcmd
        let downloadInfo: [string, string] = await this.getSqlCmdLatestReleaseInfo();
        let downloadPath: string = await tc.downloadTool(downloadInfo[0]);

        switch (process.platform + "-" + process.arch) {
            case 'linux-x64':
                return [await tc.extractTar(downloadPath, undefined, 'xj'), downloadInfo[1]];
            case 'linux-arm64': // runners not yet available
                return [await tc.extractTar(downloadPath, undefined, 'xj'), downloadInfo[1]];
            case 'win32-x64':
                return [await tc.extractZip(downloadPath), downloadInfo[1]];
            case 'win32-arm64': // runners not yet available
                return [await tc.extractZip(downloadPath), downloadInfo[1]];
    
            default:
                throw new Error(`Runner OS is not supported: ${process.platform}`);
        }
    }

    /**
     * Identifies the latest release of go-sqlcmd from the GitHub releases matching
     * the pipeline's OS and architecture.
     * @returns The download URL for the latest release.
     */
    private static async getSqlCmdLatestReleaseInfo(): Promise<[string, string]> {
        const octokit = new Octokit({userAgent: "azure/sql-action"});
        const release = await octokit.rest.repos.getReleaseByTag({
            owner: "microsoft",
            repo: "go-sqlcmd",
            tag: "latest"
        });
        if (release.status !== 200) {
            throw new Error(`Failed to get latest go-sqlcmd release: ${release.status}`);
        }

        // node returns win32, linux, darwin but go-sqlcmd uses windows, linux, darwin
        const platform = process.platform === 'win32' ? 'windows' : process.platform;
        const fileextension = process.platform === 'win32' ? 'zip' : 'tar.bz2';
        const filename = `${platform}-${process.arch}.${fileextension}`;

        const releaseAsset = release.data.assets.find(asset => {
            return asset.name.includes(filename);
        });
        if (!releaseAsset) {
            throw new Error(`No release found for OS: ${process.platform}, arch: ${process.arch}`);
        }
        return [releaseAsset.browser_download_url, ''];
    }

}
