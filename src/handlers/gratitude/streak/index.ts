import { APIGatewayProxyHandlerV2WithLambdaAuthorizer } from "aws-lambda";

import type { AuthorizerResponse } from "../../../lib/models/user";

// aws
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIResponse } from "../../../lib/response";
import { BadRequestError, MisconfiguredServiceError } from "../../../lib/exceptions";
import { Streak } from "../../../lib/models/journal";
import { formattedDate } from "../utils";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient());

export const handler: APIGatewayProxyHandlerV2WithLambdaAuthorizer<AuthorizerResponse> = async (ev) => {
    const userId = ev.requestContext.authorizer.lambda.userId;

    try {
        if (!userId) {
            throw new BadRequestError("no user id supplied")
        }
        const streak = await getStreak(userId)
        return APIResponse(200, { streak })
    } catch (e: unknown) {
        console.error(e)
        return APIResponse(200, 0)
    }
}


const getStreak = async (userid: string): Promise<number> => {
    if (!process.env.GRATITUDE_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    const getCommand = new GetCommand({
        TableName: process.env.GRATITUDE_TABLE_NAME,
        Key: {
            _pk: userid,
            _sk: 'STREAK',
        }
    })
    const { Item } = await dynamo.send(getCommand);

    const today = formattedDate()
    const yesterday = formattedDate(new Date(Date.now() - (24 * 60 * 60 * 1000)))

    const streak = (Item as Streak);

    if (streak?.streakEndDate === today || streak?.streakEndDate === yesterday) {
        return streak?.currentStreak ?? 0
    }

    return 0;
}