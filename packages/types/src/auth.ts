export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  user: {
    id: string
    username: string
    email: string
  }
  accessToken: string
}

export interface RefreshResponse {
  accessToken: string
}

export interface JwtPayload {
  sub: string
  username: string
  iat?: number
  exp?: number
}

export interface SetupRequest {
  username: string
  email: string
  password: string
}

export interface SetupStatusResponse {
  isSetup: boolean
}
