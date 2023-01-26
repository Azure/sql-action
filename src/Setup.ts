// This file is run before main.js to setup the tools that the action depends on
// https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions#runspre

import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';

export const sqlcmdToolName = 'go-sqlcmd';
export const sqlcmdVersionRange = '^0.11.0';
export const sqlcmdFallbackVersion = '0.11.0';

export default class Setup {
    
    /**
     * Ensures go-sqlcmd is in the runner's tool cache and PATH environment variable.
     */
    public static async setupSqlcmd(): Promise<void> {
        // Get sqlcmd versions from tool cache and find the latest version that satisfies the version range
        const sqlcmdVersions = tc.findAllVersions(sqlcmdToolName);
        let sqlcmdVersion: string;
        let sqlcmdPath: string = "";
        if (sqlcmdVersions.length > 0) {
            sqlcmdVersion = tc.evaluateVersions(sqlcmdVersions, sqlcmdVersionRange);
            if (sqlcmdVersion) {
                sqlcmdPath = tc.find(sqlcmdToolName, sqlcmdVersion);
            } 
        }

        // if not found, download it and add to tool cache
        if (sqlcmdPath === "") {
            const extractedSqlCmd = await this.downloadAndExtractSqlcmd();
            sqlcmdPath = await tc.cacheDir(extractedSqlCmd, sqlcmdToolName, sqlcmdFallbackVersion);
        }
        
        // Add sqlcmd to PATH
        core.addPath(sqlcmdPath);
    }

    /**
     * Downloads go-sqlcmd release from GitHub and extracts from the compressed file.
     * @returns The path to the extracted file.
     */
    private static async downloadAndExtractSqlcmd(): Promise<string> {
        // Get latest download link and version for go-sqlcmd

        // node returns win32, linux, darwin but go-sqlcmd uses windows, linux, darwin
        const platform = process.platform === 'win32' ? 'windows' : process.platform;
        const fileextension = process.platform === 'win32' ? 'zip' : 'tar.bz2';

        let downloadPath: string = await tc.downloadTool(`https://github.com/microsoft/go-sqlcmd/releases/download/v${sqlcmdFallbackVersion}/sqlcmd-v${sqlcmdFallbackVersion}-${platform}-${process.arch}.${fileextension}`);

        switch (process.platform) {
            case 'linux':
                return await tc.extractTar(downloadPath, undefined, 'xj');
            case 'win32':
                return await tc.extractZip(downloadPath);
    
            default:
                throw new Error(`Runner OS is not supported: ${process.platform}`);
        }
    }

}
