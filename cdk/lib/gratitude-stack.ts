import {
    Duration,
    NestedStack,
    Stack,
    aws_dynamodb as db,
    aws_lambda_nodejs as lambda,
} from "aws-cdk-lib";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { addLogGroup } from "./shared";


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

    const loginPageFn = new lambda.NodejsFunction(stack, 'app-login-page-function', {
        runtime: Runtime.NODEJS_22_X,
        handler: "index.handler",
        functionName: `app-login-page-${stack.node.addr}`,
        entry: '../src/handlers/app/login/index.ts',
        environment: {},
        timeout: Duration.millis(3000),
    });
    addLogGroup(stack, "app-login-page-function", loginPageFn);
}

export default {
    build,
}
