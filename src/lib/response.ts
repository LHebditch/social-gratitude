export const APIResponse = (status: number, body?: any) => {
  return {
    statusCode: status,
    body,
  };
};
