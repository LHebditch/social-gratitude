import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { EntryView, handler, PaginatedEntryResponse } from ".";

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 as Result, Context } from "aws-lambda";
import { QueryCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const dynamoMock = mockClient(DynamoDBDocumentClient)

const createEvent = (queryParams?: Record<string, string>): APIGatewayProxyEventV2 => ({
    queryStringParameters: queryParams || null,
    // Add minimal required event properties
    version: '2.0',
    routeKey: '',
    rawPath: '',
    rawQueryString: '',
    headers: {},
    requestContext: {
        accountId: '',
        apiId: '',
        domainName: '',
        domainPrefix: '',
        http: {
            method: '',
            path: '',
            protocol: '',
            sourceIp: '',
            userAgent: ''
        },
        requestId: '',
        routeKey: '',
        stage: '',
        time: '',
        timeEpoch: 0
    },
    isBase64Encoded: false
});

describe('Get shared entries', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = {
            GRATITUDE_TABLE_NAME: 'gratitudeTable',
        };
        dynamoMock.reset();
    });

    afterAll(() => {
        process.env = OLD_ENV; // Restore old environment
    });

    it('should return entries with default pagination', async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [
                { entry: 'test1', index: 0, id: 'test-id', _pk: '1/id/2', _sk: 'userid/index' },
                { entry: 'test2', index: 1, id: 'test-id', _pk: '1/id/2', _sk: 'userid/index' },
                { entry: 'test3', index: 2, id: 'test-id', _pk: '1/id/2', _sk: 'userid/index' },
            ]
        });

        const res = await handler(createEvent(), {} as Context, jest.fn()) as Result;

        expect(res.statusCode).toBe(200);
        const response = JSON.parse(res.body) as PaginatedEntryResponse;
        expect(response.entries.length).toBe(3);
        expect(response.nextToken).toBeUndefined();

        // Verify DynamoDB query parameters
        expect(dynamoMock).toHaveReceivedCommandWith(QueryCommand, {
            Limit: 25, // Default page size
            ExclusiveStartKey: undefined
        });
    });

    it('should handle pagination token', async () => {
        const lastEvaluatedKey = {
            pk: 'test',
            sk: 'test',
            gsi2: 'test'
        };
        const encodedToken = Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64');

        dynamoMock.on(QueryCommand).resolves({
            Items: [
                { entry: 'test4', index: 3, id: 'test-id', _pk: '1/id/2', _sk: 'userid/index' },
            ],
            LastEvaluatedKey: {
                pk: 'next',
                sk: 'next',
                gsi2: 'next'
            }
        });

        const res = await handler(
            createEvent({ nextToken: encodedToken }),
            {} as Context,
            jest.fn()
        ) as Result;

        expect(res.statusCode).toBe(200);
        const response = JSON.parse(res.body) as PaginatedEntryResponse;
        expect(response.entries.length).toBe(1);
        expect(response.nextToken).toBeDefined();

        // Verify DynamoDB query parameters
        expect(dynamoMock).toHaveReceivedCommandWith(QueryCommand, {
            Limit: 25,
            ExclusiveStartKey: lastEvaluatedKey
        });
    });

    it('should handle empty results', async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: []
        });

        const res = await handler(createEvent(), {} as Context, jest.fn()) as Result;

        expect(res.statusCode).toBe(200);
        const response = JSON.parse(res.body) as PaginatedEntryResponse;
        expect(response.entries).toEqual([]);
        expect(response.nextToken).toBeUndefined();
    });

    it('should filter out empty entries', async () => {
        dynamoMock.on(QueryCommand).resolves({
            Items: [
                { entry: '   ', index: 0, id: 'test-id', _pk: '1/id/2', _sk: 'userid/index' },
                { entry: 'valid', index: 1, id: 'test-id', _pk: '1/id/2', _sk: 'userid/index' },
                { entry: '', index: 2, id: 'test-id', _pk: '1/id/2', _sk: 'userid/index' },
            ]
        });

        const res = await handler(createEvent(), {} as Context, jest.fn()) as Result;

        expect(res.statusCode).toBe(200);
        const response = JSON.parse(res.body) as PaginatedEntryResponse;
        expect(response.entries.length).toBe(1);
        expect(response.entries[0].entry).toBe('valid');
    });

    it('should handle DynamoDB errors', async () => {
        dynamoMock.on(QueryCommand).rejects(new Error('DynamoDB error'));

        const res = await handler(createEvent(), {} as Context, jest.fn()) as Result;

        expect(res.statusCode).toBe(500);
    });
});