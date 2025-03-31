import { APIGatewayProxyHandlerV2WithLambdaAuthorizer } from "aws-lambda";
import { AuthorizerResponse } from "../../../../lib/models/user";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { BadRequestError, DynamoGetError, MisconfiguredServiceError } from "../../../../lib/exceptions";
import { APIResponse } from "../../../../lib/response";
import { EntryLike } from "../../../../lib/models/journal";


const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient());

type Body = {
    entries: string[]
}

export const handler: APIGatewayProxyHandlerV2WithLambdaAuthorizer<AuthorizerResponse> = async (ev) => {
    const userId = ev.requestContext.authorizer.lambda.userId;
    try {
        const body: Body = JSON.parse(ev.body)
        const res = await getEntryReactions(body.entries, userId)
        return APIResponse(200, {
            liked: res.map(e => e._pk.replace('reaction/', ''))
        })
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

    if (e instanceof DynamoGetError) {
        console.error('failed to store reaction: ' + e.message)
        return APIResponse(404);
    }

    console.error("An unknown error has occured");
    return APIResponse(500, "something aweful has happened...");
}

const getEntryReactions = async (ids: string[], userId: string) => {
    if (!process.env.GRATITUDE_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    const keys = ids.map(i => ({
        _pk: `reaction/${i}`,
        _sk: userId,
    }))


    try {
        return await getFromDynamo(keys)
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new DynamoGetError(e.message)
        }
        throw e;
    }
}

const getFromDynamo = async (keys: Record<string, string>[]): Promise<EntryLike[]> => {
    const cmd = new BatchGetCommand({
        RequestItems: {
            [process.env.GRATITUDE_TABLE_NAME]: {
                Keys: keys,
            }
        }
    })

    const res = await dynamo.send(cmd)
    if (res.UnprocessedKeys != null) {
        console.error('not all entries were requested...', res)
        // handle retry...but UnprocessedKeys is being incredibly annoying
    }
    return res.Responses[process.env.GRATITUDE_TABLE_NAME] as EntryLike[]
}