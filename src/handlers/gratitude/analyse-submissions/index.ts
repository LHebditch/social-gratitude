import { SQSHandler } from "aws-lambda";
import Sentiment from "sentiment";
import { Entry } from "../../../lib/models/journal";
import { DynamoPutError, MisconfiguredServiceError } from "../../../lib/exceptions";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient());

export const handler: SQSHandler = async ({ Records }) => {
    const assessedRecords: Entry[] = []
    for (let record of Records) {
        const gratitudeEntry = JSON.parse(record.body) as Entry;

        if (assesInput(gratitudeEntry.entry).score < 0) {
            // if we have a negative senitment
            console.warn("do not share publically, negative sentiment detected...");
            continue;
        }

        assessedRecords.push(gratitudeEntry);
    }

    try {
        await saveSocialEntries(assessedRecords)
    } catch (e: unknown) {
        handleError(e)
    }
}

const handleError = (e: unknown) => {
    if (e instanceof MisconfiguredServiceError) {
        console.error("service is misconfigured")
    }

    if (e instanceof DynamoPutError) {
        console.error("service falied when calling dynamo", e.message)
    }

    if (e instanceof Error) {
        console.error("service failed for some unhandled reason", e.message)
    } else {
        console.error("service failed for unknown reason", e)
    }
}

const assesInput = (input: string): Sentiment.AnalysisResult => {
    var s = new Sentiment();
    // todo - consider this...how can we tell what language they are using?
    // todo - register other languages?
    // s.registerLanguage("fr", <build-sentiment-for-fr>);
    const options = {
        extras: {
            nazi: -10,
            nazis: -10,
        },
        language: "en", // can we infer this?
    };
    var result = s.analyze(input, options);
    return result;
};

const saveSocialEntries = async (entries: Entry[]) => {
    if (!process.env.GRATITUDE_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    try {
        const putCommand = new BatchWriteCommand({
            RequestItems: {
                [process.env.GRATITUDE_TABLE_NAME]: entries.map(e => createEntryPutRequest(e))
            }
        })
        await dynamo.send(putCommand)
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new DynamoPutError('failed to save entries: ' + e.message)
        }
        throw e
    }
}

const createEntryPutRequest = (entry: Entry) => {
    const [_, date] = entry.gsi1.split('/')

    return {
        PutRequest: {
            Item: {
                ...entry,
                gsi2: `social/${date}`
            },
        }
    }
}