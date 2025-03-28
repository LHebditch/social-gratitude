import { APIGatewayProxyHandlerV2WithLambdaAuthorizer } from "aws-lambda";
import { AuthorizerResponse } from "../../../../lib/models/user";


import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { BadRequestError, DynamoPutError, MisconfiguredServiceError } from "../../../../lib/exceptions";
import { APIResponse } from "../../../../lib/response";
import { EntryLike } from "../../../../lib/models/journal";


const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient());

type EntryReactionBody = {
    creatorId: string
    entryId: string
    index: number
}

export const handler: APIGatewayProxyHandlerV2WithLambdaAuthorizer<AuthorizerResponse> = async (ev) => {
    const userId = ev.requestContext.authorizer.lambda.userId;

    try {
        const body: EntryReactionBody = JSON.parse(ev.body)
        await saveEntryReaction(body, userId)
        return APIResponse(200)
    } catch (e: unknown) {
        return handleError(e)
    }
}

const handleError = (e: unknown) => {
    if (e instanceof BadRequestError) {
        return APIResponse(400, e.message);
    }

    if (e instanceof MisconfiguredServiceError) {
        console.error('service is misconfigured: ', e.message);
        return APIResponse(500);
    }

    if (e instanceof DynamoPutError) {
        console.error('failed to store reaction: ' + e.message)
        return APIResponse(400);
    }

    console.error("An unknown error has occured");
    return APIResponse(500, "something aweful has happened...");
}

// in journal table:
// entry _pk is journal/<creatorId>/entry
// entry _sk is <entryid>/<index>
// so we want to store
const saveEntryReaction = async (event: EntryReactionBody, likedById: string) => {
    if (!process.env.GRATITUDE_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    const { creatorId, entryId, index } = event

    if (!index || !creatorId || !entryId) {
        console.warn("invalid body", event)
        throw new BadRequestError("body is invalid")
    }

    const entry: EntryLike = {
        _pk: `reaction/${entryId}/${index}`,
        _sk: likedById,
        likedById,
        index,
        id: entryId,
        value: 1,
        creatorId
    }

    const cmd = new PutCommand({
        TableName: process.env.GRATITUDE_TABLE_NAME,
        Item: entry,
    })
    try {
        await dynamo.send(cmd)
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new DynamoPutError(e.message)
        }
        throw e;
    }
}