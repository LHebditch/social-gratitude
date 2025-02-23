export const APIResponse = (status: number, body?: string) => {
  return {
    statusCode: status,
    body,
  };
};
