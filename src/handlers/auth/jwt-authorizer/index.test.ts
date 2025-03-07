

import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { handler } from ".";
import type { APIGatewayProxyEventV2 as Event, APIGatewayProxyStructuredResultV2 as Result, Context, APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from "aws-lambda";

import jwt from 'jsonwebtoken';



describe('test login', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = {
            JWT_SECRET: 'some-secret',
            JWT_ISSUER: 'test-iss',
            JWT_AUD: 'test-aud',
        };
    });

    afterAll(() => {
        process.env = OLD_ENV; // Restore old environment
    });

    it('should allow access', async () => {
        const ev: APIGatewayTokenAuthorizerEvent = {
            authorizationToken: jwt.sign({ userId: 'test', iss: 'test-iss', aud: 'test-aud' }, 'some-secret'),
            methodArn: '',
            type: 'TOKEN',
        };

        const res = await handler(ev, null, null) as APIGatewayAuthorizerResult
        expect(res.policyDocument.Statement[0].Effect).toEqual("Allow")
        expect(res.context.userId).toEqual("test")
    });
})