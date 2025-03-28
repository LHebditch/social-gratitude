import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2WithLambdaAuthorizer as Event, APIGatewayProxyStructuredResultV2 as Result, Context } from "aws-lambda";
import { AuthorizerResponse } from '../../../../lib/models/user';
import { handler } from '.';


const dynamoMock = mockClient(DynamoDBDocumentClient)
describe('Get entries for today', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = {
            GRATITUDE_TABLE_NAME: 'gratitudeTable',
        };
        dynamoMock.on(PutCommand).resolves({})
    });

    afterAll(() => {
        process.env = OLD_ENV; // Restore old environment
    });

    it('should save entry like', async () => {
        const ev = {
            requestContext: {
                authorizer: {
                    lambda: {
                        userId: 'test,'
                    }
                }
            },
            body: JSON.stringify({
                creatorId: 'lyndon',
                entryId: 'abc-123',
                index: 0,
            })
        } as Event<AuthorizerResponse>
        const res = await handler(ev, {} as Context, jest.fn()) as Result
        expect(res.statusCode).toBe(200)
        expect(dynamoMock.calls().length).toBe(1)
    })

});