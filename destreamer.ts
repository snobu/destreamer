import { execSync } from 'child_process';
import puppeteer from 'puppeteer';
import { terminal as term } from 'terminal-kit';
import fs from 'fs';
import path from 'path';


// Type in your username here (the one you use to
// login to Microsoft Stream).
const username: string = 'somebody@example.com';
const args: string[] = process.argv.slice(2);
const videoUrl: string = args[0];
const outputDirectory: string = 'videos';

function sanityChecks() {
    try {
        const ytdlVer = execSync('youtube-dl --version');
        term.green(`\nUsing youtube-dl version ${ytdlVer}`);
    }
    catch (e) {
        console.error('You need youtube-dl in $PATH for this to work. Make sure it is a relatively recent one, baked after 2019.');
        process.exit(22);
    }

    try {
        const ffmpegVer = execSync('ffmpeg -version')
            .toString().split('\n')[0];
        term.green(`\nUsing ffmpeg version ${ffmpegVer}`);
    }
    catch (e) {
        console.error('FFmpeg is missing. You need a fairly recent release of FFmpeg in $PATH.');
    }

    if (!fs.existsSync(outputDirectory)){
        console.log('Creating output directory: ' +
            process.cwd() + path.sep + outputDirectory);
        fs.mkdirSync(outputDirectory);
    }

    if (args[0] == null || args[0].length < 10) {
        console.error('Pass in video URL as first argument: \n' +
            'Example: npm start https://www.microsoftstream.com/video/6f1a382b-e20c-44c0-98fc-5608286e48bc\n');
        process.exit(-1);
    }
}

async function rentVideoForLater() {
    console.log('Launching headless Chrome to perform the OpenID Connect dance...');
    const browser = await puppeteer.launch({
        // Switch to false if you need to login interactively
        headless: false,
        args: ['--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    console.log('Navigating to STS login page...');

    // This breaks on slow connections, needs more reliable logic
    //const oidcUrl = "https://login.microsoftonline.com/common/oauth2/authorize?client_id=cf53fce8-def6-4aeb-8d30-b158e7b1cf83&response_mode=form_post&response_type=code+id_token&scope=openid+profile&state=OpenIdConnect.AuthenticationProperties%3d1VtrsKV5QUHtzn8cDWL4wJmacu-VHH_DfpPxMQBhnfbar-_e8X016GGJDPfqfvcyUK3F3vBoiFwUpahR2ANfrzHE469vcw7Mk86wcAqBGXCvAUmv59MDU_OZFHpSL360oVRBo84GfVXAKYdhCjhPtelRHLHEM_ADiARXeMdVTAO3SaTiVQMhw3c9vLWuXqrKKevpI7E5esCQy5V_dhr2Q7kKrlW3gHX0232b8UWAnSDpc-94&nonce=636832485747560726.NzMyOWIyYWQtM2I3NC00MmIyLTg1NTMtODBkNDIwZTI1YjAxNDJiN2JkNDMtMmU5Ni00OTc3LWFkYTQtNTNlNmUwZmM1NTVl&nonceKey=OpenIdConnect.nonce.F1tPks6em0M%2fWMwvatuGWfFM9Gj83LwRKLvbx9rYs5M%3d&site_id=500453&redirect_uri=https%3a%2f%2fmsit.microsoftstream.com%2f&post_logout_redirect_uri=https%3a%2f%2fproducts.office.com%2fmicrosoft-stream&msafed=0";
    await page.goto(videoUrl, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[type="email"]');
    await page.keyboard.type(username);
    await page.click('input[type="submit"]');

    await browser.waitForTarget(target => target.url().includes('microsoftstream.com/'), { timeout: 90000 });
    process.stdout.write('We are logged in. ');
    await sleep(1500);
    console.log('Sorry, i mean "you".');

    await page.goto(videoUrl, { waitUntil: 'networkidle2' });
    await sleep(2000);
    // try this instead of hardcoding sleep
    // https://github.com/GoogleChrome/puppeteer/issues/3649

    const cookie = await exfiltrateCookie(page);
    console.log('Got cookie. Consuming cookie...');

    await sleep(4000);
    console.log('Looking up AMS stream locator...');
    let amp: any;
    const amsUrl = await page.evaluate(
        () => { return amp.Player.players["vjs_video_3"].cache_.src }
    );

    const title = await page.evaluate(
        // Clear abuse of null assertion operator,
        // someone fix this please
        () => { return document!.querySelector(".title")!.textContent!.trim() }
    );

    console.log(`Video title is: ${title}`);
    
    console.log("At this point Chrome's job is done, shutting it down...");
    await browser.close();

    console.log('Constructing HLS URL...');
    const hlsUrl = amsUrl.substring(0, amsUrl.lastIndexOf('/')) + '/manifest(format=m3u8-aapl)';

    console.log('Spawning youtube-dl with cookie and HLS URL...');
    const youtubedlCmd = 'youtube-dl --no-call-home --no-progress --no-warnings ' +
        `--output "${outputDirectory}/${title}.mp4" --add-header Cookie:"${cookie}" "${hlsUrl}"`;
    // console.log(`\n\n[DEBUG] Invoking youtube-dl: ${youtubedlCmd}\n\n`);
    var result = execSync(youtubedlCmd, { stdio: 'inherit' });
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function exfiltrateCookie(page: puppeteer.Page) {
    var jar = await page.cookies("https://.api.microsoftstream.com");
    var authzCookie = jar.filter(c => c.name === 'Authorization_Api')[0];
    var sigCookie = jar.filter(c => c.name === 'Signature_Api')[0];

    if (authzCookie == null || sigCookie == null) {
        await sleep(5000);
        var jar = await page.cookies("https://.api.microsoftstream.com");
        var authzCookie = jar.filter(c => c.name === 'Authorization_Api')[0];
        var sigCookie = jar.filter(c => c.name === 'Signature_Api')[0];
    }

    if (authzCookie == null || sigCookie == null) {
        console.error('Unable to read cookies. Try launching one more time, this is not an exact science.');
        process.exit(88);
    }

    return `Authorization=${authzCookie.value}; Signature=${sigCookie.value}`;
}

sanityChecks();
rentVideoForLater();