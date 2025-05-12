import { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

export const APIResponse = (
  statusCode: number,
  body?: unknown,
  headers?: Record<string, string>
): APIGatewayProxyStructuredResultV2 => {
  return {
    statusCode,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    }
  };
};
