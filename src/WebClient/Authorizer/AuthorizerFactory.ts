import { AzureCLIAuthorizer } from './AzureCLIAuthorizer';

export interface IAuthorizer {
    getToken: (force?: boolean) => Promise<string>;
    getActiveSubscription: () => string;
    getResourceManagerUrl: () => string;
    getCloudSuffixUrl: (suffixName: string) => string;
    getCloudEndpointUrl: (name: string) => string;
}

export default class AuthorizerFactory {
    public static async getAuthorizer(): Promise<IAuthorizer> {
        try {
            return await AzureCLIAuthorizer.getAuthorizer();
        }
        catch(error) {
            throw new Error("No Azure login crdentails found. Please add an Azure login script action before this action.");
        }
    }
}

