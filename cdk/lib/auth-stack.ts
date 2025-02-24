import {
    Duration,
    NestedStack,
    Stack,
    RemovalPolicy,
    aws_lambda_nodejs as lambda,
    aws_dynamodb as db,
    aws_logs as logs,
    aws_apigatewayv2 as apigwv2,
    aws_apigatewayv2_integrations,
    aws_apigatewayv2_authorizers,
} from "aws-cdk-lib"
import { Runtime } from "aws-cdk-lib/aws-lambda";

const { HttpLambdaIntegration } = aws_apigatewayv2_integrations;
const { HttpIamAuthorizer } = aws_apigatewayv2_authorizers;

export const BuildAuthStack = (scope: Stack) => {
    const stack = new NestedStack(scope, "auth-stack");

    // DYNAMO TABLE //
    const tableName = 'auth-table';
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

    // FUNCTIONS //
    const registerFn = new lambda.NodejsFunction(stack, 'register-new-user-function', {
        runtime: Runtime.NODEJS_22_X,
        handler: "index.handler",
        functionName: `auth-register-${stack.node.addr}`,
        entry: '../src/handlers/auth/register/index.ts',
        environment: {
            AUTH_TABLE_NAME: table.tableName,
        },
        timeout: Duration.millis(3000),
    });

    addLogGRoup(stack, "auth-register-function", registerFn);
    table.grantReadWriteData(registerFn);

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
    const authApi = new apigwv2.HttpApi(stack, "auth-api", {
        corsPreflight: corsOptions,
        // defaultAuthorizer: new HttpIamAuthorizer(),
    });

    // API Routes //
    authApi.addRoutes({
        path: '/register',
        methods: [apigwv2.HttpMethod.POST],
        integration: new HttpLambdaIntegration("auth-register-function", registerFn),
    });

    new apigwv2.HttpStage(stack, 'auth-api-v1-stage', {
        httpApi: authApi,
        stageName: 'v1',
        description: 'version 1 stage for auth api',
        autoDeploy: true,
    });
};

const addLogGRoup = (stack: Stack, name: string, lambda: lambda.NodejsFunction) => {
    new logs.LogGroup(stack, `${name}-loggroup`, {
        logGroupName: `/aws/lambda/${lambda.functionName}`,
        retention: logs.RetentionDays.THREE_MONTHS,
        removalPolicy: RemovalPolicy.DESTROY
    });
};