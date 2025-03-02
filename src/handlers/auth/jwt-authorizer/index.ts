import { APIGatewayAuthorizerHandler, APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent, StatementEffect } from "aws-lambda";
import jwt from "jsonwebtoken"
import { MisconfiguredServiceError } from "../../../lib/exceptions";


export const handler: APIGatewayAuthorizerHandler = async (event: APIGatewayTokenAuthorizerEvent) => {
    console.info("Start JWT verification")
    try {
        console.info("Attempting to verify JWT")
        await checkJWT(event.authorizationToken);
        console.info("JWT verified succesfully")
        return generatePolicy("user", "Allow", event.methodArn);
    } catch (e: unknown) {
        console.error(e);
        return generatePolicy("user", "Deny", event.methodArn);
    }
}

const checkJWT = (token: string): Promise<void> => {
    if (!process.env.JWT_SECRET || !process.env.JWT_ISSUER || !process.env.JWT_AUD) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }
    return new Promise((res, rej) => {
        jwt.verify(token, process.env.JWT_SECRET, {
            audience: process.env.JWT_AUD,
            issuer: process.env.JWT_ISSUER,
        }, (err) => {
            if (!!err) {
                rej(err)
            } else {
                res()
            }
        });
    })


}

type AuthResponse = APIGatewayAuthorizerResult
const generatePolicy = (principalId: string, effect: StatementEffect, resource: string): AuthResponse => {
    const p: AuthResponse = {
        principalId,
        policyDocument: {
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: effect,
                    Resource: resource,
                }
            ]
        }
    }

    return p;
}


