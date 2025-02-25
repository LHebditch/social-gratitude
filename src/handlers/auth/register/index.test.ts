import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '.';
import type { APIGatewayProxyEventV2 as Event, APIGatewayProxyStructuredResultV2 as Result, Context } from "aws-lambda";

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('register', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = {
            AUTH_TABLE_NAME: 'authTable',
        };
    });

    afterAll(() => {
        process.env = OLD_ENV; // Restore old environment
    });

    it('should save new user', async () => {
        ddbMock.on(PutCommand).resolves({});

        const input = {
            body: JSON.stringify({
                email: 'test@test.com',
                displayName: 'Test Person'
            })
        } as Event;

        const res = await handler(input, {} as Context, jest.fn());
        expect((res as Result).statusCode).toBe(201)
        expect(ddbMock).toHaveReceivedCommand(PutCommand);
    })
})