import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as path from "path";
import * as fs from 'fs';
import * as glob from 'glob';
import winreg from 'winreg';
import * as semver from 'semver';
import { SqlPackageAction, IDacpacActionInputs } from './AzureSqlAction';

const IS_WINDOWS = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';

export default class AzureSqlActionHelper {
    
    public static async getSqlPackagePath(inputs: IDacpacActionInputs): Promise<string> {
        if (!!inputs.sqlpackagePath) {
            if (!fs.existsSync(inputs.sqlpackagePath)) {
                throw new Error(`SqlPackage not found at provided path: ${inputs.sqlpackagePath}`);
            }
            core.debug(`Return the cached path of SqlPackage executable: ${inputs.sqlpackagePath}`);
            return inputs.sqlpackagePath;
        }

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

    public static getSqlpackageActionTypeFromString(action: string): SqlPackageAction {
        // Default to Publish if not specified
        if (!action) {
            return SqlPackageAction.Publish;
        }

        switch (action.trim().toLowerCase()) {
            case 'publish':
                return SqlPackageAction.Publish;
            // case 'extract':
            //     return SqlPackageAction.Extract;
            // case 'import':
            //     return SqlPackageAction.Import;
            // case 'export':
            //     return SqlPackageAction.Export;
            case 'driftreport':
                return SqlPackageAction.DriftReport;
            case 'deployreport':
                return SqlPackageAction.DeployReport;
            case 'script':
                return SqlPackageAction.Script;
            default:
                throw new Error(`Action ${action} is invalid. Supported action types are: Publish, Script, DriftReport, or DeployReport.`);
        }
    }

    /**
     * SqlPackage.exe can be installed in four ways:
     *  0. as a global dotnet tool
     *  1. SQL Server Management Studio (SSMS) used to install it to in location C:/Program Files/Microsoft SQL Server/{SqlVersopn}/DAC/bin/SqlPackage.exe' (REMOVE in the future)
     *  2. the Dac Framework MSI installs it in location C:/Program Files/Microsoft SQL Server/{SqlVersopn}/DAC/bin/SqlPackage.exe'
     *  3. SSDT (SQL Server Data Tools) installs it in location VS Install Directory/Common7/IDE/Extensions/Microsoft/SQLDB/DAC/{SqlVersion}
     * 
     *  This method finds the location of SqlPackage.exe from both the location and return the highest version of SqlPackage.exe
     */
    private static async _getSqlPackageExecutablePath(): Promise<string> {
        core.debug('Getting location of SqlPackage');

        let sqlPackagePathInstalledWithDotnetTool = await this._getSqlPackageInstalledDotnetTool();
        core.debug(`SqlPackage (installed with dotnet tool) found at location: ${sqlPackagePathInstalledWithDotnetTool[0]}, version ${sqlPackagePathInstalledWithDotnetTool[1]}`);

        let sqlPackagePathInstalledWithSSMS = await this._getSqlPackageInstalledWithSSMS();
        core.debug(`SqlPackage (installed with SSMS) found at location: ${sqlPackagePathInstalledWithSSMS[0]}, version ${sqlPackagePathInstalledWithSSMS[1]}`);

        let sqlPackagePathInstalledWithDacMsi = await this._getSqlPackageInstalledWithDacMsi();
        core.debug(`SqlPackage (installed with DacFramework) found at location: ${sqlPackagePathInstalledWithDacMsi[0]}, version ${sqlPackagePathInstalledWithDacMsi[1]}`);

        let sqlPackagePatInstalledWithSSDT = await this._getSqlPackageInstalledWithSSDT();
        core.debug(`SqlPackage (installed with SSDT) found at location: ${sqlPackagePatInstalledWithSSDT[0]}, version ${sqlPackagePatInstalledWithSSDT[1]}`);


        // sort the versions in descending order and return the first path
        let sqlPackageVersions = [sqlPackagePathInstalledWithDotnetTool[1], sqlPackagePathInstalledWithSSMS[1], sqlPackagePathInstalledWithDacMsi[1], sqlPackagePatInstalledWithSSDT[1]];
        semver.rsort(sqlPackageVersions);
        let maximumVersion = sqlPackageVersions[0];
        let sqlPackagePath = '';
        if (maximumVersion === sqlPackagePathInstalledWithDotnetTool[1]) {
            sqlPackagePath = sqlPackagePathInstalledWithDotnetTool[0];
        }
        else if (maximumVersion === sqlPackagePathInstalledWithSSMS[1]) {
            sqlPackagePath = sqlPackagePathInstalledWithSSMS[0];
        }
        else if (maximumVersion === sqlPackagePathInstalledWithDacMsi[1]) {
            sqlPackagePath = sqlPackagePathInstalledWithDacMsi[0];
        }
        else if (maximumVersion === sqlPackagePatInstalledWithSSDT[1]) {
            sqlPackagePath = sqlPackagePatInstalledWithSSDT[0];
        }
        

        if (sqlPackagePath == '') {
            throw new Error('Unable to find the location of SqlPackage');
        }

        core.debug(`SqlPackage ${maximumVersion} selected at location: ${sqlPackagePath}`);
        return sqlPackagePath;
    }

    /** SqlPackage returns a multi-part version number major.minor.patch
     * sqlpackage doesn't append -preview to the version number, but if added in the future, this method will handle it
     * This method returns the version as a SemVer object for comparison to find the highest version
     */
    private static async _getSqlPackageExecutableVersion(sqlPackagePath: string): Promise<semver.SemVer> {
        let versionOutput = '';
        await exec.exec(`"${sqlPackagePath}"`, ['/version'], {
            listeners: {
                stdout: (data: Buffer) => versionOutput += data.toString()
            }
        });

        let version = semver.coerce(versionOutput.trim());
        if (!semver.valid(version) || version === null) {
            core.debug(`Unable to parse version ${versionOutput} of SqlPackage at location ${sqlPackagePath}`);
            return new semver.SemVer('0.0.0');
        }

        return version;
    }

    private static async _getSqlPackageInstalledDotnetTool(): Promise<[string, semver.SemVer]> {
        let globalDotnetToolsPath = path.join(process.env['USERPROFILE'] as string, '.dotnet', 'tools');
        let sqlPackagePath = path.join(globalDotnetToolsPath, 'sqlpackage');
        if (fs.existsSync(sqlPackagePath)) {
            core.debug(`SqlPackage (installed with dotnet tool) found at location: ${sqlPackagePath}`);
            let sqlpackageVersion = await this._getSqlPackageExecutableVersion(sqlPackagePath);
            return [sqlPackagePath, sqlpackageVersion];
        }

        return ['', new semver.SemVer('0.0.0')];
    }

    private static async _getSqlPackageInstalledWithSSDT(): Promise<[string, semver.SemVer]> {
        let visualStudioInstallationPath = await this._getLatestVisualStudioInstallationPath();
        if (!!visualStudioInstallationPath) {
            let dacParentDir = path.join(visualStudioInstallationPath, 'Common7', 'IDE', 'Extensions', 'Microsoft', 'SQLDB', 'DAC');
            let sqlPackageInstallationPath = this._getSqlPackageInVSDacDirectory(dacParentDir);
            if (!!sqlPackageInstallationPath[0]) {
                return sqlPackageInstallationPath;
            }
        }
        
        // locate SqlPackage in older versions
        let vsRegKey = path.join('\\', 'SOFTWARE', 'Microsoft', 'VisualStudio');
        let vsRegKeyWow6432 = path.join('\\', 'SOFTWARE', 'Wow6432Node', 'Microsoft', 'VisualStudio');

        if (!await AzureSqlActionHelper.registryKeyExists(vsRegKey)) {
            vsRegKey = vsRegKeyWow6432;
            if (!await AzureSqlActionHelper.registryKeyExists(vsRegKey)) {
                return ['', new semver.SemVer('0.0.0')];
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
        return ['', new semver.SemVer('0.0.0')];
    }

    private static async _getSqlPackageInVSDacDirectory(dacParentDir: string): Promise<[string, semver.SemVer]> {
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
                    let sqlpackageVersion = await this._getSqlPackageExecutableVersion(sqlPackagaePath);
                    return [sqlPackagaePath, sqlpackageVersion]
                }
            }
        }

        return ['', new semver.SemVer('0.0.0')];
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

    private static async _getSqlPackageInstalledWithDacMsi(): Promise<[string, semver.SemVer]> {
        let sqlDataTierFrameworkRegKey = path.join('\\', 'SOFTWARE', 'Microsoft', 'Microsoft SQL Server', 'Data-Tier Application Framework');
        let sqlDataTierFrameworkRegKeyWow6432 = path.join('\\', 'SOFTWARE', 'Wow6432Node', 'Microsoft', 'Microsoft SQL Server', 'Data-Tier Application Framework');
        
        if (!await AzureSqlActionHelper.registryKeyExists(sqlDataTierFrameworkRegKey)) {
            sqlDataTierFrameworkRegKey = sqlDataTierFrameworkRegKeyWow6432;
            if (!await AzureSqlActionHelper.registryKeyExists(sqlDataTierFrameworkRegKey)) {
                return ['', new semver.SemVer('0.0.0')];
            }
        }

        let subKeys = await AzureSqlActionHelper.getRegistrySubKeys(sqlDataTierFrameworkRegKey); 
        let sqlServerRegistryKeys = this._getVersionsRegistryKeys(subKeys);

        for(let registryKey of sqlServerRegistryKeys) {
            let installDir = await AzureSqlActionHelper.getRegistryValue(registryKey, 'InstallDir');
            if (!!installDir) {
                let sqlPackagePath = path.join(installDir, 'SqlPackage.exe');
                if (fs.existsSync(sqlPackagePath)) {
                    core.debug(`SqlPackage (installed with DacFramework) found at location: ${sqlPackagePath}`);
                    let sqlpackageVersion = await this._getSqlPackageExecutableVersion(sqlPackagePath);
                    return [sqlPackagePath, sqlpackageVersion];
                }
            }
        }

        return ['', new semver.SemVer('0.0.0')];
    }

    private static async _getSqlPackageInstalledWithSSMS(): Promise<[string, semver.SemVer]> {
        let sqlServerRegistryKey = path.join('\\', 'SOFTWARE', 'Microsoft', 'Microsoft SQL Server');
        let sqlServerRegistryKeyWow6432 = path.join('\\', 'SOFTWARE', 'Wow6432Node', 'Microsoft', 'Microsoft SQL Server'); 
        
        if (!await AzureSqlActionHelper.registryKeyExists(sqlServerRegistryKey)) {
            sqlServerRegistryKey = sqlServerRegistryKeyWow6432;
            if (!await AzureSqlActionHelper.registryKeyExists(sqlServerRegistryKey)) {
                return ['', new semver.SemVer('0.0.0')];
            }
        }

        let subKeys = await AzureSqlActionHelper.getRegistrySubKeys(sqlServerRegistryKey); 
        let sqlServerRegistryKeys = this._getVersionsRegistryKeys(subKeys);

        for(let registryKey of sqlServerRegistryKeys) {
            let versionSpecificRootDir = await AzureSqlActionHelper.getRegistryValue(registryKey, 'VerSpecificRootDir');
            if (!!versionSpecificRootDir) {
                let sqlPackagePath = path.join(versionSpecificRootDir, 'Dac', 'bin', 'SqlPackage.exe');
                if (fs.existsSync(sqlPackagePath)) {
                    core.debug(`SqlPackage (installed with SSMS) found at location: ${sqlPackagePath}`);
                    let sqlpackageVersion = await this._getSqlPackageExecutableVersion(sqlPackagePath);
                    return [sqlPackagePath, sqlpackageVersion];
                }
            }
        }

        return ['', new semver.SemVer('0.0.0')];
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

    private static _getSqlPackageBinaryPathLinux(): string {
        // check in dotnet tool default global path ~/.dotnet/tools
        if (fs.existsSync('~/.dotnet/tools/sqlpackage')) {
            return '~/.dotnet/tools/sqlpackage';
        }

        // default on path
        return 'sqlpackage';
    }

    private static _getSqlPackageBinaryPathMac(): string {
        throw new Error('This action is not supported on a Mac environment.');
    }

    private static _sqlPackagePath = '';
}