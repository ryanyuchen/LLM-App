import React from "react";
import { DataAPIClient } from "@datastax/astra-db-ts";
import { PuppeteerWebBaseLoader } from "langchain/document_loaders/web/puppeteer";
import OpenAI from "openai";

import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

import dotenv from "dotenv";
dotenv.config();

const { 
    ASTRA_DB_TOKEN, 
    ASTRA_DB_ENDPOINT, 
    ASTRA_DB_COLLECTION, 
    OPENAI_KEY 
} = process.env;

const openai = new OpenAI({ apiKey: OPENAI_KEY });

const f1Data = [
    'https://en.wikipedia.org/wiki/Formula_One'
]

const client = new DataAPIClient(ASTRA_DB_TOKEN);
const db = client.db(ASTRA_DB_ENDPOINT);

// https://blog.lancedb.com/chunking-techniques-with-langchain-and-llamaindex/
const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 512,
    chunkOverlap: 100
})

const similarityMetric = ["dot_product", "cosine", "eucidean"];
const createCollection = async (similarityMetric) => {
    const res = await db.createCollection(ASTRA_DB_COLLECTION, {
        vector:  {
            dimension: 1536,
            metric: similarityMetric[0]
        }
    });
}

const loadSampleData = async () => {
    const collection = db.collection(ASTRA_DB_COLLECTION);
    for await (const url of f1Data) {
        const content = await scrapePage(url);
        const chunks = await splitter.splitText(content)
        for await (const chunk of chunks) {
            const embedding = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: chunk,
                encoding_format: "float"
            })

            const vector = embedding.data[0].embedding;

            const res  = await collection.insertOne({
                $vector: vector,
                text: chunk
            })
        }
    }
}

const scrapePage = async (url) => {
    const loader = new PuppeteerWebBaseLoader(url, {
        launchOptions: {
            headless: true
        },
        gotoOptions: {
            waitUntil: "domcontentloaded"
        },
        evaluate: async (page, browser) => {
            const result = await page.evaluate(() => document.body.innerHTML);
            await browser.close()
            return result
        }
    })

    return ( await loader.scrape() ) 
}

createCollection().then(() => loadSampleData())
// npm run seed