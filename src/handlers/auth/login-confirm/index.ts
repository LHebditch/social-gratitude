import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { APIResponse } from "../../../lib/response";
import { BadRequestError, DynamoGetError, DynamoPutError, KMSDecryptError, MisconfiguredServiceError, NotFoundError } from "../../../lib/exceptions";
import { AuthToken, LoginPayload } from "../../../lib/models/user";
import jwt from "jsonwebtoken"

// aws
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { KMSClient, DecryptCommand } from "@aws-sdk/client-kms";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient());
const kms = new KMSClient()

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    try {
        const { tokenId } = event.pathParameters
        const { email, token } = parseBody(event.body, tokenId)
        const authToken = await getToken(email, tokenId)
        const { attempts, token: encryptedToken, userId } = authToken;
        const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS ?? '3')
        if (attempts > maxAttempts) {
            console.warn("max otp attempts surpassed")
            return APIResponse(401)
        }

        const storedToken = await decryptToken(encryptedToken)
        if (token === storedToken) {
            await incrementsAttempts(authToken, maxAttempts)
            return APIResponse(200, { jwt: generateJWT(userId) })
        }

        await incrementsAttempts(authToken, 1)
        return APIResponse(401)
    } catch (e: unknown) {
        return handleError(e)
    }
}

const handleError = (e: unknown) => {
    if (e instanceof BadRequestError) {
        return APIResponse(400, e.message);
    }

    if (e instanceof MisconfiguredServiceError || e instanceof DynamoPutError || e instanceof KMSDecryptError) {
        console.error('failed to confirm login: ', e.message);
        return APIResponse(500);
    }

    if (e instanceof DynamoGetError) {
        console.error('no token found')
        return APIResponse(404);
    }

    console.error("An unknown error has occured");
    return APIResponse(500, "something aweful's happened...");
}

const generateJWT = (userId: string): string => {
    console.warn('generating jwt')
    if (!process.env.JWT_SECRET) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '12h' })
}

const incrementsAttempts = async (authToken: AuthToken, incr: number) => {
    console.warn('incorrect token provided, incrementing attempts')
    if (!process.env.AUTH_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    try {
        const getCommand = new PutCommand({
            TableName: process.env.AUTH_TABLE_NAME,
            Item: {
                ...authToken,
                attempts: authToken.attempts + incr,
            }
        })
        await dynamo.send(getCommand);
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new DynamoPutError(e.message)
        }
        throw e;
    }
}

const decryptToken = async (encryptedToken: string): Promise<string> => {
    if (!process.env.AUTH_KMS_KEY_ID) {
        throw new MisconfiguredServiceError("Missing kms environment variables");
    }

    try {
        const decryptCommand = new DecryptCommand({
            KeyId: process.env.AUTH_KMS_KEY_ID,
            CiphertextBlob: Buffer.from(encryptedToken, 'base64'),
        })
        const { Plaintext } = await kms.send(decryptCommand)
        return Buffer.from(Plaintext ?? '').toString('ascii');
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new KMSDecryptError(e.message)
        }
        throw e;
    }
}

const getToken = async (email: string, tokenId: string): Promise<AuthToken> => {
    console.log("retreiving token for db")
    if (!process.env.AUTH_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    try {
        const getCommand = new GetCommand({
            TableName: process.env.AUTH_TABLE_NAME,
            Key: {
                _pk: `user/${email}/token`,
                _sk: tokenId,
            }
        })
        const { Item } = await dynamo.send(getCommand);
        if (!Item) {
            throw new NotFoundError('no token item found');
        }
        return (Item as AuthToken)
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new DynamoGetError(e.message)
        }
        throw e;
    }
}

const parseBody = (body?: string, tokenId?: string): LoginPayload => {
    console.log("parsing body")
    const badRequestError = "Invalid login request";
    if (!tokenId) {
        throw new BadRequestError(badRequestError + ": missing token id");
    }
    if (!body) {
        throw new BadRequestError(badRequestError + ": no body provided");
    }
    const payload: LoginPayload = JSON.parse(body);
    if (!payload.email || !payload.token) {
        throw new BadRequestError(badRequestError);
    }

    return payload;
};