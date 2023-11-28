import * as path from 'path';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

import AzureSqlActionHelper from './AzureSqlActionHelper';
import DotnetUtils from './DotnetUtils';
import Constants from './Constants';
import SqlConnectionConfig from './SqlConnectionConfig';
import SqlUtils from './SqlUtils';

export enum ActionType {
    DacpacAction,
    SqlAction,
    BuildAndPublish
}

export interface IActionInputs {
    actionType: ActionType;
    connectionConfig: SqlConnectionConfig;
    filePath: string;
    additionalArguments?: string;
    useManagedInstance?: boolean;
}

export interface IDacpacActionInputs extends IActionInputs {
    sqlpackageAction: SqlPackageAction;
}

export interface IBuildAndPublishInputs extends IActionInputs {
    sqlpackageAction: SqlPackageAction;
    buildArguments?: string;
}

export enum SqlPackageAction {
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
            await this._executeSqlFile(this._inputs);
        }
        else if (this._inputs.actionType === ActionType.BuildAndPublish) {
            const buildAndPublishInputs = this._inputs as IBuildAndPublishInputs;
            const dacpacPath = await this._executeBuildProject(buildAndPublishInputs);

            // Reuse DacpacAction for publish
            const publishInputs = {
                actionType: ActionType.DacpacAction,
                connectionConfig: buildAndPublishInputs.connectionConfig,
                filePath: dacpacPath,
                additionalArguments: buildAndPublishInputs.additionalArguments,
                sqlpackageAction: buildAndPublishInputs.sqlpackageAction
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

    private async _executeSqlFile(inputs: IActionInputs) {
        core.debug('Begin executing sql script');

        let sqlcmdCall = SqlUtils.buildSqlCmdCallWithConnectionInfo(inputs.connectionConfig.Config);
        sqlcmdCall += ` -i "${inputs.filePath}"`;
        if (!!inputs.additionalArguments) {
            sqlcmdCall += ` ${inputs.additionalArguments}`;
        }

        await exec.exec(sqlcmdCall);
        
        console.log(`Successfully executed SQL file on target database.`);
    }

    private async _executeBuildProject(inputs: IBuildAndPublishInputs): Promise<string> {
        core.debug('Begin building project');
        const projectName = path.basename(inputs.filePath, Constants.sqlprojExtension);
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
            outputDir = path.join(path.dirname(inputs.filePath), "bin", configuration);
        }

        await exec.exec(`dotnet build "${inputs.filePath}" -p:NetCoreBuild=true ${additionalBuildArguments}`);

        const dacpacPath = path.join(outputDir, projectName + Constants.dacpacExtension);
        console.log(`Successfully built database project to ${dacpacPath}`);
        return dacpacPath;
    }

    private _getSqlPackageArguments(inputs: IDacpacActionInputs) {
        let args = '';

        switch (inputs.sqlpackageAction) {
            case SqlPackageAction.Publish: 
            case SqlPackageAction.Script:
            case SqlPackageAction.DeployReport:
                args += `/Action:${SqlPackageAction[inputs.sqlpackageAction]} /TargetConnectionString:"${inputs.connectionConfig.ConnectionString}" /SourceFile:"${inputs.filePath}"`;
                break;
            case SqlPackageAction.DriftReport:
                args += `/Action:${SqlPackageAction[inputs.sqlpackageAction]} /TargetConnectionString:"${inputs.connectionConfig.ConnectionString}"`;
                break;

            default:
                throw new Error(`Not supported SqlPackage action: '${SqlPackageAction[inputs.sqlpackageAction]}'`);
        }

        if (!!inputs.additionalArguments) {
            args += ' ' + inputs.additionalArguments;
        }

        return args;
    }   

    private _inputs: IActionInputs;
}
