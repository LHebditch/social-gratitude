import {
    Duration,
    NestedStack,
    Stack,
    aws_dynamodb as db,
    aws_lambda_nodejs as lambda,
    aws_apigatewayv2 as apigwv2,
    aws_apigatewayv2_authorizers as apiauth,
} from "aws-cdk-lib";
import { addLogGroup } from "./shared";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpLambdaResponseType } from "aws-cdk-lib/aws-apigatewayv2-authorizers";

export const build = (scope: Stack, authorizerFn: lambda.NodejsFunction) => {
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

    const saveEntriesFn = new lambda.NodejsFunction(stack, 'gratitude-save-entries-function', {
        runtime: Runtime.NODEJS_22_X,
        handler: "index.handler",
        functionName: `gratitude-save-entries`,
        entry: '../src/handlers/gratitude/submit-entries/index.ts',
        environment: {
            GRATITUDE_TABLE_NAME: table.tableName,
        },
        timeout: Duration.millis(3000),
    });

    addLogGroup(stack, "gratitude-save-entries-function", saveEntriesFn);
    table.grantReadWriteData(saveEntriesFn);

    const getTodaysEntriesFn = new lambda.NodejsFunction(stack, 'gratitude-get-entries-function', {
        runtime: Runtime.NODEJS_22_X,
        handler: "index.handler",
        functionName: `gratitude-get-entries`,
        entry: '../src/handlers/gratitude/get-entries/today/index.ts',
        environment: {
            GRATITUDE_TABLE_NAME: table.tableName,
        },
        timeout: Duration.millis(3000),
    });

    addLogGroup(stack, "gratitude-get-entries-function", getTodaysEntriesFn);
    table.grantReadData(getTodaysEntriesFn);

    // AUTH
    const authorizer = new apiauth.HttpLambdaAuthorizer("gratitude-jwt-authorizer", authorizerFn, {
        responseTypes: [HttpLambdaResponseType.IAM],
        identitySource: ['$request.header.Authorization', '$context.httpMethod', '$context.path'],
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

    gratitudeApi.addRoutes({
        path: '/journal/entries',
        methods: [apigwv2.HttpMethod.POST],
        integration: new HttpLambdaIntegration("gratitude-save-entries", saveEntriesFn),
        authorizer,
    });

    gratitudeApi.addRoutes({
        path: '/journal/today',
        methods: [apigwv2.HttpMethod.GET],
        integration: new HttpLambdaIntegration("gratitude-save-entries", getTodaysEntriesFn),
        authorizer,
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
