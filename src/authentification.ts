// this code was forked from @toolkitx/microsoft-stream-auth
// https://github.com/toolkitx/microsoft-stream-auth#readme
const request = require("request");
const homePage = 'https://web.microsoftstream.com/?noSignUpCheck=1';
let contextCookies : any[] = [];
let streamCookies : any[] = [];
const matchValue = (key : string, content : any) => {
    const matchs = new RegExp(`"${key}":"(.*?)"`, 'gm').exec(content);
    if (matchs) {
        return matchs[1];
    } else {
        return null;
    }
}
const getSessionInfo = (content : any) => {
    const regex = new RegExp(/\<input\s+type="hidden"\s+name="(.*?)"\s+value="(.*?)"\s+\/\>/, 'gm');
    const items :any[] = [];
    let match;
    while (match = regex.exec(content)) {
        items.push({ key: match[1], value: match[2] });
    }
    return items;
}

const getCookieObject = (cookieItems : any, reset = false) => {
    if (reset) {
        contextCookies = [];
    }
    if (cookieItems && cookieItems.length) {
        const cookies : any = [];
        const keys : any = [];
        cookieItems.map((item : any) => {
            const matchs = new RegExp(/(.*?)=(.*?);/, 'gm').exec(item);
            if (matchs) {
                keys.push(matchs[1]);
                cookies.push({ key: matchs[1], value: matchs[2] });
            }
        });
        const temp = contextCookies.filter(x => !keys.includes(x.key));
        contextCookies = temp.concat(cookies);
    }
    return contextCookies;
}
const createCookieHeader = () => {
    return createBaseCookieHeader(contextCookies);
}
const createBaseCookieHeader = (cookieItems : any) => {
    if (cookieItems.length) {
        const rs : any[] = [];
        cookieItems.map((item : any) => {
            rs.push(`${item.key}=${item.value}`);
        });
        return rs.join('; ');
    } else {
        return null;
    }
}
const startStep = async () => {
    return new Promise((reslove, reject) => {
        request.get({url: homePage, followRedirect: false}, (err : any, res : any, body : any) => {
            streamCookies = getCookieObject(res.headers['set-cookie']);
            reslove(res.headers['location']);
        });
    });
}
const goAuthorizeStep = async (url : string) => {
    return new Promise((reslove, reject) => {
        request.get(url, (err : any, res : any, body : any) => {
            const flowToken = matchValue('sFT', body);
            const originalRequest = matchValue('sCtx', body);
            const correlationId = matchValue('correlationId', body); // client-request-id next request
            const apiCanary = matchValue('apiCanary', body); // canary in next step
            const canary = matchValue('canary', body); // canary in next step
            const requestId = res.headers['x-ms-request-id']; //hpgrequestid in next step
            const authorizeCookies = getCookieObject(res.headers['set-cookie']);
            reslove({ requestId, authorizeCookies, flowToken, originalRequest, apiCanary, correlationId, canary });
        });
    });
}
const getCredentialStep = async (context : any, account : any) => {
    return new Promise((reslove, reject) => {
        const url = 'https://login.microsoftonline.com/common/GetCredentialType?mkt=en-US';
        const data = {
            "username": account.account,
            "isOtherIdpSupported": false,
            "checkPhones": false,
            "isRemoteNGCSupported": true,
            "isCookieBannerShown": false, // false
            "isFidoSupported": true,
            "originalRequest": context['originalRequest'],
            "country": "CN",
            "forceotclogin": false,
            "isExternalFederationDisallowed": false,
            "isRemoteConnectSupported": false,
            "federationFlags": 0,
            "flowToken": context['flowToken'],
            "isAccessPassSupported": true
        };
        const headers = {
            'canary': context['apiCanary'],
            'client-request-id': context['correlationId'],
            'hpgrequestid': context['requestId'],
            'Cookie': createCookieHeader()
        };
        request.post({ url: url, headers: headers, json: true, body: data }, (err : any, res : any, body : any) => {
            const flowToken = body.FlowToken;
            const originalRequest = matchValue('sCtx', body);
            const apiCanary = body.apiCanary;
            const requestId = res.headers['x-ms-request-id'];
            const credentialCookies = getCookieObject(res.headers['set-cookie']);
            reslove({ requestId, credentialCookies, flowToken, originalRequest, apiCanary });
        });
    });
}

const loginStep = async (authContext : any, credContext : any, account : any) => {
    return new Promise((reslove, reject) => {
        const url = 'https://login.microsoftonline.com/common/login';
        const data = {
            "i13": "0",
            "login": account.account,
            "loginfmt": account.account,
            "type": "11",
            "LoginOptions": "3",
            "lrt": "",
            "lrtPartition": "",
            "hisRegion": "",
            "hisScaleUnit": "",
            "passwd": account.pwd,
            "ps": "2",
            "psRNGCDefaultType": "",
            "psRNGCEntropy": "",
            "psRNGCSLK": "",
            "canary": authContext['canary'],
            "ctx": authContext['originalRequest'],
            "hpgrequestid": authContext['requestId'],
            "flowToken": credContext['flowToken'],
            "PPSX": "",
            "NewUser": "1",
            "FoundMSAs": "",
            "fspost": "0",
            "i21": "0",
            "CookieDisclosure": "0",
            "IsFidoSupported": "1",
            "i2": "1",
            "i17": "",
            "i18": "",
            "i19": "16444"
        };
        const headers = {
            'Cookie': createCookieHeader(),
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        request.post({ url: url, headers: headers, form: data }, (err : any, res : any, body : any) => {
            const flowToken = matchValue('sFT', body);
            const originalRequest = matchValue('sCtx', body);
            const correlationId = matchValue('correlationId', body);
            const apiCanary = matchValue('apiCanary', body);
            const canary = matchValue('canary', body);
            const requestId = res.headers['x-ms-request-id'];
            const loginCookies = getCookieObject(res.headers['set-cookie']);
            reslove({ requestId, loginCookies, flowToken, originalRequest, apiCanary, correlationId, canary });
        });
    });
}
const kmsiStep = async (context : any) => {
    return new Promise((reslove, reject) => {
        const url = 'https://login.microsoftonline.com/kmsi';
        const data = {
            "LoginOptions": "1",
            "type": "28",
            "ctx": context['originalRequest'],
            "hpgrequestid": context['requestId'],
            "flowToken": context['flowToken'],
            "canary": context['canary'],
            "i2": "",
            "i17": "",
            "i18": "",
            "i19": "423028"
        };
        const headers = {
            'Cookie': createCookieHeader(),
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        request.post({ url: url, headers: headers, form: data }, (err : any, res : any, body : any) => {
            getCookieObject(res.headers['set-cookie']);
            const state = getSessionInfo(body);
            reslove(state);
        });
    });
}
const postCallback = async (data : any) => {
    return new Promise((reslove, reject) => {
        const url = 'https://web.microsoftstream.com/';
        const headers = {
            'Referer': 'https://login.microsoftonline.com/',
            'Origin': 'https://login.microsoftonline.com/',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': createBaseCookieHeader(streamCookies)
        };
        const formData : {[key:string]: any} = {};
        data.map( (x: { key: string | number; value: any; }) => formData[x.key] = x.value); //x: { key: string | number; value: any; })
        request.post({ url: url, headers: headers, form: formData }, (err : any, res : any, body : any) => {
            const postCookies = getCookieObject(res.headers['set-cookie'], true);
            const redirectUrl = res.headers['location'];
            reslove({postCookies, redirectUrl});
        });
    });
}
const getAccessToken = async(context : any) => {
    return new Promise((reslove, reject) => {
        const url = context['redirectUrl'];
        const headers = {
            'Cookie': createBaseCookieHeader(context['postCookies'])
        };
        request.get({ url: url, headers: headers}, (err : any, res : any, body : any) => {
            const AccessToken = matchValue('AccessToken', body);
            const ApiGatewayUri = matchValue('ApiGatewayUri', body);
            const ApiGatewayVersion = matchValue('ApiGatewayVersion', body);
            const AccessTokenExpiry = matchValue('AccessTokenExpiry', body);
            reslove({AccessToken, ApiGatewayUri, ApiGatewayVersion, AccessTokenExpiry});
        });
    });
}

export async function microsoftStreamAuth(credentials : any) {
    console.log('* Open web.microsoftstream.com');
    const authUrl: any = await startStep();
    console.log('* Redirect to login.microsoftonline.com');
    const authContext = await goAuthorizeStep(authUrl);
    console.log('* Send account and check credential type');
    const credContext = await getCredentialStep(authContext, credentials);
    console.log('* Send password');
    const loginContext = await loginStep(authContext, credContext, credentials);
    console.log('* Go thought "Stay in..."');
    const kmsiContext = await kmsiStep(loginContext);
    console.log('* Redirect back to web.microsoftstream.com');
    const postCallbackContext = await postCallback(kmsiContext);
    console.log('* Redirect to web.microsoftstream.com?noSignUpCheck=1 and get access token');
    const token = await getAccessToken(postCallbackContext);
    return token;
};

//exports = module.exports = microsoftStreamAuth;