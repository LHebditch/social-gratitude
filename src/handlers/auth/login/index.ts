import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { APIResponse } from "../../../lib/response";
import { BadRequestError, DynamoGetError, DynamoPutError, KMSEncryptError, MisconfiguredServiceError, NotFoundError, SendEmailError } from "../../../lib/exceptions";
import type { AuthToken, LoginPayload, User } from "../../../lib/models/user";
import crypto from 'crypto'
import { v4 as uuidv4 } from "uuid";
// aws
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { KMSClient, EncryptCommand } from "@aws-sdk/client-kms";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { getUser } from "../../../services/auth-service";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient());
const kms = new KMSClient()
const ses = new SESClient();

export const handler: APIGatewayProxyHandlerV2 = async (ev) => {
    console.log('Initiating login')
    try {
        const { email } = parseBody(ev.body)
        const user = await getUser(email)
        // generate cryptographically safe OTP token
        console.log("generate token")
        const token = crypto.randomInt(100000, 999999);
        const encryptedToken = await encryptToken(token);
        const tokenId = await saveToken(encryptedToken, email, user.id)
        await sendTokenEmail(token, email);
        console.log('succesfully sent token');
        return APIResponse(200, { tokenId });
    } catch (e: unknown) {
        console.error("an error has occured")
        return handleError(e)
    }
}

const handleError = (e: unknown) => {
    if (e instanceof BadRequestError) {
        return APIResponse(400, e.message);
    }

    if (e instanceof MisconfiguredServiceError || e instanceof DynamoPutError || e instanceof KMSEncryptError) {
        console.error('failed to initiate login: ', e.message);
        return APIResponse(500);
    }

    if (e instanceof DynamoGetError) {
        console.error('no user found. cannot initiate login')
        return APIResponse(404);
    }

    console.error("An unknown error has occured");
    return APIResponse(500, "something aweful's happened...");
}

const sendTokenEmail = async (token: number, email: string) => {
    console.log("attempt to send email")
    if (!process.env.SOURCE_EMAIL) {
        throw new MisconfiguredServiceError("Missing ses environment variables");
    }
    try {
        const params = new SendEmailCommand({
            Destination: {
                ToAddresses: [
                    email,
                ]
            },
            Message: {
                Subject: {
                    Data: 'Gratitude login token',
                    Charset: 'UTF-8'
                },
                Body: {
                    Html: {
                        Data: `<html>
                        <body>
                        <p>Your token is: ${token}.</p>
                        <p>This token will expire in 15 minutes.</p>
                        </body>
                        </html>`,
                        Charset: 'UTF-8'
                    }
                }
            },
            Source: process.env.SOURCE_EMAIL,
        });
        await ses.send(params);
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new SendEmailError(e.message)
        }
        throw e;
    }
}

const encryptToken = async (token: number): Promise<string> => {
    console.log("attept to encrypt token")
    if (!process.env.AUTH_KMS_KEY_ID) {
        throw new MisconfiguredServiceError("Missing kms environment variables");
    }

    try {
        const encryptCommand = new EncryptCommand({
            KeyId: process.env.AUTH_KMS_KEY_ID,
            Plaintext: Buffer.from(`${token}`),
        })
        const { CiphertextBlob } = await kms.send(encryptCommand);
        if (!CiphertextBlob) {
            throw new KMSEncryptError("no cypher created during encryption");
        }
        return Buffer.from(CiphertextBlob).toString('base64');
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new KMSEncryptError(e.message)
        }
        throw e;
    }
}

const saveToken = async (token: string, email: string, userId: string) => {
    console.log("attempt to save token")
    if (!process.env.AUTH_TABLE_NAME || !process.env.TOKEN_TTL_MINUTES) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    try {
        const tokenId = uuidv4();
        const dto: AuthToken = {
            token,
            attempts: 0,
            userId,
            _pk: `user/${email}/token`,
            _sk: tokenId,
            _ttl: Math.floor((new Date().getTime() + parseInt(process.env.TOKEN_TTL_MINUTES) * 60 * 1000) / 1000)
        }

        const putCommand = new PutCommand({
            TableName: process.env.AUTH_TABLE_NAME,
            Item: dto,
        });
        await dynamo.send(putCommand);

        return tokenId;
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new DynamoPutError(e.message)
        }
        throw e;
    }
}

const parseBody = (body?: string): LoginPayload => {
    console.log("parsing body")
    const badRequestError = "Invalid login request";
    if (!body) {
        throw new BadRequestError(badRequestError);
    }
    const payload: LoginPayload = JSON.parse(body);
    if (!payload.email) {
        throw new BadRequestError(badRequestError);
    }

    return payload;
};