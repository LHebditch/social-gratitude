import { APIGatewayAuthorizerHandler, APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent, StatementEffect } from "aws-lambda";
import jwt, { JwtPayload } from "jsonwebtoken"
import { BadRequestError, MisconfiguredServiceError } from "../../../lib/exceptions";


export const handler: APIGatewayAuthorizerHandler = async (event: APIGatewayTokenAuthorizerEvent) => {
    console.info("Start JWT verification")

    try {
        console.info("Attempting to verify JWT")
        const userId = await checkJWT(event.authorizationToken);
        console.info("JWT verified succesfully")
        return generatePolicy("user", "Allow", event.methodArn, userId);
    } catch (e: unknown) {
        console.error(e);
        return generatePolicy("user", "Deny", event.methodArn, "unauthorised");
    }
}

const checkJWT = (tokenHeader: string): Promise<string> => {
    if (!process.env.JWT_SECRET || !process.env.JWT_ISSUER || !process.env.JWT_AUD) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    console.debug(tokenHeader)
    const [token] = tokenHeader
        .split(',')
        .filter(s => s.match(/^[\w-]*\.[\w-]*\.[\w-]*$/))

    if (!token) {
        throw new BadRequestError("No valid auth token found")
    }
    return new Promise((res, rej) => {
        jwt.verify(token, process.env.JWT_SECRET, {
            audience: process.env.JWT_AUD,
            issuer: process.env.JWT_ISSUER,
        }, (err, decoded: JwtPayload) => {
            if (!!err) {
                rej(err)
            } else {
                res(decoded.userId)
            }
        });
    })


}

type AuthResponse = APIGatewayAuthorizerResult
const generatePolicy = (principalId: string, effect: StatementEffect, resource: string, userId): AuthResponse => {
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
        },
        context: {
            userId,
        }
    }

    return p;
}


