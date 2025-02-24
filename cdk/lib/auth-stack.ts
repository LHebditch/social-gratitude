import {
    Duration,
    NestedStack,
    Stack,
    RemovalPolicy,
    aws_lambda_nodejs as lambda,
    aws_dynamodb as db,
    aws_logs as logs,
} from "aws-cdk-lib"
import { Runtime } from "aws-cdk-lib/aws-lambda";

export const BuildAuthStack = (scope: Stack) => {
    const stack = new NestedStack(scope, "auth-stack");

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

    const registerLambda = new lambda.NodejsFunction(stack, 'register-new-user-function', {
        runtime: Runtime.NODEJS_22_X,
        handler: "index.handler",
        functionName: `auth-register-${stack.node.addr}`,
        entry: '../src/handlers/auth/register/index.ts',
        environment: {
            AUTH_TABLE_NAME: table.tableName,
        },
        timeout: Duration.millis(3000),
    })

    addLogGRoup(stack, "auth-register-function", registerLambda)
    table.grantReadWriteData(registerLambda);
}

const addLogGRoup = (stack: Stack, name: string, lambda: lambda.NodejsFunction) => {
    new logs.LogGroup(stack, `${name}-loggroup`, {
        logGroupName: `/aws/lambda/${lambda.functionName}`,
        retention: logs.RetentionDays.THREE_MONTHS,
        removalPolicy: RemovalPolicy.DESTROY
    });
}