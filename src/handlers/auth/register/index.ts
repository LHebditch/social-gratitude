import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import { APIResponse } from "../../../lib/response";
import {
    BadRequestError,
    DynamoPutError,
    MisconfiguredServiceError,
} from "../../../lib/exceptions";
import { SignupPayload, User } from "../../../lib/models/user";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient();
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

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
        console.error('failed to create new user: ', e.message);
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
        const cmd = new PutCommand({
            TableName: process.env.AUTH_TABLE_NAME,
            Item: user,
            ConditionExpression: "attribute_not_exists(#pk)",
            ExpressionAttributeNames: { "#pk": "_pk" }
        })
        await ddbDocClient.send(cmd);
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new DynamoPutError(e.message);
        }
        throw e;
    }
};

const buildDTO = (payload: SignupPayload): User => {
    const id = uuidv4()
    return {
        ...payload,
        id,
        _pk: `user/${payload.email}`,
        _sk: `USER`,
        createdDate: new Date().toISOString(),
        gsi1: id,
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
