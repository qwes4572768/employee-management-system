/** Share one successful initialization, but allow a failed attempt to be retried. */
export function createRetryableInitializer<T>(initialize: () => Promise<T>): () => Promise<T> {
  let opening: Promise<T> | null = null;
  return () => {
    if (!opening) {
      opening = Promise.resolve().then(initialize).catch((error: unknown) => {
        opening = null;
        throw error;
      });
    }
    return opening;
  };
}
