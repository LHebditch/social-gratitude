import { APIGatewayProxyHandlerV2WithLambdaAuthorizer } from "aws-lambda";

type AuthorizerResponse = {
    userId: string
}

export const handler: APIGatewayProxyHandlerV2WithLambdaAuthorizer<AuthorizerResponse> = async (ev) => {
    const userId = ev.requestContext.authorizer.lambda.userId;

    return {
        body: JSON.stringify({
            userId
        }),
        statusCode: 200,
    }
}