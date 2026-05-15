export type LoginInput = {
  email: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    avatar: string | null;
  };
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  role?: string;
};
