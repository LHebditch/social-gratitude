import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { EntryView, handler } from ".";

import type { APIGatewayProxyEventV2WithLambdaAuthorizer as Event, APIGatewayProxyStructuredResultV2 as Result, Context } from "aws-lambda";
import { QueryCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { AuthorizerResponse } from '../../../../lib/models/user';

const dynamoMock = mockClient(DynamoDBDocumentClient)

describe('Get entries for today', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = {
            GRATITUDE_TABLE_NAME: 'gratitudeTable',
        };
    });

    afterAll(() => {
        process.env = OLD_ENV; // Restore old environment
    });


    it('should save entries', async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [
                { entry: 'test2', index: 1, id: 'test-id', _pk: '1/id/2', _sk: 'userid/index' },
                { entry: 'test1', index: 0, id: 'test-id', _pk: '1/id/2', _sk: 'userid/index' },
                { entry: 'test3', index: 2, id: 'test-id', _pk: '1/id/2', _sk: 'userid/index' },
            ]
        });
        const res = await handler(null, {} as Context, jest.fn()) as Result

        expect(res.statusCode).toBe(200)
        const items = JSON.parse(res.body) as EntryView[]
        expect(items.length).toBe(3)
    })

})