import * as exec from '@actions/exec';
import * as io from '@actions/io';
import { IAuthorizer } from './AuthorizerFactory';


export class AzureCLIAuthorizer implements IAuthorizer {
    private constructor() { }

    public static async getAuthorizer(): Promise<AzureCLIAuthorizer> {
        if (!this._authorizer) {
            this._authorizer = new AzureCLIAuthorizer();
            await this._authorizer.validateAndSetDefaults();
        }
        
        return this._authorizer;
    }

    public async validateAndSetDefaults() { 
        let azAccountDetails = JSON.parse(await this._executeAzCliCommand('account show'));
        let azCloudDetails = JSON.parse(await this._executeAzCliCommand('cloud show'));

        this._subscriptionId = azAccountDetails['id'];
        this._cloudSuffixes = azCloudDetails['suffixes'];
        this._cloudEndpoints = azCloudDetails['endpoints'];
    }

    public async getToken(force?: boolean): Promise<string> {
        if(!this._token || force) {            
            try {
                let azAccessToken = JSON.parse(await this._executeAzCliCommand('account get-access-token'));
                console.log(`::add-mask::${azAccessToken}`);
                this._token = azAccessToken['accessToken'];
            }
            catch(error) {
                console.log('Failed to fetch Azure access token');
                throw error;
            }
        }

        return this._token;
    }

    public getActiveSubscription(): string {
        return this._subscriptionId;
    }

    public getResourceManagerUrl(): string {
        return this._cloudEndpoints['resourceManager'] || 'https://management.azure.com/';
    }

    public getCloudSuffixUrl(suffixName: string): string {
        return this._cloudSuffixes[suffixName];
    }

    public getCloudEndpointUrl(endpointName: string): string {
        return this._cloudEndpoints[endpointName];
    }

    private async _executeAzCliCommand(command: string): Promise<string> {
        let stdout = '';
        
        let azCliPath = await io.which('az', true);
        await exec.exec(`"${azCliPath}" ${command}`, [], {
            silent: true, 
            listeners: {
                stdout: (data: Buffer) => {
                    stdout += data.toString();
                }
            }
        }); 

        return stdout;
    }

    private _token: string = '';
    private _subscriptionId: string = '';
    private _cloudSuffixes: {[key: string]: string} = {};
    private _cloudEndpoints: {[key: string]: string} = {};
    private static _authorizer: AzureCLIAuthorizer;
}