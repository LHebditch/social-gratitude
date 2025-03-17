import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { handler } from ".";

import type { APIGatewayProxyEventV2WithLambdaAuthorizer as Event, APIGatewayProxyStructuredResultV2 as Result, Context } from "aws-lambda";
import { BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { AuthorizerResponse } from '../../../lib/models/user';

const dynamoMock = mockClient(DynamoDBDocumentClient)

describe('Get current user', () => {
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


    it('should save entries', async () => {
        dynamoMock.on(BatchWriteCommand).resolves({});
        const input = {
            requestContext: {
                authorizer: {
                    lambda: {
                        userId: 'test,'
                    }
                }
            },
            body: JSON.stringify({
                entry1: "my first entry",
                entry2: "my second entry",
                entry3: "my third entry"
            })
        } as Event<AuthorizerResponse>;
        const res = await handler(input, {} as Context, jest.fn())

        expect((res as Result).statusCode).toBe(200)
    })

})