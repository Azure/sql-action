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
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const AzureSqlActionHelper_1 = require("./AzureSqlActionHelper");
var ActionType;
(function (ActionType) {
    ActionType[ActionType["DacpacAction"] = 0] = "DacpacAction";
    ActionType[ActionType["SqlAction"] = 1] = "SqlAction";
})(ActionType = exports.ActionType || (exports.ActionType = {}));
var SqlPackageAction;
(function (SqlPackageAction) {
    // Only the Publish action is supported currently
    SqlPackageAction[SqlPackageAction["Publish"] = 0] = "Publish";
    SqlPackageAction[SqlPackageAction["Extract"] = 1] = "Extract";
    SqlPackageAction[SqlPackageAction["Export"] = 2] = "Export";
    SqlPackageAction[SqlPackageAction["Import"] = 3] = "Import";
    SqlPackageAction[SqlPackageAction["DriftReport"] = 4] = "DriftReport";
    SqlPackageAction[SqlPackageAction["DeployReport"] = 5] = "DeployReport";
    SqlPackageAction[SqlPackageAction["Script"] = 6] = "Script";
})(SqlPackageAction = exports.SqlPackageAction || (exports.SqlPackageAction = {}));
class AzureSqlAction {
    constructor(inputs) {
        this._inputs = inputs;
    }
    execute() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._inputs.actionType === ActionType.DacpacAction) {
                yield this._executeDacpacAction(this._inputs);
            }
            else if (this._inputs.actionType === ActionType.SqlAction) {
                yield this._executeSqlFile(this._inputs);
            }
            else {
                throw new Error(`Invalid AzureSqlAction '${this._inputs.actionType}'.`);
            }
        });
    }
    _executeDacpacAction(inputs) {
        return __awaiter(this, void 0, void 0, function* () {
            core.debug('Begin executing action');
            let sqlPackagePath = yield AzureSqlActionHelper_1.AzureSqlActionHelper.getSqlPackagePath();
            let sqlPackageArgs = this._getSqlPackageArguments(inputs);
            yield exec.exec(`"${sqlPackagePath}" ${sqlPackageArgs}`);
            console.log(`Successfully executed action ${SqlPackageAction[inputs.sqlpackageAction]} on target database.`);
        });
    }
    _executeSqlFile(inputs) {
        return __awaiter(this, void 0, void 0, function* () {
            let sqlCmdPath = yield AzureSqlActionHelper_1.AzureSqlActionHelper.getSqlCmdPath();
            yield exec.exec(`"${sqlCmdPath}" -S ${inputs.serverName} -d ${inputs.connectionString.database} -U "${inputs.connectionString.userId}" -P "${inputs.connectionString.password}" -i "${inputs.sqlFile}" ${inputs.additionalArguments}`);
            console.log(`Successfully executed Sql file on target database.`);
        });
    }
    _getSqlPackageArguments(inputs) {
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
            args += ' ' + inputs.additionalArguments;
        }
        return args;
    }
}
exports.default = AzureSqlAction;
