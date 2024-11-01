import axios from 'axios';
import { GoogleAuth, JWT } from 'google-auth-library';
import { parseStringPromise } from 'xml2js';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const SCOPES = ['https://www.googleapis.com/auth/indexing'];
const ENDPOINT = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const URLS_PER_ACCOUNT = 200;

async function sendUrl(authClient: JWT, url: string) {
    const headers = await authClient.getRequestHeaders();
    const content = { url: url.trim(), type: "URL_UPDATED" };

    for (let i = 0; i < 3; i++) {
        try {
            const response = await axios.post(ENDPOINT, content, { headers });
            return response.data;
        } catch (error: any) {
            if (error.response && error.response.status === 500) {
                console.log('Server disconnected, retrying...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                return error.response ? error.response.data : { message: error.message };
            }
        }
    }
    return { error: { code: 500, message: "Server Disconnected after multiple retries" }};
}

async function indexURLs(authClient: JWT, urls: string[]) {
    let successfulUrls = 0;
    let error429Count = 0;

    const promises = urls.map(url => sendUrl(authClient, url));
    const results = await Promise.all(promises);

    results.forEach(result => {
        if (result.error && result.error.code === 429) {
            error429Count++;
        } else {
            successfulUrls++;
        }
    });

    return { successfulUrls, error429Count, totalUrls: urls.length };
}

async function setupHttpClient(jsonKeyPath: string) {
    try {
        // Dosya yolunu kullanarak JSON içeriğini okuyoruz
        const jsonKeyContent = fs.readFileSync(jsonKeyPath, 'utf-8');
        const auth = new GoogleAuth({
            credentials: JSON.parse(jsonKeyContent), // JSON içeriğini ayrıştırıyoruz
            scopes: SCOPES,
        });
        const client = await auth.getClient();
        return client as JWT;
    } catch (error) {
        console.error("Error in setupHttpClient:", error);
        throw new Error("Failed to set up HTTP client");
    }
}

async function fetchUrlsFromSitemap(url: string) {
    const urls: string[] = [];
    try {
        const response = await axios.get(url);
        const result = await parseStringPromise(response.data);
        result.urlset.url.forEach((elem: any) => {
            urls.push(elem.loc[0]);
        });
    } catch (error: any) {
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
        const jsonKeyPath = process.env[jsonKeyEnvVar]; // Dosya yolunu alıyoruz

        if (!jsonKeyPath) {
            console.log(`Error: Environment variable for ${jsonKeyEnvVar} not found!`);
            continue;
        }

        const startIndex = i * URLS_PER_ACCOUNT;
        const endIndex = startIndex + URLS_PER_ACCOUNT;
        const urlsForAccount = allUrls.slice(startIndex, endIndex);

        const authClient = await setupHttpClient(jsonKeyPath); // Dosya yolunu setupHttpClient'e gönderiyoruz
        const result = await indexURLs(authClient, urlsForAccount);

        report.push({ account: i + 1, ...result });
    }

    return NextResponse.json(report, { status: 200 });
}
//test