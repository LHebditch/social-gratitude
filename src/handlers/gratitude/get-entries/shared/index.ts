import { APIGatewayProxyHandlerV2 } from "aws-lambda";

import { BadRequestError, DynamoGetError, MisconfiguredServiceError, } from "../../../../lib/exceptions";

// aws
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { APIResponse } from "../../../../lib/response";
import { formattedDate } from "../../utils";
import { Entry } from "../../../../lib/models/journal";
import { dynamo } from "../../../../lib/dynamo";

const DEFAULT_PAGE_SIZE = 25;

export type EntryView = {
    entry: string
    userId: string
    id: string
    index: string
    likes: number
}

export type PaginatedEntryResponse = {
    entries: EntryView[]
    nextToken?: string
}

// Cache TTL in seconds (5 minutes)
const CACHE_TTL = 300;
const CACHE_CONTROL_HEADER = `public, max-age=${CACHE_TTL}`;

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    try {
        // Get pagination token from query parameters
        const nextToken = event.queryStringParameters?.nextToken;
        const response = await getEntries(nextToken)

        // Add cache control headers for API Gateway caching
        return APIResponse(200, response, {
            'Cache-Control': CACHE_CONTROL_HEADER
        });
    } catch (e: unknown) {
        return handleError(e)
    }
}

const getEntries = async (nextToken?: string): Promise<PaginatedEntryResponse> => {
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
            },
            Limit: DEFAULT_PAGE_SIZE,
            ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString()) : undefined,
        });

        const { Items, LastEvaluatedKey } = await dynamo.send(getCommand);

        if (!Items || !Items.length) {
            return { entries: [] }
        }

        const entries = (Items as Entry[])
            .map(mapEntryToView)
            .filter(e => e.entry.trim() !== '');

        // Convert LastEvaluatedKey to base64 for the next token
        const newNextToken = LastEvaluatedKey
            ? Buffer.from(JSON.stringify(LastEvaluatedKey)).toString('base64')
            : undefined;

        return {
            entries,
            nextToken: newNextToken
        }

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