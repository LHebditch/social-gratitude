import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import { APIResponse } from "../../../lib/response";
import {
    BadRequestError,
    DynamoPutError,
    MisconfiguredServiceError,
} from "../../../lib/exceptions";
import { SignupPayload, User } from "../../../lib/models/user";

import dynamodb from "aws-sdk/clients/dynamodb";
const DYNAMO = new dynamodb.DocumentClient();

export const handler: APIGatewayProxyHandlerV2 = async (ev) => {
    try {
        const payload = parseBody(ev.body);
        const dto = buildDTO(payload);
        await saveNewUser(dto);
        return APIResponse(201);
    } catch (e: unknown) {
        return handleError(e);
    }
};

const handleError = (e: unknown) => {
    if (e instanceof BadRequestError) {
        return APIResponse(400, e.message);
    }

    if (e instanceof MisconfiguredServiceError || e instanceof DynamoPutError) {
        console.error(e.message);
        return APIResponse(500);
    }

    console.error("An unknown error has occured");
    return APIResponse(500, "something aweful's happened...");
}

const saveNewUser = async (user: User): Promise<void> => {
    if (!process.env.AUTH_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamo environment variables");
    }
    try {
        await DYNAMO.put({
            TableName: process.env.AUTH_TABLE_NAME,
            Item: user,
            ConditionExpression: "#pk != :pk",
            ExpressionAttributeNames: { "#pk": "_pk" },
            ExpressionAttributeValues: {
                ":pk": user._pk,
            },
        }).promise();
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new DynamoPutError(e.message);
        }
        throw e;
    }
};

const buildDTO = (payload: SignupPayload): User => {
    return {
        ...payload,
        id: uuidv4(),
        _pk: `user/${payload.email}`,
        _sk: `USER`,
        createdDate: new Date().toISOString(),
    };
};

const parseBody = (body?: string): SignupPayload => {
    const badRequestError = "Invalid signup request";
    if (!body) {
        throw new BadRequestError(badRequestError);
    }
    const payload: SignupPayload = JSON.parse(body);
    if (!payload.displayName || !payload.email) {
        throw new BadRequestError(badRequestError);
    }

    return payload;
};
