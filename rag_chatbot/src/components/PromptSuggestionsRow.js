import React from "react";
import OpenAI from "openai";
import { OpenAIStream, StreamingTextResponse } from "ai";
import { DataAPIClient } from "@datastax/astra-db-ts";


export default function PromptSuggestionsRow () {
    const prompts = [
        "Who is highest pay in F1"
    ]

    const handlePrompt = async ( promptText ) => {
        const msg = {
            id: crypto.randomUUID(),
            content: promptText,
            role: "user"
        }

        try {
            const response = await fetch('/api/write_deployment_params_ab_json', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(
                    {
                        expName: expName,
                        data: JSON.stringify(experiments)
                    }
                )
            });

            const messages = await response.json();
            const latestMessage = messages[messages.length - 1];

            let docContext = "";

            const embedding = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: latestMessage,
                encoding_format: "float"
            })

            try {
                const collection = await db.collection(ASTRA_DB_COLLECTION);
                const cursor = collection.find(null, {
                    sort: {
                        $vector: embedding.data[0].embedding,
                    },
                    limit: 10
                })
            } catch (error) {
                console.error("Error query db: ", error);
            }

            const documents = cursor.toArray();
            const docsMap = documents.map(doc => doc.text);

            docContext = JSON.stringify(docsMap);

        } catch (error) {
            console.error("Error handling prompt: ", error);
        }

        const template = {
            role: "system",
            content: `You are AI assistant who knows everything about Formula One.
            Use the below context to augment what you know about Formula One racing.
            The context will provide you with the most recent page data from wikipedia.
            If the context doesn't include the information you need answer based on your existing knowledge.
            ------------------
            START CONTEXT
            ${docContext}
            END CONTEXT
            -------------------
            QUESTION: ${latestMessage}
            `
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4",
            stream: true,
            messages: [template, ...messages]
        })

        const stream = OpenAIStream(response);

        return new StreamingTextResponse(stream);
    }

    const { 
        ASTRA_DB_TOKEN, 
        ASTRA_DB_ENDPOINT, 
        ASTRA_DB_COLLECTION, 
        OPENAI_KEY 
    } = process.env;

    const openai = new OpenAI({ apiKey: OPENAI_KEY });

    const client = new DataAPIClient(ASTRA_DB_TOKEN);
    const db = client.db(ASTRA_DB_ENDPOINT)

}