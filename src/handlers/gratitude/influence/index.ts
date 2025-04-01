import { APIGatewayProxyHandlerV2WithLambdaAuthorizer } from "aws-lambda";

import type { AuthorizerResponse } from "../../../lib/models/user";

// aws
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIResponse } from "../../../lib/response";
import { BadRequestError, MisconfiguredServiceError } from "../../../lib/exceptions";
import { InfluenceScore } from "../../../lib/models/journal";


const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient());

export const handler: APIGatewayProxyHandlerV2WithLambdaAuthorizer<AuthorizerResponse> = async (ev) => {
    const userId = ev.requestContext.authorizer.lambda.userId;

    try {
        if (!userId) {
            throw new BadRequestError("no user id supplied")
        }
        const score = await getScore(userId)
        return APIResponse(200, score)
    } catch (e: unknown) {
        console.error(e)
        return APIResponse(200, 0)
    }
}


const getScore = async (userid: string): Promise<number> => {
    if (!process.env.GRATITUDE_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    const getCommand = new GetCommand({
        TableName: process.env.GRATITUDE_TABLE_NAME,
        Key: {
            _pk: userid,
            _sk: 'INFLUENCE_SCORE',
        }
    })
    const { Item } = await dynamo.send(getCommand);

    return (Item as InfluenceScore)?.score ?? 0
}