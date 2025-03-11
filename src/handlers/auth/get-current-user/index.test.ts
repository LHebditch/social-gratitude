import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { handler, AuthorizerResponse } from ".";

import type { APIGatewayProxyEventV2WithLambdaAuthorizer as Event, APIGatewayProxyStructuredResultV2 as Result, Context } from "aws-lambda";
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { User } from '../../../lib/models/user';

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


    it('should return user', async () => {
        const user = { gsi1: 'test' } as User
        dynamoMock.on(QueryCommand).resolves({ Items: [user] });
        const input = {
            requestContext: {
                authorizer: {
                    lambda: {
                        userId: 'test,'
                    }
                }
            }
        } as Event<AuthorizerResponse>;
        const res = await handler(input, {} as Context, jest.fn())

        expect((res as Result).statusCode).toBe(200)
    })

})