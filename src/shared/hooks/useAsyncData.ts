import {useEffect, useState, type Dispatch, type SetStateAction} from 'react';

type AsyncState<T> = {
  data: T;
  error: string | null;
  isLoading: boolean;
  setData: Dispatch<SetStateAction<T>>;
};

export const useAsyncData = <T>(
  loader: () => Promise<T>,
  initialData: T,
): AsyncState<T> => {
  const [data, setData] = useState<T>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const result = await loader();
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [loader]);

  return {data, error, isLoading, setData};
};
