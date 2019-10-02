"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const path = __importStar(require("path"));
const AzureSqlAction_1 = __importStar(require("./AzureSqlAction"));
const AuthorizerFactory_1 = __importDefault(require("./WebClient/Authorizer/AuthorizerFactory"));
const AzureSqlResourceManager_1 = __importDefault(require("./AzureSqlResourceManager"));
const FirewallManager_1 = __importDefault(require("./FirewallManager"));
const AzureSqlActionHelper_1 = require("./AzureSqlActionHelper");
const SqlConnectionStringBuilder_1 = require("./SqlConnectionStringBuilder");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        let firewallManager;
        try {
            let inputs = getInputs();
            let azureSqlAction = new AzureSqlAction_1.default(inputs);
            let azureResourceAuthorizer = yield AuthorizerFactory_1.default.getAuthorizer();
            let azureSqlResourceManager = yield AzureSqlResourceManager_1.default.getResourceManager(inputs.serverName, azureResourceAuthorizer);
            firewallManager = new FirewallManager_1.default(azureSqlResourceManager);
            yield firewallManager.addFirewallRule(inputs.serverName, inputs.connectionString);
            yield azureSqlAction.execute();
            //remove the below statement before checking-in
            throw new Error('Test error for re-running checks');
        }
        catch (error) {
            core.setFailed(error.message);
        }
        finally {
            if (firewallManager) {
                yield firewallManager.removeFirewallRule();
            }
        }
    });
}
exports.default = run;
function getInputs() {
    core.debug('Getting inputs.');
    let serverName = core.getInput('server-name', { required: true });
    let connectionString = core.getInput('connection-string', { required: true });
    let connectionStringBuilder = new SqlConnectionStringBuilder_1.SqlConnectionStringBuilder(connectionString);
    let additionalArguments = core.getInput('arguments');
    let dacpacPackage = core.getInput('dacpac-package');
    if (!!dacpacPackage) {
        dacpacPackage = AzureSqlActionHelper_1.AzureSqlActionHelper.resolveFilePath(dacpacPackage);
        if (path.extname(dacpacPackage).toLowerCase() !== '.dacpac') {
            throw new Error(`Invalid dacpac file path provided as input ${dacpacPackage}`);
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
        sqlFilePath = AzureSqlActionHelper_1.AzureSqlActionHelper.resolveFilePath(sqlFilePath);
        if (path.extname(sqlFilePath).toLowerCase() !== '.sql') {
            throw new Error(`Invalid sql file path provided as input ${sqlFilePath}`);
        }
        return {
            serverName: serverName,
            connectionString: connectionStringBuilder,
            sqlFile: sqlFilePath,
            actionType: AzureSqlAction_1.ActionType.SqlAction,
            additionalArguments: additionalArguments
        };
    }
    throw new Error('Required SQL file or DACPAC package to execute action.');
}
run();
