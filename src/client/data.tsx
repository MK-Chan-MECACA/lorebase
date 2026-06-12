import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Category, type DocMeta } from "./api";

type DataState = {
  categories: Category[];
  docs: DocMeta[];
  reload: () => Promise<void>;
};

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [docs, setDocs] = useState<DocMeta[]>([]);

  const reload = useCallback(async () => {
    const [cats, ds] = await Promise.all([api<Category[]>("/api/categories"), api<DocMeta[]>("/api/documents")]);
    setCategories(cats);
    setDocs(ds);
  }, []);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  return <DataContext.Provider value={{ categories, docs, reload }}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData outside DataProvider");
  return ctx;
}
