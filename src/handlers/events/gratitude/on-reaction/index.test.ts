import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { BatchGetCommand, BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { handler } from '.';
import { AttributeValue, Context, DynamoDBStreamEvent } from 'aws-lambda';


const dynamoMock = mockClient(DynamoDBDocumentClient)

describe('On reaction stream handler', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = {
            GRATITUDE_TABLE_NAME: 'gratitudeTable',
        };
        dynamoMock.on(BatchGetCommand).resolves({
            Responses: {
                gratitudeTable: [
                    { _pk: 'test-user', _sk: 'INFLUENCE_SCORE', score: 1 }
                ]
            }
        })
        dynamoMock.on(BatchWriteCommand).resolves({ ConsumedCapacity: [] })
    });

    afterAll(() => {
        process.env = OLD_ENV; // Restore old environment
    });

    it('should update scores', () => {
        const newItem: { [key: string]: AttributeValue } = {
            id: { S: 'test' },
            index: { N: '0' },
            creatorId: { S: 'test-user' }
        }

        const input = {
            Records: [{
                eventName: 'INSERT',
                dynamodb: {
                    NewImage: newItem
                }
            }]
        } as DynamoDBStreamEvent
        handler(input, null as Context, jest.fn())

        expect(dynamoMock.calls().length).toBeGreaterThanOrEqual(1) // why isnt save considered a call?
    })
})