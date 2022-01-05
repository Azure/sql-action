import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as path from "path";
import * as fs from 'fs';
import * as glob from 'glob';
import winreg from 'winreg';

const IS_WINDOWS = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';

export default class AzureSqlActionHelper {
    
    public static async getSqlPackagePath(): Promise<string> {
        if (!!this._sqlPackagePath) {
            core.debug(`Return the cached path of SqlPackage executable: ${this._sqlPackagePath}`);
            return this._sqlPackagePath;
        }

        if (IS_WINDOWS) {
            this._sqlPackagePath = await this._getSqlPackageExecutablePath();
        }
        else if (IS_LINUX) {
            this._sqlPackagePath = this._getSqlPackageBinaryPathLinux();
        }
        else {
            this._sqlPackagePath = this._getSqlPackageBinaryPathMac();
        }

        return this._sqlPackagePath;
    }

    public static async getSqlCmdPath(): Promise<string> {
        if (!!this._sqlCmdPath) {
            core.debug(`Return the cached path of SqlCmd executable: ${this._sqlCmdPath}`);
            return this._sqlCmdPath;
        }

        if (IS_WINDOWS) {
            this._sqlCmdPath = await this._getSqlCmdExecutablePath();
        }
        else if (IS_LINUX) {
            this._sqlCmdPath = this._getSqlCmdBinaryPathLinux();
        }
        else {
            this._sqlCmdPath = this._getSqlCmdBinaryPathMac();
        }

        return this._sqlCmdPath;
    }

    public static getRegistrySubKeys(path: string): Promise<winreg.Registry[]> {
        return new Promise((resolve) => {
            core.debug(`Getting sub-keys at registry path: HKLM:${path}`);
            let regKey = new winreg({
                hive: winreg.HKLM,
                key: path
            });

            regKey.keys((error, result) => {
                return !!error ? '' : resolve(result);
            })
        });
    }

    public static getRegistryValue(registryKey: winreg.Registry, name: string): Promise<string> {
        return new Promise((resolve) => {
            core.debug(`Getting registry value ${name} at path: HKLM:${registryKey.key}`);
            registryKey.get(name, (error, result: winreg.RegistryItem) => {
                resolve(!!error ? '' : result.value);
            });
        });
    }

    public static registryKeyExists(path: string): Promise<boolean> {
        core.debug(`Checking if registry key 'HKLM:${path}' exists.`);
        return new Promise((resolve) => {
            let regKey = new winreg({
                hive: winreg.HKLM,
                key: path
            });

            regKey.keyExists((error, result: boolean) => {
                resolve(!!error ? false : result);
            })
        });
    }

    public static resolveFilePath(filePathPattern: string): string {
        let filePath = filePathPattern;
        if (glob.hasMagic(filePathPattern)) {
            let matchedFiles: string[] = glob.sync(filePathPattern);
            if (matchedFiles.length === 0) {
                throw new Error(`No files found matching pattern ${filePathPattern}`);
            }

            if (matchedFiles.length > 1) {
                throw new Error(`Muliple files found matching pattern ${filePathPattern}`);
            }

            filePath = matchedFiles[0];
        }

        if (!fs.existsSync(filePath)) {
            throw new Error(`Unable to find file at location: ${filePath}`);
        }
        
        return filePath;
    }

    /**
     * SqlPackage.exe can be installed in two ways:
     *  1. SQL Server Management Studio (SSMS) and the Dac Framework MSI installs it in location C:/Program Files/Microsoft SQL Server/{SqlVersopn}/DAC/bin/SqlPackage.exe'
     *  2. SSDT (SQL Server Data Tools) installs it in location VS Install Directory/Common7/IDE/Extensions/Microsoft/SQLDB/DAC/{SqlVersion}
     * 
     *  This method finds the location of SqlPackage.exe from both the location and return the highest version of SqlPackage.exe
     */
    private static async _getSqlPackageExecutablePath(): Promise<string> {
        core.debug('Getting location of SQLPackage.exe');

        let sqlPackagePathInstalledWithSSMS = await this._getSqlPackageInstalledWithSSMS();
        core.debug(sqlPackagePathInstalledWithSSMS.toString());

        let sqlPackagePathInstalledWithDacMsi = await this._getSqlPackageInstalledWithDacMsi();
        core.debug(sqlPackagePathInstalledWithDacMsi.toString());

        let sqlPackagePatInstalledWithSSDT = await this._getSqlPackageInstalledWithSSDT();
        core.debug(sqlPackagePatInstalledWithSSDT.toString());
        
        let maximumVersion = Math.max(sqlPackagePathInstalledWithSSMS[1], sqlPackagePathInstalledWithDacMsi[1], sqlPackagePatInstalledWithSSDT[1]);

        let sqlPackagePath = '';
        if (maximumVersion === sqlPackagePathInstalledWithSSMS[1]) {
            sqlPackagePath = sqlPackagePathInstalledWithSSMS[0];
        }
        else if (maximumVersion === sqlPackagePathInstalledWithDacMsi[1]) {
            sqlPackagePath = sqlPackagePathInstalledWithDacMsi[0];
        }
        else if (maximumVersion === sqlPackagePatInstalledWithSSDT[1]) {
            sqlPackagePath = sqlPackagePatInstalledWithSSDT[0];
        }

        if (!sqlPackagePath) {
            throw new Error('Unable to find the location of SqlPackage.exe');
        }

        core.debug(`SqlPackage.exe found at location: ${sqlPackagePath}`);
        return sqlPackagePath;
    }

    private static async _getSqlPackageInstalledWithSSDT(): Promise<[string, number]> {
        let visualStudioInstallationPath = await this._getLatestVisualStudioInstallationPath();
        if (!!visualStudioInstallationPath) {
            let dacParentDir = path.join(visualStudioInstallationPath, 'Common7', 'IDE', 'Extensions', 'Microsoft', 'SQLDB', 'DAC');
            let sqlPackageInstallationPath = this._getSqlPackageInVSDacDirectory(dacParentDir);
            if (!!sqlPackageInstallationPath[0]) {
                return sqlPackageInstallationPath;
            }
        }
        
        // locate SqlPackage.exe in older versions
        let vsRegKey = path.join('\\', 'SOFTWARE', 'Microsoft', 'VisualStudio');
        let vsRegKeyWow6432 = path.join('\\', 'SOFTWARE', 'Wow6432Node', 'Microsoft', 'VisualStudio');

        if (!await AzureSqlActionHelper.registryKeyExists(vsRegKey)) {
            vsRegKey = vsRegKeyWow6432;
            if (!await AzureSqlActionHelper.registryKeyExists(vsRegKey)) {
                return ['', 0];
            }
        }

        let subKeys = await AzureSqlActionHelper.getRegistrySubKeys(vsRegKey);
        let vsVersionKeys = this._getVersionsRegistryKeys(subKeys);

        for (let vsVersionKey of vsVersionKeys) {
            let vsInstallDir = await AzureSqlActionHelper.getRegistryValue(vsVersionKey, 'InstallDir');
            let dacParentDir = path.join(vsInstallDir, 'Common7', 'IDE', 'Extensions', 'Microsoft', 'SQLDB', 'DAC');
            let sqlPackageInstallationPath = this._getSqlPackageInVSDacDirectory(dacParentDir);
            if (!!sqlPackageInstallationPath[0]) {
                return sqlPackageInstallationPath;
            }
        }

        core.debug('Dac Framework (installed with Visual Studio) not found on machine.');
        return ['', 0];
    }

    private static _getSqlPackageInVSDacDirectory(dacParentDir: string): [string, number] {
        if (fs.existsSync(dacParentDir)) {
            let dacVersionDirs = fs.readdirSync(dacParentDir).filter((dir) => !isNaN(path.basename(dir) as any)).sort((dir1, dir2) => {
                let version1 = path.basename(dir1);
                let version2 = path.basename(dir2);

                if (version1 > version2) {
                    return -1;
                }
                else if (version1 < version2) {
                    return 1;
                }
                else {
                    return 0;
                }
            }).map((dir) => path.join(dacParentDir, dir));

            for (let dacDir of dacVersionDirs) {
                let sqlPackagaePath = path.join(dacDir, 'SqlPackage.exe');
                if (fs.existsSync(sqlPackagaePath)) {
                    core.debug(`Dac Framework installed with Visual Studio found at ${sqlPackagaePath}`);
                    return [sqlPackagaePath, parseInt(path.basename(dacDir))]
                }
            }
        }

        return ['', 0];
    }

    private static async _getLatestVisualStudioInstallationPath(): Promise<string> {
        let vswherePath = path.join(process.env['ProgramFiles(x86)'] as string, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
        let stdout = '';
        try {
            await exec.exec(`"${vswherePath}"`, ['-latest', '-format', 'json'], {
                silent: true, 
                listeners: {
                    stdout: (data: Buffer) => stdout += data.toString()
                }
            });
        }
        catch (error) {
            core.debug(`Unable to find the location of latest Visual Studio Installation path using vswhere.exe. ${error}`)
            return '';
        }

        core.debug(stdout);
        let vswhereOutput: any = JSON.parse(stdout);
        return vswhereOutput[0] && vswhereOutput[0]['installationPath'];
    }

    private static async _getSqlPackageInstalledWithDacMsi(): Promise<[string, number]> {
        let sqlDataTierFrameworkRegKey = path.join('\\', 'SOFTWARE', 'Microsoft', 'Microsoft SQL Server', 'Data-Tier Application Framework');
        let sqlDataTierFrameworkRegKeyWow6432 = path.join('\\', 'SOFTWARE', 'Wow6432Node', 'Microsoft', 'Microsoft SQL Server', 'Data-Tier Application Framework');
        
        if (!await AzureSqlActionHelper.registryKeyExists(sqlDataTierFrameworkRegKey)) {
            sqlDataTierFrameworkRegKey = sqlDataTierFrameworkRegKeyWow6432;
            if (!await AzureSqlActionHelper.registryKeyExists(sqlDataTierFrameworkRegKey)) {
                return ['', 0];
            }
        }

        let subKeys = await AzureSqlActionHelper.getRegistrySubKeys(sqlDataTierFrameworkRegKey); 
        let sqlServerRegistryKeys = this._getVersionsRegistryKeys(subKeys);

        for(let registryKey of sqlServerRegistryKeys) {
            let installDir = await AzureSqlActionHelper.getRegistryValue(registryKey, 'InstallDir');
            if (!!installDir) {
                let sqlPackagePath = path.join(installDir, 'SqlPackage.exe');
                if (fs.existsSync(sqlPackagePath)) {
                    core.debug(`SQLPackage.exe (installed with DacFramework) found at location: ${sqlPackagePath}`);
                    return [sqlPackagePath, parseInt(registryKey.key.split("\\").slice(-1)[0])];
                }
            }
        }
        
        // TODO: Add logic for old versions of Dac MSI (<=14) as well

        return ['', 0];
    }

    private static async _getSqlPackageInstalledWithSSMS(): Promise<[string, number]> {
        let sqlServerRegistryKey = path.join('\\', 'SOFTWARE', 'Microsoft', 'Microsoft SQL Server');
        let sqlServerRegistryKeyWow6432 = path.join('\\', 'SOFTWARE', 'Wow6432Node', 'Microsoft', 'Microsoft SQL Server'); 
        
        if (!await AzureSqlActionHelper.registryKeyExists(sqlServerRegistryKey)) {
            sqlServerRegistryKey = sqlServerRegistryKeyWow6432;
            if (!await AzureSqlActionHelper.registryKeyExists(sqlServerRegistryKey)) {
                return ['', 0];
            }
        }

        let subKeys = await AzureSqlActionHelper.getRegistrySubKeys(sqlServerRegistryKey); 
        let sqlServerRegistryKeys = this._getVersionsRegistryKeys(subKeys);

        for(let registryKey of sqlServerRegistryKeys) {
            let versionSpecificRootDir = await AzureSqlActionHelper.getRegistryValue(registryKey, 'VerSpecificRootDir');
            if (!!versionSpecificRootDir) {
                let sqlPackagePath = path.join(versionSpecificRootDir, 'Dac', 'bin', 'SqlPackage.exe');
                if (fs.existsSync(sqlPackagePath)) {
                    core.debug(`SqlPackage.exe (installed with SSMS) found at location: ${sqlPackagePath}`);
                    return [sqlPackagePath, parseInt(registryKey.key.split("\\").slice(-1)[0])];
                }
            }
        }

        return ['', 0];
    }

    /***
     * Get the registry keys of all versions installed, sorted in descending order of versions
     */
    private static _getVersionsRegistryKeys(subKeys: winreg.Registry[]): winreg.Registry[] {
        return subKeys.filter((registryKey) => !isNaN(registryKey.key.split("\\").slice(-1)[0] as any))
            .sort((registryKey1, registryKey2) => { 
                let version1 = parseInt(registryKey1.key.split("\\").slice(-1)[0]);
                let version2 = parseInt(registryKey2.key.split("\\").slice(-1)[0]);

                if (version1 > version2) {
                    return -1;
                }
                else if (version1 < version2) {
                    return 1;
                }
                else {
                    return 0;
                }
            }
        );
    }

    private static async _getSqlCmdExecutablePath(): Promise<string>{
        core.debug('Getting location of sqlcmd.exe');

        let sqlServerRegistryKey64 = path.join('\\', 'SOFTWARE', 'Microsoft', 'Microsoft SQL Server'); 
        if (!(await AzureSqlActionHelper.registryKeyExists(sqlServerRegistryKey64))) {
            throw new Error('Unable to find the location for SqlCmd.exe from registry');
        }

        let subKeys = await AzureSqlActionHelper.getRegistrySubKeys(sqlServerRegistryKey64); 
        let sqlServerRegistryKeys = this._getVersionsRegistryKeys(subKeys);

        for(let registryKey of sqlServerRegistryKeys) {
            
            let clientSetupToolsRegistryKeyPath = path.join(registryKey.key, 'Tools', 'ClientSetup');

            if (await AzureSqlActionHelper.registryKeyExists(clientSetupToolsRegistryKeyPath)) {
                let toolsPath = await AzureSqlActionHelper.getRegistryValue(new winreg ({
                    hive: winreg.HKLM,
                    key: clientSetupToolsRegistryKeyPath
                }), 'ODBCToolsPath');

                if (!toolsPath) {
                    // for older versions
                    await AzureSqlActionHelper.getRegistryValue(new winreg ({
                        hive: winreg.HKLM,
                        key: clientSetupToolsRegistryKeyPath
                    }), 'Path');
                }

                if (!!toolsPath) {
                    let sqlCmdPath = path.join(toolsPath, 'SQLCMD.exe');
                    if (fs.existsSync(sqlCmdPath)) {
                        core.debug(`SqlCmd.exe found at location: ${sqlCmdPath}`);
                        return sqlCmdPath;
                    }
                }
            }
        }

        throw new Error('Unable to find location of sqlcmd.exe');
    }

    private static _getSqlPackageBinaryPathLinux(): string {
        return 'sqlpackage';
    }

    private static _getSqlCmdBinaryPathLinux(): string {
        return 'sqlcmd';
    }

    private static _getSqlPackageBinaryPathMac(): string {
        throw new Error('This action is not supported on a Mac environment.');
    }

    private static _getSqlCmdBinaryPathMac(): string {
        throw new Error('This action is not supported on a Mac environment.');
    }

    private static _sqlPackagePath = '';
    private static _sqlCmdPath = '';
}