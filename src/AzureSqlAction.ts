import * as path from 'path';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

import AzureSqlActionHelper from './AzureSqlActionHelper';
import DotnetUtils from './DotnetUtils';
import Constants from './Constants';
import SqlConnectionConfig from './SqlConnectionConfig';

export enum ActionType {
    DacpacAction,
    SqlAction,
    BuildAndPublish
}

export interface IActionInputs {
    serverName: string;
    actionType: ActionType;
    connectionConfig: SqlConnectionConfig;
    additionalArguments?: string;
}

export interface IDacpacActionInputs extends IActionInputs {
    dacpacPackage: string;
    sqlpackageAction: SqlPackageAction;
}

export interface ISqlActionInputs extends IActionInputs {
    sqlFile: string;
}

export interface IBuildAndPublishInputs extends IActionInputs {
    projectFile: string;
    buildArguments?: string;
}

export enum SqlPackageAction {
    // Only the Publish action is supported currently
    Publish,
    Extract,
    Export,
    Import,
    DriftReport,
    DeployReport,
    Script
}

export default class AzureSqlAction {
    constructor(inputs: IActionInputs) {
        this._inputs = inputs;
    }

    public async execute() {
        if (this._inputs.actionType === ActionType.DacpacAction) {
            await this._executeDacpacAction(this._inputs as IDacpacActionInputs);
        }
        else if (this._inputs.actionType === ActionType.SqlAction) {
            await this._executeSqlFile(this._inputs as ISqlActionInputs);
        }
        else if (this._inputs.actionType === ActionType.BuildAndPublish) {
            const dacpacPath = await this._executeBuildProject(this._inputs as IBuildAndPublishInputs);

            // Reuse DacpacAction for publish
            const publishInputs = {
                serverName: this._inputs.serverName,
                actionType: ActionType.DacpacAction,
                connectionConfig: this._inputs.connectionConfig,
                additionalArguments: this._inputs.additionalArguments,
                dacpacPackage: dacpacPath,
                sqlpackageAction: SqlPackageAction.Publish
            } as IDacpacActionInputs;
            await this._executeDacpacAction(publishInputs);
        }
        else {
            throw new Error(`Invalid AzureSqlAction '${this._inputs.actionType}'.`)
        }
    }

    private async _executeDacpacAction(inputs: IDacpacActionInputs) {
        core.debug('Begin executing sqlpackage');
        let sqlPackagePath = await AzureSqlActionHelper.getSqlPackagePath();
        let sqlPackageArgs = this._getSqlPackageArguments(inputs);

        await exec.exec(`"${sqlPackagePath}" ${sqlPackageArgs}`);

        console.log(`Successfully executed action ${SqlPackageAction[inputs.sqlpackageAction]} on target database.`);
    }

    private async _executeSqlFile(inputs: ISqlActionInputs) {
        core.debug('Begin executing sql script');

        // sqlcmd should be added to PATH already, we just need to see if need to add ".exe" for Windows
        let sqlCmdPath: string;
        switch (process.platform) {
            case "win32": 
                sqlCmdPath = "sqlcmd.exe";
                break;
            case "linux":
            case "darwin":
                sqlCmdPath = "sqlcmd";
                break;
            default:
                throw new Error(`Platform ${process.platform} is not supported.`);
        }

        // Determine the correct sqlcmd arguments based on the auth type in connectionConfig
        let sqlcmdCall = `"${sqlCmdPath}" -S ${inputs.serverName} -d ${inputs.connectionConfig.Config.database}`;
        const authentication = inputs.connectionConfig.Config['authentication'];
        switch (authentication?.type) {
            case undefined:
                // No authentication type defaults SQL login
                sqlcmdCall += ` -U "${inputs.connectionConfig.Config.user}"`;
                core.exportVariable(Constants.sqlcmdPasswordEnvVarName, inputs.connectionConfig.Config.password);
                break;

            case 'azure-active-directory-default':
                sqlcmdCall += ` --authentication-method=ActiveDirectoryDefault`;
                break;

            case 'azure-active-directory-password':
                sqlcmdCall += ` --authentication-method=ActiveDirectoryPassword -U "${authentication.options.userName}"`;
                core.exportVariable(Constants.sqlcmdPasswordEnvVarName, authentication.options.password);
                break;

            case 'azure-active-directory-service-principal-secret':
                sqlcmdCall += ` --authentication-method=ActiveDirectoryServicePrincipal -U "${inputs.connectionConfig.Config.user}"`;
                core.exportVariable(Constants.sqlcmdPasswordEnvVarName, authentication.options.clientSecret);
                break;

            default:
                throw new Error(`Authentication type ${authentication.type} is not supported.`);
        }

        await exec.exec(`${sqlcmdCall} -i "${inputs.sqlFile}" ${inputs.additionalArguments}`);
        
        console.log(`Successfully executed SQL file on target database.`);
    }

    private async _executeBuildProject(inputs: IBuildAndPublishInputs): Promise<string> {
        core.debug('Begin building project');
        const projectName = path.basename(inputs.projectFile, Constants.sqlprojExtension);
        const additionalBuildArguments = inputs.buildArguments ?? '';
        const parsedArgs = await DotnetUtils.parseCommandArguments(additionalBuildArguments);
        let outputDir = '';

        // Set output dir if it is set in the build arguments
        const outputArgument = await DotnetUtils.findArgument(parsedArgs, "--output", "-o");
        if (outputArgument) {
            outputDir = outputArgument;
        } else {
            // Set output dir to ./bin/<configuration> if configuration is set via arguments
            // Default to Debug if configuration is not set
            const configuration = await DotnetUtils.findArgument(parsedArgs, "--configuration", "-c") ?? "Debug";
            outputDir = path.join(path.dirname(inputs.projectFile), "bin", configuration);
        }

        await exec.exec(`dotnet build "${inputs.projectFile}" -p:NetCoreBuild=true ${additionalBuildArguments}`);

        const dacpacPath = path.join(outputDir, projectName + Constants.dacpacExtension);
        console.log(`Successfully built database project to ${dacpacPath}`);
        return dacpacPath;
    }

    private _getSqlPackageArguments(inputs: IDacpacActionInputs) {
        let args = '';

        switch (inputs.sqlpackageAction) {
            case SqlPackageAction.Publish: {
                args += `/Action:Publish /TargetConnectionString:"${inputs.connectionConfig.ConnectionString}" /SourceFile:"${inputs.dacpacPackage}"`;
                break;
            }
            default: {
                throw new Error(`Not supported SqlPackage action: '${SqlPackageAction[inputs.sqlpackageAction]}'`);
            }
        }

        if (!!inputs.additionalArguments) {
            args += ' ' + inputs.additionalArguments
        }

        return args;
    }   

    private _inputs: IActionInputs;
}