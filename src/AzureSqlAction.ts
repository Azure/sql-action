import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

import AzureSqlActionHelper from './AzureSqlActionHelper';
import SqlConnectionStringBuilder from './SqlConnectionStringBuilder';
import DotnetUtils from './DotnetUtils';
import Constants from './Constants';

export enum ActionType {
    DacpacAction,
    SqlAction,
    BuildAndPublish
}

export interface IActionInputs {
    serverName: string;
    actionType: ActionType;
    connectionString: SqlConnectionStringBuilder;
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
                connectionString: this._inputs.connectionString,
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
        core.debug('Begin executing action')
        let sqlPackagePath = await AzureSqlActionHelper.getSqlPackagePath();
        let sqlPackageArgs = this._getSqlPackageArguments(inputs);

        await exec.exec(`"${sqlPackagePath}" ${sqlPackageArgs}`);

        console.log(`Successfully executed action ${SqlPackageAction[inputs.sqlpackageAction]} on target database.`);
    }

    private async _executeSqlFile(inputs: ISqlActionInputs) {
        let sqlCmdPath = await AzureSqlActionHelper.getSqlCmdPath();
        await exec.exec(`"${sqlCmdPath}" -S ${inputs.serverName} -d ${inputs.connectionString.database} -U "${inputs.connectionString.userId}" -P "${inputs.connectionString.password}" -i "${inputs.sqlFile}" ${inputs.additionalArguments}`);

        console.log(`Successfully executed Sql file on target database.`);
    }

    private async _executeBuildProject(inputs: IBuildAndPublishInputs): Promise<string> {
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
                args += `/Action:Publish /TargetConnectionString:"${inputs.connectionString.connectionString}" /SourceFile:"${inputs.dacpacPackage}"`;
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