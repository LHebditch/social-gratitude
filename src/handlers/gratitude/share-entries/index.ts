import { APIGatewayProxyHandlerV2WithLambdaAuthorizer } from "aws-lambda";

import { BadRequestError, DynamoGetError, MisconfiguredServiceError } from "../../../lib/exceptions";
import type { AuthorizerResponse } from "../../../lib/models/user";

// aws
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand, SendMessageRequest } from "@aws-sdk/client-sqs";
import { APIResponse } from "../../../lib/response";
import { formattedDate } from "../utils";
import { Entry } from "../../../lib/models/journal";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient());
const sqs = new SQSClient();

export const handler: APIGatewayProxyHandlerV2WithLambdaAuthorizer<AuthorizerResponse> = async (ev) => {
    const userId = ev.requestContext.authorizer.lambda.userId;

    try {
        if (!userId) {
            throw new BadRequestError("no user id supplied")
        }
        const entries = await getEntries(userId)
        await sendEntriesToQueue(entries);
        // how do we want to share???
        return APIResponse(200)
    } catch (e: unknown) {
        return handleError(e, userId)
    }
}

const sendEntriesToQueue = async (entries: Entry[]) => {
    if (!process.env.GRATITUDE_QUEUE_URL) {
        throw new MisconfiguredServiceError("Missing sqs environment variables");
    }

    const requests = []
    for (let entry of entries) {
        const input: SendMessageRequest = {
            QueueUrl: process.env.GRATITUDE_QUEUE_URL,
            MessageBody: JSON.stringify({
                ...entry,
            }),
        }
        requests.push(sqs.send(new SendMessageCommand(input)))
    }

    const results = await Promise.allSettled(requests)
    const errors = results.filter(r => r.status === "rejected")
    if (errors.length > 0) {
        console.error(`failed to send ${errors.length} out of ${requests.length} entries to queue`, errors)
        console.info("continuing despite sqs failures")
    }

}

const getEntries = async (userId: string): Promise<Entry[]> => {
    if (!process.env.GRATITUDE_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

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
            return []
        }

        return Items as Entry[]
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