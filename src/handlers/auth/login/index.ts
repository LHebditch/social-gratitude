import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { APIResponse } from "../../../lib/response";
import { BadRequestError, DynamoGetError, DynamoPutError, KMSEncryptError, MisconfiguredServiceError, NotFoundError, SendEmailError } from "../../../lib/exceptions";
import { AuthToken, LoginPayload } from "../../../lib/models/user";
import crypto from 'crypto'
import KMS from "aws-sdk/clients/kms";
import { v4 as uuidv4 } from "uuid";
import dynamodb from "aws-sdk/clients/dynamodb";
import SES from "aws-sdk/clients/ses";

const dynamo = new dynamodb.DocumentClient();
const kms = new KMS()
const ses = new SES();

export const handler: APIGatewayProxyHandlerV2 = async (ev) => {
    console.log('Initiating login')
    try {
        const { email } = parseBody(ev.body)
        await checkForUser(email)
        // generate cryptographically safe OTP token
        const token = crypto.randomInt(100000, 999999)
        const encryptedToken = await encryptToken(token);
        const tokenId = await saveToken(encryptedToken, email)
        await sendTokenEmail(token, email);
        return APIResponse(200, { tokenId });
    } catch (e: unknown) {
        return handleError(e)
    }
}

const handleError = (e: unknown) => {
    if (e instanceof BadRequestError) {
        return APIResponse(400, e.message);
    }

    if (e instanceof MisconfiguredServiceError || e instanceof DynamoPutError || e instanceof KMSEncryptError) {
        console.error('Failed to initiate login: ', e.message);
        return APIResponse(500);
    }

    if (e instanceof DynamoGetError) {
        console.error('no user found. cannot initiate login')
    }

    console.error("An unknown error has occured");
    return APIResponse(500, "something aweful's happened...");
}

const sendTokenEmail = async (token: number, email: string) => {
    try {
        const params: SES.Types.SendEmailRequest = {
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
                        <p>You're token is: ${token}.</p>
                        <p>This token will expire in 15 minutes.</p>
                        </body>
                        </html>`,
                        Charset: 'UTF-8'
                    }
                }
            },
            Source: 'noreply@l-h-solutions.awsapps.com',
        }
        ses.sendEmail(params).promise()
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new SendEmailError(e.message)
        }
        throw e;
    }
}

const encryptToken = async (token: number): Promise<string> => {
    if (!process.env.AUTH_KMS_KEY_ID) {
        throw new MisconfiguredServiceError("Missing kms environment variables");
    }

    try {
        const encryptedToken = await kms.encrypt({
            KeyId: process.env.AUTH_KMS_KEY_ID,
            Plaintext: `${token}`,
        }).promise();
        if (!encryptedToken.CiphertextBlob) {
            throw new KMSEncryptError("no cypher created during encryption");
        }
        return encryptedToken.CiphertextBlob.toString('base64');
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new KMSEncryptError(e.message)
        }
        throw e;
    }
}

const checkForUser = async (email: string) => {
    if (!process.env.AUTH_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    try {
        const { Item } = await dynamo.get({
            TableName: process.env.AUTH_TABLE_NAME,
            Key: {
                _pk: `user/${email}`,
                _sk: 'USER'
            }
        }).promise();

        if (!Item) {
            throw new NotFoundError('no user found');
        }
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new DynamoGetError(e.message)
        }
        throw e;
    }
}

const saveToken = async (token: string, email: string) => {
    if (!process.env.AUTH_TABLE_NAME || !process.env.TOKEN_TTL_MINUTES) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    try {
        const tokenId = uuidv4();
        const dto: AuthToken = {
            token,
            attempts: 0,
            _pk: `user/${email}/token`,
            _sk: tokenId,
            _ttl: Math.floor((new Date().getTime() + parseInt(process.env.TOKEN_TTL_MINUTES) * 60 * 1000) / 1000)
        }

        await dynamo.put({
            TableName: process.env.AUTH_TABLE_NAME,
            Item: dto,
        }).promise();

        return tokenId;
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new DynamoPutError(e.message)
        }
        throw e;
    }
}

const parseBody = (body?: string): LoginPayload => {
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