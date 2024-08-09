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
    skipFirewallCheck: boolean;
    noJobSummary: boolean;
}

export interface IDacpacActionInputs extends IActionInputs {
    sqlpackageAction: SqlPackageAction;
    sqlpackagePath?: string;
}

export interface IBuildAndPublishInputs extends IDacpacActionInputs {
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
                sqlpackageAction: buildAndPublishInputs.sqlpackageAction,
                sqlpackagePath: buildAndPublishInputs.sqlpackagePath
            } as IDacpacActionInputs;
            await this._executeDacpacAction(publishInputs);
        }
        else {
            throw new Error(`Invalid AzureSqlAction '${this._inputs.actionType}'.`)
        }
    }

    private async _executeDacpacAction(inputs: IDacpacActionInputs) {
        core.debug('Begin executing sqlpackage');
        let sqlPackagePath = await AzureSqlActionHelper.getSqlPackagePath(inputs);
        let sqlPackageArgs = this._getSqlPackageArguments(inputs);

        await exec.exec(`"${sqlPackagePath}" ${sqlPackageArgs}`);

        console.log(`Successfully executed action ${SqlPackageAction[inputs.sqlpackageAction]} on target database.`);
    }

    private async _executeSqlFile(inputs: IActionInputs) {
        core.debug('Begin executing sql script');

        let sqlcmdCall = SqlUtils.buildSqlCmdCallWithConnectionInfo(inputs.connectionConfig);
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

        let buildOutput = '';
        await exec.exec(`dotnet build "${inputs.filePath}" -p:NetCoreBuild=true ${additionalBuildArguments}`, [], {
            listeners: {
                stderr: (data: Buffer) => buildOutput += data.toString(),
                stdout: (data: Buffer) => buildOutput += data.toString()
            }
        });
        
        try {
            if (buildOutput.includes('Build succeeded.')) {
                core.summary.addHeading(':white_check_mark: SQL project build succeeded.');
            } else {
                core.summary.addHeading(':rotating_light: SQL project build failed.');
            }
            core.summary.addEOL();
            core.summary.addRaw('See the full build log for more details.', true);

            const lines = buildOutput.split(/\r?\n/);
            let warnings = lines.filter(line => (line.includes('Build warning') || line.includes('StaticCodeAnalysis warning')));
            let errorMessages = lines.filter(line => (line.includes('Build error') || line.includes('StaticCodeAnalysis error')));

            if (errorMessages.length > 0) {
                errorMessages = [...new Set(errorMessages)];
                core.summary.addHeading(':x: Errors', 2);
                core.summary.addEOL();

                errorMessages.forEach(error => {
                    // remove [project path] from the end of the line
                    error = error.lastIndexOf('[') > 0 ? error.substring(0, error.lastIndexOf('[')-1) : error;
                
                    // move the file info from the beginning of the line to the end
                    error = '- **'+error.substring(error.indexOf(':')+2) + '** ' + error.substring(0, error.indexOf(':')); 
                    core.summary.addRaw(error, true);
                });
            }

            if (warnings.length > 0) {
                warnings = [...new Set(warnings)];
                core.summary.addHeading(':warning: Warnings', 2);
                core.summary.addEOL();
                
                warnings.forEach(warning => {
                    // remove [project path] from the end of the line
                    warning = warning.lastIndexOf('[') > 0 ? warning.substring(0, warning.lastIndexOf('[')-1) : warning;
                
                    // move the file info from the beginning of the line to the end
                    warning = '- **'+warning.substring(warning.indexOf(':')+2) + '** ' + warning.substring(0, warning.indexOf(':')); 
                    core.summary.addRaw(warning, true);
                });
            }
        } catch (err) {
            core.notice(`Error parsing build output for job summary: ${err}`);
        }

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
                args += `/Action:${SqlPackageAction[inputs.sqlpackageAction]} /TargetConnectionString:"${inputs.connectionConfig.EscapedConnectionString}" /SourceFile:"${inputs.filePath}"`;
                break;
            case SqlPackageAction.DriftReport:
                args += `/Action:${SqlPackageAction[inputs.sqlpackageAction]} /TargetConnectionString:"${inputs.connectionConfig.EscapedConnectionString}"`;
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
