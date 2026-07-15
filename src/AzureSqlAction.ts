import * as os from 'os';
import * as path from 'path';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import uuidV4 from 'uuid/v4';

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
    /**
     * When true, a Publish additionally captures a SqlPackage deployment report
     * and script so the resulting changes can be summarized after deployment.
     */
    captureDeploymentReport?: boolean;
}

export interface IDacpacActionInputs extends IActionInputs {
    sqlpackageAction: SqlPackageAction;
    sqlpackagePath?: string;
}

export interface IBuildAndPublishInputs extends IDacpacActionInputs {
    buildArguments?: string;
}

/** The artifacts captured during a deployment, used to build the summary. */
export interface IActionResult {
    /** Path to the SqlPackage deployment report (XML), if one was captured. */
    reportPath?: string;
    /** Path to the SqlPackage deployment script (T-SQL), if one was captured. */
    scriptPath?: string;
    /** How long the deployment took, in milliseconds. */
    durationMs?: number;
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

    public async execute(): Promise<IActionResult> {
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
                sqlpackagePath: buildAndPublishInputs.sqlpackagePath,
                captureDeploymentReport: buildAndPublishInputs.captureDeploymentReport
            } as IDacpacActionInputs;
            await this._executeDacpacAction(publishInputs);
        }
        else {
            throw new Error(`Invalid AzureSqlAction '${this._inputs.actionType}'.`)
        }

        return {
            reportPath: this._deploymentReportPath,
            scriptPath: this._deploymentScriptPath
        };
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
                args += `/Action:${SqlPackageAction[inputs.sqlpackageAction]} /TargetConnectionString:"${inputs.connectionConfig.EscapedConnectionString}" /SourceFile:"${inputs.filePath}"`;
                break;
            case SqlPackageAction.DriftReport:
                args += `/Action:${SqlPackageAction[inputs.sqlpackageAction]} /TargetConnectionString:"${inputs.connectionConfig.EscapedConnectionString}"`;
                break;

            default:
                throw new Error(`Not supported SqlPackage action: '${SqlPackageAction[inputs.sqlpackageAction]}'`);
        }

        if (inputs.captureDeploymentReport === true && inputs.sqlpackageAction === SqlPackageAction.Publish) {
            args += this._getDeploymentReportArguments(inputs.additionalArguments);
        }

        if (!!inputs.additionalArguments) {
            args += ' ' + inputs.additionalArguments;
        }

        return args;
    }

    /**
     * Builds the SqlPackage arguments that capture a deployment report and script
     * during a Publish, recording the paths so the results can be summarized. A
     * path the caller already supplied via additionalArguments is respected and
     * reused rather than overridden.
     */
    private _getDeploymentReportArguments(additionalArguments?: string): string {
        let args = '';

        const userReportPath = this._extractSqlPackageArgument(additionalArguments, 'DeployReportPath');
        const userScriptPath = this._extractSqlPackageArgument(additionalArguments, 'DeployScriptPath');

        this._deploymentReportPath = userReportPath ?? this._generateArtifactPath('deployment-report', '.xml');
        this._deploymentScriptPath = userScriptPath ?? this._generateArtifactPath('deployment-script', '.sql');

        if (!userReportPath) {
            args += ` /DeployReportPath:"${this._deploymentReportPath}"`;
        }
        if (!userScriptPath) {
            args += ` /DeployScriptPath:"${this._deploymentScriptPath}"`;
        }

        return args;
    }

    /**
     * Extracts the value of a SqlPackage "/Name:value" argument from an argument
     * string, supporting quoted and unquoted values. Returns undefined if absent.
     */
    private _extractSqlPackageArgument(args: string | undefined, name: string): string | undefined {
        if (!args) {
            return undefined;
        }
        const match = new RegExp(`/${name}:(?:"([^"]*)"|(\\S+))`, 'i').exec(args);
        if (!match) {
            return undefined;
        }
        return match[1] ?? match[2];
    }

    /**
     * Generates a unique path under the runner's temp directory for a captured artifact.
     */
    private _generateArtifactPath(prefix: string, extension: string): string {
        const directory = process.env.RUNNER_TEMP || os.tmpdir();
        return path.join(directory, `${prefix}-${uuidV4()}${extension}`);
    }

    private _inputs: IActionInputs;
    private _deploymentReportPath?: string;
    private _deploymentScriptPath?: string;
}
