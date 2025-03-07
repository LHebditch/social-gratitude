import { APIGatewayProxyHandlerV2 } from "aws-lambda";

export const handler: APIGatewayProxyHandlerV2 = async (ev) => {
    const user = ev.headers["userId"]
    console.log(user)
    return {
        user,
        statusCode: 200,
    }
}