import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

// Create a single client instance for reuse
const client = new DynamoDBClient({
    maxAttempts: 3, // Enable default retry behavior
});

export const dynamo = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true, // Optimize payload size
    },
});
