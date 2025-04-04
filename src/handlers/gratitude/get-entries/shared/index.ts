import { APIGatewayProxyHandlerV2 } from "aws-lambda";

import { BadRequestError, DynamoGetError, MisconfiguredServiceError, } from "../../../../lib/exceptions";

// aws
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { APIResponse } from "../../../../lib/response";
import { formattedDate } from "../../utils";
import { Entry } from "../../../../lib/models/journal";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient());

export type EntryView = {
    entry: string
    userId: string
    id: string
    index: string
    likes: number
}

export const handler: APIGatewayProxyHandlerV2 = async () => {

    try {
        const entries = await getEntries()
        return APIResponse(200, entries)
    } catch (e: unknown) {
        return handleError(e)
    }
}

const getEntries = async (): Promise<EntryView[]> => {
    if (!process.env.GRATITUDE_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    try {
        const getCommand = new QueryCommand({
            TableName: process.env.GRATITUDE_TABLE_NAME,
            IndexName: 'gsi2',
            KeyConditionExpression: 'gsi2 = :id',
            ExpressionAttributeValues: {
                ':id': `social/${formattedDate()}`
            }

        });
        const { Items } = await dynamo.send(getCommand);

        if (!Items || !Items.length) {
            return []
        }

        return (Items as Entry[]).map(mapEntryToView).filter(e => e.entry.trim() !== '')

    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new DynamoGetError(e.message)
        }
        throw e;
    }
}

const mapEntryToView = ({ entry, _pk, id, index }: Entry): EntryView => {
    const [a, userId, b] = _pk.split('/')

    return {
        entry,
        id,
        index: `${index}`,
        userId,
        likes: 0 // TODO --- this
    }
}

const handleError = (e: unknown) => {
    if (e instanceof MisconfiguredServiceError) {
        console.warn("service is misconfigured")
        return APIResponse(500)
    }

    if (e instanceof DynamoGetError) {
        console.warn("service falied when calling dynamo", e.message)
        return APIResponse(500)
    }

    if (e instanceof BadRequestError) {
        console.warn("invalid request")
        return APIResponse(400)
    }

    if (e instanceof Error) {
        console.error("service failed for some unhandled reason", e.message)
    } else {
        console.error("service failed for unknown reason", e)
    }

    return APIResponse(500)
}