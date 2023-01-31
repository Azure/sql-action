// This file is run before main.js to setup the tools that the action depends on
// https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions#runspre

import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';

export const sqlcmdToolName = 'go-sqlcmd';
export const sqlcmdVersion = '0.12.0';

export default class Setup {
    
    /**
     * Ensures go-sqlcmd is in the runner's tool cache and PATH environment variable.
     */
    public static async setupSqlcmd(): Promise<void> {
        // Get sqlcmd from tool cache; if not found, download it and add to tool cache
        let sqlcmdPath = tc.find(sqlcmdToolName, sqlcmdVersion);
        if (!sqlcmdPath) {
            const extractedPath = await this.downloadAndExtractSqlcmd();
            sqlcmdPath = await tc.cacheDir(extractedPath, sqlcmdToolName, sqlcmdVersion);
        }
        
        // Add sqlcmd to PATH
        core.addPath(sqlcmdPath);
    }

    /**
     * Downloads go-sqlcmd release from GitHub and extracts from the compressed file.
     * @returns The path to the extracted file.
     */
    private static async downloadAndExtractSqlcmd(): Promise<string> {
        let downloadPath: string;
        switch (process.platform) {
            case 'linux':
                downloadPath = await tc.downloadTool(`https://github.com/microsoft/go-sqlcmd/releases/download/v${sqlcmdVersion}/sqlcmd-v${sqlcmdVersion}-linux-x64.tar.bz2`);
                return await tc.extractTar(downloadPath, undefined, 'xj');
    
            case 'win32':
                downloadPath = await tc.downloadTool(`https://github.com/microsoft/go-sqlcmd/releases/download/v${sqlcmdVersion}/sqlcmd-v${sqlcmdVersion}-windows-x64.zip`);
                return await tc.extractZip(downloadPath);
    
            default:
                throw new Error(`Runner OS is not supported: ${process.platform}`);
        }
    }
}
