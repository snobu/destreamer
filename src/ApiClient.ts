import { logger } from './Logger';
import { ShareSession, StreamSession, Video } from './Types';
import { publishedDateToString, publishedTimeToString } from './VideoUtils';

import axios, { AxiosRequestConfig, AxiosResponse, AxiosInstance, AxiosError } from 'axios';
import axiosRetry, { isNetworkOrIdempotentRequestError } from 'axios-retry';
// import fs from 'fs';


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

export class ShareApiClient {
    private axiosInstance: AxiosInstance;
    private site: string;

    public constructor(domain: string, site: string, session: ShareSession) {
        this.axiosInstance = axios.create({
            baseURL: domain,
            // timeout: 7000,
            headers: {
                'User-Agent': 'destreamer/3.0 ALPHA',
                'Cookie': `rtFa=${session.rtFa}; FedAuth=${session.FedAuth}`
            }
        });
        this.site = site;


        // FIXME: disabled because it was messing with the direct download check
        // axiosRetry(this.axiosInstance, {
        //     // The following option is not working.
        //     // We should open an issue on the relative GitHub
        //     shouldResetTimeout: true,
        //     retries: 6,
        //     retryDelay: (retryCount: number) => {
        //         return retryCount * 2000;
        //     },
        //     retryCondition: (err: AxiosError) => {
        //         const retryCodes: Array<number> = [429, 500, 502, 503];
        //         if (isNetworkOrIdempotentRequestError(err)) {
        //             logger.warn(`${err}. Retrying request...`);

        //             return true;
        //         }
        //         logger.warn(`Got HTTP code ${err?.response?.status ?? undefined}.`);
        //         logger.warn('Here is the error message: ');
        //         console.dir(err.response?.data);
        //         logger.warn('We called this URL: ' + err.response?.config.baseURL + err.response?.config.url);

        //         const shouldRetry: boolean = retryCodes.includes(err?.response?.status ?? 0);

        //         return shouldRetry;
        //     }
        // });
    }


    public async getVideoInfo(filePath: string, outDir: string): Promise<Video> {
        let playbackUrl: string;

        // TODO: Ripped this straigth from chromium inspector. Don't know don't care what it is right now. Check later
        const payload = {
            parameters: {
                __metadata: {
                    type: 'SP.RenderListDataParameters'
                },
                ViewXml: `<View Scope="RecursiveAll"><Query><Where><Eq><FieldRef Name="FileRef" /><Value Type="Text"><![CDATA[${filePath}]]></Value></Eq></Where></Query><RowLimit Paged="TRUE">1</RowLimit></View>`,
                RenderOptions: 12295,
                AddRequiredFields: true
            }
        };
        const url = `${this.site}/_api/web/GetListUsingPath(DecodedUrl=@a1)/RenderListDataAsStream?@a1='${filePath}'`;

        logger.verbose(`Requesting video info for '${url}'`);
        const info = await this.axiosInstance.post(url, payload, {
            headers: {
                'Content-Type': 'application/json;odata=verbose'
            }
        }).then(res => res.data);
        // fs.writeFileSync('info.json', JSON.stringify(info, null, 4));

        // FIXME: very bad but usefull in alpha stage to check for edge cases
        if (info.ListData.Row.length !== 1) {
            logger.error('More than 1 row in SharePoint video info', { fatal: true });

            process.exit(1000);
        }

        const direct = await this.canDirectDownload(filePath);

        if (direct) {
            playbackUrl = this.axiosInstance.getUri({ url: filePath });
        }
        else {
            playbackUrl = 'placeholder';
        }


        return {
            direct,
            title: filePath.split('/').pop() ?? 'video.mp4',
            duration: '',
            publishDate: publishedDateToString(info.ListData.Row[0]['Modified.']),
            publishTime: publishedTimeToString(info.ListData.Row[0]['Modified.']),
            author: info.ListData.Row[0]['Author.title'],
            authorEmail: info.ListData.Row[0]['Author.email'],
            uniqueId: info.ListData.Row[0]['GUID'].substring(1, 9),
            outPath: outDir,
            playbackUrl,
            totalChunks: 0
        };
    }


    private async canDirectDownload(filePath: string): Promise<boolean> {
        logger.verbose(`Checking direct download for '${filePath}'`);

        return this.axiosInstance.head(
            filePath, { maxRedirects: 0 }
        ).then(
            res => (res.status === 200)
        ).catch(
            () => false
        );
    }
}
