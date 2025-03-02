import {
    Duration,
    NestedStack,
    Stack,
    aws_lambda_nodejs as lambda,
    aws_dynamodb as db,
    aws_apigatewayv2 as apigwv2,
    aws_kms as kms,
    aws_iam as iam,
    aws_ssm as ssm,
    aws_apigatewayv2_integrations,
    aws_apigatewayv2_authorizers as apiauth,
} from "aws-cdk-lib"
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { addLogGroup } from "./shared";

const { HttpLambdaIntegration } = aws_apigatewayv2_integrations;

export const build = (scope: Stack) => {
    const issuer = "lyndons-testing.null"
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
    table.addGlobalSecondaryIndex({
        indexName: "gsi1",
        partitionKey: {
            name: "gsi1",
            type: db.AttributeType.STRING,
        },
    });

    // KMS //
    const authKMSKey = new kms.Key(stack, "auth-login-pipline-key", {
        alias: 'auth-pipeline',
        enableKeyRotation: false, // change?
    });

    // PARAM STORE //
    const jwtSecret = ssm.StringParameter.valueForStringParameter(stack, '/auth/jwt-param')

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

    addLogGroup(stack, "auth-register-function", registerFn);
    table.grantReadWriteData(registerFn);

    const loginFn = new lambda.NodejsFunction(stack, 'auth-login-function', {
        runtime: Runtime.NODEJS_22_X,
        handler: "index.handler",
        functionName: `auth-login-${stack.node.addr}`,
        entry: '../src/handlers/auth/login/index.ts',
        environment: {
            AUTH_TABLE_NAME: table.tableName,
            TOKEN_TTL_MINUTES: '15',
            AUTH_KMS_KEY_ID: authKMSKey.keyId,
            SOURCE_EMAIL: 'noreply@l-h-solutions.awsapps.com'
        },
        timeout: Duration.millis(3000),
    });

    addLogGroup(stack, "auth-login-function", loginFn);
    table.grantReadWriteData(loginFn);
    authKMSKey.grantEncrypt(loginFn);
    loginFn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
        effect: iam.Effect.ALLOW,
    }));

    const loginConfirmFn = new lambda.NodejsFunction(stack, 'auth-login-confirm-function', {
        runtime: Runtime.NODEJS_22_X,
        handler: "index.handler",
        functionName: `auth-login-confirm-${stack.node.addr}`,
        entry: '../src/handlers/auth/login-confirm/index.ts',
        environment: {
            AUTH_TABLE_NAME: table.tableName,
            AUTH_KMS_KEY_ID: authKMSKey.keyId,
            MAX_LOGIN_ATTEMPTS: '3',
            JWT_SECRET: jwtSecret,
            JWT_ISSUER: issuer,
        },
        timeout: Duration.millis(3000),
    });

    addLogGroup(stack, "auth-login-confirm-function", loginConfirmFn);
    table.grantReadWriteData(loginConfirmFn);
    authKMSKey.grantDecrypt(loginConfirmFn);

    // AUTH
    const authorizer = new apiauth.HttpJwtAuthorizer("gratitude-jwt-authorizer", issuer, {
        jwtAudience: ["app"],
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

    authApi.addRoutes({
        path: '/login',
        methods: [apigwv2.HttpMethod.POST],
        integration: new HttpLambdaIntegration("auth-login-function-integration", loginFn),
    });

    authApi.addRoutes({
        path: '/login/{tokenId}',
        methods: [apigwv2.HttpMethod.POST],
        integration: new HttpLambdaIntegration("auth-login-confirm-function-integration", loginConfirmFn),
    });

    new apigwv2.HttpStage(stack, 'auth-api-v1-stage', {
        httpApi: authApi,
        stageName: 'v1',
        description: 'version 1 stage for auth api',
        autoDeploy: true,
    });

    return {
        authorizer,
    }
};

export default {
    build,
}
