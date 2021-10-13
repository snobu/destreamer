import { logger } from './Logger';
import { StreamSession } from './Types';

import axios, { AxiosRequestConfig, AxiosResponse, AxiosInstance, AxiosError } from 'axios';
import axiosRetry, { isNetworkOrIdempotentRequestError } from 'axios-retry';


export class StreamApiClient {
    private static instance: StreamApiClient;
    private axiosInstance?: AxiosInstance;
    private session?: StreamSession;

    private constructor(session?: StreamSession) {
        this.session = session;
        this.axiosInstance = axios.create({
            baseURL: session?.ApiGatewayUri,
            // timeout: 7000,
            headers: { 'User-Agent': 'destreamer/2.0 (Hammer of Dawn)' }
        });

        axiosRetry(this.axiosInstance, {
            // The following option is not working.
            // We should open an issue on the relative GitHub
            shouldResetTimeout: true,
            retries: 6,
            retryDelay: (retryCount: number) => {
                return retryCount * 2000;
            },
            retryCondition: (err: AxiosError) => {
                const retryCodes: Array<number> = [429, 500, 502, 503];
                if (isNetworkOrIdempotentRequestError(err)) {
                    logger.warn(`${err}. Retrying request...`);

                    return true;
                }
                logger.warn(`Got HTTP code ${err?.response?.status ?? undefined}. Retrying request...`);
                logger.warn('Here is the error message: ');
                console.dir(err.response?.data);
                logger.warn('We called this URL: ' + err.response?.config.baseURL + err.response?.config.url);

                const shouldRetry: boolean = retryCodes.includes(err?.response?.status ?? 0);

                return shouldRetry;
            }
        });
    }

    /**
     * Used to initialize/retrive the active ApiClient
     *
     * @param session used if initializing
     */
    public static getInstance(session?: StreamSession): StreamApiClient {
        if (!StreamApiClient.instance) {
            StreamApiClient.instance = new StreamApiClient(session);
        }

        return StreamApiClient.instance;
    }

    public setSession(session: StreamSession): void {
        if (!StreamApiClient.instance) {
            logger.warn("Trying to update ApiCient session when it's not initialized!");
        }

        this.session = session;

        return;
    }

    /**
     * Call Microsoft Stream API. Base URL is sourced from
     * the session object and prepended automatically.
     */
    public async callApi(
        path: string,
        method: AxiosRequestConfig['method'] = 'get',
        payload?: any): Promise<AxiosResponse | undefined> {

        const delimiter: '?' | '&' = path.split('?').length === 1 ? '?' : '&';

        const headers: object = {
            'Authorization': 'Bearer ' + this.session?.AccessToken
        };

        return this.axiosInstance?.request({
            method: method,
            headers: headers,
            data: payload ?? undefined,
            url: path + delimiter + 'api-version=' + this.session?.ApiGatewayVersion
        });
    }

    /**
     * Call an absolute URL
     */
    public async callUrl(
        url: string,
        method: AxiosRequestConfig['method'] = 'get',
        payload?: any,
        responseType: AxiosRequestConfig['responseType'] = 'json'): Promise<AxiosResponse | undefined> {

        const headers: object = {
            'Authorization': 'Bearer ' + this.session?.AccessToken
        };

        return this.axiosInstance?.request({
            method: method,
            headers: headers,
            data: payload ?? undefined,
            url: url,
            responseType: responseType
        });
    }
}
