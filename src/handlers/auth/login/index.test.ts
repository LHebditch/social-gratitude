

import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { handler } from ".";
import type { APIGatewayProxyEventV2 as Event, APIGatewayProxyStructuredResultV2 as Result, Context } from "aws-lambda";

import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { KMSClient, EncryptCommand } from "@aws-sdk/client-kms";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesMock = mockClient(SESClient)
const dynamoMock = mockClient(DynamoDBDocumentClient)
const kmsMock = mockClient(KMSClient)

describe('test login', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = {
            AUTH_TABLE_NAME: 'authTable',
            TOKEN_TTL_MINUTES: '15',
            AUTH_KMS_KEY_ID: 'some-key',
            SOURCE_EMAIL: 'test@test.com'
        };
    });

    afterAll(() => {
        process.env = OLD_ENV; // Restore old environment
    });

    it('should send email', async () => {
        sesMock.on(SendEmailCommand).resolves({});
        dynamoMock.on(PutCommand).resolves({});
        dynamoMock.on(GetCommand).resolves({ Item: {} });
        kmsMock.on(EncryptCommand).resolves({ CiphertextBlob: Buffer.from('test') });

        const input = {
            body: '{ "email": "test@test.com" }',
        } as Event;

        const res = await handler(input, {} as Context, jest.fn())

        expect((res as Result).statusCode).toBe(200)
        expect(sesMock).toHaveReceivedCommand(SendEmailCommand)
        expect(kmsMock).toHaveReceivedCommand(EncryptCommand)
        expect(dynamoMock).toHaveReceivedCommand(PutCommand)
        expect(dynamoMock).toHaveReceivedCommand(GetCommand)
    })
})