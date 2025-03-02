import {
    Duration,
    NestedStack,
    Stack,
    aws_dynamodb as db,
    aws_lambda_nodejs as lambda,
    aws_apigatewayv2 as apigwv2,
    aws_apigatewayv2_integrations,
} from "aws-cdk-lib";

export const build = (scope: Stack, authorizer: apigwv2.IHttpRouteAuthorizer) => {
    const stack = new NestedStack(scope, "gratitude-stack");
    const suffix = stack.node.addr;

    // DYNAMO TABLE //
    const tableName = 'gratitude-table';
    const props: db.TableProps = {
        tableName,
        partitionKey: {
            name: "_pk", // generic primary key
            type: db.AttributeType.STRING,
        },
        sortKey: {
            name: "_sk", // generic secondary key
            type: db.AttributeType.STRING,
        },
        billingMode: db.BillingMode.PAY_PER_REQUEST,
        timeToLiveAttribute: '_ttl',
    };
    const table = new db.Table(stack, tableName, props);
    table.addGlobalSecondaryIndex({
        indexName: "gsi1",
        partitionKey: {
            name: "gsi1",
            type: db.AttributeType.STRING,
        },
    });

    // API //
    const corsOptions = {
        allowMethods: [
            apigwv2.CorsHttpMethod.GET,
            apigwv2.CorsHttpMethod.HEAD,
            apigwv2.CorsHttpMethod.OPTIONS,
            apigwv2.CorsHttpMethod.POST,
        ],
        allowOrigins: ['*'],
        maxAge: Duration.days(10),
    };
    const gratitudeApi = new apigwv2.HttpApi(stack, "gratitude-api", {
        corsPreflight: corsOptions,
    });

    new apigwv2.HttpStage(stack, 'gratitude-api-v1-stage', {
        httpApi: gratitudeApi,
        stageName: 'v1',
        description: 'version 1 stage for gratitude api',
        autoDeploy: true,
    });
}

export default {
    build,
}
