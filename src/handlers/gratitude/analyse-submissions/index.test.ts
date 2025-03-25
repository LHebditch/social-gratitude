import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { handler, assesInput } from ".";
import type {
    SQSEvent as Event,
    Context,
} from "aws-lambda";
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const dynamoMock = mockClient(DynamoDBDocumentClient)

describe('Share entries', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = {
            GRATITUDE_TABLE_NAME: 'gratitudeTable',
        };
    });

    afterAll(() => {
        process.env = OLD_ENV; // Restore old environment
        dynamoMock.reset()
    });

    it('should send entries to queue', async () => {
        const sharedEntryFields = {
            index: 1,
            id: 'test-id',
            gsi1: 'a/b'
        }
        const input = {
            Records: [
                { body: JSON.stringify({ entry: 'test2', ...sharedEntryFields }) },
                { body: JSON.stringify({ entry: 'this shouldn\'t get fucking added', ...sharedEntryFields }) },
            ]
        } as Event;
        await handler(input, {} as Context, jest.fn())
        expect(dynamoMock.calls().length).toBe(1)
    })

    describe('sentiment analysis', () => {
        it('should return a negative sentiment', () => {
            const r = assesInput('this is shit')
            expect(r.score).toBeLessThan(0)
        })

        it('should return a positive/neutral sentiment', () => {
            const r = assesInput('this is fine')
            expect(r.score).toBeGreaterThanOrEqual(0)
        })
    })
})