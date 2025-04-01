import { DynamoDBStreamHandler } from "aws-lambda";
import { EntryLike, InfluenceScore } from "../../../../lib/models/journal";

import { AttributeValue, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchGetCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { MisconfiguredServiceError } from "../../../../lib/exceptions";
import { unmarshall } from '@aws-sdk/util-dynamodb'

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient());

type Score = {
    [key: string]: number
}

export const handler: DynamoDBStreamHandler = async (ev) => {
    // we only care about inserted items
    const records = ev.Records
        .filter(e => e.eventName === "INSERT")
        .map(e => unmarshall(e.dynamodb.NewImage as Record<string, AttributeValue>)) as EntryLike[];

    const scores = {} as Score

    for (let r of records) {
        const id = `${r.creatorId}`
        scores[id] = (scores[id] ?? 0) + 1
    }

    try {
        // get everything related to the above
        const keys = Object.keys(scores)
        const existingInfluenceScores = await getFromDynamo(keys)
        const newInfluenceScores: InfluenceScore[] = keys
            .filter(k => !existingInfluenceScores.some(e => e._pk === k))
            .map(k => ({
                _pk: k,
                _sk: 'INFLUENCE_SCORE',
                score: 0,
            }))

        const influenceScores = [
            ...existingInfluenceScores,
            ...newInfluenceScores
        ];

        // increment scores
        for (let is of influenceScores) {
            is.score += (scores[is._pk] ?? 0)
        }
        // write scores
        await saveToDynamo(influenceScores)
    } catch (e: unknown) {
        if (e instanceof Error) {
            console.error(e)
        }
        console.error('Something strange is afoot...', e)
    }

}

const saveToDynamo = async (scores: InfluenceScore[]) => {
    if (!process.env.GRATITUDE_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    if (scores.length === 0) return

    const putCommand = new BatchWriteCommand({
        RequestItems: {
            [process.env.GRATITUDE_TABLE_NAME]: scores.map(s => ({
                PutRequest: {
                    Item: s,
                }
            }))
        }
    })
    await dynamo.send(putCommand)
}

const getFromDynamo = async (pks: string[]): Promise<InfluenceScore[]> => {
    if (!process.env.GRATITUDE_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    if (pks.length === 0) return []

    const keys = pks.map((pk) => ({
        _pk: pk,
        _sk: 'INFLUENCE_SCORE',
    }))

    const cmd = new BatchGetCommand({
        RequestItems: {
            [process.env.GRATITUDE_TABLE_NAME]: {
                Keys: keys,
            }
        }
    })

    const res = await dynamo.send(cmd)
    if (res.UnprocessedKeys != null && Object.keys(res.UnprocessedKeys).length > 0) {
        console.error('not all entries were requested...', res)
        // handle retry...but UnprocessedKeys is being incredibly annoying
    }
    console.debug('returning results from dynamo')
    return res.Responses[process.env.GRATITUDE_TABLE_NAME] as InfluenceScore[]
}