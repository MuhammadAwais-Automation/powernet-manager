export type QueryResult<T> = {
  data: T
  count?: number
}

export type QueryError = {
  message: string
}
