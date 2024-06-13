// This file is run before main.js to setup the tools that the action depends on
// https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions#runspre

import * as core from '@actions/core';
import { HttpClient } from '@actions/http-client';
import * as tc from '@actions/tool-cache';
import * as path from 'path';
import uuidV4 from 'uuid/v4';

export const sqlcmdToolName = 'go-sqlcmd';
export const sqlcmdDownloadUrl = 'https://github.com/microsoft/go-sqlcmd/releases/latest';
export const sqlcmdFallbackVersion = '1.6.0';

export default class Setup {
    
    /**
     * Ensures go-sqlcmd is in the runner's tool cache and PATH environment variable.
     */
    public static async setupSqlcmd(): Promise<void> {

        // Determine latest version or use fallback version
        let sqlcmdVersion = await this.extractVersionFromLatestRelease(sqlcmdDownloadUrl);
        if (sqlcmdVersion) {
            core.debug(`Using latest go-sqlcmd version: ${sqlcmdVersion}`);
        } else {
            sqlcmdVersion = sqlcmdFallbackVersion;
            core.debug(`Failed to get latest go-sqlcmd version. Using fallback version: ${sqlcmdVersion}`);
        }

        // Get sqlcmd from tool cache; if not found, download it and add to tool cache
        let sqlcmdPath = tc.find(sqlcmdToolName, sqlcmdVersion);
        if (!sqlcmdPath) {
            const extractedPath = await this.downloadAndExtractSqlcmd(sqlcmdVersion);
            sqlcmdPath = await tc.cacheDir(extractedPath, sqlcmdToolName, sqlcmdVersion);
        }
        
        // Add sqlcmd to PATH
        core.addPath(sqlcmdPath);
    }

    /**
     * Gets the version number from the latest release based on the redirected URL.
     * @returns The version number or undefined if the version could not be parsed or HTTP request failed.
     */
    public static async extractVersionFromLatestRelease(releaseUrl: string): Promise<string | undefined> {
        const http = new HttpClient('Azure/sql-action');
        const response = await http.head(releaseUrl);
        // Should be redirected to something like https://github.com/microsoft/go-sqlcmd/releases/tag/v1.6.0
        const location = response.message.headers.location;
        if (location) {
            // Return the last bit with v prefix removed
            return location.split('/').pop()?.slice(1);
        }

        return undefined;
    }

    /**
     * Downloads go-sqlcmd release from GitHub and extracts from the compressed file.
     * @returns The path to the extracted file.
     */
    private static async downloadAndExtractSqlcmd(sqlcmdVersion: string): Promise<string> {
        let downloadPath: string;
        switch (process.platform) {
            case 'linux':
                downloadPath = await tc.downloadTool(`https://github.com/microsoft/go-sqlcmd/releases/download/v${sqlcmdVersion}/sqlcmd-v${sqlcmdVersion}-linux-x64.tar.bz2`);
                return await tc.extractTar(downloadPath, undefined, 'xj');
    
            case 'win32':
                // forcing a .zip extension on the downloaded item due to inconsistent windows behavior in unzipping files with no extension
                // upstream issue: https://github.com/actions/toolkit/issues/1179
                const dest = path.join(process.env['RUNNER_TEMP'] || '', uuidV4()+'.zip');
                downloadPath = await tc.downloadTool(`https://github.com/microsoft/go-sqlcmd/releases/download/v${sqlcmdVersion}/sqlcmd-v${sqlcmdVersion}-windows-x64.zip`, dest);
                return await tc.extractZip(downloadPath);
    
            default:
                throw new Error(`Runner OS is not supported: ${process.platform}`);
        }
    }
}
