import { APIGatewayProxyHandlerV2WithLambdaAuthorizer } from "aws-lambda";

type AuthorizerResponse = {
    userId: string
}

export const handler: APIGatewayProxyHandlerV2WithLambdaAuthorizer<AuthorizerResponse> = async (ev) => {
    const user = ev.requestContext.authorizer.lambda.userId;

    // console.log(JSON.stringify(ev, undefined, 2))
    console.log(user)
    return {
        user,
        statusCode: 200,
    }
}