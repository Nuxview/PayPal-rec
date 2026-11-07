export type QueryClient = {
  query(sql: string, parameters?: string[]): Promise<{ rows: Record<string, unknown>[] }>;
};

export async function inTransaction<T>(client: QueryClient, begin: string, work: () => Promise<T>): Promise<T> {
  await client.query(begin);
  try {
    const result = await work();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
