import {
    Duration,
    NestedStack,
    Stack,
    aws_dynamodb as db,
    aws_lambda_nodejs as lambda,
    aws_apigatewayv2 as apigwv2,
    aws_apigatewayv2_integrations,
} from "aws-cdk-lib";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { addLogGroup } from "./shared";
import path = require("path");

const { HttpLambdaIntegration } = aws_apigatewayv2_integrations;

export const build = (scope: Stack) => {
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

    // bundling options to add views to the lambdas deployed
    const htmlLambdaBundling: lambda.BundlingOptions = {
        commandHooks: {
            beforeBundling(inputDir, outputDir) {
                return [
                    `cp -r ${path.join(inputDir, '../src/handlers/app/views')} ${inputDir}`,
                    `mkdir ${inputDir}/src`, // this line means synth no longer works on my machine...
                    `touch ${inputDir}/src/index.js` // create the temporary file
                ]
            },
            beforeInstall(inputDir, outputDir) {
                return []
            },
            afterBundling(inputDir, outputDir) {
                return [
                    `cp -r ${inputDir}/views ${outputDir}`,
                    `cp -r ${inputDir}/src ${outputDir}`,
                    `mv ${path.join(outputDir, 'index.js')} ${path.join(outputDir, 'src/index.js')}` // replace temporary file with compiled ts
                ]
            },
        }
    }

    const loginPageFn = new lambda.NodejsFunction(stack, 'app-login-page-function', {
        runtime: Runtime.NODEJS_22_X,
        handler: "src/index.handler",
        functionName: `app-login-page-${stack.node.addr}`,
        entry: '../src/handlers/app/login/index.ts',
        environment: {},
        timeout: Duration.millis(3000),
        bundling: htmlLambdaBundling,
    });
    addLogGroup(stack, "app-login-page-function", loginPageFn);

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

    // API Routes //
    gratitudeApi.addRoutes({
        path: '/login',
        methods: [apigwv2.HttpMethod.GET],
        integration: new HttpLambdaIntegration("gratitude-login-page", loginPageFn),
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
