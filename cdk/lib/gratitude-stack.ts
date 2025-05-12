import {
    Duration,
    NestedStack,
    Stack,
    aws_dynamodb as db,
    aws_lambda_nodejs as lambda,
    aws_lambda as fn,
    aws_apigatewayv2 as apigwv2,
    aws_apigatewayv2_authorizers as apiauth,
    aws_sqs as sqs,
    aws_lambda_event_sources as eventSource
} from "aws-cdk-lib";
import { addLogGroup } from "./shared";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpLambdaResponseType } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

// Common Lambda configuration for optimal performance
const commonLambdaConfig = {
    runtime: Runtime.NODEJS_22_X,
    memorySize: 1024, // Increased memory for better CPU performance
    timeout: Duration.seconds(10),
    tracing: fn.Tracing.ACTIVE, // Enable X-Ray tracing
    bundling: {
        minify: true, // Reduce cold start time
        sourceMap: true, // Better debugging
    },
    environment: {
        NODE_OPTIONS: '--enable-source-maps',
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1', // Enable connection reuse
    },
};

export const build = (scope: Stack, authorizerFn: lambda.NodejsFunction) => {
    const stack = new NestedStack(scope, "gratitude-stack");
    const suffix = stack.node.addr;

    // DYNAMO TABLE //
    const tableName = 'gratitude-table';
    const props: db.TableProps = {
        tableName,
        partitionKey: {
            name: "_pk",
            type: db.AttributeType.STRING,
        },
        sortKey: {
            name: "_sk",
            type: db.AttributeType.STRING,
        },
        billingMode: db.BillingMode.PAY_PER_REQUEST,
        timeToLiveAttribute: '_ttl',
        stream: db.StreamViewType.NEW_IMAGE,
    };
    const table = new db.Table(stack, tableName, props);

    // Add GSIs with performance optimizations
    table.addGlobalSecondaryIndex({
        indexName: "gsi1",
        partitionKey: {
            name: "gsi1",
            type: db.AttributeType.STRING,
        },
    });

    table.addGlobalSecondaryIndex({
        indexName: "gsi2",
        partitionKey: {
            name: "gsi2",
            type: db.AttributeType.STRING,
        },
    });

    // SQS with performance optimizations
    const journalQueue = new sqs.Queue(stack, "gratitude-journal-queue", {
        queueName: "gratitude-journal-entries",
        visibilityTimeout: Duration.seconds(30),
        receiveMessageWaitTime: Duration.seconds(20), // Enable long polling
        deadLetterQueue: {
            queue: new sqs.Queue(stack, "gratitude-journal-dlq", {
                queueName: "gratitude-journal-entries-dlq",
                retentionPeriod: Duration.days(14),
            }),
            maxReceiveCount: 3,
        },
    });

    // ================ //
    // LAMBDA FUNCTIONS //
    // ================ //

    // SAVE ENTRIES //
    const saveEntriesFn = new lambda.NodejsFunction(stack, 'gratitude-save-entries-function', {
        ...commonLambdaConfig,
        handler: "index.handler",
        functionName: `gratitude-save-entries`,
        entry: '../src/handlers/gratitude/submit-entries/index.ts',
        environment: {
            ...commonLambdaConfig.environment,
            GRATITUDE_TABLE_NAME: table.tableName,
        },
    });

    addLogGroup(stack, "gratitude-save-entries-function", saveEntriesFn);
    table.grantReadWriteData(saveEntriesFn);

    // GET TODAYS ENTRIES //
    const getTodaysEntriesFn = new lambda.NodejsFunction(stack, 'gratitude-get-entries-function', {
        ...commonLambdaConfig,
        handler: "index.handler",
        functionName: `gratitude-get-entries`,
        entry: '../src/handlers/gratitude/get-entries/today/index.ts',
        environment: {
            ...commonLambdaConfig.environment,
            GRATITUDE_TABLE_NAME: table.tableName,
        },
    });

    addLogGroup(stack, "gratitude-get-entries-function", getTodaysEntriesFn);
    table.grantReadData(getTodaysEntriesFn);

    // SHARE ENTRIES //
    const shareTodaysEntriesFn = new lambda.NodejsFunction(stack, 'gratitude-share-entries-function', {
        ...commonLambdaConfig,
        handler: "index.handler",
        functionName: `gratitude-share-entries`,
        entry: '../src/handlers/gratitude/share-entries/index.ts',
        environment: {
            ...commonLambdaConfig.environment,
            GRATITUDE_TABLE_NAME: table.tableName,
            GRATITUDE_QUEUE_URL: journalQueue.queueUrl,
        },
    });

    addLogGroup(stack, "gratitude-share-entries-function", shareTodaysEntriesFn);
    table.grantReadData(shareTodaysEntriesFn);
    journalQueue.grantSendMessages(shareTodaysEntriesFn)

    // ANALYSE SUBMISSIONS //
    const analyseSubmissionsFn = new lambda.NodejsFunction(stack, 'gratitude-analyse-submissions-function', {
        ...commonLambdaConfig,
        handler: "index.handler",
        functionName: `gratitude-analyse-submissions`,
        entry: '../src/handlers/gratitude/analyse-submissions/index.ts',
        environment: {
            ...commonLambdaConfig.environment,
            GRATITUDE_TABLE_NAME: table.tableName,
        },
    });

    addLogGroup(stack, "gratitude-analyse-submissions-function", analyseSubmissionsFn);
    table.grantWriteData(analyseSubmissionsFn);
    journalQueue.grantConsumeMessages(analyseSubmissionsFn)
    analyseSubmissionsFn.addEventSource(new eventSource.SqsEventSource(journalQueue))

    // GET SOCIAL ENTRIES - with provisioned concurrency
    const getSocialEntriesFn = new lambda.NodejsFunction(stack, 'gratitude-get-shared-entries-function', {
        ...commonLambdaConfig,
        functionName: `gratitude-get-shared-entries`,
        entry: '../src/handlers/gratitude/get-entries/shared/index.ts',
        environment: {
            ...commonLambdaConfig.environment,
            GRATITUDE_TABLE_NAME: table.tableName,
        },
    });


    addLogGroup(stack, "gratitude-get-shared-entries-function", getSocialEntriesFn);
    table.grantReadData(getSocialEntriesFn);

    // REACT TO ENTRY //
    const reactToEntryFn = new lambda.NodejsFunction(stack, 'gratitude-react-to-entry-function', {
        ...commonLambdaConfig,
        handler: "index.handler",
        functionName: `gratitude-react-to-entry`,
        entry: '../src/handlers/gratitude/likes/react/index.ts',
        environment: {
            ...commonLambdaConfig.environment,
            GRATITUDE_TABLE_NAME: table.tableName,
        },
    });

    addLogGroup(stack, "gratitude-react-to-entry-function", reactToEntryFn);
    table.grantWriteData(reactToEntryFn);

    // GET ENTRY REACTIONS //
    const getEntryReactionsFn = new lambda.NodejsFunction(stack, 'gratitude-get-entry-reactions-function', {
        ...commonLambdaConfig,
        handler: "index.handler",
        functionName: `gratitude-get-entry-reactions`,
        entry: '../src/handlers/gratitude/likes/get/index.ts',
        environment: {
            ...commonLambdaConfig.environment,
            GRATITUDE_TABLE_NAME: table.tableName,
        },
    });

    addLogGroup(stack, "gratitude-get-entry-reactions-function", getEntryReactionsFn);
    table.grantReadData(getEntryReactionsFn);

    // GET INFLUENCE SCORE //
    const getInfluenceScoreFn = new lambda.NodejsFunction(stack, 'gratitude-get-influence-function', {
        ...commonLambdaConfig,
        handler: "index.handler",
        functionName: `gratitude-get-influence`,
        entry: '../src/handlers/gratitude/influence/index.ts',
        environment: {
            ...commonLambdaConfig.environment,
            GRATITUDE_TABLE_NAME: table.tableName,
        },
    });

    addLogGroup(stack, "gratitude-get-influence-function", getInfluenceScoreFn);
    table.grantReadData(getInfluenceScoreFn);

    // GET STREAK //
    const getStreakFn = new lambda.NodejsFunction(stack, 'gratitude-get-streak-function', {
        ...commonLambdaConfig,
        handler: "index.handler",
        functionName: `gratitude-get-streak`,
        entry: '../src/handlers/gratitude/streak/index.ts',
        environment: {
            ...commonLambdaConfig.environment,
            GRATITUDE_TABLE_NAME: table.tableName,
        },
    });

    addLogGroup(stack, "gratitude-get-streak-function", getStreakFn);
    table.grantReadData(getStreakFn);

    // EVENTS //
    // ON REACTION HANDLER
    const onReactionFn = new lambda.NodejsFunction(stack, 'gratitude-on-reaction-reactions-function', {
        ...commonLambdaConfig,
        handler: "index.handler",
        functionName: `gratitude-on-reaction-reactions`,
        entry: '../src/handlers/events/gratitude/on-reaction/index.ts',
        environment: {
            ...commonLambdaConfig.environment,
            GRATITUDE_TABLE_NAME: table.tableName,
        },
    });

    addLogGroup(stack, "gratitude-on-reaction-reactions-function", onReactionFn);
    table.grantReadWriteData(onReactionFn);

    onReactionFn.addEventSource(new DynamoEventSource(table, {
        startingPosition: fn.StartingPosition.LATEST,
        filters: [
            fn.FilterCriteria.filter({
                dynamodb: {
                    NewImage: {
                        gsi1: {
                            S: fn.FilterRule.isEqual('REACTION'),
                        }
                    }
                }
            }),
        ]
    }))

    // ON SUBMIT HANDLER
    const onSubmitFn = new lambda.NodejsFunction(stack, 'gratitude-on-submit-function', {
        ...commonLambdaConfig,
        handler: "index.handler",
        functionName: `gratitude-on-submit`,
        entry: '../src/handlers/events/gratitude/on-submit/index.ts',
        environment: {
            ...commonLambdaConfig.environment,
            GRATITUDE_TABLE_NAME: table.tableName,
        },
    });

    addLogGroup(stack, "gratitude-on-submit-function", onSubmitFn);
    table.grantReadWriteData(onSubmitFn);

    onSubmitFn.addEventSource(new DynamoEventSource(table, {
        startingPosition: fn.StartingPosition.LATEST,
        filters: [
            fn.FilterCriteria.filter({
                dynamodb: {
                    NewImage: {
                        _pk: {
                            S: fn.FilterRule.beginsWith('journal/')
                        },
                        index: {
                            N: fn.FilterRule.exists()
                        }
                    }
                }
            }),
        ]
    }))

    // AUTH
    const authorizer = new apiauth.HttpLambdaAuthorizer("gratitude-jwt-authorizer", authorizerFn, {
        responseTypes: [HttpLambdaResponseType.IAM],
        identitySource: ['$request.header.Authorization', '$context.httpMethod', '$context.path'],
    });

    // API //
    const gratitudeApi = new apigwv2.HttpApi(stack, "gratitude-api", {
        corsPreflight: {
            allowMethods: [
                apigwv2.CorsHttpMethod.GET,
                apigwv2.CorsHttpMethod.HEAD,
                apigwv2.CorsHttpMethod.OPTIONS,
                apigwv2.CorsHttpMethod.POST,
            ],
            allowOrigins: ['*'],
            maxAge: Duration.days(10),
            allowHeaders: ['Authorization', 'Content-Type'],
        },
    });

    gratitudeApi.addRoutes({
        path: '/journal/entries',
        methods: [apigwv2.HttpMethod.POST],
        integration: new HttpLambdaIntegration("gratitude-save-entries", saveEntriesFn),
        authorizer,
    });

    gratitudeApi.addRoutes({
        path: '/journal/entries/share',
        methods: [apigwv2.HttpMethod.POST],
        integration: new HttpLambdaIntegration("gratitude-share-entries", shareTodaysEntriesFn),
        authorizer,
    });

    // POST a list of reaction ids and return the ones that the current user has liked
    gratitudeApi.addRoutes({
        path: '/journal/reactions',
        methods: [apigwv2.HttpMethod.POST],
        integration: new HttpLambdaIntegration("gratitude-get-reactions", getEntryReactionsFn),
        authorizer,
    });

    gratitudeApi.addRoutes({
        path: '/journal/reactions/react',
        methods: [apigwv2.HttpMethod.POST],
        integration: new HttpLambdaIntegration("gratitude-react-entries", reactToEntryFn),
        authorizer,
    });

    gratitudeApi.addRoutes({
        path: '/journal/reactions/influence',
        methods: [apigwv2.HttpMethod.GET],
        integration: new HttpLambdaIntegration("gratitude-social-influence", getInfluenceScoreFn),
        authorizer,
    });

    gratitudeApi.addRoutes({
        path: '/journal/today',
        methods: [apigwv2.HttpMethod.GET],
        integration: new HttpLambdaIntegration("gratitude-todays-entries", getTodaysEntriesFn),
        authorizer,
    });

    gratitudeApi.addRoutes({
        path: '/journal/social',
        methods: [apigwv2.HttpMethod.GET],
        integration: new HttpLambdaIntegration("gratitude-social-entries", getSocialEntriesFn),
    });

    gratitudeApi.addRoutes({
        path: '/journal/streak',
        methods: [apigwv2.HttpMethod.GET],
        integration: new HttpLambdaIntegration("gratitude-get-streak", getStreakFn),
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
