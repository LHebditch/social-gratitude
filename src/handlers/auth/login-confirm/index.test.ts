

import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { handler } from ".";
import type { APIGatewayProxyEventV2 as Event, APIGatewayProxyStructuredResultV2 as Result, Context } from "aws-lambda";

import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { KMSClient, DecryptCommand } from "@aws-sdk/client-kms";


const dynamoMock = mockClient(DynamoDBDocumentClient)
const kmsMock = mockClient(KMSClient)

describe('Login complete', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = {
            AUTH_TABLE_NAME: 'authTable',
            AUTH_KMS_KEY_ID: 'some-key',
            MAX_ATTEMPTS: '3',
            JWT_SECRET: 'some-secret',
            JWT_ISSUER: 'some-iss',
            JWT_AUD: 'some-aud',
        };
    });

    afterAll(() => {
        process.env = OLD_ENV; // Restore old environment
    });

    it('should return jwt', async () => {
        dynamoMock.on(PutCommand).resolves({});
        dynamoMock.on(GetCommand).resolves({
            Item: {
                token: Buffer.from('123').toString('base64'),
                attempts: 0,
                userId: 'test',
                _pk: '',
                _sk: '',
                _ttl: 0
            }
        });
        kmsMock.on(DecryptCommand).resolves({ Plaintext: Buffer.from('123') });

        const input = {
            body: '{ "email": "test@test.com", "token": "123" }',
        } as Event;
        input.pathParameters = { tokenId: 'test-token' }

        const res = await handler(input, {} as Context, jest.fn()) as Result

        expect(res.statusCode).toBe(200)
        expect(res.body).toContain('jwt')
        expect(kmsMock).toHaveReceivedCommand(DecryptCommand)
        expect(dynamoMock).toHaveReceivedCommand(PutCommand)
        expect(dynamoMock).toHaveReceivedCommand(GetCommand)
    })
})