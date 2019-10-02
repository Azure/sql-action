import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { AzureSqlActionHelper } from './AzureSqlActionHelper';
import { SqlConnectionStringBuilder } from './SqlConnectionStringBuilder';

export enum ActionType {
    DacpacAction,
    SqlAction
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