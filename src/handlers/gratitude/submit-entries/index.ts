import { APIGatewayProxyHandlerV2WithLambdaAuthorizer } from "aws-lambda";

import { BadRequestError, DynamoPutError, MisconfiguredServiceError } from "../../../lib/exceptions";
import type { AuthorizerResponse } from "../../../lib/models/user";

// aws
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { APIResponse } from "../../../lib/response";
import { v4 as uuidv4 } from "uuid";
import { formattedDate } from "../utils";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient());

type Entries = {
    id?: string
    entry1: string
    entry2: string
    entry3: string
}

export const handler: APIGatewayProxyHandlerV2WithLambdaAuthorizer<AuthorizerResponse> = async (ev) => {
    const userId = ev.requestContext.authorizer.lambda.userId;

    try {
        if (!userId) {
            throw new BadRequestError("no user id supplied")
        }
        const entries: Entries = JSON.parse(ev.body ?? '{}')
        const id = await saveEntries(entries, userId)
        return APIResponse(201, { id })
    } catch (e: unknown) {
        return handleError(e, userId)
    }
}

const handleError = (e: unknown, userId: string) => {
    if (e instanceof MisconfiguredServiceError) {
        console.warn("service is misconfigured")
        return APIResponse(500)
    }

    if (e instanceof DynamoPutError) {
        console.warn("service falied when calling dynamo", e.message)
        return APIResponse(500)
    }

    if (e instanceof BadRequestError) {
        console.warn("invalid request", userId)
        return APIResponse(400)
    }

    if (e instanceof Error) {
        console.error("service failed for some unhandled reason", e.message)
    } else {
        console.error("service failed for unknown reason", e)
    }

    return APIResponse(500)
}

const saveEntries = async (entries: Entries, userId: string): Promise<string> => {
    if (!process.env.GRATITUDE_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    const id = entries.id ?? uuidv4()

    try {
        const putCommand = new BatchWriteCommand({
            RequestItems: {
                [process.env.GRATITUDE_TABLE_NAME]: [
                    createEntry(id, entries.entry1, 0, userId),
                    createEntry(id, entries.entry2, 1, userId),
                    createEntry(id, entries.entry3, 2, userId),
                ]
            }
        })
        await dynamo.send(putCommand)
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new DynamoPutError('failed to save entries: ' + e.message)
        }
        throw e
    }

    return id
}

const createEntry = (id: string, entry: string, index: number, userId: string) => {
    return {
        PutRequest: {
            Item: {
                entry,
                id,
                index,
                _pk: `journal/${userId}/entry`,
                _sk: `${id}/${index}`,
                gsi1: `${userId}/${formattedDate()}`
            }
        }
    }
}

