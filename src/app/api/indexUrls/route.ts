import axios from 'axios';
import { GoogleAuth } from 'google-auth-library';
import { parseStringPromise } from 'xml2js';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/indexing'];
const ENDPOINT = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const URLS_PER_ACCOUNT = 200;

async function sendUrl(authClient, url: string) {
    const headers = await authClient.getRequestHeaders();
    const content = { url: url.trim(), type: "URL_UPDATED" };

    for (let i = 0; i < 3; i++) {
        try {
            const response = await axios.post(ENDPOINT, content, { headers });
            return response.data;
        } catch (error) {
            if (error.response && error.response.status === 500) {
                console.log('Server disconnected, retrying...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                return error.response ? error.response.data : error.message;
            }
        }
    }
    return { error: { code: 500, message: "Server Disconnected after multiple retries" }};
}

async function indexURLs(authClient, urls: string[]) {
    let successfulUrls = 0;
    let error429Count = 0;

    const promises = urls.map(url => sendUrl(authClient, url));
    const results = await Promise.all(promises);

    results.forEach(result => {
        if (result.error) {
            if (result.error.code === 429) {
                error429Count++;
            }
        } else {
            successfulUrls++;
        }
    });

    return { successfulUrls, error429Count, totalUrls: urls.length };
}

async function setupHttpClient(jsonKeyFilePath: string) {
    const auth = new GoogleAuth({
        keyFile: path.join(process.cwd(), jsonKeyFilePath),
        scopes: SCOPES,
    });
    return await auth.getClient();
}

async function fetchUrlsFromSitemap(url: string) {
    const urls: string[] = [];
    try {
        const response = await axios.get(url);
        const result = await parseStringPromise(response.data);
        
        result.urlset.url.forEach((elem: any) => {
            urls.push(elem.loc[0]);
        });
    } catch (error) {
        console.log(`Error fetching sitemap: ${error.message}`);
    }
    return urls;
}

export async function POST(req: NextRequest) {
    const { numAccounts, sitemapUrl } = await req.json();
    const allUrls = await fetchUrlsFromSitemap(sitemapUrl);

    if (allUrls.length === 0) {
        return NextResponse.json({ message: "No URLs found in the sitemap!" }, { status: 400 });
    }

    let report = [];

    for (let i = 0; i < numAccounts; i++) {
        const jsonKeyEnvVar = `GOOGLE_ACCOUNT${i + 1}_KEY`;
        const jsonKeyFilePath = process.env[jsonKeyEnvVar];

        if (!jsonKeyFilePath) {
            console.log(`Error: Environment variable for ${jsonKeyEnvVar} not found!`);
            continue;
        }

        const startIndex = i * URLS_PER_ACCOUNT;
        const endIndex = startIndex + URLS_PER_ACCOUNT;
        const urlsForAccount = allUrls.slice(startIndex, endIndex);

        const authClient = await setupHttpClient(jsonKeyFilePath);
        const result = await indexURLs(authClient, urlsForAccount);

        report.push({ account: i + 1, ...result });
    }

    return NextResponse.json(report, { status: 200 });
}
