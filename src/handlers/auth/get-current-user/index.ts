import { APIGatewayProxyHandlerV2WithLambdaAuthorizer } from "aws-lambda";

import { BadRequestError, DynamoGetError, MisconfiguredServiceError, NotFoundError } from "../../../lib/exceptions";
import type { AuthorizerResponse, User } from "../../../lib/models/user";

// aws
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { APIResponse } from "../../../lib/response";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient());

export const handler: APIGatewayProxyHandlerV2WithLambdaAuthorizer<AuthorizerResponse> = async (ev) => {
    const userId = ev.requestContext.authorizer.lambda.userId;

    try {
        if (!userId) {
            throw new BadRequestError("no user id supplied")
        }

        console.info("attempting to find user")
        const { displayName, email } = await getUser(userId)
        console.info("user found")
        return APIResponse(200, {
            displayName,
            email,
        })
    } catch (e: unknown) {
        return handleError(e, userId)
    }
}

const handleError = (e: unknown, userId: string) => {
    if (e instanceof MisconfiguredServiceError) {
        console.warn("service is misconfigured")
        return APIResponse(500)
    }

    if (e instanceof DynamoGetError) {
        console.warn("service failed to call dynamo", e.message)
        return APIResponse(500)
    }

    if (e instanceof NotFoundError) {
        console.warn("no user in system", userId)
        return APIResponse(404)
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

const getUser = async (id: string): Promise<User> => {
    if (!process.env.AUTH_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    try {
        const getCommand = new QueryCommand({
            TableName: process.env.AUTH_TABLE_NAME,
            IndexName: 'gsi1',
            KeyConditionExpression: 'gsi1 = :id',
            ExpressionAttributeValues: {
                ':id': id
            }

        });
        const { Items } = await dynamo.send(getCommand);

        if (!Items || !Items.length) {
            throw new NotFoundError('no user found');
        }
        return Items[0] as User
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new DynamoGetError(e.message)
        }
        throw e;
    }
}