export type SignupPayload = {
  displayName: string;
  email: string;
};

export type User = SignupPayload & {
  _pk: string;
  _sk: string;
  id: string;
  createdDate: string;
  gsi1: string;
};

export type LoginPayload = {
  email: string
  token?: string
}

export type AuthToken = {
  _pk: string;
  _sk: string;
  token: string;
  attempts: number;
  _ttl: number;
  userId: string;
}

export type AuthorizerResponse = {
  userId: string
}
