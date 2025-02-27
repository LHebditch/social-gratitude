import {
    Stack,
    RemovalPolicy,
    aws_lambda_nodejs as lambda,
    aws_logs as logs,
} from "aws-cdk-lib"

export const addLogGroup = (stack: Stack, name: string, lambda: lambda.NodejsFunction) => {
    new logs.LogGroup(stack, `${name}-loggroup`, {
        logGroupName: `/aws/lambda/${lambda.functionName}`,
        retention: logs.RetentionDays.THREE_MONTHS,
        removalPolicy: RemovalPolicy.DESTROY
    });
};