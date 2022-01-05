"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const glob = __importStar(require("glob"));
const winreg_1 = __importDefault(require("winreg"));
const IS_WINDOWS = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';
class AzureSqlActionHelper {
    static getSqlPackagePath() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!!this._sqlPackagePath) {
                core.debug(`Return the cached path of SqlPackage executable: ${this._sqlPackagePath}`);
                return this._sqlPackagePath;
            }
            if (IS_WINDOWS) {
                this._sqlPackagePath = yield this._getSqlPackageExecutablePath();
            }
            else if (IS_LINUX) {
                this._sqlPackagePath = this._getSqlPackageBinaryPathLinux();
            }
            else {
                this._sqlPackagePath = this._getSqlPackageBinaryPathMac();
            }
            return this._sqlPackagePath;
        });
    }
    static getSqlCmdPath() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!!this._sqlCmdPath) {
                core.debug(`Return the cached path of SqlCmd executable: ${this._sqlCmdPath}`);
                return this._sqlCmdPath;
            }
            if (IS_WINDOWS) {
                this._sqlCmdPath = yield this._getSqlCmdExecutablePath();
            }
            else if (IS_LINUX) {
                this._sqlCmdPath = this._getSqlCmdBinaryPathLinux();
            }
            else {
                this._sqlCmdPath = this._getSqlCmdBinaryPathMac();
            }
            return this._sqlCmdPath;
        });
    }
    static getRegistrySubKeys(path) {
        return new Promise((resolve) => {
            core.debug(`Getting sub-keys at registry path: HKLM:${path}`);
            let regKey = new winreg_1.default({
                hive: winreg_1.default.HKLM,
                key: path
            });
            regKey.keys((error, result) => {
                return !!error ? '' : resolve(result);
            });
        });
    }
    static getRegistryValue(registryKey, name) {
        return new Promise((resolve) => {
            core.debug(`Getting registry value ${name} at path: HKLM:${registryKey.key}`);
            registryKey.get(name, (error, result) => {
                resolve(!!error ? '' : result.value);
            });
        });
    }
    static registryKeyExists(path) {
        core.debug(`Checking if registry key 'HKLM:${path}' exists.`);
        return new Promise((resolve) => {
            let regKey = new winreg_1.default({
                hive: winreg_1.default.HKLM,
                key: path
            });
            regKey.keyExists((error, result) => {
                resolve(!!error ? false : result);
            });
        });
    }
    static resolveFilePath(filePathPattern) {
        let filePath = filePathPattern;
        if (glob.hasMagic(filePathPattern)) {
            let matchedFiles = glob.sync(filePathPattern);
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
    static _getSqlPackageExecutablePath() {
        return __awaiter(this, void 0, void 0, function* () {
            core.debug('Getting location of SQLPackage.exe');
            let sqlPackagePathInstalledWithSSMS = yield this._getSqlPackageInstalledWithSSMS();
            core.debug(sqlPackagePathInstalledWithSSMS.toString());
            let sqlPackagePathInstalledWithDacMsi = yield this._getSqlPackageInstalledWithDacMsi();
            core.debug(sqlPackagePathInstalledWithDacMsi.toString());
            let sqlPackagePatInstalledWithSSDT = yield this._getSqlPackageInstalledWithSSDT();
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
        });
    }
    static _getSqlPackageInstalledWithSSDT() {
        return __awaiter(this, void 0, void 0, function* () {
            let visualStudioInstallationPath = yield this._getLatestVisualStudioInstallationPath();
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
            if (!(yield AzureSqlActionHelper.registryKeyExists(vsRegKey))) {
                vsRegKey = vsRegKeyWow6432;
                if (!(yield AzureSqlActionHelper.registryKeyExists(vsRegKey))) {
                    return ['', 0];
                }
            }
            let subKeys = yield AzureSqlActionHelper.getRegistrySubKeys(vsRegKey);
            let vsVersionKeys = this._getVersionsRegistryKeys(subKeys);
            for (let vsVersionKey of vsVersionKeys) {
                let vsInstallDir = yield AzureSqlActionHelper.getRegistryValue(vsVersionKey, 'InstallDir');
                let dacParentDir = path.join(vsInstallDir, 'Common7', 'IDE', 'Extensions', 'Microsoft', 'SQLDB', 'DAC');
                let sqlPackageInstallationPath = this._getSqlPackageInVSDacDirectory(dacParentDir);
                if (!!sqlPackageInstallationPath[0]) {
                    return sqlPackageInstallationPath;
                }
            }
            core.debug('Dac Framework (installed with Visual Studio) not found on machine.');
            return ['', 0];
        });
    }
    static _getSqlPackageInVSDacDirectory(dacParentDir) {
        if (fs.existsSync(dacParentDir)) {
            let dacVersionDirs = fs.readdirSync(dacParentDir).filter((dir) => !isNaN(path.basename(dir))).sort((dir1, dir2) => {
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
                    return [sqlPackagaePath, parseInt(path.basename(dacDir))];
                }
            }
        }
        return ['', 0];
    }
    static _getLatestVisualStudioInstallationPath() {
        return __awaiter(this, void 0, void 0, function* () {
            let vswherePath = path.join(process.env['ProgramFiles(x86)'], 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
            let stdout = '';
            try {
                yield exec.exec(`"${vswherePath}"`, ['-latest', '-format', 'json'], {
                    silent: true,
                    listeners: {
                        stdout: (data) => stdout += data.toString()
                    }
                });
            }
            catch (error) {
                core.debug(`Unable to find the location of latest Visual Studio Installation path using vswhere.exe. ${error}`);
                return '';
            }
            core.debug(stdout);
            let vswhereOutput = JSON.parse(stdout);
            return vswhereOutput[0] && vswhereOutput[0]['installationPath'];
        });
    }
    static _getSqlPackageInstalledWithDacMsi() {
        return __awaiter(this, void 0, void 0, function* () {
            let sqlDataTierFrameworkRegKey = path.join('\\', 'SOFTWARE', 'Microsoft', 'Microsoft SQL Server', 'Data-Tier Application Framework');
            let sqlDataTierFrameworkRegKeyWow6432 = path.join('\\', 'SOFTWARE', 'Wow6432Node', 'Microsoft', 'Microsoft SQL Server', 'Data-Tier Application Framework');
            if (!(yield AzureSqlActionHelper.registryKeyExists(sqlDataTierFrameworkRegKey))) {
                sqlDataTierFrameworkRegKey = sqlDataTierFrameworkRegKeyWow6432;
                if (!(yield AzureSqlActionHelper.registryKeyExists(sqlDataTierFrameworkRegKey))) {
                    return ['', 0];
                }
            }
            let subKeys = yield AzureSqlActionHelper.getRegistrySubKeys(sqlDataTierFrameworkRegKey);
            let sqlServerRegistryKeys = this._getVersionsRegistryKeys(subKeys);
            for (let registryKey of sqlServerRegistryKeys) {
                let installDir = yield AzureSqlActionHelper.getRegistryValue(registryKey, 'InstallDir');
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
        });
    }
    static _getSqlPackageInstalledWithSSMS() {
        return __awaiter(this, void 0, void 0, function* () {
            let sqlServerRegistryKey = path.join('\\', 'SOFTWARE', 'Microsoft', 'Microsoft SQL Server');
            let sqlServerRegistryKeyWow6432 = path.join('\\', 'SOFTWARE', 'Wow6432Node', 'Microsoft', 'Microsoft SQL Server');
            if (!(yield AzureSqlActionHelper.registryKeyExists(sqlServerRegistryKey))) {
                sqlServerRegistryKey = sqlServerRegistryKeyWow6432;
                if (!(yield AzureSqlActionHelper.registryKeyExists(sqlServerRegistryKey))) {
                    return ['', 0];
                }
            }
            let subKeys = yield AzureSqlActionHelper.getRegistrySubKeys(sqlServerRegistryKey);
            let sqlServerRegistryKeys = this._getVersionsRegistryKeys(subKeys);
            for (let registryKey of sqlServerRegistryKeys) {
                let versionSpecificRootDir = yield AzureSqlActionHelper.getRegistryValue(registryKey, 'VerSpecificRootDir');
                if (!!versionSpecificRootDir) {
                    let sqlPackagePath = path.join(versionSpecificRootDir, 'Dac', 'bin', 'SqlPackage.exe');
                    if (fs.existsSync(sqlPackagePath)) {
                        core.debug(`SqlPackage.exe (installed with SSMS) found at location: ${sqlPackagePath}`);
                        return [sqlPackagePath, parseInt(registryKey.key.split("\\").slice(-1)[0])];
                    }
                }
            }
            return ['', 0];
        });
    }
    /***
     * Get the registry keys of all versions installed, sorted in descending order of versions
     */
    static _getVersionsRegistryKeys(subKeys) {
        return subKeys.filter((registryKey) => !isNaN(registryKey.key.split("\\").slice(-1)[0]))
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
        });
    }
    static _getSqlCmdExecutablePath() {
        return __awaiter(this, void 0, void 0, function* () {
            core.debug('Getting location of sqlcmd.exe');
            let sqlServerRegistryKey64 = path.join('\\', 'SOFTWARE', 'Microsoft', 'Microsoft SQL Server');
            if (!(yield AzureSqlActionHelper.registryKeyExists(sqlServerRegistryKey64))) {
                throw new Error('Unable to find the location for SqlCmd.exe from registry');
            }
            let subKeys = yield AzureSqlActionHelper.getRegistrySubKeys(sqlServerRegistryKey64);
            let sqlServerRegistryKeys = this._getVersionsRegistryKeys(subKeys);
            for (let registryKey of sqlServerRegistryKeys) {
                let clientSetupToolsRegistryKeyPath = path.join(registryKey.key, 'Tools', 'ClientSetup');
                if (yield AzureSqlActionHelper.registryKeyExists(clientSetupToolsRegistryKeyPath)) {
                    let toolsPath = yield AzureSqlActionHelper.getRegistryValue(new winreg_1.default({
                        hive: winreg_1.default.HKLM,
                        key: clientSetupToolsRegistryKeyPath
                    }), 'ODBCToolsPath');
                    if (!toolsPath) {
                        // for older versions
                        yield AzureSqlActionHelper.getRegistryValue(new winreg_1.default({
                            hive: winreg_1.default.HKLM,
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
        });
    }
    static _getSqlPackageBinaryPathLinux() {
        return 'sqlpackage';
    }
    static _getSqlCmdBinaryPathLinux() {
        return 'sqlcmd';
    }
    static _getSqlPackageBinaryPathMac() {
        throw new Error('This action is not supported on a Mac environment.');
    }
    static _getSqlCmdBinaryPathMac() {
        throw new Error('This action is not supported on a Mac environment.');
    }
}
exports.default = AzureSqlActionHelper;
AzureSqlActionHelper._sqlPackagePath = '';
AzureSqlActionHelper._sqlCmdPath = '';
