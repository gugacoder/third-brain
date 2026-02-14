import { useState, useEffect, useCallback } from "react";

type UseFetchOptions = {
  manual?: boolean;
};

export function useFetch<T>(url: string | (() => Promise<T>), opts?: UseFetchOptions) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!opts?.manual);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let result: T;
      if (typeof url === "function") {
        result = await url();
      } else {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        result = await res.json();
      }
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (!opts?.manual) {
      fetchData();
    }
  }, [fetchData, opts?.manual]);

  return { data, loading, error, refetch: fetchData };
}
