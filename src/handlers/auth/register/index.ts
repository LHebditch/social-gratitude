import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import { APIResponse } from "../../../lib/response";
import {
    BadRequestError,
    DynamoPutError,
    MisconfiguredServiceError,
} from "../../../lib/exceptions";
import { SignupPayload, User } from "../../../lib/models/user";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { saveUser } from "../../../services/auth-service";


export const handler: APIGatewayProxyHandlerV2 = async (ev) => {
    try {
        const payload = parseBody(ev.body);
        const dto = buildDTO(payload);
        await saveUser(dto, true);
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

    if (e instanceof ConditionalCheckFailedException) {
        return APIResponse(409)
    }

    console.error("An unknown error has occured");
    return APIResponse(500, "something aweful's happened...");
}

const buildDTO = (payload: SignupPayload): User => {
    if (!payload.email.toLocaleLowerCase().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        throw new BadRequestError('invalid email')
    }
    const id = uuidv4()
    return {
        ...payload,
        id,
        _pk: `user/${payload.email}`,
        _sk: `USER`,
        createdDate: new Date().toISOString(),
        gsi1: id,
        verified: false,
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
