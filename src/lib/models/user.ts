export type SignupPayload = {
  displayName: string;
  email: string;
};

export type User = SignupPayload & {
  _pk: string;
  _sk: string;
  id: string;
  createdDate: string;
};
