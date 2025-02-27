import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import nunjucks from 'nunjucks';

export const handler: APIGatewayProxyHandlerV2 = async (ev) => {
    nunjucks.configure('../views', { autoescape: true });

    const html = nunjucks.render('home.njk', { greeting: 'Hello, world!' });
    return {
        statusCode: 200,
        body: html,
        headers: {
            'Content-Type': 'text/html',
        }
    }
}