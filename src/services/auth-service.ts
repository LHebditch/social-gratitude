import { DynamoGetError, DynamoPutError, MisconfiguredServiceError, NotFoundError } from "../lib/exceptions";
import { User } from "../lib/models/user";
import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, PutCommandInput } from '@aws-sdk/lib-dynamodb';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient());

export const getUser = async (email: string): Promise<User> => {

    if (!process.env.AUTH_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamodb environment variables");
    }

    try {
        const getCommand = new GetCommand({
            TableName: process.env.AUTH_TABLE_NAME,
            Key: {
                _pk: `user/${email}`,
                _sk: 'USER'
            }
        });
        const { Item } = await dynamo.send(getCommand);

        if (!Item) {
            throw new NotFoundError('no user found');
        }
        return Item as User
    } catch (e: unknown) {
        if (e instanceof Error) {
            throw new DynamoGetError(e.message)
        }
        throw e;
    }
}

export const saveUser = async (u: User, withCOndition = false): Promise<void> => {
    if (!process.env.AUTH_TABLE_NAME) {
        throw new MisconfiguredServiceError("Missing dynamo environment variables");
    }
    try {
        const cmdInput: PutCommandInput = {
            TableName: process.env.AUTH_TABLE_NAME,
            Item: u,
        }

        if (withCOndition) {
            cmdInput.ConditionExpression = "attribute_not_exists(#pk)"
            cmdInput.ExpressionAttributeNames = { "#pk": "_pk" }
        }

        const cmd = new PutCommand(cmdInput)

        await dynamo.send(cmd);
    } catch (e: unknown) {
        if (e instanceof ConditionalCheckFailedException) {
            throw e
        }
        if (e instanceof Error) {
            throw new DynamoPutError(e.message);
        }
        throw e;
    }
}