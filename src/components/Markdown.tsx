"use client";

import { marked } from "marked";
import { useMemo } from "react";

export default function Markdown({ text }: { text: string }) {
  const html = useMemo(() => {
    marked.setOptions({ gfm: true, breaks: false });
    return marked.parse(text || "*—*") as string;
  }, [text]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
