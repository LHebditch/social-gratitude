import { DynamoDBStreamHandler } from "aws-lambda";

export const handler: DynamoDBStreamHandler = async (ev) => {
    console.log(ev.Records[0].eventName)
    console.log(ev.Records[0].dynamodb.NewImage)
    console.log(ev.Records[0].dynamodb.OldImage)
}