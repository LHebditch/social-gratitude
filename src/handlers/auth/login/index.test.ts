

import { handler } from ".";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

jest.mock("aws-sdk/clients/kms", () => jest.fn(() => ({
    encrypt: jest.fn(() => ({ promise: jest.fn(() => Promise.resolve({ CiphertextBlob: 'blah' })) })),
})))

jest.mock("aws-sdk/clients/dynamodb", () => ({
    DocumentClient: jest.fn(() => ({
        get: jest.fn(() => ({ promise: jest.fn(() => Promise.resolve({ Item: {} })) })),
        put: jest.fn(() => ({ promise: jest.fn(() => Promise.resolve()) })),
    }))
}))

jest.mock("aws-sdk/clients/ses", () => jest.fn(() => ({
    sendEmail: jest.fn(() => ({ promise: jest.fn(() => Promise.resolve()) })),
})))

// import KMS from "aws-sdk/clients/kms";
// import DYNAMO from "aws-sdk/clients/dynamodb";
// import SES from "aws-sdk/clients/ses";

describe('test login', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = {
            AUTH_TABLE_NAME: 'authTable',
            TOKEN_TTL_MINUTES: '15',
            AUTH_KMS_KEY_ID: 'some-key',
            SOURCE_EMAIL: 'test@test.com'
        };
    });

    afterAll(() => {
        process.env = OLD_ENV; // Restore old environment
    });

    it('should send email', async () => {
        const input = {
            body: '{ "email": "test@test.com" }',
        } as APIGatewayProxyEventV2;

        const res = await handler(input, {} as Context, jest.fn())

        expect((res as APIGatewayProxyStructuredResultV2).statusCode).toBe(200)
    })
})