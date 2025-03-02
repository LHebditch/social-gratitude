import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import nunjucks from 'nunjucks';
import path from "path";

export const handler: APIGatewayProxyHandlerV2 = async (ev) => {
    console.info('Received request for journal page')
    nunjucks.configure(path.join(__dirname, '../views'), { autoescape: true });
    console.info('Generating content')
    const html = nunjucks.render('journal.njk');
    console.info('Content generated')
    return {
        statusCode: 200,
        body: html,
        headers: {
            'Content-Type': 'text/html',
        }
    }
}