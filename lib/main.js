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
const crypto = __importStar(require("crypto"));
const path = __importStar(require("path"));
const AuthorizerFactory_1 = require("azure-actions-webclient/AuthorizerFactory");
const AzureSqlAction_1 = __importStar(require("./AzureSqlAction"));
const AzureSqlResourceManager_1 = __importDefault(require("./AzureSqlResourceManager"));
const FirewallManager_1 = __importDefault(require("./FirewallManager"));
const AzureSqlActionHelper_1 = __importDefault(require("./AzureSqlActionHelper"));
const SqlConnectionStringBuilder_1 = __importDefault(require("./SqlConnectionStringBuilder"));
const SqlUtils_1 = __importDefault(require("./SqlUtils"));
const Constants_1 = __importDefault(require("./Constants"));
let userAgentPrefix = !!process.env.AZURE_HTTP_USER_AGENT ? `${process.env.AZURE_HTTP_USER_AGENT}` : "";
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        let firewallManager;
        try {
            // Set user agent variable
            let usrAgentRepo = crypto.createHash('sha256').update(`${process.env.GITHUB_REPOSITORY}`).digest('hex');
            let actionName = 'AzureSqlAction';
            let userAgentString = (!!userAgentPrefix ? `${userAgentPrefix}+` : '') + `GITHUBACTIONS_${actionName}_${usrAgentRepo}`;
            core.exportVariable('AZURE_HTTP_USER_AGENT', userAgentString);
            let inputs = getInputs();
            let azureSqlAction = new AzureSqlAction_1.default(inputs);
            const runnerIPAddress = yield SqlUtils_1.default.detectIPAddress(inputs.serverName, inputs.connectionString);
            if (runnerIPAddress) {
                let azureResourceAuthorizer = yield AuthorizerFactory_1.AuthorizerFactory.getAuthorizer();
                let azureSqlResourceManager = yield AzureSqlResourceManager_1.default.getResourceManager(inputs.serverName, azureResourceAuthorizer);
                firewallManager = new FirewallManager_1.default(azureSqlResourceManager);
                yield firewallManager.addFirewallRule(runnerIPAddress);
            }
            yield azureSqlAction.execute();
        }
        catch (error) {
            core.setFailed(error.message);
        }
        finally {
            if (firewallManager) {
                yield firewallManager.removeFirewallRule();
            }
            // Reset AZURE_HTTP_USER_AGENT
            core.exportVariable('AZURE_HTTP_USER_AGENT', userAgentPrefix);
        }
    });
}
exports.default = run;
function getInputs() {
    core.debug('Get action inputs.');
    let serverName = core.getInput('server-name', { required: true });
    let connectionString = core.getInput('connection-string', { required: true });
    let connectionStringBuilder = new SqlConnectionStringBuilder_1.default(connectionString);
    let additionalArguments = core.getInput('arguments');
    let dacpacPackage = core.getInput('dacpac-package');
    if (!!dacpacPackage) {
        dacpacPackage = AzureSqlActionHelper_1.default.resolveFilePath(dacpacPackage);
        if (path.extname(dacpacPackage).toLowerCase() !== Constants_1.default.dacpacExtension) {
            throw new Error(`Invalid dacpac file path provided as input ${dacpacPackage}`);
        }
        if (!serverName) {
            throw new Error(`Missing server name or address in the configuration.`);
        }
        return {
            serverName: serverName,
            connectionString: connectionStringBuilder,
            dacpacPackage: dacpacPackage,
            sqlpackageAction: AzureSqlAction_1.SqlPackageAction.Publish,
            actionType: AzureSqlAction_1.ActionType.DacpacAction,
            additionalArguments: additionalArguments
        };
    }
    let sqlFilePath = core.getInput('sql-file');
    if (!!sqlFilePath) {
        sqlFilePath = AzureSqlActionHelper_1.default.resolveFilePath(sqlFilePath);
        if (path.extname(sqlFilePath).toLowerCase() !== '.sql') {
            throw new Error(`Invalid sql file path provided as input ${sqlFilePath}`);
        }
        if (!serverName) {
            throw new Error(`Missing server name or address in the configuration.`);
        }
        return {
            serverName: serverName,
            connectionString: connectionStringBuilder,
            sqlFile: sqlFilePath,
            actionType: AzureSqlAction_1.ActionType.SqlAction,
            additionalArguments: additionalArguments
        };
    }
    let sqlProjPath = core.getInput('project-file');
    if (!!sqlProjPath) {
        sqlProjPath = AzureSqlActionHelper_1.default.resolveFilePath(sqlProjPath);
        if (path.extname(sqlProjPath).toLowerCase() !== Constants_1.default.sqlprojExtension) {
            throw new Error(`Invalid database project file path provided as input ${sqlProjPath}`);
        }
        const buildArguments = core.getInput('build-arguments');
        return {
            serverName: serverName,
            connectionString: connectionStringBuilder,
            actionType: AzureSqlAction_1.ActionType.BuildAndPublish,
            additionalArguments: additionalArguments,
            projectFile: sqlProjPath,
            buildArguments: buildArguments
        };
    }
    throw new Error('Required SQL file, DACPAC package, or database project file to execute action.');
}
run();
