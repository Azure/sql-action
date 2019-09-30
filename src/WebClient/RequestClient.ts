import { HttpClient } from "typed-rest-client/HttpClient";
import { IRequestOptions } from "typed-rest-client/Interfaces";

export class RequestClient {
    private static _instance: HttpClient;
    private static _options: IRequestOptions = {};

    private constructor() {
        // Singleton pattern: block from public construction
    }

    public static GetInstance(): HttpClient {
        if (RequestClient._instance === undefined) {
            RequestClient._instance = new HttpClient(`${process.env.AZURE_HTTP_USER_AGENT}`, undefined, RequestClient._options);
        }
        return RequestClient._instance;
    }

    public static SetOptions(newOptions: IRequestOptions) {
        RequestClient._options = newOptions;
    }
} 