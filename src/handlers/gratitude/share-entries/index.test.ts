import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { handler } from ".";

import type {
    APIGatewayProxyEventV2WithLambdaAuthorizer as Event,
    APIGatewayProxyStructuredResultV2 as Result,
    Context,
} from "aws-lambda";
import { QueryCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SQSClient } from "@aws-sdk/client-sqs";
import { AuthorizerResponse } from '../../../lib/models/user';

const dynamoMock = mockClient(DynamoDBDocumentClient)
const sqsMock = mockClient(SQSClient)

describe('Share entries', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = {
            GRATITUDE_TABLE_NAME: 'gratitudeTable',
            GRATITUDE_QUEUE_URL: 'gratitudeQueue',
        };
    });

    afterAll(() => {
        process.env = OLD_ENV; // Restore old environment
        dynamoMock.reset()
        sqsMock.reset()
    });

    it('should send entries to queue', async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [
                { entry: 'test2', index: 1, id: 'test-id' },
                { entry: 'test1', index: 0, id: 'test-id' },
                { entry: 'test3', index: 2, id: 'test-id' }
            ]
        });
        const input = {
            requestContext: {
                authorizer: {
                    lambda: {
                        userId: 'test,'
                    }
                }
            },
        } as Event<AuthorizerResponse>;
        const res = await handler(input, {} as Context, jest.fn()) as Result
        expect(res.statusCode).toBe(200)
        expect(sqsMock.calls().length).toBe(3) // 1 per entry
    })
})