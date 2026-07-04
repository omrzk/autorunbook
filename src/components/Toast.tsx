"use client";

import { useEffect } from "react";

export default function Toast({
  message,
  error,
  onDone,
}: {
  message: string;
  error?: boolean;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className={`toast ${error ? "error" : ""}`}>{message}</div>;
}
