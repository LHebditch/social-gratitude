import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { BatchGetCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
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
        dynamoMock.on(BatchGetCommand).resolves({
            Responses: {
                gratitudeTable: [
                    { _pk: 'reaction/1' }
                ]
            }
        })
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
                entries: [
                    '1', '2', '3'
                ]
            })
        } as Event<AuthorizerResponse>
        const res = await handler(ev, {} as Context, jest.fn()) as Result
        expect(res.statusCode).toBe(200)
        expect(res.body).toBe(JSON.stringify({ liked: ['1'] }))
        expect(dynamoMock.calls().length).toBe(1)

    })

});