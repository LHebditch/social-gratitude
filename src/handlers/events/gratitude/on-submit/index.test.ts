import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { BatchGetCommand, BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { handler, Streak } from '.';
import { Context, DynamoDBStreamEvent } from 'aws-lambda';


const dynamoMock = mockClient(DynamoDBDocumentClient)

describe('on submit', () => {
    const OLD_ENV = process.env;
    const input = {
        Records: [
            {
                eventName: 'INSERT',
                dynamodb: {
                    NewImage: { _pk: { S: 'journal/test/entry' } }
                }
            }
        ]
    } as DynamoDBStreamEvent


    beforeEach(() => {
        jest.resetModules();
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2025, 3, 25, 12))
        process.env = {
            GRATITUDE_TABLE_NAME: 'gratitudeTable',
        };


        dynamoMock.on(BatchWriteCommand).resolves({ ConsumedCapacity: [] })
    });

    afterEach(() => {
        jest.resetAllMocks()
        dynamoMock.reset()
    })

    afterAll(() => {
        process.env = OLD_ENV; // Restore old environment
    });

    it('should save new streaks', async () => {
        dynamoMock.on(BatchGetCommand).resolves({
            Responses: {
                gratitudeTable: [] // return no items
            }
        })

        await handler(input, null as Context, jest.fn())

        expect(dynamoMock.calls().length).toBe(2)

        const writeRequest = dynamoMock.calls().filter(c => {
            return c.args[0] instanceof BatchWriteCommand
        })[0]

        expect(writeRequest).toBeTruthy()
        expect(writeRequest.args[0].input).toEqual({
            RequestItems: {
                gratitudeTable: [
                    {
                        PutRequest: {
                            Item: {
                                _pk: "test",
                                _sk: "STREAK",
                                currentStreak: 1,
                                maxStreak: 1,
                                streakEndDate: "2025-04-25",
                                streakStartDate: "2025-04-25",
                            },
                        },
                    },
                ],
            },
        })
    })

    it('should update existing streaks - should increment', async () => {
        const item: Streak = {
            _pk: "test",
            _sk: "STREAK",
            currentStreak: 3,
            maxStreak: 1,
            streakEndDate: "2025-04-24",
            streakStartDate: "2025-04-22",
        }

        dynamoMock.on(BatchGetCommand).resolves({
            Responses: {
                gratitudeTable: [item] // return 1 item that should be incremented
            }
        })

        await handler(input, null as Context, jest.fn())

        expect(dynamoMock.calls().length).toBe(2)

        const writeRequest = dynamoMock.calls().filter(c => {
            return c.args[0] instanceof BatchWriteCommand
        })[0]

        expect(writeRequest).toBeTruthy()
        expect(writeRequest.args[0].input).toEqual({
            RequestItems: {
                gratitudeTable: [
                    {
                        PutRequest: {
                            Item: {
                                ...item,
                                streakEndDate: "2025-04-25",
                                currentStreak: 4
                            },
                        },
                    },
                ],
            },
        })
    })

    it('should update existing streaks - should reset', async () => {
        const item: Streak = {
            _pk: "test",
            _sk: "STREAK",
            currentStreak: 3,
            maxStreak: 1,
            streakEndDate: "2025-04-23",
            streakStartDate: "2025-04-21",
        }

        dynamoMock.on(BatchGetCommand).resolves({
            Responses: {
                gratitudeTable: [item] // return 1 item that should be incremented
            }
        })

        await handler(input, null as Context, jest.fn())

        expect(dynamoMock.calls().length).toBe(2)

        const writeRequest = dynamoMock.calls().filter(c => {
            return c.args[0] instanceof BatchWriteCommand
        })[0]

        expect(writeRequest).toBeTruthy()
        expect(writeRequest.args[0].input).toEqual({
            RequestItems: {
                gratitudeTable: [
                    {
                        PutRequest: {
                            Item: {
                                ...item,
                                streakEndDate: "2025-04-25",
                                streakStartDate: "2025-04-25",
                                currentStreak: 1,
                                maxStreak: 3
                            },
                        },
                    },
                ],
            },
        })
    })
})