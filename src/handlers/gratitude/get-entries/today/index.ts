import { APIGatewayProxyHandlerV2WithLambdaAuthorizer } from "aws-lambda";

import { BadRequestError, DynamoGetError, DynamoPutError, MisconfiguredServiceError, NotFoundError } from "../../../../lib/exceptions";
import type { AuthorizerResponse } from "../../../../lib/models/user";

// aws
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { APIResponse } from "../../../../lib/response";
import { formattedDate } from "../../utils";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient());

type Entries = {
    id?: string
    entry1: string
    entry2: string
    entry3: string
}

type Entry = {
    id?: string
    entry: string
    index: number
}

export const handler: APIGatewayProxyHandlerV2WithLambdaAuthorizer<AuthorizerResponse> = async (ev) => {
    const userId = ev.requestContext.authorizer.lambda.userId;

    try {
        if (!userId) {
            throw new BadRequestError("no user id supplied")
        }
        const entries = await getEntries(userId)
        return APIResponse(200, entries)
    } catch (e: unknown) {
        return handleError(e, userId)
    }
}

const getEntries = async (userId: string): Promise<Entries> => {
    if (!process.env.GRATITUDE_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    const res: Entries = {
        entry1: '',
        entry2: '',
        entry3: ''
    };

    try {
        const getCommand = new QueryCommand({
            TableName: process.env.GRATITUDE_TABLE_NAME,
            IndexName: 'gsi1',
            KeyConditionExpression: 'gsi1 = :id',
            ExpressionAttributeValues: {
                ':id': `${userId}/${formattedDate()}`
            }

        });
        const { Items } = await dynamo.send(getCommand);

        if (!Items || !Items.length) {
            return res
        }

        for (let i of Items as Entry[]) {
            const entryId = ['entry1', 'entry2', 'entry3']
            res[entryId[i.index]] = i.entry
            res.id = i.id // they should all be the same...so
        }
        return res
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new DynamoGetError(e.message)
        }
        throw e;
    }
}
const handleError = (e: unknown, userId: string) => {
    if (e instanceof MisconfiguredServiceError) {
        console.warn("service is misconfigured")
        return APIResponse(500)
    }

    if (e instanceof DynamoGetError) {
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